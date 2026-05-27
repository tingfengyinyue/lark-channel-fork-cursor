import type { AgentAdapter } from './types';
import { ClaudeAdapter } from './claude/adapter';
import { CursorAdapter } from './cursor/adapter';
import type { AppConfig } from '../config/schema';

/**
 * Create an agent adapter based on the configuration.
 * Defaults to ClaudeAdapter if no CLI config is specified.
 */
export function createAgent(cfg: AppConfig): AgentAdapter {
  const cliConfig = cfg.preferences?.cli;
  const provider = cliConfig?.provider ?? 'claude';

  switch (provider) {
    case 'claude':
      return new ClaudeAdapter(cliConfig?.claude);
    case 'cursor':
      return new CursorAdapter(cliConfig?.cursor);
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
