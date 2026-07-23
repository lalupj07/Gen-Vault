'use client';

import { useCallback, useState } from 'react';
import { Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { checkDeviceTime, type TimeSyncResult } from '@/lib/time-sync';
import { cn } from '@/lib/utils';

export default function MobileTimeSync() {
  const [result, setResult] = useState<TimeSyncResult>(() => checkDeviceTime());

  const refresh = useCallback(() => {
    setResult(checkDeviceTime());
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyber-cyan" />
          <span className="text-sm font-medium text-vault-light">Time sync checker</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-vault-muted hover:text-cyber-cyan"
          aria-label="Refresh time check"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-vault-muted">
        TOTP codes depend on your device clock. GenVault stays offline — confirm automatic time is on.
      </p>
      <div className="rounded-xl bg-vault-black/50 border border-vault-border p-3 space-y-1">
        <p className="text-sm text-vault-light">{result.localLabel}</p>
        <p className="text-[11px] text-vault-muted font-mono">UTC {result.utcIso}</p>
        <p className="text-[11px] text-vault-muted">{result.timezone}</p>
      </div>
      <ul className="space-y-1.5">
        {result.warnings.map((w) => (
          <li
            key={w}
            className={cn(
              'flex gap-2 text-xs rounded-xl px-3 py-2 border',
              result.ok
                ? 'border-cyber-cyan/25 text-vault-muted bg-cyber-cyan/5'
                : 'border-accent-warning/40 text-accent-warning bg-accent-warning/10',
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
