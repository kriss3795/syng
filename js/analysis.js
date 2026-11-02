// Análisis de canciones propias: aislar la voz (mezcla − instrumental), detectar la melodía nota a nota,
// estimar la tonalidad y repartir la letra en el tiempo.
import { PitchDetector, freqToMidi, noteName } from './pitch.js';

const SR = 16000;
const yieldUI = () => new Promise((r) => setTimeout(r, 0));

export async function toMono16k(audioBuffer) {
  const len = Math.ceil(audioBuffer.duration * SR);
  const oc = new OfflineAudioContext(1, len, SR);
  const s = oc.createBufferSource();
  s.buffer = audioBuffer;
  s.connect(oc.destination);
  s.start();
  const r = await oc.startRendering();
  return r.getChannelData(0);
}

function envelope(x, block) {
  const n = Math.floor(x.length / block);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * block; for (let k = 0; k < block; k++) s += Math.abs(x[o + k]); e[i] = s / block; }
  return e;
}

// Encuentra el desfase L (muestras) tal que mix[n] ≈ inst[n − L]
export function findLag(mix, inst) {
  // 1) grueso con envolventes a 100 Hz, ±2 s
  const B = 160;
  const em = envelope(mix.subarray(0, Math.min(mix.length, SR * 90)), B);
  const ei = envelope(inst.subarray(0, Math.min(inst.length, SR * 90)), B);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mm = mean(em), mi = mean(ei);
  let best = -1e18, coarse = 0;
  for (let L = -200; L <= 200; L++) {
    let s = 0;
    for (let i = 0; i < em.length; i++) { const j = i - L; if (j >= 0 && j < ei.length) s += (em[i] - mm) * (ei[j] - mi); }
    if (s > best) { best = s; coarse = L; }
  }
  // 2) fino a nivel de muestra, ±1,5 bloques, en la zona de más energía
  let start = 0, maxE = 0;
  for (let i = 0; i < em.length - 300; i += 50) { let s = 0; for (let k = 0; k < 300; k++) s += em[i + k]; if (s > maxE) { maxE = s; start = i; } }
  const a = start * B, win = SR * 3;
  let bestF = -1e18, fine = coarse * B;
  for (let L = coarse * B - 240; L <= coarse * B + 240; L++) {
    let s = 0;
    for (let n = a; n < a + win && n < mix.length; n++) { const j = n - L; if (j >= 0 && j < inst.length) s += mix[n] * inst[j]; }
    if (s > bestF) { bestF = s; fine = L; }
  }
  return fine;
}

export function isolateVocal(mix, inst, lag) {
  let num = 0, den = 0;
  for (let n = 0; n < mix.length; n++) { const j = n - lag; if (j >= 0 && j < inst.length) { num += mix[n] * inst[j]; den += inst[j] * inst[j]; } }
  const g = den > 0 ? num / den : 1;
  const out = new Float32Array(mix.length);
  let em = 0, er = 0;
  for (let n = 0; n < mix.length; n++) {
    const j = n - lag;
    const v = mix[n] - (j >= 0 && j < inst.length ? g * inst[j] : 0);
    out[n] = v; em += mix[n] * mix[n]; er += v * v;
  }
  return { vocal: out, gain: g, residual: em > 0 ? er / em : 1 };
}

// Curva de tono cada 10 ms
export async function pitchTrack(x, onProgress) {
  const W = 1024, HOP = 160;
  const det = new PitchDetector(W);
  const n = Math.floor((x.length - W) / HOP);
  const rmsArr = new Float32Array(Math.max(0, n));
  for (let i = 0; i < n; i++) { let s = 0; const o = i * HOP; for (let k = 0; k < W; k += 4) s += x[o + k] * x[o + k]; rmsArr[i] = Math.sqrt(s / (W / 4)); }
  const sorted = Array.from(rmsArr).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const gate = Math.max(0.004, p95 * 0.08);
  const frames = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = (i * HOP + W / 2) / SR;
    let m = null;
    if (rmsArr[i] > gate) {
      const r = det.detect(x.subarray(i * HOP, i * HOP + W), SR, 70, 1000);
      if (r && r.clarity > 0.8) m = freqToMidi(r.freq);
    }
    frames[i] = { t, m };
    if (i % 400 === 0) { onProgress && onProgress(i / n); await yieldUI(); }
  }
  return frames;
}

