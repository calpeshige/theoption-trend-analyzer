// TheOption シグナル PWA - Service Worker
// ネットワーク優先（常に最新を取得し、オフライン時のみキャッシュにフォールバック）。
// ※ 以前は cache-first だったため更新が反映されない不具合があった。キャッシュ名を上げて旧版を破棄する。

const CACHE = 'theoption-mobile-v9';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon192.png'
];

self.addEventListener('install', (event) => {
  // 新しいSWを即座に有効化（待機させない）
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Firestore/Firebase など外部リクエストはSWを介さずそのままネットワークへ
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  // ネットワーク優先: 最新を取得し、成功したらキャッシュも更新。失敗時のみキャッシュへフォールバック。
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
