// Currículum: 16 unidades, ~90 lecciones. Principios (ver investigación en el proyecto):
// - Cantar desde la primera clase (como Simply Sing), con la técnica integrada y aplicada al tiro.
// - "Cantar mal" casi nunca es sordera: se entrena la conexión oído-voz con retroalimentación visual (Pfordresher, Berglin 2022).
// - Melodías cortas de 4 notas temprano; rango amplio después; SOVT (lip trill, bombilla); apoyo/appoggio; aprendizaje motor
//   (práctica variada y repartida, retirar la ayuda visual al final).
import { getRange } from './store.js';
import { LINES, INTROS } from './lines.js';

const P = (semis, d = 1) => semis.map((s) => (Array.isArray(s) ? { s: s[0], d: s[1] } : { s, d }));
const glide = (a, b, d = 2) => ({ s: a, g: b, d });

function fit(semis, maxRep = 0, wide = false) {
  const r = getRange();
  const lo = Math.min(...semis), hi = Math.max(...semis) + maxRep;
  let base = Math.round(r.comfort - (lo + hi) / 2);
  if (wide) base = Math.round((r.low + r.high) / 2 - (lo + hi) / 2);
  return Math.max(r.low - lo, Math.min(r.high - hi, base));
}
const semisOf = (pat) => pat.flatMap((n) => (n.s == null ? [] : n.g != null ? [n.s, n.g] : [n.s]));

function seq(pattern, o = {}) {
  const reps = o.reps || [0];
  return { type: 'seq', pattern, base: fit(semisOf(pattern), Math.max(...reps), o.wide), ...o, reps };
}
function match(semis, o = {}) {
  const r = getRange();
  let notes;
  if (o.wide) {
    const n = o.count || 6;
    notes = Array.from({ length: n }, () => r.low + 1 + Math.floor(Math.random() * Math.max(1, r.high - r.low - 1)));
  } else { const base = fit(semis); notes = semis.map((s) => base + s); }
  return { type: 'match', notes, ...o };
}
function sustain(semis, o = {}) { const base = fit(semis); return { type: 'sustain', notes: semis.map((s) => base + s), ...o }; }
function drone(intervals, o = {}) {
  const r = getRange();
  const root = Math.max(r.low, Math.round(r.comfort - 5));
  return { type: 'match', drone: root, notes: intervals.map((i) => root + i), ...o };
}
const ear = (kind, o = {}) => ({ type: 'ear', kind, base: getRange().comfort, ...o });
// info con voz: el texto en pantalla es el mismo que dice el Chincol
const tec = (id, title, extra = '') => ({ type: 'info', title, body: `<p>${LINES[id]}</p>${extra}`, voice: id });
const rhythm = (pattern, o = {}) => ({ type: 'rhythm', pattern, base: getRange().comfort, ...o });
const breath = (inh, out, reps = 2, o = {}) => ({ type: 'breath', steps: [{ label: 'Inhala bajo', secs: inh }, { label: 'Sisea "sss" parejo', secs: out, sound: true }, { label: 'Descansa', secs: 2 }], reps, ...o });

const dyn = (semis, shape, o = {}) => { const base = fit(semis); return { type: 'dynamics', notes: semis.map((x) => base + x), shape, ...o }; };
// lectura: sin demostración, solo la tónica; nombres de notas en pantalla
const read = (pattern, o = {}) => seq(pattern, { mode: 'read', labels: 'solf', ...o });
// armonía / canon: tu línea + otra voz que suena a la vez (mismo "do")
function harm(pattern, accomp, o = {}) {
  const all = [...semisOf(pattern), ...semisOf(accomp)];
  const reps = o.reps || [0];
  return { type: 'seq', pattern, accomp, base: fit(all, Math.max(...reps)), mode: 'echo', ...o, reps };
}
// etiqueta (sílaba / vocal / letra) para cada nota
const L = (pattern, labels) => { let k = 0; return pattern.map((n) => (n.s == null ? n : { ...n, l: labels[k++ % labels.length] })); };
const checkInfo = () => ({ type: 'info', title: 'Prueba de la unidad', body: `<p>${LINES.tec_repaso}</p>`, voice: 'tec_repaso' });

export function randomMelody(len = 4) {
  const pool = [0, 2, 4, 5, 7];
  const out = [pool[Math.floor(Math.random() * 3)]];
  while (out.length < len) {
    const prev = pool.indexOf(out[out.length - 1]);
    const step = [-1, 1, 1, -1, 2, -2][Math.floor(Math.random() * 6)];
    out.push(pool[Math.max(0, Math.min(pool.length - 1, prev + step))]);
  }
  return out;
}
// Melodía para leer: por grados de la escala mayor (o con saltos a do-mi-sol); empieza y termina en do
export function readMelody(len = 6, leaps = false) {
  const sc = [0, 2, 4, 5, 7, 9];
  const chord = [0, 2, 4]; // índices de do, mi, sol
  const out = [0];
  let i = 0;
  while (out.length < len - 1) {
    let j;
    if (leaps && Math.random() < 0.4) j = chord[Math.floor(Math.random() * 3)];
    else j = Math.max(0, Math.min(sc.length - 1, i + (Math.random() < 0.5 ? -1 : 1)));
    if (j === i) j = i < sc.length - 1 ? i + 1 : i - 1;
    out.push(sc[j]); i = j;
  }
  if (i > 2) out.push(4); // mi antes de cerrar si venía de arriba
  out.push(0);
  return P(out.map((x, k) => (k === out.length - 1 ? [x, 2] : x)));
}

// Melodías de dominio público
const EST_1 = P([0, 0, 7, 7, 9, 9, [7, 2]]);
const EST_2 = P([5, 5, 4, 4, 2, 2, [0, 2]]);
const ESTRELLITA = [...EST_1, ...EST_2];
const EST_LETRA = ['Es', 'tre', 'lli', 'ta', 'dón', 'des', 'tás', 'Me', 'pre', 'gun', 'to', 'qué', 'se', 'rás'];
const ODA = P([4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, [4, 1.5], [2, 0.5], [2, 2]]);
const MARTINILLO = P([0, 2, 4, 0, 0, 2, 4, 0, 4, 5, [7, 2], 4, 5, [7, 2]]);
const MART_LETRA = ['Mar', 'ti', 'ni', 'llo', 'mar', 'ti', 'ni', 'llo', 'dón', 'des', 'tás', 'dón', 'des', 'tás'];
const SCALE5 = P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]);
const MARY = P([4, 2, 0, 2, 4, 4, [4, 2], 2, 2, [2, 2], 4, 7, [7, 2], 4, 2, 0, 2, 4, 4, 4, 4, 2, 2, 4, 2, [0, 4]]);
// Canción de cuna (Brahms, 1868), en 3/4
const CUNA = P([[4, .5], [4, .5], [7, 2], [4, .5], [4, .5], [7, 2], [4, .5], [7, .5], [12, 1], [11, 1.5], [9, .5], [9, 1], [7, 1], [2, .5], [4, .5], [5, 1], [2, 1], [2, .5], [4, .5], [5, 2], [2, .5], [5, .5], [11, .5], [9, .5], [7, 1], [11, 1], [12, 3]]);
// Cumpleaños feliz (Hill, 1893; dominio público)
const CUMPLE = P([[-5, .75], [-5, .25], [-3, 1], [-5, 1], [0, 1], [-1, 2], [-5, .75], [-5, .25], [-3, 1], [-5, 1], [2, 1], [0, 2], [-5, .75], [-5, .25], [7, 1], [4, 1], [0, 1], [-1, 1], [-3, 2], [5, .75], [5, .25], [4, 1], [0, 1], [2, 1], [0, 3]]);
// Noche de paz (Gruber, 1818), primera mitad
const NOCHE = P([[7, 1.5], [9, .5], [7, 1], [4, 3], [7, 1.5], [9, .5], [7, 1], [4, 3], [14, 2], [14, 1], [11, 3], [12, 2], [12, 1], [7, 3]]);
// Sublime gracia (Amazing Grace, melodía "New Britain", 1829), en 3/4
const GRACIA = P([[-5, 1], [0, 2], [4, .5], [0, .5], [4, 2], [2, 1], [0, 2], [-3, 1], [-5, 2], [-5, 1], [0, 2], [4, .5], [0, .5], [4, 2], [2, 1], [7, 3]]);
// Greensleeves (tradicional inglesa, s. XVI), en menor: 0 = "la"
const GREEN = P([[0, 1], [3, 2], [5, 1], [7, 1.5], [8, .5], [7, 1], [5, 2], [2, 1], [-2, 1.5], [0, .5], [2, 1], [3, 2], [0, 1], [0, 1.5], [-1, .5], [0, 1], [2, 2], [-1, 1], [-5, 2]]);
const MENOR5 = P([0, 2, 3, 5, 7, 5, 3, 2, [0, 2]]);

