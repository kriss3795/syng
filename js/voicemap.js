// Mapa de tu voz: una evaluación completa de TU voz, como la harían un profe de canto y un laboratorio de voz.
// Junta pruebas que se usan en la clínica y la pedagogía vocal, adaptadas a un celular:
//  · voz hablada (altura habitual y cuánto varía tu entonación)
//  · tesitura (zona dulce), tipo de voz probable, color y textura (barrido de notas)
//  · pasaje / cambio de registro (sirena lenta: saltos, cortes y cambio de color)
//  · rango dinámico: lo más suave y lo más fuerte en varias notas (versión simple del fonetograma / Voice Range Profile)
//  · aire: tiempo máximo de fonación y relación s/z (adultos: 0,99–1,40)
//  · claridad de la voz: prominencia del pico cepstral (CPP; más alta = voz más periódica, menos soplada)
//  · ataque: duro (golpe de glotis), equilibrado o aspirado (Miller: la meta es el ataque equilibrado)
//  · afinación: lo que el profe adaptativo aprendió de tus notas
// Todo con el micrófono del celular: las cifras sirven para compararte contigo mismo en el tiempo, no son un examen clínico.
import { h, icon, sleep, levelMeter, Roll } from './ui.js';
import { getCtx, startMic, readPitch, resetSmoother, playNote, readRaw } from './audio.js';
import { noteName } from './pitch.js';
import { getRange, voiceProfile, homeNote, load, save, identities } from './store.js';
import { say } from './coach.js';
import { sfx, confetti, stopSpeaking } from './voice.js';
import { startButton, ensureMic, raf, runSpeak, runIdentity } from './exercises.js';
import { analyze } from './adapt.js';

const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const r0 = Math.round;
const dbOf = (rms) => 20 * Math.log10(Math.max(1e-5, rms));

// ---------- FFT y cepstro (CPP) ----------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
export function cpp(x, sr) {
  const n = 4096; const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const lre = new Float64Array(n), lim = new Float64Array(n);
  for (let i = 0; i < n; i++) lre[i] = 10 * Math.log10(re[i] * re[i] + im[i] * im[i] + 1e-12);
  fft(lre, lim);
  const q0 = Math.floor(sr / 1000), q1 = Math.min(n / 2 - 1, Math.ceil(sr / 60));
  const c = []; for (let q = q0; q <= q1; q++) c.push(10 * Math.log10((lre[q] * lre[q] + lim[q] * lim[q]) / (n * n) + 1e-12));
  // suavizado en quefrencia (como el CPPS de Hillenbrand): evita que el ruido invente picos
  const W = Math.max(3, Math.round(sr / 48000 * 9)); const cs = c.map((_, i) => { let a2 = 0, n2 = 0; for (let j = Math.max(0, i - W); j <= Math.min(c.length - 1, i + W); j++) { a2 += c[j]; n2++; } return a2 / n2; });
  c.splice(0, c.length, ...cs);
  // recta de regresión sobre el cepstro y altura del pico por encima de ella
  const m = c.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < m; i++) { sx += i; sy += c[i]; sxx += i * i; sxy += i * c[i]; }
  const b = (m * sxy - sx * sy) / (m * sxx - sx * sx), a = (sy - b * sx) / m;
  let pk = 0; for (let i = 1; i < m; i++) if (c[i] > c[pk]) pk = i;
  return c[pk] - (a + b * pk);
}

