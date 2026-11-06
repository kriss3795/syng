// "¿Me está midiendo bien?": una prueba en 4 pasos para que VEAS que la app te escucha bien.
// 1) silencio: ruido de la pieza y "notas fantasma";  2) hablar: tu voz hablada (tu tono y tu fuerza normal);
// 3) "uuu" parejo: que el sonido llegue fuerte y la medición quede quieta;  4) sirena: que la línea te SIGA al subir y bajar.
// Al final: lista de ✓/✗ con qué hacer si algo falla, y tu grabación para que compares con tu oído.
import { h, sleep, Roll, levelMeter } from './ui.js';
import { getCtx, readPitch, resetSmoother, startRecorder } from './audio.js';
import { noteName } from './pitch.js';
import { load, save, setVoiceProfile, voiceProfile } from './store.js';
import { say } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { ensureMic, raf } from './exercises.js';

const db = (r) => 20 * Math.log10(Math.max(1e-5, r));
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function stepScreen(root, sig, { text, mood = 'atento', secs, button, live = true }) {
  const box = h('div'); box.replaceChildren(say(text, mood));
  const canvas = h('canvas', { class: 'roll small' }); const meter = levelMeter(); const now = h('div', { class: 'mc-now' }, '—'); const clock = h('div', { class: 'small muted center' }, '');
  let go; const p = new Promise((r) => (go = r));
  const btn = h('button', { class: 'btn primary big', onclick: (e) => { sfx('select'); e.currentTarget.disabled = true; go(); } }, button);
  root.replaceChildren(h('div', { class: 'ex' }, box, live ? h('div', { class: 'mc-live' }, now, meter.el) : null, live ? canvas : null, clock, h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, btn)));
  const roll = live ? new Roll(canvas, { span: 5, nowFrac: 0.9 }) : null; if (roll) roll.setRange(36, 72);
  // vista previa en vivo mientras lees (así ya ves que te escucha)
  let previewing = true;
  (async () => { const c = getCtx(); while (previewing && !sig.aborted) { const q = readPitch(); meter.set(Math.min(1, q.rms * 7)); now.textContent = q.midi != null ? noteName(Math.round(q.midi)) : '—'; if (roll) { roll.addUser(c.currentTime, q.midi, null); roll.draw(c.currentTime); } await raf(); } })();
  await p; previewing = false; if (sig.aborted) return null;
  const c = getCtx(); resetSmoother(); const fr = []; const t0 = c.currentTime;
  while (!sig.aborted && c.currentTime - t0 < secs) {
    const q = readPitch(); const t = c.currentTime - t0; fr.push({ t, m: q.midi, raw: q.raw, rms: q.rms });
    meter.set(Math.min(1, q.rms * 7)); now.textContent = q.midi != null ? noteName(Math.round(q.midi)) : '—';
    if (roll) { roll.addUser(c.currentTime, q.midi, null); roll.draw(c.currentTime); }
    clock.textContent = Math.max(0, secs - t).toFixed(1) + ' s';
    await raf();
  }
  if (roll) roll.destroy();
  return fr;
}

