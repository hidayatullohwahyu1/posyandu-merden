/* Service worker: menyimpan file aplikasi di HP agar bisa dibuka tanpa sinyal.
   NAIKKAN VERSI setiap kali ada file yang diubah, supaya HP kader mendapat versi baru. */
const VERSI = 'pm-v2.3.1';
const FILE = ['./', './index.html', './styles.css', './config.js', './who.js', './gizi.js', './db.js', './app.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' = ambil langsung dari server, bukan salinan lama di cache browser (GitHub Pages menyimpan 10 menit)
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'perbarui') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API Apps Script tidak di-cache
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const salin = res.clone(); caches.open(VERSI).then(c => c.put(e.request, salin)); }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
