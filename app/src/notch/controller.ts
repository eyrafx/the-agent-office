/** Opening starts on the first pointer contact. Closing waits only long enough
 *  to forgive a pointer that slips off the edge or crosses the gap to the
 *  limits panel; re-entering within that window cancels it. */
export const CLOSE_TOLERANCE_MS = 60;
/** `openDelay`: how long the pointer rests on the notch before it opens (the user's setting;
 *  0 opens on contact). `closeDelay`: how long after it leaves before it closes. A click, a
 *  shortcut or a notification opens at once. */
export function createNotchController(changed: (expanded: boolean) => void, timing = { openDelay: 0, closeDelay: CLOSE_TOLERANCE_MS }) {
  let expanded = false, pinned = false, disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined, openTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; clearTimeout(openTimer); openTimer = undefined; };
  const set = (value: boolean) => { clear(); if (!disposed && expanded !== value) { expanded = value; changed(value); } };
  return {
    get expanded() { return expanded; }, get pinned() { return pinned; },
    enter() { if (expanded) { clear(); return; } if (timing.openDelay > 0) { clear(); openTimer = setTimeout(() => set(true), timing.openDelay); } else set(true); },
    leave() { clear(); if (!pinned) timer = setTimeout(() => set(false), timing.closeDelay); },
    open() { set(true); }, close() { if (!pinned) set(false); },
    pin(value = !pinned) { pinned = value; if (pinned) set(true); },
    configure(next: Partial<typeof timing>) { timing = { ...timing, ...next }; },
    dispose() { clear(); disposed = true; },
  };
}
