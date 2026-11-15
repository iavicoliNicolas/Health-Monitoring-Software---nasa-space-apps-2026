/* ===========================================================================
   VitalGrid · cliente del cockpit
   PARTES 1 y 2 — estructura, puntaje de salud y signos vitales

   Idea que sostiene todo: la interfaz NO tiene umbrales escritos. Se arma
   leyendo data/metricas.json. Agregar un signo vital = agregar una línea
   de JSON, no tocar el HTML.
   =========================================================================== */

(() => {
'use strict';

const SIN_DATO = '—';
const $ = id => document.getElementById(id);

let config = null;
const tarjetas = new Map();   // campo del payload -> { nodo, def }

/* ===== Utilidades ======================================================== */

// Devuelve null si el back no mandó el número. NUNCA un valor por defecto.
const leer = v => (typeof v === 'number' && !Number.isNaN(v)) ? v : null;

// Baja por el payload siguiendo una ruta tipo
// "telemetry_ridge.G_gravity.heart_rate_bpm". Si falta cualquier eslabón
// devuelve null: un bloque ausente no rompe el render, queda SIN MEDICIÓN.
function porRuta(obj, ruta) {
  if (!ruta) return null;
  return leer(ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj));
}

// Compara sólo si hay dato. `undefined > 110` da false, pero por accidente;
// esto lo vuelve explícito.
function cruza(valor, regla) {
  if (!regla || valor === null) return false;
  return regla.op === '>' ? valor > regla.valor : valor < regla.valor;
}

/* ===== Iconos ============================================================
   Inline y en trazo, para que hereden el color del estado. Sin librería:
   cinco iconos no justifican una dependencia que además rompe el offline.
   ======================================================================== */
const ICONOS = {
  corazon:    '<path d="M12 20s-7-4.6-7-9.5A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.5C19 15.4 12 20 12 20z"/>',
  pulmon:     '<path d="M12 4v8M12 12c0 4-2 8-5 8-1.4 0-2-.9-2-2.2 0-3.5 1.4-7 3.4-9.1M12 12c0 4 2 8 5 8 1.4 0 2-.9 2-2.2 0-3.5-1.4-7-3.4-9.1"/>',
  gota:       '<path d="M12 3.5s5.5 6 5.5 9.7A5.5 5.5 0 0 1 12 19a5.5 5.5 0 0 1-5.5-5.8C6.5 9.5 12 3.5 12 3.5z"/>',
  termometro: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v6"/>',
  presion:    '<circle cx="12" cy="12" r="8.2"/><path d="M12 12l3.6-2.6M12 12v-4"/>'
};

/* ===== Construcción de los signos vitales ================================ */
async function construir() {
  config = await (await fetch('data/metricas.json')).json();

  $('vitales').innerHTML = config.vitales.map(v => `
    <article class="vital sin-dato" data-campo="${v.campo}">
      <span class="ev ev-${v.nivel.toLowerCase()}" title="${v.nivel} · ${v.fuente}">${v.nivel}</span>
      <div class="vital-icono">
        <svg viewBox="0 0 24 24">${ICONOS[v.icono] || ''}</svg>
      </div>
      <div class="vital-cuerpo">
        <div class="vital-nombre">${v.nombre}</div>
        <div class="vital-fila">
          <span class="vital-num">${SIN_DATO}</span>
          <span class="vital-unidad">${v.unidad}</span>
        </div>
        <div class="vital-rango">Reference ${v.rango}</div>
      </div>
    </article>`).join('');

  // Índice campo -> tarjeta, para no buscar en el DOM una vez por segundo
  config.vitales.forEach(v => {
    tarjetas.set(v.campo, { nodo: document.querySelector(`[data-campo="${v.campo}"]`), def: v });
  });

  construirMatriz();
  construirPuntos();
}

/* ===== Matriz RIDGE ======================================================
   Un pilar por peligro. Igual que los signos vitales: el HTML no sabe nada
   de umbrales, todo sale de data/metricas.json.
   ======================================================================== */
function textoUmbral(m) {
  if (m.critico) return `Critical: ${m.critico.op}${m.critico.valor} ${m.unidad}`.trim();
  if (m.alerta)  return `Warning: ${m.alerta.op}${m.alerta.valor} ${m.unidad}`.trim();
  return 'No threshold defined';
}

function construirMatriz() {
  $('leyenda').innerHTML =
    '<span class="leyenda-item leyenda-titulo">Evidence level</span>' +
    Object.entries(config._niveles).map(([k, v]) =>
      `<span class="leyenda-item"><span class="ev ev-${k.toLowerCase()}">${k}</span>${v}</span>`
    ).join('');

  // Los cinco peligros a la vez: nada queda detrás de un clic.
  $('grupos').innerHTML = config.grupos.map(g => `
    <div class="pilar">
      <div class="pilar-cab">
        <span class="pilar-letra">${g.letra}</span>
        <span class="pilar-titulo">${g.titulo}</span>
        <span class="pilar-estado sin-dato" data-estado="${g.letra}">
          <span class="punto"></span><span class="txt">—</span>
        </span>
      </div>
      ${g.metricas.map(m => `
        <div class="celda sin-dato" data-celda="${m.campo}" title="${m.fuente}">
          <span class="ev ev-${m.nivel.toLowerCase()}" title="${m.nivel} · ${m.fuente}">${m.nivel}</span>
          <span class="celda-nombre">${m.nombre}</span>
          <div class="celda-fila">
            <span class="celda-valor">${SIN_DATO}</span>
            <span class="celda-unidad">${m.unidad}</span>
          </div>
          <span class="celda-umbral">${textoUmbral(m)}</span>
          ${m.barra ? '<div class="celda-barra"><span></span></div>' : ''}
        </div>`).join('')}
    </div>`).join('');

  config.grupos.flatMap(g => g.metricas).forEach(m => {
    celdas.set(m.campo, { nodo: document.querySelector(`[data-celda="${m.campo}"]`), def: m });
  });
}

const celdas = new Map();

/* Pinta una celda de la matriz. Misma regla que los vitales:
   null = SIN MEDICIÓN, nunca un valor por defecto. */
function pintarCelda(campo, valor) {
  const e = celdas.get(campo);
  if (!e) return;
  const { nodo, def } = e;

  nodo.classList.remove('alerta', 'critico', 'sin-dato');
  const barra = nodo.querySelector('.celda-barra span');

  if (valor === null || valor === undefined) {
    nodo.classList.add('sin-dato');
    nodo.querySelector('.celda-valor').textContent = SIN_DATO;
    nodo.querySelector('.celda-umbral').textContent = 'NO MEASUREMENT';
    if (barra) barra.style.width = '0%';
    if (def.zona) pintarZona(campo, 'sin-dato');
    return;
  }

  nodo.querySelector('.celda-valor').textContent = valor.toFixed(def.decimales ?? 0);
  nodo.querySelector('.celda-umbral').textContent = textoUmbral(def);
  if (barra) barra.style.width = Math.min(100, (valor / def.barra) * 100) + '%';

  if (cruza(valor, def.critico))     nodo.classList.add('critico');
  else if (cruza(valor, def.alerta)) nodo.classList.add('alerta');

  if (def.zona) {
    pintarZona(campo, cruza(valor, def.critico) ? 'critico'
                    : cruza(valor, def.alerta)  ? 'alerta' : 'ok');
  }
}

/* Resumen de cada peligro, al lado de su letra: el peor estado que tenga
   adentro. Se lee de un vistazo sin recorrer las 14 métricas. */
function actualizarEstadoPilares() {
  config.grupos.forEach(g => {
    let crit = 0, alert = 0, sinDato = 0;
    g.metricas.forEach(m => {
      const v = crudos[m.campo];
      if (v === null || v === undefined) { sinDato++; return; }
      if (cruza(v, m.critico))     crit++;
      else if (cruza(v, m.alerta)) alert++;
    });

    const el = document.querySelector(`[data-estado="${g.letra}"]`);
    if (!el) return;

    const estado = crit ? 'critico' : alert ? 'alerta'
                 : sinDato === g.metricas.length ? 'sin-dato' : 'ok';
    const texto  = crit  ? `${crit} critical`
                 : alert ? `${alert} in warning`
                 : estado === 'sin-dato' ? 'No measurement'
                 : 'Nominal';

    el.className = 'pilar-estado ' + estado;
    el.querySelector('.txt').textContent = texto;
  });
}

// Último valor numérico recibido de cada métrica de la matriz
const crudos = {};


/* ===== Mapa del tripulante ===============================================
   Los puntos salen de las métricas que tienen "zona" en metricas.json.
   Agregar un punto = agregar x/y en el JSON. El HTML no sabe nada de esto.
   ======================================================================== */
function construirPuntos() {
  const conZona = [...config.vitales,
                   ...config.grupos.flatMap(g => g.metricas)].filter(m => m.zona);

  $('puntos').innerHTML = conZona.map(m => `
    <button class="punto-zona sin-dato" data-zona="${m.campo}"
            style="left:${m.zona.x}%;top:${m.zona.y}%"
            title="${m.nombre}" aria-label="${m.nombre}"></button>`).join('');

  document.querySelectorAll('.punto-zona').forEach(b => {
    b.addEventListener('click', () => mostrarDetalle(b.dataset.zona));
  });
  $('detalleCerrar').addEventListener('click', () => {
    $('detalle').classList.add('oculto');
    document.querySelectorAll('.punto-zona').forEach(p => p.classList.remove('activo'));
  });

  zonas = conZona;
}

let zonas = [];

function mostrarDetalle(campo) {
  const def = zonas.find(z => z.campo === campo);
  if (!def) return;

  document.querySelectorAll('.punto-zona').forEach(p =>
    p.classList.toggle('activo', p.dataset.zona === campo));

  const t = tarjetas.get(campo);
  const valor = t ? t.nodo.querySelector('.vital-num').textContent : ultimos[campo];

  $('detalleNombre').textContent = def.nombre;
  $('detalleValor').textContent  = valor ?? SIN_DATO;
  $('detalleUnidad').textContent = def.unidad || '';
  $('detalleFuente').textContent = `${def.nivel} · ${def.fuente}`;
  $('detalle').classList.remove('oculto');
}

// Último valor conocido de las métricas que no son signos vitales
const ultimos = {};

/* Pinta el punto de una zona con el estado de su métrica. */
function pintarZona(campo, estado) {
  const p = document.querySelector(`[data-zona="${campo}"]`);
  if (!p) return;
  p.classList.remove('ok', 'alerta', 'critico', 'sin-dato');
  p.classList.add(estado);
}

/* ===== Pintar un signo vital =============================================
   La única función que decide el color de una tarjeta. Si el diseño cambia,
   se cambia acá y en ningún otro lado.
   ======================================================================== */
function pintarVital(campo, valor, textoForzado) {
  const t = tarjetas.get(campo);
  if (!t) return;
  const { nodo, def } = t;

  nodo.classList.remove('alerta', 'critico', 'sin-dato');

  if (valor === null) {
    nodo.classList.add('sin-dato');
    nodo.querySelector('.vital-num').textContent = SIN_DATO;
    nodo.querySelector('.vital-rango').textContent = 'No measurement';
    if (def.zona) pintarZona(campo, 'sin-dato');
    return;
  }

  nodo.querySelector('.vital-num').textContent =
    textoForzado ?? valor.toFixed(def.decimales ?? 0);
  nodo.querySelector('.vital-rango').textContent = `Reference ${def.rango}`;

  if (cruza(valor, def.critico))     nodo.classList.add('critico');
  else if (cruza(valor, def.alerta)) nodo.classList.add('alerta');

  if (def.zona) {
    pintarZona(campo, cruza(valor, def.critico) ? 'critico'
                    : cruza(valor, def.alerta)  ? 'alerta' : 'ok');
  }
}

/* ===== Puntaje de salud ================================================== */
const CIRC = 327;   // 2 * PI * 52

function pintarPuntaje(valor) {
  const num = $('puntajeNum'), est = $('puntajeEstado'), aro = $('anilloValor');

  if (valor === null) {
    num.textContent = '--';
    num.style.color = 'var(--sin-dato)';
    est.textContent = 'no measurement';
    aro.style.stroke = 'var(--sin-dato)';
    aro.style.strokeDashoffset = CIRC;
    return;
  }

  const color = valor >= 80 ? 'var(--ok)'
              : valor >= 50 ? 'var(--alerta)'
              :               'var(--critico)';
  const texto = valor >= 80 ? 'nominal'
              : valor >= 50 ? 'degraded'
              :               'critical';

  num.textContent = valor;
  num.style.color = color;
  est.textContent = texto;
  aro.style.stroke = color;
  aro.style.strokeDashoffset = CIRC - (valor / 100) * CIRC;
}

/* ===== Dejar TODO en sin medición ========================================
   Al arrancar y cada vez que se corte la telemetría. Dejar los últimos
   números sería mostrarlos como actuales cuando ya no lo son.
   ======================================================================== */
function todoSinMedicion(motivo) {
  tarjetas.forEach((_, campo) => pintarVital(campo, null));
  Object.keys(crudos).forEach(k => crudos[k] = null);
  celdas.forEach((_, campo) => pintarCelda(campo, null));
  if (config) actualizarEstadoPilares();
  ECG.sinDato();
  zonas.forEach(z => pintarZona(z.campo, 'sin-dato'));
  pintarPuntaje(null);
  $('detalle').classList.add('oculto');
  if (motivo) console.warn('[VitalGrid] No measurement:', motivo);
}

/* ===== Aplicar un payload ================================================
   La conexión real entra en la parte 7. Esta función ya queda lista.
   ======================================================================== */
function aplicar(p) {
  // El back manda "health_score" (ver src/models/ridge_payload.hpp).
  pintarPuntaje(leer(p.health_score));

  tarjetas.forEach(({ def }, campo) => {
    const v = porRuta(p, def.ruta);
    if (def.ruta_par) {                  // presión arterial: "135/85"
      const d = porRuta(p, def.ruta_par);
      if (v === null || d === null) pintarVital(campo, null);
      else pintarVital(campo, v, `${v}/${d}`);
    } else {
      pintarVital(campo, v);
    }
  });

  // Matriz RIDGE: se guarda el valor de TODAS las métricas, no sólo las del
  // pilar abierto, para que el resumen de los botones sea completo.
  config.grupos.flatMap(g => g.metricas).forEach(m => {
    const v = porRuta(p, m.ruta);
    crudos[m.campo] = v;
    ultimos[m.campo] = v === null ? null : v.toFixed(m.decimales ?? 0);
    pintarCelda(m.campo, v);
    if (m.zona) {
      pintarZona(m.campo, v === null ? 'sin-dato'
               : cruza(v, m.critico) ? 'critico'
               : cruza(v, m.alerta)  ? 'alerta' : 'ok');
    }
  });

  actualizarEstadoPilares();

  // El trazado sigue la frecuencia medida. Sin dato, línea plana gris.
  ECG.bpm(porRuta(p, 'telemetry_ridge.G_gravity.heart_rate_bpm'));
}

/* ===== Fallback local de Cámara cuando el daemon C++ no está activo ====== */
function desdeCamara(metricas) {
  if (!metricas || wsConectado || !config) return;
  const campos = ['parpadeos_min', 'perclos_pct', 'microsuenos'];
  campos.forEach(campo => {
    if (!(campo in metricas)) return;
    const v = leer(metricas[campo]);
    crudos[campo] = v;
    const def = celdas.get(campo)?.def;
    ultimos[campo] = v === null ? null : v.toFixed(def?.decimales ?? 0);
    pintarCelda(campo, v);
  });
  actualizarEstadoPilares();
}

/* ===== Asistente de Voz Clínico Offline en Inglés (Flight Surgeon AI) ==== */
let voiceAdvisorEnabled = true;
const spokenAlerts = new Set();
let activeTickAlertKeys = new Set();
let somaSpoken = false;

const ENGLISH_CLINICAL_BRIEFINGS = {
  acute_event_mSv:
    'Critical solar radiation alert. Acute radiation exposure detected. Decision guidance: if cabin carbon dioxide is elevated, purge the air scrubber and carry lithium hydroxide canisters before sealing the storm shelter hatch. Protocol: evacuate to the water-shielded storm shelter and administer Filgrastim 300 micrograms subcutaneously.',
  career_accumulated_mSv:
    'Critical radiation alert. Career ionizing radiation limit exceeded. Decision guidance: permanently suspend all extravehicular activities and relocate crew member to high-shielding habitat quarters.',
  blood_pressure:
    'Critical cardiovascular alert. Hypertensive crisis in microgravity detected. Decision guidance: halt all exercise immediately and secure the astronaut in a resting position. Protocol: administer sublingual Captopril 25 milligrams and recheck blood pressure in 10 minutes.',
  heart_rate_bpm:
    'Critical tachycardia alert. Elevated heart rate detected. Decision guidance: check cabin oxygen and carbon dioxide first; if hypoxia or hypercapnia is present, do not administer beta blockers. Otherwise perform a modified Valsalva maneuver, hydrate, and prepare intravenous Metoprolol 5 milligrams if persistent.',
  onsd_mm:
    'Critical neuro-ocular alert. Spaceflight Associated Neuro-ocular Syndrome with elevated intracranial pressure detected. Decision guidance: deploy Lower Body Negative Pressure at minus 35 millimeters of mercury for two hours and administer oral Acetazolamide 250 milligrams.',
  blood_sugar_mg_dl:
    'Metabolic alert on capillary blood glucose. Decision guidance: for hypoglycemia below 65, administer 15 to 20 grams of fast-acting oral glucose gel or intramuscular Glucagon 1 milligram. For hyperglycemia above 140, hydrate with 500 milliliters of water and perform 30 minutes of aerobic cycling.',
  cabin_ppco2_mmHg:
    'Critical environmental alert. Cabin hypercapnia detected. Decision guidance: cycle the Carbon Dioxide Removal Assembly to rapid emergency desorption, don oxygen masks, and activate backup lithium hydroxide canisters.',
  spo2_pct:
    'Critical hypoxemia alert. Blood oxygen saturation below 95 percent. Decision guidance: supply 100 percent oxygen via aviator mask at 6 liters per minute immediately and inspect cabin pressure sensors.',
  body_temperature_c:
    'Critical hyperthermia alert. Space fever detected above 38.5 degrees Celsius. Decision guidance: activate the Liquid Cooling and Ventilation Garment, infuse intravenous Acetaminophen 1000 milligrams, and draw blood for sepsis analysis.',
  respiratory_rate_bpm:
    'Respiratory rate alert detected. Decision guidance: if bradypnea below 10 breaths per minute, secure the airway, initiate 100 percent bag-valve-mask ventilation, and prepare Naloxone 0.4 milligrams. If tachypnea above 24 breaths per minute, verify local airflow for carbon dioxide pockets and guide slow diaphragmatic breathing.',
  sleep_hours_last_24h:
    'Cognitive fatigue warning. Chronic sleep debt detected below 6 hours. Decision guidance: prescribe a mandatory 60-minute restorative rest block under warm circadian lighting and suspend critical robotic operations.',
  hrv_rmssd_drop_pct:
    'Autonomic stress warning. Heart rate variability drop exceeds 25 percent. Decision guidance: initiate 15 minutes of guided resonant breathing biofeedback at 0.1 Hertz and reduce workstation sensory load.',
  blink_rate_per_min:
    'Ocular fatigue warning. Spontaneous blink rate has dropped below 8 blinks per minute. Decision guidance: apply the 20-20-20 visual rest protocol and administer lubricating ophthalmic drops.',
  microsleep_events:
    'Critical drowsiness warning. Involuntary microsleep episode detected by ocular tracker. Decision guidance: relieve the astronaut from active flight controls immediately and initiate mandatory rest.',
  crew_mood_discrepancy:
    'Behavioral discrepancy warning. Objective biometric and ocular sensors indicate fatigue despite an optimal self-report. Decision guidance: mitigate operational overconfidence, perform a 3-minute Psychomotor Vigilance Task, and reschedule critical maneuvers.',
  SENSOR_ARTIFACT_REJECTED:
    'Sensor coherence warning. Physically impossible transducer reading rejected by anti-hallucination guardrail. Decision guidance: do not administer medication; inspect and reattach chest electrodes, pulse oximeter, and thermistor.'
};

function selectEnglishVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  return (
    voices.find(v => v.lang === 'en-US' && /natural|google|microsoft|samantha|aria|guy/i.test(v.name)) ||
    voices.find(v => v.lang === 'en-US') ||
    voices.find(v => /^en(-|_)/i.test(v.lang)) ||
    null
  );
}

