// Currículum progresivo. Basado en:
// - Pfordresher & Brown (2007), Hutchins & Peretz (2012): "cantar mal" casi nunca es sordera tonal;
//   es una mala conexión entre lo que oyes y lo que hace tu laringe. Se entrena.
// - Berglin, Pfordresher & Demorest (2022), Welch/Howard (SINGAD), Wilson (2007): la retroalimentación visual
//   en tiempo real mejora la afinación, sobre todo en melodías.
// - Pfordresher & Greenspon (2024): entrenar en un rango amplio ayuda más que en uno estrecho.
// - Titze (2006), estudios de pajita y lip trill: ejercicios de tracto vocal semiocluido (SOVT) = voz más eficiente.
// - Aprendizaje motor (Maas 2008, Maxfield, Nix/NATS): práctica distribuida, variada y retroalimentación que se va retirando.
// - Métodos de profesores: Seth Riggs (SLS: lip trills, sirenas, voz "a nivel del habla"), CVT de Cathrine Sadolin
//   (apoyo, no empujar la mandíbula), Estill (control de partes por separado), Cheryl Porter (respiración y relajación de mandíbula).
import { getRange } from './store.js';

const P = (semis, d = 1) => semis.map((s) => (Array.isArray(s) ? { s: s[0], d: s[1] } : { s, d }));
const glide = (a, b, d = 2) => ({ s: a, g: b, d });

// Ubica un patrón dentro del rango cómodo del alumno (centrado en su zona central)
function fit(semis, maxRep = 0, wide = false) {
  const r = getRange();
  const lo = Math.min(...semis), hi = Math.max(...semis) + maxRep;
  let base = Math.round(r.comfort - (lo + hi) / 2);
  if (wide) base = Math.round((r.low + r.high) / 2 - (lo + hi) / 2);
  base = Math.max(r.low - lo, Math.min(r.high - hi, base));
  return base;
}
const semisOf = (pat) => pat.flatMap((n) => (n.s == null ? [] : n.g != null ? [n.s, n.g] : [n.s]));

function seq(pattern, o = {}) {
  const reps = o.reps || [0];
  return { type: 'seq', pattern, reps, base: fit(semisOf(pattern), Math.max(...reps), o.wide), ...o, reps };
}
function match(semis, o = {}) {
  const r = getRange();
  let notes;
  if (o.wide) {
    // notas repartidas en todo el rango cómodo
    const n = o.count || 6;
    notes = Array.from({ length: n }, () => r.low + 1 + Math.floor(Math.random() * Math.max(1, r.high - r.low - 1)));
  } else {
    const base = fit(semis);
    notes = semis.map((s) => base + s);
  }
  return { type: 'match', notes, ...o };
}
function drone(intervals, o = {}) {
  const r = getRange();
  const root = Math.max(r.low, Math.round(r.comfort - 5));
  return { type: 'match', drone: root, notes: intervals.map((i) => root + i), ...o };
}
const ear = (kind, o = {}) => ({ type: 'ear', kind, base: getRange().comfort, ...o });
const info = (title, body) => ({ type: 'info', title, body });
const rhythm = (pattern, o = {}) => ({ type: 'rhythm', pattern, base: getRange().comfort, ...o });

function randomMelody(len = 4) {
  const pool = [0, 2, 4, 5, 7];
  const out = [pool[Math.floor(Math.random() * 3)]];
  while (out.length < len) {
    const prev = pool.indexOf(out[out.length - 1]);
    const step = [-1, 1, 1, -1, 2, -2][Math.floor(Math.random() * 6)];
    out.push(pool[Math.max(0, Math.min(pool.length - 1, prev + step))]);
  }
  return out;
}

// Melodías de dominio público
const ESTRELLITA = P([0, 0, 7, 7, 9, 9, [7, 2], 5, 5, 4, 4, 2, 2, [0, 2]]);
const ODA = P([4, 4, 5, 7, 7, 5, 4, 2, 0, 0, 2, 4, [4, 1.5], [2, 0.5], [2, 2]]);
const MARTINILLO = P([0, 2, 4, 0, 0, 2, 4, 0, 4, 5, [7, 2], 4, 5, [7, 2]]);

