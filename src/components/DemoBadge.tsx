'use client';

import { isDemoMode } from '@/lib/demo/flag';

export default function DemoBadge() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed top-3 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-[color:var(--md-primary)]/40 bg-[color:var(--md-surface-container)]/90 px-3 py-1 text-xs font-semibold tracking-wide text-[color:var(--md-primary)]"
      style={{ marginTop: 'env(safe-area-inset-top)' }}
    >
      Demo
    </div>
  );
}
