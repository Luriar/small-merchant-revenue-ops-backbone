import { useCallback, useEffect, useMemo, useState } from "react";
import { createTranslator } from "../i18n/messages";
import type {
  LocalePreference,
  ResolvedLocale,
  ResolvedTheme,
  ThemePreference
} from "../types/preferences";

const THEME_PREFERENCE_STORAGE_KEY = "traceops.themePreference";
const LEGACY_THEME_STORAGE_KEY = "traceops.theme";
const LOCALE_PREFERENCE_STORAGE_KEY = "traceops.localePreference";
const DARK_THEME_QUERY = "(prefers-color-scheme: dark)";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isLocalePreference(value: string | null): value is LocalePreference {
  return value === "auto" || value === "en" || value === "ko";
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedPreference = window.localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY);
  if (isThemePreference(storedPreference)) {
    return storedPreference;
  }

  const legacyTheme = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  if (legacyTheme === "light" || legacyTheme === "dark") {
    return legacyTheme;
  }

  return "system";
}

function getStoredLocalePreference(): LocalePreference {
  if (typeof window === "undefined") {
    return "auto";
  }

  const storedPreference = window.localStorage.getItem(LOCALE_PREFERENCE_STORAGE_KEY);
  return isLocalePreference(storedPreference) ? storedPreference : "auto";
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia(DARK_THEME_QUERY).matches ? "dark" : "light";
}

function resolveThemePreference(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? resolveSystemTheme() : preference;
}

function resolveLocalePreference(preference: LocalePreference): ResolvedLocale {
  if (preference !== "auto") {
    return preference;
  }

  if (typeof navigator === "undefined") {
    return "en";
  }

  return navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function usePreferences() {
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(getStoredThemePreference())
  );
  const [localePreference, setLocalePreference] =
    useState<LocalePreference>(getStoredLocalePreference);

  const resolvedLocale = useMemo(
    () => resolveLocalePreference(localePreference),
    [localePreference]
  );

  useEffect(() => {
    window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, themePreference);
    setResolvedTheme(resolveThemePreference(themePreference));

    if (themePreference !== "system") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(DARK_THEME_QUERY);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setResolvedTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, localePreference);
  }, [localePreference]);

  const t = useCallback(createTranslator(resolvedLocale), [resolvedLocale]);

  return {
    themePreference,
    resolvedTheme,
    setThemePreference,
    localePreference,
    resolvedLocale,
    setLocalePreference,
    t
  };
}
