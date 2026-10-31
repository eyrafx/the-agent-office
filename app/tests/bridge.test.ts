import { describe, expect, it } from 'vitest';
import { acceptSnapshot, createDemoSnapshot, emptySnapshot } from '../src/shared/demo';
import { requestId, sessionId } from '../src/shared/contract';
describe('snapshot boundary', () => {
  it('uses structural identity despite separators in fields', () => {
    expect(sessionId({provider:'codex',hostId:'a:b',sessionId:'c'})).not.toBe(sessionId({provider:'codex',hostId:'a',sessionId:'b:c'}));
  });
  it('keeps 20 demo sessions and concurrent requests independent', () => {
    const s=createDemoSnapshot(7,1000); expect(s.sessions).toHaveLength(20);
    expect(new Set(s.sessions.map(x=>sessionId(x.key))).size).toBe(20);
    expect(new Set(s.requests.map(x=>requestId(x.key))).size).toBe(3);
    expect(s.mode).toBe('demo'); expect(s.connections.every(c=>c.status==='unverified')).toBe(true);
  });
  it('rejects revision rollback and incompatible schemas', () => {
    const s=createDemoSnapshot(10,1000); expect(acceptSnapshot(s,createDemoSnapshot(9,1000))).toBe(s);
    expect(acceptSnapshot(s,{...s,schemaVersion:2} as never)).toBe(s);
    expect(acceptSnapshot(emptySnapshot(1),s)).toBe(s);
  });
});