// Camino completo (16 unidades). Orden inspirado en la secuencia clásica de la pedagogía vocal
// (cuerpo y aire → emisión → resonancia → vocales/dicción → registros → legato → agilidad → dinámica → estilo)
// y en lo que piden los exámenes de canto ABRSM y Rockschool: escalas, arpegios, intervalos, lectura a primera vista,
// pruebas de oído y coros/armonía. Cada unidad termina con una prueba de repaso.
export const UNITS = [
  { id: 'enc', title: 'Encontrar tu voz', desc: 'Qué te pasa al cantar, tu nota de casa, cantar sin timidez y conectar oído y voz', color: 'teal', lessons: [
    { id: 'enc1', title: '¿Qué me pasa al cantar?', once: true, build: () => [
      tec('tec_diag', 'Lo que dice la ciencia'),
      { type: 'diag' },
    ] },
    { id: 'enc2', title: 'Tu nota de casa', build: () => [
      tec('tec_casa', 'Tu nota de casa'),
      { type: 'speak' },
      { type: 'match', home: [0], tol: 140, hold: 1, text: 'Di <b>"hola"</b> como hablando, y alarga la "a": <b>"holaaa"</b>, en tu nota de casa. Esa nota sostenida ya es cantar.' },
      { type: 'match', home: [0, 2, -1], tol: 120, hold: 1 },
    ] },
    { id: 'encid', title: 'Tu identidad vocal', once: true, build: () => [
      tec('tec_identidad', 'Tu identidad vocal'),
      { type: 'identity' },
    ] },
    { id: 'enc3', title: 'Voz con cuerpo', build: () => [
      tec('tec_timidez', 'Sin miedo'),
      { type: 'sustain', home: [0], secs: 4, tol: 140, loud: true, text: 'Canta <b>"maaa"</b> en tu nota de casa, <b>con la misma fuerza con que hablas</b>. La rayita en la barra de aire es tu voz hablada: pásala.' },
      { type: 'sustain', home: [2], secs: 4, tol: 120, loud: true },
      { type: 'match', home: [0, 3], tol: 120, hold: 1 },
    ] },
    { id: 'enc4', title: 'Eco de tu voz', build: () => [
      tec('tec_eco', 'Tu propia voz como guía'),
      { type: 'self', rounds: 3, tol: 120 },
    ] },
    { id: 'enc5', title: 'Colocar la voz', build: () => [
      tec('tec_colocar', 'Colocar la voz'),
      { type: 'sustain', home: [0], secs: 4, tol: 140, loud: true, text: 'Un <b>"mmm"</b> con la boca cerrada y los dientes separados, buscando las cosquillas en los labios.' },
      seq(L(P([[0, 2], [0, 2], [0, 3]]), ['mm', 'mm', 'ma']), { mode: 'along', atHome: true, bpm: 70, tol: 140, noTiming: true, reps: [0, 0, 0], text: '<b>"mmm… mmm… maaa"</b> en tu nota de casa: abre a "a" sin perder las cosquillas del "mmm".' }),
      seq(L(P([0, 2, [4, 2], 2, [0, 2]]), ['ma', 'ma', 'ma', 'ma', 'ma']), { mode: 'echo', atHome: true, bpm: 70, tol: 120, noTiming: true, reps: [0, 0] }),
    ] },
    { id: 'enc6', title: 'Mover la voz', build: () => [
      tec('tec_mover', 'Subir y bajar a voluntad'),
      seq([glide(0, 4, 3), glide(4, 0, 3)], { mode: 'along', atHome: true, bpm: 66, tol: 160, noTiming: true, labels: 'none', reps: [0, 0, 0], text: 'Sigue la línea con <b>"uuu"</b>: sube despacio y baja despacio. Mira cómo tu voz dibuja el camino.' }),
      seq([glide(0, 7, 3), { s: 7, d: 1 }, glide(7, 0, 3), { s: 0, d: 1 }], { mode: 'along', atHome: true, bpm: 66, tol: 150, noTiming: true, labels: 'none', reps: [0, 0, 0] }),
      ear('updown', { rounds: 6, ivs: [2, 3, 5] }),
    ] },
    { id: 'encx', title: 'Diagnóstico otra vez', once: true, build: () => [
      { type: 'info', title: 'Veamos cuánto avanzaste', body: `<p>${LINES.tec_rediag}</p>`, voice: 'tec_rediag' },
      { type: 'diag' },
    ] },
  ] },
  { id: 'u1', title: 'Tu voz, hoy', desc: 'Conoce tu voz, respira bien y canta tu primera melodía', color: 'teal', lessons: [
    { id: 'u1l1', title: 'Hola, voz', build: () => [
      { type: 'info', title: '¡Hola!', body: `<p>${LINES.hola}</p><p>${LINES.como_funciona}</p><p>🎧 ${LINES.audifonos}</p>`, voice: ['hola', 'como_funciona', 'audifonos'] },
      { type: 'range' },
      match([0, 2], { tol: 120, hold: 1 }),
      seq(P([0, 2, 4, 2, [0, 2]]), { mode: 'along', bpm: 72, tol: 120, noTiming: true, labels: 'solf', reps: [0, 0], text: 'Ahora cantamos juntos <b>do, re, mi, re, do</b>. La primera vuelta conmigo, la segunda tú solo (antes te doy tu primera nota).' }),
    ] },
    { id: 'u1l2', title: 'Respira para cantar', build: () => [
      tec('tec_respira', 'Respiración baja'),
      breath(4, 6, 2),
      tec('tec_apoyo', 'El apoyo'),
      sustain([0], { secs: 4, tol: 120 }),
      seq(EST_2, { mode: 'along', bpm: 76, tol: 120, noTiming: true, labels: 'la', reps: [0, 0], text: 'Segunda parte de <b>Estrellita</b>. Usa el aire parejo que acabas de practicar.' }),
    ] },
    { id: 'u1l3', title: 'Encuentra la nota', build: () => [
      tec('tec_imaginar', 'Escucha por dentro'),
      ear('updown', { rounds: 5, ivs: [3, 4, 5, 7] }),
      match([0, 3, -2, 4], { tol: 100, hold: 1 }),
      seq([glide(-4, 0, 2), { s: 0, d: 2 }], { mode: 'echo', bpm: 70, tol: 100, noTiming: true, reps: [0, 3], labels: 'none', text: 'Truco de profe: desliza la voz hasta la nota y <b>quédate ahí</b>. Escucha cómo lo hago y repite.' }),
    ] },
    { id: 'u1l4', title: 'Cuerpo de cantante', build: () => [
      tec('tec_postura', 'Postura'),
      breath(4, 8, 2),
      tec('tec_mente', 'Sin vergüenza'),
      seq(EST_1, { mode: 'echo', bpm: 84, tol: 100, ttol: 250, labels: 'la', text: 'Con el cuerpo listo, repite el comienzo de <b>Estrellita</b>.' }),
    ] },
    { id: 'u1x', title: 'Prueba: tu voz', check: true, build: () => [
      checkInfo(),
      match([0, 4, 2], { tol: 80, hold: 1 }),
      sustain([0], { secs: 5, tol: 80 }),
      seq(P([4, 2, 0, 2, [4, 2]]), { mode: 'echo', bpm: 76, tol: 110, noTiming: true, labels: 'la' }),
    ] },
  ] },
  { id: 'oid', title: 'Calzar la nota', desc: 'Memoria auditiva: escuchar, guardar la nota en la cabeza y cantarla justo', color: 'violet', lessons: [
    { id: 'oid1', title: 'Nota a nota', build: () => [
      tec('tec_calzar', 'Calzar la nota'),
      match([0, 2, -1, 3, 1], { tol: 120, hold: 1 }),
      ear('same', { rounds: 6, ivs: [2, 3, 4] }),
    ] },
    { id: 'oid2', title: 'Sirenas que aterrizan', build: () => [
      seq([glide(-5, 0, 2), { s: 0, d: 2 }], { mode: 'echo', bpm: 66, tol: 120, noTiming: true, labels: 'none', reps: [0, 0], text: 'Desliza la voz <b>desde abajo</b> y aterriza en la nota. Quédate quieto ahí.' }),
      seq([glide(5, 0, 2), { s: 0, d: 2 }], { mode: 'echo', bpm: 66, tol: 120, noTiming: true, labels: 'none', reps: [0, 0], text: 'Ahora <b>desde arriba</b>: bajas y aterrizas.' }),
      match([0, 3, -2], { tol: 110, hold: 1 }),
    ] },
    { id: 'oid3', title: 'Guárdala en la cabeza', build: () => [
      tec('tec_memoria', 'Memoria de la nota'),
      match([0, 2, 4], { tol: 120, hold: 1, delay: 2, text: 'Escucha la nota, <b>guárdala en silencio dos segundos</b> y después cántala.' }),
      ear('same', { rounds: 6, ivs: [1, 2], gap: 1.5 }),
    ] },
    { id: 'oid4', title: 'Dos notas', build: () => [
      seq(P([[0, 2], [2, 2]]), { mode: 'echo', bpm: 70, tol: 120, noTiming: true, labels: 'la', reps: [0, 0] }),
      seq(P([[4, 2], [0, 2]]), { mode: 'echo', bpm: 70, tol: 120, noTiming: true, labels: 'la', reps: [0, 0] }),
      seq(P([[0, 2], [4, 2]]), { mode: 'echo', bpm: 70, tol: 120, noTiming: true, labels: 'la', reps: [0, 0] }),
    ] },
    { id: 'oid5', title: 'Tres notas', build: () => [
      seq(P([0, 2, [4, 2]]), { mode: 'echo', bpm: 72, tol: 110, noTiming: true, labels: 'la', reps: [0, 0] }),
      seq(P([4, 2, [0, 2]]), { mode: 'echo', bpm: 72, tol: 110, noTiming: true, labels: 'la', reps: [0, 0] }),
      seq(P([0, 4, [2, 2]]), { mode: 'echo', bpm: 72, tol: 110, noTiming: true, labels: 'la', reps: [0, 0] }),
    ] },
    { id: 'oid6', title: 'Recuerda y canta', build: () => [
      match([0, 4, 2], { tol: 110, hold: 1, delay: 3 }),
      seq(P(randomMelody(3)), { mode: 'echo', bpm: 72, tol: 110, noTiming: true, labels: 'la', reps: [0, 0] }),
      seq(P(randomMelody(3)), { mode: 'echo', bpm: 72, tol: 110, noTiming: true, labels: 'la', reps: [0, 0] }),
      ear('same', { rounds: 6, ivs: [1, 2], gap: 2 }),
    ] },
    { id: 'oidx', title: 'Prueba: calzar la nota', check: true, build: () => [
      checkInfo(),
      match([0, 3, 5], { tol: 100, hold: 1, delay: 2 }),
      seq(P([0, 2, 4, [2, 2]]), { mode: 'echo', bpm: 72, tol: 100, noTiming: true, labels: 'la' }),
      ear('same', { rounds: 6, ivs: [1, 2], gap: 1.5 }),
    ] },
  ] },
  { id: 'u2', title: 'Primeras melodías', desc: 'Escalitas, melodías cortas y tus primeras canciones', color: 'blue', lessons: [
    { id: 'u2l1', title: 'Do, re, mi', build: () => [
      tec('tec_mandibula', 'Mandíbula suelta'),
      seq(P([0, 2, 4, 2, [0, 2]]), { mode: 'echo', bpm: 76, tol: 110, ttol: 250, reps: [0, 0, 2] }),
      seq(P(randomMelody(4)), { mode: 'echo', bpm: 76, tol: 110, ttol: 250, labels: 'la', reps: [0, 0] }),
    ] },
    { id: 'u2l2', title: 'Estrellita completa', build: () => [
      seq(EST_1, { mode: 'echo', bpm: 80, tol: 100, ttol: 240, labels: 'la', reps: [0, 0], text: 'Primero la mitad de <b>Estrellita</b>: ojo con el salto de do a sol.' }),
      seq(ESTRELLITA, { mode: 'along', bpm: 84, tol: 100, ttol: 220, labels: 'la', reps: [0, 0] }),
      seq(ESTRELLITA, { mode: 'echo', bpm: 84, tol: 90, ttol: 200, labels: 'la' }),
    ] },
    { id: 'u2l3', title: 'Mini melodías', build: () => [
      seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 100, ttol: 250, labels: 'la' }),
      seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, labels: 'la' }),
      seq(P(randomMelody(5)), { mode: 'echo', bpm: 84, tol: 80, ttol: 220, labels: 'la' }),
    ] },
    { id: 'u2l4', title: 'Martinillo', build: () => [
      tec('tec_frases', 'Dónde respirar'),
      seq(MARTINILLO, { mode: 'along', bpm: 92, tol: 80, ttol: 200, labels: 'la', reps: [0, 0] }),
      { type: 'info', title: '¡Ya puedes cantar tus canciones!', body: `<p>${LINES.tec_cancion}</p>`, voice: 'tec_cancion' },
    ] },
    { id: 'u2l5', title: 'Mary tenía un corderito', build: () => [
      seq(MARY.slice(0, 13), { mode: 'along', bpm: 96, tol: 90, ttol: 200, labels: 'la', reps: [0, 0], text: 'Una melodía de solo tres notas (mi, re, do) y un salto a sol. Primero juntos.' }),
      seq(MARY, { mode: 'echo', bpm: 96, tol: 80, ttol: 200, labels: 'la' }),
    ] },
    { id: 'u2x', title: 'Prueba: melodías', check: true, build: () => [
      checkInfo(),
      seq(P(randomMelody(5)), { mode: 'echo', bpm: 84, tol: 80, ttol: 200, labels: 'la' }),
      seq(MARTINILLO, { mode: 'echo', bpm: 92, tol: 80, ttol: 200, labels: 'la' }),
    ] },
  ] },
  { id: 'u3', title: 'Sacar la voz', desc: 'Técnica práctica: aire, resonancia, espacio, ataque y volumen', color: 'orange', lessons: [
    { id: 'u3l1', title: 'Lip trill', build: () => [
      tec('tec_sovt', 'El "brrr" de los profes', '<p class="small muted">Si los labios no vibran, presiona suave las mejillas con los dedos. También sirve cantar "uuu" por una bombilla.</p>'),
      seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 2], labels: 'none', text: 'Sirena con <b>"brrr"</b> (labios vibrando): sube y baja conmigo.' }),
      seq(SCALE5, { mode: 'along', bpm: 84, tol: 100, reps: [0, 0, 1], labels: 'brrr', text: 'Escala de 5 notas con <b>"brrr"</b>. Luego la repetimos con "a".' }),
      seq(SCALE5, { mode: 'echo', bpm: 84, tol: 80, reps: [0], labels: 'a', text: 'Ahora la misma escala con <b>"a"</b>, buscando la misma facilidad que con el "brrr".' }),
    ] },
    { id: 'u3l2', title: 'Resonancia', build: () => [
      tec('tec_resonancia', 'Que tu voz suene más'),
      seq(SCALE5, { mode: 'echo', bpm: 84, tol: 80, reps: [0, 1], labels: 'mm' }),
      seq(P([0, 0, 2, 2, 4, 4, [2, 2]]), { mode: 'echo', bpm: 84, tol: 80, labels: 'ma', text: 'Ahora <b>"ma"</b>: mantén las cosquillas del "mmm" al abrir la boca.' }),
    ] },
    { id: 'u3l6', title: 'Espacio y bostezo', build: () => [
      tec('tec_espacio', 'El bostezo'),
      seq(SCALE5, { mode: 'echo', bpm: 84, tol: 80, reps: [0, 1, 2], labels: 'gu', text: 'Escala con <b>"gu"</b>: la "g" levanta el paladar blando. Siente el espacio al fondo de la boca.' }),
      seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'echo', bpm: 84, tol: 80, reps: [0, 2], labels: 'gua', text: 'Arpegio con <b>"gua"</b>, manteniendo el bostezo chiquito al abrir a "a".' }),
    ] },
    { id: 'u3l3', title: 'Ataque limpio', build: () => [
      tec('tec_ataque', 'Empezar la nota'),
      seq([{ s: 0, d: 1 }, { s: null, d: 1 }, { s: 4, d: 1 }, { s: null, d: 1 }, { s: 7, d: 1 }, { s: null, d: 1 }, { s: 4, d: 2 }], { mode: 'echo', bpm: 80, tol: 80, ttol: 150, labels: 'a', reps: [0, 2] }),
      sustain([0, 4], { secs: 4, tol: 80 }),
    ] },
    { id: 'u3l4', title: 'Aire parejo', build: () => [
      tec('tec_aire_parejo', 'Un hilo de aire'),
      breath(4, 10, 2),
      sustain([0, 2, 4], { secs: 6, tol: 70 }),
    ] },
    { id: 'u3l5', title: 'Volumen sin gritar', build: () => [
      tec('tec_volumen', 'Más voz, no más presión'),
      sustain([0, 5], { secs: 5, tol: 70, text: 'Nota larga con <b>más volumen</b> que antes, pero con la garganta suelta. Si raspa, baja un poco.' }),
      tec('tec_cuidado', 'Cuida tu voz'),
    ] },
    { id: 'u3x', title: 'Prueba: sacar la voz', check: true, build: () => [
      checkInfo(),
      seq(SCALE5, { mode: 'echo', bpm: 86, tol: 70, reps: [0, 2], labels: 'ma' }),
      sustain([2, 5], { secs: 6, tol: 60 }),
    ] },
  ] },
  { id: 'u4', title: 'Ritmo y entradas', desc: 'Pulso, silencios, puntillos, tresillos y síncopas', color: 'green', lessons: [
    { id: 'u4l1', title: 'Sentir el pulso', build: () => [tec('tec_ritmo', 'El tiempo importa'), rhythm([1, 1, 1, 1], { bpm: 80, reps: 2 }), rhythm([1, 1, 2], { bpm: 80, reps: 2 })] },
    { id: 'u4l2', title: 'Corcheas y silencios', build: () => [rhythm([0.5, 0.5, 1, 0.5, 0.5, 1], { bpm: 80, reps: 2 }), rhythm([1, -1, 1, 1], { bpm: 85, reps: 2, text: 'Ahora con un <b>silencio</b>: ahí no se toca, pero se sigue contando.' })] },
    { id: 'u4l3', title: 'Cantar a tiempo', build: () => [
      seq(P([0, 0, 0, 0, 4, 4, [4, 2]]), { mode: 'echo', bpm: 90, tol: 100, ttol: 150, reps: [0, 2], labels: 'ta', text: 'Canta <b>"ta"</b> justo con el clic. Ahora también mido cuándo entras.' }),
      seq([{ s: 0, d: 0.5 }, { s: 0, d: 0.5 }, { s: 2, d: 1 }, { s: null, d: 1 }, { s: 4, d: 0.5 }, { s: 4, d: 0.5 }, { s: 2, d: 1 }], { mode: 'echo', bpm: 85, tol: 100, ttol: 140, reps: [0, 1], labels: 'ta' }),
    ] },
    { id: 'u4l4', title: 'Puntillo y tresillo', build: () => [
      tec('tec_puntillo', 'Notas largas y cortas'),
      rhythm([1.5, 0.5, 1, 1], { bpm: 80, reps: 2, text: 'Ritmo con <b>puntillo</b>: larga-corta, "taaa-ta".' }),
      rhythm([1 / 3, 1 / 3, 1 / 3, 1, 1 / 3, 1 / 3, 1 / 3, 1], { bpm: 72, reps: 2, text: '<b>Tresillo</b>: tres notas iguales en un pulso, "ta-ka-ta".' }),
      seq(P([[0, 1.5], [2, .5], [4, 1], [4, 1], [5, 1.5], [4, .5], [2, 2]]), { mode: 'echo', bpm: 84, tol: 90, ttol: 150, labels: 'ta' }),
    ] },
    { id: 'u4l5', title: 'Síncopa', build: () => [
      tec('tec_sincopa', 'A contratiempo'),
      rhythm([0.5, 1, 0.5, 1, 1], { bpm: 80, reps: 2 }),
      rhythm([1, 0.5, 1, 0.5, 1], { bpm: 84, reps: 2 }),
      seq(P([[0, .5], [2, 1], [4, .5], [4, 1], [2, 1], [0, .5], [2, 1], [0, 2.5]]), { mode: 'echo', bpm: 84, tol: 90, ttol: 150, labels: 'ta' }),
    ] },
    { id: 'u4x', title: 'Prueba: ritmo', check: true, build: () => [
      checkInfo(),
      rhythm([1, 0.5, 0.5, -1, 1], { bpm: 88, reps: 2, ttol: 100 }),
      rhythm([1.5, 0.5, 0.5, 1, 0.5], { bpm: 84, reps: 2, ttol: 100 }),
      seq(P([[0, .5], [0, .5], [2, 1], [4, 1.5], [2, .5], [0, 2]]), { mode: 'echo', bpm: 88, tol: 90, ttol: 130, labels: 'ta' }),
    ] },
  ] },
  { id: 'voc', title: 'Vocales y dicción', desc: 'Vocales puras, consonantes ágiles, legato y cantar con letra', color: 'pink', lessons: [
    { id: 'voc1', title: 'Las cinco vocales', build: () => [
      tec('tec_vocales', 'Se canta en las vocales'),
      seq(L(P([0, 0, 0, 0, [0, 2]]), ['i', 'e', 'a', 'o', 'u']), { mode: 'along', bpm: 72, tol: 90, noTiming: true, reps: [0, 0, 2, 4], text: 'Una misma nota y cinco vocales: <b>i, e, a, o, u</b>. Cambia solo la boca; la nota no se mueve.' }),
      seq(L(SCALE5, ['i', 'e', 'a', 'o', 'u', 'o', 'a', 'e', 'i']), { mode: 'echo', bpm: 80, tol: 80, reps: [0, 1] }),
    ] },
    { id: 'voc2', title: 'Vocales parejas', build: () => [
      tec('tec_vocal_pura', 'Vocal pura'),
      sustain([0, 4], { secs: 6, tol: 60, text: 'Nota larga cambiando de vocal lento: <b>i… e… a… o… u</b>. La altura y el volumen no deben moverse aunque cambie la vocal.' }),
      seq(L(P([0, 2, 4, 5, [7, 2], 5, 4, 2, [0, 2]]), ['u', 'o', 'a', 'e', 'i', 'e', 'a', 'o', 'u']), { mode: 'echo', bpm: 80, tol: 70 }),
    ] },
    { id: 'voc3', title: 'Consonantes ágiles', build: () => [
      tec('tec_consonantes', 'Consonantes rápidas'),
      seq(L(P([0, 0, 2, 2, 4, 4, 2, 2, [0, 2]], 0.5), ['ta', 'ka', 'ta', 'ka', 'ta', 'ka', 'ta', 'ka', 'ta']), { mode: 'echo', bpm: 84, tol: 90, ttol: 140, reps: [0, 2] }),
      seq(L(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]], 0.5), ['pa', 'ta', 'ka', 'pa', 'ta', 'ka', 'pa', 'ta', 'ka']), { mode: 'echo', bpm: 88, tol: 90, ttol: 140 }),
    ] },
    { id: 'voc4', title: 'Legato', build: () => [
      tec('tec_legato', 'Unir las notas'),
      seq(SCALE5, { mode: 'echo', bpm: 70, tol: 70, labels: 'lu', clicks: false, reps: [0, 2], text: 'Escala <b>lenta y ligada</b> con "lu": que no se corte el sonido entre nota y nota.' }),
      seq(P([0, 4, 7, 9, [7, 2], 4, 2, [0, 3]]), { mode: 'echo', bpm: 72, tol: 70, labels: 'lu', clicks: false }),
    ] },
    { id: 'voc5', title: 'Cantar con letra', build: () => [
      tec('tec_letra', 'Melodía primero'),
      seq(L(ESTRELLITA, EST_LETRA), { mode: 'along', bpm: 88, tol: 80, ttol: 200, reps: [0, 0], text: 'Ahora <b>Estrellita con letra</b>. Si una palabra te desafina, piénsala con "la".' }),
      seq(L(MARTINILLO, MART_LETRA), { mode: 'echo', bpm: 92, tol: 80, ttol: 200 }),
    ] },
    { id: 'vocx', title: 'Prueba: dicción', check: true, build: () => [
      checkInfo(),
      seq(L(P([0, 2, 4, 2, [0, 2]]), ['i', 'e', 'a', 'o', 'u']), { mode: 'echo', bpm: 80, tol: 70 }),
      seq(L(MARTINILLO, MART_LETRA), { mode: 'echo', bpm: 96, tol: 70, ttol: 170, feedback: 'after' }),
    ] },
  ] },
  { id: 'u5', title: 'Escalas y saltos', desc: 'Moverte nota a nota y saltar sin perderte', color: 'violet', lessons: [
    { id: 'u5l1', title: 'Escala de 5', build: () => [seq(SCALE5, { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2] })] },
    { id: 'u5l2', title: 'Bajando', build: () => [tec('tec_bajar', 'No te caigas'), seq(P([7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2] }), match([7, 5, 4, 2, 0], { tol: 70, hold: 1 })] },
    { id: 'u5l3', title: 'Escala completa', build: () => [seq(P([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 90, tol: 80, ttol: 200, reps: [0, 1] })] },
    { id: 'u5l4', title: 'Terceras y quintas', build: () => [tec('tec_saltos', 'Exagera el salto'), seq(P([0, 4, 0, 4, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 2] }), seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'echo', bpm: 85, tol: 70, ttol: 200, reps: [0, 1, 2] }), ear('interval', { rounds: 6, ivs: [4, 7] })] },
    { id: 'u5l6', title: 'Cuartas y sextas', build: () => [
      seq(P([0, 5, 0, 5, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 2], text: 'La <b>cuarta</b>: el salto de la marcha nupcial ("aquí viene la novia").' }),
      seq(P([0, 9, 7, 4, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 1] }),
      ear('interval', { rounds: 8, ivs: [4, 5, 7, 9] }),
    ] },
    { id: 'u5l5', title: 'La octava', build: () => [seq(P([[0, 2], [12, 2], [7, 1], [4, 1], [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1] }), ear('interval', { rounds: 8, ivs: [4, 7, 12] })] },
    { id: 'u5x', title: 'Prueba: escalas', check: true, build: () => [
      checkInfo(),
      seq(P([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 92, tol: 70, ttol: 180 }),
      seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'echo', bpm: 85, tol: 70, ttol: 180, labels: 'a' }),
      ear('interval', { rounds: 8, ivs: [3, 4, 5, 7, 12] }),
    ] },
  ] },
  { id: 'u6', title: 'Afinación fina', desc: 'No solo la nota: el centro de la nota', color: 'blue', lessons: [
    { id: 'u6l1', title: 'Qué son los cents', build: () => [tec('tec_cents', 'Afinar fino', '<p class="small muted">Con práctica, el oído llega a distinguir diferencias de pocos cents (Micheyl y cols., 2006).</p>'), match([0, 2, 4, 5], { tol: 50, hold: 1.5 }), ear('detune', { rounds: 8, cents: [60, 45, 35] })] },
    { id: 'u6l2', title: 'Notas estables', build: () => [sustain([0, 4, 7], { secs: 5, tol: 50 })] },
    { id: 'u6l3', title: 'Sobre un bordón', build: () => [tec('tec_bordon', 'El bordón', '<p class="small muted">🎧 Necesita audífonos: la app lo revisa antes.</p>'), drone([0, 12, 7, 0], { tol: 50, hold: 2 })] },
    { id: 'u6l4', title: 'Oído fino', build: () => [ear('detune', { rounds: 10, cents: [30, 20, 12] }), match([0, 3, 5, 7, 2], { tol: 40, hold: 1.5 })] },
    { id: 'u6l5', title: 'Afinar bajando', build: () => [
      tec('tec_bajar', 'No te caigas'),
      drone([7, 5, 4, 2, 0], { tol: 45, hold: 1.5, text: 'Sobre el bordón, baja nota a nota: <b>sol, fa, mi, re, do</b>. Piensa cada nota un poquito más arriba.' }),
      sustain([7, 0], { secs: 5, tol: 45 }),
    ] },
    { id: 'u6x', title: 'Prueba: afinación', check: true, build: () => [
      checkInfo(),
      match([0, 4, 7, 5, 2], { tol: 35, hold: 1.5 }),
      ear('detune', { rounds: 8, cents: [25, 15] }),
    ] },
  ] },
  { id: 'din', title: 'Dinámica y expresión', desc: 'Suave, fuerte y la messa di voce, sin que la nota se mueva', color: 'orange', lessons: [
    { id: 'din1', title: 'Piano y forte', build: () => [
      tec('tec_dinamica', 'Suave y fuerte'),
      dyn([0, 4], 'cresc', { secs: 5, tol: 70 }),
      dyn([2], 'decresc', { secs: 5, tol: 70 }),
    ] },
    { id: 'din2', title: 'Crecer sin subir', build: () => [
      dyn([0, 5, 7], 'cresc', { secs: 6, tol: 50, text: 'Crescendo en tres notas. El error típico es <b>subir de tono al crecer</b>: más aire, no más presión.' }),
      dyn([7, 4], 'decresc', { secs: 6, tol: 50, text: 'Ahora decrescendo: apaga la voz <b>sin que la nota se caiga</b>.' }),
    ] },
    { id: 'din3', title: 'Messa di voce', build: () => [
      tec('tec_messa', 'Messa di voce'),
      dyn([0, 4, 7], 'swell', { secs: 8, tol: 60 }),
    ] },
    { id: 'din4', title: 'Frase con intención', build: () => [
      tec('tec_frase_musical', 'Hacia dónde va la frase'),
      seq(CUNA.slice(0, 12), { mode: 'along', bpm: 84, tol: 80, ttol: 220, labels: 'lu', reps: [0, 0], text: 'Comienzo de la <b>Canción de cuna</b> de Brahms. Crece hacia la nota más alta y apaga al final.' }),
      dyn([4], 'swell', { secs: 10, tol: 60, text: 'Una messa di voce larga, de diez segundos. Dosifica el aire.' }),
    ] },
    { id: 'dinx', title: 'Prueba: dinámica', check: true, build: () => [
      checkInfo(),
      dyn([0, 7], 'swell', { secs: 8, tol: 45 }),
    ] },
  ] },
  { id: 'u7', title: 'Registros y agudos', desc: 'Pecho, cabeza, el "quiebre" y todo tu rango', color: 'rust', lessons: [
    { id: 'u7l1', title: 'Sirenas amplias', build: () => [tec('tec_agudos', 'Más liviano al subir'), seq([glide(0, 12, 3), glide(12, 0, 3)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 1, 2], labels: 'none', wide: true, text: 'Sirena de una octava con <b>"brrr"</b> o <b>"ng"</b> (como al final de "tengo").' }), seq(P([0, 7, 12, 7, [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1, 2], labels: 'gu', wide: true })] },
    { id: 'u7l3', title: 'El quiebre', build: () => [
      tec('tec_registros', 'Tus registros'),
      seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, labels: 'none', wide: true, reps: [0, 0, 2, 4, 5], text: 'Sirenas cortas con <b>"ng"</b>, subiendo de a poco hacia tu zona de cambio. Liviano, sin empujar.' }),
      seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'echo', bpm: 84, tol: 80, labels: 'u', wide: true, reps: [0, 2, 4] }),
    ] },
    { id: 'u7l4', title: 'Voz de cabeza', build: () => [
      tec('tec_cabeza', 'Voz de cabeza'),
      seq([glide(12, 0, 3), { s: 0, d: 1 }], { mode: 'along', bpm: 70, tol: 150, noTiming: true, labels: 'none', wide: true, reps: [0, 0, 2], text: 'Sirena <b>de arriba hacia abajo</b> con "uu", como un búho: lleva lo liviano hasta abajo.' }),
      seq(P([12, 7, 4, [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, labels: 'u', wide: true, reps: [0, 1, 2] }),
    ] },
    { id: 'u7l5', title: 'Mezclar', build: () => [
      tec('tec_mezcla', 'La voz mixta'),
      seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'echo', bpm: 86, tol: 80, labels: 'nei', wide: true, reps: [0, 1, 2] }),
      seq(P([0, 2, 4, 5, 7, 9, 11, 12, 7, 4, [0, 2]], 0.5), { mode: 'echo', bpm: 90, tol: 80, labels: 'ng-a', wide: true, reps: [0, 2] }),
    ] },
    { id: 'u7l2', title: 'Todo tu rango', build: () => [match([], { wide: true, count: 8, tol: 60, hold: 1.2, text: 'Notas al azar por todo tu rango. Entrenar en un rango amplio ayuda a afinar mejor.' })] },
    { id: 'u7x', title: 'Prueba: registros', check: true, build: () => [
      checkInfo(),
      seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'echo', bpm: 86, tol: 70, labels: 'a', wide: true, reps: [0, 2] }),
      match([], { wide: true, count: 6, tol: 50, hold: 1.2 }),
    ] },
  ] },
  { id: 'u8', title: 'Melodías de verdad', desc: 'Canciones completas y memoria melódica', color: 'green', lessons: [
    { id: 'u8l1', title: 'Oda a la alegría', build: () => [seq(ODA, { mode: 'along', bpm: 95, tol: 70, ttol: 170, labels: 'la', reps: [0, 0] }), seq(ODA, { mode: 'echo', bpm: 95, tol: 60, ttol: 170, labels: 'la' })] },
    { id: 'u8l3', title: 'Canción de cuna', build: () => [seq(CUNA, { mode: 'along', bpm: 92, tol: 70, ttol: 180, labels: 'lu', reps: [0, 0] }), seq(CUNA, { mode: 'echo', bpm: 92, tol: 60, ttol: 180, labels: 'lu' })] },
    { id: 'u8l4', title: 'Cumpleaños feliz', build: () => [
      tec('tec_saltos', 'Exagera el salto'),
      seq(CUMPLE, { mode: 'along', bpm: 100, tol: 70, ttol: 170, labels: 'la', reps: [0, 0], text: 'El salto grande está en la tercera frase (una octava). Prepáralo.' }),
      seq(CUMPLE, { mode: 'echo', bpm: 100, tol: 60, ttol: 170, labels: 'la' }),
    ] },
    { id: 'u8l5', title: 'Noche de paz', build: () => [seq(NOCHE, { mode: 'along', bpm: 96, tol: 70, ttol: 180, labels: 'lu', reps: [0, 0] }), seq(NOCHE, { mode: 'echo', bpm: 96, tol: 60, ttol: 180, labels: 'lu' })] },
    { id: 'u8l6', title: 'Sublime gracia', build: () => [seq(GRACIA, { mode: 'along', bpm: 84, tol: 70, ttol: 180, labels: 'la', reps: [0, 0] }), seq(GRACIA, { mode: 'echo', bpm: 84, tol: 60, ttol: 180, labels: 'la' })] },
    { id: 'u8l2', title: 'Sin red', build: () => [tec('tec_sinred', 'Confía en tu oído'), seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 60, ttol: 170, labels: 'la', feedback: 'after' }), seq(ESTRELLITA, { mode: 'echo', bpm: 90, tol: 50, ttol: 160, labels: 'la', feedback: 'after' })] },
    { id: 'u8x', title: 'Prueba: canciones', check: true, build: () => [
      checkInfo(),
      seq(ODA, { mode: 'echo', bpm: 96, tol: 55, ttol: 160, labels: 'la', feedback: 'after' }),
      seq(NOCHE, { mode: 'echo', bpm: 96, tol: 55, ttol: 170, labels: 'lu', feedback: 'after' }),
    ] },
  ] },
  { id: 'lec', title: 'Leer y cantar', desc: 'Cantar a primera vista: solo te doy el do', color: 'teal', lessons: [
    { id: 'lec1', title: 'Do, mi, sol', build: () => [
      tec('tec_leer', 'Leer cantando'),
      read(P([0, 4, 7, 4, [0, 2]]), { bpm: 76, tol: 90, ttol: 250, reps: [0, 2] }),
      read(P([0, 2, 4, 2, [0, 2]]), { bpm: 76, tol: 90, ttol: 250 }),
    ] },
    { id: 'lec2', title: 'Por grados', build: () => [
      read(readMelody(5), { bpm: 76, tol: 90, ttol: 250 }),
      read(readMelody(6), { bpm: 76, tol: 80, ttol: 240 }),
      read(readMelody(6), { bpm: 80, tol: 80, ttol: 220 }),
    ] },
    { id: 'lec3', title: 'Con saltos', build: () => [
      read(readMelody(6, true), { bpm: 76, tol: 80, ttol: 240 }),
      read(readMelody(7, true), { bpm: 76, tol: 80, ttol: 240 }),
      ear('interval', { rounds: 6, ivs: [2, 4, 5, 7] }),
    ] },
    { id: 'lec4', title: 'Leer sin red', build: () => [
      read(readMelody(6, true), { bpm: 80, tol: 70, ttol: 220, feedback: 'after' }),
      read(readMelody(8, true), { bpm: 80, tol: 70, ttol: 220, feedback: 'after' }),
    ] },
    { id: 'lecx', title: 'Prueba: lectura', check: true, build: () => [
      checkInfo(),
      read(readMelody(7, true), { bpm: 80, tol: 70, ttol: 200 }),
      read(readMelody(8, true), { bpm: 84, tol: 70, ttol: 200, feedback: 'after' }),
    ] },
  ] },
  { id: 'u9', title: 'Agilidad', desc: 'Velocidad y control', color: 'violet', lessons: [
    { id: 'u9l3', title: 'Rossini', build: () => [
      tec('tec_agilidad', 'Ligero y preciso'),
      seq([...P([0, 2, 4, 5, 7, 5, 4, 2], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 92, tol: 80, ttol: 150, labels: 'la', reps: [0, 1, 2] }),
    ] },
    { id: 'u9l1', title: 'Escala de 9', build: () => [seq([...P([0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 90, tol: 70, ttol: 140, reps: [0, 1] })] },
    { id: 'u9l4', title: 'Tresillos', build: () => [seq([...P([0, 2, 4, 2, 4, 5, 4, 5, 7, 5, 4, 2], 1 / 3), { s: 0, d: 2 }], { mode: 'echo', bpm: 76, tol: 80, ttol: 140, labels: 'la', reps: [0, 1, 2] })] },
    { id: 'u9l2', title: 'Arpegio y menor', build: () => [seq([...P([0, 4, 7, 12, 7, 4], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 100, tol: 70, ttol: 130, reps: [0, 1] }), seq(P([0, 2, 3, 5, 7, 5, 3, 2, [0, 2]]), { mode: 'echo', bpm: 95, tol: 50, ttol: 140, reps: [0, 1] })] },
    { id: 'u9l5', title: 'Saltos rápidos', build: () => [seq([...P([0, 4, 7, 4, 0, 4, 7, 12, 7, 4], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 96, tol: 80, ttol: 140, labels: 'a', reps: [0, 1, 2] })] },
    { id: 'u9x', title: 'Prueba: agilidad', check: true, build: () => [
      checkInfo(),
      seq([...P([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 100, tol: 70, ttol: 130, labels: 'la' }),
      seq([...P([0, 4, 7, 12, 7, 4], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 104, tol: 70, ttol: 130, labels: 'a' }),
    ] },
  ] },
  { id: 'arm', title: 'Dos voces', desc: 'Armonía, canon y coros: mantener tu línea', color: 'pink', lessons: [
    { id: 'arm1', title: 'Mantén tu nota', build: () => [
      tec('tec_armonia', 'Cantar a dos voces'),
      harm(P([[0, 4], [0, 4]]), P([[4, 1], [5, 1], [7, 1], [5, 1], [4, 1], [2, 1], [4, 2]]), { bpm: 76, tol: 80, noTiming: true, labels: 'u', accompInDemo: true, text: 'Tú sostienes el <b>do</b> mientras yo me muevo arriba. No me sigas.' }),
      harm(P([[4, 4], [4, 4]]), P([[0, 1], [2, 1], [-1, 1], [0, 1], [-3, 1], [-1, 1], [0, 2]]), { bpm: 76, tol: 80, noTiming: true, labels: 'u', accompInDemo: true, text: 'Ahora tú sostienes el <b>mi</b> y yo me muevo abajo.' }),
    ] },
    { id: 'arm2', title: 'Terceras paralelas', build: () => [
      harm(P([0, 2, 4, 2, [0, 2]]), P([4, 5, 7, 5, [4, 2]]), { bpm: 76, tol: 80, ttol: 220, labels: 'solf', text: 'Tú cantas <b>do re mi re do</b>; yo canto lo mismo una tercera más arriba.' }),
      harm(P([4, 5, 7, 5, [4, 2]]), P([0, 2, 4, 2, [0, 2]]), { bpm: 76, tol: 80, ttol: 220, labels: 'solf', text: 'Ahora al revés: tú arriba, yo abajo.' }),
    ] },
    { id: 'arm3', title: 'Canon: Martinillo', build: () => [
      tec('tec_canon', 'El canon'),
      harm(L(MARTINILLO, MART_LETRA), MARTINILLO, { bpm: 92, tol: 80, ttol: 200, accompDelay: 8, text: 'Canta <b>Martinillo</b>. Cuando llegues a "dónde estás", entro yo desde el principio. Sigue tu camino.' }),
    ] },
    { id: 'arm4', title: 'Coros', build: () => [
      harm(P([[0, 2], [4, 2], [5, 2], [4, 2], [2, 2], [0, 2], [-1, 2], [0, 2]]), ESTRELLITA, { bpm: 88, tol: 80, ttol: 220, labels: 'uh', accompInDemo: false, text: 'Haz el <b>coro</b> de Estrellita: notas largas con "uh" mientras yo canto la melodía.' }),
    ] },
    { id: 'armx', title: 'Prueba: dos voces', check: true, build: () => [
      checkInfo(),
      harm(P([4, 5, 7, 5, [4, 2]]), P([0, 2, 4, 2, [0, 2]]), { bpm: 80, tol: 70, ttol: 200, labels: 'solf' }),
      harm(L(MARTINILLO, MART_LETRA), MARTINILLO, { bpm: 96, tol: 70, ttol: 180, accompDelay: 8 }),
    ] },
  ] },
  { id: 'men', title: 'Menor y cromático', desc: 'Otros colores: escala menor, Greensleeves y semitonos', color: 'rust', lessons: [
    { id: 'men1', title: 'Escala menor', build: () => [
      tec('tec_menor', 'El color menor'),
      seq(MENOR5, { mode: 'echo', bpm: 84, tol: 70, ttol: 200, labels: 'la', reps: [0, 2] }),
      ear('mode', { rounds: 6 }),
    ] },
    { id: 'men2', title: 'Greensleeves', build: () => [seq(GREEN, { mode: 'along', bpm: 92, tol: 70, ttol: 180, labels: 'la', reps: [0, 0] }), seq(GREEN, { mode: 'echo', bpm: 92, tol: 60, ttol: 180, labels: 'la' })] },
    { id: 'men3', title: 'Mayor o menor', build: () => [
      ear('mode', { rounds: 8 }),
      seq(P([0, 4, 7, 4, [0, 2], 0, 3, 7, 3, [0, 2]]), { mode: 'echo', bpm: 84, tol: 60, ttol: 200, labels: 'la', text: 'Arpegio <b>mayor</b> y después <b>menor</b>: solo cambia la nota del medio, medio tono.' }),
    ] },
    { id: 'men4', title: 'Semitonos', build: () => [
      tec('tec_cromatico', 'Pasos pequeños'),
      seq(P([0, 1, 2, 1, [0, 2]]), { mode: 'echo', bpm: 76, tol: 40, ttol: 220, labels: 'la', reps: [0, 2] }),
      match([0, 1, 2, 3, 2], { tol: 40, hold: 1.2 }),
    ] },
    { id: 'menx', title: 'Prueba: colores', check: true, build: () => [
      checkInfo(),
      seq(GREEN, { mode: 'echo', bpm: 96, tol: 55, ttol: 170, labels: 'la', feedback: 'after' }),
      ear('mode', { rounds: 8 }),
    ] },
  ] },
  { id: 'est', title: 'Estilo y resistencia', desc: 'Vibrato natural, frases largas y voz que dura', color: 'green', lessons: [
    { id: 'est1', title: 'Vibrato libre', build: () => [
      tec('tec_vibrato', 'El vibrato'),
      sustain([0, 4, 7], { secs: 7, tol: 60, vibrato: true, text: 'Notas largas con la voz bien suelta y apoyada. Si aparece el vibrato, déjalo; te muestro su velocidad y amplitud.' }),
    ] },
    { id: 'est2', title: 'Frases largas', build: () => [
      tec('tec_frases', 'Dónde respirar'),
      breath(4, 16, 2),
      seq(NOCHE, { mode: 'echo', bpm: 84, tol: 60, ttol: 180, labels: 'lu', clicks: false, text: '<b>Noche de paz</b> más lenta y ligada: dos frases por respiración.' }),
    ] },
    { id: 'est3', title: 'Resistencia', build: () => [
      tec('tec_resistencia', 'Voz que dura'),
      seq(SCALE5, { mode: 'echo', bpm: 92, tol: 70, labels: 'ma', reps: [0, 1, 2, 3, 4] }),
      seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'echo', bpm: 90, tol: 70, labels: 'a', wide: true, reps: [0, 1, 2, 3] }),
      tec('tec_cuidado', 'Cuida tu voz'),
    ] },
    { id: 'estx', title: 'Prueba: estilo', check: true, build: () => [
      checkInfo(),
      sustain([2, 5], { secs: 8, tol: 50, vibrato: true }),
      seq(GRACIA, { mode: 'echo', bpm: 84, tol: 50, ttol: 170, labels: 'la', feedback: 'after' }),
    ] },
  ] },
  { id: 'u10', title: 'Maestría', desc: 'Afinado, a tiempo y sin ayuda', color: 'blue', lessons: [
    { id: 'u10l1', title: 'Precisión ±10 cents', build: () => [match([0, 2, 4, 7, 9, 12], { tol: 20, hold: 2 }), drone([7, 4, 12], { tol: 20, hold: 2 })] },
    { id: 'u10l2', title: 'Timing ±70 ms', build: () => [rhythm([0.5, 0.5, 1, -0.5, 0.5, 1], { bpm: 100, reps: 3, ttol: 70 }), seq([{ s: 0, d: 0.5 }, { s: 2, d: 0.5 }, { s: 4, d: 1 }, { s: null, d: 0.5 }, { s: 4, d: 0.5 }, { s: 7, d: 1 }, { s: 5, d: 1 }, { s: 4, d: 1 }], { mode: 'echo', bpm: 95, tol: 40, ttol: 90, reps: [0, 2] })] },
    { id: 'u10l4', title: 'Lectura maestra', build: () => [read(readMelody(8, true), { bpm: 88, tol: 40, ttol: 120, feedback: 'after' }), dyn([4], 'swell', { secs: 10, tol: 35 })] },
    { id: 'u10l3', title: 'Examen final', build: () => [seq(ODA, { mode: 'echo', bpm: 100, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }), seq(P(randomMelody(6)), { mode: 'echo', bpm: 95, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }), ear('detune', { rounds: 8, cents: [10] })] },
  ] },
];
UNITS.forEach((u) => u.lessons.forEach((l) => {
  const key = INTROS['i_' + l.id] ? 'i_' + l.id : l.check ? 'i_repaso' : null;
  l.intro = key ? INTROS[key] : ''; l.introVoice = key;
}));

export const ALL_LESSONS = UNITS.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })));

// Calentamiento (≈6 min): aire → lip trill → sirena → escala → arpegio
export function warmup(short = false) {
  const w = [
    breath(4, 8, short ? 1 : 2, { text: 'Calentamos. Primero el aire: inhala bajo y suelta un "sss" parejo.' }),
    seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 2], labels: 'none', text: 'Lip trill <b>"brrr"</b> siguiendo la sirena.' }),
    seq(SCALE5, { mode: 'along', bpm: 90, tol: 80, reps: short ? [0, 0] : [0, 0, 1, 2], labels: 'mm', text: 'Escala con <b>"mmm"</b>, sintiendo las cosquillas en los labios.' }),
  ];
  if (!short) w.push(seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'along', bpm: 85, tol: 80, reps: [0, 0, 1], labels: 'a', wide: true }));
  return w;
}
export function extraSession(kind) {
  if (kind === 'oido') return [ear('updown', { rounds: 5 }), ear('interval', { rounds: 6, ivs: [3, 4, 5, 7, 12] }), ear('detune', { rounds: 8, cents: [40, 25, 15] })];
  if (kind === 'ritmo') return [rhythm([1, 0.5, 0.5, 1, 1], { bpm: 85, reps: 2 }), rhythm([0.5, 0.5, -0.5, 0.5, 1, 1], { bpm: 90, reps: 2 }), seq([{ s: 0, d: 0.5 }, { s: 0, d: 0.5 }, { s: 2, d: 1 }, { s: null, d: 1 }, { s: 4, d: 1 }, { s: 2, d: 1 }], { mode: 'echo', bpm: 90, tol: 80, ttol: 120, labels: 'ta' })];
  if (kind === 'fina') return [match([0, 4, 7, 2], { tol: 30, hold: 2 }), sustain([0, 5], { secs: 5, tol: 40 }), drone([0, 7, 4, 12], { tol: 30, hold: 2 }), ear('detune', { rounds: 8, cents: [25, 15, 10] })];
  if (kind === 'melodia') return [seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 60, labels: 'la' }), seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 60, labels: 'la' }), seq(P(randomMelody(6)), { mode: 'echo', bpm: 85, tol: 60, labels: 'la', feedback: 'after' })];
  if (kind === 'aire') return [breath(4, 12, 2), sustain([0, 2, 4, 5], { secs: 6, tol: 60 })];
  if (kind === 'lectura') return [read(readMelody(6), { bpm: 76, tol: 80 }), read(readMelody(7, true), { bpm: 80, tol: 70 }), read(readMelody(8, true), { bpm: 80, tol: 70, feedback: 'after' })];
  if (kind === 'dinamica') return [dyn([0, 4], 'cresc', { secs: 6, tol: 60 }), dyn([2, 7], 'swell', { secs: 8, tol: 60 })];
  if (kind === 'canciones') { const pool = [ESTRELLITA, MARTINILLO, ODA, CUNA, NOCHE, GRACIA, MARY]; const pick = pool.sort(() => Math.random() - 0.5).slice(0, 2); return pick.map((m) => seq(m, { mode: 'echo', bpm: 90, tol: 60, ttol: 180, labels: 'la' })); }
  return [match([], { wide: true, count: 8, tol: 50, hold: 1.2 })];
}
// Debilidad principal según el historial reciente → sesión recomendada
export function recommend(history) {
  const recent = history.slice(-15);
  const keys = {};
  recent.forEach((h) => (h.issues || []).forEach((k) => (keys[k] = (keys[k] || 0) + 1)));
  const top = Object.entries(keys).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const map = { sube_fuerte: 'dinamica', dinamica: 'dinamica', bajo: 'fina', alto: 'fina', inestable: 'aire', aire: 'aire', cae: 'aire', scoop: 'fina', saltos: 'melodia', tarde: 'ritmo', temprano: 'ritmo', extra: 'ritmo', oido: 'oido', lejos: 'rango' };
  return map[top[0]] ? { kind: map[top[0]], key: top[0] } : null;
}