function speak(texto) {
  if (!voiceAdvisorEnabled || !texto || !('speechSynthesis' in window)) return false;
  try {
    const utter = new SpeechSynthesisUtterance(String(texto));
    utter.lang = 'en-US';
    utter.rate = 0.95;
    utter.pitch = 1.0;
    const v = selectEnglishVoice();
    if (v) utter.voice = v;
    window.speechSynthesis.speak(utter);
    return true;
  } catch (err) {
    console.warn('[VitalGrid] speechSynthesis error:', err);
    return false;
  }
}

function buildAlertSpeechEnglish(alert) {
  if (!alert) return '';
  const metric = alert.trigger_metric || 'unknown_metric';
  if (ENGLISH_CLINICAL_BRIEFINGS[metric]) {
    return `Flight Surgeon AI ${alert.status || 'ALERT'}. ${ENGLISH_CLINICAL_BRIEFINGS[metric]}`;
  }
  return `Flight Surgeon AI ${alert.status || 'ALERT'} on ${metric}. Diagnosis: ${alert.diagnosis || ''}. Tactical action: ${alert.tactical_action || ''}`;
}

function configurarBotonVoiceAdvisor() {
  const btn = $('btnVoiceAdvisor');
  const lbl = $('etiquetaVoiceAdvisor');
  if (!btn || !lbl) return;

  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  btn.addEventListener('click', () => {
    voiceAdvisorEnabled = !voiceAdvisorEnabled;
    btn.classList.toggle('conectado', voiceAdvisorEnabled);
    btn.classList.toggle('desconectado', !voiceAdvisorEnabled);
    lbl.textContent = voiceAdvisorEnabled ? '🔊 Voice Advisor: ON' : '🔇 Voice Advisor: OFF';
    if (!voiceAdvisorEnabled && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    } else if (voiceAdvisorEnabled) {
      speak('Flight Surgeon voice advisor online.');
    }
  });
}

