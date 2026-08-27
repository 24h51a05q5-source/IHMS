'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, SupportedLanguage, TranslationKey } from './translations';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, defaultText?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'ihms_user_language';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    try {
      const savedLang = localStorage.getItem(LOCAL_STORAGE_KEY) as SupportedLanguage;
      if (savedLang && ['en', 'te', 'hi'].includes(savedLang)) {
        setLanguageState(savedLang);
        document.documentElement.lang = savedLang;
      } else {
        setLanguageState('en');
        document.documentElement.lang = 'en';
      }
    } catch {
      setLanguageState('en');
    }
  }, []);

  const setLanguage = (newLang: SupportedLanguage) => {
    if (!['en', 'te', 'hi'].includes(newLang)) return;
    setLanguageState(newLang);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    } catch {
      /* ignore SSR / storage errors */
    }
  };

  const t = (key: string, defaultText?: string): string => {
    const activeDict = translations[language] || translations['en'];
    if (activeDict && (activeDict as any)[key]) {
      return (activeDict as any)[key];
    }
    const enDict = translations['en'];
    if (enDict && (enDict as any)[key]) {
      return (enDict as any)[key];
    }
    return defaultText || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      language: 'en' as SupportedLanguage,
      setLanguage: () => {},
      t: (key: string, defaultText?: string) => defaultText || key,
    };
  }
  return context;
}
