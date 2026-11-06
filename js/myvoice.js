// Tu propia voz como modelo. La investigación muestra que a quien le cuesta afinar le resulta más fácil
// imitar SU propia voz que un tono sintético (Hutchins y Peretz 2012; Pfordresher y Mantell 2014).
// Grabo 2–3 s de tu "uuu" cómodo, tomo el tramo más estable y lo uso (subido o bajado) como nota guía.
import { h, sleep, tuner } from './ui.js';
import { getCtx, readPitch, resetSmoother, startRecorder, startMic } from './audio.js';
import { noteName } from './pitch.js';
import { say } from './coach.js';
import { sfx } from './voice.js';
import { raf } from './exercises.js';

const KEY = 'syng.myvoice';
let cache = null;

const toB64 = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
async function decodeTrim(blob, t0, t1) {
  const c = getCtx(); const full = await c.decodeAudioData(await blob.arrayBuffer());
  const sr = full.sampleRate; const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(full.length, Math.floor(t1 * sr));
  const out = c.createBuffer(1, Math.max(1, b - a), sr); const src = full.getChannelData(0).subarray(a, b); const dst = out.getChannelData(0);
  dst.set(src);
  const fade = Math.min(Math.floor(sr * 0.06), dst.length >> 2); // entrada y salida suaves
  for (let i = 0; i < fade; i++) { dst[i] *= i / fade; dst[dst.length - 1 - i] *= i / fade; }
  let pk = 0; for (let i = 0; i < dst.length; i++) pk = Math.max(pk, Math.abs(dst[i])); if (pk > 0) for (let i = 0; i < dst.length; i++) dst[i] *= 0.8 / pk;
  return out;
}

export async function getMyVoice() {
  if (cache) return cache;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (!j) return null;
    const blob = await (await fetch(j.data)).blob();
    cache = { buf: await decodeTrim(blob, j.t0, j.t1), midi: j.midi, at: j.at };
    return cache;
  } catch { return null; }
}

// Paso guiado para grabar tu nota modelo. Devuelve {buf, midi} o null.
export async function captureMyVoice(root, sig) {
  const tu = tuner(100);
  const box = h('div');
  const status = h('p', { class: 'center small' }, '');
  let go;
  const start = new Promise((r) => (go = r));
  root.replaceChildren(h('div', { class: 'ex' }, box, tu.el, status, h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: (e) => { sfx('select'); e.currentTarget.disabled = true; e.currentTarget.textContent = 'Grabando…'; go(); } }, '🎙️ Grabar mi nota'))));
  box.replaceChildren(say('Primero grabo <b>tu propia voz</b> para usarla como modelo: es más fácil imitarte a ti mismo que a un piano. Canta un <b>"uuu"</b> cómodo, como un suspiro con sonido, y sostenlo parejo unos 3 segundos.', 'feliz'));
  await start; if (sig.aborted) return null;
  try { await startMic(); } catch { status.textContent = 'Necesito el micrófono para grabarte.'; await sleep(1500); return null; }
  const c = getCtx(); resetSmoother();
  const rec = startRecorder(); const t0 = c.currentTime; const fr = [];
  status.textContent = 'Grabando… sostén "uuu"';
  while (!sig.aborted && c.currentTime - t0 < 3.4) { const p = readPitch(); tu.update(p.midi, null); fr.push({ t: c.currentTime - t0, m: p.midi }); await raf(); }
  const blob = rec ? await rec.stop() : null;
  if (!blob) { status.textContent = 'Tu navegador no permite grabar: seguimos con el sonido de piano.'; await sleep(1500); return null; }
  // el tramo de 1,2 s más estable
  let best = null;
  for (let i = 0; i < fr.length; i++) {
    const w = fr.filter((f) => f.t >= fr[i].t && f.t < fr[i].t + 1.2);
    if (w.length < 20 || w.some((f) => f.m == null) || fr[i].t + 1.2 > 3.3) continue;
    const ms = w.map((f) => f.m); const spread = Math.max(...ms) - Math.min(...ms);
    if (!best || spread < best.spread) best = { t0: fr[i].t, spread, midi: ms.sort((a, b) => a - b)[ms.length >> 1] };
  }
  if (!best || best.spread > 1) { status.textContent = 'No salió parejo. Seguimos con el sonido de piano y lo intentamos otro día.'; await sleep(1800); return null; }
  try {
    const midi = Math.round(best.midi * 10) / 10;
    const buf = await decodeTrim(blob, best.t0, best.t0 + 1.2);
    localStorage.setItem(KEY, JSON.stringify({ data: await toB64(blob), t0: best.t0, t1: best.t0 + 1.2, midi, at: Date.now() }));
    cache = { buf, midi, at: Date.now() };
    sfx('ok'); box.replaceChildren(say(`¡Listo! Tu nota modelo es <b>${noteName(Math.round(midi))}</b>. Desde ahora, cuando te pida una nota, vas a escuchar <b>tu propia voz</b>.`, 'celebra'));
    const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); src.start();
    await sleep(2200);
    return cache;
  } catch (e) { console.warn(e); return null; }
}
export function playMyVoice(ref, midi, when = 0) {
  const c = getCtx();
  if (window.__singer) window.__heard = { m: midi, t: c.currentTime + when, d: 1.2 }; const src = c.createBufferSource(); src.buffer = ref.buf; src.playbackRate.value = 2 ** ((midi - ref.midi) / 12);
  const g = c.createGain(); g.gain.value = 1.5; src.connect(g).connect(c.destination); src.start(c.currentTime + 0.05 + when);
  return ref.buf.duration / src.playbackRate.value;
}
