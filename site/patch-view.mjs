// The site switches the hero island's language without reloading it; the island's clock and date
// formats are made once at mount in the app, so here they follow the current language instead
// (24-hour "02:53" in Turkish, "2:53 AM" in English, each locale's own style).
export function followLanguageClock(source) {
  const from = "  const clockFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }), timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });";
  if (!source.includes(from)) return source;
  return source
    .replace(from, "  let clockLocale = locale, clockFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }), timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });\n  const clockFollow = () => { const now = localeTag(); if (now === clockLocale) return; clockLocale = now; clockFormat = new Intl.DateTimeFormat(now, { weekday: 'short', day: 'numeric', month: 'short' }); timeFormat = new Intl.DateTimeFormat(now, { hour: '2-digit', minute: '2-digit' }); };")
    .replace("const dateText = (now: Date) => { if (!locale.startsWith('tr'))", "const dateText = (now: Date) => { if (!clockLocale.startsWith('tr'))")
    .replace("  const tick = () => { const now = new Date(), time = timeFormat.format(now);", "  const tick = () => { clockFollow(); const now = new Date(), time = timeFormat.format(now);");
}
