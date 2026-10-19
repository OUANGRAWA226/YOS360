import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, localeFor, type Lang } from '@/lib/i18n';

export type ThemeMode = 'light' | 'dark' | 'system';

type Prefs = {
  lang: Lang;
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setLang: (l: Lang) => void;
  setTheme: (t: ThemeMode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  locale: string;
};

const PrefsContext = createContext<Prefs | null>(null);

const LS_LANG = 'sm360_lang';
const LS_THEME = 'sm360_theme';

function systemDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LS_LANG);
    return saved === 'en' ? 'en' : 'fr';
  });
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(LS_THEME);
    return saved === 'dark' || saved === 'light' ? saved : 'system';
  });
  const [systemIsDark, setSystemIsDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [resolvedTheme]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_LANG, l);
    document.documentElement.lang = l;
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    localStorage.setItem(LS_THEME, mode);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<Prefs>(
    () => ({
      lang,
      theme,
      resolvedTheme,
      setLang,
      setTheme,
      t: (key, params) => translate(key, lang, params),
      locale: localeFor(lang),
    }),
    [lang, theme, resolvedTheme, setLang, setTheme]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs must be used within PrefsProvider');
  return ctx;
}
