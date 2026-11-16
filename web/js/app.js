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
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

let config = null;
const tarjetas = new Map();   // campo del payload -> { nodo, def }
let zonaSeleccionada = null;

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
  if (m.critico && m.alerta) {
    return `Crit ${m.critico.op}${m.critico.valor} · Warn ${m.alerta.op}${m.alerta.valor} ${m.unidad}`.trim();
  }
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
    zonaSeleccionada = null;
    $('detalle').classList.add('oculto');
    document.querySelectorAll('.punto-zona').forEach(p => p.classList.remove('activo'));
  });

  zonas = conZona;
}

let zonas = [];
const crudosZonas = {};

function estadoMetrica(def, valorNum) {
  if (valorNum === null || valorNum === undefined || Number.isNaN(valorNum)) return 'sin-dato';
  if (cruza(valorNum, def.critico)) return 'critico';
  if (cruza(valorNum, def.alerta))  return 'alerta';
  return 'ok';
}

function mostrarDetalle(campo) {
  const def = zonas.find(z => z.campo === campo);
  if (!def) return;

  zonaSeleccionada = campo;
  document.querySelectorAll('.punto-zona').forEach(p =>
    p.classList.toggle('activo', p.dataset.zona === campo));

  const t = tarjetas.get(campo);
  const valor = t ? t.nodo.querySelector('.vital-num').textContent : ultimos[campo];
  const estado = estadoMetrica(def, crudosZonas[campo]);
  const estadoTxt = estado === 'critico' ? 'Critical'
                  : estado === 'alerta'  ? 'Warning'
                  : estado === 'ok'      ? 'Nominal'
                  : 'No measurement';

  $('detalleNombre').textContent = def.organo ? `${def.nombre} · ${def.organo}` : def.nombre;
  const estEl = $('detalleEstado');
  if (estEl) {
    estEl.className = 'detalle-estado ' + estado;
    estEl.textContent = estadoTxt;
  }
  $('detalleValor').textContent  = valor ?? SIN_DATO;
  $('detalleUnidad').textContent = def.unidad || '';
  const fnEl = $('detalleFuncion');
  if (fnEl) fnEl.textContent = def.funcion ? `Organ function: ${def.funcion}` : '';
  const pqEl = $('detallePorque');
  if (pqEl) pqEl.textContent = def.por_que ? `Why measured in spaceflight: ${def.por_que}` : '';
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
  Object.keys(crudosZonas).forEach(k => crudosZonas[k] = null);
  zonaSeleccionada = null;
  celdas.forEach((_, campo) => pintarCelda(campo, null));
  if (config) actualizarEstadoPilares();
  ECG.sinDato();
  zonas.forEach(z => pintarZona(z.campo, 'sin-dato'));
  pintarPuntaje(null);
  $('detalle').classList.add('oculto');
  limpiarPanelDirectivas('No active clinical alerts. Waiting for live stream…', true);
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
    crudosZonas[campo] = v;
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
    crudosZonas[m.campo] = v;
    ultimos[m.campo] = v === null ? null : v.toFixed(m.decimales ?? 0);
    pintarCelda(m.campo, v);
    if (m.zona) {
      pintarZona(m.campo, estadoMetrica(m, v));
    }
  });

  actualizarEstadoPilares();

  if (zonaSeleccionada && $('detalle') && !$('detalle').classList.contains('oculto')) {
    mostrarDetalle(zonaSeleccionada);
  }

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

/* ===== Catálogo Clínico en Inglés, Alertas Visuales, SOMA y Voz (Flight Surgeon AI) ==== */
let voiceAdvisorEnabled = true;
const spokenAlerts = new Set();
let activeTickAlertKeys = new Set();
let currentTickAlerts = [];
let somaSpoken = false;

