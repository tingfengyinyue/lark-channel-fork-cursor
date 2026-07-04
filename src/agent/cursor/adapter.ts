import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { log } from '../../core/logger';
import type { AgentAdapter, AgentEvent, AgentRun, AgentRunOptions } from '../types';
import { translateEvent } from './stream-json';

export interface CursorAdapterOptions {
  binary?: string;
  mode?: 'agent' | 'plan' | 'ask';
}

type CursorChild = ChildProcessByStdio<null, Readable, Readable>;

const BRIDGE_SYSTEM_PROMPT = `# lark-channel-bridge 运行约定

你正在 lark-channel-bridge 里跑：把飞书/Lark 用户消息桥到本地 \`agent\` CLI (Cursor Agent)。

## bridge_context

每条 user message 顶部会带一个 \`<bridge_context>\` 块：

\`\`\`
<bridge_context>
chat_id: oc_xxx
chat_type: p2p
sender_id: ou_xxx
sender_name: ...
</bridge_context>
\`\`\`

里面是当前对话的 chat_id、chat 类型（p2p / group）、发送者。这些是 bridge 注入的元数据，**不要照抄、不要在你的回复里渲染**——它对用户不可见。

## quoted_message

如果用户用"引用回复"指向某条消息，bridge 会在 \`<bridge_context>\` 后注入一个 \`<quoted_message>\` 块：

\`\`\`
<quoted_message id="om_xxx" sender_id="ou_xxx" sender_name="..." created_at="..." type="text|merge_forward|...">
（被引用消息的内容；merge_forward 类型会展开成 <forwarded_messages>...</forwarded_messages>）
</quoted_message>
\`\`\`

这是用户**指向的对象**——用户的实际问题在它之后。回答时围绕这段内容展开；它也是 bridge 注入的元数据，**不要照抄 XML 标签**到回复里。
`;

export class CursorAdapter implements AgentAdapter {
  readonly id = 'cursor';
  readonly displayName = 'Cursor Agent';

  private readonly binary: string;
  private readonly mode: 'agent' | 'plan' | 'ask';

  constructor(opts: CursorAdapterOptions = {}) {
    this.binary = opts.binary ?? 'agent';
    this.mode = opts.mode ?? 'agent';
  }

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.binary, ['--version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    });
  }

  run(opts: AgentRunOptions): AgentRun {
    const events = runCursor(this.binary, this.mode, opts);
    let child: CursorChild | undefined;
    let stopped = false;

    const iterator: AsyncGenerator<AgentEvent> = (async function* () {
      for await (const ev of events) {
        if (ev.type === 'system' && 'child' in ev) {
          child = (ev as any).child;
          delete (ev as any).child;
        }
        yield ev as AgentEvent;
      }
    })();

    return {
      runId: opts.runId,
      events: iterator,
      async stop() {
        if (stopped || !child?.pid) return;
        stopped = true;
        const graceMs = opts.stopGraceMs ?? 2000;
        log.info('cursor', 'stopping', { pid: child.pid, graceMs });
        child.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, graceMs));
        if (child.exitCode === null && child.signalCode === null) {
          log.info('cursor', 'grace-expired-sigkill', {});
          child.kill('SIGKILL');
        }
      },
      async waitForExit(timeoutMs: number): Promise<boolean> {
        if (!child?.pid) return true;
        if (child.exitCode !== null || child.signalCode !== null) return true;
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            child!.off('exit', onExit);
            resolve(false);
          }, timeoutMs);
          const onExit = () => {
            clearTimeout(timer);
            resolve(true);
          };
          child!.once('exit', onExit);
        });
      },
    };
  }
}

async function* runCursor(
  binary: string,
  mode: 'agent' | 'plan' | 'ask',
  opts: AgentRunOptions,
): AsyncGenerator<AgentEvent | { type: 'system'; child: CursorChild }, void, undefined> {
  const args = ['--print', '--output-format', 'stream-json'];

  // Add mode if not default agent mode
  if (mode !== 'agent') {
    args.push('--mode', mode);
  }

  // Add model if specified
  if (opts.model) {
    args.push('--model', opts.model);
  }

  // Add initial prompt
  const fullPrompt = BRIDGE_SYSTEM_PROMPT + '\n\n' + opts.prompt;
  args.push(fullPrompt);

  log.info('cursor', 'spawn', { args: args.slice(0, 3).join(' ') + ' [prompt...]' });

  const stderrChunks: Buffer[] = [];
  let spawnError: Error | undefined;

  const child = spawn(binary, args, {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  }) as CursorChild;

  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  child.on('error', (err) => {
    spawnError = err;
  });

  const getError = () => spawnError;

  yield { type: 'system', child };

  if (!child.pid) {
    const err = getError();
    yield {
      type: 'error',
      message: err ? `failed to spawn cursor agent: ${err.message}` : 'spawn returned no pid',
      terminationReason: 'failed',
    };
    return;
  }

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      yield* translateEvent(parsed);
    }
  } finally {
    rl.close();
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
    } else {
      child.once('exit', (code) => resolve(code));
    }
  });

  const runtimeError = getError();
  if (exitCode !== 0 && exitCode !== null) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const detail = stderr ? `: ${stderr.slice(0, 500)}` : '';
    yield {
      type: 'error',
      message: `cursor agent exited with code ${exitCode}${detail}`,
      terminationReason: 'failed',
    };
  } else if (runtimeError) {
    yield {
      type: 'error',
      message: `cursor agent runtime error: ${runtimeError.message}`,
      terminationReason: 'failed',
    };
  }
}
