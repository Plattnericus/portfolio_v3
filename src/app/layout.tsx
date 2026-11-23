import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "lenis/dist/lenis.css";
import "./globals.css";
import { person, site, siteUrl } from "@/lib/portfolio";

// one rounded family for everything: soft like candy, clean enough for a portfolio
const fredoka = localFont({
  src: "../fonts/Fredoka-latin.woff2",
  weight: "300 700",
  style: "normal",
  variable: "--font-fredoka",
  display: "swap",
  fallback: ["system-ui", "Helvetica Neue", "Arial", "sans-serif"],
});

const title = `${site.title} | ${person.role}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: `%s | ${site.title}` },
  description: site.description,
  applicationName: site.title,
  authors: [{ name: `${person.name} / ${person.alias}`, url: siteUrl }],
  creator: person.name,
  keywords: [person.name, person.alias, person.role, ...person.focus, "Portfolio", "Three.js", "Next.js"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.title,
    title,
    description: site.description,
    locale: site.locale,
  },
  twitter: { card: "summary_large_image", title, description: site.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  formatDetection: { telephone: false },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fredoka.variable} is-loading`}>
      <head>
        {/* without JavaScript there is no island: skip the loader and let the page scroll */}
        <noscript>
          <style>{"html.is-loading,html.is-loading body{overflow:auto}.loader{display:none}"}</style>
        </noscript>
      </head>
      <body>
        <a className="skip" href="#content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
