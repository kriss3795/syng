// Tu cuenta: guarda tu avance en el servidor (Vercel + Neon) para usarlo en cualquier dispositivo.
// Se sincroniza todo lo de localStorage (lecciones, XP, racha, mediciones de tu voz, diagnósticos, recursos…).
// Las canciones (archivos de audio) se quedan en cada dispositivo: pesan demasiado para subirlas.
import { load, save, saveHooks, replaceState } from './store.js';

// Dirección del servidor. Si la app se abre desde Vercel, es el mismo sitio.
export const API_DEFAULT = 'https://syng-kriss.vercel.app';
const apiBase = () => (/\.vercel\.app$/.test(location.hostname) ? '' : localStorage.getItem('syng.api') || API_DEFAULT);
const AK = 'syng.account';
export const account = () => { try { return JSON.parse(localStorage.getItem(AK) || 'null'); } catch { return null; } };
const setAccount = (a) => (a ? localStorage.setItem(AK, JSON.stringify(a)) : localStorage.removeItem(AK));
export const syncInfo = { status: 'idle', at: null, error: null };
const listeners = new Set();
export const onSync = (f) => { listeners.add(f); return () => listeners.delete(f); };
const emit = () => listeners.forEach((f) => { try { f(syncInfo); } catch {} });

async function call(path, { method = 'GET', body } = {}) {
  const a = account();
  let r;
  try {
    r = await fetch(apiBase() + '/api/' + path, { method, headers: { 'Content-Type': 'application/json', ...(a ? { Authorization: 'Bearer ' + a.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw Object.assign(new Error('No pude conectarme al servidor. Revisa tu internet.'), { offline: true }); }
  let j = {}; try { j = await r.json(); } catch {}
  if (r.status === 401 && a) { setAccount(null); }
  if (!r.ok && r.status !== 409) throw Object.assign(new Error(j.error || 'Error del servidor (' + r.status + ')'), { status: r.status });
  return { status: r.status, ...j };
}

const hasProgress = (d) => d && ((d.xp || 0) > 0 || Object.keys(d.lessons || {}).length > 0 || (d.voiceMaps || []).length > 0);

// Ingresar o crear cuenta. Devuelve {needChoice, server} si ambos lados tienen avance distinto.
export async function signIn(action, email, password) {
  const r = await call('auth', { method: 'POST', body: { action, email, password } });
  setAccount({ token: r.token, email: r.email });
  const srv = await call('progress');
  const local = load();
  if (srv.data && hasProgress(srv.data) && hasProgress(local)) return { needChoice: true, server: srv };
  if (srv.data && hasProgress(srv.data)) { replaceState(srv.data); return { adopted: true }; }
  await push(true);
  return { pushed: true };
}
export async function chooseSide(side, server) {
  if (side === 'server') { replaceState(server.data); }
  else await push(true, true);
}
export function signOut() { setAccount(null); syncInfo.status = 'idle'; emit(); }

let timer = null, pushing = false;
export async function push(now = false, force = false) {
  if (!account()) return;
  if (!now) { clearTimeout(timer); timer = setTimeout(() => push(true), 3000); return; }
  if (pushing) { clearTimeout(timer); timer = setTimeout(() => push(true), 1500); return; }
  pushing = true; syncInfo.status = 'saving'; emit();
  try {
    const s = load();
    const r = await call('progress', { method: 'PUT', body: { data: s, updated: s.updatedAt || Date.now(), force } });
    if (r.status === 409 && r.data) { replaceState(r.data); syncInfo.status = 'pulled'; syncInfo.changed = true; }
    else syncInfo.status = 'saved';
    syncInfo.at = Date.now(); syncInfo.error = null;
  } catch (e) { syncInfo.status = 'error'; syncInfo.error = e.message; }
  pushing = false; emit();
}
// Trae tu avance si en otro dispositivo es más nuevo. Devuelve true si cambió algo.
export async function pull() {
  if (!account()) return false;
  try {
    const r = await call('progress');
    const s = load();
    if (r.data && r.updated > (s.updatedAt || 0)) { replaceState(r.data); syncInfo.status = 'pulled'; syncInfo.at = Date.now(); emit(); return true; }
    if (!r.data || r.updated < (s.updatedAt || 0)) push(true);
    syncInfo.status = 'saved'; syncInfo.at = Date.now(); emit();
  } catch (e) { syncInfo.status = 'error'; syncInfo.error = e.message; emit(); }
  return false;
}
saveHooks.push(() => push());
