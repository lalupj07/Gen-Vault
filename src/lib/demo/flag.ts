export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_GENVAULT_DEMO === 'true';
}