// ---------- 1) Pasaje: sirena lenta ----------
async function runSiren(root, sig) {
  await startButton(root, 'Haz una <b>sirena lenta con "uuu"</b>: desde tu nota más grave hasta la más aguda (unos 5 segundos) y de vuelta. No evites el "quiebre": quiero encontrarlo. Lo haremos dos veces.', 'Empezar', 'atento');
  const c = getCtx(); const breaks = []; let lo = 1e9, hi = -1e9;
  for (let rep = 0; rep < 2 && !sig.aborted; rep++) {
    const canvas = h('canvas', { class: 'roll' });
    const box = h('div');
    root.replaceChildren(h('div', { class: 'ex' }, box, h('span', { class: 'pill' }, `Sirena ${rep + 1} de 2`), canvas, h('div', { class: 'grow' })));
    box.replaceChildren(say('🎵 Grave → agudo → grave, despacio, con "uuu"…', 'canta', { compact: true }));
    const R = getRange(); const roll = new Roll(canvas, { span: 12, nowFrac: 0.85 }); roll.setRange(R.low - 4, R.high + 6); roll.targets = [];
    resetSmoother();
    const fr = []; const t0 = c.currentTime; let started = null;
    while (!sig.aborted && c.currentTime - t0 < 14) {
      const p = readPitch(); const now = c.currentTime;
      if (p.raw != null) { if (started == null) started = now; fr.push({ t: now, m: p.raw }); lo = Math.min(lo, p.raw); hi = Math.max(hi, p.raw); }
      else fr.push({ t: now, m: null });
      roll.addUser(now, p.midi, true); roll.draw(now);
      if (started != null && now - started > 11) break;
      await raf();
    }
    roll.destroy();
    // saltos bruscos (>1,5 semitonos entre cuadros) o cortes cortos en medio de la sirena
    const v = fr.filter((f) => f.m != null);
    for (let i = 1; i < v.length; i++) if (Math.abs(v[i].m - v[i - 1].m) >= 1.5 && v[i].t - v[i - 1].t < 0.06) breaks.push({ m: (v[i].m + v[i - 1].m) / 2, kind: 'salto' });
    for (let i = 1; i < fr.length - 1; i++) {
      if (fr[i].m == null && fr[i - 1].m != null) { let j = i; while (j < fr.length && fr[j].m == null) j++; const dur = j < fr.length ? fr[j].t - fr[i].t : 0; if (j < fr.length && dur > 0.05 && dur < 0.35) breaks.push({ m: (fr[i - 1].m + fr[j].m) / 2, kind: 'corte' }); i = j; }
    }
    sfx('tap');
  }
  // un pasaje se confirma si aparece en las dos sirenas cerca de la misma nota
  let passage = null;
  if (breaks.length >= 2) {
    const ms = breaks.map((b) => b.m).sort((a, b) => a - b);
    let best = null;
    for (const m of ms) { const near = ms.filter((x) => Math.abs(x - m) <= 2); if (!best || near.length > best.n) best = { n: near.length, m: med(near) }; }
    if (best.n >= 2) passage = r0(best.m);
  }
  return { passage, nBreaks: breaks.length, sirenLo: isFinite(lo) ? r0(lo) : null, sirenHi: isFinite(hi) ? r0(hi) : null };
}

// ---------- 2) Rango dinámico (fonetograma simple) ----------
async function runDynRange(root, sig) {
  const R = getRange(); const hn = homeNote();
  const notes = [...new Set([Math.max(R.low + 2, hn - 4), hn, Math.min(R.high - 2, hn + 4)])];
  await startButton(root, 'Ahora el <b>volumen</b>: en cada nota canta primero <b>lo más suave que puedas sin que se corte</b>, y después <b>lo más fuerte que puedas sin gritar ni apretar</b>. Esto se llama perfil de rango vocal.', 'Empezar', 'atento');
  const c = getCtx(); const out = [];
  for (const m of notes) {
    const res = {};
    for (const mode of ['suave', 'fuerte']) {
      if (sig.aborted) return null;
      const meter = levelMeter(); const box = h('div'); const bar = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, '3 segundos'));
      root.replaceChildren(h('div', { class: 'ex' }, box, h('div', { class: 'row between' }, h('span', { class: 'pill' }, noteName(m)), h('span', { class: 'pill' }, mode === 'suave' ? '🤫 lo más suave' : '📣 lo más fuerte')), meter.el, bar, h('div', { class: 'grow' })));
      box.replaceChildren(say('Escucha la nota…', 'canta', { compact: true }));
      playNote(m, c.currentTime + 0.05, 1, 0.26); await sleep(1300);
      box.replaceChildren(say(mode === 'suave' ? 'Lo más <b>suave</b> posible, sin susurrar y sin que se corte.' : 'Lo más <b>fuerte</b> posible, con la garganta suelta.', 'atento', { compact: true }));
      resetSmoother(); const dbs = [], cents = []; let st = null; const t0 = c.currentTime;
      while (!sig.aborted) {
        const p = readPitch(); const now = c.currentTime; meter.set(Math.min(1, p.rms * 7));
        if (p.raw != null && Math.abs(p.raw - m) < 1.5) { if (st == null) st = now; if (now - st > 0.4) { dbs.push(dbOf(p.rms)); cents.push((p.raw - m) * 100); } }
        if (st != null) { bar.firstChild.style.width = Math.min(100, ((now - st) / 3) * 100) + '%'; if (now - st > 3) break; }
        if (now - t0 > 9) break;
        await raf();
      }
      res[mode] = dbs.length > 10 ? { db: med(dbs), c: med(cents) } : null;
      sfx('tap'); await sleep(250);
    }
    out.push({ m, soft: res.suave, loud: res.fuerte, range: res.suave && res.fuerte ? res.fuerte.db - res.suave.db : null });
  }
  return out;
}

