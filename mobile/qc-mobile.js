// ════════════════════════════════════════════════════
// ProFlow Mobile / แท็บเลต — เมนู "QC" (ตรวจรับวัตถุดิบ): ดึงรายการที่รับเข้า → สแกน CoA → ส่งให้ Admin QC อนุมัติ
// ใช้ตาราง qc_* ชุดเดียวกับหน้า QC ในแอปหลัก (qc.js) — ต้องรัน create_qc_phase1.sql + alter_qc_inspections_add_coa_fields.sql
// + alter_qc_inspections_add_approval.sql ก่อน. ใช้ฟังก์ชันอ่าน CoA (OCR/แยกข้อมูล) ร่วมกับ ../qc-coa.js (โหลดก่อนไฟล์นี้)
// ไม่เก็บรูป/ไฟล์ CoA — อ่านในเครื่อง เก็บเฉพาะค่าที่ดึงได้ (ถ่ายเสร็จ/ปิดหน้า = ทิ้งรูปทันที)
// ใช้ global ของ mobile/index.html: _sb, _currentUser, _showLoader/_hideLoader, _err, _fmtDate, Swal, jsQR, Tesseract
// ════════════════════════════════════════════════════

function _qcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const QCM_DEFAULT_ITEMS = ['ลักษณะภายนอก/สี/กลิ่น', 'สภาพบรรจุภัณฑ์ (ไม่แตก/รั่ว/เปียก)', 'ฉลากและเลข Lot ตรงกับ CoA/ใบส่งของ', 'เอกสาร CoA ครบถ้วน'];
const QCM_RESULT = { PASS: 'ผ่าน', CONDITIONAL: 'ผ่านมีเงื่อนไข', REJECT: 'ไม่ผ่าน' };
const QCM_RESULT_CLS = { PASS: 'mb-green', CONDITIONAL: 'mb-amber', REJECT: 'mb-red' };
const QCM_TYPE_KEY = 'qcm_type_filter';

const QCM = {
  loaded: false, ready: true, settings: { go_live_date: null, enforce: false },
  materials: {}, specs: [], insp: [], pending: [], returned: {},
  seg: 'todo', type: null, q: '',
  cur: null,          // ใบที่กำลังตรวจ { lot, items, queue, result, busy }
  appr: null,         // ใบที่กำลังอนุมัติ { i, results }
  lastApprCount: null,
};

// ── CSS ──
(function () {
  const st = document.createElement('style');
  st.textContent = `
  #qcm-root, #qcm-sheet { --border:#e5e7eb; --bg:#f8fafc; --blue:#1e3a8a; }
  #qcm-root .mchips { display:flex; gap:6px; overflow-x:auto; }
  #qcm-root .mchip { flex:0 0 auto; min-height:38px; display:inline-flex; align-items:center; font-size:.82rem; padding:8px 14px; border-radius:999px; background:#fff; border:1px solid var(--border); color:#475569; cursor:pointer; }
  #qcm-root .mchip.on { background:#1e3a8a; border-color:#1e3a8a; color:#fff; }
  #qcm-root .mbadge { display:inline-block; font-size:.74rem; font-weight:600; padding:3px 10px; border-radius:999px; }
  #qcm-root .mb-gray { background:#f1f5f9; color:#475569; } #qcm-root .mb-green { background:#ecfdf5; color:#15803d; } #qcm-root .mb-amber { background:#fffbeb; color:#92400e; } #qcm-root .mb-red { background:#fef2f2; color:#b91c1c; }
  .qcm-seg { display:flex; gap:6px; background:#e2e8f0; padding:5px; border-radius:14px; margin-bottom:12px; }
  .qcm-seg button { flex:1; border:none; background:transparent; border-radius:10px; min-height:48px; font-weight:700; font-size:.95rem; color:#475569; display:flex; align-items:center; justify-content:center; gap:6px; }
  .qcm-seg button.on { background:#fff; color:#1e3a8a; box-shadow:0 1px 4px rgba(0,0,0,.12); }
  .qcm-seg .n { background:#ef4444; color:#fff; border-radius:999px; font-size:.72rem; padding:1px 8px; min-width:22px; }
  .qcm-seg .n.info { background:#0ea5e9; } .qcm-seg .n.z { background:#94a3b8; }
  .qcm-tools { display:flex; gap:8px; margin-bottom:8px; }
  .qcm-tools input { flex:1; min-height:48px; padding:0 14px; font-size:16px; border:1px solid var(--border); border-radius:12px; background:#fff; }
  .qcm-btn { border:none; border-radius:12px; min-height:52px; padding:0 18px; font-weight:700; font-size:1rem; display:inline-flex; align-items:center; justify-content:center; gap:8px; background:#e2e8f0; color:#0f172a; cursor:pointer; }
  .qcm-btn.primary { background:#1e3a8a; color:#fff; } .qcm-btn.green { background:#16a34a; color:#fff; }
  .qcm-btn.warn { background:#f59e0b; color:#fff; } .qcm-btn.red { background:#dc2626; color:#fff; }
  .qcm-btn.ghost { background:#fff; border:1.5px solid #cbd5e1; } .qcm-btn:disabled { opacity:.5; }
  .qcm-btn:active { transform:scale(.97); } .qcm-btn.sq { min-width:52px; padding:0; }
  .qcm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:12px; }
  .qcm-card { background:#fff; border:1px solid var(--border); border-radius:14px; padding:14px 16px; display:flex; flex-direction:column; gap:6px; }
  .qcm-card .top { display:flex; justify-content:space-between; align-items:center; font-size:.8rem; color:#64748b; }
  .qcm-card .name { font-weight:700; font-size:1.05rem; line-height:1.3; }
  .qcm-card .meta { font-size:.85rem; color:#475569; line-height:1.55; }
  .qcm-card .ret { background:#fef2f2; color:#b91c1c; border-radius:8px; padding:6px 10px; font-size:.82rem; }
  .qcm-card .qcm-btn { margin-top:6px; width:100%; }
  .qcm-empty { grid-column:1/-1; text-align:center; color:#94a3b8; padding:44px 12px; }
  /* แผ่นตรวจรับเต็มจอ */
  #qcm-sheet { position:fixed; inset:0; z-index:1040; background:var(--bg); display:none; flex-direction:column; }
  #qcm-sheet.open { display:flex; }
  #qcm-sheet .sh-head { flex-shrink:0; background:#1e3a8a; color:#fff; padding:max(10px,env(safe-area-inset-top)) 14px 10px; display:flex; align-items:center; gap:10px; }
  #qcm-sheet .sh-head .t { flex:1; min-width:0; } #qcm-sheet .sh-head .t b { display:block; font-size:1.02rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #qcm-sheet .sh-head .t small { color:#bfdbfe; }
  #qcm-sheet .sh-head button { background:rgba(255,255,255,.16); color:#fff; border:none; border-radius:10px; width:46px; height:46px; font-size:1.1rem; }
  #qcm-sheet .sh-body { flex:1; min-height:0; overflow-y:auto; padding:14px; }
  #qcm-sheet .sh-inner { max-width:920px; margin:0 auto; }
  #qcm-sheet .sh-foot { flex-shrink:0; background:#fff; border-top:1px solid var(--border); padding:10px 14px calc(10px + env(safe-area-inset-bottom)); display:flex; gap:10px; }
  #qcm-sheet .sh-foot .qcm-btn { flex:1; } #qcm-sheet .sh-foot .qcm-btn.ghost { flex:0 0 auto; }
  .qcm-step { background:#fff; border:1px solid var(--border); border-radius:14px; padding:14px 16px; margin-bottom:12px; }
  .qcm-step h6 { margin:0 0 10px; font-weight:700; font-size:1rem; display:flex; align-items:center; gap:8px; }
  .qcm-step h6 .no { background:#1e3a8a; color:#fff; width:26px; height:26px; border-radius:50%; font-size:.82rem; display:inline-flex; align-items:center; justify-content:center; }
  .qcm-step label.f { font-size:.78rem; color:#64748b; display:block; margin-bottom:3px; }
  .qcm-in { width:100%; min-height:50px; padding:0 12px; font-size:16px; border:1px solid #cbd5e1; border-radius:10px; background:#fff; }
  .qcm-in.auto { background:#fff8c4; }
  .qcm-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; }
  .qcm-thumbs { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
  .qcm-thumb { width:112px; text-align:center; font-size:.74rem; color:#64748b; }
  .qcm-thumb img, .qcm-thumb .pdf { width:112px; height:112px; object-fit:cover; border-radius:10px; border:1px solid #cbd5e1; background:#fff; display:flex; align-items:center; justify-content:center; font-size:2rem; color:#dc2626; }
  .qcm-thumb .row { display:flex; gap:4px; margin-top:4px; } .qcm-thumb .qcm-btn { min-height:40px; flex:1; padding:0; font-size:.9rem; }
  .qcm-item { display:grid; grid-template-columns:1fr auto; gap:8px 12px; align-items:center; padding:10px 0; border-top:1px solid #f1f5f9; }
  .qcm-item:first-of-type { border-top:none; }
  .qcm-item .nm { font-weight:600; } .qcm-item .cr { font-size:.78rem; color:#64748b; }
  .qcm-item .ctl { display:flex; gap:6px; align-items:center; } .qcm-item .ctl .qcm-in { width:140px; }
  .qcm-item .ctl .qcm-btn { min-height:50px; min-width:86px; padding:0 10px; }
  .qcm-item .ctl .qcm-btn.sel-ok { background:#16a34a; color:#fff; } .qcm-item .ctl .qcm-btn.sel-no { background:#dc2626; color:#fff; }
  .qcm-item .ctl.auto { background:#fff8c4; border-radius:10px; padding:2px; }
  .qcm-coahead, .qcm-coarow { display:grid; grid-template-columns:1.4fr 1fr 1fr 64px 52px; gap:8px; align-items:center; }
  .qcm-coahead { font-size:.74rem; color:#94a3b8; margin-bottom:4px; } .qcm-coarow { margin-bottom:8px; }
  .qcm-coarow .st { text-align:center; font-weight:700; font-size:.86rem; }
  @media (max-width:760px) { .qcm-coahead { display:none; } .qcm-coarow { grid-template-columns:1fr 1fr 56px 52px; } .qcm-coarow > :first-child { grid-column:1 / -1; } }
  .qcm-item .pv { min-width:62px; text-align:right; font-weight:700; font-size:.88rem; }
  .qcm-resbtns { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  .qcm-resbtns .qcm-btn.on.PASS { background:#16a34a; color:#fff; } .qcm-resbtns .qcm-btn.on.CONDITIONAL { background:#f59e0b; color:#fff; } .qcm-resbtns .qcm-btn.on.REJECT { background:#dc2626; color:#fff; }
  .qcm-warn { background:#fef2f2; color:#b91c1c; border-radius:10px; padding:8px 12px; font-size:.84rem; margin-top:8px; }
  .qcm-info { background:#eff6ff; color:#1e40af; border-radius:10px; padding:8px 12px; font-size:.84rem; margin-bottom:10px; }
  .qcm-stat { font-size:.84rem; margin-top:8px; }
  .qcm-kv { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; } .qcm-kv .k { font-size:.74rem; color:#94a3b8; } .qcm-kv .v { font-weight:600; word-break:break-word; }
  #qcm-scanner { position:fixed; inset:0; z-index:1045; background:#000; display:none; flex-direction:column; }
  #qcm-scanner.open { display:flex; } #qcm-scanner video { flex:1; min-height:0; width:100%; object-fit:cover; }
  #qcm-scanner .bar { background:#0f172a; color:#fff; padding:12px 14px calc(12px + env(safe-area-inset-bottom)); display:flex; gap:10px; align-items:center; }
  #qcm-scanner .bar span { flex:1; font-size:.9rem; }`;
  document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', '<div id="qcm-sheet"></div><div id="qcm-scanner"><video id="qcm-video" playsinline muted></video><canvas id="qcm-canvas" style="display:none"></canvas><div class="bar"><span id="qcm-scan-msg">เล็งกล้องไปที่ QR/บาร์โค้ดของ Lot</span><button class="qcm-btn" onclick="qcmCloseScanner()"><i class="fas fa-times"></i>ปิด</button></div></div>');
})();

