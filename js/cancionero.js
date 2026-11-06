// Cancionero: canciones de verdad desde el primer día (melodías y letras de dominio público o letra propia de Syng).
// Cada canción tiene 3 niveles, como en las apps de canto modernas (Simply Sing, Yousician):
//   1) Frase a frase: escuchas una frase y la repites (eco).
//   2) Conmigo: la cantamos juntos una vez y después la cantas tú.
//   3) Tú solo: solo te doy la primera nota; la letra y las notas en pantalla, sin voz guía.
// La tonalidad se ajusta sola a tu rango (seq() centra la melodía en tu zona cómoda).
import { seq } from './curriculum.js';
import { load, save } from './store.js';

// [semitono, duración en tiempos, sílaba ('-' al final = se une con la siguiente), fin de frase]
const N = (arr) => arr.map(([s, d, l, br]) => ({ s, d, l, br: !!br }));

export const SONGS = [
  { id: 'cumple', title: 'Cumpleaños feliz', who: 'Tradicional (melodía de 1893)', bpm: 96, emoji: '🎂',
    why: 'Todos la conocen: tu oído ya sabe cómo va, así que puedes concentrarte en afinar.',
    notes: N([
      [-5, .75, 'Cum-'], [-5, .25, 'ple-'], [-3, 1, 'a-'], [-5, 1, 'ños'], [0, 1, 'fe-'], [-1, 2, 'liz,', 1],
      [-5, .75, 'cum-'], [-5, .25, 'ple-'], [-3, 1, 'a-'], [-5, 1, 'ños'], [2, 1, 'fe-'], [0, 2, 'liz,', 1],
      [-5, .75, 'te'], [-5, .25, 'de-'], [7, 1, 'se-'], [4, 1, 'a-'], [0, 1, 'mos'], [-1, 1, 'a'], [-3, 2, 'ti,', 1],
      [5, .75, 'cum-'], [5, .25, 'ple-'], [4, 1, 'a-'], [0, 1, 'ños'], [2, 1, 'fe-'], [0, 3, 'liz.', 1]]) },
  { id: 'estrellita', title: 'Estrellita', who: 'Tradicional', bpm: 84, emoji: '⭐',
    why: 'Notas largas y pasos simples: ideal para tu primera canción completa.',
    notes: N([
      [0, 1, 'Es-'], [0, 1, 'tre-'], [7, 1, 'lli-'], [7, 1, 'ta,'], [9, 1, '¿dón-'], [9, 1, 'de es-'], [7, 2, 'tás?', 1],
      [5, 1, 'Me'], [5, 1, 'pre-'], [4, 1, 'gun-'], [4, 1, 'to'], [2, 1, 'qué'], [2, 1, 'se-'], [0, 2, 'rás.', 1],
      [7, 1, 'En'], [7, 1, 'el'], [5, 1, 'cie-'], [5, 1, 'lo y'], [4, 1, 'en'], [4, 1, 'el'], [2, 2, 'mar,', 1],
      [7, 1, 'un'], [7, 1, 'dia-'], [5, 1, 'man-'], [5, 1, 'te'], [4, 1, 'de'], [4, 1, 'ver-'], [2, 2, 'dad.', 1],
      [0, 1, 'Es-'], [0, 1, 'tre-'], [7, 1, 'lli-'], [7, 1, 'ta,'], [9, 1, '¿dón-'], [9, 1, 'de es-'], [7, 2, 'tás?', 1],
      [5, 1, 'Me'], [5, 1, 'pre-'], [4, 1, 'gun-'], [4, 1, 'to'], [2, 1, 'qué'], [2, 1, 'se-'], [0, 2, 'rás.', 1]]) },
  { id: 'martinillo', title: 'Martinillo', who: 'Tradicional', bpm: 92, emoji: '🔔',
    why: 'Frases que se repiten: la primera vez escuchas, la segunda ya la tienes.',
    notes: N([
      [0, 1, 'Mar-'], [2, 1, 'ti-'], [4, 1, 'ni-'], [0, 1, 'llo,', 1], [0, 1, 'Mar-'], [2, 1, 'ti-'], [4, 1, 'ni-'], [0, 1, 'llo,', 1],
      [4, 1, '¿dón-'], [5, 1, 'de es-'], [7, 2, 'tás?', 1], [4, 1, '¿dón-'], [5, 1, 'de es-'], [7, 2, 'tás?', 1],
      [7, .5, 'To-'], [9, .5, 'ca'], [7, .5, 'la'], [5, .5, 'cam-'], [4, 1, 'pa-'], [0, 1, 'na,', 1],
      [7, .5, 'to-'], [9, .5, 'ca'], [7, .5, 'la'], [5, .5, 'cam-'], [4, 1, 'pa-'], [0, 1, 'na,', 1],
      [0, 1, 'din,'], [-5, 1, 'don,'], [0, 2, 'dan,', 1], [0, 1, 'din,'], [-5, 1, 'don,'], [0, 2, 'dan.', 1]]) },
  { id: 'oda', title: 'Oda a la alegría', who: 'Beethoven (1824) · letra de Syng', bpm: 92, emoji: '🎻',
    why: 'Una melodía famosa, casi toda por pasos vecinos: perfecta para cantar con energía.',
    notes: N([
      [4, 1, 'Can-'], [4, 1, 'ta'], [5, 1, 'fuer-'], [7, 1, 'te,'], [7, 1, 'can-'], [5, 1, 'ta'], [4, 1, 'li-'], [2, 1, 'bre,', 1],
      [0, 1, 'que'], [0, 1, 'tu'], [2, 1, 'voz'], [4, 1, 'es'], [4, 1.5, 'tu'], [2, .5, 'can-'], [2, 2, 'ción.', 1],
      [4, 1, 'Can-'], [4, 1, 'ta'], [5, 1, 'fuer-'], [7, 1, 'te,'], [7, 1, 'can-'], [5, 1, 'ta'], [4, 1, 'li-'], [2, 1, 'bre,', 1],
      [0, 1, 'que'], [0, 1, 'tu'], [2, 1, 'voz'], [4, 1, 'es'], [2, 1.5, 'tu'], [0, .5, 'can-'], [0, 2, 'ción.', 1]]) },
];

