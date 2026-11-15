// ---------------------------------------------------------------------------
// Detección de fatiga ocular con MediaPipe Face Landmarker
// VitalGrid · módulo de cámara
//
// LA LÓGICA DE MEDICIÓN ES LA DEL PROTOTIPO VALIDADO, SIN CAMBIOS:
// las constantes CFG, los índices de los ojos, el cálculo del EAR, la
// calibración por mediana, la máquina de estados y el envío por WebSocket
// están copiados tal cual.
//
// Lo único distinto: este módulo NO escribe en el DOM. Calcula y avisa por
// un callback. Así la misma lógica sirve para cualquier interfaz — la del
// prototipo oscuro o la del cockpit claro — sin tocar una línea de medición.
// ---------------------------------------------------------------------------

import { FaceLandmarker, FilesetResolver }
  from "../vendor/mediapipe/vision_bundle.mjs";

const WASM_LOCAL_URL  = new URL("../vendor/mediapipe/wasm", import.meta.url).href;
const MODEL_LOCAL_URL = new URL("../vendor/mediapipe/face_landmarker.task", import.meta.url).href;

// === CONSTANTES A CONFIRMAR CON EL OFTALMÓLOGO =============================
// Las cuatro están puestas a ojo. Cada una es una pregunta de la entrevista.
export const CFG = {
  UMBRAL_CERRADO:     0.12,   // ¿a qué apertura el ojo está funcionalmente cerrado?
  PARPADEO_MAX_MS:    400,    // ¿cuánto dura como máximo un parpadeo normal?
  MICROSUENO_MIN_MS:  500,    // ¿desde qué duración es microsueño?
  VENTANA_PERCLOS_MS: 60000,  // ¿sobre cuántos minutos se promedia PERCLOS?
  FACTOR_CALIBRACION: 0.60,   // umbral = 60 % de la apertura basal propia
  TARGET_FPS:         15,     // throttling: no saturar CPU/GPU
  WS_URL:             "ws://127.0.0.1:9002"
};
// ===========================================================================

// Índices de MediaPipe. Verificalos mirando los puntos dibujados sobre tu cara.
const OJOS = {
  derecho:   { p1: 33,  p2: 160, p3: 158, p4: 133, p5: 153, p6: 144 },
  izquierdo: { p1: 362, p2: 385, p3: 387, p4: 263, p5: 373, p6: 380 }
};

// --- estado de medición ----------------------------------------------------
let video = null, overlay = null, ctx = null;
let landmarker = null;
let corriendo = false;
let modoBackup = false;
let backupBlobUrl = null;
let ultimoTs = -1, ultimoProcesado = 0;

let umbral = CFG.UMBRAL_CERRADO;
let estabaCerrado = false, tCierre = 0;
let parpadeos = [];     // timestamps, para la frecuencia por minuto
let microsuenos = 0;
let muestras = [];      // { t, cerrado } dentro de la ventana de PERCLOS
let historia = [];      // EAR reciente, sólo para dibujar la curva
let muestrasEdema = []; // muestras recientes de geometría facial para mediana
let calibrando = false, tCal = 0, valoresCal = [];
let fpsT = performance.now(), fpsN = 0, fps = 0;

let alActualizar = () => {};
let alAvisar = () => {};

// --- Enlace con el bus WebSocket único de app.js ---------------------------
let ultimoEnvioTelemetria = 0;

function vincularBusEventos() {
  window.addEventListener("vitalgrid:connection", (ev) => {
    const conectado = Boolean(ev.detail && ev.detail.connected);
    alAvisar({ enlace: conectado ? "conectado" : "reconectando" });
  });
}

function enviarMetrica(metric, value) {
  window.VitalGrid?.enviar?.({ metric, value });
}

// --- utilidades ------------------------------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Apertura del ojo: las dos distancias verticales sobre el doble del ancho.
// Dividir por el ancho hace que el valor no cambie si la persona se acerca.
function ear(pts, ojo) {
  const p = i => pts[ojo[i]];
  const vertical = dist(p("p2"), p("p6")) + dist(p("p3"), p("p5"));
  const ancho    = dist(p("p1"), p("p4"));
  return vertical / (2 * ancho);
}

