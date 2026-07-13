import type { Metadata, Viewport } from "next";
import { Baloo_Chettan_2, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const balooChettan = Baloo_Chettan_2({
  variable: "--font-display",
  subsets: ["malayalam", "latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Chathuraksharam",
  description:
    "Play a fresh daily Malayalam word-square puzzle with fluent and learner modes.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Chathuraksharam",
    description:
      "A daily Malayalam word-square puzzle with Manglish learner support.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chathuraksharam",
    description:
      "A daily Malayalam word-square puzzle with Manglish learner support.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07130e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ml">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${balooChettan.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
