import { loadState, saveState } from './store';
import type { DemoHandler } from './types';
import { authHandlers } from './handlers/auth';

export { authHandlers };

const handlers: Record<string, DemoHandler> = {
  ...authHandlers,
};

export async function demoInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  const handler = handlers[cmd];
  if (!handler) throw new Error(`Demo handler not implemented: ${cmd}`);
  const state = await loadState();
  const result = await handler(state, args);
  await saveState(state);
  return result;
}
