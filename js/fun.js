// Lo que hace que vuelvas: misiones del día con cofre, niveles con aves chilenas, logros, protector de racha,
// combos y celebraciones. Todo se gana cantando de verdad (nada se compra, nada te castiga).
import { h } from './ui.js';
import { load, save, today, addXp, xpHooks } from './store.js';
import { sfx, confetti } from './voice.js';

// ---------- Niveles ----------
export const LEVELS = ['Huevito', 'Pichón', 'Volantón', 'Chincol aprendiz', 'Chincol cantor', 'Diuca', 'Tenca', 'Zorzal', 'Loica', 'Chucao', 'Huet-huet', 'Fiofío', 'Picaflor', 'Cóndor'];
export const LEVEL_ICON = ['🥚', '🐣', '🐥', '🐦', '🎶', '🐦', '🎵', '🐦', '❤️', '🌿', '🌲', '🌤️', '🌺', '🏔️'];
const need = (n) => 25 * (n - 1) * n; // XP total para llegar al nivel n (1 → 0, 2 → 50, 3 → 150, 4 → 300…)
export function levelOf(xp) {
  let n = 1; while (n < 99 && xp >= need(n + 1)) n++;
  const name = LEVELS[Math.min(LEVELS.length - 1, n - 1)] + (n > LEVELS.length ? ' ' + (n - LEVELS.length + 1) : '');
  return { n, name, icon: LEVEL_ICON[Math.min(LEVEL_ICON.length - 1, n - 1)], from: need(n), to: need(n + 1), pct: (xp - need(n)) / (need(n + 1) - need(n)) };
}

// ---------- Estado ----------
const F = () => { const s = load(); s.fun = s.fun || { counts: {}, badges: {}, freezes: 0 }; return s.fun; };

