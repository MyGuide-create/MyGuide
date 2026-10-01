import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Allow the Next.js dev server to serve assets when the app is loaded
  // through a tunnel (Cloudflare Quick Tunnel, ngrok, etc.) instead of
  // localhost. Without this, Next blocks cross-origin requests for
  // /_next/* assets in dev mode, which breaks hydration: the page loads
  // but nothing on it responds to clicks.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Database migrations are read from disk at startup; make sure they ship
  // with the server bundle on hosts like Vercel.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
};

export default nextConfig;
