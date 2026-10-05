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

// Push notifications (follower alerts, new followers, comments, shares).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MyGuide", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "MyGuide";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/notifications", followUserId: data.followUserId },
      tag: data.tag,
      actions: Array.isArray(data.actions) ? data.actions : undefined,
    })
  );
});

function openUrl(url) {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    for (const w of wins) {
      if ("focus" in w) {
        w.navigate(url);
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  });
}

// "Follow back" tapped on a new-follower notification: follow without opening the app,
// then confirm with a quiet notification. If it fails (e.g. logged out), open their profile instead.
function followBack(data) {
  const fallback = data.url || "/notifications";
  return fetch("/api/follow-back", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: data.followUserId }),
  })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((r) =>
      self.registration.showNotification(r.status === "pending" ? `Follow request sent to ${r.name}` : `You're now following ${r.name}`, {
        body: r.status === "pending" ? "Their account is private — you'll see their guides once they accept." : "Their new guides will show up in your feed.",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: `/u/${r.username}` },
        tag: `followed:${data.followUserId}`,
        silent: true,
      })
    )
    .catch(() => openUrl(fallback));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === "follow-back" && data.followUserId) {
    event.waitUntil(followBack(data));
    return;
  }
  event.waitUntil(openUrl(data.url || "/notifications"));
});
