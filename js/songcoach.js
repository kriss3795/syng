// El profe escucha tus canciones: analiza cada frase como lo haría un profesor de canto.
// Mide en cada nota la afinación (cents con signo), cómo entras (desde abajo, tarde), cómo terminas
// (final que cae, final cortado), si respiras en medio y si la nota tiembla; luego lo junta por frase y por
// canción, ubica la palabra exacta donde fallas y arma un plan de práctica con lo que más te conviene.
import { noteFlags } from './exercises.js';
import { voiceProfile } from './store.js';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const r0 = Math.round;

function noteStats(x) {
  const d = x.t1 - x.t0;
  const v = x.frames.filter((f) => f.cents != null && Math.abs(f.cents) < 150 && f.t > x.t0 + Math.min(0.08, d * 0.2) && f.t < x.t1 - Math.min(0.04, d * 0.1));
  const voiced = x.frames.filter((f) => f.cents != null).length / Math.max(1, x.frames.length);
  return { c: v.length >= 3 ? med(v.map((f) => f.cents)) : null, n: v.length, voiced, ok: v.length ? v.filter((f) => Math.abs(f.cents) <= x.tolHalf).length / v.length : 0 };
}
// entrada: primer instante en que tu voz llega a la nota viniendo de otra nota o del silencio
function onsetOf(x, all) {
  const d = x.t1 - x.t0; const w0 = x.t0 - 0.3, w1 = x.t0 + Math.min(0.6, d * 0.6);
  const near = (f) => f && f.m != null && Math.abs(f.m - x.m0) * 100 <= 60;
  let i = all.findIndex((f) => f.t >= w0);
  if (i < 0) return null;
  if (i > 0 && near(all[i - 1])) return null; // venías en la misma nota: no se puede medir
  for (; i < all.length && all[i].t <= w1; i++) if (near(all[i]) && near(all[i + 1])) return all[i].t - x.t0;
  return null;
}
function wordAt(line, t) {
  if (!line || !line.words || !line.words.length) return null;
  let w = line.words[0];
  for (const x of line.words) if (x.t <= t + 0.05) w = x;
  return w.w.replace(/[.,;:!?¡¿"]/g, '');
}

export function songReport({ targets, lines, all, tol = 70 }) {
  const done = targets.filter((x) => x.frames.length);
  done.forEach((x) => { x.tolHalf = tol / 2; x.st = noteStats(x); x.fl = noteFlags(x) || []; x.on = onsetOf(x, all || []); });
  const sung = done.filter((x) => x.st.c != null);
  const hits = done.filter((x) => x.st.ok >= 0.5).length;
  const score = done.length ? hits / done.length : 0;
  const rep = { score, hits, n: done.length, lines: [], global: [], plan: [] };
  if (done.length < 5) return rep;

  // ---------- por frase ----------
  const lineIdx = (x) => { let k = -1; for (let i = 0; i < lines.length; i++) if (x.t0 >= lines[i].t0 - 0.15 && x.t0 < lines[i].t1 + 0.05) k = i; return k; };
  const byLine = {};
  done.forEach((x) => { const k = lineIdx(x); if (k >= 0) (byLine[k] = byLine[k] || []).push(x); });
  for (const [k, ns] of Object.entries(byLine)) {
    const i = Number(k); const ln = lines[i];
    const sn = ns.filter((x) => x.st.c != null);
    const sc = ns.filter((x) => x.st.ok >= 0.5).length / ns.length;
    const probs = [];
    const bias = sn.length >= 3 ? mean(sn.map((x) => x.st.c)) : null;
    if (bias != null && bias <= -25) probs.push({ key: 'baja', w: 3, text: `Toda la frase te queda <b>baja</b> (${r0(bias)} cents en promedio).`, tip: 'Cántala primero con "la" mirando la línea, pensando cada nota más arriba. Después con letra.' });
    if (bias != null && bias >= 25) probs.push({ key: 'alta', w: 3, text: `Toda la frase te queda <b>alta</b> (+${r0(bias)} cents).`, tip: 'Estás empujando. Cántala más suave y con la mandíbula suelta.' });
    const last = ns[ns.length - 1];
    if (last.fl.includes('cae')) probs.push({ key: 'fin_cae', w: 4, text: `El <b>final de la frase se cae</b> ("${wordAt(ln, last.t0) || '…'}").`, tip: 'Sostén el aire hasta soltar la última sílaba. Piensa la última nota "hacia arriba".' });
    if (last.fl.includes('corta')) probs.push({ key: 'fin_corta', w: 3, text: `<b>Cortas el final</b> de la frase ("${wordAt(ln, last.t0) || '…'}").`, tip: 'Dale a la última sílaba toda su duración: mira la barra hasta que termine.' });
    if (last.st.c != null && sn.length >= 3) { const rest = sn.filter((x) => x !== last); const rb = mean(rest.map((x) => x.st.c)); if (last.st.c - rb <= -35 && !last.fl.includes('cae')) probs.push({ key: 'fin_bajo', w: 3, text: `La <b>última nota</b> ("${wordAt(ln, last.t0) || '…'}") te queda ${r0(last.st.c)} cents, más baja que el resto.`, tip: 'Llegas sin aire al final: respira bien antes de la frase y dosifica.' }); }
    const first = ns[0];
    if (first.on != null && first.on > 0.15) probs.push({ key: 'entrada_tarde', w: 2, text: `<b>Entras tarde</b> a la frase (~${r0(first.on * 1000)} ms).`, tip: 'Toma aire un tiempo antes, en el silencio previo, para entrar justo.' });
    if (first.on != null && first.on < -0.15) probs.push({ key: 'entrada_temprano', w: 2, text: `<b>Te adelantas</b> al entrar (~${r0(-first.on * 1000)} ms).`, tip: 'Espera el pulso: entra con la música, no antes.' });
    const scoops = ns.filter((x) => x.fl.includes('sc')).length;
    if (scoops >= 2 && scoops / ns.length >= 0.3) probs.push({ key: 'scoop', w: 2, text: `<b>Entras desde abajo</b> en ${scoops} notas de la frase.`, tip: 'Escucha la nota por dentro antes y apunta directo al centro.' });
    if (ns.some((x) => x.fl.includes('aire'))) probs.push({ key: 'aire', w: 2, text: 'Te <b>cortas en medio</b> de una nota (aire o respiración a destiempo).', tip: 'Respira solo al final de las frases, bajo y rápido.' });
    const top = sn.length ? sn.reduce((a, b) => (b.m0 > a.m0 ? b : a)) : null;
    if (top && sn.length >= 3 && top.st.c != null && Math.abs(top.st.c) >= 40) probs.push({ key: 'nota_alta', w: 3, text: `En la <b>nota más alta</b> ("${wordAt(ln, top.t0) || '…'}") quedas ${top.st.c > 0 ? '+' : ''}${r0(top.st.c)} cents.`, tip: top.st.c < 0 ? 'Prepárala: más aire y voz más liviana al subir. No la alcances desde abajo.' : 'No la empujes: liviana y con la garganta suelta.' });
    // palabras: verde / ámbar / rojo según sus notas
    const words = (ln.words || []).map((w, j) => {
      const tEnd = ln.words[j + 1] ? ln.words[j + 1].t : ln.t1 + 0.1;
      const wn = ns.filter((x) => x.t0 >= w.t - 0.05 && x.t0 < tEnd - 0.02);
      if (!wn.length) return { w: w.w, s: null };
      const okR = wn.filter((x) => x.st.ok >= 0.5).length / wn.length;
      const cs = wn.map((x) => x.st.c).filter((c) => c != null);
      return { w: w.w, s: okR >= 0.67 ? 'ok' : okR >= 0.34 ? 'meh' : 'bad', c: cs.length ? r0(mean(cs)) : null };
    });
    const badW = words.filter((w) => w.s === 'bad' && w.c != null).sort((a, b) => Math.abs(b.c) - Math.abs(a.c))[0];
    if (badW && Math.abs(badW.c) >= 50) probs.push({ key: 'palabra', w: 2, text: `En <b>"${badW.w.replace(/[.,;:!?¡¿"]/g, '')}"</b> quedas ${badW.c > 0 ? '+' : ''}${badW.c} cents.`, tip: 'Aísla esa palabra: cántala lento con "la", luego con su vocal, luego con la palabra.' });
    probs.sort((a, b) => b.w - a.w);
    rep.lines.push({ i, text: ln.text, score: sc, bias, words, probs, n: ns.length });
  }

  // ---------- canción completa: tus hábitos en esta canción ----------
  const G = [];
  const ends = rep.lines.filter((l) => l.n >= 2);
  const fallEnds = ends.filter((l) => l.probs.some((p) => p.key === 'fin_cae' || p.key === 'fin_bajo')).length;
  const cutEnds = ends.filter((l) => l.probs.some((p) => p.key === 'fin_corta')).length;
  if (ends.length >= 3 && fallEnds / ends.length >= 0.3) G.push({ key: 'finales', title: 'Terminas las frases cayendo', evidence: `Pasó en ${fallEnds} de ${ends.length} frases.`, tip: 'Es soltar el apoyo antes de tiempo. Ejercicio: canta solo la última palabra de cada frase y sostenla 3 segundos sin que baje. Después la frase completa.' });
  if (ends.length >= 3 && cutEnds / ends.length >= 0.3) G.push({ key: 'cortes', title: 'Cortas los finales de frase', evidence: `Pasó en ${cutEnds} de ${ends.length} frases.`, tip: 'Muchas veces es inseguridad: el final también es parte de la frase. Sostén la última sílaba hasta que termine la barra.' });
  if (sung.length >= 10) {
    const b = mean(sung.map((x) => x.st.c));
    if (b <= -15) G.push({ key: 'bajo', title: 'En general quedas bajo', evidence: `Promedio ${r0(b)} cents en ${sung.length} notas.`, tip: 'Más aire y energía; piensa las notas más arriba. Calienta con notas largas con apoyo antes de cantar.' });
    if (b >= 15) G.push({ key: 'alto', title: 'En general quedas alto', evidence: `Promedio +${r0(b)} cents en ${sung.length} notas.`, tip: 'Estás empujando: canta más suave y suelta la mandíbula.' });
    const ms = sung.map((x) => x.m0).sort((p, q) => p - q);
    const hiCut = ms[Math.floor(ms.length * 0.75)];
    const hi = sung.filter((x) => x.m0 >= hiCut && x.m0 > ms[0]), rest = sung.filter((x) => x.m0 < hiCut);
    if (hi.length >= 4 && rest.length >= 4) {
      const ah = hi.filter((x) => x.st.ok >= 0.5).length / hi.length, ar = rest.filter((x) => x.st.ok >= 0.5).length / rest.length;
      if (ar - ah >= 0.25) G.push({ key: 'agudas', title: 'Las notas altas de la canción te cuestan', evidence: `Aciertas ${r0(ah * 100)}% en las más altas vs ${r0(ar * 100)}% en el resto.`, tip: 'Si siempre fallan las mismas, prueba la canción un tono más abajo. Si no, practica esas frases con sirenas livianas antes.' });
    }
  }
  const jumps = [];
  for (let j = 1; j < sung.length; j++) { const a = sung[j - 1], b = sung[j]; if (b.t0 - a.t1 < 0.25 && Math.abs(b.m0 - a.m0) >= 4) jumps.push(b); }
  if (jumps.length >= 4) { const okJ = jumps.filter((x) => x.st.ok >= 0.5).length / jumps.length; if (okJ < score - 0.2) G.push({ key: 'saltos', title: 'Los saltos de la melodía te sacan de la nota', evidence: `Después de un salto grande aciertas ${r0(okJ * 100)}% (vs ${r0(score * 100)}% en general).`, tip: 'Exagera los saltos y escucha la nota de llegada antes de cantarla.' }); }
  const scoop = done.filter((x) => x.fl.includes('sc')).length;
  if (done.length >= 10 && scoop / done.length >= 0.25) G.push({ key: 'scoop', title: 'Entras a las notas desde abajo', evidence: `En ${scoop} de ${done.length} notas.`, tip: 'Un profe diría: "no la busques, ya tienes que estar ahí". Imagina cada nota antes de cantarla.' });
  const ons = done.map((x) => x.on).filter((x) => x != null);
  if (ons.length >= 6) { const m = med(ons); if (m >= 0.1) G.push({ key: 'tarde', title: 'Vas atrasado con la música', evidence: `Entras en promedio ${r0(m * 1000)} ms tarde (${ons.length} entradas).`, tip: 'Respira antes de cada frase y entra con el pulso. Si usas audífonos Bluetooth, mide la latencia en Perfil.' }); if (m <= -0.1) G.push({ key: 'temprano', title: 'Te adelantas a la música', evidence: `Entras en promedio ${r0(-m * 1000)} ms antes.`, tip: 'Escucha la pista y espera: entra con ella.' }); }
  const shake = done.filter((x) => x.fl.includes('tiembla')).length;
  if (done.length >= 10 && shake / done.length >= 0.25) G.push({ key: 'tiembla', title: 'Tus notas largas tiemblan', evidence: `En ${shake} de ${done.length} notas.`, tip: 'Aire parejo como un hilo; no aprietes la garganta.' });
  // energía: ¿cantas con ganas o apagado? (comparado con tu voz hablada) y ¿te vas apagando?
  const prof = voiceProfile();
  const vf = done.flatMap((x) => x.frames.filter((f) => f.cents != null && f.rms && !f.pre).map((f) => ({ t: f.t, r: f.rms })));
  if (prof && prof.speakRms && vf.length >= 60) {
    const ratio = med(vf.map((f) => f.r)) / prof.speakRms;
    if (ratio < 0.7) G.push({ key: 'apagado', title: 'Cantas apagado', evidence: `Al cantar usas cerca del ${r0(ratio * 100)}% del volumen de tu voz hablada.`, tip: 'Un cantante canta con ganas: cántala como si se la dedicaras a alguien al fondo de la sala, con la garganta suelta. Practica la unidad "Cantar con ganas".', lesson: 'ene1' });
    const T0 = vf[0].t, T1 = vf[vf.length - 1].t, third = (T1 - T0) / 3;
    const a1 = vf.filter((f) => f.t < T0 + third).map((f) => f.r), a3 = vf.filter((f) => f.t > T1 - third).map((f) => f.r);
    if (T1 - T0 > 8 && a1.length > 20 && a3.length > 20 && med(a3) < med(a1) * 0.65) G.push({ key: 'se_apaga', title: 'Te vas apagando', evidence: `En el último tercio cantas con el ${r0((med(a3) / med(a1)) * 100)}% del volumen del comienzo.`, tip: 'Dosifica: no lo des todo al principio, y piensa que el final es lo más importante de la canción.' });
  }
  const goodL = rep.lines.filter((l) => l.n >= 2 && l.score >= 0.8);
  if (goodL.length) G.unshift({ key: 'bien', tone: 'ok', title: 'Lo que ya te sale bien', evidence: `${goodL.length} frase${goodL.length > 1 ? 's' : ''} con 80% o más de notas afinadas: ${goodL.slice(0, 3).map((l) => '"' + l.text.slice(0, 28) + (l.text.length > 28 ? '…' : '') + '"').join(', ')}.`, tip: 'Úsalas de referencia: así se siente cantar afinado.' });
  rep.global = G;

  // ---------- plan: las 3 frases que más rinden practicar ----------
  rep.plan = rep.lines.filter((l) => l.n >= 2 && l.score < 0.8).sort((a, b) => a.score - b.score || b.probs.length - a.probs.length).slice(0, 3);
  return rep;
}

// Observaciones para el profe adaptativo (alimenta los patrones de largo plazo)
export function songObs(rep, targets, sid) {
  const out = []; let prev = null;
  for (const x of targets) {
    if (!x.st || x.st.c == null) { prev = null; continue; }
    const contiguous = prev && x.t0 - prev.t1 < 0.3;
    out.push({ t: Date.now(), sid, k: 'song', m: x.m0, c: r0(x.st.c), prev: contiguous ? prev.m0 : undefined, pc: contiguous ? r0(prev.st.c) : undefined, on: x.on != null ? r0(x.on * 1000) : undefined, fl: x.fl || [] });
    prev = x;
  }
  return out;
}

// Convierte una frase de tu canción en un ejercicio (eco lento con "la" y luego con letra), en tu rango
export function phraseExercises(song, i, range, fix = null) {
  const a = song.analysis; const ln = a.lines[i];
  if (!ln) return [];
  const ns = a.notes.filter((n) => n.t0 >= ln.t0 - 0.15 && n.t0 < ln.t1);
  if (ns.length < 2) return [];
  const center = (Math.min(...ns.map((n) => n.m)) + Math.max(...ns.map((n) => n.m))) / 2;
  const shift = 12 * Math.round((range.comfort - center) / 12); // misma melodía, en tu octava
  const base = ns[0].m + shift;
  const beat = 0.5; // 1 tiempo = medio segundo de la canción (bpm 120 → luego más lento)
  const pattern = [];
  for (let k = 0; k < ns.length; k++) {
    const n = ns[k]; const nx = ns[k + 1];
    const dur = Math.max(0.25, (n.t1 - n.t0) / beat);
    pattern.push({ s: n.m + shift - base, d: +dur.toFixed(2), l: wordAt(ln, n.t0) || 'la' });
    if (nx) { const gap = (nx.t0 - n.t1) / beat; if (gap > 0.3) pattern.push({ s: null, d: +gap.toFixed(2) }); }
  }
  const syl = pattern.map((p) => (p.s == null ? p : { ...p, l: 'la' }));
  // ejercicio específico para el error detectado en esta frase
  const pre = [];
  const notesU = ns.map((n) => n.m + shift);
  const lastN = notesU[notesU.length - 1], topN = Math.max(...notesU);
  const lastW = wordAt(ln, ns[ns.length - 1].t0) || 'la';
  if (fix === 'fin_cae' || fix === 'fin_corta' || fix === 'fin_bajo') pre.push({ type: 'sustain', notes: [lastN], secs: 4, tol: 70, text: `<b>Corrige el final:</b> canta solo la última palabra, <b>"${lastW}"</b>, y sostenla 4 segundos sin que baje ni se corte. Así se siente un final apoyado.` });
  if (fix === 'nota_alta') pre.push({ type: 'seq', pattern: [{ s: notesU[0] - base, g: topN - base, d: 2 }, { s: topN - base, d: 2 }], base, mode: 'echo', bpm: 66, tol: 120, noTiming: true, labels: 'none', reps: [0, 0], text: '<b>Corrige la nota alta:</b> sube deslizando con voz liviana y quédate arriba. Siente dónde está antes de cantarla con la letra.' }, { type: 'match', notes: [topN], tol: 70, hold: 1.2, delay: 1, text: '<b>Ahora entra directo</b> a la nota alta, sin deslizar. Imagínala primero.' });
  if (fix === 'scoop' || fix === 'palabra') pre.push({ type: 'match', notes: [...new Set(notesU)].slice(0, 4), tol: 80, hold: 1, delay: 1, imagine: true, text: '<b>Corrige la entrada:</b> cada nota de esta frase por separado. Imagínala en silencio y entra justo en ella, sin buscarla desde abajo.' });
  if (fix === 'baja' || fix === 'alta') pre.push({ type: 'match', notes: [...new Set(notesU)].slice(0, 4), tol: 70, hold: 1.2, text: `<b>Corrige la afinación:</b> las notas de esta frase una por una, con el afinador. Tiendes a quedar ${fix === 'baja' ? 'bajo: piensa cada nota más arriba' : 'alto: canta más suave'}.` });
  if (fix === 'aire') pre.push({ type: 'breath', steps: [{ label: 'Inhala bajo', secs: 3 }, { label: 'Sisea "sss" parejo', secs: Math.min(14, Math.round((ln.t1 - ln.t0) + 3)), sound: true }, { label: 'Descansa', secs: 2 }], reps: 2, text: '<b>Corrige el aire:</b> esta frase dura lo que dura el siseo. Respira antes, bajo, y gasta el aire parejo.' });
  if (fix === 'entrada_tarde' || fix === 'entrada_temprano') pre.push({ type: 'seq', pattern: pattern.slice(0, Math.min(4, pattern.length)), base, mode: 'echo', bpm: 100, tol: 120, ttol: 150, reps: [0, 0, 0], text: '<b>Corrige la entrada:</b> solo el comienzo de la frase, entrando justo en el primer tiempo. Respira en el clic anterior.' });
  pre.forEach((e) => (e.fixed = true));
  return [...pre,
    { fixed: true, type: 'seq', pattern: syl, base, mode: 'echo', bpm: 84, tol: 100, ttol: 250, noTiming: true, reps: [0, 0], text: `<b>Frase ${i + 1}, lenta y con "la":</b> primero solo la melodía, sin la letra.<br><small>"${ln.text}"</small>` },
    { fixed: true, type: 'seq', pattern, base, mode: 'echo', bpm: 100, tol: 90, ttol: 220, reps: [0, 0], text: `<b>Ahora con la letra</b>, un poco más rápido. Fíjate cómo terminas la frase.` },
    { fixed: true, type: 'seq', pattern, base, mode: 'echo', bpm: 120, tol: 80, ttol: 200, feedback: 'after', text: '<b>A la velocidad real y sin ver tu voz</b>, como en la canción.' },
  ];
}
