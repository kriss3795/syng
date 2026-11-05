// Tus canciones: subir, analizar y aprenderlas paso a paso como con un profe.
import { h, Roll, pct, sleep, icon, scoreRing } from './ui.js';
import { getCtx, startMic, readPitch, resetSmoother, latency, decodeFile, micStream, stopMic } from './audio.js';
import { noteName } from './pitch.js';
import { analyzeSong, parseLyrics, autoAlign, wordTimes } from './analysis.js';
import { leakCheck } from './exercises.js';
import { putSong, getSong, listSongs, deleteSong, settings, setSetting, getRange, addXp, record, load, save, voiceProfile } from './store.js';
import { say, chincol, diagnoseSeq, verdict, line } from './coach.js';
import { speak, stopSpeaking, sfx, confetti } from './voice.js';
import { songReport, songObs } from './songcoach.js';
import { shiftSong, shiftAnalysis, bestTranspose } from './shift.js';
import { identities } from './store.js';
import { observe } from './adapt.js';
import { track } from './fun.js';

const cache = new Map();
const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
let headphonesKnown = null; // null = sin revisar, true/false

// ---------- Lista ----------
export async function songsView(root, nav) {
  root.replaceChildren(h('div', { class: 'page' }, 'Cargando…'));
  let list = [];
  try { list = await listSongs(); } catch (e) { root.replaceChildren(h('div', { class: 'page' }, say('Tu navegador no deja guardar canciones. Prueba con Chrome, sin modo incógnito.', 'piensa'))); return; }
  root.replaceChildren(h('div', { class: 'page' }, ...[
    h('h1', {}, 'Tus canciones'),
    say(list.length ? 'Elige una canción y te la enseño paso a paso.' : 'Sube tu canción de Suno: la versión con voz, la instrumental y la letra. Yo detecto la melodía nota por nota y te la enseño como un profe.', 'feliz', { compact: true }),
    h('button', { class: 'btn primary big', onclick: () => nav('#cancion-nueva') }, icon('plus', 18), 'Nueva canción'),
    ...list.map((s) => {
      const p = s.progress || {};
      const done = ['escuchar', 'lineas', 'guia', 'solo'].filter((k) => p[k]).length;
      return h('button', { class: 'card songrow', onclick: () => nav('#cancion-' + s.id) },
        h('span', { class: 'song-ic' }, icon('note', 24)),
        h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'small muted' }, `${fmtTime(s.analysis.duration)} · ${s.analysis.key} · ${s.analysis.lines.length} líneas`),
          h('div', { class: 'progress thin' }, h('div', { class: 'pfill ok', style: `width:${done * 25}%` }))),
        icon('chevron'));
    }),
  ]));
}

export function newSongView(root, nav, existing = null) {
  const title = h('input', { type: 'text', placeholder: 'Ej: Canción para Falco', value: existing ? existing.title : '' });
  const mk = (label, hint, required) => { const i = h('input', { type: 'file', accept: 'audio/*' }); const name = h('small', { class: 'muted' }, hint); i.onchange = () => (name.textContent = i.files[0] ? '✓ ' + i.files[0].name : hint); return { i, el: h('label', { class: 'file-pick' + (required ? ' req' : '') }, icon('note', 22), h('span', {}, h('b', {}, label), name), i) }; };
  const mix = mk('Versión con voz', 'Obligatoria', true), inst = mk('Versión instrumental', 'Muy recomendada: aísla la voz y permite cantar sin ella'), voc = mk('Voz sola (opcional)', 'Si la sacaste con "Get Stems", es lo más preciso');
  const lyr = h('textarea', { rows: 9, placeholder: 'Pega la letra, una línea por verso. Las etiquetas como [Chorus] se ignoran.' });
  if (existing) lyr.value = existing.lyrics || '';
  const status = h('div', { class: 'small muted' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'pfill' }));
  bar.style.display = 'none';
  const go = h('button', { class: 'btn primary big' }, existing ? 'Guardar letra' : 'Analizar canción');
  root.replaceChildren(h('div', { class: 'page form' }, ...[
    h('div', { class: 'row between' }, h('h1', {}, existing ? 'Editar letra' : 'Nueva canción'), h('button', { class: 'iconbtn', onclick: () => history.back() }, icon('close'))),
    existing ? null : h('label', { class: 'field' }, 'Título', title),
    existing ? null : mix.el, existing ? null : inst.el, existing ? null : voc.el,
    h('label', { class: 'field' }, 'Letra', lyr),
    existing ? null : say('La versión con voz y la instrumental tienen que ser de la misma generación de Suno ("Get Stems"), para que calcen al milisegundo.', 'atento', { compact: true }),
    go, bar, status].filter(Boolean)));
  go.onclick = async () => {
    if (existing) {
      const s = await getSong(existing.id);
      s.lyrics = lyr.value;
      s.analysis.lines = wordTimes(autoAlign(parseLyrics(s.lyrics), s.analysis.phrases, s.analysis.duration), s.analysis.notes);
      await putSong(s); nav('#cancion-' + s.id); return;
    }
    const fm = mix.i.files[0], fi = inst.i.files[0], fv = voc.i.files[0];
    if (!fm) { status.textContent = 'Falta la versión con voz.'; sfx('bad'); return; }
    go.disabled = true; bar.style.display = '';
    try {
      status.textContent = 'Leyendo archivos…';
      const [mb, ib, vb] = await Promise.all([decodeFile(fm), fi ? decodeFile(fi) : null, fv ? decodeFile(fv) : null]);
      const analysis = await analyzeSong({ mixBuf: mb, instBuf: ib, vocBuf: vb, lyrics: lyr.value }, (msg, p) => { status.textContent = msg; bar.firstChild.style.width = p * 100 + '%'; });
      if (!analysis.notes.length) { status.textContent = 'No detecté melodía en la voz. ¿Seguro que el archivo con voz tiene voz?'; go.disabled = false; return; }
      const id = 's' + Date.now().toString(36);
      const song = { id, title: title.value.trim() || fm.name.replace(/\.[^.]+$/, ''), created: Date.now(), lyrics: lyr.value, mix: fm, inst: fi || null, voc: fv || null, analysis, progress: {} };
      await putSong(song);
      cache.set(id, { mix: mb, inst: ib });
      sfx('done');
      nav('#cancion-' + id);
    } catch (e) {
      console.error(e);
      status.textContent = 'No pude procesar el audio (' + e.message + '). Prueba con MP3 o WAV.';
      go.disabled = false;
    }
  };
}

