// ProFlow Wise MES (แอปหลัก/โหมดแท็บเล็ตคลัง) — service worker แบบเดียวกับ BM Flow (2026-10-17)
// เป้าหมาย: ติดตั้งเป็นแอพได้ + เปิดเร็ว — ข้อมูลทุกอย่างยังต้องออนไลน์ (ไม่ทำ offline-write เพราะการรับ/เบิกตัดสต็อกจริงบนเซิร์ฟเวอร์)
// • หน้า HTML (navigate): network-first เสมอ ได้เวอร์ชันล่าสุดเมื่อออนไลน์ สำรองจาก cache เฉพาะตอนเน็ตหลุด
// • ไลบรารี/ฟอนต์/ไอคอนจาก CDN + ไฟล์ static: stale-while-revalidate
// • Supabase และ method ที่ไม่ใช่ GET: ไม่แตะเลย
// • ไม่ยุ่งกับโฟลเดอร์ mobile/ — แอปมือถือมี service worker ของตัวเอง (scope แคบกว่า ชนะอยู่แล้ว)
const CACHE = 'proflow-main-v1';
const SHELL = ['./index.html', './manifest.json', './mobile/icons/icon-192.png', './mobile/icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('proflow-main-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;
  if (url.origin === self.location.origin && url.pathname.includes('/mobile/')) return;
  if (req.mode === 'navigate') {
    // เก็บสำรองเฉพาะตัวแอปหลัก (ไม่มี query) — ลิงก์สาธารณะ ?report=/?scanlabor= ไม่ต้องเก็บ
    e.respondWith(fetch(req).then(r => {
      if (r.ok && !url.search) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
