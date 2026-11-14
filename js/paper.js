import {
  CHAPTERS,
  INDEX_BASELINES,
  PAGE_H,
  PAGE_W,
  STATUS_LABEL,
  STATUS_RU,
} from "./content.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPaper(ctx) {
  const rnd = mulberry32(214);
  ctx.fillStyle = "#cbb892";
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  for (let i = 0; i < 22000; i += 1) {
    const x = rnd() * PAGE_W;
    const y = rnd() * PAGE_H;
    const shade = rnd() > 0.5 ? 90 : 40;
    ctx.fillStyle = `rgba(${shade + 30}, ${shade + 10}, ${shade}, ${0.03 + rnd() * 0.05})`;
    ctx.fillRect(x, y, 1 + rnd() * 2.2, 1);
  }

  ctx.strokeStyle = "rgba(96, 118, 150, 0.16)";
  ctx.lineWidth = 1;
  for (let y = 150; y < PAGE_H - 70; y += 36) {
    ctx.beginPath();
    ctx.moveTo(86, y + Math.sin(y * 0.01) * 0.6);
    ctx.lineTo(PAGE_W - 48, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(168, 64, 52, 0.45)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(78, 36);
  ctx.lineTo(74, PAGE_H - 36);
  ctx.stroke();

  const edge = ctx.createLinearGradient(0, 0, PAGE_W, 0);
  edge.addColorStop(0, "rgba(90, 60, 30, 0.28)");
  edge.addColorStop(0.08, "rgba(90, 60, 30, 0)");
  edge.addColorStop(0.92, "rgba(90, 60, 30, 0)");
  edge.addColorStop(1, "rgba(90, 60, 30, 0.33)");
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const burn = ctx.createRadialGradient(PAGE_W / 2, PAGE_H / 2, PAGE_W * 0.25, PAGE_W / 2, PAGE_H / 2, PAGE_W * 0.78);
  burn.addColorStop(0, "rgba(0,0,0,0)");
  burn.addColorStop(1, "rgba(92, 58, 24, 0.28)");
  ctx.fillStyle = burn;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  stain(ctx, 820, 250, 120, 0.22);
  stain(ctx, 180, 1240, 70, 0.16);
  stain(ctx, 640, 1320, 46, 0.12);

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  nick(ctx, 0, 180, 14, 22);
  nick(ctx, PAGE_W, 860, 18, 16);
  nick(ctx, 240, 0, 26, 10);
  ctx.restore();
}

function stain(ctx, x, y, r, alpha) {
  const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
  g.addColorStop(0, `rgba(92, 58, 28, ${alpha})`);
  g.addColorStop(0.6, `rgba(120, 78, 40, ${alpha * 0.55})`);
  g.addColorStop(1, "rgba(120, 78, 40, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.82, 0.4, 0, Math.PI * 2);
  ctx.fill();
}

function nick(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0.2, 0, Math.PI * 2);
  ctx.fill();
}

function write(ctx, text, x, y, size, opt = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(opt.rot ?? 0);
  const weight = opt.weight ?? 500;
  const family = opt.family ?? "Caveat, cursive";
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = opt.color ?? "rgba(18, 12, 8, 0.94)";
  ctx.textAlign = opt.align ?? "left";
  ctx.textBaseline = opt.baseline ?? "alphabetic";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function pen(ctx, draw, color = "rgba(36, 28, 20, 0.84)", width = 1.7) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.globalAlpha = 0.38;
  ctx.translate(1.1, 0.6);
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}

function underline(ctx, x, y, width) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(32, 24, 18, 0.8)";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= 30; i += 1) {
    const p = i / 30;
    ctx.lineTo(p * width, Math.sin(p * 17) * 1.25);
  }
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.translate(0.8, 0.5);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 1; i <= 30; i += 1) {
    const p = i / 30;
    ctx.lineTo(p * width, Math.sin(p * 17) * 1.25);
  }
  ctx.stroke();
  ctx.restore();
}

function inkStamp(ctx, x, y, level) {
  const color =
    level === "bad" ? "rgba(154, 36, 28, 0.9)" : level === "watch" ? "rgba(146, 88, 24, 0.9)" : "rgba(34, 96, 52, 0.88)";
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.1);
  ctx.translate(1.5, 1);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 6;
  ctx.strokeRect(-124, -54, 248, 112);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.strokeRect(-124, -54, 248, 112);
  ctx.lineWidth = 1.6;
  ctx.strokeRect(-112, -42, 224, 88);
  ctx.fillStyle = color;
  ctx.font = "30px 'Russo One', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(STATUS_RU[level], 0, -10);
  ctx.font = "500 24px Caveat, cursive";
  ctx.fillText(STATUS_LABEL[level], 0, 26);
  ctx.restore();
}

