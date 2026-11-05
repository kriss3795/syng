// GET /api/health → revisa que el servidor y la base de datos respondan
import { db, cors, send } from './_lib.js';
export default async function handler(req, res) {
  if (cors(req, res)) return;
  try { const sql = await db(); const r = await sql`SELECT count(*)::int AS n FROM users`; return send(res, 200, { ok: true, db: true, users: r[0].n }); }
  catch (err) { return send(res, 200, { ok: false, error: err.message }); }
}
