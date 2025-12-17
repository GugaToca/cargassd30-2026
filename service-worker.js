// =======================================
// SERVICE WORKER — DIÁRIO DE CARGAS
// =======================================

const CACHE_NAME = "diario-cargas-v9";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./cadastro.html",
  "./styles.css",
  "./app.js",
  "./auth.js",
  "./firebase-config.js",
  "./manifest.json",
  "./imagem_logistica.png",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// =======================================
// INSTALL
// =======================================
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// =======================================
// ACTIVATE
// =======================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// =======================================
// FETCH
// =======================================
self.addEventListener("fetch", (event) => {

  // 🚫 IGNORA qualquer requisição que NÃO seja GET
  if (event.request.method !== "GET") {
    return;
  }

  const url = event.request.url;

  // 🚫 IGNORA Firebase / Google / Auth
  if (
    url.includes("firebase") ||
    url.includes("googleapis") ||
    url.includes("gstatic")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {

          // Só cacheia respostas válidas
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });

          return response;
        })
        .catch(() => {
          // fallback simples offline
          if (event.request.destination === "document") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
