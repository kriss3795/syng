import { h, Roll, tuner, pct, sleep, icon, scoreRing } from './ui.js';
import { UNITS, ALL_LESSONS, warmup, extraSession, recommend, applyLevel, LEVEL_NAMES } from './curriculum.js';
import { run, diagFindings, identityView } from './exercises.js';
import { load, save, settings, setSetting, addXp, record, lessonState, setLesson, getRange, resetAll, today, getSong, lessonLevel, LEVELS_TO_PASS, voiceProfile, homeNote, diagnoses, identities } from './store.js';
import { getCtx, startMic, stopMic, readPitch, resetSmoother, playNote, startDrone, Metronome, measureLatency } from './audio.js';
import { noteName } from './pitch.js';
import { songsView, newSongView, songDetail, practiceView, syncView, linesView } from './songs.js';
import { say, chincol, verdict, line, tipOfDay } from './coach.js';
import { speak, stopSpeaking, sfx, confetti } from './voice.js';

const view = document.getElementById('view');
const hdr = document.getElementById('hdr-stats');
let sig = { aborted: false };
let metro = null;

// ---------- Pantalla encendida ----------
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

function nav(hash) { if (location.hash === hash) route(); else location.hash = hash; }
window.addEventListener('hashchange', route);

function renderHeader() {
  const s = load();
  hdr.replaceChildren(
    h('span', { class: 'stat-chip flame' + (s.lastDay === today() ? ' lit' : '') }, icon('flame', 18), String(s.streak || 0)),
    h('span', { class: 'stat-chip xp' }, icon('bolt', 18), String(s.xp)));
}

const FOCUS = /^(leccion|hoy|calentamiento|extra|rango|practicar-|fiesta-|lineas-|escuchar-|guia-|solo-|sincronizar-)/;
async function route() {
  sig.aborted = true;
  sig = { aborted: false };
  stopSpeaking();
  if (metro) { metro.stop(); metro = null; }
  stopMic();
  releaseWake();
  window.scrollTo(0, 0);
  renderHeader();
  const hsh = (location.hash || '#aprender').slice(1);
  document.body.classList.toggle('focus', FOCUS.test(hsh));
  const tab = /^(cancion|practicar-|fiesta-|lineas-|escuchar-|guia-|solo-|sincronizar-|editarletra-)/.test(hsh) ? 'cancion'
    : /^(practicar|afinador|teclado|metronomo|extra-|calentamiento|rango)/.test(hsh) ? 'practicar'
    : hsh === 'perfil' ? 'perfil' : 'aprender';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (FOCUS.test(hsh) || hsh === 'afinador') keepAwake();
  try {
    if (hsh === 'aprender' || hsh === '') return homeView();
    if (hsh === 'hoy') return todayClass();
    if (hsh.startsWith('leccion-')) return lessonIntro(hsh.slice(8));
    if (hsh === 'identidad') return session({ title: 'Tu identidad vocal', color: 'teal', exercises: [{ type: 'identity' }], id: 'identidad' });
    if (hsh === 'diagnostico') return session({ title: 'Diagnóstico de tu voz', color: 'teal', exercises: [{ type: 'diag' }], id: 'diagnostico' });
    if (hsh === 'repaso') return session({ title: 'Repaso', color: 'teal', exercises: reviewExercises(), id: 'repaso' });
    if (hsh === 'calentamiento') return session({ title: 'Calentamiento', color: 'orange', exercises: warmup(), id: 'warmup' });
    if (hsh.startsWith('extra-')) return session({ title: EXTRA[hsh.slice(6)] || 'Práctica', color: 'blue', exercises: extraSession(hsh.slice(6)), id: 'extra-' + hsh.slice(6) });
    if (hsh === 'rango') return session({ title: 'Medir mi rango', color: 'violet', exercises: [{ type: 'range' }], id: 'range' });
    if (hsh === 'practicar') return gymView();
    if (hsh === 'afinador') return freeTuner();
    if (hsh === 'teclado') return keyboardView();
    if (hsh === 'metronomo') return metronomeView();
    if (hsh === 'canciones') return songsView(view, nav);
    if (hsh === 'cancion-nueva') return newSongView(view, nav);
    if (hsh.startsWith('cancion-')) return songDetail(view, nav, hsh.slice(8));
    if (hsh.startsWith('escuchar-')) return practiceView(view, nav, hsh.slice(9), sig, 'escuchar');
    if (hsh.startsWith('lineas-')) return linesView(view, nav, hsh.slice(7), sig);
    if (hsh.startsWith('guia-')) return practiceView(view, nav, hsh.slice(5), sig, 'guia');
    if (hsh.startsWith('solo-')) return practiceView(view, nav, hsh.slice(5), sig, 'solo');
    if (hsh.startsWith('practicar-')) return practiceView(view, nav, hsh.slice(10), sig, 'libre');
    if (hsh.startsWith('fiesta-')) return practiceView(view, nav, hsh.slice(7), sig, 'fiesta');
    if (hsh.startsWith('sincronizar-')) return syncView(view, nav, hsh.slice(12), sig);
    if (hsh.startsWith('editarletra-')) { const s = await getSong(hsh.slice(12)); return newSongView(view, nav, s); }
    if (hsh === 'perfil') return profileView();
    return homeView();
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'page' }, say('Algo falló: ' + e.message, 'piensa', { tone: 'warn' })));
  }
}

