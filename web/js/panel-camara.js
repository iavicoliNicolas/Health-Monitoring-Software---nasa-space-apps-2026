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

  // El cockpit también muestra estas tres en la matriz RIDGE; se las pasamos
  // por si la parte 7 todavía no está conectada al daemon.
  window.VitalGrid?.desdeCamara?.({
    parpadeos_min: d.parpadeos_min,
    perclos_pct: +d.perclos_pct.toFixed(1),
    microsuenos: d.microsuenos
  });
}

/* --- Avisos de estado ----------------------------------------------------- */
function alAviso(a) {
  if (a.log) $('camLog').textContent = a.log;

  if (a.enlace) {
    $('camLog').textContent = a.enlace === 'conectado'
      ? 'Enlace con el daemon en línea.' : 'Reconectando con el daemon…';
  }

  if (a.camara === 'encendida') {
    $('camOff').hidden = true;
    estadoCamara('encendida', 'Cámara encendida');
    $('btnEncender').disabled = true;
    $('btnCalibrar').disabled = false;
    $('btnReiniciar').disabled = false;
    $('btnFijarDia1').disabled = false;
  }
  if (a.camara === 'error') {
    estadoCamara('error', 'Error de cámara');
    $('btnEncender').disabled = false;
  }
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
