/**
 * Side-to-side paging for the island: a horizontal drag, a horizontal wheel or touchpad swipe,
 * the arrows, the dots and the keyboard all move one page, round in a circle (after the last
 * comes the first, before the first the last). A drag only takes over once it is clearly
 * sideways; a vertical scroll, text being selected or typed, a slider, a progress bar, a file
 * being dragged or a scrollbar never turns the page. A click that ends a drag does nothing else.
 */
export interface Pager {
  /** The pages now shown, in order; keeps the current one if it is still there. */
  setPages(ids: string[]): void;
  show(id: string, opts?: { remember?: boolean; instant?: boolean }): void;
  step(by: number): void;
  readonly current: string;
  readonly pages: readonly string[];
  /** A drag is turning the page now. */
  readonly dragging: boolean;
  dispose(): void;
}

/** Elements on which a press never starts a page drag. */
const NO_SWIPE = 'input,textarea,select,[contenteditable=""],[contenteditable="true"],[draggable="true"],[data-noswipe]';
/** How far a drag must go (share of the width), or how fast (px/ms), to turn the page. */
const TURN_SHARE = 0.22, TURN_SPEED = 0.35;
/** Horizontal wheel travel that turns one page, and the pause after a turn. */
const WHEEL_TURN = 60, WHEEL_REST_MS = 420;

export function createPager(o: {
  viewport: HTMLElement; track: HTMLElement;
  changed: (id: string, remember: boolean) => void;
  moving?: (dragging: boolean) => void;
}): Pager {
  let pages: string[] = [], index = 0;
  const { viewport, track } = o;
  const place = (offset = 0, instant = false) => {
    track.classList.toggle('dragging', instant);
    track.style.transform = `translate3d(${-index * 100}%,0,0) translateX(${offset}px)`;
  };
  // Round: one step past either end is the other end. That step does not sweep the track across
  // every page between; the page comes in from the side it was asked from.
  const go = (to: number, remember = true, instant = false) => {
    const n = pages.length;
    if (!n) return;
    const next = ((to % n) + n) % n;
    const wrapped = !instant && n > 2 && Math.abs(to - index) === 1 && Math.abs(next - index) > 1;
    const changed = next !== index;
    index = next;
    if (wrapped) {
      const from = (to > next ? 1 : -1) * Math.min(160, (viewport.clientWidth || 400) * 0.35);
      place(from, true); void track.offsetWidth; place(0);
    } else place(0, instant);
    if (changed || !remember) o.changed(pages[index], remember);
  };

  // Drag: decided on the first few pixels; vertical or blocked presses are left alone.
  let start: { x: number; y: number; t: number; id: number } | null = null, dragging = false, dragged = false, lastX = 0, lastT = 0, speed = 0;
  const onScrollbar = (event: PointerEvent) => {
    for (let el = event.target as HTMLElement | null; el && el !== viewport; el = el.parentElement) {
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && event.clientX > el.getBoundingClientRect().left + el.clientWidth) return true;
    }
    return false;
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || pages.length < 2) return;
    const t = event.target as Element;
    if (t.closest(NO_SWIPE) || onScrollbar(event)) return;
    start = { x: event.clientX, y: event.clientY, t: performance.now(), id: event.pointerId }; dragging = false; dragged = false; speed = 0;
  };
  const move = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (getSelection()?.toString()) { start = null; return; }
      dragging = true; dragged = true; viewport.setPointerCapture(event.pointerId); o.moving?.(true);
      lastX = event.clientX; lastT = performance.now();
    }
    const now = performance.now(); speed = (event.clientX - lastX) / Math.max(1, now - lastT); lastX = event.clientX; lastT = now;
    // Past the first or last page nothing is beside it yet: the track gives a little, and a turn
    // there goes round to the other end.
    const edge = (index === 0 && dx > 0) || (index === pages.length - 1 && dx < 0);
    place(edge ? dx / 3 : dx, true);
  };
  const up = (event: PointerEvent) => {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x; start = null;
    if (!dragging) return;
    dragging = false; o.moving?.(false);
    const w = viewport.clientWidth || 1;
    const turn = Math.abs(dx) > w * TURN_SHARE || Math.abs(speed) > TURN_SPEED ? -Math.sign(Math.abs(speed) > TURN_SPEED ? speed : dx) : 0;
    go(index + turn);
    if (!turn) place(0);
  };
  // The click that ends a drag is not a click on what lay under it.
  const click = (event: MouseEvent) => { if (dragged) { event.stopPropagation(); event.preventDefault(); dragged = false; } };

  let wheelSum = 0, wheelRest = 0, wheelReset: ReturnType<typeof setTimeout> | undefined;
  const wheel = (event: WheelEvent) => {
    if (pages.length < 2) return;
    const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
    if (Math.abs(x) <= Math.abs(event.shiftKey ? 0 : event.deltaY)) return;
    if ((event.target as Element).closest('input[type=range],[data-noswipe]')) return;
    event.preventDefault();
    if (performance.now() < wheelRest) return;
    wheelSum += x; clearTimeout(wheelReset); wheelReset = setTimeout(() => { wheelSum = 0; }, 200);
    if (Math.abs(wheelSum) >= WHEEL_TURN) { const by = Math.sign(wheelSum); wheelSum = 0; wheelRest = performance.now() + WHEEL_REST_MS; go(index + by); }
  };

  viewport.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', up);
  viewport.addEventListener('click', click, true); viewport.addEventListener('wheel', wheel, { passive: false });
  place(0, true);

  return {
    setPages(ids) {
      const keep = pages[index];
      pages = [...ids];
      const at = pages.indexOf(keep);
      index = at >= 0 ? at : Math.min(index, Math.max(0, pages.length - 1));
      place(0, true);
    },
    show(id, opts = {}) { const at = pages.indexOf(id); if (at >= 0) go(at, opts.remember ?? true, opts.instant ?? false); },
    step(by) { go(index + by); },
    get current() { return pages[index] ?? ''; },
    get pages() { return pages; },
    get dragging() { return dragging; },
    dispose() {
      viewport.removeEventListener('pointerdown', down); viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', up); viewport.removeEventListener('pointercancel', up);
      viewport.removeEventListener('click', click, true); viewport.removeEventListener('wheel', wheel);
      clearTimeout(wheelReset);
    },
  };
}