window.addEventListener('vitalgrid:alert', (ev) => {
  const alert = ev.detail;
  if (!alert || (alert.status !== 'CRITICAL' && alert.status !== 'WARNING')) return;
  const key = `${alert.status}:${alert.trigger_metric}`;
  activeTickAlertKeys.add(key);
  if (!spokenAlerts.has(key)) {
    spokenAlerts.add(key);
    speak(buildAlertSpeechEnglish(alert));
  }
});

window.addEventListener('vitalgrid:soma', () => {
  if (!somaSpoken) {
    somaSpoken = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speak(
      'Emergency alert. SOMA Watchdog activated. Crew vital signs or cabin survival compromised. Initiating scientific preservation protocol, biological cryostallization container lock, and encrypted DSOC deep-space optical laser transmission to Earth.'
    );
  }
});

/* ===== Reloj de misión (MET) ============================================= */
let seg = 42 * 86400 + 18 * 3600 + 27 * 60;   // lo pisa el perfil si trae día
const pad = (n, l = 2) => String(n).padStart(l, '0');

setInterval(() => {
  seg++;
  $('reloj').textContent =
    `MET +${pad(Math.floor(seg / 86400), 3)}:${pad(Math.floor(seg % 86400 / 3600))}` +
    `:${pad(Math.floor(seg % 3600 / 60))}:${pad(seg % 60)}`;
}, 1000);

