import { describe, expect, it } from 'vitest';
import { CATALOGS, LANGUAGES, bytes, format, lower, number, resolveLanguage, setLanguage, t, upper } from '../src/i18n';
import en from '../src/i18n/locales/en.json';

/** The values a message uses, by name (inside plural and select options too). */
function argumentsOf(text: string): string[] {
  const out = new Set<string>();
  const walk = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "'" && (s[i + 1] === '{' || s[i + 1] === '}') && s[i + 2] === "'") { i += 2; continue; }
      if (s[i] !== '{') continue;
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '{') depth++; else if (s[j] === '}' && --depth === 0) break; }
      const body = s.slice(i + 1, j), c1 = body.indexOf(',');
      out.add((c1 < 0 ? body : body.slice(0, c1)).trim());
      if (c1 >= 0) {
        // The options of a plural or select: each one's own text is a message.
        const rest = body.slice(body.indexOf(',', c1 + 1) + 1);
        for (let k = 0; k < rest.length; k++) {
          if (rest[k] !== '{') continue;
          let d = 0, m = k; for (; m < rest.length; m++) { if (rest[m] === '{') d++; else if (rest[m] === '}' && --d === 0) break; }
          walk(rest.slice(k + 1, m)); k = m;
        }
      }
      i = j;
    }
  };
  walk(text);
  return [...out].sort();
}
/** Values a translation may use instead of one another (a sentence-start word or the same word in lower case). */
const ALTERNATIVES: Record<string, string[][]> = { 'alarms.rings_at': [['day', 'dayLower']], 'alarms.reminds_at': [['day', 'dayLower']] };
/** What is wrong with a translation's values against the English message: one it does not have, or one it leaves out. */
function valueProblems(key: string, translation: string, source: string): string[] {
  const mine = argumentsOf(translation), theirs = argumentsOf(source), groups = ALTERNATIVES[key] ?? [];
  const extra = mine.filter(n => !theirs.includes(n) && !groups.some(g => g.includes(n) && g.some(x => theirs.includes(x)))).map(n => `extra {${n}}`);
  const missing = theirs.filter(n => !mine.includes(n) && !groups.some(g => g.includes(n) && g.some(x => mine.includes(x)))).map(n => `missing {${n}}`);
  return [...extra, ...missing];
}

describe('message catalogs', () => {
  const keys = Object.keys(en).sort();
  for (const { id } of LANGUAGES) {
    it(`${id} has every key, no other, each with the values of the English message`, () => {
      const catalog = CATALOGS[id] as Record<string, string>;
      expect(Object.keys(catalog).sort().filter(k => !keys.includes(k)), 'keys English does not have').toEqual([]);
      expect(keys.filter(k => typeof catalog[k] !== 'string' || !catalog[k].trim()), 'missing keys').toEqual([]);
      expect(keys.flatMap(k => valueProblems(k, catalog[k], (en as Record<string, string>)[k]).map(p => `${k}: ${p}`)), 'placeholders').toEqual([]);
    });
  }
  it('a plural message has an "other" form in every language', () => {
    for (const { id } of LANGUAGES) for (const [k, v] of Object.entries(CATALOGS[id] as Record<string, string>)) if (/,\s*plural\s*,/.test(v)) expect(/other\s*\{/.test(v), `${id} ${k}`).toBe(true);
  });
  it('catches a missing or an extra value', () => {
    expect(valueProblems('x', '{n} dosya', '{n, plural, one {# file} other {# files}}')).toEqual([]);
    expect(valueProblems('x', 'dosya', '{n} files')).toEqual(['missing {n}']);
    expect(valueProblems('x', '{n} {m}', '{n}')).toEqual(['extra {m}']);
    expect(valueProblems('alarms.rings_at', '{day} {time} {in}', '{dayLower} at {time} {in}')).toEqual([]);
  });
});
describe('formatting', () => {
  it('follows each language\'s plural rules', () => {
    const msg = '{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}';
    setLanguage('ru');
    expect([1, 3, 5, 21, 1.5].map(n => format(msg, { n }))).toEqual(['1 файл', '3 файла', '5 файлов', '21 файл', '1,5 файла']);
    setLanguage('en');
    expect(format('{n, plural, =0 {none} one {# file} other {# files}}', { n: 0 })).toBe('none');
    expect(format('{n, plural, one {# file} other {# files}}', { n: 1 })).toBe('1 file');
    expect(format("{s, select, claude {Claude'da} other {Codex'te}} '{'x'}'", { s: 'codex' })).toBe("Codex'te {x}");
  });
  it('writes numbers, sizes and times the locale\'s way', () => {
    setLanguage('tr'); expect(number(2.5)).toBe('2,5'); expect(bytes(2.3 * 1024 * 1024)).toMatch(/^2,3\sMB$/);
    setLanguage('en'); expect(number(2.5)).toBe('2.5'); expect(bytes(2.3 * 1024 * 1024)).toMatch(/^2\.3\sMB$/);
    setLanguage('de'); expect(number(1234.5)).toBe('1.234,5');
  });
  it('cases Turkish dotted and dotless i by Turkish rules only in Turkish', () => {
    setLanguage('tr'); expect(upper('istanbul ılık')).toBe('İSTANBUL ILIK'); expect(lower('IŞIK İZİ')).toBe('ışık izi');
    setLanguage('en'); expect(upper('istanbul')).toBe('ISTANBUL');
  });
  it('falls back to English for a key a catalog lacks', () => {
    setLanguage('ja');
    (CATALOGS.ja as Record<string, string>)['island.working_test_only'] = '';
    expect(t('island.working_test_only' as keyof typeof en)).toBe('island.working_test_only');
    delete (CATALOGS.ja as Record<string, string>)['island.working_test_only'];
    const first = Object.keys(en)[0] as keyof typeof en, saved = CATALOGS.ja[first];
    delete CATALOGS.ja[first]; expect(t(first)).toBe(format((en as Record<string, string>)[first], {})); CATALOGS.ja[first] = saved;
  });
});

describe('the system language', () => {
  it('is used when it is one of the app\'s, else English', () => {
    expect(resolveLanguage('system', ['tr-TR', 'en-US'])).toBe('tr');
    expect(resolveLanguage('system', ['pt-PT'])).toBe('pt-BR');
    expect(resolveLanguage('system', ['zh-TW'])).toBe('zh-Hans');
    expect(resolveLanguage('system', ['fi-FI', 'de-AT'])).toBe('de');
    expect(resolveLanguage('system', ['fi-FI'])).toBe('en');
    expect(resolveLanguage('es', ['tr-TR'])).toBe('es');
    expect(resolveLanguage('xx', ['ko-KR'])).toBe('ko');
  });
});
