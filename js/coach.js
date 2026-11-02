// El Chincol: tu profe y compañero de práctica.
// Muestra la mascota, muestra sus mensajes y traduce tus mediciones en consejos concretos (como un profe particular).
import { h, icon } from './ui.js';
import { speak, stopSpeaking } from './voice.js';
import { LINES } from './lines.js';

// ---------- Mascota: dibujos del Chincol (una pose por momento) ----------
// mood: 'feliz' (confiado) | 'hola' (saluda) | 'atento' (escucha / canta) | 'canta' | 'piensa' (duda, consejo) | 'celebra' (pulgar arriba)
const POSES = { feliz: 'feliz', hola: 'hola', atento: 'atento', canta: 'atento', piensa: 'piensa', celebra: 'celebra' };
export const POSE_FILES = [...new Set(Object.values(POSES))].map(p => `img/chincol-${p}.webp`);
export function chincol(mood = 'feliz', size = 64) {
  const pose = POSES[mood] || 'feliz';
  return h('span', { class: 'chincol ' + mood, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true' },
    h('img', { src: `img/chincol-${pose}.webp`, alt: '', width: size, height: size, draggable: 'false', decoding: 'async' }));
}

// Globo de diálogo del Chincol
// opts.voice = id del guion (lines.js): el Chincol lo dice en voz alta y aparece un botón para repetirlo.
export function say(text, mood = 'feliz', opts = {}) {
  const bubble = h('div', { class: 'bubble', html: text });
  const el = h('div', { class: 'coach' + (opts.compact ? ' compact' : '') + (opts.tone ? ' ' + opts.tone : '') },
    chincol(mood, opts.compact ? 44 : 58), bubble);
  if (opts.voice) {
    const ids = [].concat(opts.voice);
    const playAll = async () => { for (const id of ids) { if (!el.isConnected) break; await speak(id); if (!el.isConnected || !document.body.contains(el)) break; } };
    bubble.append(h('button', { class: 'replay', 'aria-label': 'Escuchar al Chincol', onclick: (e) => { e.stopPropagation(); playAll(); } }, icon('speaker', 16)));
    if (opts.autoplay !== false) setTimeout(() => { if (el.isConnected) playAll(); }, 80);
  }
  return el;
}
// Texto del guion por id (para no repetir frases)
export const line = (id) => LINES[id] || '';
export { stopSpeaking };

// ---------- Diagnóstico tipo profe ----------
// targets: [{t0,t1,m0,m1,frames:[{t,cents,ok}]}] ; all: [{t, m, raw}] (todos los cuadros)
// Devuelve una lista de observaciones ordenadas por importancia: {key, text, tip, weight}
export function diagnoseSeq(targets, all, { timingErrs = [], tol = 50 } = {}) {
  const out = [];
  const notes = targets.filter((t) => t.m0 === t.m1);
  if (!notes.length) return out;
  // 1) silencio
  const silent = notes.filter((t) => t.frames.filter((f) => f.cents != null).length < Math.max(3, t.frames.length * 0.25)).length;
  if (silent / notes.length > 0.4) {
    out.push({ key: 'silencio', weight: 100, text: `No te escuché bien en ${silent} de ${notes.length} notas.`, tip: 'Canta con más volumen o acerca el celular a ~30 cm. Si estabas cantando, revisa que el micrófono esté permitido.' });
    return out;
  }
  // 2) octava
  const voiced = notes.flatMap((t) => t.frames.filter((f) => f.cents != null));
  const oct = voiced.filter((f) => Math.abs(Math.abs(f.cents) - 1200) < 150).length;
  if (voiced.length && oct / voiced.length > 0.4) {
    const below = voiced.filter((f) => f.cents < -1000).length > voiced.length * 0.2;
    out.push({ key: 'octava', weight: 90, text: `Estás cantando la melodía una octava más ${below ? 'abajo' : 'arriba'}.`, tip: 'Es la misma melodía, pero la app espera la altura de la guía. Prueba cantar en una zona más ' + (below ? 'aguda, más liviano.' : 'grave, más relajado.') });
  }
  // 3) tendencia baja/alta (solo cuadros cerca de la nota)
  const near = voiced.filter((f) => Math.abs(f.cents) < 150).map((f) => f.cents);
  if (near.length > 20) {
    const mean = near.reduce((a, b) => a + b, 0) / near.length;
    if (mean < -15) out.push({ key: 'bajo', weight: 60 + Math.min(30, -mean), text: `Tiendes a quedar <b>bajo</b>: en promedio ${Math.round(-mean)} cents por debajo.`, tip: 'Piensa cada nota "un poquito más arriba", mantén el aire constante hasta el final y levanta un poco las cejas: ayuda a no "caerse".' });
    if (mean > 15) out.push({ key: 'alto', weight: 60 + Math.min(30, mean), text: `Tiendes a quedar <b>alto</b>: en promedio ${Math.round(mean)} cents por encima.`, tip: 'Suele pasar por empujar o cantar fuerte. Canta más suave y relaja la mandíbula; deja que la nota "se pose".' });
  }
  // 4) entrar desde abajo (scoop) y final que cae
  let scoop = 0, drop = 0, wobble = [], longN = 0;
  for (const t of notes) {
    const fr = t.frames.filter((f) => f.cents != null && Math.abs(f.cents) < 200);
    const d = t.t1 - t.t0;
    if (fr.length < 8 || d < 0.35) continue;
    longN++;
    const head = fr.filter((f) => f.t < t.t0 + 0.13).map((f) => f.cents);
    const body = fr.filter((f) => f.t >= t.t0 + 0.2 && f.t <= t.t1 - d * 0.25).map((f) => f.cents);
    const tail = fr.filter((f) => f.t > t.t1 - d * 0.25).map((f) => f.cents);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    if (head.length >= 2 && body.length >= 3 && avg(body) - avg(head) > 40) scoop++;
    if (tail.length >= 3 && body.length >= 3 && avg(body) - avg(tail) > 20 && d > 0.9) drop++;
    if (body.length >= 6) { const m = avg(body); wobble.push(Math.sqrt(body.reduce((a, b) => a + (b - m) ** 2, 0) / body.length)); }
  }
  if (longN >= 2 && scoop / longN > 0.4) out.push({ key: 'scoop', weight: 55, text: 'Entras a las notas <b>desde abajo</b> y luego subes (se llama "scoop").', tip: 'Antes de cantar, imagina la nota en tu cabeza y apunta directo al centro. Empieza con una consonante suave como "n" o "m" para ubicarla.' });
  if (drop >= 2) out.push({ key: 'cae', weight: 50, text: 'Al final de las notas largas <b>se te cae la afinación</b>.', tip: 'Es falta de aire al final: inhala antes, mantén las costillas abiertas (appoggio) y piensa en "sostener" hasta el último instante.' });
  if (wobble.length >= 2) {
    const w = wobble.reduce((a, b) => a + b, 0) / wobble.length;
    if (w > 22) out.push({ key: 'inestable', weight: 45 + Math.min(20, w - 22), text: `Tu nota <b>tiembla</b> (vaivén de ±${Math.round(w)} cents).`, tip: 'Necesitas un soplo más parejo. Repite el ejercicio de siseo "sss" y luego canta la nota pensando en ese mismo aire continuo.' });
  }
  // 5) saltos que quedan cortos (compresión de intervalos, típica en principiantes)
  const jumps = [];
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1], b = notes[i];
    const iv = b.m0 - a.m0;
    if (Math.abs(iv) < 4 || b.t0 - a.t1 > 0.6) continue;
    const ma = med(a.frames), mb = med(b.frames);
    if (ma == null || mb == null) continue;
    const sung = iv + (mb - ma) / 100;
    jumps.push(Math.abs(sung) - Math.abs(iv));
  }
  if (jumps.length >= 2) {
    const j = jumps.reduce((x, y) => x + y, 0) / jumps.length;
    if (j < -0.4) out.push({ key: 'saltos', weight: 58, text: `Los <b>saltos</b> te quedan cortos (≈${Math.round(-j * 100)} cents menos de lo debido).`, tip: 'Es muy común al empezar. Exagera el salto: imagina que la nota de llegada está más lejos. Practica en "Intervalos" con la guía.' });
  }
  // 6) tiempo
  if (timingErrs.length >= 3) {
    const m = timingErrs.reduce((a, b) => a + b, 0) / timingErrs.length;
    if (m > 0.09) out.push({ key: 'tarde', weight: 40 + Math.min(20, m * 100), text: `Entras <b>tarde</b> (≈${Math.round(m * 1000)} ms).`, tip: 'Inhala un tiempo antes de cada entrada, no justo en el clic. Cuenta mentalmente "1-y-2-y" y canta en el "1".' });
    if (m < -0.09) out.push({ key: 'temprano', weight: 40 + Math.min(20, -m * 100), text: `Te <b>adelantas</b> (≈${Math.round(-m * 1000)} ms).`, tip: 'Espera el clic: escucha el pulso completo antes de entrar. Ayuda mover el pie con el metrónomo.' });
  }
  out.forEach((o) => (o.voice = 'd_' + o.key));
  return out.sort((a, b) => b.weight - a.weight);
}
function med(frames) {
  const v = frames.filter((f) => f.cents != null && Math.abs(f.cents) < 150).map((f) => f.cents).sort((a, b) => a - b);
  return v.length >= 3 ? v[Math.floor(v.length / 2)] : null;
}

