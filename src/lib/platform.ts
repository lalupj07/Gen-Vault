import { api } from './api';

export async function getOsPlatform(): Promise<string> {
  try {
    return await api.getPlatform();
  } catch {
    return 'unknown';
  }
}

/** True when running inside the Android Tauri shell, or `?mobile=1` for UI preview. */
export async function isAndroidShell(): Promise<boolean> {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    if (q.get('mobile') === '1') return true;
  }
  try {
    const { isDemoMode } = await import('./demo/flag');
    if (isDemoMode()) return true;
  } catch {
    // ignore
  }
  const os = await getOsPlatform();
  return os === 'android' || os === 'demo-web';
}
