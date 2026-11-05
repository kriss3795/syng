// Motores de ejercicios. Cada runner recibe (spec, root, sig) y devuelve una promesa con
// { score: 0..1, cents?: desviación media, timing?: ms, detail: texto }.
import { getCtx, startMic, readPitch, resetSmoother, playNote, playGlide, click, startDrone, latency, micStream, decodeFile, readSpectrum, startRecorder } from './audio.js';
import { noteName, solfege } from './pitch.js';
import { h, Roll, tuner, levelMeter, sleep, icon } from './ui.js';
import { say, chincol, diagnoseSeq, line } from './coach.js';
import { observe } from './adapt.js';
import { stopSpeaking, sfx } from './voice.js';
import { getRange, setRange, homeNote, voiceProfile, setVoiceProfile, addDiagnosis, diagnoses, setIdentity } from './store.js';

export const raf = () => new Promise((r) => requestAnimationFrame(r));

export async function ensureMic(root) {
  try { await startMic(); return true; }
  catch (e) {
    root.replaceChildren(h('div', { class: 'ex' },
      say('<b>Necesito escucharte.</b> Permite el micrófono en el navegador (toca el candado junto a la dirección) y vuelve a intentar.', 'piensa', { tone: 'warn', voice: 'mic' })));
    return false;
  }
}

export function startButton(root, text, label = 'Empezar', mood = 'atento', extra = null, voice = null) {
  return new Promise((res) => {
    const b = h('button', { class: 'btn primary big', onclick: () => { try { stopSpeaking(); sfx('select'); getCtx(); } catch (e) { console.warn(e); } res(); } }, label);
    root.replaceChildren(h('div', { class: 'ex' }, say(text, mood, { voice }), extra, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, b)));
  });
}

