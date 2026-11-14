import assert from "node:assert/strict";
import { test } from "node:test";
import { PULSE_DIAL } from "../js/dials.js";
import { judgeOf, oxygenCause, PULSE_BAD, TARGETS } from "../js/telemetry.js";

const quiet = { ...TARGETS.norma };

test("los incidentes sellan lo que nombran", () => {
  assert.deepEqual(judgeOf(TARGETS.norma), {
    pulso: "ok",
    oxigeno: "ok",
    radiacion: "ok",
    traje: "ok",
    sueno: "ok",
    agua: "ok",
  });
  assert.equal(oxygenCause(TARGETS.norma), "");

  const oxigeno = judgeOf(TARGETS.oxigeno);
  assert.equal(oxigeno.oxigeno, "bad");
  assert.equal(oxigeno.pulso, "bad");
  assert.equal(oxygenCause(TARGETS.oxigeno), "");

  assert.equal(judgeOf(TARGETS.llamarada).radiacion, "bad");
  assert.equal(judgeOf(TARGETS.llamarada).pulso, "ok");

  const fuga = judgeOf(TARGETS.fuga);
  assert.equal(fuga.oxigeno, "bad");
  assert.equal(fuga.traje, "bad");
  assert.equal(oxygenCause(TARGETS.fuga), "SpO2 91");
  assert.equal(judgeOf({ ...TARGETS.fuga, spo2: 98 }).oxigeno, "ok");
  assert.equal(oxygenCause({ ...quiet, o2: 30, spo2: 94 }), "");
  assert.equal(oxygenCause({ ...quiet, o2: 30, spo2: 91 }), "SpO2 91");
  assert.equal(oxygenCause({ ...quiet, co2: 1.2 }), "CO2 1.20");

  const desvelo = judgeOf(TARGETS.desvelo);
  assert.equal(desvelo.sueno, "bad");
  assert.equal(desvelo.agua, "bad");
  assert.equal(desvelo.pulso, "ok");
  assert.equal(desvelo.oxigeno, "ok");
});

test("el pulso no sale recién arriba de cien", () => {
  assert.equal(PULSE_BAD, 100);
  assert.equal(judgeOf({ ...quiet, hr: 100 }).pulso, "watch");
  assert.equal(judgeOf({ ...quiet, hr: 101 }).pulso, "bad");
  assert.equal(PULSE_DIAL.bad, PULSE_BAD);
  assert.equal((PULSE_DIAL.bad - PULSE_DIAL.min) / (PULSE_DIAL.max - PULSE_DIAL.min), (100 - 40) / (170 - 40));
});
