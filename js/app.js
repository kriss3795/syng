// Syng — app para aprender a cantar con un profe que se adapta a ti.
// Estructura: HOY (tu clase con el profe) · CANTA (cancionero y tus canciones) · PROFE (chat con IA) · TU VOZ (tu voz, progreso y herramientas).
import { h, Roll, tuner, pct, sleep, icon, scoreRing } from './ui.js';
import { warmup } from './curriculum.js';
import { run, registerRunner } from './exercises.js';
import { runVoiceMap, voiceMapView } from './voicemap.js';
import { runEnergy } from './energy.js';
import { askProfe, profeOn, readAloud, stopReading } from './profe.js';
import { account, signIn, signOut, chooseSide, pull, push, syncInfo, onSync } from './account.js';
import { runFindNote } from './findnote.js';
import { runMicCheck } from './miccheck.js';
import { runComfort } from './comfort.js';
import { captureMyVoice, getMyVoice } from './myvoice.js';
import { SONGS, songExercises, songStars, setSongStars, LEVEL_TXT } from './cancionero.js';
import { runResources, resourcesView, lastResTest } from './resources.js';
import { runClase, SKILLS, SKILL_ORDER, mastery, skillLevel, unlocked, planToday, endFix, steadyFix } from './clase.js';
import { plain, profeBox, listenRow, feedbackSheet, canMakeEasier, makeEasier, setNav } from './sheet.js';
import { track, checkLevel, levelOf, dailyQuests, openChest, chestState, weekDots, applyFreeze, freezes, BADGES, badges, toast } from './fun.js';
import { gameMenu, playGame } from './game.js';
import { analyze, adaptExercises, liveAdjust, newFindings } from './adapt.js';
import { load, save, settings, setSetting, addXp, record, getRange, resetAll, today, getSong, voiceProfile, homeNote } from './store.js';
import { getCtx, startMic, stopMic, readPitch, resetSmoother, playNote, measureLatency } from './audio.js';
import { noteName } from './pitch.js';
import { songsView, newSongView, songDetail, practiceView, syncView, linesView } from './songs.js';
import { say, chincol, verdict, line } from './coach.js';
import { stopSpeaking, sfx, confetti } from './voice.js';

const view = document.getElementById('view');
const hdr = document.getElementById('hdr-stats');
let sig = { aborted: false };

registerRunner('voicemap', runVoiceMap);
registerRunner('energy', runEnergy);
registerRunner('resources', runResources);
registerRunner('findnote', runFindNote);
registerRunner('miccheck', runMicCheck);
registerRunner('comfort', runComfort);
registerRunner('clase', runClase);
registerRunner('myvoice', async (spec, root, s) => { const r = await captureMyVoice(root, s); return { score: 1, info: true, detail: r ? 'Tu voz modelo quedó grabada.' : 'Sin voz modelo por ahora.' }; });

// ---------- Pantalla encendida ----------
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => (wake = null)); } } catch (e) {} }
function releaseWake() { try { wake && wake.release(); } catch (e) {} wake = null; }

function nav(hash) { if (location.hash === hash) route(); else location.hash = hash; }
setNav(nav);
window.addEventListener('hashchange', route);

function renderHeader() {
  const s = load();
  hdr.replaceChildren(
    h('span', { class: 'stat-chip flame' + (s.lastDay === today() ? ' lit' : '') }, icon('flame', 18), String(s.streak || 0)),
    h('span', { class: 'stat-chip xp' }, icon('bolt', 18), String(s.xp)),
    h('button', { class: 'stat-chip lvl', onclick: () => nav('#voz'), 'aria-label': 'Nivel' }, levelOf(s.xp).icon + ' ' + levelOf(s.xp).n));
}

