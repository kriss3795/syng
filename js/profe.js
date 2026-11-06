// El profe con IA (servidor /api/coach). Recibe lo que la app midió y lo explica como un profe de verdad.
// Si no hay cuenta o el servidor no responde, la app sigue con los consejos fijos de siempre.
import { account, apiBase } from './account.js';
import { load, voiceProfile, getRange } from './store.js';
import { analyze } from './adapt.js';
import { noteName } from './pitch.js';
import { settings } from './store.js';

export const profeOn = () => !!account();

// Lo que el profe "sabe" de ti: resumen corto (sin datos personales)
export function studentContext() {
  const s = load(); const R = getRange(); const v = voiceProfile();
  const m = (s.voiceMaps || []).slice(-1)[0]; const id = (m && m.id) || (s.identities || []).slice(-1)[0];
  const rt = (s.resTests || []).slice(-1)[0];
  const A = analyze();
  return {
    xp: s.xp || 0, racha: s.streak || 0, leccionesHechas: Object.values(s.lessons || {}).filter((l) => l.done).length,
    rangoComodo: R && !R.guessed ? `${noteName(R.low)}–${noteName(R.high)}` : 'sin medir',
    vozHablada: v && v.speak ? noteName(Math.round(v.speak)) : null,
    tipoDeVoz: id ? id.type : null, color: id ? id.color : null, textura: id ? id.texture : null,
    zonaDulce: id && id.sweetLo != null ? `${noteName(id.sweetLo)}–${noteName(id.sweetHi)}` : null,
    pasaje: m && m.siren && m.siren.passage ? noteName(m.siren.passage) : null,
    recursosNaturales: rt ? rt.results.filter((x) => x.s >= 0.7).map((x) => x.id) : null,
    patrones: A.findings.slice(0, 4).map((f) => `${f.title}: ${String(f.evidence || '').replace(/<[^>]+>/g, '')}`),
  };
}

export async function askProfe(kind, data, messages = null, timeoutMs = 25000) {
  const a = account(); if (!a) return { error: 'sin cuenta' };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(apiBase() + '/api/coach', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + a.token },
      body: JSON.stringify({ kind, data: { ...data, alumno: studentContext() }, messages }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { text: j.text } : { error: j.error || 'El profe no está disponible ahora.' };
  } catch (e) { return { error: e.name === 'AbortError' ? 'El profe se demoró demasiado.' : 'Sin conexión con el profe.' }; }
  finally { clearTimeout(t); }
}

// Leer en voz alta (voz del sistema) los mensajes del profe con IA
export function readAloud(text) {
  try {
    if (!('speechSynthesis' in window) || settings().voice === false) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#]/g, ''));
    const vs = speechSynthesis.getVoices(); const v = vs.find((x) => /es[-_](CL|419|US|MX)/i.test(x.lang)) || vs.find((x) => /^es/i.test(x.lang));
    if (v) u.voice = v; u.lang = v ? v.lang : 'es-CL'; u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch {}
}
export function stopReading() { try { speechSynthesis.cancel(); } catch {} }