// ── โหลดข้อมูล ──
async function _qcmAll(build) {
  const size = 1000; let from = 0, all = [];
  while (true) {
    const { data, error } = await build().range(from, from + size - 1);
    if (error) return { data: all, error };
    all = all.concat(data || []);
    if (!data || data.length < size) break;
    from += size;
  }
  return { data: all, error: null };
}
function _qcmKey(c, l) { return String(c || '') + '|' + String(l || ''); }
const _qcmNorm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function qcmLoad(silent) {
  if (!document.getElementById('qcm-root')) return;
  if (!silent) _showLoader();
  try {
    const sRes = await _sb.from('qc_settings').select('*').eq('id', 1).maybeSingle();
    if (sRes.error) { QCM.ready = false; qcmRenderAll(); return; }
    QCM.ready = true;
    if (sRes.data) QCM.settings = sRes.data;
    const [iRes, spRes] = await Promise.all([
      _sb.from('qc_inspections').select('*').order('_row_id', { ascending: false }).limit(600),
      _sb.from('qc_spec_items').select('*').order('MaterialCode').order('Seq'),
    ]);
    QCM.insp = iRes.data || []; QCM.specs = spRes.data || [];
    if (!Object.keys(QCM.materials).length) {
      const m = await _qcmAll(() => _sb.from('materials').select('MaterialCode,MaterialName,TYPE'));
      (m.data || []).forEach(r => { QCM.materials[r.MaterialCode] = r; });
    }
    // สถานะ Lot: ใบล่าสุดของ (code,lot); ส่งกลับ = กลับไปอยู่ "รอตรวจ"
    const status = {}, seen = {}; QCM.returned = {};
    QCM.insp.forEach(i => {
      const k = _qcmKey(i.MaterialCode, i.Lot);
      if (seen[k]) return; seen[k] = true;
      if (i.Status === 'RETURNED') { QCM.returned[k] = i; return; }
      status[k] = i.Status === 'PENDING_APPROVAL' ? 'AWAITING' : i.Result;
    });
    const start = QCM.settings.go_live_date || '1900-01-01';
    const mr = await _qcmAll(() => _sb.from('mr_receive').select('_row_id,Date,MaterialCode,MaterialName,Lot,Qty,UOM,Supplier,MfgLotNo,ExpDate').gte('Date', start).order('Date', { ascending: false }));
    const agg = {};
    (mr.data || []).forEach(r => {
      if (!r.MaterialCode || !r.Lot) return;
      const k = _qcmKey(r.MaterialCode, r.Lot);
      if (status[k]) return;
      const a = agg[k] || (agg[k] = { ...r, Qty: 0, returned: QCM.returned[k] || null });
      a.Qty += parseFloat(r.Qty) || 0;
      if (r.Date > a.Date) { a.Date = r.Date; a._row_id = r._row_id; }
    });
    QCM.pending = Object.values(agg).sort((a, b) => (a.Date < b.Date ? 1 : -1));
    QCM.pending.forEach((p, n) => { p._i = n; p.TYPE = (QCM.materials[p.MaterialCode] || {}).TYPE || ''; });
    QCM.loaded = true;
    if (QCM.type === null) {
      let saved = null; try { saved = localStorage.getItem(QCM_TYPE_KEY); } catch (e) {}
      const types = new Set(QCM.pending.map(p => p.TYPE).filter(Boolean));
      QCM.type = saved != null ? saved : (types.has('Bulk') ? 'Bulk' : '');   // ค่าเริ่มต้น: รายการ Bulk ที่รับเข้า
    }
    qcmRenderAll(); qcmUpdateBadge();
  } catch (e) { console.error('qcmLoad', e); if (!silent) _err('โหลดข้อมูล QC ไม่สำเร็จ', e.message || e); }
  finally { if (!silent) _hideLoader(); }
}

function qcmAwaiting() { return QCM.insp.filter(i => i.Status === 'PENDING_APPROVAL'); }
function qcmUpdateBadge() {
  const b = document.getElementById('qcm-badge'); if (!b) return;
  const n = _currentUser?.isAdmin ? qcmAwaiting().length : QCM.pending.length;
  b.textContent = n > 99 ? '99+' : n; b.style.display = n ? 'inline-flex' : 'none';
}
// เรียกจาก onAuthStateChange ของ index.html: โหลดเงียบๆ เพื่อป้ายเลข + เช็คใบรออนุมัติของ Admin ทุก 60 วิ (มีใบใหม่ → toast)
function qcmInitBadge() {
  qcmLoad(true).then(() => { QCM.lastApprCount = qcmAwaiting().length; });
  if (!window._qcmTimer) window._qcmTimer = setInterval(async () => {
    if (!_currentUser?.isAdmin) return;
    const { count, error } = await _sb.from('qc_inspections').select('_row_id', { count: 'exact', head: true }).eq('Status', 'PENDING_APPROVAL');
    if (error) return;
    const b = document.getElementById('qcm-badge'); if (b) { b.textContent = count > 99 ? '99+' : count; b.style.display = count ? 'inline-flex' : 'none'; }
    if (QCM.lastApprCount != null && count > QCM.lastApprCount) {
      Swal.fire({ toast: true, position: 'top', icon: 'info', title: `มีใบตรวจรอ QC อนุมัติ ${count} ใบ`, showConfirmButton: false, timer: 4000 });
      if (document.getElementById('mpage-qc')?.classList.contains('active')) qcmLoad(true);
    }
    QCM.lastApprCount = count;
  }, 60000);
}

// ── หน้ารายการ ──
function qcmSetSeg(s) { QCM.seg = s; qcmRenderAll(); }
function qcmSetType(t) { QCM.type = t; try { localStorage.setItem(QCM_TYPE_KEY, t); } catch (e) {} qcmRenderAll(); }
function qcmSetQ(v) { QCM.q = v; qcmRenderList(); }