// Pantallas "de concentración": sin menú abajo, pantalla encendida.
const FOCUS = /^(estable$|final$|bienvenida$|clase$|encuentra$|microfono$|nota-comoda$|mapa$|recursos$|canc-|juego-|frase-|lineas-|escuchar-|guia-|solo-|practicar-|fiesta-|sincronizar-|cuenta$)/;
const OLD = { aprender: 'hoy', '': 'hoy', perfil: 'voz', cancionero: 'canta', 'profe-ia': 'profe', practicar: 'voz' };
async function route() {
  sig.aborted = true;
  sig = { aborted: false };
  stopSpeaking(); stopReading();
  stopMic();
  releaseWake();
  window.scrollTo(0, 0);
  renderHeader();
  let hsh = (location.hash || '#hoy').slice(1);
  if (OLD[hsh] != null) { hsh = OLD[hsh]; history.replaceState(null, '', '#' + hsh); }
  if (!load().onboarded && !FOCUS.test(hsh) && !['cuenta'].includes(hsh)) hsh = 'hoy';
  document.body.classList.toggle('focus', FOCUS.test(hsh));
  const tab = /^(canta|cancion|canciones|canc-|frase-|practicar-|fiesta-|lineas-|escuchar-|guia-|solo-|sincronizar-|editarletra-|juego)/.test(hsh) ? 'canta'
    : /^(profe|lo-que-se)/.test(hsh) ? 'profe' : /^(voz|afinador|mapa-ver|recursos-ver)/.test(hsh) ? 'voz' : 'hoy';
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  if (FOCUS.test(hsh) || hsh === 'afinador') keepAwake();
  try {
    if (hsh === 'hoy') return hoyView();
    if (hsh === 'canta') return cantaView();
    if (hsh === 'profe') return chatView();
    if (hsh === 'voz') return vozView();
    if (hsh === 'bienvenida') return session({ title: 'Bienvenida', color: 'teal', exercises: welcomeExercises(), id: 'bienvenida', back: '#hoy', backLabel: 'Ir a Hoy' });
    if (hsh === 'clase') return session({ title: 'Clase con tu profe', color: 'teal', exercises: [{ type: 'clase' }], id: 'clase', back: '#hoy', backLabel: 'Volver a Hoy' });
    if (hsh === 'estable') return session({ title: 'Voz estable', color: 'teal', exercises: steadyFix(), id: 'estable', back: '#voz', backLabel: 'Volver a Tu voz' });
    if (hsh === 'final') return session({ title: 'Terminar la nota afinada', color: 'teal', exercises: endFix(), id: 'final', back: '#voz', backLabel: 'Volver a Tu voz' });
    if (hsh === 'encuentra') return session({ title: 'Encuentra la nota', color: 'teal', exercises: [{ type: 'findnote', n: 6 }], id: 'encuentra', back: '#hoy', backLabel: 'Volver a Hoy' });
    if (hsh === 'microfono') return session({ title: '¿Me está midiendo bien?', color: 'teal', exercises: [{ type: 'miccheck' }], id: 'microfono', back: '#voz', backLabel: 'Volver a Tu voz' });
    if (hsh === 'nota-comoda') return session({ title: 'Tu nota cómoda para cantar', color: 'teal', exercises: [{ type: 'comfort' }], id: 'nota-comoda', back: '#voz', backLabel: 'Volver a Tu voz' });
    if (hsh === 'mapa') return session({ title: 'El mapa de tu voz', color: 'teal', exercises: [{ type: 'voicemap' }], id: 'mapa', back: '#voz', backLabel: 'Volver a Tu voz' });
    if (hsh === 'mapa-ver') { const m = (load().voiceMaps || []).slice(-1)[0]; const pv = (load().voiceMaps || []).slice(-2, -1)[0]; return m ? view.replaceChildren(h('div', { class: 'page' }, voiceMapView(m, pv, () => nav('#voz')))) : nav('#mapa'); }
    if (hsh === 'recursos') return session({ title: 'Prueba tus recursos vocales', color: 'green', exercises: [{ type: 'resources' }], id: 'recursos', back: '#recursos-ver', backLabel: 'Ver mis resultados' });
    if (hsh === 'recursos-ver') { const t = lastResTest(); if (!t) return nav('#recursos');
      view.replaceChildren(h('div', { class: 'page' }, backRow('#voz'), h('h1', {}, 'Tus recursos vocales'), resourcesView(t), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#recursos') }, 'Probar otra vez')))); return; }
    if (hsh === 'lo-que-se') return profeView();
    if (hsh === 'cuenta') return accountView();
    if (hsh === 'afinador') return freeTuner();
    { const m = /^canc-(\w+)-(\d)$/.exec(hsh); if (m) { const sg = SONGS.find((x) => x.id === m[1]); if (sg) { const lv = Number(m[2]); return session({ title: `${sg.title} · ${LEVEL_TXT[lv]}`, color: 'purple', exercises: songExercises(sg, lv), id: hsh, back: '#canta', backLabel: 'Volver a Canta' }); } } }
    if (hsh === 'juego') return gameMenu(view, nav);
    if (hsh.startsWith('juego-')) return playGame(view, nav, hsh.slice(6), sig);
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
    return hoyView();
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'page' }, say('Algo falló: ' + e.message, 'piensa', { tone: 'warn' })));
  }
}
const backRow = (to) => h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav(to), 'aria-label': 'Volver' }, icon('back')), h('span', {}));

