"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { IntlErrorCode, NextIntlClientProvider } from "next-intl";
import { api, LOCALES, type LocaleId, type User } from "@/lib/api";
import en from "../../messages/en-GB.json";
import it from "../../messages/it-IT.json";
import fr from "../../messages/fr-FR.json";
import es from "../../messages/es-ES.json";
import de from "../../messages/de-DE.json";

const MESSAGES: Record<string, typeof en> = {
  "en-GB": en,
  "it-IT": it,
  "fr-FR": fr,
  "es-ES": es,
  "de-DE": de,
};

export type Theme = "light" | "dark" | "system";

type Prefs = {
  locale: LocaleId;
  timeZone: string;
  theme: Theme;
  user: User | null;
  ready: boolean;
  setLocale: (locale: LocaleId) => void;
  setTimeZone: (timeZone: string) => void;
  setTheme: (theme: Theme) => void;
  setUser: (user: User | null) => void;
  refreshUser: () => Promise<void>;
};

const PrefsContext = createContext<Prefs | null>(null);

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

export function AppProviders({
  children,
  initialLocale,
  initialTimeZone,
  initialTheme,
}: {
  children: React.ReactNode;
  initialLocale: string;
  initialTimeZone: string;
  initialTheme: string;
}) {
  const [locale, setLocaleState] = useState<LocaleId>(isLocale(initialLocale) ? initialLocale : "en-GB");
  const [timeZone, setTimeZoneState] = useState(initialTimeZone || "Europe/Rome");
  const [theme, setThemeState] = useState<Theme>(isTheme(initialTheme) ? initialTheme : "light");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const userRef = useRef<User | null>(null);
  const pendingProfile = useRef<{ locale?: string; timeZone?: string } | null>(null);

  async function flushProfile() {
    const patch = pendingProfile.current;
    if (!patch || !userRef.current) return;
    pendingProfile.current = null;
    try {
      const data = await api<{ user: User }>("/api/auth/me", { method: "PATCH", body: JSON.stringify(patch) });
      if (pendingProfile.current) return;
      userRef.current = data.user;
      setUser(data.user);
    } catch {
      pendingProfile.current = { ...patch, ...(pendingProfile.current ?? {}) };
    }
  }

  useEffect(() => {
    const storedLocale = window.localStorage.getItem("dme.locale");
    const storedZone = window.localStorage.getItem("dme.timeZone");
    const storedTheme = window.localStorage.getItem("dme.theme");
    if (isLocale(storedLocale)) setLocaleState(storedLocale);
    if (storedZone) setTimeZoneState(storedZone);
    if (isTheme(storedTheme)) setThemeState(storedTheme);
    api<{ user: User }>("/api/auth/me")
      .then((data) => {
        userRef.current = data.user;
        setUser(data.user);
        if (!pendingProfile.current) {
          if (isLocale(data.user.locale)) setLocaleState(data.user.locale);
          if (data.user.timeZone) setTimeZoneState(data.user.timeZone);
        }
        void flushProfile();
      })
      .catch(() => {
        userRef.current = null;
        setUser(null);
      })
      .finally(() => setReady(true));
    // Stored values apply first. A profile response replaces them unless the person already changed one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);
    writeCookie("dme_theme", theme);
    window.localStorage.setItem("dme.theme", theme);
  }, [theme]);

  useEffect(() => {
    writeCookie("dme_locale", locale);
    writeCookie("dme_tz", timeZone);
    window.localStorage.setItem("dme.locale", locale);
    window.localStorage.setItem("dme.timeZone", timeZone);
    document.documentElement.lang = locale;
  }, [locale, timeZone]);

  function queueProfile(patch: { locale?: string; timeZone?: string }) {
    pendingProfile.current = { ...pendingProfile.current, ...patch };
    void flushProfile();
  }

  const value = useMemo<Prefs>(
    () => ({
      locale,
      timeZone,
      theme,
      user,
      ready,
      setUser: (next) => {
        userRef.current = next;
        setUser(next);
      },
      refreshUser: async () => {
        try {
          const data = await api<{ user: User }>("/api/auth/me");
          userRef.current = data.user;
          setUser(data.user);
          if (!pendingProfile.current) {
            if (isLocale(data.user.locale)) setLocaleState(data.user.locale);
            if (data.user.timeZone) setTimeZoneState(data.user.timeZone);
          }
          void flushProfile();
        } catch {
          userRef.current = null;
          setUser(null);
        }
      },
      setLocale: (next) => {
        setLocaleState(next);
        queueProfile({ locale: next });
      },
      setTimeZone: (next) => {
        setTimeZoneState(next);
        queueProfile({ timeZone: next });
      },
      setTheme: setThemeState,
    }),
    [locale, timeZone, theme, user, ready],
  );

  const messages = MESSAGES[locale] || MESSAGES["en-GB"];
  return (
    <PrefsContext.Provider value={value}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone={timeZone}
        onError={(error) => {
          if (error.code === IntlErrorCode.MISSING_MESSAGE) return;
        }}
        getMessageFallback={({ namespace, key }) => englishMessage(namespace, key)}
      >
        {children}
      </NextIntlClientProvider>
    </PrefsContext.Provider>
  );
}

function englishMessage(namespace: string | undefined, key: string) {
  const parts = [...(namespace ? namespace.split(".") : []), ...key.split(".")];
  let node: unknown = en;
  for (const part of parts) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return parts.join(".");
  }
  return typeof node === "string" ? node : parts.join(".");
}

export function usePrefs() {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("preferences missing");
  return value;
}

function isLocale(value: string | null | undefined): value is LocaleId {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
