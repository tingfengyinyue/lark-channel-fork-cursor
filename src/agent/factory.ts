import type { AgentAdapter } from './types';
import { ClaudeAdapter } from './claude/adapter';
import { CursorAdapter } from './cursor/adapter';
import type { AppConfig } from '../config/schema';
import type { LarkChannelEnvContext } from './lark-channel-env';

export interface CreateAgentOptions {
  larkChannel?: LarkChannelEnvContext;
}

/**
 * Create an agent adapter based on the configuration.
 * Defaults to ClaudeAdapter if no CLI config is specified.
 */
export function createAgent(cfg: AppConfig, opts?: CreateAgentOptions): AgentAdapter {
  const cliConfig = cfg.preferences?.cli;
  const provider = cliConfig?.provider ?? 'claude';

  switch (provider) {
    case 'claude':
      return new ClaudeAdapter({
        binary: cliConfig?.claude?.binary,
        larkChannel: opts?.larkChannel,
      });
    case 'cursor':
      return new CursorAdapter({
        binary: cliConfig?.cursor?.binary,
        mode: cliConfig?.cursor?.mode,
        larkChannel: opts?.larkChannel,
      });
    default:
      throw new Error(`Unknown CLI provider: ${provider}`);
  }
}

/**
 * Get the display name of the current CLI provider.
 */
export function getProviderDisplayName(cfg: AppConfig): string {
  const provider = cfg.preferences?.cli?.provider ?? 'claude';
  switch (provider) {
    case 'claude':
      return 'Claude Code';
    case 'cursor':
      return 'Cursor Agent';
    default:
      return provider;
  }
}