const EXTRA = { oido: 'Entrenar el oído', ritmo: 'Ritmo', fina: 'Afinación fina', melodia: 'Melodías nuevas', rango: 'Todo tu rango', aire: 'Aire parejo', lectura: 'Leer y cantar', dinamica: 'Dinámica', canciones: 'Canciones clásicas' };

// ---------- Inicio: clase de hoy + camino ----------
function isUnlocked(idx) {
  if (idx === 0) return true;
  return !!lessonState(ALL_LESSONS[idx].id)?.done || !!lessonState(ALL_LESSONS[idx - 1].id)?.done;
}
function nextLessonIdx() { return ALL_LESSONS.findIndex((l, i) => isUnlocked(i) && !lessonState(l.id)?.done); }

function homeView() {
  const s = load();
  const nextIdx = nextLessonIdx();
  const next = ALL_LESSONS[nextIdx];
  const goal = Math.min(1, (s.lastDay === today() ? s.todayXp || 0 : 0) / s.dailyGoal);
  const first = !s.xp;
  const greeting = first ? line('hola') : s.lastDay === today() ? '¡Bien, ya practicaste hoy! Si tienes ganas, sigue con otra clase.' : `¡Hola de nuevo! ${tipOfDay()}`;
  const hero = h('section', { class: 'hero' },
    say(greeting, first ? 'feliz' : 'canta', { voice: first ? 'hola' : null, autoplay: false }),
    h('div', { class: 'hero-row' },
      h('div', { class: 'goal' }, scoreRing(goal, 64), h('div', {}, h('b', {}, 'Meta de hoy'), h('div', { class: 'small muted' }, `${s.lastDay === today() ? s.todayXp || 0 : 0} de ${s.dailyGoal} XP`))),
      next ? h('button', { class: 'btn primary big', onclick: () => { sfx('select'); nav('#hoy'); } }, icon('play', 18), 'Clase de hoy') : h('b', {}, '¡Terminaste el camino! 🏆')),
    next ? h('div', { class: 'small muted center' }, `Calentamiento corto + "${next.title}" · unos 8 minutos`) : null);
  const rec = recommend(s.history || []);
  const recCard = rec ? h('button', { class: 'card rec', onclick: () => nav('#extra-' + rec.kind) },
    chincol('piensa', 44),
    h('div', {}, h('b', {}, 'Práctica recomendada: ' + EXTRA[rec.kind]), h('div', { class: 'small muted' }, 'Según tus últimos ejercicios, esto es lo que más te va a ayudar.')), icon('chevron')) : null;
  const nDone = ALL_LESSONS.filter((l) => lessonState(l.id)?.done && !l.check && !l.once).length;
  const reviewCard = nDone >= 2 ? h('button', { class: 'card rec', onclick: () => { sfx('select'); nav('#repaso'); } },
    chincol('hola', 44),
    h('div', {}, h('b', {}, 'Repaso rápido'), h('div', { class: 'small muted' }, 'Cuatro ejercicios de lo que ya aprendiste. Repasar seguido es lo que lo deja fijo.')), icon('chevron')) : null;
  let gi = 0;
  const path = UNITS.map((u) => {
    const nodes = u.lessons.map((l, k) => {
      const idx = gi++;
      const st = lessonState(l.id);
      const un = isUnlocked(idx);
      const cur = idx === nextIdx;
      const offset = [0, 1, 0, -1][k % 4];
      return h('div', { class: 'node-wrap', style: `--off:${offset}` },
        cur ? h('div', { class: 'node-tip' }, l.check ? 'Prueba' : lessonLevel(l.id) ? 'Nivel ' + (lessonLevel(l.id) + 1) : 'Empezar') : null,
        h('button', { class: 'node ' + u.color + (st?.done ? ' done' : '') + (un ? '' : ' locked') + (cur ? ' current' : ''), 'aria-label': l.title,
          onclick: () => { if (un) { sfx('select'); nav('#leccion-' + l.id); } else { sfx('bad'); flash('Completa la lección anterior primero'); } } },
          icon(st?.done ? 'star' : un ? lessonIcon(l) : 'lock', 30)),
        h('div', { class: 'node-label' }, l.title,
          !l.check && !l.once && un ? h('span', { class: 'lvl-dots' }, ...[1, 2, 3].map((k) => h('i', { class: (k <= lessonLevel(l.id) ? 'on' : '') + (k === 3 ? ' crown' : '') }))) : null,
          st?.done ? h('span', { class: 'stars-mini' }, '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars)) : null));
    });
    return h('section', { class: 'unit ' + u.color },
      h('div', { class: 'unit-head' }, h('div', {}, h('h2', {}, u.title), h('p', {}, u.desc))),
      h('div', { class: 'path' }, nodes));
  });
  view.replaceChildren(h('div', { class: 'page' }, ...[installBanner(), hero, recCard, reviewCard, ...path].filter(Boolean)));
  const cur = view.querySelector('.node.current');
  if (cur && !first) setTimeout(() => cur.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
}
function lessonIcon(l) {
  if (l.check) return 'trophy';
  if (l.once) return 'mic';
  const t = l.build.toString();
  if (/range/.test(t)) return 'mic';
  if (/rhythm\(/.test(t)) return 'drum';
  if (/breath\(|sustain\(/.test(t)) return 'breath';
  if (/ear\(/.test(t) && !/seq\(/.test(t)) return 'ear';
  if (/dyn\(/.test(t)) return 'wave';
  return 'note';
}
function flash(msg) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1900);
}

// Clase de hoy: calentamiento corto (si no calentó) + siguiente lección
function todayClass() {
  const idx = nextLessonIdx();
  if (idx < 0) return nav('#practicar');
  const l = ALL_LESSONS[idx];
  const level = nextLevel(l);
  const pre = load().lastWarmup === today() || UNITS.indexOf(l.unit) === 0 && idx < 2 ? [] : warmup(true).map((e) => ({ ...e, noScore: true }));
  return session({ title: 'Clase de hoy · ' + l.title + (l.check ? '' : ' · Nivel ' + level), color: l.unit.color, exercises: [...pre, ...applyLevel(l.build(), level)], id: l.id, lesson: l, level, next: ALL_LESSONS[idx + 1], intro: level === 1 || l.check ? l.intro : null, introVoice: l.introVoice });
}

// Nivel que toca: las pruebas de unidad tienen uno solo; las lecciones, 1 (con ayuda) → 2 (sin ayuda) → 3 (maestría, opcional)
function nextLevel(l) {
  if (l.check || l.once) return LEVELS_TO_PASS;
  return Math.min(3, lessonLevel(l.id) + 1);
}
// Repaso estilo Duolingo: un ejercicio de cada una de 4 lecciones ya aprobadas (más probables las de menos estrellas)
function reviewExercises() {
  const done = ALL_LESSONS.filter((l) => lessonState(l.id)?.done && !l.check && !l.once);
  const pool = done.flatMap((l) => Array(4 - Math.min(3, lessonState(l.id).stars || 0)).fill(l));
  const picked = [];
  while (picked.length < Math.min(4, done.length) && pool.length) {
    const l = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (!picked.includes(l)) picked.push(l);
  }
  return picked.flatMap((l) => {
    const exs = applyLevel(l.build(), 2).filter((e) => !['info', 'range', 'breath', 'speak', 'diag'].includes(e.type));
    return exs.length ? [exs[Math.floor(Math.random() * exs.length)]] : [];
  });
}

function lessonIntro(id) {
  const idx = ALL_LESSONS.findIndex((l) => l.id === id);
  if (idx < 0) return nav('#aprender');
  const l = ALL_LESSONS[idx];
  const unitIdx = UNITS.indexOf(l.unit);
  const maxLevel = nextLevel(l);
  let level = maxLevel;
  const exsFor = (lv) => applyLevel(l.build(), lv, lv === 2 && lessonLevel(l.id) < 1);
  let exs = exsFor(level);
  const needWarm = unitIdx >= 2 && load().lastWarmup !== today();
  const warmChk = h('input', { type: 'checkbox' }); warmChk.checked = needWarm;
  const nEx = exs.filter((e) => e.type !== 'info').length;
  view.replaceChildren(h('div', { class: 'lesson-intro ' + l.unit.color },
    h('div', { class: 'li-top' }, h('button', { class: 'iconbtn', onclick: () => nav('#aprender'), 'aria-label': 'Cerrar' }, icon('close')), h('span', { class: 'li-unit' }, l.unit.title)),
    h('h1', {}, l.title),
    say(l.intro || 'Vamos con esta clase.', 'feliz', { voice: l.introVoice }),
    l.check || l.once ? null : levelPicker(l, maxLevel, (lv) => { level = lv; exs = exsFor(lv); }),
    h('div', { class: 'li-meta' }, h('span', { class: 'pill' }, `${nEx} ejercicio${nEx === 1 ? '' : 's'}`), h('span', { class: 'pill' }, `≈ ${Math.max(2, Math.round(nEx * 1.5 + (warmChk.checked ? 2 : 0)))} min`), lessonState(id)?.done ? h('span', { class: 'pill ok' }, '★'.repeat(lessonState(id).stars)) : null),
    unitIdx >= 2 ? h('label', { class: 'warm-toggle' }, warmChk, h('span', {}, h('b', {}, 'Calentar antes (2 min)'), h('br'), h('small', {}, needWarm ? 'Hoy no has calentado: te lo recomiendo.' : 'Ya calentaste hoy.'))) : null,
    h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => {
      stopSpeaking(); sfx('select');
      const pre = warmChk.checked ? warmup(true).map((e) => ({ ...e, noScore: true })) : [];
      session({ title: l.title, color: l.unit.color, exercises: [...pre, ...exs], id: l.id, lesson: l, level, next: ALL_LESSONS[idx + 1] });
    } }, 'Empezar'))));
}

const LEVEL_TIPS = { 1: 'Zona más ancha, más lento, sin cambios de tono y una vuelta extra para memorizar.', 2: 'La lección completa. Al pasarla se abre la siguiente.', 3: 'Opcional: zona más estrecha y sin ver tu voz mientras cantas.' };
function levelPicker(l, maxLevel, onPick) {
  const passed = lessonLevel(l.id);
  const box = h('div', { class: 'levels' });
  const draw = (sel) => box.replaceChildren(...[1, 2, 3].map((lv) => {
    const open = lv <= maxLevel;
    return h('button', { class: 'lvl' + (lv === sel ? ' sel' : '') + (lv <= passed ? ' passed' : '') + (open ? '' : ' locked'), disabled: !open,
      onclick: () => { sfx('select'); onPick(lv); draw(lv); } },
      h('span', { class: 'lvl-n' }, lv <= passed ? '✓' : String(lv)), h('b', {}, LEVEL_NAMES[lv]), h('small', {}, LEVEL_TIPS[lv]));
  }));
  draw(maxLevel);
  return box;
}

// ---------- Sesión de ejercicios (lección, calentamiento o práctica) ----------
async function session({ title, color, exercises, id, lesson, level = LEVELS_TO_PASS, next, intro, introVoice }) {
  const mySig = sig;
  document.body.classList.add('focus');
  const fill = h('div', { class: 'pfill' });
  const stage = h('div', { class: 'stage' });
  view.replaceChildren(h('div', { class: 'session ' + (color || '') },
    h('div', { class: 'ses-top' },
      h('button', { class: 'iconbtn', onclick: () => nav(lesson ? '#aprender' : '#practicar'), 'aria-label': 'Salir' }, icon('close')),
      h('div', { class: 'progress big' }, fill),
      h('button', { class: 'iconbtn', 'aria-label': 'Voz del Chincol', onclick: (e) => { const v = settings().voice === false; setSetting('voice', v); stopSpeaking(); e.currentTarget.classList.toggle('off', !v); } , class: 'iconbtn' + (settings().voice === false ? ' off' : '') }, icon('speaker'))),
    stage));
  if (intro) {
    await new Promise((res) => stage.replaceChildren(h('div', { class: 'ex' }, say(intro, 'feliz', { voice: introVoice }), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); res(); } }, 'Vamos')))));
  }
  const scores = [], metrics = { cents: [], timing: [] }, issueKeys = [];
  let worst = null;
  for (let i = 0; i < exercises.length; i++) {
    if (mySig.aborted) return;
    fill.style.width = (i / exercises.length) * 100 + '%';
    let ex = exercises[i];
    let res, fails = 0, easier = false;
    while (true) {
      res = await run(ex, stage, mySig);
      if (mySig.aborted) return;
      if (res.info || res.skipped || ex.noScore) break;
      if (res.score < 0.7) fails++;
      const decision = await feedbackSheet(stage, res, { fails, easier, canEase: fails >= 2 && !easier && canMakeEasier(ex) });
      if (decision === 'next') break;
      if (decision === 'easier') { ex = makeEasier(ex); easier = true; }
    }
    if (!res.info && !res.skipped && !ex.noScore) {
      scores.push(res.score);
      if (res.cents != null) metrics.cents.push(res.cents);
      if (res.timing != null) metrics.timing.push(res.timing);
      (res.issues || []).slice(0, 2).forEach((x) => issueKeys.push(x.key));
      if (res.issues && res.issues[0] && (!worst || res.score < worst.score)) worst = { score: res.score, issue: res.issues[0] };
    }
  }
  fill.style.width = '100%';
  if (exercises.some((e) => e.noScore) || id === 'warmup') { load().lastWarmup = today(); save(); }
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 1;
  const avgC = metrics.cents.length ? metrics.cents.reduce((a, b) => a + b, 0) / metrics.cents.length : null;
  const hadStreak = load().lastDay === today();
  record({ type: id, pitch: score, cents: avgC, timing: metrics.timing.length ? metrics.timing.reduce((a, b) => a + b, 0) / metrics.timing.length : null, issues: issueKeys });
  let stars = null;
  if (lesson) stars = setLesson(id, score, level);
  const moreLevels = lesson && !lesson.check && stars > 0 && level < LEVELS_TO_PASS;
  const passed = !lesson || stars > 0;
  const xp = passed ? Math.round(10 + score * 15) : 5;
  addXp(xp);
  renderHeader();
  if (passed) { sfx('done'); confetti(); }
  const s = load();
  stage.replaceChildren(h('div', { class: 'ex done-screen' },
    h('div', { class: 'center' }, chincol(passed ? 'celebra' : 'piensa', 120)),
    h('h1', { class: 'center' }, passed ? (moreLevels ? `¡Nivel ${level} listo!` : lesson && level === 3 ? '¡Maestría!' : lesson ? '¡Lección completada!' : '¡Sesión terminada!') : 'Casi… todavía no'),
    moreLevels ? h('p', { class: 'center' }, `Ahora la misma lección en el nivel ${level + 1}: ${LEVEL_NAMES[level + 1].toLowerCase()}. Repetir es lo que afirma la nota en tu oído.`) : null,
    lesson ? h('div', { class: 'stars-big' }, ...[0, 1, 2].map((k) => h('span', { class: k < stars ? 'on' : '' }, '★'))) : null,
    h('div', { class: 'done-stats' },
      h('div', { class: 'dstat' }, h('small', {}, 'Resultado'), h('b', {}, pct(score))),
      h('div', { class: 'dstat xp' }, h('small', {}, 'XP'), h('b', {}, '+' + xp)),
      h('div', { class: 'dstat flame' }, h('small', {}, 'Racha'), h('b', {}, (s.streak || 0) + (s.streak === 1 ? ' día' : ' días')))),
    avgC != null ? h('p', { class: 'center small muted' }, `Desviación media de afinación en las notas que alcanzaste: ${Math.round(avgC)} cents.`) : null,
    worst ? say(`<b>Para la próxima:</b> ${worst.issue.text}<br><span class="tip">${worst.issue.tip}</span>`, 'atento', { voice: [passed ? 'leccion_ok' : 'leccion_no', worst.issue.voice].filter(Boolean) })
      : say(passed ? line('leccion_ok') : line('leccion_no'), passed ? 'celebra' : 'piensa', { voice: passed ? 'leccion_ok' : 'leccion_no' }),
    h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' },
      h('button', { class: 'btn', onclick: () => route() }, icon('repeat', 18), 'Repetir'),
      moreLevels ? h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); nav('#leccion-' + id); } }, `Nivel ${level + 1}`)
      : passed && next ? h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); nav('#leccion-' + next.id); } }, 'Siguiente lección') : h('button', { class: 'btn primary', onclick: () => nav(lesson ? '#aprender' : '#practicar') }, 'Continuar'))));
  if (passed && !hadStreak) setTimeout(() => sfx('streak'), 900);
}