// ---------- Misiones del día ----------
const QUESTS = {
  xp: { icon: '⚡', label: (n) => `Gana ${n} XP`, targets: [30, 50] },
  afinadas: { icon: '🎯', label: (n) => `Canta ${n} notas afinadas`, targets: [20, 40] },
  leccion: { icon: '📘', label: (n) => (n === 1 ? 'Completa una lección' : `Completa ${n} lecciones`), targets: [1, 2] },
  tres: { icon: '⭐', label: () => 'Logra 3 estrellas en una lección', targets: [1] },
  juego: { icon: '🐦', label: (n) => `Pasa ${n} puertas en Vuelo del Chincol`, targets: [8, 12] },
  cancion: { icon: '🎤', label: () => 'Canta una de tus canciones completa', targets: [1], needsSong: true },
  ganas: { icon: '📣', label: () => 'Supera un ejercicio de "Cantar con ganas"', targets: [1] },
  combo: { icon: '🔥', label: (n) => `Haz un combo de ${n} notas afinadas seguidas`, targets: [5, 8] },
  calentar: { icon: '🌅', label: () => 'Haz el calentamiento', targets: [1] },
};
function seedRand(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
export function dailyQuests() {
  const f = F(); const t = today();
  if (f.qDay !== t) {
    const r = seedRand(Number(t.replace(/-/g, '')));
    const pool = Object.keys(QUESTS).filter((k) => k !== 'xp' && (!QUESTS[k].needsSong || load().lastSong));
    const picks = ['xp'];
    while (picks.length < 3) { const k = pool[Math.floor(r() * pool.length)]; if (!picks.includes(k)) picks.push(k); }
    f.quests = picks.map((k) => { const T = QUESTS[k].targets; return { k, target: T[Math.floor(r() * T.length)], prog: 0 }; });
    f.qDay = t; f.chest = null; save();
  }
  return f.quests.map((q) => ({ ...q, ...QUESTS[q.k], text: QUESTS[q.k].label(q.target), done: q.prog >= q.target }));
}
function bump(k, n = 1, mode = 'add') {
  dailyQuests();
  const f = F(); let changed = false;
  for (const q of f.quests) if (q.k === k && q.prog < q.target) { q.prog = mode === 'max' ? Math.max(q.prog, n) : q.prog + n; changed = true; if (q.prog >= q.target) toast('✅', 'Misión cumplida', QUESTS[k].label(q.target), 'ok'); }
  if (changed) { save(); if (f.quests.every((q) => q.prog >= q.target) && !f.chest) { f.chest = 'ready'; save(); toast('🎁', '¡Cofre del día!', 'Cumpliste las 3 misiones: ábrelo en el inicio', 'gold'); } }
}
export function openChest() {
  const f = F(); if (f.chest !== 'ready') return null;
  const r = Math.random();
  const xp = 15 + Math.floor(Math.random() * 26);
  const freeze = r < 0.35 && (f.freezes || 0) < 2;
  f.chest = 'open'; if (freeze) f.freezes = (f.freezes || 0) + 1; save();
  addXp(xp); checkLevel();
  return { xp, freeze };
}

// ---------- Logros ----------
export const BADGES = [
  { id: 'primera', icon: '🎤', name: 'Primera nota', desc: 'Terminaste tu primera sesión' },
  { id: 'racha3', icon: '🔥', name: 'Encendido', desc: '3 días seguidos' },
  { id: 'racha7', icon: '🔥', name: 'Semana completa', desc: '7 días seguidos' },
  { id: 'racha30', icon: '🏆', name: 'Imparable', desc: '30 días seguidos' },
  { id: 'af100', icon: '🎯', name: 'Cien al centro', desc: '100 notas afinadas' },
  { id: 'af500', icon: '🎯', name: 'Oído de oro', desc: '500 notas afinadas' },
  { id: 'af2000', icon: '💎', name: 'Afinación de diamante', desc: '2.000 notas afinadas' },
  { id: 'combo10', icon: '⚡', name: 'Racha de notas', desc: 'Combo de 10 notas afinadas seguidas' },
  { id: 'tres5', icon: '⭐', name: 'Cinco estrellas triples', desc: '5 lecciones con 3 estrellas' },
  { id: 'etapa1', icon: '🌱', name: 'Fundamentos', desc: 'Completaste la etapa 1' },
  { id: 'etapa2', icon: '🌬️', name: 'Voz encendida', desc: 'Completaste la etapa 2' },
  { id: 'etapa3', icon: '🎼', name: 'Músico', desc: 'Completaste la etapa 3' },
  { id: 'etapa4', icon: '🚀', name: 'Voz completa', desc: 'Completaste la etapa 4' },
  { id: 'etapa5', icon: '👑', name: 'Intérprete', desc: 'Completaste el camino' },
  { id: 'cancion', icon: '🎧', name: 'Mi canción', desc: 'Cantaste una canción tuya completa' },
  { id: 'cancion80', icon: '🌟', name: 'Así se canta', desc: '80% o más en una canción tuya' },
  { id: 'vuelo', icon: '🐦', name: 'Vuelo perfecto', desc: '100% en un nivel de Vuelo del Chincol' },
  { id: 'mapa', icon: '🗺️', name: 'Conozco mi voz', desc: 'Hiciste el mapa de tu voz' },
  { id: 'ganas', icon: '📣', name: 'Con todo', desc: '90% en un ejercicio de Cantar con ganas' },
  { id: 'cofre', icon: '🎁', name: 'Cazatesoros', desc: 'Abriste 5 cofres del día' },
  { id: 'temprano', icon: '🌅', name: 'Madrugador', desc: 'Practicaste antes de las 8' },
  { id: 'noche', icon: '🌙', name: 'Búho cantor', desc: 'Practicaste después de las 23' },
];
function unlock(id) {
  const f = F(); if (f.badges[id]) return;
  f.badges[id] = today(); save();
  const b = BADGES.find((x) => x.id === id);
  if (b) { toast(b.icon, '¡Logro desbloqueado!', b.name + ' · ' + b.desc, 'gold'); }
}

// ---------- Eventos: se llaman desde toda la app ----------
export function track(ev, d = {}) {
  const f = F(); const c = f.counts;
  if (ev === 'note') { if (d.ok) { c.afinadas = (c.afinadas || 0) + 1; bump('afinadas'); if (c.afinadas >= 100) unlock('af100'); if (c.afinadas >= 500) unlock('af500'); if (c.afinadas >= 2000) unlock('af2000'); } save(); return; }
  if (ev === 'xp') { bump('xp', d.n || 0); return; }
  if (ev === 'combo') { bump('combo', d.n, 'max'); if (d.n >= 10) unlock('combo10'); return; }
  if (ev === 'session') {
    unlock('primera');
    const hr = new Date().getHours(); if (hr < 8) unlock('temprano'); if (hr >= 23) unlock('noche');
    if (d.warmup) bump('calentar');
    if (d.lesson && d.passed) { bump('leccion'); if (d.stars === 3) bump('tres'); }
    const triple = Object.values(load().lessons || {}).filter((l) => l.stars === 3).length; if (triple >= 5) unlock('tres5');
    const s = load(); if (s.streak >= 3) unlock('racha3'); if (s.streak >= 7) unlock('racha7'); if (s.streak >= 30) unlock('racha30');
    if (d.stages) d.stages.forEach((n) => unlock('etapa' + n));
    return;
  }
  if (ev === 'exercise' && d.type === 'energy' && d.score >= 0.7) { bump('ganas'); if (d.score >= 0.9) unlock('ganas'); return; }
  if (ev === 'song') { bump('cancion'); unlock('cancion'); if (d.score >= 0.8) unlock('cancion80'); return; }
  if (ev === 'game') { bump('juego', d.passed, 'max'); if (d.pct >= 100) unlock('vuelo'); return; }
  if (ev === 'map') { unlock('mapa'); return; }
  if (ev === 'chest') { c.cofres = (c.cofres || 0) + 1; save(); if (c.cofres >= 5) unlock('cofre'); }
}

xpHooks.push((n) => { bump('xp', n); checkLevel(); });

// ---------- Subir de nivel ----------
export function checkLevel() {
  const s = load(); const f = F();
  const L = levelOf(s.xp);
  if (f.lastLevel == null) { f.lastLevel = L.n; save(); return null; }
  if (L.n > f.lastLevel) { f.lastLevel = L.n; save(); celebrateLevel(L); return L; }
  return null;
}
function celebrateLevel(L) {
  document.querySelectorAll('.levelup').forEach((x) => x.remove()); // si subes dos niveles seguidos, se muestra solo el último
  sfx('done'); confetti();
  const ov = h('div', { class: 'levelup' }, h('div', { class: 'lu-card' },
    h('img', { src: 'img/chincol-celebra.webp', alt: '', class: 'lu-bird' }),
    h('div', { class: 'lu-n' }, `Nivel ${L.n}`), h('h2', {}, `${L.icon} ${L.name}`),
    h('p', {}, 'Subiste de nivel. Cada nota que cantas te acerca al siguiente.'),
    h('button', { class: 'btn primary big', onclick: () => ov.remove() }, '¡Vamos!')));
  document.body.append(ov);
}

// ---------- Avisos flotantes ----------
let tq = [], showing = false;
export function toast(icon, title, text, tone = '') {
  tq.push({ icon, title, text, tone }); if (!showing) nextToast();
}
function nextToast() {
  const t = tq.shift(); if (!t) { showing = false; return; }
  showing = true;
  sfx(t.tone === 'gold' ? 'streak' : 'xp');
  const el = h('div', { class: 'ftoast ' + t.tone }, h('span', { class: 'ft-ic' }, t.icon), h('div', {}, h('b', {}, t.title), h('small', {}, t.text)));
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => { el.remove(); nextToast(); }, 3000);
}

// ---------- Protector de racha ----------
// Si ayer no practicaste pero tienes un protector, la racha se mantiene (se gasta uno). Se ganan en los cofres.
export function applyFreeze() {
  const s = load(); const f = F();
  if (!s.lastDay || !s.streak) return null;
  const d = (k) => { const x = new Date(); x.setDate(x.getDate() - k); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  if (s.lastDay === d(2) && (f.freezes || 0) > 0) { f.freezes--; s.lastDay = d(1); save(); toast('🧊', 'Protector de racha usado', `Tu racha de ${s.streak} días sigue viva`, 'gold'); return true; }
  return null;
}

// ---------- La semana ----------
export function weekDots() {
  const days = new Set((load().history || []).map((x) => x.day));
  const out = []; const names = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  for (let k = 6; k >= 0; k--) { const x = new Date(); x.setDate(x.getDate() - k); const key = x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); out.push({ l: names[x.getDay()], on: days.has(key), today: k === 0 }); }
  return out;
}
export const freezes = () => F().freezes || 0;
export const badges = () => F().badges || {};
export const chestState = () => { dailyQuests(); return F().chest; };
export const counts = () => F().counts || {};
