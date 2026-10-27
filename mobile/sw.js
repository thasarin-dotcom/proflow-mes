// ProFlow Mobile — service worker (แบบเดียวกับ BM Flow, 2026-10-17)
// เป้าหมาย: ติดตั้งเป็นแอพได้ + เปิดเร็ว + เปิดหน้าแอพได้แม้สัญญาณหลุดชั่วคราว (แต่ข้อมูล/การอนุมัติต้องออนไลน์ — ตั้งใจไม่ทำ
// offline-write เพราะการอนุมัติปรับสต็อกจริงบนเซิร์ฟเวอร์)
// • หน้า index.html: network-first (ได้เวอร์ชันล่าสุดเสมอเมื่อออนไลน์) แล้วสำรองจาก cache
// • ไลบรารี/ฟอนต์/ไอคอนจาก CDN + ไฟล์ static: stale-while-revalidate
// • Supabase (*.supabase.co) และ method ที่ไม่ใช่ GET: ไม่แตะเลย (เดิม cache ผลลัพธ์ API Supabase ไว้ด้วย — เปลืองที่และอาจโชว์ข้อมูลเก่า)
const CACHE = 'proflow-mobile-v3';
const SHELL = ['./index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/mobile/index.html') || url.pathname.endsWith('/mobile/')) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
