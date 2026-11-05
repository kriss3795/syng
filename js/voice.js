// Voz del Chincol (audios pregrabados) y efectos de sonido.
import { getCtx } from './audio.js';
import { settings } from './store.js';

let current = null;
let token = 0; // evita que una voz pedida antes de "parar" empiece después
let manifest = null;
async function loadManifest() {
  if (manifest) return manifest;
  try { manifest = await (await fetch('audio/manifest.json')).json(); } catch (e) { manifest = {}; }
  return manifest;
}
loadManifest();

// Habla una línea del guion. Devuelve una promesa que se resuelve al terminar (o de inmediato si está en silencio).
export async function speak(id) {
  stopSpeaking();
  const my = token;
  if (!id || settings().voice === false) return;
  const m = await loadManifest();
  if (!m[id] || my !== token) return;
  const a = new Audio('audio/' + id + '.mp3?v=' + m[id]);
  a.volume = 1;
  current = a;
  document.body.classList.add('speaking');
  return new Promise((res) => {
    const done = () => { if (current === a) { current = null; document.body.classList.remove('speaking'); } res(); };
    a.onended = done; a.onerror = done;
    a.play().catch(done);
  });
}
export function stopSpeaking() {
  token++;
  if (current) { try { current.pause(); } catch (e) {} current = null; }
  document.body.classList.remove('speaking');
}
export const isSpeaking = () => !!current;

// ---------- Efectos (sintetizados con Web Audio) ----------
function tone(freq, t, dur, type = 'sine', gain = 0.18, dest) {
  const c = getCtx();
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(dest || c.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
export function sfx(name, n = 0) {
  if (settings().sfx === false) return;
  const c = getCtx(); const t = c.currentTime + 0.01;
  switch (name) {
    case 'ok': // "ding" ascendente
      tone(880, t, 0.16, 'triangle', 0.16); tone(1318.5, t + 0.09, 0.32, 'triangle', 0.16); break;
    case 'bad':
      tone(220, t, 0.18, 'square', 0.05); tone(185, t + 0.12, 0.28, 'square', 0.05); break;
    case 'tap':
      tone(660, t, 0.05, 'sine', 0.08); break;
    case 'select':
      tone(523, t, 0.07, 'triangle', 0.1); break;
    case 'done': // fanfarria de lección completada
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + i * 0.11, 0.35, 'triangle', 0.15));
      tone(1318.5, t + 0.5, 0.6, 'triangle', 0.12); tone(783.99, t + 0.5, 0.6, 'triangle', 0.08); break;
    case 'streak':
      [392, 523.25, 659.25].forEach((f, i) => tone(f, t + i * 0.08, 0.25, 'sawtooth', 0.05)); break;
    case 'combo': { // sube medio tono con cada nota seguida
      const f = 784 * 2 ** (Math.min(n, 14) / 12); tone(f, t, 0.09, 'triangle', 0.1); tone(f * 1.5, t + 0.05, 0.12, 'triangle', 0.07); break; }
    case 'xp':
      tone(1046.5, t, 0.08, 'square', 0.04); tone(1568, t + 0.06, 0.12, 'square', 0.04); break;
  }
}

// Confeti (solo al completar lecciones; respeta "reducir movimiento")
export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.append(cv);
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#6B4EFF', '#1FB86B', '#F5A524', '#F0506E', '#3AB7F0', '#C4672F'];
  const ps = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4, r: Math.random() * 6 + 4,
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3, c: cols[Math.floor(Math.random() * cols.length)],
  }));
  const t0 = performance.now();
  const step = (now) => {
    const el = now - t0;
    g.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of ps) {
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += p.va;
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - el / 2400);
      g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore();
    }
    if (el < 2400) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
