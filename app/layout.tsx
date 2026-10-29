import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import "./globals.css";
import "@/shared/styles/fonts.css";
import "@/shared/styles/global.css";

export const metadata: Metadata = {
  title: "ORBITAL — Digital Observatory",
  description:
    "An immersive journey through the eight planets of our Solar System. Discover extraordinary worlds, one orbit at a time.",
  keywords: ["solar system", "planets", "space", "astronomy", "explorer"],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        {["inter", "manrope"].map((family) => (
          <link
            key={family}
            rel="preload"
            href={`/fonts/${family}-${locale === "ru" ? "cyrillic" : "latin"}.woff2`}
            as="font"
            type="font/woff2"
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>{children}</body>
    </html>
  );
}
