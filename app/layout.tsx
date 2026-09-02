import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { GlobalFifteenMinuteTimeInputs } from "@/components/global-fifteen-minute-time-inputs";
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
  title: "Lot Logic | Mindful Motor Co.",
  description: "Vehicle acquisition intelligence for Mindful Motor Co.",
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
      <body className="min-h-full flex flex-col">
        <GlobalFifteenMinuteTimeInputs />
        {children}
      </body>
    </html>
  );
}