// ---------- Detalle: el plan del profe ----------
export async function songDetail(root, nav, id) {
  const s = await getSong(id);
  if (!s) { nav('#canciones'); return; }
  const a = s.analysis, p = s.progress || {};
  const r = getRange();
  const rangeNote = a.lo > r.high - 3 ? 'La melodía está más aguda que tu rango: lo normal es cantarla una octava abajo, y la app lo acepta.' : a.hi < r.low + 3 ? 'La melodía está más grave que tu rango: puedes cantarla una octava arriba.' : 'La melodía calza con tu rango.';
  const warn = a.quality === 'resta imperfecta' ? say('Ojo: la instrumental no calzó perfecto con la versión con voz (¿son de distinta generación?). Algunas notas pueden estar mal. Lo ideal es subir la voz sola.', 'piensa', { tone: 'warn', compact: true })
    : a.quality === 'sin instrumental' ? say('Sin la instrumental detecté la melodía sobre la mezcla completa: las notas pueden estar MAL y no podrás quitar la voz guía. Sube la instrumental para un análisis confiable.', 'piensa', { tone: 'warn', compact: true }) : null;
  const lineBest = p.lineas ? Object.values(p.lineas) : [];
  // Tono a tu medida (como Simply Sing): recomendación según tu rango y tu zona dulce
  const idn = identities().slice(-1)[0];
  const rec = bestTranspose(a, r, idn ? { lo: idn.sweetLo, hi: idn.sweetHi } : null);
  const cur = s.transpose || 0;
  const tLbl = (t) => (t === 0 ? 'Original' : (t > 0 ? '+' : '') + t + ' semitono' + (Math.abs(t) > 1 ? 's' : ''));
  const setT = async (t) => { s.transpose = Math.max(-6, Math.min(6, t)); await putSong(s); sfx('select'); songDetail(root, nav, id); };
  const keyCard = h('div', { class: 'card key-card' },
    h('div', { class: 'row between' }, h('b', {}, 'Tono para tu voz'), h('span', { class: 'pill' + (cur === rec.t ? ' ok' : '') }, tLbl(cur))),
    h('div', { class: 'row center-row' }, h('button', { class: 'btn', onclick: () => setT(cur - 1) }, '−'), h('span', { class: 'key-val' }, `${noteName(a.lo + cur)}–${noteName(a.hi + cur)}`), h('button', { class: 'btn', onclick: () => setT(cur + 1) }, '+')),
    h('p', { class: 'small' }, rec.t === cur ? `✓ Este tono es el que mejor calza con tu voz (${Math.round(rec.inZone * 100)}% de la melodía en tu zona cómoda${rec.oct ? ', cantándola una octava ' + (rec.oct < 0 ? 'abajo' : 'arriba') : ''}).` : `Recomendado para tu voz: ${tLbl(rec.t)} (${Math.round(rec.inZone * 100)}% de la melodía en tu zona cómoda).`),
    rec.t !== cur ? h('button', { class: 'btn primary small', onclick: () => setT(rec.t) }, 'Usar el tono recomendado') : null,
    h('p', { class: 'small muted' }, 'Cambia el tono de la pista y de la voz sin cambiar la velocidad. La primera vez tarda unos segundos en prepararse.' + (cur ? ' Si la generas de nuevo en Suno, también puedes pedirla en un tono más ' + (cur < 0 ? 'grave' : 'agudo') + '.' : '')));
  const steps = [
    ['escuchar', '1', 'Escuchar', 'La canción completa con la letra y las notas. Sin cantar.', '#escuchar-' + id, p.escuchar ? 'Hecho' : ''],
    ['lineas', '2', 'Línea por línea', 'Escuchas cada línea y la repites. Así aprenden los cantantes.', '#lineas-' + id, lineBest.length ? `${lineBest.filter((x) => x >= 0.7).length}/${a.lines.length} líneas` : ''],
    ['guia', '3', 'Con voz guía', 'La canción completa cantando junto a la voz.', '#guia-' + id, p.guia ? 'Mejor: ' + pct(p.guia) : ''],
    ['solo', '4', 'Tú solo', 'Sin voz guía, con nota. La prueba de verdad.', '#solo-' + id, p.solo ? 'Mejor: ' + pct(p.solo) : ''],
  ];
  root.replaceChildren(h('div', { class: 'page' }, ...[
    h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#canciones') }, icon('back')), h('span', {})),
    h('div', { class: 'song-hero' }, h('span', { class: 'song-ic big' }, icon('note', 34)), h('div', {}, h('h1', {}, s.title), h('div', { class: 'small muted' }, `${fmtTime(a.duration)} · ${a.key} · ${noteName(a.lo)}–${noteName(a.hi)} · ${a.notes.length} notas`))),
    say(line('can_intro') + ' <small>' + rangeNote + '</small>', 'feliz', { voice: Object.keys(p).length ? null : 'can_intro', compact: true }),
    warn,
    keyCard,
    takesCard(s, root, nav),
    h('div', { class: 'steps' }, steps.map(([k, n, t, d, href, prog]) => h('button', { class: 'step' + (prog ? ' done' : ''), onclick: () => { sfx('select'); nav(href); } },
      h('span', { class: 'step-n' }, prog && k !== 'lineas' ? icon('star', 18) : n), h('div', { class: 'grow' }, h('b', {}, t), h('small', {}, d), prog ? h('span', { class: 'pill ok' }, prog) : null), icon('chevron')))),
    p.report ? h('div', { class: 'card' }, h('b', {}, `Último informe del profe: ${pct(p.report.score)}`), h('p', { class: 'small muted' }, (p.report.global || []).slice(0, 3).join(' · ') || 'Sin problemas destacados.'), h('p', { class: 'small' }, 'Canta en el paso 4 (o karaoke libre) para un nuevo informe y compararlo.')) : null,
    h('div', { class: 'tiles' },
      h('button', { class: 'tile green', onclick: () => nav('#fiesta-' + id) }, h('span', { class: 'tile-ic' }, icon('party', 24)), h('b', {}, 'Modo fiesta'), h('small', {}, 'Solo la letra en grande, para cantar con otros')),
      h('button', { class: 'tile blue', onclick: () => nav('#practicar-' + id) }, h('span', { class: 'tile-ic' }, icon('mic', 24)), h('b', {}, 'Karaoke libre'), h('small', {}, 'Todos los controles'))),
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => nav('#sincronizar-' + id) }, icon('sync', 16), 'Ajustar letra'),
      h('button', { class: 'btn small', onclick: () => nav('#editarletra-' + id) }, icon('edit', 16), 'Editar letra'),
      h('button', { class: 'btn small ghost danger' }, icon('trash', 16), 'Eliminar')),
    h('p', { class: 'small muted' }, `Detección: ${a.quality}.`),
  ].filter(Boolean)));
  root.querySelector('.danger').onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure) { await deleteSong(id); cache.delete(id); nav('#canciones'); }
    else { b.dataset.sure = 1; b.lastChild.textContent = 'Toca otra vez para eliminar'; }
  };
}

