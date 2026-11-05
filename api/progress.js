// GET /api/progress → {data, updated} (o {data: null})
// PUT /api/progress {data, updated, force?} → guarda si es más nuevo que lo del servidor; si no, devuelve lo del servidor.
import { db, readToken, cors, send, body } from './_lib.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const uid = readToken(req);
    if (!uid) return send(res, 401, { error: 'Tu sesión venció. Ingresa de nuevo.' });
    const sql = await db();
    if (req.method === 'GET') {
      const r = await sql`SELECT data, updated FROM progress WHERE user_id = ${uid}`;
      return send(res, 200, r.length ? { data: r[0].data, updated: Number(r[0].updated) } : { data: null, updated: 0 });
    }
    if (req.method === 'PUT') {
      const { data, updated, force } = await body(req);
      if (!data || typeof data !== 'object' || !Number.isFinite(updated)) return send(res, 400, { error: 'Datos inválidos.' });
      if (JSON.stringify(data).length > 2e6) return send(res, 413, { error: 'Tu avance es demasiado grande para guardarlo.' });
      const r = await sql`SELECT updated FROM progress WHERE user_id = ${uid}`;
      if (r.length && Number(r[0].updated) > updated && !force) {
        const cur = await sql`SELECT data, updated FROM progress WHERE user_id = ${uid}`;
        return send(res, 409, { data: cur[0].data, updated: Number(cur[0].updated) });
      }
      await sql`INSERT INTO progress (user_id, data, updated) VALUES (${uid}, ${JSON.stringify(data)}::jsonb, ${updated})
                ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated`;
      return send(res, 200, { ok: true, updated });
    }
    return send(res, 405, { error: 'Método no permitido' });
  } catch (err) {
    console.error(err);
    return send(res, err.status || 500, { error: err.status ? err.message : 'Error del servidor. Intenta de nuevo.' });
  }
}
