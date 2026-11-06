import { h, Roll, tuner, pct, sleep, icon, scoreRing } from './ui.js';
import { UNITS, ALL_LESSONS, warmup, extraSession, recommend, applyLevel, LEVEL_NAMES, STAGES, stageOf, dailyRoutine, randomMelody, P, seq, ear } from './curriculum.js';
import { getMyVoice, captureMyVoice } from './myvoice.js';
import { run, diagFindings, identityView, registerRunner } from './exercises.js';
import { runVoiceMap, voiceMapView } from './voicemap.js';
registerRunner('voicemap', runVoiceMap);
import { runEnergy } from './energy.js';
import { askProfe, profeOn, readAloud, stopReading, studentContext } from './profe.js';
import { account, signIn, signOut, chooseSide, pull, push, syncInfo, onSync } from './account.js';
import { runFindNote } from './findnote.js';
import { SONGS, songExercises, songStars, setSongStars, LEVEL_TXT } from './cancionero.js';
import { runMicCheck } from './miccheck.js';
import { runResources, resourcesView, lastResTest, RES_INFO, RES_LESSON } from './resources.js';
registerRunner('energy', runEnergy);
registerRunner('resources', runResources);
registerRunner('findnote', runFindNote);
registerRunner('miccheck', runMicCheck);
registerRunner('tutor', runTutor);
import { phraseExercises } from './songcoach.js';
import { track, checkLevel, levelOf, dailyQuests, openChest, chestState, weekDots, applyFreeze, freezes, BADGES, badges, toast } from './fun.js';
import { gameMenu, playGame } from './game.js';
import { analyze, adaptExercises, warmExtras, remedialFor, liveAdjust, newFindings, obsCount } from './adapt.js';
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
    h('span', { class: 'stat-chip xp' }, icon('bolt', 18), String(s.xp)),
    h('button', { class: 'stat-chip lvl', onclick: () => nav('#perfil'), 'aria-label': 'Nivel' }, levelOf(s.xp).icon + ' ' + levelOf(s.xp).n));
}

