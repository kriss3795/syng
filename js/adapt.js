// Profe adaptativo: guarda cada nota que cantas, busca patrones tuyos con datos suficientes,
// saca conclusiones (con la evidencia y lo que suele significar) y adapta la app: tono, dificultad,
// ejercicios de refuerzo y consejos en vivo. Nunca afirma un patrón sin muestra suficiente.
import { load, save, getRange, voiceProfile } from './store.js';

const MAX_OBS = 900;
// obs: { t, sid, pos, k: 'seq'|'match'|'sus', m: nota objetivo (midi), c: desvío con signo (cents),
//        prev?, pc? (nota anterior y su desvío), on? (entrada, ms), sd?, first? (cents al empezar), rms? }
export function observe(list) {
  if (!list || !list.length) return;
  const s = load();
  s.obs = [...(s.obs || []), ...list.filter((o) => o && o.c != null && isFinite(o.c) && Math.abs(o.c) < 150)].slice(-MAX_OBS);
  save();
}
export const obsCount = () => (load().obs || []).length;

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const tstat = (a) => (a.length > 2 ? mean(a) / (sdev(a) / Math.sqrt(a.length) || 1) : 0);
const acc = (os) => os.filter((o) => Math.abs(o.c) <= 35).length / Math.max(1, os.length);
const r0 = (x) => Math.round(x);

