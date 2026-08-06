'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, LayoutDashboard, KeyRound, Vault, Smartphone, QrCode,
  Activity, Settings, Eye, EyeOff, CloudOff, Cloud,
  HardDrive, AlertTriangle, FileKey, ChevronLeft, ChevronRight,
  Fingerprint, RefreshCw, User, Sun, Moon, Monitor, FolderLock, FileLock2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { COMPANY, PRODUCT } from '@/lib/company';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  syncStatus: string;
  securityScore: number;
  stealthMode: boolean;
  onToggleStealth: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const navItems = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard, sectionKey: 'nav.overview' },
  { id: 'authenticator', labelKey: 'nav.authenticator', icon: KeyRound, sectionKey: 'nav.overview' },
  { id: 'vault', labelKey: 'nav.vault', icon: Vault, sectionKey: 'nav.overview' },
  { id: 'folder-lock', labelKey: 'nav.folderLock', icon: FolderLock, sectionKey: 'nav.overview' },
  { id: 'file-lock', labelKey: 'nav.fileLock', icon: FileLock2, sectionKey: 'nav.overview' },
  { id: 'devices', labelKey: 'nav.devices', icon: Smartphone, sectionKey: 'nav.management' },
  { id: 'sessions', labelKey: 'nav.sessions', icon: Activity, sectionKey: 'nav.management' },
  { id: 'qr-onboard', labelKey: 'nav.qr', icon: QrCode, sectionKey: 'nav.management' },
  { id: 'hardware-keys', labelKey: 'nav.hardware', icon: HardDrive, sectionKey: 'nav.security' },
  { id: 'biometrics', labelKey: 'nav.biometrics', icon: Fingerprint, sectionKey: 'nav.security' },
  { id: 'threat-detection', labelKey: 'nav.threats', icon: AlertTriangle, sectionKey: 'nav.security' },
  { id: 'recovery', labelKey: 'nav.recovery', icon: FileKey, sectionKey: 'nav.security' },
  { id: 'profile', labelKey: 'nav.profile', icon: User, sectionKey: 'nav.system' },
  { id: 'settings', labelKey: 'nav.settings', icon: Settings, sectionKey: 'nav.system' },
];

const themeConfig: Record<Theme, { icon: typeof Sun; label: string; color: string }> = {
  dark: { icon: Moon, label: 'Dark', color: 'text-cyber-blue' },
  light: { icon: Sun, label: 'Light', color: 'text-amber-400' },
  'pitch-black': { icon: Monitor, label: 'AMOLED', color: 'text-vault-muted' },
};

function ThemeSwitcher({ collapsed }: { collapsed: boolean }) {
  const { theme, cycleTheme } = useTheme();
  const config = themeConfig[theme];
  const ThemeIcon = config.icon;

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'w-full flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
        collapsed && 'justify-center px-0',
        config.color, 'hover:text-vault-light'
      )}
      title={`Theme: ${config.label} — Click to cycle`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <ThemeIcon className="w-4 h-4 flex-shrink-0" />
      </motion.div>
      <AnimatePresence>
        {!collapsed && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs">
            {config.label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function Sidebar({
  activeView, onViewChange, syncStatus, securityScore,
  stealthMode, onToggleStealth, collapsed, onToggleCollapse
}: SidebarProps) {
  const { t } = useI18n();
  const sections = [...new Set(navItems.map(i => i.sectionKey))];

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="h-full flex flex-col glass-heavy border-r border-vault-border/50 relative z-20"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-vault-border/30">
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyber-cyan/20 to-cyber-purple/20 flex items-center justify-center border border-cyber-cyan/30">
            <Shield className="w-5 h-5 text-cyber-cyan" />
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-cyber-emerald border-2 border-vault-dark" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col min-w-0"
            >
              <span className="text-sm font-semibold text-vault-light tracking-wide">{PRODUCT.name}</span>
              <span className="text-[10px] text-vault-muted tracking-widest uppercase">{COMPANY.name}</span>
              <span className="text-[9px] text-cyber-cyan/70 tracking-wide">{PRODUCT.tagline}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav data-tour="sidebar-nav" className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-thin">
        {sections.map(sectionKey => (
          <div key={sectionKey}>
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-medium text-vault-muted/60 uppercase tracking-widest px-3 pt-4 pb-1.5"
                >
                  {t(sectionKey)}
                </motion.p>
              )}
            </AnimatePresence>
            {navItems.filter(i => i.sectionKey === sectionKey).map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <motion.button
                  key={item.id}
                  data-tour={
                    item.id === 'authenticator' ? 'nav-authenticator'
                    : item.id === 'vault' ? 'nav-vault'
                    : item.id === 'settings' ? 'nav-settings'
                    : undefined
                  }
                  onClick={() => onViewChange(item.id)}
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-lg transition-all duration-200 group relative',
                    collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2',
                    isActive
                      ? 'bg-cyber-cyan/10 text-cyber-cyan'
                      : 'text-vault-muted hover:text-vault-light hover:bg-white/[0.03]'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-cyber-cyan"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                  <Icon className={cn('flex-shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        className="text-[13px] font-medium truncate"
                      >
                        {t(item.labelKey)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Controls */}
      <div className="border-t border-vault-border/30 p-2 space-y-1">
        {/* Sync Status */}
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2',
          collapsed && 'justify-center px-0'
        )}>
          {syncStatus === 'synced' ? (
            <Cloud className="w-4 h-4 text-cyber-emerald flex-shrink-0" />
          ) : syncStatus === 'syncing' ? (
            <RefreshCw className="w-4 h-4 text-cyber-cyan animate-spin flex-shrink-0" />
          ) : (
            <CloudOff className="w-4 h-4 text-vault-muted flex-shrink-0" />
          )}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-xs text-vault-muted capitalize"
              >
                {syncStatus}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Stealth Toggle */}
        <button
          data-tour="stealth-toggle"
          onClick={onToggleStealth}
          title={stealthMode ? 'Stealth on — content hidden. Click to show.' : 'Hide sensitive vault content'}
          className={cn(
            'w-full flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
            collapsed && 'justify-center px-0',
            stealthMode ? 'text-cyber-purple bg-cyber-purple/10' : 'text-vault-muted hover:text-vault-light'
          )}
        >
          {stealthMode ? <EyeOff className="w-4 h-4 flex-shrink-0" /> : <Eye className="w-4 h-4 flex-shrink-0" />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs">
                {stealthMode ? 'Stealth On — hidden' : 'Stealth Off'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Theme Switcher */}
        <ThemeSwitcher collapsed={collapsed} />

        {/* Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center py-2 text-vault-muted hover:text-vault-light transition-colors rounded-lg hover:bg-white/[0.03]"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
