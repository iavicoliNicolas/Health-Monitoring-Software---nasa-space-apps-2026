export function unitT(value, min, max) {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export function logT(value, min, max) {
  const v = Math.log(Math.max(value, min));
  return Math.min(1, Math.max(0, (v - Math.log(min)) / (Math.log(max) - Math.log(min))));
}

export function gaugeRotationY(t) {
  const deg = 210 + t * 300;
  return (-deg * Math.PI) / 180;
}

function polar(cx, cy, degFromNoon, radius) {
  const a = (degFromNoon * Math.PI) / 180;
  return [cx + Math.sin(a) * radius, cy - Math.cos(a) * radius];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function paintStaticDial(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const cx = 256;
  const cy = 256;
  const face = ctx.createRadialGradient(cx, cy, 20, cx, cy, 250);
  if (kind === "heart") {
    face.addColorStop(0, "#f3e6cb");
    face.addColorStop(1, "#d9c39a");
  } else if (kind === "co2") {
    face.addColorStop(0, "#efe2c8");
    face.addColorStop(1, "#c9b18a");
  } else {
    face.addColorStop(0, "#e7f0ea");
    face.addColorStop(1, "#b7c9be");
  }
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(40, 32, 24, 0.35)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 232, 0, Math.PI * 2);
  ctx.stroke();

  const spec = {
    heart: { label: "ПУЛЬС", marks: [40, 80, 120, 160], min: 40, max: 170, danger: 0.72 },
    o2: { label: "O2", marks: [0, 25, 50, 75, 100], min: 0, max: 100, danger: 0.22, invert: true },
    co2: { label: "CO2", marks: [0, 0.5, 1, 1.5, 2], min: 0, max: 2, danger: 0.55 },
  }[kind];

  ctx.lineCap = "round";
  for (let i = 0; i <= 40; i += 1) {
    const t = i / 40;
    const deg = 210 + t * 300;
    const outer = polar(cx, cy, deg, 214);
    const inner = polar(cx, cy, deg, i % 5 === 0 ? 188 : 200);
    ctx.strokeStyle = "rgba(28, 22, 16, 0.8)";
    ctx.lineWidth = i % 5 === 0 ? 3 : 1.2;
    ctx.beginPath();
    ctx.moveTo(inner[0], inner[1]);
    ctx.lineTo(outer[0], outer[1]);
    ctx.stroke();
  }

  ctx.strokeStyle = kind === "o2" ? "rgba(150, 48, 32, 0.8)" : "rgba(150, 48, 32, 0.75)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  const dangerStart = spec.invert ? 0 : spec.danger;
  const dangerEnd = spec.invert ? spec.danger : 1;
  const a0 = ((210 + dangerStart * 300 - 90) * Math.PI) / 180;
  const a1 = ((210 + dangerEnd * 300 - 90) * Math.PI) / 180;
  ctx.arc(cx, cy, 168, a0, a1);
  ctx.stroke();

  ctx.fillStyle = "#241c14";
  ctx.font = "20px 'Russo One', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const mark of spec.marks) {
    const t = (mark - spec.min) / (spec.max - spec.min);
    const p = polar(cx, cy, 210 + t * 300, 158);
    const text = Number.isInteger(mark) ? String(mark) : mark.toFixed(1);
    ctx.fillText(text, p[0], p[1]);
  }

  ctx.font = "28px 'Russo One', sans-serif";
  ctx.fillText(spec.label, cx, cy - 48);
  ctx.font = "500 22px Caveat, cursive";
  ctx.fillStyle = "rgba(36, 28, 20, 0.75)";
  const sub = { heart: "ud / min", o2: "tanque", co2: "scrubber" }[kind];
  ctx.fillText(sub, cx, cy + 78);

  ctx.fillStyle = "#2a241c";
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function drawWatchBase(ctx) {
  const cx = 512;
  const cy = 512;
  const bg = ctx.createRadialGradient(cx - 40, cy - 60, 40, cx, cy, 500);
  bg.addColorStop(0, "#314838");
  bg.addColorStop(0.55, "#1a2b20");
  bg.addColorStop(1, "#0b120e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.strokeStyle = "rgba(214, 206, 184, 0.55)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 470, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineCap = "round";
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const deg = 210 + t * 300;
    const outer = polar(cx, cy, deg, 448);
    const inner = polar(cx, cy, deg, i % 5 === 0 ? 400 : 424);
    const danger = t > 0.78;
    ctx.strokeStyle = danger ? "rgba(214, 92, 64, 0.95)" : "rgba(226, 220, 196, 0.9)";
    ctx.lineWidth = i % 5 === 0 ? 6 : 2;
    ctx.beginPath();
    ctx.moveTo(inner[0], inner[1]);
    ctx.lineTo(outer[0], outer[1]);
    ctx.stroke();
  }

  const labels = [0.05, 0.2, 0.5, 1, 3, 6];
  ctx.fillStyle = "#e6efd4";
  ctx.font = "26px 'Share Tech Mono', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const value of labels) {
    const t = logT(value, 0.05, 6);
    const p = polar(cx, cy, 210 + t * 300, 360);
    ctx.fillText(value < 1 ? value.toFixed(2) : String(value), p[0], p[1]);
  }

  ctx.font = "34px 'Russo One', sans-serif";
  ctx.fillStyle = "#d5e7b8";
  ctx.fillText("ДОЗИМЕТР", cx, cy - 250);
  ctx.font = "22px 'Russo One', sans-serif";
  ctx.fillStyle = "rgba(213, 231, 184, 0.7)";
  ctx.fillText("ZARYA", cx, cy + 250);

  ctx.strokeStyle = "rgba(214, 92, 64, 0.9)";
  ctx.lineWidth = 14;
  ctx.beginPath();
  const a0 = ((210 + 0.78 * 300 - 90) * Math.PI) / 180;
  const a1 = ((210 + 300 - 90) * Math.PI) / 180;
  ctx.arc(cx, cy, 332, a0, a1);
  ctx.stroke();
}

