import { h, Roll, tuner, pct, sleep } from './ui.js';
import { UNITS, ALL_LESSONS, warmup, extraSession } from './curriculum.js';
import { run, voiceType } from './exercises.js';
import { load, save, settings, setSetting, addXp, record, lessonState, setLesson, getRange, resetAll, today } from './store.js';
import { getCtx, startMic, stopMic, readPitch, resetSmoother, playNote, startDrone, Metronome } from './audio.js';
import { noteName } from './pitch.js';
import { songsView, newSongView, songDetail, practiceView, syncView } from './songs.js';
import { getSong } from './store.js';

const view = document.getElementById('view');
const hdr = document.getElementById('hdr-stats');
let sig = { aborted: false };
let metro = null;

function nav(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', route);

function renderHeader() {
  const s = load();
  hdr.textContent = `🔥 ${s.streak || 0}  ·  ⭐ ${s.xp} XP`;
}

async function route() {
  sig.aborted = true;
  sig = { aborted: false };
  if (metro) { metro.stop(); metro = null; }
  stopMic();
  window.scrollTo(0, 0);
  renderHeader();
  const hsh = (location.hash || '#aprender').slice(1);
  const tab = /^(cancion|practicar-|fiesta-|sincronizar-|editarletra-)/.test(hsh) || hsh === 'canciones' ? 'cancion'
    : /^(practicar|afinador|teclado|metronomo|extra-|calentamiento|rango)/.test(hsh) ? 'practicar'
    : hsh === 'perfil' ? 'perfil' : 'aprender';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  try {
    if (hsh === 'aprender' || hsh === '') return learnView();
    if (hsh.startsWith('leccion-')) return lessonView(hsh.slice(8));
    if (hsh === 'calentamiento') return sessionView('Calentamiento diario', warmup(), 'warmup');
    if (hsh.startsWith('extra-')) return sessionView(EXTRA[hsh.slice(6)] || 'Práctica', extraSession(hsh.slice(6)), 'extra-' + hsh.slice(6));
    if (hsh === 'rango') return sessionView('Test de rango', [{ type: 'range' }], 'range');
    if (hsh === 'practicar') return gymView();
    if (hsh === 'afinador') return freeTuner();
    if (hsh === 'teclado') return keyboardView();
    if (hsh === 'metronomo') return metronomeView();
    if (hsh === 'canciones') return songsView(view, nav);
    if (hsh === 'cancion-nueva') return newSongView(view, nav);
    if (hsh.startsWith('cancion-')) return songDetail(view, nav, hsh.slice(8));
    if (hsh.startsWith('practicar-')) return practiceView(view, nav, hsh.slice(10), sig, false);
    if (hsh.startsWith('fiesta-')) return practiceView(view, nav, hsh.slice(7), sig, true);
    if (hsh.startsWith('sincronizar-')) return syncView(view, nav, hsh.slice(12), sig);
    if (hsh.startsWith('editarletra-')) { const s = await getSong(hsh.slice(12)); return newSongView(view, nav, s); }
    if (hsh === 'perfil') return profileView();
    return learnView();
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'card warnbox' }, 'Algo falló: ' + e.message));
  }
}

const EXTRA = { oido: 'Entrenamiento de oído', ritmo: 'Ritmo', fina: 'Afinación fina', melodia: 'Melodías nuevas', rango: 'Todo tu rango' };

