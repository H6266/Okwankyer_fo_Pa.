import React, { createContext, useContext, useEffect, useState } from "react";
import { translations, TranslationDictionary } from "../i18n/translations";

export type AppLanguage = "en" | "twi";
export type AppTheme = "light" | "dark" | "high-contrast";

interface ThemeLanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  t: TranslationDictionary;
}

const ThemeLanguageContext = createContext<ThemeLanguageContextType | undefined>(undefined);

export const ThemeLanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    return (localStorage.getItem("okp_lang") as AppLanguage) || "en";
  });

  const [theme, setThemeState] = useState<AppTheme>(() => {
    return (localStorage.getItem("okp_theme") as AppTheme) || "light";
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    localStorage.setItem("okp_lang", lang);
  };

  const setTheme = (t: AppTheme) => {
    setThemeState(t);
    localStorage.setItem("okp_theme", t);
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "high-contrast");
    if (theme === "dark") root.classList.add("dark");
    if (theme === "high-contrast") root.classList.add("high-contrast");
  }, [theme]);

  const value = {
    language,
    setLanguage,
    theme,
    setTheme,
    t: translations[language],
  };

  return <ThemeLanguageContext.Provider value={value}>{children}</ThemeLanguageContext.Provider>;
};

export function useThemeLanguage() {
  const context = useContext(ThemeLanguageContext);
  if (!context) {
    throw new Error("useThemeLanguage must be used within a ThemeLanguageProvider");
  }
  return context;
}
