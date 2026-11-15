#include "flight_surgeon.hpp"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace vitalgrid {

static std::string format_decimal(double value, int precision = 1) {
    std::ostringstream ss;
    ss << std::fixed << std::setprecision(precision) << value;
    return ss.str();
}

std::vector<ClinicalAlert> FlightSurgeonAI::evaluate(const RidgePayload& payload) {
    std::vector<ClinicalAlert> alerts;
    const auto& r = payload.telemetry_ridge.R_radiation;
    const auto& i = payload.telemetry_ridge.I_isolation;
    const auto& g = payload.telemetry_ridge.G_gravity;
    const auto& e = payload.telemetry_ridge.E_environment;
    const auto& s = payload.survival_status;
    const std::string ts = payload.timestamp;

    // 0. ANTI-HALLUCINATION / SENSOR ARTIFACT GUARDRAIL (Caso C)
    // Detiene diagnósticos falsos si algún transductor emite valores físicamente imposibles o contradictorios.
    const bool non_finite_reading =
        !std::isfinite(r.acute_event_mSv) || !std::isfinite(r.career_accumulated_mSv) ||
        !std::isfinite(g.onsd_mm) || !std::isfinite(e.cabin_ppco2_mmHg) ||
        !std::isfinite(e.body_temperature_c) || !std::isfinite(e.respiratory_rate_bpm) ||
        !std::isfinite(i.sleep_hours_last_24h) ||
        !std::isfinite(i.hrv_rmssd_drop_pct) || !std::isfinite(i.perclos_pct);

    const bool hr_spo2_contradiction = s.vital_signs_present && g.heart_rate_bpm <= 0 && e.spo2_pct >= 95;
    const bool impossible_hr_while_alive = s.vital_signs_present && g.heart_rate_bpm <= 0;
    const bool impossible_temp =
        e.body_temperature_c < THRESHOLD_BODY_TEMP_ARTIFACT_MIN_C ||
        e.body_temperature_c > THRESHOLD_BODY_TEMP_ARTIFACT_MAX_C;
    const bool impossible_bounds =
        e.spo2_pct < 0 || e.spo2_pct > 100 ||
        r.acute_event_mSv < 0.0 || r.career_accumulated_mSv < 0.0 ||
        e.cabin_ppco2_mmHg < 0.0 || e.respiratory_rate_bpm < 0.0 || g.onsd_mm < 0.0 ||
        g.blood_sugar_mg_dl <= 0 || g.blood_sugar_mg_dl > THRESHOLD_BLOOD_SUGAR_ARTIFACT_MAX_MGDL;

    if (non_finite_reading || hr_spo2_contradiction || impossible_hr_while_alive || impossible_temp || impossible_bounds) {
        ClinicalAlert artifact;
        artifact.status = AlertSeverity::WARNING;
        artifact.trigger_metric = "SENSOR_ARTIFACT_REJECTED";
        artifact.trigger_value = "HR=" + std::to_string(g.heart_rate_bpm) + " bpm, SpO2=" +
                                 std::to_string(e.spo2_pct) + "%, Temp=" +
                                 format_decimal(e.body_temperature_c, 1) + " °C, Gluc=" +
                                 std::to_string(g.blood_sugar_mg_dl) + " mg/dL";
        artifact.threshold_limit = "GUARDRAIL COHERENCIA FISIOLÓGICA";
        artifact.diagnosis = "SENSOR_ARTIFACT_REJECTED :: INCOHERENCIA FISIOLÓGICA / FALLO DE TRANSDUCTOR";
        artifact.tactical_action =
            "GUARDRAIL ANTIALUCINACIÓN ACTIVO: Se descartó lectura físicamente imposible o contradictoria. "
            "Diagnósticos clínicos automáticos bloqueados en este ciclo para evitar iatrogenia. "
            "Inspeccionar bus de sensores biomédicos y reacoplar electrodos/termistor.";
        artifact.astronaut_explanation =
            "El sensor envió un valor físicamente imposible (por ejemplo, un electrodo suelto o mal contacto). "
            "No tomes ningún medicamento; revisa que el parche del pecho, el oxímetro del dedo y el termómetro estén bien ajustados.";
        artifact.osdr_reference = "OSD-569 / OSD-483";
        artifact.timestamp = ts;
        alerts.push_back(artifact);
        return alerts;
    }

    // 1. CRITICAL: Radiation acute > 250 mSv (con Correlación Cruzada R vs. E - Caso A) or career > 600 mSv
    if (r.acute_event_mSv > THRESHOLD_ACUTE_RAD_CRITICAL_MSV) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "acute_event_mSv";
        alert.timestamp = ts;

        if (e.cabin_ppco2_mmHg > THRESHOLD_PPCO2_CRITICAL_MMHG) {
            alert.trigger_value = format_decimal(r.acute_event_mSv, 1) + " mSv + ppCO2 " +
                                  format_decimal(e.cabin_ppco2_mmHg, 2) + " mmHg";
            alert.threshold_limit = "> " + format_decimal(THRESHOLD_ACUTE_RAD_CRITICAL_MSV, 1) +
                                    " mSv & > " + format_decimal(THRESHOLD_PPCO2_CRITICAL_MMHG, 2) +
                                    " mmHg [CONFLICTO R+E]";
            alert.diagnosis = "CONFLICTO MULTI-PILAR [R vs E]: TORMENTA SOLAR AGUDA (SPE) + ACUMULACIÓN TÓXICA DE CO2";
            alert.tactical_action =
                "RESOLUCIÓN DE CONFLICTO R-E: ¡PROHIBIDO SELLAR ESCOTILLA DEL REFUGIO SIN PURGA PREVIA! "
                "Priorizar purga rápida CDRA y trasladar cartuchos activos de LiOH dentro del Storm Shelter "
                "antes de sellar la escotilla blindada. Administrar Filgrastim (G-CSF) 300mcg subcutáneo.";
            alert.astronaut_explanation =
                "Una tormenta solar exige refugiarte en el núcleo protegido, pero el CO2 de cabina está alto. "
                "Purga el aire con el sistema CDRA y lleva cartuchos químicos LiOH contigo antes de cerrar la escotilla del refugio.";
            alert.osdr_reference = "OSD-431 / OSD-569";
        } else {
            alert.trigger_value = format_decimal(r.acute_event_mSv, 1) + " mSv";
            alert.threshold_limit = "> " + format_decimal(THRESHOLD_ACUTE_RAD_CRITICAL_MSV, 1) + " mSv";
            alert.diagnosis = "SÍNDROME DE RADIACIÓN AGUDA (ARS) - EXPOSICIÓN MASIVA A EVENTO DE PARTÍCULAS SOLARES (SPE)";
            alert.tactical_action =
                "EVACUACIÓN INMEDIATA al núcleo blindado (Storm Shelter con paredes de agua). "
                "Administrar Filgrastim (G-CSF) 300mcg subcutáneo. Desenergizar aviónica delantera no esencial.";
            alert.astronaut_explanation =
                "Llegaron partículas solares de alta energía capaces de dañar tu médula ósea. "
                "Trasládate ya al refugio rodeado de tanques de agua y lleva tu dosímetro personal contigo.";
            alert.osdr_reference = "OSD-431 / OSD-569";
        }
        alerts.push_back(alert);
    }

    if (r.career_accumulated_mSv > THRESHOLD_CAREER_RAD_CRITICAL_MSV) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "career_accumulated_mSv";
        alert.trigger_value = format_decimal(r.career_accumulated_mSv, 1) + " mSv";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_CAREER_RAD_CRITICAL_MSV, 1) + " mSv";
        alert.diagnosis = "LÍMITE MÁXIMO DE RADIACIÓN IONIZANTE DE CARRERA EXCEDIDO";
        alert.tactical_action =
            "Suspender permanentemente todas las actividades extravehiculares (EVA). Reasignar a guardia en hábitat "
            "central de alto blindaje. Iniciar análisis cromosómicos diarios en linfocitos.";
        alert.astronaut_explanation =
            "Superaste el presupuesto seguro de radiación acumulada para toda tu carrera. "
            "Suspende cualquier caminata espacial y mantente en las zonas más blindadas de la nave.";
        alert.osdr_reference = "OSD-569 / OSD-114";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    // 2. CRITICAL: Blood Pressure > 155/95 mmHg, HR > 110 bpm (con Correlación G vs. E - Caso B), or ONSD > 5.8 mm
    if (g.blood_pressure_sys > THRESHOLD_BP_SYS_CRITICAL || g.blood_pressure_dia > THRESHOLD_BP_DIA_CRITICAL) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "blood_pressure";
        alert.trigger_value = std::to_string(g.blood_pressure_sys) + "/" + std::to_string(g.blood_pressure_dia) + " mmHg";
        alert.threshold_limit = "> " + std::to_string(THRESHOLD_BP_SYS_CRITICAL) + "/" + std::to_string(THRESHOLD_BP_DIA_CRITICAL) + " mmHg";
        alert.diagnosis = "CRISIS HIPERTENSIVA EN MICROGRAVEDAD - RIESGO CEREBROVASCULAR";
        alert.tactical_action =
            "Suspender todo ejercicio aeróbico y resistivo. Asegurar a la tripulación en posición supina. "
            "Administrar Captopril 25mg sublingual; repetir control de presión arterial cada 10 min. Vigilar signos de hemorragia intracraneal.";
        alert.astronaut_explanation =
            "Tu presión arterial subió a niveles de riesgo para los vasos cerebrales. "
            "Detén el ejercicio, relaja el brazo a la altura del corazón y vuelve a medir con el brazalete en 10 minutos.";
        alert.osdr_reference = "OSD-635 / OSD-344";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (g.heart_rate_bpm > THRESHOLD_HR_CRITICAL_BPM) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "heart_rate_bpm";
        alert.timestamp = ts;

        if (e.cabin_ppco2_mmHg > THRESHOLD_PPCO2_CRITICAL_MMHG || e.spo2_pct < THRESHOLD_SPO2_CRITICAL_PCT) {
            alert.trigger_value = std::to_string(g.heart_rate_bpm) + " bpm (ppCO2: " +
                                  format_decimal(e.cabin_ppco2_mmHg, 2) + " mmHg, SpO2: " +
                                  std::to_string(e.spo2_pct) + "%)";
            alert.threshold_limit = "> " + std::to_string(THRESHOLD_HR_CRITICAL_BPM) +
                                    " bpm + Hipoxia/Hipercapnia [CORRELACIÓN G+E]";
            alert.diagnosis = "Taquicardia Sinusal Refleja Secundaria a Hipoxia/Hipercapnia Ambiental";
            alert.tactical_action =
                "CONTRAINDICACIÓN CRÍTICA: PROHIBIDO administrar betabloqueantes (Metoprolol), ya que la taquicardia "
                "es un mecanismo compensatorio al déficit ambiental de O2 o exceso de CO2. Priorizar soporte inmediato "
                "de O2 al 100% y depuración atmosférica ECLSS/CDRA.";
            alert.astronaut_explanation =
                "Tu corazón late rápido para compensar falta de oxígeno o exceso de CO2 en el aire de la cabina. "
                "No tomes pastillas para bajar el pulso; ponte la máscara de oxígeno y verifica el flujo del sistema de aire.";
            alert.osdr_reference = "OSD-258 / OSD-359";
        } else {
            alert.trigger_value = std::to_string(g.heart_rate_bpm) + " bpm";
            alert.threshold_limit = "> " + std::to_string(THRESHOLD_HR_CRITICAL_BPM) + " bpm";
            alert.diagnosis = "TAQUICARDIA SUPRAVENTRICULAR SOSTENIDA / DESREGULACIÓN AUTÓNOMA";
            alert.tactical_action =
                "Realizar maniobras vagales (maniobra de Valsalva modificada). Verificar estado de hidratación y "
                "telemetría de electrolitos (K+/Mg2+). Preparar Metoprolol 5mg IV si persiste > 15 min.";
            alert.astronaut_explanation =
                "Tu ritmo cardíaco está acelerado en reposo y puede agotar el corazón en microgravedad. "
                "Siéntate o sujétate, bebe agua y sopla con fuerza contra una jeringa cerrada 15 segundos mientras revisas tu pulso.";
            alert.osdr_reference = "OSD-258 / OSD-344";
        }
        alerts.push_back(alert);
    }

    if (g.onsd_mm > THRESHOLD_ONSD_CRITICAL_MM) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "onsd_mm";
        alert.trigger_value = format_decimal(g.onsd_mm, 2) + " mm";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_ONSD_CRITICAL_MM, 2) + " mm";
        alert.diagnosis = "SÍNDROME NEURO-OCULAR ASOCIADO AL VUELO ESPACIAL (SANS) - PRESIÓN INTRACRANEAL (ICP) CRÍTICA";
        alert.tactical_action =
            "Desplegar dispositivo de Presión Negativa en Miembros Inferiores (LBNP) a -35 mmHg por 2 horas para "
            "redistribución caudal del fluido cefálico. Administrar Acetazolamida 250mg VO. Programar fondo de ojo de alta resolución.";
        alert.astronaut_explanation =
            "Sin gravedad, el líquido corporal sube hacia tu cabeza y está presionando el nervio óptico (riesgo para tu vista). "
            "Coloca la sonda de ultrasonido con gel sobre el párpado cerrado para confirmar el diámetro y entra en la cámara LBNP.";
        alert.osdr_reference = "OSD-1005 / OSD-635";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    // 3. CRITICAL / WARNING: Glucemia capilar (blood_sugar_mg_dl < 65 CRITICAL o > 140 WARNING)
    if (g.blood_sugar_mg_dl < THRESHOLD_BLOOD_SUGAR_LOW_CRIT_MGDL) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "blood_sugar_mg_dl";
        alert.trigger_value = std::to_string(g.blood_sugar_mg_dl) + " mg/dL";
        alert.threshold_limit = "< " + std::to_string(THRESHOLD_BLOOD_SUGAR_LOW_CRIT_MGDL) + " mg/dL";
        alert.diagnosis = "HIPOGLUCEMIA AGUDA EN VUELO ESPACIAL - RIESGO NEUROGLUCOPÉNICO";
        alert.tactical_action =
            "Administrar inmediatamente 15-20g de glucosa oral de absorción rápida (gel de dextrosa). "
            "Si hay compromiso de conciencia, administrar Glucagón 1mg IM. Repetir glucometría capilar en 15 min y suspender tareas críticas.";
        alert.astronaut_explanation =
            "Tu nivel de azúcar en sangre bajó demasiado y tu cerebro necesita energía inmediata. "
            "Consume un tubo de gel de glucosa del kit médico, descansa y vuelve a pinchar tu dedo con el glucómetro en 15 minutos.";
        alert.osdr_reference = "OSD-571 / OSD-569";
        alert.timestamp = ts;
        alerts.push_back(alert);
    } else if (g.blood_sugar_mg_dl > THRESHOLD_BLOOD_SUGAR_HIGH_WARN_MGDL) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "blood_sugar_mg_dl";
        alert.trigger_value = std::to_string(g.blood_sugar_mg_dl) + " mg/dL";
        alert.threshold_limit = "> " + std::to_string(THRESHOLD_BLOOD_SUGAR_HIGH_WARN_MGDL) + " mg/dL";
        alert.diagnosis = "HIPERGLUCEMIA / RESISTENCIA A LA INSULINA SUBAGUDA INDUCIDA POR MICROGRAVEDAD Y ESTRÉS";
        alert.tactical_action =
            "Restringir carbohidratos simples en la ingesta actual. Hidratar con 500 mL de agua y programar 30 min "
            "de ejercicio aeróbico en cicloergómetro. Repetir control de glucosa capilar en 2 horas.";
        alert.astronaut_explanation =
            "En microgravedad los músculos absorben menos glucosa y el estrés espacial eleva el azúcar en sangre. "
            "Bebe agua, evita azúcares simples hoy y completa tu rutina de ejercicio para mejorar la sensibilidad a la insulina.";
        alert.osdr_reference = "OSD-571 / OSD-516";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    // 4. CRITICAL: ppCO2 > 3.0 mmHg (hipercapnia), SpO2 < 95% (hipoxia), Temp > 38.5 C (fiebre espacial)
    if (e.cabin_ppco2_mmHg > THRESHOLD_PPCO2_CRITICAL_MMHG) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "cabin_ppco2_mmHg";
        alert.trigger_value = format_decimal(e.cabin_ppco2_mmHg, 2) + " mmHg";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_PPCO2_CRITICAL_MMHG, 2) + " mmHg";
        alert.diagnosis = "HIPERCAPNIA ATMOSFÉRICA EN CABINA - RETENCIÓN DE CO2 / DEGRADACIÓN ECLSS";
        alert.tactical_action =
            "Ciclar lechos del Ensamblaje de Eliminación de Dióxido de Carbono (CDRA) a modo de desorción rápida de emergencia. "
            "Colocar máscaras de O2 a la tripulación. Activar cartuchos químicos de LiOH de respaldo en cabina.";
        alert.astronaut_explanation =
            "El dióxido de carbono se está acumulando en el aire de la nave y puede causarte dolor de cabeza y confusión. "
            "Verifica el ventilador de circulación de tu zona, activa el depurador CDRA y ten lista tu máscara de oxígeno.";
        alert.osdr_reference = "OSD-359 / OSD-174";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (e.spo2_pct < THRESHOLD_SPO2_CRITICAL_PCT) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "spo2_pct";
        alert.trigger_value = std::to_string(e.spo2_pct) + "%";
        alert.threshold_limit = "< " + std::to_string(THRESHOLD_SPO2_CRITICAL_PCT) + "%";
        alert.diagnosis = "HIPOXEMIA SISTÉMICA AGUDA / DESEQUILIBRIO VENTILACIÓN-PERFUSIÓN (V/Q)";
        alert.tactical_action =
            "Suministrar O2 al 100% mediante mascarilla de aviador a 6 L/min inmediatamente. Inspeccionar sensores de "
            "presión parcial de O2 en traje y cabina. Auscultar bases pulmonares para descartar atelectasia.";
        alert.astronaut_explanation =
            "Tu sangre está transportando menos oxígeno del necesario hacia el cerebro y los órganos. "
            "Calienta tu mano, limpia el sensor de dedo del oxímetro para confirmar el dato y respira oxígeno suplementario.";
        alert.osdr_reference = "OSD-359 / OSD-569";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (e.body_temperature_c > THRESHOLD_BODY_TEMP_CRITICAL_C) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "body_temperature_c";
        alert.trigger_value = format_decimal(e.body_temperature_c, 1) + " °C";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_BODY_TEMP_CRITICAL_C, 1) + " °C";
        alert.diagnosis = "FIEBRE ESPACIAL / HIPERTERMIA MALIGNA O SEPSIS DE ESPACIO PROFUNDO";
        alert.tactical_action =
            "Conectar Prenda de Ventilación y Enfriamiento Líquido (LCVG) en bucle activo de refrigeración. "
            "Infundir Paracetamol 1000mg IV. Extraer muestras de sangre en cartucho de bioanalizador para panel de sepsis.";
        alert.astronaut_explanation =
            "En el espacio el calor corporal no se disipa por convección y una fiebre indica infección o estrés térmico severo. "
            "Toma la temperatura timpánica para confirmar, hidrátate y activa la prenda de enfriamiento líquido.";
        alert.osdr_reference = "OSD-903 / OSD-570";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (e.respiratory_rate_bpm < THRESHOLD_RESP_RATE_LOW_CRIT_BPM) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::CRITICAL;
        alert.trigger_metric = "respiratory_rate_bpm";
        alert.trigger_value = format_decimal(e.respiratory_rate_bpm, 1) + " rpm";
        alert.threshold_limit = "< " + format_decimal(THRESHOLD_RESP_RATE_LOW_CRIT_BPM, 1) + " rpm";
        alert.diagnosis = "BRADIPNEA SEVERA / DEPRESIÓN RESPIRATORIA CENTRAL EN MICROGRAVEDAD";
        alert.tactical_action =
            "Asegurar permeabilidad de vía aérea e iniciar soporte ventilatorio con bolsa-válvula-mascarilla al 100% O2. "
            "Administrar Naloxona 0.4mg IV/IM si se sospecha depresión farmacológica. Vigilar capnografía continua.";
        alert.astronaut_explanation =
            "Tu frecuencia respiratoria cayó a un nivel peligroso y tus pulmones no están renovando suficiente aire. "
            "Colócate la mascarilla de oxígeno de flujo continuo y avisa de inmediato a tu compañero de guardia.";
        alert.osdr_reference = "OSD-359 / OSD-569";
        alert.timestamp = ts;
        alerts.push_back(alert);
    } else if (e.respiratory_rate_bpm > THRESHOLD_RESP_RATE_HIGH_WARN_BPM) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "respiratory_rate_bpm";
        alert.trigger_value = format_decimal(e.respiratory_rate_bpm, 1) + " rpm";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_RESP_RATE_HIGH_WARN_BPM, 1) + " rpm";
        alert.diagnosis = "TAQUIPNEA COMPENSATORIA / ESTRÉS VENTILATORIO O HIPERCAPNIA SUBCLÍNICA";
        alert.tactical_action =
            "Verificar presión parcial de CO2 local y flujo de ventiladores de casco/camarote. "
            "Guiar respiración diafragmática controlada (12-16 rpm), hidratar y reevaluar SpO2 y auscultación pulmonar.";
        alert.astronaut_explanation =
            "Estás respirando demasiado rápido en reposo, posiblemente por bolsillos de CO2 acumulado o estrés agudo. "
            "Acércate a una salida de ventilación de cabina y realiza respiraciones lentas y profundas.";
        alert.osdr_reference = "OSD-359 / OSD-174";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    // 5. WARNING: Sleep < 6.0h, HRV RMSSD drop > 25%, Blink rate < 8/min, Microsleep >= 1, and Mood/Sensor Discrepancy
    if (i.sleep_hours_last_24h < THRESHOLD_SLEEP_WARN_HOURS) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "sleep_hours_last_24h";
        alert.trigger_value = format_decimal(i.sleep_hours_last_24h, 1) + " h";
        alert.threshold_limit = "< " + format_decimal(THRESHOLD_SLEEP_WARN_HOURS, 1) + " h";
        alert.diagnosis = "DEUDA CRÓNICA DE SUEÑO / RIESGO DE DETERIORO POR FATIGA COGNITIVA";
        alert.tactical_action =
            "Prescribir reposo reparador obligatorio de 60 min en camarote oscurecido. Cambiar iluminación ambiental a "
            "espectro circadiano cálido sin componente azul de 480nm. Suspender tareas robóticas de alta criticidad.";
        alert.astronaut_explanation =
            "Dormiste menos de 6 horas y sin ciclo solar natural tu reloj biológico se desajusta rápido. "
            "Programa un bloque de descanso con luz cálida y evita maniobras finas hasta recuperarte.";
        alert.osdr_reference = "OSD-174 / OSD-483";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (i.hrv_rmssd_drop_pct > THRESHOLD_HRV_DROP_WARN_PCT) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "hrv_rmssd_drop_pct";
        alert.trigger_value = format_decimal(i.hrv_rmssd_drop_pct, 1) + "%";
        alert.threshold_limit = "> " + format_decimal(THRESHOLD_HRV_DROP_WARN_PCT, 1) + "%";
        alert.diagnosis = "DOMINANCIA SIMPÁTICA AUTÓNOMA Y ELEVADA CARGA DE ESTRÉS ALOSTÁTICO";
        alert.tactical_action =
            "Iniciar biorretroalimentación de respiración resonante guiada (marcapasos a 0.1 Hz) durante 15 min. "
            "Reducir estímulos sensoriales en la estación de trabajo. Evaluar biomarcadores salivales de cortisol y melatonina.";
        alert.astronaut_explanation =
            "La variabilidad entre latidos cayó, señal de que tu sistema nervioso está en alerta continua por estrés o confinamiento. "
            "Dedica 10 minutos a respirar lento (5 s inhalar, 5 s exhalar) con el sensor pectoral colocado.";
        alert.osdr_reference = "OSD-571 / OSD-483";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (i.blink_rate_per_min < THRESHOLD_BLINK_RATE_WARN_PER_MIN) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "blink_rate_per_min";
        alert.trigger_value = std::to_string(i.blink_rate_per_min) + " parp/min";
        alert.threshold_limit = "< " + std::to_string(THRESHOLD_BLINK_RATE_WARN_PER_MIN) + " parp/min";
        alert.diagnosis = "FATIGA OCULAR SEVERA / HIPOVIGILANCIA POR CAÍDA DE FRECUENCIA DE PARPADEO";
        alert.tactical_action =
            "Activar protocolo de descanso visual 20-20-20. Suministrar gotas oftálmicas lubricantes en cabina. "
            "Suspender tareas robóticas de precisión y evaluar nivel de fatiga neurocognitiva.";
        alert.astronaut_explanation =
            "La cámara ocular detectó que parpadeas muy poco, lo que indica fijación rígida por cansancio y resequedad corneal. "
            "Aparta la vista de las pantallas 20 segundos y aplica lágrimas artificiales.";
        alert.osdr_reference = "OSD-1005 / OSD-174";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    if (i.microsleep_events >= THRESHOLD_MICROSLEEP_WARN_COUNT) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "microsleep_events";
        alert.trigger_value = std::to_string(i.microsleep_events) + " eventos";
        alert.threshold_limit = ">= " + std::to_string(THRESHOLD_MICROSLEEP_WARN_COUNT);
        alert.diagnosis = "EVENTO DE MICROSUEÑO DETECTADO - PÉRDIDA TRANSITORIA DE CONCIENCIA";
        alert.tactical_action =
            "EMITIR ALERTA AUDITIVA EN CABINA (Chime de atención inmediata). Notificar al comandante de misión. "
            "Relevar inmediatamente al astronauta de controles de vuelo activos.";
        alert.astronaut_explanation =
            "Tus párpados permanecieron cerrados involuntariamente más de medio segundo frente a la cámara. "
            "Tu cerebro está desconectándose por agotamiento; entrega los controles activos y toma descanso inmediato.";
        alert.osdr_reference = "OSD-174 / OSD-1005";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    // Cruce Autoreporte vs. Cámara y Biometría (Regla de Aislamiento)
    const bool physiological_exhaustion =
        (i.sleep_hours_last_24h < THRESHOLD_SLEEP_WARN_HOURS) ||
        (i.hrv_rmssd_drop_pct > THRESHOLD_HRV_DROP_WARN_PCT) ||
        (i.blink_rate_per_min < THRESHOLD_BLINK_RATE_WARN_PER_MIN) ||
        (i.microsleep_events >= THRESHOLD_MICROSLEEP_WARN_COUNT);

    if (i.crew_mood == "OPTIMAL" && physiological_exhaustion) {
        ClinicalAlert alert;
        alert.status = AlertSeverity::WARNING;
        alert.trigger_metric = "crew_mood_discrepancy";
        alert.trigger_value = "Autoreporte: OPTIMAL vs Biometría (Sueño: " + format_decimal(i.sleep_hours_last_24h, 1) +
                              " h, HRV: -" + format_decimal(i.hrv_rmssd_drop_pct, 1) + "%, Parpadeo: " +
                              std::to_string(i.blink_rate_per_min) + "/min, Microsueños: " +
                              std::to_string(i.microsleep_events) + ")";
        alert.threshold_limit = "COHERENCIA NEURO-CONDUCTUAL [I + CÁMARA]";
        alert.diagnosis = "DISCREPANCIA BIOMÉTRICA DE AUTOCONCIENCIA: Fatiga o estrés enmascarado detectado por sensores frente a autoreporte óptimo";
        alert.tactical_action =
            "Mitigar sesgo de sobreconfianza operativa: los sensores objetivos (cámara ocular MediaPipe / biometría HRV y sueño) "
            "contradicen el autoreporte 'OPTIMAL'. Realizar test PVT de 3 min y reprogramar maniobras críticas.";
        alert.astronaut_explanation =
            "Reportaste sentirte 'OPTIMAL', pero tus ojos y sensores cardíacos muestran signos claros de cansancio acumulado. "
            "En misiones espaciales es común no percibir la propia fatiga; haz una pausa preventiva y verifica tu tiempo de reacción.";
        alert.osdr_reference = "OSD-174 / OSD-483";
        alert.timestamp = ts;
        alerts.push_back(alert);
    }

    return alerts;
}

