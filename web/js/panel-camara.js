/* ===========================================================================
   VitalGrid · panel de cámara
   PARTE 5 — conecta el módulo de medición con la interfaz del cockpit

   Este archivo NO mide nada: sólo dibuja. Toda la medición vive en
   camara.js, que es el prototipo validado. Separarlos permite cambiar el
   diseño sin tocar la lógica, y cambiar la lógica sin romper el diseño.
   =========================================================================== */

import * as Camara from './camara.js';

const $ = id => document.getElementById(id);
const UMBRAL_PERCLOS = 15;   // sale de data/metricas.json · Abe 2023

/* --- Pestañas ------------------------------------------------------------ */
document.querySelectorAll('.pestana').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pestana').forEach(b => b.classList.remove('activa'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('activo'));
    btn.classList.add('activa');
    document.querySelector(`[data-panel="${btn.dataset.tab}"]`).classList.add('activo');
  });
});

/* --- Curva de apertura ---------------------------------------------------
   El mismo dibujo del prototipo, adaptado al fondo claro.
   ------------------------------------------------------------------------- */
const curva = $('curva');
const cctx = curva.getContext('2d');
let anchoPrevio = 0;

function dibujarCurva(historia, umbral) {
  const W = curva.clientWidth;
  if (W !== anchoPrevio) { curva.width = W; curva.height = 96; anchoPrevio = W; }
  const H = 96, MAX = 0.45;
  const y = v => H - (v / MAX) * H;

  cctx.clearRect(0, 0, W, H);

  // línea del umbral
  cctx.strokeStyle = '#e0455b';
  cctx.setLineDash([5, 4]);
  cctx.beginPath(); cctx.moveTo(0, y(umbral)); cctx.lineTo(W, y(umbral)); cctx.stroke();
  cctx.setLineDash([]);

  if (!historia || historia.length < 2) return;
  cctx.strokeStyle = '#2f6fed';
  cctx.lineWidth = 2;
  cctx.lineJoin = 'round';
  cctx.beginPath();
  historia.forEach((v, i) => {
    const x = (i / (historia.length - 1)) * W;
    i ? cctx.lineTo(x, y(v)) : cctx.moveTo(x, y(v));
  });
  cctx.stroke();
}

/* --- Pintar lo que mide el módulo ---------------------------------------- */
function alActualizar(d) {
  // Párpados
  $('vEar').textContent    = d.ear.toFixed(3);
  $('vUmbral').textContent = d.umbral.toFixed(3);
  $('vParpadeos').textContent = d.parpadeos_min;
  if (d.duracion_ultimo_cierre_ms !== null)
    $('vDuracion').textContent = d.duracion_ultimo_cierre_ms + ' ms';

  const est = $('estadoOjo');
  est.className = 'estado-ojo ' + (d.cerrado ? 'cerrado' : 'abierto');
  est.textContent = d.cerrado ? 'Ojo cerrado' : 'Ojo abierto';

  dibujarCurva(d.historia, d.umbral);

  // Cansancio
  const perclos = $('dPerclos');
  perclos.querySelector('b').textContent = d.perclos_pct.toFixed(1) + ' %';
  perclos.className = 'destacado' + (d.perclos_pct > UMBRAL_PERCLOS ? ' alerta' : '');

  const micro = $('dMicro');
  micro.querySelector('b').textContent = d.microsuenos;
  micro.className = 'destacado' + (d.microsuenos > 0 ? ' critico' : '');

  $('vFps').textContent = d.fps;
  refrescarEdemaEnVivo();

  // El daemon reescribe blink_rate, microsleep y perclos y los devuelve
  // en el próximo payload. No hay un almacén paralelo en el frente.
  window.VitalGrid?.desdeCamara?.({
    parpadeos_min: d.parpadeos_min,
    perclos_pct: +d.perclos_pct.toFixed(1),
    microsuenos: d.microsuenos
  });
}

/* --- Avisos de estado ----------------------------------------------------- */
function alAviso(a) {
  if (!Camara.puntosCara()) muestrasEdema = [];

  if (a.log) $('camLog').textContent = a.log;

  if (a.enlace) {
    $('camLog').textContent = a.enlace === 'conectado'
      ? 'Enlace con el daemon en línea.' : 'Reconectando con el daemon…';
  }

  if (a.camara === 'encendida') {
    encendida = true;
    $('camOff').hidden = true;
    estadoCamara('encendida', 'Cámara encendida');
    botonApagar();
    $('btnCalibrar').disabled = false;
    $('btnReiniciar').disabled = false;
    $('btnFijarDia1').disabled = false;
  }

  if (a.camara === 'apagada') {
    encendida = false;
    $('camOff').hidden = false;
    estadoCamara('apagada', 'Cámara apagada');
    botonEncender();
    $('btnCalibrar').disabled = true;
    $('btnReiniciar').disabled = true;
    $('btnFijarDia1').disabled = true;
    muestrasEdema = [];
    pintarEdema(muestraGuardada());
    // Las métricas de la cámara dejan de ser actuales: a SIN MEDICIÓN.
    ['vEar', 'vParpadeos', 'vDuracion', 'vFps'].forEach(id => $(id).textContent = '—');
    $('dPerclos').querySelector('b').textContent = '—';
    $('dMicro').querySelector('b').textContent = '—';
    $('dPerclos').className = 'destacado';
    $('dMicro').className = 'destacado';
    $('estadoOjo').className = 'estado-ojo sin-dato';
    $('estadoOjo').textContent = 'Sin medir';
    window.VitalGrid?.desdeCamara?.({ parpadeos_min: null, perclos_pct: null, microsuenos: null });
  }
  if (a.camara === 'error') {
    encendida = false;
    estadoCamara('error', 'Error de cámara');
    botonEncender();
  }
}

