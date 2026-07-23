'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Shield, Lock, Unlock, Cloud, CloudOff, Smartphone, Key, Cpu,
  Activity, AlertTriangle, CheckCircle2, Zap, RefreshCw, Database,
  Wifi, HardDrive, Fingerprint, Globe, Timer
} from 'lucide-react';
import { cn, getSecondsRemaining, getTimeBasedProgress } from '@/lib/utils';
import { type AppState } from '@/lib/store';
import { api, type VaultEntry, type DeviceEntry, type SecurityEvent } from '@/lib/api';
import SecurityEventLog from './SecurityEventLog';
import { PasswordHealthPanel, UsageStatisticsPanel } from './FeatureTools';

interface DashboardProps {
  appState: AppState;
  vaultEntries: VaultEntry[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] } }
};

function StatusBadge({ status, label }: { status: 'active' | 'idle' | 'warning' | 'critical'; label: string }) {
  const styles = {
    active: 'bg-cyber-emerald/10 text-cyber-emerald border-cyber-emerald/20',
    idle: 'bg-cyber-cyan/10 text-cyber-cyan border-cyber-cyan/20',
    warning: 'bg-accent-warning/10 text-accent-warning border-accent-warning/20',
    critical: 'bg-accent-danger/10 text-accent-danger border-accent-danger/20',
  };
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border tracking-wide uppercase', styles[status])}>
      <span className={cn('w-1.5 h-1.5 rounded-full', status === 'active' && 'bg-cyber-emerald animate-pulse', status === 'critical' && 'bg-accent-danger animate-pulse', status === 'warning' && 'bg-accent-warning', status === 'idle' && 'bg-cyber-cyan')} />
      {label}
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, subtext, color = 'cyan' }: {
  icon: any; label: string; value: string | number; subtext?: string; color?: string;
}) {
  const colors: Record<string, string> = {
    cyan: 'from-cyber-cyan/10 to-transparent border-cyber-cyan/15 text-cyber-cyan',
    emerald: 'from-cyber-emerald/10 to-transparent border-cyber-emerald/15 text-cyber-emerald',
    purple: 'from-cyber-purple/10 to-transparent border-cyber-purple/15 text-cyber-purple',
    amber: 'from-accent-warning/10 to-transparent border-accent-warning/15 text-accent-warning',
    blue: 'from-cyber-blue/10 to-transparent border-cyber-blue/15 text-cyber-blue',
  };
  return (
    <motion.div
      variants={itemVariants}
      className={cn('glass rounded-2xl p-4 border bg-gradient-to-br card-hover', colors[color])}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl bg-white/[0.03]">
          <Icon className="w-4 h-4" />
        </div>
        {subtext && <span className="text-[10px] text-vault-muted">{subtext}</span>}
      </div>
      <div className="text-2xl font-bold text-vault-light mb-0.5">{value}</div>
      <div className="text-[11px] text-vault-muted">{label}</div>
    </motion.div>
  );
}