const FOCUS = /^(canc-|microfono$|clase$|encuentra$|profe-ia$|cuenta$|recursos$|rutina|mapa$|juego-|cantar-ya|leccion|hoy|calentamiento|extra|rango|frase-|diagnostico|identidad|repaso|practicar-|fiesta-|lineas-|escuchar-|guia-|solo-|sincronizar-)/;
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
  const tab = /^(cancion|frase-|practicar-|fiesta-|lineas-|escuchar-|guia-|solo-|sincronizar-|editarletra-)/.test(hsh) ? 'cancion'
    : /^(practicar|afinador|teclado|metronomo|extra-|calentamiento|rango)/.test(hsh) ? 'practicar'
    : hsh === 'perfil' ? 'perfil' : 'aprender';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (FOCUS.test(hsh) || hsh === 'afinador') keepAwake();
  try {
    if (hsh === 'aprender' || hsh === '') return homeView();
    if (hsh === 'hoy') return todayClass();
    if (hsh.startsWith('leccion-')) return lessonIntro(hsh.slice(8));
    if (hsh === 'profe') return profeView();
    if (hsh === 'metodo') return methodView();
    if (hsh === 'manual') return manualView();
    if (hsh === 'cuenta') return accountView();
    if (hsh === 'profe-ia') return chatView();
    if (hsh === 'clase') return session({ title: 'Clase con tu profe', color: 'teal', exercises: [{ type: 'tutor' }], id: 'clase', back: '#aprender', backLabel: 'Volver al inicio' });
    if (hsh === 'microfono') return session({ title: '¿Me está midiendo bien?', color: 'teal', exercises: [{ type: 'miccheck' }], id: 'microfono', back: '#perfil', backLabel: 'Volver' });
    if (hsh === 'cancionero') return cancioneroView();
    { const m = /^canc-(\w+)-(\d)$/.exec(hsh); if (m) { const sg = SONGS.find((x) => x.id === m[1]); if (sg) { const lv = Number(m[2]); return session({ title: `${sg.title} · ${LEVEL_TXT[lv]}`, color: 'purple', exercises: songExercises(sg, lv), id: hsh, back: '#cancionero', backLabel: 'Volver al cancionero' }); } } }
    if (hsh === 'encuentra') return session({ title: 'Encuentra la nota', color: 'teal', exercises: [{ type: 'findnote', n: 6 }], id: 'encuentra', back: '#aprender', backLabel: 'Volver al inicio' });
    if (hsh === 'recursos') return session({ title: 'Prueba tus recursos vocales', color: 'green', exercises: [{ type: 'resources' }], id: 'recursos', back: '#recursos-ver', backLabel: 'Ver mis resultados' });
    if (hsh === 'recursos-ver') { const t = lastResTest(); if (!t) return nav('#recursos');
      view.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#perfil') }, icon('back')), h('span', {})), h('h1', {}, 'Tus recursos vocales'), resourcesView(t),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#recursos') }, 'Probar otra vez')))); return; }
    if (hsh === 'rutina') { const rt = await routineToday(); return session({ title: 'Tu rutina de hoy', color: 'teal', exercises: rt.exercises, id: 'rutina', back: '#aprender', backLabel: 'Volver al inicio',
      adaptNote: '<b>Tu rutina de hoy, hecha para tu voz (≈10 min):</b><br>' + rt.why.map((w, i) => `${i + 1}. ${w}`).join('<br>') + (load().voiceMaps && load().voiceMaps.length ? '' : '<br><small>Haz el mapa de tu voz para que la rutina se ajuste aún más a ti.</small>') }); }
    if (hsh === 'cantar-ya') { // calentamiento mínimo (aire + labios) y directo a cantar
      const ls = load().lastSong;
      const song = ls ? await getSong(ls) : null;
      const target = song ? '#solo-' + ls : '#juego-g1';
      return session({ title: 'Cantar ya', color: 'teal', exercises: warmup(true).slice(0, 2).map((e) => ({ ...e, noScore: true })), id: 'warmup', back: target, backLabel: song ? 'Cantar "' + song.title + '"' : 'Jugar: Vuelo del Chincol',
        adaptNote: '<b>Un minuto de calentamiento y a cantar.</b> Calentar aunque sea un poco evita forzar la voz y te ayuda a afinar desde la primera nota.' });
    }
    if (hsh === 'juego') return gameMenu(view, nav);
    if (hsh.startsWith('juego-')) return playGame(view, nav, hsh.slice(6), sig);
    if (hsh === 'mapa') return session({ title: 'El mapa de tu voz', color: 'teal', exercises: [{ type: 'voicemap' }], id: 'mapa' });
    if (hsh === 'mapa-ver') { const m = (load().voiceMaps || []).slice(-1)[0]; const pv = (load().voiceMaps || []).slice(-2, -1)[0]; return m ? view.replaceChildren(h('div', { class: 'page' }, voiceMapView(m, pv, () => nav('#perfil')))) : nav('#mapa'); }
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
    if (hsh.startsWith('frase-')) return phraseSession(hsh.slice(6));
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

const EXTRA = { oido: 'Entrenar el oído', ritmo: 'Ritmo', fina: 'Afinación fina', melodia: 'Melodías nuevas', rango: 'Todo tu rango', aire: 'Aire parejo', ganas: 'Cantar con ganas', lectura: 'Leer y cantar', dinamica: 'Dinámica', canciones: 'Canciones clásicas' };

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
  const curStage = next ? stageOf(next.unit) : null;
  const goal = Math.min(1, (s.lastDay === today() ? s.todayXp || 0 : 0) / s.dailyGoal);
  const first = !s.xp;
  applyFreeze();
  const atRisk = s.streak >= 2 && s.lastDay !== today();
  const greeting = first ? line('hola') : s.lastDay === today() ? '¡Bien, ya practicaste hoy! Si tienes ganas, sigue con otra clase.' : atRisk ? `🔥 <b>Tu racha de ${s.streak} días está en juego.</b> Una clase corta y la salvas.` : `¡Hola de nuevo! ${tipOfDay()}`;
  const hero = h('section', { class: 'hero' },
    say(greeting, first ? 'feliz' : 'canta', { voice: first ? 'hola' : null, autoplay: false }),
    h('div', { class: 'hero-row' },
      h('div', { class: 'goal' }, scoreRing(goal, 64), h('div', {}, h('b', {}, 'Meta de hoy'), h('div', { class: 'small muted' }, `${s.lastDay === today() ? s.todayXp || 0 : 0} de ${s.dailyGoal} XP`))),
      h('button', { class: 'btn primary big', onclick: () => { sfx('select'); nav('#clase'); } }, icon('play', 18), 'Clase con tu profe')),
    h('div', { class: 'small muted center' }, (mastery().afinacion ? `Seguimos donde quedaste: ${LADDER[Math.min(LADDER.length - 1, mastery().afinacion.level)].name.toLowerCase()}.` : 'Se adapta en vivo: si te sale, sube; si cuesta, baja un paso.') + ' Unos 10 minutos.'),
    next ? h('button', { class: 'linkbtn center-link', onclick: () => { sfx('select'); nav('#hoy'); } }, `O sigue el camino de lecciones: "${next.title}" →`) : null,
    curStage ? h('button', { class: 'stage-chip', onclick: () => nav('#metodo') }, `Etapa ${curStage.n} de ${STAGES.length}: ${curStage.title}`) : null,
    first ? null : h('div', { class: 'week' }, ...weekDots().map((d) => h('div', { class: 'wd' + (d.on ? ' on' : '') + (d.today ? ' today' : '') }, h('span', {}, d.on ? '🔥' : ''), h('small', {}, d.l))), freezes() ? h('div', { class: 'wd frz', title: 'Protectores de racha' }, h('span', {}, '🧊'), h('small', {}, '×' + freezes())) : null),
    h('div', { class: 'quick2' },
      h('button', { class: 'btn big', onclick: () => { sfx('select'); nav('#cancionero'); } }, '🎤 Cantar una canción'),
      h('button', { class: 'btn big', onclick: () => { sfx('select'); nav('#profe-ia'); } }, '💬 Preguntar al profe')));
  const rec = recommend(s.history || []);
  const recCard = rec ? h('button', { class: 'card rec', onclick: () => nav('#extra-' + rec.kind) },
    chincol('piensa', 44),
    h('div', {}, h('b', {}, 'Práctica recomendada: ' + EXTRA[rec.kind]), h('div', { class: 'small muted' }, 'Según tus últimos ejercicios, esto es lo que más te va a ayudar.')), icon('chevron')) : null;
  const nDone = ALL_LESSONS.filter((l) => lessonState(l.id)?.done && !l.check && !l.once).length;
  const reviewCard = nDone >= 2 ? h('button', { class: 'card rec', onclick: () => { sfx('select'); nav('#repaso'); } },
    chincol('hola', 44),
    h('div', {}, h('b', {}, 'Repaso rápido'), h('div', { class: 'small muted' }, 'Cuatro ejercicios de lo que ya aprendiste. Repasar seguido es lo que lo deja fijo.')), icon('chevron')) : null;
  let gi = 0; let lastStage = 0;
  const stageBanner = (st) => {
    const ls = ALL_LESSONS.filter((l) => st.units.includes(l.unit.id));
    const dn = ls.filter((l) => lessonState(l.id)?.done).length;
    const why = h('div', { class: 'stage-why', hidden: '' }, h('p', {}, st.why), h('button', { class: 'btn small', onclick: () => nav('#metodo') }, 'Ver el método completo'));
    return h('section', { class: 'stage-banner ' + st.color + (curStage && curStage.n === st.n ? ' current' : '') },
      h('div', { class: 'stage-n' }, String(st.n)),
      h('div', { class: 'grow' }, h('small', {}, `Etapa ${st.n} de ${STAGES.length}`), h('h2', {}, st.title), h('p', {}, st.sub),
        h('div', { class: 'progress' }, h('div', { class: 'pfill', style: `width:${Math.round((dn / ls.length) * 100)}%` })), h('small', {}, `${dn} de ${ls.length} lecciones`),
        h('button', { class: 'btn ghost small why-btn', onclick: (e) => { why.hidden = !why.hidden; if (!why.hidden) speak(st.voice); else stopSpeaking(); } }, '¿Por qué en este orden?'), why));
  };
  const path = UNITS.flatMap((u) => {
    const st = stageOf(u);
    const banner = st && st.n !== lastStage ? stageBanner(st) : null;
    lastStage = st ? st.n : lastStage;
    return [banner, unitSection(u)].filter(Boolean);
  });
  function unitSection(u) {
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
  }
  // En celular: todo en una columna. En computador: el camino a la izquierda y tus tarjetas del día a la derecha.
  const side = [findCard(), s.lastSong ? h('button', { class: 'card rec', onclick: () => nav('#cantar-ya') }, h('div', { class: 'card-ic' }, '🎵'), h('div', {}, h('b', {}, 'Cantar tu canción'), h('div', { class: 'small muted' }, 'La última canción tuya que practicaste.')), icon('chevron')) : null, first ? null : questsCard(), first ? null : routineCard(), resCard(), profeCard(), recCard, reviewCard].filter(Boolean);
  // Práctico: arriba UNA cosa que hacer (la clase con el profe) y dos atajos. Todo lo demás, guardado en "Más".
  const wide = window.innerWidth >= 1000;
  const more = h('details', { class: 'more-box', open: wide || undefined }, h('summary', {}, h('b', {}, 'Más para practicar'), h('span', { class: 'small muted' }, ' · taller de notas, rutina, recursos, misiones')), ...side);
  const pathBox = h('details', { class: 'more-box path-box' }, h('summary', {}, h('b', {}, 'Camino de lecciones'), h('span', { class: 'small muted' }, ` · ${nDone} de ${ALL_LESSONS.filter((l) => !l.check).length} lecciones, en orden`)), ...path);
  view.replaceChildren(h('div', { class: 'page home' }, installBanner(), h('div', { class: 'home-hero' }, hero),
    side.length ? h('aside', { class: 'home-side' }, more) : null, h('div', { class: 'home-path' }, pathBox)));
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
  const A = analyze();
  const warmNow = !(load().lastWarmup === today() || UNITS.indexOf(l.unit) === 0 && idx < 2);
  const pre = warmNow ? [...warmup(true), ...warmExtras(A.adapt)].map((e) => ({ ...e, noScore: true })) : [];
  const rem = remedialFor(A.adapt).slice(0, 1);
  const actions = A.findings.filter((f) => f.action && f.tone !== 'ok').slice(0, 3).map((f) => '• ' + f.title + ': ' + f.action);
  return session({ adaptNote: actions.length ? '<b>Hoy ajusté tu clase según lo que he visto en tu voz:</b><br>' + actions.join('<br>') : null, title: 'Clase de hoy · ' + l.title + (l.check ? '' : ' · Nivel ' + level), color: l.unit.color, exercises: [...pre, ...rem, ...applyLevel(l.build(), level)], id: l.id, lesson: l, level, next: ALL_LESSONS[idx + 1], intro: level === 1 || l.check ? l.intro : null, introVoice: l.introVoice });
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
    const exs = applyLevel(l.build(), 2).filter((e) => !['info', 'range', 'breath', 'speak', 'diag', 'identity', 'self'].includes(e.type));
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
      const pre = warmChk.checked ? [...warmup(true), ...warmExtras(analyze().adapt)].map((e) => ({ ...e, noScore: true })) : [];
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
// Corregir una frase de tu canción: ejercicio específico para el error + la frase lenta, con letra y a velocidad real
async function phraseSession(arg) {
  const [sidS, iS, ...k] = arg.split('-');
  const song = await getSong(sidS);
  const i = Number(iS);
  if (!song || !song.analysis || !song.analysis.lines[i]) return nav('#canciones');
  const exs = phraseExercises(song, i, getRange(), k.join('-') || null);
  if (!exs.length) return nav('#cancion-' + sidS);
  return session({ title: `${song.title} · frase ${i + 1}`, color: 'pink', exercises: exs, id: 'frase', back: '#practicar-' + sidS,
    adaptNote: `<b>Vamos a corregir la frase ${i + 1}:</b> "${song.analysis.lines[i].text}".<br>Primero el error puntual, después la frase lenta con "la", con letra, y a velocidad real. Al final vuelve a cantar la canción para comparar.` });
}

async function session({ title, color, exercises, id, lesson, level = LEVELS_TO_PASS, next, intro, introVoice, adaptNote, back, backLabel }) {
  const mySig = sig;
  // el profe adaptativo: lo que ya aprendió de ti ajusta tono, zona y velocidad de esta sesión
  const before = analyze();
  const sid = Date.now();
  exercises = adaptExercises(exercises, before.adapt);
  document.body.classList.add('focus');
  const fill = h('div', { class: 'pfill' });
  const stage = h('div', { class: 'stage' });
  view.replaceChildren(h('div', { class: 'session ' + (color || '') },
    h('div', { class: 'ses-top' },
      h('button', { class: 'iconbtn', onclick: () => nav(back || (lesson ? '#aprender' : '#practicar')), 'aria-label': 'Salir' }, icon('close')),
      h('div', { class: 'progress big' }, fill),
      h('button', { class: 'iconbtn', 'aria-label': 'Voz del Chincol', onclick: (e) => { const v = settings().voice === false; setSetting('voice', v); stopSpeaking(); e.currentTarget.classList.toggle('off', !v); } , class: 'iconbtn' + (settings().voice === false ? ' off' : '') }, icon('speaker'))),
    stage));
  if (adaptNote) {
    await new Promise((res) => stage.replaceChildren(h('div', { class: 'ex' }, say(adaptNote, 'piensa'), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); res(); } }, 'Entendido')))));
  }
  if (intro) {
    await new Promise((res) => stage.replaceChildren(h('div', { class: 'ex' }, say(intro, 'feliz', { voice: introVoice }), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); res(); } }, 'Vamos')))));
  }
  const scores = [], metrics = { cents: [], timing: [] }, issueKeys = [];
  let worst = null; const toReview = [];
  for (let i = 0; i < exercises.length; i++) {
    if (mySig.aborted) return;
    fill.style.width = (i / exercises.length) * 100 + '%';
    let ex = { ...exercises[i], _sid: sid, _pos: i };
    // adaptación en vivo según cómo te va en ESTA sesión
    const la = liveAdjust(ex, scores, sid);
    ex = la.ex;
    if (la.note && !mySig.aborted) {
      await new Promise((res) => stage.replaceChildren(h('div', { class: 'ex' }, say('<b>Ajuste del profe:</b> ' + la.note, 'piensa'), h('div', { class: 'grow' }),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res(); } }, 'Seguir')))));
    }
    let res, fails = 0, easier = false;
    while (true) {
      try { res = await run(ex, stage, mySig); }
      catch (err) { // un ejercicio con problemas nunca debe dejarte pegado
        console.error(err);
        await new Promise((ok) => stage.replaceChildren(h('div', { class: 'ex' }, say('Este ejercicio tuvo un problema técnico. Lo salto para que sigas; no cuenta en tu nota.', 'piensa', { tone: 'warn' }), h('div', { class: 'grow' }),
          h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => ok() }, 'Seguir')))));
        res = { score: null, skipped: true };
      }
      if (mySig.aborted) return;
      if (res.info || res.skipped || ex.noScore) break;
      if (res.score < 0.7) fails++;
      const decision = await feedbackSheet(stage, res, { fails, easier, canEase: fails >= 2 && !easier && canMakeEasier(ex), ex, title });
      if (decision === 'next') break;
      if (decision === 'easier') { ex = makeEasier(ex); easier = true; }
    }
    if (res.maxCombo) track('combo', { n: res.maxCombo });
    if (!res.info && !res.skipped && !ex.noScore) track('exercise', { type: ex.type, score: res.score });
    if (!res.info && !res.skipped && !ex.noScore && res.score < 0.7) toReview.push({ ex: exercises[i], at: scores.length });
    if (!res.info && !res.skipped && !ex.noScore) {
      scores.push(res.score);
      if (res.cents != null) metrics.cents.push(res.cents);
      if (res.timing != null) metrics.timing.push(res.timing);
      (res.issues || []).slice(0, 2).forEach((x) => issueKeys.push(x.key));
      if (res.issues && res.issues[0] && (!worst || res.score < worst.score)) worst = { score: res.score, issue: res.issues[0] };
    }
  }
  // Repaso al final (como Duolingo): vuelves a lo que más te costó, unos minutos después. Esa pausa ayuda a fijarlo.
  if (toReview.length && !mySig.aborted) {
    const rv = toReview.sort((a, b) => scores[a.at] - scores[b.at])[0];
    await new Promise((ok) => stage.replaceChildren(h('div', { class: 'ex' }, say('<b>Repaso final.</b> Antes de terminar, volvamos al ejercicio que más te costó. Ahora que calentaste, suele salir mejor. Si mejoras, cuenta tu mejor intento.', 'atento'), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); ok(); } }, 'Repasar')))));
    let r2 = null;
    try { r2 = await run({ ...rv.ex, _sid: sid, _pos: 99 }, stage, mySig); } catch (e) { console.error(e); }
    if (mySig.aborted) return;
    if (r2 && r2.score != null && !r2.skipped) {
      if (r2.score > scores[rv.at]) scores[rv.at] = r2.score;
      await new Promise((ok) => stage.replaceChildren(h('div', { class: 'ex' }, say(r2.score >= 0.7 ? '¡Eso! En el repaso te salió. Así se fija lo aprendido.' : 'Sigue costando, y está bien: volverá en tus repasos de los próximos días hasta que salga.', r2.score >= 0.7 ? 'celebra' : 'piensa'), h('div', { class: 'grow' }),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => ok() }, 'Terminar')))));
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
  const cm = /^canc-(\w+)-(\d)$/.exec(id || ''); if (cm && score >= 0.7) setSongStars(cm[1], Number(cm[2]));
  // Si el nivel 1 te salió excelente, no te hago repetir la lección: te salto el nivel 2.
  const skipped = lesson && !lesson.check && level < LEVELS_TO_PASS && score >= 0.88;
  if (skipped) setLesson(id, score, LEVELS_TO_PASS);
  const moreLevels = lesson && !lesson.check && stars > 0 && level < LEVELS_TO_PASS && !skipped;
  const passed = !lesson || stars > 0;
  const xp = passed ? Math.round(10 + score * 15) : 5;
  addXp(xp);
  const doneStages = STAGES.filter((st) => ALL_LESSONS.filter((l) => st.units.includes(l.unit.id)).every((l) => lessonState(l.id)?.done)).map((st) => st.n);
  track('session', { lesson: !!lesson, passed, stars, warmup: exercises.some((e) => e.noScore) || id === 'warmup', stages: doneStages });
  if (id === 'mapa' || exercises.some((e) => e.type === 'voicemap')) track('map');
  renderHeader();
  if (passed) { sfx('done'); confetti(); }
  const s = load();
  const after = analyze();
  const fresh = after.n > before.n ? newFindings(before.findings, after.findings).slice(0, 2) : [];
  stage.replaceChildren(h('div', { class: 'ex done-screen' },
    h('div', { class: 'center' }, chincol(passed ? 'celebra' : 'piensa', 120)),
    h('h1', { class: 'center' }, passed ? (moreLevels ? `¡Nivel ${level} listo!` : lesson && level === 3 ? '¡Maestría!' : lesson ? '¡Lección completada!' : '¡Sesión terminada!') : 'Casi… todavía no'),
    moreLevels ? h('p', { class: 'center' }, `Ahora la misma lección en el nivel ${level + 1}: ${LEVEL_NAMES[level + 1].toLowerCase()}. Repetir es lo que afirma la nota en tu oído.`) : null,
    skipped ? h('p', { class: 'center' }, '¡Te salió excelente! Te salto el nivel 2: no tiene sentido repetir lo que ya dominas.') : null,
    lesson || scores.length >= 2 ? profeBox('lesson', { clase: title, puntajePromedio: Math.round(score * 100) + '%', ejercicios: scores.length, aprobada: passed, nivel: level, saltoDeNivel: !!skipped, problemasFrecuentes: [...new Set(issueKeys)].slice(0, 4), desviacionPromedioCents: avgC != null ? Math.round(avgC) : null }) : null,
    lesson ? h('div', { class: 'stars-big' }, ...[0, 1, 2].map((k) => h('span', { class: k < stars ? 'on' : '' }, '★'))) : null,
    h('div', { class: 'done-stats' },
      h('div', { class: 'dstat' }, h('small', {}, 'Resultado'), h('b', {}, pct(score))),
      h('div', { class: 'dstat xp' }, h('small', {}, 'XP'), h('b', {}, '+' + xp)),
      h('div', { class: 'dstat flame' }, h('small', {}, 'Racha'), h('b', {}, (s.streak || 0) + (s.streak === 1 ? ' día' : ' días')))),
    avgC != null ? h('p', { class: 'center small muted' }, `Desviación media de afinación en las notas que alcanzaste: ${Math.round(avgC)} cents.`) : null,
    ...fresh.map((f) => h('div', { class: 'card discovery' }, h('b', {}, '🔎 Descubrí algo en tu voz: ' + f.title), h('p', { class: 'small' }, f.evidence), h('p', { class: 'small' }, h('b', {}, 'Qué significa: '), f.meaning), f.action ? h('p', { class: 'small' }, h('b', {}, 'Lo que cambié: '), f.action) : null)),
    worst ? say(`<b>Para la próxima:</b> ${worst.issue.text}<br><span class="tip">${worst.issue.tip}</span>`, 'atento', { voice: [passed ? 'leccion_ok' : 'leccion_no', worst.issue.voice].filter(Boolean) })
      : say(passed ? line('leccion_ok') : line('leccion_no'), passed ? 'celebra' : 'piensa', { voice: passed ? 'leccion_ok' : 'leccion_no' }),
    h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' },
      h('button', { class: 'btn', onclick: () => route() }, icon('repeat', 18), 'Repetir'),
      moreLevels ? h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); nav('#leccion-' + id); } }, `Nivel ${level + 1}`)
      : passed && next ? h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); nav('#leccion-' + next.id); } }, 'Siguiente lección') : h('button', { class: 'btn primary', onclick: () => nav(back || (lesson ? '#aprender' : '#practicar')) }, back ? (backLabel || 'Volver a cantar la canción') : 'Continuar'))));
  if (passed && !hadStreak) setTimeout(() => sfx('streak'), 900);
}

