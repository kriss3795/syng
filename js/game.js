// Vuelo del Chincol: juego de afinación. El Chincol vuela a la altura de tu voz y tiene que pasar por
// las puertas, cada una ubicada en una nota. La nota de referencia suena ANTES de llegar a la puerta y se calla
// antes de que se evalúe (así el micrófono no puede "ayudarte" con el parlante).
import { h, icon, sleep } from './ui.js';
import { getCtx, startMic, readPitch, resetSmoother, playNote } from './audio.js';
import { noteName, solfege } from './pitch.js';
import { getRange, load, save, addXp } from './store.js';
import { say } from './coach.js';
import { sfx, confetti, stopSpeaking } from './voice.js';
import { track } from './fun.js';

export const GAME_LEVELS = [
  { id: 'g1', name: 'Escalita', desc: 'Do, re, mi… subiendo y bajando, con ayuda', seq: [0, 2, 4, 5, 7, 5, 4, 2, 0], tol: 70, speed: 0.75, help: true },
  { id: 'g2', name: 'Saltitos', desc: 'Terceras y quintas', seq: [0, 4, 0, 7, 4, 0, 5, 2, 7, 0], tol: 60, speed: 0.85, help: true },
  { id: 'g3', name: 'Estrellita', desc: 'Una melodía de verdad', seq: [0, 0, 7, 7, 9, 9, 7, 5, 5, 4, 4, 2, 2, 0], tol: 55, speed: 0.95, help: true },
  { id: 'g4', name: 'Al azar', desc: 'Notas sorpresa en tu zona', rand: 14, tol: 55, speed: 0.95, help: true },
  { id: 'g5', name: 'Sin ayuda', desc: 'No suena la nota: la lees y la cantas', seq: [0, 2, 4, 0, 4, 5, 7, 4, 2, 0], tol: 60, speed: 0.8, help: false },
  { id: 'g6', name: 'Fino', desc: 'Puertas estrechas (±20 cents)', rand: 12, tol: 40, speed: 0.9, help: true },
  { id: 'g7', name: 'Rápido', desc: 'Más velocidad, más notas', rand: 20, tol: 60, speed: 1.35, help: true },
];
const best = (id) => (load().game || {})[id] || 0;
const setBest = (id, v) => { const s = load(); s.game = { ...(s.game || {}), [id]: Math.max(v, (s.game || {})[id] || 0) }; save(); };

export function gameMenu(root, nav) {
  const unlocked = (i) => i === 0 || best(GAME_LEVELS[i - 1].id) >= 60;
  root.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'row between' }, h('button', { class: 'iconbtn', onclick: () => nav('#practicar') }, icon('back')), h('span', {})),
    h('h1', {}, 'Vuelo del Chincol'),
    say('El Chincol vuela a la <b>altura de tu voz</b>: canta más agudo y sube, más grave y baja. Pasa por las puertas cantando su nota. 🎧 Mejor con audífonos.', 'hola'),
    h('div', { class: 'game-levels' }, ...GAME_LEVELS.map((L, i) => h('button', { class: 'card game-lv' + (unlocked(i) ? '' : ' locked'), disabled: !unlocked(i), onclick: () => nav('#juego-' + L.id) },
      h('b', {}, `${i + 1}. ${L.name}`), h('small', {}, L.desc), h('span', { class: 'pill' + (best(L.id) >= 60 ? ' ok' : '') }, unlocked(i) ? (best(L.id) ? `Récord ${best(L.id)}%` : 'Nuevo') : '🔒 60% en el anterior'))))));
}

