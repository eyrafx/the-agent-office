import { describe, expect, it } from 'vitest';
import factory from './fixtures/factory-settings.json';
import { DEFAULT_SETTINGS, defaultsOf } from '../src/shared/settings';

describe('the factory settings', () => {
  it('are the same on the page as in the app (the shared fixture, checked by the app\'s tests too)', () => {
    expect(JSON.parse(JSON.stringify(DEFAULT_SETTINGS))).toEqual(factory);
  });
  it('are the user\'s island without what is theirs alone or needs their consent', () => {
    const d = DEFAULT_SETTINGS;
    expect([d.hideMascot, d.clockStyle, d.lineColor, d.scale, d.glassDarkness, d.sound, d.volume, d.muted, d.notifyClick, d.restBrowsers]).toEqual([true, 'date', 'green', 90, 0, 'double', 100, false, 'source', 'hidden']);
    expect([d.language, d.lyricsOnline, d.statusWeather, d.weatherPlace, d.weatherCity, d.monitor]).toEqual(['system', false, false, null, '', '']);
  });
  it('are what "Reset to defaults" brings back', () => {
    expect(defaultsOf('look')).toMatchObject({ hideMascot: true, clockStyle: 'date', lineColor: 'green', weatherPlace: null, statusWeather: false });
  });
});
