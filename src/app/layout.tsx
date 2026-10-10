import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TIN — Finding Love in Data",
  description: "Match your data. Interactive lesson and live app on MongoDB.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
