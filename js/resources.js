// Prueba de recursos vocales: tú pruebas 9 recursos (falsete, vibrato, deslizar, adornos, voz íntima,
// voz llena, messa di voce, twang y quiebre) y mido cuáles te salen naturalmente.
// Todo se compara con TU voz normal (la primera prueba), no con una voz ideal:
//  · Falsete y quiebre: H1–H2 (diferencia entre el 1er y 2º armónico). En falsete el 1er armónico domina
//    más que en voz de pecho (Hanson 1997; Sundberg). Es un indicio acústico, no una certeza.
//  · Twang y voz llena: energía 2–4 kHz respecto de los graves (formante del cantante, Sundberg).
//  · Vibrato: 4–8 oscilaciones por segundo y ±12–120 cents (Prame 1994).
//  · Volumen: dB relativo a tu voz normal. Afinación: cents contra la nota pedida (octava libre).
import { h, sleep, levelMeter } from './ui.js';
import { getCtx, readPitch, resetSmoother, playNote, playGlide, readSpectrum } from './audio.js';
import { noteName } from './pitch.js';
import { load, save, homeNote, getRange } from './store.js';
import { say } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { ensureMic, raf } from './exercises.js';
import { brightnessNow } from './energy.js';

const dbOf = (rms) => 20 * Math.log10(Math.max(1e-5, rms));
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const sd = (a) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const clamp = (x) => Math.max(0, Math.min(1, x));
const octFree = (raw, target) => { let d = (raw - target) * 100; while (d > 600) d -= 1200; while (d < -600) d += 1200; return d; };

// H1–H2: dB del 1er armónico menos el 2º (busca el pico cerca de f0 y de 2·f0)
function h1h2(midi) {
  const sp = readSpectrum(); if (!sp || midi == null) return null;
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const peak = (f) => { const c = Math.round(f / sp.binHz), w = Math.max(2, Math.round((f * 0.04) / sp.binHz)); let m = -Infinity; for (let j = Math.max(1, c - w); j <= c + w && j < sp.db.length; j++) m = Math.max(m, sp.db[j]); return m; };
  const a = peak(f0), b = peak(2 * f0);
  return isFinite(a) && isFinite(b) ? a - b : null;
}

// Graba "secs" segundos de cuadros: {t, raw, rms, h12, br}
async function capture(secs, sig, onFrame) {
  const c = getCtx(); resetSmoother(); const fr = []; const t0 = c.currentTime;
  while (!sig.aborted && c.currentTime - t0 < secs) {
    const p = readPitch(); const t = c.currentTime - t0;
    const f = { t, raw: p.raw, rms: p.rms, h12: p.raw != null ? h1h2(p.raw) : null, br: p.raw != null ? brightnessNow() : null };
    fr.push(f); onFrame && onFrame(f, t);
    await raf();
  }
  return fr;
}
const voiced = (fr) => fr.filter((f) => f.raw != null);

const L = { // a qué clase llevarte para practicar cada recurso
  falsete: 'u7l4', vibrato: 'est1', deslizar: 'res3', adornos: 'res2', intima: 'res1', llena: 'res5', messa: 'din3', twang: 'ene2', quiebre: 'res4',
};

