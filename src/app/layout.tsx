import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: {
    default: "LocalLeads CMS Portal",
    template: "%s · LocalLeads CMS Portal",
  },
  description:
    "Manage and publish content for your client websites. Edits flow straight to each site's Git repository.",
  applicationName: "LocalLeads CMS Portal",
  openGraph: {
    type: "website",
    siteName: "LocalLeads CMS Portal",
    title: "LocalLeads CMS Portal",
    description:
      "Manage and publish content for your client websites. Edits flow straight to each site's Git repository.",
  },
  // Private agency tool — keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
