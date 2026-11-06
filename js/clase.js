// LA CLASE CON TU PROFE: el corazón de Syng.
// Como una clase particular de canto: (1) ¿cómo llega tu voz hoy?  (2) calentamiento corto
// (3) foco técnico del día en una escalera de peldaños que se adapta EN VIVO (sale → sube; cuesta → baja)
// (4) un toque de otra habilidad  (5) aplicarlo cantando una canción  (6) cierre con tarea para mañana.
// El profe elige el foco según tu progreso: primero afinar (lo que más te frena), y cuando avanzas
// se suman aire, energía, agudos y ritmo, rotando para que no repitas siempre lo mismo.
import { h, sleep } from './ui.js';
import { getCtx } from './audio.js';
import { load, save, voiceProfile, today } from './store.js';
import { say } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { run } from './exercises.js';
import { P, glide, seq, sustain, ear, breath, rhythm, warmup, randomMelody } from './curriculum.js';
import { getMyVoice } from './myvoice.js';
import { SONGS, songExercises, songStars, setSongStars, LEVEL_TXT } from './cancionero.js';
import { profeBox, listenRow, plain } from './sheet.js';
import { analyze } from './adapt.js';
import { track } from './fun.js';

const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- Las habilidades y sus escaleras ----------
export const SKILLS = {
  afinacion: { name: 'Afinar', icon: '🎯', why: 'Encontrar y sostener la nota: la base de todo.', steps: [
    { name: 'Encontrar la nota, con ayuda paso a paso', make: () => ({ type: 'findnote', n: 3 }) },
    { name: 'Igualar notas pegadas a tu nota cómoda', make: (v) => ({ type: 'match', home: shuffle([0, 1, -1]), tol: 120, hold: 1, voiceRef: v, text: 'Escucha la nota y cántala con "uuu". Están <b>muy cerca de tu nota cómoda</b>: no hay que ir lejos.' }) },
    { name: 'Igualar notas un poco más lejos', make: (v) => ({ type: 'match', home: shuffle([0, 2, -2, 3]), tol: 90, hold: 1, voiceRef: v, text: 'Ahora las notas están un poco más lejos. Escucha y llega <b>deslizando</b> si lo necesitas.' }) },
    { name: 'Escuchar, guardar la nota y entrar directo', make: (v) => ({ type: 'match', home: shuffle([0, 4, -3, 5]), tol: 80, hold: 1.2, delay: 1, imagine: true, voiceRef: v, text: 'Escucha, <b>guarda la nota en tu cabeza</b> un segundo y entra directo a ella.' }) },
    { name: 'Dos notas seguidas', make: () => seq(P(pick([[0, 2], [2, 0], [0, 3], [3, 0], [0, -2]])), { mode: 'echo', bpm: 64, tol: 110, ttol: 320, reps: [0, 0, 0], labels: 'none', text: 'Escucha <b>dos notas</b> y repítelas. Piensa: ¿la segunda sube o baja?' }) },
    { name: 'Tres notas', make: () => seq(P(pick([[0, 2, 4], [4, 2, 0], [0, 2, 0], [0, 4, 2], [2, 0, 2]])), { mode: 'echo', bpm: 68, tol: 105, ttol: 300, reps: [0, 0, 0], labels: 'none', text: 'Ahora <b>tres notas</b>. Escucha el dibujo de la melodía y cópialo.' }) },
    { name: 'Escala de cinco notas', make: () => seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'along', bpm: 72, tol: 95, reps: [0, 0], labels: 'solf', text: 'La escala de cinco notas: <b>juntos</b> primero y después tú solo.' }) },
    { name: 'Melodía corta', make: () => seq(P(randomMelody(4)), { mode: 'echo', bpm: 76, tol: 95, ttol: 280, reps: [0, 0], labels: 'la', text: 'Una <b>melodía corta</b> nueva. Escucha y repite.' }) },
    { name: 'Melodía más larga', make: () => seq(P(randomMelody(5)), { mode: 'echo', bpm: 82, tol: 85, ttol: 260, reps: [0, 0], labels: 'la', text: 'Una <b>melodía más larga</b>. Ya estás para esto.' }) },
    { name: 'Melodía de memoria', make: () => seq(P(randomMelody(6)), { mode: 'echo', bpm: 86, tol: 80, ttol: 240, reps: [0], labels: 'la', text: 'La escuchas <b>una sola vez</b> y la cantas de memoria.' }) },
  ] },
  aire: { name: 'Aire y apoyo', icon: '🌬️', why: 'Sostener las notas parejas y llegar al final de las frases.', unlock: { afinacion: 3 }, steps: [
    { name: 'Soplo parejo de 6 segundos', make: () => breath(4, 6, 2, { text: 'Inhala bajo, como si inflaras un salvavidas en la cintura, y suelta un <b>"sss" parejo</b>. Que el sonido no cambie.' }) },
    { name: 'Una nota larga de 4 segundos', make: () => ({ type: 'sustain', home: [0], secs: 4, tol: 140, loud: true, text: 'Una nota en tu nota cómoda con <b>"maaa"</b>, 4 segundos, con la fuerza con que hablas. La línea, lo más recta posible.' }) },
    { name: 'Dos notas largas de 6 segundos', make: () => ({ type: 'sustain', home: [0, 2], secs: 6, tol: 110, loud: true, text: 'Notas de <b>6 segundos</b>: gasta el aire de a poco, como si lo dosificaras.' }) },
    { name: 'Soplo largo y nota de 8 segundos', make: () => ({ type: 'sustain', home: [2], secs: 8, tol: 100, loud: true, text: '<b>8 segundos</b> parejos. Al final no aprietes: si se acaba el aire, suelta y respira.' }) },
    { name: 'Frase ligada en un solo aire', make: () => seq(P([[0, 2], [2, 2], [4, 2], [5, 2], [7, 4]]), { mode: 'along', bpm: 60, tol: 100, reps: [0, 0], labels: 'lu', clicks: false, text: 'Una frase <b>larga y ligada</b> con "lu": todo en un aire, sin cortar entre notas.' }) },
  ] },
  energia: { name: 'Cantar con ganas', icon: '📣', why: 'Que tu voz suene firme y con energía, no tímida ni apagada.', unlock: { afinacion: 3 }, steps: [
    { name: 'Llamar a alguien en la nota', make: () => ({ type: 'energy', home: [0], syl: '¡hey!', goal: 0.9, secs: 3, cue: 'Llama a alguien en la nota: <b>"¡heeey!"</b>, como en la calle, pero sin gritar.' }) },
    { name: 'Con fuerza en dos notas', make: () => ({ type: 'energy', home: [0, 2], syl: 'ma', goal: 1.0, secs: 3 }) },
    { name: 'Brillo sin apretar', make: () => ({ type: 'energy', home: [0, 2, 4], syl: 'nyeh', goal: 1.1, secs: 3, cue: '<b>"Nyeh"</b> con sonrisa, como un niño molestando: brillo y proyección sin apretar.' }) },
    { name: 'Una frase con energía', make: () => seq(P([4, 4, 5, 7, 7, 5, 4, 2]), { mode: 'echo', bpm: 92, tol: 90, ttol: 220, labels: 'la', energy: true, text: 'Una frase <b>con ganas hasta la última nota</b>, como si la cantaras en un escenario.' }) },
    { name: 'Notas firmes más arriba', make: () => ({ type: 'energy', home: [0, 3, 5], syl: 'oh', goal: 1.25, secs: 4 }) },
  ] },
  registro: { name: 'Agudos sin apretar', icon: '🪶', why: 'Subir a las notas altas livianito, sin gritar ni apretar el cuello.', unlock: { afinacion: 5 }, steps: [
    { name: 'Sirena corta con "uuu"', make: () => seq([glide(0, 5, 2), glide(5, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 2], labels: 'none', text: 'Sirena con <b>"uuu"</b>, livianito, como un fantasma. Sube y baja sin cortar.' }) },
    { name: 'Sirena más alta con "ng"', make: () => seq([glide(0, 8, 2.5), glide(8, 0, 2.5)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 2], labels: 'none', text: 'Sirena con <b>"ng"</b> (como al final de "tengo"): arriba se aligera sola, déjala.' }) },
    { name: 'Arpegio liviano', make: () => seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'along', bpm: 80, tol: 90, reps: [0, 0], labels: 'gu', wide: true, text: 'Arpegio con <b>"gu"</b>: la nota alta pequeñita y liviana, no empujada.' }) },
    { name: 'Nota alta sostenida, suave', make: () => ({ type: 'sustain', home: [7], secs: 3, tol: 120, text: 'Una nota <b>más alta</b> con "uuu" suave, 3 segundos. Si se quiebra, déjala liviana: está bien.' }) },
    { name: 'Sirena de una octava', make: () => seq([glide(0, 12, 3), glide(12, 0, 3)], { mode: 'along', bpm: 66, tol: 150, noTiming: true, reps: [0, 0], labels: 'none', text: 'Sirena de <b>una octava</b> con "ng". Cruza el quiebre sin miedo: es parte del camino.' }) },
  ] },
  ritmo: { name: 'Ritmo', icon: '🥁', why: 'Entrar a tiempo y sentir el pulso de la canción.', unlock: { afinacion: 5 }, steps: [
    { name: 'Sentir el pulso', make: () => rhythm([1, 1, 1, 1], { bpm: 80, reps: 2, text: 'Canta <b>"ta"</b> justo con cada golpe. Siente el pulso en el cuerpo.' }) },
    { name: 'Largas y cortas', make: () => rhythm([1, 1, 2], { bpm: 80, reps: 2 }) },
    { name: 'Corcheas', make: () => rhythm([0.5, 0.5, 1, 0.5, 0.5, 1], { bpm: 80, reps: 2 }) },
    { name: 'Con silencios', make: () => rhythm([1, -1, 1, 1], { bpm: 85, reps: 2, text: 'Ahora con un <b>silencio</b>: en el silencio no cantas, pero el pulso sigue.' }) },
    { name: 'Puntillo', make: () => rhythm([1.5, 0.5, 1, 1], { bpm: 80, reps: 2, text: 'Ritmo con <b>puntillo</b>: larga-corta, "taaa-ta".' }) },
  ] },
};
export const SKILL_ORDER = ['afinacion', 'aire', 'energia', 'registro', 'ritmo'];

