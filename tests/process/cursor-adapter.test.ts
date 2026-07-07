import { describe, it, expect } from 'vitest';
import { CursorAdapter } from '../../src/agent/cursor/adapter';

describe('CursorAdapter e2e', () => {
  it('checks cursor CLI availability', async () => {
    const adapter = new CursorAdapter({ mode: 'agent' });
    const avail = await adapter.checkAvailability();
    expect(avail.ok).toBe(true);
    if (avail.ok) {
      expect(avail.version).toBeTruthy();
      console.log('Cursor version:', avail.version);
    }
  });

  it('supports setBotIdentity', () => {
    const adapter = new CursorAdapter();
    adapter.setBotIdentity({ openId: 'ou_test_123', name: 'TestBot' });
  });

  it('runs a prompt through cursor agent and receives stream-json events', async () => {
    const adapter = new CursorAdapter({ mode: 'agent' });

    const run = adapter.run({
      runId: 'test-e2e-001',
      prompt: '只回复两个字：收到',
      cwd: '/tmp',
    });

    let gotSystem = false;
    let gotText = false;
    let gotDone = false;
    let textContent = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    for await (const ev of run.events) {
      if (ev.type === 'system') {
        gotSystem = true;
        console.log('[system] model:', (ev as any).model);
      } else if (ev.type === 'text') {
        gotText = true;
        textContent += (ev as any).delta;
      } else if (ev.type === 'usage') {
        inputTokens = (ev as any).inputTokens;
        outputTokens = (ev as any).outputTokens;
      } else if (ev.type === 'done') {
        gotDone = true;
      } else if (ev.type === 'error') {
        console.error('[error]', (ev as any).message);
      }
    }

    console.log('Response:', textContent);
    console.log('Tokens:', { inputTokens, outputTokens });

    expect(gotSystem).toBe(true);
    expect(gotText).toBe(true);
    expect(gotDone).toBe(true);
    expect(textContent.length).toBeGreaterThan(0);

    const exited = await run.waitForExit(3000);
    expect(exited).toBe(true);
  }, 120_000);
});
