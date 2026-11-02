// Motores de ejercicios. Cada runner recibe (spec, root, sig) y devuelve una promesa con
// { score: 0..1, cents?: desviación media, timing?: ms, detail: texto }.
import { getCtx, startMic, readPitch, resetSmoother, playNote, playGlide, click, startDrone, latency } from './audio.js';
import { noteName, solfege } from './pitch.js';
import { h, Roll, tuner, levelMeter, sleep, icon } from './ui.js';
import { say, chincol, diagnoseSeq, line } from './coach.js';
import { stopSpeaking, sfx } from './voice.js';
import { getRange, setRange } from './store.js';

const raf = () => new Promise((r) => requestAnimationFrame(r));

async function ensureMic(root) {
  try { await startMic(); return true; }
  catch (e) {
    root.replaceChildren(h('div', { class: 'ex' },
      say('<b>Necesito escucharte.</b> Permite el micrófono en el navegador (toca el candado junto a la dirección) y vuelve a intentar.', 'piensa', { tone: 'warn', voice: 'mic' })));
    return false;
  }
}

function startButton(root, text, label = 'Empezar', mood = 'atento', extra = null, voice = null) {
  return new Promise((res) => {
    const b = h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); getCtx(); res(); } }, label);
    root.replaceChildren(h('div', { class: 'ex' }, say(text, mood, { voice }), extra, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, b)));
  });
}

export async function run(spec, root, sig) {
  const fn = RUNNERS[spec.type];
  if (!fn) return { score: 1 };
  return fn(spec, root, sig);
}

// ---------- Teoría ----------
function runInfo(spec, root) {
  return new Promise((res) => {
    root.replaceChildren(h('div', { class: 'ex' },
      say(spec.title ? '<b>' + spec.title + '</b>' : 'Escucha esto:', 'feliz', { voice: spec.voice }),
      h('div', { class: 'teach', html: spec.body }),
      h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); res({ score: 1, info: true }); } }, 'Entendido'))));
  });
}

// ---------- Respiración guiada ----------
async function runBreath(spec, root, sig) {
  await startButton(root, spec.text || line('ins_breath'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_breath'));
  let micOk = false;
  try { await startMic(); micOk = true; } catch (e) {}
  const label = h('div', { class: 'breath-label' });
  const count = h('div', { class: 'breath-count' });
  const orb = h('div', { class: 'breath-orb' }, count);
  const prog = h('div', { class: 'progress' }, h('div', { class: 'pfill' }));
  const meter = levelMeter();
  const hint = h('p', { class: 'muted small center' }, micOk ? 'La barra muestra tu aire: mantenla pareja, sin picos ni caídas.' : '');
  const skip = h('button', { class: 'btn ghost', onclick: () => (sig.skip = true) }, 'Terminar');
  root.replaceChildren(h('div', { class: 'ex' }, label, orb, prog, micOk ? meter.el : null, hint, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, skip)));
  const reps = spec.reps || 3;
  const levels = [];
  for (let r = 0; r < reps && !sig.aborted && !sig.skip; r++) {
    for (const st of spec.steps) {
      if (sig.aborted || sig.skip) break;
      label.textContent = st.label + (reps > 1 ? `  (${r + 1}/${reps})` : '');
      const t0 = performance.now();
      while (!sig.aborted && !sig.skip) {
        const el = (performance.now() - t0) / 1000;
        if (el >= st.secs) break;
        count.textContent = Math.ceil(st.secs - el);
        prog.firstChild.style.width = (el / st.secs) * 100 + '%';
        const k = el / st.secs;
        const scale = /inhala/i.test(st.label) ? 0.55 + 0.45 * k : st.sound ? 1 - 0.45 * k : 0.55;
        orb.style.transform = `scale(${scale.toFixed(3)})`;
        if (micOk) {
          const p = readPitch();
          meter.set(p.rms * 8);
          if (st.sound) levels.push(p.rms);
        }
        await raf();
      }
    }
  }
  // estabilidad del soplo: coeficiente de variación del volumen en las fases con sonido
  let detail = 'Ejercicio completado';
  if (levels.length > 30) {
    const act = levels.filter((v) => v > 0.004);
    if (act.length > 20) {
      const m = act.reduce((a, b) => a + b, 0) / act.length;
      const sd = Math.sqrt(act.reduce((a, b) => a + (b - m) ** 2, 0) / act.length);
      const cv = sd / m;
      detail = cv < 0.25 ? 'Flujo de aire muy parejo 👏' : cv < 0.45 ? 'Flujo bastante parejo. Intenta que no se caiga al final.' : 'El aire salió irregular: suelta menos al principio y dosifica.';
    }
  }
  return { score: 1, detail };
}

// ---------- Test de rango vocal ----------
async function runRange(spec, root, sig) {
  await startButton(root, line('rango_intro'), 'Empezar', 'feliz', null, 'rango_intro');
  if (!(await ensureMic(root))) return { score: 0 };
  const capture = async (dir) => {
    const big = h('div', { class: 'bignote' }, '—');
    const best = h('div', { class: 'pill' }, 'Aún nada registrado');
    const done = h('button', { class: 'btn primary big' }, 'Listo');
    root.replaceChildren(h('div', { class: 'ex' },
      say(dir === 'low' ? '<b>Paso 1 de 2:</b> canta "aaa" y baja de a poco hasta tu nota <b>más grave cómoda</b>. Sostenla un segundo.' : '<b>Paso 2 de 2:</b> ahora sube de a poco hasta tu nota <b>más aguda cómoda</b>. Sin gritar ni forzar.', 'canta', { voice: dir === 'low' ? 'rango_grave' : 'rango_agudo' }),
      h('div', { class: 'center' }, big, best), h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, done)));
    let extreme = null; const win = [];
    let finished = false;
    done.onclick = () => (finished = true);
    resetSmoother();
    while (!finished && !sig.aborted) {
      const p = readPitch();
      const t = performance.now();
      if (p.midi != null) {
        big.textContent = noteName(p.midi);
        win.push({ t, m: p.midi });
      }
      while (win.length && t - win[0].t > 700) win.shift();
      if (win.length > 15) {
        const ms = win.map((w) => w.m);
        const mn = Math.min(...ms), mx = Math.max(...ms);
        if (mx - mn < 0.8) {
          const med = ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)];
          if (extreme == null || (dir === 'low' ? med < extreme : med > extreme)) {
            extreme = med; best.textContent = 'Registrado: ' + noteName(extreme); best.classList.add('ok');
          }
        }
      }
      await raf();
    }
    return extreme;
  };
  const low = await capture('low');
  if (sig.aborted) return { score: 0 };
  const high = await capture('high');
  if (low == null || high == null || high - low < 5) {
    root.replaceChildren(h('div', { class: 'ex' }, say('No pude registrar bien tu rango (necesito al menos 5 semitonos entre la más grave y la más aguda). Probemos otra vez en un lugar silencioso.', 'piensa', { voice: 'rango_falla' })));
    await sleep(2500);
    return { score: 0, detail: 'Rango no registrado' };
  }
  const lo = Math.round(low), hi = Math.round(high);
  const comfort = Math.round(lo + (hi - lo) * 0.4);
  setRange({ low: lo, high: hi, comfort });
  return { score: 1, detail: `Tu rango cómodo: ${noteName(lo)} – ${noteName(hi)} (${hi - lo} semitonos). Zona central: ${noteName(comfort)}. Los ejercicios se ajustarán a tu voz.` };
}
export function voiceType(lo, hi) {
  const mid = (lo + hi) / 2;
  if (mid < 52) return 'bajo';
  if (mid < 56) return 'barítono';
  if (mid < 60) return 'tenor / contralto';
  if (mid < 64) return 'mezzosoprano';
  return 'soprano';
}

