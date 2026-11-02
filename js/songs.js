// Tus canciones: subir, analizar, practicar con karaoke + afinador, sincronizar letra, grabarte.
import { h, Roll, pct, sleep } from './ui.js';
import { getCtx, startMic, readPitch, resetSmoother, latency, decodeFile, micStream } from './audio.js';
import { noteName } from './pitch.js';
import { analyzeSong, parseLyrics, autoAlign, wordTimes } from './analysis.js';
import { leakCheck } from './exercises.js';
import { putSong, getSong, listSongs, deleteSong, settings, setSetting, getRange, addXp, record } from './store.js';

const cache = new Map(); // id -> {mix, inst} AudioBuffers

export async function songsView(root, nav) {
  root.replaceChildren(h('div', { class: 'card' }, 'Cargando…'));
  let list = [];
  try { list = await listSongs(); } catch (e) { root.replaceChildren(h('div', { class: 'card warnbox' }, 'Tu navegador no permite guardar canciones (IndexedDB). Prueba con Chrome o sin modo incógnito.')); return; }
  root.replaceChildren(...[
    h('div', { class: 'card' },
      h('h2', {}, 'Tus canciones'),
      h('p', { class: 'muted' }, 'Sube tu canción de Suno con voz + la versión instrumental + la letra. La app detecta la melodía nota por nota y te deja practicarla como karaoke, con afinador.'),
      h('button', { class: 'btn primary big', onclick: () => nav('#cancion-nueva') }, '+ Nueva canción')),
    ...list.map((s) => h('button', { class: 'card songrow', onclick: () => nav('#cancion-' + s.id) },
      h('div', {}, h('b', {}, s.title), h('div', { class: 'muted small' },
        `${fmtTime(s.analysis.duration)} · ${s.analysis.key} · ${s.analysis.notes.length} notas · ${s.analysis.lines.length} líneas`)),
      h('span', { class: 'chev' }, '›'))),
    list.length ? null : h('p', { class: 'muted center' }, 'Aún no tienes canciones.'),
  ].filter(Boolean));
}

const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export function newSongView(root, nav, existing = null) {
  const title = h('input', { type: 'text', placeholder: 'Título', value: existing ? existing.title : '' });
  const mix = h('input', { type: 'file', accept: 'audio/*' });
  const inst = h('input', { type: 'file', accept: 'audio/*' });
  const voc = h('input', { type: 'file', accept: 'audio/*' });
  const lyr = h('textarea', { rows: 10, placeholder: 'Pega aquí la letra (una línea por verso). Las etiquetas como [Chorus] se ignoran.' });
  if (existing) lyr.value = existing.lyrics || '';
  const status = h('div', { class: 'muted' });
  const bar = h('div', { class: 'progress' }, h('div', { class: 'pfill' }));
  bar.style.display = 'none';
  const go = h('button', { class: 'btn primary big' }, existing ? 'Guardar letra' : 'Analizar y guardar');
  root.replaceChildren(h('div', { class: 'card form' },
    h('h2', {}, existing ? 'Editar letra' : 'Nueva canción'),
    existing ? null : h('label', {}, 'Título', title),
    existing ? null : h('label', {}, '1. Versión CON voz (obligatoria)', mix),
    existing ? null : h('label', {}, '2. Versión instrumental (muy recomendada: permite aislar la voz y cantar sin ella)', inst),
    existing ? null : h('label', {}, '3. Pista de voz sola (opcional: si la sacaste con "Get Stems", es lo más preciso)', voc),
    h('label', {}, 'Letra', lyr),
    existing ? null : h('p', { class: 'muted small' }, 'Importante: la versión con voz y la instrumental deben ser de la misma generación (las que da Suno al separar stems), para que calcen al milisegundo.'),
    go, bar, status));

  go.onclick = async () => {
    if (existing) {
      const s = await getSong(existing.id);
      s.lyrics = lyr.value;
      s.analysis.lines = wordTimes(autoAlign(parseLyrics(s.lyrics), s.analysis.phrases, s.analysis.duration), s.analysis.notes);
      await putSong(s);
      nav('#cancion-' + s.id);
      return;
    }
    const fm = mix.files[0], fi = inst.files[0], fv = voc.files[0];
    if (!fm) { status.textContent = 'Falta la versión con voz.'; return; }
    go.disabled = true; bar.style.display = '';
    try {
      status.textContent = 'Leyendo archivos…';
      const [mb, ib, vb] = await Promise.all([decodeFile(fm), fi ? decodeFile(fi) : null, fv ? decodeFile(fv) : null]);
      const analysis = await analyzeSong({ mixBuf: mb, instBuf: ib, vocBuf: vb, lyrics: lyr.value }, (msg, p) => { status.textContent = msg; bar.firstChild.style.width = p * 100 + '%'; });
      if (!analysis.notes.length) { status.textContent = 'No pude detectar una melodía en la voz. ¿Seguro que el archivo 1 tiene voz?'; go.disabled = false; return; }
      const id = 's' + Date.now().toString(36);
      const song = { id, title: title.value.trim() || fm.name.replace(/\.[^.]+$/, ''), created: Date.now(), lyrics: lyr.value, mix: fm, inst: fi || null, voc: fv || null, analysis };
      await putSong(song);
      cache.set(id, { mix: mb, inst: ib });
      nav('#cancion-' + id);
    } catch (e) {
      console.error(e);
      status.textContent = 'Error al procesar el audio: ' + e.message + '. Prueba con MP3 o WAV.';
      go.disabled = false;
    }
  };
}

