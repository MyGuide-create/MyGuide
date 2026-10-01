import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Work_Sans } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";
import { TrackClicks } from "@/components/Tracking";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "MyGuide", template: "%s · MyGuide" },
  description: "Personal city guides from people whose taste you trust.",
  applicationName: "MyGuide",
  appleWebApp: { capable: true, title: "MyGuide", statusBarStyle: "default" },
  openGraph: {
    siteName: "MyGuide",
    title: "MyGuide",
    description: "Personal city guides from people whose taste you trust.",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fbf4ea",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${workSans.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterSW />
        <TrackClicks />
      </body>
    </html>
  );
}