/* ===== Perfil del tripulante =============================================
   Lo carga la portada en localStorage. Si alguien entra directo al cockpit
   sin pasar por ahí, no se inventa un nombre: queda vacío.
   ======================================================================== */
function cargarPerfil() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem('zeus.profile') || 'null'); } catch {}
  if (!p || !p.name) return;

  const iniciales = p.name.trim().split(/\s+/).slice(0, 2)
    .map(x => x[0]?.toUpperCase() ?? '').join('');

  const crew = $('rielCrew');
  if (crew) { crew.textContent = iniciales || '—'; crew.title = p.name; }

  const partes = [p.name];
  if (p.age) partes.push(p.age + ' y/o');
  if (p.sex) partes.push(p.sex === 'F' ? 'Female' : 'Male');
  if (p.day) partes.push('Mission day ' + p.day);

  const linea = $('lineaTripulante');
  if (linea) linea.textContent = partes.join(' · ');

  // El reloj arranca en el día que cargó el tripulante
  if (p.day) seg = (+p.day) * 86400 + 18 * 3600 + 27 * 60;
}

/* ===== Vista inicial =====================================================
   La portada manda ?view=telemetry|camera|analysis. Cada una deja al usuario
   parado donde eligió, con el mismo destello que usa el riel.
   ======================================================================== */
