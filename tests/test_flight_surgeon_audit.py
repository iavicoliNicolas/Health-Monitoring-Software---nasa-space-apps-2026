import base64
import json
import re
import socket
import struct
import subprocess
import threading
import time


def ws_connect(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5.0)
    s.connect(("127.0.0.1", port))
    key = base64.b64encode(b"audit_test_key12").decode("ascii")
    req = (
        "GET / HTTP/1.1\r\n"
        f"Host: 127.0.0.1:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    s.sendall(req.encode("utf-8"))
    resp = s.recv(1024).decode("utf-8")
    assert "101 Switching Protocols" in resp, f"Handshake failed: {resp}"
    return s


def ws_send_text(sock, text):
    payload = text.encode("utf-8")
    mask_key = b"\x13\x37\xca\xfe"
    masked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))
    length = len(payload)
    if length <= 125:
        header = bytes([0x81, 0x80 | length])
    elif length <= 65535:
        header = bytes([0x81, 0x80 | 126]) + struct.pack("!H", length)
    else:
        header = bytes([0x81, 0x80 | 127]) + struct.pack("!Q", length)
    sock.sendall(header + mask_key + masked)


def recv_exact(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError("Socket closed")
        buf.extend(chunk)
    return bytes(buf)


def ws_read_json(sock):
    header = recv_exact(sock, 2)
    length = header[1] & 0x7F
    if length == 126:
        length = struct.unpack("!H", recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recv_exact(sock, 8))[0]
    payload = recv_exact(sock, length)
    return json.loads(payload.decode("utf-8"))


def drain_pending(sock):
    sock.settimeout(0.05)
    try:
        while True:
            ws_read_json(sock)
    except (socket.timeout, EOFError):
        pass
    finally:
        sock.settimeout(5.0)


def collect_next_tick_bundle(sock, predicate=None, timeout_s=5.0):
    """Waits for the next fresh RIDGE tick (optionally matching predicate) and all CLINICAL_ALERTs emitted right after it."""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        ridge = None
        while time.time() < deadline:
            msg = ws_read_json(sock)
            if "telemetry_ridge" in msg:
                if predicate is None or predicate(msg):
                    ridge = msg
                    break
        if ridge is None:
            break

        alerts = []
        sock.settimeout(0.35)
        try:
            while True:
                msg = ws_read_json(sock)
                if msg.get("type") == "CLINICAL_ALERT":
                    alerts.append(msg)
                elif "telemetry_ridge" in msg:
                    break
        except socket.timeout:
            pass
        finally:
            sock.settimeout(5.0)
        return ridge, alerts

    raise AssertionError("Timed out waiting for matching RIDGE telemetry tick")


def assert_clean_decimals(alerts):
    six_decimal_re = re.compile(r"\.\d{6}\b")
    for alert in alerts:
        for field in ("trigger_value", "threshold_limit"):
            val = alert.get(field, "")
            assert not six_decimal_re.search(val), f"Raw 6-decimal formatting detected in {field}: {val!r}"
        explanation = alert.get("astronaut_explanation", "")
        assert isinstance(explanation, str) and len(explanation.strip()) > 15, (
            f"Expected didactic astronaut_explanation on alert, got: {alert}"
        )


def run_audit_tests():
    port = 9006
    proc = subprocess.Popen(
        ["./vitalgrid_daemon.exe", str(port)],
        cwd="f:/VitalGrid",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    time.sleep(1.2)

    try:
        sock = ws_connect(port)
        ws_send_text(sock, "RESET_NOMINAL")
        time.sleep(0.15)
        drain_pending(sock)
        ridge, alerts = collect_next_tick_bundle(
            sock,
            predicate=lambda r: r["telemetry_ridge"]["E_environment"]["spo2_pct"] == 98,
        )
        assert not ridge["timestamp"].startswith("2026-10-02"), f"Stale hardcoded timestamp: {ridge['timestamp']}"
        assert not alerts, f"Expected zero alerts on nominal baseline, got: {alerts}"
        assert ridge["telemetry_ridge"]["G_gravity"]["blood_sugar_mg_dl"] == 92, ridge["telemetry_ridge"]["G_gravity"]
        assert ridge["telemetry_ridge"]["I_isolation"]["crew_mood"] == "OPTIMAL", ridge["telemetry_ridge"]["I_isolation"]
        print(f"[PASS] Nominal baseline, Phase 2 RIDGE fields & dynamic UTC timestamp: {ridge['timestamp']}")

        # Case A: Radiation (>250 mSv) + Environment (ppCO2 > 3.0 mmHg) conflict
        ws_send_text(sock, "INJECT_SPE_RADIATION")
        ws_send_text(sock, "INJECT_HYPERCAPNIA")
        _, alerts_a = collect_next_tick_bundle(
            sock,
            predicate=lambda r: (
                r["telemetry_ridge"]["R_radiation"]["acute_event_mSv"] > 250.0
                and r["telemetry_ridge"]["E_environment"]["cabin_ppco2_mmHg"] > 3.0
            ),
        )
        assert_clean_decimals(alerts_a)
        rad_alerts = [a for a in alerts_a if a["trigger_metric"] == "acute_event_mSv"]
        assert rad_alerts, f"Expected acute_event_mSv alert, got: {alerts_a}"
        rad_a = rad_alerts[0]
        assert "CONFLICTO" in rad_a["diagnosis"], f"Expected Case A conflict diagnosis: {rad_a}"
        assert "CDRA" in rad_a["tactical_action"] and "LiOH" in rad_a["tactical_action"], (
            f"Expected CDRA + LiOH shelter purge directive: {rad_a}"
        )
        assert "OSD-" in rad_a.get("osdr_reference", ""), f"Expected OSDR reference: {rad_a}"
        print(f"[PASS] Case A (R+E Conflict Resolution): {rad_a['diagnosis']} | OSDR={rad_a['osdr_reference']}")

        # Case B: Gravity (HR > 110) + Environment (ppCO2 > 3.0 or SpO2 < 95) correlation
        ws_send_text(sock, "RESET_NOMINAL")
        ws_send_text(sock, "INJECT_TACHYCARDIA")
        ws_send_text(sock, "INJECT_HYPOXIA")
        _, alerts_b = collect_next_tick_bundle(
            sock,
            predicate=lambda r: (
                r["telemetry_ridge"]["G_gravity"]["heart_rate_bpm"] > 110
                and r["telemetry_ridge"]["E_environment"]["spo2_pct"] < 95
            ),
        )
        assert_clean_decimals(alerts_b)
        hr_alerts = [a for a in alerts_b if a["trigger_metric"] == "heart_rate_bpm"]
        assert hr_alerts, f"Expected heart_rate_bpm alert, got: {alerts_b}"
        hr_b = hr_alerts[0]
        assert "Taquicardia Sinusal Refleja Secundaria a Hipoxia/Hipercapnia Ambiental" in hr_b["diagnosis"], hr_b
        assert "PROHIBIDO administrar betabloqueantes (Metoprolol)" in hr_b["tactical_action"], hr_b
        assert "OSD-" in hr_b.get("osdr_reference", ""), hr_b
        print(f"[PASS] Case B (G+E Correlation, Metoprolol Contradiction Blocked): {hr_b['diagnosis']} | OSDR={hr_b['osdr_reference']}")

        # Case C1: Anti-hallucination guardrail (HR == 0 while vital_signs_present == true & SpO2 >= 98)
        ws_send_text(sock, "RESET_NOMINAL")
        ws_send_text(sock, json.dumps({"metric": "heart_rate_bpm", "value": 0}))
        ws_send_text(sock, json.dumps({"metric": "spo2_pct", "value": 99}))
        _, alerts_c1 = collect_next_tick_bundle(
            sock,
            predicate=lambda r: (
                r["telemetry_ridge"]["G_gravity"]["heart_rate_bpm"] == 0
                and r["telemetry_ridge"]["E_environment"]["spo2_pct"] >= 98
            ),
        )
        assert_clean_decimals(alerts_c1)
        assert len(alerts_c1) == 1 and alerts_c1[0]["trigger_metric"] == "SENSOR_ARTIFACT_REJECTED", (
            f"Expected ONLY SENSOR_ARTIFACT_REJECTED for Case C1, got: {alerts_c1}"
        )
        print(f"[PASS] Case C1 (Sensor Artifact HR=0 + SpO2=99%): {alerts_c1[0]['trigger_value']}")

        # Multi-metric formatting check (radiation + SANS + fever)
        ws_send_text(sock, "RESET_NOMINAL")
        ws_send_text(sock, "INJECT_SPE_RADIATION")
        ws_send_text(sock, "INJECT_SANS")
        ws_send_text(sock, "INJECT_FEVER")
        _, alerts_fmt = collect_next_tick_bundle(
            sock,
            predicate=lambda r: (
                r["telemetry_ridge"]["R_radiation"]["acute_event_mSv"] > 250.0
                and r["telemetry_ridge"]["G_gravity"]["onsd_mm"] > 5.8
                and r["telemetry_ridge"]["E_environment"]["body_temperature_c"] > 38.5
            ),
        )
        assert len(alerts_fmt) >= 3, f"Expected >= 3 alerts, got: {alerts_fmt}"
        assert_clean_decimals(alerts_fmt)
        print(f"[PASS] Clean decimal formatting verified across {len(alerts_fmt)} concurrent clinical alerts")

        # Case C2: Anti-hallucination guardrail (body_temperature_c < 20.0)
        ws_send_text(sock, json.dumps({"metric": "body_temperature_c", "value": 12.4}))
        _, alerts_c2 = collect_next_tick_bundle(
            sock,
            predicate=lambda r: r["telemetry_ridge"]["E_environment"]["body_temperature_c"] < 20.0,
        )
        assert len(alerts_c2) == 1 and alerts_c2[0]["trigger_metric"] == "SENSOR_ARTIFACT_REJECTED", (
            f"Expected ONLY SENSOR_ARTIFACT_REJECTED for Case C2, got: {alerts_c2}"
        )
        print(f"[PASS] Case C2 (Sensor Artifact Temp=12.4C halts other diagnoses): {alerts_c2[0]['diagnosis']}")

        # Phase 2A: Glucose Monitoring (Hyperglycemia WARNING > 140 mg/dL)
        ws_send_text(sock, "RESET_NOMINAL")
        ws_send_text(sock, json.dumps({"metric": "blood_sugar_mg_dl", "value": 168}))
        _, alerts_hyper = collect_next_tick_bundle(
            sock,
            predicate=lambda r: r["telemetry_ridge"]["G_gravity"]["blood_sugar_mg_dl"] > 140,
        )
        assert_clean_decimals(alerts_hyper)
        hyper_alerts = [a for a in alerts_hyper if a["trigger_metric"] == "blood_sugar_mg_dl"]
        assert hyper_alerts and hyper_alerts[0]["status"] == "WARNING", f"Expected glucose WARNING, got: {alerts_hyper}"
        assert "OSD-" in hyper_alerts[0].get("osdr_reference", ""), hyper_alerts[0]
        print(f"[PASS] Phase 2 Hyperglycemia (>140 mg/dL): {hyper_alerts[0]['diagnosis']}")

        # Phase 2B: Glucose Monitoring (Hypoglycemia CRITICAL < 65 mg/dL)
        ws_send_text(sock, "INJECT_HYPOGLYCEMIA")
        _, alerts_hypo = collect_next_tick_bundle(
            sock,
            predicate=lambda r: r["telemetry_ridge"]["G_gravity"]["blood_sugar_mg_dl"] < 65,
        )
        assert_clean_decimals(alerts_hypo)
        hypo_alerts = [a for a in alerts_hypo if a["trigger_metric"] == "blood_sugar_mg_dl"]
        assert hypo_alerts and hypo_alerts[0]["status"] == "CRITICAL", f"Expected glucose CRITICAL, got: {alerts_hypo}"
        print(f"[PASS] Phase 2 Hypoglycemia (<65 mg/dL): {hypo_alerts[0]['diagnosis']}")

        # Phase 2C: Crew Self-Report Discrepancy (crew_mood == OPTIMAL while ocular fatigue is detected)
        ws_send_text(sock, "RESET_NOMINAL")
        ws_send_text(sock, json.dumps({"metric": "crew_mood", "value": "OPTIMAL"}))
        ws_send_text(sock, json.dumps({"metric": "blink_rate", "value": 5}))
        _, alerts_mood_disc = collect_next_tick_bundle(
            sock,
            predicate=lambda r: (
                r["telemetry_ridge"]["I_isolation"]["crew_mood"] == "OPTIMAL"
                and r["telemetry_ridge"]["I_isolation"]["blink_rate_per_min"] < 8
            ),
        )
        assert_clean_decimals(alerts_mood_disc)
        disc_alerts = [a for a in alerts_mood_disc if a["trigger_metric"] == "crew_mood_discrepancy"]
        assert disc_alerts and disc_alerts[0]["status"] == "WARNING", (
            f"Expected crew_mood_discrepancy WARNING, got: {alerts_mood_disc}"
        )
        assert "DISCREPANCIA BIOMÉTRICA DE AUTOCONCIENCIA" in disc_alerts[0]["diagnosis"], disc_alerts[0]
        print(f"[PASS] Phase 2 Self-Report Discrepancy: {disc_alerts[0]['diagnosis']}")

        # Aligning manual mood to FATIGUED resolves self-report discrepancy alert
        ws_send_text(sock, json.dumps({"metric": "crew_mood", "value": "FATIGUED"}))
        _, alerts_mood_aligned = collect_next_tick_bundle(
            sock,
            predicate=lambda r: r["telemetry_ridge"]["I_isolation"]["crew_mood"] == "FATIGUED",
        )
        assert not any(a["trigger_metric"] == "crew_mood_discrepancy" for a in alerts_mood_aligned), (
            f"Discrepancy should clear once crew_mood matches fatigue: {alerts_mood_aligned}"
        )
        print("[PASS] Phase 2 Self-Report Discrepancy clears when crew reports FATIGUED")

        # Concurrency stress test: 3 concurrent WebSocket writers sending peripheral updates
        ws_send_text(sock, "RESET_NOMINAL")
        errors = []

        def worker(idx):
            try:
                ws_w = ws_connect(port)
                for step in range(15):
                    ws_send_text(ws_w, json.dumps({"metric": "blink_rate", "value": 10 + ((idx + step) % 10)}))
                    ws_send_text(ws_w, json.dumps({"metric": "perclos", "value": 5.5 + idx}))
                    time.sleep(0.03)
                ws_w.close()
            except Exception as exc:
                errors.append(str(exc))

        threads = [threading.Thread(target=worker, args=(idx,)) for idx in range(3)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)
        assert not errors, f"Concurrency errors detected: {errors}"
        print("[PASS] Multi-client concurrent WebSocket ingestion verified without race crashes")

        sock.close()
        print("\n>>> ALL FLIGHT SURGEON AUDIT TESTS PASSED SUCCESSFULLY! <<<")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()


if __name__ == "__main__":
    run_audit_tests()
