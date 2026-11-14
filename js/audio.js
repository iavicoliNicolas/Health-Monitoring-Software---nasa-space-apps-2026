export function createEar() {
  let ctx = null;
  let master = null;
  let breathGain = null;
  let clickBuf = null;
  let thumpBuf = null;
  let enabled = false;

  function brown(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  function bake(seconds, fn) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = fn(i / ctx.sampleRate, i / len);
    return buffer;
  }

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const bed = ctx.createBiquadFilter();
    bed.type = "lowpass";
    bed.frequency.value = 160;
    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.2;
    for (const freq of [46, 46.6, 69]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(bed);
      osc.start();
    }
    bed.connect(bedGain);
    bedGain.connect(master);

    const air = ctx.createBufferSource();
    air.buffer = brown(2);
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 480;
    bp.Q.value = 0.6;
    breathGain = ctx.createGain();
    breathGain.gain.value = 0;
    air.connect(bp);
    bp.connect(breathGain);
    breathGain.connect(master);
    air.start();

    clickBuf = bake(0.03, (_t, u) => (Math.random() * 2 - 1) * Math.exp(-u * 9));
    thumpBuf = bake(0.2, (t) => {
      const env = Math.exp(-t * 26);
      const f = 46 + 30 * Math.exp(-t * 40);
      return Math.sin(2 * Math.PI * f * t) * env;
    });
  }

  function play(buffer, gain, rate) {
    if (!ctx || !enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    get enabled() {
      return enabled;
    },
    async toggle() {
      ensure();
      await ctx.resume();
      enabled = !enabled;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(enabled ? 0.9 : 0, now + 0.22);
      return enabled;
    },
    blip() {
      play(clickBuf, 0.12, 0.7 + Math.random() * 0.3);
    },
    update(snap) {
      if (!ctx || !enabled || !breathGain) return;
      breathGain.gain.setTargetAtTime(0.05 + snap.breath * 0.2, ctx.currentTime, 0.08);
      if (snap.beatEdge) {
        play(thumpBuf, 0.55, 1);
        window.setTimeout(() => play(thumpBuf, 0.28, 1.35), Math.round(14000 / Math.max(48, snap.readings.hr)));
      }
      const rate = Math.min(24, snap.readings.rad * 5.5);
      if (Math.random() < rate / 60) play(clickBuf, 0.18 + Math.random() * 0.25, 0.85 + Math.random() * 0.7);
    },
  };
}
