import { describe, expect, it } from 'vitest';
import { wantsOffer } from '../src/ui/manager-offer';
import type { ProjectOffice } from '../src/shared/people';

const office = (key: string, people: { parent?: boolean }[]) => ({ key, name: key, provider: 'claude', people: people.map((p, i) => ({ session: { key: { provider: 'claude', hostId: 'pc', sessionId: `s${i}` }, parentKey: p.parent ? { provider: 'claude', hostId: 'pc', sessionId: 'x' } : undefined } })) }) as unknown as ProjectOffice;

describe('the manager offer', () => {
  it('asks once, for a live office with agents and no manager', () => {
    expect(wantsOffer(office('api', [{}]), false, true, true, [])).toBe(true);
    expect(wantsOffer(office('api', [{}]), false, true, true, ['api']), 'asked already').toBe(false);
    expect(wantsOffer(office('api', [{}]), true, true, true, []), 'has a manager').toBe(false);
    expect(wantsOffer(office('api', [{}]), false, false, true, []), 'demo office').toBe(false);
    expect(wantsOffer(office('api', [{}]), false, true, false, []), 'before the first-run screen is answered').toBe(false);
    expect(wantsOffer(office('api', [{ parent: true }]), false, true, true, []), 'only helpers').toBe(false);
    expect(wantsOffer(undefined, false, true, true, [])).toBe(false);
  });
});