// Mensaje principal según el resultado (honesto: no felicita lo que no salió)
export function verdict(score) {
  if (score >= 0.95) return { mood: 'celebra', title: '¡Impecable!', tone: 'good', voice: 'v_impecable' };
  if (score >= 0.85) return { mood: 'celebra', title: '¡Muy bien!', tone: 'good', voice: 'v_muybien' };
  if (score >= 0.7) return { mood: 'feliz', title: 'Bien, lo lograste', tone: 'good', voice: 'v_bien' };
  if (score >= 0.45) return { mood: 'piensa', title: 'Vas cerca, otra vez', tone: 'meh', voice: 'v_cerca' };
  return { mood: 'piensa', title: 'Todavía no, pero se entrena', tone: 'bad', voice: 'v_todavia' };
}

const TIPS_DAY = [
  'Toma agua durante el día: la que tomas justo antes de cantar tarda en llegar a las cuerdas vocales.',
  'Antes de cantar una nota, imagínala en tu cabeza. Los buenos cantantes "oyen" la nota antes de hacerla.',
  'Grábate de vez en cuando. Al escucharte notas cosas que mientras cantas no notas.',
  'Si raspa o duele, para. Cantar bien nunca debería doler.',
  'Mejor 15 minutos todos los días que 2 horas una vez a la semana.',
  'Mandíbula suelta y hombros abajo: la tensión desafina.',
  'Los saltos grandes suelen quedar cortos: exagéralos un poquito.',
];
export const tipOfDay = () => TIPS_DAY[new Date().getDate() % TIPS_DAY.length];
