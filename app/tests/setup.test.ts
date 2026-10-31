import { describe, expect, it } from 'vitest';
import { setLanguage, t } from '../src/i18n';
import { noticeOf } from '../src/ui/link-notice';
import { connectError } from '../src/ui/first-run';
import type { ToolsState } from '../src/shared/contract';

const state = (claude: boolean, s: ToolsState['claude']['state'], reason?: string): ToolsState => ({ tools: { claude, codex: true }, claude: { state: s, reason } });

describe('the Claude Code connection notice', () => {
  it('offers to connect a Claude Code found later, until dismissed; never during the first start', () => {
    expect(noticeOf(state(true, 'off'), true, false)).toBe('offer');
    expect(noticeOf(state(true, 'off'), true, true)).toBeNull();
    expect(noticeOf(state(true, 'off'), false, false)).toBeNull();
  });
  it('asks for a repair when broken (whatever was dismissed) and says an unreadable file plainly', () => {
    expect(noticeOf(state(true, 'broken', 'helper_missing'), true, true)).toBe('broken');
    expect(noticeOf(state(true, 'unreadable'), true, false)).toBe('unreadable');
  });
  it('says nothing when connected, or when Claude Code is not on the computer', () => {
    expect(noticeOf(state(true, 'on'), true, false)).toBeNull();
    expect(noticeOf(state(false, 'absent'), true, false)).toBeNull();
    expect(noticeOf(null, true, false)).toBeNull();
  });
  it('words the app\'s connection errors for the user', () => {
    setLanguage('en');
    expect(connectError(new Error('unreadable'), t)).toContain('nothing was changed');
    expect(connectError('helper_not_bundled', t)).toContain('helper program');
    expect(connectError('Access is denied. (os error 5)', t)).toBe('Could not connect: Access is denied. (os error 5)');
  });
});