function qcmRenderAll() {
  const root = document.getElementById('qcm-root'); if (!root) return;
  if (!QCM.ready) { root.innerHTML = '<div class="mcard" style="color:#b45309">ยังไม่ได้สร้างตาราง QC — ให้ Admin รัน create_qc_phase1.sql ใน Supabase ก่อน</div>'; return; }
  const nTodo = QCM.pending.length, nSent = qcmAwaiting().length;
  const seg = (k, label, n, cls) => `<button class="${QCM.seg === k ? 'on' : ''}" onclick="qcmSetSeg('${k}')">${label}${n != null ? `<span class="n ${cls || ''}">${n}</span>` : ''}</button>`;
  let tools = '';
  if (QCM.seg === 'todo') {
    const types = [...new Set(QCM.pending.map(p => p.TYPE).filter(Boolean))].sort((a, b) => (a === 'Bulk' ? -1 : b === 'Bulk' ? 1 : a.localeCompare(b)));
    const chip = (v, label) => `<div class="mchip ${QCM.type === v ? 'on' : ''}" onclick="qcmSetType('${_qcEsc(v)}')">${label} (${v === '' ? nTodo : QCM.pending.filter(p => p.TYPE === v).length})</div>`;
    tools = `<div class="qcm-tools"><input type="text" id="qcm-q" placeholder="ค้นหา ชื่อ / รหัส / Lot..." value="${_qcEsc(QCM.q)}" oninput="qcmSetQ(this.value)">
        <button class="qcm-btn primary sq" onclick="qcmScanLot()" title="สแกน QR/บาร์โค้ด Lot"><i class="fas fa-qrcode"></i></button>
        <button class="qcm-btn ghost sq" onclick="qcmLoad()" title="รีเฟรช"><i class="fas fa-rotate"></i></button></div>
      <div class="mchips" style="margin-bottom:12px">${chip('', 'ทั้งหมด')}${types.map(t => chip(t, _qcEsc(t))).join('')}</div>`;
  }
  root.innerHTML = `<div class="qcm-seg">${seg('todo', 'รอตรวจ', nTodo)}${seg('sent', 'รออนุมัติ', nSent, 'info')}${seg('done', 'เสร็จแล้ว')}</div>${tools}<div id="qcm-list" class="qcm-grid"></div>`;
  qcmRenderList();
}

function qcmRenderList() {
  const el = document.getElementById('qcm-list'); if (!el) return;
  const fmtT = t => new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  const adm = !!_currentUser?.isAdmin;
  if (QCM.seg === 'todo') {
    const q = QCM.q.trim().toLowerCase();
    const rows = QCM.pending.filter(p => (QCM.type === '' || p.TYPE === QCM.type) &&
      (!q || [p.MaterialName, p.MaterialCode, p.Lot, p.MfgLotNo, p.Supplier].some(x => String(x || '').toLowerCase().includes(q))));
    el.innerHTML = rows.map(p => `<div class="qcm-card">
        <div class="top"><span class="mbadge mb-gray">${_qcEsc(p.TYPE || 'วัตถุดิบ')}</span><span>รับ ${_fmtDate(p.Date)}</span></div>
        <div class="name">${_qcEsc(p.MaterialName)}</div>
        <div class="meta">รหัส ${_qcEsc(p.MaterialCode)} · Lot <b>${_qcEsc(p.Lot)}</b>${p.MfgLotNo ? ' · Lot ผู้ผลิต ' + _qcEsc(p.MfgLotNo) : ''}<br>${(p.Qty || 0).toLocaleString()} ${_qcEsc(p.UOM || '')} · ${_qcEsc(p.Supplier || 'ไม่ระบุซัพ')}</div>
        ${p.returned ? `<div class="ret"><i class="fas fa-rotate-left me-1"></i>QC ส่งกลับแก้ไข: ${_qcEsc(p.returned.ApproveRemark || '—')}</div>` : ''}
        <button class="qcm-btn primary" onclick="qcmOpenInspect(${p._i})"><i class="fas fa-clipboard-check"></i>ตรวจรับ</button></div>`).join('')
      || `<div class="qcm-empty"><i class="fas fa-circle-check fa-2x" style="display:block;margin-bottom:10px"></i>${QCM.pending.length ? 'ไม่พบรายการตามตัวกรอง' : 'ไม่มี Lot ที่รอตรวจ'}</div>`;
  } else if (QCM.seg === 'sent') {
    const rows = qcmAwaiting().sort((a, b) => (a.CreatedAt < b.CreatedAt ? -1 : 1));
    el.innerHTML = rows.map(i => `<div class="qcm-card">
        <div class="top"><span class="mbadge ${QCM_RESULT_CLS[i.Result]}">เสนอ: ${QCM_RESULT[i.Result]}</span><span>${fmtT(i.CreatedAt)}</span></div>
        <div class="name">${_qcEsc(i.MaterialName)}</div>
        <div class="meta">Lot <b>${_qcEsc(i.Lot)}</b> · ${(i.Qty || 0).toLocaleString()} ${_qcEsc(i.UOM || '')}<br>ผู้บันทึก ${_qcEsc(i.Inspector || '—')}${i.Remark ? '<br>หมายเหตุ: ' + _qcEsc(i.Remark) : ''}</div>
        ${adm ? `<button class="qcm-btn green" onclick="qcmOpenApprove(${i._row_id})"><i class="fas fa-stamp"></i>ตรวจสอบ / อนุมัติ</button>` : '<div class="meta" style="color:#0369a1"><i class="fas fa-hourglass-half me-1"></i>รอ Admin QC อนุมัติ</div>'}</div>`).join('')
      || '<div class="qcm-empty"><i class="fas fa-inbox fa-2x" style="display:block;margin-bottom:10px"></i>ไม่มีใบที่รออนุมัติ</div>';
  } else {
    const rows = QCM.insp.filter(i => (i.Status || 'APPROVED') === 'APPROVED').slice(0, 40);
    el.innerHTML = rows.map(i => `<div class="qcm-card">
        <div class="top"><span class="mbadge ${QCM_RESULT_CLS[i.Result]}">${QCM_RESULT[i.Result]}</span><span>${_fmtDate(i.InspDate)}</span></div>
        <div class="name">${_qcEsc(i.MaterialName)}</div>
        <div class="meta">Lot <b>${_qcEsc(i.Lot)}</b> · ${(i.Qty || 0).toLocaleString()} ${_qcEsc(i.UOM || '')}<br>ตรวจโดย ${_qcEsc(i.Inspector || '—')}${i.ApprovedBy && i.ApprovedBy !== i.Inspector ? ' · อนุมัติโดย ' + _qcEsc(i.ApprovedBy) : ''}</div></div>`).join('')
      || '<div class="qcm-empty">ยังไม่มีผลตรวจ</div>';
  }
}

// ── สแกน QR/บาร์โค้ด Lot เพื่อกระโดดไปรายการ ──
let _qcmStream = null, _qcmScanTimer = null;
async function qcmScanLot() {
  try {
    _qcmStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) { Swal.fire({ icon: 'error', title: 'เปิดกล้องไม่ได้', text: 'อนุญาตการใช้กล้องให้เบราว์เซอร์/แอปนี้ก่อน' }); return; }
  const v = document.getElementById('qcm-video'); v.srcObject = _qcmStream; await v.play().catch(() => {});
  document.getElementById('qcm-scanner').classList.add('open');
  const c = document.getElementById('qcm-canvas'), g = c.getContext('2d', { willReadFrequently: true });
  _qcmScanTimer = setInterval(() => {
    if (!v.videoWidth) return;
    c.width = v.videoWidth; c.height = v.videoHeight; g.drawImage(v, 0, 0);
    const code = window.jsQR && jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (code && code.data) { qcmCloseScanner(); qcmHandleLotCode(code.data); }
  }, 300);
}
function qcmCloseScanner() {
  clearInterval(_qcmScanTimer); _qcmScanTimer = null;
  if (_qcmStream) { _qcmStream.getTracks().forEach(t => t.stop()); _qcmStream = null; }
  document.getElementById('qcm-scanner').classList.remove('open');
}
function qcmHandleLotCode(text) {
  const n = _qcmNorm(text);
  const hit = QCM.pending.filter(p => { const a = _qcmNorm(p.Lot), b = _qcmNorm(p.MfgLotNo); return (a && (a === n || (a.length >= 4 && n.includes(a)))) || (b && (b === n || (b.length >= 4 && n.includes(b)))); });
  if (hit.length === 1) { qcmOpenInspect(hit[0]._i); return; }
  QCM.seg = 'todo'; QCM.type = ''; QCM.q = hit.length ? hit[0].Lot : String(text).slice(0, 40);
  qcmRenderAll();
  Swal.fire({ toast: true, position: 'top', icon: hit.length ? 'info' : 'warning', title: hit.length ? 'พบหลายรายการ เลือกจากรายการ' : 'ไม่พบ Lot นี้ในรายการรอตรวจ', showConfirmButton: false, timer: 2500 });
}

