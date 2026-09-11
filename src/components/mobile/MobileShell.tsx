'use client';

import {
  useCallback, useEffect, useRef, useState,
  type ReactNode, type TouchEvent as ReactTouchEvent,
} from 'react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'framer-motion';
import {
  Lock, LayoutDashboard, KeyRound, Vault, Trash2,
  Smartphone, QrCode, Grid3X3, Sun, Moon, Wrench, ChevronLeft, Info, User, ShieldAlert,
  PenLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, type VaultEntry } from '@/lib/api';
import { defaultAppState, type AppState } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import Dashboard from '@/components/Dashboard';
import { QROnboardView } from '@/components/SecondaryViews';
import MobileAddEntry from './MobileAddEntry';
import MobileSettings from './MobileSettings';
import MobileAbout from './MobileAbout';
import MobileProfile from './MobileProfile';
import MobileVaultList from './MobileVaultList';
import MobileCodes from './MobileCodes';
import MobileEntryDetail from './MobileEntryDetail';
import MobileTrash from './MobileTrash';
import {
  MobileToolsHub,
  MobileToolView,
  toolTitle,
  type MobileToolId,
} from './MobileTools';
import { backupReminderDue, backupReminderLabel } from '@/lib/backup-reminder';
import { M3NavBar, M3Fab } from './m3';

type MobileTab = 'codes' | 'vault' | 'tools' | 'more';
type MobileStack = 'tabs' | 'feature' | 'add' | 'tool' | 'detail';
type AddIntent = { kind: 'totp' | 'password'; scan?: boolean };

interface NavState {
  stack: MobileStack;
  tab: MobileTab;
  featureView: string;
  toolId: MobileToolId;
  entryId: string | null;
}

const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.85 };
const SPRING_SOFT: Transition = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 };
const EDGE_START = 52;
const COMMIT_RATIO = 0.28;
const COMMIT_VELOCITY = 650;
const UNDO_MS = 10_000;

const MORE_ITEMS: { id: string; label: string; icon: typeof LayoutDashboard; section: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  { id: 'quick-tools', label: 'Quick tools', icon: Wrench, section: 'Overview' },
  { id: 'qr-onboard', label: 'QR onboard', icon: QrCode, section: 'Overview' },
  { id: 'trash', label: 'Trash', icon: Trash2, section: 'Overview' },
  { id: 'profile', label: 'Profile', icon: User, section: 'System' },
  { id: 'mobile-settings', label: 'Android & backup', icon: Smartphone, section: 'System' },
  { id: 'about', label: 'About & legal', icon: Info, section: 'System' },
];

const ROOT_NAV: NavState = {
  stack: 'tabs',
  tab: 'codes',
  featureView: 'dashboard',
  toolId: 'generator',
  entryId: null,
};

declare global {
  interface Window {
    /** Android MainActivity calls this; return true if back was consumed in-app. */
    __genvaultBack?: () => boolean;
  }
}

function isRtl() {
  return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
}

