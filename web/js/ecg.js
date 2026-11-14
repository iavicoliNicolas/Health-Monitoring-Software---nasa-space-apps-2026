/* ===========================================================================
   VitalGrid · trazado cardíaco
   PARTE 4b — el ECG

   DECISIÓN IMPORTANTE, y hay que poder defenderla:

   El daemon NO envía muestras de ECG. Manda un número, `heart_rate_bpm`.
   Con un número no se puede dibujar un electrocardiograma real: un ECG de
   verdad son cientos de muestras de voltaje por segundo, y de ahí se leen
   cosas que el pulso solo no dice (arritmias, isquemia, bloqueos).

   Entonces esto es un TRAZADO SINTÉTICO: una onda PQRST generada acá, cuyo
   ritmo sigue la frecuencia cardíaca medida. Sirve para ver el ritmo de un
   vistazo, no para diagnosticar. Y lo dice en pantalla, porque un dibujo
   bonito presentado como ECG real sería exactamente el tipo de mentira que
   el resto del cockpit evita.

   Si mañana el back manda muestras reales, se le pasan a `ECG.muestras()`
   y el componente las dibuja en lugar de generarlas.
   =========================================================================== */

const ECG = (() => {
'use strict';

const canvas = document.getElementById('ecgCanvas');
if (!canvas) return { bpm() {}, sinDato() {} };

const ctx = canvas.getContext('2d');
const ALTO = 120;
const VELOCIDAD = 90;     // px por segundo · equivale al papel a 25 mm/s

let bpmActual = null;
let fase = 0;             // posición dentro del ciclo cardíaco, 0 a 1
let x = 0;
let puntos = [];          // [{x, y}] de lo que ya se dibujó
let ultimo = performance.now();

/* --- Forma de onda PQRST ------------------------------------------------
   `t` va de 0 a 1 dentro de un latido. Devuelve la amplitud, donde 0 es la
   línea isoeléctrica. Las proporciones son las de un trazado normal: P
   chica, QRS angosto y alto, T redondeada.
   ------------------------------------------------------------------------ */
function onda(t) {
  const gauss = (centro, ancho, alto) =>
    alto * Math.exp(-Math.pow((t - centro) / ancho, 2));

  return gauss(0.17, 0.028, 0.14)    // P
       - gauss(0.26, 0.009, 0.10)    // Q
       + gauss(0.29, 0.008, 1.00)    // R
       - gauss(0.32, 0.013, 0.22)    // S
       + gauss(0.52, 0.055, 0.26);   // T
}

/* --- Cuadrícula tipo papel de ECG --------------------------------------- */
function cuadricula(W) {
  ctx.clearRect(0, 0, W, ALTO);
  ctx.lineWidth = 1;

  ctx.strokeStyle = 'rgba(224, 69, 91, .07)';   // cuadrícula fina
  for (let i = 0; i < W; i += 9)   { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, ALTO); ctx.stroke(); }
  for (let j = 0; j < ALTO; j += 9) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }

  ctx.strokeStyle = 'rgba(224, 69, 91, .14)';   // cada 5 cuadros
  for (let i = 0; i < W; i += 45)   { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, ALTO); ctx.stroke(); }
  for (let j = 0; j < ALTO; j += 45) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(W, j); ctx.stroke(); }
}

/* --- Bucle de dibujo ----------------------------------------------------- */
let anchoPrevio = 0;

function bucle(ahora) {
  const W = canvas.clientWidth;
  if (W !== anchoPrevio) {
    canvas.width = W; canvas.height = ALTO;
    anchoPrevio = W; puntos = []; x = 0;
  }

  const dt = Math.min(0.05, (ahora - ultimo) / 1000);
  ultimo = ahora;

  if (bpmActual) {
    const avance = VELOCIDAD * dt;
    const pasos = Math.max(1, Math.round(avance));
    for (let i = 0; i < pasos; i++) {
      fase += (bpmActual / 60) * (dt / pasos);
      if (fase >= 1) fase -= 1;
      x += avance / pasos;
      if (x > W) { x = 0; puntos = []; }
      puntos.push({ x, y: ALTO * 0.62 - onda(fase) * ALTO * 0.42 });
    }
    if (puntos.length > W + 40) puntos.splice(0, puntos.length - (W + 40));
  }

  cuadricula(W);

  if (!bpmActual) {
    // Sin frecuencia medida no se inventa un ritmo: línea plana y gris.
    ctx.strokeStyle = '#9aacbd';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(0, ALTO * 0.62); ctx.lineTo(W, ALTO * 0.62); ctx.stroke();
    ctx.setLineDash([]);
  } else if (puntos.length > 1) {
    ctx.strokeStyle = '#e0455b';
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    puntos.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();

    // cabeza del trazo
    const u = puntos[puntos.length - 1];
    ctx.fillStyle = '#e0455b';
    ctx.beginPath(); ctx.arc(u.x, u.y, 2.6, 0, Math.PI * 2); ctx.fill();
  }

  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);

/* --- API ----------------------------------------------------------------- */
return {
  // Frecuencia medida, en latidos por minuto. null = sin medición.
  bpm(valor) {
    bpmActual = (typeof valor === 'number' && valor > 0) ? valor : null;
    const el = document.getElementById('ecgBpm');
    if (el) {
      el.textContent = bpmActual ? `${Math.round(bpmActual)} lpm` : '— lpm';
      el.className = 'ecg-bpm' + (bpmActual ? '' : ' sin-dato');
    }
    if (!bpmActual) puntos = [];
  },
  sinDato() { this.bpm(null); }
};

})();
