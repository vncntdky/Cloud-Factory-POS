import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

// Space Grotesk only reaches the wordmark, product names and titles (see globals.css); every
// number and body line is Inter. latin-ext carries the ₱ glyph (U+20B1).
const display = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-grotesk",
  display: "swap",
});

const ui = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vape POS",
  description: "Register, sales and stock for the shop",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Vape POS", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // so env(safe-area-inset-*) is non-zero under the iPhone home bar
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0D14" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // "light" | "dark" in the vp-theme cookie; no cookie follows the system. Rendered on the
  // server so there is no flash.
  const t = (await cookies()).get("vp-theme")?.value;
  const theme = t === "light" || t === "dark" ? t : undefined;
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`} data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
