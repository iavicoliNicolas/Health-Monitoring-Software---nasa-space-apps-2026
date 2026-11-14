/**
 * VitalGrid - Controlador de Telemetría y Cockpit Aeroespacial Crew Dragon
 * NASA Space Apps Challenge - Monitoreo de Salud de Astronautas en Espacio Profundo
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Variables de Estado ---
    let ws = null;
    let wsUrl = 'ws://127.0.0.1:9002';
    let reconnectTimer = null;
    let activeAlerts = new Map();
    let currentPayload = null;
    let somaTriggered = false;

    // --- Elementos del DOM ---
    const connectionPill = document.getElementById('connectionPill');
    const connectionLabel = document.getElementById('connectionLabel');
    const somaPill = document.getElementById('somaPill');
    const somaLabel = document.getElementById('somaLabel');
    const muteBtn = document.getElementById('muteBtn');
    const somaStrip = document.getElementById('somaStrip');
    const somaDetailsCard = document.getElementById('somaDetailsCard');
    const metClock = document.getElementById('metClock');
    const utcClock = document.getElementById('utcClock');
    const rawJsonViewer = document.getElementById('rawJsonViewer');
    const directivesList = document.getElementById('directivesList');
    const osdrCacheBadge = document.getElementById('osdrCacheBadge');
    const osdrSyncedAt = document.getElementById('osdrSyncedAt');
    const osdrStudiesList = document.getElementById('osdrStudiesList');
    const habitatEnvSelector = document.getElementById('habitatEnvSelector');
    const missionEnvTag = document.getElementById('missionEnvTag');
    const inputBloodSugar = document.getElementById('inputBloodSugar');
    const btnSendBloodSugar = document.getElementById('btnSendBloodSugar');
    const inputOnsd = document.getElementById('inputOnsd');
    const btnSendOnsd = document.getElementById('btnSendOnsd');
    const routineStreakBadge = document.getElementById('routineStreakBadge');
    const routineStatusText = document.getElementById('routineStatusText');
    const routinePctLabel = document.getElementById('routinePctLabel');
    const routineProgressBar = document.getElementById('routineProgressBar');
    const routineAredItem = document.getElementById('routineAredItem');
    const routineAredText = document.getElementById('routineAredText');
    const routineGlucoseItem = document.getElementById('routineGlucoseItem');
    const routineGlucoseText = document.getElementById('routineGlucoseText');
    const routineOcularItem = document.getElementById('routineOcularItem');
    const routineOcularText = document.getElementById('routineOcularText');
    const zoneTitle = document.getElementById('zoneTitle');
    const zoneStatusBadge = document.getElementById('zoneStatusBadge');
    const zoneFunction = document.getElementById('zoneFunction');
    const zoneMetricsList = document.getElementById('zoneMetricsList');
    const zoneReason = document.getElementById('zoneReason');

    let lastRidgeData = null;
    let selectedBodyZone = 'head';
    const routineState = {
        glucoseChecked: false,
        ocularChecked: false,
        streakDays: 14
    };

    const HABITAT_PROFILES = {
        transit: {
            label: 'TRÁNSITO DE ESPACIO PROFUNDO :: ARTEMIS V / MARS CYCLER',
            delayMin: 12.4
        },
        gateway: {
            label: 'ESTACIÓN ORBITAL / LUNAR GATEWAY :: SOPORTE CISO-LUNAR',
            delayMin: 0.02
        },
        rover: {
            label: 'ROVER PRESURIZADO EVA :: EXPLORACIÓN DE SUPERFICIE',
            delayMin: 4.2
        },
        base: {
            label: 'BASE PLANETARIA MARTE/LUNA :: HÁBITAT AUTÓNOMO',
            delayMin: 18.0
        }
    };

    const BODY_ZONES_META = {
        head: {
            title: 'CABEZA / NEURO-OCULAR (SANS & MEDIAPIPE)',
            alertMetrics: ['onsd_mm', 'sleep_hours_last_24h', 'hrv_rmssd_drop_pct', 'blink_rate_per_min', 'microsleep_events', 'crew_mood_discrepancy'],
            spaceFunction: 'Regula la presión intracraneal, la perfusión retiniana, el ciclo circadiano de sueño y el rendimiento cognitivo-motor bajo aislamiento prolongado.',
            examReason: 'En microgravedad los fluidos migran hacia la cabeza aumentando el diámetro de la vaina del nervio óptico (SANS / ONSD > 5.8 mm). El ultrasonido y la biometría ocular MediaPipe detectan edema cerebral y fatiga oculta antes de comprometer la visión o la toma de decisiones.',
            evaluateStatus(ridge) {
                if (!ridge) return 'NOMINAL';
                const i = ridge.I_isolation;
                const g = ridge.G_gravity;
                if (g.onsd_mm > 5.8 || (i.microsleep_events ?? 0) >= 1) return 'CRITICAL';
                if (i.sleep_hours_last_24h < 6.0 || i.hrv_rmssd_drop_pct > 25.0 || (i.blink_rate_per_min ?? 18) < 8 || i.pvt_reaction_time_ms > 350) {
                    return 'WARNING';
                }
                return 'NOMINAL';
            },
            buildMetrics(ridge) {
                if (!ridge) return [];
                const i = ridge.I_isolation;
                const g = ridge.G_gravity;
                return [
                    { label: 'ONSD (Nervio Óptico)', value: `${g.onsd_mm.toFixed(2)} mm`, level: g.onsd_mm > 5.8 ? 'crit' : '' },
                    { label: 'Sueño 24h / Ánimo', value: `${i.sleep_hours_last_24h.toFixed(1)}h · ${i.crew_mood || 'OPTIMAL'}`, level: i.sleep_hours_last_24h < 6.0 ? 'warn' : '' },
                    { label: 'PVT / Caída HRV', value: `${i.pvt_reaction_time_ms} ms · ${i.hrv_rmssd_drop_pct.toFixed(1)}%`, level: (i.pvt_reaction_time_ms > 350 || i.hrv_rmssd_drop_pct > 25.0) ? 'warn' : '' },
                    { label: 'Ocular (MediaPipe)', value: `${i.blink_rate_per_min ?? 18}/m · MS ${i.microsleep_events ?? 0}`, level: (i.microsleep_events ?? 0) >= 1 ? 'crit' : ((i.blink_rate_per_min ?? 18) < 8 ? 'warn' : '') }
                ];
            }
        },
        thorax: {
            title: 'TÓRAX / CARDIORRESPIRATORIO (ECLSS)',
            alertMetrics: ['heart_rate_bpm', 'blood_pressure', 'spo2_pct', 'cabin_ppco2_mmHg', 'SENSOR_ARTIFACT_REJECTED'],
            spaceFunction: 'Sostiene el gasto cardíaco, la oxigenación arterial (SpO2) y la eliminación pulmonar de CO2 en cabinas presurizadas con reciclaje de atmósfera.',
            examReason: 'La ingravidez induce desacondicionamiento cardiovascular e intolerancia ortostática; además, fallos en los depuradores CDRA elevan la ppCO2 (> 3.0 mmHg) causando hipercapnia y taquicardia sinusal refleja secundaria.',
            evaluateStatus(ridge) {
                if (!ridge) return 'NOMINAL';
                const g = ridge.G_gravity;
                const e = ridge.E_environment;
                if (e.spo2_pct < 95 || e.cabin_ppco2_mmHg > 3.0 || g.heart_rate_bpm === 0 || g.heart_rate_bpm > 110 || g.blood_pressure_sys > 155 || g.blood_pressure_dia > 95) {
                    return 'CRITICAL';
                }
                return 'NOMINAL';
            },
            buildMetrics(ridge) {
                if (!ridge) return [];
                const g = ridge.G_gravity;
                const e = ridge.E_environment;
                return [
                    { label: 'Frecuencia Cardíaca', value: `${g.heart_rate_bpm} LPM`, level: (g.heart_rate_bpm > 110 || g.heart_rate_bpm === 0) ? 'crit' : '' },
                    { label: 'Presión Arterial', value: `${g.blood_pressure_sys}/${g.blood_pressure_dia} mmHg`, level: (g.blood_pressure_sys > 155 || g.blood_pressure_dia > 95) ? 'crit' : '' },
                    { label: 'Saturación O2 (SpO2)', value: `${e.spo2_pct} %`, level: e.spo2_pct < 95 ? 'crit' : '' },
                    { label: 'Cabina ppCO2', value: `${e.cabin_ppco2_mmHg.toFixed(2)} mmHg`, level: e.cabin_ppco2_mmHg > 3.0 ? 'crit' : '' }
                ];
            }
        },
        systemic: {
            title: 'SISTÉMICO / METABÓLICO & RADIACIÓN',
            alertMetrics: ['body_temperature_c', 'blood_sugar_mg_dl', 'acute_event_mSv', 'career_accumulated_mSv'],
            spaceFunction: 'Controla la glucemia celular, la termorregulación metabólica, la respuesta inmunitaria y la reparación tisular frente a radiación espacial ionizante.',
            examReason: 'El estrés espacial altera el metabolismo glucémico (resistencia a insulina o hipoglucemia crítica en EVA), mientras tormentas solares (SPE > 250 mSv) y radiación galáctica exigen monitoreo continuo bajo normas NASA-STD-3001 y CSA 2026.',
            evaluateStatus(ridge) {
                if (!ridge) return 'NOMINAL';
                const r = ridge.R_radiation;
                const g = ridge.G_gravity;
                const e = ridge.E_environment;
                const sugar = Number(g.blood_sugar_mg_dl ?? 92);
                if (r.acute_event_mSv > 250 || r.career_accumulated_mSv > 600 || e.body_temperature_c > 38.5 || e.body_temperature_c < 20.0 || sugar < 65) {
                    return 'CRITICAL';
                }
                if (sugar > 140) return 'WARNING';
                return 'NOMINAL';
            },
            buildMetrics(ridge) {
                if (!ridge) return [];
                const r = ridge.R_radiation;
                const g = ridge.G_gravity;
                const e = ridge.E_environment;
                const sugar = Number(g.blood_sugar_mg_dl ?? 92);
                return [
                    { label: 'Temperatura Corporal', value: `${e.body_temperature_c.toFixed(1)} °C`, level: e.body_temperature_c > 38.5 ? 'crit' : '' },
                    { label: 'Glucosa Sanguínea', value: `${sugar} mg/dL`, level: sugar < 65 ? 'crit' : (sugar > 140 ? 'warn' : '') },
                    { label: 'Dosis Aguda (SPE)', value: `${r.acute_event_mSv.toFixed(1)} mSv`, level: r.acute_event_mSv > 250 ? 'crit' : '' },
                    { label: 'Acumulado Carrera', value: `${r.career_accumulated_mSv.toFixed(1)} / 600 mSv`, level: r.career_accumulated_mSv > 600 ? 'crit' : (r.career_accumulated_mSv > 450 ? 'warn' : '') }
                ];
            }
        },
        musculoskeletal: {
            title: 'MUSCULOESQUELÉTICO / EXTREMIDADES',
            alertMetrics: ['exercise_completed_hours'],
            spaceFunction: 'Preserva la masa muscular estriada, la densidad mineral ósea (cadera y fémur) y la capacidad funcional necesaria para caminatas EVA y aterrizaje.',
            examReason: 'En microgravedad se pierde entre 1% y 1.5% de densidad ósea por mes al desaparecer la carga axial. Se prescriben 2.5 horas diarias de ejercicio resistivo ARED para sostener la integridad ósea y muscular.',
            evaluateStatus(ridge) {
                if (!ridge) return 'NOMINAL';
                const hours = ridge.G_gravity.exercise_completed_hours;
                if (hours < 1.5) return 'WARNING';
                return 'NOMINAL';
            },
            buildMetrics(ridge) {
                if (!ridge) return [];
                const hours = ridge.G_gravity.exercise_completed_hours;
                const pctGoal = Math.min(100, Math.round((hours / 2.5) * 100));
                const bonePreservation = Math.min(99.9, 94.0 + (Math.min(hours, 2.5) / 2.5) * 5.6);
                return [
                    { label: 'Ejercicio ARED Hoy', value: `${hours.toFixed(1)} / 2.5 h`, level: hours < 2.5 ? 'warn' : '' },
                    { label: 'Meta Diaria ARED', value: `${pctGoal} %`, level: pctGoal < 60 ? 'warn' : '' },
                    { label: 'Preservación Ósea Est.', value: `${bonePreservation.toFixed(1)} %`, level: hours < 1.5 ? 'warn' : '' },
                    { label: 'Suministro Farmacia', value: `${ridge.D_distance.med_supply_days_remaining} días`, level: '' }
                ];
            }
        }
    };

    function getActiveAlertsList() {
        if (!activeAlerts) return [];
        if (Array.isArray(activeAlerts)) return activeAlerts;
        if (typeof activeAlerts.values === 'function') return Array.from(activeAlerts.values());
        return [];
    }

    function computeZoneStatus(zoneId) {
        const meta = BODY_ZONES_META[zoneId];
        if (!meta) return 'NOMINAL';

        let level = 'NOMINAL';
        const alertsList = getActiveAlertsList();
        alertsList.forEach(alert => {
            if (meta.alertMetrics.includes(alert.trigger_metric)) {
                if (alert.status === 'CRITICAL') {
                    level = 'CRITICAL';
                } else if (alert.status === 'WARNING' && level !== 'CRITICAL') {
                    level = 'WARNING';
                }
            }
        });

        if (lastRidgeData && lastRidgeData.telemetry_ridge) {
            const evalStatus = meta.evaluateStatus(lastRidgeData.telemetry_ridge);
            if (evalStatus === 'CRITICAL') return 'CRITICAL';
            if (evalStatus === 'WARNING' && level !== 'CRITICAL') level = 'WARNING';
        }
        return level;
    }

    function renderBodyMap() {
        const zones = document.querySelectorAll('.body-zone');
        zones.forEach(el => {
            const zId = el.dataset.zone;
            const status = computeZoneStatus(zId).toLowerCase();
            el.classList.remove('nominal', 'warning', 'critical', 'active-zone');
            el.classList.add(status);
            if (zId === selectedBodyZone) {
                el.classList.add('active-zone');
            }
        });

        const tabs = document.querySelectorAll('.zone-tab-btn');
        tabs.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.zone === selectedBodyZone);
        });

        const meta = BODY_ZONES_META[selectedBodyZone];
        if (!meta) return;

        const currentStatus = computeZoneStatus(selectedBodyZone);
        if (zoneTitle) zoneTitle.textContent = meta.title;
        if (zoneStatusBadge) {
            zoneStatusBadge.textContent = currentStatus;
            zoneStatusBadge.className = `directive-status-tag ${currentStatus}`;
        }
        if (zoneFunction) zoneFunction.textContent = meta.spaceFunction;
        if (zoneReason) zoneReason.textContent = meta.examReason;

        if (zoneMetricsList) {
            const ridge = lastRidgeData ? lastRidgeData.telemetry_ridge : null;
            const metrics = meta.buildMetrics(ridge);
            if (metrics.length === 0) {
                zoneMetricsList.innerHTML = '<div class="zone-metric-pill"><span>Telemetría</span><strong>ESPERANDO FLUJO WS...</strong></div>';
            } else {
                zoneMetricsList.innerHTML = metrics.map(m =>
                    `<div class="zone-metric-pill ${escapeHtml(m.level || '')}"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(String(m.value))}</strong></div>`
                ).join('');
            }
        }
    }

    function renderRoutineCard() {
        const exerciseHours = lastRidgeData?.telemetry_ridge?.G_gravity?.exercise_completed_hours ?? 0;
        const aredDone = exerciseHours >= 2.5;
        const aredFraction = Math.min(1, exerciseHours / 2.5);
        const glucoseDone = routineState.glucoseChecked;
        const ocularDone = routineState.ocularChecked;

        const completedItems = (aredDone ? 1 : 0) + (glucoseDone ? 1 : 0) + (ocularDone ? 1 : 0);
        const totalScorePct = Math.round(((aredFraction + (glucoseDone ? 1 : 0) + (ocularDone ? 1 : 0)) / 3) * 100);

        if (routinePctLabel) routinePctLabel.textContent = `${totalScorePct}%`;
        if (routineProgressBar) {
            routineProgressBar.style.width = `${totalScorePct}%`;
            routineProgressBar.className = 'progress-bar-fill ' + (totalScorePct < 45 ? 'crit' : totalScorePct < 85 ? 'warn' : '');
        }
        if (routineStatusText) {
            routineStatusText.textContent = completedItems === 3
                ? 'PROTOCOLO DIARIO 3/3 COMPLETADO'
                : `${completedItems}/3 CONTRAMEDIDAS COMPLETADAS`;
        }
        if (routineStreakBadge) {
            const streak = routineState.streakDays + (completedItems === 3 ? 1 : 0);
            routineStreakBadge.textContent = `RACHA: ${streak} DÍAS`;
        }

        if (routineAredItem) routineAredItem.classList.toggle('completed', aredDone);
        if (routineAredText) routineAredText.textContent = `ARED: ${exerciseHours.toFixed(1)} / 2.5 h`;

        if (routineGlucoseItem) routineGlucoseItem.classList.toggle('completed', glucoseDone);
        if (routineGlucoseText) routineGlucoseText.textContent = glucoseDone ? 'Glucemia: Registrada' : 'Glucemia: Pendiente';

        if (routineOcularItem) routineOcularItem.classList.toggle('completed', ocularDone);
        if (routineOcularText) routineOcularText.textContent = ocularDone ? 'ONSD / Ocular: Verificado' : 'ONSD / Ocular: Pendiente';
    }

    function sendMetric(metric, value) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert('Conexión WebSocket no establecida. Asegúrate de que vitalgrid_daemon.exe esté ejecutándose en el puerto 9002.');
            return false;
        }
        const payload = JSON.stringify({ metric, value });
        ws.send(payload);
        console.log(`[MÉTRICA VITALGRID ENVIADA] ${payload}`);
        return true;
    }

    // --- Catálogo NASA OSDR (cargado desde data/osdr_live_cache.json) ---
    let osdrCatalog = new Map();
    let osdrFeaturedAccessions = ['OSD-483', 'OSD-569', 'OSD-359', 'OSD-258', 'OSD-431', 'OSD-1005'];

    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function extractAccessions(refString) {
        if (!refString) return [];
        const matches = String(refString).match(/OSD-\d+/g);
        return matches ? Array.from(new Set(matches)) : [];
    }

    async function loadOsdrCache() {
        const candidatePaths = ['../data/osdr_live_cache.json', '/data/osdr_live_cache.json'];
        let loaded = null;
        for (const path of candidatePaths) {
            try {
                const resp = await fetch(path, { cache: 'no-store' });
                if (resp.ok) {
                    loaded = await resp.json();
                    break;
                }
            } catch (err) {
                // Continuar al siguiente candidato
            }
        }

        if (loaded && Array.isArray(loaded.responses)) {
            osdrCatalog.clear();
            loaded.responses.forEach(page => {
                const hits = page?.body?.hits?.hits || [];
                hits.forEach(hit => {
                    const src = hit?._source;
                    if (!src || !src.Accession) return;
                    osdrCatalog.set(src.Accession, {
                        accession: src.Accession,
                        title: src['Study Title'] || 'NASA Spaceflight Study',
                        assay: src['Study Assay Technology Type'] || 'Multi-omics',
                        material: src['Material Type'] || 'Homo sapiens',
                        program: src['Flight Program'] || 'NASA Spaceflight',
                        dataSource: src['Data Source Accession'] || ''
                    });
                });
            });
            if (osdrCacheBadge) osdrCacheBadge.textContent = `${osdrCatalog.size} ESTUDIOS REALES`;
            if (osdrSyncedAt) osdrSyncedAt.textContent = `Caché UTC: ${loaded.fetched_at || '2026-11-14T00:00:00Z'}`;
        } else {
            if (osdrCacheBadge) osdrCacheBadge.textContent = 'CACHÉ OSDR NO DISPONIBLE';
            if (osdrSyncedAt) osdrSyncedAt.textContent = 'Ejecutar vía HTTP (run.bat)';
        }
        renderOsdrEvidencePanel();
    }

    function renderOsdrEvidencePanel() {
        if (!osdrStudiesList) return;

        const linkedAccessions = new Set();
        activeAlerts.forEach(alert => {
            extractAccessions(alert.osdr_reference).forEach(acc => linkedAccessions.add(acc));
        });

        const toDisplay = linkedAccessions.size > 0
            ? Array.from(linkedAccessions)
            : osdrFeaturedAccessions.filter(acc => osdrCatalog.has(acc));

        const finalAccessions = toDisplay.length > 0
            ? toDisplay
            : Array.from(osdrCatalog.keys()).slice(0, 6);

        if (finalAccessions.length === 0) {
            osdrStudiesList.innerHTML = `
                <div class="osdr-study-card">
                    <div class="osdr-study-title">Sin estudios cargados. Verifica <code>data/osdr_live_cache.json</code> sobre servidor HTTP local.</div>
                </div>`;
            return;
        }

        osdrStudiesList.innerHTML = '';
        finalAccessions.forEach(acc => {
            const study = osdrCatalog.get(acc);
            if (!study) return;
            const isLinked = linkedAccessions.has(acc);
            const card = document.createElement('div');
            card.className = `osdr-study-card${isLinked ? ' active-link' : ''}`;
            card.innerHTML = `
                <div class="osdr-study-head">
                    <span class="osdr-accession-tag">${escapeHtml(study.accession)}${isLinked ? ' · VINCULADO A ALERTA ACTIVA' : ''}</span>
                    <span class="osdr-assay-tag">${escapeHtml(study.assay)}</span>
                </div>
                <div class="osdr-study-title">${escapeHtml(study.title)}</div>
                <div class="osdr-study-meta">${escapeHtml(study.program)} · Muestra: ${escapeHtml(study.material)}${study.dataSource ? ' · ' + escapeHtml(study.dataSource) : ''}</div>
            `;
            osdrStudiesList.appendChild(card);
        });
    }

    // Salud y Supervivencia
    const healthScoreNum = document.getElementById('healthScoreNum');
    const healthGaugeProgress = document.getElementById('healthGaugeProgress');
    const crewIdEl = document.getElementById('crewId');
    const vitalSignsPill = document.getElementById('vitalSignsPill');
    const sosPill = document.getElementById('sosPill');
    const cabinPressurePill = document.getElementById('cabinPressurePill');

    // Canvas ECG
    const ecgCanvas = document.getElementById('ecgCanvas');
    const ecgCtx = ecgCanvas.getContext('2d');
    const ecgBpmDisplay = document.getElementById('ecgBpmDisplay');

    // --- Inicialización de Audio al hacer clic ---
    document.body.addEventListener('click', () => {
        window.aerospaceAudio.init();
    }, { once: true });

    muteBtn.addEventListener('click', () => {
        const isMuted = window.aerospaceAudio.toggleMute();
        muteBtn.textContent = isMuted ? 'ACTIVAR AUDIO' : 'SILENCIAR AUDIO';
        muteBtn.style.color = isMuted ? 'var(--text-muted)' : 'var(--hud-cyan)';
    });

    // --- Reloj de Tiempo Transcurrido de Misión (MET) ---
    let metSeconds = 42 * 86400 + 18 * 3600 + 24 * 60 + 12;
    if (utcClock) {
        utcClock.textContent = new Date().toISOString().substring(11, 19) + ' UTC';
    }
    setInterval(() => {
        metSeconds++;
        const d = Math.floor(metSeconds / 86400);
        const h = Math.floor((metSeconds % 86400) / 3600);
        const m = Math.floor((metSeconds % 3600) / 60);
        const s = metSeconds % 60;
        metClock.textContent = `MET +${String(d).padStart(3, '0')}:${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        utcClock.textContent = new Date().toISOString().substring(11, 19) + ' UTC';
    }, 1000);

    // --- Generador en Tiempo Real de ECG en Canvas ---
    let ecgPoints = [];
    let ecgX = 0;
    let currentBpm = 105;
    let isVitalsPresent = true;

    function resizeCanvas() {
        if (!ecgCanvas) return;
        ecgCanvas.width = ecgCanvas.clientWidth * window.devicePixelRatio;
        ecgCanvas.height = ecgCanvas.clientHeight * window.devicePixelRatio;
        ecgCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function drawECG() {
        const w = ecgCanvas.clientWidth;
        const h = ecgCanvas.clientHeight;
        const midY = h / 2;

        ecgCtx.fillStyle = 'rgba(4, 7, 11, 0.2)';
        ecgCtx.fillRect(0, 0, w, h);

        // Cuadrícula de derivación
        ecgCtx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
        ecgCtx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 20) {
            ecgCtx.beginPath();
            ecgCtx.moveTo(gx, 0);
            ecgCtx.lineTo(gx, h);
            ecgCtx.stroke();
        }
        for (let gy = 0; gy < h; gy += 20) {
            ecgCtx.beginPath();
            ecgCtx.moveTo(0, gy);
            ecgCtx.lineTo(w, gy);
            ecgCtx.stroke();
        }

        // Generar siguiente muestra ECG
        let sample = 0;
        if (!isVitalsPresent) {
            // Asistolia: línea plana con ruido sensor de baja amplitud
            sample = (Math.random() - 0.5) * 1.5;
        } else {
            const beatPeriod = Math.max(30, Math.floor(3600 / currentBpm));
            const phase = ecgX % beatPeriod;

            if (phase >= 10 && phase < 14) {
                // Onda P
                sample = Math.sin((phase - 10) / 4 * Math.PI) * 7;
            } else if (phase === 20) {
                // Caída Q
                sample = -10;
            } else if (phase === 22) {
                // Pico R (deflexión rápida)
                sample = 42;
            } else if (phase === 24) {
                // Caída S
                sample = -16;
            } else if (phase >= 32 && phase < 42) {
                // Onda T
                sample = Math.sin((phase - 32) / 10 * Math.PI) * 12;
            } else {
                sample = (Math.random() - 0.5) * 2;
            }
        }

        const pointY = midY - sample;
        ecgPoints.push({ x: ecgX % w, y: pointY });
        if (ecgPoints.length > w) {
            ecgPoints.shift();
        }

        // Trazo del haz
        ecgCtx.beginPath();
        ecgCtx.strokeStyle = isVitalsPresent ? '#00f3ff' : '#ff0055';
        ecgCtx.lineWidth = 2;
        ecgCtx.shadowColor = isVitalsPresent ? 'rgba(0, 243, 255, 0.8)' : 'rgba(255, 0, 85, 0.9)';
        ecgCtx.shadowBlur = 8;

        const currentPos = ecgX % w;
        for (let i = 1; i < ecgPoints.length; i++) {
            const p0 = ecgPoints[i - 1];
            const p1 = ecgPoints[i];
            if (Math.abs(p1.x - p0.x) < 5) {
                ecgCtx.moveTo(p0.x, p0.y);
                ecgCtx.lineTo(p1.x, p1.y);
            }
        }
        ecgCtx.stroke();
        ecgCtx.shadowBlur = 0;

        // Limpieza de cabeza de barrido
        ecgCtx.clearRect((currentPos + 1) % w, 0, 16, h);

        ecgX++;
        requestAnimationFrame(drawECG);
    }
    requestAnimationFrame(drawECG);

    // --- Cliente WebSocket ---
    function connectWebSocket() {
        console.log(`[VitalGrid UI] Conectando a ${wsUrl}...`);
        connectionLabel.textContent = 'CONECTANDO...';
        connectionPill.className = 'status-pill disconnected';

        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.error('[WS ERROR]', e);
            scheduleReconnect();
            return;
        }

        ws.onopen = () => {
            console.log('[VitalGrid UI] Conectado con el Demonio C++ del IA Médico de Vuelo');
            connectionLabel.textContent = 'TELEMETRÍA EN LÍNEA';
            connectionPill.className = 'status-pill connected';
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleIncomingMessage(data, event.data);
            } catch (err) {
                console.error('[ERROR PARSEANDO JSON]', err, event.data);
            }
        };

        ws.onclose = () => {
            console.warn('[VitalGrid UI] Conexión cerrada');
            connectionLabel.textContent = 'DESCONECTADO (REINTENTANDO)';
            connectionPill.className = 'status-pill disconnected';
            scheduleReconnect();
        };

        ws.onerror = (err) => {
            console.error('[ERROR DE SOCKET WS]', err);
            ws.close();
        };
    }

    function scheduleReconnect() {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 2000);
    }

    // --- Despachador de Mensajes ---
    function handleIncomingMessage(msg, rawString) {
        if (msg.type === 'SOMA_DSOC_EVENT') {
            handleSomaEvent(msg);
            return;
        }

        if (msg.type === 'CLINICAL_ALERT') {
            handleClinicalAlert(msg);
            return;
        }

        if (msg.crew_member_id && msg.telemetry_ridge) {
            handleRidgeTelemetry(msg, rawString);
        }
    }

    // --- Ingestión de Telemetría RIDGE ---
    function handleRidgeTelemetry(data, raw) {
        currentPayload = data;
        rawJsonViewer.textContent = JSON.stringify(data, null, 2);

        crewIdEl.textContent = data.crew_member_id || 'CMD-01';

        // Nivel de Salud
        const score = data.health_score ?? 100;
        healthScoreNum.textContent = score;
        
        // Progreso del anillo (circunferencia = 2 * PI * 70 = 440)
        const offset = 440 - (score / 100) * 440;
        healthGaugeProgress.style.strokeDashoffset = offset;

        if (score >= 80) {
            healthGaugeProgress.style.stroke = 'var(--bio-green)';
            healthScoreNum.style.color = '#fff';
        } else if (score >= 50) {
            healthGaugeProgress.style.stroke = 'var(--warn-amber)';
            healthScoreNum.style.color = 'var(--warn-amber)';
        } else {
            healthGaugeProgress.style.stroke = 'var(--crit-crimson)';
            healthScoreNum.style.color = 'var(--crit-crimson)';
        }

        // Tríada de Supervivencia
        const surv = data.survival_status;
        isVitalsPresent = surv.vital_signs_present;

        updateSurvivalPill(vitalSignsPill, surv.vital_signs_present, 'DETECTADOS (ACTIVO)', 'ASISTOLIA / PARO CARDÍACO');
        updateSurvivalPill(sosPill, !surv.sos_panic_button_active, 'ARMADO (EN ESPERA)', 'ACTIVADO (EMERGENCIA)');
        updateSurvivalPill(cabinPressurePill, surv.cabin_pressure_nominal, '101.3 kPa NOMINAL', '¡DESCOMPRESIÓN DE CABINA!');

        // Actualizar Métricas RIDGE
        lastRidgeData = data;
        const r = data.telemetry_ridge.R_radiation;
        const i = data.telemetry_ridge.I_isolation;
        const d = data.telemetry_ridge.D_distance;
        const g = data.telemetry_ridge.G_gravity;
        const e = data.telemetry_ridge.E_environment;

        currentBpm = g.heart_rate_bpm;
        ecgBpmDisplay.textContent = `${currentBpm} LPM`;

        // R - Radiación
        setMetric('val_rad_acute', r.acute_event_mSv.toFixed(1), r.acute_event_mSv > 250);
        setMetric('val_rad_career', r.career_accumulated_mSv.toFixed(1), r.career_accumulated_mSv > 600);
        const careerPct = Math.min(100, (r.career_accumulated_mSv / 600) * 100);
        const careerBar = document.getElementById('careerRadBar');
        if (careerBar) {
            careerBar.style.width = `${careerPct}%`;
            careerBar.className = 'progress-bar-fill ' + (careerPct > 80 ? 'crit' : careerPct > 50 ? 'warn' : '');
        }

        // I - Aislamiento
        const moodVal = i.crew_mood || 'OPTIMAL';
        setMetric('val_sleep_hours', i.sleep_hours_last_24h.toFixed(1), false, i.sleep_hours_last_24h < 6.0);
        setMetric('val_hrv_drop', i.hrv_rmssd_drop_pct.toFixed(1), false, i.hrv_rmssd_drop_pct > 25.0);
        setMetric('val_pvt_ms', i.pvt_reaction_time_ms, false, i.pvt_reaction_time_ms > 350);
        setMetric('val_blink_rate', i.blink_rate_per_min ?? 18, false, (i.blink_rate_per_min ?? 18) < 8);
        setMetric('val_microsleep', i.microsleep_events ?? 0, (i.microsleep_events ?? 0) >= 1, false);
        setMetric('val_crew_mood', moodVal, false, moodVal !== 'OPTIMAL');

        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mood === moodVal);
        });

        // D - Distancia
        setMetric('val_comm_delay', d.comm_delay_oneway_min.toFixed(1), false);
        setMetric('val_med_supply', d.med_supply_days_remaining, false);

        // G - Gravedad / Cardio / SANS / Glucemia
        const bloodSugar = Number(g.blood_sugar_mg_dl ?? 92);
        setMetric('val_hr', g.heart_rate_bpm, g.heart_rate_bpm > 110 || g.heart_rate_bpm === 0);
        const bpText = `${g.blood_pressure_sys}/${g.blood_pressure_dia}`;
        setMetric('val_bp', bpText, g.blood_pressure_sys > 155 || g.blood_pressure_dia > 95);
        setMetric('val_onsd', g.onsd_mm.toFixed(2), g.onsd_mm > 5.8);
        setMetric('val_blood_sugar', bloodSugar, bloodSugar < 65, bloodSugar > 140);
        setMetric('val_exercise', g.exercise_completed_hours.toFixed(1), false, g.exercise_completed_hours < 2.5);

        if (inputBloodSugar && document.activeElement !== inputBloodSugar) {
            inputBloodSugar.value = bloodSugar;
        }
        if (inputOnsd && document.activeElement !== inputOnsd) {
            inputOnsd.value = g.onsd_mm.toFixed(2);
        }

        // E - Entorno
        setMetric('val_ppco2', e.cabin_ppco2_mmHg.toFixed(2), e.cabin_ppco2_mmHg > 3.0);
        setMetric('val_spo2', e.spo2_pct, e.spo2_pct < 95);
        setMetric('val_temp', e.body_temperature_c.toFixed(1), e.body_temperature_c > 38.5);

        renderBodyMap();
        renderRoutineCard();

        // Purgar alertas expiradas que ya no se emitieron en los últimos 2.5 s
        const nowMs = Date.now();
        let pruned = false;
        activeAlerts.forEach((val, key) => {
            if (nowMs - val.receivedAt.getTime() > 2500) {
                activeAlerts.delete(key);
                pruned = true;
            }
        });
        if (pruned) {
            renderDirectives();
            renderOsdrEvidencePanel();
            const hasCritical = Array.from(activeAlerts.values()).some(a => a.status === 'CRITICAL');
            if (!hasCritical && !somaTriggered) {
                window.aerospaceAudio.stopAlarm();
            }
        }

        // Reinicio automático de indicador SOMA si se restituyen las constantes
        if (surv.vital_signs_present && !surv.sos_panic_button_active && surv.cabin_pressure_nominal) {
            if (somaTriggered) {
                somaTriggered = false;
                somaPill.className = 'status-pill soma-standby';
                somaLabel.textContent = 'WATCHDOG SOMA: NOMINAL';
                somaStrip.classList.remove('visible');
                somaDetailsCard.classList.remove('visible');
                window.aerospaceAudio.stopAlarm();
            }
        }
    }

    function setMetric(elemId, value, isCrit, isWarn = false) {
        const el = document.getElementById(elemId);
        if (!el) return;
        el.textContent = value;
        const cell = el.closest('.metric-cell');
        if (cell) {
            cell.classList.remove('critical-breach', 'warning-breach');
            if (isCrit) {
                cell.classList.add('critical-breach');
            } else if (isWarn) {
                cell.classList.add('warning-breach');
            }
        }
    }

    function updateSurvivalPill(element, isNominal, nominalText, dangerText) {
        if (!element) return;
        element.className = `survival-pill ${isNominal ? 'nominal' : 'danger'}`;
        const tag = element.querySelector('.tag');
        if (tag) {
            tag.textContent = isNominal ? nominalText : dangerText;
        }
    }

    // --- Ingestión de Alertas Clínicas del Flight Surgeon AI ---
    function handleClinicalAlert(alert) {
        const key = alert.trigger_metric;
        if (key === 'SENSOR_ARTIFACT_REJECTED') {
            activeAlerts.clear();
            window.aerospaceAudio.stopAlarm();
        } else if (activeAlerts.has('SENSOR_ARTIFACT_REJECTED')) {
            activeAlerts.delete('SENSOR_ARTIFACT_REJECTED');
        }
        activeAlerts.set(key, { ...alert, receivedAt: new Date() });
        renderDirectives();
        renderOsdrEvidencePanel();

        if (alert.status === 'CRITICAL') {
            window.aerospaceAudio.startMasterAlarm();
        } else if (alert.status === 'WARNING') {
            window.aerospaceAudio.playCautionChime();
        }
    }

    function renderDirectives() {
        directivesList.innerHTML = '';

        if (activeAlerts.size === 0) {
            directivesList.innerHTML = `
                <div class="directive-card NOMINAL">
                    <div class="directive-header">
                        <span class="directive-status-tag">NOMINAL</span>
                        <span class="directive-time">IA MÉDICO DE VUELO ACTIVO</span>
                    </div>
                    <div class="directive-diagnosis">TODOS LOS ESTÁNDARES BIOMÉDICOS DENTRO DE LOS LÍMITES NASA</div>
                    <div class="directive-trigger">Monitoreo pasivo continuo activo en los 5 pilares RIDGE.</div>
                    <div class="directive-action-box">
                        <div class="directive-action-label">Directiva:</div>
                        Mantener tareas operacionales de espacio profundo y ejercicios de contramedidas programados.
                    </div>
                </div>
            `;
            return;
        }

        // Ordenar por severidad crítica primero
        const sorted = Array.from(activeAlerts.values()).sort((a, b) => {
            if (a.status === 'CRITICAL' && b.status !== 'CRITICAL') return -1;
            if (b.status === 'CRITICAL' && a.status !== 'CRITICAL') return 1;
            return 0;
        });

        sorted.forEach(alert => {
            const card = document.createElement('div');
            card.className = `directive-card ${escapeHtml(alert.status)}`;
            const osdrAccessions = extractAccessions(alert.osdr_reference);
            const studyTitles = osdrAccessions
                .map(acc => osdrCatalog.get(acc))
                .filter(Boolean)
                .map(s => `${s.accession}: ${s.title}`)
                .join(' | ');
            const osdrBlock = alert.osdr_reference
                ? `<div class="directive-osdr-ref">NASA OSDR Ref: <strong>${escapeHtml(alert.osdr_reference)}</strong>${studyTitles ? ' — ' + escapeHtml(studyTitles) : ''}</div>`
                : '';

            const guideBlock = alert.astronaut_explanation
                ? `<div class="directive-astronaut-guide"><strong>💡 Guía para el Tripulante:</strong> ${escapeHtml(alert.astronaut_explanation)}</div>`
                : '';

            card.innerHTML = `
                <div class="directive-header">
                    <span class="directive-status-tag">${escapeHtml(alert.status)}</span>
                    <span class="directive-time">${escapeHtml(alert.timestamp || new Date().toISOString().substring(11, 19) + ' UTC')}</span>
                </div>
                <div class="directive-diagnosis">${escapeHtml(alert.diagnosis)}</div>
                <div class="directive-trigger">Disparador: ${escapeHtml(alert.trigger_metric)} = ${escapeHtml(alert.trigger_value)} (${escapeHtml(alert.threshold_limit)})</div>
                <div class="directive-action-box">
                    <div class="directive-action-label">ACCIÓN TÁCTICA INMEDIATA:</div>
                    ${escapeHtml(alert.tactical_action)}
                </div>
                ${guideBlock}
                ${osdrBlock}
            `;
            directivesList.appendChild(card);
        });
        renderBodyMap();
    }

    // --- Ingestión de Evento de Emergencia SOMA DSOC ---
    function handleSomaEvent(soma) {
        console.warn('[RÁFAGA DE EMERGENCIA SOMA RECIBIDA]', soma);
        somaTriggered = true;

        somaPill.className = 'status-pill soma-active';
        somaLabel.textContent = 'SOMA: CIENCIA SOBRE SUPERVIVENCIA';
        somaStrip.classList.add('visible');

        document.getElementById('somaReasonText').textContent = soma.trigger_reason;
        document.getElementById('somaDsocStation').textContent = soma.target_ground_station;
        document.getElementById('somaDelayText').textContent = `${soma.light_delay_minutes} min retardo lumínico`;

        // Llenar tarjeta de detalles forenses SOMA
        somaDetailsCard.classList.add('visible');
        document.getElementById('somaSamplesCount').textContent = `${soma.historical_samples_count} registros (1000 Hz)`;
        document.getElementById('somaDataSize').textContent = `${soma.raw_payload_bytes} B sin comprimir → ${soma.compressed_payload_bytes} B`;
        document.getElementById('somaCompression').textContent = `${soma.compression_algorithm} (Ratio: ${soma.compression_ratio}x)`;
        document.getElementById('somaCipher').textContent = soma.encryption_cipher;
        document.getElementById('somaNonce').textContent = soma.iv_nonce_hex;
        document.getElementById('somaTag').textContent = soma.auth_tag_hex;

        window.aerospaceAudio.playDsocBurstLaser();
        window.aerospaceAudio.startMasterAlarm();
    }

    // --- Cockpit de Simulación Interactiva ---
    function sendCommand(cmd) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert('Conexión WebSocket no establecida. Asegúrate de que vitalgrid_daemon.exe esté ejecutándose en el puerto 9002.');
            return;
        }
        ws.send(cmd);
        console.log(`[COMANDO VITALGRID ENVIADO] ${cmd}`);
    }

    // Vincular botones de inyección de anomalías
    document.getElementById('btnSos')?.addEventListener('click', () => sendCommand('TRIGGER_SOS'));
    document.getElementById('btnDepressurize')?.addEventListener('click', () => sendCommand('DEPRESSURIZE'));
    document.getElementById('btnAsystole')?.addEventListener('click', () => sendCommand('ASYSTOLE'));
    document.getElementById('btnHypoxia')?.addEventListener('click', () => sendCommand('INJECT_HYPOXIA'));
    document.getElementById('btnHypercapnia')?.addEventListener('click', () => sendCommand('INJECT_HYPERCAPNIA'));
    document.getElementById('btnSans')?.addEventListener('click', () => sendCommand('INJECT_SANS'));
    document.getElementById('btnSpeRadiation')?.addEventListener('click', () => sendCommand('INJECT_SPE_RADIATION'));
    document.getElementById('btnFever')?.addEventListener('click', () => sendCommand('INJECT_FEVER'));
    document.getElementById('btnFatigue')?.addEventListener('click', () => sendCommand('INJECT_FATIGUE'));
    document.getElementById('btnTachycardia')?.addEventListener('click', () => sendCommand('INJECT_TACHYCARDIA'));
    document.getElementById('btnHyperglycemia')?.addEventListener('click', () => sendCommand('INJECT_HYPERGLYCEMIA'));
    document.getElementById('btnHypoglycemia')?.addEventListener('click', () => sendCommand('INJECT_HYPOGLYCEMIA'));
    document.getElementById('btnSensorFault')?.addEventListener('click', () => sendCommand('INJECT_SENSOR_FAULT'));

    document.getElementById('btnResetNominal')?.addEventListener('click', () => {
        activeAlerts.clear();
        routineState.glucoseChecked = false;
        routineState.ocularChecked = false;
        renderDirectives();
        renderOsdrEvidencePanel();
        renderBodyMap();
        renderRoutineCard();
        window.aerospaceAudio.stopAlarm();
        sendCommand('RESET_NOMINAL');
    });

    document.getElementById('btnResetSurvival')?.addEventListener('click', () => {
        window.aerospaceAudio.stopAlarm();
        sendCommand('RESET_SURVIVAL');
        renderBodyMap();
    });

    // Selector de Entorno Operativo Espacial (actualiza retardo de comunicaciones en vivo)
    habitatEnvSelector?.addEventListener('change', () => {
        const profile = HABITAT_PROFILES[habitatEnvSelector.value];
        if (!profile) return;
        if (missionEnvTag) missionEnvTag.textContent = profile.label;
        setMetric('val_comm_delay', profile.delayMin.toFixed(1), false);
        if (lastRidgeData?.telemetry_ridge?.D_distance) {
            lastRidgeData.telemetry_ridge.D_distance.comm_delay_oneway_min = profile.delayMin;
        }
        sendMetric('comm_delay_oneway_min', profile.delayMin);
        renderBodyMap();
    });

    // Mapa Corporal Humano Interactivo (clics y teclado en nodos SVG y pestañas)
    function selectBodyZone(zoneId) {
        if (!BODY_ZONES_META[zoneId]) return;
        selectedBodyZone = zoneId;
        renderBodyMap();
    }

    document.querySelectorAll('.body-zone').forEach(zoneEl => {
        zoneEl.addEventListener('click', () => selectBodyZone(zoneEl.dataset.zone));
        zoneEl.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter' || evt.key === ' ') {
                evt.preventDefault();
                selectBodyZone(zoneEl.dataset.zone);
            }
        });
    });

    document.querySelectorAll('.zone-tab-btn').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => selectBodyZone(tabBtn.dataset.zone));
    });

    // Racha y Contramedidas de Rutina
    document.getElementById('btnAddExercise')?.addEventListener('click', () => {
        const currentHours = lastRidgeData?.telemetry_ridge?.G_gravity?.exercise_completed_hours ?? 1.8;
        const nextHours = Number(Math.min(4.0, currentHours + 0.5).toFixed(1));
        if (sendMetric('exercise_completed_hours', nextHours)) {
            if (lastRidgeData?.telemetry_ridge?.G_gravity) {
                lastRidgeData.telemetry_ridge.G_gravity.exercise_completed_hours = nextHours;
            }
            setMetric('val_exercise', nextHours.toFixed(1), false, nextHours < 2.5);
            renderRoutineCard();
            renderBodyMap();
        }
    });

    function submitManualBloodSugar() {
        const raw = Number(inputBloodSugar?.value ?? 92);
        if (!Number.isFinite(raw) || raw < 1 || raw > 600) {
            alert('Ingresa un valor válido de glucemia entre 1 y 600 mg/dL.');
            return;
        }
        const value = Math.round(raw);
        if (sendMetric('blood_sugar_mg_dl', value)) {
            routineState.glucoseChecked = true;
            if (lastRidgeData?.telemetry_ridge?.G_gravity) {
                lastRidgeData.telemetry_ridge.G_gravity.blood_sugar_mg_dl = value;
            }
            renderRoutineCard();
            renderBodyMap();
        }
    }

    function submitManualOnsd() {
        const raw = Number(inputOnsd?.value ?? 4.8);
        if (!Number.isFinite(raw) || raw < 1.0 || raw > 12.0) {
            alert('Ingresa un diámetro ONSD válido entre 1.0 y 12.0 mm.');
            return;
        }
        const value = Number(raw.toFixed(2));
        if (sendMetric('onsd_mm', value)) {
            routineState.ocularChecked = true;
            if (lastRidgeData?.telemetry_ridge?.G_gravity) {
                lastRidgeData.telemetry_ridge.G_gravity.onsd_mm = value;
            }
            renderRoutineCard();
            renderBodyMap();
        }
    }

    btnSendBloodSugar?.addEventListener('click', submitManualBloodSugar);
    inputBloodSugar?.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') submitManualBloodSugar();
    });

    btnSendOnsd?.addEventListener('click', submitManualOnsd);
    inputOnsd?.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') submitManualOnsd();
    });

    document.getElementById('btnMarkGlucoseCheck')?.addEventListener('click', submitManualBloodSugar);
    document.getElementById('btnMarkOcularCheck')?.addEventListener('click', submitManualOnsd);

    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mood = btn.dataset.mood;
            if (!mood) return;
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (sendMetric('crew_mood', mood)) {
                setMetric('val_crew_mood', mood, false, mood !== 'OPTIMAL');
                if (lastRidgeData?.telemetry_ridge?.I_isolation) {
                    lastRidgeData.telemetry_ridge.I_isolation.crew_mood = mood;
                }
                renderBodyMap();
            }
        });
    });

    // Inicializar Mapa Corporal, Rutina, Caché NASA OSDR y WebSocket
    renderBodyMap();
    renderRoutineCard();
    loadOsdrCache();
    connectWebSocket();
});
