// Motores de ejercicios. Cada runner recibe (spec, root, sig) y devuelve una promesa con
// { score: 0..1, cents?: desviación media, timing?: ms, detail: texto }.
import { getCtx, startMic, readPitch, resetSmoother, playNote, playGlide, click, startDrone, latency } from './audio.js';
import { noteName, solfege } from './pitch.js';
import { h, Roll, tuner, levelMeter, sleep } from './ui.js';
import { getRange, setRange } from './store.js';

const raf = () => new Promise((r) => requestAnimationFrame(r));

async function ensureMic(root) {
  try { await startMic(); return true; }
  catch (e) {
    root.replaceChildren(h('div', { class: 'card warnbox' },
      h('h3', {}, 'Necesito el micrófono'),
      h('p', {}, 'Para escuchar cómo cantas tienes que permitir el micrófono en el navegador (ícono del candado junto a la dirección). Luego vuelve a intentar.'),
    ));
    return false;
  }
}

function startButton(root, text, label = '▶ Empezar') {
  return new Promise((res) => {
    const b = h('button', { class: 'btn primary big', onclick: () => { getCtx(); res(); } }, label);
    root.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'instr', html: text }), b));
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
    root.replaceChildren(h('div', { class: 'card info' },
      spec.title ? h('h3', {}, spec.title) : null,
      h('div', { class: 'body', html: spec.body }),
      h('button', { class: 'btn primary big', onclick: () => res({ score: 1, info: true }) }, 'Entendido'),
    ));
  });
}