// Tolerancias: ancho total de la zona verde en cents (±mitad). La exigencia sube por etapas.
export const UNITS = [
  {
    id: 'u1', title: 'Empezamos', desc: 'Conoce tu voz y mide tu punto de partida',
    lessons: [
      { id: 'u1l1', title: 'Bienvenida y tu rango', build: () => [
        info('Cómo vas a aprender', `<p>La investigación es clara: <b>casi nadie es realmente "sordo"</b> para la música (solo ~1,5% de las personas tiene amusia). Lo que le pasa a la mayoría de quienes "cantan mal" es que su cerebro todavía no conecta bien <i>lo que oye</i> con <i>lo que hace la garganta</i>. Eso se entrena, como un deporte.</p>
<p>Lo que más ayuda según los estudios: <b>ver tu afinación en tiempo real</b> mientras cantas. Eso es lo que hace esta app.</p>
<ul><li>🎧 Usa <b>audífonos</b> cuando haya música, así el micrófono escucha solo tu voz.</li>
<li>⏱️ Mejor <b>15–30 minutos todos los días</b> que 2 horas un día. La práctica repartida se aprende mejor.</li>
<li>🤫 Lugar silencioso, celular a ~30 cm de la boca.</li>
<li>💧 Agua a temperatura ambiente. Si duele o raspa, para.</li></ul>`),
        { type: 'range' },
      ] },
      { id: 'u1l2', title: 'Tu primera nota', build: () => [
        info('Igualar una nota', `<p>Vas a escuchar una nota y cantarla. La aguja te muestra si estás <b>arriba</b> o <b>abajo</b> y por cuánto, en <b>cents</b> (100 cents = 1 semitono, la distancia entre dos teclas vecinas del piano).</p><p>Truco: primero <b>tararea</b> "mmm" y desliza tu voz despacio hasta que la aguja quede al centro.</p>`),
        match([0, 0, 2], { tol: 100, hold: 1 }),
        ear('updown', { rounds: 6, ivs: [3, 4, 5, 7] }),
      ] },
    ],
  },
  {
    id: 'u2', title: 'Respira y suelta', desc: 'Postura, apoyo y aire parejo',
    lessons: [
      { id: 'u2l1', title: 'Postura y respiración', build: () => [
        info('El apoyo (appoggio)', `<p>Cantar es dosificar aire, no empujarlo. Los profesores de tradición bel canto lo llaman <b>appoggio</b> ("apoyarse"): al inhalar se expanden las costillas bajas, la espalda y el abdomen; al cantar intentas <b>mantener esa expansión</b> el mayor tiempo posible en vez de desinflarte de golpe.</p>
<ul><li>Pies al ancho de hombros, rodillas sueltas, cuello largo.</li><li>Los hombros <b>no suben</b> al inhalar.</li><li>Mandíbula suelta (Cheryl Porter insiste mucho en esto).</li></ul>`),
        { type: 'breath', steps: [{ label: 'Inhala por la nariz', secs: 4 }, { label: 'Sisea "sss" parejo', secs: 6, sound: true }, { label: 'Descansa', secs: 2 }], reps: 3 },
      ] },
      { id: 'u2l2', title: 'Siseo largo', build: () => [
        { type: 'breath', text: 'Ahora el siseo es más largo. No sueltes mucho aire al principio: la barra debe quedar pareja hasta el final.', steps: [{ label: 'Inhala (4)', secs: 4 }, { label: 'Sisea "sss"', secs: 10, sound: true }, { label: 'Descansa', secs: 3 }], reps: 3 },
        { type: 'breath', text: 'Lo mismo con "zzz" (con voz). Debes sentir cosquillas en los labios y dientes.', steps: [{ label: 'Inhala (4)', secs: 4 }, { label: 'Zumba "zzz"', secs: 8, sound: true }, { label: 'Descansa', secs: 3 }], reps: 2 },
      ] },
      { id: 'u2l3', title: 'Cuida tu voz', build: () => [
        info('Higiene vocal', `<ul><li>Bebe agua durante el día (la que tomas justo antes de cantar tarda en llegar).</li><li>Calienta siempre antes de cantar (lo harás en cada lección).</li><li>Principiantes: <b>30–45 minutos máximo</b> por sesión, con pausas.</li><li>Si la voz se pone ronca, cansada o duele: para y descansa. Nunca fuerces una nota.</li><li>No grites ni cantes enfermo.</li></ul>`),
        seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 200, noTiming: true, reps: [0, 2], text: 'Sirena suave con "mmm" (boca cerrada): sube y baja siguiendo la línea. No importa la precisión, importa que se sienta fácil.' }),
      ] },
    ],
  },
  {
    id: 'u3', title: 'Encuentra tu nota', desc: 'Igualar notas: la base de cantar afinado',
    lessons: [
      { id: 'u3l1', title: 'Notas en tu zona', build: () => [
        match([0, 2, -1, 3, 0, 4], { tol: 100, hold: 1 }),
      ] },
      { id: 'u3l2', title: '¿Sube o baja?', build: () => [
        info('Escuchar antes de cantar', '<p>Para afinar, primero hay que <b>notar la dirección</b>: ¿la nota sube o baja? Luego la cantas. Escuchar y cantar se entrenan juntos.</p>'),
        ear('updown', { rounds: 8, ivs: [1, 2, 3, 4] }),
        match([0, 4, 2, 5], { tol: 100, hold: 1 }),
      ] },
      { id: 'u3l3', title: 'Deslizar hasta la nota', build: () => [
        seq([glide(-4, 0, 2), { s: 0, d: 2 }], { mode: 'echo', bpm: 70, tol: 100, noTiming: true, reps: [0, 2, 4], labels: 'none', text: 'Escucha: la voz se desliza y luego <b>se queda</b> en la nota. Imítalo. Deslizarse te ayuda a "encontrar" la nota con el oído.' }),
        match([0, 3, 5, 1], { tol: 80, hold: 1.2 }),
      ] },
      { id: 'u3l4', title: 'Mantener la nota', build: () => [
        seq(P([[0, 4]]), { mode: 'echo', bpm: 60, tol: 100, reps: [0, 2, 4], labels: 'aaa', text: 'Escucha la nota larga y luego sostenla tú 4 tiempos con "aaa", sin que se caiga al final.' }),
        match([0, 2, 4, 5, 7], { tol: 80, hold: 1.5 }),
      ] },
    ],
  },
  {
    id: 'u4', title: 'Calentamiento SOVT', desc: 'Labios, pajita y "mmm": la voz eficiente',
    lessons: [
      { id: 'u4l1', title: 'Lip trill', build: () => [
        info('Tracto vocal semiocluido (SOVT)', `<p>Los ejercicios con la boca <b>semicerrada</b> (vibrar los labios "brrr", cantar por una pajita, tararear "mmm" o "ng") son los más respaldados por la ciencia de la voz (Titze). Equilibran la presión del aire y hacen que la voz suene más con menos esfuerzo.</p><p>Seth Riggs los usaba con Michael Jackson y Stevie Wonder. Un estudio de 2025 encontró que la pajita y el lip trill ayudan igual.</p><p><b>Lip trill:</b> labios sueltos, sopla como imitando un motor "brrr" y ponle voz. Si no te sale, presiona suavemente las mejillas con los dedos.</p>`),
        seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 1, 2, 3], labels: 'none', text: 'Haz el lip trill "brrr" con voz siguiendo la sirena.' }),
      ] },
      { id: 'u4l2', title: 'Pajita en 1-3-5', build: () => [
        seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'along', bpm: 80, tol: 100, reps: [0, 1, 2], labels: 'uu', text: 'Con una pajita entre los labios (o "uuu" con labios muy juntos), canta junto a la guía: Do-Mi-Sol-Mi-Do.' }),
      ] },
      { id: 'u4l3', title: 'Tarareo de 5 notas', build: () => [
        seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 85, tol: 100, reps: [0, 1, 2], labels: 'mm', text: 'Escucha y repite la escala de 5 notas con "mmm". Siente la vibración en labios y nariz.' }),
      ] },
    ],
  },
  {
    id: 'u5', title: 'Escalas cortas', desc: 'Moverse nota a nota sin perder la afinación',
    lessons: [
      { id: 'u5l1', title: 'Do-Re-Mi', build: () => [
        seq(P([0, 2, 4, 2, [0, 2]]), { mode: 'echo', bpm: 80, tol: 100, ttol: 250, reps: [0, 1, 2] }),
      ] },
      { id: 'u5l2', title: 'Escala de 5', build: () => [
        seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2] }),
      ] },
      { id: 'u5l3', title: 'Bajando', build: () => [
        seq(P([7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 85, tol: 80, ttol: 220, reps: [0, 1, 2], text: 'Al bajar, la tendencia es "caerse" (desafinar hacia abajo). Piensa cada nota un poquito más alta.' }),
        match([7, 5, 4, 2, 0], { tol: 70, hold: 1 }),
      ] },
      { id: 'u5l4', title: 'Escala completa', build: () => [
        seq(P([0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 90, tol: 80, ttol: 200, reps: [0, 1] }),
      ] },
    ],
  },
  {
    id: 'u6', title: 'Pulso y ritmo', desc: 'Entrar a tiempo y durar lo justo',
    lessons: [
      { id: 'u6l1', title: 'Sentir el pulso', build: () => [
        info('El tiempo importa tanto como la nota', '<p>Una nota afinada que entra tarde suena mal igual. Vas a tocar (o cantar) <b>justo encima del clic</b>. Consejo de los profes: cuenta mentalmente "1-y-2-y" (subdividir) y mueve el cuerpo.</p>'),
        rhythm([1, 1, 1, 1], { bpm: 80, reps: 2 }),
        rhythm([1, 1, 2], { bpm: 80, reps: 2 }),
      ] },
      { id: 'u6l2', title: 'Corcheas y silencios', build: () => [
        rhythm([0.5, 0.5, 1, 0.5, 0.5, 1], { bpm: 80, reps: 2 }),
        rhythm([1, -1, 1, 1], { bpm: 85, reps: 2, text: 'El número negativo es un <b>silencio</b>: no toques ahí, pero sigue contando.' }),
      ] },
      { id: 'u6l3', title: 'Cantar a tiempo', build: () => [
        seq(P([0, 0, 0, 0, 4, 4, [4, 2]]), { mode: 'echo', bpm: 90, tol: 100, ttol: 150, reps: [0, 2], labels: 'ta', text: 'Ahora cantando "ta": cada nota debe empezar justo con el clic. Se mide cuándo entras.' }),
        seq([{ s: 0, d: 0.5 }, { s: 0, d: 0.5 }, { s: 2, d: 1 }, { s: null, d: 1 }, { s: 4, d: 0.5 }, { s: 4, d: 0.5 }, { s: 2, d: 1 }], { mode: 'echo', bpm: 85, tol: 100, ttol: 140, reps: [0, 1], labels: 'ta' }),
      ] },
    ],
  },
  {
    id: 'u7', title: 'Afinación fina I', desc: 'No solo la nota: el centro de la nota',
    lessons: [
      { id: 'u7l1', title: 'Qué son los cents', build: () => [
        info('Estar "en la nota" vs. estar afinado', `<p>Puedes estar en la nota correcta pero <b>un poquito bajo o alto</b>: eso suena "casi bien" y se nota. Un semitono son 100 cents. Un oído entrenado nota diferencias de 10–20 cents.</p><p>Desde ahora la zona verde se achica. La meta final de la app: <b>±10 cents</b>, nivel de cantante afinado.</p>`),
        match([0, 2, 4, 5], { tol: 50, hold: 1.5, text: 'Zona verde: ±25 cents. Mira la aguja y corrige con pequeños ajustes, no saltos.' }),
        ear('detune', { rounds: 8, cents: [60, 45, 35] }),
      ] },
      { id: 'u7l2', title: 'Notas largas estables', build: () => [
        seq(P([[0, 4], [2, 4], [4, 4]]), { mode: 'echo', bpm: 70, tol: 50, reps: [0], labels: 'aaa', text: 'Notas largas: mantén la línea recta y centrada. Al final de la nota no la dejes caer.' }),
        match([0, 4, 7], { tol: 50, hold: 2.5 }),
      ] },
      { id: 'u7l3', title: 'Cantar sobre un bordón', build: () => [
        info('El bordón (drone)', '<p>Suena una nota grave continua. Cantar sobre ella es como afinan los coros: cuando estás perfectamente afinado, el sonido se "funde" y deja de vibrar raro (desaparecen los batimientos). Escucha eso, no solo la aguja.</p>'),
        drone([0, 12, 7, 0], { tol: 50, hold: 2 }),
      ] },
      { id: 'u7l4', title: 'Oído fino', build: () => [
        ear('detune', { rounds: 10, cents: [40, 30, 20] }),
        match([0, 3, 5, 7, 2], { tol: 40, hold: 1.5 }),
      ] },
    ],
  },
  {
    id: 'u8', title: 'Intervalos', desc: 'Saltos: terceras, quintas y octavas',
    lessons: [
      { id: 'u8l1', title: 'Terceras', build: () => [
        seq(P([0, 4, 0, 4, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 2] }),
        ear('interval', { rounds: 6, ivs: [3, 4] }),
      ] },
      { id: 'u8l2', title: 'Quintas y arpegio', build: () => [
        seq(P([0, 7, 0, 7, [0, 2]]), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, reps: [0, 2] }),
        seq(P([0, 4, 7, 4, [0, 2]]), { mode: 'echo', bpm: 85, tol: 70, ttol: 200, reps: [0, 1, 2] }),
      ] },
      { id: 'u8l3', title: 'La octava', build: () => [
        seq(P([[0, 2], [12, 2], [7, 1], [4, 1], [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1] }),
        ear('interval', { rounds: 8, ivs: [4, 7, 12] }),
      ] },
      { id: 'u8l4', title: 'Saltos mezclados', build: () => [
        seq(P([0, 4, 2, 5, 4, 7, 5, 9, [7, 2]]), { mode: 'echo', bpm: 85, tol: 60, ttol: 180, reps: [0, 1] }),
        ear('interval', { rounds: 8, ivs: [3, 4, 5, 7, 12] }),
      ] },
    ],
  },
  {
    id: 'u9', title: 'Registros y rango', desc: 'Pecho, cabeza y el paso entre ellos',
    lessons: [
      { id: 'u9l1', title: 'Sirenas amplias', build: () => [
        info('El "quiebre"', '<p>Al subir, la voz cambia de registro (pecho → cabeza) y a veces se "quiebra". El método de Seth Riggs y el de Estill trabajan esa zona con <b>sirenas suaves</b> y lip trills: sin empujar, dejando que la voz se aligere al subir. Mantén la laringe tranquila, como al hablar.</p><p>Además, entrenar en un <b>rango amplio</b> mejora más tu afinación general que practicar siempre las mismas notas (Pfordresher & Greenspon).</p>'),
        seq([glide(0, 12, 3), glide(12, 0, 3)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 1, 2], labels: 'none', wide: true, text: 'Sirena de una octava con lip trill o "ng" (como al final de "tengo"). Suave.' }),
      ] },
      { id: 'u9l2', title: '1-5-8-5-1', build: () => [
        seq(P([0, 7, 12, 7, [0, 2]]), { mode: 'echo', bpm: 80, tol: 80, ttol: 220, reps: [0, 1, 2], labels: 'gu', wide: true, text: 'Arpegio de octava con "gu" o "nei". Al llegar arriba, no aprietes: piensa "más liviano".' }),
      ] },
      { id: 'u9l3', title: 'Todo tu rango', build: () => [
        match([], { wide: true, count: 8, tol: 60, hold: 1.2, text: 'Notas al azar por todo tu rango. Esto entrena el mapa completo de tu voz.' }),
      ] },
    ],
  },
  {
    id: 'u10', title: 'Melodías', desc: 'De ejercicios a música',
    lessons: [
      { id: 'u10l1', title: 'Memoria melódica', build: () => [
        info('Melodías cortas', '<p>Los estudios (protocolo SSAP) muestran que el entrenamiento con <b>melodías de 4 notas</b> es donde más mejora la afinación con retroalimentación visual. Cada vez que hagas esta lección, las melodías serán nuevas.</p>'),
        seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, labels: 'la' }),
        seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 70, ttol: 200, labels: 'la' }),
        seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 70, ttol: 200, labels: 'la' }),
      ] },
      { id: 'u10l2', title: 'Estrellita', build: () => [
        seq(ESTRELLITA, { mode: 'along', bpm: 90, tol: 70, ttol: 180, labels: 'la', text: 'Canta "Estrellita" con "la", junto a la guía.' }),
        seq(ESTRELLITA, { mode: 'echo', bpm: 90, tol: 70, ttol: 180, labels: 'la' }),
      ] },
      { id: 'u10l3', title: 'Martinillo', build: () => [
        seq(MARTINILLO, { mode: 'echo', bpm: 95, tol: 60, ttol: 170, labels: 'la' }),
      ] },
      { id: 'u10l4', title: 'Oda a la alegría', build: () => [
        seq(ODA, { mode: 'echo', bpm: 95, tol: 60, ttol: 170, labels: 'la' }),
      ] },
    ],
  },
  {
    id: 'u11', title: 'Afinación fina II', desc: 'Afinar sin ayuda y con precisión',
    lessons: [
      { id: 'u11l1', title: 'Terceras y quintas sobre bordón', build: () => [
        drone([4, 7, 12, 4], { tol: 30, hold: 2 }),
      ] },
      { id: 'u11l2', title: 'Oído de 10–20 cents', build: () => [
        ear('detune', { rounds: 10, cents: [25, 15, 10] }),
      ] },
      { id: 'u11l3', title: 'Sin red', build: () => [
        info('Retirar la ayuda', '<p>Según la teoría del aprendizaje motor, si siempre miras la aguja tu oído se vuelve dependiente. Ahora cantarás <b>sin ver tu voz</b> y verás el resultado al final. Es más difícil, y por eso enseña más.</p>'),
        seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'echo', bpm: 90, tol: 50, ttol: 160, reps: [0, 2], feedback: 'after' }),
        seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 50, ttol: 160, labels: 'la', feedback: 'after' }),
      ] },
      { id: 'u11l4', title: 'Notas clavadas', build: () => [
        match([0, 4, 7, 12, 7, 2], { tol: 30, hold: 2 }),
      ] },
    ],
  },
  {
    id: 'u12', title: 'Agilidad', desc: 'Velocidad y control',
    lessons: [
      { id: 'u12l1', title: 'Escala de 9', build: () => [
        seq([...P([0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 90, tol: 70, ttol: 140, reps: [0, 1] }),
      ] },
      { id: 'u12l2', title: 'Arpegio rápido', build: () => [
        seq([...P([0, 4, 7, 12, 7, 4], 0.5), { s: 0, d: 2 }], { mode: 'echo', bpm: 100, tol: 70, ttol: 130, reps: [0, 1, 2] }),
      ] },
      { id: 'u12l3', title: 'Menor', build: () => [
        seq(P([0, 2, 3, 5, 7, 5, 3, 2, [0, 2]]), { mode: 'echo', bpm: 95, tol: 50, ttol: 140, reps: [0, 1] }),
      ] },
    ],
  },
  {
    id: 'u13', title: 'Maestría', desc: 'El examen: afinado, a tiempo y sin ayuda',
    lessons: [
      { id: 'u13l1', title: 'Precisión ±10 cents', build: () => [
        match([0, 2, 4, 7, 9, 12], { tol: 20, hold: 2, text: 'Nivel maestro: zona verde de ±10 cents durante 2 s.' }),
        drone([7, 4, 12], { tol: 20, hold: 2 }),
      ] },
      { id: 'u13l2', title: 'Timing ±70 ms', build: () => [
        rhythm([0.5, 0.5, 1, -0.5, 0.5, 1], { bpm: 100, reps: 3, ttol: 70 }),
        seq([{ s: 0, d: 0.5 }, { s: 2, d: 0.5 }, { s: 4, d: 1 }, { s: null, d: 0.5 }, { s: 4, d: 0.5 }, { s: 7, d: 1 }, { s: 5, d: 1 }, { s: 4, d: 1 }], { mode: 'echo', bpm: 95, tol: 40, ttol: 90, reps: [0, 2] }),
      ] },
      { id: 'u13l3', title: 'Examen final', build: () => [
        seq(ODA, { mode: 'echo', bpm: 100, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }),
        seq(P(randomMelody(6)), { mode: 'echo', bpm: 95, tol: 30, ttol: 100, labels: 'la', feedback: 'after' }),
        ear('detune', { rounds: 8, cents: [10] }),
      ] },
    ],
  },
];

export const ALL_LESSONS = UNITS.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })));

