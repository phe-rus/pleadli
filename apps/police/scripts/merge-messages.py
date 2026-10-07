"""Deep-merge additions into apps/police/messages/<locale>.json.
usage: python3 scripts/merge-messages.py additions.json   ({"en": {...nested...}, "sw": {...}})"""
import json, sys
ROOT = '/home/laniina/pherus/pleadli/apps/police/messages/'
add = json.load(open(sys.argv[1]))
def merge(a, b):
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(a.get(k), dict): merge(a[k], v)
        else: a[k] = v
for loc, tree in add.items():
    p = ROOT + loc + '.json'
    try: d = json.load(open(p))
    except FileNotFoundError: d = {"$schema": "https://inlang.com/schema/inlang-message-format"}
    merge(d, tree)
    open(p, 'w').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print(loc, 'ok')
