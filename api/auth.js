// POST /api/auth  {action: 'register' | 'login', email, password}  →  {token, email}
import { db, hashPass, checkPass, makeToken, cors, send, body, tooMany } from './_lib.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return send(res, 405, { error: 'Usa POST' });
  try {
    if (tooMany(req)) return send(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' });
    const { action, email: e0, password } = await body(req);
    const email = String(e0 || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return send(res, 400, { error: 'Escribe un correo válido.' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) return send(res, 400, { error: 'La contraseña debe tener al menos 8 caracteres.' });
    const sql = await db();
    if (action === 'register') {
      const ex = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (ex.length) return send(res, 409, { error: 'Ese correo ya tiene cuenta. Ingresa con tu contraseña.' });
      const r = await sql`INSERT INTO users (email, pass, created) VALUES (${email}, ${hashPass(password)}, ${Date.now()}) RETURNING id`;
      return send(res, 200, { token: makeToken(r[0].id), email });
    }
    if (action === 'login') {
      const r = await sql`SELECT id, pass FROM users WHERE email = ${email}`;
      if (!r.length || !checkPass(password, r[0].pass)) return send(res, 401, { error: 'Correo o contraseña incorrectos.' });
      return send(res, 200, { token: makeToken(r[0].id), email });
    }
    return send(res, 400, { error: 'Acción desconocida.' });
  } catch (err) {
    console.error(err);
    return send(res, err.status || 500, { error: err.status ? err.message : 'Error del servidor. Intenta de nuevo.' });
  }
}