const ENGLISH_CLINICAL_CATALOG = {
  SENSOR_ARTIFACT_REJECTED: {
    diagnosis: 'Sensor Coherence Guardrail — Physically Impossible Reading Rejected',
    tactical_action: 'Anti-hallucination guardrail active: automated diagnoses suppressed for this cycle to avoid iatrogenic treatment. Inspect biomedical sensor bus and re-seat chest electrodes, finger oximeter, and thermistor.',
    astronaut_explanation: 'A sensor reported a physically impossible reading (such as a loose electrode or poor contact). Do not take any medication; check that your chest patch, pulse oximeter, and thermometer are properly seated.',
    speech: 'Sensor coherence warning. Physically impossible transducer reading rejected by anti-hallucination guardrail. Do not administer medication; inspect and reattach chest electrodes, pulse oximeter, and thermistor.'
  },
  acute_event_mSv_conflict: {
    diagnosis: 'Multi-Pillar Conflict [R vs E]: Acute Solar Particle Event (SPE) + Toxic Cabin CO2',
    tactical_action: 'Conflict resolution: DO NOT seal the storm shelter hatch before purging cabin air. Run rapid CDRA CO2 scrubbing and carry active lithium hydroxide (LiOH) canisters inside the water-shielded storm shelter before sealing the hatch. Initiate approved acute radiation medical-kit countermeasures per ISS Flight Surgeon protocol.',
    astronaut_explanation: 'A solar storm requires moving into the shielded core, but cabin CO2 is elevated. Purge the air with the CDRA scrubber and bring chemical LiOH canisters inside before sealing the shelter hatch.',
    speech: 'Critical multi-pillar radiation and CO2 alert. Do not seal the storm shelter hatch without purging cabin air first. Run rapid CDRA scrubbing, carry lithium hydroxide canisters inside the shelter, evacuate immediately, and follow the ISS radiation medical-kit protocol.'
  },
  acute_event_mSv: {
    diagnosis: 'Acute Radiation Exposure — Solar Particle Event (SPE)',
    tactical_action: 'Evacuate immediately to the water-shielded storm shelter core. Initiate approved acute radiation medical-kit countermeasures per ISS Flight Surgeon checklist and power down non-essential forward avionics.',
    astronaut_explanation: 'High-energy solar particles capable of damaging bone marrow have arrived. Move immediately to the water-wall shielded shelter and carry your personal dosimeter with you.',
    speech: 'Critical solar radiation alert. Acute particle event detected. Evacuate immediately to the water-shielded storm shelter, carry your dosimeter, and initiate the ISS radiation medical-kit countermeasure protocol.'
  },
  career_accumulated_mSv: {
    diagnosis: 'Career Ionizing Radiation Limit Exceeded (> 600 mSv NASA-STD-3001)',
    tactical_action: 'Permanently suspend all extravehicular activities (EVA). Relocate crew member to highest-shielding central habitat quarters and initiate scheduled cytogenetic monitoring.',
    astronaut_explanation: 'You have exceeded the NASA-STD-3001 career cumulative radiation limit. Suspend all spacewalks and remain inside the most heavily shielded habitat modules.',
    speech: 'Critical radiation alert. Career ionizing radiation limit exceeded. Permanently suspend all extravehicular activities and relocate crew member to high-shielding habitat quarters.'
  },
  blood_pressure: {
    diagnosis: 'Microgravity Hypertensive Crisis — Cerebrovascular Risk',
    tactical_action: 'Halt all aerobic and resistive exercise immediately and secure crew member in a resting position. Initiate approved antihypertensive medical-kit countermeasure per ISS checklist and recheck blood pressure every 10 minutes.',
    astronaut_explanation: 'Your blood pressure has risen to levels that stress cerebral blood vessels. Stop exercising, rest calmly with your arm supported at heart level, and remeasure with the cuff in 10 minutes.',
    speech: 'Critical cardiovascular alert. Hypertensive crisis in microgravity detected. Halt all exercise immediately, rest with arm at heart level, follow the ISS antihypertensive medical-kit protocol, and recheck blood pressure in 10 minutes.'
  },
  heart_rate_bpm_corr: {
    diagnosis: 'Reflex Sinus Tachycardia Secondary to Cabin Hypoxia or Hypercapnia [G + E]',
    tactical_action: 'Critical contraindication: PROHIBITED to administer beta-blockers, as tachycardia is compensating for low cabin O2 or high CO2. Prioritize immediate 100% supplemental O2 and ECLSS/CDRA atmospheric scrubbing.',
    astronaut_explanation: 'Your heart is beating rapidly to compensate for low oxygen or excess CO2 in cabin air. Do not take rate-lowering medication; put on the oxygen mask and verify cabin air flow.',
    speech: 'Critical tachycardia alert combined with hypoxia or hypercapnia. Do not administer beta blockers. Tachycardia is compensatory. Prioritize 100 percent supplemental oxygen and ECLSS air scrubbing immediately.'
  },
  heart_rate_bpm: {
    diagnosis: 'Sustained Tachycardia / Autonomic Dysregulation in Microgravity',
    tactical_action: 'Confirm cabin O2 and CO2 are nominal first. Perform modified Valsalva vagal maneuvers, hydrate, check electrolyte telemetry, and follow the approved ISS arrhythmia medical-kit checklist if persistent.',
    astronaut_explanation: 'Your resting heart rate is elevated and can strain cardiac endurance in microgravity. Brace yourself safely, drink water, exhale forcefully against a closed mouthpiece for 15 seconds, and recheck your pulse.',
    speech: 'Critical tachycardia alert. Elevated resting heart rate detected. Verify cabin oxygen and carbon dioxide first, hydrate, perform a modified Valsalva maneuver, and follow the ISS arrhythmia medical-kit protocol if persistent.'
  },
  onsd_mm: {
    diagnosis: 'Spaceflight Associated Neuro-Ocular Syndrome (SANS) — Elevated Intracranial Pressure',
    tactical_action: 'Deploy Lower Body Negative Pressure (LBNP) countermeasures per Flight Surgeon protocol to redistribute cephalad fluid, apply approved ISS SANS medical-kit checklist, and schedule high-resolution fundoscopy.',
    astronaut_explanation: 'Without gravity, body fluid shifts toward your head and puts pressure on the optic nerve, risking vision changes. Apply ultrasound gel over the closed eyelid to confirm diameter and enter the LBNP chamber.',
    speech: 'Critical neuro-ocular alert. Spaceflight Associated Neuro-ocular Syndrome with elevated intracranial pressure detected. Deploy Lower Body Negative Pressure, follow the ISS SANS medical-kit checklist, and schedule retinal imaging.'
  },
  blood_sugar_mg_dl_hypo: {
    diagnosis: 'Acute Hypoglycemia (< 65 mg/dL) — Neuroglycopenic Risk',
    tactical_action: 'Administer fast-acting oral glucose gel immediately; if consciousness is impaired, follow the approved emergency ISS hypoglycemia kit checklist. Suspend critical tasks and retest capillary glucose in 15 minutes.',
    astronaut_explanation: 'Your blood sugar dropped too low and your brain needs immediate energy. Consume a glucose gel packet from the medical kit, rest, and retest your fingerstick glucose in 15 minutes.',
    speech: 'Critical hypoglycemia alert. Blood glucose below 65 milligrams per deciliter. Administer fast-acting oral glucose gel immediately or use the emergency ISS hypoglycemia medical-kit checklist if impaired, suspend critical tasks, and recheck in 15 minutes.'
  },
  blood_sugar_mg_dl_hyper: {
    diagnosis: 'Hyperglycemia (> 140 mg/dL) — Microgravity Insulin Resistance',
    tactical_action: 'Restrict simple carbohydrates in current intake, encourage oral water hydration, and schedule aerobic cycle-ergometer exercise if clinically cleared. Recheck capillary glucose in 2 hours.',
    astronaut_explanation: 'In microgravity, muscles absorb less glucose and spaceflight stress raises blood sugar. Drink water, avoid simple sugars today, and complete your aerobic exercise routine to improve insulin sensitivity.',
    speech: 'Metabolic warning. Elevated capillary blood glucose above 140. Hydrate with water, avoid simple carbohydrates, perform scheduled aerobic exercise if cleared, and recheck glucose in two hours.'
  },
  cabin_ppco2_mmHg: {
    diagnosis: 'Cabin Atmospheric Hypercapnia (ppCO2 > 3.0 mmHg) — ECLSS Degradation',
    tactical_action: 'Cycle Carbon Dioxide Removal Assembly (CDRA) beds to rapid emergency desorption, don supplemental O2 masks if symptomatic, and activate backup lithium hydroxide (LiOH) canisters.',
    astronaut_explanation: 'Carbon dioxide is building up in spacecraft air and can cause headaches and confusion. Verify compartment circulation fans, engage the CDRA scrubber, and keep your oxygen mask ready.',
    speech: 'Critical environmental alert. Cabin hypercapnia detected above 3 millimeters of mercury. Cycle the Carbon Dioxide Removal Assembly to rapid emergency desorption, check local ventilation, and activate backup lithium hydroxide canisters.'
  },
  spo2_pct: {
    diagnosis: 'Acute Hypoxemia (SpO2 < 95%) — Oxygenation Deficit',
    tactical_action: 'Supply 100% supplemental O2 via aviator mask immediately and inspect suit/cabin oxygen partial pressure and total pressure sensors. Auscultate lung bases for atelectasis.',
    astronaut_explanation: 'Your blood is carrying less oxygen than required for brain and organ function. Warm your hand, wipe the fingertip oximeter sensor to confirm the reading, and breathe supplemental oxygen.',
    speech: 'Critical hypoxemia alert. Blood oxygen saturation below 95 percent. Supply 100 percent supplemental oxygen via mask immediately and inspect cabin oxygen and pressure sensors.'
  },
  body_temperature_c: {
    diagnosis: 'Space Fever / Hyperthermia (> 38.5 °C) — Thermal Stress or Sepsis Risk',
    tactical_action: 'Connect Liquid Cooling and Ventilation Garment (LCVG) active cooling loop, initiate approved ISS antipyretic medical-kit protocol, and draw bioanalyzer cartridge samples for infection/sepsis panel.',
    astronaut_explanation: 'In space, body heat does not dissipate through natural convection, and fever signals infection or severe thermal stress. Confirm with a tympanic thermometer, hydrate, and activate the liquid cooling garment.',
    speech: 'Critical hyperthermia alert. Body temperature exceeds 38.5 degrees Celsius. Activate the Liquid Cooling and Ventilation Garment, initiate the ISS antipyretic medical-kit protocol, and run a bioanalyzer sepsis check.'
  },
  respiratory_rate_bpm_brady: {
    diagnosis: 'Severe Bradypnea (< 10 breaths/min) — Central Respiratory Depression',
    tactical_action: 'Secure airway patency immediately, initiate 100% O2 bag-valve-mask ventilatory support, monitor continuous capnography, and prepare the ISS respiratory-depression reversal kit checklist.',
    astronaut_explanation: 'Your breathing rate dropped to a dangerous level and your lungs are not renewing enough air. Put on a continuous-flow oxygen mask immediately and alert your crewmate on watch.',
    speech: 'Critical respiratory alert. Severe bradypnea below 10 breaths per minute. Secure the airway, initiate 100 percent bag-valve-mask ventilation, monitor capnography, and follow the ISS reversal-kit checklist.'
  },
  respiratory_rate_bpm_tachy: {
    diagnosis: 'Compensatory Tachypnea (> 24 breaths/min) — Ventilatory Stress',
    tactical_action: 'Inspect local partial pressure CO2 and helmet/compartment fan airflow for CO2 pockets. Guide controlled diaphragmatic breathing (12–16 breaths/min), hydrate, and recheck SpO2 and lung sounds.',
    astronaut_explanation: 'You are breathing too fast at rest, likely from stagnant CO2 pockets or acute stress. Move toward a cabin ventilation outlet and take slow, deep diaphragmatic breaths.',
    speech: 'Respiratory warning. Tachypnea above 24 breaths per minute. Check local airflow for carbon dioxide pockets, hydrate, and guide slow diaphragmatic breathing.'
  },
  sleep_hours_last_24h: {
    diagnosis: 'Chronic Sleep Debt (< 6.0 h) — Cognitive Fatigue Risk',
    tactical_action: 'Prescribe a mandatory restorative rest period in darkened quarters under warm circadian lighting without 480 nm blue spectrum. Suspend critical robotic operations.',
    astronaut_explanation: 'You slept less than 6 hours and without a natural solar cycle your biological clock drifts quickly. Schedule a rest block under warm lighting and hold precision maneuvers until recovered.',
    speech: 'Cognitive fatigue warning. Chronic sleep debt detected below 6 hours. Schedule a mandatory restorative rest block under warm circadian lighting and suspend critical robotic operations.'
  },
  hrv_rmssd_drop_pct: {
    diagnosis: 'Autonomic Sympathetic Dominance — High Allostatic Stress (HRV drop > 25%)',
    tactical_action: 'Initiate 15 minutes of guided resonant breathing biofeedback at 0.1 Hz, reduce workstation sensory load, and evaluate stress/sleep recovery biomarkers.',
    astronaut_explanation: 'Heart rate variability fell sharply, signaling sustained nervous-system stress from confinement or workload. Spend 10 minutes pacing slow 5-second inhales and 5-second exhales.',
    speech: 'Autonomic stress warning. Heart rate variability drop exceeds 25 percent. Initiate guided resonant breathing biofeedback at 0.1 Hertz and reduce workstation sensory load.'
  },
  blink_rate_per_min: {
    diagnosis: 'Ocular Fatigue & Hypovigilance — Low Blink Rate (< 8/min)',
    tactical_action: 'Activate 20-20-20 visual rest protocol, apply lubricating ophthalmic drops from the medical kit, suspend precision robotic display tasks, and assess neurocognitive fatigue.',
    astronaut_explanation: 'The eye camera detected very few blinks, indicating fixed staring from fatigue and corneal dryness. Look away from screens for 20 seconds and apply artificial tears.',
    speech: 'Ocular fatigue warning. Spontaneous blink rate has dropped below 8 blinks per minute. Apply the 20-20-20 visual rest protocol and lubricating ophthalmic drops.'
  },
  microsleep_events: {
    diagnosis: 'Involuntary Microsleep Event Detected (Eyelid Closure >= 500 ms)',
    tactical_action: 'Emit immediate cabin auditory attention chime, notify mission commander, and immediately relieve the astronaut from active flight or robotic controls.',
    astronaut_explanation: 'Your eyelids stayed closed involuntarily for over half a second on camera. Your brain is briefly shutting down from exhaustion; hand over active controls and rest immediately.',
    speech: 'Critical drowsiness warning. Involuntary microsleep episode detected by ocular tracker. Relieve the astronaut from active flight controls immediately and initiate mandatory rest.'
  },
  crew_mood_discrepancy: {
    diagnosis: 'Behavioral Self-Report Discrepancy — Masked Fatigue vs. OPTIMAL Mood',
    tactical_action: 'Mitigate operational overconfidence bias: objective biometric sensors (MediaPipe eye tracker / HRV and sleep) contradict the OPTIMAL self-report. Run a 3-minute Psychomotor Vigilance Task (PVT) and reschedule critical maneuvers.',
    astronaut_explanation: 'You reported feeling OPTIMAL, yet your eyes and cardiac sensors show clear signs of accumulated fatigue. In spaceflight it is common to underestimate fatigue; take a preventive break and test reaction time.',
    speech: 'Behavioral discrepancy warning. Objective biometric and ocular sensors indicate fatigue despite an optimal self-report. Mitigate operational overconfidence, perform a 3-minute Psychomotor Vigilance Task, and reschedule critical maneuvers.'
  }
};

