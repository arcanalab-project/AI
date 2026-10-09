import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIN — Finding Love in Data",
  description: "Match your data. Lezione interattiva e app live su MongoDB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