// ══════════════════ แผ่นตรวจรับ ══════════════════
function _qcmSpecFor(code) { return QCM.specs.filter(s => s.MaterialCode === code); }
function qcmOpenInspect(idx) {
  const lot = QCM.pending[idx]; if (!lot) return;
  const spec = _qcmSpecFor(lot.MaterialCode);
  const items = spec.length ? spec.map(s => ({ Parameter: s.Parameter, ParamType: s.ParamType, MinValue: s.MinValue, MaxValue: s.MaxValue, Unit: s.Unit, Method: s.Method }))
    : QCM_DEFAULT_ITEMS.map(p => ({ Parameter: p, ParamType: 'passfail' }));
  QCM.cur = { lot, items, queue: [], result: 'PASS', busy: false, hasSpec: spec.length > 0, coaRows: [] };
  const adm = !!_currentUser?.isAdmin;
  const rows = items.map((it, i) => {
    const crit = it.ParamType === 'numeric' ? `เกณฑ์ ${it.MinValue != null ? it.MinValue : '−∞'} – ${it.MaxValue != null ? it.MaxValue : '+∞'} ${_qcEsc(it.Unit || '')}` : _qcEsc(it.Method || 'ผ่าน / ไม่ผ่าน');
    const ctl = it.ParamType === 'numeric'
      ? `<div class="ctl" id="qcm-ctl-${i}"><input class="qcm-in" id="qcm-m-${i}" type="number" step="any" inputmode="decimal" placeholder="ค่าที่วัดได้" oninput="qcmCalc()"></div>`
      : `<div class="ctl" id="qcm-ctl-${i}"><input type="hidden" id="qcm-m-${i}" value=""><button type="button" class="qcm-btn ghost" onclick="qcmPF(${i},'1')">ผ่าน</button><button type="button" class="qcm-btn ghost" onclick="qcmPF(${i},'0')">ไม่ผ่าน</button></div>`;
    return `<div class="qcm-item"><div><div class="nm">${_qcEsc(it.Parameter)}</div><div class="cr">${crit}</div></div><div style="display:flex;align-items:center;gap:8px">${ctl}<div class="pv" id="qcm-pv-${i}">—</div></div></div>`;
  }).join('');
  document.getElementById('qcm-sheet').innerHTML = `
    <div class="sh-head"><button onclick="qcmCloseSheet()"><i class="fas fa-arrow-left"></i></button>
      <div class="t"><b>${_qcEsc(lot.MaterialName)}</b><small>Lot ${_qcEsc(lot.Lot)} · ${(lot.Qty || 0).toLocaleString()} ${_qcEsc(lot.UOM || '')} · ${_qcEsc(lot.Supplier || '')}</small></div></div>
    <div class="sh-body"><div class="sh-inner">
      ${lot.returned ? `<div class="qcm-warn" style="margin:0 0 12px"><i class="fas fa-rotate-left me-1"></i>QC ส่งกลับแก้ไข: ${_qcEsc(lot.returned.ApproveRemark || '—')}</div>` : ''}
      <div class="qcm-step"><h6><span class="no">1</span>สแกนเอกสาร CoA <small style="font-weight:400;color:#94a3b8">(ไม่มีเอกสารข้ามไปข้อ 2 ได้)</small></h6>
        <div style="display:flex;flex-wrap:wrap;gap:10px">
          <label class="qcm-btn primary" style="flex:1;min-width:200px"><i class="fas fa-camera"></i>ถ่ายรูปเอกสาร<input type="file" accept="image/*" capture="environment" hidden onchange="qcmAddFiles(this)"></label>
          <label class="qcm-btn ghost" style="flex:1;min-width:200px"><i class="fas fa-image"></i>เลือกรูป / PDF<input type="file" accept="image/*,application/pdf" multiple hidden onchange="qcmAddFiles(this)"></label>
        </div>
        <div class="qcm-thumbs" id="qcm-thumbs"></div>
        <button class="qcm-btn green" id="qcm-readbtn" style="display:none;width:100%;margin-top:10px" onclick="qcmRead()"><i class="fas fa-magnifying-glass"></i>อ่านเอกสาร</button>
        <div class="qcm-stat" id="qc-scan-status"></div>
        <details id="qcm-raw" style="display:none;margin-top:8px"><summary style="color:#64748b;font-size:.84rem;padding:6px 0">ดูข้อความที่อ่านได้จากเอกสาร</summary><pre id="qcm-rawtext" style="white-space:pre-wrap;max-height:240px;overflow:auto;font-size:.74rem;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin:0"></pre></details>
        <div class="meta" style="font-size:.74rem;color:#94a3b8;margin-top:6px">อ่านในเครื่องนี้เท่านั้น ไม่เก็บรูป/ไฟล์ — เก็บเฉพาะค่าที่ดึงได้ (ครั้งแรกต้องโหลดชุดภาษาไทย อาจใช้เวลาสักครู่)</div>
      </div>
      <div class="qcm-step"><h6><span class="no">2</span>ข้อมูลจากเอกสาร <small style="font-weight:400;color:#94a3b8">(ช่องสีเหลือง = ดึงจากเอกสาร ตรวจให้ตรงกับกระดาษ)</small></h6>
        <div class="qcm-fields">
          <div><label class="f">Lot ผู้ผลิต (ตาม CoA)</label><input class="qcm-in" id="qcm-d-lot"></div>
          <div><label class="f">วันผลิต</label><input class="qcm-in" type="date" id="qcm-d-mfg"></div>
          <div><label class="f">วันหมดอายุ</label><input class="qcm-in" type="date" id="qcm-d-exp"></div>
          <div><label class="f">เลขที่เอกสาร CoA</label><input class="qcm-in" id="qcm-d-no"></div>
          <div style="grid-column:span 2"><label class="f">ชื่อสินค้าจากซัพ (ตามเอกสาร CoA) <span style="color:#94a3b8">— ชื่อของเรา: ${_qcEsc(lot.MaterialName)}</span></label><input class="qcm-in" id="qcm-d-prod" placeholder="ชื่อที่ซัพเรียก ถ้าต่างจากชื่อของเรา"></div>
          <div><label class="f">ผู้ผลิต/ซัพตาม CoA</label><input class="qcm-in" id="qcm-d-sup"></div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.95rem"><input type="checkbox" id="qcm-coa" style="width:22px;height:22px">ได้รับ CoA จากซัพ</label>
        <div id="qcm-warn"></div>
      </div>
      <div class="qcm-step"><h6><span class="no">3</span>รายการทดสอบ · Spec · ผล ตามเอกสาร CoA <small style="font-weight:400;color:#94a3b8">(เก็บเป็นข้อมูล — แก้ไข/เพิ่ม/ลบได้)</small></h6>
        <div id="qcm-coa-box"></div>
      </div>
      <div class="qcm-step"><h6><span class="no">4</span>ผลตรวจของเรา <small style="font-weight:400;color:#94a3b8">(ตาม Spec ที่ตั้งไว้ในระบบ)</small></h6>
        ${QCM.cur.hasSpec ? '' : '<div class="qcm-info">วัตถุดิบนี้ยังไม่มี Spec — ใช้เช็คลิสต์พื้นฐาน (Admin เพิ่ม Spec ได้ที่หน้า QC บนคอม)</div>'}
        ${rows}
      </div>
      <div class="qcm-step"><h6><span class="no">5</span>${adm ? 'ผลการตัดสิน' : 'ผลที่เสนอให้ QC'}</h6>
        <div class="qcm-resbtns" id="qcm-resbtns">${['PASS', 'CONDITIONAL', 'REJECT'].map(r => `<button type="button" class="qcm-btn ghost ${r}" onclick="qcmSetResult('${r}')">${QCM_RESULT[r]}</button>`).join('')}</div>
        <div class="qcm-stat" id="qcm-suggest" style="color:#64748b"></div>
        <label class="f" style="margin-top:10px;font-size:.78rem;color:#64748b">หมายเหตุ</label><input class="qcm-in" id="qcm-remark" placeholder="เช่น ลักษณะผิดปกติ / บรรจุภัณฑ์บุบ">
      </div>
    </div></div>
    <div class="sh-foot"><button class="qcm-btn ghost" onclick="qcmCloseSheet()">ยกเลิก</button>
      <button class="qcm-btn ${adm ? 'green' : 'primary'}" id="qcm-submit" onclick="qcmSubmit()">${adm ? '<i class="fas fa-check"></i>บันทึกและอนุมัติ' : '<i class="fas fa-paper-plane"></i>ส่งให้ QC อนุมัติ'}</button></div>`;
  document.getElementById('qcm-sheet').classList.add('open');
  qcmRenderCoa();
  qcmCalc();
}
function qcmCloseSheet() {
  if (QCM.cur) QCM.cur.queue.forEach(q => q.url && URL.revokeObjectURL(q.url));
  QCM.cur = null; QCM.appr = null;
  document.getElementById('qcm-sheet').classList.remove('open');
}