int FlightSurgeonAI::compute_health_score(const RidgePayload& payload) const {
    double score = 100.0;
    const auto& r = payload.telemetry_ridge.R_radiation;
    const auto& i = payload.telemetry_ridge.I_isolation;
    const auto& g = payload.telemetry_ridge.G_gravity;
    const auto& e = payload.telemetry_ridge.E_environment;
    const auto& s = payload.survival_status;

    // Survival compromises = instantaneous score drop
    if (!s.vital_signs_present) return 0;
    if (s.sos_panic_button_active) score -= 35.0;
    if (!s.cabin_pressure_nominal) score -= 40.0;

    // Radiation penalties
    if (r.acute_event_mSv > 250.0) score -= 40.0;
    else if (r.acute_event_mSv > 50.0) score -= 15.0;
    if (r.career_accumulated_mSv > 600.0) score -= 25.0;

    // Gravity / Cardiovascular / Metabolic penalties
    if (g.heart_rate_bpm > 110) score -= 15.0;
    if (g.blood_pressure_sys > 155 || g.blood_pressure_dia > 95) score -= 15.0;
    if (g.onsd_mm > 5.8) score -= 20.0;
    else if (g.onsd_mm > 5.0) score -= 5.0;
    if (g.blood_sugar_mg_dl < THRESHOLD_BLOOD_SUGAR_LOW_CRIT_MGDL) score -= 25.0;
    else if (g.blood_sugar_mg_dl > THRESHOLD_BLOOD_SUGAR_HIGH_WARN_MGDL) score -= 10.0;

    // Environmental penalties
    if (e.cabin_ppco2_mmHg > 3.0) score -= 20.0;
    else if (e.cabin_ppco2_mmHg > 2.5) score -= 5.0;
    if (e.spo2_pct < 95) score -= 25.0;
    if (e.body_temperature_c > 38.5) score -= 20.0;
    if (e.respiratory_rate_bpm < THRESHOLD_RESP_RATE_LOW_CRIT_BPM) score -= 25.0;
    else if (e.respiratory_rate_bpm > THRESHOLD_RESP_RATE_HIGH_WARN_BPM) score -= 10.0;

    // Isolation / Stress penalties
    if (i.sleep_hours_last_24h < 6.0) score -= 8.0;
    if (i.hrv_rmssd_drop_pct > 25.0) score -= 8.0;
    if (i.pvt_reaction_time_ms > 350) score -= 5.0;
    if (i.blink_rate_per_min < 8) score -= 8.0;
    if (i.microsleep_events > 0) score -= 15.0;
    if (i.crew_mood != "OPTIMAL") score -= 5.0;

    score = std::clamp(score, 0.0, 100.0);
    return static_cast<int>(std::round(score));
}

} // namespace vitalgrid
