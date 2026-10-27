#!/usr/bin/env python3
"""worker/src/model-data.js + worker/src/index.js  ->  worker/dist/worker.js (tek dosya).

Cloudflare panosuna yapıştırma yolu için üretilir (Workers -> Edit code -> yapıştır -> Deploy).
`wrangler deploy` bu dosyaya ihtiyaç duymaz; doğrudan src/index.js'i kullanır.

Yapılanlar:
  * index.js'teki `import { ... } from './model-data.js';` satırı kaldırılır,
  * model-data.js'teki her `export const` -> `const`,
  * index.js'teki `export default` olduğu gibi kalır (Module Worker giriş noktası).
Kontroller (hata -> çıkış kodu 1):
  * import edilen her ad model-data.js'te export edilmiş olmalı,
  * iki dosyada aynı adlı üst düzey const/function/class olmamalı,
  * birleşik dosyada `export default` dışında import/export kalmamalı,
  * index.js'te model katsayısı görünümlü sayısal literal olmamalı (altyapı
    sayıları — HTTP kodları, hız sınırı, yuvarlama hassasiyeti — beyaz listede).
Ortam değişkeni (ALLOWED_ORIGINS, SITE_URL) yoksa index.js'teki gömülü
varsayılanlar çalışır; bundle bu davranışı değiştirmez.

Kullanım:  python3 tools/bundle_worker.py            (repo kökünden ya da herhangi bir yerden)
           python3 tools/bundle_worker.py --check    (dist/worker.js güncel mi? değilse çıkış 1)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # repo kökü
SRC = ROOT / 'worker' / 'src'
DIST = ROOT / 'worker' / 'dist' / 'worker.js'

# index.js'te kalmasına izin verilen sayısal literaller (altyapı; model katsayısı değil).
# 0/1 (sınırlar, başlangıç değerleri), 10/100/1000/10000/1e4/1e6 (yuvarlama hassasiyeti),
# 150 ve 10_000 (hız sınırı), HTTP durum kodları.
INFRA_NUMBERS = {'0', '1', '10', '100', '1000', '10000', '10_000', '1e4', '1e6',
                 '150', '204', '301', '403', '404', '429'}

IMPORT_RE = re.compile(
    r"^[ \t]*import\s*\{(?P<names>[^}]*)\}\s*from\s*['\"]\./model-data\.js['\"]\s*;?[ \t]*\n",
    re.M)
EXPORT_CONST_RE = re.compile(r"^export\s+const\b", re.M)
TOPLEVEL_DECL_RE = re.compile(r"^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)", re.M)
# JS kaynak parçaları: blok yorum | satır yorumu | string/template | sayı
_TOKEN_RE = re.compile(
    r"/\*.*?\*/"                                   # blok yorum
    r"|//[^\n]*"                                   # satır yorumu
    r"|'(?:\\.|[^'\\\n])*'"                        # tek tırnak
    r"|\"(?:\\.|[^\"\\\n])*\""                     # çift tırnak
    r"|`(?:\\.|[^`\\])*`"                          # template literal
    r"|(?<![\w$.])(?:\d+\.\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|\d+(?:_\d+)*(?:e[+-]?\d+)?)(?![\w$])",
    re.S)


def die(msg):
    print(f'bundle_worker.py: HATA: {msg}', file=sys.stderr)
    sys.exit(1)


def code_numbers(src):
    """Yorum ve string dışındaki sayısal literaller (metin olarak)."""
    out = []
    for m in _TOKEN_RE.finditer(src):
        t = m.group(0)
        if t[0] in '/\'"`':
            continue
        out.append(t)
    return out


def export_names(data_src):
    """`export const A = ...;` ifadelerindeki adlar (A = 1, B = 2 biçimi dâhil)."""
    names = []
    for m in re.finditer(r"^export\s+const\s+(?P<decl>.*?);[ \t]*(?://[^\n]*)?$", data_src, re.M | re.S):
        decl = m.group('decl')
        # ilk ad kesin; virgülle ayrılmış ek `AD =` kalıpları da alınır (arrow `=>` hariç)
        names += re.findall(r"(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=(?![=>])", decl)
    return names


def build():
    data = (SRC / 'model-data.js').read_text(encoding='utf-8')
    index = (SRC / 'index.js').read_text(encoding='utf-8')

    m = IMPORT_RE.search(index)
    if not m:
        die("index.js: `import { ... } from './model-data.js';` bulunamadı")
    if IMPORT_RE.search(index, m.end()):
        die('index.js: birden fazla model-data importu var')
    imported = [n.strip() for n in m.group('names').replace('\n', ' ').split(',') if n.strip()]
    index_body = index[:m.start()] + index[m.end():]

    exported = export_names(data)
    missing = [n for n in imported if n not in exported]
    if missing:
        die(f"index.js şu adları import ediyor ama model-data.js export etmiyor: {', '.join(missing)}")

    data_body = EXPORT_CONST_RE.sub('const', data)

    dup = sorted(set(TOPLEVEL_DECL_RE.findall(data_body)) & set(TOPLEVEL_DECL_RE.findall(index_body)))
    if dup:
        die(f"iki dosyada da tanımlı üst düzey adlar: {', '.join(dup)}")

    bad_nums = sorted({n for n in code_numbers(index_body) if n not in INFRA_NUMBERS}, key=lambda s: (len(s), s))
    if bad_nums:
        die('index.js içinde model katsayısı görünümlü sayısal literal(ler): '
            + ', '.join(bad_nums) + ' — bunları worker/src/model-data.js\'e taşıyın '
            '(altyapı sayısıysa INFRA_NUMBERS beyaz listesini güncelleyin)')

    header = (
        "// elektrifikasyon.org — SAF API worker'ı (statik dosya servis etmez)\n"
        "// ÜRETİLMİŞ DOSYA — elle düzenlemeyin. tools/bundle_worker.py,\n"
        "// worker/src/model-data.js + worker/src/index.js dosyalarını tek dosyada birleştirir;\n"
        "// kaynakları düzenleyip yeniden üretin.\n"
        "// Cloudflare panelinde: Workers → Create → Hello World şablonu → Edit code →\n"
        "// bu dosyanın TAMAMINI yapıştırın → Deploy. Ortam değişkenleri (ALLOWED_ORIGINS,\n"
        "// SITE_URL) panelde ayarlanmamışsa gömülü varsayılanlar kullanılır.\n"
        "// API dışı istekler siteye (GitHub Pages) yönlendirilir.\n"
        "\n"
        "// ======================= worker/src/model-data.js =======================\n"
    )
    sep = "\n// ========================= worker/src/index.js ==========================\n"
    out = header + data_body.rstrip('\n') + '\n' + sep + index_body.lstrip('\n')
    if not out.endswith('\n'):
        out += '\n'

    # birleşik dosyada export default dışında import/export kalmamalı
    stray = [ln for ln in out.splitlines()
             if re.match(r"^\s*(import\b|export\s+(?!default\b))", ln)]
    if stray:
        die('birleşik dosyada beklenmeyen import/export satırı: ' + ' | '.join(stray))
    if len(re.findall(r"^export default\b", out, re.M)) != 1:
        die('birleşik dosyada tam olarak bir `export default` olmalı')
    return out


def main(argv):
    out = build()
    if '--check' in argv:
        cur = DIST.read_text(encoding='utf-8') if DIST.exists() else None
        if cur != out:
            print(f'bundle_worker.py: {DIST.relative_to(ROOT)} GÜNCEL DEĞİL — python3 tools/bundle_worker.py çalıştırın',
                  file=sys.stderr)
            sys.exit(1)
        print(f'bundle_worker.py: {DIST.relative_to(ROOT)} güncel ({len(out.splitlines())} satır)')
        return
    DIST.parent.mkdir(parents=True, exist_ok=True)
    DIST.write_text(out, encoding='utf-8')
    print(f'bundle_worker.py: yazıldı {DIST.relative_to(ROOT)} ({len(out.splitlines())} satır, {len(out.encode("utf-8"))} bayt)')


if __name__ == '__main__':
    main(sys.argv[1:])