function abrirVistaPedida() {
  const vista = new URLSearchParams(location.search).get('view');
  const destino = { camera: 'panelCamara', analysis: 'panelAnalisis' }[vista];
  if (!destino) return;

  const nodo = $(destino);
  if (!nodo) return;

  // Marcar el botón del riel que corresponde
  document.querySelectorAll('.riel-btn').forEach(b =>
    b.classList.toggle('activo', b.dataset.ir === destino));

  // Esperar a que termine de pintarse antes de desplazarse
  requestAnimationFrame(() => setTimeout(() => {
    nodo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nodo.classList.add('resaltado');
    setTimeout(() => nodo.classList.remove('resaltado'), 1100);
  }, 350));
}

/* ===== Riel ============================================================== */
document.querySelectorAll('.riel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.riel-btn').forEach(b => b.classList.remove('activo'));
    btn.classList.add('activo');

    const destino = btn.dataset.ir;
    if (destino === 'inicio') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

    const nodo = $(destino);
    if (!nodo) return;
    nodo.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Un destello para que se vea adónde fuiste
    nodo.classList.add('resaltado');
    setTimeout(() => nodo.classList.remove('resaltado'), 1100);
  });
});

/* ===== Bus de Eventos Global y WebSocket Único =========================== */
const WS_URL = 'ws://127.0.0.1:9002';
let wsActiva = null;
let wsConectado = false;
let timerLimpiezaAlertas = null;

