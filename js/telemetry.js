import { CHAPTERS, SCENARIOS } from "./content.js";

export const PULSE_BAD = 100;

export const TARGETS = {
  norma: {
    hr: 68,
    o2: 76,
    rad: 0.11,
    psi: 4.3,
    spo2: 98,
    co2: 0.34,
    temp: 36.6,
    hydration: 71,
    sleep: 7.1,
  },
  oxigeno: {
    hr: 108,
    o2: 17,
    rad: 0.15,
    psi: 4.18,
    spo2: 89,
    co2: 1.45,
    temp: 36.9,
    hydration: 64,
    sleep: 7.1,
  },
  llamarada: {
    hr: 94,
    o2: 74,
    rad: 3.6,
    psi: 4.26,
    spo2: 97,
    co2: 0.42,
    temp: 37.4,
    hydration: 70,
    sleep: 7.1,
  },
  fuga: {
    hr: 122,
    o2: 61,
    rad: 0.18,
    psi: 2.45,
    spo2: 91,
    co2: 0.58,
    temp: 36.4,
    hydration: 68,
    sleep: 7.1,
  },
  desvelo: {
    hr: 88,
    o2: 73,
    rad: 0.12,
    psi: 4.22,
    spo2: 97,
    co2: 0.36,
    temp: 36.5,
    hydration: 38,
    sleep: 3.4,
  },
};

const RANK = { ok: 0, watch: 1, bad: 2 };

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function approach(current, target, dt, rate) {
  const k = 1 - Math.exp(-dt * rate);
  return current + (target - current) * k;
}