// ── คิวรูป/ไฟล์ CoA (หน่วยความจำเท่านั้น) ──
function qcmAddFiles(input) {
  const files = [...(input.files || [])]; input.value = '';
  files.forEach(f => { const pdf = f.type === 'application/pdf'; QCM.cur.queue.push({ file: f, isPdf: pdf, url: pdf ? null : URL.createObjectURL(f), rot: 0 }); });
  qcmRenderQueue();
}
function qcmRotate(i) { const q = QCM.cur.queue[i]; if (q) { q.rot = (q.rot + 90) % 360; qcmRenderQueue(); } }
function qcmRemoveFile(i) { const q = QCM.cur.queue[i]; if (!q) return; if (q.url) URL.revokeObjectURL(q.url); QCM.cur.queue.splice(i, 1); qcmRenderQueue(); }
function qcmRenderQueue() {
  const q = QCM.cur.queue, box = document.getElementById('qcm-thumbs'); if (!box) return;
  box.innerHTML = q.map((x, i) => `<div class="qcm-thumb">${x.isPdf ? '<div class="pdf"><i class="fas fa-file-pdf"></i></div>' : `<img src="${x.url}" style="transform:rotate(${x.rot}deg)" alt="">`}
      หน้า ${i + 1}<div class="row">${x.isPdf ? '' : `<button class="qcm-btn" onclick="qcmRotate(${i})"><i class="fas fa-rotate-right"></i></button>`}<button class="qcm-btn" onclick="qcmRemoveFile(${i})"><i class="fas fa-trash"></i></button></div></div>`).join('');
  const b = document.getElementById('qcm-readbtn');
  b.style.display = q.length ? '' : 'none'; b.innerHTML = `<i class="fas fa-magnifying-glass"></i>อ่านเอกสาร (${q.length} หน้า)`;
}
async function qcmRead() {
  const cur = QCM.cur; if (!cur || cur.busy || !cur.queue.length) return;
  cur.busy = true; const b = document.getElementById('qcm-readbtn'); b.disabled = true;
  try {
    let text = '';
    const canvases = [];   // เก็บภาพที่เตรียมแล้วไว้อ่านซ้ำรอบ 2 (โหมดตาราง) ถ้ารอบแรกไม่เจอรายการทดสอบ — อยู่ในหน่วยความจำเท่านั้น
    for (let i = 0; i < cur.queue.length; i++) {
      const q = cur.queue[i], label = `หน้า ${i + 1}/${cur.queue.length}`;
      _qcScanMsg(`<i class="fas fa-spinner fa-spin me-1"></i>กำลังอ่าน${label}...`);
      if (q.isPdf) text += (await _qcReadPdf(q.file)) + '\n';
      else { const cv = await _qcPrepCanvas(q.file, q.rot); canvases.push(cv); text += (await _qcOcrCanvas(cv, label, '3')) + '\n'; }
    }
    if (text.replace(/\s/g, '').length < 20) { _qcScanMsg('<span style="color:#dc2626">อ่านข้อความไม่ได้ — ลองหมุนรูปให้ตรง ถ่ายใหม่ให้สว่าง/ชัด หรือเลือกเป็น PDF</span>'); qcmShowRaw(text); return; }
    let ex = _qcExtractCoA(text, cur.items), tableText = text;
    // รอบ 2: ไม่เจอรายการทดสอบ (<3 แถว) → อ่านรูปซ้ำแบบ "โหมดตาราง" (อ่านเป็นแถว) แล้วใช้ผลที่ได้แถวมากกว่า + เติมช่องที่รอบแรกยังว่าง
    if (canvases.length && _qcParseCoATable(text).length < 3) {
      let text2 = '';
      for (let i = 0; i < canvases.length; i++) text2 += (await _qcOcrCanvas(canvases[i], `หน้า ${i + 1}/${canvases.length} (รอบ 2 โหมดตาราง)`, '6')) + '\n';
      if (_qcParseCoATable(text2).length > _qcParseCoATable(text).length) tableText = text2;
      const ex2 = _qcExtractCoA(text2, cur.items);
      Object.keys(ex2.fields).forEach(k => { if (!ex.fields[k] && ex2.fields[k]) ex.fields[k] = ex2.fields[k]; });
      Object.keys(ex2.values).forEach(k => { if (ex.values[k] == null) ex.values[k] = ex2.values[k]; });
      text += '\n──── อ่านรอบ 2 (โหมดตาราง) ────\n' + text2;
    }
    qcmShowRaw(text);
    qcmApplyExtract(ex, tableText);
    cur.queue.forEach(q => q.url && URL.revokeObjectURL(q.url)); cur.queue = []; qcmRenderQueue();   // อ่านสำเร็จ — ทิ้งรูป/ไฟล์
  } catch (e) { console.error(e); _qcScanMsg(`<span style="color:#dc2626">อ่านเอกสารไม่สำเร็จ: ${_qcEsc(e.message || e)}</span>`); }
  finally { cur.busy = false; b.disabled = false; }
}
// ข้อความดิบที่อ่านได้ — เปิดดูได้ เผื่อตรวจว่า OCR อ่านอะไรมา/ส่งให้ผู้พัฒนาปรับตัวแยกตาราง
function qcmShowRaw(text) {
  const d = document.getElementById('qcm-raw'), p = document.getElementById('qcm-rawtext');
  if (d && p) { p.textContent = text || ''; d.style.display = ''; }
}
function qcmApplyExtract(ex, text) {
  const f = ex.fields, lot = QCM.cur.lot;
  // ตารางผลวิเคราะห์ตามเอกสาร (รายการทดสอบ · Spec · ผล) — อ่านใหม่ทุกครั้งที่สแกน (ทับของเดิม; ถ้าอ่านไม่ได้เลยคงของเดิมไว้)
  const coaRows = _qcParseCoATable(text || '');
  if (coaRows.length) QCM.cur.coaRows = coaRows;
  qcmRenderCoa();
  const setv = (id, v) => { const el = document.getElementById(id); if (el && v) { el.value = v; el.classList.add('auto'); } };
  setv('qcm-d-lot', f.lot); setv('qcm-d-mfg', f.mfg); setv('qcm-d-exp', f.exp); setv('qcm-d-no', f.docNo); setv('qcm-d-prod', f.product); setv('qcm-d-sup', f.supplier);
  let filled = 0;
  QCM.cur.items.forEach((it, i) => {
    if (ex.values[i] == null) return;
    const el = document.getElementById('qcm-m-' + i); if (!el) return;
    el.value = String(ex.values[i]); el.dataset.auto = '1';
    if (it.ParamType === 'numeric') el.classList.add('auto'); filled++;
  });
  // รายการตามผลตรวจของเรา (Spec ในระบบ) ที่ยังว่าง → เติมจากแถวในตาราง CoA ที่ชื่อตรงกัน
  QCM.cur.items.forEach((it, i) => {
    const el = document.getElementById('qcm-m-' + i);
    if (!el || el.value !== '') return;
    const rx = _qcLabelRegex(it.Parameter); if (!rx) return;
    const row = QCM.cur.coaRows.find(r => rx.test(r.Parameter)); if (!row) return;
    const ev = _qcEvalCoARow(row);
    if (it.ParamType === 'numeric' && ev.num != null) el.value = String(ev.num);
    else if (it.ParamType !== 'numeric' && ev.pass != null) el.value = ev.pass ? '1' : '0';
    else return;
    el.dataset.auto = '1'; if (it.ParamType === 'numeric') el.classList.add('auto'); filled++;
  });
  document.getElementById('qcm-coa').checked = true;
  qcmCalc();
  const warn = [];
  if (f.lot && lot.MfgLotNo && _qcmNorm(f.lot) !== _qcmNorm(lot.MfgLotNo)) warn.push(`⚠ Lot ผู้ผลิตตาม CoA (${_qcEsc(f.lot)}) ไม่ตรงกับตอนรับเข้า (${_qcEsc(lot.MfgLotNo)})`);
  if (f.exp && lot.ExpDate && String(lot.ExpDate).slice(0, 10) !== f.exp) warn.push(`⚠ วันหมดอายุตาม CoA (${f.exp}) ไม่ตรงกับตอนรับเข้า (${_qcEsc(String(lot.ExpDate).slice(0, 10))})`);
  if (f.exp && f.exp < new Date().toISOString().slice(0, 10)) warn.push('⚠ วันหมดอายุตาม CoA ผ่านไปแล้ว');
  document.getElementById('qcm-warn').innerHTML = warn.map(w => `<div class="qcm-warn">${w}</div>`).join('');
  const found = ['lot', 'mfg', 'exp', 'docNo', 'product', 'supplier'].filter(k => f[k]).length;
  _qcScanMsg((window._qcCoaStale ? `<div style="color:#b45309">⚠ ไฟล์ qc-coa.js บนเซิร์ฟเวอร์ยังเป็นเวอร์ชันเก่า — ตารางรายการทดสอบจะยังไม่ขึ้น (ให้อัปโหลด qc-coa.js ใหม่ไว้โฟลเดอร์เดียวกับ index.html หลัก แล้วรีเฟรช)</div>` : "") + `<span style="color:#15803d"><i class="fas fa-check-circle me-1"></i>อ่านได้ ข้อมูลเอกสาร ${found}/6 ช่อง · ${QCM.cur.coaRows.length ? `รายการในตาราง CoA ${QCM.cur.coaRows.length} แถว` : '<b style="color:#b45309">ไม่พบรายการทดสอบ (ดู "ข้อความที่อ่านได้" หรือกด เพิ่มรายการ เอง)</b>'} ·เติมผลตรวจ ${filled}/${QCM.cur.items.length} รายการ</span>`);
}