// ---------- Control de audífonos ----------
// Si el micrófono capta lo que suena por el parlante, el detector podría "creer" que cantaste afinado.
// Esta prueba lo descarta antes de los ejercicios donde suena algo mientras cantas.
let headphonesOk = false;
export async function leakCheck(midi, drone = false) {
  await startMic();
  const c = getCtx();
  resetSmoother();
  let stop = null;
  if (drone) stop = startDrone(midi); else playNote(midi, c.currentTime + 0.05, 1.3, 0.3);
  const t0 = performance.now();
  let n = 0, hit = 0;
  while (performance.now() - t0 < 1400) {
    const p = readPitch();
    if (performance.now() - t0 > 250) {
      n++;
      if (p.raw != null) { const d = ((((p.raw - midi) % 12) + 18) % 12) - 6; if (Math.abs(d) < 0.6) hit++; }
    }
    await raf();
  }
  stop && stop();
  await sleep(250);
  return n > 0 && hit / n > 0.2;
}
async function requireHeadphones(root, sig, midi, drone) {
  if (headphonesOk) return true;
  while (!sig.aborted) {
    root.replaceChildren(h('div', { class: 'ex' }, say('Reviso si tienes audífonos… <b>quédate en silencio un segundo.</b>', 'atento')));
    const leaks = await leakCheck(midi, drone);
    if (!leaks) { headphonesOk = true; return true; }
    const r = await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
      say('<b>Para este ejercicio necesito audífonos.</b> Tu micrófono está escuchando el parlante y confundiría ese sonido con tu voz: te daría un puntaje falso.', 'piensa', { tone: 'warn', voice: 'audif_falta' }),
      h('div', { class: 'grow' }),
      h('div', { class: 'actionbar col' },
        h('button', { class: 'btn primary big', onclick: () => res('retry') }, 'Ya me los puse, probar de nuevo'),
        h('button', { class: 'btn big', onclick: () => res('skip') }, 'Saltar este ejercicio')))));
    if (r === 'skip') return false;
  }
  return false;
}

// Margen extra para afinación pura sobre bordón (cents respecto del piano): 3ª mayor −14, 3ª menor +16, 6ª mayor −16
const JUST = { 3: 16, 4: -14, 8: 14, 9: -16 };