export async function playGame(root, nav, levelId, sig) {
  const L = GAME_LEVELS.find((x) => x.id === levelId) || GAME_LEVELS[0];
  const R = getRange();
  const base = Math.max(R.low + 1, Math.min(R.high - 9, Math.round(R.comfort - 4)));
  const pool = [0, 2, 4, 5, 7, 9].filter((x) => base + x <= R.high - 1);
  const seq = L.rand ? Array.from({ length: L.rand }, () => base + pool[Math.floor(Math.random() * pool.length)]) : L.seq.map((x) => Math.min(R.high - 1, base + x));
  const lo = Math.min(...seq) - 4, hi = Math.max(...seq) + 4;
  try { await startMic(); } catch (e) { root.replaceChildren(h('div', { class: 'page' }, say('Necesito el micrófono para jugar.', 'piensa'))); return; }
  const c = getCtx();
  const canvas = h('canvas', { class: 'game-cv' });
  const hud = h('div', { class: 'game-hud' });
  const msg = h('div', { class: 'game-msg' }, 'Canta para despegar');
  const quit = h('button', { class: 'iconbtn light', onclick: () => nav('#juego') }, icon('close'));
  root.replaceChildren(h('div', { class: 'game' }, h('div', { class: 'game-top' }, quit, hud), canvas, msg));
  const img = new Image(); img.src = 'img/chincol-feliz.webp';
  const imgUp = new Image(); imgUp.src = 'img/chincol-celebra.webp';
  const imgSad = new Image(); imgSad.src = 'img/chincol-piensa.webp';
  const g = canvas.getContext('2d');
  if (!g.roundRect) g.roundRect = function (x, y, w, hh) { this.rect(x, y, w, hh); };
  const gapSec = 2.4 / L.speed; // tiempo entre puertas
  const travel = 2.8; // segundos que tarda una puerta desde el borde derecho hasta el pájaro
  let t0 = null; const gates = seq.map((m, i) => ({ m, t: i * gapSec, res: null, played: false }));
  const maxH = L.id === 'g1' || L.id === 'g2' ? 5 : 3;
  let y = (lo + hi) / 2, hearts = maxH, combo = 0, passed = 0, judged = 0, lastHit = -9, lastMiss = -9;
  const trail = [];
  resetSmoother();
  const yOf = (m, H) => H * (1 - (m - lo) / (hi - lo));
  const draw = (now) => {
    const r = canvas.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
    const W = r.width, H = r.height; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0E6E6C'); sky.addColorStop(1, '#2BB7A9'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // líneas de notas
    g.font = '600 11px Nunito, sans-serif'; g.textAlign = 'left';
    for (let m = Math.ceil(lo); m <= hi; m++) { const yy = yOf(m, H); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, yy, W, 1); if (m % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillText(noteName(m), 4, yy - 2); } }
    const bx = W * 0.25;
    const tt = t0 == null ? 0 : now - t0;
    for (const gt of gates) {
      const x = bx + ((gt.t - tt) / travel) * (W - bx);
      if (x < -60 || x > W + 60) continue;
      const half = (L.tol / 2 / 100) * (H / (hi - lo)) + 6;
      const yy = yOf(gt.m, H);
      g.fillStyle = gt.res === 'hit' ? '#1FB86B' : gt.res === 'miss' ? '#F0506E' : '#FFF4D6';
      const pw = 26;
      g.beginPath(); g.roundRect(x - pw / 2, -10, pw, yy - half + 10, 8); g.fill();
      g.beginPath(); g.roundRect(x - pw / 2, yy + half, pw, H - yy - half + 10, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '800 13px Nunito, sans-serif'; g.textAlign = 'center';
      g.fillText(solfege(gt.m - base), x, yy + 4);
    }
    // estela de la voz
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.beginPath();
    trail.forEach((p, i) => { const x = bx - (tt - p.t) * ((W - bx) / travel); i ? g.lineTo(x, yOf(p.m, H)) : g.moveTo(x, yOf(p.m, H)); }); g.stroke();
    const by = yOf(y, H);
    const pic = tt - lastHit < 0.5 ? imgUp : tt - lastMiss < 0.6 ? imgSad : img;
    if (pic.complete) g.drawImage(pic, bx - 30, by - 30, 60, 60); else { g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 14, 0, 7); g.fill(); }
  };
  const drawHud = () => hud.replaceChildren(...[h('span', { class: 'hearts' }, '❤️'.repeat(hearts) + '🤍'.repeat(maxH - hearts)), h('span', {}, `${passed}/${gates.length}`), combo >= 3 ? h('span', { class: 'combo' }, `x${combo} 🔥`) : h('span', {})].filter(Boolean));
  drawHud();
  let started = false, ended = false;
  while (!sig.aborted && !ended) {
    const now = c.currentTime;
    const p = readPitch();
    if (p.midi != null) {
      if (!started) { started = true; t0 = now + 1.5; msg.textContent = ''; }
      y = y + (Math.max(lo, Math.min(hi, p.midi)) - y) * 0.35;
      trail.push({ t: now - (t0 ?? now), m: y }); if (trail.length > 120) trail.shift();
    } else if (started) { y = Math.max(lo, y - 0.04); } // sin voz, baja suave
    if (started) {
      const tt = now - t0;
      for (const gt of gates) {
        // referencia: suena 1,8 s antes de la puerta y termina 0,5 s antes de evaluar
        if (L.help && !gt.played && tt >= gt.t - 1.8) { gt.played = true; playNote(gt.m, c.currentTime + 0.02, 1.1, 0.22); }
        if (!gt.res && tt >= gt.t + 0.12) {
          const window = trail.filter((q) => q.t >= gt.t - 0.25 && q.t <= gt.t + 0.12);
          const inside = window.filter((q) => Math.abs(q.m - gt.m) * 100 <= L.tol / 2 + 10).length;
          const ok = p.midi != null && window.length >= 3 && inside / window.length >= 0.5;
          gt.res = ok ? 'hit' : 'miss'; judged++;
          if (ok) { passed++; combo++; lastHit = tt; sfx(combo % 5 === 0 ? 'xp' : 'ok'); }
          else { hearts--; combo = 0; lastMiss = tt; sfx('bad'); msg.textContent = gt.m - y > 0.5 ? '⬆ Más agudo' : y - gt.m > 0.5 ? '⬇ Más grave' : '¡Casi!'; setTimeout(() => (msg.textContent = ''), 900); }
          drawHud();
          if (hearts <= 0) ended = true;
        }
      }
      if (gates.every((x) => x.res)) ended = true;
    }
    draw(now);
    await new Promise((r) => requestAnimationFrame(r));
  }
  if (sig.aborted) return;
  const pctV = Math.round((passed / gates.length) * 100);
  const rec = pctV > best(L.id);
  setBest(L.id, pctV);
  track('game', { passed, pct: pctV });
  addXp(Math.round(3 + pctV / 10));
  if (pctV >= 60) { sfx('done'); if (rec) confetti(); } else sfx('bad');
  const idx = GAME_LEVELS.indexOf(L);
  root.replaceChildren(h('div', { class: 'page center' },
    say(hearts <= 0 ? `Se acabaron los corazones. Pasaste <b>${passed}</b> puertas. ¡Otra vez!` : `Pasaste <b>${passed} de ${gates.length}</b> puertas (${pctV}%).` + (rec ? ' ¡Nuevo récord!' : ''), pctV >= 60 ? 'celebra' : 'piensa'),
    h('p', { class: 'small muted' }, pctV >= 60 && GAME_LEVELS[idx + 1] ? `Desbloqueaste el nivel ${idx + 2}: ${GAME_LEVELS[idx + 1].name}.` : 'Necesitas 60% para desbloquear el siguiente nivel.'),
    h('div', { class: 'actionbar' },
      h('button', { class: 'btn', onclick: () => { stopSpeaking(); nav('#juego'); } }, 'Niveles'),
      h('button', { class: 'btn primary', onclick: () => { stopSpeaking(); location.hash === '#juego-' + L.id ? playGame(root, nav, L.id, sig) : nav('#juego-' + L.id); } }, icon('repeat', 18), 'Jugar otra vez'),
      pctV >= 60 && GAME_LEVELS[idx + 1] ? h('button', { class: 'btn primary', onclick: () => nav('#juego-' + GAME_LEVELS[idx + 1].id) }, 'Siguiente') : null)));
}
