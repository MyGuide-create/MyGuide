// MyGuide service worker — kept deliberately minimal for the pilot.
// It makes the app installable and shows a friendly page when offline,
// but never caches app pages or data, so everyone always sees the latest version.
const OFFLINE_HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MyGuide</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#fbf4ea;color:#3a2f26;font-family:Georgia,serif;text-align:center;padding:24px">
<div><h1 style="font-weight:400;font-style:italic;font-size:40px;margin:0 0 8px">MyGuide</h1><p style="margin:0;font-family:system-ui,sans-serif;color:#7a6b5d">You're offline. Reconnect and pull down to refresh.</p></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
    )
  );
});
