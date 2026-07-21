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
  metadataBase: new URL("https://www.chathuraksharam.com"),
  title: "Chathuraksharam — Word Square",
  description:
    "Spin, lock, and solve word puzzles across languages and categories.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Chathuraksharam — Word Square",
    description:
      "A multilingual word game with endless category-based puzzle streams.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chathuraksharam — Word Square",
    description:
      "A multilingual word game with endless category-based puzzle streams.",
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
    <html dir="ltr" lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${balooChettan.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