// Hoja de resultado del ejercicio (estilo Duolingo, con el diagnóstico del profe)
function feedbackSheet(stage, res, { fails, easier, canEase }) {
  return new Promise((resolve) => {
    const v = verdict(res.score);
    const top = (res.issues || [])[0];
    sfx(res.score >= 0.7 ? 'ok' : 'bad');
    const keep = res.keepView ? h('div', { class: 'keep' }, res.keepView) : h('div', { class: 'center sheet-bird' }, chincol(v.mood, 130));
    const sheet = h('div', { class: 'sheet ' + v.tone },
      h('div', { class: 'sheet-head' }, scoreRing(res.score, 72), h('div', {}, h('h2', {}, v.title), h('p', { class: 'small' }, res.detail || ''))),
      top ? say(`${top.text}<br><span class="tip">${top.tip}</span>`, v.mood, { voice: [v.voice, top.voice].filter(Boolean) })
        : say(res.score >= 0.7 ? 'Así se hace. Sigamos.' : 'Escucha con atención y vuelve a intentarlo.', v.mood, { voice: v.voice }),
      easier ? h('p', { class: 'small muted' }, 'Hiciste la versión más fácil. Cuando te sientas listo, repite la lección completa.') : null,
      h('div', { class: 'actionbar' },
        canEase ? h('button', { class: 'btn', onclick: () => { stopSpeaking(); resolve('easier'); } }, 'Hacerlo más fácil') : h('button', { class: 'btn', onclick: () => { stopSpeaking(); resolve('again'); } }, icon('repeat', 18), 'Repetir'),
        h('button', { class: 'btn ' + (res.score >= 0.7 ? 'primary' : 'secondary'), onclick: () => { stopSpeaking(); sfx('select'); resolve('next'); } }, res.score >= 0.7 ? 'Continuar' : 'Seguir igual')));
    stage.replaceChildren(h('div', { class: 'ex' }, keep, h('div', { class: 'grow' }), sheet));
  });
}
const canMakeEasier = (ex) => ['seq', 'match', 'sustain', 'rhythm'].includes(ex.type);
function makeEasier(ex) {
  const e = { ...ex };
  if (e.tol) e.tol = Math.min(200, Math.round(e.tol * 1.6));
  if (e.ttol) e.ttol = Math.round(e.ttol * 1.5);
  if (e.bpm) e.bpm = Math.round(e.bpm * 0.85);
  if (e.hold) e.hold = Math.max(0.6, e.hold * 0.7);
  if (e.secs) e.secs = Math.max(3, e.secs - 2);
  if (e.type === 'seq' && e.reps) { const r0 = e.reps[0]; e.reps = e.reps.map(() => r0); if (e.reps.length < 2) e.reps = [r0, r0]; } // mismo tono y una vuelta más
  if (e.feedback === 'after') e.feedback = 'live';
  e.text = (e.text ? e.text + '<br>' : '') + '<small>Versión más fácil: zona más ancha y más lento.</small>';
  e.voice = 'v_facil';
  return e;
}

