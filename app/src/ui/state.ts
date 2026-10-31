import type { Bridge, Snapshot, Unsubscribe } from '../shared/contract';
export const acceptSnapshot = (current: Snapshot | undefined, incoming: Snapshot): Snapshot => current && current.revision > incoming.revision ? current : incoming;
export function watchSnapshot(bridge: Bridge, render: (snapshot: Snapshot) => void, error: (message: string) => void): () => void {
  let disposed = false; let current: Snapshot | undefined; let unsubscribe: Unsubscribe | undefined;
  const receive = (incoming: Snapshot) => { if (disposed) return; const next = acceptSnapshot(current, incoming); if (next !== current) { current = next; render(next); } };
  void (async () => { try { unsubscribe = await bridge.subscribe(receive); if (disposed) { unsubscribe(); return; } receive(await bridge.getSnapshot()); } catch (e) { if (!disposed) error(String(e)); } })();
  return () => { disposed = true; unsubscribe?.(); };
}
export const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
