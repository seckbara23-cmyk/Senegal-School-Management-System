// Cache version — bump this any time you change what gets cached.
// Bumping forces the old cache to be deleted on next activation.
const CACHE_NAME = 'school-management-v2'

// Only cache true static, versioned assets.
// HTML navigation requests ('/') must NEVER be cached here — they must
// always reach the server so that updated deployments are seen immediately.
const STATIC_ASSETS = [
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  // Skip the waiting phase so the new SW activates immediately,
  // replacing the old one without waiting for all tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Delete every cache that does not match the current version.
    // This removes the v1 cache that had '/' stored in it.
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never serve HTML navigation requests from cache.
  // This covers: address-bar navigation, link clicks, redirects, and
  // the post-logout redirect to '/'. The response always comes from
  // the network so that updated page content is seen immediately.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request))
    return
  }

  // For non-navigation requests (JS, CSS, images, fonts) use cache-first.
  // Next.js content-hashes these assets, so cached copies are safe.
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  )
})
