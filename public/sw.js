// Cache version — bump this any time you change what gets cached.
// Bumping forces every older cache (including any that wrongly stored an
// app document or RSC payload) to be deleted on the next activation.
const CACHE_NAME = 'school-management-v3'

// Only cache true static, versioned assets.
// HTML navigation requests and React Server Component (RSC) payloads must
// NEVER be cached here — they are per-user / per-route and must always reach
// the server so that the correct page content is rendered.
const STATIC_ASSETS = [
  '/manifest.json',
]

// Authenticated application route prefixes. Requests to these paths — whether
// document navigations or RSC/data fetches — must always come straight from
// the network. Serving them from cache is what made sidebar links appear to
// "stay on /dashboard": a cached document was returned for every in-app
// navigation. Keep this list in sync with middleware PROTECTED_PREFIXES.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/school',
  '/teacher',
  '/parent',
  '/student',
  '/finance-officer',
  '/notifications',
  '/super-admin',
]

function isProtectedPath(pathname) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  // Activate immediately, replacing any older service worker without waiting
  // for all tabs to close.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Delete every cache that does not match the current version. This removes
    // older caches that may have stored an app document or RSC payload.
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      // Take control of all open clients right away so the corrected fetch
      // logic applies without requiring a second reload.
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only ever consider GET requests; never touch POST/PUT/etc.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Next.js App Router fetches RSC payloads either via a `?_rsc=` query param
  // (prefetch) or with an `RSC: 1` request header (client-side navigation).
  const isRsc = url.searchParams.has('_rsc') || request.headers.get('RSC') === '1'

  // Bypass the service worker entirely (normal network fetch, no caching) for:
  //   1. document navigations           — request.mode === 'navigate'
  //   2. RSC / data requests            — isRsc
  //   3. authenticated app routes       — isProtectedPath
  //   4. cross-origin requests          — different origin
  // Returning without calling respondWith lets the browser perform its default
  // network fetch, guaranteeing the freshest server-rendered content.
  if (
    request.mode === 'navigate' ||
    isRsc ||
    url.origin !== self.location.origin ||
    isProtectedPath(url.pathname)
  ) {
    return
  }

  // For the remaining same-origin static assets (JS, CSS, images, fonts) use
  // cache-first. Next.js content-hashes these, so cached copies are safe.
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  )
})
