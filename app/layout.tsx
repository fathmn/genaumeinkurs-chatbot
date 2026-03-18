import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const nohemi = localFont({
  src: [
    {
      path: "../node_modules/@tamagui/font-nohemi/fonts/Nohemi-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@tamagui/font-nohemi/fonts/Nohemi-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-nohemi",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "IT-Weiterbildung finden | GenauMeinKurs",
  description:
    "Finde die passende Entwicklung & IT Weiterbildung – 100 % kostenlos mit Bildungsgutschein. Über 2.500 zertifizierte Anbieter, neutrale Beratung.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nohemi.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