// Convierte la curva en notas
export function segment(frames) {
  // mediana de 5 sobre los valores con voz
  const ms = frames.map((f) => f.m);
  const med = ms.map((m, i) => {
    if (m == null) return null;
    const w = [];
    for (let k = i - 2; k <= i + 2; k++) if (ms[k] != null) w.push(ms[k]);
    w.sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
  const notes = [];
  let cur = null;
  const close = () => {
    if (cur && cur.vals.length >= 7) {
      const v = [...cur.vals].sort((a, b) => a - b);
      const m = v[Math.floor(v.length / 2)];
      notes.push({ t0: cur.t0, t1: cur.t1, m: Math.round(m), raw: m });
    }
    cur = null;
  };
  // La referencia es la mediana de la nota ya establecida (no un promedio móvil, que "se arrastra"
  // en cambios de semitono y fusiona dos notas). Se corta cuando 3 cuadros seguidos se alejan > 0,55 st.
  let gap = 0, pend = [];
  const refOf = (vals) => { const v = vals.slice(0, 40).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  for (let i = 0; i < frames.length; i++) {
    const m = med[i], t = frames[i].t;
    if (m == null) { gap++; if (gap > 3) { close(); pend = []; } continue; }
    gap = 0;
    if (!cur) { cur = { t0: t, t1: t, vals: [m] }; continue; }
    const ref = cur.vals.length >= 4 ? refOf(cur.vals) : cur.vals[cur.vals.length - 1];
    if (Math.abs(m - ref) > 0.55) {
      pend.push({ t, m });
      if (pend.length >= 3) {
        close();
        cur = { t0: pend[0].t, t1: t, vals: pend.map((p) => p.m) };
        pend = [];
      }
    } else {
      for (const p of pend) cur.vals.push(p.m);
      pend = [];
      cur.vals.push(m); cur.t1 = t;
    }
  }
  close();
  // fusionar notas iguales casi contiguas
  const out = [];
  for (const n of notes) {
    const p = out[out.length - 1];
    if (p && p.m === n.m && n.t0 - p.t1 < 0.06) p.t1 = n.t1;
    else out.push({ ...n });
  }
  return out.filter((n) => n.t1 - n.t0 >= 0.08);
}

// Frases: grupos de notas separados por silencios > 0,4 s
export function phrases(notes) {
  const ph = [];
  for (const n of notes) {
    const p = ph[ph.length - 1];
    if (p && n.t0 - p.t1 < 0.4) p.t1 = n.t1;
    else ph.push({ t0: n.t0, t1: n.t1 });
  }
  return ph.filter((p) => p.t1 - p.t0 > 0.3);
}

const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function estimateKey(notes) {
  const h = new Array(12).fill(0);
  for (const n of notes) h[((n.m % 12) + 12) % 12] += n.t1 - n.t0;
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y) / 12, mb = b.reduce((x, y) => x + y) / 12;
    let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < 12; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
    return s / Math.sqrt(sa * sb || 1);
  };
  let best = { r: -2 };
  for (let k = 0; k < 12; k++) {
    const rot = (p) => p.map((_, i) => p[(i - k + 12) % 12]);
    const rM = corr(h, rot(MAJ)), rm = corr(h, rot(MIN));
    if (rM > best.r) best = { r: rM, k, mode: 'mayor' };
    if (rm > best.r) best = { r: rm, k, mode: 'menor' };
  }
  if (best.k == null) return '—';
  return noteName(60 + best.k, false) + ' ' + best.mode;
}

// ---------- Letra ----------
export function parseLyrics(text) {
  return (text || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^\[.*\]$/.test(l));
}
export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 0;
  // grupos vocálicos (aproximación al silabeo en español)
  const g = w.match(/[aeiouáéíóúü]+/g);
  if (!g) return 1;
  let n = 0;
  for (const grp of g) {
    // hiatos con vocal fuerte+fuerte o tilde en débil cuentan doble
    let c = 1;
    for (let i = 1; i < grp.length; i++) {
      const a = grp[i - 1], b = grp[i];
      const strong = (x) => 'aeoáéó'.includes(x) || 'íú'.includes(x);
      if (strong(a) && strong(b)) c++;
    }
    n += c;
  }
  return n;
}

