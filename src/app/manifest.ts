import type { MetadataRoute } from "next";

// Web app manifest: lets MyGuide be installed to the home screen
// (Android "Install app", iOS "Add to Home Screen") and open full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyGuide",
    short_name: "MyGuide",
    description: "Personal city guides from people whose taste you trust.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf4ea",
    theme_color: "#fbf4ea",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
