# Builds messages/{en,sw,fr}.json from the parts in this folder (w*.py),
# each a dict S of key -> (en, sw, fr). Nested keys (a.b.c) become nested
# JSON, read in code as m["a.b.c"](). No em-dashes, by house rule.
import glob, importlib.util, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
LANGS = ['en', 'sw', 'fr']

def put(o, k, v):
    # A key cannot be both a text and a group of texts: one would silently
    # replace the other, depending on which part is read last.
    parts = k.split('.')
    for p in parts[:-1]:
        o = o.setdefault(p, {})
        assert isinstance(o, dict), f'{k}: {p} is already a text'
    assert not isinstance(o.get(parts[-1]), dict), f'{k} is already a group'
    o[parts[-1]] = v

out = {l: {'$schema': 'https://inlang.com/schema/inlang-message-format'} for l in LANGS}
for path in sorted(glob.glob(os.path.join(HERE, 'w*.py'))):
    spec = importlib.util.spec_from_file_location('part', path)
    part = importlib.util.module_from_spec(spec); spec.loader.exec_module(part)
    for k, texts in part.S.items():
        assert len(texts) == 3, k
        for l, text in zip(LANGS, texts):
            assert '—' not in text, f'em-dash in {k} ({l})'
            put(out[l], k, text)
for l in LANGS:
    with open(os.path.join(APP, 'messages', f'{l}.json'), 'w') as f:
        json.dump(out[l], f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write('\n')
print('keys:', sum(1 for _ in json.dumps(out['en']).split('":')) - 1)
