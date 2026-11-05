# Syng · Aprende a cantar desde cero

App web instalable (PWA) estilo Duolingo para aprender a cantar afinado y a tiempo, con un profe que te acompaña: **el Chincol** (dibujos en `img/`, una pose por momento: feliz, hola, atento/canta, piensa, celebra).

- **Camino de 105 lecciones en 18 unidades** (parte con "Encontrar tu voz": diagnóstico, nota de casa, identidad vocal, voz sin timidez, eco de tu propia voz) (cada lección con 3 niveles: con ayuda, sin ayuda y maestría; incluye la unidad "Calzar la nota" de memoria auditiva), cada una con prueba de repaso: tu voz, primeras melodías, sacar la voz, ritmo (puntillo, tresillo, síncopa), vocales y dicción, escalas y saltos, afinación fina, dinámica (messa di voce), registros (pecho, cabeza, mixta), canciones de dominio público, lectura a primera vista, agilidad, dos voces (armonía, canon, coros), menor y cromático, estilo y resistencia (vibrato), maestría. Orden basado en la pedagogía vocal clásica y en los programas ABRSM y Rockschool.
- **Ejercicios que miden de verdad**: igualar nota (cents), secuencias con eco/juntos/lectura, notas largas (afinación + aire + vibrato), dinámica (forma del volumen en dB y que la nota no se mueva al crecer), armonía/canon (exige audífonos), oído (sube/baja, intervalos, desafinación fina, mayor/menor) y ritmo.
- **Profe adaptativo** (`js/adapt.js`): guarda cada nota que cantas, detecta patrones con muestra suficiente (sesgo bajo/alto, agudos o graves, saltos achicados, entradas tarde, cansancio, timidez) y manías por nota (entrar desde abajo, dejar caer el final, cortar notas, quedarse sin aire, nota que tiembla). Explica qué significa cada uno y adapta la app: tono, zona verde, velocidad, calentamiento, ejercicio de refuerzo y avisos en vivo.
- **El profe en tus canciones** (`js/songcoach.js`): informe por frase (finales, entradas, nota alta, palabra exacta), 'Original vs tú', 'Corregir' con ejercicio hecho con tu misma frase y comparación antes/después.
- **Tono a tu medida** (`js/shift.js`): cambia el tono de la canción sin cambiar la velocidad (WSOLA) y recomienda el mejor según tu rango.
- **Vuelo del Chincol** (`js/game.js`): juego de afinación controlado por la voz, 7 niveles. Calentamiento distinto cada día, 'Cantar ya' y tus grabaciones guardadas.
- **El Chincol habla**: instrucciones, técnica y correcciones con voz neuronal pregrabada (Kokoro, acento latinoamericano). Nunca habla mientras se mide tu voz.
- **Diagnóstico tipo profe**: detecta si tiendes a quedar bajo/alto, entras desde abajo, la nota tiembla, se cae al final, los saltos quedan cortos, entras tarde/temprano o cantas en otra octava, y te da el consejo concreto. Si fallas dos veces, propone una versión más fácil.
- **Afinación fina en cents**, afinador vertical, nota larga con barra de aire, bordón con afinación pura, oído, ritmo.
- **Tus canciones (Suno)**: sube versión con voz + instrumental + letra. La app aísla la voz (resta de fase), detecta la melodía y te la enseña en 4 pasos: escuchar → línea por línea → con voz guía (0–200 %) → tú solo. Karaoke tipo escenario, grabarte, modo fiesta.
- Sonidos, confeti, rachas, XP y meta diaria. Funciona sin internet una vez instalada.

Todo corre en el navegador: nada se sube a un servidor.

## Regenerar la voz del Chincol
El guion está en `js/lines.js`. Para regrabar lo que cambió:
```
pip install kokoro-onnx soundfile   # + ffmpeg
python3 tools/gen_voice.py kokoro-q8.onnx voices-es.bin em_alex
```
(Modelo: npm `kokoro-q8-shards`; voces: npm `kokoro-js/voices`.)

Base pedagógica: Pfordresher & Brown 2007; Hutchins & Peretz 2012; Berglin, Pfordresher & Demorest 2022; Pfordresher & Greenspon 2024; Titze 2006 (SOVT); aprendizaje motor (Maas 2008, NATS); métodos de Seth Riggs, Cathrine Sadolin (CVT), Jo Estill y Cheryl Porter.
