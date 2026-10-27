import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORBITAL — Explore the Solar System",
  description:
    "An immersive journey through the eight planets of our Solar System. Discover extraordinary worlds, one orbit at a time.",
  keywords: ["solar system", "planets", "space", "astronomy", "explorer"],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