// Hoja de resultado del ejercicio (estilo Duolingo, con el diagnóstico del profe)
const plain = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// El profe con IA comenta tu intento (si tienes cuenta). Mientras piensa, ves el consejo de siempre.
function profeBox(kind, data) {
  if (!profeOn()) return h('button', { class: 'profe-ai off', onclick: () => nav('#cuenta') }, h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe con IA'), h('p', { class: 'small' }, 'Está apagado porque no has entrado a tu cuenta en este dispositivo. Toca aquí para entrar y te comentará cada intento.'));
  const box = h('div', { class: 'profe-ai thinking' }, h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe', h('span', { class: 'dots' }, h('i'), h('i'), h('i'))), h('p', { class: 'small muted' }, 'Escuchando tu intento…'));
  askProfe(kind, data).then((r) => {
    if (!box.isConnected && !document.body.contains(box)) return;
    if (!r.text) { box.classList.remove('thinking'); box.replaceChildren(h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe'), h('p', { class: 'small muted' }, 'No pude responder esta vez: ' + (r.error || 'sin conexión') + '.')); return; }
    const rd = h('button', { class: 'iconbtn small', 'aria-label': 'Escuchar', onclick: () => readAloud(r.text) }, icon('speaker', 16));
    box.classList.remove('thinking');
    box.replaceChildren(h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe', rd), h('p', {}, r.text));
  });
  return box;
}
function listenRow(res) {
  if (!res.take && !res.model) return null;
  let url = null; let audio = null;
  const mine = res.take ? h('button', { class: 'btn small', onclick: () => { stopReading(); if (audio) { audio.pause(); audio = null; return; } url = url || URL.createObjectURL(res.take); audio = new Audio(url); audio.onended = () => (audio = null); audio.play().catch(() => {}); } }, '🎧 Escúchate') : null;
  const model = res.model ? h('button', { class: 'btn small', onclick: () => { stopReading(); getCtx(); res.model(); } }, '🎹 Cómo era') : null;
  return h('div', { class: 'listen-row' }, h('span', { class: 'small muted' }, 'Compara con tu oído:'), mine, model);
}
function feedbackSheet(stage, res, { fails, easier, canEase, ex = {}, title = '' }) {
  return new Promise((resolve) => {
    const v = verdict(res.score);
    const top = (res.issues || [])[0];
    sfx(res.score >= 0.7 ? 'ok' : 'bad');
    const keep = res.keepView ? h('div', { class: 'keep' }, res.keepView) : h('div', { class: 'center sheet-bird' }, chincol(v.mood, 130));
    const sheet = h('div', { class: 'sheet ' + v.tone },
      h('div', { class: 'sheet-head' }, scoreRing(res.score, 72), h('div', {}, h('h2', {}, v.title), h('p', { class: 'small' }, res.detail || ''))),
      top ? say(`${top.text}<br><span class="tip">${top.tip}</span>`, v.mood, { voice: [v.voice, top.voice].filter(Boolean) })
        : say(res.score >= 0.7 ? 'Así se hace. Sigamos.' : 'Escucha con atención y vuelve a intentarlo.', v.mood, { voice: v.voice }),
      res.early ? h('p', { class: 'small ok-txt' }, '✨ Te salió tan bien que corté las rondas que faltaban.') : null,
      listenRow(res),
      profeBox('exercise', { clase: title, ejercicio: plain(ex.title || ex.text || ex.type).slice(0, 220), tipo: ex.type, puntaje: Math.round((res.score || 0) * 100) + '%', resultado: plain(res.detail), taller: res.taller || undefined, problemas: (res.issues || []).slice(0, 3).map((x) => plain(x.text)), desviacionCents: res.cents != null ? Math.round(res.cents) : null, intentoNumero: fails + 1, cortadoPorBuenResultado: !!res.early }),
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
    h('button', { class: 'card rec game-card', onclick: () => { sfx('select'); nav('#juego'); } }, chincol('celebra', 52), h('div', {}, h('b', {}, 'Vuelo del Chincol'), h('div', { class: 'small muted' }, 'Juego: vuela con tu voz y pasa por las puertas cantando su nota.')), icon('chevron')),
    h('h2', { class: 'sec' }, 'Calentar y técnica'),
    h('div', { class: 'tiles' },
      tile('#calentamiento', 'sparkle', 'Calentamiento', 'Aire, lip trill y escalas · 6 min', 'orange'),
      tile('#extra-aire', 'breath', 'Aire parejo', 'Notas largas con barra de aire', 'orange'),
      tile('#extra-dinamica', 'wave', 'Dinámica', 'Crescendo y messa di voce', 'orange'),
      tile('#extra-ganas', 'party', 'Cantar con ganas', 'Energía y proyección, sin gritar', 'orange'),
      tile('#afinador', 'target', 'Afinador libre', 'Tu nota y cents en vivo', 'teal'),
      tile('#encuentra', 'target', 'Encuentra la nota', 'Taller guiado, sin apuro', 'teal'),
      tile('#microfono', 'mic', '¿Me mide bien?', 'Prueba de micrófono en 1 min', 'teal')),
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
// ---------- El método: por qué este orden ----------
function methodView() {
  const cur = (() => { const i = nextLessonIdx(); return i >= 0 ? stageOf(ALL_LESSONS[i].unit) : null; })();
  view.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#aprender') }, icon('back')), h('span', {})),
    h('h1', {}, 'El método de Syng'),
    say('El camino sigue el orden de los manuales de canto más usados: <b>primero el instrumento y la confianza, después cómo nace el sonido, luego el lenguaje musical, después extender la voz y al final interpretar</b>. Cada etapa se apoya en la anterior.', 'feliz', { compact: true }),
    ...STAGES.map((st) => h('div', { class: 'card method-st ' + st.color + (cur && cur.n === st.n ? ' current' : '') },
      h('div', { class: 'row between' }, h('b', {}, `Etapa ${st.n} · ${st.title}`), cur && cur.n === st.n ? h('span', { class: 'pill ok' }, 'Estás aquí') : null),
      h('p', { class: 'small muted' }, st.sub),
      h('p', { class: 'small' }, st.why),
      h('p', { class: 'small' }, h('b', {}, 'Unidades: '), st.units.map((id) => UNITS.find((u) => u.id === id)?.title).filter(Boolean).join(' → ')),
      h('button', { class: 'btn ghost small', onclick: () => speak(st.voice) }, icon('speaker', 16), 'Escuchar'))),
    h('div', { class: 'card' }, h('h3', {}, 'Fuentes'),
      h('p', { class: 'small' }, '• Richard Miller, "The Structure of Singing": ataque coordinado → manejo del aire (appoggio) → agilidad → resonancia → vocales y consonantes → sostenuto → registros → extensión del rango → vibrato.'),
      h('p', { class: 'small' }, '• Nicola Vaccai, "Metodo pratico di canto" (1832): escala y terceras → cuartas y quintas → sextas → séptimas y octavas → semitonos → síncopa → agilidad.'),
      h('p', { class: 'small' }, '• Seth Riggs, "Singing for the Stars": primero construir confianza, después la voz de habla aplicada al canto.'),
      h('p', { class: 'small' }, '• Investigación sobre quien desafina (Pfordresher y Brown, 2007; Hutchins y Peretz, 2012): lo primero es conectar oído y voz.')),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#aprender') }, 'Volver al camino'))));
}

// ---------- Clase con tu profe: una clase que se arma y se adapta EN VIVO ----------
// Como un profe particular: parte donde quedaste, si algo sale bien sube un peldaño al tiro,
// si cuesta baja un paso para afirmar, y entre ejercicio y ejercicio te dice qué vio y por qué cambia.
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const LADDER = [
  { name: 'Encontrar la nota, con ayuda paso a paso', make: () => ({ type: 'findnote', n: 3 }) },
  { name: 'Igualar notas pegadas a tu voz hablada', make: (v) => ({ type: 'match', home: shuffle([0, 1, -1]), tol: 120, hold: 1, voiceRef: v, text: 'Escucha la nota y cántala con "uuu". Están <b>muy cerca de tu voz al hablar</b>: no hay que ir lejos.' }) },
  { name: 'Igualar notas un poco más lejos', make: (v) => ({ type: 'match', home: shuffle([0, 2, -2, 3]), tol: 90, hold: 1, voiceRef: v, text: 'Ahora las notas están un poco más lejos. Escucha, y llega <b>deslizando</b> si lo necesitas.' }) },
  { name: 'Escuchar, guardar la nota y entrar directo', make: (v) => ({ type: 'match', home: shuffle([0, 4, -3, 5]), tol: 80, hold: 1.2, delay: 1, imagine: true, voiceRef: v, text: 'Escucha, <b>guarda la nota en tu cabeza</b> un segundo y entra directo a ella, sin buscarla.' }) },
  { name: 'Dos notas seguidas', make: () => seq(P(pick([[0, 2], [2, 0], [0, 3], [3, 0], [0, -2]])), { mode: 'echo', bpm: 64, tol: 110, ttol: 320, reps: [0, 0, 0], labels: 'none', text: 'Escucha <b>dos notas</b> y repítelas. Piensa: ¿la segunda sube o baja?' }) },
  { name: 'Tres notas', make: () => seq(P(pick([[0, 2, 4], [4, 2, 0], [0, 2, 0], [0, 4, 2], [2, 0, 2]])), { mode: 'echo', bpm: 68, tol: 105, ttol: 300, reps: [0, 0, 0], labels: 'none', text: 'Ahora <b>tres notas</b>. Escucha el dibujo de la melodía y cópialo.' }) },
  { name: 'Escala de cinco notas', make: () => seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'along', bpm: 72, tol: 95, reps: [0, 0], labels: 'solf', text: 'La escala de cinco notas: la cantamos <b>juntos</b> primero y después tú solo.' }) },
  { name: 'Melodía corta', make: () => seq(P(randomMelody(4)), { mode: 'echo', bpm: 76, tol: 95, ttol: 280, reps: [0, 0], labels: 'la', text: 'Una <b>melodía corta</b> nueva. Escucha y repite.' }) },
  { name: 'Melodía más larga', make: () => seq(P(randomMelody(5)), { mode: 'echo', bpm: 82, tol: 85, ttol: 260, reps: [0, 0], labels: 'la', text: 'Una <b>melodía más larga</b>. Ya estás para esto.' }) },
  { name: 'Melodía de memoria', make: () => seq(P(randomMelody(6)), { mode: 'echo', bpm: 86, tol: 80, ttol: 240, reps: [0], labels: 'la', text: 'La escuchas <b>una sola vez</b> y la cantas de memoria. Como en una canción de verdad.' }) },
];
function mastery() { const s = load(); s.mastery = s.mastery || {}; return s.mastery; }
function startLevel() {
  const m = mastery().afinacion; if (m && m.level != null) return Math.max(0, m.level - (Date.now() - (m.at || 0) > 3 * 864e5 ? 1 : 0)); // si pasaron días, parto un peldaño antes
  const fn = (load().findNote || []).slice(-1)[0];
  if (fn) return fn.found / Math.max(1, fn.n) < 0.6 ? 0 : 1;
  return 0;
}
async function runTutor(spec, root, sig) {
  stopSpeaking();
  let level = startLevel(); const startLv = level;
  const F = analyze().findings.filter((f) => f.tone !== 'ok');
  const fn = (load().findNote || []).slice(-1)[0];
  const lastM = mastery().afinacion;
  // 1) el profe te saluda y te cuenta el plan
  const intro = [];
  if (!lastM) intro.push('Hoy es nuestra primera clase juntos. Vamos a trabajar <b>lo más importante para cantar: encontrar y sostener la nota</b>.');
  else intro.push(`La clase pasada llegaste hasta <b>${LADDER[Math.min(LADDER.length - 1, lastM.best ?? lastM.level)].name.toLowerCase()}</b>.` + (level < lastM.level ? ' Pasaron unos días, así que partimos un peldaño antes para calentar el oído.' : ' Seguimos desde ahí.'));
  if (fn && fn.find && fn.find.includes('parteAbajo')) intro.push('Algo que noté: al empezar sueles partir <b>más grave</b> que la nota. Hoy vamos a "apuntar arriba".');
  else if (F[0]) intro.push(`Algo que noté en ti: <b>${F[0].title.toLowerCase()}</b>. Lo tendré en cuenta.`);
  intro.push('Funciona así: si algo te sale bien, <b>subimos al tiro</b>; si cuesta, bajamos un paso para afirmarlo. Nada de repetir por repetir.');
  const introBox = profeOn() ? profeBox('plan', { nivelHoy: LADDER[level].name, nivelAnterior: lastM ? LADDER[Math.min(LADDER.length - 1, lastM.level)].name : null, ultimoTaller: fn || null }) : null;
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say(intro.join(' '), 'hola'), introBox,
    h('div', { class: 'tutor-ladder' }, ...LADDER.map((l, i) => h('div', { class: 'tl-step' + (i < level ? ' done' : i === level ? ' cur' : '') }, h('span', {}, i + 1), l.name))),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); getCtx(); res(); } }, 'Empezar la clase')))));
  if (sig.aborted) return { score: 0 };
  // 1a) como un profe: "¿cómo llega tu voz hoy?" y adapto la clase
  const feel = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say('Antes de empezar: <b>¿cómo está tu voz hoy?</b>', 'atento'),
    h('div', { class: 'feel-opts' },
      h('button', { class: 'btn big', onclick: () => res('bien') }, '😄 Bien, con ganas'),
      h('button', { class: 'btn big', onclick: () => res('cansada') }, '😮‍💨 Cansada o con sueño'),
      h('button', { class: 'btn big', onclick: () => res('ronca') }, '🤒 Ronca o me molesta')), h('div', { class: 'grow' }))));
  if (sig.aborted) return { score: 0 };
  if (feel === 'ronca') {
    await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say('Gracias por decirme. Con la voz ronca o molesta <b>no conviene cantar fuerte ni agudo</b>: hoy hacemos una clase cortita y suave, solo de oído y notas cómodas. Toma agua tibia y, si la ronquera dura más de dos semanas, consulta a un fonoaudiólogo.', 'piensa'), h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Clase suave')))));
    spec = { ...spec, max: 3 }; level = Math.min(level, 1);
  } else if (feel === 'cansada') {
    await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say('Entonces hoy una clase <b>más corta</b> y sin exigirte: lo importante es practicar un poco todos los días, no mucho un día.', 'feliz'), h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Vamos')))));
    spec = { ...spec, max: 5 };
  }
  // 1b) la primera vez: comprobar juntos que el micrófono te mide bien (así confías en lo que marco)
  if (!load().micCheck && !spec.noVoice) { await run({ type: 'miccheck' }, root, sig); if (sig.aborted) return { score: 0 }; }
  // 2) tu propia voz como modelo (una sola vez)
  let myV = await getMyVoice();
  if (!myV && !spec.noVoice) { myV = await captureMyVoice(root, sig); if (sig.aborted) return { score: 0 }; }
  // 3) calentamiento corto
  for (const w of warmup(true).slice(0, 1)) { await run(w, root, sig); if (sig.aborted) return { score: 0 }; }
  // 4) la escalera, adaptándose en vivo
  const log = []; let best = level, streakHard = 0; let i = 0; const MAX = spec.max || 8; const t0 = Date.now(); let earDone = false;
  while (i < MAX && !sig.aborted && Date.now() - t0 < 15 * 60e3) {
    const step = LADDER[level];
    const ex = { ...step.make(myV), _sid: 'clase', _pos: i };
    let res = null;
    try { res = await run(ex, root, sig); } catch (e) { console.error(e); res = { score: null, skipped: true }; }
    if (sig.aborted) break;
    i++;
    if (!res || res.score == null || res.skipped) continue;
    const sc = res.score; log.push({ level, name: step.name, score: sc });
    let decision, mood, txt;
    if (sc >= 0.85 && level < LADDER.length - 1) { level++; streakHard = 0; decision = 'up'; mood = 'celebra'; txt = `¡Eso! <b>${Math.round(sc * 100)}%</b>. No hace falta repetirlo: <b>subimos un peldaño</b> → ${LADDER[level].name.toLowerCase()}.`; }
    else if (sc >= 0.85) { decision = 'top'; mood = 'celebra'; txt = '¡Llegaste a lo más alto de la escalera de hoy! Lo que sigue es aplicarlo en una canción.'; }
    else if (sc >= 0.55) { streakHard = 0; decision = 'same'; mood = 'feliz'; txt = `Bien encaminado (<b>${Math.round(sc * 100)}%</b>). Una vez más en este peldaño, con notas distintas, y si sale subimos.`; }
    else {
      streakHard++;
      if (level > 0) { level--; decision = 'down'; mood = 'piensa'; txt = `Esto costó (<b>${Math.round(sc * 100)}%</b>), y es normal. <b>Bajamos un paso</b> para afirmar la base: ${LADDER[level].name.toLowerCase()}. Así se aprende de verdad.`; }
      else { decision = 'stay'; mood = 'piensa'; txt = 'Esto está costando. Vamos con calma: te voy a ayudar más en cada nota.'; }
    }
    best = Math.max(best, level);
    // si te mueves al revés de la guía, un minijuego de oído antes de seguir
    const dirIssue = (res.issues || []).some((x) => x.key === 'direccion');
    await new Promise((ok) => root.replaceChildren(h('div', { class: 'ex' },
      say(txt, mood),
      (res.issues || []).slice(0, 1).map((x) => h('p', { class: 'small', html: '🔎 ' + x.text + (x.tip ? '<br>👉 ' + x.tip : '') }))[0] || null,
      listenRow(res),
      profeBox('exercise', { clase: 'Clase con tu profe', ejercicio: step.name, puntaje: Math.round(sc * 100) + '%', resultado: plain(res.detail), problemas: (res.issues || []).slice(0, 3).map((x) => plain(x.text)), decisionDelProfe: decision, siguiente: LADDER[level].name, taller: res.taller || undefined }),
      h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn ghost', onclick: () => ok('end') }, 'Terminar aquí'), h('button', { class: 'btn primary big', onclick: () => { sfx('select'); ok(); } }, decision === 'top' ? 'Una más' : 'Seguir'))))).then((v) => { if (v === 'end') i = MAX; });
    if (dirIssue && !earDone) { earDone = true; await run({ ...ear('updown'), text: 'Un minijuego rápido de oído: <b>¿la segunda nota es más aguda o más grave?</b> Saberlo es lo que te dice hacia dónde mover la voz.' }, root, sig); }
    if (streakHard >= 3 && level === 0) break;
  }
  // 5) como en toda buena clase: terminamos CANTANDO una canción de verdad
  if (!sig.aborted && feel !== 'ronca' && log.length) {
    const sg = SONGS.find((x) => songStars(x.id) < 3) || SONGS[0]; const lv = level < 4 ? 1 : Math.min(3, songStars(sg.id) + 1);
    await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say(`Y ahora lo mejor: <b>aplicarlo cantando</b>. Vamos con "${sg.title}" ${sg.emoji}, ${lv === 1 ? 'la primera parte, frase a frase' : 'en el nivel "' + LEVEL_TXT[lv].toLowerCase() + '"'}. La pongo en tu tono.`, 'celebra'), h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res(); } }, '🎤 ¡A cantar!')))));
    const ex = songExercises(sg, lv)[0];
    let sr = null; try { sr = await run(ex, root, sig); } catch (e) { console.error(e); }
    if (sr && sr.score != null && !sr.skipped) {
      log.push({ level, name: 'Canción: ' + sg.title, score: sr.score });
      if (sr.score >= 0.7 && lv > 1) setSongStars(sg.id, lv); else if (sr.score >= 0.7 && songExercises(sg, 1).length === 1) setSongStars(sg.id, 1);
      await new Promise((ok) => root.replaceChildren(h('div', { class: 'ex' }, say(sr.score >= 0.7 ? `¡Cantaste "${sg.title}"! ${Math.round(sr.score * 100)}% de las notas afinadas. Eso ya es cantar.` : `Primer contacto con "${sg.title}": ${Math.round(sr.score * 100)}%. La próxima clase sale mejor.`, sr.score >= 0.7 ? 'celebra' : 'feliz'), listenRow(sr), h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => ok() }, 'Seguir')))));
    }
  }
  const s = load(); s.mastery = s.mastery || {};
  s.mastery.afinacion = { level, best: Math.max(best, (lastM && lastM.best) || 0), at: Date.now(), hist: [...((lastM && lastM.hist) || []), { at: Date.now(), from: startLv, to: level, n: log.length }].slice(-30) };
  save();
  const avg = log.length ? log.reduce((a, b) => a + b.score, 0) / log.length : 0;
  const ups = level - startLv;
  await new Promise((ok) => root.replaceChildren(h('div', { class: 'ex' },
    say(ups > 0 ? `<b>Subiste ${ups} peldaño${ups > 1 ? 's' : ''} hoy.</b> Empezaste en "${LADDER[startLv].name.toLowerCase()}" y llegaste a "${LADDER[level].name.toLowerCase()}". ¡Así se avanza!` : ups < 0 ? 'Hoy afirmamos la base, que es lo que más rinde a la larga. La próxima clase partimos desde aquí.' : 'Hoy consolidamos este peldaño. La próxima clase intentamos subir.', ups > 0 ? 'celebra' : 'feliz'),
    h('div', { class: 'tutor-ladder' }, ...LADDER.map((l, k) => h('div', { class: 'tl-step' + (k < level ? ' done' : k === level ? ' cur' : '') }, h('span', {}, k + 1), l.name))),
    profeBox('lesson', { clase: 'Clase con tu profe (afinación)', peldañoInicio: LADDER[startLv].name, peldañoFinal: LADDER[level].name, ejercicios: log.map((x) => ({ peldaño: x.name, puntaje: Math.round(x.score * 100) + '%' })) }),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => ok() }, 'Terminar la clase')))));
  return { score: avg, info: true, detail: `Clase: del peldaño ${startLv + 1} al ${level + 1}.` };
}