// ---------- Respiración guiada ----------
async function runBreath(spec, root, sig) {
  await startButton(root, spec.text || 'Sigue las indicaciones. Hombros relajados, que se expandan las costillas y la espalda baja, no el pecho alto.');
  let micOk = false;
  try { await startMic(); micOk = true; } catch (e) {}
  const label = h('div', { class: 'breath-label' });
  const count = h('div', { class: 'breath-count' });
  const prog = h('div', { class: 'progress' }, h('div', { class: 'pfill' }));
  const meter = levelMeter();
  const hint = h('p', { class: 'muted small' }, micOk ? 'La barra muestra tu flujo de aire: mantenla pareja, sin picos ni caídas.' : '');
  const skip = h('button', { class: 'btn ghost', onclick: () => (sig.skip = true) }, 'Terminar');
  root.replaceChildren(h('div', { class: 'card center' }, label, count, prog, micOk ? meter.el : null, hint, skip));
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
  await startButton(root, 'Vamos a medir tu <b>rango cómodo</b>. Primero canta "aaa" y baja poco a poco hasta la nota <b>más grave que puedas sostener sin esfuerzo</b>. Después lo mismo hacia arriba. No fuerces: buscamos tu zona cómoda, no tu récord.');
  if (!(await ensureMic(root))) return { score: 0 };
  const capture = async (dir) => {
    const title = h('h3', {}, dir === 'low' ? '1. Tu nota más grave cómoda' : '2. Tu nota más aguda cómoda');
    const big = h('div', { class: 'bignote' }, '—');
    const best = h('div', { class: 'muted' }, 'Sostén cada nota ~1 segundo para registrarla');
    const done = h('button', { class: 'btn primary big' }, 'Listo');
    root.replaceChildren(h('div', { class: 'card center' }, title, big, best, done));
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
            extreme = med; best.textContent = 'Registrado: ' + noteName(extreme);
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
    root.replaceChildren(h('div', { class: 'card' }, h('p', {}, 'No pude registrar bien tu rango (necesito al menos 5 semitonos). Intenta otra vez en un lugar silencioso.')));
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
    root.replaceChildren(h('div', { class: 'card center' }, h('h3', {}, 'Revisando audífonos…'), h('p', { class: 'muted' }, 'Quédate en silencio un segundo.')));
    const leaks = await leakCheck(midi, drone);
    if (!leaks) { headphonesOk = true; return true; }
    const r = await new Promise((res) => root.replaceChildren(h('div', { class: 'card warnbox' },
      h('h3', {}, '🎧 Necesitas audífonos para este ejercicio'),
      h('p', {}, 'Tu micrófono está escuchando el sonido del parlante. Si sigo así, el detector confundiría ese sonido con tu voz y te daría un puntaje falso.'),
      h('button', { class: 'btn primary big', onclick: () => res('retry') }, 'Ya me los puse, probar de nuevo'),
      h('button', { class: 'btn big', onclick: () => res('skip') }, 'Saltar este ejercicio'))));
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
  await startButton(root, spec.text || `Escucha la nota y cántala. Mantente dentro de la zona verde (±${tol / 2} cents) durante ${hold} s. Si la flecha dice "sube", sube un poquito; si dice "baja", baja.`);
  if (!(await ensureMic(root))) return { score: 0 };
  if (spec.drone != null && !(await requireHeadphones(root, sig, spec.drone, true))) return { score: null, detail: 'Ejercicio saltado (sin audífonos)', skipped: true };
  const results = [];
  const allCents = [];
  const stab = [];
  for (let i = 0; i < spec.notes.length && !sig.aborted; i++) {
    const target = spec.notes[i];
    const iv = spec.drone != null ? ((Math.round(target - spec.drone) % 12) + 12) % 12 : null;
    const ji = iv != null ? JUST[iv] || 0 : 0;
    const lo = Math.min(0, ji) - tol / 2, hi = Math.max(0, ji) + tol / 2;
    const tu = tuner(tol);
    const header = h('div', { class: 'row between' }, h('b', {}, `Nota ${i + 1} de ${spec.notes.length}`), h('span', { class: 'muted' }, spec.drone != null ? 'Bordón: ' + noteName(spec.drone) : ''));
    const canvas = h('canvas', { class: 'roll small' });
    const holdBar = h('div', { class: 'progress' }, h('div', { class: 'pfill ok' }));
    const again = h('button', { class: 'btn' }, '🔊 Oír de nuevo');
    const skip = h('button', { class: 'btn ghost' }, 'Saltar');
    const jiNote = ji ? h('p', { class: 'muted small' }, `Sobre el bordón se acepta también la afinación "pura" de este intervalo (${ji > 0 ? '+' : ''}${ji} cents respecto del piano), que es la que tiende a usar el oído.`) : null;
    root.replaceChildren(h('div', { class: 'card' }, header, tu.el, holdBar, canvas, jiNote, h('div', { class: 'row' }, again, skip)));
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
    let held = 0, lastT = c.currentTime, best = 999, ok = false;
    const centsHeld = [];
    while (!sig.aborted && !skipped) {
      const now = c.currentTime;
      const dt = Math.min(0.1, now - lastT); lastT = now;
      const p = readPitch();
      if (now < quietUntil) {
        tu.update(null, target); tu.el.querySelector('.tmsg').textContent = '👂 Escucha…';
        roll.draw(now); await raf(); continue;
      }
      const cents = tu.update(p.midi, target);
      const inT = cents != null && cents >= lo && cents <= hi;
      if (inT) { const m = tu.el.querySelector('.tmsg'); m.textContent = Math.abs(cents) <= 10 || Math.abs(cents - ji) <= 10 ? '¡Clavado!' : 'Dentro de la zona ✓'; m.className = 'tmsg ok'; }
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
    if (centsHeld.length > 5) {
      const mean = centsHeld.reduce((a, b) => a + b, 0) / centsHeld.length;
      allCents.push(Math.abs(mean - (ji && Math.abs(mean - ji) < Math.abs(mean) ? ji : 0)));
      stab.push(Math.sqrt(centsHeld.reduce((a, b) => a + (b - mean) ** 2, 0) / centsHeld.length));
    }
    if (ok) { tu.el.querySelector('.tmsg').textContent = '¡Bien! ✓'; await sleep(500); }
  }
  const score = results.reduce((a, b) => a + b, 0) / Math.max(1, results.length);
  const cents = allCents.length ? allCents.reduce((a, b) => a + b, 0) / allCents.length : null;
  const sd = stab.length ? stab.reduce((a, b) => a + b, 0) / stab.length : null;
  return { score, cents, detail: `${results.filter((r) => r === 1).length}/${results.length} notas logradas` + (cents != null ? ` · al sostener quedaste a ${Math.round(cents)} cents del centro, con un vaivén de ±${Math.round(sd)} cents` : '') };
}

// ---------- Secuencias: escalas, intervalos, sirenas, melodías ----------
// spec.pattern: [{s: semitonos desde la base | null (silencio), d: tiempos, g: semitono final (glissando), l: etiqueta}]
// Modos: 'echo' = escuchas y repites; 'along' = la 1ª vuelta cantas JUNTO a la guía (sin nota), las siguientes solo (con nota).
async function runSeq(spec, root, sig) {
  const tol = spec.tol ?? 50; // ancho total de la zona (±tol/2)
  const ttol = (spec.ttol ?? 200) / 1000;
  const beat = 60 / (spec.bpm || 80);
  const mode = spec.mode || 'echo';
  const feedback = spec.feedback || 'live';
  let reps = spec.reps || [0];
  if (mode === 'along' && reps.length === 1) reps = [reps[0], reps[0]];
  const instr = spec.text || (mode === 'echo'
    ? 'Primero <b>escucha</b> el patrón (barras grises), después de la cuenta <b>cántalo tú</b> (barras azules). Tu voz aparece como una línea: verde = afinado, naranja = desafinado.'
    : 'La primera vuelta <b>canta junto con la guía</b> (barras grises, no cuenta para el puntaje). Después la guía se calla y <b>sigues tú solo</b> con el clic.');
  await startButton(root, instr + (mode === 'along' && spec.text ? '<br><br><span class="muted">La 1ª vuelta cantas con la guía (sin puntaje); las siguientes, tú solo.</span>' : '') + (feedback === 'after' ? '<br><br><b>Modo sin red:</b> esta vez no verás tu voz mientras cantas; el resultado aparece al final. Así tu oído aprende a corregirse solo.' : ''));
  if (!(await ensureMic(root))) return { score: 0 };

  const c = getCtx();
  const T0 = c.currentTime + 0.4;
  const targets = [];
  const events = [];
  let t = 0;
  const countIn = spec.countIn ?? 4;
  for (let i = 0; i < countIn; i++) events.push({ type: 'click', t: t + i * beat, accent: i === 0 });
  t += countIn * beat;
  const label = (s) => spec.labels === 'none' ? '' : spec.labels === 'solf' || !spec.labels ? solfege(s) : spec.labels;
  const lay = (base, demo, play) => {
    let tt = t;
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
    return tt;
  };
  reps.forEach((r, ri) => {
    const base = spec.base + r;
    if (mode === 'echo') {
      t = lay(base, true, true);
      for (let i = 0; i < 2; i++) events.push({ type: 'click', t: t + i * beat, accent: i === 0 });
      t += 2 * beat;
      t = lay(base, false, false);
    } else {
      t = lay(base, ri === 0, ri === 0);
    }
    t += beat;
  });
  const endT = t;

  const canvas = h('canvas', { class: 'roll' });
  const status = h('div', { class: 'seq-status' }, 'Prepárate…');
  const stopBtn = h('button', { class: 'btn ghost' }, 'Detener');
  let stopped = false; stopBtn.onclick = () => (stopped = true);
  root.replaceChildren(h('div', { class: 'card' }, status, canvas, h('div', { class: 'row' }, stopBtn)));
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
    status.textContent = now < 0 ? 'Cuenta…' : cur ? (cur.demo ? (mode === 'echo' ? '👂 Escucha' : '🎶 Canta con la guía') : '🎤 Canta: ' + (cur.label || noteName(cur.m0))) : '…';
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
    detail: `${hits}/${scored.length} notas afinadas` + (cents != null ? ` · cuando te acercaste a la nota, te desviaste en promedio ${Math.round(cents)} cents` : '') + tmsg,
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
      root.replaceChildren(h('div', { class: 'card center' },
        h('div', { class: 'muted' }, `Pregunta ${r + 1} de ${rounds}` + (spec.kind === 'detune' ? ` · diferencia: ${spec._last} cents` : '')),
        h('h3', {}, q),
        h('button', { class: 'btn big', onclick: play }, '🔊 Escuchar'),
        h('div', { class: 'choices' }, btns)));
      play();
    });
    const good = picked === ans;
    if (good) correct++;
    root.querySelector('.choices').children[ans].classList.add('right');
    if (!good) root.querySelector('.choices').children[picked].classList.add('wrong');
    await sleep(good ? 600 : 1300);
  }
  return { score: correct / rounds, detail: `${correct}/${rounds} correctas` };
}