function setEstadoConexion(conectado) {
  wsConectado = conectado;
  const pastilla = $('pastillaConexion');
  const etiqueta = $('etiquetaConexion');
  if (pastilla && etiqueta) {
    pastilla.classList.toggle('conectado', conectado);
    pastilla.classList.toggle('desconectado', !conectado);
    etiqueta.textContent = conectado ? 'Online' : 'Disconnected';
  }
  window.dispatchEvent(new CustomEvent('vitalgrid:connection', {
    detail: { connected: conectado }
  }));
}

function enviar(payload) {
  if (!wsActiva || wsActiva.readyState !== WebSocket.OPEN) return false;
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  if (msg === 'RESET_NOMINAL' || msg === 'RESET_SURVIVAL') {
    spokenAlerts.clear();
    somaSpoken = false;
  }
  wsActiva.send(msg);
  return true;
}

function conectarTelemetry() {
  try {
    wsActiva = new WebSocket(WS_URL);
  } catch {
    setEstadoConexion(false);
    setTimeout(conectarTelemetry, 2000);
    return;
  }

  wsActiva.onopen = () => {
    setEstadoConexion(true);
  };

  wsActiva.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (!data) return;

      if (data.telemetry_ridge) {
        activeTickAlertKeys = new Set();
        aplicar(data);
        window.dispatchEvent(new CustomEvent('vitalgrid:telemetry', { detail: data }));

        if (data.survival_status && data.survival_status.vital_signs_present &&
            !data.survival_status.sos_panic_button_active &&
            data.survival_status.cabin_pressure_nominal) {
          somaSpoken = false;
        }

        // Al terminar el lote de alertas del tick (250 ms después), liberar del Set
        // las alertas que ya volvieron a rango nominal para que puedan volver a anunciarse si se repiten.
        clearTimeout(timerLimpiezaAlertas);
        timerLimpiezaAlertas = setTimeout(() => {
          for (const k of Array.from(spokenAlerts)) {
            if (!activeTickAlertKeys.has(k)) spokenAlerts.delete(k);
          }
        }, 250);
      } else if (data.type === 'CLINICAL_ALERT') {
        window.dispatchEvent(new CustomEvent('vitalgrid:alert', { detail: data }));
      } else if (data.type === 'SOMA_DSOC_EVENT') {
        window.dispatchEvent(new CustomEvent('vitalgrid:soma', { detail: data }));
      }
    } catch (err) {
      console.warn('[VitalGrid] Invalid WS message:', err);
    }
  };

  wsActiva.onclose = () => {
    wsActiva = null;
    setEstadoConexion(false);
    todoSinMedicion('daemon connection closed');
    setTimeout(conectarTelemetry, 2000);
  };

  wsActiva.onerror = () => {
    if (wsActiva) wsActiva.close();
  };
}

window.VitalGrid = { aplicar, todoSinMedicion, enviar, desdeCamara, speak };

/* ===== Arranque ========================================================== */
cargarPerfil();
configurarBotonVoiceAdvisor();

construir()
  .then(() => {
    todoSinMedicion('no telemetry received yet');
    abrirVistaPedida();
    conectarTelemetry();
  })
  .catch(err => {
    console.error('[VitalGrid] No pude leer data/metricas.json', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<p style="padding:14px;color:#e0455b">Could not read <code>data/metricas.json</code>. ' +
      'Open the page through a local server, not by double-clicking it.</p>');
  });

})();