// Cada recurso: qué es, cómo se hace, la nota (relativa a tu "nota de casa"), el ejemplo y cómo se mide.
function resourceList(hn, R) {
  const top = Math.min(R.high + 4, hn + 10);
  return [
    { id: 'falsete', icon: '🪶', name: 'Falsete', secs: 4, note: top,
      what: 'Una voz <b>ligera y aflautada</b>, como cuando imitas a un niño o haces "uuuh" de fantasma. Es otra forma de vibrar de tus cuerdas: más finas y sueltas.',
      how: `Canta un <b>"uuu"</b> suave y aireado en esta nota alta (${noteName(top)}), sin empujar. Si se te quiebra la voz al llegar, ¡perfecto, eso buscamos!`,
      demo: (c) => playNote(top, c.currentTime + 0.05, 1.6, 0.22),
      score: (fr, base) => {
        const v = voiced(fr).filter((f) => Math.abs(octFree(f.raw, top)) < 120);
        const held = v.length / Math.max(1, fr.length);
        const dh = med(v.map((f) => f.h12).filter((x) => x != null)) - base.h12;
        const quality = isFinite(dh) ? clamp((dh - 1) / 5) : 0;
        const s = 0.5 * clamp(held / 0.5) + 0.5 * quality;
        return { s, detail: held < 0.2 ? `No logré oír la nota ${noteName(top)} sostenida.` : `Llegaste a ${noteName(top)}` + (isFinite(dh) ? (dh >= 3 ? ` y tu sonido cambió como cambia el falsete (1er armónico +${Math.round(dh)} dB respecto de tu voz normal).` : ' pero tu sonido se parece a tu voz normal: probablemente fue voz de pecho o mixta, no falsete.') : '.') };
      } },
    { id: 'vibrato', icon: '〰️', name: 'Vibrato', secs: 5, note: hn,
      what: 'Una <b>ondulación pareja</b> de la nota, como un temblor bonito (5 a 7 veces por segundo). Aparece cuando la voz está suelta, no se fuerza.',
      how: `Sostén un <b>"aaa"</b> cómodo en ${noteName(hn)} y, a la mitad, deja que la nota ondule: imagina que la mueves suave "arriba-abajo", sin mover la mandíbula.`,
      demo: (c) => { const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain(); o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((hn - 69) / 12); l.frequency.value = 5.5; lg.gain.value = o.frequency.value * 0.025; l.connect(lg); lg.connect(o.frequency); g.gain.value = 0.2; o.connect(g); g.connect(c.destination); const t = c.currentTime + 0.05; o.start(t); l.start(t); g.gain.setValueAtTime(0.2, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 2.4); o.stop(t + 2.5); l.stop(t + 2.5); },
      score: (fr) => {
        const v = voiced(fr).map((f) => ({ t: f.t, c: octFree(f.raw, hn) })).filter((f) => Math.abs(f.c) < 250);
        if (v.length < 40) return { s: 0, detail: 'No logré oír una nota sostenida.' };
        let best = { rate: 0, ext: 0 };
        const w = 12; const det = [];
        for (let k = w; k < v.length - w; k++) { let a = 0; for (let j = k - w; j <= k + w; j++) a += v[j].c; det.push({ t: v[k].t, c: v[k].c - a / (2 * w + 1) }); }
        for (let s0 = 0; s0 + 45 < det.length; s0 += 15) { // la mejor ventana de ~1,5 s
          const seg = det.slice(s0, s0 + 45); let cross = 0; for (let k = 1; k < seg.length; k++) if ((seg[k - 1].c < 0) !== (seg[k].c < 0)) cross++;
          const dur = seg[seg.length - 1].t - seg[0].t; const rate = dur > 0 ? cross / 2 / dur : 0;
          const ext = Math.sqrt(seg.reduce((a, d) => a + d.c * d.c, 0) / seg.length) * Math.SQRT2;
          const ok = (rate >= 4 && rate <= 8 ? 1 : 0) + (ext >= 20 && ext <= 120 ? 1 : 0);
          if (ok > ((best.rate >= 4 && best.rate <= 8 ? 1 : 0) + (best.ext >= 20 && best.ext <= 120 ? 1 : 0))) best = { rate, ext };
        }
        const rOk = best.rate >= 4 && best.rate <= 8, eOk = best.ext >= 20 && best.ext <= 120;
        return { s: rOk && eOk ? 1 : rOk || eOk ? 0.45 : 0.1,
          detail: rOk && eOk ? `¡Vibrato! ≈${best.rate.toFixed(1)} ondas por segundo, ±${Math.round(best.ext)} cents (lo normal: 4–8 por segundo).` : best.ext > 120 ? 'La nota se movió mucho, más un vaivén que un vibrato.' : 'No detecté una ondulación pareja todavía. Es normal: el vibrato aparece solo cuando la voz está suelta.' };
      } },
    { id: 'deslizar', icon: '🛝', name: 'Deslizar (portamento)', secs: 5, note: hn,
      what: 'Pasar de una nota a otra <b>resbalando</b> por todas las de en medio, sin cortes. Da emoción y estilo (muy usado en baladas y en música latina).',
      how: `Escucha: de ${noteName(hn)} sube despacio a ${noteName(hn + 5)} y baja de nuevo, como una sirena corta. Hazlo con <b>"uuu"</b>, sin cortar el sonido.`,
      demo: (c) => { const t = c.currentTime + 0.05; playGlide(hn, hn + 5, t, 1.6, 0.22); playGlide(hn + 5, hn, t + 1.6, 1.6, 0.22); },
      score: (fr) => {
        const v = voiced(fr); if (v.length < 30) return { s: 0, detail: 'No logré oír tu sonido.' };
        const c = v.map((f) => octFree(f.raw, hn));
        const span = Math.max(...c) - Math.min(...c);
        let jumps = 0; for (let k = 1; k < v.length; k++) if (Math.abs(c[k] - c[k - 1]) > 90 && v[k].t - v[k - 1].t < 0.1) jumps++;
        const cont = v.length / Math.max(1, fr.length);
        const s = clamp(span / 450) * (0.6 + 0.2 * clamp(1 - jumps / 4) + 0.2 * clamp(cont / 0.6));
        return { s, detail: `Recorriste ${(span / 100).toFixed(1)} semitonos (pedí 5)` + (span < 250 ? ': casi no te moviste de la nota; deja que la voz suba y baje como sirena.' : jumps > 1 ? ` con ${jumps} saltos: une más, como un tobogán.` : ', de forma continua. ¡Bien unido!') };
      } },
    { id: 'adornos', icon: '🎶', name: 'Adornos y agilidad', secs: 5, note: hn,
      what: 'Varias notas rápidas sobre una sola vocal (melisma). Es lo que hacen cantantes de soul, pop y R&B, y también la ópera.',
      how: `Escucha el adorno y repítelo con <b>"aaa"</b>: ${noteName(hn)}–${noteName(hn + 2)}–${noteName(hn + 4)}–${noteName(hn + 2)}–${noteName(hn)}, dos veces seguidas.`,
      seq: [0, 2, 4, 2, 0, 2, 4, 2, 0],
      demo: (c) => { const t = c.currentTime + 0.05; [0, 2, 4, 2, 0, 2, 4, 2, 0].forEach((s, k) => playNote(hn + s, t + k * 0.28, 0.27, 0.22)); },
      score: (fr) => {
        const v = voiced(fr); if (v.length < 20) return { s: 0, detail: 'No logré oír tu sonido.' };
        // notas "planas" detectadas en orden
        const seg = []; let cur = null;
        for (const f of v) { const st = Math.round(octFree(f.raw, hn) / 100); if (cur && cur.st === st) cur.n++; else { cur = { st, n: 1 }; seg.push(cur); } }
        const notes = seg.filter((x) => x.n >= 3).map((x) => x.st).filter((x, k, a) => k === 0 || x !== a[k - 1]);
        const want = [0, 2, 4, 2, 0, 2, 4, 2, 0]; let i = 0;
        for (const n of notes) if (i < want.length && Math.abs(n - want[i]) <= 1) i++;
        return { s: clamp(i / want.length), detail: `Reconocí ${i} de ${want.length} notas del adorno en orden.` + (i >= 7 ? ' ¡Tienes agilidad!' : i >= 4 ? ' Vas bien; con práctica lenta sale más limpio.' : ' Empieza más lento y ve subiendo la velocidad.') };
      } },
    { id: 'intima', icon: '🎙️', name: 'Voz íntima', secs: 4, note: hn + 2,
      what: 'Cantar <b>suave, cerca y afinado</b>, como si cantaras al oído. Muy usado en versos y baladas. Lo difícil es que no se caiga la afinación.',
      how: `Canta <b>"mmm-aaa"</b> en ${noteName(hn + 2)} lo más suave que puedas <b>sin susurrar</b> y sin que se corte, 4 segundos.`,
      demo: (c) => playNote(hn + 2, c.currentTime + 0.05, 1.6, 0.1),
      score: (fr, base) => {
        const v = voiced(fr).filter((f) => Math.abs(octFree(f.raw, hn + 2)) < 120);
        if (v.length < 25) return { s: 0, detail: 'Tu voz se cortó o no llegó a la nota: canta un poquito más fuerte.' };
        const dDb = med(v.map((f) => dbOf(f.rms))) - base.db; const cents = med(v.map((f) => octFree(f.raw, hn + 2)));
        const soft = clamp((-dDb - 2) / 8), tune = clamp(1 - (Math.abs(cents) - 20) / 40), cont = clamp(v.length / Math.max(1, fr.length) / 0.6);
        return { s: soft * (0.3 + 0.45 * tune + 0.25 * cont), detail: `Bajaste ${Math.max(0, Math.round(-dDb))} dB respecto de tu voz normal y quedaste a ${Math.round(cents)} cents de la nota` + (tune < 0.6 ? ' (al cantar suave tiendes a desafinar: es lo que más se entrena).' : '.') };
      } },
    { id: 'llena', icon: '📣', name: 'Voz llena', secs: 4, note: hn + 4,
      what: 'Cantar <b>con cuerpo y fuerza</b>, como en un coro de rock o pop, pero con la garganta suelta (sin gritar).',
      how: `Canta <b>"¡ey!"</b> o <b>"¡yeah!"</b> sostenido en ${noteName(hn + 4)} con ganas, como llamando a alguien al otro lado de la calle. Que no duela.`,
      demo: (c) => playNote(hn + 4, c.currentTime + 0.05, 1.6, 0.32),
      score: (fr, base) => {
        const v = voiced(fr).filter((f) => Math.abs(octFree(f.raw, hn + 4)) < 120);
        if (v.length < 25) return { s: 0, detail: 'No logré oír la nota sostenida.' };
        const dDb = med(v.map((f) => dbOf(f.rms))) - base.db; const dBr = med(v.map((f) => f.br).filter((x) => x != null)) - base.br; const cents = med(v.map((f) => octFree(f.raw, hn + 4)));
        const loud = clamp((dDb - 1) / 6), bright = isFinite(dBr) ? clamp((dBr + 1) / 5) : 0.5, tune = clamp(1 - (Math.abs(cents) - 25) / 40);
        return { s: loud * (0.4 + 0.3 * bright + 0.3 * tune), detail: `Subiste ${Math.round(dDb)} dB` + (isFinite(dBr) ? ` y tu brillo ${dBr >= 2 ? 'aumentó' : 'casi no cambió'}` : '') + ` (a ${Math.round(cents)} cents de la nota)` + (cents > 35 ? '. Al empujar te vas alto: más espacio en la boca, menos presión.' : '.') };
      } },
    { id: 'messa', icon: '🌊', name: 'Crecer y apagar (messa di voce)', secs: 6, note: hn,
      what: 'Empezar una nota <b>suave, crecer y volver a apagarla</b> sin que se mueva la afinación. Es el ejercicio clásico de control (bel canto).',
      how: `En ${noteName(hn)}, con <b>"aaa"</b>: 3 segundos creciendo de suave a fuerte y 3 segundos apagándote. La nota no debe subir ni bajar.`,
      demo: (c) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((hn - 69) / 12); const t = c.currentTime + 0.05; g.gain.setValueAtTime(0.02, t); g.gain.linearRampToValueAtTime(0.32, t + 1.4); g.gain.linearRampToValueAtTime(0.01, t + 2.8); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 2.9); },
      score: (fr) => {
        const v = voiced(fr); if (v.length < 40) return { s: 0, detail: 'No logré oír una nota sostenida.' };
        const n = v.length, th = (a, b) => med(v.slice(Math.floor(n * a), Math.floor(n * b)).map((f) => dbOf(f.rms)));
        const start = th(0, 0.15), mid = Math.max(th(0.35, 0.5), th(0.5, 0.65)), end = th(0.85, 1);
        const swell = Math.min(mid - start, mid - end);
        const cs = v.map((f) => octFree(f.raw, hn)); const drift = sd(cs);
        return { s: clamp(swell / 8) * (0.6 + 0.4 * clamp(1 - (drift - 12) / 30)), detail: (swell < 2 ? 'Tu volumen casi no creció y bajó: empieza muy suave y crece de a poco hasta la mitad' : `Tu volumen subió ${Math.round(mid - start)} dB y bajó ${Math.round(mid - end)} dB`) + `; la nota se movió ±${Math.round(drift)} cents` + (drift > 30 ? ' (al crecer, la nota tiende a subir: piensa la nota "quieta").' : '.') };
      } },
    { id: 'twang', icon: '🦆', name: 'Twang (brillo)', secs: 4, note: hn + 2,
      what: 'Un sonido <b>brillante y metálico</b> que hace que tu voz se escuche sin gritar. Se logra estrechando un poco la parte de arriba de la garganta (como imitar a un pato o una bruja).',
      how: `Primero di <b>"ñee-ñee"</b> como una bruja traviesa. Luego canta <b>"ñeee"</b> sostenido en ${noteName(hn + 2)} con ese mismo brillo, sin subir el volumen.`,
      demo: (c) => playNote(hn + 2, c.currentTime + 0.05, 1.6, 0.22),
      score: (fr, base) => {
        const v = voiced(fr); if (v.length < 25) return { s: 0, detail: 'No logré oír la nota sostenida.' };
        const dBr = med(v.map((f) => f.br).filter((x) => x != null)) - base.br; const dDb = med(v.map((f) => dbOf(f.rms))) - base.db;
        const held = clamp(v.filter((f) => Math.abs(octFree(f.raw, hn + 2)) < 100).length / Math.max(1, fr.length) / 0.6);
        const s = clamp((dBr - 0.5) / 5) * (dDb > 8 ? 0.8 : 1) * held;
        return { s, detail: isFinite(dBr) ? `Tu brillo (energía 2–4 kHz) ${dBr >= 0 ? 'subió' : 'bajó'} ${Math.abs(dBr).toFixed(1)} dB respecto de tu voz normal` + (dDb > 8 ? ', pero también subiste mucho el volumen: el twang no necesita fuerza.' : '.') : 'No pude medir el brillo.' };
      } },
    { id: 'quiebre', icon: '🎢', name: 'Quiebre a falsete (yodel)', secs: 5, note: hn + 3,
      what: 'Saltar <b>de voz de pecho a falsete</b> a propósito, haciendo que se note el cambio. Lo usan el pop, el folk y la música mexicana como adorno.',
      how: `Canta <b>"o-íii"</b>: la "o" en ${noteName(hn + 3)} con tu voz normal, y salta a la "íii" en ${noteName(top)} dejando que la voz se quiebre a falsete. Dos veces.`,
      demo: (c) => { const t = c.currentTime + 0.05; [0, 1.2].forEach((d) => { playNote(hn + 3, t + d, 0.5, 0.26); playNote(top, t + d + 0.5, 0.6, 0.16); }); },
      score: (fr) => {
        const v = voiced(fr); if (v.length < 20) return { s: 0, detail: 'No logré oír tu sonido.' };
        let jumps = 0, qual = 0;
        for (let k = 3; k < v.length - 3; k++) {
          const a = v[k - 3], b = v[k + 3];
          if (b.raw - a.raw > 4 && b.t - a.t < 0.25) { jumps++; if (a.h12 != null && b.h12 != null && b.h12 - a.h12 > 3) qual++; k += 10; }
        }
        return { s: clamp(0.6 * Math.min(1, jumps / 2) + 0.4 * Math.min(1, qual / 1)), detail: jumps ? `Detecté ${jumps} salto${jumps > 1 ? 's' : ''} rápido${jumps > 1 ? 's' : ''} hacia arriba` + (qual ? ' con el cambio de color típico del falsete. ¡Ese quiebre es un recurso!' : ', pero sin cambio claro de color: quizás no pasaste a falsete.') : 'No detecté un salto rápido hacia arriba: deja que la voz "se rompa" sin miedo.' };
      } },
  ];
}

