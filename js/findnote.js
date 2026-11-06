// Taller "Encuentra la nota": como lo haría un profe particular con alguien que se pierde buscando la nota.
// Sin tiempo ni tempo encima. Si no la encuentras, la ayuda sube de a poco:
//   0) escuchas y cantas;  1) te guío deslizando ("sube/baja como sirena") y repito la nota;
//   2) "al revés": cantas TÚ una nota cómoda, yo la tomo como punto de partida y subimos o bajamos
//      de a un semitono hasta la nota (empezar desde donde está el alumno; Welch 1985, Hutchins y Peretz 2012).
// Además detecta patrones: si partes abajo o arriba, si llegas deslizando, si te confundes de octava,
// en qué zona de tu voz te cuesta más y si a veces te mueves en la dirección contraria (posible tema de oído).
import { h, sleep, tuner } from './ui.js';
import { getCtx, readPitch, resetSmoother, playNote } from './audio.js';
import { noteName } from './pitch.js';
import { load, save, homeNote, getRange, voiceProfile } from './store.js';
import { say } from './coach.js';
import { sfx, stopSpeaking } from './voice.js';
import { ensureMic, raf } from './exercises.js';
import { getMyVoice, playMyVoice } from './myvoice.js';

const TOL = 80; // zona verde ±40 cents: exigente pero alcanzable para empezar
const fold = (c) => { while (c > 600) c -= 1200; while (c < -600) c += 1200; return c; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// Notas del taller: parten cerca de tu voz hablada y se abren de a poco hacia arriba y abajo
function plan(n, R, hn, prev) {
  const wide = prev && prev.found / Math.max(1, prev.n) >= 0.8 && prev.avgT < 4; // la vez pasada te fue bien: abrimos más
  const steps = wide ? [0, 3, -2, 5, -4, 7, 2, -5, 9, 4] : [0, 2, -2, 3, -3, 4, 1, 5, -4, 6];
  const lo = R.guessed ? hn - 6 : R.low + 1, hi = R.guessed ? hn + 7 : R.high - 1;
  return steps.slice(0, n).map((s) => Math.max(lo, Math.min(hi, hn + s)));
}

export async function runFindNote(spec, root, sig) {
  stopSpeaking();
  const R = getRange(); const hn = homeNote();
  const hist = load().findNote || []; const prev = hist[hist.length - 1];
  const targets = plan(spec.n || 6, R, hn, prev);
  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say('<b>Taller: encuentra la nota.</b> Aquí no hay apuro ni ritmo. Te doy una nota, la buscas con calma y yo te voy guiando. Si no aparece, te ayudo paso a paso, como en una clase.<br><br>💡 <b>El truco:</b> canta "uuu" o "mmm" suave, y mueve la voz despacio hacia arriba o abajo, como una sirena, hasta que la bolita quede en la zona verde.', 'feliz'),
    prev ? h('p', { class: 'small muted' }, `La vez pasada encontraste ${prev.found} de ${prev.n} notas, en ${prev.avgT != null ? prev.avgT.toFixed(1) + ' s' : '—'} en promedio.`) : null,
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => { sfx('select'); getCtx(); res(); } }, 'Empezar')))));
  if (!(await ensureMic(root))) return { score: 0 };
  const c = getCtx();
  const ref = spec.pianoOnly ? null : await getMyVoice();
  const stats = []; let wrongDir = 0;

  for (let i = 0; i < targets.length && !sig.aborted; i++) {
    let target = targets[i];
    const tu = tuner(TOL); tu.setTol(TOL);
    const coachBox = h('div'); const setCoach = (t, mood = 'atento') => coachBox.replaceChildren(say(t, mood, { compact: true }));
    const arrow = h('div', { class: 'fn-arrow' });
    const holdBar = h('div', { class: 'holdbar' }, h('div', { class: 'pfill ok' }), h('span', {}, 'Sostén en la zona verde'));
    const stepPill = h('span', { class: 'pill' }, `Nota ${i + 1} de ${targets.length}`);
    const hintPill = h('span', { class: 'pill' }, '');
    const again = h('button', { class: 'btn' }, '🔊 Oír de nuevo');
    const help = h('button', { class: 'btn' }, '🆘 Ayúdame');
    const skip = h('button', { class: 'btn ghost' }, 'Saltar');
    // Ficha "cómo cantarla": nota, sonido, fuerza y duración, siempre a la vista
    const vp = voiceProfile() || {}; const spk = vp.speak ? Math.round(vp.speak) : null; const spkRms = vp.speakRms || 0.04;
    const refN = vp.comfort != null ? vp.comfort : spk; const refTxt = vp.comfort != null ? 'tu nota cómoda' : 'tu voz al hablar';
    const rel = '';
    const relOf = (t) => refN == null ? '' : t === refN ? ` (justo ${refTxt})` : t > refN ? ` (${t - refN} semitono${t - refN > 1 ? 's' : ''} sobre ${refTxt})` : ` (${refN - t} semitono${refN - t > 1 ? 's' : ''} bajo ${refTxt})`;
    const noteSpan = h('span', {}, noteName(target) + relOf(target));
    const recipe = h('div', { class: 'recipe' },
      h('div', {}, h('b', {}, '🎵 Nota'), noteSpan),
      h('div', {}, h('b', {}, '👄 Sonido'), h('span', {}, '"uuu" suave, labios redondos')),
      h('div', {}, h('b', {}, '🔊 Fuerza'), h('span', {}, 'como conversando, no susurro ni grito')),
      h('div', {}, h('b', {}, '⏱ Cuánto'), h('span', {}, '1 segundo parejo en la zona verde')));
    const strFill = h('div', { class: 'str-fill' }); const strLbl = h('span', { class: 'str-lbl' }, 'Fuerza');
    const strength = h('div', { class: 'str-bar' }, h('div', { class: 'str-zone' }), strFill, strLbl);
    root.replaceChildren(h('div', { class: 'ex' }, h('div', { class: 'row between' }, stepPill, hintPill), coachBox, recipe, h('div', { class: 'fn-wrap' }, tu.el, arrow), strength, holdBar,
      h('div', { class: 'grow' }), h('div', { class: 'actionbar fn-actions' }, again, help, skip)));

    let quietUntil = 0;
    const play = (m, dur = 1.2) => { if (ref && isFinite(m) && isFinite(ref.midi)) { const d = playMyVoice(ref, m); quietUntil = c.currentTime + d + 0.4; } else { playNote(m, c.currentTime + 0.05, dur, 0.3); quietUntil = c.currentTime + dur + 0.35; } };
    let skipped = false, askHelp = false;
    again.onclick = () => play(target); skip.onclick = () => (skipped = true); help.onclick = () => (askHelp = true);

    // Busca una nota: devuelve {ok, t, octave, first, approach, sd}
    const seek = async (m, maxT, { hint = 0, msg = null } = {}) => {
      resetSmoother(); play(m); noteSpan.textContent = noteName(m) + relOf(m);
      setCoach(msg || '👂 Escucha la nota… y después cántala.', 'canta');
      let held = 0, lastT = c.currentTime; const t0 = c.currentTime; let tStart = null, first = null, octave = false; const cs = []; const pre = [];
      let lastMsg = '', lastReplay = c.currentTime, prevAbs = null, awayT = 0;
      while (!sig.aborted && !skipped && !(askHelp && hint < 2)) {
        const now = c.currentTime; const dt = Math.min(0.1, now - lastT); lastT = now;
        if (now < quietUntil) { tu.update(null, m); tu.setMsg('Escucha…'); arrow.className = 'fn-arrow'; await raf(); continue; }
        const p = readPitch();
        const ratio = p.rms / spkRms; strFill.style.width = Math.min(100, (ratio / 2.5) * 100) + '%';
        strLbl.textContent = p.rms < 0.004 ? 'Fuerza' : ratio < 0.55 ? 'Muy bajito: más voz' : ratio > 2 ? 'Muy fuerte: afloja' : 'Fuerza: bien ✓';
        strFill.className = 'str-fill ' + (p.rms < 0.004 ? '' : ratio < 0.55 || ratio > 2 ? 'warn' : 'ok');
        if (p.midi == null) {
          tu.update(null, m);
          if (tStart && now - lastReplay > 7 && hint >= 1) { play(m); lastReplay = now; }
          if (lastMsg !== 'nada' && (!tStart || now - tStart > 1.5)) { lastMsg = 'nada'; setCoach(tStart ? 'Sigue sonando: no cortes el sonido, desliza sin parar.' : 'Tu turno: canta "uuu" suave, en la nota que escuchaste.', 'atento'); }
          await raf(); continue;
        }
        if (tStart == null) tStart = now;
        const raw = (p.midi - m) * 100; const cf = fold(raw);
        const useOct = Math.abs(raw) > 600 && Math.abs(cf) <= TOL / 2;
        const cents = useOct ? cf : raw;
        tu.update(useOct ? m + cf / 100 : p.midi, m);
        if (first == null && now - tStart > 0.25) first = raw;
        if (now - tStart < 0.6) pre.push(raw);
        // ¿te alejas de la nota mientras te guío? (posible confusión arriba/abajo)
        const ab = Math.abs(raw); if (prevAbs != null && hint >= 1 && ab > 150) { if (ab > prevAbs + 2) awayT += dt; else awayT = Math.max(0, awayT - dt * 0.5); } prevAbs = ab;
        const inT = Math.abs(cents) <= TOL / 2;
        arrow.className = 'fn-arrow ' + (inT ? 'ok' : cents < 0 ? 'up' : 'down');
        arrow.textContent = inT ? '✓' : cents < 0 ? '▲' : '▼';
        const st = inT ? 'ok' : Math.abs(cents) > 250 ? (cents < 0 ? 'lejosAbajo' : 'lejosArriba') : cents < 0 ? 'abajo' : 'arriba';
        if (st !== lastMsg) {
          lastMsg = st;
          const semis = Math.round(Math.abs(cents) / 100);
          if (st === 'ok') setCoach(useOct ? '¡Ahí! Es la misma nota en otra octava: vale igual. Sostenla…' : '¡Ahí está! Sostenla pareja…', 'feliz');
          else if (st === 'lejosAbajo') setCoach(`Estás bastante más grave (unos ${semis} semitonos). <b>Sube despacio</b>, como una sirena, sin cortar el sonido.`, 'atento');
          else if (st === 'lejosArriba') setCoach(`Estás bastante más agudo (unos ${semis} semitonos). <b>Baja despacio</b>, como cuando suspiras.`, 'atento');
          else if (st === 'abajo') setCoach('Muy cerca: <b>sube un pelito</b>. Piensa la nota "más arriba", como si la miraras desde arriba.', 'atento');
          else setCoach('Muy cerca: <b>baja un pelito</b>. Afloja el cuello y canta más suave.', 'atento');
        }
        if (inT) { held += dt; cs.push(cents); } else held = Math.max(0, held - dt * 0.6);
        holdBar.firstChild.style.width = Math.min(100, (held / 0.8) * 100) + '%';
        if (held >= 0.8) { octave = useOct; break; }
        if (hint >= 1 && now - lastReplay > 6) { play(m, 0.9); lastReplay = now; }
        if (now - t0 > maxT) break;
        await raf();
      }
      if (awayT > 1.5) wrongDir++;
      const ok = held >= 0.8;
      const approach = pre.length >= 3 ? pre[pre.length - 1] - pre[0] : 0; // + = llegaste subiendo (deslizando desde abajo)
      return { ok, t: tStart != null ? c.currentTime - tStart : null, octave, first, approach, sd: cs.length > 4 ? Math.sqrt(mean(cs.map((x) => (x - mean(cs)) ** 2))) : null };
    };

    // 0) intento directo
    hintPill.textContent = '';
    let r = await seek(target, 9);
    let level = 0; let tTotal = r.t;
    // 1) guía con sirena
    if (!r.ok && !skipped && !sig.aborted) {
      level = 1; hintPill.textContent = 'Ayuda 1';
      const dir = r.first == null ? null : r.first < 0 ? 'subir' : 'bajar';
      r = await seek(target, 11, { hint: 1, msg: `Te ayudo. ${dir ? `Empezaste ${r.first < 0 ? 'más grave' : 'más agudo'}: vas a tener que <b>${dir}</b>. ` : ''}Escucha otra vez, y canta "uuu" deslizando despacio. Te repito la nota cada tanto.` });
      tTotal = (tTotal || 0) + (r.t || 0);
    }
    askHelp = false;
    // 2) al revés: desde tu nota hasta la nota
    if (!r.ok && !skipped && !sig.aborted) {
      level = 2; hintPill.textContent = 'Ayuda 2';
      setCoach('Hagámoslo al revés. <b>Canta tú una nota cómoda</b>, la que te salga, con "uuu", y sostenla. Yo la tomo como punto de partida.', 'piensa');
      let mine = null; const fr = []; const t0 = c.currentTime; resetSmoother();
      while (!sig.aborted && !skipped && c.currentTime - t0 < 12) {
        const p = readPitch(); tu.update(p.midi, null);
        if (p.midi != null) { fr.push(p.midi); if (fr.length > 40) { const last = fr.slice(-40); const m0 = med(last); if (Math.max(...last) - Math.min(...last) < 1.2) { mine = Math.round(m0); break; } } }
        await raf();
      }
      if (mine != null) {
        const dist = target - mine;
        if (Math.abs(dist) > 7) { target = mine + Math.sign(dist) * 4; setCoach(`Tu nota fue ${noteName(mine)}. La nota pedida estaba lejos de tu voz de hoy, así que vamos a una más cercana: ${noteName(target)}.`, 'piensa'); await sleep(2200); }
        setCoach(`Tu nota es <b>${noteName(mine)}</b>. Escúchala y cántala de nuevo: esta la tienes segura.`, 'feliz'); await sleep(1200);
        let cur = mine; let okSteps = 0;
        const r0 = await seek(cur, 8, { hint: 2, msg: `Esta es <b>tu</b> nota (${noteName(cur)}). Cántala igual.` });
        if (r0.ok) { sfx('ok'); okSteps++; }
        while (cur !== target && !skipped && !sig.aborted) {
          cur += Math.sign(target - cur);
          const rs = await seek(cur, 10, { hint: 2, msg: `Ahora <b>${Math.sign(target - mine) > 0 ? 'un escalón más arriba' : 'un escalón más abajo'}</b>: ${noteName(cur)}. Muévete poquito desde la anterior.` });
          if (rs.ok) { sfx('ok'); okSteps++; } else break;
        }
        r = { ...r, ok: cur === target && okSteps > 0 };
      } else setCoach('No logré oír una nota sostenida. Pasemos a la siguiente y después volvemos.', 'piensa');
    }
    if (skipped) r.ok = false;
    stats.push({ target, ok: r.ok, level, t: tTotal, first: r.first, approach: r.approach, octave: r.octave, sd: r.sd, zone: target <= hn - 2 ? 'grave' : target >= hn + 3 ? 'aguda' : 'media' });
    if (r.ok) { sfx('ok'); setCoach(level === 0 ? `¡La encontraste${tTotal != null ? ` en ${tTotal.toFixed(1)} s` : ''}! 🎯` : level === 1 ? '¡La encontraste deslizando! Así se aprende.' : '¡Llegaste paso a paso! Eso es exactamente cómo se entrena el oído.', 'celebra'); await sleep(1300); }
    else if (!sig.aborted) { setCoach('Esta se resistió. No pasa nada: volverá en otro momento.', 'piensa'); await sleep(1100); }
  }
  if (sig.aborted) return { score: 0 };

  // ---- conclusiones del profe ----
  const found = stats.filter((s) => s.ok).length; const direct = stats.filter((s) => s.ok && s.level === 0);
  const ts = direct.map((s) => s.t).filter((x) => x != null); const avgT = ts.length ? mean(ts) : null;
  const firsts = stats.map((s) => s.first).filter((x) => x != null && Math.abs(x) < 900);
  const bias = firsts.length >= 3 ? mean(firsts) : null;
  const slides = stats.filter((s) => s.approach > 80).length;
  const octs = stats.filter((s) => s.octave).length;
  const zones = ['grave', 'media', 'aguda'].map((z) => { const a = stats.filter((s) => s.zone === z); return { z, n: a.length, ok: a.filter((s) => s.ok && s.level === 0).length }; }).filter((x) => x.n);
  const find = [];
  if (bias != null && bias < -120) find.push({ k: 'parteAbajo', t: `Al empezar sueles partir <b>más grave</b> que la nota (≈${Math.round(-bias / 100 * 10) / 10} semitonos).`, tip: 'Antes de cantar, tararea la nota por dentro y "apunta arriba": empieza con la idea de una nota más aguda de lo que crees.' });
  if (bias != null && bias > 120) find.push({ k: 'parteArriba', t: `Al empezar sueles partir <b>más agudo</b> que la nota.`, tip: 'Empieza más suave y relajado: la nota está más abajo de lo que crees.' });
  if (slides >= Math.max(2, stats.length / 2)) find.push({ k: 'desliza', t: 'Llegas a la nota <b>deslizando desde abajo</b>.', tip: 'Para buscarla está perfecto. El siguiente paso: imaginar la nota antes y "aterrizar" directo en ella.' });
  if (octs >= 2) find.push({ k: 'octava', t: 'Varias veces cantaste la nota <b>en otra octava</b> (la misma nota, más grave o más aguda).', tip: 'Es normal, sobre todo en voces masculinas con notas de piano. Vale igual: tu oído la reconoce.' });
  const weak = zones.filter((z) => z.n >= 1 && z.ok / z.n < 0.5).map((z) => z.z);
  const strong = zones.filter((z) => z.n >= 1 && z.ok / z.n >= 0.75).map((z) => z.z);
  if (weak.length && strong.length) find.push({ k: 'zona', t: `Encuentras mejor las notas de tu zona <b>${strong.join(' y ')}</b>; te cuestan más las de la zona <b>${weak.join(' y ')}</b>.`, tip: 'Entrena primero donde te va bien y ve abriendo hacia la otra zona de a un semitono.' });
  if (wrongDir >= 2) find.push({ k: 'direccion', t: 'Algunas veces, al guiarte, te moviste <b>en la dirección contraria</b>.', tip: 'Puede ser que todavía confundas "más agudo" con "más grave". Lo entrenamos con el juego "¿Arriba o abajo?" de Oído.' });
  const stab = stats.map((s) => s.sd).filter((x) => x != null); if (stab.length >= 2 && mean(stab) > 18) find.push({ k: 'tiembla', t: 'Cuando la encuentras, la nota <b>tiembla</b> un poco.', tip: 'Es el aire: haz el siseo "sss" parejo y canta con ese mismo soplo constante.' });
  const record = { at: Date.now(), n: stats.length, found, direct: direct.length, avgT, bias, find: find.map((f) => f.k) };
  const s = load(); s.findNote = [...(s.findNote || []), record].slice(-30); save();
  const better = prev && prev.avgT != null && avgT != null && avgT < prev.avgT - 0.4;

  await new Promise((res) => root.replaceChildren(h('div', { class: 'ex' },
    say(`<b>Encontraste ${found} de ${stats.length} notas</b>` + (direct.length ? `, ${direct.length} sin ayuda` : '') + (avgT != null ? ` (en ${avgT.toFixed(1)} s en promedio)` : '') + '.' + (better ? ` ¡Más rápido que la vez pasada (${prev.avgT.toFixed(1)} s)!` : ''), found >= stats.length * 0.7 ? 'celebra' : 'feliz'),
    find.length ? h('div', { class: 'card fn-find' }, h('h3', {}, 'Lo que noté en ti'), ...find.map((f) => h('div', { class: 'fn-item' }, h('p', { html: '🔎 ' + f.t }), h('p', { class: 'small', html: '👉 ' + f.tip })))) : h('p', { class: 'small muted' }, 'No noté errores repetidos: ¡vas bien!'),
    h('div', { class: 'grow' }), h('div', { class: 'actionbar' }, h('button', { class: 'btn primary big', onclick: () => res() }, 'Seguir')))));
  return { score: found / Math.max(1, stats.length), detail: `Encontraste ${found} de ${stats.length} notas` + (avgT != null ? `, en ${avgT.toFixed(1)} s promedio sin ayuda.` : '.'),
    issues: find.map((f) => ({ key: f.k, text: f.t, tip: f.tip })), taller: { ...record, zonas: zones, notas: stats.map((x) => ({ nota: noteName(x.target), ok: x.ok, ayuda: x.level, seg: x.t != null ? +x.t.toFixed(1) : null, partio: x.first != null ? Math.round(x.first) + ' cents' : null })) } };
}
