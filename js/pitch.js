// Detección de tono: McLeod Pitch Method (MPM), el mismo algoritmo que usan los afinadores tipo Tartini.
// Sin dependencias. Funciona en tiempo real (micrófono) y offline (análisis de canciones).

export class PitchDetector {
  constructor(size) {
    this.size = size;
    this.nsdf = new Float32Array(size);
  }

  // buf: Float32Array (largo >= size). sr: sample rate. Devuelve {freq, clarity} o null.
  detect(buf, sr, minFreq = 60, maxFreq = 1200) {
    const N = this.size;
    const x = buf.length === N ? buf : buf.subarray(buf.length - N);
    const maxTau = Math.min(N - 2, Math.ceil(sr / minFreq));
    const minTau = Math.max(2, Math.floor(sr / maxFreq));
    const nsdf = this.nsdf;

    // m(0)
    let m = 0;
    for (let j = 0; j < N; j++) m += 2 * x[j] * x[j];
    if (m < 1e-9) return null;

    for (let tau = 0; tau <= maxTau; tau++) {
      if (tau > 0) m -= x[tau - 1] * x[tau - 1] + x[N - tau] * x[N - tau];
      let r = 0;
      const lim = N - tau;
      for (let j = 0; j < lim; j++) r += x[j] * x[j + tau];
      nsdf[tau] = m > 1e-12 ? (2 * r) / m : 0;
    }

    // Buscar máximos clave (uno por cada región positiva tras cruce por cero)
    const peaks = [];
    let tau = 1;
    while (tau < maxTau && nsdf[tau] > 0) tau++; // saltar el lóbulo inicial
    while (tau < maxTau) {
      while (tau < maxTau && nsdf[tau] <= 0) tau++;
      let best = -1, bestTau = -1;
      while (tau < maxTau && nsdf[tau] > 0) {
        if (nsdf[tau] > best) { best = nsdf[tau]; bestTau = tau; }
        tau++;
      }
      if (bestTau > 0) peaks.push(bestTau);
    }
    if (!peaks.length) return null;

    let highest = 0;
    for (const p of peaks) if (nsdf[p] > highest) highest = nsdf[p];
    const threshold = 0.9 * highest;
    let chosen = -1;
    for (const p of peaks) {
      if (p >= minTau && nsdf[p] >= threshold) { chosen = p; break; }
    }
    if (chosen < 0) return null;

    // Interpolación parabólica
    const a = nsdf[chosen - 1], b = nsdf[chosen], c = nsdf[chosen + 1] ?? b;
    const denom = a - 2 * b + c;
    let shift = 0, peakVal = b;
    if (Math.abs(denom) > 1e-12) {
      shift = (0.5 * (a - c)) / denom;
      peakVal = b - 0.25 * (a - c) * shift;
    }
    const period = chosen + shift;
    const freq = sr / period;
    if (freq < minFreq || freq > maxFreq) return null;
    return { freq, clarity: Math.min(1, peakVal) };
  }
}

export function rms(buf) {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}

// Diezma (promedio de bloques) para bajar la carga de CPU en celulares.
export function decimate(src, factor, out) {
  const n = Math.floor(src.length / factor);
  const res = out && out.length === n ? out : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * factor;
    for (let k = 0; k < factor; k++) s += src[o + k];
    res[i] = s / factor;
  }
  return res;
}

// ---------- Utilidades de notas ----------
export const A4 = 440;
const NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const LETTERS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const freqToMidi = (f) => 69 + 12 * Math.log2(f / A4);
export const midiToFreq = (m) => A4 * Math.pow(2, (m - 69) / 12);

export function noteName(midi, withOctave = true) {
  const r = Math.round(midi);
  const n = NAMES[((r % 12) + 12) % 12];
  return withOctave ? n + (Math.floor(r / 12) - 1) : n;
}
export function letterName(midi) {
  const r = Math.round(midi);
  return LETTERS[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

// Solfeo relativo (do móvil) para un intervalo en semitonos desde la tónica
const SOLF = { 0: 'Do', 1: 'Do#', 2: 'Re', 3: 'Me', 4: 'Mi', 5: 'Fa', 6: 'Fa#', 7: 'Sol', 8: 'Le', 9: 'La', 10: 'Te', 11: 'Si' };
export function solfege(semi) {
  return SOLF[((semi % 12) + 12) % 12];
}

// Filtro de mediana móvil para suavizar la lectura en vivo
export class PitchSmoother {
  constructor(n = 5) { this.n = n; this.buf = []; this.misses = 0; }
  push(midi) {
    if (midi == null) {
      this.misses++;
      if (this.misses > 3) this.buf = [];
      return this.buf.length >= 2 && this.misses <= 3 ? this.median() : null;
    }
    this.misses = 0;
    // descartar saltos de octava aislados
    if (this.buf.length >= 3) {
      const med = this.median();
      const d = midi - med;
      if (Math.abs(Math.abs(d) - 12) < 0.7) { this.oct = (this.oct || 0) + 1; if (this.oct < 4) return med; }
      else this.oct = 0;
    }
    this.buf.push(midi);
    if (this.buf.length > this.n) this.buf.shift();
    return this.median();
  }
  median() {
    const s = [...this.buf].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }
  reset() { this.buf = []; this.misses = 0; this.oct = 0; }
}