function resolveClinicalEntry(alert) {
  if (!alert) return null;
  const metric = alert.trigger_metric || '';
  const diag = String(alert.diagnosis || '');
  const limit = String(alert.threshold_limit || '');

  if (metric === 'acute_event_mSv') {
    return (diag.includes('CONFLICTO') || limit.includes('CONFLICTO'))
      ? ENGLISH_CLINICAL_CATALOG.acute_event_mSv_conflict
      : ENGLISH_CLINICAL_CATALOG.acute_event_mSv;
  }
  if (metric === 'heart_rate_bpm') {
    return (diag.includes('Hipoxia/Hipercapnia') || limit.includes('CORRELACIÓN'))
      ? ENGLISH_CLINICAL_CATALOG.heart_rate_bpm_corr
      : ENGLISH_CLINICAL_CATALOG.heart_rate_bpm;
  }
  if (metric === 'blood_sugar_mg_dl') {
    return (alert.status === 'CRITICAL' || limit.includes('<'))
      ? ENGLISH_CLINICAL_CATALOG.blood_sugar_mg_dl_hypo
      : ENGLISH_CLINICAL_CATALOG.blood_sugar_mg_dl_hyper;
  }
  if (metric === 'respiratory_rate_bpm') {
    return (alert.status === 'CRITICAL' || limit.includes('<'))
      ? ENGLISH_CLINICAL_CATALOG.respiratory_rate_bpm_brady
      : ENGLISH_CLINICAL_CATALOG.respiratory_rate_bpm_tachy;
  }
  return ENGLISH_CLINICAL_CATALOG[metric] || null;
}

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
  const entry = resolveClinicalEntry(alert);
  if (entry && entry.speech) {
    return `Flight Surgeon AI ${alert.status || 'ALERT'}. ${entry.speech}`;
  }
  const metric = alert.trigger_metric || 'unknown_metric';
  return `Flight Surgeon AI ${alert.status || 'ALERT'} on ${metric}. Diagnosis: ${alert.diagnosis || ''}. Tactical action: ${alert.tactical_action || ''}`;
}

