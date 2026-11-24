// COSGRAL phone app worker: keeps the app files so the app opens without the computer answering. It never touches
// /v1/ (the phone API), so no message, card or token is ever stored here. The version changes with every build.
const CACHE = "cosgral-app-__VERSION__";
const FILES = [
  "/app/",
  "/app/app.js",
  "/app/app.css",
  "/app/manifest.webmanifest",
  "/app/icon.svg",
  "/app/jost-latin.woff2",
  "/app/jost-latin-ext.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("cosgral-app-") && key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/app/"))
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/app/"))),
  );
});

// COSGRAL W9-BE1: a push message. It is encrypted for this phone and carries only the agent's name and the card to open
// (never the question): the notification says that an agent waits, and a tap opens the card behind the PIN lock.
const PL = String(self.navigator.language || "")
  .toLowerCase()
  .startsWith("pl");

function pushText(payload) {
  if (payload.test)
    return PL ? "To jest testowe powiadomienie z Twojego komputera" : "This is a test notification from your computer";
  return PL ? `${payload.agentName} czeka na Ciebie` : `${payload.agentName} is waiting for you`;
}

/** True for a string (and only a string). */
function isText(value) {
  return String(value) === value;
}

function readPayload(event) {
  try {
    const value = event.data ? event.data.json() : null;
    if (
      value &&
      value.v === 1 &&
      value.kind === "needs-you" &&
      isText(value.agentName) &&
      value.agentName.length > 0 &&
      value.agentName.length <= 64 &&
      isText(value.itemId) &&
      value.itemId.length > 0 &&
      value.itemId.length <= 128
    ) {
      return value;
    }
  } catch {
    // Not a message of this program.
  }
  return null;
}

self.addEventListener("push", (event) => {
  // The browser requires a notification for every push; an unreadable message still shows a neutral one.
  const payload = readPayload(event);
  const text = payload ? pushText(payload) : PL ? "COSGRAL czeka na Ciebie" : "COSGRAL is waiting for you";
  const target = payload && !payload.test ? `/app/#/needs/${encodeURIComponent(payload.itemId)}` : "/app/#/needs";
  event.waitUntil(
    self.registration.showNotification("COSGRAL", {
      body: text,
      tag: payload ? `needs-${payload.itemId}` : "needs-you",
      icon: "/app/icon.svg",
      data: { target },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const given = event.notification.data ? event.notification.data.target : null;
  // Only an address inside this app is ever opened.
  const target = isText(given) && given.startsWith("/app/#/") ? given : "/app/#/needs";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.includes("/app/") && "focus" in client) {
          // The open app only needs the new address; it shows the lock screen first when a PIN is set.
          return client.navigate(target).then((moved) => (moved || client).focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