export async function runMicCheck(spec, root, sig) {
  stopSpeaking();
  if (!(await ensureMic(root))) return { score: 0 };
  const checks = [];
  // 1) silencio
  const f1 = await stepScreen(root, sig, { text: '<b>Paso 1 de 4 · Silencio.</b> Quédate callado 3 segundos. Mido el ruido de tu pieza y reviso que la app no invente notas cuando nadie canta.', secs: 3, button: 'Medir el silencio' });
  if (!f1) return { score: 0 };
  const noise = med(f1.map((f) => f.rms)) || 1e-4; const ghost = f1.filter((f) => f.m != null).length / Math.max(1, f1.length);
  checks.push({ k: 'ruido', ok: ghost < 0.15 && db(noise) < -45, t: ghost < 0.15 ? `Silencio limpio: la app no inventó notas (ruido ${Math.round(db(noise))} dB).` : `Con silencio, la app "oyó" notas el ${Math.round(ghost * 100)}% del tiempo.`, fix: 'Hay ruido de fondo (ventilador, tele, calle). Busca un lugar más silencioso o acércate más al micrófono.' });
  // 2) hablar
  const f2 = await stepScreen(root, sig, { text: '<b>Paso 2 de 4 · Habla normal.</b> Di en voz alta, como conversando: <b>"Hola, me llamo… y estoy aprendiendo a cantar"</b>. No cambies tu voz: habla como siempre.', secs: 4, button: 'Empezar a hablar', mood: 'feliz' });
  if (!f2) return { score: 0 };
  const sp = f2.filter((f) => f.raw != null && f.rms > noise * 3);
  const speak = sp.length > 15 ? med(sp.map((f) => f.raw)) : null; const speakRms = sp.length > 15 ? med(sp.map((f) => f.rms)) : null;
  if (speak) { const v = voiceProfile() || {}; if (!v.speak) setVoiceProfile({ speak, speakRms, at: Date.now() }); else if (!v.speakRms) setVoiceProfile({ speakRms }); }
  checks.push({ k: 'habla', ok: !!speak, t: speak ? `Tu voz al hablar ronda <b>${noteName(Math.round(speak))}</b>. Ese es tu tono natural: <b>tu voz cantada parte cerca de ahí</b>.` : 'No logré oír bien tu voz hablada.', fix: 'Acerca el celular a unos 30–50 cm de tu boca y habla con tu volumen normal.' });
  // 3) "uuu" parejo
  const rec = startRecorder();
  const f3 = await stepScreen(root, sig, { text: `<b>Paso 3 de 4 · "Uuu" parejo.</b> Canta un <b>"uuu"</b> cómodo${speak ? `, cerca de tu voz hablada (${noteName(Math.round(speak) + 1)})` : ''}, con la <b>misma fuerza con que hablas</b>, y sostenlo parejo 3 segundos. La línea debería quedar casi recta.`, secs: 3.2, button: 'Cantar "uuu"' });
  const blob = rec ? await rec.stop() : null;
  if (!f3) return { score: 0 };
  const v3 = f3.filter((f) => f.raw != null).slice(5);
  const lvl = v3.length ? med(v3.map((f) => f.rms)) : 0; const snr = db(lvl) - db(noise);
  const m3 = v3.length ? med(v3.map((f) => f.raw)) : null;
  const sd = v3.length > 20 ? Math.sqrt(v3.reduce((a, f) => a + ((f.raw - m3) * 100) ** 2, 0) / v3.length) : null;
  const voicedFrac = f3.length ? f3.filter((f) => f.raw != null).length / f3.length : 0;
  checks.push({ k: 'señal', ok: snr >= 18 && voicedFrac > 0.6, t: snr >= 18 ? `Tu voz llega <b>${Math.round(snr)} dB</b> sobre el ruido: fuerte y clara.` : `Tu voz llega solo ${Math.round(snr)} dB sobre el ruido: muy bajita para medir bien.`, fix: 'Canta con más voz (al menos como hablas) o acércate al micrófono.' });
  checks.push({ k: 'estable', ok: sd != null && sd < 35, t: sd != null ? `Mientras sostenías, la medición se movió ±${Math.round(sd)} cents` + (sd < 35 ? ': la app te mide estable.' : ': se movió bastante.') : 'No pude medir el "uuu".', fix: 'Si tu voz se sentía pareja pero la línea saltaba: usa audífonos con cable o quita Bluetooth, y revisa que nada más suene.' });
  // 4) sirena: ¿la línea te sigue?
  const f4 = await stepScreen(root, sig, { text: '<b>Paso 4 de 4 · Sirena.</b> Con "uuu", <b>sube despacio y después baja</b>, como una sirena. Mira cómo la línea te sigue.', secs: 5, button: 'Hacer la sirena' });
  if (!f4) return { score: 0 };
  const v4 = f4.filter((f) => f.raw != null);
  let span = 0, upDown = false;
  if (v4.length > 30) { const ms = v4.map((f) => f.raw); const hiI = ms.indexOf(Math.max(...ms)); span = Math.max(...ms) - Math.min(...ms); upDown = hiI > v4.length * 0.15 && hiI < v4.length * 0.85 && ms[hiI] - ms[0] > 2 && ms[hiI] - ms[ms.length - 1] > 2; }
  checks.push({ k: 'sigue', ok: span >= 3 && upDown, t: span >= 3 ? `La línea te siguió: recorriste ${span.toFixed(1)} semitonos` + (upDown ? ', subiendo y bajando.' : '.') : 'La línea casi no se movió.', fix: 'Haz la sirena más amplia (de grave a agudo) y sin cortar el sonido.' });
  const okN = checks.filter((c) => c.ok).length;
  const s = load(); s.micCheck = { at: Date.now(), ok: okN, n: checks.length, snr: Math.round(snr), sd: sd != null ? Math.round(sd) : null }; save();
  let audio = null; const url = blob ? URL.createObjectURL(blob) : null;
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say(okN === checks.length ? '<b>Te estoy midiendo bien.</b> Todo en orden: puedes confiar en lo que te marco.' : `<b>${okN} de ${checks.length} pruebas bien.</b> Mira abajo qué ajustar para que te mida mejor.`, okN === checks.length ? 'celebra' : 'piensa'),
    h('div', { class: 'card mc-list' }, ...checks.map((c) => h('div', { class: 'mc-item ' + (c.ok ? 'ok' : 'bad') }, h('b', {}, c.ok ? '✓' : '✗'), h('div', {}, h('p', { html: c.t }), c.ok ? null : h('p', { class: 'small', html: '👉 ' + c.fix }))))),
    url ? h('div', { class: 'listen-row' }, h('span', { class: 'small muted' }, 'Juzga tú también:'), h('button', { class: 'btn small', onclick: () => { if (audio) { audio.pause(); audio = null; return; } audio = new Audio(url); audio.onended = () => (audio = null); audio.play().catch(() => {}); } }, '🎧 Escucha tu "uuu"')) : null,
    h('p', { class: 'small muted' }, 'Qué mide la app: la altura de tu voz (qué nota y cuántos cents te desvías, con un error menor a 5 cents), tu volumen y cuánto tiembla la nota. Qué NO mide: tu postura, tu respiración ni si la vocal es "a" o "u".'),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Listo')))));
  return { score: okN / checks.length, info: true, detail: `${okN} de ${checks.length} pruebas de micrófono bien.` };
}