// ---------- 3) Aire: tiempo máximo de fonación, s/z y claridad (CPP) ----------
async function timeSound(root, sig, { label, text, voiced, note, collectCpp }) {
  const c = getCtx();
  // piso de ruido de la pieza
  const meter = levelMeter(); const box = h('div'); const clock = h('div', { class: 'bignote' }, '0,0 s');
  root.replaceChildren(h('div', { class: 'ex' }, box, h('div', { class: 'center' }, clock), meter.el, h('div', { class: 'grow' })));
  box.replaceChildren(say('Silencio un segundo… mido el ruido de la pieza.', 'atento', { compact: true }));
  const floorS = []; let t0 = c.currentTime;
  while (c.currentTime - t0 < 1 && !sig.aborted) { floorS.push(readPitch().rms); await raf(); }
  const floor = Math.max(0.003, med(floorS) || 0.003);
  if (note) playNote(note, c.currentTime + 0.05, 0.9, 0.24);
  box.replaceChildren(say(text, 'atento', { compact: true }));
  resetSmoother();
  let st = null, last = null; const cps = []; t0 = c.currentTime; let k = 0;
  while (!sig.aborted) {
    const p = readPitch(); const now = c.currentTime; meter.set(Math.min(1, p.rms * 7));
    const on = p.rms > floor * 3 && (voiced ? p.raw != null : true);
    if (on) { if (st == null) st = now; last = now; if (collectCpp && ++k % 6 === 0 && now - st > 0.5) { const raw = readRaw(); if (raw) cps.push(cpp(raw.x, raw.sr)); } }
    if (st != null) clock.textContent = ((last - st)).toFixed(1).replace('.', ',') + ' s';
    if (st != null && now - last > 0.35) break; // se terminó el aire
    if (st == null && now - t0 > 8) break;
    if (st != null && now - st > 60) break;
    await raf();
  }
  sfx('tap'); await sleep(300);
  return { secs: st != null ? +(last - st).toFixed(1) : 0, cpp: cps.length >= 3 ? +med(cps).toFixed(1) : null };
}
async function runAir(root, sig) {
  await startButton(root, 'Ahora el <b>aire</b>, en tres pruebas cortas: una "a" larga, una "s" larga y una "z" larga. Cada una <b>lo más largo que puedas, cómodo</b>, después de inspirar profundo. Comparar la "s" con la "z" dice si tus cuerdas cierran bien.', 'Empezar', 'atento');
  const hn = homeNote();
  const a = await timeSound(root, sig, { text: 'Inspira profundo y canta <b>"aaa"</b> en esta nota, lo más largo que puedas, parejo.', voiced: true, note: hn, collectCpp: true });
  if (sig.aborted) return null;
  const s = await timeSound(root, sig, { text: 'Inspira profundo y suelta una <b>"sss"</b> lo más larga que puedas.', voiced: false });
  if (sig.aborted) return null;
  const z = await timeSound(root, sig, { text: 'Inspira profundo y haz una <b>"zzz"</b> (como un zumbido de abeja) lo más larga que puedas.', voiced: false });
  const ok = (x) => (x >= 1 ? x : null); // menos de 1 s = no se pudo medir (ruido o no se escuchó), no "aire corto"
  const S = ok(s.secs), Z = ok(z.secs);
  return { mpt: ok(a.secs), cpp: ok(a.secs) ? a.cpp : null, s: S, z: Z, sz: S && Z ? +(S / Z).toFixed(2) : null };
}