// --- arranque (100% OFFLINE desde web/vendor/mediapipe) --------------------
async function cargarModelo() {
  alAvisar({ log: 'Loading offline MediaPipe model…' });
  const vision = await FilesetResolver.forVisionTasks(WASM_LOCAL_URL);
  try {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_LOCAL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });
  } catch {
    landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_LOCAL_URL,
        delegate: "CPU"
      },
      runningMode: "VIDEO",
      numFaces: 1
    });
  }
  alAvisar({ log: 'Offline model ready.' });
}

function limpiarFuenteVideo() {
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  if (backupBlobUrl) {
    URL.revokeObjectURL(backupBlobUrl);
    backupBlobUrl = null;
  }
  video.pause();
  video.removeAttribute("src");
  video.loop = false;
}

export function esModoVideoBackup() {
  return modoBackup;
}

export async function encender() {
  try {
    if (!landmarker) await cargarModelo();
    corriendo = false;
    limpiarFuenteVideo();
    modoBackup = false;

    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    await video.play();
    overlay.width  = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    ultimoTs = -1;
    corriendo = true;
    alAvisar({ camara: 'encendida', modo: 'webcam', log: 'Measuring live. The video is not stored anywhere.' });
    requestAnimationFrame(bucle);
    return true;
  } catch (e) {
    alAvisar({ camara: 'error', log: 'Error: ' + e.message + ' — use 🎞️ Video Backup if no webcam is available.' });
    return false;
  }
}

export async function encenderConArchivo(file) {
  if (!file) return false;
  try {
    if (!landmarker) await cargarModelo();
    corriendo = false;
    limpiarFuenteVideo();
    modoBackup = true;

    backupBlobUrl = URL.createObjectURL(file);
    video.src = backupBlobUrl;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    overlay.width  = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    ultimoTs = -1;
    corriendo = true;
    alAvisar({ camara: 'encendida', modo: 'backup', log: `🎞️ Video Backup looping: ${file.name}` });
    requestAnimationFrame(bucle);
    return true;
  } catch (e) {
    alAvisar({ camara: 'error', log: 'Failed to load backup video: ' + e.message });
    return false;
  }
}

export function apagar() {
  corriendo = false;
  modoBackup = false;
  limpiarFuenteVideo();
  muestrasEdema = [];

  ctx.clearRect(0, 0, overlay.width, overlay.height);
  alAvisar({ camara: 'apagada', log: 'Camera off. Nothing is being measured.' });
}

export function calibrar() {
  calibrando = true;
  tCal = performance.now();
  valoresCal = [];
}

export function reiniciar() {
  parpadeos = []; microsuenos = 0; muestras = []; historia = []; muestrasEdema = [];
  enviarMetrica("blink_rate", 0);
  enviarMetrica("microsleep", 0);
  enviarMetrica("perclos", 0);
  alAvisar({ log: 'Count reset.' });
}

// --- bucle principal -------------------------------------------------------
function bucle() {
  if (!corriendo) return;
  const ahora = performance.now();
  const intervaloMs = 1000 / CFG.TARGET_FPS;

  // Throttling: inferencia a 15 FPS como máximo
  if ((ahora - ultimoProcesado >= intervaloMs) && video.currentTime !== ultimoTs && video.readyState >= 2) {
    ultimoProcesado = ahora;
    ultimoTs = video.currentTime;
    if (video.videoWidth && overlay.width !== video.videoWidth) {
      overlay.width = video.videoWidth;
      overlay.height = video.videoHeight;
    }
    const res = landmarker.detectForVideo(video, Math.round(ahora));

    if (res.faceLandmarks && res.faceLandmarks.length) {
      const pts = res.faceLandmarks[0];
      const e = (ear(pts, OJOS.derecho) + ear(pts, OJOS.izquierdo)) / 2;
      procesar(e, ahora, pts);
      dibujarPuntos(pts);
    } else {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      alAvisar({ log: 'No face in view. Move closer or improve the light.' });
    }
  }

  fpsN++;
  if (ahora - fpsT > 1000) { fps = fpsN; fpsN = 0; fpsT = ahora; }

  requestAnimationFrame(bucle);
}

