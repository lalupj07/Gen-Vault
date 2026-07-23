'use client';

import { motion } from 'framer-motion';
import { Shield, Key, HardDrive, Cloud, AlertTriangle, LogIn, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SecurityEvent } from '@/lib/api';

const iconMap: Record<string, any> = {
  login: LogIn,
  login_success: LogIn,
  otp_generated: Key,
  vault_access: Shield,
  vault_entry_added: Key,
  vault_entry_removed: Key,
  device_added: HardDrive,
  device_removed: HardDrive,
  account_created: CheckCircle2,
  password_changed: Shield,
  session_revoked: AlertTriangle,
  all_sessions_revoked: AlertTriangle,
  backup: Cloud,
  threat: AlertTriangle,
  sync: CheckCircle2,
};

const severityStyles: Record<string, string> = {
  info: 'text-cyber-cyan border-cyber-cyan/20 bg-cyber-cyan/5',
  warning: 'text-accent-warning border-accent-warning/20 bg-accent-warning/5',
  critical: 'text-accent-danger border-accent-danger/20 bg-accent-danger/5',
  success: 'text-cyber-emerald border-cyber-emerald/20 bg-cyber-emerald/5',
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SecurityEventLog({ events }: { events: SecurityEvent[] }) {
  return (
    <div className="space-y-2">
      {events.map((event, i) => {
        const Icon = iconMap[event.event_type] || Shield;
        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'flex items-start gap-3 p-3 rounded-xl border transition-colors',
              severityStyles[event.severity],
              'hover:bg-white/[0.02]'
            )}
          >
            <div className="mt-0.5 flex-shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs leading-relaxed text-vault-text">{event.message}</p>
              <p className="text-[10px] mt-1 opacity-50">{timeAgo(event.timestamp)}</p>
            </div>
            <div className={cn(
              'flex-shrink-0 w-1.5 h-1.5 rounded-full mt-2',
              event.severity === 'critical' ? 'bg-accent-danger animate-pulse' :
              event.severity === 'warning' ? 'bg-accent-warning' :
              event.severity === 'success' ? 'bg-cyber-emerald' : 'bg-cyber-cyan/50'
            )} />
          </motion.div>
        );
      })}
    </div>
  );
}