// ---------- 4) Ataque: cómo empiezas el sonido ----------
async function runOnset(root, sig) {
  await startButton(root, 'Por último, <b>cómo empiezas el sonido</b>: tres veces, cuando aparezca "¡Ahora!", canta un <b>"a"</b> corto y natural, partiendo desde el silencio.', 'Empezar', 'atento');
  const c = getCtx(); const hn = homeNote(); const out = [];
  for (let i = 0; i < 3 && !sig.aborted; i++) {
    const box = h('div', { class: 'center' }, h('div', { class: 'bignote' }, '…'));
    root.replaceChildren(h('div', { class: 'ex' }, say(`Intento ${i + 1} de 3. Prepárate en silencio…`, 'atento', { compact: true }), box, h('div', { class: 'grow' })));
    playNote(hn, c.currentTime + 0.05, 0.6, 0.2); await sleep(1600);
    const floorS = []; let t0 = c.currentTime; while (c.currentTime - t0 < 0.5) { floorS.push(readPitch().rms); await raf(); }
    const floor = Math.max(0.003, med(floorS));
    box.firstChild.textContent = '¡Ahora!';
    resetSmoother(); t0 = c.currentTime; let first = null, voice = null; const env = [];
    while (!sig.aborted && c.currentTime - t0 < 4) {
      const p = readPitch(); const now = c.currentTime;
      if (first == null && p.rms > floor * 3) first = now;
      if (first != null) { env.push({ t: now - first, rms: p.rms, v: p.raw != null }); if (voice == null && p.raw != null) voice = now; }
      if (first != null && now - first > 0.6) break;
      await raf();
    }
    if (first == null || voice == null) { out.push(null); continue; }
    const steady = med(env.filter((e) => e.t > 0.3).map((e) => e.rms)) || 0.01;
    const t90 = (env.find((e) => e.rms >= steady * 0.9) || { t: 0.6 }).t;
    out.push({ rise: t90, asp: voice - first });
    box.firstChild.textContent = '✓'; sfx('tap'); await sleep(500);
  }
  const ok = out.filter(Boolean);
  if (!ok.length) return null;
  const rise = med(ok.map((x) => x.rise)), asp = med(ok.map((x) => x.asp));
  const kind = asp >= 0.09 ? 'aspirado' : rise <= 0.02 ? 'duro' : 'equilibrado';
  return { kind, rise: +rise.toFixed(3), asp: +asp.toFixed(3) };
}

// ---------- La batería completa ----------
export async function runVoiceMap(spec, root, sig) {
  await startButton(root, 'Vamos a hacer el <b>mapa completo de tu voz</b>: cómo hablas, dónde cantas mejor, tu color, tu pasaje, tu volumen, tu aire, cómo empiezas el sonido y cómo afinas. Son unos 8 minutos. Busca un lugar tranquilo.', 'Empezar', 'feliz', null, 'mapa_intro');
  if (!(await ensureMic(root))) return { score: 0 };
  const steps = ['Tu voz hablada', 'Dónde cantas mejor', 'Tu pasaje', 'Tu volumen', 'Tu aire', 'Tu ataque'];
  const head = async (i) => new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    h('div', { class: 'diag-step' }, h('span', { class: 'pill' }, `Paso ${i + 1} de ${steps.length}`), h('h2', {}, steps[i])), h('div', { class: 'grow' }),
    h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); res(); } }, 'Vamos')))));
  await head(0); const sp = await runSpeak({ noStart: true }, root, sig); if (sig.aborted) return { score: 0 };
  await head(1); const idr = await runIdentity({ noStart: true, quiet: true }, root, sig); if (sig.aborted) return { score: 0 };
  await head(2); const sir = await runSiren(root, sig); if (sig.aborted) return { score: 0 };
  await head(3); const dyn = await runDynRange(root, sig); if (sig.aborted) return { score: 0 };
  await head(4); const air = await runAir(root, sig); if (sig.aborted) return { score: 0 };
  await head(5); const ons = await runOnset(root, sig); if (sig.aborted) return { score: 0 };
  const prof = voiceProfile() || {};
  const tun = analyze();
  const notes = (load().obs || []).slice(-300).filter((o) => o.k !== 'sus');
  const map = {
    at: Date.now(), speak: prof.speak ?? null, speakSD: prof.speakSD ?? null, speakLo: prof.speakLo ?? null, speakHi: prof.speakHi ?? null,
    id: idr && idr.id ? idr.id : identities().slice(-1)[0] || null, siren: sir, dyn, air, onset: ons,
    tuning: notes.length >= 20 ? { n: notes.length, bias: r0(notes.reduce((a, o) => a + o.c, 0) / notes.length), acc: r0((notes.filter((o) => Math.abs(o.c) <= 35).length / notes.length) * 100), findings: tun.findings.filter((f) => f.tone !== 'ok').slice(0, 3).map((f) => f.title) } : null,
  };
  const s = load(); const prev = (s.voiceMaps || []).slice(-1)[0] || null; s.voiceMaps = [...(s.voiceMaps || []), map].slice(-8); save();
  sfx('done'); confetti();
  await new Promise((res) => root.replaceChildren(voiceMapView(map, prev, () => { stopSpeaking(); res(); })));
  return { score: 1, info: true, detail: 'Mapa de tu voz guardado.' };
}

