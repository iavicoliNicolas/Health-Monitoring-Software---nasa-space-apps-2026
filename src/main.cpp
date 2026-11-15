#include <iostream>
#include <chrono>
#include <thread>
#include <atomic>
#include <csignal>
#include <random>
#include <algorithm>
#include <mutex>

#include "models/ridge_payload.hpp"
#include "models/alert_payload.hpp"
#include "engine/flight_surgeon.hpp"
#include "soma/circular_buffer.hpp"
#include "soma/soma_watchdog.hpp"
#include "network/websocket_server.hpp"

using namespace vitalgrid;

static std::atomic<bool> g_keep_running{true};

void signal_handler(int signum) {
    std::cout << "\n[VITALGRID] Termination signal (" << signum << ") received. Initiating graceful shutdown..." << std::endl;
    g_keep_running.store(false);
}

// Mismo reposo que RESET_NOMINAL. ppCO2 2.1 resta 5 puntos: el nivel queda en 95
// y no se cruza ningún umbral clínico.
void apply_nominal_baseline(RidgePayload& state) {
    state.health_score = 95;
    state.survival_status.vital_signs_present = true;
    state.survival_status.sos_panic_button_active = false;
    state.survival_status.cabin_pressure_nominal = true;

    state.telemetry_ridge.R_radiation.acute_event_mSv = 8.5;
    state.telemetry_ridge.R_radiation.career_accumulated_mSv = 145.2;

    state.telemetry_ridge.I_isolation.sleep_hours_last_24h = 7.2;
    state.telemetry_ridge.I_isolation.hrv_rmssd_drop_pct = 12.0;
    state.telemetry_ridge.I_isolation.pvt_reaction_time_ms = 240;
    state.telemetry_ridge.I_isolation.blink_rate_per_min = 18;
    state.telemetry_ridge.I_isolation.microsleep_events = 0;
    state.telemetry_ridge.I_isolation.perclos_pct = 0.0;
    state.telemetry_ridge.I_isolation.crew_mood = "OPTIMAL";

    state.telemetry_ridge.G_gravity.heart_rate_bpm = 72;
    state.telemetry_ridge.G_gravity.blood_pressure_sys = 120;
    state.telemetry_ridge.G_gravity.blood_pressure_dia = 78;
    state.telemetry_ridge.G_gravity.onsd_mm = 4.8;
    state.telemetry_ridge.G_gravity.exercise_completed_hours = 1.5;
    state.telemetry_ridge.G_gravity.blood_sugar_mg_dl = 92;

    state.telemetry_ridge.E_environment.cabin_ppco2_mmHg = 2.1;
    state.telemetry_ridge.E_environment.spo2_pct = 98;
    state.telemetry_ridge.E_environment.body_temperature_c = 36.8;
    state.telemetry_ridge.E_environment.respiratory_rate_bpm = 14;
}

