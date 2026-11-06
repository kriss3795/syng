// POST /api/coach  {kind: 'exercise' | 'lesson' | 'chat', data, messages?}  →  {text}
// El "profe" con IA: convierte lo que la app midió en una explicación humana, cálida y concreta.
// Usa Vercel AI Gateway con el token OIDC del proyecto (sin claves que configurar; $5 gratis cada 30 días).
// Solo para usuarios con cuenta y con un límite diario, para que nadie gaste los créditos.
import { db, readToken, cors, send, body } from './_lib.js';

const MODELS = (process.env.COACH_MODELS || 'anthropic/claude-haiku-4.5,openai/gpt-5-mini,google/gemini-2.5-flash').split(',');
const DAILY = Number(process.env.COACH_DAILY || 120);

const BASE = `Eres "el Chincol", profesor de canto de la app Syng. Hablas en español de Chile neutro, de "tú", cálido, cercano y alentador, como un buen profe particular que conoce a su alumno. Tu alumno es un principiante adulto que está aprendiendo a cantar desde cero y le cuesta afinar, colocar la voz y cantar con seguridad.
Reglas:
- Basa todo en los DATOS MEDIDOS que te da la app. Nunca inventes mediciones, notas ni porcentajes que no estén en los datos. Si algo no se midió, no lo afirmes.
- Sé honesto: si salió mal, dilo con cariño; si salió bien, celébralo con algo específico.
- Una sola prioridad por vez. Da una indicación física o una imagen concreta que se pueda probar al tiro (por ejemplo: "imagina que la nota está un poquito más arriba, como si la miraras desde arriba", "bosteza por dentro", "suelta la mandíbula como si masticaras", "apoya como si inflaras un salvavidas en la cintura").
- Lenguaje simple. Si usas un término técnico, explícalo en pocas palabras.
- Nada de diagnósticos médicos. Si menciona dolor o ronquera que no se va, recomienda descansar y consultar a un fonoaudiólogo.
- Sin listas largas, sin títulos, sin emojis en exceso (máximo uno). Texto corrido y breve.`;

const TASK = {
  exercise: 'Comenta el intento que acaba de hacer en este ejercicio, en 2 a 4 frases (máximo 70 palabras): qué salió bien (específico), la UNA cosa más importante a mejorar y cómo hacerlo en el próximo intento. Si el puntaje es 85% o más, felicita y dile que pase al siguiente (no que repita).',
  lesson: 'Cierra la clase en 3 a 5 frases (máximo 90 palabras): qué aprendió hoy, cómo le fue según los datos, en qué se nota que avanzó (si hay datos para decirlo) y qué practicar mañana.',
  plan: 'Saluda al alumno al empezar la clase y dile en 2 o 3 frases (máximo 55 palabras) qué van a trabajar hoy y por qué, según los datos (su peldaño, lo que le costó antes). Motívalo con algo concreto. No repitas los números exactos.',
  chat: 'Responde la pregunta del alumno como su profe, en máximo 140 palabras, usando lo que sabes de su voz (en los datos) cuando sirva. Si pide un ejercicio, describe uno concreto, paso a paso y corto, que pueda hacer ahora mismo.',
};

// Opción gratis sin tarjeta: una clave de Google AI Studio (GEMINI_API_KEY) usa Gemini directamente.
async function gemini(messages, maxTokens) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', messages, max_tokens: maxTokens + 600, temperature: 0.7, reasoning_effort: 'none' }),
  });
  const j = await r.json().catch(() => ({}));
  const j0 = Array.isArray(j) ? j[0] : j;
  if (r.ok && j0.choices && j0.choices[0]) return { text: String(j0.choices[0].message.content || '').trim(), model: 'gemini' };
  console.error('gemini', r.status, JSON.stringify(j).slice(0, 400));
  throw Object.assign(new Error('El profe con IA no está disponible ahora.'), { status: 503, detail: { status: r.status, msg: (j0.error && j0.error.message) || r.statusText } });
}
async function gateway(req, messages, maxTokens) {
  if (process.env.GEMINI_API_KEY) return gemini(messages, maxTokens);
  const token = process.env.AI_GATEWAY_API_KEY || req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw Object.assign(new Error('El profe con IA aún no está activado en el servidor.'), { status: 503 });
  let last = null;
  for (const model of MODELS) {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.trim(), messages, max_tokens: maxTokens, temperature: 0.7 }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.choices && j.choices[0]) return { text: String(j.choices[0].message.content || '').trim(), model };
    last = { status: r.status, msg: (j.error && (j.error.message || j.error)) || r.statusText };
    if (r.status === 401 || r.status === 403 || r.status === 402) break; // sin permiso o sin créditos: no sirve probar otro modelo
  }
  console.error('gateway', last);
  throw Object.assign(new Error(last && /credit card/i.test(String(last.msg)) ? 'El profe con IA aún no está activado (falta registrar una tarjeta en Vercel o una clave gratis de Google).' : last && (last.status === 402 || /credit/i.test(String(last.msg))) ? 'El profe con IA se quedó sin créditos este mes.' : 'El profe con IA no está disponible ahora.'), { status: 503, detail: last });
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method === 'GET') { // prueba rápida: /api/coach
    try { const r = await gateway(req, [{ role: 'user', content: 'Responde solo: listo' }], 10); return send(res, 200, { ok: true, model: r.model, text: r.text }); }
    catch (e) { return send(res, 200, { ok: false, error: e.message, detail: e.detail || null }); }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Usa POST' });
  try {
    const uid = readToken(req);
    if (!uid) return send(res, 401, { error: 'Ingresa a tu cuenta para hablar con el profe.' });
    const sql = await db();
    await sql`CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`;
    const day = new Date().toISOString().slice(0, 10);
    const u = await sql`INSERT INTO ai_usage (user_id, day, n) VALUES (${uid}, ${day}, 1) ON CONFLICT (user_id, day) DO UPDATE SET n = ai_usage.n + 1 RETURNING n`;
    if (u[0].n > DAILY) return send(res, 429, { error: 'Por hoy el profe ya habló mucho. Mañana seguimos.' });
    const { kind, data, messages } = await body(req);
    if (!TASK[kind]) return send(res, 400, { error: 'Tipo inválido' });
    const ctx = JSON.stringify(data || {}).slice(0, 6000);
    const msgs = [{ role: 'system', content: BASE + '\n\nTarea: ' + TASK[kind] + '\n\nDATOS MEDIDOS DEL ALUMNO (JSON):\n' + ctx }];
    if (kind === 'chat') (Array.isArray(messages) ? messages : []).slice(-10).forEach((m) => { if (m && (m.role === 'user' || m.role === 'assistant')) msgs.push({ role: m.role, content: String(m.content || '').slice(0, 1500) }); });
    else msgs.push({ role: 'user', content: 'Profe, ¿cómo me fue?' });
    const r = await gateway(req, msgs, kind === 'chat' ? 400 : 220);
    return send(res, 200, { text: r.text });
  } catch (err) {
    console.error(err);
    return send(res, err.status || 500, { error: err.status ? err.message : 'Error del servidor.' });
  }
}