// ---------- Igualar nota (con afinador fino) ----------
async function runMatch(spec, root, sig) {
  const tol = spec.tol ?? 50;
  const hold = spec.hold ?? 1;
  await startButton(root, spec.text || line('ins_match') + ` <small>(Zona verde: ±${tol / 2} cents durante ${hold} s.)</small>`, 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_match'));
  if (!(await ensureMic(root))) return { score: 0 };
  if (spec.drone != null && !(await requireHeadphones(root, sig, spec.drone, true))) return { score: null, detail: 'Ejercicio saltado (sin audífonos)', skipped: true };
  const results = [];
  const allCents = [];
  const stab = [];
  const signed = []; // desviación con signo (para detectar si tiendes a quedar bajo o alto)
  const approach = []; // por dónde llegas a la nota: desde abajo (-) o desde arriba (+)
  for (let i = 0; i < spec.notes.length && !sig.aborted; i++) {
    const target = spec.notes[i];
    const iv = spec.drone != null ? ((Math.round(target - spec.drone) % 12) + 12) % 12 : null;
    const ji = iv != null ? JUST[iv] || 0 : 0;
    const lo = Math.min(0, ji) - tol / 2, hi = Math.max(0, ji) + tol / 2;
    const tu = tuner(tol);
    tu.setTol(tol, Math.min(0, ji), Math.max(0, ji));
    const coachBox = h('div');
    const setCoach = (txt, mood) => coachBox.replaceChildren(say(txt, mood, { compact: true }));
    setCoach('👂 Escucha la nota…', 'canta');
    const header = h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Nota ${i + 1} de ${spec.notes.length}`), spec.drone != null ? h('span', { class: 'pill' }, 'Bordón: ' + noteName(spec.drone)) : null);
    const canvas = h('canvas', { class: 'roll small' });
    const holdBar = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, `Sostén ${hold} s en la zona`));
    const again = h('button', { class: 'btn' }, icon('speaker', 18), 'Oír de nuevo');
    const skip = h('button', { class: 'btn ghost' }, 'Saltar');
    const jiNote = ji ? h('p', { class: 'muted small' }, `Sobre el bordón también vale la afinación "pura" de este intervalo (${ji > 0 ? '+' : ''}${ji} cents respecto del piano), la que tiende a buscar el oído.`) : null;
    root.replaceChildren(h('div', { class: 'ex' }, coachBox, header, tu.el, holdBar, canvas, jiNote, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, again, skip)));
    const roll = new Roll(canvas, { span: 5, nowFrac: 0.85 });
    roll.setRange(target - 6, target + 6);
    const c = getCtx();
    const stopDrone = spec.drone != null ? startDrone(spec.drone) : null;
    let quietUntil = 0;
    // mientras suena la nota de referencia no se evalúa (el micrófono podría captarla)
    const play = () => { playNote(target, c.currentTime + 0.05, 1.1, 0.28); quietUntil = c.currentTime + 1.35; };
    play();
    again.onclick = play;
    let skipped = false; skip.onclick = () => (skipped = true);
    resetSmoother();
    const t0 = c.currentTime;
    roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    let held = 0, lastT = c.currentTime, best = 999, ok = false, first = null, lastCoach = '';
    const centsHeld = [];
    while (!sig.aborted && !skipped) {
      const now = c.currentTime;
      const dt = Math.min(0.1, now - lastT); lastT = now;
      const p = readPitch();
      if (now < quietUntil) {
        tu.update(null, target); tu.setMsg('Escucha…');
        if (lastCoach !== 'esc') { setCoach('👂 Escucha la nota…', 'canta'); lastCoach = 'esc'; }
        roll.draw(now); await raf(); continue;
      }
      const cents = tu.update(p.midi, target);
      const inT = cents != null && cents >= lo && cents <= hi;
      if (cents != null && first == null) first = cents;
      if (cents != null && Math.abs(cents) < 200) signed.push(cents);
      // el Chincol te acompaña mientras cantas
      const st = cents == null ? 'nada' : inT ? 'ok' : Math.abs(cents) > 150 ? 'lejos' : 'cerca';
      if (st !== lastCoach) {
        lastCoach = st;
        if (st === 'nada') setCoach('Tu turno: canta la nota. Si te cuesta, tararea "mmm" y desliza la voz.', 'atento');
        else if (st === 'ok') setCoach('¡Ahí! Sostén ese sonido parejo.', 'feliz');
        else if (st === 'lejos') setCoach(cents < 0 ? 'Estás bastante más grave. Sube despacio, como una sirena.' : 'Estás bastante más agudo. Baja despacio, como una sirena.', 'atento');
        else setCoach(cents < 0 ? 'Casi: sube un pelito.' : 'Casi: baja un pelito.', 'atento');
      }
      roll.addUser(now, p.midi, p.midi == null ? null : inT);
      roll.draw(now);
      if (cents != null) best = Math.min(best, Math.max(0, cents < lo ? lo - cents : cents > hi ? cents - hi : 0));
      if (inT) { held += dt; centsHeld.push(cents); }
      else if (cents != null) held = Math.max(0, held - dt * 0.5);
      holdBar.firstChild.style.width = Math.min(100, (held / hold) * 100) + '%';
      if (held >= hold) { ok = true; break; }
      if (now - t0 > (spec.timeout || 16)) break;
      await raf();
    }
    stopDrone && stopDrone();
    roll.destroy();
    const s = ok ? 1 : Math.max(0, 1 - best / 200) * 0.5;
    results.push(s);
    if (first != null) approach.push(first);
    if (centsHeld.length > 5) {
      const mean = centsHeld.reduce((a, b) => a + b, 0) / centsHeld.length;
      allCents.push(Math.abs(mean - (ji && Math.abs(mean - ji) < Math.abs(mean) ? ji : 0)));
      stab.push(Math.sqrt(centsHeld.reduce((a, b) => a + (b - mean) ** 2, 0) / centsHeld.length));
    }
    if (ok) { sfx('ok'); tu.setMsg('¡Logrado!', 'ok'); setCoach('¡Bien! Esa es la nota.', 'celebra'); await sleep(700); }
  }
  // observaciones para el profe
  const issues = [];
  if (signed.length > 30) {
    const m = signed.reduce((a, b) => a + b, 0) / signed.length;
    if (m < -20) issues.push({ key: 'bajo', voice: 'd_bajo', text: `Mientras buscabas la nota tendías a quedar <b>bajo</b> (≈${Math.round(-m)} cents).`, tip: 'Piensa la nota "un poquito más arriba" y mantén el aire parejo. Escuchar de nuevo antes de cantar ayuda.' });
    if (m > 20) issues.push({ key: 'alto', voice: 'd_alto', text: `Tendías a quedar <b>alto</b> (≈${Math.round(m)} cents).`, tip: 'Canta más suave, sin empujar. La nota está más abajo de lo que crees.' });
  }
  const farStarts = approach.filter((a) => Math.abs(a) > 300).length;
  if (approach.length >= 3 && farStarts / approach.length > 0.5) issues.push({ key: 'lejos', voice: 'd_lejos', text: 'Al empezar llegas lejos de la nota (más de 3 semitonos).', tip: 'Antes de cantar, tararea la nota por dentro. Empieza con "mmm" suave y desliza hasta que la bolita quede al centro.' });
  if (stab.length >= 2 && stab.reduce((a, b) => a + b, 0) / stab.length > 20) issues.push({ key: 'inestable', voice: 'd_inestable', text: 'Cuando llegas, la nota <b>tiembla</b>.', tip: 'Es el aire: haz el siseo "sss" parejo y luego canta con ese mismo soplo continuo.' });
  const score = results.reduce((a, b) => a + b, 0) / Math.max(1, results.length);
  const cents = allCents.length ? allCents.reduce((a, b) => a + b, 0) / allCents.length : null;
  const sd = stab.length ? stab.reduce((a, b) => a + b, 0) / stab.length : null;
  return { score, cents, issues, detail: `${results.filter((r) => r === 1).length} de ${results.length} notas logradas` + (cents != null ? `. Al sostener quedaste a ${Math.round(cents)} cents del centro, con un vaivén de ±${Math.round(sd)} cents.` : '.') };
}

// ---------- Secuencias: escalas, intervalos, sirenas, melodías ----------
// spec.pattern: [{s: semitonos desde la base | null (silencio), d: tiempos, g: semitono final (glissando), l: etiqueta}]
// Modos: 'echo' = escuchas y repites; 'along' = la 1ª vuelta cantas JUNTO a la guía (sin nota), las siguientes solo (con nota);
//        'read' = lectura: solo te doy el do (tónica) y cantas leyendo los nombres, sin demostración.
// spec.accomp: otra voz que suena MIENTRAS cantas (armonía / canon). Exige audífonos.
async function runSeq(spec, root, sig) {
  const tol = spec.tol ?? 50; // ancho total de la zona (±tol/2)
  const ttol = (spec.ttol ?? 200) / 1000;
  const beat = 60 / (spec.bpm || 80);
  const mode = spec.mode || 'echo';
  const feedback = spec.feedback || 'live';
  let reps = spec.reps || [0];
  if (mode === 'along' && reps.length === 1) reps = [reps[0], reps[0]];
  const defIns = mode === 'echo' ? 'ins_echo' : mode === 'read' ? 'ins_read' : 'ins_along';
  const instr = spec.text || line(defIns);
  const seqVoice = [spec.voice || (spec.text ? null : defIns), spec.accomp ? 'ins_harm' : null, feedback === 'after' ? 'ins_sinred' : null].filter(Boolean);
  const legend = h('div', { class: 'legend' },
    mode === 'read' ? null : h('span', {}, h('i', { class: 'lg demo' }), mode === 'echo' ? 'Yo canto' : 'Juntos'),
    h('span', {}, h('i', { class: 'lg note' }), 'Tu turno'),
    h('span', {}, h('i', { class: 'lg ok' }), 'Afinado'),
    h('span', {}, h('i', { class: 'lg warn' }), 'Desafinado'));
  await startButton(root, instr + (mode === 'along' && spec.text ? '<br><small>La 1ª vuelta cantamos juntos (sin nota); las siguientes, tú solo.</small>' : '') + (spec.accomp ? '<br><br>🎧 ' + line('ins_harm') : '') + (feedback === 'after' ? '<br><br><b>Modo sin red:</b> ' + line('ins_sinred') : ''), 'Empezar', 'atento', legend, seqVoice.length ? seqVoice : null);
  if (!(await ensureMic(root))) return { score: 0 };
  if (spec.accomp && !(await requireHeadphones(root, sig, spec.base + (spec.accomp.find((n) => n.s != null)?.s || 0), false))) return { score: null, detail: 'Ejercicio saltado (sin audífonos)', skipped: true };

  const c = getCtx();
  const T0 = c.currentTime + 0.4;
  const targets = [];
  const events = [];
  let t = 0;
  const countIn = spec.countIn ?? 4;
  if (mode === 'read') { // tónica: do-mi-sol y el do sostenido, para orientar el oído
    const b0 = spec.base + reps[0];
    [0, 4, 7].forEach((iv, k) => events.push({ type: 'note', t: k * 0.45, d: 0.42, m0: b0 + iv, m1: b0 + iv, gain: 0.22 }));
    events.push({ type: 'note', t: 1.4, d: 1.3, m0: b0, m1: b0, gain: 0.26 });
    t = 3;
  }
  const tonicEnd = t;
  for (let i = 0; i < countIn; i++) events.push({ type: 'click', t: t + i * beat, accent: i === 0 });
  t += countIn * beat;
  const musicStart = t;
  const label = (s) => spec.labels === 'none' ? '' : spec.labels === 'solf' || !spec.labels ? solfege(s) : spec.labels;
  const accDelay = (spec.accompDelay || 0) * beat;
  const layAccomp = (base, from) => { // la otra voz: suena, no se evalúa
    let ta = from + accDelay;
    for (const n of spec.accomp) {
      const d = n.d * beat;
      if (n.s != null) events.push({ type: 'note', t: ta, d: d * 0.95, m0: base + n.s, m1: base + n.s, gain: spec.accompGain ?? 0.2 });
      ta += d;
    }
    return ta;
  };
  const lay = (base, demo, play, withAcc = false) => {
    let tt = t;
    const accEnd = withAcc && spec.accomp ? layAccomp(base, tt) : 0;
    for (const n of spec.pattern) {
      const d = n.d * beat;
      if (n.s != null) {
        const m0 = base + n.s, m1 = n.g != null ? base + n.g : m0;
        const tg = { t0: tt, t1: tt + d, m0, m1, label: n.l ?? (m0 === m1 ? label(n.s) : ''), demo, frames: [] };
        targets.push(tg);
        if (play) events.push({ type: m0 === m1 ? 'note' : 'glide', t: tt, d: d * 0.95, m0, m1, gain: 0.28 });
      }
      if (spec.clicks !== false) {
        for (let k = 0; k < Math.round(n.d); k++) events.push({ type: 'click', t: tt + k * beat, accent: false, soft: true });
      }
      tt += d;
    }
    if (accEnd > tt) { // el canon termina después: seguimos marcando el pulso
      if (spec.clicks !== false) for (let k = 0; tt + k * beat < accEnd; k++) events.push({ type: 'click', t: tt + k * beat, accent: false, soft: true });
      tt = accEnd;
    }
    return tt;
  };
  reps.forEach((r, ri) => {
    const base = spec.base + r;
    if (mode === 'echo') {
      t = lay(base, true, true, !!spec.accompInDemo);
      for (let i = 0; i < 2; i++) events.push({ type: 'click', t: t + i * beat, accent: i === 0 });
      t += 2 * beat;
      t = lay(base, false, false, true);
    } else if (mode === 'read') {
      if (ri > 0) { events.push({ type: 'note', t, d: beat * 1.8, m0: base, m1: base, gain: 0.24 }); for (let i = 0; i < 2; i++) events.push({ type: 'click', t: t + i * beat, accent: i === 0 }); t += 2 * beat; }
      t = lay(base, false, false, true);
    } else {
      t = lay(base, ri === 0, ri === 0, true);
    }
    t += beat;
  });
  const endT = t;

  const canvas = h('canvas', { class: 'roll' });
  const coachBox = h('div');
  let lastStatus = '';
  const status = { set textContent(v) { if (v === lastStatus) return; lastStatus = v; coachBox.replaceChildren(say(v, /Escucha|Yo/.test(v) ? 'canta' : /Canta|juntos/i.test(v) ? 'atento' : 'feliz', { compact: true })); } };
  status.textContent = 'Prepárate…';
  const stopBtn = h('button', { class: 'btn ghost' }, 'Detener');
  let stopped = false; stopBtn.onclick = () => (stopped = true);
  root.replaceChildren(h('div', { class: 'ex' }, coachBox, canvas, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, stopBtn)));
  const roll = new Roll(canvas, { span: Math.max(4, Math.min(8, beat * 10)), nowFrac: 0.3 });
  roll.targets = targets.map((x) => x);
  roll.fitTargets(3);
  for (const tg of targets) if (tg.demo) tg.result = 'demo';

  for (const e of events) {
    const at = T0 + e.t;
    if (e.type === 'click') click(at, e.accent, e.soft ? 0.12 : 0.28);
    else if (e.type === 'note') playNote(e.m0, at, e.d, e.gain);
    else playGlide(e.m0, e.m1, at, e.d, e.gain);
  }

  resetSmoother();
  const lat = latency();
  const scored = targets.filter((x) => !x.demo);
  const all = []; // todos los cuadros: {t, m (suavizado), raw}
  while (!sig.aborted && !stopped) {
    const now = c.currentTime - T0 - lat; // tiempo musical de lo que el micrófono capta ahora
    if (now > endT + 0.2) break;
    const p = readPitch();
    all.push({ t: now, m: p.midi, raw: p.raw });
    let active = null;
    for (const tg of scored) if (now >= tg.t0 && now <= tg.t1) active = tg;
    let ok = null;
    if (active) {
      if (p.midi != null) {
        const frac = (now - active.t0) / (active.t1 - active.t0);
        const tm = active.m0 + (active.m1 - active.m0) * Math.min(1, Math.max(0, frac));
        const cents = (p.midi - tm) * 100;
        ok = Math.abs(cents) <= (active.m0 === active.m1 ? tol / 2 : tol);
        active.frames.push({ t: now, cents, ok });
      } else active.frames.push({ t: now, cents: null, ok: false });
    }
    roll.addUser(now, p.midi, ok);
    roll.draw(now, { showUser: feedback === 'live' });
    const cur = targets.find((x) => now >= x.t0 && now <= x.t1);
    status.textContent = mode === 'read' && now < tonicEnd ? 'Escucha el do: esa es tu casa' : now < musicStart && !cur ? 'Cuenta… 1, 2, 3, 4' : cur ? (cur.demo ? (mode === 'echo' ? 'Escucha cómo lo canto' : 'Canta juntos conmigo') : 'Tu turno: canta “' + (cur.label || noteName(cur.m0)) + '”') : (mode === 'echo' ? 'Prepárate para repetir…' : '¡Sigue tú!');
    await raf();
  }
  // ---- evaluar ----
  // Afinación: % del cuerpo de cada nota dentro de la zona.
  // Entrada: primer instante en que tu voz (sin suavizar) llega a la nota DESPUÉS de no estar en ella
  // (silencio u otra nota). Si venías sosteniendo la misma altura, la entrada no se puede medir y no se cuenta.
  const onTol = Math.max(tol / 2, 50) / 100;
  let pitchSum = 0, timeSum = 0, timeN = 0, centsAll = [], timingErrs = [], hits = 0;
  for (const tg of scored) {
    const d = tg.t1 - tg.t0;
    const a = tg.t0 + Math.min(0.12, d * 0.15), b = tg.t1 - Math.min(0.06, d * 0.1);
    const fr = tg.frames.filter((f) => f.t >= a && f.t <= b);
    const inTune = fr.filter((f) => f.ok).length;
    const frac = fr.length ? inTune / fr.length : 0;
    pitchSum += Math.min(1, frac / 0.7);
    if (frac >= 0.5) { hits++; tg.result = 'hit'; } else tg.result = 'miss';
    fr.forEach((f) => { if (f.cents != null && Math.abs(f.cents) < 100) centsAll.push(Math.abs(f.cents)); });
    if (tg.m0 === tg.m1 && !spec.noTiming) {
      const w0 = tg.t0 - ttol * 1.5, w1 = tg.t0 + Math.min(d * 0.6, ttol * 2.5);
      const near = (f) => f && f.raw != null && Math.abs(f.raw - tg.m0) <= onTol;
      const idx0 = all.findIndex((f) => f.t >= w0);
      let onset = null, blocked = idx0 > 0 && near(all[idx0 - 1]);
      for (let k = Math.max(0, idx0); k < all.length && all[k].t <= w1; k++) {
        if (!near(all[k])) { blocked = false; continue; }
        if (!blocked && near(all[k + 1])) { onset = all[k].t; break; }
      }
      if (onset != null) {
        const err = onset - tg.t0;
        timingErrs.push(err);
        timeSum += Math.abs(err) <= ttol ? 1 : Math.abs(err) <= ttol * 2 ? 0.5 : 0;
        timeN++;
      } else if (!fr.some((f) => f.ok)) { timeN++; } // no cantó la nota: entrada fallida
    }
  }
  const n = Math.max(1, scored.length);
  const pScore = pitchSum / n;
  const tScore = timeN ? timeSum / timeN : 1;
  const score = stopped ? 0 : (spec.noTiming || !timeN ? pScore : 0.75 * pScore + 0.25 * tScore);
  const cents = centsAll.length ? centsAll.reduce((x, y) => x + y, 0) / centsAll.length : null;
  const tAvg = timingErrs.length ? timingErrs.reduce((x, y) => x + y, 0) / timingErrs.length : null;
  roll.span = Math.max(roll.span, endT + 1);
  roll.nowFrac = 0;
  roll.draw(0, { showUser: true, full: true });
  roll.destroy();
  let tmsg = '';
  if (tAvg != null && !spec.noTiming) tmsg = Math.abs(tAvg) < 0.06 ? ' · entradas a tiempo ✓' : tAvg > 0 ? ` · en promedio entras tarde (~${Math.round(tAvg * 1000)} ms)` : ` · en promedio te adelantas (~${Math.round(-tAvg * 1000)} ms)`;
  return {
    score, cents, timing: tAvg != null ? tAvg * 1000 : null,
    detail: `${hits} de ${scored.length} notas afinadas` + (cents != null ? `. Cuando llegaste a la nota, te desviaste en promedio ${Math.round(cents)} cents` : '') + tmsg.replace(' · ', '. '),
    issues: diagnoseSeq(scored, all, { timingErrs: spec.noTiming ? [] : timingErrs, tol }),
    keepView: canvas,
  };
}

// ---------- Entrenamiento de oído ----------
const IV_NAMES = { 1: '2ª menor', 2: '2ª mayor', 3: '3ª menor', 4: '3ª mayor', 5: '4ª justa', 7: '5ª justa', 9: '6ª mayor', 12: 'Octava', 0: 'Unísono' };
async function runEar(spec, root, sig) {
  const rounds = spec.rounds || 6;
  const base = spec.base;
  let correct = 0;
  getCtx();
  await startButton(root, spec.text || line('ins_ear'), 'Empezar', 'atento', null, spec.voice || 'ins_ear');
  for (let r = 0; r < rounds && !sig.aborted; r++) {
    const c = getCtx();
    let q, opts, ans, play;
    const a = base + Math.floor(Math.random() * 5) - 2;
    if (spec.kind === 'updown') {
      const iv = (spec.ivs || [2, 3, 4, 5, 7])[Math.floor(Math.random() * (spec.ivs || [2, 3, 4, 5, 7]).length)];
      const up = Math.random() < 0.5;
      q = '¿La segunda nota sube o baja?'; opts = ['Sube ↑', 'Baja ↓']; ans = up ? 0 : 1;
      play = () => { playNote(a, c.currentTime + 0.05, 0.7); playNote(a + (up ? iv : -iv), c.currentTime + 0.85, 0.7); };
    } else if (spec.kind === 'interval') {
      const ivs = spec.ivs || [4, 7, 12];
      const iv = ivs[Math.floor(Math.random() * ivs.length)];
      q = '¿Qué intervalo escuchas?'; opts = ivs.map((i) => IV_NAMES[i] || i + ' st'); ans = ivs.indexOf(iv);
      play = () => { playNote(a, c.currentTime + 0.05, 0.7); playNote(a + iv, c.currentTime + 0.85, 0.9); };
    } else if (spec.kind === 'mode') { // color: acorde mayor o menor
      const minor = Math.random() < 0.5;
      const third = minor ? 3 : 4;
      q = '¿Este acorde suena mayor (luminoso) o menor (triste)?'; opts = ['Mayor', 'Menor']; ans = minor ? 1 : 0;
      play = () => { [0, third, 7].forEach((iv, k) => playNote(a + iv, c.currentTime + 0.05 + k * 0.38, 0.4, 0.22)); [0, third, 7].forEach((iv) => playNote(a + iv, c.currentTime + 1.3, 1.2, 0.14)); };
    } else { // detune: afinación fina perceptiva
      const amts = spec.cents || [50, 35, 25];
      const amt = amts[Math.min(amts.length - 1, Math.floor((r / rounds) * amts.length))];
      const kind = Math.floor(Math.random() * 3); // 0 igual, 1 más alto, 2 más bajo
      const off = kind === 0 ? 0 : kind === 1 ? amt / 100 : -amt / 100;
      q = `¿La segunda nota está afinada igual, más alta o más baja? (diferencia de ${kind === 0 ? '0 a ' + amt : amt} cents)`;
      q = '¿La segunda nota está igual, un poco más alta o un poco más baja?';
      opts = ['Igual', 'Más alta', 'Más baja']; ans = kind;
      play = () => { playNote(a, c.currentTime + 0.05, 0.9); playNote(a + off, c.currentTime + 1.05, 0.9); };
      spec._last = amt;
    }
    const picked = await new Promise((res) => {
      const btns = opts.map((o, i) => h('button', { class: 'btn choice', onclick: () => res(i) }, o));
      root.replaceChildren(h('div', { class: 'ex' },
        say(q, 'atento'),
        h('div', { class: 'row center-row' }, h('span', { class: 'pill' }, `Pregunta ${r + 1} de ${rounds}`), spec.kind === 'detune' ? h('span', { class: 'pill' }, `diferencia: ${spec._last} cents`) : null),
        h('button', { class: 'playbig', onclick: play, 'aria-label': 'Escuchar otra vez' }, icon('speaker', 40)),
        h('div', { class: 'grow' }),
        h('div', { class: 'choices' }, btns)));
      play();
    });
    const good = picked === ans;
    if (good) correct++;
    sfx(good ? 'ok' : 'bad');
    root.querySelector('.choices').children[ans].classList.add('right');
    if (!good) root.querySelector('.choices').children[picked].classList.add('wrong');
    root.querySelector('.coach').replaceWith(say(good ? '¡Correcto!' : 'Era "' + opts[ans] + '". Escúchalo otra vez con calma.', good ? 'celebra' : 'piensa'));
    if (!good) play();
    await sleep(good ? 700 : 2200);
  }
  return { score: correct / rounds, detail: `${correct} de ${rounds} correctas.`, issues: correct / rounds < 0.7 ? [{ key: 'oido', voice: 'd_oido', text: 'Esta habilidad de oído todavía cuesta.', tip: spec.kind === 'detune' ? 'Escucha las dos notas como si fueran una sola cuerda: ¿la segunda "brilla" más (alta) o suena más "apagada" (baja)? Repite, se entrena rápido.' : 'Canta en voz baja las dos notas después de escucharlas: tu voz te dirá si subiste o bajaste.' }] : [] };
}

// ---------- Ritmo: tocar al pulso ----------
async function runRhythm(spec, root, sig) {
  const beat = 60 / (spec.bpm || 80);
  const ttol = (spec.ttol ?? 120) / 1000;
  await startButton(root, spec.text || line('ins_rhythm'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_rhythm'));
  const c = getCtx();
  const T0 = c.currentTime + 0.4;
  const onsets = []; // esperados
  let t = 0;
  for (let i = 0; i < 4; i++) click(T0 + i * beat, i === 0, 0.28);
  t = 4 * beat;
  const reps = spec.reps || 2;
  // demo
  let tt = t;
  for (const d of spec.pattern) {
    if (d > 0) playNote(spec.base || 60, T0 + tt, Math.min(0.15, d * beat * 0.5), 0.25);
    tt += Math.abs(d) * beat;
  }
  const total = spec.pattern.reduce((a, b) => a + Math.abs(b), 0);
  const demoEnd = t + total * beat;
  t = demoEnd;
  for (let r = 0; r < reps; r++) {
    for (const d of spec.pattern) { if (d > 0) onsets.push(t); t += Math.abs(d) * beat; }
  }
  const endT = t + beat;
  for (let k = 0; k * beat < endT; k++) if (k >= 4) click(T0 + k * beat, k % 4 === 0, 0.14);

  const taps = [];
  const pad = h('button', { class: 'tap-pad' }, icon('drum', 34), 'Toca aquí');
  const coachBox = h('div');
  let lastS = '';
  const status = { set textContent(v) { if (v === lastS) return; lastS = v; coachBox.replaceChildren(say(v, /Escucha/.test(v) ? 'canta' : 'atento', { compact: true })); } };
  status.textContent = 'Escucha…';
  const canvas = h('canvas', { class: 'roll rhythm' });
  root.replaceChildren(h('div', { class: 'ex' }, coachBox, canvas, h('div', { class: 'grow' }), pad));
  const tap = (e) => { e.preventDefault(); taps.push(c.currentTime - T0 - (c.outputLatency || 0) - (c.baseLatency || 0)); pad.classList.add('hit'); setTimeout(() => pad.classList.remove('hit'), 80); };
  pad.addEventListener('pointerdown', tap);
  const key = (e) => { if (e.code === 'Space') tap(e); };
  window.addEventListener('keydown', key);
  const g = canvas.getContext('2d');
  const draw = (now) => {
    const r = canvas.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = r.width * dpr; canvas.height = r.height * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const span = 4 * beat * 2; const x = (tm) => r.width * 0.25 + ((tm - now) / span) * r.width;
    const cs = getComputedStyle(canvas); const cv = (n) => cs.getPropertyValue(n).trim();
    g.fillStyle = cv('--roll-line');
    for (let k = 0; k * beat < endT; k++) { const xx = x(k * beat); if (xx > 0 && xx < r.width) g.fillRect(xx, 0, 1, r.height); }
    let tt2 = 4 * beat;
    for (const d of spec.pattern) { if (d > 0) { g.fillStyle = cv('--demo'); g.fillRect(x(tt2), r.height * 0.2, Math.max(6, d * beat / span * r.width - 4), r.height * 0.25); } tt2 += Math.abs(d) * beat; }
    for (const o of onsets) { g.fillStyle = cv('--note'); g.fillRect(x(o), r.height * 0.55, 8, r.height * 0.25); }
    for (const tp of taps) { g.fillStyle = cv('--ok'); g.beginPath(); g.arc(x(tp), r.height * 0.67, 6, 0, 7); g.fill(); }
    g.fillStyle = cv('--now'); g.fillRect(r.width * 0.25, 0, 2, r.height);
  };
  while (!sig.aborted) {
    const now = c.currentTime - T0;
    if (now > endT) break;
    status.textContent = now < 4 * beat ? 'Cuenta… 1, 2, 3, 4' : now < demoEnd ? 'Escucha el ritmo' : '¡Ahora tú! Toca justo con cada nota';
    draw(now);
    await raf();
  }
  window.removeEventListener('keydown', key);
  // emparejar golpes con tiempos esperados
  const used = new Set(); let hits = 0; const errs = [];
  for (const o of onsets) {
    let bi = -1, be = 1e9;
    taps.forEach((tp, i) => { if (!used.has(i) && Math.abs(tp - o) < be) { be = Math.abs(tp - o); bi = i; } });
    if (bi >= 0 && be <= beat * 0.45) { used.add(bi); errs.push(taps[bi] - o); if (be <= ttol) hits++; else if (be <= ttol * 2) hits += 0.5; }
  }
  const extra = taps.filter((tp, i) => !used.has(i) && tp > demoEnd - 0.2).length;
  const score = Math.max(0, hits / onsets.length - extra * 0.05);
  const avg = errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0;
  const absAvg = errs.length ? errs.reduce((a, b) => a + Math.abs(b), 0) / errs.length : null;
  const issues = [];
  if (errs.length >= 3 && avg > 0.06) issues.push({ key: 'tarde', voice: 'd_tarde', text: `Tocas un poco <b>tarde</b> (≈${Math.round(avg * 1000)} ms).`, tip: 'Anticipa: prepara el golpe en el "y" anterior. Si usas audífonos Bluetooth, mide la latencia en Perfil o usa audífonos con cable.' });
  if (errs.length >= 3 && avg < -0.06) issues.push({ key: 'temprano', voice: 'd_temprano', text: `Te <b>adelantas</b> (≈${Math.round(-avg * 1000)} ms).`, tip: 'Espera el clic. Mueve el pie con el pulso y toca "encima" del pie.' });
  if (extra > 2) issues.push({ key: 'extra', voice: 'd_extra', text: `Tocaste ${extra} golpes de más.`, tip: 'En los silencios no se toca, pero se sigue contando. Di "1, 2, 3, 4" en voz baja.' });
  return { score, issues, timing: avg * 1000, detail: `${Math.round(hits)}/${onsets.length} golpes a tiempo` + (absAvg != null ? ` · error medio ${Math.round(absAvg * 1000)} ms ${avg > 0.02 ? '(tiendes a atrasarte)' : avg < -0.02 ? '(tiendes a adelantarte)' : ''}` : '') };
}

// ---------- Nota larga: afinación + aire parejo (técnica de apoyo) ----------
async function runSustain(spec, root, sig) {
  const tol = spec.tol ?? 60;
  const secs = spec.secs ?? 5;
  const notes = spec.notes;
  await startButton(root, spec.text || line('ins_sustain'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_sustain'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const per = [];
  let allPitch = [], allRms = [], tails = 0; const vibs = [];
  for (let i = 0; i < notes.length && !sig.aborted; i++) {
    const target = notes[i];
    const coachBox = h('div');
    const setCoach = (t, m) => coachBox.replaceChildren(say(t, m, { compact: true }));
    const canvas = h('canvas', { class: 'roll small' });
    const airFill = h('div', { class: 'airfill' });
    const air = h('div', { class: 'airbar' }, h('span', { class: 'airlab' }, 'Aire'), h('div', { class: 'airtrack' }, airFill), h('span', { class: 'airlab r' }, ''));
    const timer = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, `Sostén ${secs} s`));
    root.replaceChildren(h('div', { class: 'ex' }, coachBox, h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Nota ${i + 1} de ${notes.length}`), h('span', { class: 'pill' }, noteName(target))), canvas, air, timer, h('div', { class: 'grow' })));
    const roll = new Roll(canvas, { span: secs + 2, nowFrac: 0.9 });
    roll.setRange(target - 5, target + 5);
    roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    setCoach('Escucha la nota…', 'canta');
    playNote(target, c.currentTime + 0.05, 1.2, 0.28);
    await sleep(1450);
    setCoach('Inhala bajo… y canta la nota pareja.', 'atento');
    resetSmoother();
    let started = null; const fr = [];
    const tStart = c.currentTime;
    let avgR = 0;
    while (!sig.aborted) {
      const now = c.currentTime;
      const p = readPitch();
      const cents = p.midi != null ? (p.midi - target) * 100 : null;
      if (started == null && cents != null && Math.abs(cents) < 150) started = now;
      if (started != null) {
        fr.push({ t: now - started, cents, rms: p.rms });
        const el = now - started;
        timer.firstChild.style.width = Math.min(100, (el / secs) * 100) + '%';
        if (el >= secs) break;
      }
      if (started == null && now - tStart > 10) break;
      avgR = avgR * 0.85 + p.rms * 0.15;
      airFill.style.width = Math.min(100, avgR * 600) + '%';
      roll.addUser(now, p.midi, cents == null ? null : Math.abs(cents) <= tol / 2);
      roll.draw(now);
      await raf();
    }
    roll.destroy();
    const v = fr.filter((f) => f.t > 0.3 && f.cents != null && Math.abs(f.cents) < 150);
    if (v.length < 10) { per.push(0); continue; }
    const inT = v.filter((f) => Math.abs(f.cents) <= tol / 2).length / v.length;
    // con vibrato se evalúa el centro de la oscilación, no cada cuadro
    const m = v.reduce((a, f) => a + f.cents, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, f) => a + (f.cents - m) ** 2, 0) / v.length);
    const rs = fr.filter((f) => f.t > 0.3 && f.rms > 0).map((f) => f.rms);
    const rm = rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length);
    const cv = rs.length ? Math.sqrt(rs.reduce((a, b) => a + (b - rm) ** 2, 0) / rs.length) / (rm || 1) : 1;
    const body = v.filter((f) => f.t < secs * 0.7), tail = v.filter((f) => f.t >= secs * 0.75);
    if (body.length > 5 && tail.length > 5) { const mb = body.reduce((a, f) => a + f.cents, 0) / body.length, mt = tail.reduce((a, f) => a + f.cents, 0) / tail.length; if (mb - mt > 20) tails++; }
    let vib = null;
    if (spec.vibrato) { // oscilación periódica alrededor de la nota: frecuencia (cruces por la media móvil) y amplitud
      const w = 15; const det = [];
      for (let k = w; k < v.length - w; k++) { let a = 0; for (let j = k - w; j <= k + w; j++) a += v[j].cents; det.push({ t: v[k].t, c: v[k].cents - a / (2 * w + 1) }); }
      let cross = 0; for (let k = 1; k < det.length; k++) if ((det[k - 1].c < 0) !== (det[k].c < 0)) cross++;
      const dur = det.length > 1 ? det[det.length - 1].t - det[0].t : 0;
      const rate = dur > 0 ? cross / 2 / dur : 0;
      const ext = Math.sqrt(det.reduce((a, d) => a + d.c * d.c, 0) / Math.max(1, det.length)) * Math.SQRT2;
      vib = { rate, ext, ok: rate >= 4 && rate <= 8 && ext >= 12 && ext <= 120 };
      vibs.push(vib);
    }
    const pitchSteady = vib ? 1 : Math.max(0, Math.min(1, 1 - (sd - 8) / 30));
    const airSteady = Math.max(0, Math.min(1, 1 - (cv - 0.15) / 0.45));
    const tuneScore = vib ? Math.max(0, Math.min(1, 1 - (Math.abs(m) - tol / 2) / 40)) : Math.min(1, inT / 0.8);
    per.push(0.5 * tuneScore + 0.25 * pitchSteady + 0.25 * airSteady);
    allPitch.push({ m, sd }); allRms.push(cv);
    if (vib ? Math.abs(m) <= tol / 2 : inT > 0.6) sfx('ok');
    await sleep(400);
  }
  const score = per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
  const issues = [];
  if (allPitch.length) {
    const mm = allPitch.reduce((a, p) => a + p.m, 0) / allPitch.length;
    const sd = allPitch.reduce((a, p) => a + p.sd, 0) / allPitch.length;
    const cv = allRms.reduce((a, b) => a + b, 0) / allRms.length;
    if (mm < -20) issues.push({ key: 'bajo', voice: 'd_bajo', weight: 60, text: `Quedaste en promedio <b>${Math.round(-mm)} cents bajo</b>.`, tip: 'Piensa la nota un poquito más arriba y no dejes de dar aire.' });
    if (mm > 20) issues.push({ key: 'alto', voice: 'd_alto', weight: 60, text: `Quedaste en promedio <b>${Math.round(mm)} cents alto</b>.`, tip: 'Suelta la mandíbula y canta más suave.' });
    if (sd > 20 && !(spec.vibrato && vibs.some((x) => x.ok))) issues.push({ key: 'inestable', voice: 'd_inestable', weight: 55, text: `La altura <b>tiembla</b> (±${Math.round(sd)} cents).`, tip: 'Aire continuo, como un hilo. Costillas abiertas mientras cantas.' });
    if (cv > 0.4) issues.push({ key: 'aire', voice: 'd_aire', weight: 50, text: 'El <b>volumen</b> sube y baja: el aire no está saliendo parejo.', tip: 'No sueltes todo al principio. Imagina que tienes que llegar con aire hasta el final.' });
    if (tails >= 1) issues.push({ key: 'cae', voice: 'd_cae', weight: 52, text: 'Al final de la nota <b>se cae la afinación</b>.', tip: 'Mantén la expansión de las costillas hasta el último segundo.' });
    var detail = `Desviación media ${Math.round(Math.abs(mm))} cents, vaivén ±${Math.round(sd)} cents, aire ${cv < 0.25 ? 'muy parejo' : cv < 0.4 ? 'bastante parejo' : 'irregular'}.`;
    if (spec.vibrato) {
      const okV = vibs.filter((x) => x.ok);
      detail += okV.length ? ` Vibrato detectado en ${okV.length} de ${vibs.length} notas: ≈${(okV.reduce((a, x) => a + x.rate, 0) / okV.length).toFixed(1)} oscilaciones por segundo, ±${Math.round(okV.reduce((a, x) => a + x.ext, 0) / okV.length)} cents.` : ' No detecté vibrato (no es obligatorio: aparece solo con la voz suelta).';
    }
  }
  issues.sort((a, b) => b.weight - a.weight);
  return { score, issues, detail: detail || 'No te escuché sostener la nota.' };
}

