var CACHE_NAME = 'fintrack-v8';
var ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap'
];

// Install: cache core assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(names) {
      return Promise.all(
        names.filter(function(n) { return n !== CACHE_NAME; })
             .map(function(n) { return caches.delete(n); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first for API, cache-first for assets
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // API calls (Supabase, Yahoo Finance, CORS proxy): always go to network
  if (url.indexOf('/api/') !== -1 || url.indexOf('supabase.co') !== -1 || url.indexOf('allorigins') !== -1 || url.indexOf('yahoo.com') !== -1) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Static assets: cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        // cache successful GET responses
        if (response.ok && e.request.method === 'GET') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      });
    }).catch(function() {
      // offline fallback: return cached main page
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