export default function MobileShell() {
  const { user, lockVault, panicLock, travelMode } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const [nav, setNav] = useState<NavState>(ROOT_NAV);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [appState, setAppState] = useState<AppState>(defaultAppState);
  const [loading, setLoading] = useState(true);
  const [showBackupNudge, setShowBackupNudge] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [navDir, setNavDir] = useState<1 | -1>(1);
  const [addIntent, setAddIntent] = useState<AddIntent>({ kind: 'totp', scan: true });
  const [fabMenu, setFabMenu] = useState(false);
  const [undoTrash, setUndoTrash] = useState<{ id: string; name: string } | null>(null);

  /** In-app stack — never rely on WebView history (Android exits when canGoBack is false). */
  const framesRef = useRef<NavState[]>([ROOT_NAV]);
  const navRef = useRef(nav);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const goBackRef = useRef<() => boolean>(() => false);
  const undoTimerRef = useRef<number | null>(null);
  const fabLongRef = useRef<number | null>(null);
  const fabDidLongRef = useRef(false);
  const swipe = useRef<{
    x0: number;
    y0: number;
    t0: number;
    active: boolean;
    locked: boolean | null;
    width: number;
  } | null>(null);

  navRef.current = nav;
  const { stack, tab, featureView, toolId, entryId } = nav;

  const canNavigateBack = useCallback(() => {
    const n = navRef.current;
    return framesRef.current.length > 1 || n.stack !== 'tabs';
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.getVaultEntries(),
        api.getSecurityScore().catch(() => 0),
      ]);
      setEntries(list);
      setAppState((prev) => ({
        ...prev,
        securityScore: s,
        totalCredentials: list.length,
        isOnboarded: true,
      }));
    } catch {
      /* offline / locked */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setShowBackupNudge(backupReminderDue()); }, []);

  /** Non-passive move listener so we can prevent scroll once swipe-back locks. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      const s = swipe.current;
      if (!s?.active || !s.locked || e.touches.length !== 1) return;
      if (e.cancelable) e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - s.x0;
      const progressDx = isRtl() ? -dx : dx;
      const clamped = Math.max(0, Math.min(s.width, progressDx));
      setDragX(clamped);
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  const pushNav = useCallback((next: NavState) => {
    setNavDir(1);
    framesRef.current = [...framesRef.current, next];
    setNav(next);
  }, []);

  const replaceNav = useCallback((next: NavState) => {
    const frames = framesRef.current.slice();
    if (frames.length === 0) frames.push(next);
    else frames[frames.length - 1] = next;
    framesRef.current = frames;
    setNav(next);
  }, []);

  const resetTo = useCallback((next: NavState) => {
    setNavDir(1);
    framesRef.current = [next];
    setNav(next);
  }, []);

  const goBack = useCallback((): boolean => {
    setDragging(false);
    setDragX(0);

    if (framesRef.current.length > 1) {
      setNavDir(-1);
      framesRef.current = framesRef.current.slice(0, -1);
      setNav(framesRef.current[framesRef.current.length - 1]);
      return true;
    }

    // Nested UI without a stacked frame (desync) → still leave the screen
    if (navRef.current.stack !== 'tabs') {
      setNavDir(-1);
      const root: NavState = {
        ...ROOT_NAV,
        tab: navRef.current.tab === 'tools' ? 'more' : navRef.current.tab,
      };
      framesRef.current = [root];
      setNav(root);
      return true;
    }

    // Root tab — do not exit; Android MainActivity will finish only if we return false
    // Returning false allows leaving the app from Codes (root) via system back.
    return false;
  }, []);

  goBackRef.current = goBack;

  useEffect(() => () => {
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    if (fabLongRef.current) window.clearTimeout(fabLongRef.current);
  }, []);

  useEffect(() => {
    window.__genvaultBack = () => goBackRef.current();
    return () => {
      delete window.__genvaultBack;
    };
  }, []);

  const onSwipeStart = useCallback((e: ReactTouchEvent) => {
    if (reduceMotion || e.touches.length !== 1 || !canNavigateBack()) {
      swipe.current = null;
      return;
    }
    const t = e.touches[0];
    const rtl = isRtl();
    const w = window.innerWidth;
    const fromEdge = rtl ? t.clientX >= w - EDGE_START : t.clientX <= EDGE_START;
    // Nested screens: allow starting from a wider leading strip
    const nested = navRef.current.stack !== 'tabs';
    const fromStrip = rtl
      ? t.clientX >= w * 0.72
      : t.clientX <= w * 0.28;
    if (!fromEdge && !(nested && fromStrip)) {
      swipe.current = null;
      return;
    }
    swipe.current = {
      x0: t.clientX,
      y0: t.clientY,
      t0: performance.now(),
      active: true,
      locked: null,
      width: w,
    };
  }, [canNavigateBack, reduceMotion]);

  const onSwipeMove = useCallback((e: ReactTouchEvent) => {
    const s = swipe.current;
    if (!s?.active || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x0;
    const dy = t.clientY - s.y0;
    const rtl = isRtl();
    const progressDx = rtl ? -dx : dx;

    if (s.locked === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.15) {
        s.locked = false;
        swipe.current = null;
        setDragging(false);
        setDragX(0);
        return;
      }
      if (progressDx > 6) {
        s.locked = true;
        setDragging(true);
      }
    }
  }, []);

  const onSwipeEnd = useCallback((e: ReactTouchEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s?.active || !s.locked) {
      setDragging(false);
      setDragX(0);
      return;
    }
    const t = e.changedTouches[0];
    const dx = t ? t.clientX - s.x0 : (isRtl() ? -dragX : dragX);
    const progressDx = isRtl() ? -dx : dx;
    const dt = Math.max(16, performance.now() - s.t0);
    const velocity = (progressDx / dt) * 1000;
    const commit =
      progressDx > s.width * COMMIT_RATIO || velocity > COMMIT_VELOCITY;

    if (commit && canNavigateBack()) {
      setDragging(false);
      setDragX(s.width);
      window.setTimeout(() => {
        goBack();
      }, reduceMotion ? 0 : 160);
    } else {
      setDragging(false);
      setDragX(0);
    }
  }, [canNavigateBack, dragX, goBack, reduceMotion]);

  const openAdd = (intent: AddIntent = { kind: 'totp', scan: true }) => {
    setFabMenu(false);
    setAddIntent(intent);
    pushNav({ stack: 'add', tab, featureView, toolId, entryId: null });
  };

  const openTool = (id: MobileToolId) => {
    pushNav({ stack: 'tool', tab: 'tools', featureView, toolId: id, entryId: null });
  };

  const openEntry = (id: string) => {
    pushNav({ stack: 'detail', tab, featureView, toolId, entryId: id });
  };

  const openFeature = (id: string) => {
    if (id === 'quick-tools') {
      replaceNav({ stack: 'tabs', tab: 'tools', featureView, toolId, entryId: null });
      return;
    }
    pushNav({ stack: 'feature', tab: 'more', featureView: id, toolId, entryId: null });
  };

  const offerUndoTrash = (info: { id: string; name: string }) => {
    setUndoTrash(info);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setUndoTrash(null), UNDO_MS);
  };

  const undoSoftDelete = async () => {
    if (!undoTrash) return;
    const id = undoTrash.id;
    setUndoTrash(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    try {
      await api.restoreVaultEntry(id);
      await refresh();
    } catch {
      /* keep UI calm; entry remains in trash */
    }
  };

  const clearFabLong = () => {
    if (fabLongRef.current) {
      window.clearTimeout(fabLongRef.current);
      fabLongRef.current = null;
    }
  };

  const setTab = (next: MobileTab) => {
    if (stack === 'tabs' && next === tab) return;
    pushNav({ stack: 'tabs', tab: next, featureView, toolId, entryId: null });
  };

  const visibleEntries = travelMode
    ? entries.filter((e) => !(e.tags ?? []).includes('travel-hide'))
    : entries;

  const featureTitle =
    MORE_ITEMS.find((i) => i.id === featureView)?.label ?? 'Feature';
  const selected = visibleEntries.find((e) => e.id === entryId) ?? null;
  const headerSub =
    stack === 'feature' ? featureTitle
      : stack === 'add' ? t('mobile.add.title')
        : stack === 'tool' ? toolTitle(toolId)
          : stack === 'detail' ? (selected?.name ?? 'Entry')
            : 'Hello';

  const isDark = theme !== 'light';
  const showBack = canNavigateBack();
  const pageKey =
    stack === 'add' ? 'add'
      : stack === 'detail' && selected ? `detail-${selected.id}`
        : stack === 'tool' ? `tool-${toolId}`
          : stack === 'feature' ? `feature-${featureView}`
            : `tab-${tab}`;

  useEffect(() => {
    if (stack === 'detail' && !selected && entryId) {
      replaceNav({ stack: 'tabs', tab: 'vault', featureView, toolId, entryId: null });
    }
  }, [stack, selected, entryId, replaceNav, featureView, toolId]);

  const pageTransition = reduceMotion
    ? { duration: 0.01 }
    : SPRING;

  const enterX = navDir === 1 ? 36 : -24;
  const exitX = navDir === 1 ? -18 : 42;
  const dragProgress = dragging || dragX > 0
    ? Math.min(1, dragX / Math.max(1, typeof window !== 'undefined' ? window.innerWidth : 390))
    : 0;
  const rtl = isRtl();
  const dragStyle = dragX > 0
    ? {
        transform: `translate3d(${rtl ? -dragX : dragX}px,0,0)`,
        transition: dragging ? 'none' : 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        boxShadow: dragProgress > 0.02
          ? `${rtl ? '6px' : '-6px'} 0 24px rgba(0,0,0,${0.18 * dragProgress})`
          : undefined,
      }
    : undefined;

  return (
    <div
      ref={rootRef}
      className="m3-mobile-root fixed inset-0 flex flex-col overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onTouchStart={onSwipeStart}
      onTouchMove={onSwipeMove}
      onTouchEnd={onSwipeEnd}
      onTouchCancel={() => {
        swipe.current = null;
        setDragging(false);
        setDragX(0);
      }}
    >
      {/* Dim previous layer while swiping back */}
      {dragProgress > 0.01 && (
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background: `color-mix(in srgb, var(--md-on-surface) ${Math.round((1 - dragProgress) * 18)}%, transparent)`,
          }}
          aria-hidden
        />
      )}

      <header className="relative z-10 flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <AnimatePresence initial={false}>
            {(stack !== 'tabs') && (
              <motion.button
                key="back"
                type="button"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={SPRING_SOFT}
                onClick={goBack}
                className="min-h-[44px] min-w-[44px] rounded-full m3-glass flex items-center justify-center text-[color:var(--md-on-surface)]"
                aria-label={t('common.back')}
              >
                <ChevronLeft className={cn('w-5 h-5', rtl && 'rotate-180')} />
              </motion.button>
            )}
          </AnimatePresence>
          <div className="w-10 h-10 rounded-[var(--m3-radius-md)] overflow-hidden border border-[color:var(--md-outline)] flex-shrink-0 bg-[color:var(--md-surface-container)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/genvault-icon.png"
              alt=""
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="m3-label">{headerSub}</p>
            {stack === 'tabs' ? (
              <button
                type="button"
                onClick={() => openFeature('profile')}
                className="m3-title-md truncate leading-tight text-left hover:text-[color:var(--md-primary)] transition-colors"
              >
                {user?.displayName || 'Vault'}
              </button>
            ) : (
              <p className="m3-title-md truncate leading-tight">GenVault</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="min-h-[44px] min-w-[44px] rounded-full m3-glass flex items-center justify-center text-[color:var(--md-on-surface-variant)] active:scale-95 transition-[color,transform] duration-200"
            aria-label={isDark ? t('theme.light') : t('theme.dark')}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => void panicLock()}
            className="min-h-[44px] min-w-[44px] rounded-full m3-glass flex items-center justify-center text-accent-danger active:scale-95 transition-[color,transform] duration-200"
            aria-label="Panic lock"
            title="Lock vault and wipe staging"
          >
            <ShieldAlert className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => lockVault()}
            className="min-h-[44px] min-w-[44px] rounded-full m3-glass flex items-center justify-center text-[color:var(--md-on-surface-variant)] active:scale-95 transition-[color,transform] duration-200"
            aria-label={t('common.lock')}
          >
            <Lock className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 touch-pan-y"
        style={dragStyle}
      >
        {travelMode && stack === 'tabs' && (
          <motion.div
            className="mb-3 m3-glass px-3 py-2.5 border border-[color:var(--md-primary)]/25"
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
          >
            <p className="text-xs text-[color:var(--md-primary)] font-medium">Travel mode active</p>
            <p className="text-[11px] text-[color:var(--md-on-surface-variant)] mt-0.5">
              Sensitive entries hidden · export blocked · auto-lock capped at 2 min
            </p>
          </motion.div>
        )}

        {showBackupNudge && stack === 'tabs' && (
          <motion.div
            className="mb-3 m3-glass px-3 py-2 flex items-center gap-2"
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
            role="status"
          >
            <button
              type="button"
              className="flex-1 min-h-[48px] text-left text-xs text-[color:var(--md-on-surface)]"
              onClick={() => {
                setShowBackupNudge(false);
                openFeature('mobile-settings');
              }}
            >
              <span className="text-[color:var(--md-primary)] font-medium">{t('mobile.backup.reminder')}</span>
              {' · '}
              {backupReminderLabel()}
            </button>
            <button
              type="button"
              className="min-h-[48px] min-w-[48px] rounded-full text-sm text-[color:var(--md-on-surface-variant)]"
              onClick={() => setShowBackupNudge(false)}
              aria-label={t('common.later')}
            >
              ×
            </button>
          </motion.div>
        )}

        <AnimatePresence mode="wait" initial={false} custom={navDir}>
          <motion.div
            key={pageKey}
            custom={navDir}
            initial={reduceMotion ? false : { opacity: 0.55, x: enterX }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0.4, x: exitX }}
            transition={pageTransition}
            className="min-h-full will-change-transform"
          >
            {stack === 'add' ? (
              <MobileAddEntry
                initialKind={addIntent.kind}
                autoScan={!!addIntent.scan}
                onBack={goBack}
                onSaved={async (savedId) => {
                  await refresh();
                  if (savedId) {
                    pushNav({
                      stack: 'detail',
                      tab: 'codes',
                      featureView,
                      toolId,
                      entryId: savedId,
                    });
                    return;
                  }
                  resetTo({
                    stack: 'tabs',
                    tab: addIntent.kind === 'password' ? 'vault' : 'codes',
                    featureView,
                    toolId,
                    entryId: null,
                  });
                }}
              />
            ) : stack === 'detail' && selected ? (
              <MobileEntryDetail
                entry={selected}
                onBack={goBack}
                onDeleted={async (info) => {
                  offerUndoTrash(info);
                  await refresh();
                  goBack();
                }}
                onUpdated={refresh}
              />
            ) : stack === 'tool' ? (
              <MobileToolView id={toolId} onCreated={refresh} />
            ) : stack === 'feature' ? (
              renderFeature(featureView, appState, visibleEntries, refresh, openFeature)
            ) : (
              <>
                {tab === 'codes' && (
                  <MobileCodes
                    entries={visibleEntries}
                    loading={loading}
                    onOpenEntry={openEntry}
                    onScanQr={() => openAdd({ kind: 'totp', scan: true })}
                    onManual={() => openAdd({ kind: 'totp', scan: false })}
                  />
                )}
                {tab === 'vault' && (
                  <MobileVaultList
                    entries={visibleEntries}
                    loading={loading}
                    onOpenEntry={openEntry}
                    onRefresh={refresh}
                    onAddPassword={() => openAdd({ kind: 'password' })}
                  />
                )}
                {tab === 'tools' && <MobileToolsHub onOpen={openTool} />}
                {tab === 'more' && (
                  <div className="pt-2">
                    <h2 className="m3-title-lg mb-1">{t('mobile.more.title')}</h2>
                    <p className="text-xs text-[color:var(--md-on-surface-variant)] mb-3">
                      {t('mobile.more.subtitle')}
                    </p>
                    <MoreMenu onSelect={openFeature} />
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {stack === 'tabs' && (
          <motion.div
            key="nav"
            className="absolute left-4 right-4 bottom-4 z-30"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
            initial={reduceMotion ? false : { y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={SPRING_SOFT}
          >
            <M3NavBar aria-label="Primary">
              <NavBtn
                label={t('mobile.tab.codes')}
                active={tab === 'codes'}
                onClick={() => setTab('codes')}
                icon={<KeyRound className="w-5 h-5" />}
              />
              <div className="w-12" aria-hidden />
              <NavBtn
                label={t('mobile.tab.vault')}
                active={tab === 'vault'}
                onClick={() => setTab('vault')}
                icon={<Vault className="w-5 h-5" />}
              />
              <NavBtn
                label={t('mobile.tab.more')}
                active={tab === 'more' || tab === 'tools'}
                onClick={() => setTab('more')}
                icon={<Grid3X3 className="w-5 h-5" />}
              />

              <M3Fab
                onClick={() => {
                  if (fabDidLongRef.current) {
                    fabDidLongRef.current = false;
                    return;
                  }
                  openAdd({ kind: 'totp', scan: true });
                }}
                onPointerDown={() => {
                  fabDidLongRef.current = false;
                  clearFabLong();
                  fabLongRef.current = window.setTimeout(() => {
                    fabDidLongRef.current = true;
                    setFabMenu(true);
                  }, 450);
                }}
                onPointerUp={clearFabLong}
                onPointerLeave={clearFabLong}
                onPointerCancel={clearFabLong}
                onContextMenu={(e) => {
                  e.preventDefault();
                  fabDidLongRef.current = true;
                  setFabMenu(true);
                }}
                className="absolute left-1/2 -translate-x-1/2 -top-5 m3-fab-bounce m3-fab-seal"
                aria-label={t('mobile.add')}
                aria-haspopup="menu"
                aria-expanded={fabMenu}
              >
                <VaultSealIcon />
              </M3Fab>
            </M3NavBar>

            <AnimatePresence>
              {fabMenu && (
                <motion.div
                  key="fab-menu"
                  className="absolute left-1/2 -translate-x-1/2 bottom-[4.75rem] z-40 w-[min(100%,16rem)] m3-glass p-2 space-y-1"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={SPRING_SOFT}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full min-h-[48px] px-3 rounded-[var(--m3-radius-md)] text-sm font-medium text-left flex items-center gap-2 text-[color:var(--md-on-surface)] hover:bg-[color-mix(in_srgb,var(--md-primary)_8%,transparent)]"
                    onClick={() => openAdd({ kind: 'password' })}
                  >
                    <KeyRound className="w-4 h-4" aria-hidden />
                    Add password
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full min-h-[48px] px-3 rounded-[var(--m3-radius-md)] text-sm font-medium text-left flex items-center gap-2 text-[color:var(--md-on-surface)] hover:bg-[color-mix(in_srgb,var(--md-primary)_8%,transparent)]"
                    onClick={() => openAdd({ kind: 'totp', scan: false })}
                  >
                    <PenLine className="w-4 h-4" aria-hidden />
                    Manual secret
                  </button>
                  <button
                    type="button"
                    className="w-full min-h-[40px] text-xs text-[color:var(--md-on-surface-variant)]"
                    onClick={() => setFabMenu(false)}
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {undoTrash && (
          <motion.div
            key="undo-snack"
            className="absolute left-4 right-4 z-40 flex items-center gap-3 m3-glass px-4 py-3"
            style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING_SOFT}
            role="status"
          >
            <p className="flex-1 text-sm text-[color:var(--md-on-surface)] truncate">
              Moved to trash
            </p>
            <button
              type="button"
              className="min-h-[48px] px-3 text-sm font-semibold text-[color:var(--md-primary)]"
              onClick={() => void undoSoftDelete()}
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invisible leading edge hit target so swipe is easy */}
      {showBack && (
        <div
          className="absolute top-0 bottom-0 z-40 w-3"
          style={{ [rtl ? 'right' : 'left']: 0 }}
          aria-hidden
        />
      )}
    </div>
  );
}

function renderFeature(
  id: string,
  appState: AppState,
  entries: VaultEntry[],
  refresh: () => void,
  goFeature: (id: string) => void,
) {
  switch (id) {
    case 'dashboard':
      return <Dashboard appState={appState} vaultEntries={entries as never} />;
    case 'qr-onboard':
      return <QROnboardView />;
    case 'profile':
      return (
        <MobileProfile
          entryCount={entries.length}
          totpCount={entries.filter((e) => (e.period ?? 0) > 0 || e.is_hotp).length}
          securityScore={appState.securityScore}
        />
      );
    case 'mobile-settings':
      return <MobileSettings onRefresh={refresh} onOpenAbout={() => goFeature('about')} />;
    case 'about':
      return <MobileAbout />;
    case 'trash':
      return <MobileTrash onChanged={refresh} />;
    default:
      return <Dashboard appState={appState} vaultEntries={entries as never} />;
  }
}

function MoreMenu({ onSelect }: { onSelect: (id: string) => void }) {
  let lastSection = '';
  return (
    <div className="space-y-1 pb-4">
      {MORE_ITEMS.map((item) => {
        const showSection = item.section !== lastSection;
        lastSection = item.section;
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {showSection && (
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--md-on-surface-variant)] pt-3 pb-1 px-1">
                {item.section}
              </p>
            )}
            <button
              type="button"
              onClick={() => onSelect(item.id)}
              className="w-full flex items-center gap-3 min-h-[48px] px-3 rounded-[var(--m3-radius-lg)] text-left text-[color:var(--md-on-surface)] hover:bg-[color-mix(in_srgb,var(--md-primary)_8%,transparent)] active:scale-[0.99] transition-[background-color,transform] duration-200"
            >
              <span className="w-9 h-9 rounded-[var(--m3-radius-md)] bg-[color:var(--md-primary-container)] flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-[color:var(--md-on-primary-container)]" />
              </span>
              <span className="text-sm font-medium">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function NavBtn({
  label, active, onClick, icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[48px] rounded-2xl transition-colors duration-200 active:scale-95',
        active ? 'text-[color:var(--md-primary)]' : 'text-[color:var(--md-on-surface-variant)]',
      )}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      <span className={cn('transition-transform duration-200', active && 'scale-110')}>{icon}</span>
      <span className="text-[9px] font-medium">{label}</span>
      {active && (
        <motion.span
          layoutId="m3-nav-dot"
          className="w-4 h-0.5 rounded-full bg-[color:var(--md-primary)] mt-0.5"
          transition={SPRING_SOFT}
        />
      )}
    </button>
  );
}

/** Center action mark — vault seal (not a generic +). */
function VaultSealIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden className="drop-shadow-sm">
      <path
        d="M16 2.5 L28 9.2 V18.5 C28 24.2 22.8 28.8 16 30.5 C9.2 28.8 4 24.2 4 18.5 V9.2 L16 2.5Z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="5.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
      <path d="M16 10.8 V13.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 18.8 V21.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10.8 16 H13.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18.8 16 H21.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