const phrasesOf = (notes) => { const out = []; let cur = []; for (const n of notes) { cur.push(n); if (n.br) { out.push(cur); cur = []; } } if (cur.length) out.push(cur); return out; };
const words = (ns) => ns.map((n) => (n.l.endsWith('-') ? n.l.slice(0, -1) : n.l + ' ')).join('').trim();

// Ejercicios para un nivel de la canción
export function songExercises(song, level) {
  const ph = phrasesOf(song.notes);
  if (level === 1) { // frase a frase, de a dos frases
    const out = [];
    for (let i = 0; i < ph.length; i += 2) {
      const pat = [...ph[i], ...(ph[i + 1] || [])];
      out.push(seq(pat, { mode: 'echo', bpm: song.bpm - 8, tol: 110, ttol: 280, reps: [0, 0], karaoke: true, noEarly: false,
        text: `<b>${song.title}</b>, frase a frase: escucha "<i>${words(pat)}</i>" y repítela.` }));
    }
    return out;
  }
  if (level === 2) return [seq(song.notes, { mode: 'along', bpm: song.bpm - 4, tol: 95, ttol: 240, reps: [0, 0], karaoke: true, text: `<b>${song.title}</b> completa: primero <b>juntos</b> (canta con la voz guía) y después <b>tú</b>.` })];
  return [seq(song.notes, { mode: 'read', bpm: song.bpm, tol: 85, ttol: 220, reps: [0, 0], karaoke: true, text: `<b>${song.title}</b> tú solo: te doy la primera nota y la cantas con la letra en pantalla. ¡Como en un escenario!` })];
}
export const songStars = (id) => ((load().cancionero || {})[id] || 0);
export function setSongStars(id, lvl) { const s = load(); s.cancionero = s.cancionero || {}; s.cancionero[id] = Math.max(s.cancionero[id] || 0, lvl); save(); }
export const LEVEL_TXT = ['', 'Frase a frase', 'Conmigo', 'Tú solo'];
