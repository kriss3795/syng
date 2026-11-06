// Piezas compartidas de las sesiones: la hoja de resultado, el comentario del profe con IA y "Escúchate".
import { h, icon, scoreRing } from './ui.js';
import { say, chincol, verdict } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { askProfe, profeOn, readAloud, stopReading } from './profe.js';
import { getCtx } from './audio.js';
let nav = (x) => { location.hash = x; };
export function setNav(fn) { nav = fn; }

export const plain = (x) => String(x || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// El profe con IA comenta tu intento (si tienes cuenta). Mientras piensa, ves el consejo de siempre.
export function profeBox(kind, data) {
  if (!profeOn()) return h('button', { class: 'profe-ai off', onclick: () => nav('#cuenta') }, h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe con IA'), h('p', { class: 'small' }, 'Está apagado porque no has entrado a tu cuenta en este dispositivo. Toca aquí para entrar y te comentará cada intento.'));
  const box = h('div', { class: 'profe-ai thinking' }, h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe', h('span', { class: 'dots' }, h('i'), h('i'), h('i'))), h('p', { class: 'small muted' }, 'Escuchando tu intento…'));
  askProfe(kind, data).then((r) => {
    if (!box.isConnected && !document.body.contains(box)) return;
    if (!r.text) { box.classList.remove('thinking'); box.replaceChildren(h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe'), h('p', { class: 'small muted' }, 'No pude responder esta vez: ' + (r.error || 'sin conexión') + '.')); return; }
    const rd = h('button', { class: 'iconbtn small', 'aria-label': 'Escuchar', onclick: () => readAloud(r.text) }, icon('speaker', 16));
    box.classList.remove('thinking');
    box.replaceChildren(h('div', { class: 'pa-head' }, '🧑‍🏫 Tu profe', rd), h('p', {}, r.text));
  });
  return box;
}
export function listenRow(res) {
  if (!res.take && !res.model) return null;
  let url = null; let audio = null;
  const mine = res.take ? h('button', { class: 'btn small', onclick: () => { stopReading(); if (audio) { audio.pause(); audio = null; return; } url = url || URL.createObjectURL(res.take); audio = new Audio(url); audio.onended = () => (audio = null); audio.play().catch(() => {}); } }, '🎧 Escúchate') : null;
  const model = res.model ? h('button', { class: 'btn small', onclick: () => { stopReading(); getCtx(); res.model(); } }, '🎹 Cómo era') : null;
  return h('div', { class: 'listen-row' }, h('span', { class: 'small muted' }, 'Compara con tu oído:'), mine, model);
}
export function feedbackSheet(stage, res, { fails, easier, canEase, ex = {}, title = '' }) {
  return new Promise((resolve) => {
    const v = verdict(res.score);
    const top = (res.issues || [])[0];
    sfx(res.score >= 0.7 ? 'ok' : 'bad');
    const keep = res.keepView ? h('div', { class: 'keep' }, res.keepView) : h('div', { class: 'center sheet-bird' }, chincol(v.mood, 130));
    const sheet = h('div', { class: 'sheet ' + v.tone },
      h('div', { class: 'sheet-head' }, scoreRing(res.score, 72), h('div', {}, h('h2', {}, v.title), h('p', { class: 'small' }, res.detail || ''))),
      top ? say(`${top.text}<br><span class="tip">${top.tip}</span>`, v.mood, { voice: [v.voice, top.voice].filter(Boolean) })
        : say(res.score >= 0.7 ? 'Así se hace. Sigamos.' : 'Escucha con atención y vuelve a intentarlo.', v.mood, { voice: v.voice }),
      res.early ? h('p', { class: 'small ok-txt' }, '✨ Te salió tan bien que corté las rondas que faltaban.') : null,
      listenRow(res),
      profeBox('exercise', { clase: title, ejercicio: plain(ex.title || ex.text || ex.type).slice(0, 220), tipo: ex.type, puntaje: Math.round((res.score || 0) * 100) + '%', resultado: plain(res.detail), taller: res.taller || undefined, problemas: (res.issues || []).slice(0, 3).map((x) => plain(x.text)), desviacionCents: res.cents != null ? Math.round(res.cents) : null, intentoNumero: fails + 1, cortadoPorBuenResultado: !!res.early }),
      easier ? h('p', { class: 'small muted' }, 'Hiciste la versión más fácil. Cuando te sientas listo, repite la lección completa.') : null,
      h('div', { class: 'actionbar' },
        canEase ? h('button', { class: 'btn', onclick: () => { stopSpeaking(); resolve('easier'); } }, 'Hacerlo más fácil') : h('button', { class: 'btn', onclick: () => { stopSpeaking(); resolve('again'); } }, icon('repeat', 18), 'Repetir'),
        h('button', { class: 'btn ' + (res.score >= 0.7 ? 'primary' : 'secondary'), onclick: () => { stopSpeaking(); sfx('select'); resolve('next'); } }, res.score >= 0.7 ? 'Continuar' : 'Seguir igual')));
    stage.replaceChildren(h('div', { class: 'ex' }, keep, h('div', { class: 'grow' }), sheet));
  });
}
export const canMakeEasier = (ex) => ['seq', 'match', 'sustain', 'rhythm'].includes(ex.type);
export function makeEasier(ex) {
  const e = { ...ex };
  if (e.tol) e.tol = Math.min(200, Math.round(e.tol * 1.6));
  if (e.ttol) e.ttol = Math.round(e.ttol * 1.5);
  if (e.bpm) e.bpm = Math.round(e.bpm * 0.85);
  if (e.hold) e.hold = Math.max(0.6, e.hold * 0.7);
  if (e.secs) e.secs = Math.max(3, e.secs - 2);
  if (e.type === 'seq' && e.reps) { const r0 = e.reps[0]; e.reps = e.reps.map(() => r0); if (e.reps.length < 2) e.reps = [r0, r0]; } // mismo tono y una vuelta más
  if (e.feedback === 'after') e.feedback = 'live';
  e.text = (e.text ? e.text + '<br>' : '') + '<small>Versión más fácil: zona más ancha y más lento.</small>';
  e.voice = 'v_facil';
  return e;
}

