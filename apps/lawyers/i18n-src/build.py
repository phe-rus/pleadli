"""Builds apps/lawyers/messages/{en,sw,fr}.json from this app's own strings
(i18n-src/l*.py, in name order). Lawyers reads no other app's catalogue."""
import json, os, glob, importlib.util
HERE = os.path.dirname(__file__)
APP = os.path.dirname(HERE)
LANGS = ['en', 'sw', 'fr']

def get(o, k):
    for p in k.split('.'):
        o = o[p]
    return o

def put(o, k, v):
    parts = k.split('.')
    for p in parts[:-1]:
        o = o.setdefault(p, {})
    o[parts[-1]] = v

out = {l: {'$schema': 'https://inlang.com/schema/inlang-message-format'} for l in LANGS}
for path in sorted(glob.glob(os.path.join(HERE, 'l*.py'))):
    spec = importlib.util.spec_from_file_location('part', path)
    part = importlib.util.module_from_spec(spec); spec.loader.exec_module(part)
    for k, texts in part.S.items():
        if not texts[0]:
            continue
        for l, text in zip(LANGS, texts):
            assert '—' not in text, f'em-dash in {k} ({l})'
            put(out[l], k, text)
for l in LANGS:
    with open(os.path.join(APP, 'messages', f'{l}.json'), 'w') as f:
        json.dump(out[l], f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
def count(o):
    return sum(count(v) if isinstance(v, dict) else 1 for k, v in o.items() if k != '$schema')
print('keys per language:', count(out['en']))