// --- lógica de medición ----------------------------------------------------
function procesar(e, t, pts) {
  // calibración: cinco segundos con los ojos abiertos fijan el umbral propio
  if (calibrando) {
    valoresCal.push(e);
    const restan = Math.ceil((5000 - (t - tCal)) / 1000);
    alAvisar({ log: `Calibrating… keep your eyes open (${restan})` });
    if (t - tCal >= 5000) {
      valoresCal.sort((a, b) => a - b);
      const basal = valoresCal[Math.floor(valoresCal.length / 2)];   // mediana
      umbral = basal * CFG.FACTOR_CALIBRACION;
      calibrando = false;
      alAvisar({ log: `Ready. Baseline aperture ${basal.toFixed(3)} · threshold ${umbral.toFixed(3)}` });
    }
  }

  const cerrado = e < umbral;
  let duracionUltimoCierre = null;

  // máquina de estados: al abrir el ojo clasificamos el cierre que terminó
  if (cerrado && !estabaCerrado) {
    tCierre = t;
  } else if (!cerrado && estabaCerrado) {
    const dur = t - tCierre;
    duracionUltimoCierre = Math.round(dur);
    if (dur <= CFG.PARPADEO_MAX_MS) {
      parpadeos.push(t);                        // V angosta
    } else if (dur >= CFG.MICROSUENO_MIN_MS) {
      microsuenos++;                            // U ancha
      enviarMetrica("microsleep", microsuenos); // evento crítico: envío inmediato
    }
    // entre 400 y 500 ms queda SIN CLASIFICAR a propósito: no hay criterio
    // clínico validado para esa franja y no lo inventamos.
  }
  estabaCerrado = cerrado;

  // PERCLOS: proporción de tiempo con el ojo cerrado dentro de la ventana
  muestras.push({ t, cerrado });
  const desde = t - CFG.VENTANA_PERCLOS_MS;
  while (muestras.length && muestras[0].t < desde) muestras.shift();
  const perclos = muestras.length
    ? muestras.filter(m => m.cerrado).length / muestras.length : 0;

  // frecuencia de parpadeo del último minuto
  while (parpadeos.length && parpadeos[0] < t - 60000) parpadeos.shift();

  historia.push(e);
  if (historia.length > 300) historia.shift();

  // Medición geométrica de Edema Facial (facial_edema.js)
  let edemaSample = null;
  let edemaMedian = null;
  if (window.FacialEdema && pts) {
    edemaSample = window.FacialEdema.measure(pts);
    if (edemaSample) {
      muestrasEdema.push(edemaSample);
      if (muestrasEdema.length > 15) muestrasEdema.shift();
      edemaMedian = window.FacialEdema.medianSample(muestrasEdema) || edemaSample;
    }
  }

  // telemetría periódica a 1 Hz
  if (t - ultimoEnvioTelemetria >= 1000) {
    ultimoEnvioTelemetria = t;
    enviarMetrica("blink_rate", parpadeos.length);
    enviarMetrica("microsleep", microsuenos);
    enviarMetrica("perclos", Number((perclos * 100).toFixed(1)));
  }

  // Los números por captura + geometría de edema facial
  alActualizar({
    ear: e,
    umbral,
    parpadeos_min: parpadeos.length,
    perclos_pct: perclos * 100,
    microsuenos,
    duracion_ultimo_cierre_ms: duracionUltimoCierre,
    fps,
    cerrado,
    historia,
    edemaSample,
    edemaMedian
  });
}

// --- dibujo de los 12 puntos de los ojos -----------------------------------
function dibujarPuntos(pts) {
  const W = overlay.width, H = overlay.height;
  ctx.clearRect(0, 0, W, H);
  for (const ojo of Object.values(OJOS)) {
    for (const k of ["p1", "p2", "p3", "p4", "p5", "p6"]) {
      const p = pts[ojo[k]];
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#2f6fed";
      ctx.fill();
    }
  }
}

// --- inicialización --------------------------------------------------------
export function iniciar({ elVideo, elOverlay, onActualizar, onAviso }) {
  video   = elVideo;
  overlay = elOverlay;
  ctx     = overlay.getContext("2d");
  alActualizar = onActualizar || (() => {});
  alAvisar     = onAviso      || (() => {});
  vincularBusEventos();
}
