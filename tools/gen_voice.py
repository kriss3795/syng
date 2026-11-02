"""Pregraba el guion del Chincol (js/lines.js + intros de js/curriculum.js) con la voz neuronal Kokoro.
Uso: python3 tools/gen_voice.py <ruta_modelo.onnx> <ruta_voces.bin> [voz]
Solo regenera las líneas cuyo texto cambió (manifest con hash)."""
import json, subprocess, sys, hashlib, os, re, tempfile
from kokoro_onnx import Kokoro
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
model, voices = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else 'em_alex'
js = "import('%s/js/lines.js').then(m=>console.log(JSON.stringify({...m.LINES,...m.INTROS})))" % ROOT
lines = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js]))
out = os.path.join(ROOT, 'audio'); os.makedirs(out, exist_ok=True)
mf = os.path.join(out, 'manifest.json')
manifest = json.load(open(mf)) if os.path.exists(mf) else {}
k = Kokoro(model, voices)

def clean(t):
    t = re.sub(r'<[^>]+>', '', t)
    return t.replace('"', '').replace('“', '').replace('”', '')

todo = [(i, t) for i, t in lines.items() if manifest.get(i) != hashlib.md5((voice + t).encode()).hexdigest()[:10]]
print(f'{len(todo)} líneas por grabar de {len(lines)}', flush=True)
for n, (i, t) in enumerate(todo):
    a, sr = k.create(clean(t), voice=voice, speed=1.0, lang='es-419')
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        sf.write(tmp.name, a, sr)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp.name, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5',
                        '-ac', '1', '-ar', '24000', '-b:a', '48k', os.path.join(out, i + '.mp3')], check=True)
    manifest[i] = hashlib.md5((voice + t).encode()).hexdigest()[:10]
    json.dump(manifest, open(mf, 'w'), indent=0)
    print(f'[{n+1}/{len(todo)}] {i}', flush=True)
# borrar audios que ya no están en el guion
for f in os.listdir(out):
    if f.endswith('.mp3') and f[:-4] not in lines:
        os.remove(os.path.join(out, f)); manifest.pop(f[:-4], None)
json.dump(manifest, open(mf, 'w'), indent=0)
print('listo', flush=True)
