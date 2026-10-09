# Convert Misskey locales/ja-JP.yml + en-US.yml into one CSV (id, ja, en, context=ja.yml:line)
import sys, csv, yaml
ja_path, en_path, out = sys.argv[1:4]

def flatten_with_lines(path):
    with open(path, encoding='utf-8') as f:
        node = yaml.compose(f)
    out = {}
    def walk(n, prefix):
        if isinstance(n, yaml.MappingNode):
            for k, v in n.value:
                walk(v, f"{prefix}.{k.value}" if prefix else k.value)
        elif isinstance(n, yaml.ScalarNode):
            out[prefix] = (n.value, n.start_mark.line + 1)
    walk(node, '')
    return out

ja = flatten_with_lines(ja_path); en = flatten_with_lines(en_path)
with open(out, 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f)
    w.writerow(['id', 'ja', 'en', 'context'])
    n = 0
    for k, (v, line) in ja.items():
        if k == '_lang_': continue
        w.writerow([k, v, en.get(k, ('', 0))[0], f'ja-JP.yml:{line}'])
        n += 1
print(n, 'rows;', sum(1 for k in ja if k not in en), 'missing in en', file=sys.stderr)