// ---------- Bienvenida guiada (la primera vez) ----------
function welcomeExercises() {
  const cumple = SONGS.find((x) => x.id === 'cumple');
  return [
    { type: 'info', title: '¡Hola! Soy tu profe', body: '<p>Soy el Chincol y voy a ser tu profe de canto. Antes de la primera clase quiero <b>conocer tu voz</b>, como en una primera clase de verdad. Son unos 6 minutos:</p><ol><li>Reviso que el micrófono te escuche bien.</li><li>Busco <b>tu nota cómoda</b> para cantar.</li><li>Grabo tu voz para usarla como modelo.</li><li>Y cantamos tu primera frase.</li></ol><p>Busca un lugar tranquilo y deja el celular a unos 40 cm de tu boca.</p>' },
    { type: 'miccheck' },
    { type: 'comfort' },
    { type: 'myvoice' },
    { type: 'info', title: 'Tu primera frase', body: '<p>Ahora vas a cantar. Una canción que todos conocen, frase a frase y <b>en tu tono</b>. Escucha y repite: no tiene que salir perfecto.</p>' },
    songExercises(cumple, 1)[0],
    { type: 'info', title: '¡Listo, ya te conozco!', body: '<p>Desde ahora, cada día tienes <b>tu clase con el profe</b> (unos 10 minutos): yo elijo qué practicar según cómo te va, y la clase sube o baja de dificultad en vivo.</p><p>En <b>Canta</b> tienes canciones para cantar cuando quieras, y en <b>Profe</b> me puedes preguntar lo que sea.</p>' },
  ];
}

