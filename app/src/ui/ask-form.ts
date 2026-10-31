import type { Translate } from '../i18n';
import type { AnswerResult, Bridge, PendingRequest } from '../shared/contract';
import { requestId } from '../shared/contract';
import { escapeHtml as e } from './state';

type L = Translate;
interface Draft { picks: Map<number, Set<string>>; other: Map<number, string>; sending: boolean }

/**
 * A chat's question in full, where it is shown (the notch card, the office): every question with
 * its options (one or several to choose, as asked) and a field for one's own words. Only a
 * question whose hook waits here can be sent from here; it is sent once, with exactly what the
 * user chose or wrote, and says whether it is being sent, was handed over or could not be. A
 * question that cannot be answered here shows all of it and says where it is answered. Choices
 * and typed words are kept while the card is redrawn, so a live update never loses them.
 */
export function createAskForms(o: { l: () => L; bridge: Bridge; report: (text: string) => void; changed: () => void; demo?: () => boolean }) {
  const drafts = new Map<string, Draft>();
  const draft = (id: string) => { let d = drafts.get(id); if (!d) { d = { picks: new Map(), other: new Map(), sending: false }; drafts.set(id, d); } return d; };
  const known = new Map<string, PendingRequest>();
  const answerOf = (r: PendingRequest, d: Draft, i: number) => {
    const q = r.questions![i], own = (d.other.get(i) ?? '').trim(), picked = [...(d.picks.get(i) ?? [])];
    if (q.multiSelect) return [...picked, ...(own ? [own] : [])].join(', ');
    return own || picked[0] || '';
  };
  const ready = (r: PendingRequest, d: Draft) => !!r.questions?.length && r.questions.every((_, i) => answerOf(r, d, i) !== '');
  const seconds = (until: number) => { const s = Math.max(0, Math.ceil((until - Date.now()) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  /** The question as a form (answerable here) or in full, read only, with where it is answered. */
  function html(r: PendingRequest, source: string): string {
    const l = o.l(), id = requestId(r.key); known.set(id, r);
    const qs = r.questions ?? [];
    const live = r.canAnswer && r.status === 'pending' && qs.length > 0 && !!r.holdUntil;
    const d = draft(id), sending = d.sending || r.status === 'answering';
    const list = qs.map((q, i) => {
      const picks = d.picks.get(i) ?? new Set<string>();
      const opts = q.options.map(opt => {
        const on = picks.has(opt.label);
        return live
          ? `<button type="button" class="ask-opt${on ? ' on' : ''}" role="${q.multiSelect ? 'checkbox' : 'radio'}" aria-checked="${on}" data-ask-opt="${e(id)}" data-q="${i}" data-v="${e(opt.label)}" ${sending ? 'disabled' : ''}${opt.description ? ` title="${e(opt.description)}"` : ''}><i class="ask-mark${q.multiSelect ? ' sq' : ''}"></i><span><b>${e(opt.label)}</b>${opt.description ? `<small>${e(opt.description)}</small>` : ''}</span></button>`
          : `<li><b>${e(opt.label)}</b>${opt.description ? ` <small>${e(opt.description)}</small>` : ''}</li>`;
      }).join('');
      const head = `<legend>${q.header ? `<span class="ask-h">${e(q.header)}</span>` : ''}<span class="ask-text">${e(q.question)}</span>${q.multiSelect ? `<em class="ask-many">${e(l('ask.choose_any'))}</em>` : ''}</legend>`;
      return live
        ? `<fieldset class="ask-q">${head}<div class="ask-opts" role="${q.multiSelect ? 'group' : 'radiogroup'}">${opts}</div><input class="ask-other" data-ask-other="${e(id)}" data-q="${i}" maxlength="2000" placeholder="${e(l('ask.or_write_your_own_answer'))}" aria-label="${e(`${q.question}: ${l('ask.your_own_answer')}`)}" ${sending ? 'disabled' : ''}></fieldset>`
        : `<fieldset class="ask-q read">${head}${opts ? `<ul class="ask-list">${opts}</ul>` : ''}</fieldset>`;
    }).join('');
    if (live) {
      const status = sending ? l('ask.sending') : '';
      return `<div class="ask-form" data-ask="${e(id)}">${list}<div class="ask-foot"><span class="ask-hold" data-hold="${r.holdUntil}" title="${e(l('ask.when_this_runs_out_the'))}">${e(l('ask.passes_to_claude_in', { seconds: seconds(r.holdUntil!) }))}</span><button type="button" class="ask-release" data-ask-release="${e(id)}" ${sending ? 'disabled' : ''} title="${e(l('ask.hands_the_question_to_claude'))}">${e(l('ask.answer_in_claude'))}</button><button type="button" class="ask-send" data-ask-send="${e(id)}" ${sending || !ready(r, d) ? 'disabled' : ''}>${e(l('ask.send'))}</button></div>${status ? `<p class="ask-status" role="status">${e(status)}</p>` : ''}</div>`;
    }
    // Not answerable here: the whole question, and why it is answered in its own app.
    const why = r.outcome === 'released' ? l('ask.no_longer_answerable_here_the')
      : r.outcome === 'failed' ? l('ask.the_answer_could_not_be')
      : r.key.sessionKey.provider === 'codex' ? l('ask.codex_questions_cannot_be_answered')
      : r.kind === 'permission' ? l('ask.permissions_are_given_only_in')
      : !qs.length ? l('ask.you_answer_in_claude')
      : l('ask.this_question_cannot_be_answered');
    return `<div class="ask-form read" data-ask="${e(id)}">${list}<p class="ask-why">${e(why)}</p>${source}</div>`;
  }

  async function send(id: string) {
    const r = known.get(id), d = draft(id), l = o.l();
    if (!r || d.sending || !ready(r, d)) return;
    const answers: Record<string, string> = {};
    r.questions!.forEach((q, i) => { answers[q.question] = answerOf(r, d, i); });
    d.sending = true; o.changed();
    let result: AnswerResult | string;
    try { result = await o.bridge.answer(r.key, r.version, answers); } catch (err) { result = String(err); }
    d.sending = false;
    if (result === 'delivered' && o.demo?.()) { drafts.delete(id); o.report(l('ask.demo_answer_applied_sent_to')); }
    else if (result === 'delivered') { drafts.delete(id); o.report(l('ask.delivered_the_answer_was_handed')); }
    else o.report(({ stale: l('ask.not_sent_the_question_is'), unsupported: l('ask.not_sent_this_question_cannot'), disconnected: l('ask.not_delivered_claude_no_longer'), failed: l('ask.not_sent_choose_or_write') } as Record<string, string>)[result] ?? l('ask.not_delivered', { result }));
    o.changed();
  }

  return {
    html,
    /** A click inside a form: a choice, sending, or handing the question to Claude. */
    click(target: Element): boolean {
      const b = target.closest<HTMLButtonElement>('button[data-ask-opt],button[data-ask-send],button[data-ask-release]');
      if (!b || b.disabled) return !!b;
      if (b.dataset.askOpt) {
        const id = b.dataset.askOpt, r = known.get(id); if (!r?.questions) return true;
        const i = Number(b.dataset.q), q = r.questions[i], d = draft(id), v = b.dataset.v!;
        const picks = d.picks.get(i) ?? new Set<string>();
        if (q.multiSelect) { if (picks.has(v)) picks.delete(v); else picks.add(v); }
        else { const had = picks.has(v); picks.clear(); if (!had) picks.add(v); d.other.delete(i); }
        d.picks.set(i, picks); o.changed(); return true;
      }
      if (b.dataset.askSend) { void send(b.dataset.askSend); return true; }
      if (b.dataset.askRelease) {
        const r = known.get(b.dataset.askRelease); if (!r) return true;
        void o.bridge.releaseRequest(r.key).then(() => o.report(o.l()('ask.the_question_went_to_claude'))).catch(err => o.report(String(err)));
        return true;
      }
      return false;
    },
    /** Typing one's own answer (a single-choice question then takes the words, not a pick). */
    input(target: Element): boolean {
      const f = target.closest<HTMLInputElement>('input[data-ask-other]'); if (!f) return false;
      const id = f.dataset.askOther!, i = Number(f.dataset.q), d = draft(id), r = known.get(id);
      d.other.set(i, f.value);
      if (r?.questions?.[i] && !r.questions[i].multiSelect && f.value.trim()) d.picks.delete(i);
      // Only the send button and the choices change: the field itself is never redrawn under the typing.
      const form = f.closest('.ask-form');
      if (form && r) { const send = form.querySelector<HTMLButtonElement>('.ask-send'); if (send) send.disabled = d.sending || !ready(r, d); if (!r.questions![i].multiSelect && f.value.trim()) form.querySelectorAll<HTMLElement>(`.ask-opt[data-q="${i}"]`).forEach(x => { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); }); }
      return true;
    },
    /** After a redraw: the typed words back in their fields, the field being typed in focused again. */
    restore(container: Element, focused?: { id: string; q: string; start: number | null; end: number | null }) {
      container.querySelectorAll<HTMLInputElement>('input[data-ask-other]').forEach(f => { const v = drafts.get(f.dataset.askOther!)?.other.get(Number(f.dataset.q)) ?? ''; if (f.value !== v) f.value = v; });
      if (focused) { const f = container.querySelector<HTMLInputElement>(`input[data-ask-other="${CSS.escape(focused.id)}"][data-q="${focused.q}"]`); if (f) { f.focus({ preventScroll: true }); try { f.setSelectionRange(focused.start, focused.end); } catch { /* not a text field */ } } }
    },
    /** Which field is being typed in now (to put the caret back after a redraw). */
    focused(): { id: string; q: string; start: number | null; end: number | null } | undefined {
      const f = document.activeElement as HTMLInputElement | null;
      return f?.dataset?.askOther ? { id: f.dataset.askOther, q: f.dataset.q ?? '0', start: f.selectionStart, end: f.selectionEnd } : undefined;
    },
    /** The countdowns, once a second, without redrawing anything else. */
    tick(container: Element) {
      const l = o.l();
      container.querySelectorAll<HTMLElement>('.ask-hold[data-hold]').forEach(el => { const t = l('ask.passes_to_claude_in', { seconds: seconds(Number(el.dataset.hold)) }); if (el.textContent !== t) el.textContent = t; });
    },
    /** Something chosen or typed and not sent yet (the island stays open meanwhile). */
    pending(): boolean { return [...drafts.values()].some(d => d.sending || d.picks.size > 0 || [...d.other.values()].some(v => v.trim())); },
    /** Drafts of questions no longer shown are dropped. */
    keep(ids: Set<string>) { for (const id of [...drafts.keys()]) if (!ids.has(id)) drafts.delete(id); for (const id of [...known.keys()]) if (!ids.has(id)) known.delete(id); },
  };
}