async function buffers(s, onProg) {
  let b = cache.get(s.id);
  if (!b) { b = { mix: await decodeFile(s.mix), inst: s.inst ? await decodeFile(s.inst) : null }; cache.set(s.id, b); }
  const t = s.transpose || 0;
  if (!t) return b;
  const key = s.id + ':' + t;
  if (!cache.has(key)) cache.set(key, await shiftSong(b, t, s.analysis.lag || 0, onProg));
  return cache.get(key);
}
const songA = (s) => shiftAnalysis(s.analysis, s.transpose || 0);
const prepScreen = (root, s) => { const p = h('p', {}, s.transpose ? `Cambiando el tono (${s.transpose > 0 ? '+' : ''}${s.transpose})… 0%` : 'Preparando la canción…'); root.replaceChildren(h('div', { class: 'stage-dark full center' }, chincol('canta', 90), p)); return (f) => { if (s.transpose) p.textContent = `Cambiando el tono (${s.transpose > 0 ? '+' : ''}${s.transpose})… ${Math.round(f * 100)}%`; }; };
async function saveProgress(id, fn) {
  const s = await getSong(id);
  s.progress = s.progress || {};
  fn(s.progress);
  await putSong(s);
}

// Reproductor sincronizado. La voz guía va de 0% a 200%:
// salida = v·mezcla + (1 − g·v)·instrumental = instrumental + v·voz  (g = ganancia de la resta medida al analizar)
class Player {
  constructor(bufs, a) { this.b = bufs; this.lag = a.lag || 0; this.g = a.gain || 1; this.guide = 0.3; this.playing = false; this.pos = 0; }
  start(pos) {
    const c = getCtx();
    this.stop();
    const at = c.currentTime + 0.12;
    this.gm = c.createGain(); this.gi = c.createGain();
    this.out = c.createDynamicsCompressor(); this.out.threshold.value = -6; this.out.ratio.value = 4;
    this.gm.connect(this.out); this.gi.connect(this.out); this.out.connect(c.destination);
    this.sm = c.createBufferSource(); this.sm.buffer = this.b.mix; this.sm.connect(this.gm);
    this.sm.start(at, Math.max(0, pos));
    if (this.b.inst) {
      this.si = c.createBufferSource(); this.si.buffer = this.b.inst; this.si.connect(this.gi);
      const ip = pos - this.lag;
      if (ip >= 0) this.si.start(at, ip); else this.si.start(at - ip, 0);
    }
    this.setGuide(this.guide);
    this.t0 = at; this.p0 = pos; this.playing = true;
  }
  setGuide(v) {
    this.guide = v;
    if (!this.gm) return;
    if (this.b.inst) { this.gm.gain.value = v; this.gi.gain.value = 1 - this.g * v; }
    else this.gm.gain.value = 1;
  }
  time() { return this.playing ? getCtx().currentTime - this.t0 + this.p0 : this.pos; }
  stop() {
    if (this.playing) this.pos = this.time();
    for (const s of [this.sm, this.si]) { try { s && s.stop(); } catch (e) {} }
    this.sm = this.si = null; this.playing = false;
  }
}

function scoreNote(x) {
  const d = x.t1 - x.t0;
  const a = x.t0 + Math.min(0.08, d * 0.2), b = x.t1 - Math.min(0.04, d * 0.1);
  const fr = x.frames.filter((f) => f.t >= a && f.t <= b);
  if (!fr.length) return false;
  return fr.filter((f) => f.ok).length / fr.length >= 0.5;
}

// Evalúa un cuadro del micrófono contra la nota activa (con tolerancia de octava si está activada)
function evalFrame(targets, ut, p, tolCents, st, state) {
  const act = targets.find((x) => ut >= x.t0 && ut <= x.t1);
  let ok = null, shown = p.midi;
  if (p.midi != null && act) {
    let d = p.midi - act.m0;
    if (st.octaveFree) { const k = Math.round(d / 12); d -= 12 * k; state.shift = -12 * k; }
    ok = Math.abs(d * 100) <= tolCents / 2;
    const rd = p.raw != null ? p.raw - act.m0 - (st.octaveFree ? 12 * Math.round((p.raw - act.m0) / 12) : 0) : null;
    act.frames.push({ t: ut, cents: d * 100, ok, rc: rd != null ? rd * 100 : null, rms: p.rms });
  } else if (act) act.frames.push({ t: ut, cents: null, ok: false });
  if (!act && p.raw != null) { // justo antes de una nota: sirve para ver si entras desde abajo (no se puntúa)
    const up = targets.find((x) => x.t0 > ut && x.t0 - ut <= 0.15);
    if (up) { let d = p.raw - up.m0; if (st.octaveFree) d -= 12 * Math.round(d / 12); up.frames.push({ t: ut, cents: d * 100, rc: d * 100, ok: null, pre: true, rms: p.rms }); }
  }
  if (!act && p.midi != null && st.octaveFree && targets.length) {
    // sin nota activa: ubica tu voz en la octava de la nota más cercana en el tiempo (para que la línea no salte)
    let near = targets[0], bd = 1e9;
    for (const x of targets) { const d = Math.min(Math.abs(ut - x.t0), Math.abs(ut - x.t1)); if (d < bd) { bd = d; near = x; } }
    state.shift = -12 * Math.round((p.midi - near.m0) / 12);
  }
  if (shown != null && st.octaveFree) shown += state.shift || 0;
  return { ok, shown };
}

function lyricsBox() {
  const cur = h('div', { class: 'lyr-cur' });
  const next = h('div', { class: 'lyr-next' });
  return { el: h('div', { class: 'lyrics' }, cur, next), cur, next };
}
function renderLyrics(L, lines, t) {
  if (!lines.length) { L.cur.textContent = '♪'; return; }
  let i = -1;
  for (let k = 0; k < lines.length; k++) if (t >= lines[k].t0 - 0.35) i = k;
  if (L.cur.dataset.i !== String(i)) {
    L.cur.dataset.i = String(i);
    L.cur.replaceChildren(...(i < 0 ? [h('span', { class: 'w' }, '♪ ♪ ♪')] : lines[i].words.map((w) => h('span', { class: 'w' }, w.w + ' '))));
    L.next.textContent = lines[i + 1] ? lines[i + 1].text : '';
  }
  if (i >= 0) [...L.cur.children].forEach((sp, k) => sp.classList.toggle('on', lines[i].words[k] && t >= lines[i].words[k].t));
  return i;
}

