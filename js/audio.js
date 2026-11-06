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
  // salida + entrada (~20 ms típicos) + medio cuadro de análisis (~32 ms)
  return (c.outputLatency || 0) + (c.baseLatency || 0) + 0.055;
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

// Grabadora simple del micrófono (para "Escúchate": oír cómo cantaste)
export function startRecorder() {
  try {
    if (!mic || !window.MediaRecorder) return null;
    const rec = new MediaRecorder(mic.stream); const chunks = [];
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec.start();
    return { stop: () => new Promise((res) => { if (rec.state === 'inactive') return res(null); rec.onstop = () => res(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null); try { rec.stop(); } catch { res(null); } }) };
  } catch { return null; }
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
  // Solo para pruebas automáticas: un "cantante virtual" (window.__singer) reemplaza al micrófono. En la app real no existe.
  if (window.__singer) { const m = window.__singer(); return { midi: m, raw: m, rms: m == null ? 0.0006 : 0.02, clarity: m == null ? 0 : 0.95 }; }
  // mientras el Chincol habla, no se escucha al usuario (su voz confundiría al detector)
  if (document.body.classList.contains('speaking')) { mic.smoother.push(null); return { midi: null, raw: null, rms: 0, clarity: 0 }; }
  mic.analyser.getFloatTimeDomainData(mic.raw);
  const level = rms(mic.raw);
  mic.dec = decimate(mic.raw, mic.factor, mic.dec);
  let midi = null, clarity = 0;
  // Umbral adaptativo: muchos celulares entregan el micrófono MUY bajito (sin control automático de ganancia).
  // Antes exigía un volumen fijo (0,008) y en esos celulares la voz no se marcaba. Ahora el umbral sigue
  // el ruido de tu pieza: basta con que tu voz esté claramente sobre ese ruido.
  if (mic.floor == null) mic.floor = Math.min(level, 0.004);
  const gate = Math.max(0.0015, Math.min(0.008, mic.floor * 2.5));
  if (level > gate) {
    const r = mic.detector.detect(mic.dec, mic.sr2, 65, 1100);
    if (r && r.clarity > 0.8) { midi = freqToMidi(r.freq); clarity = r.clarity; }
  }
  // el piso de ruido baja rápido y sube muy lento, y solo con ruido (nunca mientras cantas)
  if (midi == null) mic.floor = level < mic.floor ? mic.floor * 0.8 + level * 0.2 : Math.min(0.004, mic.floor * 0.995 + level * 0.005);
  const smooth = mic.smoother.push(midi);
  return { midi: smooth, raw: midi, rms: level, clarity };
}
export function resetSmoother() { if (mic) mic.smoother.reset(); }

// ---------- Notas de referencia ----------
// Timbre "voz": diente de sierra filtrado con formantes de vocal "a"/"u". Investigación: imitar un timbre vocal es más fácil que un tono sintético puro.
export function playNote(midi, when = 0, dur = 0.8, gain = 0.25, dest = null) {
  const c = getCtx();
  if (window.__singer) window.__heard = { m: midi, t: Math.max(c.currentTime, when || 0), d: dur };
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
  o.frequency.value = accent ? 2200 : 1600; // fuera del rango que analiza el detector (65–1100 Hz)
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

// Calibración por "lazo": suena una nota por el parlante y medimos cuándo la detecta el micrófono.
// Mide exactamente el retraso total de la cadena que usan los ejercicios (sin audífonos).
export async function measureLatency(onStatus) {
  const c = getCtx();
  await startMic();
  const results = [];
  for (let i = 0; i < 6; i++) {
    onStatus && onStatus(`Medición ${i + 1}/6…`);
    resetSmoother();
    await new Promise((r) => setTimeout(r, 400));
    const at = c.currentTime + 0.15;
    playNote(57, at, 0.5, 0.5);
    let found = null;
    const until = at + 0.9;
    while (c.currentTime < until) {
      const p = readPitch();
      if (found == null && p.raw != null && Math.abs(p.raw - 57) < 0.5) found = c.currentTime - at;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (found != null) results.push(found);
    await new Promise((r) => setTimeout(r, 300));
  }
  if (results.length < 4) return null;
  results.sort((a, b) => a - b);
  return results[Math.floor(results.length / 2)];
}

// Espectro del micrófono (dB por banda) para medir el timbre: brillo, H1−H2, energía alrededor de 3 kHz.
let specBuf = null;
export function readSpectrum() {
  if (!mic) return null;
  const n = mic.analyser.frequencyBinCount;
  if (!specBuf || specBuf.length !== n) specBuf = new Float32Array(n);
  mic.analyser.getFloatFrequencyData(specBuf);
  return { db: specBuf, binHz: getCtx().sampleRate / mic.analyser.fftSize };
}

// Copia del último trozo de audio del micrófono (≈85 ms) para análisis finos (ataque, cepstro)
export function readRaw() {
  if (!mic) return null;
  mic.analyser.getFloatTimeDomainData(mic.raw);
  return { x: Float32Array.from(mic.raw), sr: getCtx().sampleRate };
}
