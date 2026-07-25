export async function demoInvoke(cmd: string, _args?: Record<string, unknown>): Promise<unknown> {
  throw new Error(`Demo handler not implemented: ${cmd}`);
}
