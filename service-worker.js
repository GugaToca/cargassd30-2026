// =======================================
// SERVICE WORKER — SEGURO (SEM POST)
// =======================================

const CACHE_NAME = "diario-cargas-v10";

const STATIC_FILES = [
  "./",
  "./index.html",
  "./login.html",
  "./cadastro.html",
  "./styles.css",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./imagem_logistica.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_FILES))
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      )
    )
  );
  self.clients.claim();
});

// FETCH — EXTREMAMENTE RESTRITIVO
self.addEventListener("fetch", (event) => {

  // 🚫 NUNCA intercepta POST
  if (event.request.method !== "GET") {
    return;
  }

  const url = event.request.url;

  // 🚫 IGNORA Firebase / Google
  if (
    url.includes("firebase") ||
    url.includes("googleapis") ||
    url.includes("gstatic")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