/* --- El botón es un interruptor ------------------------------------------
   Un solo botón que prende y apaga. Dos botones separados obligan a mirar
   cuál está habilitado para saber en qué estado estás.
   ------------------------------------------------------------------------- */
let encendida = false;

function botonEncender() {
  const b = $('btnEncender');
  b.textContent = 'Encender';
  b.className = 'btn';
  b.disabled = false;
}

function botonApagar() {
  const b = $('btnEncender');
  b.textContent = 'Apagar';
  b.className = 'btn btn-sec';
  b.disabled = false;
}

/* --- Estado visible de la cámara ----------------------------------------
   Siempre dice en qué estado está, encendida o apagada. Un display negro
   puede ser una cámara apagada o una cámara rota: no es lo mismo.
   ------------------------------------------------------------------------- */
function estadoCamara(clase, texto) {
  const el = $('camEstado');
  el.className = 'cam-estado ' + clase;
  el.innerHTML = '<span class="punto"></span>' + texto;
}

/* --- Arranque ------------------------------------------------------------- */
Camara.iniciar({
  elVideo: $('video'),
  elOverlay: $('overlay'),
  onActualizar: alActualizar,
  onAviso: alAviso
});

$('btnEncender').addEventListener('click', () => {
  if (encendida) { Camara.apagar(); return; }
  $('btnEncender').disabled = true;
  $('camLog').textContent = 'Pidiendo permiso de cámara…';
  Camara.encender();
});
$('btnCalibrar').addEventListener('click', () => Camara.calibrar());
$('btnReiniciar').addEventListener('click', () => {
  Camara.reiniciar();
  $('dMicro').querySelector('b').textContent = '0';
  $('vDuracion').textContent = '—';
});

/* --- Edema facial ---------------------------------------------------------
   Usa la cámara que ya está prendida. facial_edema.js mide; este panel
   solo escribe #vPomulos, #vMandibula, #vRatio y #vDia1.
   ------------------------------------------------------------------------- */
const Edema = window.FacialEdema;
let edemaStore = Edema ? Edema.loadStore() : { baseline: null, samples: [] };
let muestrasEdema = [];

function fmtPct(n) {
  return (n > 0 ? '+' : '') + n.toFixed(1) + ' %';
}

function muestraGuardada() {
  if (!edemaStore.baseline) return null;
  return edemaStore.samples.length
    ? edemaStore.samples[edemaStore.samples.length - 1]
    : edemaStore.baseline;
}

function pintarEdema(sample) {
  if (!Edema || !edemaStore.baseline) {
    $('vPomulos').textContent = '—';
    $('vMandibula').textContent = '—';
    $('vRatio').textContent = '—';
    $('vDia1').textContent = 'sin fijar';
    return;
  }
  $('vDia1').textContent = edemaStore.baseline.day;
  const deltas = sample ? Edema.componentDeltas(sample, edemaStore.baseline) : null;
  if (!deltas) {
    $('vPomulos').textContent = '—';
    $('vMandibula').textContent = '—';
    $('vRatio').textContent = '—';
    return;
  }
  $('vPomulos').textContent = fmtPct(deltas.cheek);
  $('vMandibula').textContent = fmtPct(deltas.jaw);
  $('vRatio').textContent = fmtPct(deltas.roundness);
}

function tomarMuestraEdema() {
  if (!Edema) return null;
  const pts = Camara.puntosCara();
  if (!pts) {
    muestrasEdema = [];
    return null;
  }
  const sample = Edema.measure(pts);
  if (!sample) return Edema.medianSample(muestrasEdema);
  muestrasEdema.push(sample);
  if (muestrasEdema.length > 24) muestrasEdema.shift();
  return Edema.medianSample(muestrasEdema) || sample;
}

function refrescarEdemaEnVivo() {
  if (!encendida) return;
  const vivo = tomarMuestraEdema();
  if (edemaStore.baseline && vivo) pintarEdema(vivo);
}

if (Edema) {
  try { Edema.selfTest(); }
  catch (err) { console.error('[VitalGrid] Edema facial:', err); }
}
pintarEdema(muestraGuardada());

$('btnFijarDia1').addEventListener('click', () => {
  if (!Edema || $('btnFijarDia1').disabled) return;
  const vivo = tomarMuestraEdema();
  if (!vivo) {
    $('camLog').textContent = 'No hay un rostro de frente para fijar el día 1.';
    return;
  }
  const result = Edema.applyCapture(edemaStore, vivo, new Date());
  if (result.kind === 'same-day') {
    $('camLog').textContent = 'El día 1 ya está fijado hoy. La comparación sigue contra esa línea.';
    pintarEdema(vivo);
    return;
  }
  edemaStore = result.store;
  Edema.saveStore(edemaStore);
  const guardada = result.kind === 'baseline'
    ? edemaStore.baseline
    : edemaStore.samples[edemaStore.samples.length - 1];
  pintarEdema(guardada);
  $('camLog').textContent = result.kind === 'baseline'
    ? 'Día 1 guardado. Las filas comparan contra esa línea.'
    : 'Captura guardada contra el día 1.';
});
