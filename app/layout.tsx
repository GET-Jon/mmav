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
  title: {
    default: "Lot Logic | AI Vehicle Acquisition Intelligence",
    template: "%s | Lot Logic",
  },
  description:
    "AI-powered vehicle evaluation for automotive professionals. Analyze VIN-specific local comps, dealer fit, likely reconditioning costs, all-in basis, margin, and bid guidance in one place.",
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
