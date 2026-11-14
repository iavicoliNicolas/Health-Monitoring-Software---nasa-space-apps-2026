import { CHAPTERS, MODES, SCENARIOS, STATUS_RU } from "./content.js";
import { createTelemetry, snapshot } from "./telemetry.js";
import { createEar } from "./audio.js";
import { createSheets, pickRightPage } from "./paper.js";
import { createWorld } from "./world.js";

const ui = {
  mode: "diario",
  chapter: null,
  hover: null,
};

const pointer = { x: -1, y: -1, nx: 0, ny: 0 };
const telemetry = createTelemetry();
const ear = createEar();
const q = new URLSearchParams(location.search);

const boot = document.getElementById("boot");
const whisperEl = document.getElementById("whisper");
const live = document.getElementById("live");
const fog = document.getElementById("fog");
const stamp = document.getElementById("glass-stamp");
const canvas = document.getElementById("gl");
const lampBtn = document.getElementById("lamp-btn");

let world;
let sheets;
let whisperTimer = 0;
let paintSig = "";
let last = performance.now();

function say(text) {
  whisperEl.textContent = text;
  whisperEl.classList.add("show");
  clearTimeout(whisperTimer);
  whisperTimer = setTimeout(() => whisperEl.classList.remove("show"), 4200);
  live.textContent = text;
}

function applyChrome(snap) {
  document.body.classList.remove("mode-diario", "mode-reloj", "mode-casco");
  document.body.classList.add(`mode-${ui.mode}`);
  document.body.dataset.alarm = snap.worst;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.mode === ui.mode ? "true" : "false");
  });
  document.querySelectorAll("[data-incident]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.incident === snap.scenario.id ? "true" : "false");
  });
  lampBtn.setAttribute("aria-pressed", ear.enabled ? "true" : "false");
  stamp.textContent = STATUS_RU[snap.worst];
  const fields = {
    hr: String(Math.round(snap.readings.hr)),
    o2: `${Math.round(snap.readings.o2)}%`,
    rad: snap.values.radiacion,
    psi: snap.values.traje,
    water: `${snap.values.agua}%`,
    sleep: `${snap.values.sueno}h`,
  };
  for (const key of Object.keys(fields)) {
    const node = document.querySelector(`[data-k="${key}"]`);
    if (node && node.textContent !== fields[key]) node.textContent = fields[key];
    const read = node?.parentElement;
    if (!read) continue;
    const level =
      key === "hr" ? snap.judge.pulso :
      key === "o2" ? snap.judge.oxigeno :
      key === "rad" ? snap.judge.radiacion :
      key === "psi" ? snap.judge.traje :
      key === "water" ? snap.judge.agua :
      snap.judge.sueno;
    read.classList.toggle("watch", level === "watch");
    read.classList.toggle("bad", level === "bad");
  }
  fog.style.opacity = ui.mode === "casco" ? String(0.15 + snap.breath * 0.55) : "0";
  const interactive = world?.hover && world.hover.pick;
  canvas.style.cursor = interactive ? "pointer" : "crosshair";
}

function paint(force = false) {
  const snap = snapshot(telemetry.state);
  const moving = ui.chapter == null ? snap.clock : Math.floor(snap.t * 10);
  const sig = `${ui.chapter}|${ui.hover}|${snap.scenario.id}|${snap.worst}|${Object.values(snap.values).join()}|${Object.values(snap.judge).join()}|${moving}`;
  if (force || sig !== paintSig) {
    paintSig = sig;
    sheets.redraw(snap, ui);
    world?.markDirty();
  }
  applyChrome(snap);
  return snap;
}

function setMode(mode) {
  if (!MODES.some((item) => item.id === mode)) return;
  ui.mode = mode;
  const found = MODES.find((item) => item.id === mode);
  say(found.whisper);
  paint(true);
}

function setChapter(index) {
  ui.chapter = index;
  ui.hover = null;
  world?.rustle();
  if (index == null) {
    say("De vuelta al índice.");
  } else {
    const chapter = CHAPTERS[index];
    say(`${chapter.num}. ${chapter.title}.`);
    if (ui.mode !== "diario") ui.mode = "diario";
  }
  paint(true);
  ear.blip();
}

function setScenario(id) {
  const found = SCENARIOS.find((item) => item.id === id);
  if (!found) return;
  telemetry.setScenario(id);
  say(found.whisper);
  paint(true);
  ear.blip();
}