// ---------- Aprender (camino de lecciones) ----------
function isUnlocked(idx) {
  if (idx === 0) return true;
  const prev = ALL_LESSONS[idx - 1];
  return !!(lessonState(prev.id) && lessonState(prev.id).done);
}
function learnView() {
  const s = load();
  const r = getRange();
  const doneCount = ALL_LESSONS.filter((l) => lessonState(l.id)?.done).length;
  const nextIdx = ALL_LESSONS.findIndex((l, i) => isUnlocked(i) && !lessonState(l.id)?.done);
  const goal = Math.min(1, (s.lastDay === today() ? s.todayXp || 0 : 0) / s.dailyGoal);
  const top = h('div', { class: 'card' },
    h('div', { class: 'row between' }, h('b', {}, 'Meta de hoy'), h('span', { class: 'muted small' }, `${doneCount}/${ALL_LESSONS.length} lecciones`)),
    h('div', { class: 'progress' }, h('div', { class: 'pfill ok', style: `width:${goal * 100}%` })),
    r.guessed ? h('p', { class: 'warnbox small' }, 'Aún no mediste tu rango. Empieza por la lección 1 para que los ejercicios queden a tu medida.') : null,
    h('div', { class: 'row' },
      nextIdx >= 0 ? h('button', { class: 'btn primary', onclick: () => nav('#leccion-' + ALL_LESSONS[nextIdx].id) }, '▶ Continuar: ' + ALL_LESSONS[nextIdx].title) : h('b', {}, '¡Completaste todo el camino! 🏆'),
      h('button', { class: 'btn', onclick: () => nav('#calentamiento') }, '🔥 Calentamiento')));
  let gi = 0;
  const units = UNITS.map((u) => {
    const ls = u.lessons.map((l) => {
      const idx = gi++;
      const st = lessonState(l.id);
      const un = isUnlocked(idx);
      return h('button', { class: 'lesson' + (st?.done ? ' done' : '') + (un ? '' : ' locked') + (idx === nextIdx ? ' next' : ''),
        onclick: () => (un ? nav('#leccion-' + l.id) : flash('Completa la lección anterior primero')) },
        h('span', { class: 'dot' }, st?.done ? '★'.repeat(st.stars) : un ? '▶' : '🔒'),
        h('span', {}, l.title));
    });
    return h('section', { class: 'unit' }, h('h3', {}, u.title), h('p', { class: 'muted small' }, u.desc), h('div', { class: 'lessons' }, ls));
  });
  view.replaceChildren(top, ...units);
}
function flash(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- Reproductor de lecciones ----------
function lessonView(id) {
  const idx = ALL_LESSONS.findIndex((l) => l.id === id);
  if (idx < 0) return nav('#aprender');
  const l = ALL_LESSONS[idx];
  return sessionView(l.unit.title + ' · ' + l.title, l.build(), id, ALL_LESSONS[idx + 1]);
}

async function sessionView(title, exercises, id, nextLesson) {
  const mySig = sig;
  const bar = h('div', { class: 'progress' }, h('div', { class: 'pfill' }));
  const stage = h('div');
  view.replaceChildren(h('div', { class: 'row between' }, h('b', {}, title), h('button', { class: 'btn ghost', onclick: () => nav('#aprender') }, '✕')), bar, stage);
  const scores = [];
  const metrics = { cents: [], timing: [] };
  for (let i = 0; i < exercises.length; i++) {
    if (mySig.aborted) return;
    bar.firstChild.style.width = (i / exercises.length) * 100 + '%';
    const ex = exercises[i];
    let res;
    while (true) {
      res = await run(ex, stage, mySig);
      if (mySig.aborted) return;
      if (res.info) break;
      // mostrar resultado honesto del ejercicio
      const decision = await new Promise((resolve) => {
        const good = res.score >= 0.7;
        stage.replaceChildren(h('div', { class: 'card result ' + (good ? 'good' : 'meh') },
          h('div', { class: 'bigscore' }, pct(res.score)),
          h('p', {}, res.detail || ''),
          res.keepView ? h('div', { class: 'keep' }, res.keepView) : null,
          h('p', { class: 'muted small' }, good ? (res.score >= 0.95 ? 'Excelente.' : 'Bien. Puedes repetir para mejorar o seguir.') : 'Aún no está: repítelo. Escucha con atención antes de cantar y mira hacia dónde se va tu línea.'),
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => resolve('again') }, '↻ Repetir'),
            h('button', { class: 'btn primary', onclick: () => resolve('next') }, 'Continuar →'))));
      });
      if (decision === 'next') break;
    }
    if (!res.info) {
      scores.push(res.score);
      if (res.cents != null) metrics.cents.push(res.cents);
      if (res.timing != null) metrics.timing.push(res.timing);
    }
  }
  bar.firstChild.style.width = '100%';
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
  const avgC = metrics.cents.length ? metrics.cents.reduce((a, b) => a + b, 0) / metrics.cents.length : null;
  record({ type: id, pitch: score, cents: avgC, timing: metrics.timing.length ? metrics.timing.reduce((a, b) => a + b, 0) / metrics.timing.length : null });
  let stars = null;
  const isLesson = ALL_LESSONS.some((l) => l.id === id);
  if (isLesson) stars = setLesson(id, score);
  const xp = Math.round(5 + score * 15);
  addXp(xp);
  renderHeader();
  const passed = !isLesson || stars > 0;
  stage.replaceChildren(h('div', { class: 'card center' },
    h('h2', {}, passed ? (isLesson ? '¡Lección completada!' : '¡Sesión terminada!') : 'Casi… todavía no'),
    isLesson ? h('div', { class: 'stars' }, stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆') : null,
    h('div', { class: 'bigscore' }, pct(score)),
    avgC != null ? h('p', {}, `Desviación media de afinación (en las notas que alcanzaste): ${Math.round(avgC)} cents`) : null,
    h('p', { class: 'muted' }, `+${xp} XP`),
    !passed ? h('p', {}, 'Necesitas 70% para avanzar. Repite la lección: la repetición con retroalimentación es justamente lo que entrena tu oído y tu voz.') : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => route() }, '↻ Repetir'),
      passed && nextLesson ? h('button', { class: 'btn primary', onclick: () => nav('#leccion-' + nextLesson.id) }, 'Siguiente →') : h('button', { class: 'btn primary', onclick: () => nav('#aprender') }, 'Volver al camino'))));
}