let dsocTimers = [];
let demoTimers = [];
let demoCorriendo = false;
let somaActivoEnUi = false;

function limpiarDsocTimers() {
  dsocTimers.forEach(t => clearTimeout(t));
  dsocTimers = [];
}

function setEtapaDemo(texto, clase) {
  const el = $('demoEtapa');
  if (!el) return;
  el.textContent = texto;
  el.className = 'sim-etapa' + (clase ? ' ' + clase : '');
}

function ocultarSomaBanner(forzar) {
  if (!forzar && !somaActivoEnUi) return;
  somaActivoEnUi = false;
  limpiarDsocTimers();
  const box = $('dsocBox');
  const bar = $('dsocProgreso');
  const meta = $('dsocMeta');
  if (box) box.classList.remove('activo', 'transmitido');
  if (bar) bar.style.width = '0%';
  if (meta) meta.textContent = 'Zstd + AES-256-GCM · Keys 1-3';
  if (!demoCorriendo) setEtapaDemo('Standby', '');
}

function renderizarSoma(soma) {
  const box = $('dsocBox');
  const bar = $('dsocProgreso');
  const meta = $('dsocMeta');
  if (!box || !bar || !meta || !soma) return;

  somaActivoEnUi = true;
  limpiarDsocTimers();
  box.classList.remove('transmitido');
  box.classList.add('activo');
  bar.style.width = '18%';
  meta.textContent = `Freeze ${soma.historical_samples_count} samples · ${soma.compression_algorithm || 'Zstd'} (${soma.compression_ratio}x)`;
  setEtapaDemo('SOMA Lock', 'critico');

  dsocTimers.push(setTimeout(() => {
    bar.style.width = '58%';
    const tagShort = String(soma.auth_tag_hex || '').slice(0, 10);
    meta.textContent = `AES-256-GCM ${soma.compressed_payload_bytes}B [${tagShort}] → Laser`;
  }, 2200));

  dsocTimers.push(setTimeout(() => {
    bar.style.width = '88%';
    meta.textContent = `Uplink 267 Mbps → DSN Goldstone (${soma.light_delay_minutes}m delay)`;
  }, 4500));

  dsocTimers.push(setTimeout(() => {
    box.classList.remove('activo');
    box.classList.add('transmitido');
    bar.style.width = '100%';
    meta.textContent = `TRANSMITTED · ${soma.compressed_payload_bytes}B → DSN Goldstone (${soma.light_delay_minutes}m)`;
    setEtapaDemo('DSOC Sent', 'ok');
  }, 7000));
}

