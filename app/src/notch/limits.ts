import { ago as relativeAgo, span } from '../i18n';
import { fromApp } from '../i18n';
import type { Translate, MessageKey } from '../i18n';
import type { LimitWindow, ProviderLimits, Snapshot } from '../shared/contract';
import { escapeHtml as e } from '../ui/state';
import { icon, mark } from '../ui/icons';

type L = Translate;

const PROVIDERS: { id: string; name: string; missing: MessageKey }[] = [
  { id: 'claude', name: 'Claude', missing: 'limits.reading_claude_limits' },
  { id: 'codex', name: 'Codex · GPT', missing: 'limits.no_codex_reading_yet' },
];

/** A reading older than this may no longer match the account. */
const STALE_MS = 30 * 60 * 1000;

export function windowLabel(minutes: number, l: L): string {
  if (minutes === 300) return l('limits.5_hours');
  if (minutes === 10080) return l('limits.week');
  if (minutes % 1440 === 0) return l('limits.days', { v: minutes / 1440 });
  if (minutes % 60 === 0) return l('limits.hours', { v: minutes / 60 });
  return l('limits.min', { minutes });
}

export function ago(ms: number, now: number, l: L): string {
  return now - ms < 60_000 ? l('limits.just_now') : relativeAgo(ms, now);
}

function remaining(at: number, now: number): string {
  return span(Math.max(1, Math.round((at - now) / 60000)));
}

function resetText(at: number, now: number, locale: string): string {
  const date = new Date(at), sameDay = new Date(now).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString(locale, { weekday: 'short' })} ${time}`;
}

/** A reading whose window has already reset says nothing about the new window. */
export function windowView(w: LimitWindow, now: number, l: L, locale: string): { label: string; value: string; left?: string; detail: string; percent: number | null } {
  const label = w.model ? `${windowLabel(w.windowMinutes, l)} · ${w.model}` : windowLabel(w.windowMinutes, l);
  if (w.resetsAt !== undefined && w.resetsAt <= now) return { label, value: l('limits.reset'), detail: l('limits.awaiting_a_new_reading'), percent: null };
  const used = Math.min(100, Math.max(0, w.usedPercent));
  return { label, value: l('limits.used', { round: Math.round(used) }), left: l('limits.left', { round: Math.round(100 - used) }), detail: w.resetsAt ? l('limits.resets_in', { remaining: remaining(w.resetsAt, now), resetText: resetText(w.resetsAt, now, locale) }) : l('limits.reset_time_not_reported'), percent: used };
}

export function renderLimits(snapshot: Snapshot, l: L, locale: string, now = Date.now()): string {
  const readings = new Map<string, ProviderLimits>((snapshot.limits ?? []).map(x => [x.provider, x]));
  const demo = snapshot.mode === 'demo';
  const rows = PROVIDERS.map(p => {
    const r = demo ? undefined : readings.get(p.id);
    const tile = `<span class="tile tile-${p.id}">${mark(p.id === 'claude' ? 'claude' : 'openai', 12)}</span>`;
    if (!r || !r.windows.length) return `<section class="limit-provider"><header>${tile}<b>${e(p.name)}</b></header><p class="limit-missing">${e(demo ? l('limits.no_limits_in_demo_mode') : fromApp(r?.note) || l(p.missing))}</p></section>`;
    const windows = r.windows.map(w => { const v = windowView(w, now, l, locale); return `<div class="limit-window"><span class="limit-label">${e(v.label)}</span><span class="limit-value">${e(v.value)}</span><span class="limit-bar"${v.percent === null ? ' data-empty' : ''}><i style="width:${v.percent ?? 0}%"${(v.percent ?? 0) >= 80 ? ' class="high"' : ''}></i></span><small>${e(v.detail)}</small>${v.left ? `<small class="limit-left">${e(v.left)}</small>` : ''}</div>`; }).join('');
    const resets = r.resetsAvailable !== undefined ? `<p class="limit-resets">${e(l('limits.resets_available', { n: r.resetsAvailable }))}</p>` : '';
    // Extra credits only when there are some (or unlimited); a zero balance says nothing.
    const credits = r.credits && (r.credits.unlimited || r.credits.balance > 0) ? `<p class="limit-credits">${e(r.credits.unlimited ? l('limits.extra_credits_unlimited') : l('limits.extra_credits', { balance: r.credits.balance }))}</p>` : '';
    return `<section class="limit-provider"><header>${tile}<b>${e(p.name)}</b>${r.plan ? `<span class="plan">${e(r.plan.charAt(0).toLocaleUpperCase(locale) + r.plan.slice(1))}</span>` : ''}</header>${windows}${resets}${credits}<p class="limit-updated${now - r.updatedAt > STALE_MS ? ' stale' : ''}">${e(l('limits.updated', { ago: ago(r.updatedAt, now, l), source: fromApp(r.source) }))}${now - r.updatedAt > STALE_MS ? ` · ${e(l('limits.may_be_out_of_date'))}` : ''}</p></section>`;
  }).join('');
  return `<header class="limits-head"><h2>${e(l('limits.limits'))}</h2><button class="limits-close icon-button" aria-label="${e(l('limits.close'))}">${icon('close', 15)}</button></header><div class="limits-body">${rows}</div>`;
}