// ---------- Practicar ----------
function gymView() {
  const tile = (hash, ic, t, d, color) => h('button', { class: 'tile ' + color, onclick: () => { sfx('select'); nav(hash); } }, h('span', { class: 'tile-ic' }, icon(ic, 26)), h('b', {}, t), h('small', {}, d));
  view.replaceChildren(h('div', { class: 'page' },
    say('Esto es para practicar fuera de las clases. Lo ideal: un poquito cada día.', 'feliz', { compact: true }),
    h('h2', { class: 'sec' }, 'Calentar y técnica'),
    h('div', { class: 'tiles' },
      tile('#calentamiento', 'sparkle', 'Calentamiento', 'Aire, lip trill y escalas · 6 min', 'orange'),
      tile('#extra-aire', 'breath', 'Aire parejo', 'Notas largas con barra de aire', 'orange'),
      tile('#extra-dinamica', 'wave', 'Dinámica', 'Crescendo y messa di voce', 'orange'),
      tile('#afinador', 'target', 'Afinador libre', 'Tu nota y cents en vivo', 'teal')),
    h('h2', { class: 'sec' }, 'Afinación y oído'),
    h('div', { class: 'tiles' },
      tile('#extra-fina', 'target', 'Afinación fina', 'Notas clavadas y bordón', 'blue'),
      tile('#extra-oido', 'ear', 'Entrenar el oído', 'Sube/baja, intervalos', 'blue'),
      tile('#extra-melodia', 'note', 'Melodías nuevas', 'Cada vez distintas', 'blue'),
      tile('#extra-rango', 'wave', 'Todo tu rango', 'Notas por todo tu registro', 'blue'),
      tile('#extra-lectura', 'note', 'Leer y cantar', 'Solo te doy el do', 'teal'),
      tile('#extra-canciones', 'note', 'Canciones clásicas', 'Dos al azar, de memoria', 'teal')),
    h('h2', { class: 'sec' }, 'Ritmo y herramientas'),
    h('div', { class: 'tiles' },
      tile('#extra-ritmo', 'drum', 'Ritmo', 'Golpes y entradas a tiempo', 'green'),
      tile('#teclado', 'piano', 'Teclado', 'Notas de referencia y bordón', 'green'),
      tile('#metronomo', 'metro', 'Metrónomo', 'Para practicar con pulso', 'green'),
      tile('#rango', 'mic', 'Medir mi rango', 'Si tu voz cambió', 'green'))));
}

