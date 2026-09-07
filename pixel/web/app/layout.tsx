import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const mono = Geist_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://terminal-electron.com"),
  title: "terminal-electron",
  description:
    "[placeholder copy: Electron, but the window is your terminal pane.]",
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${mono.variable} h-full antialiased`}
    >
      <body className="relative flex min-h-full flex-col">
        <div className="glow" aria-hidden />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