function limpiarPanelDirectivas(mensaje, esconderSoma) {
  const estadoEl = $('directivasEstado');
  const resumenEl = $('directivasResumen');
  const listaEl = $('listaAlertas');
  if (estadoEl) estadoEl.className = 'directivas-estado sin-dato';
  if (resumenEl) resumenEl.textContent = 'Waiting for telemetry…';
  if (listaEl) {
    listaEl.innerHTML = `<div class="alerta-vacia">${escHtml(mensaje || 'No active clinical alerts. Waiting for live stream…')}</div>`;
  }
  if (esconderSoma) ocultarSomaBanner(true);
}

function renderizarAlertas(alertas) {
  const estadoEl = $('directivasEstado');
  const resumenEl = $('directivasResumen');
  const listaEl = $('listaAlertas');
  if (!estadoEl || !resumenEl || !listaEl) return;

  if (!wsConectado) {
    limpiarPanelDirectivas('Daemon disconnected. Waiting for telemetry stream…', true);
    return;
  }

  if (!alertas || alertas.length === 0) {
    estadoEl.className = 'directivas-estado ok';
    resumenEl.textContent = 'Nominal · All parameters within limits';
    listaEl.innerHTML = '<div class="alerta-vacia ok">All physiological and environmental parameters are within NASA nominal limits.</div>';
    return;
  }

  const ordenadas = [...alertas].sort((a, b) =>
    (a.status === 'CRITICAL' ? 0 : 1) - (b.status === 'CRITICAL' ? 0 : 1)
  );
  const crits = ordenadas.filter(a => a.status === 'CRITICAL').length;
  const warns = ordenadas.length - crits;

  estadoEl.className = 'directivas-estado ' + (crits > 0 ? 'critico' : 'alerta');
  const partesResumen = [];
  if (crits > 0) partesResumen.push(`${crits} critical`);
  if (warns > 0) partesResumen.push(`${warns} warning`);
  resumenEl.textContent = partesResumen.join(' · ') || 'Alert active';

  listaEl.innerHTML = ordenadas.map(a => {
    const cls = a.status === 'CRITICAL' ? 'critico' : 'alerta';
    const entry = resolveClinicalEntry(a);
    const diag = entry ? entry.diagnosis : (a.diagnosis || '');
    const action = entry ? entry.tactical_action : (a.tactical_action || '');
    const expl = entry ? entry.astronaut_explanation : (a.astronaut_explanation || '');
    const osdr = a.osdr_reference ? `<span class="alerta-osdr">NASA OSDR · ${escHtml(a.osdr_reference)}</span>` : '';
    return `
      <article class="alerta-item ${cls}">
        <div class="alerta-cab">
          <span class="alerta-badge">${escHtml(a.status || 'ALERT')}</span>
          <span class="alerta-metrica">${escHtml(a.trigger_metric)}: <b>${escHtml(a.trigger_value)}</b> (limit ${escHtml(a.threshold_limit)})</span>
          ${osdr}
        </div>
        <div class="alerta-titulo">${escHtml(diag)}</div>
        <div class="alerta-accion"><b>Action:</b> ${escHtml(action)}</div>
        ${expl ? `<div class="alerta-explicacion"><b>Crew explanation:</b> ${escHtml(expl)}</div>` : ''}
      </article>`;
  }).join('');
}