// ---------- Tus grabaciones: escuchar el progreso en el tiempo ----------
let takePlaying = null;
function takesCard(s, root, nav) {
  const takes = (s.takes || []).slice().reverse();
  if (!takes.length) return null;
  const row = (tk) => {
    const btn = h('button', { class: 'btn small' }, icon('play', 16), h('span', {}, 'Escuchar'));
    btn.onclick = async () => {
      const cur = takePlaying; if (cur) { cur(); if (cur.btn === btn) return; }
      btn.lastChild.textContent = 'Cargando…';
      const bufs = await buffers({ ...s, transpose: tk.transpose || 0 });
      const p2 = new Player(bufs, shiftAnalysis(s.analysis, tk.transpose || 0)); p2.setGuide(0);
      const au = new Audio(URL.createObjectURL(tk.blob));
      p2.start(tk.pos); setTimeout(() => { au.currentTime = Math.max(0, latency()); au.play(); }, 120);
      const stop = () => { p2.stop(); au.pause(); btn.lastChild.textContent = 'Escuchar'; takePlaying = null; };
      stop.btn = btn; takePlaying = stop; au.onended = stop;
      btn.lastChild.textContent = 'Parar';
    };
    return h('div', { class: 'take-row' }, h('div', {}, h('b', {}, new Date(tk.at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ' · ' + pct(tk.score)), h('small', { class: 'muted' }, tk.mode === 'solo' ? ' sin guía' : tk.mode === 'guia' ? ' con guía' : ' karaoke')), btn);
  };
  const first = takes[takes.length - 1], last = takes[0];
  return h('div', { class: 'card' }, h('b', {}, 'Tus grabaciones'),
    takes.length > 1 ? h('p', { class: 'small' }, `${last.score >= first.score ? '📈' : '📉'} De ${pct(first.score)} a ${pct(last.score)}. Escucha la primera y la última: ahí se oye el avance.`) : h('p', { class: 'small muted' }, 'Cada vez que cantas la canción completa se guarda tu toma (las últimas 5, solo en tu celular).'),
    ...takes.map(row));
}

// ---------- Informe del profe después de cantar la canción ----------
export function reportView(rep, prev, { id, nav, lines, setLoop, compare, avgC }) {
  const v = { ...verdict(rep.score) };
  const warns = rep.global.filter((g) => g.tone !== 'ok').length;
  if (rep.score >= 0.85 && warns) v.title = warns > 1 ? 'Bien afinado. Ahora, los detalles' : 'Bien afinado, con un detalle'; // honesto: notas afinadas no es lo mismo que canto sin vicios
  const delta = prev && prev.score != null ? rep.score - prev.score : null;
  const improved = prev && prev.lines ? rep.lines.filter((l) => prev.lines[l.i] != null && l.score - prev.lines[l.i] >= 0.2) : [];
  const tones = { ok: '✓', mid: '•', warn: '!' };
  const lineCard = (l) => {
    const p = l.probs[0];
    const cmpBtn = compare ? h('button', { class: 'btn small' }, icon('speaker', 16), h('span', {}, 'Original vs tú')) : null;
    if (cmpBtn) cmpBtn.onclick = () => compare(l.i, cmpBtn);
    return h('div', { class: 'k-card phrase' },
      h('div', { class: 'row between' }, h('b', {}, `Frase ${l.i + 1}`), h('span', { class: 'pill ' + (l.score >= 0.8 ? 'ok' : l.score >= 0.5 ? 'meh' : 'bad') }, pct(l.score))),
      h('p', { class: 'phrase-words' }, ...l.words.map((w) => h('span', { class: 'pw ' + (w.s || 'na'), title: w.c != null ? (w.c > 0 ? '+' : '') + w.c + ' cents' : '' }, w.w + ' '))),
      ...l.probs.slice(0, 2).map((q) => h('div', { class: 'prob' }, h('p', { html: q.text }), h('p', { class: 'tip' }, '👉 ' + q.tip))),
      h('div', { class: 'row wrap' }, cmpBtn,
        h('button', { class: 'btn small', onclick: () => setLoop(l.i) }, icon('repeat', 16), 'Repetir con pista'),
        h('button', { class: 'btn small primary', onclick: () => nav(`#frase-${id}-${l.i}${p ? '-' + p.key : ''}`) }, icon('target', 16), 'Corregir')));
  };
  const problemLines = rep.lines.filter((l) => l.n >= 2 && (l.score < 0.8 || l.probs.length)).sort((a, b) => a.i - b.i);
  const top = rep.global.find((g) => g.tone !== 'ok');
  return h('div', { class: 'report' },
    h('div', { class: 'k-card' },
      h('div', { class: 'sheet-head' }, scoreRing(rep.score, 72), h('div', {}, h('h2', {}, v.title), h('p', { class: 'small' }, `${rep.hits} de ${rep.n} notas afinadas` + (avgC != null ? ` · ${Math.round(avgC)} cents de desvío al llegar` : '')))),
      delta != null ? h('p', { class: 'small' }, `${delta >= 0 ? '📈' : '📉'} La vez anterior: ${pct(prev.score)} → ahora ${pct(rep.score)}.` + (improved.length ? ` Mejoraste la${improved.length > 1 ? 's' : ''} frase${improved.length > 1 ? 's' : ''} ${improved.map((l) => l.i + 1).join(', ')}.` : '')) : null,
      say(top ? `<b>Lo principal en esta canción:</b> ${top.title.toLowerCase()}. ${top.tip}` : rep.score >= 0.7 ? '¡Muy bien cantada! Prueba sin voz guía o con más exigencia.' : 'Revisemos frase por frase.', top ? 'piensa' : v.mood, { compact: true, voice: v.voice })),
    rep.global.length ? h('div', { class: 'k-card' }, h('h3', {}, 'Cómo cantas esta canción'),
      h('div', { class: 'diag-list' }, ...rep.global.map((g) => h('div', { class: 'diag-item ' + (g.tone || 'warn') }, h('div', { class: 'diag-ic' }, tones[g.tone || 'warn']), h('div', {}, h('b', {}, g.title), h('p', {}, g.evidence), h('p', { class: 'tip' }, '👉 ' + g.tip), g.lesson ? h('button', { class: 'btn small', onclick: () => nav('#leccion-' + g.lesson) }, 'Practicar ahora') : null))))) : null,
    rep.plan.length ? h('div', { class: 'k-card' }, h('h3', {}, 'Tu plan de práctica'),
      h('p', { class: 'small' }, 'Estas frases son las que más te van a mejorar la canción. Corrige cada una (ejercicio con tu misma frase) y después vuelve a cantar la canción completa para comparar.'),
      ...rep.plan.map((l, k) => h('button', { class: 'btn line', onclick: () => nav(`#frase-${id}-${l.i}${l.probs[0] ? '-' + l.probs[0].key : ''}`) }, h('span', { class: 'pill' }, String(k + 1)), h('span', {}, lines[l.i].text, h('small', { class: 'muted', html: l.probs[0] ? ' · ' + l.probs[0].text.replace(/<[^>]+>/g, '') : '' }))))) : null,
    problemLines.length ? h('div', {}, h('h3', { class: 'k-h' }, 'Frase por frase'), ...problemLines.map(lineCard)) : null);
}

// ---------- Karaoke (escuchar / con guía / solo / libre / fiesta) ----------
export async function practiceView(root, nav, id, sig, mode = 'libre') {
  const s = await getSong(id);
  if (!s) { nav('#canciones'); return; }
  const prog = prepScreen(root, s);
  const bufs = await buffers(s, prog);
  const a = songA(s);
  const player = new Player(bufs, a);
  const st = settings();
  const lines = a.lines;
  { const ls = load(); ls.lastSong = id; save(); }
  const targets = a.notes.map((n) => ({ t0: n.t0, t1: n.t1, m0: n.m, m1: n.m, frames: [] }));
  const scored = mode === 'guia' || mode === 'solo' || mode === 'libre';
  const party = mode === 'fiesta';
  const listen = mode === 'escuchar';
  const defaultGuide = listen || party ? 100 : mode === 'guia' ? 80 : mode === 'solo' ? 0 : 40;
  const titles = { escuchar: 'Paso 1 · Escuchar', guia: 'Paso 3 · Con voz guía', solo: 'Paso 4 · Tú solo', libre: 'Karaoke libre', fiesta: 'Modo fiesta' };

  const tolSel = h('select', {}, ...[[100, 'Fácil ±50'], [70, 'Normal ±35'], [40, 'Exigente ±20'], [20, 'Maestro ±10']].map(([v, l]) => h('option', { value: v, selected: Number(st.songTol) === v ? '' : null }, l)));
  tolSel.onchange = () => setSetting('songTol', Number(tolSel.value));
  const guide = h('input', { type: 'range', min: 0, max: bufs.inst ? 200 : 100, step: 5, value: bufs.inst ? defaultGuide : 100, disabled: bufs.inst ? null : '' });
  const guideLbl = h('span', { class: 'gval' }, guide.value + '%');
  guide.oninput = () => { player.setGuide(guide.value / 100); guideLbl.textContent = guide.value + '%'; };
  player.setGuide(guide.value / 100);
  const playBtn = h('button', { class: 'playmain', 'aria-label': 'Reproducir' }, icon('play', 34));
  const restart = h('button', { class: 'iconbtn light', 'aria-label': 'Desde el inicio' }, icon('repeat'));
  const loopBtn = h('button', { class: 'chip' }, icon('repeat', 16), 'Repetir línea');
  const recBtn = h('button', { class: 'chip' }, icon('rec', 16), 'Grabarme');
  const canvas = h('canvas', { class: 'roll song' });
  const L = lyricsBox();
  const live = h('div', { class: 'livebox' });
  const seek = h('input', { type: 'range', min: 0, max: Math.floor(a.duration), value: 0, class: 'seek' });
  const timeLbl = h('span', { class: 'small' }, '0:00');
  const coachBox = h('div');
  const result = h('div');
  const intro = { escuchar: 'can_escucha', guia: 'can_guia', solo: 'can_solo' }[mode];
  coachBox.replaceChildren(say(intro ? line(intro) : party ? '¡A cantar! Solo la letra en grande.' : 'Usa audífonos para que el micrófono te escuche solo a ti.', 'feliz', { compact: true, voice: intro }));
  root.replaceChildren(h('div', { class: 'stage-dark' + (party ? ' party' : '') },
    h('div', { class: 'k-top' }, h('button', { class: 'iconbtn light', onclick: () => nav('#cancion-' + id), 'aria-label': 'Volver' }, icon('back')), h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'small' }, titles[mode]))),
    coachBox,
    party ? null : canvas,
    L.el,
    scored ? live : null,
    h('div', { class: 'k-controls' },
      h('div', { class: 'row seekrow' }, seek, timeLbl),
      h('div', { class: 'row center-row' }, restart, playBtn, scored ? loopBtn : h('span', { style: 'width:44px' })),
      h('label', { class: 'k-guide' }, h('span', {}, 'Voz guía'), guide, guideLbl),
      scored ? h('div', { class: 'row center-row' }, h('label', { class: 'k-guide' }, h('span', {}, 'Exigencia'), tolSel), recBtn) : null),
    result));
  const roll = party ? null : new Roll(canvas, { span: 6, nowFrac: 0.3 });
  if (roll) { roll.targets = targets; roll.setRange(a.lo - 3, a.hi + 3); }

  let loop = null, micOk = false, scoreOn = scored;
  let rec = null, recChunks = [], recStartPos = 0, lastTake = null;
  const state = { shift: 0 };
  // el profe graba cada toma (solo en tu celular) para poder comparar frase por frase: original vs tú
  let auto = null, autoTake = null; const allF = []; let eS = 0, lowT = 0, lastNudge = 0;

  const startPlay = async (pos) => {
    stopSpeaking();
    if (scored && !micOk) {
      try { await startMic(); micOk = true; } catch (e) { live.textContent = 'Sin micrófono: karaoke sin evaluación.'; scoreOn = false; }
    }
    // Con voz guía sonando y sin audífonos, el micrófono escucharía la guía: no se puede evaluar honestamente
    if (micOk && Number(guide.value) > 0 && headphonesKnown == null) {
      live.textContent = 'Reviso si tienes audífonos… silencio un segundo';
      headphonesKnown = !(await leakCheck(a.notes[Math.floor(a.notes.length / 2)].m));
    }
    if (micOk && Number(guide.value) > 0 && headphonesKnown === false) {
      scoreOn = false;
      coachBox.replaceChildren(say(line('can_sin_audif') + ' <small>Baja la voz guía a 0% para que te evalúe.</small>', 'atento', { compact: true, voice: 'can_sin_audif', tone: 'warn' }));
    } else if (micOk) scoreOn = scored;
    resetSmoother();
    if (pos <= 0.5) { for (const x of targets) { x.frames = []; x.result = null; } allF.length = 0; }
    roll && roll.clearUser();
    if (scoreOn && micOk && window.MediaRecorder && !(rec && rec.state === 'recording')) {
      try { const ch = []; auto = new MediaRecorder(micStream()); auto.ondataavailable = (e) => e.data.size && ch.push(e.data); const p0 = pos; auto.onstop = () => { autoTake = { blob: new Blob(ch, { type: auto.mimeType }), pos: p0, buf: null }; }; auto.start(); } catch (e) { auto = null; }
    }
    player.start(pos);
    playBtn.replaceChildren(icon('pause', 34));
    result.replaceChildren();
  };
  const stopPlay = (ended = false) => {
    player.stop();
    playBtn.replaceChildren(icon('play', 34));
    if (rec && rec.state === 'recording') rec.stop();
    if (auto && auto.state === 'recording') auto.stop();
    if (listen && ended) saveProgress(id, (p) => (p.escuchar = true)).then(() => { sfx('done'); result.replaceChildren(say('¡Listo! Ahora pasemos a línea por línea.', 'celebra'), h('button', { class: 'btn primary big', onclick: () => nav('#lineas-' + id) }, 'Paso 2: línea por línea')); });
    if (scoreOn && micOk) showResult(ended);
  };
  playBtn.onclick = () => { sfx('tap'); player.playing ? stopPlay() : startPlay(player.pos >= a.duration ? 0 : player.pos); };
  restart.onclick = () => { loop = null; loopBtn.classList.remove('on'); player.pos = 0; if (player.playing) startPlay(0); else { for (const x of targets) { x.frames = []; x.result = null; } roll && roll.clearUser(); } };
  seek.oninput = () => { const v = Number(seek.value); if (player.playing) startPlay(v); else player.pos = v; };
  const lineAt = (t) => { let idx = -1; for (let i = 0; i < lines.length; i++) if (t >= lines[i].t0 - 0.3) idx = i; return idx; };
  const setLoop = (i) => { loop = { t0: Math.max(0, lines[i].t0 - 1.2), t1: lines[i].t1 + 0.5 }; loopBtn.classList.add('on'); loopBtn.lastChild.textContent = 'Línea ' + (i + 1) + ' ✕'; startPlay(loop.t0); };
  loopBtn.onclick = () => {
    if (loop) { loop = null; loopBtn.classList.remove('on'); loopBtn.lastChild.textContent = 'Repetir línea'; return; }
    const i = Math.max(0, lineAt(player.time()));
    if (lines[i]) setLoop(i);
  };
  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { stopPlay(); return; }
    try { await startMic(); micOk = true; } catch (e) { return; }
    if (!window.MediaRecorder) { live.textContent = 'Tu navegador no permite grabar.'; return; }
    recChunks = [];
    rec = new MediaRecorder(micStream());
    rec.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
    rec.onstop = () => { lastTake = { blob: new Blob(recChunks, { type: rec.mimeType }), pos: recStartPos }; recBtn.classList.remove('on'); recBtn.lastChild.textContent = 'Grabarme'; showTake(); };
    recStartPos = player.time();
    await startPlay(recStartPos);
    rec.start();
    recBtn.classList.add('on'); recBtn.lastChild.textContent = 'Parar';
  };
  const showTake = () => {
    if (!lastTake) return;
    const au = h('audio', { src: URL.createObjectURL(lastTake.blob), preload: 'auto' });
    const both = h('button', { class: 'btn primary' }, icon('play', 16), 'Escuchar mi toma con la pista');
    let p2 = null;
    const reset = () => { both.replaceChildren(icon('play', 16), 'Escuchar mi toma con la pista'); };
    both.onclick = () => {
      if (p2) { p2.stop(); au.pause(); p2 = null; reset(); return; }
      p2 = new Player(bufs, a); p2.setGuide(0); p2.start(lastTake.pos);
      setTimeout(() => { au.currentTime = Math.max(0, latency()); au.play(); }, 120);
      au.onended = () => { p2 && p2.stop(); p2 = null; reset(); };
      both.replaceChildren(icon('pause', 16), 'Parar');
    };
    result.prepend(h('div', { class: 'k-card' }, say('Escucharte es de lo más útil: vas a notar cosas que mientras cantas no notas.', 'feliz', { compact: true }), both));
  };
  const showResult = async (ended) => {
    const done = targets.filter((x) => x.frames.length);
    done.forEach((x) => { if (!x.result) x.result = scoreNote(x) ? 'hit' : 'miss'; });
    if (done.length < 5) return;
    await sleep(80); // deja cerrar la grabación
    const rep = songReport({ targets, lines, all: allF, tol: Number(tolSel.value) });
    window.__syngReport = { rep, targets };
    const score = rep.score;
    const sung = done.flatMap((x) => x.frames.filter((f) => f.cents != null && Math.abs(f.cents) < 100).map((f) => Math.abs(f.cents)));
    const avgC = sung.length ? sung.reduce((p, q) => p + q, 0) / sung.length : null;
    observe(songObs(rep, done, Date.now()));
    addXp(Math.round(5 + score * 15));
    record({ type: 'song', pitch: score, cents: avgC, issues: rep.global.filter((g) => g.tone !== 'ok').slice(0, 2).map((g) => g.key) });
    const prev = (s.progress && s.progress.report) || null;
    const full = done.length >= targets.length * 0.6;
    if (full) track('song', { score });
    if (full) await saveProgress(id, (p) => (p.report = { at: Date.now(), score, lines: Object.fromEntries(rep.lines.map((l) => [l.i, l.score])), global: rep.global.map((g) => g.title) }));
    if (full && autoTake) { // guardar la toma para escuchar tu progreso en el tiempo (las últimas 5, solo en tu celular)
      const fresh = await getSong(id);
      fresh.takes = [...(fresh.takes || []), { at: Date.now(), score, blob: autoTake.blob, pos: autoTake.pos, transpose: s.transpose || 0, mode }].slice(-5);
      await putSong(fresh);
    }
    if (ended && (mode === 'guia' || mode === 'solo')) saveProgress(id, (p) => (p[mode] = Math.max(p[mode] || 0, score)));
    if (ended && mode === 'solo' && score >= 0.7) { sfx('done'); confetti(); }
    result.replaceChildren(reportView(rep, prev, { id, nav, lines, setLoop, compare: autoTake ? (i, btn) => compareLine(i, btn) : null, avgC }));
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Escuchar una frase: primero la original, después tu toma (con la pista)
  let cmpBusy = null;
  const compareLine = async (i, btn) => {
    if (cmpBusy) { cmpBusy(); return; }
    const ln = lines[i]; const t0 = Math.max(0, ln.t0 - 0.4), dur = ln.t1 - t0 + 0.6;
    if (!autoTake.buf) { try { autoTake.buf = await decodeFile(autoTake.blob); } catch (e) { btn.textContent = 'No pude abrir tu grabación'; return; } }
    const c = getCtx(); let stopped = false; const players = [];
    cmpBusy = () => { stopped = true; players.forEach((p) => { try { p.stop(); } catch (e) {} }); cmpBusy = null; btn.lastChild.textContent = 'Original vs tú'; };
    btn.lastChild.textContent = '▶ Original…';
    const o = new Player(bufs, a); o.setGuide(1); o.start(t0); players.push(o);
    await sleep(dur * 1000); o.stop();
    if (stopped) return;
    btn.lastChild.textContent = '▶ Tú…';
    const inst = new Player(bufs, a); inst.setGuide(0); inst.start(t0); players.push(inst);
    const src = c.createBufferSource(); src.buffer = autoTake.buf; const g = c.createGain(); g.gain.value = 1.8; src.connect(g).connect(c.destination);
    const off = Math.max(0, t0 - autoTake.pos + latency());
    src.start(c.currentTime + 0.02, off, dur); players.push({ stop: () => src.stop() });
    await sleep(dur * 1000 + 100); inst.stop();
    if (!stopped) cmpBusy && cmpBusy();
  };

  let lastSeek = 0;
  while (!sig.aborted) {
    const t = player.time();
    if (player.playing) {
      if (loop && t > loop.t1) startPlay(loop.t0);
      if (t > a.duration + 0.3) stopPlay(true);
    }
    renderLyrics(L, lines, t);
    if (performance.now() - lastSeek > 250) { seek.value = Math.floor(t); timeLbl.textContent = fmtTime(t) + ' / ' + fmtTime(a.duration); lastSeek = performance.now(); }
    if (roll) {
      const ut = t - (micOk ? latency() : 0);
      if (player.playing && micOk && scoreOn) {
        const p = readPitch();
        const { ok, shown } = evalFrame(targets, ut, p, Number(tolSel.value), st, state);
        allF.push({ t: ut, m: shown });
        // el profe en vivo: si cantas apagado varios segundos, te lo dice
        if (p.midi != null && targets.some((x) => ut >= x.t0 && ut <= x.t1)) {
          eS = eS * 0.95 + p.rms * 0.05;
          const ref = (voiceProfile() || {}).speakRms;
          if (ref && eS < ref * 0.6) lowT += 1 / 60; else lowT = 0;
          if (lowT > 3 && performance.now() - lastNudge > 12000) { lastNudge = performance.now(); lowT = 0; coachBox.replaceChildren(say('📣 <b>¡Con más ganas!</b> Estás cantando más bajito que cuando hablas. Cántala para alguien.', 'atento', { compact: true })); }
        }
        roll.addUser(ut, shown, ok);
        for (const x of targets) if (!x.result && x.frames.length && ut > x.t1 + 0.05) { x.result = scoreNote(x) ? 'hit' : 'miss'; }
        const dn = targets.filter((x) => x.result);
        if (dn.length) live.textContent = `Notas afinadas: ${dn.filter((x) => x.result === 'hit').length} de ${dn.length}`;
      }
      roll.draw(micOk ? ut : t, { showUser: scoreOn });
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  player.stop();
  if (rec && rec.state === 'recording') rec.stop();
}

// ---------- Paso 2: línea por línea (llamada y respuesta, como en clase) ----------
export async function linesView(root, nav, id, sig) {
  const s = await getSong(id);
  if (!s) { nav('#canciones'); return; }
  const prog = prepScreen(root, s);
  const bufs = await buffers(s, prog);
  const a = songA(s);
  const lines = a.lines;
  if (!lines.length) { root.replaceChildren(h('div', { class: 'page' }, say('Esta canción no tiene letra. Agrégala en "Editar letra" para practicar línea por línea.', 'piensa'), h('button', { class: 'btn', onclick: () => nav('#cancion-' + id) }, 'Volver'))); return; }
  const best = (s.progress && s.progress.lineas) || {};
  const st = settings();
  const player = new Player(bufs, a);
  let i = Math.max(0, lines.findIndex((_, k) => !(best[k] >= 0.7)));
  const chips = h('div', { class: 'line-chips' });
  const coachBox = h('div');
  const canvas = h('canvas', { class: 'roll song' });
  const L = lyricsBox();
  const actions = h('div', { class: 'k-controls' });
  root.replaceChildren(h('div', { class: 'stage-dark' },
    h('div', { class: 'k-top' }, h('button', { class: 'iconbtn light', onclick: () => nav('#cancion-' + id) }, icon('back')), h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'small' }, 'Paso 2 · Línea por línea'))),
    chips, coachBox, canvas, L.el, actions));
  const roll = new Roll(canvas, { span: 6, nowFrac: 0.3 });
  roll.setRange(a.lo - 3, a.hi + 3);
  const drawChips = () => chips.replaceChildren(...lines.map((_, k) => h('button', { class: 'lc' + (k === i ? ' cur' : '') + (best[k] >= 0.7 ? ' ok' : best[k] != null ? ' meh' : ''), onclick: () => { i = k; stage('intro'); } }, String(k + 1))));
  let micOk = false;
  try { await startMic(); micOk = true; } catch (e) {}
  coachBox.replaceChildren(say(line('can_lineas'), 'feliz', { compact: true, voice: 'can_lineas' }));
  const span = (k) => ({ t0: Math.max(0, lines[k].t0 - 1.5), t1: lines[k].t1 + 0.6 });
  let lastAll = [];
  const playSpan = async (k, guideV, scoring) => {
    const { t0, t1 } = span(k);
    const targets = a.notes.filter((n) => n.t0 >= lines[k].t0 - 0.15 && n.t0 < lines[k].t1).map((n) => ({ t0: n.t0, t1: n.t1, m0: n.m, m1: n.m, frames: [] }));
    roll.targets = targets.length ? targets : a.notes.map((n) => ({ t0: n.t0, t1: n.t1, m0: n.m, m1: n.m, frames: [], result: 'demo' }));
    if (!scoring) roll.targets.forEach((x) => (x.result = 'demo'));
    roll.clearUser(); resetSmoother();
    player.setGuide(guideV); player.start(t0);
    const state = { shift: 0 }; lastAll = [];
    while (!sig.aborted && player.playing) {
      const t = player.time();
      if (t >= t1) break;
      renderLyrics(L, lines, t);
      const ut = t - (scoring ? latency() : 0);
      if (scoring && micOk) {
        const p = readPitch();
        const { ok, shown } = evalFrame(targets, ut, p, Number(st.songTol) || 70, st, state);
        lastAll.push({ t: ut, m: shown });
        roll.addUser(ut, shown, ok);
        for (const x of targets) if (!x.result && x.frames.length && ut > x.t1 + 0.05) x.result = scoreNote(x) ? 'hit' : 'miss';
      }
      roll.draw(ut, { showUser: scoring });
      await new Promise((r) => requestAnimationFrame(r));
    }
    player.stop();
    return targets;
  };
  const stage = async (phase) => {
    drawChips();
    stopSpeaking();
    if (phase === 'intro') {
      renderLyrics(L, lines, lines[i].t0);
      actions.replaceChildren(h('button', { class: 'btn primary big', onclick: () => stage('listen') }, icon('speaker', 18), `Escuchar línea ${i + 1}`));
      return;
    }
    if (phase === 'listen') {
      actions.replaceChildren(h('div', { class: 'center small' }, '👂 Escucha cómo va…'));
      await playSpan(i, 1.4, false);
      if (sig.aborted) return;
      actions.replaceChildren(
        h('button', { class: 'btn primary big', onclick: () => stage('sing') }, icon('mic', 18), 'Ahora canto yo'),
        h('button', { class: 'btn ghost', onclick: () => stage('listen') }, 'Escuchar otra vez'));
      return;
    }
    if (phase === 'sing') {
      actions.replaceChildren(h('div', { class: 'center small' }, '🎤 Tu turno: canta cuando llegue la línea'));
      coachBox.replaceChildren(say(line('can_tu_turno'), 'atento', { compact: true }));
      const targets = await playSpan(i, 0, true);
      if (sig.aborted) return;
      targets.forEach((x) => { if (!x.result) x.result = scoreNote(x) ? 'hit' : 'miss'; });
      roll.draw(lines[i].t1);
      const sc = targets.length ? targets.filter((x) => x.result === 'hit').length / targets.length : 0;
      best[i] = Math.max(best[i] || 0, sc);
      await saveProgress(id, (p) => (p.lineas = { ...(p.lineas || {}), [i]: best[i] }));
      const all = lines.every((_, k) => best[k] >= 0.7);
      if (all) await saveProgress(id, (p) => (p.lineasOk = true));
      const v = verdict(sc);
      sfx(sc >= 0.7 ? 'ok' : 'bad');
      // el profe revisa la frase: final, entrada, nota alta, palabra difícil…
      const rp = targets.length >= 2 ? songReport({ targets, lines, all: lastAll, tol: Number(st.songTol) || 70 }) : null;
      if (rp) observe(songObs(rp, targets, Date.now()));
      const pr = rp && rp.lines.find((l) => l.i === i);
      const top = pr && pr.probs[0] ? pr.probs[0] : diagnoseSeq(targets, [], { tol: Number(st.songTol) || 70 })[0];
      coachBox.replaceChildren(say(`<b>${v.title}</b> ${targets.filter((x) => x.result === 'hit').length} de ${targets.length} notas afinadas.` + (top ? `<br>${top.text}<br><span class="tip">👉 ${top.tip}</span>` : ''), v.mood, { compact: true, voice: [v.voice, top && top.voice].filter(Boolean) }));
      if (pr && pr.words.length) coachBox.append(h('p', { class: 'phrase-words' }, ...pr.words.map((w) => h('span', { class: 'pw ' + (w.s || 'na') }, w.w + ' '))));
      addXp(sc >= 0.7 ? 3 : 1);
      drawChips();
      const last = i === lines.length - 1;
      actions.replaceChildren(
        h('button', { class: 'btn ' + (sc >= 0.7 ? '' : 'primary'), onclick: () => stage('sing') }, icon('repeat', 16), 'Otra vez'),
        h('button', { class: 'btn ghost', onclick: () => stage('listen') }, 'Escuchar'),
        sc < 0.8 ? h('button', { class: 'btn', onclick: () => nav(`#frase-${id}-${i}${top && top.key ? '-' + top.key : ''}`) }, icon('target', 16), 'Corregir') : null,
        sc >= 0.7 || true ? h('button', { class: 'btn ' + (sc >= 0.7 ? 'primary' : ''), onclick: () => { if (last) { if (all) { sfx('done'); confetti(); } nav('#cancion-' + id); } else { i++; stage('listen'); } } }, last ? 'Terminar' : 'Siguiente línea') : null);
    }
  };
  stage('intro');
  while (!sig.aborted) await sleep(300);
  player.stop();
}

