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

const SITE_URL = "https://bastion-app.com";
const AUTHOR_URL = "https://marionoioso.com/profile/";
const PERSON_ID = "https://marionoioso.com/#person";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "BASTION",
    template: "%s · BASTION",
  },
  description:
    "BASTION MEDEX (Media Exploitation): semantic search across video, audio and documents, built for restricted environments. Media library, processing pipeline and collections. Built by Mario Noioso.",
  applicationName: "BASTION",
  authors: [{ name: "Mario Noioso", url: AUTHOR_URL }],
  creator: "Mario Noioso",
  publisher: "Mario Noioso",
  keywords: [
    "media exploitation",
    "semantic search",
    "video search",
    "restricted environments",
    "MongoDB",
    "vector search",
    "Mario Noioso",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "BASTION",
    title: "BASTION · MEDEX Media Exploitation",
    description:
      "MEDEX Media Exploitation. Semantic search across video, audio and documents, built for restricted environments. By Mario Noioso.",
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: "BASTION · MEDEX Media Exploitation",
    description:
      "MEDEX Media Exploitation: semantic search across video, audio and documents. By Mario Noioso.",
    creator: "@marionoioso",
    site: "@marionoioso",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://bastion-app.com/#app",
      name: "BASTION",
      alternateName: ["BASTION MEDEX", "MEDEX Media Exploitation"],
      url: "https://bastion-app.com/",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Media Exploitation",
      operatingSystem: "Web",
      description:
        "MEDEX Media Exploitation: semantic search across video, audio and documents, built for restricted environments.",
      image: "https://bastion-app.com/opengraph-image.png",
      inLanguage: "en-GB",
      author: { "@id": PERSON_ID },
      creator: { "@id": PERSON_ID },
      publisher: { "@id": PERSON_ID },
      isPartOf: { "@id": "https://bastion-app.com/#website" },
    },
    {
      "@type": "WebSite",
      "@id": "https://bastion-app.com/#website",
      url: "https://bastion-app.com/",
      name: "BASTION",
      inLanguage: "en-GB",
      publisher: { "@id": PERSON_ID },
    },
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: "Mario Noioso",
      url: AUTHOR_URL,
      jobTitle: "Advisory Solutions Architect",
      worksFor: { "@type": "Organization", name: "MongoDB", url: "https://www.mongodb.com/" },
      sameAs: [
        "https://marionoioso.com/",
        "https://marionoioso.link/",
        "https://www.linkedin.com/in/marionoioso/",
        "https://x.com/marionoioso",
        "https://github.com/manoioso",
        "https://orcid.org/0009-0000-9052-944X",
        "https://www.wikidata.org/wiki/Q140461986",
        "https://isni.org/isni/0000000421281497",
        "https://openlibrary.org/authors/OL16621077A",
        "https://www.youtube.com/@MarioNoioso",
      ],
    },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const locale = jar.get("dme_locale")?.value || "en-GB";
  const timeZone = jar.get("dme_tz")?.value || "Europe/Rome";
  const theme = jar.get("dme_theme")?.value || "dark";
  return (
    <html lang={locale} className={theme === "light" ? "" : "dark"} suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <AppProviders initialLocale={locale} initialTimeZone={timeZone} initialTheme={theme === "light" || theme === "system" ? theme : "dark"}>
          <Shell>{children}</Shell>
        </AppProviders>
      </body>
    </html>
  );
}