// ---------- Informe: tu voz en todas sus dimensiones ----------
export function voiceMapView(m, prev, onDone) {
  const nn = (x) => (x == null ? '—' : noteName(x));
  const cards = [];
  const id = m.id;
  const card = (title, value, body, tip, extra) => h('div', { class: 'card vm-card' }, h('div', { class: 'row between' }, h('b', {}, title), value ? h('span', { class: 'pill' }, value) : null), h('p', { class: 'small', html: body }), tip ? h('p', { class: 'small tip', html: '👉 ' + tip }) : null, extra || null);
  const delta = (cur, old, unit, better = 'up') => { if (cur == null || old == null) return ''; const d = cur - old; if (Math.abs(d) < 0.05) return ''; const good = better === 'up' ? d > 0 : d < 0; return ` <span class="${good ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(+d.toFixed(1))}${unit} vs antes</span>`; };
  // 0) frase resumen
  const parts = [];
  if (id) parts.push(`<b>${id.type}</b>`);
  if (id && id.color) parts.push(`de color <b>${id.color}</b>`);
  if (id && id.texture) parts.push(`textura <b>${id.texture}</b>`);
  const sweet = id && id.sweetLo != null ? `cómodo entre <b>${nn(id.sweetLo)} y ${nn(id.sweetHi)}</b>` : null;
  const summary = [parts.join(', '), sweet, m.siren && m.siren.passage ? `con el pasaje cerca de <b>${nn(m.siren.passage)}</b>` : null].filter(Boolean).join(', ');
  // 1) voz hablada
  if (m.speak != null) {
    const sd = m.speakSD;
    const ent = sd == null ? '' : sd < 1.5 ? 'Tu entonación al hablar es <b>bastante plana</b> (varía poco). Al cantar conviene exagerar las subidas y bajadas.' : sd > 4 ? 'Tu entonación al hablar es <b>muy expresiva</b>: subes y bajas harto, buena señal de control de altura.' : 'Tu entonación al hablar es <b>normal</b>.';
    cards.push(card('Tu voz hablada', nn(r0(m.speak)), `Hablas alrededor de <b>${nn(r0(m.speak))}</b>` + (m.speakLo != null ? `, moviéndote entre ${nn(r0(m.speakLo))} y ${nn(r0(m.speakHi))}` : '') + (sd != null ? ` (variación ±${sd.toFixed(1)} semitonos).` : '.') + ' ' + ent, 'Tu voz hablada es tu punto de partida: cerca de ella tu voz cantada es más natural.'));
  }
  // 2) tesitura, tipo, color y textura
  if (id) {
    cards.push(card('Dónde cantas mejor', sweet ? `${nn(id.sweetLo)}–${nn(id.sweetHi)}` : null, `Tu zona dulce (más afinada, estable y limpia) es <b>${nn(id.sweetLo)}–${nn(id.sweetHi)}</b>, dentro de tu rango cómodo ${nn(id.low)}–${nn(id.high)}. Tipo de voz probable: <b>${id.type}</b>.`, 'Elige tonos de canciones que vivan en tu zona dulce; ahí construyes confianza y después extiendes.'));
    cards.push(card('Tu color y textura', id.color || null, (id.color ? `Color <b>${id.color}</b> (energía 2–4 kHz vs graves: ${r0(id.bright)} dB). ` : '') + (id.texture ? `Textura <b>${id.texture}</b> (armonía/ruido ≈ ${r0(id.hnr)} dB${id.h12 != null ? `, H1−H2 ≈ ${r0(id.h12)} dB` : ''}).` : ''),
      id.color === 'oscura y cálida' ? 'Tu fuerte es la calidez: brillas en baladas y registros medios. Para proyectar más, busca un poco de "twang" (sonido más brillante, como un "nyeh").' : id.color === 'brillante' ? 'Tu voz corta y se proyecta: aprovéchala en pop y rock; cuida no "apretar" en los agudos.' : 'Color equilibrado: tu voz se adapta a muchos estilos.'));
  }
  // 3) pasaje
  if (m.siren) {
    const p = m.siren.passage;
    cards.push(card('Tu pasaje (cambio de registro)', p != null ? nn(p) : 'suave', p != null ? `En las dos sirenas tu voz <b>cambió o se quebró cerca de ${nn(p)}</b>. Ese es tu pasaje entre la voz de pecho y la de cabeza.` : `En las sirenas no encontré un quiebre claro (${m.siren.nBreaks} saltos aislados). O pasas suave por tu pasaje, o no alcanzaste a llegar a él.`,
      p != null ? `Practica sirenas livianas con "ng" o "brrr" justo alrededor de ${nn(p)}, sin empujar. La meta es que el cambio no se note.` : 'Sigue con sirenas amplias para mantener ese paso suave.'));
  }
  // 4) volumen
  if (m.dyn && m.dyn.some((d) => d.range != null)) {
    const rs = m.dyn.filter((d) => d.range != null); if (rs.length) {} const avg = rs.reduce((a, d) => a + d.range, 0) / rs.length;
    const softSharp = rs.filter((d) => d.soft && d.loud && d.loud.c - d.soft.c > 25).length;
    const pv = prev && prev.dyn ? prev.dyn.filter((d) => d.range != null) : [];
    cards.push(card('Tu rango dinámico', `${r0(avg)} dB`, `Entre lo más suave y lo más fuerte hay en promedio <b>${r0(avg)} dB</b> (${rs.map((d) => `${nn(d.m)}: ${r0(d.range)} dB`).join(', ')}).` + delta(avg, pv.length ? pv.reduce((a, d) => a + d.range, 0) / pv.length : null, ' dB') + (softSharp ? ' Al cantar fuerte <b>la nota se te sube</b>.' : ''),
      avg < 12 ? 'Tu voz se mueve poco en volumen: practica crescendos y la messa di voce (unidad de Dinámica). Cantar suave sin perder la nota es el control más fino.' : 'Buen rango. Sigue con la messa di voce para controlarlo sin que la afinación se mueva.',
      h('div', { class: 'vrp' }, ...m.dyn.map((d) => h('div', { class: 'vrp-col' }, h('div', { class: 'vrp-bar', style: `bottom:${Math.max(0, (d.soft ? d.soft.db : -50) + 60)}%;height:${Math.max(2, d.range || 0)}%` }), h('small', {}, nn(d.m)))))));
  }
  // 5) aire y claridad
  if (m.air && m.air.mpt == null) cards.push(card('Tu aire', 'sin medir', 'No alcancé a medir tu aire: puede que hubiera ruido en la pieza o que el sonido fuera muy suave. Repite el mapa en un lugar silencioso.', null));
  if (m.air && m.air.mpt != null) {
    const a = m.air; const pa = prev && prev.air;
    const szTxt = a.sz == null ? '' : a.sz <= 1.4 ? ` Relación s/z <b>${a.sz}</b>: dentro de lo esperable en adultos (0,99–1,40), tus cuerdas cierran bien.` : ` Relación s/z <b>${a.sz}</b>: más alta que lo esperable (sobre 1,40) puede indicar que se escapa aire por las cuerdas (voz soplada). Si además notas ronquera persistente, vale la pena una evaluación con un fonoaudiólogo.`;
    cards.push(card('Tu aire', `${String(a.mpt).replace('.', ',')} s`, `Sostuviste una "a" durante <b>${String(a.mpt).replace('.', ',')} s</b>` + delta(a.mpt, pa && pa.mpt, ' s') + `` + (a.s != null && a.z != null ? `; "s" ${String(a.s).replace('.', ',')} s y "z" ${String(a.z).replace('.', ',')} s.` : '.') + szTxt,
      a.mpt < 10 ? 'Tu frase de aire es corta: trabaja el apoyo (siseo "sss" largo, costillas abiertas) y dosifica desde el comienzo. Ensaya marcando dónde respiras en tus canciones.' : 'Buen aire. Úsalo con calma: no se trata de durar más, sino de que el sonido salga parejo hasta el final.'));
    if (a.cpp != null) cards.push(card('Claridad de tu voz (CPP)', `${a.cpp} dB`, `La prominencia del pico cepstral de tu "a" es <b>${a.cpp} dB</b>` + delta(a.cpp, pa && pa.cpp, ' dB') + '. Es una de las medidas de calidad vocal que más se correlaciona con lo que oyen los especialistas: más alta = voz más clara y periódica; más baja = más aire o aspereza. Los valores dependen del micrófono: compárate contigo mismo.', 'Para subirla: ataque equilibrado, aire parejo y no cantar susurrado.'));
  }
  // 6) ataque
  if (m.onset) {
    const o = m.onset;
    const TXT = { duro: 'Empiezas con <b>golpe de glotis</b> (ataque duro): el sonido arranca de golpe. Usado siempre, cansa las cuerdas.', aspirado: 'Empiezas con <b>aire antes del sonido</b> (ataque aspirado): se escapa aire y la nota parte soplada.', equilibrado: 'Tu ataque es <b>equilibrado</b>: ni golpe ni aire antes. Es justo lo que buscan los profes.' };
    cards.push(card('Cómo empiezas el sonido', o.kind, TXT[o.kind] + ` <small>(subida ${r0(o.rise * 1000)} ms, aire previo ${r0(o.asp * 1000)} ms)</small>`, o.kind === 'equilibrado' ? 'Mantén ese inicio también en notas agudas y fuertes.' : 'Practica el "ataque limpio" (unidad Sacar la voz): imagina que la nota ya está sonando y te subes a ella; piensa "a" como un suspiro con sonido.'));
  }
  // 7) afinación
  if (m.tuning) {
    const t = m.tuning;
    cards.push(card('Cómo afinas', `${t.acc}% afinado`, `En tus últimas ${t.n} notas cantadas, el <b>${t.acc}%</b> quedó a menos de 35 cents, con un sesgo medio de ${t.bias > 0 ? '+' : ''}${t.bias} cents.` + (t.findings.length ? ' Patrones: ' + t.findings.join(' · ') + '.' : ''), 'El detalle y los ajustes que hace la app están en "Lo que he aprendido de ti".'));
  }
  // plan personal: lo más urgente primero
  const plan = [];
  if (m.onset && m.onset.kind !== 'equilibrado') plan.push('Ataque limpio (unidad 2 · Sacar la voz)');
  if (m.air && m.air.mpt != null && m.air.mpt < 10) plan.push('Aire parejo y apoyo (Sacar la voz · Aire parejo)');
  if (m.tuning && m.tuning.acc < 60) plan.push('Calzar la nota (etapa 1) y el juego Vuelo del Chincol');
  if (m.siren && m.siren.passage != null) plan.push(`Registros alrededor de ${nn(m.siren.passage)} (etapa 4 · Registros y agudos)`);
  if (m.dyn && m.dyn.some((d) => d.range != null && d.range < 12)) plan.push('Dinámica y messa di voce (etapa 4)');
  return h('div', { class: 'ex vmap' },
    say(`<b>El mapa de tu voz.</b> ${summary ? 'Tu voz: ' + summary + '.' : ''} Esta es tu voz hoy: aprende a manejarla desde lo que ya tiene.`, 'celebra', { voice: 'mapa_ok' }),
    ...cards,
    plan.length ? h('div', { class: 'card ok-card' }, h('b', {}, 'Para manejar mejor tu voz, en este orden:'), ...plan.map((p, i) => h('p', { class: 'small' }, `${i + 1}. ${p}`))) : null,
    h('p', { class: 'small muted' }, 'Pruebas inspiradas en la evaluación vocal clínica (perfil de rango vocal, tiempo máximo de fonación, relación s/z, CPP) y en la clasificación de voces de la pedagogía (tesitura, timbre, pasaje, voz hablada). Con el micrófono del celular son aproximadas: repite el mapa cada mes en el mismo lugar para ver tu evolución.'),
    h('div', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => { location.hash = '#manual'; } }, 'Ver cómo usar tu voz (tu manual)'),
    onDone ? h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: onDone }, 'Entendido')) : null);
}