export async function songDetail(root, nav, id) {
  const s = await getSong(id);
  if (!s) { nav('#canciones'); return; }
  const a = s.analysis;
  const r = getRange();
  const octaveNote = a.lo > r.high - 3 ? 'La melodía está bastante más aguda que tu rango: lo normal es cantarla una octava más abajo (la app lo acepta).' :
    a.hi < r.low + 3 ? 'La melodía está más grave que tu rango: puedes cantarla una octava arriba (la app lo acepta).' : 'La melodía calza con tu rango.';
  const warn = a.quality === 'resta imperfecta' ? h('p', { class: 'warnbox' }, 'Ojo: la versión instrumental no calzó perfecto con la de voz (¿son de distinta generación?). La melodía puede tener errores. Lo ideal es subir la pista de voz sola.') :
    a.quality === 'sin instrumental' ? h('p', { class: 'warnbox' }, 'Sin la versión instrumental, la melodía se detectó sobre la mezcla completa y los instrumentos suelen confundir al detector: las notas pueden estar MAL. Además no podrás quitar la voz guía. Sube la instrumental (o la voz sola) para un análisis confiable.') : null;
  root.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, s.title),
    h('div', { class: 'stats' },
      stat('Duración', fmtTime(a.duration)), stat('Tonalidad', a.key), stat('Rango', noteName(a.lo) + '–' + noteName(a.hi)), stat('Notas', a.notes.length)),
    h('p', { class: 'muted small' }, `Detección: ${a.quality}. ${octaveNote}`),
    warn,
    h('button', { class: 'btn primary big', onclick: () => nav('#practicar-' + id) }, '🎤 Practicar (karaoke + afinador)'),
    h('button', { class: 'btn big', onclick: () => nav('#fiesta-' + id) }, '🎉 Modo fiesta (solo letra, para cantar con otros)'),
    h('button', { class: 'btn', onclick: () => nav('#sincronizar-' + id) }, '⏱️ Sincronizar letra a mano'),
    h('button', { class: 'btn', onclick: () => nav('#editarletra-' + id) }, '✏️ Editar letra'),
    h('button', { class: 'btn ghost danger' }, 'Eliminar'),
  ));
  // confirmación sin diálogos del navegador
  root.querySelector('.danger').onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure) { await deleteSong(id); cache.delete(id); nav('#canciones'); }
    else { b.dataset.sure = 1; b.textContent = 'Toca otra vez para eliminar definitivamente'; }
  };
}
const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'muted small' }, k), h('b', {}, String(v)));

async function buffers(s) {
  if (cache.has(s.id)) return cache.get(s.id);
  const mix = await decodeFile(s.mix);
  const inst = s.inst ? await decodeFile(s.inst) : null;
  const b = { mix, inst };
  cache.set(s.id, b);
  return b;
}

// Reproductor sincronizado: mezcla (con voz) * guía + instrumental * (1 − guía)
class Player {
  constructor(bufs, lag) { this.b = bufs; this.lag = lag || 0; this.guide = 0.3; this.playing = false; this.pos = 0; }
  start(pos) {
    const c = getCtx();
    this.stop();
    const at = c.currentTime + 0.12;
    this.gm = c.createGain(); this.gi = c.createGain();
    this.gm.connect(c.destination); this.gi.connect(c.destination);
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
    if (this.b.inst) { this.gm.gain.value = v; this.gi.gain.value = 1 - v; } else this.gm.gain.value = 1;
  }
  time() { return this.playing ? getCtx().currentTime - this.t0 + this.p0 : this.pos; }
  stop() {
    if (this.playing) this.pos = this.time();
    for (const s of [this.sm, this.si]) { try { s && s.stop(); } catch (e) {} }
    this.sm = this.si = null; this.playing = false;
  }
}