// ---------- HOY ----------
function hoyView() {
  const s = load(); applyFreeze();
  if (!s.onboarded) {
    view.replaceChildren(h('div', { class: 'page hoy' },
      h('section', { class: 'hero' }, say('¡Hola! Soy el Chincol, tu profe de canto. Antes de empezar quiero conocer tu voz: micrófono, tu nota cómoda y tu primera frase cantada. Son unos 6 minutos.', 'hola'),
        h('button', { class: 'btn primary big', onclick: () => { sfx('select'); nav('#bienvenida'); } }, icon('play', 18), 'Empezar (6 min)'),
        h('button', { class: 'linkbtn acct-link', onclick: () => nav('#cuenta') }, '¿Tienes cuenta? Entra aquí para que el profe con IA te acompañe')),
      installBanner()));
    return;
  }
  const plan = planToday(); const S = SKILLS[plan.main]; const lv = skillLevel(plan.main);
  const doneToday = (s.classLog || []).some((c) => c.day === today());
  const hr = new Date().getHours();
  const hola = hr < 12 ? '¡Buenos días!' : hr < 20 ? '¡Buenas tardes!' : '¡Buenas noches!';
  const greet = doneToday ? `¡Ya hiciste tu clase de hoy! 🎉 Si quieres más, canta una canción o haz otra clase.` : (s.streak >= 2 && s.lastDay !== today() ? `🔥 Llevas ${s.streak} días seguidos. Una clase corta y la mantienes.` : `${hola} Tu clase de hoy está lista.`);
  const goal = Math.min(1, (s.lastDay === today() ? s.todayXp || 0 : 0) / s.dailyGoal);
  const classCard = h('section', { class: 'hero clase-card' },
    say(greet, doneToday ? 'celebra' : 'hola', { compact: true }),
    h('div', { class: 'cc-focus' }, h('div', { class: 'cc-ic' }, S.icon), h('div', {}, h('small', { class: 'muted' }, 'Foco de hoy'), h('b', {}, S.name), h('div', { class: 'small muted' }, `Peldaño ${lv + 1} de ${S.steps.length}: ${S.steps[lv].name.toLowerCase()}`))),
    h('div', { class: 'cc-plan small' }, 'Calentamiento · ' + S.name + (plan.second ? ' · un toque de ' + SKILLS[plan.second].name.toLowerCase() : '') + ' · una canción'),
    h('button', { class: 'btn primary big', onclick: () => { sfx('select'); nav('#clase'); } }, icon('play', 18), doneToday ? 'Otra clase' : 'Empezar la clase (10 min)'),
    h('div', { class: 'quick2' },
      h('button', { class: 'btn', onclick: () => { sfx('select'); nav('#canta'); } }, '🎤 Cantar una canción'),
      h('button', { class: 'btn', onclick: () => { sfx('select'); nav('#encuentra'); } }, '🎯 Taller: encontrar la nota')));
  const goalCard = h('section', { class: 'card goal-card' },
    h('div', { class: 'goal' }, scoreRing(goal, 56), h('div', {}, h('b', {}, 'Meta de hoy'), h('div', { class: 'small muted' }, `${s.lastDay === today() ? s.todayXp || 0 : 0} de ${s.dailyGoal} XP`))),
    h('div', { class: 'week' }, ...weekDots().map((d) => h('div', { class: 'wd' + (d.on ? ' on' : '') + (d.today ? ' today' : '') }, h('span', {}, d.on ? '🔥' : ''), h('small', {}, d.l))), freezes() ? h('div', { class: 'wd frz', title: 'Protectores de racha' }, h('span', {}, '🧊'), h('small', {}, '×' + freezes())) : null));
  view.replaceChildren(h('div', { class: 'page home' }, installBanner(), h('div', { class: 'home-hero' }, classCard),
    h('aside', { class: 'home-side' }, goalCard, questsCard()), h('div', { class: 'home-path' }, skillsCard())));
}
function skillsCard() {
  return h('section', { class: 'card skills-card' }, h('h3', {}, 'Tu progreso con el profe'),
    ...SKILL_ORDER.map((k) => { const S = SKILLS[k]; const open = unlocked(k); const lv = skillLevel(k);
      return h('div', { class: 'sk-row' + (open ? '' : ' locked') }, h('span', { class: 'sk-ic' }, open ? S.icon : '🔒'),
        h('div', { class: 'sk-main' }, h('div', { class: 'row between' }, h('b', {}, S.name), h('small', { class: 'muted' }, open ? `${lv + 1}/${S.steps.length}` : 'se desbloquea afinando')),
          h('div', { class: 'sk-bar' }, h('i', { style: `width:${open ? Math.round(((lv + 1) / S.steps.length) * 100) : 0}%` })))); }));
}

// ---------- CANTA ----------
function cantaView() {
  view.replaceChildren(h('div', { class: 'page' }, h('h1', {}, 'Canta'),
    say('Canciones de verdad, en <b>tu</b> tono y con la letra en pantalla. Empieza <b>frase a frase</b>; cuando te salga, súbela a <b>conmigo</b> y luego a <b>tú solo</b>.', 'feliz', { compact: true }),
    h('div', { class: 'songbook' }, ...SONGS.map((sg) => { const st = songStars(sg.id); const nextLv = Math.min(3, st + 1);
      return h('div', { class: 'card sb-item' },
        h('div', { class: 'row between' }, h('div', { class: 'row' }, h('div', { class: 'card-ic' }, sg.emoji), h('div', {}, h('b', {}, sg.title), h('div', { class: 'small muted' }, sg.who))), h('span', { class: 'sb-stars' }, '★'.repeat(st) + '☆'.repeat(3 - st))),
        h('p', { class: 'small' }, sg.why),
        h('div', { class: 'sb-levels' }, ...[1, 2, 3].map((lv) => h('button', { class: 'btn small' + (lv === nextLv ? ' primary' : ''), disabled: lv > st + 1, onclick: () => { sfx('select'); nav(`#canc-${sg.id}-${lv}`); } }, (lv <= st ? '✓ ' : lv > st + 1 ? '🔒 ' : '') + LEVEL_TXT[lv])))); })),
    h('h2', {}, 'Tus canciones'),
    h('button', { class: 'card rec', onclick: () => nav('#canciones') }, h('div', { class: 'card-ic' }, '🎵'), h('div', {}, h('b', {}, 'Mis canciones'), h('div', { class: 'small muted' }, 'Sube tus canciones (por ejemplo de Suno): el profe las analiza, te las pone en tu tono y te dice qué frases mejorar.')), icon('chevron')),
    h('button', { class: 'card rec', onclick: () => nav('#juego') }, h('div', { class: 'card-ic' }, '🐦'), h('div', {}, h('b', {}, 'Juego: Vuelo del Chincol'), h('div', { class: 'small muted' }, 'Guía al Chincol con tu voz entre las nubes. Afinar jugando.')), icon('chevron'))));
}