// ---------- Habla con tu profe (IA) ----------
function songbookCard() {
  const done = SONGS.filter((sg) => songStars(sg.id) > 0).length;
  return h('button', { class: 'card rec song-card', onclick: () => { sfx('select'); nav('#cancionero'); } }, h('div', { class: 'card-ic' }, '🎤'),
    h('div', {}, h('b', {}, 'Canta una canción ahora'), h('div', { class: 'small muted' }, done ? `Llevas ${done} de ${SONGS.length} canciones. ¡Sube de nivel en una!` : 'Canciones conocidas con letra en pantalla, en tu tono. Desde el primer día.')), icon('chevron'));
}
function cancioneroView() {
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#aprender') }, icon('back')), h('span', {}));
  view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Cancionero'),
    say('Canciones de verdad, en <b>tu</b> tono y con la letra en pantalla. Empieza <b>frase a frase</b>; cuando te salga, súbela a <b>conmigo</b> y luego a <b>tú solo</b>. Y si tienes tus propias canciones, están en "Canciones".', 'feliz', { compact: true }),
    h('div', { class: 'songbook' }, ...SONGS.map((sg) => { const st = songStars(sg.id); const nextLv = Math.min(3, st + 1);
      return h('div', { class: 'card sb-item' },
        h('div', { class: 'row between' }, h('div', { class: 'row' }, h('div', { class: 'card-ic' }, sg.emoji), h('div', {}, h('b', {}, sg.title), h('div', { class: 'small muted' }, sg.who))), h('span', { class: 'sb-stars' }, '★'.repeat(st) + '☆'.repeat(3 - st))),
        h('p', { class: 'small' }, sg.why),
        h('div', { class: 'sb-levels' }, ...[1, 2, 3].map((lv) => h('button', { class: 'btn small' + (lv === nextLv ? ' primary' : ''), disabled: lv > st + 1, onclick: () => { sfx('select'); nav(`#canc-${sg.id}-${lv}`); } }, (lv <= st ? '✓ ' : lv > st + 1 ? '🔒 ' : '') + LEVEL_TXT[lv])))); })),
    h('button', { class: 'btn', onclick: () => nav('#canciones') }, '🎵 Mis canciones (Suno u otras)')));
}
function findCard() {
  const fh = load().findNote || []; const last = fh[fh.length - 1];
  return h('button', { class: 'card rec find-card', onclick: () => { sfx('select'); nav('#encuentra'); } }, h('div', { class: 'card-ic' }, '🎯'),
    h('div', {}, h('b', {}, 'Encuentra la nota'), h('div', { class: 'small muted' }, last ? `Última vez: ${last.found} de ${last.n}` + (last.avgT != null ? `, ${last.avgT.toFixed(1)} s promedio. ¡A mejorar ese tiempo!` : '.') : 'Taller sin apuro: buscas cada nota con calma y te guío paso a paso hasta encontrarla.')), icon('chevron'));
}
function chatCard() {
  return h('button', { class: 'card rec chat-card', onclick: () => { sfx('select'); nav('#profe-ia'); } }, chincol('hola', 48),
    h('div', {}, h('b', {}, 'Habla con tu profe'), h('div', { class: 'small muted' }, 'Pregúntale lo que quieras: por qué te pasa algo, cómo mejorarlo o qué practicar hoy.')), icon('chevron'));
}
function chatView() {
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => { stopReading(); nav('#aprender'); } }, icon('back')), h('b', {}, 'Tu profe'), h('span', {}));
  if (!profeOn()) {
    view.replaceChildren(h('div', { class: 'page' }, back, say('Para conversar conmigo necesito que tengas tu cuenta: así guardo lo que sé de tu voz y te respondo pensando en ti.', 'piensa'),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#cuenta') }, 'Crear o entrar a mi cuenta')))); return;
  }
  let msgs = []; try { msgs = JSON.parse(localStorage.getItem('syng.chat') || '[]'); } catch {}
  const list = h('div', { class: 'chat-list' });
  const bubble = (m) => m.role === 'user' ? h('div', { class: 'msg me' }, m.content) : h('div', { class: 'msg profe' }, chincol('feliz', 36), h('div', {}, h('p', {}, m.content), h('button', { class: 'linkbtn small', onclick: () => readAloud(m.content) }, '🔊 Escuchar')));
  const paint = () => { list.replaceChildren(...(msgs.length ? msgs.map(bubble) : [say('¡Hola! Soy tu profe. Conozco lo que la app ha medido de tu voz. Cuéntame qué te cuesta o qué quieres lograr, y lo trabajamos juntos.', 'feliz')])); list.lastElementChild && list.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' }); };
  const inp = h('textarea', { class: 'inp chat-inp', rows: 2, placeholder: 'Escribe tu pregunta…' });
  const sendBtn = h('button', { class: 'btn primary' }, 'Enviar');
  const sendMsg = async (text) => {
    text = String(text || '').trim(); if (!text || sendBtn.disabled) return;
    msgs.push({ role: 'user', content: text }); inp.value = ''; paint();
    const wait = h('div', { class: 'msg profe' }, chincol('piensa', 36), h('div', { class: 'profe-ai thinking' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i'))));
    list.append(wait); wait.scrollIntoView({ block: 'end', behavior: 'smooth' }); sendBtn.disabled = true;
    const r = await askProfe('chat', {}, msgs.slice(-10), 20000);
    sendBtn.disabled = false;
    msgs.push({ role: 'assistant', content: r.text || ('No pude responder: ' + (r.error || 'intenta de nuevo.')) });
    if (!r.text) msgs[msgs.length - 1].err = true;
    msgs = msgs.slice(-30); localStorage.setItem('syng.chat', JSON.stringify(msgs.filter((m) => !m.err))); paint();
    if (r.text) readAloud(r.text);
  };
  sendBtn.onclick = () => sendMsg(inp.value);
  inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(inp.value); } };
  const chips = h('div', { class: 'chips-row' }, ...['No logro afinar, ¿qué hago?', 'Dame un ejercicio para hoy', '¿Por qué se me quiebra la voz?', '¿Cómo canto con fuerza sin gritar?', '¿Qué tipo de canciones me quedan bien?'].map((t) => h('button', { class: 'qchip', onclick: () => sendMsg(t) }, t)));
  view.replaceChildren(h('div', { class: 'page chat-page' }, back, list, chips, h('div', { class: 'chat-bar' }, inp, sendBtn),
    h('p', { class: 'small muted' }, 'Tu profe usa inteligencia artificial con lo que la app midió de tu voz. Puede equivocarse: si algo duele, para y consulta a un fonoaudiólogo.')));
  paint();
}

// ---------- Tu cuenta ----------
function accountCard() {
  const a = account();
  return h('button', { class: 'card rec acct-card', onclick: () => nav('#cuenta') }, h('div', { class: 'card-ic' }, a ? '☁️' : '👤'),
    h('div', {}, h('b', {}, a ? 'Tu cuenta' : 'Crea tu cuenta'), h('div', { class: 'small muted' }, a ? a.email + (syncInfo.status === 'error' ? ' · sin conexión' : ' · avance guardado') : 'Guarda tu avance y úsalo en el celular y el computador.')), icon('chevron'));
}
function accountView() {
  const a = account();
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#perfil') }, icon('back')), h('span', {}));
  if (a) {
    const st = h('p', { class: 'small' });
    const paint = () => { st.textContent = syncInfo.status === 'saving' ? 'Guardando…' : syncInfo.status === 'error' ? '⚠️ ' + syncInfo.error : syncInfo.at ? 'Avance guardado en tu cuenta ✓ (' + new Date(syncInfo.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ')' : 'Conectado.'; };
    paint(); const off = onSync(paint);
    const syncBtn = h('button', { class: 'btn primary', onclick: async () => { syncBtn.disabled = true; const ch = await pull(); if (!ch) await push(true); syncBtn.disabled = false; if (ch) toast('☁️', 'Avance actualizado', 'Traje lo que practicaste en otro dispositivo.'); } }, 'Sincronizar ahora');
    view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Tu cuenta'),
      say(`Estás conectado como <b>${a.email}</b>. Tu avance se guarda solo cada vez que practicas. Ingresa con el mismo correo en tu computador o en otro celular y seguirás donde quedaste.`, 'feliz'),
      h('div', { class: 'card' }, st, syncBtn),
      h('p', { class: 'small muted' }, 'Se guardan tus lecciones, XP, racha, logros y todas las mediciones de tu voz. Las canciones (archivos de audio) quedan en cada dispositivo porque pesan mucho.'),
      h('button', { class: 'btn ghost', onclick: () => { off(); signOut(); nav('#perfil'); } }, 'Cerrar sesión en este dispositivo')));
    return;
  }
  const email = h('input', { type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', class: 'inp' });
  const pass = h('input', { type: 'password', placeholder: 'Contraseña (mínimo 8 caracteres)', autocomplete: 'current-password', class: 'inp' });
  const msg = h('p', { class: 'small' });
  const go = async (action, btn) => {
    msg.textContent = action === 'register' ? 'Creando tu cuenta…' : 'Ingresando…'; btn.disabled = true;
    try {
      const r = await signIn(action, email.value, pass.value);
      if (r.needChoice) {
        const d = new Date(r.server.updated).toLocaleDateString('es-CL');
        view.replaceChildren(h('div', { class: 'page' }, h('h1', {}, '¿Qué avance usamos?'),
          say(`Tu cuenta ya tiene avance guardado (último cambio: ${d}), y este dispositivo también tiene avance. ¿Con cuál sigues? El otro se reemplaza.`, 'piensa'),
          h('button', { class: 'btn primary big', onclick: async () => { await chooseSide('server', r.server); toast('☁️', 'Listo', 'Usando el avance de tu cuenta.'); nav('#aprender'); } }, `El de mi cuenta (${r.server.data.xp || 0} XP)`),
          h('button', { class: 'btn big', onclick: async () => { await chooseSide('local'); toast('☁️', 'Listo', 'Guardé el avance de este dispositivo en tu cuenta.'); nav('#aprender'); } }, `El de este dispositivo (${load().xp || 0} XP)`)));
        return;
      }
      toast('☁️', action === 'register' ? '¡Cuenta creada!' : '¡Hola de nuevo!', r.adopted ? 'Traje tu avance guardado.' : 'Tu avance ya queda guardado en tu cuenta.');
      nav('#aprender');
    } catch (e) { msg.textContent = '⚠️ ' + e.message; btn.disabled = false; }
  };
  const reg = h('button', { class: 'btn primary big' }, 'Crear cuenta'); reg.onclick = () => go('register', reg);
  const log = h('button', { class: 'btn big' }, 'Ya tengo cuenta: ingresar'); log.onclick = () => go('login', log);
  view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Tu cuenta'),
    say('Con una cuenta, tu avance y las mediciones de tu voz te siguen a cualquier dispositivo: el celular, el computador, donde sea.', 'feliz'),
    h('div', { class: 'card acct-form' }, h('label', {}, 'Correo'), email, h('label', {}, 'Contraseña'), pass, msg, reg, log),
    h('p', { class: 'small muted' }, 'Tu contraseña se guarda cifrada (no se puede leer). Las canciones quedan en cada dispositivo.')));
}

// ---------- Tu rutina diaria y tu manual de voz ----------
async function routineToday() {
  const m = (load().voiceMaps || []).slice(-1)[0] || null;
  let phrase = null;
  const ls = load().lastSong;
  if (ls) { const song = await getSong(ls); if (song && song.analysis && song.analysis.lines.length) {
    const rep = song.progress && song.progress.report;
    let i = 0; if (rep && rep.lines) { const e = Object.entries(rep.lines).sort((a, b) => a[1] - b[1])[0]; if (e) i = Number(e[0]); }
    phrase = phraseExercises(song, i, getRange(), null).slice(-3);
  } }
  return dailyRoutine({ map: m, findings: analyze().findings.filter((f) => f.tone !== 'ok'), phrase });
}
function resCard() {
  const t = lastResTest();
  const nat = t ? t.results.filter((x) => x.s != null && x.s >= 0.7).map((x) => RES_INFO[x.id][1].toLowerCase()) : [];
  return h('button', { class: 'card rec res-card', onclick: () => { sfx('select'); nav(t ? '#recursos-ver' : '#recursos'); } }, h('div', { class: 'card-ic' }, '🪶'),
    h('div', {}, h('b', {}, t ? 'Tus recursos vocales' : 'Prueba recursos vocales'), h('div', { class: 'small muted' }, t ? (nat.length ? 'Te salen natural: ' + nat.join(', ') + '.' : 'Ve tus resultados y practica los que van saliendo.') : 'Falsete, vibrato, deslizar, adornos… descubre cuáles se te dan bien (5 min).')), icon('chevron'));
}
function routineCard() {
  const done = (load().history || []).some((x) => x.type === 'rutina' && x.day === today());
  return h('button', { class: 'card rec routine' + (done ? ' done' : ''), onclick: () => { sfx('select'); nav('#rutina'); } }, chincol(done ? 'celebra' : 'feliz', 48),
    h('div', {}, h('b', {}, done ? 'Rutina de hoy: ¡hecha! ✓' : 'Tu rutina de hoy · 10 min'), h('div', { class: 'small muted' }, 'Calentamiento a tu medida, tu foco técnico, un recurso y tu canción. Cambia cada día.')), icon('chevron'));
}
function manualView() {
  const ms = load().voiceMaps || []; const m = ms[ms.length - 1];
  const id = (m && m.id) || identities().slice(-1)[0];
  const F = analyze().findings; const R = getRange();
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#perfil') }, icon('back')), h('span', {}));
  if (!m && !id) { view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Tu manual de voz'), say('Para escribir el manual de <b>tu</b> voz primero necesito conocerla. Haz el mapa de tu voz (unos 8 minutos) y aquí aparecerá cómo usarla.', 'piensa'), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#mapa') }, 'Hacer el mapa de mi voz')))); return; }
  const nn = (x) => (x == null ? '—' : noteName(x));
  const sec = (title, ...ps) => h('div', { class: 'card manual-sec' }, h('h3', {}, title), ...ps.filter(Boolean).map((p) => (typeof p === 'string' ? h('p', { class: 'small', html: p }) : p)));
  const pas = m && m.siren && m.siren.passage;
  const strengths = [];
  if (m && m.onset && m.onset.kind === 'equilibrado') strengths.push('Tu ataque es equilibrado: empiezas las notas como buscan los profes.');
  if (m && m.air && m.air.mpt >= 15) strengths.push(`Tienes buen aire (${m.air.mpt} s en una nota).`);
  if (m && m.dyn && m.dyn.some((d) => d.range >= 15)) strengths.push('Manejas un buen rango de volumen.');
  if (m && m.tuning && m.tuning.acc >= 70) strengths.push(`Afinas bien: ${m.tuning.acc}% de tus notas al centro.`);
  if (id && id.texture === 'limpia') strengths.push('Tu sonido es limpio: poco ruido de aire.');
  if (id && id.color) strengths.push(`Tu voz ${id.color} es tu sello: ${id.color === 'brillante' ? 'tu voz se escucha y corta' : id.color === 'oscura y cálida' ? 'tu voz abraza, ideal para baladas' : 'te adapta a muchos estilos'}.`);
  F.filter((f) => f.tone === 'ok' && f.key === 'progreso').forEach((f) => strengths.push(f.title + ' ' + f.evidence));
  const care = F.filter((f) => f.tone !== 'ok').slice(0, 4).map((f) => `<b>${f.title}.</b> ${f.meaning}`);
  if (m && m.onset && m.onset.kind === 'duro') care.push('<b>Ataque duro.</b> Empezar con golpe de glotis cansa las cuerdas: piensa la nota como un suspiro con sonido.');
  if (m && m.air && m.air.sz > 1.4) care.push('<b>Relación s/z alta.</b> Puede escaparse aire por las cuerdas: trabaja el ataque limpio y, si notas ronquera persistente, consulta a un fonoaudiólogo.');
  const res = [];
  if (id && id.color === 'oscura y cálida') res.push('🎙️ <b>Voz íntima</b> y <b>deslizar</b>: tu calidez luce en baladas, boleros y versos suaves.', '✨ Un poco de <b>twang</b> en los coros para proyectar sin perder tu calidez.');
  if (id && id.color === 'brillante') res.push('📣 <b>Voz llena arriba</b> y <b>twang</b>: tu brillo luce en pop y rock.', '🎙️ Contrasta con <b>voz íntima</b> en los versos para que los coros exploten.');
  if (id && id.color === 'equilibrada') res.push('🎛️ Tu voz se adapta: usa <b>voz íntima</b> en versos y <b>voz llena</b> en coros.');
  if (id && id.texture === 'limpia') res.push('🎶 <b>Adornos y melismas</b>: con un sonido limpio se escuchan nítidos.');
  if (id && /aire/.test(id.texture || '')) res.push('🌬️ Tu aire natural es un color íntimo; para los momentos fuertes, trabaja el ataque limpio para cerrar más la voz.');
  if (pas != null) res.push(`🪶 <b>Quiebre a falsete</b> cerca de ${nn(pas)}: úsalo a propósito como color en las notas altas.`);
  const rt = lastResTest();
  if (rt) { const nat = rt.results.filter((x) => x.s != null && x.s >= 0.7); if (nat.length) res.unshift(`✅ <b>Medido en tu prueba:</b> te salen natural ${nat.map((x) => RES_INFO[x.id][0] + ' ' + RES_INFO[x.id][1].toLowerCase()).join(', ')}. Úsalos en tus canciones: son tu sello.`); }
  else res.push('🧪 Aún no pruebas tus recursos: <a href="#recursos">hazlo aquí</a> y te digo cuáles se te dan bien.');
  view.replaceChildren(h('div', { class: 'page' }, back,
    h('h1', {}, 'Tu manual de voz'),
    say('Esto es cómo usar <b>tu</b> voz, no una voz cualquiera: está escrito con lo que medí de ti.', 'feliz', { compact: true }),
    sec('Tu instrumento',
      id ? `Tu voz se parece a la de un <b>${id.type}</b>.` + (id.color ? ` Su color es <b>${id.color === 'oscura y cálida' ? 'oscuro y cálido' : id.color === 'brillante' ? 'brillante' : 'equilibrado'}</b>` + (id.texture ? ` y su textura, <b>${id.texture}</b>.` : '.') : '') : null,
      m && m.speak != null ? `Hablas alrededor de <b>${nn(Math.round(m.speak))}</b>: tu voz cantada nace cerca de ahí.` : null,
      id && id.sweetLo != null ? `Donde mejor suenas: <b>${nn(id.sweetLo)}–${nn(id.sweetHi)}</b>. Tu rango cómodo: ${nn(R.low)}–${nn(R.high)}.` : null),
    sec('Cómo elegir el tono de una canción',
      id && id.sweetLo != null ? `Que la mayor parte de la melodía viva entre <b>${nn(id.sweetLo)} y ${nn(id.sweetHi)}</b>, y que la nota más alta no pase de <b>${nn(R.high)}</b>.` : null,
      'En tus canciones, el botón <b>"Tono para tu voz"</b> lo calcula por ti y cambia el tono sin cambiar la velocidad.'),
    sec('Tu pasaje (cambio de registro)',
      pas != null ? `Tu voz cambia cerca de <b>${nn(pas)}</b>. Desde ${nn(pas - 2)} empieza a <b>aligerar</b> (menos peso, más "u"/"ng"), y no sostengas notas con voz de pecho empujada más arriba de ${nn(pas + 2)}.` : 'Aún no detecté un quiebre claro. Repite el mapa con sirenas amplias, desde lo más grave a lo más agudo.',
      pas != null ? 'Si prefieres, cambia a falsete <b>a propósito</b> en la nota alta: es un recurso, no un error.' : null),
    strengths.length ? sec('Tus fortalezas', ...strengths.map((x) => '✓ ' + x)) : null,
    care.length ? sec('Lo que debes cuidar', ...care) : null,
    res.length ? sec('Recursos que le sientan a tu voz', ...res, h('button', { class: 'btn small', onclick: () => nav('#leccion-res1') }, 'Ir a "Tus recursos vocales"')) : null,
    sec('Tu día a día',
      '1. <b>Tu rutina de 10 minutos</b> (cambia cada día y se arma con tu mapa).',
      '2. Una de tus canciones, con el informe del profe.',
      '3. Cada mes, repite el mapa de tu voz para ver cómo cambia.',
      h('button', { class: 'btn primary', onclick: () => nav('#rutina') }, icon('play', 16), 'Hacer mi rutina de hoy')),
    h('p', { class: 'small muted' }, `Basado en tu mapa del ${m ? new Date(m.at).toLocaleDateString('es-CL') : '—'} y en ${analyze().n} notas que cantaste.`)));
}

