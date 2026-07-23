'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { t as translate, type Locale, LOCALES, RTL_LOCALES } from './translations';
import { PREFS_SYNC_EVENT } from '@/lib/prefs-sync';

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locales: typeof LOCALES;
}

const I18nContext = createContext<I18nContextType | null>(null);
const STORAGE_KEY = 'genvault_locale';

function isLocale(v: string | null | undefined): v is Locale {
  return !!v && LOCALES.some((l) => l.code === v);
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const syncPrefs = useCallback(async () => {
    const local = localStorage.getItem(STORAGE_KEY);
    try {
      const vaultLang = await api.getLanguage();
      const prefer = isLocale(local) ? local : (isLocale(vaultLang) ? vaultLang : 'en');
      setLocaleState(prefer);
      localStorage.setItem(STORAGE_KEY, prefer);
      applyDocumentLocale(prefer);
      if (isLocale(vaultLang) && prefer !== vaultLang) {
        await api.setLanguage(prefer);
      } else if (!isLocale(local) && isLocale(vaultLang)) {
        localStorage.setItem(STORAGE_KEY, vaultLang);
      }
    } catch {
      if (isLocale(local)) {
        setLocaleState(local);
        applyDocumentLocale(local);
      }
    }
  }, []);

  useEffect(() => {
    void syncPrefs();
    const onSync = () => { void syncPrefs(); };
    window.addEventListener(PREFS_SYNC_EVENT, onSync);
    return () => window.removeEventListener(PREFS_SYNC_EVENT, onSync);
  }, [syncPrefs]);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    applyDocumentLocale(next);
    localStorage.setItem(STORAGE_KEY, next);
    try {
      await api.setLanguage(next);
      const s = await api.getSettings();
      if (s.language !== next) {
        await api.updateSettings({ ...s, language: next });
      }
    } catch {
      /* vault locked — localStorage still applied; synced on unlock */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, locales: LOCALES }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