async function freeTuner() {
  const tu = tuner(50);
  const canvas = h('canvas', { class: 'roll' });
  const target = h('select', {}, h('option', { value: '' }, 'Nota más cercana'),
    ...Array.from({ length: 37 }, (_, i) => 40 + i).map((m) => h('option', { value: m }, noteName(m))));
  const tolS = h('select', {}, ...[[100, '±50 cents'], [50, '±25'], [30, '±15'], [20, '±10']].map(([v, l]) => h('option', { value: v, selected: v === 50 ? '' : null }, l)));
  tolS.onchange = () => tu.setTol(Number(tolS.value));
  const play = h('button', { class: 'btn' }, icon('speaker', 18), 'Oír');
  play.onclick = () => target.value && playNote(Number(target.value), 0, 1.2);
  view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'row between' }, h('h1', {}, 'Afinador'), h('button', { class: 'iconbtn', onclick: () => nav('#practicar') }, icon('close'))),
    h('div', { class: 'row' }, h('label', { class: 'field' }, 'Objetivo', target), h('label', { class: 'field' }, 'Zona', tolS), play),
    tu.el, canvas,
    say('Úsalo para sostener notas largas: la línea recta y en la zona verde. Cien cents son un semitono.', 'feliz', { compact: true })));
  try { await startMic(); } catch (e) { view.querySelector('.page').append(say(line('mic'), 'piensa', { voice: 'mic', tone: 'warn' })); return; }
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
    await new Promise((res) => requestAnimationFrame(res));
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
  view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'row between' }, h('h1', {}, 'Teclado'), h('button', { class: 'iconbtn', onclick: () => nav('#practicar') }, icon('close'))),
    say(`Tu rango cómodo es ${noteName(r.low)} a ${noteName(r.high)}. La tecla marcada es tu zona central.`, 'feliz', { compact: true }),
    h('label', { class: 'field' }, 'Bordón continuo', droneSel),
    h('div', { class: 'keys' }, keys)));
  const mySig = sig;
  (async () => { while (!mySig.aborted) await sleep(300); stopD && stopD(); })();
}