export function mastery() { const s = load(); s.mastery = s.mastery || {}; return s.mastery; }
export const skillLevel = (k) => (mastery()[k] ? mastery()[k].level : 0);
export const unlocked = (k) => { const u = SKILLS[k].unlock; return !u || Object.entries(u).every(([kk, lv]) => (mastery()[kk] ? mastery()[kk].best || mastery()[kk].level : 0) >= lv); };

// ¿Qué trabajamos hoy? Afinar hasta que lleguen las melodías; después rotamos y afinar vuelve día por medio.
export function planToday() {
  const log = load().classLog || []; const last = log[log.length - 1];
  const open = SKILL_ORDER.filter(unlocked);
  let main = 'afinacion';
  if (skillLevel('afinacion') >= 4 && open.length > 1) {
    const others = open.filter((k) => k !== 'afinacion' && (!last || last.main !== k));
    if (last && last.main !== 'afinacion' && skillLevel('afinacion') < SKILLS.afinacion.steps.length - 1) main = 'afinacion';
    else main = others.sort((a, b) => skillLevel(a) / SKILLS[a].steps.length - skillLevel(b) / SKILLS[b].steps.length)[0] || 'afinacion';
  }
  // el toque secundario: lo que menos has practicado últimamente
  const second = open.filter((k) => k !== main).sort((a, b) => (mastery()[a]?.at || 0) - (mastery()[b]?.at || 0))[0] || null;
  return { main, second, newSkills: open.filter((k) => !mastery()[k] && k !== 'afinacion') };
}