// ---------- TU VOZ ----------
function vozView() {
  const s = load(); const st = settings(); const r = getRange(); const v = voiceProfile() || {};
  const m = (s.voiceMaps || []).slice(-1)[0]; const id = m && m.id;
  const hist = (s.history || []).filter((x) => x.cents != null).slice(-30);
  const sw = (k, label, sub, def = true) => { const i = h('input', { type: 'checkbox', class: 'switch' }); i.checked = st[k] === undefined ? def : !!st[k]; i.onchange = () => setSetting(k, i.checked); return h('label', { class: 'set-row' }, h('span', {}, h('b', {}, label), sub ? h('small', {}, sub) : null), i); };
  const timbre = h('select', {}, h('option', { value: 'voz' }, 'Voz (recomendado)'), h('option', { value: 'piano' }, 'Suave tipo piano'));
  timbre.value = st.timbre; timbre.onchange = () => setSetting('timbre', timbre.value);
  const lat = h('input', { type: 'number', min: 0, max: 500, value: st.latencyMs || 0 }); lat.onchange = () => setSetting('latencyMs', Number(lat.value));
  const calibMsg = h('small', { class: 'muted' }); const calibBtn = h('button', { class: 'btn' }, 'Medir latencia');
  calibBtn.onclick = async () => { calibBtn.disabled = true; try { const x = await measureLatency((t) => (calibMsg.textContent = t)); if (x == null) calibMsg.textContent = 'No pude medir: sin audífonos, volumen alto y en silencio.'; else { const ms = Math.round(x * 1000); setSetting('latencyMs', ms); lat.value = ms; calibMsg.textContent = `Listo: ${ms} ms.`; } } catch (e) { calibMsg.textContent = 'Permite el micrófono para medir.'; } stopMic(); calibBtn.disabled = false; };
  const reset = h('button', { class: 'btn ghost danger' }, 'Empezar de cero (borra tu avance)');
  reset.onclick = async () => { if (reset.dataset.sure) { await resetAll(); location.hash = '#hoy'; location.reload(); } else { reset.dataset.sure = 1; reset.textContent = 'Toca otra vez para confirmar'; } };
  const tool = (to, ic, t, sub) => h('button', { class: 'tool', onclick: () => nav(to) }, h('span', { class: 'tool-ic' }, ic), h('span', {}, h('b', {}, t), h('small', {}, sub)));
  const L = levelOf(s.xp); const got = badges();
  view.replaceChildren(h('div', { class: 'page profile' }, ...[
    h('h1', {}, 'Tu voz'),
    accountCard(),
    h('div', { class: 'card voice-card' }, h('h3', {}, 'Así es tu voz'),
      h('div', { class: 'vc-grid' },
        h('div', {}, h('small', {}, 'Nota cómoda para cantar'), h('b', {}, v.comfort != null ? noteName(v.comfort) : '—')),
        h('div', {}, h('small', {}, 'Voz al hablar'), h('b', {}, v.speak ? noteName(Math.round(v.speak)) : '—')),
        h('div', {}, h('small', {}, 'Zona cómoda'), h('b', {}, v.comfortLo != null ? `${noteName(v.comfortLo)}–${noteName(v.comfortHi)}` : '—')),
        h('div', {}, h('small', {}, 'Rango medido'), h('b', {}, r.guessed ? '—' : `${noteName(r.low)}–${noteName(r.high)}`))),
      id ? h('p', { class: 'small' }, [id.type && 'Voz tipo ' + id.type, id.color && 'color ' + id.color, id.texture && 'textura ' + id.texture, m.siren && m.siren.passage != null && 'cambio de registro cerca de ' + noteName(m.siren.passage)].filter(Boolean).join(' · ') + '.') : h('p', { class: 'small muted' }, 'Haz "El mapa de tu voz" para conocer tu tipo de voz, color, rango y pasaje.'),
      h('button', { class: 'btn small', onclick: () => nav('#lo-que-se') }, '🔎 Lo que el profe sabe de ti')),
    skillsCard(),
    h('div', { class: 'card lvl-card' }, h('div', { class: 'row between' }, h('b', {}, `${L.icon} Nivel ${L.n}: ${L.name}`), h('small', { class: 'muted' }, `${s.xp} XP`)), h('div', { class: 'lvlbar' }, h('div', { class: 'pfill', style: `width:${Math.round(L.pct * 100)}%` })), h('small', { class: 'muted' }, `Te faltan ${L.to - s.xp} XP para el nivel ${L.n + 1}. Racha: ${s.streak || 0} días.`)),
    h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h3', {}, 'Logros'), h('span', { class: 'pill' }, `${Object.keys(got).length} de ${BADGES.length}`)),
      h('div', { class: 'badges' }, ...BADGES.map((b) => h('div', { class: 'badge' + (got[b.id] ? ' on' : ''), title: b.desc }, h('span', { class: 'b-ic' }, got[b.id] ? b.icon : '🔒'), h('b', {}, b.name), h('small', {}, b.desc))))),
    h('div', { class: 'card' }, h('h3', {}, 'Tu afinación en el tiempo'), hist.length >= 3 ? centsChart(hist.map((x) => x.cents)) : h('p', { class: 'small muted' }, 'Con unas clases más, aquí verás cómo baja tu desviación (en cents). Menos es mejor.')),
    h('div', { class: 'card' }, h('h3', {}, 'Herramientas'), h('div', { class: 'tools' },
      tool('#microfono', '🎙️', '¿Me está midiendo bien?', 'Prueba de micrófono, 1 min'),
      tool('#nota-comoda', '🎵', 'Tu nota cómoda', v.comfort != null ? 'Ahora: ' + noteName(v.comfort) + '. Repítela cada tanto' : 'Dónde te acomoda cantar'),
      tool('#encuentra', '🎯', 'Encuentra la nota', 'Taller guiado, sin apuro'),
      tool('#final', '🎚️', 'Terminar la nota afinada', 'Si se te cae el final de las notas'),
      tool('#estable', '〰️', 'Voz estable', 'Si tu voz tambalea al sostener'),
      tool('#mapa', '🗺️', 'El mapa de tu voz', 'Tipo, color, rango, aire, pasaje · 8 min'),
      tool('#recursos', '🪶', 'Tus recursos vocales', 'Falsete, vibrato, deslizar…'),
      tool('#afinador', '📟', 'Afinador', 'Tu nota en vivo'))),
    installBanner(true),
    h('div', { class: 'card settings' }, h('h3', {}, 'Ajustes'),
      sw('voice', 'Voz del Chincol', 'Te lee las instrucciones'),
      sw('sfx', 'Sonidos', 'Aciertos, errores y celebraciones'),
      sw('octaveFree', 'Aceptar la misma nota en otra octava', 'Si cantas la nota una octava más grave o más aguda, cuenta igual', true),
      sw('echoCancel', 'Cancelación de eco', 'Solo si cantas sin audífonos y la música confunde al detector', false),
      h('label', { class: 'set-row' }, h('span', {}, h('b', {}, 'Sonido de las notas guía')), timbre),
      h('div', { class: 'set-row col' }, h('span', {}, h('b', {}, 'Latencia (ms)'), h('small', {}, 'Para medir si entras a tiempo. Con Bluetooth el retraso es mayor: mejor audífonos con cable.')), h('div', { class: 'row' }, lat, calibBtn), calibMsg),
      reset),
    h('p', { class: 'small muted', html: '<b>Basado en:</b> Pfordresher & Brown 2007; Hutchins & Peretz 2012; Berglin, Pfordresher & Demorest 2022; aprendizaje motor (Schmidt; Maas 2008); Titze 2006 (SOVT). Voz del Chincol: Kokoro. Detección de tono: McLeod Pitch Method. Profe con IA: Gemini (Google).' }),
  ].filter(Boolean)));
}