// ---------- Gimnasio ----------
function gymView() {
  const item = (hash, t, d) => h('button', { class: 'card songrow', onclick: () => nav(hash) }, h('div', {}, h('b', {}, t), h('div', { class: 'muted small' }, d)), h('span', { class: 'chev' }, '›'));
  view.replaceChildren(
    h('h2', {}, 'Practicar'),
    h('p', { class: 'muted' }, 'Ejercicios para hacer fuera de las lecciones, todos los días.'),
    item('#calentamiento', '🔥 Calentamiento diario', 'Respiración → lip trill → escalas → arpegio (≈8 min)'),
    item('#afinador', '🎯 Afinador libre', 'Ve tu nota y cuántos cents te desvías, en vivo'),
    item('#teclado', '🎹 Notas de referencia y bordón', 'Toca notas para buscarlas con tu voz'),
    item('#metronomo', '⏱️ Metrónomo', 'Para practicar el pulso'),
    item('#extra-fina', '🔬 Afinación fina', 'Notas clavadas, bordón y oído de 10–25 cents'),
    item('#extra-oido', '👂 Entrenamiento de oído', 'Sube/baja, intervalos, desafinaciones'),
    item('#extra-ritmo', '🥁 Ritmo', 'Golpes y entradas a tiempo'),
    item('#extra-melodia', '🎼 Melodías nuevas', 'Melodías al azar para imitar (cada vez distintas)'),
    item('#extra-rango', '↕️ Todo tu rango', 'Notas al azar por todo tu registro'),
    item('#rango', '📏 Medir mi rango otra vez', 'Si tu voz cambió o la medición salió rara'),
  );
}

async function freeTuner() {
  const tu = tuner(50);
  const canvas = h('canvas', { class: 'roll' });
  const target = h('select', {}, h('option', { value: '' }, 'Nota más cercana'),
    ...Array.from({ length: 37 }, (_, i) => 40 + i).map((m) => h('option', { value: m }, noteName(m))));
  const tolS = h('select', {}, ...[[100, '±50 cents'], [50, '±25'], [30, '±15'], [20, '±10']].map(([v, l]) => h('option', { value: v, selected: v === 50 ? '' : null }, l)));
  tolS.onchange = () => tu.setTol(Number(tolS.value));
  const play = h('button', { class: 'btn' }, '🔊 Oír nota objetivo');
  play.onclick = () => target.value && playNote(Number(target.value), 0, 1.2);
  view.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Afinador libre'),
    h('div', { class: 'row' }, h('label', { class: 'small' }, 'Objetivo ', target), h('label', { class: 'small' }, 'Zona ', tolS), play),
    tu.el, canvas,
    h('p', { class: 'muted small' }, 'Úsalo para sostener notas largas: intenta que la línea quede recta y en la zona verde. 100 cents = 1 semitono.')));
  try { await startMic(); } catch (e) { view.append(h('p', { class: 'warnbox' }, 'Permite el micrófono para usar el afinador.')); return; }
  const roll = new Roll(canvas, { span: 6, nowFrac: 0.9 });
  const r = getRange(); roll.setRange(r.low - 3, r.high + 3);
  const c = getCtx(); const mySig = sig;
  resetSmoother();
  while (!mySig.aborted) {
    const p = readPitch();
    const tg = target.value ? Number(target.value) : null;
    const cents = tu.update(p.midi, tg);
    roll.targets = tg ? [{ t0: -1e9, t1: 1e9, m0: tg, m1: tg }] : [];
    roll.addUser(c.currentTime, p.midi, cents == null ? null : Math.abs(cents) <= Number(tolS.value) / 2);
    roll.draw(c.currentTime);
    await new Promise((r) => requestAnimationFrame(r));
  }
  roll.destroy();
}

function keyboardView() {
  const r = getRange();
  const lo = r.low - 2, hi = r.high + 2;
  let stopD = null;
  const droneSel = h('select', {}, h('option', { value: '' }, 'Sin bordón'), ...Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((m) => h('option', { value: m }, noteName(m))));
  droneSel.onchange = () => { stopD && stopD(); stopD = droneSel.value ? startDrone(Number(droneSel.value)) : null; };
  const keys = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((m) => {
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    return h('button', { class: 'key' + (black ? ' black' : '') + (m === r.comfort ? ' comfort' : ''), onclick: () => playNote(m, 0, 1) }, noteName(m));
  });
  view.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Notas de referencia'),
    h('p', { class: 'muted small' }, `Tu rango: ${noteName(r.low)}–${noteName(r.high)}. La nota marcada es tu zona central (${noteName(r.comfort)}).`),
    h('label', { class: 'row small' }, 'Bordón continuo ', droneSel),
    h('div', { class: 'keys' }, keys)));
  const mySig = sig;
  (async () => { while (!mySig.aborted) await sleep(300); stopD && stopD(); })();
}