// ---------- Análisis: patrones con evidencia ----------
export function analyze() {
  const all = (load().obs || []);
  const obs = all.slice(-450);
  const R = getRange();
  const F = []; // hallazgos
  const A = { keyShift: 0, tolF: 1, bpmF: 1, remedial: [], warm: [], hints: {}, shortSession: false };
  const notes = obs.filter((o) => o.k !== 'sus');

  // 1) sesgo general: bajo / alto
  if (notes.length >= 30) {
    const cs = notes.map((o) => o.c); const m = mean(cs); const t = tstat(cs);
    if (m <= -12 && t <= -3) {
      F.push({ key: 'bajo', tone: 'warn', title: 'Tiendes a quedar bajo', evidence: `En ${notes.length} notas quedaste en promedio ${r0(m)} cents bajo la nota.`,
        meaning: 'Quedar bajo suele venir de poca energía de aire (falta de apoyo), de cantar muy bajito o con la voz cansada, o de "caerse" al bajar de nota. Rara vez es el oído.',
        action: 'Agregué al calentamiento una nota larga con apoyo, y mientras cantas te aviso en vivo si vas quedando bajo.' });
      A.warm.push('apoyo'); A.hints.bias = 'bajo';
    } else if (m >= 12 && t >= 3) {
      F.push({ key: 'alto', tone: 'warn', title: 'Tiendes a quedar alto', evidence: `En ${notes.length} notas quedaste en promedio +${r0(m)} cents sobre la nota.`,
        meaning: 'Quedar alto suele venir de empujar: tensión en la garganta o la mandíbula, cantar muy fuerte o con nervios.',
        action: 'Agregué lip trill (labios vibrando) al calentamiento para soltar, y te aviso en vivo si vas quedando alto.' });
      A.warm.push('soltar'); A.hints.bias = 'alto';
    } else if (Math.abs(m) < 8) {
      F.push({ key: 'centrado', tone: 'ok', title: 'No tienes sesgo fijo', evidence: `En ${notes.length} notas tu promedio es ${m > 0 ? '+' : ''}${r0(m)} cents: no tiendes ni a bajo ni a alto.`, meaning: 'Tus errores van para ambos lados: es precisión, no un vicio fijo. Se pule con repetición.', action: '' });
    }
  }

  // 2) por registro: agudos vs graves de tu rango
  const span = Math.max(4, R.high - R.low);
  // (las canciones se excluyen: se pueden cantar una octava abajo y su nota escrita no dice dónde cantaste)
  const reg = notes.filter((o) => o.k !== 'song');
  const hi = reg.filter((o) => (o.m - R.low) / span >= 0.66), lo = reg.filter((o) => (o.m - R.low) / span <= 0.33), mid = reg.filter((o) => { const r = (o.m - R.low) / span; return r > 0.33 && r < 0.66; });
  if (hi.length >= 15 && mid.length >= 10) {
    const mh = mean(hi.map((o) => o.c)), mm = mean(mid.map((o) => o.c));
    const ah = acc(hi), am = acc(mid);
    if (mh - mm <= -15 || am - ah >= 0.25) {
      F.push({ key: 'agudos', tone: 'warn', title: 'Tus agudos te cuestan', evidence: `En tus notas altas quedas ${r0(mh)} cents (vs ${r0(mm)} en el medio) y aciertas ${r0(ah * 100)}% (vs ${r0(am * 100)}%).`,
        meaning: 'En la parte alta llegas justo, sin energía o apretando. Es normal al empezar: el registro agudo se construye aligerando la voz, no empujando.',
        action: 'Bajé un semitono el tono de las melodías para que trabajes donde puedes afinar, y sumé sirenas livianas hacia los agudos.' });
      A.keyShift -= 1; A.remedial.push('agudos');
    }
  }
  if (lo.length >= 15 && mid.length >= 10) {
    const ml = mean(lo.map((o) => o.c)), mm = mean(mid.map((o) => o.c)), al = acc(lo), am = acc(mid);
    if (am - al >= 0.25 || Math.abs(ml - mm) >= 20) {
      F.push({ key: 'graves', tone: 'mid', title: 'Tus graves se pierden', evidence: `En tus notas bajas aciertas ${r0(al * 100)}% (vs ${r0(am * 100)}% en el medio), con un desvío medio de ${r0(ml)} cents.`,
        meaning: 'Las notas muy graves para ti salen con poca voz y el oído las controla peor.', action: 'Subí un semitono el tono de los ejercicios.' });
      A.keyShift += 1;
    }
  }

  // 3) saltos: ¿achicas los intervalos? (patrón típico de quien empieza: Pfordresher & Brown 2007)
  const jumps = notes.filter((o) => o.prev != null && o.pc != null && Math.abs(o.m - o.prev) >= 3);
  if (jumps.length >= 15) {
    const ratios = jumps.map((o) => ((o.m + o.c / 100) - (o.prev + o.pc / 100)) / (o.m - o.prev));
    const rmed = median(ratios);
    const gm = mean(notes.map((o) => o.c));
    const up = jumps.filter((o) => o.m > o.prev).map((o) => o.c), down = jumps.filter((o) => o.m < o.prev).map((o) => o.c);
    if (rmed < 0.88) {
      F.push({ key: 'saltos', tone: 'warn', title: 'Achicas los saltos', evidence: `En ${jumps.length} saltos de 3 o más semitonos, tus intervalos miden en promedio el ${r0(rmed * 100)}% de lo que deberían.`,
        meaning: 'Es el patrón más típico de quien está aprendiendo: la voz no "se atreve" a ir tan lejos. Al subir quedas bajo y al bajar quedas alto.',
        action: 'Antes de los saltos te aviso "exagera", y agregué ejercicios de intervalos al inicio de la clase.' });
      A.remedial.push('saltos'); A.hints.leaps = true;
    } else if (up.length >= 8 && mean(up) <= -20 && mean(up) - gm <= -12) {
      F.push({ key: 'subir', tone: 'mid', title: 'Al subir te quedas corto', evidence: `Después de subir de nota quedas en promedio ${r0(mean(up))} cents bajo (${up.length} casos).`, meaning: 'La voz llega cansada a la nota de arriba: piensa la nota alta antes y con más aire.', action: 'Te aviso "exagera" antes de los saltos hacia arriba.' });
      A.hints.leaps = true;
    } else if (down.length >= 8 && mean(down) <= -20 && mean(down) - gm <= -12) {
      F.push({ key: 'bajar', tone: 'mid', title: 'Al bajar te caes', evidence: `Después de bajar de nota quedas en promedio ${r0(mean(down))} cents bajo (${down.length} casos).`, meaning: 'Al bajar se suelta el apoyo y la nota se va al suelo. Piensa la nota de abajo "un poquito más arriba".', action: 'Agregué al calentamiento escalas descendentes.' });
      A.warm.push('bajar');
    }
  }

  // 4) entrar desde abajo (scoop)
  const firsts = obs.filter((o) => o.k === 'match' && o.first != null);
  if (firsts.length >= 10) {
    const below = firsts.filter((o) => o.first <= -80).length / firsts.length;
    if (below >= 0.6) {
      F.push({ key: 'scoop', tone: 'mid', title: 'Entras a las notas desde abajo', evidence: `En el ${r0(below * 100)}% de ${firsts.length} notas empezaste más de 80 cents abajo y subiste.`,
        meaning: 'Significa que aún no "oyes" la nota antes de cantarla: la buscas con la voz. Imaginarla por dentro antes de cantar (audiación) lo corrige.',
        action: 'Sumé ejercicios de "guárdala en la cabeza" y en las notas sueltas te pido imaginarla antes.' });
      A.remedial.push('memoria');
    }
  }

  // 5) entradas: tarde / temprano
  const ons = obs.filter((o) => o.on != null).map((o) => o.on);
  if (ons.length >= 15) {
    const m = median(ons);
    if (m >= 90) { F.push({ key: 'tarde', tone: 'mid', title: 'Entras tarde', evidence: `En ${ons.length} entradas llegas en promedio ${r0(m)} ms tarde.`, meaning: 'Suele ser respirar justo en el clic en vez de un tiempo antes, o audífonos Bluetooth (que atrasan el sonido).', action: 'Bajé un poco la velocidad de los ejercicios. Si usas Bluetooth, mide la latencia en Perfil.' }); A.bpmF *= 0.92; }
    if (m <= -90) { F.push({ key: 'temprano', tone: 'mid', title: 'Te adelantas', evidence: `En ${ons.length} entradas llegas en promedio ${r0(-m)} ms antes.`, meaning: 'Ansiedad por entrar: es común. Espera el clic.', action: 'Te recuerdo esperar el clic en los ejercicios con ritmo.' }); }
  }

  // 6) estabilidad en notas largas
  const sus = obs.filter((o) => o.k === 'sus' && o.sd != null);
  if (sus.length >= 4) {
    const m = mean(sus.map((o) => o.sd));
    if (m > 22) { F.push({ key: 'tiembla', tone: 'warn', title: 'Tus notas largas tiemblan', evidence: `En ${sus.length} notas largas la altura se movió en promedio ±${r0(m)} cents.`, meaning: 'Es el aire: sale a tirones. Con un hilo de aire parejo (apoyo) la nota se queda quieta.', action: 'Agregué el siseo "sss" al calentamiento.' }); A.warm.push('aire'); }
  }

  // 6b) manías y vicios por nota (las mide el profe en cada nota de las melodías)
  const fo = obs.filter((o) => o.k === 'seq' && Array.isArray(o.fl));
  const HAB = {
    sc: { min: 0.3, title: 'Manía: entras desde abajo', meaning: 'Buscas la nota con la voz en vez de oírla antes ("scoop"). Suena inseguro y desafinado al comienzo de cada nota.', action: 'En vivo te aviso cuando lo haces, y sumé "guárdala en la cabeza" para entrenar a imaginar la nota antes.', rem: 'memoria' },
    sl: { min: 0.3, title: 'Manía: entras desde arriba', meaning: 'Llegas pasado y bajas a la nota. Suele ser empujar al empezar.', action: 'En vivo te aviso para que apuntes directo.' },
    cae: { min: 0.3, title: 'Vicio: dejas caer el final de las notas', meaning: 'Sueltas el apoyo antes de terminar la nota y se desafina hacia abajo.', action: 'Sumé notas largas con apoyo al calentamiento y te aviso en vivo.', warm: 'apoyo' },
    corta: { min: 0.3, title: 'Vicio: cortas las notas', meaning: 'Dejas de cantar antes de tiempo: suele ser inseguridad o falta de aire.', action: 'Te aviso en vivo; mira la barra de cada nota hasta el final.' },
    aire: { min: 0.2, title: 'Te quedas sin aire en medio', meaning: 'Respiras tarde o gastas el aire al principio.', action: 'Sumé el siseo "sss" al calentamiento y te recuerdo respirar antes.', warm: 'aire' },
    tiembla: { min: 0.3, title: 'Tus notas tiemblan', meaning: 'El aire sale a tirones (falta apoyo) o hay tensión.', action: 'Sumé aire parejo al calentamiento.', warm: 'aire' },
  };
  if (fo.length >= 20) {
    for (const [k, h] of Object.entries(HAB)) {
      const n = fo.filter((o) => o.fl.includes(k)).length; const rate = n / fo.length;
      if (rate >= h.min && n >= 6) {
        F.push({ key: 'h_' + k, tone: 'warn', title: h.title, evidence: `Pasó en ${n} de ${fo.length} notas (${r0(rate * 100)}%).`, meaning: h.meaning, action: h.action });
        if (h.rem && !A.remedial.includes(h.rem)) A.remedial.push(h.rem);
        if (h.warm && !A.warm.includes(h.warm)) A.warm.push(h.warm);
      }
    }
  }

  // 6c) malas prácticas: sesiones demasiado largas sin pausa (salud vocal)
  const spans = {}; all.slice(-600).forEach((o) => { if (o.sid) { const x = spans[o.sid] || (spans[o.sid] = [o.t, o.t]); x[0] = Math.min(x[0], o.t); x[1] = Math.max(x[1], o.t); } });
  const longS = Object.values(spans).filter(([a, b]) => b - a > 45 * 60000).length;
  if (longS >= 2) F.push({ key: 'largo', tone: 'mid', title: 'Mala práctica: sesiones muy largas', evidence: `${longS} sesiones duraron más de 45 minutos seguidos.`, meaning: 'La voz se fatiga y empiezas a compensar con tensión. Mejor 15–30 minutos con pausas.', action: 'Te propongo pausas durante la sesión.' });

  // 7) cansancio: ¿empeoras a mitad de sesión?
  const bySid = {};
  obs.forEach((o) => { if (o.sid != null && o.pos != null) (bySid[o.sid] = bySid[o.sid] || []).push(o); });
  const drops = Object.values(bySid).filter((os) => os.length >= 16).map((os) => {
    const maxPos = Math.max(...os.map((o) => o.pos));
    if (maxPos < 4) return null;
    const early = os.filter((o) => o.pos <= maxPos / 2), late = os.filter((o) => o.pos > maxPos / 2);
    return early.length >= 6 && late.length >= 6 ? acc(early) - acc(late) : null;
  }).filter((x) => x != null);
  if (drops.length >= 3 && mean(drops) >= 0.15) {
    F.push({ key: 'cansancio', tone: 'mid', title: 'Te cansas a mitad de sesión', evidence: `En ${drops.length} sesiones, en la segunda mitad aciertas en promedio ${r0(mean(drops) * 100)} puntos menos.`,
      meaning: 'La voz se fatiga (o baja la concentración). Mejor sesiones cortas y seguidas que largas.', action: 'Te propongo pausas cuando noto la caída.' });
    A.shortSession = true;
  }

  // 8) timidez: volumen al cantar vs al hablar
  const prof = voiceProfile();
  const rmsO = obs.filter((o) => o.rms != null).map((o) => o.rms);
  if (prof && prof.speakRms && rmsO.length >= 15) {
    const ratio = median(rmsO) / prof.speakRms;
    if (ratio < 0.6) { F.push({ key: 'timido', tone: 'warn', title: 'Cantas con poca voz', evidence: `Al cantar usas cerca del ${r0(ratio * 100)}% del volumen de tu voz hablada.`, meaning: 'Con poca voz la nota tiembla y cuesta afinar. Es timidez y se va con práctica.', action: 'Sumé "voz con cuerpo" al inicio de la clase.' }); A.remedial.push('volumen'); }
  }

  // 9) progreso real
  if (all.length >= 120) {
    const a1 = acc(all.slice(0, 60).filter((o) => o.k !== 'sus')), a2 = acc(all.slice(-60).filter((o) => o.k !== 'sus'));
    const e1 = mean(all.slice(0, 60).map((o) => Math.abs(o.c))), e2 = mean(all.slice(-60).map((o) => Math.abs(o.c)));
    if (a2 - a1 >= 0.08 || e1 - e2 >= 6) F.unshift({ key: 'progreso', tone: 'ok', title: '¡Estás mejorando!', evidence: `Tus primeras notas quedaban a ${r0(e1)} cents en promedio; las últimas a ${r0(e2)}. Aciertos: ${r0(a1 * 100)}% → ${r0(a2 * 100)}%.`, meaning: 'Esto es tu oído y tu voz conectándose. La práctica está funcionando.', action: '' });
  }

  // dificultad global según precisión reciente
  const recent = notes.slice(-80);
  if (recent.length >= 40) {
    const a = acc(recent);
    if (a < 0.35) { A.tolF = 1.2; A.bpmF *= 0.92; F.push({ key: 'dificil', tone: 'mid', title: 'Las lecciones están difíciles para ti ahora', evidence: `En tus últimas ${recent.length} notas acertaste el ${r0(a * 100)}%.`, meaning: 'Practicar demasiado difícil frustra y no fija nada.', action: 'Ensanché la zona verde un 20% y bajé la velocidad mientras subes tu nivel.' }); }
    else if (a > 0.8) { A.tolF = 0.9; F.push({ key: 'facil', tone: 'ok', title: 'Estás para más exigencia', evidence: `En tus últimas ${recent.length} notas acertaste el ${r0(a * 100)}%.`, meaning: 'Ya dominas este nivel.', action: 'Achiqué un 10% la zona verde para que sigas afinando más fino.' }); }
  }
  A.keyShift = Math.max(-2, Math.min(2, A.keyShift));
  return { findings: F, adapt: A, n: all.length };
}