// Asigna tiempos a las líneas según las frases detectadas
export function autoAlign(lines, ph, duration) {
  if (!lines.length) return [];
  let segs = ph.map((p) => ({ ...p }));
  if (!segs.length) {
    const d = duration / lines.length;
    segs = lines.map((_, i) => ({ t0: i * d, t1: (i + 1) * d }));
  }
  while (segs.length > lines.length) {
    // unir el par con el silencio más corto
    let bi = 0, bg = 1e9;
    for (let i = 0; i < segs.length - 1; i++) { const g = segs[i + 1].t0 - segs[i].t1; if (g < bg) { bg = g; bi = i; } }
    segs.splice(bi, 2, { t0: segs[bi].t0, t1: segs[bi + 1].t1 });
  }
  while (segs.length < lines.length) {
    // dividir el segmento más largo por la mitad
    let bi = 0, bl = 0;
    segs.forEach((s, i) => { if (s.t1 - s.t0 > bl) { bl = s.t1 - s.t0; bi = i; } });
    const s = segs[bi], mid = (s.t0 + s.t1) / 2;
    segs.splice(bi, 1, { t0: s.t0, t1: mid }, { t0: mid, t1: s.t1 });
  }
  return lines.map((text, i) => ({ text, t0: segs[i].t0, t1: segs[i].t1 }));
}

// Tiempo de cada palabra dentro de su línea (usando los inicios de nota)
export function wordTimes(lines, notes) {
  for (const ln of lines) {
    const words = ln.text.split(/\s+/).filter(Boolean);
    const syl = words.map((w) => Math.max(1, syllables(w)));
    const total = syl.reduce((a, b) => a + b, 0);
    const ns = notes.filter((n) => n.t0 >= ln.t0 - 0.15 && n.t0 < ln.t1);
    let k = 0;
    ln.words = words.map((w, i) => {
      let t;
      if (ns.length >= 2) t = ns[Math.min(ns.length - 1, Math.round((k / total) * ns.length))].t0;
      else t = ln.t0 + (k / total) * (ln.t1 - ln.t0);
      k += syl[i];
      return { w, t };
    });
    for (let i = 1; i < ln.words.length; i++) if (ln.words[i].t < ln.words[i - 1].t) ln.words[i].t = ln.words[i - 1].t;
  }
  return lines;
}

export async function analyzeSong({ mixBuf, instBuf, vocBuf, lyrics }, onStep) {
  onStep('Convirtiendo audio…', 0.02);
  const mix = mixBuf ? await toMono16k(mixBuf) : null;
  const inst = instBuf ? await toMono16k(instBuf) : null;
  let vocal, lag = 0, gain = 1, quality = 'directa', residual = null;
  if (vocBuf) {
    vocal = await toMono16k(vocBuf);
    quality = 'pista de voz sola';
    if (mix && inst) lag = findLag(mix, inst);
  } else if (mix && inst) {
    onStep('Alineando la versión con voz y la instrumental…', 0.08);
    await yieldUI();
    lag = findLag(mix, inst);
    onStep('Aislando la voz (restando la instrumental)…', 0.15);
    await yieldUI();
    const r = isolateVocal(mix, inst, lag);
    vocal = r.vocal; gain = r.gain; residual = r.residual;
    quality = r.residual < 0.75 ? 'voz aislada por resta' : 'resta imperfecta';
  } else {
    vocal = mix;
    quality = 'sin instrumental';
  }
  onStep('Detectando la melodía nota por nota…', 0.2);
  const frames = await pitchTrack(vocal, (p) => onStep('Detectando la melodía nota por nota…', 0.2 + p * 0.7));
  onStep('Ordenando notas y letra…', 0.93);
  const notes = segment(frames);
  const ph = phrases(notes);
  const duration = (mix || vocal).length / SR;
  const lines = wordTimes(autoAlign(parseLyrics(lyrics), ph, duration), notes);
  const ms = notes.map((n) => n.m).sort((a, b) => a - b);
  const lo = ms.length ? ms[Math.floor(ms.length * 0.03)] : 60;
  const hi = ms.length ? ms[Math.floor(ms.length * 0.97)] : 72;
  // curva simplificada (cada 30 ms) para dibujar la voz original
  const curve = [];
  for (let i = 0; i < frames.length; i += 3) curve.push(frames[i].m == null ? null : Math.round(frames[i].m * 10) / 10);
  return { duration, lag: lag / SR, gain, quality, residual, notes, phrases: ph, lines, key: estimateKey(notes), lo, hi, curve, curveStep: 0.03, curveT0: frames.length ? frames[0].t : 0 };
}