export function registerRunner(type, fn) { RUNNERS[type] = fn; }
export async function run(spec, root, sig) {
  if (spec.home) { const hn = homeNote(); spec = { ...spec, notes: spec.home.map((o) => hn + o) }; } // en tu "nota de casa"
  if (spec.atHome) spec = { ...spec, base: homeNote() };
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
export async function runMatch(spec, root, sig) {
  const tol = spec.tol ?? 50;
  const hold = spec.hold ?? 1;
  if (!spec.noStart) await startButton(root, spec.text || line('ins_match') + ` <small>(Zona verde: ±${tol / 2} cents durante ${hold} s.)</small>`, 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_match'));
  if (!(await ensureMic(root))) return { score: 0 };
  if (spec.drone != null && !(await requireHeadphones(root, sig, spec.drone, true))) return { score: null, detail: 'Ejercicio saltado (sin audífonos)', skipped: true };
  const results = [];
  let voicedN = 0, octN = 0; const levels = [];
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
    let quietUntil = 0, heardUntil = 0;
    const delay = spec.delay || 0; // memoria auditiva: silencio entre la nota y tu turno
    // mientras suena la nota de referencia no se evalúa (el micrófono podría captarla)
    const play = () => {
      if (spec.playBuf) { const src = c.createBufferSource(); src.buffer = spec.playBuf; const g = c.createGain(); g.gain.value = 1.6; src.connect(g).connect(c.destination); src.start(c.currentTime + 0.05); heardUntil = c.currentTime + spec.playBuf.duration + 0.3; }
      else { playNote(target, c.currentTime + 0.05, 1.1, 0.28); heardUntil = c.currentTime + 1.35; }
      quietUntil = heardUntil + delay;
    };
    play();
    again.onclick = play;
    let skipped = false; skip.onclick = () => (skipped = true);
    resetSmoother();
    const t0 = c.currentTime;
    roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    let held = 0, lastT = c.currentTime, best = 999, ok = false, first = null, lastCoach = '';
    const centsHeld = []; const noteF = [];
    while (!sig.aborted && !skipped) {
      const now = c.currentTime;
      const dt = Math.min(0.1, now - lastT); lastT = now;
      const p = readPitch();
      if (now < quietUntil) {
        const mem = now >= heardUntil;
        tu.update(null, target); tu.setMsg(mem ? 'Guárdala… ' + Math.ceil(quietUntil - now) : 'Escucha…');
        if (lastCoach !== (mem ? 'mem' : 'esc')) { setCoach(mem ? '🧠 Guárdala en tu cabeza, en silencio. Tarárala por dentro…' : '👂 Escucha la nota…', mem ? 'piensa' : 'canta'); lastCoach = mem ? 'mem' : 'esc'; }
        roll.draw(now); await raf(); continue;
      }
      const cents = tu.update(p.midi, target);
      const inT = cents != null && cents >= lo && cents <= hi;
      if (cents != null && first == null) first = cents;
      if (cents != null && Math.abs(cents) < 200) signed.push(cents);
      if (cents != null && Math.abs(cents) < 150) noteF.push({ c: cents, rms: p.rms });
      if (cents != null) { voicedN++; levels.push(p.rms); if (Math.abs(Math.abs(cents) - 1200) < 80) octN++; }
      // el Chincol te acompaña mientras cantas
      const st = cents == null ? 'nada' : inT ? 'ok' : Math.abs(cents) > 150 ? 'lejos' : 'cerca';
      if (st !== lastCoach) {
        lastCoach = st;
        if (st === 'nada') setCoach(spec.imagine ? 'Tu turno: <b>imagina la nota primero</b> y entra directo a ella, sin buscarla desde abajo.' : 'Tu turno: canta la nota. Si te cuesta, tararea "mmm" y desliza la voz.', 'atento');
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
    if (noteF.length >= 8 && !spec.noScore) { // al profe: dónde terminó tu voz en esta nota (la 2ª mitad del intento)
      const half = noteF.slice(Math.floor(noteF.length / 2)).map((f) => f.c).sort((a, b) => a - b);
      observe([{ t: Date.now(), sid: spec._sid, pos: spec._pos, k: 'match', m: Math.round(target), c: Math.round(half[Math.floor(half.length / 2)]), first: first != null ? Math.round(first) : undefined, rms: +(noteF.reduce((a, f) => a + f.rms, 0) / noteF.length).toFixed(4) }]);
    }
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
  levels.sort((a, b) => a - b);
  const reached = results.filter((r) => r === 1).length;
  const rmsMed = levels.length ? levels[Math.floor(levels.length / 2)] : null;
  const prof = voiceProfile();
  if (prof && prof.speakRms && rmsMed != null && rmsMed < prof.speakRms * 0.6) issues.push({ key: 'timido', voice: 'd_timido', text: 'Cantas <b>más bajito que cuando hablas</b>.', tip: 'Con poca voz la nota se vuelve inestable y cuesta más afinar. Canta al menos con la fuerza con que hablas.' });
  const firstAbs = approach.length ? approach.map((a) => Math.abs(a)).sort((a, b) => a - b)[Math.floor(approach.length / 2)] : null;
  return { score, cents, issues, reached, n: results.length, firstAbs, octave: voicedN > 30 && octN / voicedN > 0.4, rmsMed, sd, detail: `${reached} de ${results.length} notas logradas` + (cents != null ? `. Al sostener quedaste a ${Math.round(cents)} cents del centro, con un vaivén de ±${Math.round(sd)} cents.` : '.') };
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
  // Antes de cada ronda que cantas sin guía, te doy tu primera nota (y aviso si la ronda cambia de tono):
  // sin esa referencia, al subir medio tono seguirías en el tono anterior y todo saldría "desafinado".
  const cues = []; const rounds = [];
  const firstNote = spec.pattern.find((n) => n.s != null);
  const semiTxt = (d) => { const a = Math.abs(d); const w = a === 1 ? 'medio tono' : a === 2 ? 'un tono' : a + ' semitonos'; return w + (d > 0 ? ' más arriba' : ' más abajo'); };
  let prevR = reps[0];
  reps.forEach((r, ri) => {
    const base = spec.base + r;
    const r0 = t;
    if (mode === 'along' && ri > 0 && firstNote) {
      const m = base + firstNote.s;
      events.push({ type: 'note', t, d: beat * 1.7, m0: m, m1: m, gain: 0.26 });
      events.push({ type: 'click', t: t + 2 * beat, accent: true }); events.push({ type: 'click', t: t + 3 * beat, accent: false });
      cues.push({ t0: t - 0.3, t1: t + 4 * beat, txt: r !== prevR ? `Ronda ${ri + 1}: ${semiTxt(r - prevR)}. Escucha tu primera nota` : `Ronda ${ri + 1}: esta es tu primera nota` });
      t += 4 * beat;
    } else if (mode === 'echo' && ri > 0 && r !== prevR) {
      cues.push({ t0: t - 0.3, t1: t + 0.6, txt: `Ronda ${ri + 1}: ${semiTxt(r - prevR)}` });
    }
    prevR = r;
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
    rounds.push({ t0: r0, t1: t });
    t += beat;
  });
  const endT = t;
  // Retroalimentación que se retira (hipótesis de guía, Salmoni y Schmidt): en la última ronda no ves tu voz,
  // así aprendes a guiarte por tu oído y lo aprendido se retiene mejor. Al final igual te muestro el resultado.
  const fadeAt = feedback === 'live' && !spec.noFade && rounds.length >= 3 ? rounds[rounds.length - 1].t0 : null;
  if (fadeAt != null) cues.push({ t0: fadeAt - 0.3, t1: fadeAt + 2.2, txt: 'Última ronda: sin mirar tu línea. Confía en tu oído 👂' });

  const canvas = h('canvas', { class: 'roll' });
  const coachBox = h('div');
  let lastStatus = '';
  const status = { set textContent(v) { if (v === lastStatus) return; lastStatus = v; coachBox.replaceChildren(say(v, /Escucha|Yo/.test(v) ? 'canta' : /Canta|juntos/i.test(v) ? 'atento' : 'feliz', { compact: true })); } };
  status.textContent = 'Prepárate…';
  const stopBtn = h('button', { class: 'btn ghost' }, 'Detener');
  let stopped = false; stopBtn.onclick = () => (stopped = true);
  const roundPill = h('span', { class: 'pill' });
  const comboEl = h('div', { class: 'combo-pop' });
  const comboPop = (n) => { comboEl.textContent = n >= 5 ? `🔥 ¡${n} seguidas!` : `+${n} seguidas`; comboEl.classList.remove('go'); void comboEl.offsetWidth; comboEl.classList.add('go'); };
  root.replaceChildren(h('div', { class: 'ex' }, coachBox, reps.length > 1 ? h('div', { class: 'row between' }, roundPill) : null, h('div', { class: 'combo-wrap' }, comboEl), canvas, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, stopBtn)));
  const roll = new Roll(canvas, { span: Math.max(4, Math.min(8, beat * 10)), nowFrac: 0.3 });
  roll.targets = targets.map((x) => x);
  roll.fitTargets(3);
  for (const tg of targets) if (tg.demo) tg.result = 'demo';

  // Los sonidos se programan poco a poco (1,5 s antes), así puedo cortar el ejercicio si ya te salió perfecto.
  events.sort((a, b) => a.t - b.t); let evI = 0;
  const scheduleAhead = () => {
    const lim = c.currentTime - T0 + 1.5;
    while (evI < events.length && events[evI].t < lim) {
      const e = events[evI++]; const at = T0 + e.t;
      if (e.type === 'click') click(at, e.accent, e.soft ? 0.12 : 0.28);
      else if (e.type === 'note') playNote(e.m0, at, e.d, e.gain);
      else playGlide(e.m0, e.m1, at, e.d, e.gain);
    }
  };
  scheduleAhead();
  const recorder = startRecorder();
  // Si una ronda que cantas tú sale muy bien, no te hago repetir las demás: repetir lo que ya dominas aburre y no enseña.
  const scoredRounds = rounds.map((r, ri) => ({ ...r, ri, tgs: targets.filter((x) => !x.demo && x.t0 >= r.t0 - 0.01 && x.t0 < r.t1) })).filter((r) => r.tgs.length);
  let earlyStop = null, checkedRound = -1;

  resetSmoother();
  const lat = latency();
  const scored = targets.filter((x) => !x.demo);
  const all = []; // todos los cuadros: {t, m (suavizado), raw}
  const biasWin = []; const recentFlags = []; const tipCount = {}; let liveTip = null; let eSm = 0, lowE = 0; let combo = 0, maxCombo = 0;
  while (!sig.aborted && !stopped) {
    const now = c.currentTime - T0 - lat; // tiempo musical de lo que el micrófono capta ahora
    if (now > endT + 0.2) break;
    scheduleAhead();
    if (earlyStop != null && now > earlyStop) break;
    const rIdx = scoredRounds.findIndex((r) => now > r.t1 + 0.15 && r.ri > checkedRound);
    if (rIdx >= 0 && earlyStop == null && !spec.noEarly) {
      const r = scoredRounds[rIdx]; checkedRound = r.ri;
      const okN = r.tgs.filter((tg) => { const d = tg.t1 - tg.t0; const fr = tg.frames.filter((f) => f.t >= tg.t0 + Math.min(0.12, d * 0.15) && f.t <= tg.t1 - Math.min(0.06, d * 0.1)); return fr.length && fr.filter((f) => f.ok).length / fr.length >= 0.6; }).length;
      if (rIdx < scoredRounds.length - 1 && okN / r.tgs.length >= 0.85) {
        earlyStop = now + 1.2; const cutT = r.t1 + 0.2;
        for (const tg of targets) if (!tg.demo && tg.t0 > cutT) tg.skip = true;
        cues.push({ t0: now, t1: now + 2, txt: '¡Perfecto! Ya lo tienes: no hace falta repetir 🎉' }); sfx('combo', 5);
      }
    }
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
        active.frames.push({ t: now, cents, ok, rc: p.raw != null ? (p.raw - tm) * 100 : null, rms: p.rms });
        if (Math.abs(cents) < 150) { biasWin.push({ t: now, c: cents }); }
      } else active.frames.push({ t: now, cents: null, ok: false });
    }
    // ---- el profe en vivo: revisa cada nota que terminaste y detecta manías o sesgos ----
    while (biasWin.length && biasWin[0].t < now - 2.2) biasWin.shift();
    for (const tg of scored) {
      if (tg._checked || now < tg.t1 + 0.05) continue;
      tg._checked = true;
      if (tg.m0 !== tg.m1) continue;
      tg.flags = noteFlags(tg, spec.vibrato);
      { // combo: notas afinadas seguidas
        const d = tg.t1 - tg.t0; const body = tg.frames.filter((f) => f.t > tg.t0 + Math.min(0.12, d * 0.15) && f.t < tg.t1 - Math.min(0.06, d * 0.1));
        const hit = body.length >= 3 && body.filter((f) => f.ok).length / body.length >= 0.5;
        if (hit) { combo++; maxCombo = Math.max(maxCombo, combo); if (combo >= 2) { sfx('combo', combo); comboPop(combo); } } else combo = 0;
      }
      recentFlags.push(tg.flags || []); if (recentFlags.length > 4) recentFlags.shift();
      for (const f of tg.flags || []) {
        const times = recentFlags.filter((x) => x.includes(f)).length;
        if (times >= 2 && LIVE_TIPS[f]) { liveTip = { txt: LIVE_TIPS[f], until: now + 3.2 }; tipCount[f] = (tipCount[f] || 0) + 1; }
      }
    }
    if (!liveTip && biasWin.length >= 40) {
      const bm = biasWin.reduce((a, b) => a + b.c, 0) / biasWin.length;
      if (bm <= -30) liveTip = { txt: '⬆ Vas quedando bajo: piensa la nota más arriba y dale aire', until: now + 2.5 };
      else if (bm >= 30) liveTip = { txt: '⬇ Vas quedando alto: suelta, canta más suave', until: now + 2.5 };
    }
    if (spec.energy && active && p.rms) { // cantar con ganas: tu volumen vs tu voz hablada
      eSm = eSm * 0.9 + p.rms * 0.1;
      const ref = (voiceProfile() || {}).speakRms || 0.04;
      if (eSm < ref * 0.75) { lowE += 1 / 60; } else lowE = 0;
      if (!liveTip && lowE > 1.2) liveTip = { txt: '📣 ¡Con más ganas! Más voz que cuando hablas', until: now + 2 };
    }
    if (!liveTip && spec.liveHints && spec.liveHints.leaps) {
      const nxt = scored.find((x) => x.t0 > now && x.t0 - now < beat * 0.9);
      const prv = nxt && scored.filter((x) => x.t1 <= nxt.t0 + 0.01).slice(-1)[0];
      if (nxt && prv && Math.abs(nxt.m0 - prv.m0) >= 4) liveTip = { txt: (nxt.m0 > prv.m0 ? '⬆' : '⬇') + ' Salto: ¡exagéralo!', until: nxt.t0 + 0.4 };
    }
    if (liveTip && now > liveTip.until) liveTip = null;
    roll.addUser(now, p.midi, ok);
    roll.draw(now, { showUser: feedback === 'live' && (fadeAt == null || now < fadeAt - 0.3) });
    const cur = targets.find((x) => now >= x.t0 && now <= x.t1);
    const cue = cues.find((q) => now >= q.t0 && now <= q.t1);
    const rd = rounds.findIndex((q) => now >= q.t0 - beat && now <= q.t1 + beat);
    if (rounds.length > 1) roundPill.textContent = `Ronda ${Math.max(1, rd + 1)} de ${rounds.length}`;
    status.textContent = cue ? '👂 ' + cue.txt : liveTip && cur && !cur.demo ? liveTip.txt : mode === 'read' && now < tonicEnd ? 'Escucha el do: esa es tu casa' : now < musicStart && !cur ? 'Cuenta… 1, 2, 3, 4' : cur ? (cur.demo ? (mode === 'echo' ? 'Escucha cómo lo canto' : 'Canta juntos conmigo') : 'Tu turno: canta “' + (cur.label || noteName(cur.m0)) + '”') : (mode === 'echo' ? 'Prepárate para repetir…' : '¡Sigue tú!');
    await raf();
  }
  const take = recorder ? await recorder.stop() : null;
  if (earlyStop != null) { scored.splice(0, scored.length, ...scored.filter((tg) => !tg.skip)); }
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
        tg.onset = err;
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
  // guardar cada nota para que el profe aprenda tus patrones
  if (!stopped && !spec.noScore) {
    let prevT = null;
    observe(scored.map((tg) => {
      if (tg.m0 !== tg.m1) { prevT = null; return null; }
      const v = tg.frames.filter((f) => f.cents != null && Math.abs(f.cents) < 150 && f.t > tg.t0 + Math.min(0.12, (tg.t1 - tg.t0) * 0.15));
      const contiguous = prevT && prevT.c != null && tg.t0 - prevT.t1 < beat * 0.6;
      const o = v.length >= 5 ? { t: Date.now(), sid: spec._sid, pos: spec._pos, k: 'seq', m: tg.m0, c: Math.round(v.map((f) => f.cents).sort((a, b) => a - b)[Math.floor(v.length / 2)]),
        prev: contiguous ? prevT.m0 : undefined, pc: contiguous ? prevT.c : undefined, on: tg.onset != null ? Math.round(tg.onset * 1000) : undefined,
        rms: v.length ? +(v.reduce((a, f) => a + (f.rms || 0), 0) / v.length).toFixed(4) : undefined, fl: tg.flags || [] } : null;
      prevT = { m0: tg.m0, t1: tg.t1, c: o ? o.c : null };
      return o;
    }).filter(Boolean));
  }
  roll.span = Math.max(roll.span, endT + 1);
  roll.nowFrac = 0;
  roll.draw(0, { showUser: true, full: true });
  roll.destroy();
  let tmsg = '';
  if (tAvg != null && !spec.noTiming) tmsg = Math.abs(tAvg) < 0.06 ? ' · entradas a tiempo ✓' : tAvg > 0 ? ` · en promedio entras tarde (~${Math.round(tAvg * 1000)} ms)` : ` · en promedio te adelantas (~${Math.round(-tAvg * 1000)} ms)`;
  return {
    score, cents, timing: tAvg != null ? tAvg * 1000 : null,
    detail: `${hits} de ${scored.length} notas afinadas` + (cents != null ? `. Cuando llegaste a la nota, te desviaste en promedio ${Math.round(cents)} cents` : '') + tmsg.replace(' · ', '. '),
    issues: [...habitIssues(scored), ...diagnoseSeq(scored, all, { timingErrs: spec.noTiming ? [] : timingErrs, tol })].filter((x, i, a) => a.findIndex((y) => y.key === x.key) === i),
    keepView: canvas, maxCombo, take, early: earlyStop != null,
    model: () => { const c2 = getCtx(); const r0 = scoredRounds[0]; if (!r0) return 0; const t0 = r0.tgs[0].t0; r0.tgs.forEach((tg) => (tg.m0 === tg.m1 ? playNote(tg.m0, c2.currentTime + 0.1 + tg.t0 - t0, (tg.t1 - tg.t0) * 0.95, 0.26) : playGlide(tg.m0, tg.m1, c2.currentTime + 0.1 + tg.t0 - t0, tg.t1 - tg.t0, 0.22))); return r0.tgs[r0.tgs.length - 1].t1 - t0; },
    spec: { mode, bpm: spec.bpm, tol, nNotes: scored.length },
  };
}

// ---------- Manías y vicios en cada nota (lo que un profe escucha) ----------
// sc: entra desde abajo y sube (scoop) · sl: entra desde arriba · cae: el final se desafina hacia abajo
// corta: deja de cantar antes de que termine la nota · aire: se corta en medio (respira o se queda sin aire) · tiembla: altura inestable
export function noteFlags(tg, vibratoOk = false) {
  const d = tg.t1 - tg.t0; const F = tg.frames;
  const v = F.filter((f) => f.cents != null);
  if (v.length < 5) return null;
  const fl = [];
  const body = v.filter((f) => f.t > tg.t0 + d * 0.3 && f.t < tg.t1 - d * 0.2);
  const bm = body.length >= 3 ? body.reduce((a, f) => a + f.cents, 0) / body.length : null;
  const head = v.filter((f) => f.t < tg.t0 + Math.min(0.3, d * 0.35)).map((f) => (f.rc != null ? f.rc : f.cents));
  if (bm != null && Math.abs(bm) < 70 && head.length >= 2) {
    // debe verse el movimiento hacia la nota (no una nota anterior sostenida)
    const rise = head[head.length - 1] - head[0];
    if (head[0] <= -70 && head[0] > -400 && head[0] < bm - 50 && rise >= 50) fl.push('sc');
    else if (head[0] >= 70 && head[0] < 400 && head[0] > bm + 50 && rise <= -50) fl.push('sl');
  }
  if (d >= 0.6 && bm != null && Math.abs(bm) < 70) {
    const tail = v.filter((f) => f.t > tg.t1 - d * 0.22);
    if (tail.length >= 3 && tail.reduce((a, f) => a + f.cents, 0) / tail.length - bm <= -35) fl.push('cae');
    const late = F.filter((f) => f.t > tg.t1 - d * 0.3), midF = F.filter((f) => f.t > tg.t0 + d * 0.2 && f.t < tg.t0 + d * 0.6);
    const vf = (a) => a.filter((f) => f.cents != null).length / Math.max(1, a.length);
    if (late.length >= 4 && midF.length >= 4 && vf(midF) > 0.7 && vf(late) < 0.3) fl.push('corta');
    // hueco en medio
    let run = 0, maxRun = 0, seenVoice = false, voiceAfter = false;
    for (const f of F.filter((f) => f.t > tg.t0 + d * 0.15 && f.t < tg.t1 - d * 0.15)) {
      if (f.cents == null) { if (seenVoice) run += 1; } else { if (run) voiceAfter = true; maxRun = Math.max(maxRun, run); run = 0; seenVoice = true; }
    }
    if (maxRun >= 10 && voiceAfter) fl.push('aire');
  }
  // temblor: solo en el centro de la nota (sin la entrada ni el final, que tienen sus propias manías)
  const core = v.filter((f) => f.t > tg.t0 + d * 0.25 && f.t < tg.t1 - d * 0.35);
  if (!vibratoOk && core.length >= 10 && !fl.includes('cae')) {
    const cm = core.reduce((a, f) => a + f.cents, 0) / core.length;
    const sd = Math.sqrt(core.reduce((a, f) => a + (f.cents - cm) ** 2, 0) / core.length);
    if (sd > 32) fl.push('tiembla');
  }
  return fl;
}
const LIVE_TIPS = {
  sc: '🎯 Entras desde abajo: imagina la nota y apunta directo al centro',
  sl: '🎯 Entras desde arriba: apunta directo a la nota',
  cae: '💨 Se te cae el final: mantén el aire hasta el último instante',
  corta: '⏱ Cortas las notas: sostenlas hasta que termine la barra',
  aire: '🫁 Te quedas sin aire en medio: respira antes, bajo y rápido',
  tiembla: '〰 La nota tiembla: aire parejo, como un hilo',
};
const HABIT_TXT = {
  sc: ['Entras a las notas <b>desde abajo</b> y luego subes (en ${n} de ${t} notas).', 'Es una manía muy común: buscas la nota con la voz en vez de oírla antes. Imagina la nota por dentro y empieza ya en ella.', 'd_scoop'],
  cae: ['Al final de las notas largas <b>se cae la afinación</b> (${n} de ${t}).', 'Es soltar el apoyo antes de tiempo. Mantén las costillas abiertas hasta el final.', 'd_cae'],
  corta: ['<b>Cortas las notas</b> antes de que terminen (${n} de ${t}).', 'Sostén cada nota toda su duración: la barra te muestra cuánto dura.', 'd_corta'],
  aire: ['Te <b>quedas sin aire</b> o te cortas en medio de la nota (${n} de ${t}).', 'Respira antes de la frase, bajo y rápido, y dosifica el aire.', 'd_aire'],
  tiembla: ['La nota <b>tiembla</b> mientras la sostienes (${n} de ${t}).', 'Es el aire saliendo a tirones: piensa en un hilo de aire parejo.', 'd_inestable'],
};
function habitIssues(scored) {
  const checked = scored.filter((tg) => tg.flags);
  if (checked.length < 3) return [];
  const out = [];
  for (const k of Object.keys(HABIT_TXT)) {
    const n = checked.filter((tg) => tg.flags.includes(k)).length;
    if (n >= 2 && n / checked.length >= 0.3) {
      const [txt, tip, voice] = HABIT_TXT[k];
      out.push({ key: k === 'sc' ? 'scoop' : k, voice, weight: 58 + n, text: txt.replace('${n}', n).replace('${t}', checked.length), tip });
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}

// ---------- Entrenamiento de oído ----------
const IV_NAMES = { 1: '2ª menor', 2: '2ª mayor', 3: '3ª menor', 4: '3ª mayor', 5: '4ª justa', 7: '5ª justa', 9: '6ª mayor', 12: 'Octava', 0: 'Unísono' };
async function runEar(spec, root, sig) {
  const rounds = spec.rounds || 6;
  const base = spec.base;
  let correct = 0;
  getCtx();
  if (!spec.noStart) await startButton(root, spec.text || line('ins_ear'), 'Empezar', 'atento', null, spec.voice || 'ins_ear');
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
    } else if (spec.kind === 'same') { // ¿igual o distinta? (memoria de altura)
      const diff = Math.random() < 0.5;
      const iv = diff ? (spec.ivs || [1, 2, 3])[Math.floor(Math.random() * (spec.ivs || [1, 2, 3]).length)] * (Math.random() < 0.5 ? 1 : -1) : 0;
      const gap = spec.gap || 0.4;
      q = '¿Las dos notas son iguales o distintas?'; opts = ['Iguales', 'Distintas']; ans = diff ? 1 : 0;
      play = () => { playNote(a, c.currentTime + 0.05, 0.8); playNote(a + iv, c.currentTime + 0.85 + gap, 0.8); };
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
  if (!spec.noStart) await startButton(root, spec.text || line('ins_sustain'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_sustain'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const prof = voiceProfile();
  const loudT = spec.loud ? Math.max(0.012, (prof && prof.speakRms ? prof.speakRms : 0.04) * 0.85) : null; // tu voz hablada como piso
  const levelsAll = []; let loudOk = 0, loudN = 0;
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
    let lastLoud = '';
    if (loudT) air.querySelector('.airtrack').append(h('i', { class: 'airmark', style: `left:${Math.min(98, loudT * 600)}%` }));
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
      if (started != null && cents != null) { levelsAll.push(p.rms); if (loudT) { loudN++; if (avgR >= loudT) loudOk++; } }
      if (loudT && started != null) {
        const st = avgR >= loudT ? 'ok' : 'low';
        if (st !== lastLoud) { lastLoud = st; setCoach(st === 'ok' ? '¡Eso! Voz con cuerpo, sin gritar.' : '¡Más voz! Como si llamaras a alguien al otro lado de la pieza.', st === 'ok' ? 'celebra' : 'atento'); airFill.classList.toggle('low', st === 'low'); }
      }
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
    if (!spec.noScore) observe([{ t: Date.now(), sid: spec._sid, pos: spec._pos, k: 'sus', m: target, c: Math.round(m), sd: Math.round(sd), rms: +rm.toFixed(4) }]);
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
  levelsAll.sort((a, b) => a - b);
  const rmsMed = levelsAll.length ? levelsAll[Math.floor(levelsAll.length / 2)] : null;
  let fscore = score;
  if (loudT) {
    const lf = loudN ? loudOk / loudN : 0;
    fscore = 0.6 * score + 0.4 * Math.min(1, lf / 0.7);
    if (lf < 0.5) issues.push({ key: 'timido', voice: 'd_timido', weight: 70, text: `Solo el ${Math.round(lf * 100)}% del tiempo cantaste con la fuerza de tu voz hablada.`, tip: 'No es gritar: es la misma energía con que hablas. Con más voz, la nota se afirma.' });
    issues.sort((a, b) => b.weight - a.weight);
  }
  const sdAll = allPitch.length ? allPitch.reduce((a, p) => a + p.sd, 0) / allPitch.length : null;
  return { score: fscore, issues, sd: sdAll, rmsMed, detail: detail || 'No te escuché sostener la nota.' };
}


// ---------- Tu nota de casa: la altura de tu voz hablada ----------
// La voz hablada es el gesto vocal que más dominas. Partir cantando cerca de ella es lo más natural.
export async function runSpeak(spec, root, sig) {
  if (!spec.noStart) await startButton(root, spec.text || line('ins_speak'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_speak'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const phrase = h('div', { class: 'speak-card' }, '“Hola, ¿cómo estás? Uno, dos, tres, cuatro, cinco.”');
  const meter = levelMeter();
  const timer = h('div', { class: 'holdbar' }, h('div', { class: 'pfill' }), h('span', {}, 'Escuchando tu voz hablada…'));
  root.replaceChildren(h('div', { class: 'ex' }, say('Dilo en voz alta, <b>como hablas normalmente</b>, sin cantar. Puedes repetirlo.', 'atento', { compact: true }), phrase, meter.el, timer, h('div', { class: 'grow' })));
  resetSmoother();
  const pitches = [], levels = []; const t0 = c.currentTime; const secs = 8;
  while (!sig.aborted && c.currentTime - t0 < secs) {
    const p = readPitch();
    meter.set(Math.min(1, p.rms * 7));
    if (p.raw != null && p.raw > 36 && p.raw < 80) { pitches.push(p.raw); levels.push(p.rms); }
    timer.firstChild.style.width = ((c.currentTime - t0) / secs) * 100 + '%';
    await raf();
  }
  if (pitches.length < 25) {
    root.replaceChildren(h('div', { class: 'ex' }, say('No alcancé a escuchar tu voz hablada. Habla un poco más fuerte o acerca el celular, y repitamos.', 'piensa', { tone: 'warn' })));
    await sleep(1800);
    return { score: 0, detail: 'No se escuchó la voz hablada.' };
  }
  pitches.sort((a, b) => a - b); levels.sort((a, b) => a - b);
  const speak = pitches[Math.floor(pitches.length / 2)];
  const pm = pitches.reduce((x, y) => x + y, 0) / pitches.length;
  const speakSD = Math.sqrt(pitches.reduce((x, y) => x + (y - pm) ** 2, 0) / pitches.length); // variación de tu entonación al hablar (semitonos)
  const speakLo = pitches[Math.floor(pitches.length * 0.05)], speakHi = pitches[Math.floor(pitches.length * 0.95)];
  const speakRms = levels[Math.floor(levels.length / 2)];
  setVoiceProfile({ speak, speakRms, speakSD, speakLo, speakHi, at: Date.now() });
  const home = homeNote();
  const again = h('button', { class: 'btn' }, icon('speaker', 18), 'Oír mi nota de casa');
  again.onclick = () => playNote(home, getCtx().currentTime + 0.05, 1.4, 0.3);
  await new Promise((res) => {
    root.replaceChildren(h('div', { class: 'ex' },
      say(`Tu voz hablada se mueve alrededor de <b>${noteName(Math.round(speak))}</b>. Tu <b>nota de casa</b> para cantar será <b>${noteName(home)}</b>: es la que tu voz ya conoce. Escúchala.`, 'celebra', { voice: 'casa_ok' }),
      h('div', { class: 'center' }, h('div', { class: 'home-note' }, noteName(home))),
      h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, again, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); res(); } }, 'Continuar'))));
    playNote(home, getCtx().currentTime + 0.3, 1.4, 0.3);
  });
  return { score: 1, info: !spec.scored, speak, speakRms, detail: `Voz hablada ≈ ${noteName(Math.round(speak))}; nota de casa ${noteName(home)}.` };
}

// ---------- Eco de tu propia voz ----------
// Imitar una grabación de uno mismo es más fácil que imitar un tono ajeno, sobre todo para quien desafina
// (Pfordresher & Mantell, 2014; Hutchins & Peretz, 2012). Grabas una nota, te escuchas y la vuelves a cantar.
async function runSelf(spec, root, sig) {
  if (!spec.noStart) await startButton(root, spec.text || line('ins_self'), 'Empezar', 'atento', null, spec.voice || (spec.text ? null : 'ins_self'));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const rounds = spec.rounds || 3;
  const hints = ['en tu nota de casa', 'un poquito más agudo que antes', 'un poquito más grave que la primera'];
  const scores = []; let lastIssues = []; let tries = 0;
  for (let r = 0; r < rounds && !sig.aborted; r++) {
    // 1) grabar
    const st = micStream();
    let rec = null, chunks = [];
    try { rec = new MediaRecorder(st); rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); } catch (e) { rec = null; }
    const meter = levelMeter();
    const box = h('div');
    root.replaceChildren(h('div', { class: 'ex' }, box, h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Ronda ${r + 1} de ${rounds}`), h('span', { class: 'pill' }, '● grabando')), meter.el, h('div', { class: 'grow' })));
    box.replaceChildren(say(`Canta un <b>"mmm"</b> o un <b>"aaa"</b> parejo, ${hints[r % hints.length]}. Sostenlo hasta que termine la barra.`, 'atento', { compact: true }));
    if (r === 0) playNote(homeNote(), c.currentTime + 0.05, 0.9, 0.22);
    await sleep(r === 0 ? 1100 : 300);
    resetSmoother();
    rec && rec.start();
    const tRec = c.currentTime; const ps = [];
    while (!sig.aborted && c.currentTime - tRec < 2.6) { const p = readPitch(); meter.set(Math.min(1, p.rms * 7)); if (p.raw != null && c.currentTime - tRec > 0.4) ps.push(p.raw); await raf(); }
    if (rec) { await new Promise((res) => { rec.onstop = res; rec.stop(); }); }
    if (ps.length < 30) { box.replaceChildren(say('No te escuché sostener la nota. Probemos de nuevo, con un poco más de voz.', 'piensa', { compact: true })); await sleep(1600); if (++tries < 4) r--; continue; }
    ps.sort((a, b) => a - b);
    const mine = ps[Math.floor(ps.length / 2)];
    let buf = null;
    try { if (rec && chunks.length) buf = await decodeFile(new Blob(chunks, { type: rec.mimeType })); } catch (e) { buf = null; }
    // 2) escucharse y 3) volver a cantarla igual (afinador con tu propia grabación como referencia)
    const res = await runMatch({ type: 'match', notes: [mine], tol: spec.tol || 100, hold: spec.hold || 1.2, playBuf: buf, noStart: true }, root, sig);
    scores.push(res.score); lastIssues = res.issues || [];
  }
  const score = scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length);
  return { score, issues: lastIssues, detail: `${scores.filter((x) => x === 1).length} de ${scores.length} veces volviste a cantar tu propia nota.` };
}

// ---------- ¿Qué le pasa a mi voz? Diagnóstico honesto en 4 pasos ----------
// Separa las causas que describe la investigación: oído (percepción), llegar a la nota (mapeo oído-voz),
// estabilidad (aire/apoyo) y volumen (timidez). Cada resultado sale de lo que el micrófono midió.
async function runDiag(spec, root, sig) {
  await startButton(root, line('ins_diag'), 'Empezar', 'atento', null, 'ins_diag');
  if (!(await ensureMic(root))) return { score: 0 };
  const step = async (n, title, fn) => {
    await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
      h('div', { class: 'diag-step' }, h('span', { class: 'pill' }, `Paso ${n} de 4`), h('h2', {}, title)),
      say(DIAG_STEP[n], 'atento', { voice: 'diag_paso' + n }), h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); sfx('select'); res(); } }, 'Vamos')))));
    return fn();
  };
  const sp = await step(1, 'Tu voz hablada', () => runSpeak({ noStart: true }, root, sig));
  if (sig.aborted) return { score: 0 };
  const earR = await step(2, 'Tu oído', () => runEar({ kind: 'updown', rounds: 6, ivs: [1, 2, 3, 5], base: homeNote() + 2, noStart: true }, root, sig));
  if (sig.aborted) return { score: 0 };
  const hn = homeNote();
  const m = await step(3, 'Llegar a la nota', () => runMatch({ notes: [hn, hn + 3, hn - 2], tol: 100, hold: 1, timeout: 12, noStart: true }, root, sig));
  if (sig.aborted) return { score: 0 };
  const su = await step(4, 'Sostener la nota', () => runSustain({ notes: [hn + 1], secs: 5, tol: 100, noStart: true }, root, sig));
  if (sig.aborted) return { score: 0 };
  const prof = voiceProfile() || {};
  const singRms = [m.rmsMed, su.rmsMed].filter((x) => x != null);
  const sing = singRms.length ? Math.max(...singRms) : null;
  const d = {
    at: Date.now(), ear: earR.score, reached: m.reached, n: m.n, firstAbs: m.firstAbs, octave: m.octave,
    sd: su.sd, loudRatio: prof.speakRms && sing ? sing / prof.speakRms : null, speak: prof.speak,
  };
  const prev = diagnoses().slice(-1)[0];
  addDiagnosis(d);
  const f = diagFindings(d);
  const cmp = prev ? diagCompare(prev, d) : null;
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex diag-report' },
    say('<b>Esto es lo que encontré en tu voz.</b> ' + (f.main ? f.main.lead : ''), 'piensa', { voice: f.main ? f.main.voice : null }),
    h('div', { class: 'diag-list' }, ...f.items.map((x) => h('div', { class: 'diag-item ' + x.tone },
      h('div', { class: 'diag-ic' }, x.tone === 'ok' ? '✓' : x.tone === 'warn' ? '!' : '•'),
      h('div', {}, h('b', {}, x.title), h('p', { html: x.text }), x.tip ? h('p', { class: 'tip', html: x.tip }) : null)))),
    cmp ? h('div', { class: 'card' }, h('b', {}, 'Comparado con tu diagnóstico anterior'), h('p', { class: 'small', html: cmp })) : null,
    h('p', { class: 'small muted' }, 'Basado en Pfordresher & Brown (2007), Hutchins & Peretz (2012) y Pfordresher & Mantell (2014): la mayoría de quienes desafinan oyen bien; lo que falla es traducir lo que oyen en el movimiento de la voz, y eso se entrena.'),
    h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { stopSpeaking(); res(); } }, 'Entendido')))));
  const sc = (Math.min(1, d.ear / 0.8) + (d.n ? d.reached / d.n : 0) + (d.sd == null ? 0 : d.sd < 20 ? 1 : d.sd < 35 ? 0.6 : 0.3) + (d.loudRatio == null ? 0.5 : Math.min(1, d.loudRatio / 0.8))) / 4;
  return { score: Math.max(0.7, sc), info: true, detail: 'Diagnóstico guardado en tu perfil.' };
}
const DIAG_STEP = {
  1: 'Primero dime una frase, hablando normal. Así conozco la altura de tu voz hablada y tu volumen natural.',
  2: 'Ahora tu oído: escucha dos notas y dime si la segunda sube o baja. Sin cantar.',
  3: 'Ahora te toco tres notas y tú intentas cantarlas. Tienes tiempo: desliza la voz si lo necesitas.',
  4: 'Por último, una nota larga. Quiero ver si se mantiene firme y con cuánta voz cantas.',
};
export function diagFindings(d) {
  const items = [];
  // 1) oído
  if (d.ear >= 0.8) items.push({ key: 'oido_ok', tone: 'ok', title: 'Tu oído funciona bien', text: `Acertaste ${Math.round(d.ear * 6)} de 6 al decir si una nota sube o baja. <b>No eres "sordo"</b>: la sordera tonal real es rara.` });
  else if (d.ear >= 0.6) items.push({ key: 'oido_medio', tone: 'mid', title: 'Tu oído va bien, con dudas', text: `Acertaste ${Math.round(d.ear * 6)} de 6. Las diferencias pequeñas todavía te cuestan.`, tip: 'Entrena "¿sube o baja?" y "¿iguales o distintas?" unos minutos al día.' });
  else items.push({ key: 'oido_bajo', tone: 'warn', title: 'Te cuesta oír si sube o baja', text: `Acertaste ${Math.round(d.ear * 6)} de 6.`, tip: 'Empezamos por el oído: escucha con calma y canta despacio después. Mejora rápido con práctica diaria.' });
  // 2) llegar a la nota (mapeo oído-voz)
  const far = d.firstAbs != null ? Math.round(d.firstAbs) : null;
  if (d.octave) items.push({ key: 'octava', tone: 'mid', title: 'Cantas la nota en otra octava', text: 'Varias veces cantaste la misma nota, pero una octava más grave o más aguda. Eso no está mal: es la misma nota en otra altura.', tip: 'Aquí te pedimos la altura exacta: si te piden una nota aguda para ti, escúchala y desliza la voz hacia ella.' });
  if (d.reached >= d.n && (far == null || far < 150)) items.push({ key: 'llegas', tone: 'ok', title: 'Llegas a las notas', text: 'Lograste las tres notas.' + (far != null ? ` Tu primer intento quedó a unos ${far} cents.` : '') });
  else if (d.reached >= 1) items.push({ key: 'mapeo_medio', tone: 'mid', title: 'Llegas a la nota buscándola', text: `Lograste ${d.reached} de ${d.n}.` + (far != null ? ` Al empezar llegas a unos ${far} cents de la nota (100 cents = medio tono).` : ''), tip: 'Antes de cantar, <b>tararea la nota por dentro</b>. Empieza suave y desliza hasta que la bolita quede al centro.' });
  else items.push({ key: 'mapeo', tone: 'warn', title: 'Tu voz todavía no encuentra la nota', text: 'Es lo más común en quienes empiezan: el oído oye bien, pero la voz no sabe aún qué hacer para llegar ahí. Se llama mapeo oído-voz y se entrena.', tip: 'Partimos con tu nota de casa (cerca de tu voz hablada), sirenas que aterrizan y el eco de tu propia voz grabada.' });
  // 3) estabilidad
  if (d.sd != null) {
    if (d.sd < 20) items.push({ key: 'firme', tone: 'ok', title: 'Tu nota larga es firme', text: `Se movió ±${Math.round(d.sd)} cents: estable.` });
    else items.push({ key: 'tiembla', tone: d.sd < 35 ? 'mid' : 'warn', title: 'Tu nota se mueve', text: `Se movió ±${Math.round(d.sd)} cents. Eso se oye "disparejo".`, tip: 'Es el aire: inhala bajo y suelta un hilo de aire parejo. Practica "sss" y notas largas.' });
  }
  // 4) volumen / timidez
  if (d.loudRatio != null) {
    if (d.loudRatio < 0.6) items.push({ key: 'timido', tone: 'warn', title: 'Cantas más bajito que cuando hablas', text: `Al cantar usaste cerca del ${Math.round(d.loudRatio * 100)}% del volumen de tu voz hablada. Es timidez, y es muy común.`, tip: 'Con poca voz la nota tiembla y cuesta más afinar. Canta <b>al menos con la fuerza con que hablas</b>: aquí nadie te escucha.' });
    else items.push({ key: 'volumen_ok', tone: 'ok', title: 'Cantas con voz', text: 'Usas un volumen parecido o mayor al de tu voz hablada.' });
  }
  const order = ['mapeo', 'timido', 'oido_bajo', 'tiembla', 'mapeo_medio', 'octava', 'oido_medio'];
  const mainKey = order.find((k) => items.some((x) => x.key === k));
  const LEAD = {
    mapeo: { lead: 'Lo principal: tu oído y tu voz todavía no están conectados. No es falta de talento; se entrena.', voice: 'diag_mapeo' },
    timido: { lead: 'Lo principal: cantas con miedo, muy bajito. Con más voz vas a afinar mejor.', voice: 'diag_timido' },
    oido_bajo: { lead: 'Lo principal: hay que entrenar el oído primero.', voice: 'diag_oido' },
    tiembla: { lead: 'Lo principal: tu nota se mueve. Es el aire, y tiene arreglo.', voice: 'diag_tiembla' },
    mapeo_medio: { lead: 'Lo principal: llegas a las notas, pero buscándolas. Vamos a hacerlo más directo.', voice: 'diag_mapeo_medio' },
    octava: { lead: 'Lo principal: cantas bien, pero en otra octava. Vamos a ajustar la altura.', voice: 'diag_octava' },
    oido_medio: { lead: 'Vas bien: afinemos el oído un poco más.', voice: 'diag_bien' },
  };
  return { items, main: mainKey ? LEAD[mainKey] : { lead: '¡Vas muy bien! Sigue con el camino.', voice: 'diag_bien' } };
}
function diagCompare(a, b) {
  const out = [];
  if (a.ear != null && b.ear != null && Math.abs(b.ear - a.ear) > 0.1) out.push(`oído ${b.ear > a.ear ? 'mejor' : 'peor'} (${Math.round(a.ear * 6)}→${Math.round(b.ear * 6)} de 6)`);
  if (a.reached != null && b.reached != null && a.reached !== b.reached) out.push(`notas logradas ${a.reached}→${b.reached} de 3`);
  if (a.sd != null && b.sd != null && Math.abs(b.sd - a.sd) > 4) out.push(`nota larga ${b.sd < a.sd ? 'más firme' : 'menos firme'} (±${Math.round(a.sd)}→±${Math.round(b.sd)} cents)`);
  if (a.loudRatio != null && b.loudRatio != null && Math.abs(b.loudRatio - a.loudRatio) > 0.1) out.push(`volumen al cantar ${Math.round(a.loudRatio * 100)}%→${Math.round(b.loudRatio * 100)}% de tu voz hablada`);
  return out.length ? out.join('; ') + '.' : 'Resultados parecidos a la vez anterior.';
}


// ---------- Tu identidad vocal: zona cómoda (tesitura) y timbre, medidos ----------
// Barrido de notas largas por tu rango. En cada nota se mide: afinación, estabilidad (cents), periodicidad
// (→ HNR aproximado: menos ruido = voz más limpia), H1−H2 (más alto = voz más aireada; Hillenbrand y otros),
// y el reparto de energía (graves vs 2–4 kHz, la zona del "formante del cantante" que da brillo: Sundberg).
// Todo es aproximado: el micrófono del celular y la pieza cambian el timbre medido.
export async function runIdentity(spec, root, sig) {
  if (!spec.noStart) await startButton(root, line('ins_ident'), 'Empezar', 'atento', null, 'ins_ident');
  if (!(await ensureMic(root))) return { score: 0 };
  let r = getRange();
  if (r.guessed) { await runRange({}, root, sig); r = getRange(); }
  if (sig.aborted) return { score: 0 };
  const span = r.high - r.low;
  const stepS = span > 16 ? 3 : 2;
  const notes = []; for (let m = r.low + 1; m <= r.high - 1; m += stepS) notes.push(m);
  if (notes.length < 3) for (let m = r.low; m <= r.high; m += 2) if (!notes.includes(m)) notes.push(m);
  notes.sort((a, b) => a - b);
  const c = getCtx(); const per = [];
  for (let i = 0; i < notes.length && !sig.aborted; i++) {
    const target = notes[i];
    const coachBox = h('div');
    const canvas = h('canvas', { class: 'roll small' });
    const timer = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, 'Sostén "aaa" 3 segundos'));
    root.replaceChildren(h('div', { class: 'ex' }, coachBox, h('div', { class: 'row between' }, h('span', { class: 'pill' }, `Nota ${i + 1} de ${notes.length}`), h('span', { class: 'pill' }, noteName(target))), canvas, timer, h('div', { class: 'grow' }),
      h('div', { class: 'actionbar' }, h('button', { class: 'btn ghost', onclick: () => (skipNote = true) }, 'No llego a esta nota'))));
    let skipNote = false;
    const roll = new Roll(canvas, { span: 5, nowFrac: 0.9 });
    roll.setRange(target - 5, target + 5); roll.targets = [{ t0: -100, t1: 1e9, m0: target, m1: target }];
    coachBox.replaceChildren(say('Escucha la nota…', 'canta', { compact: true }));
    playNote(target, c.currentTime + 0.05, 1.1, 0.28);
    await sleep(1350);
    coachBox.replaceChildren(say('Canta <b>"aaa"</b> cómodo, con tu voz natural. No es examen: quiero oír cómo suena tu voz aquí.', 'atento', { compact: true }));
    resetSmoother();
    const fr = []; let started = null; const t0 = c.currentTime; let k = 0;
    const acc = { n: 0, h12: [], low: 0, sf: 0, mid: 0, cen: 0, cenW: 0 };
    while (!sig.aborted && !skipNote) {
      const now = c.currentTime; const p = readPitch();
      const cents = p.raw != null ? (p.raw - target) * 100 : null;
      if (started == null && cents != null && Math.abs(cents) < 200) started = now;
      if (started != null) {
        const el = now - started;
        if (el > 0.4 && cents != null && Math.abs(cents) < 200) {
          fr.push({ cents, rms: p.rms, clar: p.clarity });
          if (++k % 3 === 0) { // timbre desde el espectro
            const sp = readSpectrum(); const f0 = 440 * 2 ** ((p.raw - 69) / 12);
            if (sp) {
              const pk = (f) => { let b = -200; const i0 = Math.floor((f * 0.95) / sp.binHz), i1 = Math.ceil((f * 1.05) / sp.binHz); for (let j = i0; j <= i1; j++) b = Math.max(b, sp.db[j]); return b; };
              if (f0 >= 150) acc.h12.push(pk(f0) - pk(2 * f0));
              let low = 0, mid = 0, sf = 0, cn = 0, cw = 0;
              for (let j = 1; j < sp.db.length; j++) {
                const f = j * sp.binHz; if (f > 5000) break; if (f < 70) continue;
                const pw = 10 ** (sp.db[j] / 10);
                if (f < 1000) low += pw; else if (f < 2000) mid += pw; else if (f >= 2000 && f < 4000) sf += pw;
                cn += f * pw; cw += pw;
              }
              if (cw > 0) { acc.low += low; acc.mid += mid; acc.sf += sf; acc.cen += cn; acc.cenW += cw; acc.n++; }
            }
          }
        }
        timer.firstChild.style.width = Math.min(100, (el / 3.4) * 100) + '%';
        if (el >= 3.4) break;
      }
      if (started == null && now - t0 > 8) break;
      roll.addUser(now, p.midi, cents == null ? null : Math.abs(cents) <= 50); roll.draw(now);
      await raf();
    }
    roll.destroy();
    if (fr.length < 25) { per.push({ m: target, ok: false }); continue; }
    const mean = fr.reduce((a, f) => a + f.cents, 0) / fr.length;
    const sd = Math.sqrt(fr.reduce((a, f) => a + (f.cents - mean) ** 2, 0) / fr.length);
    const inT = fr.filter((f) => Math.abs(f.cents) <= 50).length / fr.length;
    const clar = fr.reduce((a, f) => a + f.clar, 0) / fr.length;
    const rms = fr.reduce((a, f) => a + f.rms, 0) / fr.length;
    const cv = Math.sqrt(fr.reduce((a, f) => a + (f.rms - rms) ** 2, 0) / fr.length) / (rms || 1);
    const hnr = 10 * Math.log10(Math.min(0.999, clar) / (1 - Math.min(0.999, clar)));
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
    per.push({ m: target, ok: true, inT, sd, hnr, cv, rms, h12: med(acc.h12),
      bright: acc.n && acc.low ? 10 * Math.log10((acc.sf + 1e-12) / acc.low) : null, cen: acc.cenW ? acc.cen / acc.cenW : null });
    sfx('tap');
    await sleep(300);
  }
  if (sig.aborted) return { score: 0 };
  const id = identityFrom(per, r);
  setIdentity(id);
  // práctico: desde ahora los ejercicios se centran en tu zona dulce
  if (id.sweetLo != null) { setRange({ ...r, comfort: Math.round((id.sweetLo + id.sweetHi) / 2), guessed: false }); id.applied = true; }
  if (spec.quiet) return { score: 1, info: true, id };
  await new Promise((res) => root.replaceChildren(identityView(id, () => { stopSpeaking(); res(); })));
  return { score: 1, info: true, id, detail: 'Identidad vocal guardada en tu perfil.' };
}
export function identityFrom(per, r) {
  const ok = per.filter((p) => p.ok);
  // comodidad por nota: afinación + estabilidad + voz limpia + volumen parejo
  ok.forEach((p) => { p.comfort = 0.35 * Math.min(1, p.inT / 0.8) + 0.3 * Math.max(0, Math.min(1, 1 - (p.sd - 8) / 30)) + 0.2 * Math.max(0, Math.min(1, (p.hnr - 8) / 12)) + 0.15 * Math.max(0, Math.min(1, 1 - (p.cv - 0.12) / 0.4)); });
  // zona dulce: la ventana de ~5 semitonos con mejor comodidad media
  let best = null;
  for (const a of ok) {
    const win = ok.filter((p) => p.m >= a.m && p.m <= a.m + 5);
    if (win.length < 2 && ok.length > 2) continue;
    const sc = win.reduce((s, p) => s + p.comfort, 0) / win.length;
    if (!best || sc > best.sc) best = { sc, lo: win[0].m, hi: win[win.length - 1].m };
  }
  const prof = voiceProfile() || {};
  const avg = (k) => { const v = ok.map((p) => p[k]).filter((x) => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const center = (r.low + r.high) / 2;
  // voz hablada < ~160 Hz suele ser una voz grave (típica de hombres); en la zona ambigua decide el rango
  const graveTipica = prof.speak != null && (prof.speak < 51 || prof.speak > 55) ? prof.speak < 51 : center < 60;
  const type = graveTipica ? (center < 53.5 ? 'bajo' : center < 57.5 ? 'barítono' : 'tenor') : (center < 67 ? 'contralto' : center < 70.5 ? 'mezzosoprano' : 'soprano');
  // cambio de registro: mayor caída de comodidad entre notas vecinas en la mitad alta
  let brk = null;
  for (let i = 1; i < ok.length; i++) { const drop = ok[i - 1].comfort - ok[i].comfort; if (ok[i].m > center - 2 && drop > 0.2 && (!brk || drop > brk.drop)) brk = { m: ok[i].m, drop }; }
  const hnr = avg('hnr'), h12 = avg('h12'), bright = avg('bright');
  const texture = hnr == null ? null : hnr >= 17 ? 'limpia' : (h12 != null && h12 > 8) ? 'aireada' : hnr >= 12 ? 'con textura suave' : (h12 != null && h12 < 2) ? 'rasposa' : 'aireada o rasposa';
  const color = bright == null ? null : bright > -18 ? 'brillante' : bright < -28 ? 'oscura y cálida' : 'equilibrada';
  return { at: Date.now(), low: r.low, high: r.high, speak: prof.speak ?? null, sweetLo: best ? best.lo : null, sweetHi: best ? best.hi : null,
    type, brk: brk ? brk.m : null, hnr, h12, bright, texture, color, per: per.map((p) => (p.ok ? { m: p.m, comfort: p.comfort, inT: p.inT, sd: p.sd, hnr: p.hnr } : { m: p.m, comfort: 0, missed: true })), missed: per.filter((p) => !p.ok).map((p) => p.m) };
}
export function identityView(id, onDone) {
  const nn = (m) => (m == null ? '—' : noteName(m));
  const TYPE_TXT = { bajo: 'Bajo: la voz más grave, profunda y resonante.', barítono: 'Barítono: la voz masculina más común, de color lleno y versátil.', tenor: 'Tenor: voz masculina aguda, clara y brillante.', contralto: 'Contralto: la voz femenina más grave, profunda y cálida.', mezzosoprano: 'Mezzosoprano: voz femenina media, cálida y rica.', soprano: 'Soprano: voz femenina aguda, clara y brillante.' };
  const TEX_TXT = { limpia: 'Tu sonido es limpio: poco ruido de aire.', aireada: 'Tu sonido tiene aire (soplado). Es un color válido en pop suave; para más proyección, cierra un poco más la voz con el "ataque limpio".', 'con textura suave': 'Tu voz tiene algo de aire o textura: le da un color cálido.', rasposa: 'Tu voz tiene aspereza (rasposa). Si no es tu estilo buscado o si duele, no la fuerces; si persiste ronca sin cantar, consúltalo con un fonoaudiólogo.', 'aireada o rasposa': 'Tu sonido tiene bastante ruido (aire o aspereza). Puede ser timidez (poca voz) o el micrófono: repite el análisis con más voz.' };
  const COL_TXT = { brillante: 'Tienes mucha energía alrededor de 3 kHz: tu voz "corta" y se proyecta.', 'oscura y cálida': 'La energía se concentra en los graves: tu voz suena redonda y cálida.', equilibrada: 'Tu energía está repartida entre graves y agudos.' };
  const bars = h('div', { class: 'tess' }, ...id.per.map((p) => h('div', { class: 'tess-col' + (id.sweetLo != null && p.m >= id.sweetLo && p.m <= id.sweetHi ? ' sweet' : '') },
    h('div', { class: 'tess-bar' + (p.missed ? ' miss' : ''), style: `height:${p.missed ? 4 : Math.round(12 + p.comfort * 88)}%` }), h('small', {}, nn(p.m)))));
  return h('div', { class: 'ex identity' },
    say(`<b>Tu identidad vocal.</b> Tu voz se parece a la de un <b>${id.type}</b>, y donde mejor suenas es entre <b>${nn(id.sweetLo)}</b> y <b>${nn(id.sweetHi)}</b>.`, 'celebra', { voice: 'ident_ok' }),
    h('div', { class: 'card' }, h('h3', {}, 'Dónde cantas mejor'), bars,
      h('p', { class: 'small' }, `Barra más alta = nota más cómoda (afinada, estable, limpia y pareja). Tu zona dulce: ${nn(id.sweetLo)}–${nn(id.sweetHi)}. Rango cómodo medido: ${nn(id.low)}–${nn(id.high)}.` + (id.speak != null ? ` Voz hablada ≈ ${nn(Math.round(id.speak))}.` : '') + (id.brk ? ` Tu voz cambia de comodidad cerca de ${nn(id.brk)}: probablemente ahí está tu cambio de registro.` : '') + (id.missed.length ? ` No llegaste a: ${id.missed.map(nn).join(', ')}.` : ''))),
    id.applied ? h('div', { class: 'card ok-card' }, h('b', {}, 'Ya lo apliqué: '), `desde ahora tus ejercicios y canciones de práctica se centran en tu zona dulce (${nn(id.sweetLo)}–${nn(id.sweetHi)}).`) : null,
    h('div', { class: 'card' }, h('h3', {}, 'Tipo de voz probable: ' + id.type), h('p', { class: 'small' }, TYPE_TXT[id.type] + ' Se estima por tu rango, tu zona cómoda y tu voz hablada. Con entrenamiento el rango crece; un profe lo confirma escuchándote.')),
    h('div', { class: 'card' }, h('h3', {}, 'Tu timbre'),
      id.color ? h('p', {}, h('b', {}, 'Color: ' + id.color + '. '), COL_TXT[id.color], h('small', { class: 'muted' }, ` (energía 2–4 kHz vs graves: ${Math.round(id.bright)} dB)`)) : null,
      id.texture ? h('p', {}, h('b', {}, 'Textura: ' + id.texture + '. '), TEX_TXT[id.texture], h('small', { class: 'muted' }, ` (armonía/ruido ≈ ${Math.round(id.hnr)} dB` + (id.h12 != null ? `, H1−H2 ≈ ${Math.round(id.h12)} dB` : '') + ')')) : null,
      h('p', { class: 'small muted' }, 'Medidas aproximadas: el micrófono del celular y la pieza cambian el timbre. Repite el análisis en el mismo lugar para comparar.')),
    h('div', { class: 'card' }, h('h3', {}, 'Para tus canciones'),
      h('p', { class: 'small' }, `Elige tonos donde la mayor parte de la melodía caiga entre ${nn(id.sweetLo)} y ${nn(id.sweetHi)}, y las notas más altas no pasen de ${nn(id.high)}. En Suno puedes describir la voz como: "${id.type}, voz ${id.color || 'natural'}${id.texture === 'limpia' ? ', clara' : id.texture === 'aireada' ? ', suave y aireada' : id.texture === 'rasposa' ? ', rasposa' : ''}".`)),
    h('div', { class: 'grow' }),
    onDone ? h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: onDone }, 'Entendido')) : null);
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

const RUNNERS = { info: runInfo, breath: runBreath, range: runRange, match: runMatch, seq: runSeq, ear: runEar, rhythm: runRhythm, sustain: runSustain, dynamics: runDynamics, speak: runSpeak, self: runSelf, diag: runDiag, identity: runIdentity };
