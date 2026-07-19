const CACHE_NAME = "growth-note-cache-v2";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./student-login.html",
  "./teacher.html",
  "./assets/css/style.css",
  "./assets/js/rules.js",
  "./assets/js/rewards.js",
  "./assets/js/auth.js",
  "./assets/js/student.js",
  "./assets/js/teacher.js",
  "./assets/js/supabase-config.js",
  "./assets/js/supabase-client.js",
  "./manifest.json",
  "./assets/img/icon-192.png",
  "./assets/img/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

function shouldUseNetworkFirst(request) {
  const destination = request.destination;
  return destination === "document" || destination === "style" || destination === "script";
}

function cacheResponse(request, response) {
  if (response && response.status === 200 && response.type === "basic") {
    const responseToCache = response.clone();
    caches.open(CACHE_NAME).then((cache) => {
      cache.put(request, responseToCache);
    });
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.url.includes("supabase.co") || event.request.url.startsWith("http") === false) {
    return;
  }

  if (shouldUseNetworkFirst(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(() => undefined);
    })
  );
});
