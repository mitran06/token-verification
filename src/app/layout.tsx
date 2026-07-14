import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

// Open Sans is Amrita's official primary typeface (amrita.edu/branding).
const openSans = Open_Sans({ subsets: ["latin"], variable: "--font-open-sans" });

export const metadata: Metadata = {
  title: "Amrita — Verification Queue",
  description: "Document verification token queue for admissions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${openSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
