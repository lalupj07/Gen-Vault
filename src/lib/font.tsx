'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { PREFS_SYNC_EVENT } from '@/lib/prefs-sync';

export type UiFont =
  | 'system'
  | 'sans'
  | 'rounded'
  | 'serif'
  | 'mono'
  | 'plex'
  | 'noto'
  | 'book'
  | 'display';

export const UI_FONTS: { id: UiFont; labelKey: string }[] = [
  { id: 'system', labelKey: 'font.system' },
  { id: 'sans', labelKey: 'font.sans' },
  { id: 'rounded', labelKey: 'font.rounded' },
  { id: 'serif', labelKey: 'font.serif' },
  { id: 'mono', labelKey: 'font.mono' },
  { id: 'plex', labelKey: 'font.plex' },
  { id: 'noto', labelKey: 'font.noto' },
  { id: 'book', labelKey: 'font.book' },
  { id: 'display', labelKey: 'font.display' },
];

const STORAGE_KEY = 'genvault_ui_font';
const FONT_IDS: UiFont[] = UI_FONTS.map((f) => f.id);
const FONT_CLASSES = FONT_IDS.map((id) => `font-ui-${id}`);

interface FontContextType {
  font: UiFont;
  setFont: (font: UiFont) => Promise<void>;
  fonts: typeof UI_FONTS;
}

const FontContext = createContext<FontContextType | null>(null);

export function useFont(): FontContextType {
  const ctx = useContext(FontContext);
  if (!ctx) throw new Error('useFont must be used within FontProvider');
  return ctx;
}

function isUiFont(v: string | null | undefined): v is UiFont {
  return !!v && (FONT_IDS as string[]).includes(v);
}

function applyFont(f: UiFont) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-font', f);
  root.classList.remove(...FONT_CLASSES);
  root.classList.add(`font-ui-${f}`);
}

function readInitialFont(): UiFont {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(STORAGE_KEY);
  const initial = isUiFont(stored) ? stored : 'system';
  applyFont(initial);
  return initial;
}

export function FontProvider({ children }: { children: ReactNode }) {
  const [font, setFontState] = useState<UiFont>(readInitialFont);

  useEffect(() => {
    applyFont(font);
  }, [font]);

  const syncPrefs = useCallback(async () => {
    const local = localStorage.getItem(STORAGE_KEY);
    try {
      const s = await api.getSettings();
      const vaultFont = s.ui_font;
      const prefer = isUiFont(local) ? local : (isUiFont(vaultFont) ? vaultFont : 'system');
      setFontState(prefer);
      localStorage.setItem(STORAGE_KEY, prefer);
      applyFont(prefer);
      if (prefer !== vaultFont) {
        await api.updateSettings({ ...s, ui_font: prefer });
      }
    } catch {
      if (isUiFont(local)) {
        setFontState(local);
        applyFont(local);
      }
    }
  }, []);

  useEffect(() => {
    void syncPrefs();
    const onSync = () => { void syncPrefs(); };
    window.addEventListener(PREFS_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PREFS_SYNC_EVENT, onSync);
  }, [syncPrefs]);

  const setFont = useCallback(async (next: UiFont) => {
    setFontState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyFont(next);
    try {
      const s = await api.getSettings();
      await api.updateSettings({ ...s, ui_font: next });
    } catch {
      /* vault locked — localStorage still applied; synced on unlock */
    }
  }, []);

  return (
    <FontContext.Provider value={{ font, setFont, fonts: UI_FONTS }}>
      {children}
    </FontContext.Provider>
  );
}