// ── ตารางผลวิเคราะห์ตามเอกสาร CoA (รายการทดสอบ · Spec · ผล) ──
function qcmRenderCoa() {
  const box = document.getElementById('qcm-coa-box'); if (!box || !QCM.cur) return;
  const rows = QCM.cur.coaRows;
  box.innerHTML = (rows.length ? `<div class="qcm-coahead"><div>รายการทดสอบ</div><div>Spec (เกณฑ์)</div><div>ผลตามเอกสาร</div><div style="text-align:center">ผล</div><div></div></div>` : '<div class="qcm-info">ยังไม่มีรายการ — สแกนเอกสารด้านบน หรือกด "เพิ่มรายการ" เพื่อกรอกเอง</div>')
    + rows.map((r, i) => `<div class="qcm-coarow">
        <input class="qcm-in" value="${_qcEsc(r.Parameter)}" placeholder="รายการทดสอบ" oninput="qcmCoaEdit(${i},'Parameter',this.value)">
        <input class="qcm-in" value="${_qcEsc(r.SpecText)}" placeholder="เช่น 5.5 - 7.0" oninput="qcmCoaEdit(${i},'SpecText',this.value)">
        <input class="qcm-in" value="${_qcEsc(r.ResultText)}" placeholder="เช่น 6.2 / Complies" oninput="qcmCoaEdit(${i},'ResultText',this.value)">
        <div class="st" id="qcm-coast-${i}"></div>
        <button type="button" class="qcm-btn ghost sq" style="min-height:48px" onclick="qcmCoaDel(${i})"><i class="fas fa-trash"></i></button></div>`).join('')
    + `<button type="button" class="qcm-btn ghost" style="width:100%;margin-top:8px" onclick="qcmCoaAdd()"><i class="fas fa-plus"></i>เพิ่มรายการ</button>`;
  rows.forEach((_, i) => qcmCoaStatus(i));
}
function qcmCoaStatus(i) {
  const r = QCM.cur.coaRows[i], el = document.getElementById('qcm-coast-' + i); if (!r || !el) return;
  const ev = _qcEvalCoARow(r);
  el.innerHTML = ev.pass == null ? '<span style="color:#94a3b8">—</span>' : ev.pass ? '<span style="color:#16a34a">ผ่าน</span>' : '<span style="color:#dc2626">ไม่ผ่าน</span>';
}
function qcmCoaEdit(i, k, v) { QCM.cur.coaRows[i][k] = v; qcmCoaStatus(i); qcmCalc(); }
function qcmCoaAdd() { QCM.cur.coaRows.push({ Parameter: '', SpecText: '', ResultText: '', Unit: '' }); qcmRenderCoa(); }
function qcmCoaDel(i) { QCM.cur.coaRows.splice(i, 1); qcmRenderCoa(); qcmCalc(); }
// แถวที่จะบันทึกลง qc_coa_results (ข้ามแถวที่ยังไม่มีชื่อรายการ)
function _qcmCoaPayload(inspId, rows) {
  return rows.filter(r => String(r.Parameter || '').trim()).map((r, n) => {
    const ev = _qcEvalCoARow(r);
    return { InspectionId: inspId, Seq: n + 1, Parameter: r.Parameter.trim(), SpecText: r.SpecText || null, SpecMin: ev.min, SpecMax: ev.max,
      ResultText: r.ResultText || null, ResultNum: ev.num, Unit: r.Unit || null, Pass: ev.pass };
  });
}

// ── ผลตรวจรายรายการ ──
function qcmPF(i, v) {
  const el = document.getElementById('qcm-m-' + i); el.value = el.value === v ? '' : v; el.dataset.auto = ''; qcmCalc();
}
function qcmCalc() {
  const cur = QCM.cur; if (!cur) return;
  let anyFail = false, anyBlank = false;
  cur.items.forEach((it, i) => {
    const el = document.getElementById('qcm-m-' + i), v = el.value, ctl = document.getElementById('qcm-ctl-' + i);
    let pass = null;
    if (v === '') anyBlank = true;
    else if (it.ParamType === 'numeric') { const n = parseFloat(v); pass = !(it.MinValue != null && n < it.MinValue) && !(it.MaxValue != null && n > it.MaxValue); }
    else pass = v === '1';
    it._pass = pass;
    if (it.ParamType !== 'numeric') {
      const b = ctl.querySelectorAll('button');
      b[0].className = 'qcm-btn ' + (v === '1' ? 'sel-ok' : 'ghost'); b[1].className = 'qcm-btn ' + (v === '0' ? 'sel-no' : 'ghost');
      ctl.classList.toggle('auto', el.dataset.auto === '1');
    }
    document.getElementById('qcm-pv-' + i).innerHTML = pass == null ? '—' : pass ? '<span style="color:#16a34a">ผ่าน</span>' : '<span style="color:#dc2626">ไม่ผ่าน</span>';
    if (pass === false) anyFail = true;
  });
  const coaFail = cur.coaRows.filter(r => _qcEvalCoARow(r).pass === false).map(r => r.Parameter);   // รายการในเอกสาร CoA ที่ไม่ผ่านเกณฑ์ของซัพเอง
  if (coaFail.length) anyFail = true;
  const sug = document.getElementById('qcm-suggest');
  if (coaFail.length) { cur.result = 'REJECT'; sug.textContent = `CoA ระบุไม่ผ่านเกณฑ์: ${coaFail.slice(0, 3).join(', ')}${coaFail.length > 3 ? '…' : ''} — แนะนำ "ไม่ผ่าน"`; }
  else if (anyFail) { cur.result = 'REJECT'; sug.textContent = 'มีรายการไม่ผ่าน — แนะนำ "ไม่ผ่าน"'; }
  else if (!anyBlank) { cur.result = 'PASS'; sug.textContent = 'ทุกรายการผ่าน'; }
  else sug.textContent = 'กรอกผลให้ครบทุกรายการ';
  qcmSetResult(cur.result, true);
}
function qcmSetResult(r, auto) {
  if (!QCM.cur) return; QCM.cur.result = r;
  document.querySelectorAll('#qcm-resbtns .qcm-btn').forEach(b => b.classList.toggle('on', b.classList.contains(r)));
}

async function qcmSubmit() {
  const cur = QCM.cur; if (!cur || cur.busy) return;
  const adm = !!_currentUser?.isAdmin, { lot, items } = cur;
  qcmCalc();
  if (items.some(it => it._pass == null)) { Swal.fire({ icon: 'warning', title: 'กรอกผลตรวจให้ครบทุกรายการก่อน' }); return; }
  if (cur.result === 'PASS' && items.some(it => it._pass === false)) {
    const c = await Swal.fire({ icon: 'warning', title: 'มีรายการไม่ผ่านแต่เลือก "ผ่าน"', text: 'ยืนยันหรือไม่?', showCancelButton: true, confirmButtonText: 'ยืนยัน', cancelButtonText: 'กลับไปแก้' });
    if (!c.isConfirmed) return;
  }
  cur.busy = true; document.getElementById('qcm-submit').disabled = true; _showLoader();
  const dv = id => document.getElementById(id).value.trim() || null;
  const head = {
    InspType: 'IQC', InspDate: new Date().toISOString().slice(0, 10), MaterialCode: lot.MaterialCode, MaterialName: lot.MaterialName, Lot: lot.Lot,
    MR_RowId: lot._row_id, Qty: lot.Qty, UOM: lot.UOM, Supplier: lot.Supplier, CoAReceived: document.getElementById('qcm-coa').checked,
    Result: cur.result, Remark: dv('qcm-remark'), Inspector: _currentUser?.email || null, Status: adm ? 'APPROVED' : 'PENDING_APPROVAL',
  };
  if (adm) { head.ApprovedBy = _currentUser?.email || null; head.ApprovedAt = new Date().toISOString(); }
  const doc = { CoA_MfgLotNo: dv('qcm-d-lot'), CoA_MfgDate: dv('qcm-d-mfg'), CoA_ExpDate: dv('qcm-d-exp'), CoA_DocNo: dv('qcm-d-no'), CoA_Product: dv('qcm-d-prod'), CoA_Supplier: dv('qcm-d-sup') };
  if (Object.values(doc).some(Boolean)) Object.assign(head, doc);
  const ins = await _sb.from('qc_inspections').insert(head).select('_row_id').single();
  if (ins.error) { _hideLoader(); cur.busy = false; document.getElementById('qcm-submit').disabled = false; _err('บันทึกใบตรวจไม่สำเร็จ', ins.error.message); return; }
  const rows = items.map((it, i) => ({
    InspectionId: ins.data._row_id, Parameter: it.Parameter, ParamType: it.ParamType, MinValue: it.MinValue ?? null, MaxValue: it.MaxValue ?? null, Unit: it.Unit || null,
    Measured: it.ParamType === 'numeric' ? parseFloat(document.getElementById('qcm-m-' + i).value) : null, Pass: it._pass,
  }));
  const r2 = await _sb.from('qc_inspection_results').insert(rows);
  if (r2.error) { _hideLoader(); cur.busy = false; document.getElementById('qcm-submit').disabled = false; _err('บันทึกผลรายรายการไม่สำเร็จ', r2.error.message); return; }
  // รายการทดสอบ·Spec·ผล ตามเอกสาร CoA → qc_coa_results (ล้มเหลวไม่ทำให้ใบตรวจหาย — แจ้งเตือนให้รัน SQL)
  let coaWarn = '';
  const coaPayload = _qcmCoaPayload(ins.data._row_id, cur.coaRows);
  if (coaPayload.length) {
    const r3 = await _sb.from('qc_coa_results').insert(coaPayload);
    if (r3.error) { console.error('qc_coa_results', r3.error); coaWarn = 'บันทึกรายการจาก CoA ไม่สำเร็จ (ให้ Admin รัน alter_qc_add_coa_results.sql)'; }
  }
  const failedNames = items.filter(it => it._pass === false).map(it => it.Parameter).concat(coaPayload.filter(r => r.Pass === false).map(r => r.Parameter));
  if (adm && cur.result !== 'PASS') await _qcmCreateNcr(ins.data._row_id, lot, failedNames.join(', '));
  _hideLoader();
  _qcmAudit(adm ? 'QC_INSPECT' : 'QC_SUBMIT', `${lot.MaterialCode}/${lot.Lot}`, `IQC ${adm ? '' : 'เสนอ '}${QCM_RESULT[cur.result]}`);
  qcmCloseSheet();
  await qcmLoad(true); qcmRenderAll();
  if (coaWarn) Swal.fire({ icon: 'warning', title: 'ส่งใบตรวจแล้ว แต่…', text: coaWarn });
  else Swal.fire({ toast: true, position: 'top', icon: 'success', title: adm ? 'บันทึกผลตรวจแล้ว' : 'ส่งให้ Admin QC อนุมัติแล้ว', showConfirmButton: false, timer: 2500 });
}

