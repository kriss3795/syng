// Audio: contexto, micrófono con detección de tono, notas de referencia y metrónomo.
import { PitchDetector, PitchSmoother, rms, decimate, freqToMidi, midiToFreq } from './pitch.js';
import { settings } from './store.js';

let ctx = null;
export function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Latencia estimada (s) entre lo que suena y lo que el micrófono capta
export function latency() {
  const c = getCtx();
  const manual = Number(settings().latencyMs);
  if (manual > 0) return manual / 1000;
  return (c.outputLatency || 0) + (c.baseLatency || 0) + 0.03;
}

// ---------- Micrófono ----------
let mic = null;
export async function startMic() {
  const c = getCtx();
  if (mic && mic.stream.active) return mic;
  const ec = !!settings().echoCancel;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: ec, noiseSuppression: false, autoGainControl: false },
  });
  const src = c.createMediaStreamSource(stream);
  const analyser = c.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  src.connect(analyser);
  const factor = Math.max(1, Math.round(c.sampleRate / 24000));
  const sr2 = c.sampleRate / factor;
  const winSize = Math.min(1536, Math.floor(4096 / factor));
  mic = {
    stream, src, analyser, factor, sr2,
    raw: new Float32Array(analyser.fftSize),
    dec: null,
    detector: new PitchDetector(winSize),
    smoother: new PitchSmoother(5),
  };
  return mic;
}

export function stopMic() {
  if (mic) {
    mic.stream.getTracks().forEach((t) => t.stop());
    try { mic.src.disconnect(); } catch (e) {}
    mic = null;
  }
}
export const micStream = () => (mic ? mic.stream : null);

// Lee el tono actual. Devuelve {midi (suavizado), raw, rms, clarity} ; midi = null si no hay voz clara.
export function readPitch() {
  if (!mic) return { midi: null, rms: 0 };
  mic.analyser.getFloatTimeDomainData(mic.raw);
  const level = rms(mic.raw);
  mic.dec = decimate(mic.raw, mic.factor, mic.dec);
  let midi = null, clarity = 0;
  if (level > 0.008) {
    const r = mic.detector.detect(mic.dec, mic.sr2, 65, 1100);
    if (r && r.clarity > 0.85) { midi = freqToMidi(r.freq); clarity = r.clarity; }
  }
  const smooth = mic.smoother.push(midi);
  return { midi: smooth, raw: midi, rms: level, clarity };
}
export function resetSmoother() { if (mic) mic.smoother.reset(); }

// ---------- Notas de referencia ----------
// Timbre "voz": diente de sierra filtrado con formantes de vocal "a"/"u". Investigación: imitar un timbre vocal es más fácil que un tono sintético puro.
export function playNote(midi, when = 0, dur = 0.8, gain = 0.25, dest = null) {
  const c = getCtx();
  const t = Math.max(c.currentTime, when || c.currentTime);
  const f = midiToFreq(midi);
  const out = c.createGain();
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(gain, t + 0.04);
  out.gain.setValueAtTime(gain, t + Math.max(0.05, dur - 0.08));
  out.gain.linearRampToValueAtTime(0, t + dur);
  out.connect(dest || c.destination);
  const timbre = settings().timbre || 'voz';
  const nodes = [];
  if (timbre === 'piano') {
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
    const g2 = c.createGain(); g2.gain.value = 0.25;
    const env = c.createGain();
    env.gain.setValueAtTime(1, t); env.gain.exponentialRampToValueAtTime(0.35, t + dur);
    o.connect(env); o2.connect(g2); g2.connect(env); env.connect(out);
    nodes.push(o, o2);
  } else {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    // vibrato muy leve para que suene natural
    const lfo = c.createOscillator(); lfo.frequency.value = 5; const lg = c.createGain(); lg.gain.value = f * 0.004;
    lfo.connect(lg); lg.connect(o.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5;
    const f1 = c.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 650; f1.Q.value = 2; f1.gain.value = 10;
    const f2 = c.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 1100; f2.Q.value = 3; f2.gain.value = 6;
    const pre = c.createGain(); pre.gain.value = 0.35;
    o.connect(lp); lp.connect(f1); f1.connect(f2); f2.connect(pre); pre.connect(out);
    nodes.push(o, lfo);
  }
  nodes.forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
  return t;
}

// Glissando de referencia (para sirenas)
export function playGlide(m0, m1, when, dur, gain = 0.2) {
  const c = getCtx();
  const t = Math.max(c.currentTime, when);
  const o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(midiToFreq(m0), t);
  o.frequency.linearRampToValueAtTime(midiToFreq(m1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.05);
  g.gain.setValueAtTime(gain, t + dur - 0.06); g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}

// Bordón (drone): nota grave sostenida para practicar afinación fina contra una referencia
export function startDrone(midi, gain = 0.12) {
  const c = getCtx();
  const t = c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.3);
  g.connect(c.destination);
  const oscs = [0, 12, 19].map((iv, i) => {
    const o = c.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine';
    o.frequency.value = midiToFreq(midi + iv);
    const og = c.createGain(); og.gain.value = i === 0 ? 0.25 : 0.35;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp); lp.connect(og); og.connect(g); o.start(t);
    return o;
  });
  return () => {
    const t2 = c.currentTime;
    g.gain.cancelScheduledValues(t2); g.gain.setValueAtTime(g.gain.value, t2); g.gain.linearRampToValueAtTime(0, t2 + 0.2);
    oscs.forEach((o) => o.stop(t2 + 0.25));
  };
}

// Clic de metrónomo
export function click(when, accent = false, gain = 0.3) {
  const c = getCtx();
  const t = Math.max(c.currentTime, when);
  const o = c.createOscillator(); o.type = 'square';
  o.frequency.value = accent ? 1600 : 1000;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + 0.06);
}

// Metrónomo libre (para el gimnasio)
export class Metronome {
  constructor() { this.bpm = 80; this.beats = 4; this.on = false; }
  start() {
    const c = getCtx();
    this.on = true; this.next = c.currentTime + 0.1; this.n = 0;
    const tick = () => {
      if (!this.on) return;
      while (this.next < c.currentTime + 0.2) {
        click(this.next, this.n % this.beats === 0);
        this.next += 60 / this.bpm; this.n++;
      }
      this.timer = setTimeout(tick, 50);
    };
    tick();
  }
  stop() { this.on = false; clearTimeout(this.timer); }
}

// Decodificar archivos de audio
export async function decodeFile(blob) {
  const buf = await blob.arrayBuffer();
  const c = getCtx();
  return await c.decodeAudioData(buf);
}