// ---------- Misiones del día y cofre ----------
function questsCard() {
  const qs = dailyQuests(); const ch = chestState();
  const L = levelOf(load().xp);
  const chest = ch === 'ready' ? h('button', { class: 'chest ready', onclick: (e) => {
    const r = openChest(); if (!r) return;
    track('chest'); sfx('done'); confetti();
    e.currentTarget.replaceWith(h('div', { class: 'chest open' }, h('span', {}, '🎉'), h('b', {}, `+${r.xp} XP`), r.freeze ? h('small', {}, '¡y un protector de racha 🧊!') : h('small', {}, 'Vuelve mañana por otro cofre')));
    renderHeader();
  } }, h('span', { class: 'chest-ic' }, '🎁'), h('b', {}, '¡Abrir cofre!')) : h('div', { class: 'chest' + (ch === 'open' ? ' open' : '') }, h('span', { class: 'chest-ic' }, ch === 'open' ? '✨' : '🎁'), h('small', {}, ch === 'open' ? 'Cofre abierto' : 'Cumple las 3 misiones'));
  return h('section', { class: 'card quests' },
    h('div', { class: 'row between' }, h('b', {}, 'Misiones de hoy'), h('span', { class: 'pill' }, `${L.icon} Nivel ${L.n} · ${L.name}`)),
    h('div', { class: 'lvlbar' }, h('div', { class: 'pfill', style: `width:${Math.round(L.pct * 100)}%` })),
    h('small', { class: 'muted' }, `${load().xp - L.from} / ${L.to - L.from} XP para el nivel ${L.n + 1}`),
    h('div', { class: 'q-row' }, h('div', { class: 'q-list' }, ...qs.map((q) => h('div', { class: 'q' + (q.done ? ' done' : '') },
      h('span', { class: 'q-ic' }, q.done ? '✅' : q.icon), h('div', { class: 'grow' }, h('span', {}, q.text), h('div', { class: 'qbar' }, h('div', { class: 'pfill', style: `width:${Math.min(100, Math.round((q.prog / q.target) * 100))}%` }))), h('small', {}, `${Math.min(q.prog, q.target)}/${q.target}`)))), chest));
}

