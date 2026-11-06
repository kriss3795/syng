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
export const saveHooks = []; // p. ej. sincronizar con tu cuenta
export function save(touch = true) {
  if (touch && state) state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  if (touch) saveHooks.forEach((f) => { try { f(); } catch (e) {} });
}
// Reemplaza todo tu avance (al traerlo desde tu cuenta)
export function replaceState(data) { state = { ...structuredClone(DEFAULT), ...data }; save(false); }
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
  xpHooks.forEach((f) => { try { f(n); } catch (e) {} });
}
export const xpHooks = [];

export function record(entry) {
  const s = load();
  s.history.push({ day: today(), ...entry });
  if (s.history.length > 600) s.history = s.history.slice(-600);
  save();
}

export function getRange() {
  const s = load(); const v = s.voice || {};
  const r = s.range || { low: 48, high: 65, comfort: 53, guessed: true };
  if (v.comfort == null) return r;
  // tu nota cómoda medida manda: los ejercicios se centran ahí
  if (r.guessed) return { low: v.comfort - 7, high: v.comfort + 8, comfort: v.comfort, guessed: true };
  return { ...r, comfort: Math.max(r.low + 2, Math.min(r.high - 2, v.comfort)) };
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
// Empezar de cero: borra progreso, mediciones de tu voz, diagnósticos, misiones y logros.
// De tus canciones borra tus tomas, informes y el tono elegido; con songs: true borra también las canciones.
export async function resetAll({ songs = false } = {}) {
  state = structuredClone(DEFAULT); save();
  try {
    if (songs) { await new Promise((res) => { const r = indexedDB.deleteDatabase(DBN); r.onsuccess = r.onerror = r.onblocked = () => res(); }); return; }
    const d = await db();
    const all = await new Promise((res, rej) => { const r = d.transaction('songs').objectStore('songs').getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
    for (const s of all) { delete s.progress; delete s.takes; delete s.transpose; await putSong(s); }
  } catch (e) { console.warn('reset canciones', e); }
}

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
    r.onsuccess = () => res((r.result || []).map(({ mix, inst, voc, takes, ...meta }) => ({ ...meta, nTakes: (takes || []).length })).sort((a, b) => b.created - a.created));
    r.onerror = () => rej(r.error);
  });
}

// Perfil de voz: tu voz hablada (la "nota de casa") y los diagnósticos
export function voiceProfile() { return load().voice || null; }
export function setVoiceProfile(v) { load().voice = { ...(load().voice || {}), ...v }; save(); }
export function homeNote() {
  const r = getRange(); const v = voiceProfile();
  // 1º tu nota cómoda medida (prueba "Tu nota cómoda"); si no existe, un poquito sobre tu voz hablada
  const n = v && v.comfort != null ? v.comfort : v && v.speak ? Math.round(v.speak) + 1 : r.comfort;
  if (v && v.comfort != null) return r.guessed ? n : Math.max(r.low + 1, Math.min(r.high - 1, n));
  if (r.guessed) return Math.max(40, Math.min(72, n)); // aún sin medir tu rango: confiamos en tu voz hablada
  return Math.max(r.low + 1, Math.min(r.high - 2, n));
}
export function addDiagnosis(d) { const s = load(); s.diags = [...(s.diags || []), d].slice(-10); save(); }
export function diagnoses() { return load().diags || []; }
export function setIdentity(id) { const s = load(); s.identities = [...(s.identities || []), id].slice(-6); save(); }
export function identities() { return load().identities || []; }
