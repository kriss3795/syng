// Cantar con ganas: energía, proyección y presencia (no gritar).
// Mide dos cosas mientras cantas:
//  · Volumen comparado con TU voz hablada (cantar "apagado" = más bajito que cuando hablas).
//  · Proyección: energía entre 2 y 4 kHz respecto de los graves (la zona del "formante del cantante",
//    la que hace que una voz se escuche y "corte"; Sundberg). Se sube con "twang" y boca abierta, no apretando.
// La nota tiene que seguir afinada: energía con la garganta suelta, no gritos.
import { h, sleep, Roll } from './ui.js';
import { getCtx, readPitch, resetSmoother, playNote, readSpectrum } from './audio.js';
import { noteName } from './pitch.js';
import { voiceProfile, homeNote } from './store.js';
import { say } from './coach.js';
import { sfx } from './voice.js';
import { startButton, ensureMic, raf } from './exercises.js';
import { line } from './coach.js';

const dbOf = (rms) => 20 * Math.log10(Math.max(1e-5, rms));
export function brightnessNow() {
  const sp = readSpectrum(); if (!sp) return null;
  let low = 0, sf = 0;
  for (let j = 1; j < sp.db.length; j++) { const f = j * sp.binHz; if (f > 4000) break; if (f < 80) continue; const p = 10 ** (sp.db[j] / 10); if (f < 1000) low += p; else if (f >= 2000) sf += p; }
  return low > 0 ? 10 * Math.log10((sf + 1e-12) / low) : null;
}