function metronomeView() {
  metro = new Metronome();
  const bpm = h('input', { type: 'range', min: 40, max: 200, value: 80 });
  const lbl = h('div', { class: 'bignote' }, '80');
  const btn = h('button', { class: 'btn primary big' }, icon('play', 18), 'Iniciar');
  bpm.oninput = () => { metro.bpm = Number(bpm.value); lbl.textContent = bpm.value; };
  btn.onclick = () => { getCtx(); if (metro.on) { metro.stop(); btn.replaceChildren(icon('play', 18), 'Iniciar'); } else { metro.start(); btn.replaceChildren(icon('pause', 18), 'Detener'); } };
  view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'row between' }, h('h1', {}, 'Metrónomo'), h('button', { class: 'iconbtn', onclick: () => nav('#practicar') }, icon('close'))),
    h('div', { class: 'center' }, lbl, h('div', { class: 'muted' }, 'pulsos por minuto')), bpm, btn,
    say('Ejercicio: canta una escala de 5 notas, una nota por clic. Después dos notas por clic.', 'feliz', { compact: true })));
}

// ---------- Perfil ----------
function identityCard() {
  const id = identities().slice(-1)[0];
  const btn = h('button', { class: 'btn', onclick: () => nav('#identidad') }, icon('wave', 18), id ? 'Repetir análisis de mi voz' : 'Descubrir mi identidad vocal');
  if (!id) return h('div', {}, h('h3', {}, 'Tu identidad vocal'), h('p', { class: 'small muted' }, 'Dónde cantas mejor, tu tipo de voz probable y tu timbre (color y textura), medidos nota por nota.'), btn);
  const open = h('button', { class: 'btn ghost', onclick: () => view.replaceChildren(h('div', { class: 'page' }, identityView(id, () => nav('#perfil')))) }, 'Ver detalle');
  return h('div', {}, h('h3', {}, 'Tu identidad vocal'),
    h('p', {}, `${id.type[0].toUpperCase() + id.type.slice(1)} · zona dulce ${id.sweetLo != null ? noteName(id.sweetLo) + '–' + noteName(id.sweetHi) : '—'}` + (id.color ? ` · color ${id.color}` : '') + (id.texture ? ` · ${id.texture}` : '')),
    h('div', { class: 'row' }, open, btn));
}
function diagCard() {
  const last = diagnoses().slice(-1)[0];
  const btn = h('button', { class: 'btn', onclick: () => nav('#diagnostico') }, icon('mic', 18), last ? 'Repetir diagnóstico' : 'Hacer el diagnóstico de mi voz');
  if (!last) return h('div', {}, h('h3', {}, '¿Qué le pasa a mi voz?'), h('p', { class: 'small muted' }, 'Un diagnóstico de 4 pasos: oído, llegar a la nota, estabilidad y volumen.'), btn);
  const f = diagFindings(last);
  return h('div', {}, h('h3', {}, 'Tu último diagnóstico'),
    h('p', { class: 'small muted' }, new Date(last.at).toLocaleDateString('es-CL') + ' · ' + f.main.lead),
    h('div', { class: 'diag-list compact' }, ...f.items.map((x) => h('div', { class: 'diag-item ' + x.tone }, h('div', { class: 'diag-ic' }, x.tone === 'ok' ? '✓' : x.tone === 'warn' ? '!' : '•'), h('div', {}, h('b', {}, x.title))))),
    btn);
}
function profileView() {
  const s = load(); const st = settings(); const r = getRange();
  const done = ALL_LESSONS.filter((l) => lessonState(l.id)?.done).length;
  const hist = s.history.filter((x) => x.cents != null).slice(-30);
  const chart = hist.length >= 3 ? centsChart(hist.map((x) => x.cents)) : h('p', { class: 'small muted' }, 'Cuando hagas más ejercicios con voz, aquí verás cómo baja tu desviación (en cents). Menos es mejor.');
  const sw = (k, label, sub, def = true) => {
    const i = h('input', { type: 'checkbox', class: 'switch' }); i.checked = st[k] === undefined ? def : !!st[k];
    i.onchange = () => setSetting(k, i.checked);
    return h('label', { class: 'set-row' }, h('span', {}, h('b', {}, label), sub ? h('small', {}, sub) : null), i);
  };
  const timbre = h('select', {}, h('option', { value: 'voz' }, 'Voz (recomendado)'), h('option', { value: 'piano' }, 'Suave tipo piano'));
  timbre.value = st.timbre; timbre.onchange = () => setSetting('timbre', timbre.value);
  const lat = h('input', { type: 'number', min: 0, max: 500, value: st.latencyMs || 0 });
  lat.onchange = () => setSetting('latencyMs', Number(lat.value));
  const calibMsg = h('small', { class: 'muted' });
  const calibBtn = h('button', { class: 'btn' }, 'Medir latencia');
  calibBtn.onclick = async () => {
    calibBtn.disabled = true;
    try {
      const v = await measureLatency((m) => (calibMsg.textContent = m));
      if (v == null) calibMsg.textContent = 'No pude medir: quita los audífonos, sube el volumen y repite en silencio.';
      else { const ms = Math.round(v * 1000); setSetting('latencyMs', ms); lat.value = ms; calibMsg.textContent = `Listo: ${ms} ms.`; }
    } catch (e) { calibMsg.textContent = 'Permite el micrófono para medir.'; }
    stopMic(); calibBtn.disabled = false;
  };
  const reset = h('button', { class: 'btn ghost danger' }, 'Borrar todo mi progreso');
  reset.onclick = () => { if (reset.dataset.sure) { resetAll(); nav('#aprender'); } else { reset.dataset.sure = 1; reset.textContent = 'Toca otra vez para confirmar'; } };
  view.replaceChildren(h('div', { class: 'page' }, ...[
    h('h1', {}, 'Tu progreso'),
    h('div', { class: 'stat-grid' },
      h('div', { class: 'sbox flame' }, icon('flame', 22), h('b', {}, s.streak || 0), h('small', {}, 'días de racha')),
      h('div', { class: 'sbox xp' }, icon('bolt', 22), h('b', {}, s.xp), h('small', {}, 'XP total')),
      h('div', { class: 'sbox' }, icon('star', 22), h('b', {}, `${done}/${ALL_LESSONS.length}`), h('small', {}, 'lecciones'))),
    h('div', { class: 'card' }, h('h3', {}, 'Tu voz'),
      h('p', {}, r.guessed ? 'Rango sin medir todavía.' : `Rango cómodo: ${noteName(r.low)} a ${noteName(r.high)} (${r.high - r.low} semitonos). Zona central: ${noteName(r.comfort)}.`),
      voiceProfile()?.speak ? h('p', {}, `Voz hablada ≈ ${noteName(Math.round(voiceProfile().speak))} · tu nota de casa: ${noteName(homeNote())}.`) : null,
      diagCard(),
      identityCard(),
      h('h3', {}, 'Tu afinación en el tiempo'), chart),
    installBanner(true),
    h('div', { class: 'card settings' }, h('h3', {}, 'Ajustes'),
      sw('voice', 'Voz del Chincol', 'Te lee las instrucciones'),
      sw('sfx', 'Sonidos', 'Aciertos, errores y celebraciones'),
      sw('octaveFree', 'Aceptar otra octava en canciones', 'Para cantar canciones de voces más agudas o graves', true),
      sw('echoCancel', 'Cancelación de eco', 'Solo si cantas sin audífonos y la música confunde al detector', false),
      h('label', { class: 'set-row' }, h('span', {}, h('b', {}, 'Sonido de las notas guía')), timbre),
      h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, 'Latencia (ms)'), h('small', {}, 'Para medir bien si entras a tiempo. Mídela sin audífonos. Con Bluetooth el retraso es mayor: para ritmo, mejor audífonos con cable.')), h('div', { class: 'row' }, lat, calibBtn), calibMsg),
      reset),
    h('p', { class: 'small muted', html: '<b>Basado en:</b> Pfordresher & Brown 2007; Hutchins & Peretz 2012; Berglin, Pfordresher & Demorest 2022; Pfordresher & Greenspon 2024; Titze 2006 (SOVT); aprendizaje motor (Maas 2008, NATS); métodos de Seth Riggs, Cathrine Sadolin, Jo Estill y Cheryl Porter. Voz del Chincol: Kokoro (Apache 2.0). Detección de tono: McLeod Pitch Method.' }),
  ].filter(Boolean)));
}
function centsChart(vals) {
  const w = 320, ht = 120, max = Math.max(40, ...vals);
  const pts = vals.map((v, i) => [10 + (i / (vals.length - 1)) * (w - 20), 10 + (v / max) * (ht - 20)]);
  return h('div', { class: 'chart', html: `<svg viewBox="0 0 ${w} ${ht}" width="100%" height="${ht}">
    <line x1="10" x2="${w - 10}" y1="${10 + (10 / max) * (ht - 20)}" y2="${10 + (10 / max) * (ht - 20)}" stroke="var(--ok)" stroke-dasharray="4 4"/>
    <polyline fill="none" stroke="var(--primary)" stroke-width="3" stroke-linejoin="round" points="${pts.map((p) => p.join(',')).join(' ')}"/>
    ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="var(--primary)"/>`).join('')}
  </svg><div class="small muted">Arriba = más desviación. La línea verde marca 10 cents (nivel maestro).</div>` });
}

// ---------- Instalar como app ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (/aprender|perfil|^#?$/.test(location.hash)) route(); });
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installBanner(force = false) {
  if (standalone()) return null;
  if (!force && localStorage.getItem('syng.hideInstall')) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const close = force ? null : h('button', { class: 'btn ghost small', onclick: (e) => { localStorage.setItem('syng.hideInstall', 1); e.target.closest('.card').remove(); } }, 'Ahora no');
  const body = deferredPrompt
    ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; route(); } }, 'Instalar'), close)
    : h('div', {}, h('p', { class: 'small' }, ios ? 'En Safari: botón Compartir (cuadro con flecha) → "Agregar a inicio".' : 'En Chrome: menú ⋮ → "Instalar app".'), close);
  return h('div', { class: 'card install' }, h('b', {}, '📲 Instala Syng en tu celular'), h('p', { class: 'small muted' }, 'Queda como app, a pantalla completa y funciona sin internet.'), body);
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

document.addEventListener('pointerdown', () => getCtx(), { once: true });
route();
