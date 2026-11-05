// Cambio de tono de una canción (sin cambiar la velocidad), para adaptarla a tu voz como hace Simply Sing.
// Método: WSOLA (estira el tiempo conservando el tono) + remuestreo (devuelve la duración y cambia el tono).
// Las posiciones de cada cuadro se eligen sobre la mezcla y se aplican IGUAL a la instrumental (corrida por el
// desfase medido), así la resta mezcla − instrumental sigue dejando solo la voz y la voz guía sigue funcionando.
import { getCtx } from './audio.js';

const N = 2048, HS = N / 2, TOL = 512;

function mono(buf) {
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
}
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

// Elige las posiciones de análisis (WSOLA) sobre x para estirar por alfa
async function wsolaPositions(x, alpha, onProg) {
  const Ha = HS / alpha;
  const frames = Math.floor((x.length - N - TOL) / Ha);
  const pos = new Int32Array(Math.max(1, frames));
  let prev = 0;
  for (let k = 0; k < frames; k++) {
    const nominal = Math.round(k * Ha);
    if (k === 0) { pos[0] = 0; prev = 0; continue; }
    // continuación natural del cuadro anterior: x[prev + HS ...]
    const ref = prev + HS;
    let bestP = nominal, bestC = -Infinity;
    const lo = Math.max(0, nominal - TOL), hi = Math.min(x.length - N - 1, nominal + TOL);
    for (let p = lo; p <= hi; p += 4) {
      let c = 0;
      for (let j = 0; j < 512; j += 4) c += x[ref + j] * x[p + j];
      if (c > bestC) { bestC = c; bestP = p; }
    }
    pos[k] = bestP; prev = bestP;
    if (k % 400 === 0) { onProg && onProg(k / frames); await yieldUI(); }
  }
  return pos;
}
function overlapAdd(x, pos, offset, outLen) {
  const y = new Float32Array(outLen), w = new Float32Array(outLen);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  for (let k = 0; k < pos.length; k++) {
    const s = k * HS, a = pos[k] + offset;
    for (let i = 0; i < N && s + i < outLen; i++) { const xi = a + i; const v = xi >= 0 && xi < x.length ? x[xi] : 0; y[s + i] += v * win[i]; w[s + i] += win[i]; }
  }
  for (let i = 0; i < outLen; i++) if (w[i] > 1e-3) y[i] /= w[i];
  return y;
}
function resample(y, ratio, len) {
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) { const t = i * ratio, i0 = Math.floor(t), f = t - i0; out[i] = (y[i0] || 0) * (1 - f) + (y[i0 + 1] || 0) * f; }
  return out;
}

// semis: semitonos (+ sube, − baja). lagSec: desfase de la instrumental respecto de la mezcla.
export async function shiftSong(bufs, semis, lagSec = 0, onProg) {
  if (!semis) return bufs;
  const c = getCtx(); const sr = bufs.mix.sampleRate;
  const ratio = 2 ** (semis / 12);
  const xm = mono(bufs.mix);
  const pos = await wsolaPositions(xm, ratio, (f) => onProg && onProg(f * 0.7));
  const outLen = pos.length * HS + N;
  const finish = (x, off) => { const st = overlapAdd(x, pos, off, outLen); return resample(st, ratio, Math.min(x.length, Math.floor(outLen / ratio))); };
  const mk = (data) => { const b = c.createBuffer(1, data.length, sr); b.copyToChannel(data, 0); return b; };
  const mix = mk(finish(xm, 0));
  onProg && onProg(0.85); await yieldUI();
  let inst = null;
  if (bufs.inst) {
    const xi = mono(bufs.inst);
    // misma "tijera" que la mezcla: la instrumental va corrida por el desfase
    inst = mk(finish(xi, -Math.round(lagSec * sr)));
  }
  onProg && onProg(1);
  return { mix, inst, shifted: semis };
}

// Análisis de la canción con todas las notas corridas (la instrumental ya quedó alineada: desfase 0)
export function shiftAnalysis(a, semis) {
  if (!semis) return a;
  return { ...a, lag: 0, notes: a.notes.map((n) => ({ ...n, m: n.m + semis })), lo: a.lo + semis, hi: a.hi + semis, curve: (a.curve || []).map((v) => (v == null ? null : v + semis)) };
}

// Mejor transposición para tu voz: la que deja más notas de la melodía en tu zona cómoda (se permite cantar
// una octava abajo/arriba, como en el karaoke). Devuelve semitonos entre −6 y +6.
export function bestTranspose(a, range, sweet) {
  const zoneLo = sweet && sweet.lo != null ? sweet.lo - 2 : range.low + 1;
  const zoneHi = sweet && sweet.hi != null ? sweet.hi + 3 : range.high - 1;
  const notes = a.notes;
  const total = notes.reduce((s, n) => s + (n.t1 - n.t0), 0) || 1;
  let best = { t: 0, fit: -1, oct: 0 };
  for (let t = -6; t <= 6; t++) for (const oct of [-24, -12, 0, 12]) {
    let fit = 0, over = 0;
    for (const n of notes) { const m = n.m + t + oct; const d = n.t1 - n.t0; if (m >= zoneLo && m <= zoneHi) fit += d; if (m > range.high || m < range.low) over += d; }
    const score = fit / total - (over / total) * 1.5 - Math.abs(t) * 0.004;
    if (score > best.fit) best = { t, fit: score, oct, inZone: fit / total, outside: over / total };
  }
  return best;
}
