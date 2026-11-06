// "Tu nota cómoda para cantar". La voz hablada suele quedar en la parte baja de lo cómodo para cantar:
// a muchos les acomoda cantar varios semitonos más arriba (el rango cómodo, o "tesitura", no es la voz hablada).
// Por eso no lo adivino: pruebas notas desde un poco bajo tu voz hablada hasta bastante más arriba, y para cada una
// mido (1) si llegas a la nota, (2) qué tan pareja la sostienes y (3) te pregunto cómo se sintió.
// Lo que se mide y lo que sientes valen juntos: un profe también te pregunta "¿cómo se siente?".
import { h, sleep, tuner } from './ui.js';
import { getCtx, readPitch, resetSmoother, playNote } from './audio.js';
import { noteName } from './pitch.js';
import { voiceProfile, setVoiceProfile, getRange } from './store.js';
import { say } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { ensureMic, raf, fold } from './exercises.js';

const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export async function runComfort(spec, root, sig) {
  stopSpeaking();
  const v = voiceProfile() || {}; const R = getRange();
  const spk = v.speak ? Math.round(v.speak) : R.guessed ? 48 : Math.round(R.low + 3);
  const steps = [-2, 0, 2, 4, 5, 7, 9, 11].map((s) => spk + s).filter((m) => R.guessed || (m >= R.low - 1 && m <= R.high + 1));
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say(`<b>Busquemos tu nota cómoda para cantar.</b> Tu voz al hablar ${v.speak ? `ronda <b>${noteName(spk)}</b>` : 'es nuestro punto de partida'}, pero para cantar mucha gente está más cómoda <b>algunas notas más arriba</b>. No lo voy a adivinar: vas a probar ${steps.length} notas y en cada una mido si llegas y qué tan pareja te sale, y <b>tú me dices cómo se sintió</b>.`, 'feliz'),
    h('p', { class: 'small muted' }, 'Canta cada una con "uuu" o "mmm", con la fuerza de una conversación. Si una te cuesta, dilo: también es información.'),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); getCtx(); res(); } }, 'Empezar')))));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx(); const per = [];
  for (let i = 0; i < steps.length && !sig.aborted; i++) {
    const m = steps[i];
    const tu = tuner(100); tu.setTol(100);
    const box = h('div'); const clock = h('div', { class: 'small muted center' });
    root.replaceChildren(h('div', { class: 'ex' }, h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Nota ${i + 1} de ${steps.length}`), h('span', { class: 'pill' }, noteName(m))), box, tu.el, clock, h('div', { class: 'grow' })));
    box.replaceChildren(say('👂 Escucha…', 'canta', { compact: true }));
    playNote(m, c.currentTime + 0.05, 1.3, 0.3); await sleep(1700);
    box.replaceChildren(say('Ahora tú: <b>"uuu"</b> en esa nota, 3 segundos, parejo y sin apretar.', 'atento', { compact: true }));
    resetSmoother(); const t0 = c.currentTime; const fr = [];
    while (!sig.aborted && c.currentTime - t0 < 4) {
      const p = readPitch(); const pm = fold(p.midi, m); tu.update(pm, m);
      if (pm != null) fr.push({ c: (pm - m) * 100, rms: p.rms });
      clock.textContent = Math.max(0, 4 - (c.currentTime - t0)).toFixed(1) + ' s';
      await raf();
    }
    if (sig.aborted) break;
    const near = fr.filter((f) => Math.abs(f.c) < 150);
    const reach = near.length / Math.max(1, fr.length || 1);
    const cs = near.slice(Math.floor(near.length * 0.3)).map((f) => f.c);
    const mean = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
    const sd = cs.length > 10 ? Math.sqrt(cs.reduce((a, b) => a + (b - mean) ** 2, 0) / cs.length) : null;
    const voiced = fr.length / Math.max(1, (4 * 60));
    const feel = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
      say(`<b>${noteName(m)}:</b> ` + (cs.length > 10 ? `llegaste y la sostuviste${sd != null ? (sd < 15 ? ' muy pareja' : sd < 30 ? ' bastante pareja' : ', aunque temblando un poco') : ''}.` : 'no logré oírte en esa nota.') + ' <b>¿Cómo se sintió en tu garganta?</b>', 'atento'),
      h('div', { class: 'feel-opts' },
        h('button', { class: 'btn big', onclick: () => res(2) }, '😌 Cómoda, me sale fácil'),
        h('button', { class: 'btn big', onclick: () => res(1) }, '😐 Más o menos'),
        h('button', { class: 'btn big', onclick: () => res(0) }, '😣 Me costó o la apreté')), h('div', { class: 'grow' }))));
    sfx('select');
    // puntaje: llegar (30%), estabilidad (30%), cómo se sintió (40%)
    const stab = sd == null ? 0 : Math.max(0, Math.min(1, 1 - (sd - 10) / 35));
    const score = 0.3 * Math.min(1, reach / 0.6) * (cs.length > 10 ? 1 : 0) + 0.3 * stab + 0.4 * (feel / 2);
    per.push({ m, score, feel, sd, voiced });
    if (feel === 0 && i >= 3 && per.slice(-2).every((x) => x.feel === 0)) break; // dos seguidas incómodas arriba: no seguimos subiendo
  }
  if (sig.aborted || !per.length) return { score: 0 };
  // la zona cómoda: el tramo de 3 notas seguidas con mejor puntaje
  let best = null;
  for (let i = 0; i < per.length; i++) { const w = per.slice(i, i + 3); if (w.length < Math.min(3, per.length)) break; const sc = w.reduce((a, b) => a + b.score, 0) / w.length - 0.01 * Math.abs(w[Math.floor(w.length / 2)].m - (spk + 3)); if (!best || sc > best.sc) best = { sc, lo: w[0].m, hi: w[w.length - 1].m, mid: w[Math.floor(w.length / 2)].m }; }
  const comfort = best.mid; const diff = comfort - spk;
  setVoiceProfile({ comfort, comfortLo: best.lo, comfortHi: best.hi, comfortAt: Date.now() });
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say(`<b>Tu nota cómoda para cantar es ${noteName(comfort)}</b> (tu zona cómoda: ${noteName(best.lo)}–${noteName(best.hi)}). ` + (diff >= 2 ? `Está <b>${diff} semitonos más arriba</b> que tu voz al hablar: al cantar te acomoda más arriba que al hablar, y es muy común.` : diff <= -1 ? 'Está un poco bajo tu voz hablada: tu voz cantada es grave y cálida.' : 'Coincide con tu voz al hablar: cantas cómodo justo donde hablas.') + ' <b>Desde ahora los ejercicios parten de esta nota.</b>', 'celebra'),
    h('div', { class: 'card comfort-chart' }, ...per.map((x) => h('div', { class: 'cc-row' + (x.m >= best.lo && x.m <= best.hi ? ' in' : '') }, h('span', { class: 'cc-n' }, noteName(x.m)), h('div', { class: 'cc-bar' }, h('i', { style: `width:${Math.round(x.score * 100)}%` })), h('span', { class: 'cc-f' }, ['😣', '😐', '😌'][x.feel])))),
    h('p', { class: 'small muted' }, 'Cada barra combina: si llegaste a la nota, qué tan pareja la sostuviste y cómo la sentiste. Tu zona cómoda puede subir con la práctica: repite esta prueba en unas semanas.'),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Listo')))));
  return { score: 1, info: true, detail: `Tu nota cómoda: ${noteName(comfort)}.` };
}