// ---------- Sincronizar letra a mano ----------
export async function syncView(root, nav, id, sig) {
  const s = await getSong(id);
  const bufs = await buffers(s);
  const a = s.analysis;
  const lines = a.lines.map((l) => ({ ...l }));
  if (!lines.length) { root.replaceChildren(h('div', { class: 'page' }, say('Esta canción no tiene letra. Agrégala en "Editar letra".', 'piensa'))); return; }
  const player = new Player(bufs, a); player.setGuide(1);
  let idx = 0;
  const big = h('button', { class: 'tap-pad' }, 'Toca cuando EMPIECE la línea 1');
  const L = lyricsBox();
  L.cur.textContent = lines[0].text; L.next.textContent = lines[1] ? lines[1].text : '';
  const startB = h('button', { class: 'btn primary' }, icon('play', 16), 'Empezar');
  const undo = h('button', { class: 'btn' }, 'Deshacer');
  const saveB = h('button', { class: 'btn primary' }, 'Guardar');
  const timeL = h('div', { class: 'small center' }, '0:00');
  root.replaceChildren(h('div', { class: 'stage-dark' },
    h('div', { class: 'k-top' }, h('button', { class: 'iconbtn light', onclick: () => nav('#cancion-' + id) }, icon('back')), h('div', { class: 'grow' }, h('b', {}, 'Ajustar letra'), h('div', { class: 'small' }, s.title))),
    say('Suena la canción con voz. Toca el botón grande justo cuando <b>empieza</b> cada línea. Si te equivocas, "Deshacer" retrocede una.', 'atento', { compact: true }),
    timeL, L.el, big, h('div', { class: 'row center-row' }, startB, undo, saveB)));
  const refresh = () => {
    L.cur.textContent = lines[idx] ? lines[idx].text : '✓ Terminado';
    L.next.textContent = lines[idx + 1] ? lines[idx + 1].text : '';
    big.textContent = lines[idx] ? `Toca cuando EMPIECE la línea ${idx + 1}` : 'Listo: guarda';
  };
  startB.onclick = () => { idx = 0; player.start(0); refresh(); };
  big.onpointerdown = (e) => { e.preventDefault(); if (!player.playing || !lines[idx]) return; sfx('tap'); lines[idx].t0 = Math.max(0, player.time() - 0.15); idx++; refresh(); };
  undo.onclick = () => { if (idx > 0) { idx--; player.start(Math.max(0, lines[idx].t0 - 2)); refresh(); } };
  saveB.onclick = async () => {
    player.stop();
    for (let i = 0; i < lines.length; i++) {
      const nextT = lines[i + 1] ? lines[i + 1].t0 : a.duration;
      const ns = a.notes.filter((n) => n.t0 >= lines[i].t0 - 0.1 && n.t1 <= nextT + 0.05);
      lines[i].t1 = ns.length ? ns[ns.length - 1].t1 : Math.min(nextT, lines[i].t0 + 4);
    }
    a.lines = wordTimes(lines.map(({ text, t0, t1 }) => ({ text, t0, t1 })), a.notes);
    await putSong(s);
    sfx('ok');
    nav('#cancion-' + id);
  };
  while (!sig.aborted) { timeL.textContent = fmtTime(player.time()); await sleep(200); }
  player.stop();
}
