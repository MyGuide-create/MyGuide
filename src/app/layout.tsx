import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Work_Sans } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: { default: "MyGuide", template: "%s · MyGuide" },
  description: "Personal city guides from people whose taste you trust.",
  applicationName: "MyGuide",
  appleWebApp: { capable: true, title: "MyGuide", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f9f6f0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${workSans.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