async function session({ title, color, exercises, id, lesson, level = 2, next, intro, introVoice, adaptNote, back, backLabel }) {
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
      h('button', { class: 'iconbtn', onclick: () => nav(back || '#hoy'), 'aria-label': 'Salir' }, icon('close')),
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
  let worst = null; const toReview = []; let classScore = null;
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
      if (res.info && id === 'clase' && typeof res.score === 'number') classScore = res.score;
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
  if (toReview.length && !mySig.aborted && !['bienvenida', 'clase'].includes(id)) {
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
  const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : classScore ?? 1;
  const avgC = metrics.cents.length ? metrics.cents.reduce((a, b) => a + b, 0) / metrics.cents.length : null;
  const hadStreak = load().lastDay === today();
  record({ type: id, pitch: score, cents: avgC, timing: metrics.timing.length ? metrics.timing.reduce((a, b) => a + b, 0) / metrics.timing.length : null, issues: issueKeys });
  let stars = null;
  const cm = /^canc-(\w+)-(\d)$/.exec(id || ''); if (cm && score >= 0.7) setSongStars(cm[1], Number(cm[2]));
  // Si el nivel 1 te salió excelente, no te hago repetir la lección: te salto el nivel 2.
  const skipped = false; const moreLevels = false;
  if (id === 'bienvenida') { const s0 = load(); s0.onboarded = Date.now(); save(); }
  const passed = id === 'clase' || id === 'bienvenida' ? true : score >= 0.5;
  const xp = passed ? Math.round(10 + score * 15) : 5;
  addXp(xp);
  track('session', { lesson: !!lesson, passed, stars, warmup: exercises.some((e) => e.noScore) || id === 'warmup', });
  if (id === 'mapa' || exercises.some((e) => e.type === 'voicemap')) track('map');
  renderHeader();
  if (passed && score >= 0.5) { sfx('done'); confetti(); }
  const s = load();
  const after = analyze();
  const fresh = after.n > before.n ? newFindings(before.findings, after.findings).slice(0, 2) : [];
  stage.replaceChildren(h('div', { class: 'ex done-screen' },
    h('div', { class: 'center' }, chincol(passed ? 'celebra' : 'piensa', 120)),
    h('h1', { class: 'center' }, id === 'clase' ? '¡Clase terminada!' : id === 'bienvenida' ? '¡Ya te conozco!' : passed ? '¡Sesión terminada!' : 'Casi… todavía no'),
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
      : passed && next ? h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); nav('#leccion-' + next.id); } }, 'Siguiente lección') : h('button', { class: 'btn primary', onclick: () => nav(back || '#hoy') }, back ? (backLabel || 'Volver a cantar la canción') : 'Continuar'))));
  if (passed && !hadStreak) setTimeout(() => sfx('streak'), 900);
}