async function _qcmAudit(action, ref, detail) {
  try { await _sb.from('audit_log').insert({ UserEmail: _currentUser.email, UserName: _currentUser.name, Action: action, TableName: 'qc_inspections', RecordRef: ref, Detail: detail }); } catch (e) {}
}
async function _qcmNextNcrNo() {
  const ym = new Date().toISOString().slice(2, 7).replace('-', ''), prefix = `NCR-${ym}-`;
  const { data } = await _sb.from('qc_ncr').select('NCR_No').like('NCR_No', prefix + '%').order('NCR_No', { ascending: false }).limit(1);
  const last = data && data[0] ? parseInt(data[0].NCR_No.slice(prefix.length)) || 0 : 0;
  return prefix + String(last + 1).padStart(3, '0');
}
// ไม่ผ่าน/มีเงื่อนไข → เปิด NCR อัตโนมัติ (ไปกำหนดวิธีจัดการของ/สาเหตุต่อที่หน้า QC > NCR บนคอม)
async function _qcmCreateNcr(inspId, lot, failed) {
  const { error } = await _sb.from('qc_ncr').insert({
    NCR_No: await _qcmNextNcrNo(), InspectionId: inspId, MaterialCode: lot.MaterialCode, MaterialName: lot.MaterialName, Lot: lot.Lot, Qty: lot.Qty, UOM: lot.UOM,
    Supplier: lot.Supplier, Description: failed ? `ไม่ผ่าน: ${failed}` : 'ไม่ผ่านการตรวจรับ', Status: 'OPEN', CreatedBy: _currentUser?.email || null,
  });
  if (error) console.error('NCR', error);
}