function polaroid(ctx) {
  ctx.save();
  ctx.translate(690, 470);
  ctx.rotate(-0.09);
  ctx.fillStyle = "rgba(210, 190, 140, 0.55)";
  ctx.fillRect(-86, -150, 52, 18);
  ctx.fillRect(40, -154, 58, 16);
  ctx.fillStyle = "#f6f1e6";
  ctx.fillRect(-96, -128, 196, 230);
  ctx.fillStyle = "#14324c";
  ctx.fillRect(-80, -112, 164, 150);
  ctx.fillStyle = "#2f74aa";
  ctx.beginPath();
  ctx.arc(2, -40, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#7d9a68";
  ctx.beginPath();
  ctx.ellipse(-8, -52, 22, 12, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(20, -24, 16, 9, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(24, -58, 18, 7, 0.6, 0, Math.PI * 2);
  ctx.fill();
  write(ctx, "desde la escotilla", 2, 78, 24, { align: "center", color: "rgba(40,32,24,0.8)" });
  ctx.restore();
}

function sketchHeart(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.moveTo(0, 36);
    c.bezierCurveTo(-90, -10, -58, -78, 0, -28);
    c.bezierCurveTo(58, -78, 90, -10, 0, 36);
  }, "rgba(70, 28, 24, 0.8)", 2);
  pen(ctx, (c) => {
    c.moveTo(0, -28);
    c.lineTo(8, -70);
    c.moveTo(18, -20);
    c.lineTo(46, -48);
  }, "rgba(36,28,20,0.55)", 1.3);
  ctx.restore();
}

function sketchLungs(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.moveTo(0, -70);
    c.lineTo(0, 10);
    c.moveTo(0, -20);
    c.bezierCurveTo(-30, -20, -70, 10, -50, 70);
    c.bezierCurveTo(-20, 86, -10, 20, 0, 10);
    c.moveTo(0, -20);
    c.bezierCurveTo(30, -20, 70, 10, 50, 70);
    c.bezierCurveTo(20, 86, 10, 20, 0, 10);
  });
  ctx.restore();
}

function sketchTrefoil(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.arc(0, -36, 28, 0.2, Math.PI - 0.2);
    c.moveTo(0, 8);
    c.arc(-32, 22, 28, Math.PI * 1.15, Math.PI * 1.95);
    c.moveTo(0, 8);
    c.arc(32, 22, 28, Math.PI * 1.2, Math.PI * 0.15);
    c.moveTo(-8, 36);
    c.lineTo(-18, 78);
    c.lineTo(18, 78);
    c.lineTo(8, 36);
  }, "rgba(90, 32, 24, 0.85)", 2);
  ctx.restore();
}

function sketchSuit(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.arc(0, -48, 34, 0.15, Math.PI - 0.15);
    c.moveTo(-24, -28);
    c.quadraticCurveTo(-46, 20, -36, 78);
    c.lineTo(36, 78);
    c.quadraticCurveTo(46, 20, 24, -28);
    c.moveTo(36, 10);
    c.lineTo(68, 18);
    c.lineTo(62, 48);
    c.lineTo(34, 40);
  });
  pen(ctx, (c) => {
    c.moveTo(-16, -52);
    c.quadraticCurveTo(0, -36, 16, -52);
  }, "rgba(120, 86, 30, 0.9)", 2.4);
  ctx.restore();
}

function sketchSleep(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.arc(0, 0, 46, Math.PI * 0.05, Math.PI * 0.95);
    c.moveTo(-30, 6);
    c.quadraticCurveTo(0, 18, 30, 6);
  });
  pen(ctx, (c) => {
    c.arc(78, 40, 26, 0, Math.PI * 2);
  }, "rgba(36,28,20,0.7)", 1.4);
  write(ctx, "90 min", 78, 86, 22, { align: "center", color: "rgba(36,28,20,0.7)" });
  ctx.restore();
}

function sketchWater(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  pen(ctx, (c) => {
    c.moveTo(-28, -20);
    c.lineTo(-36, 60);
    c.quadraticCurveTo(0, 86, 36, 60);
    c.lineTo(28, -20);
    c.closePath();
    c.moveTo(-18, 10);
    c.lineTo(22, 8);
  });
  pen(ctx, (c) => {
    c.moveTo(70, -30);
    c.bezierCurveTo(90, -10, 78, 20, 70, 36);
    c.bezierCurveTo(60, 20, 54, 0, 70, -30);
  }, "rgba(30, 70, 110, 0.75)", 1.6);
  ctx.restore();
}

