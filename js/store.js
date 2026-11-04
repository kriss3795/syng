// Persistencia: progreso y ajustes en localStorage; canciones (archivos de audio) en IndexedDB.

const KEY = 'syng.v1';
const DEFAULT = {
  settings: { timbre: 'voz', echoCancel: false, latencyMs: 0, songTol: 70, octaveFree: true },
  range: null, // {low, high, comfort}
  lessons: {}, // id -> {stars, best, done}
  xp: 0,
  streak: 0,
  lastDay: null,
  history: [], // {day, type, pitch, cents, timing}
  dailyGoal: 50,
  todayXp: 0,
};

let state = null;
export function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? { ...structuredClone(DEFAULT), ...JSON.parse(raw) } : structuredClone(DEFAULT);
    state.settings = { ...DEFAULT.settings, ...(state.settings || {}) };
  } catch (e) {
    state = structuredClone(DEFAULT);
  }
  return state;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
export const settings = () => load().settings;
export function setSetting(k, v) { load().settings[k] = v; save(); }

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function addXp(n) {
  const s = load();
  const t = today();
  if (s.lastDay !== t) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yk = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
    s.streak = s.lastDay === yk ? s.streak + 1 : 1;
    s.lastDay = t;
    s.todayXp = 0;
  }
  s.xp += n; s.todayXp += n;
  save();
}

export function record(entry) {
  const s = load();
  s.history.push({ day: today(), ...entry });
  if (s.history.length > 600) s.history = s.history.slice(-600);
  save();
}

export function getRange() {
  return load().range || { low: 48, high: 65, comfort: 53, guessed: true };
}
export function setRange(r) { load().range = r; save(); }

export function lessonState(id) { return load().lessons[id] || null; }
// Niveles por lección (como las coronas de Duolingo): 1 = con ayuda, 2 = sin ayuda (abre la siguiente), 3 = maestría (opcional).
export const LEVELS_TO_PASS = 2;
export function lessonLevel(id) { const st = load().lessons[id]; return !st ? 0 : st.level ?? (st.done ? LEVELS_TO_PASS : 0); }
export function setLesson(id, score, level = LEVELS_TO_PASS) {
  const s = load();
  const stars = score >= 0.95 ? 3 : score >= 0.85 ? 2 : score >= 0.7 ? 1 : 0;
  const prev = s.lessons[id] || { stars: 0, best: 0, done: false };
  const prevLevel = prev.level ?? (prev.done ? LEVELS_TO_PASS : 0);
  const newLevel = stars > 0 ? Math.max(prevLevel, level) : prevLevel;
  s.lessons[id] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best, score), level: newLevel, done: prev.done || newLevel >= LEVELS_TO_PASS };
  save();
  return stars;
}
export function resetAll() { state = structuredClone(DEFAULT); save(); }

// ---------- IndexedDB para canciones ----------
const DBN = 'syng-songs';
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('songs', mode);
    const st = t.objectStore('songs');
    const out = fn(st);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
export const putSong = (song) => tx('readwrite', (st) => st.put(song));
export const deleteSong = (id) => tx('readwrite', (st) => st.delete(id));
export async function getSong(id) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction('songs').objectStore('songs').get(id);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function listSongs() {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction('songs').objectStore('songs').getAll();
    r.onsuccess = () => res((r.result || []).map(({ mix, inst, voc, ...meta }) => meta).sort((a, b) => b.created - a.created));
    r.onerror = () => rej(r.error);
  });
}
