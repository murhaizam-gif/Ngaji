// Strategi: Cache-first untuk aset, Network-first untuk API
// ============================================================
const SW_VERSION = 'mgj-v1'
const ASET_CACHE = SW_VERSION + '-aset'
const DATA_CACHE = SW_VERSION + '-data'
// Aset yang di-cache semasa install
const ASET_URLS = [
  './',
  './mengaji-2.html'
]
// ── Install: cache aset statik ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(ASET_CACHE).then(cache => {
      return cache.addAll(ASET_URLS)
    }).then(() => self.skipWaiting())
  )
})
// ── Activate: buang cache lama ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== ASET_CACHE && k !== DATA_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})
// ── Fetch: strategi berbeza untuk aset vs API ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // API call ke Google Apps Script — Network first, fallback cache
  if (url.hostname.includes('script.google.com')) {
    e.respondWith(networkFirstAPI(e.request))
    return
  }
  // Aset statik (HTML, CSS, JS) — Cache first, fallback network
  if (e.request.method === 'GET') {
    e.respondWith(cacheFirstAset(e.request))
    return
  }
})
// Network first — cuba server, kalau gagal guna cache
async function networkFirstAPI(request) {
  const cacheKey = await getCacheKey(request)
  try {
    const clone = request.clone()
    const response = await fetch(clone)
    if (response.ok) {
      const cache = await caches.open(DATA_CACHE)
      // Clone response untuk cache
      cache.put(cacheKey, response.clone())
    }
    return response
  } catch (e) {
    // Offline — guna cache kalau ada
    const cached = await caches.match(cacheKey)
    if (cached) {
      console.log('[SW] Offline — guna cache untuk', cacheKey)
      return cached
    }
    // Tiada cache — return error response
    return new Response(JSON.stringify({ ok: false, msg: 'Tiada sambungan internet' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
// Cache first — guna cache dulu, update background
async function cacheFirstAset(request) {
  const cached = await caches.match(request)
  if (cached) {
    // Update cache di background (stale-while-revalidate)
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(ASET_CACHE).then(cache => cache.put(request, response))
      }
    }).catch(() => {})
    return cached
  }
  // Takda cache — ambil dari network
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(ASET_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (e) {
    return new Response('Tiada sambungan', { status: 503 })
  }
}
// Buat cache key unik berdasarkan body POST (untuk API calls)
async function getCacheKey(request) {
  try {
    const body = await request.clone().text()
    const data = JSON.parse(body)
    // Key: action + parameter penting
    const key = 'api-' + (data.action || '') + '-' + (data.ym || '')
    return new Request(key)
  } catch (e) {
    return new Request('api-unknown')
  }
}
