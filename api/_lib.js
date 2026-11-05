// Utilidades del servidor de cuentas (Vercel + Neon). Archivos que empiezan con "_" no son rutas.
import crypto from 'node:crypto';

let sqlFn = null;
export async function db() {
  if (sqlFn) return sqlFn;
  const url = process.env.DATABASE_URL || process.env.STORAGE_URL || process.env.POSTGRES_URL;
  if (!url) throw Object.assign(new Error('Falta DATABASE_URL (conecta Neon al proyecto en Vercel)'), { status: 500 });
  const { neon } = await import('@neondatabase/serverless');
  sqlFn = neon(url);
  await sqlFn`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created BIGINT NOT NULL)`;
  await sqlFn`CREATE TABLE IF NOT EXISTS progress (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data JSONB NOT NULL, updated BIGINT NOT NULL)`;
  return sqlFn;
}
export function setDb(fn) { sqlFn = fn; } // para pruebas

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw Object.assign(new Error('Falta AUTH_SECRET (mínimo 16 caracteres) en Vercel'), { status: 500 });
  return s;
};
const b64u = (b) => Buffer.from(b).toString('base64url');

export function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPass(pw, stored) {
  const [v, s, h] = String(stored).split('$'); if (v !== 's1') return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(s, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}
// Token: id.vencimiento.firma (HMAC-SHA256). Dura 180 días.
export function makeToken(uid) {
  const exp = Date.now() + 180 * 864e5;
  const body = `${uid}.${exp}`;
  return body + '.' + b64u(crypto.createHmac('sha256', secret()).update(body).digest());
}
export function readToken(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if (!m) return null;
  const [uid, exp, sig] = m[1].split('.'); if (!uid || !exp || !sig) return null;
  const good = b64u(crypto.createHmac('sha256', secret()).update(`${uid}.${exp}`).digest());
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(uid);
}

export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // sin cookies: la sesión va en el encabezado Authorization
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return true; }
  return false;
}
export function send(res, status, obj) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); }
export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  let raw = ''; for await (const ch of req) { raw += ch; if (raw.length > 3e6) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
// límite simple de intentos de ingreso por IP (en memoria de la función: frena ataques torpes)
const tries = new Map();
export function tooMany(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0] || 'x'; const now = Date.now();
  const a = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3); a.push(now); tries.set(ip, a);
  return a.length > 20;
}
