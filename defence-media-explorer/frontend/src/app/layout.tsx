import type { Metadata } from "next";
import { Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { cookies } from "next/headers";
import { AppProviders } from "@/lib/preferences";
import { Shell } from "@/components/shell";
import "./globals.css";

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bastion",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = jar.get("dme_locale")?.value || "en-GB";
  const timeZone = jar.get("dme_tz")?.value || "Europe/Rome";
  const theme = jar.get("dme_theme")?.value || "light";
  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}${theme === "dark" ? " dark" : ""}`} suppressHydrationWarning>
      <body>
        <AppProviders initialLocale={locale} initialTimeZone={timeZone} initialTheme={theme}>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}