function subdial(ctx, cx, cy, label, t, danger) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, 78, 0, Math.PI * 2);
  ctx.fillStyle = "#101910";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(214, 206, 184, 0.7)";
  ctx.stroke();
  ctx.strokeStyle = "rgba(214, 206, 184, 0.85)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 20; i += 1) {
    const deg = 210 + (i / 20) * 300;
    const a = (deg * Math.PI) / 180;
    const inner = i % 5 === 0 ? 58 : 64;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * inner, -Math.cos(a) * inner);
    ctx.lineTo(Math.sin(a) * 72, -Math.cos(a) * 72);
    ctx.stroke();
  }
  const deg = 210 + Math.min(1, Math.max(0, t)) * 300;
  const a = (deg * Math.PI) / 180;
  ctx.strokeStyle = danger ? "#ff6a45" : "#e4f2a8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-Math.sin(a) * 12, Math.cos(a) * 12);
  ctx.lineTo(Math.sin(a) * 52, -Math.cos(a) * 52);
  ctx.stroke();
  ctx.fillStyle = "#d7e7c4";
  ctx.font = "16px 'Russo One', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 96);
  ctx.restore();
}

export function createWatchPainter() {
  const base = document.createElement("canvas");
  base.width = 1024;
  base.height = 1024;
  drawWatchBase(base.getContext("2d"));
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");

  function paint(snap) {
    const r = snap.readings;
    const j = snap.judge;
    ctx.clearRect(0, 0, 1024, 1024);
    ctx.drawImage(base, 0, 0);
    subdial(ctx, 512 - 210, 512 + 40, "ПУЛЬС", unitT(r.hr, 40, 170), j.pulso !== "ok");
    subdial(ctx, 512 + 210, 512 + 40, "O2", unitT(r.o2, 0, 100), j.oxigeno !== "ok");
    subdial(ctx, 512, 512 + 230, "PSI", unitT(r.psi, 2, 5), j.traje !== "ok");

    ctx.fillStyle = "#0e160f";
    roundRect(ctx, 430, 300, 164, 54, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(214, 206, 184, 0.55)";
    ctx.stroke();
    ctx.fillStyle = "#e7f0c8";
    ctx.font = "22px 'Share Tech Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`214  ${snap.clock.slice(0, 5)}`, 512, 328);

    ctx.fillStyle = "#c5d7a4";
    ctx.beginPath();
    ctx.arc(512, 512, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  paint(fakeSnap());
  return { canvas, paint };
}

function fakeSnap() {
  return {
    clock: "03:41",
    readings: { hr: 68, o2: 76, psi: 4.3 },
    judge: { pulso: "ok", oxigeno: "ok", traje: "ok" },
  };
}