function cycleScenario() {
  const current = telemetry.state.scenario;
  const index = SCENARIOS.findIndex((item) => item.id === current);
  setScenario(SCENARIOS[(index + 1) % SCENARIOS.length].id);
}

async function toggleEar() {
  try {
    const on = await ear.toggle();
    say(on ? "La lámpara enciende el oído." : "Silencio en el módulo.");
    paint(true);
  } catch {
    say("Este cristal no dejó salir el sonido.");
  }
}

function onPick(hit) {
  if (!hit) return;
  if (hit.pick === "page") {
    const picked = pickRightPage(hit.uv, ui.chapter != null);
    if (!picked) return;
    if (picked.type === "back") setChapter(null);
    if (picked.type === "chapter") setChapter(picked.index);
    return;
  }
  if (hit.pick === "diario") {
    ui.chapter = null;
    setMode("diario");
    return;
  }
  if (hit.pick === "reloj") setMode("reloj");
  if (hit.pick === "casco") setMode("casco");
  if (hit.pick === "switch") cycleScenario();
  if (hit.pick === "lamp") toggleEar();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  telemetry.step(dt);
  const snap = paint();
  if (world?.hover?.pick === "page" && ui.chapter == null) {
    const picked = pickRightPage(world.hover.uv, false);
    const next = picked?.type === "chapter" ? picked.index : null;
    if (next !== ui.hover) {
      ui.hover = next;
      paint(true);
    }
  } else if (ui.hover != null && world?.hover?.pick !== "page") {
    ui.hover = null;
    paint(true);
  }
  ear.update(snap);
  world.update(dt, snap, ui, pointer);
  requestAnimationFrame(frame);
}

async function loadFonts() {
  const specs = ["500 32px Caveat", "700 32px Caveat", "28px 'Russo One'", "20px 'Share Tech Mono'"];
  await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => null)));
  await document.fonts.ready;
}

function grain() {
  const noise = document.createElement("canvas");
  noise.width = 140;
  noise.height = 140;
  const ctx = noise.getContext("2d");
  const image = ctx.createImageData(140, 140);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = 80 + Math.random() * 100;
    image.data[i] = n;
    image.data[i + 1] = n;
    image.data[i + 2] = n;
    image.data[i + 3] = 55;
  }
  ctx.putImageData(image, 0, 0);
  document.getElementById("grain").style.backgroundImage = `url(${noise.toDataURL()})`;
}

function bootError(message) {
  boot.classList.remove("gone");
  boot.textContent = message;
}

async function start() {
  grain();
  if (q.get("mirada")) ui.mode = q.get("mirada");
  if (q.get("capitulo") != null && q.get("capitulo") !== "") ui.chapter = Number(q.get("capitulo"));
  if (q.get("incidente")) telemetry.setScenario(q.get("incidente"));
  await loadFonts();
  telemetry.step(0.016);
  sheets = createSheets();
  paint(true);
  world = createWorld(canvas, sheets);
  paint(true);
  window.addEventListener("resize", () => world.resize());
  boot.classList.add("gone");
  say("Tres miradas para el mismo cuerpo. Diario, reloj, casco.");
  requestAnimationFrame(frame);
}

window.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.nx = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.ny = (event.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  const hit = world?.pick(event.clientX, event.clientY);
  onPick(hit);
});

document.getElementById("modes").addEventListener("click", (event) => {
  const button = event.target.closest("[data-mode]");
  if (button) setMode(button.dataset.mode);
});

document.getElementById("incidents").addEventListener("click", (event) => {
  const button = event.target.closest("[data-incident]");
  if (button) setScenario(button.dataset.incident);
});

lampBtn.addEventListener("click", () => toggleEar());

window.addEventListener("keydown", (event) => {
  if (event.key >= "1" && event.key <= "6") setChapter(Number(event.key) - 1);
  else if (event.key === "Escape" || event.key === "Backspace") {
    if (ui.chapter != null && ui.mode === "diario") setChapter(null);
    else if (ui.mode !== "diario") setMode("diario");
    else if (ui.chapter != null) setChapter(null);
  } else if (event.key === "d" || event.key === "D") setMode("diario");
  else if (event.key === "r" || event.key === "R") setMode("reloj");
  else if (event.key === "c" || event.key === "C") setMode("casco");
  else if (event.key === "m" || event.key === "M") toggleEar();
  else if (event.key === "Tab") {
    event.preventDefault();
    cycleScenario();
  } else if (event.key === "f" || event.key === "F") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
});

start().catch((error) => {
  console.error(error);
  bootError("La lámpara no encendió. Recargá la página.");
});