// ---------- Práctica karaoke ----------
export async function practiceView(root, nav, id, sig, party = false) {
  const s = await getSong(id);
  if (!s) { nav('#canciones'); return; }
  root.replaceChildren(h('div', { class: 'card' }, 'Preparando audio…'));
  const bufs = await buffers(s);
  const a = s.analysis;
  const player = new Player(bufs, a.lag);
  const st = settings();
  const lines = a.lines;
  const targets = a.notes.map((n) => ({ t0: n.t0, t1: n.t1, m0: n.m, m1: n.m, frames: [] }));

  const tolSel = h('select', {},
    ...[[100, 'Fácil (±50 cents)'], [70, 'Normal (±35)'], [40, 'Exigente (±20)'], [20, 'Maestro (±10)']].map(([v, l]) => h('option', { value: v, selected: Number(st.songTol) === v ? '' : null }, l)));
  tolSel.onchange = () => setSetting('songTol', Number(tolSel.value));
  const guide = h('input', { type: 'range', min: 0, max: 100, value: bufs.inst ? 30 : 100, disabled: bufs.inst ? null : '' });
  guide.oninput = () => { if (speakerMode && !party) { guide.value = 0; return; } player.setGuide(guide.value / 100); };
  player.setGuide(guide.value / 100);
  const playBtn = h('button', { class: 'btn primary' }, '▶ Cantar');
  const restart = h('button', { class: 'btn' }, '⏮');
  const loopBtn = h('button', { class: 'btn' }, '🔁 Repetir línea');
  const recBtn = h('button', { class: 'btn' }, '⏺ Grabarme');
  const canvas = h('canvas', { class: 'roll song' });
  const cur = h('div', { class: 'lyr-cur' }, lines.length ? '' : '(sin letra)');
  const next = h('div', { class: 'lyr-next' });
  const live = h('div', { class: 'livebox' });
  const seek = h('input', { type: 'range', min: 0, max: Math.floor(a.duration), value: 0, class: 'seek' });
  const timeLbl = h('span', { class: 'muted small' }, '0:00');
  const result = h('div');
  const headTip = h('p', { class: 'muted small' }, '🎧 Usa audífonos: así el micrófono escucha solo tu voz y la detección es exacta. ' + (st.octaveFree ? 'Se acepta cantar una octava arriba o abajo.' : ''));
  root.replaceChildren(h('div', { class: 'card karaoke' + (party ? ' party' : '') },
    h('div', { class: 'row between' }, h('b', {}, s.title), h('button', { class: 'btn ghost', onclick: () => nav('#cancion-' + id) }, '✕')),
    party ? null : headTip,
    party ? null : canvas,
    cur, next,
    party ? null : live,
    h('div', { class: 'row' }, restart, playBtn, party ? null : loopBtn, party ? null : recBtn),
    h('div', { class: 'row' }, seek, timeLbl),
    h('label', { class: 'row small' }, 'Voz guía', guide, bufs.inst ? null : h('span', { class: 'muted' }, '(sin instrumental)')),
    party ? null : h('label', { class: 'row small' }, 'Exigencia', tolSel),
    result));

  const roll = party ? null : new Roll(canvas, { span: 6, nowFrac: 0.3 });
  if (roll) { roll.targets = targets; roll.setRange(a.lo - 3, a.hi + 3); }

  let loop = null; // {t0, t1}
  let rec = null, recChunks = [], recStartPos = 0, lastTake = null;
  let micOk = false;
  let shift = 0;
  let leakChecked = false, speakerMode = false;

  const lineAt = (t) => { let idx = -1; for (let i = 0; i < lines.length; i++) if (t >= lines[i].t0 - 0.3) idx = i; return idx; };
  const renderLyrics = (t) => {
    if (!lines.length) return;
    const i = lineAt(t);
    const ln = lines[Math.max(0, i)];
    if (cur.dataset.i !== String(i)) {
      cur.dataset.i = String(i);
      cur.replaceChildren(...(i < 0 ? [h('span', { class: 'muted' }, '♪ …')] : ln.words.map((w) => h('span', { class: 'w' }, w.w + ' '))));
      next.textContent = lines[i + 1] ? lines[i + 1].text : '';
    }
    if (i >= 0) [...cur.children].forEach((sp, k) => sp.classList.toggle('on', ln.words[k] && t >= ln.words[k].t));
  };

  const tick = async () => {
    const c = getCtx();
    let lastSeek = 0;
    while (!sig.aborted) {
      const t = player.time();
      if (player.playing) {
        if (loop && t > loop.t1) { player.start(loop.t0); }
        if (t > a.duration + 0.3) { stopPlay(true); }
      }
      renderLyrics(t);
      if (performance.now() - lastSeek > 250) { seek.value = Math.floor(t); timeLbl.textContent = fmtTime(t) + ' / ' + fmtTime(a.duration); lastSeek = performance.now(); }
      if (roll) {
        const ut = t - latency();
        if (player.playing && micOk) {
          const p = readPitch();
          let ok = null, shown = p.midi;
          const act = targets.find((x) => ut >= x.t0 && ut <= x.t1);
          const tol = Number(tolSel.value) / 2;
          if (p.midi != null && act) {
            let d = p.midi - act.m0;
            if (st.octaveFree) { const k = Math.round(d / 12); d -= 12 * k; shift = -12 * k; }
            ok = Math.abs(d * 100) <= tol;
            act.frames.push({ t: ut, cents: d * 100, ok });
          } else if (act) act.frames.push({ t: ut, cents: null, ok: false });
          if (shown != null && st.octaveFree) shown += shift;
          roll.addUser(ut, shown, ok);
          // cerrar notas terminadas
          for (const x of targets) if (!x.result && x.frames.length && ut > x.t1 + 0.05) x.result = scoreNote(x) ? 'hit' : 'miss';
          updateLive();
        }
        roll.draw(ut);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    player.stop();
    if (rec && rec.state === 'recording') rec.stop();
  };

  const updateLive = () => {
    const done = targets.filter((x) => x.result);
    if (!done.length) { live.textContent = 'Canta… las notas se pintan verdes cuando las afinas.'; return; }
    const hits = done.filter((x) => x.result === 'hit').length;
    live.textContent = `Notas afinadas: ${hits}/${done.length} (${pct(hits / done.length)})`;
  };

  const startPlay = async (pos) => {
    if (!party && !micOk) {
      try { await startMic(); micOk = true; } catch (e) { live.textContent = 'Sin micrófono: solo karaoke (sin evaluación).'; }
    }
    if (!party && micOk && !leakChecked) {
      leakChecked = true;
      live.textContent = 'Revisando audífonos… (silencio un segundo)';
      if (await leakCheck(a.notes[Math.floor(a.notes.length / 2)].m)) {
        speakerMode = true;
        guide.value = 0; player.setGuide(0);
        headTip.textContent = '🔈 Estás sin audífonos: bajé la voz guía a 0% porque el micrófono la confundiría con tu voz. Aun así la música del parlante puede afectar la detección: con audífonos el puntaje es más confiable.';
        headTip.className = 'warnbox small';
      }
    }
    resetSmoother();
    if (pos <= 0.5) for (const x of targets) { x.frames = []; x.result = null; }
    roll && roll.clearUser();
    player.start(pos);
    playBtn.textContent = '⏸ Pausa';
    result.replaceChildren();
  };
  const stopPlay = (ended = false) => {
    player.stop();
    playBtn.textContent = '▶ Cantar';
    if (rec && rec.state === 'recording') rec.stop();
    if (!party) showResult(ended);
  };
  playBtn.onclick = () => (player.playing ? stopPlay() : startPlay(player.pos >= a.duration ? 0 : player.pos));
  restart.onclick = () => { loop = null; loopBtn.classList.remove('on'); player.pos = 0; if (player.playing) startPlay(0); else { for (const x of targets) { x.frames = []; x.result = null; } roll && roll.clearUser(); } };
  seek.oninput = () => { const v = Number(seek.value); if (player.playing) startPlay(v); else player.pos = v; };
  loopBtn.onclick = () => {
    if (loop) { loop = null; loopBtn.classList.remove('on'); loopBtn.textContent = '🔁 Repetir línea'; return; }
    const i = Math.max(0, lineAt(player.time()));
    if (!lines[i]) return;
    loop = { t0: Math.max(0, lines[i].t0 - 1), t1: lines[i].t1 + 0.4 };
    loopBtn.classList.add('on'); loopBtn.textContent = '🔁 Línea ' + (i + 1) + ' (quitar)';
    startPlay(loop.t0);
  };
  recBtn.onclick = async () => {
    if (rec && rec.state === 'recording') { stopPlay(); return; }
    try { await startMic(); micOk = true; } catch (e) { return; }
    if (!window.MediaRecorder) { live.textContent = 'Tu navegador no permite grabar.'; return; }
    recChunks = [];
    rec = new MediaRecorder(micStream());
    rec.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
    rec.onstop = () => { lastTake = { blob: new Blob(recChunks, { type: rec.mimeType }), pos: recStartPos }; recBtn.textContent = '⏺ Grabarme'; showTake(); };
    recStartPos = player.time();
    await startPlay(recStartPos);
    rec.start();
    recBtn.textContent = '⏹ Parar grabación';
  };
  const showTake = () => {
    if (!lastTake) return;
    const url = URL.createObjectURL(lastTake.blob);
    const au = h('audio', { src: url, preload: 'auto' });
    const both = h('button', { class: 'btn primary' }, '▶ Escuchar mi toma con la pista');
    let p2 = null;
    both.onclick = () => {
      if (p2) { p2.stop(); au.pause(); p2 = null; both.textContent = '▶ Escuchar mi toma con la pista'; return; }
      p2 = new Player(bufs, a.lag); p2.setGuide(0);
      p2.start(lastTake.pos);
      setTimeout(() => { au.currentTime = Math.max(0, latency()); au.play(); }, 120);
      au.onended = () => { p2 && p2.stop(); p2 = null; both.textContent = '▶ Escuchar mi toma con la pista'; };
      both.textContent = '⏹ Parar';
    };
    result.prepend(h('div', { class: 'card inner' }, h('b', {}, 'Tu grabación'), h('p', { class: 'muted small' }, 'Escucharte es de lo más útil: notarás cosas que no notas mientras cantas.'), both));
  };

  const showResult = (ended) => {
    const done = targets.filter((x) => x.frames.length);
    done.forEach((x) => { if (!x.result) x.result = scoreNote(x) ? 'hit' : 'miss'; });
    if (done.length < 5) return;
    const hits = done.filter((x) => x.result === 'hit').length;
    const cents = done.flatMap((x) => x.frames.filter((f) => f.cents != null && Math.abs(f.cents) < 100).map((f) => Math.abs(f.cents)));
    const avgC = cents.length ? cents.reduce((p, q) => p + q, 0) / cents.length : null;
    // entrada: primer frame afinado vs inicio de nota
    const errs = [];
    for (const x of done) { const f = x.frames.find((q) => q.ok); if (f && f.t - x.t0 < 0.4) errs.push(f.t - x.t0); }
    const tAvg = errs.length ? errs.reduce((p, q) => p + q, 0) / errs.length : null;
    // líneas más difíciles
    const lineScores = lines.map((ln, i) => {
      const ns = done.filter((x) => x.t0 >= ln.t0 - 0.1 && x.t0 < ln.t1);
      return { i, n: ns.length, r: ns.length ? ns.filter((x) => x.result === 'hit').length / ns.length : null };
    }).filter((x) => x.n >= 2 && x.r != null).sort((p, q) => p.r - q.r).slice(0, 3);
    const score = hits / done.length;
    addXp(Math.round(5 + score * 15));
    record({ type: 'song', pitch: score, cents: avgC, timing: tAvg != null ? tAvg * 1000 : null });
    result.append(h('div', { class: 'card inner' },
      h('h3', {}, 'Resultado'),
      h('div', { class: 'stats' }, stat('Notas afinadas', pct(score)), stat('Desviación al acercarte', avgC != null ? Math.round(avgC) + ' cents' : '—'),
        stat('Entrada', tAvg == null ? '—' : Math.abs(tAvg) < 0.07 ? 'a tiempo' : Math.round(tAvg * 1000) + ' ms tarde')),
      h('p', { class: 'muted small' }, honest(score, avgC) + (speakerMode ? ' (Cantaste sin audífonos: toma este resultado como aproximado.)' : '')),
      lineScores.length ? h('div', {}, h('b', {}, 'Practica estas líneas:'),
        ...lineScores.map((x) => h('button', { class: 'btn line', onclick: () => { loop = { t0: Math.max(0, lines[x.i].t0 - 1), t1: lines[x.i].t1 + 0.4 }; loopBtn.classList.add('on'); loopBtn.textContent = '🔁 Línea ' + (x.i + 1) + ' (quitar)'; startPlay(loop.t0); } },
          `${pct(x.r)} · ${lines[x.i].text}`))) : null));
  };

  tick();
}

function scoreNote(x) {
  const d = x.t1 - x.t0;
  const a = x.t0 + Math.min(0.08, d * 0.2), b = x.t1 - Math.min(0.04, d * 0.1);
  const fr = x.frames.filter((f) => f.t >= a && f.t <= b);
  if (!fr.length) return false;
  return fr.filter((f) => f.ok).length / fr.length >= 0.5;
}

function honest(score, cents) {
  if (score >= 0.9 && cents != null && cents < 15) return 'Muy afinado. Sube la exigencia o quita la voz guía para seguir progresando.';
  if (score >= 0.75) return 'Bien encaminado. Repite las líneas difíciles en bucle y luego baja la voz guía.';
  if (score >= 0.5) return 'Vas a medio camino: practica línea por línea con la voz guía alta antes de cantar la canción completa.';
  return 'Todavía cuesta. Es normal al principio: usa "Repetir línea" con la voz guía al 60–80%, y haz las lecciones de "Encuentra tu nota" y "Escalas cortas".';
}

// ---------- Sincronizar letra a mano ----------
export async function syncView(root, nav, id, sig) {
  const s = await getSong(id);
  const bufs = await buffers(s);
  const a = s.analysis;
  const lines = a.lines.map((l) => ({ ...l }));
  if (!lines.length) { root.replaceChildren(h('div', { class: 'card' }, 'Esta canción no tiene letra. Agrégala en "Editar letra".')); return; }
  const player = new Player(bufs, a.lag); player.setGuide(1);
  let idx = 0;
  const big = h('button', { class: 'tap-pad' }, 'Toca cuando EMPIECE la línea 1');
  const curL = h('div', { class: 'lyr-cur' }, lines[0].text);
  const nextL = h('div', { class: 'lyr-next' }, lines[1] ? lines[1].text : '');
  const startB = h('button', { class: 'btn primary' }, '▶ Empezar desde el inicio');
  const undo = h('button', { class: 'btn' }, '↶ Deshacer');
  const saveB = h('button', { class: 'btn primary' }, 'Guardar');
  const timeL = h('div', { class: 'muted' }, '0:00');
  root.replaceChildren(h('div', { class: 'card' },
    h('h2', {}, 'Sincronizar letra'),
    h('p', { class: 'muted small' }, 'Suena la canción con voz. Toca el botón grande justo cuando empieza cada línea. Si te equivocas, "Deshacer" retrocede una línea.'),
    timeL, curL, nextL, big, h('div', { class: 'row' }, startB, undo, saveB)));
  const refresh = () => {
    curL.textContent = lines[idx] ? lines[idx].text : '✓ Terminado';
    nextL.textContent = lines[idx + 1] ? lines[idx + 1].text : '';
    big.textContent = lines[idx] ? `Toca cuando EMPIECE la línea ${idx + 1}` : 'Listo, guarda';
  };
  startB.onclick = () => { idx = 0; player.start(0); refresh(); };
  big.onpointerdown = (e) => {
    e.preventDefault();
    if (!player.playing || !lines[idx]) return;
    const t = player.time() - 0.15; // tiempo de reacción típico
    lines[idx].t0 = Math.max(0, t);
    idx++; refresh();
  };
  undo.onclick = () => { if (idx > 0) { idx--; const back = Math.max(0, lines[idx].t0 - 2); player.start(back); refresh(); } };
  saveB.onclick = async () => {
    player.stop();
    // fin de cada línea: la última nota antes del inicio de la siguiente
    for (let i = 0; i < lines.length; i++) {
      const nextT = lines[i + 1] ? lines[i + 1].t0 : a.duration;
      const ns = a.notes.filter((n) => n.t0 >= lines[i].t0 - 0.1 && n.t1 <= nextT + 0.05);
      lines[i].t1 = ns.length ? ns[ns.length - 1].t1 : Math.min(nextT, lines[i].t0 + 4);
    }
    a.lines = wordTimes(lines.map(({ text, t0, t1 }) => ({ text, t0, t1 })), a.notes);
    await putSong(s);
    player.stop();
    nav('#cancion-' + id);
  };
  (async () => { while (!sig.aborted) { timeL.textContent = fmtTime(player.time()); await sleep(200); } player.stop(); })();
}