// "Terminar la nota afinada": lo que más le pasa a quien está empezando. Notas cortas que terminan antes de caerse,
// con el aire parejo y pensando el final "hacia arriba"; después se alargan.
export const endFix = () => [
  { type: 'info', title: 'Se te cae el final de la nota', body: '<p>Noté que <b>al final de las notas la afinación se cae</b>. Es lo más común al empezar, y casi nunca es el oído: es el <b>aire</b>. Al final de la nota el soplo se apaga y la nota baja.</p><p>Tres trucos:</p><ol><li><b>Aire parejo hasta el final</b>, como el "sss" del calentamiento.</li><li><b>Piensa el final "hacia arriba"</b>: tu tendencia es caer, esa idea la compensa.</li><li><b>Corta antes de quedarte sin aire.</b> Mejor corta y afinada que larga y caída.</li></ol>' },
  breath(3, 5, 1, { text: 'Primero el soplo: <b>"sss" parejo</b>, que el final suene igual que el comienzo.' }),
  { type: 'sustain', home: [0, 2], secs: 2.5, tol: 110, text: 'Notas <b>cortas, de 2 segundos y medio</b>, con "uuu". Corta <b>antes</b> de que se caiga, pensando el final hacia arriba.' },
  { type: 'sustain', home: [0], secs: 4, tol: 110, text: 'Ahora <b>4 segundos</b>. El último segundo es el importante: mismo aire, misma nota.' },
];
// "Voz que tambalea": casi siempre es tensión o aire irregular. Se calma con sonidos semiocluidos ("mmm", pajita),
// cantando más suave y con notas cortas y parejas (Titze 2006).
export const steadyFix = () => [
  { type: 'info', title: 'Tu voz tambalea un poco', body: '<p>Noté que <b>la nota tiembla</b> cuando la sostienes. No es falta de oído: casi siempre es <b>tensión</b> (cuello, mandíbula) o <b>aire que sale a tirones</b>. Y cuando uno se frustra, aprieta más.</p><ol><li><b>Suelta:</b> bosteza y deja caer la mandíbula.</li><li><b>"Mmm" suave</b> con la boca cerrada, como cuando algo rico te gusta: es el sonido más estable que existe.</li><li><b>Más suave, no más fuerte:</b> con menos volumen la voz se ordena.</li></ol>' },
  { type: 'sustain', home: [0], secs: 3, tol: 120, text: '<b>"Mmm"</b> suave en tu nota cómoda, 3 segundos. Busca las cosquillas en los labios. Parejo, sin apretar.' },
  { type: 'sustain', home: [0, 2], secs: 3, tol: 110, text: 'Otra vez <b>"mmm"</b> y al final abre a <b>"maaa"</b> sin cambiar nada más.' },
];
const ladderEl = (k, level) => h('div', { class: 'tutor-ladder' }, ...SKILLS[k].steps.map((st, i) => h('div', { class: 'tl-step' + (i < level ? ' done' : i === level ? ' cur' : '') }, h('span', {}, i + 1), st.name)));
const screen = (root, parts, label, mood) => new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, ...parts, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); getCtx(); res(); } }, label)))));
function saveSkill(k, level, from, n) {
  const s = load(); s.mastery = s.mastery || {}; const m = s.mastery[k] || {};
  s.mastery[k] = { level, best: Math.max(level, m.best || 0), at: Date.now(), hist: [...(m.hist || []), { at: Date.now(), from, to: level, n }].slice(-40) };
  save();
}

