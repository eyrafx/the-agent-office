import { describe, expect, it } from 'vitest';
import { countryName, geoLanguage, geocodeUrl, placeDetail, placeTitle, placesOf } from '../src/shared/places';

// Open-Meteo's geocoder as it answered for "Paris" (shortened) and for a typo.
const paris = { results: [
  { id: 2988507, name: 'Paris', latitude: 48.85341, longitude: 2.3488, country_code: 'FR', admin1: 'Île-de-France', timezone: 'Europe/Paris', population: 2138551, country: 'France' },
  { id: 4717560, name: 'Paris', latitude: 33.66094, longitude: -95.55551, country_code: 'US', admin1: 'Texas', timezone: 'America/Chicago', population: 24171, country: 'United States' },
  { id: 1, name: 'Broken', latitude: '48', longitude: 2 },
] };

describe('the weather place', () => {
  it('maps the geocoder answer to places, best first; nothing found is empty', () => {
    expect(placesOf(paris)).toEqual([
      { name: 'Paris', admin1: 'Île-de-France', country: 'France', countryCode: 'FR', latitude: 48.85341, longitude: 2.3488, timezone: 'Europe/Paris' },
      { name: 'Paris', admin1: 'Texas', country: 'United States', countryCode: 'US', latitude: 33.66094, longitude: -95.55551, timezone: 'America/Chicago' },
    ]);
    expect(placesOf({ generationtime_ms: 0.4 })).toEqual([]);
    expect(placesOf(null)).toEqual([]);
  });
  it('tells same-name places apart by region and country, in the user\'s language', () => {
    const [fr, us] = placesOf(paris);
    expect(placeDetail(fr, 'tr-TR')).toBe('Île-de-France · Fransa');
    expect(placeDetail(us, 'de-DE')).toBe('Texas · Vereinigte Staaten');
    expect(placeTitle(fr, 'en-US')).toBe('Paris, France');
    // The geocoder's long official name gives way to the usual one; the region is left out when it is the city again.
    const ist = { name: 'İstanbul', admin1: 'İstanbul', country: 'Türkiye Cumhuriyeti', countryCode: 'TR', latitude: 41.01, longitude: 28.95, timezone: 'Europe/Istanbul' };
    expect(placeTitle(ist, 'tr-TR')).toBe('İstanbul, Türkiye');
    expect(placeDetail(ist, 'tr-TR')).toBe('Türkiye');
    expect(countryName({ ...ist, countryCode: '' }, 'tr-TR')).toBe('Türkiye Cumhuriyeti');
  });
  it('asks the geocoder in the app\'s language, the query encoded', () => {
    expect(geoLanguage('pt-BR')).toBe('pt'); expect(geoLanguage('zh-Hans')).toBe('zh');
    expect(geocodeUrl(' São Paulo ', 'pt-BR')).toBe('https://geocoding-api.open-meteo.com/v1/search?name=S%C3%A3o%20Paulo&count=8&language=pt&format=json');
  });
});