// Calentamiento diario (≈8 min): cuerpo/aire → SOVT → sirenas → escalas → arpegio
export function warmup() {
  return [
    { type: 'breath', text: 'Calentamiento. Primero el aire.', steps: [{ label: 'Inhala', secs: 4 }, { label: 'Sisea "sss"', secs: 8, sound: true }, { label: 'Descansa', secs: 2 }], reps: 2 },
    seq([glide(0, 7, 2), glide(7, 0, 2)], { mode: 'along', bpm: 70, tol: 150, noTiming: true, reps: [0, 2, 4], labels: 'none', text: 'Lip trill "brrr" o "mmm" siguiendo la sirena.' }),
    seq(P([0, 2, 4, 5, 7, 5, 4, 2, [0, 2]]), { mode: 'along', bpm: 90, tol: 80, reps: [0, 1, 2, 3], labels: 'mm' }),
    seq(P([0, 4, 7, 12, 7, 4, [0, 2]]), { mode: 'along', bpm: 85, tol: 80, reps: [0, 1], labels: 'a', wide: true }),
  ];
}
// Repaso extra (para practicar fuera de las lecciones), escoge según la debilidad
export function extraSession(kind) {
  if (kind === 'oido') return [ear('updown', { rounds: 5 }), ear('interval', { rounds: 6, ivs: [3, 4, 5, 7, 12] }), ear('detune', { rounds: 8, cents: [40, 25, 15] })];
  if (kind === 'ritmo') return [rhythm([1, 0.5, 0.5, 1, 1], { bpm: 85, reps: 2 }), rhythm([0.5, 0.5, -0.5, 0.5, 1, 1], { bpm: 90, reps: 2 }), seq([{ s: 0, d: 0.5 }, { s: 0, d: 0.5 }, { s: 2, d: 1 }, { s: null, d: 1 }, { s: 4, d: 1 }, { s: 2, d: 1 }], { mode: 'echo', bpm: 90, tol: 80, ttol: 120, labels: 'ta' })];
  if (kind === 'fina') return [match([0, 4, 7, 2], { tol: 30, hold: 2 }), drone([0, 7, 4, 12], { tol: 30, hold: 2 }), ear('detune', { rounds: 8, cents: [25, 15, 10] })];
  if (kind === 'melodia') return [seq(P(randomMelody(4)), { mode: 'echo', bpm: 80, tol: 60, labels: 'la' }), seq(P(randomMelody(5)), { mode: 'echo', bpm: 85, tol: 60, labels: 'la' }), seq(P(randomMelody(6)), { mode: 'echo', bpm: 85, tol: 60, labels: 'la', feedback: 'after' })];
  return [match([], { wide: true, count: 8, tol: 50, hold: 1.2 })];
}