// Hoja de resultado del ejercicio (estilo Duolingo, con el diagnóstico del profe)

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
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => nav('#profe') }, 'Volver'))));
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

function accountCard() {
  const a = account();
  return h('button', { class: 'card rec acct-card', onclick: () => nav('#cuenta') }, h('div', { class: 'card-ic' }, a ? '☁️' : '👤'),
    h('div', {}, h('b', {}, a ? 'Tu cuenta' : 'Crea tu cuenta'), h('div', { class: 'small muted' }, a ? a.email + (syncInfo.status === 'error' ? ' · sin conexión' : ' · avance guardado') : 'Guarda tu avance y úsalo en el celular y el computador.')), icon('chevron'));
}

function accountView() {
  const a = account();
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#voz') }, icon('back')), h('span', {}));
  if (a) {
    const st = h('p', { class: 'small' });
    const paint = () => { st.textContent = syncInfo.status === 'saving' ? 'Guardando…' : syncInfo.status === 'error' ? '⚠️ ' + syncInfo.error : syncInfo.at ? 'Avance guardado en tu cuenta ✓ (' + new Date(syncInfo.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ')' : 'Conectado.'; };
    paint(); const off = onSync(paint);
    const syncBtn = h('button', { class: 'btn primary', onclick: async () => { syncBtn.disabled = true; const ch = await pull(); if (!ch) await push(true); syncBtn.disabled = false; if (ch) toast('☁️', 'Avance actualizado', 'Traje lo que practicaste en otro dispositivo.'); } }, 'Sincronizar ahora');
    view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Tu cuenta'),
      say(`Estás conectado como <b>${a.email}</b>. Tu avance se guarda solo cada vez que practicas. Ingresa con el mismo correo en tu computador o en otro celular y seguirás donde quedaste.`, 'feliz'),
      h('div', { class: 'card' }, st, syncBtn),
      h('p', { class: 'small muted' }, 'Se guardan tus lecciones, XP, racha, logros y todas las mediciones de tu voz. Las canciones (archivos de audio) quedan en cada dispositivo porque pesan mucho.'),
      h('button', { class: 'btn ghost', onclick: () => { off(); signOut(); nav('#voz'); } }, 'Cerrar sesión en este dispositivo')));
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
          h('button', { class: 'btn primary big', onclick: async () => { await chooseSide('server', r.server); toast('☁️', 'Listo', 'Usando el avance de tu cuenta.'); nav('#hoy'); } }, `El de mi cuenta (${r.server.data.xp || 0} XP)`),
          h('button', { class: 'btn big', onclick: async () => { await chooseSide('local'); toast('☁️', 'Listo', 'Guardé el avance de este dispositivo en tu cuenta.'); nav('#hoy'); } }, `El de este dispositivo (${load().xp || 0} XP)`)));
        return;
      }
      toast('☁️', action === 'register' ? '¡Cuenta creada!' : '¡Hola de nuevo!', r.adopted ? 'Traje tu avance guardado.' : 'Tu avance ya queda guardado en tu cuenta.');
      nav('#hoy');
    } catch (e) { msg.textContent = '⚠️ ' + e.message; btn.disabled = false; }
  };
  const reg = h('button', { class: 'btn primary big' }, 'Crear cuenta'); reg.onclick = () => go('register', reg);
  const log = h('button', { class: 'btn big' }, 'Ya tengo cuenta: ingresar'); log.onclick = () => go('login', log);
  view.replaceChildren(h('div', { class: 'page' }, back, h('h1', {}, 'Tu cuenta'),
    say('Con una cuenta, tu avance y las mediciones de tu voz te siguen a cualquier dispositivo: el celular, el computador, donde sea.', 'feliz'),
    h('div', { class: 'card acct-form' }, h('label', {}, 'Correo'), email, h('label', {}, 'Contraseña'), pass, msg, reg, log),
    h('p', { class: 'small muted' }, 'Tu contraseña se guarda cifrada (no se puede leer). Las canciones quedan en cada dispositivo.')));
}