// ---------- Dinámica: crescendo, decrescendo y messa di voce ----------
// Mide dos cosas a la vez: que el volumen siga la curva (correlación con la forma pedida y rango en dB)
// y que la altura NO se mueva al cambiar el volumen (el error típico: subir de tono al crecer, caer al apagar).
const SHAPES = {
  swell: (x) => Math.sin(Math.PI * x), // messa di voce: suave → fuerte → suave
  cresc: (x) => x,
  decresc: (x) => 1 - x,
};
const SHAPE_TXT = { swell: 'suave → fuerte → suave', cresc: 'de suave a fuerte', decresc: 'de fuerte a suave' };
async function runDynamics(spec, root, sig) {
  const tol = spec.tol ?? 60;
  const secs = spec.secs ?? 6;
  const shape = spec.shape || 'swell';
  const f = SHAPES[shape];
  await startButton(root, spec.text || line('ins_dyn'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_dyn'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const per = []; const issues = []; const details = [];
  let sharpCresc = 0, flatSoft = 0, smallRange = 0;
  for (let i = 0; i < spec.notes.length && !sig.aborted; i++) {
    const target = spec.notes[i];
    const coachBox = h('div');
    const setCoach = (t, m) => coachBox.replaceChildren(say(t, m, { compact: true }));
    const vol = h('canvas', { class: 'roll dyn' });
    const canvas = h('canvas', { class: 'roll small' });
    root.replaceChildren(h('div', { class: 'ex' }, coachBox,
      h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Nota ${i + 1} de ${spec.notes.length}`), h('span', { class: 'pill' }, SHAPE_TXT[shape])),
      h('div', { class: 'small muted' }, 'Volumen (sigue la curva)'), vol,
      h('div', { class: 'small muted' }, 'Altura (debe quedarse en la nota)'), canvas, h('div', { class: 'grow' })));
    const roll = new Roll(canvas, { span: secs + 2, nowFrac: 0.9 });
    roll.setRange(target - 4, target + 4);
    roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    setCoach('Escucha la nota…', 'canta');
    playNote(target, c.currentTime + 0.05, 1.2, 0.28);
    await sleep(1450);
    setCoach(shape === 'decresc' ? 'Empieza con voz llena y ve apagando, sin que la nota se caiga.' : 'Empieza suave, como un susurro con nota, y sigue la curva.', 'atento');
    resetSmoother();
    const g = vol.getContext('2d');
    const DB0 = -48, DB1 = -12; // ventana de dibujo (dBFS)
    const yOf = (db) => 1 - Math.max(0, Math.min(1, (db - DB0) / (DB1 - DB0)));
    const fr = []; let started = null; const tStart = c.currentTime;
    const drawVol = (el) => {
      const r = vol.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
      if (vol.width !== Math.round(r.width * dpr)) { vol.width = r.width * dpr; vol.height = r.height * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
      const cs = getComputedStyle(vol); const cv = (n) => cs.getPropertyValue(n).trim();
      g.fillStyle = cv('--roll-alt'); g.fillRect(0, 0, r.width, r.height);
      // banda guía (forma relativa: de "suave" a "fuerte")
      g.beginPath();
      for (let k = 0; k <= 60; k++) { const x = k / 60; const y = 0.85 - f(x) * 0.65; k ? g.lineTo(x * r.width, y * r.height) : g.moveTo(0, y * r.height); }
      g.strokeStyle = cv('--demo'); g.lineWidth = 14; g.lineCap = 'round'; g.stroke();
      // tu volumen
      g.beginPath(); let first = true;
      for (const p of fr) { const x = (p.t / secs) * r.width; const y = yOf(p.db) * r.height; first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
      g.strokeStyle = cv('--voice'); g.lineWidth = 3; g.stroke();
      if (el != null) { g.fillStyle = cv('--now'); g.fillRect((el / secs) * r.width, 0, 2, r.height); }
    };
    let sm = -60;
    while (!sig.aborted) {
      const now = c.currentTime;
      const p = readPitch();
      const db = 20 * Math.log10(Math.max(1e-5, p.rms));
      sm = sm * 0.7 + db * 0.3;
      const cents = p.midi != null ? (p.midi - target) * 100 : null;
      if (started == null && cents != null && Math.abs(cents) < 150) started = now;
      let el = null;
      if (started != null) {
        el = now - started;
        fr.push({ t: el, db: sm, cents });
        if (el >= secs) break;
      }
      if (started == null && now - tStart > 10) break;
      roll.addUser(now, p.midi, cents == null ? null : Math.abs(cents) <= tol / 2);
      roll.draw(now); drawVol(el);
      await raf();
    }
    roll.destroy();
    const v = fr.filter((x) => x.t > 0.2);
    const voiced = v.filter((x) => x.cents != null && Math.abs(x.cents) < 150);
    if (voiced.length < 15) { per.push(0); details.push('no te escuché sostener la nota'); continue; }
    // forma: correlación entre tu curva de volumen (dB) y la forma pedida
    const xs = v.map((x) => f(Math.min(1, x.t / secs))), ys = v.map((x) => x.db);
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let k = 0; k < xs.length; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; syy += (ys[k] - my) ** 2; }
    const corr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
    const sorted = [...ys].sort((a, b) => a - b);
    const range = sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)];
    // altura: en zona y sin deriva con el volumen
    const inT = voiced.filter((x) => Math.abs(x.cents) <= tol / 2).length / voiced.length;
    const loud = voiced.filter((x) => f(Math.min(1, x.t / secs)) > 0.7), soft = voiced.filter((x) => f(Math.min(1, x.t / secs)) < 0.3);
    const avg = (a) => a.reduce((s2, x) => s2 + x.cents, 0) / a.length;
    const drift = loud.length > 5 && soft.length > 5 ? avg(loud) - avg(soft) : 0;
    if (drift > 20) sharpCresc++;
    if (drift < -20) flatSoft++;
    if (range < 6) smallRange++;
    const sShape = Math.max(0, corr), sRange = Math.min(1, range / 12), sPitch = Math.min(1, inT / 0.8);
    per.push(0.45 * sPitch + 0.35 * sShape * (range >= 4 ? 1 : 0.4) + 0.2 * sRange);
    details.push(`volumen ${Math.round(range)} dB de diferencia, forma ${corr > 0.7 ? 'muy bien seguida' : corr > 0.4 ? 'más o menos seguida' : 'poco parecida a la curva'}, ${Math.round(inT * 100)}% del tiempo afinado` + (Math.abs(drift) > 20 ? `, la altura ${drift > 0 ? 'subió' : 'bajó'} ≈${Math.round(Math.abs(drift))} cents al ${drift > 0 ? 'crecer' : 'apagar'}` : ''));
    if (per[per.length - 1] > 0.7) sfx('ok');
    await sleep(400);
  }
  if (sharpCresc) issues.push({ key: 'sube_fuerte', voice: 'd_sube_fuerte', weight: 60, text: 'Al subir el volumen, <b>la nota se te sube</b>.', tip: 'Más aire, no más presión de garganta. Piensa la nota un poquito más abajo justo cuando creces.' });
  if (flatSoft) issues.push({ key: 'cae', voice: 'd_baja_suave', weight: 55, text: 'Al cantar suave, <b>la nota se cae</b>.', tip: 'Suave no es sin apoyo: mantén las costillas abiertas aunque salga menos aire.' });
  if (smallRange) issues.push({ key: 'dinamica', voice: 'd_dinamica', weight: 45, text: 'Tu volumen casi <b>no cambió</b>.', tip: 'Exagera: el comienzo casi un susurro con nota, el centro con voz llena. (Algunos celulares ajustan el volumen del micrófono solos; con audífonos con micrófono suele medirse mejor.)' });
  issues.sort((a, b) => b.weight - a.weight);
  const score = per.reduce((a, b) => a + b, 0) / Math.max(1, per.length);
  return { score, issues, detail: details.map((d, k) => `Nota ${k + 1}: ${d}.`).join(' ') };
}

const RUNNERS = { info: runInfo, breath: runBreath, range: runRange, match: runMatch, seq: runSeq, ear: runEar, rhythm: runRhythm, sustain: runSustain, dynamics: runDynamics };
