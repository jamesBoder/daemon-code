/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

// Skip waiting + claim immediately so updated SW activates without a page reload
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Precache all build artifacts (JS, CSS, HTML, icons, fonts if self-hosted)
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA navigation fallback — all navigations serve the cached shell
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

// Cache timing constants
const HOUR = 60 * 60
const DAY  = 24 * HOUR

// Google Fonts — cache-first, 1-year TTL (font URLs are content-addressed, never change)
// Note: remove this route once fonts are self-hosted and included in the precache manifest
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),    // 0 = opaque cross-origin response
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * DAY }),
    ],
  })
)

// All API calls and other unregistered routes fall through to the network by default.
// No caching: every response is user-specific and auth-gated.

// ── Push notifications (Step 8) ───────────────────────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return
  const data = event.data.json() as {
    title?: string
    body?: string
    url?: string
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'daemon code', {
      body:  data.body,
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
      data:  { url: data.url ?? '/' },
    } as NotificationOptions)
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const relUrl: string = (event.notification.data as { url?: string })?.url ?? '/'
  const absUrl = new URL(relUrl, self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (new URL(client.url).pathname === new URL(absUrl).pathname && 'focus' in client) {
          return (client as WindowClient).navigate(absUrl).then(c => c?.focus())
        }
      }
      return self.clients.openWindow(absUrl)
    })
  )
})