// ---------- Aplicar las adaptaciones a una sesión ----------
export function adaptExercises(exs, A, { remedial = false } = {}) {
  const R = getRange();
  const out = exs.map((ex) => {
    if (ex.noScore && ex.type !== 'seq') return ex;
    const e = { ...ex };
    if (e.tol && A.tolF !== 1) e.tol = Math.max(25, Math.min(180, Math.round(e.tol * A.tolF)));
    if (e.bpm && A.bpmF !== 1) e.bpm = Math.round(e.bpm * A.bpmF);
    if (A.keyShift && !e.drone && !e.atHome && !e.home && !e.fixed) {
      if (e.type === 'seq' && e.base != null) e.base = clampBase(e, e.base + A.keyShift, R);
      if ((e.type === 'match' || e.type === 'sustain' || e.type === 'dynamics') && e.notes && !e.wide) e.notes = e.notes.map((n) => Math.max(R.low, Math.min(R.high, n + A.keyShift)));
    }
    if (e.type === 'seq' && A.hints) e.liveHints = A.hints;
    if (e.type === 'match' && A.remedial.includes('memoria') && !e.delay) e.imagine = true;
    return e;
  });
  if (remedial) {
    const pre = remedialFor(A).slice(0, 1);
    return [...pre, ...out];
  }
  return out;
}
function clampBase(e, base, R) {
  const semis = (e.pattern || []).flatMap((n) => (n.s == null ? [] : n.g != null ? [n.s, n.g] : [n.s]));
  if (!semis.length) return base;
  const lo = Math.min(...semis), hi = Math.max(...semis) + Math.max(0, ...(e.reps || [0]));
  return Math.max(R.low - lo, Math.min(R.high - hi, base));
}
// Ejercicios de refuerzo según el patrón principal (al comienzo de la Clase de hoy)
export function remedialFor(A) {
  const R = getRange(); const c = R.comfort;
  const P = (semis, d = 1) => semis.map((s) => (Array.isArray(s) ? { s: s[0], d: s[1] } : { s, d }));
  const tag = { adaptive: true };
  const list = [];
  for (const k of A.remedial) {
    if (k === 'saltos') list.push({ ...tag, type: 'seq', pattern: P([[0, 2], [4, 2], [0, 2], [7, 2], [0, 2]]), base: Math.max(R.low, Math.min(R.high - 7, c - 3)), mode: 'echo', bpm: 70, tol: 110, noTiming: true, labels: 'la', reps: [0, 0], text: '<b>Refuerzo para ti:</b> saltos lentos. <b>Exagera</b> cada salto: la nota de llegada está más lejos de lo que crees.' });
    if (k === 'memoria') list.push({ ...tag, type: 'match', notes: [c, c + 2, c - 2].map((n) => Math.max(R.low, Math.min(R.high, n))), tol: 110, hold: 1, delay: 2, text: '<b>Refuerzo para ti:</b> escucha, <b>imagina la nota en silencio</b> y entra directo a ella, sin buscarla desde abajo.' });
    if (k === 'volumen') list.push({ ...tag, type: 'sustain', home: [0], secs: 4, tol: 130, loud: true, text: '<b>Refuerzo para ti:</b> una nota con <b>la fuerza de tu voz hablada</b>. Pasa la rayita.' });
    if (k === 'agudos') list.push({ ...tag, type: 'seq', pattern: [{ s: 0, g: 7, d: 2 }, { s: 7, g: 0, d: 2 }], base: Math.max(R.low, Math.min(R.high - 7, R.high - 9)), mode: 'along', bpm: 66, tol: 160, noTiming: true, labels: 'none', reps: [0, 0], text: '<b>Refuerzo para ti:</b> sirenas <b>livianas</b> hacia tus agudos, con "uu" o "brrr". Sin empujar.' });
  }
  return list;
}
export function warmExtras(A) {
  const R = getRange(); const c = R.comfort;
  const out = [];
  if (A.warm.includes('apoyo') || A.warm.includes('aire')) out.push({ type: 'breath', steps: [{ label: 'Inhala bajo', secs: 4 }, { label: 'Sisea "sss" parejo', secs: 10, sound: true }, { label: 'Descansa', secs: 2 }], reps: 1, noScore: true, text: 'Ajuste para ti: aire parejo (apoyo) antes de cantar.' });
  if (A.warm.includes('soltar')) out.push({ type: 'seq', pattern: [{ s: 0, g: 5, d: 2 }, { s: 5, g: 0, d: 2 }], base: c - 2, mode: 'along', bpm: 70, tol: 160, noTiming: true, labels: 'none', reps: [0, 0], noScore: true, text: 'Ajuste para ti: lip trill <b>"brrr"</b> para soltar la garganta.' });
  if (A.warm.includes('bajar')) out.push({ type: 'seq', pattern: [7, 5, 4, 2, 0].map((s, i) => ({ s, d: i === 4 ? 2 : 1 })), base: Math.max(R.low, c - 3), mode: 'echo', bpm: 80, tol: 120, noTiming: true, labels: 'solf', noScore: true, text: 'Ajuste para ti: escala bajando, pensando cada nota "un poquito más arriba".' });
  return out;
}

