import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/roboto-mono/400.css";
import "@fontsource/roboto-mono/500.css";
import { cookies } from "next/headers";
import { AppProviders } from "@/lib/preferences";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "BASTION — MEDEX",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = jar.get("dme_locale")?.value || "en-GB";
  const timeZone = jar.get("dme_tz")?.value || "Europe/Rome";
  const theme = jar.get("dme_theme")?.value || "dark";
  return (
    <html lang={locale} className={theme === "light" ? "" : "dark"} suppressHydrationWarning>
      <body>
        <AppProviders initialLocale={locale} initialTimeZone={timeZone} initialTheme={theme === "light" || theme === "system" ? theme : "dark"}>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}
