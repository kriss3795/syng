// Componentes de interfaz: pentagrama de tono (piano-roll), afinador fino y utilidades DOM.
import { noteName } from './pitch.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const pct = (x) => Math.round(x * 100) + '%';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ---------- Piano-roll ----------
// x = tiempo (el "ahora" fijo a la izquierda), y = altura (semitonos).
export class Roll {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.lo = opts.lo ?? 48;
    this.hi = opts.hi ?? 72;
    this.span = opts.span ?? 6; // segundos visibles
    this.nowFrac = opts.nowFrac ?? 0.28;
    this.targets = [];
    this.user = []; // {t, m, ok}
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }
  destroy() { window.removeEventListener('resize', this._onResize); }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = Math.max(200, r.width); this.hgt = Math.max(140, r.height);
    this.c.width = this.w * dpr; this.c.height = this.hgt * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setRange(lo, hi) { this.lo = Math.floor(lo); this.hi = Math.ceil(hi); if (this.hi - this.lo < 10) { const mid = (this.lo + this.hi) / 2; this.lo = Math.floor(mid - 5); this.hi = Math.ceil(mid + 5); } }
  fitTargets(pad = 3) {
    const ms = this.targets.flatMap((t) => [t.m0, t.m1]);
    if (ms.length) this.setRange(Math.min(...ms) - pad, Math.max(...ms) + pad);
  }
  y(m) { return this.hgt - ((m - this.lo + 0.5) / (this.hi - this.lo + 1)) * this.hgt; }
  x(t, now) { return this.nowFrac * this.w + ((t - now) / this.span) * this.w; }
  addUser(t, m, ok) { this.user.push({ t, m, ok }); if (this.user.length > 4000) this.user.splice(0, 1000); }
  clearUser() { this.user = []; }

  draw(now, { showUser = true, full = false } = {}) {
    const g = this.g, W = this.w, H = this.hgt;
    g.clearRect(0, 0, W, H);
    const rowH = H / (this.hi - this.lo + 1);
    // filas
    g.font = '11px system-ui, sans-serif';
    g.textBaseline = 'middle';
    for (let m = this.lo; m <= this.hi; m++) {
      const y = this.y(m);
      const black = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
      if (black) { g.fillStyle = css('--roll-alt'); g.fillRect(0, y - rowH / 2, W, rowH); }
      if (((m % 12) + 12) % 12 === 0) { g.fillStyle = css('--line'); g.fillRect(0, y + rowH / 2 - 1, W, 1); }
      if (rowH >= 9 && !black) { g.fillStyle = css('--muted'); g.fillText(noteName(m), 4, y); }
    }
    // objetivos
    for (const t of this.targets) {
      const x0 = this.x(t.t0, now), x1 = this.x(t.t1, now);
      if (x1 < 0 || x0 > W) continue;
      const active = now >= t.t0 && now <= t.t1;
      let col = css('--target');
      if (t.result === 'hit') col = css('--ok');
      else if (t.result === 'miss') col = css('--bad');
      else if (t.result === 'demo') col = css('--demo');
      else if (active) col = css('--target-active');
      g.strokeStyle = col; g.fillStyle = col;
      if (t.m0 === t.m1) {
        const y = this.y(t.m0);
        const hh = Math.max(6, rowH * 0.7);
        g.globalAlpha = 0.85;
        roundRect(g, x0, y - hh / 2, Math.max(4, x1 - x0 - 2), hh, Math.min(6, hh / 2));
        g.fill();
        g.globalAlpha = 1;
        if (t.label && x1 - x0 > 18) { g.fillStyle = '#fff'; g.font = 'bold 11px system-ui'; g.fillText(t.label, x0 + 4, y); }
      } else {
        g.lineWidth = Math.max(5, rowH * 0.6); g.lineCap = 'round'; g.globalAlpha = 0.6;
        g.beginPath(); g.moveTo(x0, this.y(t.m0)); g.lineTo(x1, this.y(t.m1)); g.stroke();
        g.globalAlpha = 1;
      }
    }
    // línea del "ahora"
    const nx = this.nowFrac * W;
    if (!full) { g.fillStyle = css('--now'); g.fillRect(nx - 1, 0, 2, H); }
    // voz del usuario
    if (showUser) {
      g.lineWidth = 3; g.lineCap = 'round';
      let prev = null;
      for (const p of this.user) {
        const x = this.x(p.t, now);
        if (x < -5 || (!full && x > nx + 4) || x > W + 5) { prev = null; continue; }
        if (p.m == null) { prev = null; continue; }
        const y = this.y(p.m);
        if (prev && p.t - prev.t < 0.12) {
          g.strokeStyle = p.ok === true ? css('--ok') : p.ok === false ? css('--warn') : css('--voice');
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(x, y); g.stroke();
        }
        prev = { x, y, t: p.t };
      }
      const last = this.user[this.user.length - 1];
      if (!full && last && last.m != null && now - last.t < 0.15) {
        g.fillStyle = css('--voice');
        g.beginPath(); g.arc(nx, this.y(last.m), 6, 0, Math.PI * 2); g.fill();
      }
    }
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

// ---------- Afinador fino (cents) ----------
// Muestra cuánto te desvías de la nota objetivo: escala de -100 a +100 cents, con zona verde = tolerancia.
export function tuner(tol = 50) {
  const zone = h('div', { class: 'tz' });
  const needle = h('div', { class: 'tn' });
  const bar = h('div', { class: 'tbar' }, zone, h('div', { class: 'tcenter' }), needle,
    h('span', { class: 'tl l' }, '-100'), h('span', { class: 'tl r' }, '+100'));
  const note = h('div', { class: 'tnote' }, '—');
  const msg = h('div', { class: 'tmsg' }, 'Canta cuando quieras');
  const cents = h('div', { class: 'tcents' }, '');
  const el = h('div', { class: 'tuner' }, note, bar, cents, msg);
  const api = {
    el,
    // t = ancho total de la zona verde en cents (la barra completa = 200 cents)
    setTol(t) { tol = t; zone.style.left = 50 - t / 4 + '%'; zone.style.width = t / 2 + '%'; },
    // target: midi objetivo o null (afinador libre -> nota más cercana)
    update(midi, target) {
      if (midi == null) { needle.style.opacity = 0.25; msg.textContent = 'No te escucho… canta un poco más fuerte'; msg.className = 'tmsg'; return null; }
      const ref = target == null ? Math.round(midi) : target;
      const c = (midi - ref) * 100;
      needle.style.opacity = 1;
      const pos = Math.max(-100, Math.min(100, c));
      needle.style.left = 50 + pos / 2 + '%';
      note.textContent = target == null ? noteName(midi) : 'Objetivo: ' + noteName(target);
      cents.textContent = (c >= 0 ? '+' : '') + Math.round(c) + ' cents' + (target != null ? ' · cantas ' + noteName(midi) : '');
      const half = tol / 2;
      const inTol = Math.abs(c) <= half;
      if (inTol) { msg.textContent = Math.abs(c) <= Math.min(10, half) ? '¡Clavado! (' + Math.round(Math.abs(c)) + ' cents)' : 'Dentro de la zona ✓'; msg.className = 'tmsg ok'; }
      else if (c < 0) { msg.textContent = c < -150 ? 'Muy abajo ↑↑ sube' : 'Un poco abajo ↑ sube'; msg.className = 'tmsg warn'; }
      else { msg.textContent = c > 150 ? 'Muy arriba ↓↓ baja' : 'Un poco arriba ↓ baja'; msg.className = 'tmsg warn'; }
      needle.className = 'tn ' + (inTol ? 'ok' : 'warn');
      return c;
    },
  };
  api.setTol(tol);
  return api;
}

// Medidor simple de volumen (para la respiración)
export function levelMeter() {
  const fill = h('div', { class: 'lvfill' });
  const el = h('div', { class: 'lvbar' }, fill);
  return { el, set(v) { fill.style.width = Math.min(100, v * 100) + '%'; } };
}
