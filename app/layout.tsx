import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opener: tour where your fans actually are",
  description:
    "Opener is an AI tour-routing agent for independent musicians. It uses Qloo's taste graph to map audience affinity by city, suggest openers and read the crowd.",
  openGraph: {
    title: "Opener",
    description: "Tour where your fans actually are.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0C16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-ink text-paper">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink-2 focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