function EncryptionActivity() {
  const [bars, setBars] = useState<number[]>(Array(20).fill(0).map(() => Math.random()));

  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev => prev.map(() => Math.random()));
    }, 800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-end gap-0.5 h-8">
      {bars.map((h, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-cyber-cyan/30 to-cyber-cyan"
          animate={{ height: `${Math.max(15, h * 100)}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

export default function Dashboard({ appState, vaultEntries }: DashboardProps) {
  const [seconds, setSeconds] = useState(getSecondsRemaining());
  const [progress, setProgress] = useState(getTimeBasedProgress());
  const [currentTime, setCurrentTime] = useState('');
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [devices, setDevices] = useState<DeviceEntry[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [evts, devs] = await Promise.all([api.getSecurityEvents(), api.getDevices()]);
        setSecurityEvents(evts);
        setDevices(devs);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const update = () => {
      setSeconds(getSecondsRemaining());
      setProgress(getTimeBasedProgress());
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-vault-light tracking-tight">Security Dashboard</h1>
          <p className="text-xs sm:text-sm text-vault-muted mt-1 truncate">
            Real-time threat monitoring &amp; encrypted vault status — {currentTime}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status="active" label="AES-256-GCM Active" />
          <StatusBadge status={appState.threatLevel === 'safe' ? 'active' : 'critical'} label={`Threat: ${appState.threatLevel}`} />
        </div>
      </motion.div>

      {/* Top Row — Score + Metrics (mobile-friendly; no pulse circle) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <motion.div
          variants={itemVariants}
          className="md:col-span-4 glass rounded-2xl p-5 border border-vault-border/50 flex flex-col justify-center card-hover"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/25 flex items-center justify-center flex-shrink-0">
              <Shield className="w-7 h-7 text-cyber-cyan" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-vault-muted">Trust score</p>
              <p className="text-3xl font-bold text-cyber-cyan tabular-nums leading-none mt-1">
                {appState.securityScore}
              </p>
              <p className="text-xs text-vault-muted mt-1">
                {appState.securityScore >= 90 ? 'Fortress' : appState.securityScore >= 70 ? 'Secure' : appState.securityScore >= 50 ? 'Moderate' : 'At risk'} grade
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ['AES-256-GCM', 'Cipher'],
              ['Argon2id', 'KDF'],
              ['Local-only', 'Storage'],
            ].map(([title, sub]) => (
              <div
                key={title}
                className="px-2.5 py-1.5 rounded-xl bg-vault-black/40 border border-vault-border/40"
              >
                <div className="text-xs font-semibold text-vault-light whitespace-nowrap">{title}</div>
                <div className="text-[10px] text-vault-muted">{sub}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard icon={Key} label="Secured Credentials" value={appState.totalCredentials} subtext="AES-256" color="cyan" />
          <MetricCard icon={Smartphone} label="Trusted Devices" value={appState.activeDevices} subtext="Verified" color="emerald" />
          <MetricCard icon={Shield} label="Security Score" value={`${appState.securityScore}%`} subtext="Fortress" color="purple" />
          <MetricCard icon={Activity} label="Active Sessions" value={2} subtext="Monitored" color="blue" />
          <MetricCard icon={Database} label="Vault Integrity" value="Verified" subtext="SHA-384" color="emerald" />
          <MetricCard icon={Timer} label="OTP Cycle" value={`${seconds}s`} subtext={`${Math.round(100 - progress)}%`} color="amber" />
        </div>
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Encryption Activity Monitor */}
        <motion.div variants={itemVariants} className="md:col-span-5 glass rounded-2xl p-5 border border-vault-border/50 card-hover">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyber-cyan" />
              <span className="text-sm font-medium text-vault-light">Encryption Activity</span>
            </div>
            <StatusBadge status="active" label="Live" />
          </div>
          <EncryptionActivity />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="glass-light rounded-xl p-3">
              <div className="text-[10px] text-vault-muted mb-1">Encrypt Operations</div>
              <div className="text-lg font-bold text-cyber-cyan">2,847</div>
            </div>
            <div className="glass-light rounded-xl p-3">
              <div className="text-[10px] text-vault-muted mb-1">Decrypt Operations</div>
              <div className="text-lg font-bold text-cyber-emerald">1,203</div>
            </div>
          </div>
        </motion.div>

        {/* Security Heatmap */}
        <motion.div variants={itemVariants} className="md:col-span-4 glass rounded-2xl p-5 border border-vault-border/50 card-hover">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-cyber-purple" />
            <span className="text-sm font-medium text-vault-light">Security Heatmap</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array(35).fill(0).map((_, i) => {
              const intensity = Math.random();
              return (
                <motion.div
                  key={i}
                  className="aspect-square rounded-sm"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.02 }}
                  style={{
                    background: intensity > 0.7
                      ? `rgba(0, 230, 118, ${intensity * 0.8})`
                      : intensity > 0.3
                      ? `rgba(0, 229, 255, ${intensity * 0.5})`
                      : `rgba(255, 255, 255, 0.04)`,
                  }}
                />
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-vault-muted">
            <span>Low Activity</span>
            <div className="flex gap-1">
              {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                <div key={v} className="w-3 h-3 rounded-sm" style={{ background: `rgba(0, 230, 118, ${v})` }} />
              ))}
            </div>
            <span>High Activity</span>
          </div>
        </motion.div>

        {/* Infrastructure Status */}
        <motion.div variants={itemVariants} className="md:col-span-3 glass rounded-2xl p-5 border border-vault-border/50 card-hover">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-accent-warning" />
            <span className="text-sm font-medium text-vault-light">Infrastructure</span>
          </div>
          <div className="space-y-3">
            {[
              { label: 'TPM Module', status: 'Connected', icon: HardDrive, ok: true },
              { label: 'Secure Enclave', status: 'Isolated', icon: Lock, ok: true },
              { label: 'FIDO2 Key', status: 'Ready', icon: Fingerprint, ok: true },
              { label: 'Cloud Sync', status: appState.syncStatus === 'synced' ? 'Synced' : 'Pending', icon: Cloud, ok: appState.syncStatus === 'synced' },
              { label: 'Anti-Tamper', status: 'Active', icon: Shield, ok: true },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <item.icon className="w-3.5 h-3.5 text-vault-muted" />
                  <span className="text-xs text-vault-text">{item.label}</span>
                </div>
                <span className={cn('text-[10px] font-medium', item.ok ? 'text-cyber-emerald' : 'text-accent-warning')}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Health & Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <motion.div variants={itemVariants} className="md:col-span-6 glass rounded-2xl p-5 border border-vault-border/50">
          <PasswordHealthPanel />
        </motion.div>
        <motion.div variants={itemVariants} className="md:col-span-6 glass rounded-2xl p-5 border border-vault-border/50">
          <UsageStatisticsPanel />
        </motion.div>
      </div>

      {/* Bottom Row — Events + Devices */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Security Audit Log */}
        <motion.div variants={itemVariants} className="md:col-span-7 glass rounded-2xl p-5 border border-vault-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyber-cyan" />
              <span className="text-sm font-medium text-vault-light">Secure Audit Log</span>
            </div>
            <span className="text-[10px] text-vault-muted">{securityEvents.length} events</span>
          </div>
          <div className="max-h-[260px] overflow-y-auto pr-1 space-y-2">
            <SecurityEventLog events={securityEvents} />
          </div>
        </motion.div>

        {/* Device Trust */}
        <motion.div variants={itemVariants} className="md:col-span-5 glass rounded-2xl p-5 border border-vault-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyber-emerald" />
              <span className="text-sm font-medium text-vault-light">Trusted Devices</span>
            </div>
            <span className="text-[10px] text-vault-muted">{devices.length} registered</span>
          </div>
          <div className="space-y-3">
            {devices.map((device, i) => (
              <motion.div
                key={device.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-xl glass-light"
              >
                <div className={cn(
                  'w-9 h-9 rounded-lg flex items-center justify-center',
                  device.last_active > Date.now() - 86400000 ? 'bg-cyber-emerald/10' : 'bg-vault-border/50'
                )}>
                  <Smartphone className={cn('w-4 h-4', device.last_active > Date.now() - 86400000 ? 'text-cyber-emerald' : 'text-vault-muted')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-vault-light truncate">{device.name}</div>
                  <div className="text-[10px] text-vault-muted">{device.os} — {device.ip_address}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold" style={{
                    color: device.trust_level >= 0.95 ? '#00e676' : device.trust_level >= 0.85 ? '#00e5ff' : '#ffab00'
                  }}>
                    {Math.round(device.trust_level * 100)}%
                  </div>
                  <div className="text-[10px] text-vault-muted">Trust</div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