// ---------- Lo que el profe aprendió de ti ----------
function profeCard() {
  const { findings, n } = analyze();
  const bad = findings.filter((f) => f.tone !== 'ok');
  const good = findings.filter((f) => f.tone === 'ok');
  if (!n) return null;
  return h('button', { class: 'card rec profe', onclick: () => { sfx('select'); nav('#profe'); } }, chincol('piensa', 44),
    h('div', {}, h('b', {}, 'Tu profe aprendió de ti'),
      h('div', { class: 'small muted' }, findings.length ? [...bad, ...good].slice(0, 2).map((f) => f.title).join(' · ') : `Llevo ${n} notas analizadas. Con unas 30 empiezo a ver patrones.`)), icon('chevron'));
}
function profeView() {
  const { findings, adapt, n } = analyze();
  const A = adapt; const adj = [];
  if (A.keyShift) adj.push(`Tono de los ejercicios ${A.keyShift > 0 ? 'subido' : 'bajado'} ${Math.abs(A.keyShift)} semitono${Math.abs(A.keyShift) > 1 ? 's' : ''}.`);
  if (A.tolF !== 1) adj.push(`Zona verde ${A.tolF > 1 ? 'más ancha' : 'más estrecha'} (${Math.round((A.tolF - 1) * 100)}%).`);
  if (A.bpmF !== 1) adj.push(`Velocidad ${Math.round((1 - A.bpmF) * 100)}% más lenta.`);
  if (A.warm.length) adj.push('Calentamiento con ejercicios extra para ti.');
  if (A.remedial.length) adj.push('Un ejercicio de refuerzo al comienzo de la Clase de hoy.');
  if (A.hints.bias || A.hints.leaps) adj.push('Avisos en vivo mientras cantas' + (A.hints.bias ? ` (si vas quedando ${A.hints.bias})` : '') + (A.hints.leaps ? ' y antes de los saltos' : '') + '.');
  const tones = { ok: '✓', mid: '•', warn: '!' };
  view.replaceChildren(h('div', { class: 'page' },
    h('h1', {}, 'Lo que he aprendido de ti'),
    say(n < 30 ? `Llevo ${n} notas analizadas. Necesito al menos unas 30 para afirmar un patrón sin inventar. Sigue practicando y aquí aparecerán.` : `Analicé tus últimas ${Math.min(n, 450)} notas. Solo te muestro patrones que se repiten lo suficiente como para no ser casualidad.`, 'piensa'),
    h('div', { class: 'diag-list' }, ...findings.map((f) => h('div', { class: 'diag-item ' + f.tone }, h('div', { class: 'diag-ic' }, tones[f.tone]),
      h('div', {}, h('b', {}, f.title), h('p', {}, f.evidence), h('p', { class: 'tip' }, h('b', {}, 'Qué significa: '), f.meaning), f.action ? h('p', { class: 'tip' }, h('b', {}, 'Lo que ajusté: '), f.action) : null)))),
    adj.length ? h('div', { class: 'card' }, h('h3', {}, 'Ajustes activos'), ...adj.map((x) => h('p', { class: 'small' }, '• ' + x))) : null,
    h('p', { class: 'small muted' }, 'Cada nota que cantas se guarda solo en tu celular. Los patrones se recalculan en cada sesión: si corriges un vicio, el ajuste se retira solo.'),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#aprender') }, 'Volver'))));
}
function mapCard() {
  const ms = load().voiceMaps || []; const m = ms[ms.length - 1];
  const go = h('button', { class: 'btn primary', onclick: () => nav('#mapa') }, icon('mic', 18), m ? 'Hacer el mapa otra vez' : 'Hacer el mapa de mi voz');
  if (!m) return h('div', { class: 'card ok-card' }, h('h3', {}, 'El mapa de tu voz'), h('p', { class: 'small' }, 'Conoce tu voz en todo sentido: cómo hablas, dónde cantas mejor, tu color y textura, tu pasaje, tu volumen, tu aire, cómo empiezas el sonido y cómo afinas. Unos 8 minutos.'), go);
  const id = m.id;
  return h('div', { class: 'card ok-card' }, h('h3', {}, 'El mapa de tu voz'),
    h('p', { class: 'small' }, [id && id.type, id && id.color && 'color ' + id.color, id && id.texture, m.siren && m.siren.passage != null && 'pasaje ' + noteName(m.siren.passage), m.air && 'aire ' + m.air.mpt + ' s', m.onset && 'ataque ' + m.onset.kind].filter(Boolean).join(' · ')),
    h('p', { class: 'small muted' }, new Date(m.at).toLocaleDateString('es-CL') + (ms.length > 1 ? ` · ${ms.length} mapas guardados` : '')),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => nav('#mapa-ver') }, 'Ver mi mapa'), go));
}
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
  const reset = h('button', { class: 'btn ghost danger' }, 'Empezar de cero (borra progreso y mediciones)');
  reset.onclick = async () => { if (reset.dataset.sure) { await resetAll(); location.hash = '#aprender'; location.reload(); } else { reset.dataset.sure = 1; reset.textContent = 'Toca otra vez para confirmar: se borra todo tu progreso'; } };
  const resetSongs = h('button', { class: 'btn ghost danger' }, 'Borrar también mis canciones');
  resetSongs.onclick = async () => { if (resetSongs.dataset.sure) { await resetAll({ songs: true }); location.hash = '#aprender'; location.reload(); } else { resetSongs.dataset.sure = 1; resetSongs.textContent = 'Toca otra vez: se borran progreso y canciones'; } };
  view.replaceChildren(h('div', { class: 'page profile' }, ...[
    h('h1', {}, 'Tu progreso'),
    accountCard(),
    (() => { const L = levelOf(s.xp); return h('div', { class: 'card lvl-card' }, h('div', { class: 'row between' }, h('b', {}, `${L.icon} Nivel ${L.n}: ${L.name}`), h('small', { class: 'muted' }, `${s.xp} XP`)), h('div', { class: 'lvlbar' }, h('div', { class: 'pfill', style: `width:${Math.round(L.pct * 100)}%` })), h('small', { class: 'muted' }, `Te faltan ${L.to - s.xp} XP para el nivel ${L.n + 1}.`)); })(),
    (() => { const got = badges(); return h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', {}, 'Logros'), h('span', { class: 'pill' }, `${Object.keys(got).length} de ${BADGES.length}`)),
      h('div', { class: 'badges' }, ...BADGES.map((b) => h('div', { class: 'badge' + (got[b.id] ? ' on' : ''), title: b.desc }, h('span', { class: 'b-ic' }, got[b.id] ? b.icon : '🔒'), h('b', {}, b.name), h('small', {}, b.desc))))); })(),
    h('div', { class: 'stat-grid' },
      h('div', { class: 'sbox flame' }, icon('flame', 22), h('b', {}, s.streak || 0), h('small', {}, 'días de racha')),
      h('div', { class: 'sbox xp' }, icon('bolt', 22), h('b', {}, s.xp), h('small', {}, 'XP total')),
      h('div', { class: 'sbox' }, icon('star', 22), h('b', {}, `${done}/${ALL_LESSONS.length}`), h('small', {}, 'lecciones'))),
    h('div', { class: 'card' }, h('h3', {}, 'Tu voz'),
      h('p', {}, r.guessed ? 'Rango sin medir todavía.' : `Rango cómodo: ${noteName(r.low)} a ${noteName(r.high)} (${r.high - r.low} semitonos). Zona central: ${noteName(r.comfort)}.`),
      voiceProfile()?.speak ? h('p', {}, `Voz hablada ≈ ${noteName(Math.round(voiceProfile().speak))} · tu nota de casa: ${noteName(homeNote())}.`) : null,
      h('button', { class: 'btn primary', onclick: () => nav('#manual') }, icon('note', 18), 'Tu manual de voz'),
      h('button', { class: 'btn', onclick: () => nav(lastResTest() ? '#recursos-ver' : '#recursos') }, '🪶 Tus recursos vocales'),
      h('button', { class: 'btn', onclick: () => nav('#microfono') }, '🎙️ ¿Me está midiendo bien?'),
      h('button', { class: 'btn', onclick: () => nav('#profe') }, icon('ear', 18), 'Lo que he aprendido de ti'),
      mapCard(),
      diagCard(),
      identityCard(),
      h('h3', {}, 'Tu afinación en el tiempo'), chart),
    installBanner(true),
    h('div', { class: 'card settings' }, h('h3', {}, 'Ajustes'),
      sw('voice', 'Voz del Chincol', 'Te lee las instrucciones'),
      sw('sfx', 'Sonidos', 'Aciertos, errores y celebraciones'),
      sw('octaveFree', 'Aceptar la misma nota en otra octava', 'En ejercicios y canciones: si cantas la nota una octava más grave o más aguda, cuenta igual', true),
      sw('echoCancel', 'Cancelación de eco', 'Solo si cantas sin audífonos y la música confunde al detector', false),
      h('label', { class: 'set-row' }, h('span', {}, h('b', {}, 'Sonido de las notas guía')), timbre),
      h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, 'Latencia (ms)'), h('small', {}, 'Para medir bien si entras a tiempo. Mídela sin audífonos. Con Bluetooth el retraso es mayor: para ritmo, mejor audífonos con cable.')), h('div', { class: 'row' }, lat, calibBtn), calibMsg),
      reset, resetSongs),
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
// Reinicio pedido por Kriss (5-nov-2026): una sola vez, empezar de cero para medir su voz desde el principio.
const RESET_TAG = 'cero-2026-11-05';
if (localStorage.getItem('syng.resetTag') !== RESET_TAG) {
  localStorage.setItem('syng.resetTag', RESET_TAG);
  await resetAll();
  setTimeout(() => toast('🌱', 'Empezamos de cero', 'Borré tu progreso y tus mediciones. Ahora conozcamos tu voz desde el principio.'), 900);
}
// Con cuenta: primero traigo tu avance (si en otro dispositivo es más nuevo), antes de que nada se guarde aquí.
if (account()) await Promise.race([pull(), sleep(3500)]);
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && account() && !FOCUS.test(location.hash.slice(1)) && (await pull())) route(); });
checkLevel(); // fija tu nivel actual sin celebrar
route();