export async function runClase(spec, root, sig) {
  stopSpeaking();
  const plan = planToday();
  const K = plan.main; const S = SKILLS[K];
  let level = Math.min(S.steps.length - 1, Math.max(0, skillLevel(K) - (mastery()[K] && Date.now() - (mastery()[K].at || 0) > 3 * 864e5 ? 1 : 0)));
  const startLv = level;
  const logPrev = (load().classLog || []).slice(-1)[0];
  const F = analyze().findings.filter((f) => f.tone !== 'ok');
  // 1) el profe te cuenta el plan
  const intro = [];
  if (!logPrev) intro.push(`Hoy es nuestra primera clase. Vamos con <b>${S.name.toLowerCase()}</b>: ${S.why.toLowerCase()}`);
  else intro.push(`La clase pasada trabajamos <b>${SKILLS[logPrev.main].name.toLowerCase()}</b>` + (logPrev.to > logPrev.from ? ` y subiste ${logPrev.to - logPrev.from} peldaño${logPrev.to - logPrev.from > 1 ? 's' : ''}` : '') + `. Hoy: <b>${S.name.toLowerCase()}</b>. ${S.why}`);
  if (plan.newSkills.includes(K)) intro.push('🎉 <b>¡Habilidad nueva desbloqueada!</b> Llegaste lejos afinando, así que ahora sumamos esto.');
  if (F[0]) intro.push(`Lo tengo presente: <b>${F[0].title.toLowerCase()}</b>.`);
  intro.push('Si algo te sale, <b>subimos al tiro</b>; si cuesta, bajamos un paso. Y al final, a cantar una canción.');
  await screen(root, [say(intro.join(' '), 'hola'), profeBox('plan', { focoHoy: S.name, peldaño: S.steps[level].name, clasePasada: logPrev || null }), h('p', { class: 'small muted' }, `${S.icon} ${S.name} · peldaño ${level + 1} de ${S.steps.length}`), ladderEl(K, level)], 'Empezar la clase');
  if (sig.aborted) return { score: 0 };
  // 2) ¿cómo llega tu voz hoy?
  const feel = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say('Antes de empezar: <b>¿cómo está tu voz hoy?</b>', 'atento'),
    h('div', { class: 'feel-opts' },
      h('button', { class: 'btn big', onclick: () => res('bien') }, '😄 Bien, con ganas'),
      h('button', { class: 'btn big', onclick: () => res('cansada') }, '😮‍💨 Cansada o con sueño'),
      h('button', { class: 'btn big', onclick: () => res('ronca') }, '🤒 Ronca o me molesta')), h('div', { class: 'grow' }))));
  if (sig.aborted) return { score: 0 };
  let MAX = 5;
  if (feel === 'ronca') { await screen(root, [say('Gracias por decirme. Con la voz ronca o molesta <b>no conviene cantar fuerte ni agudo</b>: hoy una clase cortita y suave. Toma agua tibia y, si la ronquera dura más de dos semanas, consulta a un fonoaudiólogo.', 'piensa')], 'Clase suave'); MAX = 2; }
  else if (feel === 'cansada') { await screen(root, [say('Entonces hoy una clase <b>más corta</b>, sin exigirte: lo que suma es practicar un poco cada día.', 'feliz')], 'Vamos'); MAX = 3; }
  const myV = await getMyVoice();
  // 3) calentamiento corto
  for (const w of warmup(true).slice(0, feel === 'ronca' ? 1 : 2)) { await run({ ...w, noScore: true }, root, sig); if (sig.aborted) return { score: 0 }; }
  // 4) foco del día: la escalera, adaptándose en vivo
  const log = []; let i = 0; let earDone = false; let caeDone = false; let steadyDone = false; let stop = false;
  while (i < MAX && !sig.aborted && !stop) {
    const step = S.steps[level];
    const ex = { ...step.make(myV), _sid: 'clase', _pos: i };
    if (feel === 'ronca' && ex.loud) ex.loud = false;
    let res = null;
    try { res = await run(ex, root, sig); } catch (e) { console.error(e); res = { score: null, skipped: true }; }
    if (sig.aborted) break;
    i++;
    if (!res || res.score == null || res.skipped || res.info) continue;
    const sc = res.score; log.push({ k: K, level, name: step.name, score: sc });
    let decision, mood, txt;
    if (sc >= 0.85 && level < S.steps.length - 1) { level++; decision = 'sube'; mood = 'celebra'; txt = `¡Eso! <b>${Math.round(sc * 100)}%</b>. No hace falta repetirlo: <b>subimos un peldaño</b> → ${S.steps[level].name.toLowerCase()}.`; }
    else if (sc >= 0.85) { decision = 'cima'; mood = 'celebra'; txt = '¡Llegaste a lo más alto de esta escalera! Lo que sigue es aplicarlo en canciones.'; }
    else if (sc >= 0.55) { decision = 'repite'; mood = 'feliz'; txt = `Bien encaminado (<b>${Math.round(sc * 100)}%</b>). Una vez más en este peldaño, con algo distinto, y si sale subimos.`; }
    else if (level > 0) { level--; decision = 'baja'; mood = 'piensa'; txt = `Esto costó (<b>${Math.round(sc * 100)}%</b>), y es normal. <b>Bajamos un paso</b> para afirmar la base: ${S.steps[level].name.toLowerCase()}.`; }
    else { decision = 'apoyo'; mood = 'piensa'; txt = 'Esto está costando. Vamos con calma: te ayudo más en cada nota.'; }
    const top = (res.issues || [])[0];
    const choice = await new Promise((ok) => root.replaceChildren(h('div', { class: 'ex' },
      say(txt, mood),
      top ? h('p', { class: 'small', html: '🔎 ' + top.text + (top.tip ? '<br>👉 ' + top.tip : '') }) : null,
      listenRow(res),
      profeBox('exercise', { clase: 'Clase: ' + S.name, ejercicio: step.name, puntaje: Math.round(sc * 100) + '%', resultado: plain(res.detail), problemas: (res.issues || []).slice(0, 3).map((x) => plain(x.text)), decisionDelProfe: decision, siguiente: S.steps[level].name, taller: res.taller || undefined }),
      h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn ghost', onclick: () => ok('end') }, 'Terminar aquí'), h('button', { class: 'btn primary big', onclick: () => { sfx('select'); ok('go'); } }, 'Seguir')))));
    if (choice === 'end') stop = true;
    // Remedio al tiro, como haría un profe: si se te cae el final de las notas, lo trabajamos ahora mismo
    if ((res.issues || []).some((x) => x.key === 'inestable' || x.key === 'tiembla') && !steadyDone && !stop) { steadyDone = true; for (const ex2 of steadyFix()) { await run(ex2, root, sig); if (sig.aborted) break; } }
    if ((res.issues || []).some((x) => x.key === 'cae') && !caeDone && !stop) { caeDone = true; for (const ex2 of endFix()) { await run(ex2, root, sig); if (sig.aborted) break; } }
    if (K === 'afinacion' && (res.issues || []).some((x) => x.key === 'direccion') && !earDone) { earDone = true; await run({ ...ear('updown'), text: 'Un minijuego rápido de oído: <b>¿la segunda nota es más aguda o más grave?</b> Saberlo te dice hacia dónde mover la voz.' }, root, sig); }
  }
  saveSkill(K, level, startLv, log.length);
  // 5) un toque de otra habilidad (si la clase no se cortó)
  let second = null;
  if (!sig.aborted && !stop && plan.second && feel !== 'ronca') {
    const K2 = plan.second; const S2 = SKILLS[K2]; const lv2 = skillLevel(K2);
    await screen(root, [say(`Un toque de <b>${S2.icon} ${S2.name.toLowerCase()}</b> para no perder la mano: ${S2.steps[lv2].name.toLowerCase()}.`, 'feliz')], 'Vamos');
    let r2 = null; try { r2 = await run({ ...S2.steps[lv2].make(myV), _sid: 'clase', _pos: 50 }, root, sig); } catch (e) { console.error(e); }
    if (r2 && r2.score != null && !r2.skipped && !r2.info) { const up = r2.score >= 0.85 && lv2 < S2.steps.length - 1; saveSkill(K2, up ? lv2 + 1 : lv2, lv2, 1); second = { k: K2, score: r2.score, up }; log.push({ k: K2, level: lv2, name: S2.steps[lv2].name, score: r2.score }); }
  }
  // 6) aplicarlo cantando
  let song = null;
  if (!sig.aborted && !stop && feel !== 'ronca') {
    const sg = SONGS.find((x) => songStars(x.id) < 3) || pick(SONGS); const afin = skillLevel('afinacion'); const lv = afin < 4 ? 1 : Math.min(3, songStars(sg.id) + 1);
    await screen(root, [say(`Y ahora lo mejor: <b>cantar</b>. "${sg.title}" ${sg.emoji}, ${lv === 1 ? 'una parte, frase a frase' : 'nivel "' + LEVEL_TXT[lv].toLowerCase() + '"'}, en tu tono.`, 'celebra')], '🎤 ¡A cantar!');
    let sr = null; try { sr = await run(songExercises(sg, lv)[0], root, sig); } catch (e) { console.error(e); }
    if (sr && sr.score != null && !sr.skipped) {
      song = { title: sg.title, score: sr.score }; log.push({ k: 'cancion', level: lv, name: sg.title, score: sr.score });
      if (sr.score >= 0.7 && (lv > 1 || songExercises(sg, 1).length === 1)) setSongStars(sg.id, lv);
      await screen(root, [say(sr.score >= 0.7 ? `¡Cantaste "${sg.title}"! ${Math.round(sr.score * 100)}% de las notas afinadas. Eso ya es cantar.` : `Primer contacto con "${sg.title}": ${Math.round(sr.score * 100)}%. La próxima sale mejor.`, sr.score >= 0.7 ? 'celebra' : 'feliz'), listenRow(sr)], 'Seguir');
    }
  }
  if (sig.aborted) return { score: 0 };
  // 7) cierre con tarea
  const homework = level > startLv ? `Mañana seguimos en "${S.steps[level].name.toLowerCase()}".` : `Para mañana: 2 minutos de "${S.steps[level].name.toLowerCase()}". Sin apuro, que salga parejo.`;
  const s = load(); s.classLog = [...(s.classLog || []), { at: Date.now(), day: today(), main: K, from: startLv, to: level, feel, second: second && second.k, song: song && song.title, avg: log.length ? +(log.reduce((a, b) => a + b.score, 0) / log.length).toFixed(2) : null }].slice(-60); save();
  track('clase');
  const ups = level - startLv;
  await screen(root, [
    say((ups > 0 ? `<b>Subiste ${ups} peldaño${ups > 1 ? 's' : ''} en ${S.name.toLowerCase()}.</b> ` : ups < 0 ? '<b>Hoy afirmamos la base</b>, que es lo que más rinde a la larga. ' : '<b>Hoy consolidamos este peldaño.</b> ') + homework, ups > 0 ? 'celebra' : 'feliz'),
    ladderEl(K, level),
    profeBox('lesson', { clase: 'Clase: ' + S.name, comoLlegoLaVoz: feel, peldañoInicio: S.steps[startLv].name, peldañoFinal: S.steps[level].name, toqueSecundario: second ? SKILLS[second.k].name + ' ' + Math.round(second.score * 100) + '%' : null, cancion: song ? song.title + ' ' + Math.round(song.score * 100) + '%' : null, ejercicios: log.map((x) => ({ peldaño: x.name, puntaje: Math.round(x.score * 100) + '%' })), tarea: homework }),
  ], 'Terminar la clase');
  return { score: log.length ? log.reduce((a, b) => a + b.score, 0) / log.length : 1, info: true, detail: `${S.name}: del peldaño ${startLv + 1} al ${level + 1}.` };
}