function chatView() {
  const back = h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => { stopReading(); nav('#hoy'); } }, icon('back')), h('b', {}, 'Tu profe'), h('span', {}));
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

// ---------- Instalar como app ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (/hoy|voz|^#?$/.test(location.hash)) route(); });
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function installBanner(force = false) {
  if (standalone()) return null;
  if (!force && localStorage.getItem('syng.hideInstall')) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const close = force ? null : h('button', { class: 'btn ghost small', onclick: (e) => { localStorage.setItem('syng.hideInstall', 1); e.target.closest('.card').remove(); } }, 'Ahora no');
  const body = deferredPrompt
    ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; route(); } }, 'Instalar'), close)
    : h('div', {}, h('p', { class: 'small' }, ios ? 'En Safari: botón Compartir (cuadro con flecha) → "Agregar a inicio".' : 'En Chrome: menú ⋮ → "Instalar app".'), close);
  return h('div', { class: 'card install' }, h('b', {}, '📲 Instala Syng'), h('p', { class: 'small muted' }, 'Queda como app, a pantalla completa y funciona sin internet.'), body);
}
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

document.addEventListener('pointerdown', () => getCtx(), { once: true });
// Syng 2 (6-nov-2026): app rehecha. Una sola vez se borra todo el avance (también el de la cuenta) para partir de cero.
const RESET_TAG = 'syng2-2026-11-06';
if (localStorage.getItem('syng.resetTag') !== RESET_TAG) {
  localStorage.setItem('syng.resetTag', RESET_TAG);
  localStorage.removeItem('syng.chat'); localStorage.removeItem('syng.myvoice');
  await resetAll();
  setTimeout(() => toast('🌱', 'Syng nuevo', 'Partimos de cero: primero conozcamos tu voz.'), 900);
}
// Con cuenta: primero traigo tu avance (si en otro dispositivo es más nuevo), antes de que nada se guarde aquí.
if (account()) await Promise.race([pull(), sleep(3500)]);
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && account() && !FOCUS.test(location.hash.slice(1)) && (await pull())) route(); });
checkLevel(); // fija tu nivel actual sin celebrar
route();