function metronomeView() {
  metro = new Metronome();
  const bpm = h('input', { type: 'range', min: 40, max: 200, value: 80 });
  const lbl = h('div', { class: 'bignote' }, '80 BPM');
  const btn = h('button', { class: 'btn primary big' }, '▶ Iniciar');
  bpm.oninput = () => { metro.bpm = Number(bpm.value); lbl.textContent = bpm.value + ' BPM'; };
  btn.onclick = () => { getCtx(); if (metro.on) { metro.stop(); btn.textContent = '▶ Iniciar'; } else { metro.start(); btn.textContent = '⏹ Detener'; } };
  view.replaceChildren(h('div', { class: 'card center' }, h('h2', {}, 'Metrónomo'), lbl, bpm, btn,
    h('p', { class: 'muted small' }, 'Ejercicio: canta una escala de 5 notas una nota por clic. Luego dos notas por clic (subdivisión).')));
}

// ---------- Perfil y ajustes ----------
function profileView() {
  const s = load(); const st = settings(); const r = getRange();
  const done = ALL_LESSONS.filter((l) => lessonState(l.id)?.done).length;
  const hist = s.history.filter((x) => x.cents != null).slice(-20);
  const first = hist.slice(0, 5), last = hist.slice(-5);
  const avg = (a, k) => (a.length ? a.reduce((p, q) => p + q[k], 0) / a.length : null);
  const trend = hist.length >= 10 ? `Desviación media: al principio ${Math.round(avg(first, 'cents'))} cents → ahora ${Math.round(avg(last, 'cents'))} cents` : 'Haz más ejercicios con voz para ver tu evolución en cents.';
  const chk = (k, label) => { const i = h('input', { type: 'checkbox' }); i.checked = !!st[k]; i.onchange = () => setSetting(k, i.checked); return h('label', { class: 'row small' }, i, label); };
  const timbre = h('select', {}, h('option', { value: 'voz' }, 'Voz (recomendado)'), h('option', { value: 'piano' }, 'Suave tipo piano'));
  timbre.value = st.timbre; timbre.onchange = () => setSetting('timbre', timbre.value);
  const lat = h('input', { type: 'number', min: 0, max: 500, value: st.latencyMs || 0 });
  lat.onchange = () => setSetting('latencyMs', Number(lat.value));
  const reset = h('button', { class: 'btn ghost danger' }, 'Borrar todo mi progreso');
  reset.onclick = () => { if (reset.dataset.sure) { resetAll(); nav('#aprender'); } else { reset.dataset.sure = 1; reset.textContent = 'Toca otra vez para confirmar'; } };
  view.replaceChildren(
    h('div', { class: 'card' }, h('h2', {}, 'Tu progreso'),
      h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Racha'), h('b', {}, (s.streak || 0) + ' días')),
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'XP'), h('b', {}, s.xp)),
        h('div', { class: 'stat' }, h('div', { class: 'muted small' }, 'Lecciones'), h('b', {}, `${done}/${ALL_LESSONS.length}`))),
      h('p', {}, r.guessed ? 'Rango: sin medir' : `Rango: ${noteName(r.low)}–${noteName(r.high)} · zona central ${noteName(r.comfort)} · ${voiceType(r.low, r.high)}`),
      h('p', { class: 'muted small' }, trend)),
    h('div', { class: 'card form' }, h('h3', {}, 'Ajustes'),
      h('label', {}, 'Sonido de las notas guía', timbre),
      chk('octaveFree', 'En canciones, aceptar cantar una octava arriba/abajo'),
      chk('echoCancel', 'Cancelación de eco del micrófono (actívala solo si cantas sin audífonos y la música confunde al detector)'),
      h('label', {}, 'Compensación de latencia (ms, 0 = automática). Si en ritmo siempre sale que entras tarde, súbela de a 20.', lat),
      reset),
    h('div', { class: 'card small muted', html: `<b>Basado en:</b> Pfordresher & Brown 2007; Hutchins & Peretz 2012; Berglin, Pfordresher & Demorest 2022 (retroalimentación visual); Pfordresher & Greenspon 2024 (rango amplio); Titze 2006 y estudios de pajita/lip trill (SOVT); principios de aprendizaje motor (Maas 2008, NATS Journal of Singing); métodos de Seth Riggs (SLS), Cathrine Sadolin (CVT), Jo Estill y Cheryl Porter. Detección de tono: McLeod Pitch Method.` }),
  );
}

// arrancar el audio con el primer toque (requisito de los navegadores)
document.addEventListener('pointerdown', () => getCtx(), { once: true });
route();