export async function runResources(spec, root, sig) {
  stopSpeaking();
  const hn = homeNote(); const R = getRange(); const c = () => getCtx();
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say('<b>Probemos recursos vocales.</b> Son herramientas que usan los cantantes para dar color y emoción: falsete, vibrato, deslizar, adornos, voz íntima, voz llena y más.<br><br>Te explico cada uno, te doy un ejemplo y lo pruebas. Yo mido cuáles te salen más naturales <b>comparando con tu voz normal</b>. No hay respuestas malas: es para descubrir tus fortalezas. Unos 5 minutos.', 'feliz'),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); getCtx(); res(); } }, 'Empezar')))));
  if (!(await ensureMic(root))) return { score: 0 };

  // 0) tu voz normal, la referencia
  const meter = levelMeter();
  const baseBox = h('div'); const clock = h('div', { class: 'bignote' }, '');
  let base = null;
  while (!base && !sig.aborted) {
    await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, say(`Primero, <b>tu voz normal</b>: canta <b>"aaa"</b> en ${noteName(hn)}, cómodo, como cantarías cualquier canción. 3 segundos.`, 'atento'), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res(); } }, 'Cantar')))));
    root.replaceChildren(h('div', { class: 'ex' }, baseBox, h('div', { class: 'center' }, h('span', { class: 'pill' }, noteName(hn)), clock), meter.el, h('div', { class: 'grow' })));
    baseBox.replaceChildren(say('Escucha…', 'canta', { compact: true })); playNote(hn, c().currentTime + 0.05, 1, 0.24); await sleep(1300);
    baseBox.replaceChildren(say('¡Ahora! "aaa" normal.', 'atento', { compact: true }));
    const fr = await capture(3.2, sig, (f, t) => { meter.set(Math.min(1, f.rms * 7)); clock.textContent = Math.max(0, 3.2 - t).toFixed(1) + ' s'; });
    const v = voiced(fr);
    if (v.length >= 30) base = { db: med(v.map((f) => dbOf(f.rms))), h12: med(v.map((f) => f.h12).filter((x) => x != null)) ?? 0, br: med(v.map((f) => f.br).filter((x) => x != null)) ?? -20 };
    else baseBox.replaceChildren(say('No logré oírte bien. Acércate al micrófono y repite.', 'piensa', { tone: 'warn' }));
    if (!base) await sleep(1500);
  }
  if (sig.aborted) return { score: 0 };

  const list = resourceList(hn, R); const results = [];
  for (let i = 0; i < list.length && !sig.aborted; i++) {
    const r = list[i]; let result = null;
    while (!result && !sig.aborted) {
      const choice = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
        h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Recurso ${i + 1} de ${list.length}`), h('span', { class: 'pill' }, r.icon + ' ' + r.name)),
        say(`<b>${r.icon} ${r.name}.</b> ${r.what}`, 'feliz'),
        h('div', { class: 'teach', html: '<b>Cómo:</b> ' + r.how }),
        h('button', { class: 'btn', onclick: () => { sfx('select'); r.demo(c()); } }, '🔊 Escuchar el ejemplo'),
        h('div', { class: 'grow' }),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn ghost', onclick: () => res('skip') }, 'Saltar'), h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res('go'); } }, 'Probar')))));
      if (choice === 'skip') { result = { id: r.id, s: null, detail: 'Lo saltaste.' }; break; }
      const box = h('div'); const clk = h('div', { class: 'bignote' }, '');
      root.replaceChildren(h('div', { class: 'ex' }, box, h('div', { class: 'center' }, h('span', { class: 'pill' }, r.icon + ' ' + r.name), clk), meter.el, h('div', { class: 'grow' })));
      box.replaceChildren(say('Escucha…', 'canta', { compact: true })); r.demo(c()); await sleep(r.id === 'messa' || r.id === 'deslizar' ? 3400 : r.id === 'adornos' || r.id === 'quiebre' ? 2700 : 1900);
      box.replaceChildren(say('¡Tu turno!', 'atento', { compact: true }));
      const fr = await capture(r.secs, sig, (f, t) => { meter.set(Math.min(1, f.rms * 7)); clk.textContent = Math.max(0, r.secs - t).toFixed(1) + ' s'; });
      if (sig.aborted) break;
      const sc = r.score(fr, base);
      const tone = sc.s >= 0.7 ? 'ok' : sc.s >= 0.4 ? '' : 'warn';
      const again = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
        say((sc.s >= 0.7 ? '<b>¡Te sale natural!</b> ' : sc.s >= 0.4 ? '<b>Va saliendo.</b> ' : '<b>Todavía no sale.</b> ') + sc.detail, sc.s >= 0.7 ? 'celebra' : 'piensa', { tone }),
        h('div', { class: 'res-meter' }, h('div', { class: 'pfill ' + (tone || 'mid'), style: `width:${Math.round(sc.s * 100)}%` })),
        h('div', { class: 'grow' }),
        h('div', { class: 'actionbar' }, h('button', { class: 'btn ghost', onclick: () => res(true) }, 'Otra vez'), h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res(false); } }, i < list.length - 1 ? 'Siguiente recurso' : 'Ver mis resultados')))));
      if (sc.s >= 0.7) sfx('combo', 3);
      if (!again) result = { id: r.id, s: +sc.s.toFixed(2), detail: sc.detail };
    }
    if (result) results.push(result);
  }
  if (sig.aborted) return { score: 0 };
  const test = { at: Date.now(), hn, results };
  const s = load(); s.resTests = [...(s.resTests || []), test].slice(-6); save();
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' }, resourcesView(test, list), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Listo')))));
  const done = results.filter((x) => x.s != null);
  return { score: 1, info: true, detail: `Probaste ${done.length} recursos.` };
}

export const RES_INFO = { falsete: ['🪶', 'Falsete'], vibrato: ['〰️', 'Vibrato'], deslizar: ['🛝', 'Deslizar'], adornos: ['🎶', 'Adornos y agilidad'], intima: ['🎙️', 'Voz íntima'], llena: ['📣', 'Voz llena'], messa: ['🌊', 'Crecer y apagar'], twang: ['🦆', 'Twang (brillo)'], quiebre: ['🎢', 'Quiebre a falsete'] };
export const RES_LESSON = L;
export function lastResTest() { return (load().resTests || []).slice(-1)[0] || null; }

export function resourcesView(test) {
  const rs = test.results.filter((x) => x.s != null).sort((a, b) => b.s - a.s);
  const nat = rs.filter((x) => x.s >= 0.7), mid = rs.filter((x) => x.s >= 0.4 && x.s < 0.7), low = rs.filter((x) => x.s < 0.4);
  const item = (x) => h('div', { class: 'res-item' }, h('div', { class: 'row between' }, h('b', {}, RES_INFO[x.id][0] + ' ' + RES_INFO[x.id][1]), h('span', { class: 'pill' }, Math.round(x.s * 100) + '%')),
    h('p', { class: 'small', html: x.detail }), h('a', { class: 'small', href: '#leccion-' + L[x.id] }, 'Practicar esto →'));
  const sec = (t, arr, mood) => arr.length ? h('div', { class: 'card res-sec ' + mood }, h('h3', {}, t), ...arr.map(item)) : null;
  return h('div', {},
    say(nat.length ? `<b>Tus recursos naturales:</b> ${nat.map((x) => RES_INFO[x.id][1].toLowerCase()).join(', ')}. Esos son tu sello: úsalos en tus canciones.` : rs.length ? 'Ninguno te salió natural al primer intento, y es lo normal: casi todos estos recursos se aprenden. Empieza por los que "van saliendo".' : 'No probaste recursos esta vez.', nat.length ? 'celebra' : 'feliz'),
    sec('✨ Te salen natural', nat, 'ok'), sec('🌱 Van saliendo (con práctica, pronto)', mid, ''), sec('🧗 Aún no salen (se aprenden)', low, 'warn'),
    h('p', { class: 'small muted' }, 'Cómo medí: comparé cada intento con tu voz normal (volumen, brillo entre 2 y 4 kHz y relación entre armónicos) y revisé afinación y continuidad. Son indicios acústicos, no un juicio definitivo: repite la prueba en unas semanas y verás cómo cambias.'));
}
