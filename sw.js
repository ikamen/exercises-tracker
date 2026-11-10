// Service worker: keeps a copy of the app's files on the device so the app
// opens straight from there on every launch, with or without a connection.
// The data stays live: nothing on the Supabase host is ever cached.
//
// Bump CACHE_VERSION whenever a file in SHELL changes (or supabase-js is
// upgraded), otherwise phones that already have the app keep the old copy.
// The browser spots the changed sw.js on the next launch, downloads the new
// files in the background, and the launch after that shows the new version.
var CACHE_VERSION = 1;
var CACHE_NAME = 'exercise-tracker-v' + CACHE_VERSION;

// Everything the page needs before it can run. './' is index.html.
var SHELL = [
  './',
  'styles.css',
  'config.js',
  'app.js',
  'manifest.webmanifest',
  'icons/app-icon.svg',
  'icons/muscle-groups/arms.svg',
  'icons/muscle-groups/chest.svg',
  'icons/muscle-groups/core.svg',
  'icons/muscle-groups/legs.svg',
  'icons/muscle-groups/walk.svg'
];

// Must match the <script> tag in index.html. jsDelivr serves it with CORS
// headers, so the copy kept here still passes that tag's integrity check.
var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';

var SHELL_URLS = SHELL.map(function (path) { return new URL(path, self.location.href).href; });
var INDEX_URL = SHELL_URLS[0];
var SCOPE_PATH = new URL('./', self.location.href).pathname; // '/' on the live site

// The list of exercise images. Fetched fresh when there's a connection so a
// newly added photo shows up without a CACHE_VERSION bump; the kept copy is
// the fallback when offline.
var MANIFEST_URL = new URL('exercises/manifest.json', self.location.href).href;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // 'reload' skips the browser's HTTP cache, so a new version never
        // keeps a stale file that the site's cache headers allowed through.
        var requests = SHELL.map(function (path) { return new Request(path, { cache: 'reload' }); });
        requests.push(new Request(SUPABASE_JS, { mode: 'cors' }));
        return cache.addAll(requests);
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function isSupabase(url) {
  return /\.supabase\.co$/.test(url.hostname);
}

// Files served from the copy on the device: the shell, supabase-js, and the
// Exercises tab's manifest and images (kept the first time they are seen).
function isCacheable(url) {
  if (url.href === SUPABASE_JS) return true;
  if (url.origin !== self.location.origin) return false;
  if (SHELL_URLS.indexOf(url.origin + url.pathname) !== -1) return true;
  return url.pathname.indexOf(SCOPE_PATH + 'exercises/') === 0;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (isSupabase(url)) return; // reads, writes and login always go to the network
  var isPage = request.mode === 'navigate';
  if (!isPage && !isCacheable(url)) return;

  var key = isPage ? INDEX_URL : request;
  event.respondWith(
    caches.open(CACHE_NAME).then(function (cache) {
      function fromNetwork() {
        return fetch(request).then(function (response) {
          if (response.ok) cache.put(key, response.clone());
          return response;
        });
      }
      function fromCache() {
        return cache.match(key, { ignoreSearch: true, ignoreVary: true });
      }
      if (url.href === MANIFEST_URL) {
        // Network first, kept copy when offline.
        return fromNetwork().catch(function () {
          return fromCache().then(function (cached) { if (cached) return cached; throw new Error('offline'); });
        });
      }
      // Cache first: any page load is index.html; anything else is looked up
      // by URL and, when missing, fetched once and kept.
      return fromCache().then(function (cached) { return cached || fromNetwork(); });
    })
  );
});
