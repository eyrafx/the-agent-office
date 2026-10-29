// One demo world shared by every live island and the office on the page: it lives in the top
// page (window.__aoHub) and each frame's demo bridge reads and changes it, so a note added in one
// island shows in every other one and an answer given in the office closes the island's card.
// Everything stays in memory: nothing is written to the visitor's storage, nothing leaves the page.
import type { DocName, IslandStatus, MediaSession, Reminder, Settings, Snapshot, WorkEntry } from '@app/shared/contract';
import { DEFAULT_SETTINGS } from '@app/shared/settings';
import { demoMedia, demoReminders, demoSnapshot, demoWorkLog } from './fixture';

export type Topic = 'status' | 'snapshot' | 'settings' | 'doc' | 'reminders' | 'media' | 'worklog' | 'open-office' | 'open-settings' | 'open-source' | 'answered' | 'frame';
type Listener = (payload: unknown) => void;

export interface Hub {
  snapshot: Snapshot;
  settings: Settings;
  docs: Partial<Record<DocName, unknown>>;
  reminders: Reminder[];
  media: MediaSession[];
  worklog: WorkEntry[];
  status: IslandStatus;
  on(topic: Topic, cb: Listener): () => void;
  emit(topic: Topic, payload?: unknown): void;
  /** Bumps the snapshot's revision and tells everyone. */
  publish(): void;
  reset(): void;
}

function createHub(): Hub {
  const listeners = new Map<Topic, Set<Listener>>();
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fresh = () => ({
    snapshot: demoSnapshot(),
    settings: { ...DEFAULT_SETTINGS, language: 'tr', reducedMotion: reduced, islandTheme: 'glass', muted: true, setupDone: true, uiMigrated: true, notifyClick: 'office',
      statusBattery: true, statusAudio: true, statusAlarm: true, statusWeather: true, weatherCity: 'İzmir',
      weatherPlace: { name: 'İzmir', admin1: 'İzmir', country: 'Türkiye', countryCode: 'TR', latitude: 38.42, longitude: 27.14, timezone: 'Europe/Istanbul' } } as Settings,
    // The small island's turning strip: battery, headphones and weather (made up).
    status: { battery: { percent: 78, charging: true }, audio: { kind: 'headphones', name: 'AirPods', bluetooth: true }, weather: { temperature: 21, code: 1, place: 'İzmir', at: Date.now() } } as IslandStatus,
    docs: {
      notes: { items: [
        { id: 'n1', text: 'Sürüm notlarını gözden geçir', kind: 'task', done: false, created: Date.now() - 3_600_000, updated: Date.now() - 3_600_000 },
        { id: 'n2', text: 'Ekran görüntülerini yenile', kind: 'task', done: true, created: Date.now() - 7_200_000, updated: Date.now() - 1_800_000 },
        { id: 'n3', text: 'Arama dizini için önbellek fikri: sorguları 5 dk tut.', kind: 'note', done: false, created: Date.now() - 5_400_000, updated: Date.now() - 5_400_000 },
      ] },
      water: { portion: 250, goal: 2000, from: 9, to: 22, every: 90, remind: false, log: [{ at: Date.now() - 2 * 3_600_000, ml: 250 }, { at: Date.now() - 50 * 60_000, ml: 250 }] },
      shelf: { items: [] },
    } as Partial<Record<DocName, unknown>>,
    reminders: demoReminders(),
    media: demoMedia(),
    worklog: demoWorkLog(),
  });
  const hub: Hub = {
    ...fresh(),
    on(topic, cb) { let set = listeners.get(topic); if (!set) listeners.set(topic, set = new Set()); set.add(cb); return () => { set!.delete(cb); }; },
    emit(topic, payload) {
      for (const cb of [...(listeners.get(topic) ?? [])]) {
        // A listener from a frame that has gone away throws; it is dropped.
        try { cb(payload); } catch { listeners.get(topic)?.delete(cb); }
      }
    },
    publish() { hub.snapshot.revision = Math.max(Date.now(), hub.snapshot.revision + 1); hub.emit('snapshot', hub.snapshot); },
    reset() { Object.assign(hub, fresh()); hub.publish(); hub.emit('status', hub.status); hub.emit('settings', hub.settings); hub.emit('media', hub.media); hub.emit('reminders', hub.reminders); for (const name of Object.keys(hub.docs) as DocName[]) hub.emit('doc', { name, doc: hub.docs[name] }); },
  };
  return hub;
}

/** The page's demo world: the top page's when this runs in a frame of it, else a new one. */
export function getHub(): Hub {
  const w = window as unknown as { __aoHub?: Hub };
  try {
    const top = window.parent as unknown as { __aoHub?: Hub };
    if (window.parent !== window && top.__aoHub) return top.__aoHub;
  } catch { /* another origin: a world of its own */ }
  return w.__aoHub ??= createHub();
}
