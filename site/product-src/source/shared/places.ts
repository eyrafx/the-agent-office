/**
 * The weather's place: Open-Meteo's geocoder answers (as the app's own search maps them, for the
 * browser preview) and how a place is named on screen: its country in the user's language from its
 * code (so "Türkiye", not the geocoder's longer official name), its region only when it is not the
 * city's own name again.
 */
import type { WeatherPlace } from './contract';

/** The geocoder's language: its two-letter code ("pt" for pt-BR, "zh" for zh-Hans). */
export const geoLanguage = (language: string) => (language.split('-')[0] || 'en').toLowerCase();
export const geocodeUrl = (query: string, language: string) =>
  `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=8&language=${encodeURIComponent(geoLanguage(language))}&format=json`;

/** The places in a geocoder answer, best first; an answer without results is an empty list. */
export function placesOf(answer: unknown): WeatherPlace[] {
  const results = (answer as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const text = (v: unknown) => typeof v === 'string' ? v : '';
  return results.flatMap((r: Record<string, unknown>) => typeof r?.latitude === 'number' && typeof r?.longitude === 'number' && text(r.name)
    ? [{ name: text(r.name), admin1: text(r.admin1), country: text(r.country), countryCode: text(r.country_code).toUpperCase(), latitude: r.latitude, longitude: r.longitude, timezone: text(r.timezone) }]
    : []);
}

/** The country's name in the user's language, else the geocoder's. */
export function countryName(p: WeatherPlace, locale: string): string {
  try { if (/^[A-Z]{2}$/.test(p.countryCode)) return new Intl.DisplayNames([locale], { type: 'region' }).of(p.countryCode) ?? p.country; } catch { /* An unknown code keeps the given name. */ }
  return p.country;
}
/** "İstanbul, Türkiye". */
export const placeTitle = (p: WeatherPlace, locale: string) => [p.name, countryName(p, locale)].filter(Boolean).join(', ');
/** The line under a suggestion: region (when it is not the city again) and country. */
export const placeDetail = (p: WeatherPlace, locale: string) => [p.admin1 && p.admin1 !== p.name ? p.admin1 : '', countryName(p, locale)].filter(Boolean).join(' · ');
