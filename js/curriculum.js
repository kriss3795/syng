// Currículum. Principios (ver investigación en el proyecto):
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

// Melodías de dominio público
const EST_1 = P([0, 0, 7, 7, 9, 9, [7, 2]]);
const EST_2 = P([5, 5, 4, 4, 2, 2, [0, 2]]);
const ESTRELLITA = [...EST_1, ...EST_2];
const ODA = P([4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, [4, 1.5], [2, 0.5], [2, 2]]);
const MARTINILLO = P([0, 2, 4, 0, 0, 2, 4, 0, 4, 5, [7, 2], 4, 5, [7, 2]]);
const SCALE5 = P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]);

export const UNITS = [
  { id: 'u1', title: 'Tu voz, hoy', desc: 'Conoce tu voz, respira bien y canta tu primera melodía', color: 'violet', lessons: [
    { id: 'u1l1', title: 'Hola, voz', build: () => [
      { type: 'info', title: '¡Hola!', body: `<p>${LINES.hola}</p><p>${LINES.como_funciona}</p><p>🎧 ${LINES.audifonos}</p>`, voice: ['hola', 'como_funciona', 'audifonos'] },
      { type: 'range' },
      match([0, 2], { tol: 100, hold: 1 }),
      seq(EST_1, { mode: 'along', bpm: 84, tol: 100, noTiming: true, labels: 'la', reps: [0, 0], text: 'Ahora cantamos juntos el comienzo de <b>Estrellita</b> con "la". La primera vuelta conmigo, la segunda tú solo.' }),
    ] },
    { id: 'u1l2', title: 'Respira para cantar', build: () => [
      tec('tec_respira', 'Respiración baja'),
      breath(4, 6, 2),
      tec('tec_apoyo', 'El apoyo'),
      sustain([0], { secs: 4, tol: 100 }),
      seq(EST_2, { mode: 'along', bpm: 84, tol: 100, noTiming: true, labels: 'la', reps: [0, 0], text: 'Segunda parte de <b>Estrellita</b>. Usa el aire parejo que acabas de practicar.' }),
    ] },
    { id: 'u1l3', title: 'Encuentra la nota', build: () => [
      tec('tec_imaginar', 'Escucha por dentro'),
      ear('updown', { rounds: 5, ivs: [3, 4, 5, 7] }),
      match([0, 3, -2, 4], { tol: 100, hold: 1 }),
      seq([glide(-4, 0, 2), { s: 0, d: 2 }], { mode: 'echo', bpm: 70, tol: 100, noTiming: true, reps: [0, 3], labels: 'none', text: 'Truco de profe: desliza la voz hasta la nota y <b>quédate ahí</b>. Escucha cómo lo hago y repite.' }),
    ] },
  ] },
  { id: 'u2', title: 'Primeras melodías', desc: 'Escalitas, melodías cortas y tus primeras canciones', color: 'blue', lessons: [
    { id: 'u2l1', title: 'Do, re, mi', build: () => [
      tec('tec_mandibula', 'Mandíbula suelta'),
      seq(P([0, 2, 4, 2, [0, 2]]), { mode: 'echo', bpm: 80, tol: 100, ttol: 250, reps: [0, 1, 2] }),
      seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 100, ttol: 250, labels: 'la' }),
    ] },
    { id: 'u2l2', title: 'Estrellita completa', build: () => [
      seq(ESTRELLITA, { mode: 'along', bpm: 88, tol: 100, ttol: 220, labels: 'la', reps: [0, 0] }),
      seq(ESTRELLITA, { mode: 'echo', bpm: 88, tol: 80, ttol: 200, labels: 'la' }),
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
  ] },
  { id: 'u3', title: 'Sacar la voz', desc: 'Técnica práctica: aire, resonancia, ataque y volumen', color: 'orange', lessons: [
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
  ] },
  { id: 'u4', title: 'Ritmo y entradas', desc: 'Entrar a tiempo y durar lo justo', color: 'green', lessons: [
    { id: 'u4l1', title: 'Sentir el pulso', build: () => [tec('tec_ritmo', 'El tiempo importa'), rhythm([1, 1, 1, 1], { bpm: 80, reps: 2 }), rhythm([1, 1, 2], { bpm: 80, reps: 2 })] },
    { id: 'u4l2', title: 'Corcheas y silencios', build: () => [rhythm([0.5, 0.5, 1, 0.5, 0.5, 1], { bpm: 80, reps: 2 }), rhythm([1, -1, 1, 1], { bpm: 85, reps: 2, text: 'Ahora con un <b>silencio</b>: ahí no se toca, pero se sigue contando.' })] },
    { id: 'u4l3', title: 'Cantar a tiempo', build: () => [
      seq(P([0, 0, 0, 0, 4, 4, [4, 2]]), { mode: 'echo', bpm: 90, tol: 100, ttol: 150, reps: [0, 2], labels: 'ta', text: 'Canta <b>"ta"</b> justo con el clic. Ahora también mido cuándo entras.' }),
      seq([{ s: 0, d: 0.5 }, { s: 0, d: 0.5 }, { s: 2, d: 1 }, { s: null, d: 1 }, { s: 4, d: 0.5 }, { s: 4, d: 0.5 }, { s: 2, d: 1 }], { mode: 'echo', bpm: 85, tol: 100, ttol: 140, reps: [0, 1], labels: 'ta' }),
    ] },
  ] },
  { id: 'u5', title: 'Escalas y saltos', desc: 'Moverte nota a nota y saltar sin perderte', color: 'violet', lessons: [
    { id: 'u5l1', title: 'Escala de 5', build: () => [seq(SCALE5, { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2] })] },
    { id: 'u5l2', title: 'Bajando', build: () => [tec('tec_bajar', 'No te caigas'), seq(P([7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2] }), match([7, 5, 4, 2, 0], { tol: 70, hold: 1 })] },
    { id: 'u5l3', title: 'Escala completa', build: () => [seq(P([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 90, tol: 80, ttol: 200, reps: [0, 1] })] },
    { id: 'u5l4', title: 'Terceras y quintas', build: () => [tec('tec_saltos', 'Exagera el salto'), seq(P([0, 4, 0, 4, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 2] }), seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'echo', bpm: 85, tol: 70, ttol: 200, reps: [0, 1, 2] }), ear('interval', { rounds: 6, ivs: [4, 7] })] },
    { id: 'u5l5', title: 'La octava', build: () => [seq(P([[0, 2], [12, 2], [7, 1], [4, 1], [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1] }), ear('interval', { rounds: 8, ivs: [4, 7, 12] })] },
  ] },
  { id: 'u6', title: 'Afinación fina', desc: 'No solo la nota: el centro de la nota', color: 'blue', lessons: [
    { id: 'u6l1', title: 'Qué son los cents', build: () => [tec('tec_cents', 'Afinar fino', '<p class="small muted">Con práctica, el oído llega a distinguir diferencias de pocos cents (Micheyl y cols., 2006).</p>'), match([0, 2, 4, 5], { tol: 50, hold: 1.5 }), ear('detune', { rounds: 8, cents: [60, 45, 35] })] },
    { id: 'u6l2', title: 'Notas estables', build: () => [sustain([0, 4, 7], { secs: 5, tol: 50 })] },
    { id: 'u6l3', title: 'Sobre un bordón', build: () => [tec('tec_bordon', 'El bordón', '<p class="small muted">🎧 Necesita audífonos: la app lo revisa antes.</p>'), drone([0, 12, 7, 0], { tol: 50, hold: 2 })] },
    { id: 'u6l4', title: 'Oído fino', build: () => [ear('detune', { rounds: 10, cents: [30, 20, 12] }), match([0, 3, 5, 7, 2], { tol: 40, hold: 1.5 })] },
  ] },
  { id: 'u7', title: 'Agudos sin gritar', desc: 'Registros, el "quiebre" y todo tu rango', color: 'orange', lessons: [
    { id: 'u7l1', title: 'Sirenas amplias', build: () => [tec('tec_agudos', 'Más liviano al subir'), seq([glide(0, 12, 3), glide(12, 0, 3)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 0, 1, 2], labels: 'none', wide: true, text: 'Sirena de una octava con <b>"brrr"</b> o <b>"ng"</b> (como al final de "tengo").' }), seq(P([0, 7, 12, 7, [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1, 2], labels: 'gu', wide: true })] },
    { id: 'u7l2', title: 'Todo tu rango', build: () => [match([], { wide: true, count: 8, tol: 60, hold: 1.2, text: 'Notas al azar por todo tu rango. Entrenar en un rango amplio ayuda a afinar mejor.' })] },
  ] },
  { id: 'u8', title: 'Melodías de verdad', desc: 'Memoria melódica y cantar sin ayuda', color: 'green', lessons: [
    { id: 'u8l1', title: 'Oda a la alegría', build: () => [seq(ODA, { mode: 'along', bpm: 95, tol: 70, ttol: 170, labels: 'la', reps: [0, 0] }), seq(ODA, { mode: 'echo', bpm: 95, tol: 60, ttol: 170, labels: 'la' })] },
    { id: 'u8l2', title: 'Sin red', build: () => [tec('tec_sinred', 'Confía en tu oído'), seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 60, ttol: 170, labels: 'la', feedback: 'after' }), seq(ESTRELLITA, { mode: 'echo', bpm: 90, tol: 50, ttol: 160, labels: 'la', feedback: 'after' })] },
  ] },
  { id: 'u9', title: 'Agilidad', desc: 'Velocidad y control', color: 'violet', lessons: [
    { id: 'u9l1', title: 'Escala de 9', build: () => [seq([...P([0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 90, tol: 70, ttol: 140, reps: [0, 1] })] },
    { id: 'u9l2', title: 'Arpegio y menor', build: () => [seq([...P([0, 4, 7, 12, 7, 4], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 100, tol: 70, ttol: 130, reps: [0, 1] }), seq(P([0, 2, 3, 5, 7, 5, 3, 2, [0, 2]]), { mode: 'echo', bpm: 95, tol: 50, ttol: 140, reps: [0, 1] })] },
  ] },
  { id: 'u10', title: 'Maestría', desc: 'Afinado, a tiempo y sin ayuda', color: 'blue', lessons: [
    { id: 'u10l1', title: 'Precisión ±10 cents', build: () => [match([0, 2, 4, 7, 9, 12], { tol: 20, hold: 2 }), drone([7, 4, 12], { tol: 20, hold: 2 })] },
    { id: 'u10l2', title: 'Timing ±70 ms', build: () => [rhythm([0.5, 0.5, 1, -0.5, 0.5, 1], { bpm: 100, reps: 3, ttol: 70 }), seq([{ s: 0, d: 0.5 }, { s: 2, d: 0.5 }, { s: 4, d: 1 }, { s: null, d: 0.5 }, { s: 4, d: 0.5 }, { s: 7, d: 1 }, { s: 5, d: 1 }, { s: 4, d: 1 }], { mode: 'echo', bpm: 95, tol: 40, ttol: 90, reps: [0, 2] })] },
    { id: 'u10l3', title: 'Examen final', build: () => [seq(ODA, { mode: 'echo', bpm: 100, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }), seq(P(randomMelody(6)), { mode: 'echo', bpm: 95, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }), ear('detune', { rounds: 8, cents: [10] })] },
  ] },
];
UNITS.forEach((u) => u.lessons.forEach((l) => { l.intro = INTROS['i_' + l.id] || ''; l.introVoice = INTROS['i_' + l.id] ? 'i_' + l.id : null; }));

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
  return [match([], { wide: true, count: 8, tol: 50, hold: 1.2 })];
}
// Debilidad principal según el historial reciente → sesión recomendada
export function recommend(history) {
  const recent = history.slice(-15);
  const keys = {};
  recent.forEach((h) => (h.issues || []).forEach((k) => (keys[k] = (keys[k] || 0) + 1)));
  const top = Object.entries(keys).sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  const map = { bajo: 'fina', alto: 'fina', inestable: 'aire', aire: 'aire', cae: 'aire', scoop: 'fina', saltos: 'melodia', tarde: 'ritmo', temprano: 'ritmo', extra: 'ritmo', oido: 'oido', lejos: 'rango' };
  return map[top[0]] ? { kind: map[top[0]], key: top[0] } : null;
}
