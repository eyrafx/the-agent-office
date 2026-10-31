"""Self-hosted subsets of the kawaii fonts (all SIL OFL 1.1, from github.com/google/fonts/ofl).

    python kawaii-fonts.py <folder with the original .ttf files>

Each family is split into a Latin + Cyrillic file and, where the family has them, a CJK file
holding only the characters the site's own copy uses (all 11 languages, FAQ and legal pages
included). The CSS loads the CJK file through unicode-range, so it is only fetched for a
Japanese, Korean or Chinese page. Re-run after adding copy in a CJK language.
"""
import pathlib, re, sys
from fontTools import subset

src = pathlib.Path(sys.argv[1])
site = pathlib.Path(__file__).parent
out = site / 'dist' / 'fonts' / 'kawaii'
out.mkdir(parents=True, exist_ok=True)

text = ''.join(p.read_text('utf8') for p in [*site.glob('dist/*.js'), *site.glob('dist/*.html'), *site.glob('*-copy.mjs')])
text += 'キラキラドキドキピコン！オクトおわりワクワクぴかぴか☆♡'
cjk = sorted({c for c in text if ord(c) >= 0x2E80 and not 0xFE00 <= ord(c) <= 0xFE0F})
LATIN = 'U+0000-024F,U+0259,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-036F,U+0400-04FF,U+1E00-1EFF,U+2000-206F,U+20AC,U+2116,U+2122,U+2190-2199,U+2605-2606,U+2661,U+2665'
FAMILIES = {
    # file stem: (source ttf, latin file?, cjk file?)
    'dela': ('DelaGothicOne-Regular.ttf', True, True),
    'mplus-500': ('MPLUSRounded1c-Medium.ttf', True, True),
    'mplus-800': ('MPLUSRounded1c-ExtraBold.ttf', True, True),
    'dohyeon': ('DoHyeon-Regular.ttf', False, True),
    'kuaile': ('ZCOOLKuaiLe-Regular.ttf', False, True),
    'gowun': ('GowunDodum-Regular.ttf', False, True),
}

def run(ttf, dest, unicodes=None, chars=None):
    opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
    font = subset.load_font(str(ttf), opts)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(unicodes) if unicodes else [], text=chars or '')
    sub.subset(font)
    subset.save_font(font, str(dest), opts)
    return dest.stat().st_size

for stem, (ttf, latin, has_cjk) in FAMILIES.items():
    path = next(src.rglob(ttf))
    if latin: print(stem, 'latin', run(path, out / f'{stem}-latin.woff2', unicodes=LATIN))
    if has_cjk: print(stem, 'cjk', run(path, out / f'{stem}-cjk.woff2', chars=''.join(cjk) + '、。・ー〜「」（）！？'))
