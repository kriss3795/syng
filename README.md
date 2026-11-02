# Syng · Aprende a cantar desde cero

App web instalable (PWA) estilo Duolingo para aprender a cantar afinado y a tiempo, con un profe que te acompaña: **el Chincol**.

- **Camino de 33 lecciones en 10 unidades**: cantas desde la primera clase y la técnica (respiración, apoyo, aire parejo, ataque limpio, resonancia, volumen sin gritar, agudos) va integrada y aplicada al tiro.
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