function detenerDemo(resetearEstado) {
  demoTimers.forEach(t => clearTimeout(t));
  demoTimers = [];
  demoCorriendo = false;
  const btn = $('btnAutoDemo');
  if (btn) {
    btn.classList.remove('corriendo');
    btn.textContent = '▶ Auto-Demo (1m50s)';
  }
  if (resetearEstado) {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    enviar('RESET_NOMINAL');
    ocultarSomaBanner(true);
    setEtapaDemo('Standby', '');
  }
}

function ejecutarCrisisDemo() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setEtapaDemo('2/4 Crisis', 'critico');
  enviar('RESET_NOMINAL');
  enviar({ metric: 'cabin_ppco2_mmHg', value: 3.8 });
  enviar({ metric: 'heart_rate_bpm', value: 118 });
  enviar({ metric: 'respiratory_rate_bpm', value: 26.0 });

  demoTimers.push(setTimeout(() => {
    enviar({ metric: 'spo2_pct', value: 92 });
    enviar({ metric: 'respiratory_rate_bpm', value: 22.0 });
  }, 8000));
}

function ejecutarRecuperacionDemo() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setEtapaDemo('3/4 Resolved', 'ok');
  enviar({ metric: 'spo2_pct', value: 95 });
  enviar({ metric: 'heart_rate_bpm', value: 112 });
  enviar({ metric: 'cabin_ppco2_mmHg', value: 2.9 });
  enviar({ metric: 'respiratory_rate_bpm', value: 25.0 });
  speak('Countermeasures and smart transdermal patch protocol engaged. Air scrubber purged and supplemental oxygen restored. Crew vital signs stabilizing.');

  demoTimers.push(setTimeout(() => {
    enviar({ metric: 'heart_rate_bpm', value: 94 });
    enviar({ metric: 'cabin_ppco2_mmHg', value: 2.7 });
    enviar({ metric: 'respiratory_rate_bpm', value: 19.0 });
    enviar({ metric: 'onsd_mm', value: 5.2 });
  }, 8000));

  demoTimers.push(setTimeout(() => {
    enviar('RESET_NOMINAL');
  }, 16000));
}