const SKETCHES = {
  heart: sketchHeart,
  lungs: sketchLungs,
  trefoil: sketchTrefoil,
  suit: sketchSuit,
  sleep: sketchSleep,
  water: sketchWater,
};

function historyLine(ctx, snap, id, x, y, w, h) {
  const buffer = id === "pulso" ? snap.ecg : snap.history[id];
  const length = buffer.length;
  const count = Math.min(snap.histI, length);
  if (count < 2) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(70, 40, 28, 0.45)";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.stroke();
  ctx.strokeStyle = "rgba(42, 28, 20, 0.82)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  let min = Infinity;
  let max = -Infinity;
  const values = [];
  for (let k = 0; k < count; k += 1) {
    const index = (snap.histI - count + k + length) % length;
    const value = buffer[index];
    values.push(value);
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;
  values.forEach((value, i) => {
    const px = (i / (count - 1)) * w;
    const py = h - ((value - min) / span) * (h - 8) - 4;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

function paintLeft(ctx, base, snap) {
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  ctx.drawImage(base, 0, 0);
  write(ctx, `ВИТОК 214   ·   DÍA 18   ·   ${snap.clock}`, 110, 118, 26, {
    family: "'Russo One', sans-serif",
    color: "rgba(70, 36, 28, 0.8)",
  });
  write(ctx, "bitácora", 108, 230, 108, { weight: 700, rot: -0.015 });
  write(ctx, "de a bordo", 118, 290, 40, { rot: -0.01, color: "rgba(32,24,18,0.75)" });
  ctx.strokeStyle = "rgba(32,24,18,0.35)";
  ctx.beginPath();
  ctx.moveTo(110, 318);
  ctx.lineTo(520, 324);
  ctx.stroke();

  sketchSuit(ctx, 250, 500);
  polaroid(ctx);

  write(ctx, "N. Varela", 112, 760, 52, { weight: 700 });
  write(ctx, "ingeniería de vuelo  ·  estación Zarya", 114, 808, 28, {
    color: "rgba(32,24,18,0.75)",
  });
  write(ctx, "408 km  ·  órbita baja", 114, 848, 26, { color: "rgba(32,24,18,0.62)" });

  const lines = [
    "Esto no es una pantalla.",
    "Es lo que tengo a mano cuando",
    "el módulo se queda en silencio.",
    "",
    "Tres maneras de mirarme.",
    "El diario, para pensar.",
    "El reloj, para no soltar el trabajo.",
    "El casco, para cuando afuera",
    "no hay pared.",
    "",
    "Si una no sirve, se tacha.",
  ];
  lines.forEach((line, i) => {
    if (!line) return;
    write(ctx, line, 114, 930 + i * 34, 30, { rot: (i % 3) * 0.002 - 0.008 });
  });

  inkStamp(ctx, 760, 1040, snap.worst);
  write(ctx, snap.scenario.note, 112, 1328, 28, {
    rot: -0.01,
    color: "rgba(90, 40, 28, 0.85)",
  });
  write(ctx, "— 18 —", PAGE_W / 2, 1372, 24, {
    align: "center",
    color: "rgba(32,24,18,0.55)",
  });
}

function paintIndex(ctx, base, snap, hover) {
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  ctx.drawImage(base, 0, 0);
  write(ctx, "ЖУРНАЛ ЗДОРОВЬЯ", 110, 130, 26, {
    family: "'Russo One', sans-serif",
    color: "rgba(92, 36, 28, 0.78)",
  });
  write(ctx, "el cuerpo, hoy", 104, 230, 78, { weight: 700, rot: -0.012 });
  write(ctx, "tocá una línea. la aguja de al lado obedece.", 110, 286, 28, {
    color: "rgba(32,24,18,0.62)",
  });

  CHAPTERS.forEach((chapter, i) => {
    const y = INDEX_BASELINES[i];
    const hot = hover === i;
    if (hot) {
      ctx.fillStyle = "rgba(120, 78, 30, 0.08)";
      ctx.fillRect(90, y - 58, 860, 100);
      underline(ctx, 188, y + 14, 360);
    }
    write(ctx, chapter.num, 112, y, 42, {
      color: hot ? "rgba(20,14,10,0.95)" : "rgba(32,24,18,0.78)",
    });
    write(ctx, chapter.title, 190, y, 52, {
      weight: 700,
      rot: -0.008 + i * 0.002,
      color: hot ? "rgba(16,12,8,0.96)" : "rgba(32,24,18,0.9)",
    });
    write(ctx, chapter.ru, 196, y + 32, 18, {
      family: "'Russo One', sans-serif",
      color: "rgba(80, 40, 28, 0.55)",
    });
    const level = snap.judge[chapter.id];
    const color =
      level === "bad" ? "rgba(150, 36, 28, 0.95)" : level === "watch" ? "rgba(140, 84, 22, 0.95)" : "rgba(36, 90, 48, 0.85)";
    const label = STATUS_LABEL[level];
    const cause = chapter.id === "oxigeno" ? snap.o2Cause : "";
    if (cause) {
      ctx.font = "500 30px Caveat, cursive";
      const labelW = ctx.measureText(label).width;
      write(ctx, cause, 914 - labelW, y, 20, {
        align: "right",
        family: "'Share Tech Mono', monospace",
        color,
      });
    }
    write(ctx, label, 930, y, 30, { align: "right", color });
    write(ctx, snap.values[chapter.id], 930, y + 30, 20, {
      align: "right",
      family: "'Share Tech Mono', monospace",
      color: "rgba(32,24,18,0.55)",
    });
  });

  const foot = [
    "El reloj está a la derecha.",
    "El casco, a la izquierda.",
    "La perilla de adelante cambia el día.",
    "La lámpara enciende el oído.",
  ];
  foot.forEach((line, i) => {
    write(ctx, line, 112, 1208 + i * 34, 28, { color: "rgba(32,24,18,0.72)", rot: -0.006 });
  });
}

function paintChapter(ctx, base, snap, index) {
  const chapter = CHAPTERS[index];
  const level = snap.judge[chapter.id];
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  ctx.drawImage(base, 0, 0);
  write(ctx, "volver", 860, 118, 32, { align: "right", color: "rgba(32,24,18,0.7)" });
  underline(ctx, 760, 128, 100);
  write(ctx, chapter.ru, 112, 150, 22, {
    family: "'Russo One', sans-serif",
    color: "rgba(92, 36, 28, 0.75)",
  });
  write(ctx, `${chapter.num}   ${chapter.title}`, 104, 230, 64, { weight: 700, rot: -0.012 });

  const sketch = SKETCHES[chapter.sketch];
  if (sketch) sketch(ctx, 250, 520);

  const value = snap.values[chapter.id];
  chapter.lines.forEach((line, i) => {
    write(ctx, line.replace("{v}", value), 500, 360 + i * 46, 34, { rot: -0.01 + (i % 2) * 0.008 });
  });
  if (chapter.id === "oxigeno") {
    write(ctx, `SpO2 ${snap.extra.spo2}    CO2 ${snap.extra.co2}%`, 500, 660, 28, {
      color: "rgba(32,24,18,0.7)",
    });
  }
  if (chapter.id === "traje") {
    write(ctx, `piel ${snap.extra.temp} °C`, 500, 660, 28, { color: "rgba(32,24,18,0.7)" });
  }

  write(ctx, value, 760, 900, 120, { weight: 700, align: "center", rot: -0.03 });
  write(ctx, chapter.unit, 760, 940, 28, { align: "center", color: "rgba(32,24,18,0.65)" });

  historyLine(ctx, snap, chapter.id, 110, 1040, 800, 120);
  inkStamp(ctx, 250, 1260, level);
  if (chapter.id === "oxigeno" && snap.o2Cause) {
    const color = level === "bad" ? "rgba(150, 36, 28, 0.95)" : "rgba(140, 84, 22, 0.95)";
    write(ctx, snap.o2Cause, 430, 1196, 28, {
      family: "'Share Tech Mono', monospace",
      color,
    });
  }
  write(ctx, snap.scenario.note, 420, 1288, 26, { color: "rgba(80, 36, 28, 0.8)" });
}

export function createSheets() {
  const base = document.createElement("canvas");
  base.width = PAGE_W;
  base.height = PAGE_H;
  drawPaper(base.getContext("2d"));

  function sheet() {
    const canvas = document.createElement("canvas");
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    return { canvas, ctx: canvas.getContext("2d") };
  }

  const left = sheet();
  const right = sheet();
  return {
    left: left.canvas,
    right: right.canvas,
    redraw(snap, ui) {
      paintLeft(left.ctx, base, snap);
      if (ui.chapter == null) paintIndex(right.ctx, base, snap, ui.hover);
      else paintChapter(right.ctx, base, snap, ui.chapter);
    },
  };
}

export function pickRightPage(uv, chapterOpen) {
  if (!uv) return null;
  const x = uv.x * PAGE_W;
  const y = (1 - uv.y) * PAGE_H;
  if (chapterOpen) {
    if (y < 210 && x > 700) return { type: "back" };
    return null;
  }
  if (x < 90 || x > 980) return null;
  for (let i = 0; i < INDEX_BASELINES.length; i += 1) {
    const baseline = INDEX_BASELINES[i];
    if (y > baseline - 62 && y < baseline + 48) return { type: "chapter", index: i };
  }
  return null;
}
