// El Chincol: tu profe y compañero de práctica.
// Dibuja la mascota, muestra sus mensajes y traduce tus mediciones en consejos concretos (como un profe particular).
import { h, icon } from './ui.js';
import { speak, stopSpeaking } from './voice.js';
import { LINES } from './lines.js';

// ---------- Mascota (SVG propio) ----------
// mood: 'feliz' | 'canta' | 'piensa' | 'celebra' | 'atento'
export function chincol(mood = 'feliz', size = 64) {
  const beakOpen = mood === 'canta' || mood === 'celebra';
  const eyes = mood === 'feliz' || mood === 'celebra'
    ? `<path d="M41 37 q4 -5 8 0" stroke="#231942" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : mood === 'piensa'
      ? `<circle cx="46" cy="36" r="4.2" fill="#fff"/><circle cx="47.5" cy="34.6" r="2.2" fill="#231942"/>`
      : `<circle cx="45" cy="37" r="4.4" fill="#fff"/><circle cx="46" cy="37.4" r="2.5" fill="#231942"/><circle cx="46.8" cy="36.4" r=".8" fill="#fff"/>`;
  const beak = beakOpen
    ? `<path d="M55 40 L66 37 L57 42 Z" fill="#5b4636"/><path d="M55 43 L65 46 L56 44.5 Z" fill="#5b4636"/>`
    : `<path d="M55 40 L66 42 L55 44 Z" fill="#5b4636"/>`;
  const note = mood === 'canta' || mood === 'celebra'
    ? `<g fill="#6B4EFF"><ellipse cx="72" cy="27" rx="3.6" ry="2.8"/><rect x="74.6" y="12" width="1.8" height="15" rx=".9"/><path d="M76.4 12 q6 2 5 8 q-1 -4 -5 -4z"/></g>`
    : mood === 'piensa' ? `<g fill="#B9AEE8"><circle cx="70" cy="18" r="2"/><circle cx="76" cy="12" r="3"/></g>` : '';
  const wing = mood === 'celebra'
    ? `<path d="M22 50 q-14 -14 -6 -26 q6 12 16 18z" fill="#8a6446"/>`
    : `<path d="M22 52 q6 14 22 14 q-14 -2 -18 -16z" fill="#8a6446"/>`;
  return h('span', { class: 'chincol ' + mood, style: `width:${size}px;height:${size}px`, 'aria-hidden': 'true', html:
`<svg viewBox="0 0 84 84" width="${size}" height="${size}">
  <ellipse cx="40" cy="78" rx="20" ry="3" fill="#231942" opacity=".08"/>
  <path d="M30 70 l-3 8 M40 71 l1 8" stroke="#5b4636" stroke-width="2.4" stroke-linecap="round"/>
  <ellipse cx="38" cy="52" rx="24" ry="21" fill="#a7774f"/>
  <ellipse cx="44" cy="56" rx="14" ry="13" fill="#efe6d8"/>
  ${wing}
  <path d="M14 56 l-10 8 l12 -2z" fill="#7a5638"/>
  <circle cx="46" cy="38" r="16" fill="#9aa0ab"/>
  <path d="M33 30 q12 -12 26 -2" stroke="#2f2a3a" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M34 42 q8 4 18 1" stroke="#2f2a3a" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".5"/>
  <path d="M39 25 q-1 -8 5 -12 q0 5 1 7 q2 -6 8 -7 q-3 4 -3 9z" fill="#6f7480"/>
  <path d="M31 46 q12 10 26 4 l-2 6 q-12 4 -24 -4z" fill="#c4672f"/>
  ${eyes}${beak}${note}
</svg>` });
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
