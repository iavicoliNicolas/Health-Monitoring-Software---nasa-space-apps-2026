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
        <div class="vital-rango">Referencia ${v.rango}</div>
      </div>
    </article>`).join('');

  // Índice campo -> tarjeta, para no buscar en el DOM una vez por segundo
  config.vitales.forEach(v => {
    tarjetas.set(v.campo, { nodo: document.querySelector(`[data-campo="${v.campo}"]`), def: v });
  });

  construirPuntos();
}

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
    nodo.querySelector('.vital-rango').textContent = 'Sin medición';
    if (def.zona) pintarZona(campo, 'sin-dato');
    return;
  }

  nodo.querySelector('.vital-num').textContent =
    textoForzado ?? valor.toFixed(def.decimales ?? 0);
  nodo.querySelector('.vital-rango').textContent = `Referencia ${def.rango}`;

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
    est.textContent = 'sin medición';
    aro.style.stroke = 'var(--sin-dato)';
    aro.style.strokeDashoffset = CIRC;
    return;
  }

  const color = valor >= 80 ? 'var(--ok)'
              : valor >= 50 ? 'var(--alerta)'
              :               'var(--critico)';
  const texto = valor >= 80 ? 'nominal'
              : valor >= 50 ? 'degradado'
              :               'crítico';

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
  zonas.forEach(z => pintarZona(z.campo, 'sin-dato'));
  pintarPuntaje(null);
  $('detalle').classList.add('oculto');
  if (motivo) console.warn('[VitalGrid] Sin medición:', motivo);
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

  // Métricas que no son signos vitales, para el detalle del mapa
  zonas.forEach(z => { ultimos[z.campo] = porRuta(p, z.ruta); });
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
  });
});

/* ===== Arranque ========================================================== */
construir()
  .then(() => todoSinMedicion('todavía no llegó telemetría'))
  .catch(err => {
    console.error('[VitalGrid] No pude leer data/metricas.json', err);
    document.body.insertAdjacentHTML('afterbegin',
      '<p style="padding:14px;color:#e0455b">No pude leer <code>data/metricas.json</code>. ' +
      'Abrí la página con un servidor local, no con doble clic.</p>');
  });

})();
