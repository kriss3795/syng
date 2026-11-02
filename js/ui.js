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

// ---------- Íconos (SVG simples, trazo redondeado) ----------
const ICONS = {
  path: '<path d="M6 19c4 0 3-6 7-6s3 6 7 6"/><circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M6 8.2v4M18 8.2v4"/>',
  gym: '<path d="M3 12h2M19 12h2M7 7v10M17 7v10M7 12h10"/><rect x="5" y="9" width="2" height="6" rx="1"/><rect x="17" y="9" width="2" height="6" rx="1"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
  ear: '<path d="M7 9a5 5 0 1 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0"/><path d="M10 9a2 2 0 1 1 4 0"/>',
  breath: '<path d="M4 9h10a3 3 0 1 0-3-3M4 13h14a3 3 0 1 1-3 3M4 17h6"/>',
  drum: '<ellipse cx="12" cy="8" rx="8" ry="3"/><path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8M6 3l5 5M18 3l-5 5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" fill="currentColor"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor"/>',
  play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M20 4v5h-5M4 20v-5h5"/>',
  rec: '<circle cx="12" cy="12" r="6" fill="currentColor"/>',
  speaker: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  piano: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v14M13 5v14M18 5v14"/><path d="M6 5v8M10.5 5v8M15.5 5v8" stroke-width="3"/>',
  metro: '<path d="M8 21L10 3h4l2 18zM12 15l5-9"/>',
  sparkle: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  wave: '<path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v3M8 21h8M9 17h6v4H9z"/>',
  party: '<path d="M4 20l5-14 9 9z"/><path d="M14 4l1 2M19 8l2-1M17 3l-1 3"/>',
  sync: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
export function icon(name, size = 22) {
  return h('span', { class: 'ic', html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>` });
}

// ---------- Pentagrama de notas (piano-roll) ----------
// x = tiempo (el "ahora" fijo), y = altura. Colores leídos del CSS del propio canvas (sirve en tema claro y oscuro).
export class Roll {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.lo = opts.lo ?? 48;
    this.hi = opts.hi ?? 72;
    this.span = opts.span ?? 6;
    this.nowFrac = opts.nowFrac ?? 0.28;
    this.targets = [];
    this.user = [];
    this.gutter = 38;
    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }
  destroy() { window.removeEventListener('resize', this._onResize); }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(200, r.width); this.hgt = Math.max(120, r.height);
    this.c.width = this.w * dpr; this.c.height = this.hgt * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setRange(lo, hi) { this.lo = Math.floor(lo); this.hi = Math.ceil(hi); if (this.hi - this.lo < 10) { const mid = (this.lo + this.hi) / 2; this.lo = Math.floor(mid - 5); this.hi = Math.ceil(mid + 5); } }
  fitTargets(pad = 3) {
    const ms = this.targets.flatMap((t) => [t.m0, t.m1]);
    if (ms.length) this.setRange(Math.min(...ms) - pad, Math.max(...ms) + pad);
  }
  y(m) { return this.hgt - ((m - this.lo + 0.5) / (this.hi - this.lo + 1)) * this.hgt; }
  x(t, now) { const W = this.w - this.gutter; return this.gutter + this.nowFrac * W + ((t - now) / this.span) * W; }
  addUser(t, m, ok) { this.user.push({ t, m, ok }); if (this.user.length > 4000) this.user.splice(0, 1000); }
  clearUser() { this.user = []; }

  draw(now, { showUser = true, full = false } = {}) {
    const cs = getComputedStyle(this.c);
    const css = (n) => cs.getPropertyValue(n).trim();
    const g = this.g, W = this.w, H = this.hgt, G = this.gutter;
    g.clearRect(0, 0, W, H);
    const rowH = H / (this.hi - this.lo + 1);
    const active = this.targets.find((t) => now >= t.t0 && now <= t.t1 && t.result !== 'demo-hide');
    // filas
    for (let m = this.lo; m <= this.hi; m++) {
      const y = this.y(m);
      const pc = ((m % 12) + 12) % 12;
      if ([1, 3, 6, 8, 10].includes(pc)) { g.fillStyle = css('--roll-alt'); g.fillRect(G, y - rowH / 2, W - G, rowH); }
      if (active && Math.round(active.m0) === m && active.m0 === active.m1) { g.fillStyle = css('--roll-row'); g.fillRect(G, y - rowH / 2, W - G, rowH); }
      if (pc === 0) { g.fillStyle = css('--roll-line'); g.fillRect(G, y + rowH / 2 - 0.5, W - G, 1); }
    }
    // columna de nombres
    g.fillStyle = css('--roll-gutter'); g.fillRect(0, 0, G, H);
    g.font = '600 10px Nunito, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'right';
    for (let m = this.lo; m <= this.hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (rowH < 9 && pc !== 0 && pc !== 7) continue;
      if ([1, 3, 6, 8, 10].includes(pc)) continue;
      g.fillStyle = active && Math.round(active.m0) === m ? css('--roll-accent') : css('--roll-label');
      g.fillText(noteName(m), G - 5, this.y(m));
    }
    g.save(); g.beginPath(); g.rect(G, 0, W - G, H); g.clip();
    // objetivos
    for (const t of this.targets) {
      const x0 = this.x(t.t0, now), x1 = this.x(t.t1, now);
      if (x1 < G || x0 > W) continue;
      const isActive = t === active;
      let col = css('--note');
      if (t.result === 'hit') col = css('--ok');
      else if (t.result === 'miss') col = css('--bad');
      else if (t.result === 'demo') col = css('--demo');
      else if (isActive) col = css('--note-active');
      g.fillStyle = col; g.strokeStyle = col;
      if (t.m0 === t.m1) {
        const y = this.y(t.m0);
        const hh = Math.max(8, Math.min(22, rowH * 0.8));
        g.globalAlpha = t.t1 < now && !t.result ? 0.45 : 1;
        roundRect(g, x0 + 1, y - hh / 2, Math.max(6, x1 - x0 - 3), hh, hh / 2);
        g.fill();
        g.globalAlpha = 1;
        if (t.label && x1 - x0 > 20) {
          g.fillStyle = css('--note-ink'); g.font = '800 11px Nunito, system-ui'; g.textAlign = 'left';
          g.fillText(t.label, x0 + 7, y + 0.5);
        }
      } else {
        g.lineWidth = Math.max(6, Math.min(16, rowH * 0.6)); g.lineCap = 'round'; g.globalAlpha = 0.55;
        g.beginPath(); g.moveTo(x0, this.y(t.m0)); g.lineTo(x1, this.y(t.m1)); g.stroke();
        g.globalAlpha = 1;
      }
    }
    // línea del ahora
    const nx = G + this.nowFrac * (W - G);
    if (!full) { g.fillStyle = css('--now'); g.fillRect(nx - 1, 0, 2, H); }
    // tu voz
    if (showUser) {
      g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      let prev = null;
      for (const p of this.user) {
        const x = this.x(p.t, now);
        if (x < G - 5 || (!full && x > nx + 4) || x > W + 5 || p.m == null) { prev = null; continue; }
        const y = this.y(p.m);
        if (prev && p.t - prev.t < 0.12) {
          g.strokeStyle = p.ok === true ? css('--ok') : p.ok === false ? css('--warn') : css('--voice');
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(x, y); g.stroke();
        }
        prev = { x, y, t: p.t };
      }
      const last = this.user[this.user.length - 1];
      if (!full && last && last.m != null && now - last.t < 0.15) {
        const y = this.y(last.m);
        g.fillStyle = last.ok === true ? css('--ok') : last.ok === false ? css('--warn') : css('--voice');
        g.beginPath(); g.arc(nx, y, 9, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(nx, y, 3.5, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
  }
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

// ---------- Afinador vertical (arriba = más agudo) ----------
// tol = ancho total de la zona verde en cents. Escala visible: ±100 cents.
export function tuner(tol = 50) {
  const zone = h('div', { class: 'tz' });
  const ball = h('div', { class: 'tball' });
  const meter = h('div', { class: 'tmeter' }, h('span', { class: 'tlab top' }, 'más agudo'), zone, h('div', { class: 'tcenter' }), ball, h('span', { class: 'tlab bot' }, 'más grave'));
  const note = h('div', { class: 'tnote' }, '—');
  const sub = h('div', { class: 'tsub' }, '');
  const cents = h('div', { class: 'tcents' }, '');
  const msg = h('div', { class: 'tmsg' }, 'Canta cuando quieras');
  const el = h('div', { class: 'tuner' }, meter, h('div', { class: 'tinfo' }, note, sub, cents, msg));
  let lo = -tol / 2, hi = tol / 2;
  const api = {
    el,
    setTol(t, extraLo = 0, extraHi = 0) {
      tol = t; lo = -t / 2 + extraLo; hi = t / 2 + extraHi;
      zone.style.bottom = 50 + lo / 2 + '%'; zone.style.height = (hi - lo) / 2 + '%';
    },
    setMsg(text, cls = '') { msg.textContent = text; msg.className = 'tmsg ' + cls; },
    update(midi, target) {
      if (midi == null) { ball.classList.add('off'); api.setMsg('No te escucho… canta un poco más fuerte'); cents.textContent = ''; return null; }
      ball.classList.remove('off');
      const ref = target == null ? Math.round(midi) : target;
      const c = (midi - ref) * 100;
      const pos = Math.max(-100, Math.min(100, c));
      ball.style.bottom = 50 + pos / 2 + '%';
      note.textContent = target == null ? noteName(midi) : noteName(target);
      sub.textContent = target == null ? 'nota más cercana' : 'tu objetivo';
      cents.textContent = (c >= 0 ? '+' : '') + Math.round(c) + ' cents' + (target != null && Math.round(midi) !== Math.round(target) ? ' · cantas ' + noteName(midi) : '');
      const inTol = c >= lo && c <= hi;
      if (inTol) api.setMsg(Math.abs(c) <= 10 ? '¡Clavado!' : 'Dentro de la zona', 'ok');
      else if (c < 0) api.setMsg(c < -150 ? 'Muy grave: sube bastante ↑' : 'Un poquito grave: sube ↑', 'warn');
      else api.setMsg(c > 150 ? 'Muy agudo: baja bastante ↓' : 'Un poquito agudo: baja ↓', 'warn');
      ball.className = 'tball ' + (inTol ? 'ok' : 'warn');
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

// Anillo de puntaje
export function scoreRing(score, size = 120) {
  const r = 52, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, score));
  const col = v >= 0.7 ? 'var(--ok)' : v >= 0.45 ? 'var(--warn)' : 'var(--bad)';
  return h('div', { class: 'ring', style: `width:${size}px;height:${size}px`, html:
    `<svg viewBox="0 0 120 120" width="${size}" height="${size}"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/><circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c * v} ${c}" transform="rotate(-90 60 60)"/></svg><span>${Math.round(v * 100)}<small>%</small></span>` });
}
