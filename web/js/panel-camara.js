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
  est.textContent = d.cerrado ? 'Eye closed' : 'Eye open';

  dibujarCurva(d.historia, d.umbral);

  // Cansancio
  const perclos = $('dPerclos');
  perclos.querySelector('b').textContent = d.perclos_pct.toFixed(1) + ' %';
  perclos.className = 'destacado' + (d.perclos_pct > UMBRAL_PERCLOS ? ' alerta' : '');

  const micro = $('dMicro');
  micro.querySelector('b').textContent = d.microsuenos;
  micro.className = 'destacado' + (d.microsuenos > 0 ? ' critico' : '');

  $('vFps').textContent = d.fps;

  // Edema facial (Pómulos, Mandíbula, Ancho/alto vs Día 1)
  actualizarEdemaEnVivo(d.edemaMedian || d.edemaSample);

  // El cockpit también muestra estas tres en la matriz RIDGE; se las pasamos
  // por si la parte 7 todavía no está conectada al daemon.
  window.VitalGrid?.desdeCamara?.({
    parpadeos_min: d.parpadeos_min,
    perclos_pct: +d.perclos_pct.toFixed(1),
    microsuenos: d.microsuenos
  });
}

/* --- Edema facial (facial_edema.js) -------------------------------------- */
const Edema = window.FacialEdema || null;
let edemaStore = Edema ? Edema.loadStore() : { baseline: null, samples: [] };
let ultimaMuestraEdema = null;

function fmtPct(v) {
  return (v > 0 ? '+' : '') + v.toFixed(1) + ' %';
}

function pintarEstadoBaseline() {
  if (!$('vDia1')) return;
  if (edemaStore && edemaStore.baseline) {
    $('vDia1').textContent = `set (${edemaStore.baseline.day})`;
    if ($('btnFijarDia1')) $('btnFijarDia1').textContent = 'Update day 1';
  } else {
    $('vDia1').textContent = 'not set';
    if ($('btnFijarDia1')) $('btnFijarDia1').textContent = 'Set day 1';
  }
}

function actualizarEdemaEnVivo(sample) {
  if (!Edema || !sample) return;
  ultimaMuestraEdema = sample;

  if (edemaStore && edemaStore.baseline) {
    const deltas = Edema.componentDeltas(sample, edemaStore.baseline);
    if (deltas) {
      $('vPomulos').textContent   = fmtPct(deltas.cheek);
      $('vMandibula').textContent = fmtPct(deltas.jaw);
      $('vRatio').textContent     = `${sample.roundness.toFixed(2)} (${fmtPct(deltas.roundness)})`;
      return;
    }
  }

  // Sin día 1 fijado aún: mostrar índices geométricos actuales listos para fijar
  $('vPomulos').textContent   = `${sample.cheek.toFixed(2)}x (no base)`;
  $('vMandibula').textContent = `${sample.jaw.toFixed(2)}x (no base)`;
  $('vRatio').textContent     = sample.roundness.toFixed(2);
}

function fijarDia1Edema() {
  if (!Edema) return;
  if (!ultimaMuestraEdema) {
    $('camLog').textContent = 'Look straight at the camera to set day 1 baseline…';
    return;
  }
  const ahora = new Date();
  const stamped = {
    cheek: ultimaMuestraEdema.cheek,
    jaw: ultimaMuestraEdema.jaw,
    roundness: ultimaMuestraEdema.roundness,
    savedAt: ahora.toISOString(),
    day: Edema.dayKey(ahora)
  };
  edemaStore = { baseline: stamped, samples: edemaStore.samples || [] };
  Edema.saveStore(edemaStore);
  pintarEstadoBaseline();
  actualizarEdemaEnVivo(ultimaMuestraEdema);
  $('camLog').textContent = `Facial edema baseline (Day 1) set: ${stamped.day}.`;
}

pintarEstadoBaseline();

/* --- Avisos de estado ----------------------------------------------------- */
function alAviso(a) {
  if (a.log) $('camLog').textContent = a.log;

  if (a.enlace) {
    $('camLog').textContent = a.enlace === 'conectado'
      ? 'Link to the daemon is online.' : 'Reconnecting to the daemon…';
  }

  if (a.camara === 'encendida') {
    encendida = true;
    $('camOff').hidden = true;
    const etiqueta = a.modo === 'backup' ? 'Video Backup active' : 'Camera on';
    estadoCamara('encendida', etiqueta);
    botonApagar(a.modo === 'backup');
    $('btnCalibrar').disabled = false;
    $('btnReiniciar').disabled = false;
    $('btnFijarDia1').disabled = false;
  }

  if (a.camara === 'apagada') {
    encendida = false;
    ultimaMuestraEdema = null;
    $('camOff').hidden = false;
    estadoCamara('apagada', 'Camera off');
    botonEncender();
    $('btnCalibrar').disabled = true;
    $('btnReiniciar').disabled = true;
    $('btnFijarDia1').disabled = true;
    // Las métricas de la cámara dejan de ser actuales: a SIN MEDICIÓN.
    ['vEar', 'vParpadeos', 'vDuracion', 'vFps', 'vPomulos', 'vMandibula', 'vRatio'].forEach(id => $(id).textContent = '—');
    $('dPerclos').querySelector('b').textContent = '—';
    $('dMicro').querySelector('b').textContent = '—';
    $('dPerclos').className = 'destacado';
    $('dMicro').className = 'destacado';
    $('estadoOjo').className = 'estado-ojo sin-dato';
    $('estadoOjo').textContent = 'Not measuring';
    window.VitalGrid?.desdeCamara?.({ parpadeos_min: null, perclos_pct: null, microsuenos: null });
  }
  if (a.camara === 'error') {
    encendida = false;
    estadoCamara('error', 'Camera error');
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
  b.textContent = 'Turn on';
  b.className = 'btn';
  b.disabled = false;
}

function botonApagar(esBackup = false) {
  const b = $('btnEncender');
  b.textContent = esBackup ? 'Stop' : 'Turn off';
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
  $('camLog').textContent = 'Requesting camera permission…';
  Camara.encender();
});

if ($('btnVideoBackup') && $('inputVideoBackup')) {
  $('btnVideoBackup').addEventListener('click', () => {
    $('inputVideoBackup').value = '';
    $('inputVideoBackup').click();
  });
  $('inputVideoBackup').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (file) {
      $('camLog').textContent = `Loading backup video: ${file.name}…`;
      Camara.encenderConArchivo(file);
    }
  });
}

if ($('btnFijarDia1')) {
  $('btnFijarDia1').addEventListener('click', fijarDia1Edema);
}

$('btnCalibrar').addEventListener('click', () => Camara.calibrar());
$('btnReiniciar').addEventListener('click', () => {
  Camara.reiniciar();
  $('dMicro').querySelector('b').textContent = '0';
  $('vDuracion').textContent = '—';
});