// ---------- Adaptación EN VIVO dentro de la sesión ----------
// Recibe los puntajes de la sesión hasta ahora y el próximo ejercicio; devuelve el ejercicio ajustado y un aviso.
export function liveAdjust(ex, scores, startedAt) {
  if (!ex || ex.type === 'info' || ex.noScore) return { ex, note: null };
  const last = scores.slice(-2);
  const e = { ...ex };
  let note = null;
  if (last.length === 2 && last.every((s) => s < 0.5)) {
    if (e.tol) e.tol = Math.min(180, Math.round(e.tol * 1.25));
    if (e.bpm) e.bpm = Math.round(e.bpm * 0.9);
    if (e.type === 'seq' && e.reps) e.reps = e.reps.map(() => e.reps[0]);
    note = 'Los dos últimos costaron: este lo hice un poco más fácil (zona más ancha, más lento, sin cambios de tono).';
  } else if (last.length === 2 && last.every((s) => s >= 0.92)) {
    if (e.tol) e.tol = Math.max(25, Math.round(e.tol * 0.85));
    note = '¡Vas muy bien! Este lo hice un poco más exigente (zona verde más chica).';
  }
  const s3 = scores.slice(-3);
  const minutes = (Date.now() - startedAt) / 60000;
  if (s3.length === 3 && s3[0] > s3[1] + 0.1 && s3[1] > s3[2] + 0.1 && minutes > 6) note = (note ? note + ' ' : '') + 'Noto que vas bajando: puede ser cansancio. Toma agua y respira un minuto antes de seguir.';
  return { ex: e, note };
}

// Comparar con el análisis anterior para contar lo NUEVO que descubrí
export function newFindings(before, after) {
  const prev = new Set((before || []).map((f) => f.key));
  return after.filter((f) => !prev.has(f.key) && f.key !== 'centrado');
}