// ══════════════════ แผ่นอนุมัติ (Admin) ══════════════════
async function qcmOpenApprove(id) {
  if (!_currentUser?.isAdmin) return;
  const i = QCM.insp.find(x => x._row_id === id); if (!i) return;
  _showLoader();
  const [rRes, mRes, cRes] = await Promise.all([
    _sb.from('qc_inspection_results').select('*').eq('InspectionId', id).order('_row_id'),
    i.MR_RowId ? _sb.from('mr_receive').select('MfgLotNo,ExpDate').eq('_row_id', i.MR_RowId).maybeSingle() : Promise.resolve({ data: null }),
    _sb.from('qc_coa_results').select('*').eq('InspectionId', id).order('Seq'),
  ]);
  _hideLoader();
  const results = rRes.data || [], mr = mRes.data || {}, coa = cRes.data || [];
  QCM.appr = { i, results, coa, decision: i.Result };
  const hasSpecNow = QCM.specs.some(s => s.MaterialCode === i.MaterialCode);
  const coaRows = coa.map(r => `<div class="qcm-item"><div><div class="nm">${_qcEsc(r.Parameter)}</div><div class="cr">Spec: ${_qcEsc(r.SpecText || '—')}${r.Unit ? ' ' + _qcEsc(r.Unit) : ''}</div></div>
      <div style="text-align:right"><b>${_qcEsc(r.ResultText || '—')}</b> ${r.Pass == null ? '<span style="color:#94a3b8">—</span>' : r.Pass ? '<span style="color:#16a34a;font-weight:700">ผ่าน</span>' : '<span style="color:#dc2626;font-weight:700">ไม่ผ่าน</span>'}</div></div>`).join('');
  const warn = [];
  if (i.CoA_MfgLotNo && mr.MfgLotNo && _qcmNorm(i.CoA_MfgLotNo) !== _qcmNorm(mr.MfgLotNo)) warn.push(`Lot ผู้ผลิตตาม CoA (${_qcEsc(i.CoA_MfgLotNo)}) ไม่ตรงกับตอนรับเข้า (${_qcEsc(mr.MfgLotNo)})`);
  if (i.CoA_ExpDate && mr.ExpDate && String(mr.ExpDate).slice(0, 10) !== String(i.CoA_ExpDate).slice(0, 10)) warn.push(`วันหมดอายุตาม CoA (${_qcEsc(String(i.CoA_ExpDate).slice(0, 10))}) ไม่ตรงกับตอนรับเข้า (${_qcEsc(String(mr.ExpDate).slice(0, 10))})`);
  if (i.CoA_ExpDate && String(i.CoA_ExpDate).slice(0, 10) < new Date().toISOString().slice(0, 10)) warn.push('วันหมดอายุตาม CoA ผ่านไปแล้ว');
  const kv = (k, v) => `<div><div class="k">${k}</div><div class="v">${_qcEsc(v || '—')}</div></div>`;
  const rrows = results.map(r => `<div class="qcm-item"><div><div class="nm">${_qcEsc(r.Parameter)}</div><div class="cr">${r.ParamType === 'numeric' ? `เกณฑ์ ${r.MinValue ?? '−∞'} – ${r.MaxValue ?? '+∞'} ${_qcEsc(r.Unit || '')}` : 'ผ่าน / ไม่ผ่าน'}</div></div>
      <div style="text-align:right"><b>${r.Measured != null ? r.Measured + ' ' + _qcEsc(r.Unit || '') : ''}</b> ${r.Pass ? '<span style="color:#16a34a;font-weight:700">ผ่าน</span>' : '<span style="color:#dc2626;font-weight:700">ไม่ผ่าน</span>'}</div></div>`).join('');
  document.getElementById('qcm-sheet').innerHTML = `
    <div class="sh-head"><button onclick="qcmCloseSheet()"><i class="fas fa-arrow-left"></i></button>
      <div class="t"><b>${_qcEsc(i.MaterialName)}</b><small>Lot ${_qcEsc(i.Lot)} · ${(i.Qty || 0).toLocaleString()} ${_qcEsc(i.UOM || '')} · ผู้บันทึก ${_qcEsc(i.Inspector || '')}</small></div></div>
    <div class="sh-body"><div class="sh-inner">
      <div class="qcm-step"><h6>ข้อมูลจากเอกสาร CoA</h6><div class="qcm-kv">
        ${kv('Lot ผู้ผลิต', i.CoA_MfgLotNo)}${kv('วันผลิต', i.CoA_MfgDate)}${kv('วันหมดอายุ', i.CoA_ExpDate)}${kv('เลขที่ CoA', i.CoA_DocNo)}
        ${kv('ชื่อจากซัพ (ตาม CoA)', i.CoA_Product)}${kv('ชื่อของเรา', i.MaterialName)}${kv('ผู้ผลิต/ซัพ', i.CoA_Supplier)}${kv('ได้รับ CoA', i.CoAReceived ? 'ใช่' : 'ไม่')}${kv('หมายเหตุจากคลัง', i.Remark)}</div>
        ${warn.map(w => `<div class="qcm-warn"><i class="fas fa-triangle-exclamation me-1"></i>${w}</div>`).join('')}</div>
      <div class="qcm-step"><h6>รายการทดสอบ · Spec · ผล ตามเอกสาร CoA</h6>${coaRows || '<div class="meta">ไม่มีรายการจากเอกสาร</div>'}
        ${coa.length && !hasSpecNow ? `<button class="qcm-btn ghost" style="width:100%;margin-top:10px" onclick="qcmImportSpec(${id})"><i class="fas fa-file-import"></i>ใช้รายการนี้เป็น Spec ของวัตถุดิบนี้ (ยังไม่มี Spec)</button>` : ''}</div>
      <div class="qcm-step"><h6>ผลตรวจของเรา</h6>${rrows || '<div class="meta">ไม่มีรายการ</div>'}</div>
      <div class="qcm-step"><h6>การตัดสินของ Admin QC <small style="font-weight:400;color:#94a3b8">(คลังเสนอ: ${QCM_RESULT[i.Result]})</small></h6>
        <div class="qcm-resbtns" id="qcm-resbtns">${['PASS', 'CONDITIONAL', 'REJECT'].map(r => `<button type="button" class="qcm-btn ghost ${r} ${r === i.Result ? 'on' : ''}" onclick="qcmApprDecision('${r}')">${QCM_RESULT[r]}</button>`).join('')}</div>
        <label class="f" style="margin-top:10px;font-size:.78rem;color:#64748b">หมายเหตุ (ถ้าส่งกลับ ต้องระบุเหตุผล)</label><input class="qcm-in" id="qcm-a-remark"></div>
    </div></div>
    <div class="sh-foot"><button class="qcm-btn warn" style="flex:0 0 auto" onclick="qcmReturn(${id})"><i class="fas fa-rotate-left"></i>ส่งกลับแก้ไข</button>
      <button class="qcm-btn green" onclick="qcmApprove(${id})"><i class="fas fa-check"></i>อนุมัติ</button></div>`;
  document.getElementById('qcm-sheet').classList.add('open');
}
// สร้าง Spec ของวัตถุดิบ (qc_spec_items) จากรายการในเอกสาร CoA — ใช้เมื่อวัตถุดิบนี้ยังไม่มี Spec (Admin เท่านั้นตาม RLS)
async function qcmImportSpec(id) {
  const a = QCM.appr; if (!a || a.i._row_id !== id || !a.coa.length) return;
  if (QCM.specs.some(s => s.MaterialCode === a.i.MaterialCode)) { Swal.fire({ icon: 'info', title: 'วัตถุดิบนี้มี Spec แล้ว' }); return; }
  const c = await Swal.fire({ icon: 'question', title: 'สร้าง Spec จากเอกสาร?', text: `ใช้ ${a.coa.length} รายการจาก CoA เป็นมาตรฐานตรวจของ ${a.i.MaterialName} (แก้ไขภายหลังได้ที่หน้า QC > มาตรฐานตรวจ)`, showCancelButton: true, confirmButtonText: 'สร้าง Spec', cancelButtonText: 'ยกเลิก' });
  if (!c.isConfirmed) return;
  const rows = a.coa.map((r, n) => {
    const numeric = (r.SpecMin != null || r.SpecMax != null);
    return { MaterialCode: a.i.MaterialCode, Seq: n + 1, Parameter: r.Parameter, ParamType: numeric ? 'numeric' : 'passfail', MinValue: r.SpecMin, MaxValue: r.SpecMax, Unit: r.Unit || null, Method: r.SpecText || null };
  });
  _showLoader();
  const { error } = await _sb.from('qc_spec_items').insert(rows);
  _hideLoader();
  if (error) { _err('สร้าง Spec ไม่สำเร็จ', error.message); return; }
  QCM.specs = QCM.specs.concat(rows);
  _qcmAudit('QC_SPEC_IMPORT', a.i.MaterialCode, `${rows.length} รายการจาก CoA ${a.i.CoA_DocNo || ''}`);
  Swal.fire({ toast: true, position: 'top', icon: 'success', title: `สร้าง Spec ${rows.length} รายการแล้ว`, showConfirmButton: false, timer: 2500 });
  qcmOpenApprove(id);
}
function qcmApprDecision(r) {
  QCM.appr.decision = r;
  document.querySelectorAll('#qcm-resbtns .qcm-btn').forEach(b => b.classList.toggle('on', b.classList.contains(r)));
}
async function qcmApprove(id) {
  const a = QCM.appr; if (!a || a.i._row_id !== id) return;
  if (a.decision === 'PASS' && a.results.some(r => r.Pass === false)) {
    const c = await Swal.fire({ icon: 'warning', title: 'มีรายการไม่ผ่านแต่เลือก "ผ่าน"', text: 'ยืนยันอนุมัติปล่อยผ่านหรือไม่?', showCancelButton: true, confirmButtonText: 'ยืนยันอนุมัติ', cancelButtonText: 'กลับไปแก้' });
    if (!c.isConfirmed) return;
  }
  _showLoader();
  const { data, error } = await _sb.from('qc_inspections').update({
    Status: 'APPROVED', Result: a.decision, ApprovedBy: _currentUser?.email || null, ApprovedAt: new Date().toISOString(),
    ApproveRemark: document.getElementById('qcm-a-remark').value.trim() || null,
  }).eq('_row_id', id).eq('Status', 'PENDING_APPROVAL').select('_row_id');
  if (error) { _hideLoader(); _err('อนุมัติไม่สำเร็จ', error.message); return; }
  const done = data && data.length;
  if (done && a.decision !== 'PASS') await _qcmCreateNcr(id, a.i, a.results.filter(r => r.Pass === false).map(r => r.Parameter).join(', '));
  _hideLoader();
  if (done) _qcmAudit('QC_APPROVE', `${a.i.MaterialCode}/${a.i.Lot}`, `อนุมัติ: ${QCM_RESULT[a.decision]} (คลังเสนอ ${QCM_RESULT[a.i.Result]})`);
  qcmCloseSheet(); await qcmLoad(true);
  Swal.fire({ toast: true, position: 'top', icon: done ? 'success' : 'info', title: done ? (a.decision === 'PASS' ? 'อนุมัติแล้ว' : 'อนุมัติแล้ว — เปิด NCR ให้อัตโนมัติ') : 'ใบนี้ถูกดำเนินการไปแล้ว', showConfirmButton: false, timer: 2500 });
}
async function qcmReturn(id) {
  const a = QCM.appr; if (!a || a.i._row_id !== id) return;
  let reason = document.getElementById('qcm-a-remark').value.trim();
  if (!reason) {
    const r = await Swal.fire({ title: 'ส่งกลับแก้ไข', input: 'textarea', inputLabel: 'ระบุเหตุผลให้พนักงานคลังเห็น', inputValidator: v => (!v.trim() ? 'ต้องระบุเหตุผล' : undefined), showCancelButton: true, confirmButtonText: 'ส่งกลับ', cancelButtonText: 'ยกเลิก' });
    if (!r.isConfirmed) return; reason = r.value.trim();
  }
  _showLoader();
  const { data, error } = await _sb.from('qc_inspections').update({ Status: 'RETURNED', ApprovedBy: _currentUser?.email || null, ApprovedAt: new Date().toISOString(), ApproveRemark: reason })
    .eq('_row_id', id).eq('Status', 'PENDING_APPROVAL').select('_row_id');
  _hideLoader();
  if (error) { _err('ส่งกลับไม่สำเร็จ', error.message); return; }
  if (data && data.length) _qcmAudit('QC_RETURN', `${a.i.MaterialCode}/${a.i.Lot}`, reason);
  qcmCloseSheet(); await qcmLoad(true);
  Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'ส่งกลับให้คลังแก้ไขแล้ว', showConfirmButton: false, timer: 2000 });
}

// Tesseract โหลดไว้แล้วใน <head> ของ index.html — กัน _qcOcrCanvas (qc-coa.js) โหลดซ้ำอีกชุด
if (window.Tesseract && typeof _qcLibP !== 'undefined') _qcLibP[QC_TESS_SRC] = Promise.resolve();

// ── ใช้ในแอปหลัก (โหมดแท็บเลตคลัง WH01 → tile "ตรวจรับ QC" → _whOpenDesktopPage('qcwh')) ──
// แอปมือถือ (mobile/index.html) มี #mpage-qc อยู่แล้ว; แอปหลักไม่มี จึงสร้างหน้า #page-qcwh ให้ตอนโหลดสคริปต์
// (ต้องมีตั้งแต่ก่อนกด tile เพราะ showPage() เปิดได้เฉพาะ element ที่มีอยู่แล้ว) + ลงทะเบียน loader เข้า _PAGE_LOADERS
(function () {
  if (document.getElementById('mpage-qc')) return;                    // แอปมือถือ — ไม่ต้องทำอะไร
  const host = document.getElementById('page-holdstock')?.parentNode;
  if (!host || document.getElementById('page-qcwh')) return;
  const div = document.createElement('div');
  div.className = 'page-view'; div.id = 'page-qcwh';
  div.innerHTML = `<div class="page-header"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <h4 class="fw-bold mb-0" style="color:white"><i class="fas fa-vial-circle-check me-2"></i>ตรวจรับ QC</h4></div></div>
    <div class="scroll-content"><div id="qcm-root"><div style="text-align:center;color:#94a3b8;padding:40px"><i class="fas fa-spinner fa-spin"></i></div></div></div>`;
  host.appendChild(div);
  if (typeof _PAGE_LOADERS !== 'undefined') _PAGE_LOADERS['qcwh'] = () => qcmLoad();
})();

// ถ้า qc-coa.js บนเซิร์ฟเวอร์เป็นเวอร์ชันเก่า (ยังไม่ได้อัปโหลดไฟล์ใหม่ หรือ cache ค้าง) จะไม่มีตัวอ่านตารางผลวิเคราะห์ —
// ใส่ตัวแทนที่ไม่ทำอะไร กันหน้าตรวจรับพังทั้งหน้า แล้วแจ้งเตือนชัดๆ ตอนสแกน (ส่วนอื่นยังใช้งานได้ปกติ)
if (typeof _qcParseCoATable !== 'function') {
  window._qcCoaStale = true;
  window._qcParseCoATable = () => [];
  window._qcEvalCoARow = () => ({ min: null, max: null, num: null, pass: null });
}