function formatClock(total) {
  const s = Math.floor(total);
  const h = Math.floor(s / 3600) % 24;
  const m = Math.floor(s / 60) % 60;
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function ecgWave(phase) {
  const x = phase - Math.floor(phase);
  if (x < 0.08) return 0;
  if (x < 0.16) return Math.sin(((x - 0.08) / 0.08) * Math.PI) * 0.16;
  if (x < 0.2) return 0;
  if (x < 0.24) return -0.22;
  if (x < 0.28) return 1;
  if (x < 0.33) return -0.38;
  if (x < 0.4) return 0;
  if (x < 0.55) return Math.sin(((x - 0.4) / 0.15) * Math.PI) * 0.28;
  return 0;
}

export function createTelemetry() {
  const history = {};
  for (const c of CHAPTERS) history[c.id] = new Float32Array(120);
  const state = {
    t: 0,
    missionSeconds: 3 * 3600 + 41 * 60 + 12,
    scenario: "norma",
    hr: 68,
    o2: 76,
    rad: 0.11,
    psi: 4.3,
    spo2: 98,
    co2: 0.34,
    temp: 36.6,
    hydration: 71,
    sleep: 7.1,
    hrPhase: 0,
    beatAge: 1,
    beatEdge: false,
    beat: 0,
    breathPhase: 0,
    breath: 0,
    histI: 0,
    histAcc: 0,
    history,
    ecg: new Float32Array(180),
  };

  function setScenario(id) {
    if (!TARGETS[id]) return;
    state.scenario = id;
  }

  function step(dt) {
    const target = TARGETS[state.scenario];
    state.t += dt;
    state.missionSeconds += dt;
    state.hr = approach(state.hr, target.hr, dt, 1.35);
    state.o2 = approach(state.o2, target.o2, dt, 0.85);
    state.rad = approach(state.rad, target.rad, dt, 1.8);
    state.psi = approach(state.psi, target.psi, dt, 1.15);
    state.spo2 = approach(state.spo2, target.spo2, dt, 0.9);
    state.co2 = approach(state.co2, target.co2, dt, 0.9);
    state.temp = approach(state.temp, target.temp, dt, 0.45);
    state.hydration = approach(state.hydration, target.hydration, dt, 0.55);
    state.sleep = approach(state.sleep, target.sleep, dt, 0.4);

    const prevPhase = state.hrPhase;
    state.hrPhase += (state.hr / 60) * dt;
    state.beatAge += dt;
    if (Math.floor(state.hrPhase) !== Math.floor(prevPhase)) {
      state.beatEdge = true;
      state.beatAge = 0;
    } else {
      state.beatEdge = false;
    }
    state.beat = Math.exp(-state.beatAge * 7.5);

    const breathRate = state.scenario === "oxigeno" || state.scenario === "fuga" ? 0.34 : 0.2;
    state.breathPhase += dt * breathRate;
    state.breath = 0.5 - 0.5 * Math.cos(state.breathPhase * Math.PI * 2);

    state.histAcc += dt;
    const display = readings(state);
    if (state.histAcc >= 0.08) {
      state.histAcc = 0;
      const i = state.histI;
      state.history.pulso[i % 120] = display.hr;
      state.history.oxigeno[i % 120] = display.o2;
      state.history.radiacion[i % 120] = display.rad;
      state.history.traje[i % 120] = display.psi;
      state.history.sueno[i % 120] = display.sleep;
      state.history.agua[i % 120] = display.hydration;
      state.ecg[i % 180] = ecgWave(state.hrPhase);
      state.histI += 1;
    }
  }

  return { state, step, setScenario };
}

export function readings(state) {
  const leakWobble = state.scenario === "fuga" ? Math.sin(state.t * 3.1) * 0.06 : Math.sin(state.t * 0.6) * 0.012;
  const radTwitch = state.scenario === "llamarada" ? Math.sin(state.t * 21) * 0.28 + Math.sin(state.t * 47) * 0.08 : Math.sin(state.t * 4) * 0.008;
  return {
    hr: state.hr + Math.sin(state.t * 2.2) * 0.7,
    o2: clamp(state.o2, 0, 100),
    rad: Math.max(0.02, state.rad + radTwitch),
    psi: Math.max(1.4, state.psi + leakWobble),
    spo2: clamp(state.spo2 + Math.sin(state.t * 1.3) * 0.15, 70, 100),
    co2: Math.max(0.05, state.co2 + Math.sin(state.t * 0.8) * 0.02),
    temp: state.temp,
    hydration: state.hydration,
    sleep: state.sleep,
  };
}

function worse(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

function oxygenReading(r) {
  const tank = r.o2 < 22 ? "bad" : r.o2 < 45 ? "watch" : "ok";
  const spo2 = r.spo2 < 92 ? "bad" : r.spo2 < 96 ? "watch" : "ok";
  const co2 = r.co2 > 0.85 ? "watch" : "ok";
  const level = worse(worse(tank, spo2), co2);
  let cause = "";
  if (RANK[tank] < RANK[level]) {
    cause = RANK[spo2] >= RANK[level] ? `SpO2 ${Math.round(r.spo2)}` : `CO2 ${r.co2.toFixed(2)}`;
  }
  return { level, cause };
}

export function judgeOf(r) {
  return {
    pulso: r.hr > PULSE_BAD ? "bad" : r.hr > 96 ? "watch" : "ok",
    oxigeno: oxygenReading(r).level,
    radiacion: r.rad > 1.05 ? "bad" : r.rad > 0.4 ? "watch" : "ok",
    traje: r.psi < 3.05 ? "bad" : r.psi < 3.85 ? "watch" : "ok",
    sueno: r.sleep < 5 ? "bad" : r.sleep < 6.4 ? "watch" : "ok",
    agua: r.hydration < 45 ? "bad" : r.hydration < 60 ? "watch" : "ok",
  };
}

export function oxygenCause(r) {
  return oxygenReading(r).cause;
}

export function worstOf(judge) {
  let worst = "ok";
  for (const key of Object.keys(judge)) {
    if (RANK[judge[key]] > RANK[worst]) worst = judge[key];
  }
  return worst;
}

export function formatValue(id, r) {
  switch (id) {
    case "pulso":
      return String(Math.round(r.hr));
    case "oxigeno":
      return String(Math.round(r.o2));
    case "radiacion":
      return r.rad < 1 ? r.rad.toFixed(2) : r.rad.toFixed(1);
    case "traje":
      return r.psi.toFixed(2);
    case "sueno":
      return r.sleep.toFixed(1);
    case "agua":
      return String(Math.round(r.hydration));
    default:
      return "—";
  }
}

export function snapshot(state) {
  const r = readings(state);
  const judge = judgeOf(r);
  const scenario = SCENARIOS.find((s) => s.id === state.scenario) ?? SCENARIOS[0];
  const values = {};
  for (const c of CHAPTERS) values[c.id] = formatValue(c.id, r);
  return {
    t: state.t,
    clock: formatClock(state.missionSeconds),
    scenario,
    values,
    extra: {
      spo2: Math.round(r.spo2),
      co2: r.co2.toFixed(2),
      temp: r.temp.toFixed(1),
    },
    judge,
    o2Cause: oxygenCause(r),
    worst: worstOf(judge),
    readings: r,
    breath: state.breath,
    beat: state.beat,
    beatEdge: state.beatEdge,
    history: state.history,
    histI: state.histI,
    ecg: state.ecg,
    raw: state,
  };
}