function ejecutarSomaDemo() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setEtapaDemo('4/4 SOMA', 'critico');
  enviar('DEPRESSURIZE');
  enviar('TRIGGER_SOS');
}

function iniciarAutoDemo() {
  if (demoCorriendo) {
    detenerDemo(true);
    return;
  }
  demoCorriendo = true;
  const btn = $('btnAutoDemo');
  if (btn) {
    btn.classList.add('corriendo');
    btn.textContent = '■ Stop Demo';
  }

  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  setEtapaDemo('1/4 Nominal', 'activo');
  enviar('RESET_NOMINAL');

  // 00:25: Crisis progresiva (CO2 + Taquicardia + Taquipnea -> Hipoxia [G+E])
  demoTimers.push(setTimeout(() => {
    if (demoCorriendo) ejecutarCrisisDemo();
  }, 25000));

  // 00:55: Resolución progresiva con contramedidas y parche (40 -> 70 -> 90 -> 100)
  demoTimers.push(setTimeout(() => {
    if (demoCorriendo) ejecutarRecuperacionDemo();
  }, 55000));

  // 01:25: Clímax — despresurización + SOS → SOMA congela buffer y transmite por DSOC a la Tierra
  demoTimers.push(setTimeout(() => {
    if (demoCorriendo) ejecutarSomaDemo();
  }, 85000));

  // 01:50: Fin del demo manteniendo el enlace SOMA/DSOC transmitido en pantalla
  demoTimers.push(setTimeout(() => {
    detenerDemo(false);
  }, 110000));
}

