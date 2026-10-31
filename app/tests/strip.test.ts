import { describe, expect, it } from 'vitest';
import { setLanguage, t } from '../src/i18n';
import { batteryRing, cityForms, deviceForms, nextRing, stripItems, weatherKind } from '../src/notch/strip';
import type { IslandStatus, Reminder } from '../src/shared/contract';

const all = { statusBattery: true, statusAudio: true, statusWeather: true, statusAlarm: true, hideMascot: false };
const now = new Date(2026, 9, 28, 18, 0).getTime();
const status: IslandStatus = { battery: { percent: 76, charging: true }, audio: { kind: 'headphones', name: 'AirPods Pro (Stereo)', bluetooth: true }, weather: { temperature: 17.4, code: 61, place: 'İstanbul', at: now - 60_000 } };

describe('the status strip', () => {
  it('pictures the weather by its WMO code', () => {
    expect([0, 1, 2, 3, 45, 48, 51, 63, 80, 71, 86, 95, 99].map(weatherKind)).toEqual(['sun', 'sun', 'cloud', 'cloud', 'fog', 'fog', 'rain', 'rain', 'rain', 'snow', 'snow', 'storm', 'storm']);
  });
  it('shows what is on and known, worded and formatted in the language', () => {
    setLanguage('tr');
    const ring = now + 2 * 3600_000;
    const items = stripItems(status, all, ring, t, now);
    expect(items.map(i => i.id)).toEqual(['battery', 'weather', 'audio', 'alarm']);
    expect(items.map(i => i.label)).toEqual(['Şarj oluyor · %76', 'İstanbul: 17°C', 'Kulaklık: AirPods', `Sıradaki alarm ${new Intl.DateTimeFormat('tr-TR', { hour: 'numeric', minute: '2-digit' }).format(ring)}`]);
    setLanguage('en');
    expect(stripItems(status, all, null, t, now).map(i => i.label)).toEqual(['Charging · 76%', '17°C in İstanbul', 'Headphones: AirPods']);
  });
  it('leaves out what is off, unknown, stale or not worth saying', () => {
    setLanguage('en');
    expect(stripItems(status, { ...all, hideMascot: true }, null, t, now).map(i => i.id)).toEqual(['weather', 'audio']);
    expect(stripItems({ ...status, weather: { ...status.weather!, at: now - 4 * 3600_000 } }, all, null, t, now).map(i => i.id)).toEqual(['battery', 'audio']);
    expect(stripItems({ ...status, audio: { kind: 'speakers', name: 'Realtek', bluetooth: false } }, all, null, t, now).map(i => i.id)).toEqual(['battery', 'weather']);
    expect(stripItems({}, all, null, t, now)).toEqual([]);
    expect(stripItems(status, { ...all, statusBattery: false, statusAudio: false, statusWeather: false }, null, t, now)).toEqual([]);
  });
  it('names the next alarm or reminder only within half a day', () => {
    const r = (due: number, enabled = true, kind: Reminder['kind'] = 'alarm') => ({ id: String(due), title: '', at: '', repeat: 'once', enabled, due, kind }) as unknown as Reminder;
    expect(nextRing([r(now + 3600_000), r(now + 600_000)], now)).toBe(now + 600_000);
    expect(nextRing([r(now + 13 * 3600_000)], now)).toBeNull();
    expect(nextRing([r(now + 600_000, false)], now)).toBeNull();
    expect(nextRing([r(now - 60_000)], now)).toBeNull();
  });
  it('shows the weather with its city, shorter forms coming last, the temperature in every one', () => {
    setLanguage('tr');
    const w = stripItems(status, all, null, t, now).find(i => i.id === 'weather')!;
    expect(w.forms[0]).toContain('<span class="cap-place">İstanbul</span><span class="cap-temp">17°C</span>');
    expect(w.forms.map(f => f.match(/cap-place">([^<]*)/)?.[1] ?? null)).toEqual(['İstanbul', 'İstanb.', 'İstan.', 'İsta.', 'İst.', null]);
    expect(w.forms.every(f => f.includes('17°C') && !f.includes('…'))).toBe(true);
    expect(stripItems({ ...status, weather: { ...status.weather!, place: '<b>x' } }, all, null, t, now).find(i => i.id === 'weather')!.forms[0]).toContain('&lt;b&gt;x');
    // No temperature, no weather (never the city alone).
    expect(stripItems({ ...status, weather: { ...status.weather!, temperature: Number.NaN } }, all, null, t, now).map(i => i.id)).not.toContain('weather');
  });
  it('cuts a city with one period, never "…", after its known short name; short names stay whole', () => {
    expect(cityForms('New York')).toEqual(['New York', 'NYC']);
    expect(cityForms('Frankfurt am Main')).toEqual(['Frankfurt am Main', 'Frankfurt', 'Frankf.', 'Frank.', 'Fran.', 'Fra.']);
    expect(cityForms('Rom')).toEqual(['Rom']); expect(cityForms('Bern')).toEqual(['Bern']);
    expect(cityForms('İzmir')).toEqual(['İzmir', 'İzmi.', 'İzm.']);
    expect(cityForms('東京都')).toEqual(['東京都']);
  });
  it('names headphones without generic words, then by their first word, then plainly; never a trailing space', () => {
    expect(deviceForms('AirPods Pro (Stereo)', 'Kulaklık')).toEqual(['AirPods', 'Kulaklık']);
    expect(deviceForms('AirPods Pro ', 'Kulaklık')).toEqual(['AirPods', 'Kulaklık']);
    expect(deviceForms('Sony WH-1000XM5 Hands-Free', 'Kopfhörer')).toEqual(['Sony WH-1000XM5', 'Sony', 'Kopfhörer']);
    expect(deviceForms('Headset (Realtek Audio)', 'Kulaklık')).toEqual(['Kulaklık']);
    expect(deviceForms('Galaxy Buds2 Pro', 'Kulaklık')).toEqual(['Galaxy Buds2', 'Galaxy', 'Kulaklık']);
    for (const f of deviceForms('Bose QC Earbuds  Wireless ', 'x')) expect(f).toBe(f.trim());
  });  it('draws the battery as a ring filled to its level: green charging, red when low, a bolt only while charging', () => {
    const ring = (p: number, c: boolean) => batteryRing(p, c);
    expect(ring(76, true)).toContain('bat-ring charging'); expect(ring(76, true)).toContain('data-glyph="bolt"');
    expect(ring(76, false)).toContain('bat-ring normal'); expect(ring(76, false)).toContain('data-glyph="cell"');
    expect(ring(15, false)).toContain('bat-ring low'); expect(ring(15, true)).toContain('bat-ring charging');
    expect(ring(76, false)).toContain('stroke-dashoffset="24"'); expect(ring(100, false)).toContain('stroke-dashoffset="0"'); expect(ring(-5, false)).toContain('stroke-dashoffset="100"');
  });
});