// ---------- Ritmo: tocar al pulso ----------
async function runRhythm(spec, root, sig) {
  const beat = 60 / (spec.bpm || 80);
  const ttol = (spec.ttol ?? 120) / 1000;
  await startButton(root, spec.text || 'Escucha el ritmo y luego <b>tócalo</b> en el botón grande (o la barra espaciadora) mientras suena el metrónomo. Lo importante: caer justo en el tiempo.');
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
  const pad = h('button', { class: 'tap-pad' }, 'TOCA AQUÍ');
  const status = h('div', { class: 'seq-status' }, 'Escucha…');
  const canvas = h('canvas', { class: 'roll rhythm' });
  root.replaceChildren(h('div', { class: 'card' }, status, canvas, pad));
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
    g.fillStyle = '#ccc';
    for (let k = 0; k * beat < endT; k++) { const xx = x(k * beat); if (xx > 0 && xx < r.width) g.fillRect(xx, 0, 1, r.height); }
    let tt2 = 4 * beat;
    for (const d of spec.pattern) { if (d > 0) { g.fillStyle = '#b0b8c8'; g.fillRect(x(tt2), r.height * 0.2, Math.max(6, d * beat / span * r.width - 4), r.height * 0.25); } tt2 += Math.abs(d) * beat; }
    for (const o of onsets) { g.fillStyle = '#3b82f6'; g.fillRect(x(o), r.height * 0.55, 8, r.height * 0.25); }
    for (const tp of taps) { g.fillStyle = '#16a34a'; g.beginPath(); g.arc(x(tp), r.height * 0.67, 5, 0, 7); g.fill(); }
    g.fillStyle = '#ef4444'; g.fillRect(r.width * 0.25, 0, 2, r.height);
  };
  while (!sig.aborted) {
    const now = c.currentTime - T0;
    if (now > endT) break;
    status.textContent = now < 4 * beat ? 'Cuenta…' : now < demoEnd ? '👂 Escucha el ritmo' : '👆 ¡Tócalo!';
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
  return { score, timing: avg * 1000, detail: `${Math.round(hits)}/${onsets.length} golpes a tiempo` + (absAvg != null ? ` · error medio ${Math.round(absAvg * 1000)} ms ${avg > 0.02 ? '(tiendes a atrasarte)' : avg < -0.02 ? '(tiendes a adelantarte)' : ''}` : '') };
}

const RUNNERS = { info: runInfo, breath: runBreath, range: runRange, match: runMatch, seq: runSeq, ear: runEar, rhythm: runRhythm };