function configurarPanelDemo() {
  const btnAuto = $('btnAutoDemo');
  const btnReset = $('btnResetDemo');
  if (btnAuto) btnAuto.addEventListener('click', iniciarAutoDemo);
  if (btnReset) btnReset.addEventListener('click', () => detenerDemo(true));

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (ev.key === '1') { detenerDemo(false); ejecutarCrisisDemo(); }
    else if (ev.key === '2') { detenerDemo(false); ejecutarRecuperacionDemo(); }
    else if (ev.key === '3') { detenerDemo(false); ejecutarSomaDemo(); }
    else if (ev.key === '0') { detenerDemo(true); }
  });
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
  currentTickAlerts.push(alert);
  renderizarAlertas(currentTickAlerts);
  const key = `${alert.status}:${alert.trigger_metric}`;
  activeTickAlertKeys.add(key);
  if (!spokenAlerts.has(key)) {
    spokenAlerts.add(key);
    speak(buildAlertSpeechEnglish(alert));
  }
});

window.addEventListener('vitalgrid:soma', (ev) => {
  renderizarSoma(ev.detail);
  if (!somaSpoken) {
    somaSpoken = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    speak(
      'Emergency alert. SOMA Watchdog activated. Crew vital signs or cabin survival compromised. Initiating scientific preservation protocol, biological cryostallization container lock, and encrypted DSOC deep-space optical laser transmission to Earth.'
    );
  }
});

window.addEventListener('vitalgrid:connection', (ev) => {
  if (!ev.detail || !ev.detail.connected) {
    currentTickAlerts = [];
    limpiarPanelDirectivas('Daemon disconnected. Waiting for telemetry stream…', true);
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
        currentTickAlerts = [];
        aplicar(data);
        window.dispatchEvent(new CustomEvent('vitalgrid:telemetry', { detail: data }));

        if (data.survival_status && data.survival_status.vital_signs_present &&
            !data.survival_status.sos_panic_button_active &&
            data.survival_status.cabin_pressure_nominal) {
          somaSpoken = false;
          ocultarSomaBanner();
        }

        // Al terminar el lote de alertas del tick (250 ms después), liberar del Set
        // las alertas que ya volvieron a rango nominal y refrescar el panel visual de alertas.
        clearTimeout(timerLimpiezaAlertas);
        timerLimpiezaAlertas = setTimeout(() => {
          for (const k of Array.from(spokenAlerts)) {
            if (!activeTickAlertKeys.has(k)) spokenAlerts.delete(k);
          }
          renderizarAlertas(currentTickAlerts);
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
configurarPanelDemo();

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