int main(int argc, char* argv[]) {
    int port = 9002;
    if (argc > 1) {
        try {
            port = std::stoi(argv[1]);
        } catch (...) {
            std::cerr << "Invalid port argument. Using default: 9002\n";
        }
    }

    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);

    std::cout << "================================================================================" << std::endl;
    std::cout << "  NASA SPACE APPS CHALLENGE - DEEP SPACE ASTRONAUT HEALTH MONITORING" << std::endl;
    std::cout << "  VITALGRID FLIGHT SURGEON AI & SOMA ARCHIVAL DAEMON [v1.0-AEROSPACE-RELEASE]" << std::endl;
    std::cout << "  Target Architecture: Deep Space Transit (Earth-Mars Cycler / Gateway / Artemis)" << std::endl;
    std::cout << "================================================================================\n" << std::endl;

    // 1. Initialize High-Rate Telemetry Ring Buffer
    CircularTelemetryBuffer telemetry_buffer(2048);

    // 2. Initialize Flight Surgeon AI
    FlightSurgeonAI flight_surgeon;

    // 3. Initialize SOMA Watchdog Thread
    SomaWatchdog soma_watchdog(telemetry_buffer);

    // 4. Initialize WebSocket Server
    WebSocketServer ws_server(port);

    // 5. Initialize Baseline RIDGE Telemetry State & Synchronization Mutex BEFORE starting threads
    std::mutex state_mutex;
    RidgePayload state;
    state.timestamp = RidgePayload::current_iso8601();
    state.crew_member_id = "CMD-01";
    apply_nominal_baseline(state);

    // Wire SOMA broadcast to WebSocket BEFORE starting watchdog/server threads
    soma_watchdog.set_broadcast_callback([&ws_server](const std::string& soma_json) {
        ws_server.broadcast(soma_json);
    });

    // Remote Command Handling & Peripheral Sensor Ingestion (registered BEFORE ws_server.start())
    ws_server.set_message_callback([&](socket_t /*client*/, const std::string& msg) {
        std::lock_guard<std::mutex> lock(state_mutex);
        std::cout << "[REMOTE INGESTION COMMAND] Received: " << msg << std::endl;

        // Peripheral JSON Sensor Telemetry Ingestion (e.g. MediaPipe Camera Eye Tracker or sensor test)
        if (msg.find("metric") != std::string::npos) {
            auto extract_json_val = [](const std::string& str, const std::string& key) -> std::string {
                std::string pattern = "\"" + key + "\"";
                size_t pos = str.find(pattern);
                if (pos == std::string::npos) return "";
                pos = str.find(':', pos + pattern.size());
                if (pos == std::string::npos) return "";
                pos++;
                while (pos < str.size() && (str[pos] == ' ' || str[pos] == '\"')) pos++;
                size_t end = pos;
                while (end < str.size() && str[end] != ',' && str[end] != '}' && str[end] != '\"' &&
                       str[end] != ' ' && str[end] != '\r' && str[end] != '\n') {
                    end++;
                }
                return str.substr(pos, end - pos);
            };

            std::string metric = extract_json_val(msg, "metric");
            std::string val_str = extract_json_val(msg, "value");

            if (!metric.empty() && !val_str.empty()) {
                try {
                    if (metric == "blink_rate") {
                        state.telemetry_ridge.I_isolation.blink_rate_per_min = std::stoi(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Isolation.blink_rate_per_min updated to "
                                  << state.telemetry_ridge.I_isolation.blink_rate_per_min << " parp/min" << std::endl;
                    } else if (metric == "microsleep") {
                        state.telemetry_ridge.I_isolation.microsleep_events = std::stoi(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Isolation.microsleep_events updated to "
                                  << state.telemetry_ridge.I_isolation.microsleep_events << std::endl;
                    } else if (metric == "perclos") {
                        state.telemetry_ridge.I_isolation.perclos_pct = std::stod(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Isolation.perclos_pct updated to "
                                  << state.telemetry_ridge.I_isolation.perclos_pct << "%" << std::endl;
                    } else if (metric == "heart_rate_bpm") {
                        state.telemetry_ridge.G_gravity.heart_rate_bpm = std::stoi(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Gravity.heart_rate_bpm updated to "
                                  << state.telemetry_ridge.G_gravity.heart_rate_bpm << " bpm" << std::endl;
                    } else if (metric == "body_temperature_c") {
                        state.telemetry_ridge.E_environment.body_temperature_c = std::stod(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Environment.body_temperature_c updated to "
                                  << state.telemetry_ridge.E_environment.body_temperature_c << " C" << std::endl;
                    } else if (metric == "spo2_pct") {
                        state.telemetry_ridge.E_environment.spo2_pct = std::stoi(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Environment.spo2_pct updated to "
                                  << state.telemetry_ridge.E_environment.spo2_pct << "%" << std::endl;
                    } else if (metric == "cabin_ppco2_mmHg") {
                        state.telemetry_ridge.E_environment.cabin_ppco2_mmHg = std::stod(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Environment.cabin_ppco2_mmHg updated to "
                                  << state.telemetry_ridge.E_environment.cabin_ppco2_mmHg << " mmHg" << std::endl;
                    } else if (metric == "acute_event_mSv") {
                        state.telemetry_ridge.R_radiation.acute_event_mSv = std::stod(val_str);
                        std::cout << "[PERIPHERAL INGESTION] Radiation.acute_event_mSv updated to "
                                  << state.telemetry_ridge.R_radiation.acute_event_mSv << " mSv" << std::endl;
                    } else if (metric == "blood_sugar_mg_dl") {
                        state.telemetry_ridge.G_gravity.blood_sugar_mg_dl = std::stoi(val_str);
                        std::cout << "[MANUAL LAB INGESTION] Gravity.blood_sugar_mg_dl updated to "
                                  << state.telemetry_ridge.G_gravity.blood_sugar_mg_dl << " mg/dL" << std::endl;
                    } else if (metric == "onsd_mm") {
                        state.telemetry_ridge.G_gravity.onsd_mm = std::stod(val_str);
                        std::cout << "[MANUAL LAB INGESTION] Gravity.onsd_mm updated to "
                                  << state.telemetry_ridge.G_gravity.onsd_mm << " mm" << std::endl;
                    } else if (metric == "crew_mood") {
                        if (val_str == "OPTIMAL" || val_str == "FATIGUED" ||
                            val_str == "STRESSED" || val_str == "LOW_MOOD") {
                            state.telemetry_ridge.I_isolation.crew_mood = val_str;
                            std::cout << "[CREW SELF-REPORT] Isolation.crew_mood updated to "
                                      << state.telemetry_ridge.I_isolation.crew_mood << std::endl;
                        }
                    } else if (metric == "comm_delay_oneway_min") {
                        state.telemetry_ridge.D_distance.comm_delay_oneway_min = std::max(0.0, std::stod(val_str));
                    } else if (metric == "exercise_completed_hours") {
                        state.telemetry_ridge.G_gravity.exercise_completed_hours = std::clamp(std::stod(val_str), 0.0, 6.0);
                    } else if (metric == "sleep_hours_last_24h") {
                        state.telemetry_ridge.I_isolation.sleep_hours_last_24h = std::clamp(std::stod(val_str), 0.0, 24.0);
                    } else if (metric == "vital_signs_present") {
                        state.survival_status.vital_signs_present = (val_str == "true" || val_str == "1");
                    }
                } catch (const std::exception& e) {
                    std::cerr << "[PERIPHERAL INGESTION ERROR] Failed to parse value: " << e.what() << std::endl;
                }
            }
            return;
        }

        if (msg == "TRIGGER_SOS") {
            state.survival_status.sos_panic_button_active = true;
        } else if (msg == "DEPRESSURIZE") {
            state.survival_status.cabin_pressure_nominal = false;
        } else if (msg == "ASYSTOLE") {
            state.survival_status.vital_signs_present = false;
            state.telemetry_ridge.G_gravity.heart_rate_bpm = 0;
            state.telemetry_ridge.G_gravity.blood_pressure_sys = 0;
            state.telemetry_ridge.G_gravity.blood_pressure_dia = 0;
            state.telemetry_ridge.E_environment.spo2_pct = 0;
        } else if (msg == "RESET_SURVIVAL") {
            state.survival_status.vital_signs_present = true;
            state.survival_status.sos_panic_button_active = false;
            state.survival_status.cabin_pressure_nominal = true;
            soma_watchdog.reset_soma();
        } else if (msg == "INJECT_HYPOXIA") {
            state.telemetry_ridge.E_environment.spo2_pct = 91;
        } else if (msg == "INJECT_HYPERCAPNIA") {
            state.telemetry_ridge.E_environment.cabin_ppco2_mmHg = 4.1;
        } else if (msg == "INJECT_SANS") {
            state.telemetry_ridge.G_gravity.onsd_mm = 6.2;
        } else if (msg == "INJECT_SPE_RADIATION") {
            state.telemetry_ridge.R_radiation.acute_event_mSv = 285.0;
        } else if (msg == "INJECT_FEVER") {
            state.telemetry_ridge.E_environment.body_temperature_c = 39.2;
        } else if (msg == "INJECT_TACHYCARDIA") {
            state.telemetry_ridge.G_gravity.heart_rate_bpm = 122;
        } else if (msg == "INJECT_HYPERGLYCEMIA") {
            state.telemetry_ridge.G_gravity.blood_sugar_mg_dl = 168;
        } else if (msg == "INJECT_HYPOGLYCEMIA") {
            state.telemetry_ridge.G_gravity.blood_sugar_mg_dl = 54;
        } else if (msg == "INJECT_SENSOR_FAULT") {
            state.survival_status.vital_signs_present = true;
            state.telemetry_ridge.G_gravity.heart_rate_bpm = 0;
            state.telemetry_ridge.E_environment.spo2_pct = 99;
            state.telemetry_ridge.E_environment.body_temperature_c = 14.5;
        } else if (msg == "INJECT_FATIGUE") {
            state.telemetry_ridge.I_isolation.sleep_hours_last_24h = 4.2;
            state.telemetry_ridge.I_isolation.hrv_rmssd_drop_pct = 31.0;
            state.telemetry_ridge.I_isolation.blink_rate_per_min = 5;
            state.telemetry_ridge.I_isolation.microsleep_events = 2;
            state.telemetry_ridge.I_isolation.perclos_pct = 28.5;
        } else if (msg == "RESET_NOMINAL") {
            apply_nominal_baseline(state);
            soma_watchdog.reset_soma();
        }
    });

    if (!ws_server.start()) {
        std::cerr << "[CRITICAL ERROR] Failed to start WebSocket daemon on port " << port << std::endl;
        return 1;
    }

    soma_watchdog.start();

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> noise_dist(-0.2, 0.2);
    std::uniform_int_distribution<> hr_noise(-1, 1);

    std::cout << "[DAEMON RUNNING] Telemetry ingestion loop nominal @ 1 Hz (1000ms ticks)." << std::endl;
    std::cout << "[INFO] WebSocket stream active at ws://127.0.0.1:" << port << std::endl;
    std::cout << "[INFO] Cockpit Z.E.U.S: servi la carpeta web/ por HTTP y abri index.html." << std::endl;
    std::cout << "[INFO] file:// bloquea el fetch de data/metricas.json.\n" << std::endl;

    uint64_t tick_counter = 0;

    while (g_keep_running.load()) {
        auto tick_start = std::chrono::steady_clock::now();

        RidgePayload commanded;
        RidgePayload display;
        {
            std::lock_guard<std::mutex> lock(state_mutex);

            // El ruido no vuelve a state: si se acumula, el pulso y el ppCO2
            // cruzan un umbral solos. El jitter vive solo en la muestra que se muestra.
            state.timestamp = RidgePayload::current_iso8601();
            state.health_score = flight_surgeon.compute_health_score(state);
            commanded = state;

            display = state;
            const bool sensors_plausible =
                state.survival_status.vital_signs_present &&
                state.telemetry_ridge.G_gravity.heart_rate_bpm >= 40 &&
                state.telemetry_ridge.E_environment.body_temperature_c >= 20.0;

            if (sensors_plausible) {
                auto& g = display.telemetry_ridge.G_gravity;
                auto& e = display.telemetry_ridge.E_environment;
                g.heart_rate_bpm = std::clamp(g.heart_rate_bpm + hr_noise(gen), 40, 180);
                e.cabin_ppco2_mmHg = std::max(0.1, e.cabin_ppco2_mmHg + noise_dist(gen) * 0.05);
                e.body_temperature_c = std::clamp(e.body_temperature_c + noise_dist(gen) * 0.02, 34.0, 42.0);
            }
            display.health_score = commanded.health_score;
        }

        // 1. Push to circular buffer (valor comandado, sin ruido)
        telemetry_buffer.push(commanded);

        // 2. Evaluate SOMA watchdog conditions
        soma_watchdog.evaluate_survival_state(commanded);

        // 3. Evaluate clinical decision thresholds (Flight Surgeon AI)
        std::vector<ClinicalAlert> alerts = flight_surgeon.evaluate(commanded);

        // 4. Broadcast RIDGE payload JSON over WebSocket.
        //    Los signos llevan jitter; el health_score es el del valor comandado
        //    para que el aro no parpadee por un ±1 lpm.
        std::string ridge_json = display.to_json();
        ws_server.broadcast(ridge_json);

        // 5. Broadcast Clinical Alert sub-JSONs if thresholds breached
        for (const auto& alert : alerts) {
            std::string alert_json = alert.to_json();
            ws_server.broadcast(alert_json);
        }

        // Periodic console log every 5 seconds
        if (++tick_counter % 5 == 0) {
            std::cout << "[TELEMETRY TICK #" << tick_counter << "] Crew: " << display.crew_member_id
                      << " | Score: " << display.health_score << "%"
                      << " | HR: " << display.telemetry_ridge.G_gravity.heart_rate_bpm << " bpm"
                      << " | SpO2: " << display.telemetry_ridge.E_environment.spo2_pct << "%"
                      << " | ppCO2: " << display.telemetry_ridge.E_environment.cabin_ppco2_mmHg << " mmHg"
                      << " | SOMA Active: " << (soma_watchdog.is_soma_triggered() ? "YES [DSOC LOCK]" : "NO [NOMINAL]")
                      << " | Alerts Active: " << alerts.size()
                      << " | WS Clients: " << ws_server.connected_clients_count()
                      << std::endl;
        }

        auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - tick_start);
        if (elapsed < std::chrono::milliseconds(1000)) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1000) - elapsed);
        }
    }

    std::cout << "[VITALGRID] Stopping SOMA Watchdog..." << std::endl;
    soma_watchdog.stop();

    std::cout << "[VITALGRID] Stopping WebSocket server..." << std::endl;
    ws_server.stop();

    std::cout << "[VITALGRID] Shutdown clean. All subsystems nominal." << std::endl;
    return 0;
}
