import { loadState, saveState } from './store';
import type { DemoHandler } from './types';
import { authHandlers } from './handlers/auth';
import { vaultHandlers } from './handlers/vault';
import { otpHandlers } from './handlers/otp';
import { settingsHandlers } from './handlers/settings';
import { recoveryHandlers } from './handlers/recovery';
import { backupHandlers } from './handlers/backup';
import { stubHandlers } from './handlers/stubs';

export { authHandlers, vaultHandlers, otpHandlers, settingsHandlers, recoveryHandlers, backupHandlers, stubHandlers };

const handlers: Record<string, DemoHandler> = {
  ...authHandlers,
  ...vaultHandlers,
  ...otpHandlers,
  ...settingsHandlers,
  ...recoveryHandlers,
  ...backupHandlers,
  ...stubHandlers,
};

export function listDemoCommands(): string[] {
  return Object.keys(handlers);
}

export async function demoInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = handlers[cmd];
  if (!handler) throw new Error(`Demo handler not implemented: ${cmd}`);
  const state = await loadState();
  const result = await handler(state, args);
  await saveState(state);
  return result;
}
