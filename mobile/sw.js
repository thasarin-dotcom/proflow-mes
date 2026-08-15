const CACHE = 'proflow-mobile-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// network-first: ต้องได้เนื้อหาใหม่ล่าสุดทุกครั้งที่มีเน็ต (คนละ requirement กับแอปออฟไลน์ทั่วไป —
// นี่เป็น companion app หน้าโรงงานที่อัปเดตบ่อย, cache-first จะทำให้เครื่องที่ติดตั้งแอปไปแล้วค้างเวอร์ชันเก่า
// ตลอดไปจนกว่าจะไปแก้เลข CACHE เองทุกครั้ง — ใช้ cache แค่ตอนออฟไลน์จริงๆ เท่านั้น)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
