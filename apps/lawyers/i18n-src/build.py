"""Builds apps/lawyers/messages/{en,sw,de,fr}.json: shared wording reused from
DPP's catalogue where the key means the same, then this app's own strings."""
import json, os, glob, importlib.util
HERE = os.path.dirname(__file__)
APP = os.path.dirname(HERE)
LANGS = ['en', 'sw', 'de', 'fr']
REUSE = ['common.cancel', 'common.try_again', 'protection.basic', 'protection.basic_about', 'protection.change', 'protection.change_hint',
         'protection.changed', 'protection.full', 'protection.full_next_sign_in', 'protection.idle', 'protection.idle_description', 'protection.none',
         'protection.none_about', 'protection.others_need_new', 'protection.title', 'protection.your_new_password', 'protection.your_new_pin',
         'settings.admin_only', 'settings.owner.you', 'settings.save', 'settings.save_failed', 'settings.saved', 'settings.title', 'settings.you.change',
         'settings.you.identity', 'settings.you.password', 'settings.you.password_description', 'settings.you.pin', 'settings.you.pin_description',
         'staff.active', 'staff.add', 'staff.add_full_hint', 'staff.add_hint', 'staff.added', 'staff.edit', 'staff.first_password', 'staff.first_pin',
         'staff.inactive', 'staff.name', 'staff.new_password', 'staff.new_pin', 'staff.no_secret', 'staff.password_placeholder', 'staff.phone_pending',
         'staff.phone_reset', 'staff.phone_reset_done', 'staff.pin_placeholder', 'staff.role_label', 'staff.set', 'assist.settings.title', 'assist.settings.ready', 'assist.settings.needs', 'assist.settings.off', 'assist.settings.turned_on', 'assist.settings.turned_off', 'assist.settings.where_body', 'assist.settings.confirm', 'assist.settings.confirmed', 'assist.settings.not_confirmed', 'assist.settings.confirmed_by', 'assist.settings.key', 'assist.settings.key_placeholder', 'assist.settings.key_set', 'assist.settings.key_env', 'assist.settings.key_missing', 'assist.settings.key_removed', 'assist.settings.remove_key', 'assist.settings.provider_title', 'assist.settings.provider_body', 'assist.settings.provider_changed', 'assist.settings.base_url', 'assist.settings.key_where', 'assist.settings.model_title', 'assist.settings.model_body', 'assist.settings.auto_model', 'assist.settings.show_models', 'assist.settings.loading_models', 'assist.settings.model_fixed', 'assist.settings.auto_first', 'assist.settings.auto_backup', 'assist.settings.in_use', 'assist.provider.gemini', 'assist.provider.openrouter', 'assist.provider.anthropic', 'assist.provider.other_label', 'assist.provider.other']
dpp = {l: json.load(open(os.path.join(APP, '..', 'dpp', 'messages', f'{l}.json'))) for l in LANGS}

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
for k in REUSE:
    for l in LANGS:
        put(out[l], k, get(dpp[l], k))
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
