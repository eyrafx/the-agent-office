// A slower clock for every frame of a page (pass to page.addInitScript with { slow, anchor }):
// timers, Date, performance.now and requestAnimationFrame run `slow` times slower, so a busy
// moment can be filmed frame by frame. `offset` moves the wall clock (the film's 09:41). Date is shared by all frames (one anchor); CSS and Web
// Animations are slowed the same way through CDP (Animation.setPlaybackRate).
export function slowClock({ slow, anchor, offset = 0 }) {
  const k = 1 / slow, perf = performance.now.bind(performance), RealDate = Date, realNow = RealDate.now;
  performance.now = () => perf() * k;
  const fakeNow = () => anchor + offset + (realNow() - anchor) * k;
  class SlowDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(fakeNow()); } static now() { return fakeNow(); } }
  window.Date = SlowDate;
  const st = window.setTimeout.bind(window), si = window.setInterval.bind(window), raf = window.requestAnimationFrame.bind(window);
  window.setTimeout = (fn, ms = 0, ...a) => st(fn, ms * slow, ...a);
  window.setInterval = (fn, ms = 0, ...a) => si(fn, ms * slow, ...a);
  window.requestAnimationFrame = cb => raf(() => cb(performance.now()));
}