export async function runEnergy(spec, root, sig) {
  const prof = voiceProfile();
  const ref = prof && prof.speakRms ? prof.speakRms : 0.04;
  const goal = spec.goal || 1.2; // veces el volumen de tu voz hablada
  if (!spec.noStart) await startButton(root, spec.text || line('ins_energia'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_energia'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const notes = spec.notes || [homeNote()];
  const per = []; let sharpN = 0, lowN = 0, dullN = 0;
  for (let i = 0; i < notes.length && !sig.aborted; i++) {
    const target = notes[i];
    const box = h('div');
    const gaugeFill = h('div', { class: 'eg-fill' });
    const gauge = h('div', { class: 'egauge' }, h('div', { class: 'eg-zone low' }, 'apagado'), h('div', { class: 'eg-zone ok' }, 'bien'), h('div', { class: 'eg-zone hi' }, '¡con ganas!'), gaugeFill, h('i', { class: 'eg-mark', style: `left:${Math.min(96, 50 * goal)}%` }));
    const brightFill = h('div', { class: 'eg-fill b' });
    const bright = h('div', { class: 'egauge small' }, brightFill);
    const canvas = h('canvas', { class: 'roll small' });
    const bar = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, `${spec.secs || 4} s con ganas`));
    root.replaceChildren(h('div', { class: 'ex' }, box,
      h('div', { class: 'row between' }, h('span', { class: 'pill' }, `${i + 1} de ${notes.length}`), h('span', { class: 'pill' }, spec.syl ? `"${spec.syl}" · ${noteName(target)}` : noteName(target))),
      h('small', { class: 'muted' }, 'Energía (volumen comparado con tu voz hablada)'), gauge,
      h('small', { class: 'muted' }, 'Proyección (brillo que hace que tu voz se escuche)'), bright,
      canvas, bar, h('div', { class: 'grow' })));
    const roll = new Roll(canvas, { span: 6, nowFrac: 0.9 }); roll.setRange(target - 5, target + 5); roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    box.replaceChildren(say('Escucha la nota…', 'canta', { compact: true }));
    playNote(target, c.currentTime + 0.05, 1.1, 0.28); await sleep(1350);
    box.replaceChildren(say(spec.cue || '¡Ahora! Con ganas, como si cantaras para alguien al fondo de la sala. Garganta suelta.', 'atento', { compact: true }));
    resetSmoother();
    let held = 0, last = c.currentTime, st = null, sm = 0, bsm = -40, lastTip = '';
    const fr = []; const t0 = c.currentTime;
    while (!sig.aborted) {
      const now = c.currentTime; const dt = Math.min(0.1, now - last); last = now;
      const p = readPitch();
      const cents = p.raw != null ? (p.raw - target) * 100 : null;
      sm = sm * 0.8 + p.rms * 0.2;
      const ratio = sm / ref;
      const bNow = p.raw != null ? brightnessNow() : null; if (bNow != null) bsm = bsm * 0.85 + bNow * 0.15;
      gaugeFill.style.width = Math.min(100, ratio * 50) + '%';
      gaugeFill.className = 'eg-fill ' + (ratio >= goal ? 'hi' : ratio >= 0.8 ? 'ok' : 'low');
      brightFill.style.width = Math.max(4, Math.min(100, (bsm + 40) * 3)) + '%';
      const tuned = cents != null && Math.abs(cents) <= (spec.tol || 120) / 2;
      if (cents != null && Math.abs(cents) < 200) { if (st == null) st = now; fr.push({ ratio, cents, b: bNow }); }
      const good = tuned && ratio >= goal;
      if (good) held += dt;
      bar.firstChild.style.width = Math.min(100, (held / (spec.secs || 4)) * 100) + '%';
      const tip = cents == null ? '' : ratio < 0.8 ? 'low' : !tuned ? (cents > 0 ? 'sharp' : 'flat') : ratio < goal ? 'more' : 'ok';
      if (tip !== lastTip && st != null) {
        lastTip = tip;
        const T = { low: ['¡Más voz! Estás más bajito que cuando hablas.', 'atento'], more: ['Bien… ¡un poco más de ganas!', 'atento'], ok: ['¡Eso es cantar con ganas! Sostenlo.', 'celebra'], sharp: ['Ojo: con la fuerza se te sube la nota. Más aire, menos apretar.', 'piensa'], flat: ['Con energía, pero la nota quedó baja: piénsala más arriba.', 'piensa'] };
        if (T[tip]) box.replaceChildren(say(T[tip][0], T[tip][1], { compact: true }));
      }
      roll.addUser(now, p.midi, tuned); roll.draw(now);
      if (held >= (spec.secs || 4)) break;
      if (now - t0 > (spec.timeout || 14)) break;
      await raf();
    }
    roll.destroy();
    const v = fr.slice(Math.floor(fr.length * 0.15));
    if (v.length < 15) { per.push(0); continue; }
    const rMed = v.map((f) => f.ratio).sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const cMean = v.reduce((a, f) => a + f.cents, 0) / v.length;
    const bs = v.map((f) => f.b).filter((x) => x != null); const bMed = bs.length ? bs.sort((a, b) => a - b)[Math.floor(bs.length / 2)] : null;
    if (rMed < 0.8) lowN++; if (cMean > 25 && rMed >= goal) sharpN++; if (bMed != null && bMed < -30) dullN++;
    per.push(0.5 * Math.min(1, held / (spec.secs || 4)) + 0.3 * Math.min(1, rMed / goal) + 0.2 * (bMed == null ? 0.5 : Math.max(0, Math.min(1, (bMed + 32) / 14))));
    if (held >= (spec.secs || 4)) sfx('ok');
    await sleep(350);
  }
  const issues = [];
  if (lowN) issues.push({ key: 'timido', voice: 'd_apagado', weight: 70, text: 'Cantaste <b>más apagado que tu voz hablada</b>.', tip: 'Imagina que le cantas a alguien al fondo de una sala. Más aire y boca más abierta, sin apretar la garganta.' });
  if (sharpN) issues.push({ key: 'sube_fuerte', voice: 'd_sube_fuerte', weight: 60, text: 'Con la fuerza <b>se te sube la nota</b>.', tip: 'La energía viene del aire y del cuerpo, no de apretar el cuello. Si raspa, baja un poco.' });
  if (dullN) issues.push({ key: 'opaco', voice: 'd_opaco', weight: 50, text: 'Tu voz suena <b>opaca</b>: le falta proyección.', tip: 'Prueba con "nyeh" (como un niño molestando): ese brillo, el "twang", hace que la voz se escuche sin gritar.' });
  const score = per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
  return { score, issues, detail: `Llegaste a la zona "con ganas" (${goal}× tu voz hablada) en ${per.filter((x) => x >= 0.7).length} de ${per.length} notas.` };
}