// ---------- Niveles de cada lección (repetir para afirmar, como Duolingo) ----------
// 1 · Con ayuda: zona más ancha, más lento, sin cambios de tono y con una vuelta extra de práctica.
// 2 · Sin ayuda: la lección tal cual (al pasarla se abre la siguiente).
// 3 · Maestría (opcional): zona más estrecha y sin ver tu voz mientras cantas.
export const LEVEL_NAMES = { 1: 'Con ayuda', 2: 'Sin ayuda', 3: 'Maestría' };
export function applyLevel(exs, level, keepInfo = false) {
  const out = [];
  for (const ex of exs) {
    if (ex.type === 'info' && level >= 2 && !keepInfo && ex.voice !== 'tec_repaso') continue; // la teoría ya la viste en el nivel 1
    if (level === 2) { out.push(ex); continue; }
    const e = { ...ex };
    if (level === 1) {
      if (e.tol) e.tol = Math.min(160, Math.round(e.tol * 1.3));
      if (e.ttol) e.ttol = Math.round(e.ttol * 1.4);
      if (e.bpm) e.bpm = Math.round(e.bpm * 0.88);
      if (e.hold) e.hold = Math.max(0.7, +(e.hold * 0.85).toFixed(2));
      if (e.secs && e.type !== 'breath') e.secs = Math.max(3, e.secs - 1);
      if (e.feedback === 'after') e.feedback = 'live';
      if (e.type === 'seq' && e.reps) {
        const r0 = e.reps[0];
        e.reps = e.reps.map(() => r0); // mismo tono en todas las rondas
        if (e.mode === 'echo' && e.reps.length < 2) e.reps = [r0, r0]; // una vuelta extra para memorizar
        if (e.mode === 'read' && e.reps.length < 2) e.reps = [r0, r0];
      }
      if (e.type === 'match' && e.delay) e.delay = Math.max(1, e.delay - 1);
      if (e.type === 'ear' && e.cents) e.cents = e.cents.map((c) => Math.round(c * 1.4));
    } else if (level === 3) {
      if (e.tol) e.tol = Math.max(30, Math.round(e.tol * 0.8));
      if (e.ttol) e.ttol = Math.max(80, Math.round(e.ttol * 0.85));
      if (e.type === 'seq' && e.mode !== 'along') e.feedback = 'after';
      if (e.type === 'match' && e.hold) e.hold = +(e.hold * 1.3).toFixed(2);
    }
    out.push(e);
  }
  return out;
}
