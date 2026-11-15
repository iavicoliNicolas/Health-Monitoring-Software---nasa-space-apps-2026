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
  if (m.alerta)  return `Alert: ${m.alerta.op}${m.alerta.valor} ${m.unidad}`.trim();
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
    nodo.querySelector('.celda-umbral').textContent = 'NO READING';
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
                 : alert ? `${alert} on alert`
                 : estado === 'sin-dato' ? 'No reading'
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
    nodo.querySelector('.vital-rango').textContent = 'No reading';
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
    est.textContent = 'no reading';
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
  if (motivo) console.warn('[VitalGrid] No reading:', motivo);
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
window.VitalGrid = { aplicar, todoSinMedicion };   // para probar desde la consola

/* ===== Reloj de misión (MET) ============================================= */
let seg = 42 * 86400 + 18 * 3600 + 27 * 60;
const pad = (n, l = 2) => String(n).padStart(l, '0');

setInterval(() => {
  seg++;
  $('reloj').textContent =
    `MET +${pad(Math.floor(seg / 86400), 3)}:${pad(Math.floor(seg % 86400 / 3600))}` +
    `:${pad(Math.floor(seg % 3600 / 60))}:${pad(seg % 60)}`;
}, 1000);

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

/* ===== Arranque ========================================================== */
construir()
  .then(() => todoSinMedicion('telemetry has not arrived yet'))
  .catch(err => {
    console.error('[VitalGrid] Could not read data/metricas.json', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<p style="padding:14px;color:#e0455b">Could not read <code>data/metricas.json</code>. ' +
      'Open the page from a local server, not by double-clicking.</p>');
  });

})();
