// ════════════════════════════════════════════════════
// ProFlow Wise MES — ระบบควบคุมคุณภาพ (QC) เฟส 1: ตรวจรับวัตถุดิบ (IQC) + มาตรฐานตรวจ + NCR
// ไฟล์นี้ต้องอัปโหลดคู่กับ index.html เสมอ (<script src="qc.js?v=..."> ท้าย index.html) — เปลี่ยนไฟล์นี้แล้วเลื่อนเลข ?v=
// ตาราง/RLS ดู create_qc_phase1.sql (ต้องรันก่อน) — เขียนได้เฉพาะ Admin, ทุกคนอ่านได้
// ใช้ global ของสคริปต์หลักตรงๆ: _sb, Swal, _hasRole, _err, _showLoader/_hideLoader, _logAudit, _fetchAllPagedRange, _currentUser
// สถานะ QC ของ Lot = ใบตรวจล่าสุดของ (MaterialCode, Lot); ไม่มีใบตรวจ: รับก่อน go_live = 'legacy' (ผ่าน), หลัง = 'pending'
// ════════════════════════════════════════════════════

const QC_DEFAULT_ITEMS = ['ลักษณะภายนอก/สี/กลิ่น', 'สภาพบรรจุภัณฑ์ (ไม่แตก/รั่ว/เปียก)', 'ฉลากและเลข Lot ตรงกับ CoA/ใบส่งของ', 'เอกสาร CoA ครบถ้วน'];
const QC_RESULT_LABEL = { PASS: 'ผ่าน', REJECT: 'ไม่ผ่าน', CONDITIONAL: 'ผ่านแบบมีเงื่อนไข' };
const QC_DISP_LABEL = { SCRAP: 'ทำลาย', RETURN_SUPPLIER: 'ส่งคืนซัพ', REWORK: 'Rework', USE_AS_IS: 'ใช้ตามสภาพ' };
const QC_NCR_STATUS = { OPEN: 'เปิด', IN_PROGRESS: 'กำลังแก้ไข', CLOSED: 'ปิดแล้ว' };

let _qcSettings = { go_live_date: null, enforce: false };
let _qcInspections = [], _qcSpecItems = [], _qcNcrs = [], _qcPendingLots = [];
let _qcStatusMap = {};        // "code|lot" → { result, inspId }
let _qcStatusAt = 0;
let _qcTab = 'pending';
let _qcReady = true;          // false = ยังไม่ได้รัน create_qc_phase1.sql
let _qcMaterials = [];
let _qcInspModal = null, _qcNcrModal = null, _qcCurInsp = null;

function _qcEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _qcAdmin() { return typeof _hasRole === 'function' && _hasRole('admin'); }
function _qcKey(code, lot) { return String(code || '') + '|' + String(lot || ''); }
function _qcBadge(result) {
  const m = { PASS: 'success', REJECT: 'danger', CONDITIONAL: 'warning text-dark', pending: 'secondary', legacy: 'light text-dark border' };
  const l = result === 'pending' ? 'รอตรวจ' : result === 'legacy' ? 'ก่อนเริ่มใช้ QC' : (QC_RESULT_LABEL[result] || result);
  return `<span class="badge bg-${m[result] || 'secondary'}">${l}</span>`;
}

// ── สร้างหน้า/แท็บครั้งแรก (ฉีด DOM เอง ไม่ต้องแก้โครงหน้าใน index.html) ──
function _qcEnsurePage() {
  if (document.getElementById('page-qc')) return;
  const host = document.getElementById('page-holdstock')?.parentNode;
  if (!host) return;
  const div = document.createElement('div');
  div.className = 'page-view'; div.id = 'page-qc';
  div.innerHTML = `
    <div class="page-header">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h4 class="fw-bold mb-0" style="color:white"><i class="fas fa-clipboard-check me-2"></i>ควบคุมคุณภาพ (QC)</h4>
        <button class="btn btn-light btn-sm fw-bold text-primary shadow-sm" onclick="qcLoadPage()"><i class="fas fa-sync me-1"></i>รีเฟรช</button>
      </div>
    </div>
    <div class="sticky-toolbar"><div class="glass-card py-2 mb-2">
      <ul class="nav nav-pills gap-1" id="qc-tabs">
        <li class="nav-item"><a href="#" class="nav-link py-1" data-tab="pending" onclick="qcSetTab('pending');return false">รอตรวจ <span class="badge bg-danger ms-1" id="qc-pending-count">0</span></a></li>
        <li class="nav-item"><a href="#" class="nav-link py-1" data-tab="insp" onclick="qcSetTab('insp');return false">ใบตรวจ</a></li>
        <li class="nav-item"><a href="#" class="nav-link py-1" data-tab="ncr" onclick="qcSetTab('ncr');return false">NCR <span class="badge bg-warning text-dark ms-1" id="qc-ncr-count">0</span></a></li>
        <li class="nav-item"><a href="#" class="nav-link py-1" data-tab="spec" onclick="qcSetTab('spec');return false">มาตรฐานตรวจ (Spec)</a></li>
        <li class="nav-item"><a href="#" class="nav-link py-1" data-tab="settings" onclick="qcSetTab('settings');return false">ตั้งค่า</a></li>
      </ul></div>
    </div>
    <div class="scroll-content" id="qc-body"></div>
    <style>
      /* แท็บเลต/จอสัมผัส: ปุ่ม-ช่องกรอกใหญ่พอแตะ (≥44px) + โมดัลตรวจรับเต็มจอบนจอ <1200px */
      #qcInspModal .btn, #qcInspModal .form-control, #qcInspModal .form-select { min-height: 44px; font-size: 1rem; }
      #qcInspModal .qc-pf .btn { min-width: 84px; }
      #qcInspModal .qc-thumb { position: relative; width: 108px; }
      #qcInspModal .qc-thumb img { width: 108px; height: 108px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; transition: transform .15s; }
      #qcInspModal .qc-thumb .btn { min-height: 36px; padding: 2px 8px; }
    </style>
    <div class="modal fade" id="qcInspModal" tabindex="-1"><div class="modal-dialog modal-xl modal-fullscreen-xl-down modal-dialog-scrollable"><div class="modal-content" id="qcInspModalBody"></div></div></div>
    <div class="modal fade" id="qcNcrModal" tabindex="-1"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content" id="qcNcrModalBody"></div></div></div>`;
  host.appendChild(div);
  _qcInspModal = new bootstrap.Modal(document.getElementById('qcInspModal'));
  _qcNcrModal = new bootstrap.Modal(document.getElementById('qcNcrModal'));
}

async function qcLoadPage() {
  _qcEnsurePage();
  const _b = document.getElementById("qc-body"); if (_b) _b.innerHTML = "<div class=\"glass-card text-center text-muted py-4\"><i class=\"fas fa-spinner fa-spin me-2\"></i>กำลังโหลดข้อมูล...</div>";
  _showLoader();
  try {
    await _qcLoadAll();
  } finally { _hideLoader(); }
  qcSetTab(_qcTab);
}

async function _qcLoadAll() {
  const sRes = await _sb.from('qc_settings').select('*').eq('id', 1).maybeSingle();
  if (sRes.error) { _qcReady = false; return; }   // ตารางยังไม่ถูกสร้าง
  _qcReady = true;
  if (sRes.data) _qcSettings = sRes.data;
  const [iRes, spRes, nRes] = await Promise.all([
    _sb.from('qc_inspections').select('*').order('_row_id', { ascending: false }).limit(1000),
    _sb.from('qc_spec_items').select('*').order('MaterialCode').order('Seq'),
    _sb.from('qc_ncr').select('*').order('_row_id', { ascending: false }).limit(500),
  ]);
  if (!_qcMaterials.length) { const m = await _fetchAllPaged('materials', 'MaterialCode,MaterialName'); _qcMaterials = m.data || m || []; if (!Array.isArray(_qcMaterials)) _qcMaterials = []; }
  _qcInspections = iRes.data || []; _qcSpecItems = spRes.data || []; _qcNcrs = nRes.data || [];
  _qcBuildStatusMap();
  // Lot ที่รับตั้งแต่ go_live และยังไม่มีใบตรวจ
  const start = _qcSettings.go_live_date || '1900-01-01';
  const mr = await _fetchAllPagedRange('mr_receive', '_row_id,Date,MaterialCode,MaterialName,Lot,Qty,UOM,Supplier,MfgLotNo,ExpDate', 'Date', start, '9999-12-31');
  const agg = {};
  (mr.data || []).forEach(r => {
    if (!r.MaterialCode || !r.Lot) return;
    const k = _qcKey(r.MaterialCode, r.Lot);
    if (_qcStatusMap[k]) return;
    const a = agg[k] || (agg[k] = { ...r, Qty: 0 });
    a.Qty += parseFloat(r.Qty) || 0;
    if (r.Date > a.Date) { a.Date = r.Date; a._row_id = r._row_id; }
  });
  _qcPendingLots = Object.values(agg).sort((a, b) => (a.Date < b.Date ? 1 : -1));
  _qcStatusAt = Date.now();
}

function _qcBuildStatusMap() {
  _qcStatusMap = {};
  // เรียงใหม่→เก่า: ตัวแรกที่เจอคือใบตรวจล่าสุด
  _qcInspections.forEach(i => {
    const k = _qcKey(i.MaterialCode, i.Lot);
    if (!_qcStatusMap[k]) _qcStatusMap[k] = { result: i.Result, inspId: i._row_id };
  });
}

function qcSetTab(tab) {
  _qcTab = tab;
  document.querySelectorAll('#qc-tabs .nav-link').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  const el = document.getElementById('qc-pending-count'); if (el) el.textContent = _qcPendingLots.length;
  const nc = document.getElementById('qc-ncr-count'); if (nc) nc.textContent = _qcNcrs.filter(n => n.Status !== 'CLOSED').length;
  const body = document.getElementById('qc-body');
  if (!_qcReady) {
    body.innerHTML = `<div class="alert alert-warning">ยังไม่ได้สร้างตาราง QC — รัน <code>create_qc_phase1.sql</code> ใน Supabase SQL Editor ก่อน</div>`;
    return;
  }
  ({ pending: _qcRenderPending, insp: _qcRenderInsp, ncr: _qcRenderNcr, spec: _qcRenderSpec, settings: _qcRenderSettings }[tab] || _qcRenderPending)(body);
}

// ── แท็บ: รอตรวจ ──
function _qcRenderPending(body) {
  const adm = _qcAdmin();
  const rows = _qcPendingLots.map((r, i) => `<tr>
      <td>${_qcEsc(r.Date)}</td><td><span class="badge bg-secondary">${_qcEsc(r.MaterialCode)}</span> ${_qcEsc(r.MaterialName)}</td>
      <td>${_qcEsc(r.Lot)}</td><td>${_qcEsc(r.MfgLotNo || '—')}</td><td class="text-end">${(r.Qty || 0).toLocaleString()} ${_qcEsc(r.UOM || '')}</td>
      <td>${_qcEsc(r.Supplier || '—')}</td>
      <td>${adm ? `<button class="btn btn-sm btn-primary" onclick="qcOpenInspect(${i})"><i class="fas fa-clipboard-check me-1"></i>ตรวจ</button>` : '<span class="text-muted small">รอแอดมินตรวจ</span>'}</td></tr>`).join('');
  body.innerHTML = `<div class="glass-card"><div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>วันที่รับ</th><th>วัตถุดิบ</th><th>Lot</th><th>Lot ผู้ผลิต</th><th class="text-end">จำนวน</th><th>ซัพ</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">ไม่มี Lot ที่รอตรวจ 🎉</td></tr>'}</tbody></table></div>
    <small class="text-muted">แสดงเฉพาะ Lot ที่รับตั้งแต่ ${_qcEsc(_qcSettings.go_live_date || '—')} (วันเริ่มใช้ QC) และยังไม่มีใบตรวจ</small></div>`;
}

// ── ใบตรวจ IQC ──
function _qcSpecFor(code) { return _qcSpecItems.filter(s => s.MaterialCode === code); }

function qcOpenInspect(idx) {
  const lot = _qcPendingLots[idx]; if (!lot) return;
  _qcCurInsp = { lot, items: [] };
  if (typeof qcClearScanQueue === 'function') qcClearScanQueue();
  const spec = _qcSpecFor(lot.MaterialCode);
  const items = spec.length ? spec.map(s => ({ Parameter: s.Parameter, ParamType: s.ParamType, MinValue: s.MinValue, MaxValue: s.MaxValue, Unit: s.Unit, Method: s.Method }))
    : QC_DEFAULT_ITEMS.map(p => ({ Parameter: p, ParamType: 'passfail' }));
  _qcCurInsp.items = items;
  const rows = items.map((it, i) => {
    const crit = it.ParamType === 'numeric'
      ? `${it.MinValue != null ? it.MinValue : '−∞'} – ${it.MaxValue != null ? it.MaxValue : '+∞'} ${_qcEsc(it.Unit || '')}`
      : _qcEsc(it.Method || 'ผ่าน/ไม่ผ่าน');
    const input = it.ParamType === 'numeric'
      ? `<input type="number" step="any" inputmode="decimal" class="form-control" id="qc-m-${i}" oninput="qcCalcResult()">`
      // ผ่าน/ไม่ผ่านเป็นปุ่มใหญ่แตะง่าย (ค่าเก็บใน input ซ่อน id เดิม เพื่อให้ตรรกะคำนวณผลใช้ต่อได้)
      : `<div class="btn-group qc-pf w-100" id="qc-pfg-${i}"><input type="hidden" id="qc-m-${i}" value="">
           <button type="button" class="btn btn-outline-success" onclick="qcSetPF(${i},'1')">ผ่าน</button>
           <button type="button" class="btn btn-outline-danger" onclick="qcSetPF(${i},'0')">ไม่ผ่าน</button></div>`;
    return `<tr><td>${_qcEsc(it.Parameter)}</td><td class="small text-muted">${crit}</td><td style="width:${it.ParamType === 'numeric' ? 150 : 210}px">${input}</td><td style="width:70px" id="qc-p-${i}">—</td></tr>`;
  }).join('');
  document.getElementById('qcInspModalBody').innerHTML = `
    <div class="modal-header"><h5 class="modal-title"><i class="fas fa-clipboard-check me-2"></i>ตรวจรับ ${_qcEsc(lot.MaterialName)} — Lot ${_qcEsc(lot.Lot)}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      ${spec.length ? '' : '<div class="alert alert-info py-2 small">วัตถุดิบนี้ยังไม่มี Spec — ใช้เช็คลิสต์พื้นฐาน (เพิ่ม Spec ได้ที่แท็บ "มาตรฐานตรวจ")</div>'}
      <div class="row g-2 mb-2">
        <div class="col-md-4"><label class="form-label small mb-0">วันที่ตรวจ</label><input type="date" id="qc-i-date" class="form-control form-control-sm" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="col-md-4 d-flex align-items-end"><div class="form-check"><input class="form-check-input" type="checkbox" id="qc-i-coa"><label class="form-check-label" for="qc-i-coa">ได้รับ CoA จากซัพ</label></div></div>
      </div>
      <div class="border rounded p-2 mb-2 bg-light">
        <div class="d-flex flex-wrap gap-2 align-items-center">
          <b class="small"><i class="fas fa-camera me-1"></i>สแกนเอกสาร CoA</b>
          <label class="btn btn-outline-primary mb-0"><i class="fas fa-camera me-1"></i>ถ่ายรูป (ทีละหน้า)<input type="file" accept="image/*" capture="environment" hidden onchange="qcAddScanFiles(this)"></label>
          <label class="btn btn-outline-secondary mb-0"><i class="fas fa-upload me-1"></i>เลือกรูป/PDF<input type="file" accept="image/*,application/pdf" multiple hidden onchange="qcAddScanFiles(this)"></label>
          <small class="text-muted">อ่านข้อมูลในเครื่องนี้เท่านั้น — ไม่เก็บรูป/ไฟล์ไว้ที่ใด เก็บเฉพาะค่าที่ดึงได้ (ตรวจแก้ได้ก่อนบันทึก)</small>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-2" id="qc-scan-queue"></div>
        <div class="mt-2" id="qc-scan-actions" style="display:none"><button type="button" class="btn btn-primary" onclick="qcRunScan()"><i class="fas fa-magnifying-glass me-1"></i>อ่านเอกสาร</button></div>
        <div class="small mt-1" id="qc-scan-status"></div>
        <div class="row g-2 mt-1">
          <div class="col-md-3"><label class="form-label small mb-0">Lot ผู้ผลิต (ตาม CoA)</label><input id="qc-d-lot" class="form-control form-control-sm"></div>
          <div class="col-md-3"><label class="form-label small mb-0">วันผลิต</label><input type="date" id="qc-d-mfg" class="form-control form-control-sm"></div>
          <div class="col-md-3"><label class="form-label small mb-0">วันหมดอายุ</label><input type="date" id="qc-d-exp" class="form-control form-control-sm"></div>
          <div class="col-md-3"><label class="form-label small mb-0">เลขที่เอกสาร CoA</label><input id="qc-d-no" class="form-control form-control-sm"></div>
          <div class="col-md-6"><label class="form-label small mb-0">ชื่อสินค้าตาม CoA</label><input id="qc-d-prod" class="form-control form-control-sm"></div>
          <div class="col-md-6"><label class="form-label small mb-0">ผู้ผลิต/ซัพตาม CoA</label><input id="qc-d-sup" class="form-control form-control-sm"></div>
        </div>
        <div id="qc-d-warn" class="small mt-1"></div>
        <details class="small mt-1" id="qc-scan-raw" style="display:none"><summary class="text-muted">ดูข้อความที่อ่านได้</summary><pre class="mb-0" id="qc-scan-rawtext" style="white-space:pre-wrap;max-height:160px;overflow:auto"></pre></details>
      </div>
      <table class="table table-sm align-middle"><thead><tr><th>รายการตรวจ</th><th>เกณฑ์</th><th>ผลที่วัดได้</th><th>ผล</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="row g-2">
        <div class="col-md-5"><label class="form-label small mb-0">ผลการตัดสิน</label>
          <select id="qc-i-result" class="form-select"><option value="PASS">ผ่าน (Released)</option><option value="CONDITIONAL">ผ่านแบบมีเงื่อนไข</option><option value="REJECT">ไม่ผ่าน (Reject)</option></select>
          <small class="text-muted" id="qc-i-suggest"></small></div>
        <div class="col-md-7"><label class="form-label small mb-0">หมายเหตุ</label><input type="text" id="qc-i-remark" class="form-control"></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">ยกเลิก</button><button class="btn btn-primary" onclick="qcSaveInspect()"><i class="fas fa-save me-1"></i>บันทึกผลตรวจ</button></div>`;
  _qcInspModal.show();
}

// ปุ่ม ผ่าน/ไม่ผ่าน (แตะซ้ำที่ปุ่มเดิม = ล้างค่า)
function qcSetPF(i, v) {
  const el = document.getElementById('qc-m-' + i);
  el.value = el.value === v ? '' : v;
  el.dataset.auto = '';   // ผู้ตรวจยืนยันเอง — เลิกขึ้นสีเหลือง "ดึงจากเอกสาร"
  qcCalcResult();
}
function qcSyncPF(i) {
  const g = document.getElementById('qc-pfg-' + i); if (!g) return;
  const el = document.getElementById('qc-m-' + i), v = el.value, b = g.querySelectorAll('button');
  b[0].classList.toggle('btn-success', v === '1'); b[0].classList.toggle('btn-outline-success', v !== '1');
  b[1].classList.toggle('btn-danger', v === '0'); b[1].classList.toggle('btn-outline-danger', v !== '0');
  g.style.background = el.dataset.auto === '1' ? '#fff8c4' : '';
}

// ประเมินผลรายแถว + แนะนำผลรวม (ผู้ตรวจเปลี่ยนเองได้)
function qcCalcResult() {
  let anyFail = false, anyBlank = false;
  _qcCurInsp.items.forEach((it, i) => {
    qcSyncPF(i);
    const v = document.getElementById('qc-m-' + i).value;
    const cell = document.getElementById('qc-p-' + i);
    let pass = null;
    if (v === '') anyBlank = true;
    else if (it.ParamType === 'numeric') {
      const n = parseFloat(v);
      pass = !(it.MinValue != null && n < it.MinValue) && !(it.MaxValue != null && n > it.MaxValue);
    } else pass = v === '1';
    it._pass = pass;
    cell.innerHTML = pass == null ? '—' : pass ? '<span class="text-success fw-bold">ผ่าน</span>' : '<span class="text-danger fw-bold">ไม่ผ่าน</span>';
    if (pass === false) anyFail = true;
  });
  const sel = document.getElementById('qc-i-result');
  if (anyFail) { sel.value = 'REJECT'; document.getElementById('qc-i-suggest').textContent = 'มีรายการไม่ผ่าน — แนะนำ Reject'; }
  else if (!anyBlank) { sel.value = 'PASS'; document.getElementById('qc-i-suggest').textContent = 'ทุกรายการผ่าน'; }
  else document.getElementById('qc-i-suggest').textContent = 'กรอกผลให้ครบทุกรายการ';
}

async function qcSaveInspect() {
  if (!_qcAdmin()) return;
  const { lot, items } = _qcCurInsp;
  qcCalcResult();
  if (items.some(it => it._pass == null)) { Swal.fire({ icon: 'warning', title: 'กรอกผลตรวจให้ครบทุกรายการก่อน' }); return; }
  const result = document.getElementById('qc-i-result').value;
  if (result === 'PASS' && items.some(it => it._pass === false)) {
    const c = await Swal.fire({ icon: 'warning', title: 'มีรายการไม่ผ่านแต่เลือก "ผ่าน"', text: 'ยืนยันปล่อยผ่านหรือไม่?', showCancelButton: true, confirmButtonText: 'ยืนยันปล่อยผ่าน', cancelButtonText: 'กลับไปแก้' });
    if (!c.isConfirmed) return;
  }
  _showLoader();
  const head = {
    InspType: 'IQC', InspDate: document.getElementById('qc-i-date').value, MaterialCode: lot.MaterialCode, MaterialName: lot.MaterialName,
    Lot: lot.Lot, MR_RowId: lot._row_id, Qty: lot.Qty, UOM: lot.UOM, Supplier: lot.Supplier,
    CoAReceived: document.getElementById('qc-i-coa').checked, Result: result,
    Remark: document.getElementById('qc-i-remark').value || null, Inspector: _currentUser?.email || null,
  };
  // ค่าจากเอกสาร CoA — ใส่เฉพาะเมื่อกรอก/สแกนมา (ต้องรัน alter_qc_inspections_add_coa_fields.sql ก่อนถึงจะบันทึกคอลัมน์เหล่านี้ได้)
  const dv = id => document.getElementById(id).value.trim() || null;
  const doc = { CoA_MfgLotNo: dv('qc-d-lot'), CoA_MfgDate: dv('qc-d-mfg'), CoA_ExpDate: dv('qc-d-exp'), CoA_DocNo: dv('qc-d-no'), CoA_Product: dv('qc-d-prod'), CoA_Supplier: dv('qc-d-sup') };
  if (Object.values(doc).some(Boolean)) Object.assign(head, doc);
  const ins = await _sb.from('qc_inspections').insert(head).select('_row_id').single();
  if (ins.error) { _hideLoader(); _err('บันทึกใบตรวจไม่สำเร็จ', ins.error.message); return; }
  const rows = items.map((it, i) => ({
    InspectionId: ins.data._row_id, Parameter: it.Parameter, ParamType: it.ParamType, MinValue: it.MinValue ?? null, MaxValue: it.MaxValue ?? null,
    Unit: it.Unit || null, Measured: it.ParamType === 'numeric' ? parseFloat(document.getElementById('qc-m-' + i).value) : null, Pass: it._pass,
  }));
  const r2 = await _sb.from('qc_inspection_results').insert(rows);
  _hideLoader();
  if (r2.error) { _err('บันทึกผลรายรายการไม่สำเร็จ', r2.error.message); return; }
  _logAudit('QC_INSPECT', 'qc_inspections', `${lot.MaterialCode}/${lot.Lot}`, `IQC ${QC_RESULT_LABEL[result]}`);
  _qcInspModal.hide();
  if (result !== 'PASS') {
    const failed = items.filter(it => it._pass === false).map(it => it.Parameter).join(', ');
    await qcOpenNcr(null, { inspId: ins.data._row_id, lot, desc: failed ? `ไม่ผ่าน: ${failed}` : '' });
  }
  await qcLoadPage();
  Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'บันทึกผลตรวจแล้ว', showConfirmButton: false, timer: 2000 });
}

// ── แท็บ: ประวัติใบตรวจ ──
function _qcRenderInsp(body) {
  const rows = _qcInspections.map(i => `<tr><td>${_qcEsc(i.InspDate)}</td><td>${_qcEsc(i.InspType)}</td>
    <td><span class="badge bg-secondary">${_qcEsc(i.MaterialCode)}</span> ${_qcEsc(i.MaterialName)}</td><td>${_qcEsc(i.Lot)}</td>
    <td>${_qcBadge(i.Result)}</td><td>${i.CoAReceived ? '✔' : '—'}</td><td class="small">${_qcEsc(i.Inspector || '')}</td><td class="small">${_qcEsc(i.Remark || '')}</td>
    <td><button class="btn btn-sm btn-outline-secondary" onclick="qcViewInsp(${i._row_id})">ดู</button></td></tr>`).join('');
  body.innerHTML = `<div class="glass-card"><div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>วันที่</th><th>ชนิด</th><th>วัตถุดิบ</th><th>Lot</th><th>ผล</th><th>CoA</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="text-center text-muted py-4">ยังไม่มีใบตรวจ</td></tr>'}</tbody></table></div></div>`;
}

async function qcViewInsp(id) {
  const i = _qcInspections.find(x => x._row_id === id); if (!i) return;
  const { data } = await _sb.from('qc_inspection_results').select('*').eq('InspectionId', id).order('_row_id');
  const rows = (data || []).map(r => `<tr><td>${_qcEsc(r.Parameter)}</td><td>${r.Measured != null ? r.Measured + ' ' + _qcEsc(r.Unit || '') : '—'}</td><td>${r.Pass ? '<span class="text-success">ผ่าน</span>' : '<span class="text-danger">ไม่ผ่าน</span>'}</td></tr>`).join('');
  Swal.fire({ title: `${_qcEsc(i.MaterialName)} — Lot ${_qcEsc(i.Lot)}`, width: 600,
    html: `<div class="text-start small mb-2">${_qcEsc(i.InspDate)} · ${_qcBadge(i.Result)} · ผู้ตรวจ ${_qcEsc(i.Inspector || '—')}</div><table class="table table-sm text-start"><tbody>${rows}</tbody></table>` });
}

// ── NCR ──
function _qcRenderNcr(body) {
  const adm = _qcAdmin();
  const rows = _qcNcrs.map(n => `<tr><td><b>${_qcEsc(n.NCR_No)}</b></td><td>${_qcEsc(n.OpenedDate)}</td><td>${_qcEsc(n.MaterialName || n.MaterialCode || '')} <small class="text-muted">Lot ${_qcEsc(n.Lot || '—')}</small></td>
    <td class="small">${_qcEsc(n.Description)}</td><td>${n.Disposition ? QC_DISP_LABEL[n.Disposition] : '—'}</td>
    <td><span class="badge bg-${n.Status === 'CLOSED' ? 'success' : n.Status === 'OPEN' ? 'danger' : 'warning text-dark'}">${QC_NCR_STATUS[n.Status]}</span></td>
    <td>${adm ? `<button class="btn btn-sm btn-outline-primary" onclick="qcOpenNcr(${n._row_id})">แก้ไข/ปิด</button>` : ''}</td></tr>`).join('');
  body.innerHTML = `<div class="glass-card"><div class="alert alert-light border py-2 small mb-2">เมื่อจัดการ "ทำลาย/ส่งคืนซัพ" ให้ย้ายของเข้าสต็อก Defect ที่หน้า <b>สต็อก Defect/Retain</b> ด้วย (เฟสนี้ยังไม่ตัดสต็อกอัตโนมัติ)</div>
    <div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>เลข NCR</th><th>วันที่เปิด</th><th>วัตถุดิบ</th><th>ปัญหา</th><th>การจัดการ</th><th>สถานะ</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="text-center text-muted py-4">ไม่มี NCR</td></tr>'}</tbody></table></div></div>`;
}

async function _qcNextNcrNo() {
  const ym = new Date().toISOString().slice(2, 7).replace('-', '');
  const prefix = `NCR-${ym}-`;
  const { data } = await _sb.from('qc_ncr').select('NCR_No').like('NCR_No', prefix + '%').order('NCR_No', { ascending: false }).limit(1);
  const last = data && data[0] ? parseInt(data[0].NCR_No.slice(prefix.length)) || 0 : 0;
  return prefix + String(last + 1).padStart(3, '0');
}

// ctx: ใหม่จากใบตรวจ { inspId, lot, desc } ; id: แก้ NCR เดิม
async function qcOpenNcr(id, ctx) {
  if (!_qcAdmin()) return;
  const n = id ? _qcNcrs.find(x => x._row_id === id) : null;
  const lot = ctx?.lot;
  const v = n || { Description: ctx?.desc || '', Disposition: '', Status: 'OPEN', MaterialCode: lot?.MaterialCode, MaterialName: lot?.MaterialName, Lot: lot?.Lot, Qty: lot?.Qty, UOM: lot?.UOM, Supplier: lot?.Supplier, InspectionId: ctx?.inspId };
  _qcCurInsp = { ncrId: id, base: v };
  const opt = (map, cur, blank) => (blank ? '<option value="">— เลือก —</option>' : '') + Object.entries(map).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
  document.getElementById('qcNcrModalBody').innerHTML = `
    <div class="modal-header"><h5 class="modal-title"><i class="fas fa-triangle-exclamation me-2"></i>${n ? 'แก้ไข ' + _qcEsc(n.NCR_No) : 'เปิด NCR ใหม่'}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><div class="row g-2">
      <div class="col-12 small text-muted">${_qcEsc(v.MaterialName || '')} · Lot ${_qcEsc(v.Lot || '—')} · ${(v.Qty || 0).toLocaleString()} ${_qcEsc(v.UOM || '')} · ซัพ ${_qcEsc(v.Supplier || '—')}</div>
      <div class="col-12"><label class="form-label small mb-0">ปัญหาที่พบ *</label><textarea id="qc-n-desc" class="form-control" rows="2">${_qcEsc(v.Description)}</textarea></div>
      <div class="col-md-6"><label class="form-label small mb-0">การจัดการของ (Disposition)</label><select id="qc-n-disp" class="form-select">${opt(QC_DISP_LABEL, v.Disposition, true)}</select></div>
      <div class="col-md-6"><label class="form-label small mb-0">สถานะ</label><select id="qc-n-status" class="form-select">${opt(QC_NCR_STATUS, v.Status)}</select></div>
      <div class="col-12"><label class="form-label small mb-0">สาเหตุ (Root cause)</label><input id="qc-n-root" class="form-control" value="${_qcEsc(v.RootCause || '')}"></div>
      <div class="col-12"><label class="form-label small mb-0">การแก้ไข/ป้องกัน</label><input id="qc-n-corr" class="form-control" value="${_qcEsc(v.CorrectiveAction || '')}"></div>
    </div></div>
    <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button><button class="btn btn-primary" onclick="qcSaveNcr()"><i class="fas fa-save me-1"></i>บันทึก NCR</button></div>`;
  _qcNcrModal.show();
  return new Promise(res => { document.getElementById('qcNcrModal').addEventListener('hidden.bs.modal', res, { once: true }); });
}

async function qcSaveNcr() {
  const { ncrId, base } = _qcCurInsp;
  const desc = document.getElementById('qc-n-desc').value.trim();
  if (!desc) { Swal.fire({ icon: 'warning', title: 'ระบุปัญหาที่พบ' }); return; }
  const status = document.getElementById('qc-n-status').value;
  const payload = {
    Description: desc, Disposition: document.getElementById('qc-n-disp').value || null, Status: status,
    RootCause: document.getElementById('qc-n-root').value || null, CorrectiveAction: document.getElementById('qc-n-corr').value || null,
    ClosedDate: status === 'CLOSED' ? new Date().toISOString().slice(0, 10) : null,
  };
  _showLoader();
  let error;
  if (ncrId) ({ error } = await _sb.from('qc_ncr').update(payload).eq('_row_id', ncrId));
  else ({ error } = await _sb.from('qc_ncr').insert({
    ...payload, NCR_No: await _qcNextNcrNo(), InspectionId: base.InspectionId || null, MaterialCode: base.MaterialCode, MaterialName: base.MaterialName,
    Lot: base.Lot, Qty: base.Qty, UOM: base.UOM, Supplier: base.Supplier, CreatedBy: _currentUser?.email || null,
  }));
  _hideLoader();
  if (error) { _err('บันทึก NCR ไม่สำเร็จ', error.message); return; }
  _logAudit(ncrId ? 'EDIT' : 'CREATE', 'qc_ncr', base.Lot, desc);
  _qcNcrModal.hide();
  if (document.getElementById('page-qc')?.classList.contains('active')) qcLoadPage();
}

// ── Spec ──
function _qcRenderSpec(body) {
  const adm = _qcAdmin();
  const byMat = {};
  _qcSpecItems.forEach(s => (byMat[s.MaterialCode] = byMat[s.MaterialCode] || []).push(s));
  const cards = Object.entries(byMat).map(([code, items]) => `<tr><td><span class="badge bg-secondary">${_qcEsc(code)}</span> ${_qcEsc((_qcMaterials.find(m => m.MaterialCode === code) || {}).MaterialName || '')}</td>
    <td class="small">${items.map(s => _qcEsc(s.Parameter) + (s.ParamType === 'numeric' ? ` (${s.MinValue ?? ''}–${s.MaxValue ?? ''} ${_qcEsc(s.Unit || '')})` : '')).join(' · ')}</td>
    <td>${adm ? `<button class="btn btn-sm btn-outline-primary" onclick="qcEditSpec('${_qcEsc(code)}')">แก้ไข</button>` : ''}</td></tr>`).join('');
  body.innerHTML = `<div class="glass-card">
    ${adm ? `<div class="d-flex gap-2 mb-2 flex-wrap"><input id="qc-spec-new" list="qc-mat-list" class="form-control form-control-sm" style="max-width:340px" placeholder="พิมพ์ค้นหารหัส/ชื่อวัตถุดิบ แล้วเลือกจากรายการ" autocomplete="off" onkeydown="if(event.key==='Enter')qcAddSpecFromInput()"><datalist id="qc-mat-list">${_qcMaterials.map(m => `<option value="${_qcEsc(m.MaterialCode)}">${_qcEsc(m.MaterialName || '')}</option>`).join('')}</datalist><button class="btn btn-sm btn-primary" onclick="qcAddSpecFromInput()"><i class="fas fa-plus me-1"></i>เพิ่ม/แก้ Spec</button></div>` : ''}
    <div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>วัตถุดิบ</th><th>รายการตรวจ</th><th></th></tr></thead>
    <tbody>${cards || '<tr><td colspan="3" class="text-center text-muted py-4">ยังไม่มี Spec — วัตถุดิบที่ไม่มี Spec จะใช้เช็คลิสต์พื้นฐาน 4 ข้อ</td></tr>'}</tbody></table></div></div>`;
}

async function qcEditSpec(code) {
  if (!_qcAdmin() || !code) return;
  const items = _qcSpecFor(code).map(s => ({ ...s }));
  window._qcSpecDraft = { code, items: items.length ? items : [{ Parameter: '', ParamType: 'passfail' }] };
  _qcSpecDialog();
}
function _qcSpecDialog() {
  const d = window._qcSpecDraft;
  const rows = d.items.map((s, i) => `<tr>
    <td><input class="form-control form-control-sm" value="${_qcEsc(s.Parameter)}" oninput="_qcSpecDraft.items[${i}].Parameter=this.value"></td>
    <td><select class="form-select form-select-sm" onchange="_qcSpecDraft.items[${i}].ParamType=this.value;_qcSpecDialogRedraw()"><option value="passfail" ${s.ParamType === 'passfail' ? 'selected' : ''}>ผ่าน/ไม่ผ่าน</option><option value="numeric" ${s.ParamType === 'numeric' ? 'selected' : ''}>ตัวเลข</option></select></td>
    <td><input type="number" step="any" class="form-control form-control-sm" ${s.ParamType !== 'numeric' ? 'disabled' : ''} value="${s.MinValue ?? ''}" oninput="_qcSpecDraft.items[${i}].MinValue=this.value===''?null:parseFloat(this.value)"></td>
    <td><input type="number" step="any" class="form-control form-control-sm" ${s.ParamType !== 'numeric' ? 'disabled' : ''} value="${s.MaxValue ?? ''}" oninput="_qcSpecDraft.items[${i}].MaxValue=this.value===''?null:parseFloat(this.value)"></td>
    <td><input class="form-control form-control-sm" style="width:70px" value="${_qcEsc(s.Unit || '')}" oninput="_qcSpecDraft.items[${i}].Unit=this.value"></td>
    <td><input class="form-control form-control-sm" value="${_qcEsc(s.Method || '')}" placeholder="เกณฑ์/วิธีตรวจ" oninput="_qcSpecDraft.items[${i}].Method=this.value"></td>
    <td><button class="btn btn-sm btn-outline-danger" onclick="_qcSpecDraft.items.splice(${i},1);_qcSpecDialogRedraw()">✕</button></td></tr>`).join('');
  Swal.fire({ title: 'Spec: ' + _qcEsc(d.code), width: 900, showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
    html: `<table class="table table-sm text-start"><thead><tr><th>รายการ</th><th>ชนิด</th><th>Min</th><th>Max</th><th>หน่วย</th><th>เกณฑ์/วิธี</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <button class="btn btn-sm btn-outline-secondary" onclick="_qcSpecDraft.items.push({Parameter:'',ParamType:'passfail'});_qcSpecDialogRedraw()">+ เพิ่มรายการ</button>`,
    preConfirm: () => { if (d.items.some(s => !s.Parameter.trim())) { Swal.showValidationMessage('ชื่อรายการต้องไม่ว่าง'); return false; } return true; },
  }).then(async r => {
    if (window._qcSpecRedraw) { window._qcSpecRedraw = false; return; }
    if (!r.isConfirmed) return;
    _showLoader();
    const del = await _sb.from('qc_spec_items').delete().eq('MaterialCode', d.code);
    let error = del.error;
    if (!error && d.items.length) ({ error } = await _sb.from('qc_spec_items').insert(d.items.map((s, i) => ({
      MaterialCode: d.code, Seq: i + 1, Parameter: s.Parameter.trim(), ParamType: s.ParamType, MinValue: s.ParamType === 'numeric' ? s.MinValue ?? null : null,
      MaxValue: s.ParamType === 'numeric' ? s.MaxValue ?? null : null, Unit: s.Unit || null, Method: s.Method || null }))));
    _hideLoader();
    if (error) { _err('บันทึก Spec ไม่สำเร็จ', error.message); return; }
    _logAudit('EDIT', 'qc_spec_items', d.code, `${d.items.length} รายการ`);
    qcLoadPage();
  });
}
function _qcSpecDialogRedraw() { window._qcSpecRedraw = true; Swal.close(); setTimeout(_qcSpecDialog, 0); }

// ── ตั้งค่า ──
function _qcRenderSettings(body) {
  const adm = _qcAdmin();
  body.innerHTML = `<div class="glass-card" style="max-width:560px"><div class="row g-3">
    <div class="col-12"><label class="form-label mb-0">วันเริ่มใช้ QC (Lot ที่รับก่อนวันนี้ถือว่าผ่าน ไม่ต้องตรวจย้อนหลัง)</label>
      <input type="date" id="qc-s-golive" class="form-control" value="${_qcEsc(_qcSettings.go_live_date || '')}" ${adm ? '' : 'disabled'}></div>
    <div class="col-12"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="qc-s-enforce" ${_qcSettings.enforce ? 'checked' : ''} ${adm ? '' : 'disabled'}>
      <label class="form-check-label" for="qc-s-enforce"><b>บังคับ</b> — ห้ามเลือกเบิก Lot ที่ยังไม่ผ่าน QC (ปิดไว้ = แค่เตือน)</label></div></div>
    ${adm ? '<div class="col-12"><button class="btn btn-primary" onclick="qcSaveSettings()"><i class="fas fa-save me-1"></i>บันทึกตั้งค่า</button></div>' : ''}
  </div></div>`;
}
async function qcSaveSettings() {
  const payload = { go_live_date: document.getElementById('qc-s-golive').value, enforce: document.getElementById('qc-s-enforce').checked, updated_at: new Date().toISOString() };
  if (!payload.go_live_date) { Swal.fire({ icon: 'warning', title: 'ระบุวันเริ่มใช้' }); return; }
  const { error } = await _sb.from('qc_settings').update(payload).eq('id', 1);
  if (error) { _err('บันทึกไม่สำเร็จ', error.message); return; }
  _logAudit('EDIT', 'qc_settings', '1', JSON.stringify(payload));
  await qcLoadPage();
}

// ── ตัวช่วยให้หน้าอื่นเรียก: สถานะ QC ของ Lot (หน้าเบิกใช้ตอนเลือก Lot) ──
// คืน { status: 'PASS'|'REJECT'|'CONDITIONAL'|'pending'|'legacy'|'unknown', enforce }
// 'unknown' = ยังไม่ได้รัน SQL/โหลดไม่ได้ → ไม่ขัดขวางการเบิก (fail-open)
async function qcLotStatus(code, lot) {
  try {
    if (!_qcStatusAt || Date.now() - _qcStatusAt > 60000) await _qcLoadAll();
    if (!_qcReady) return { status: 'unknown', enforce: false };
    const hit = _qcStatusMap[_qcKey(code, lot)];
    if (hit) return { status: hit.result, enforce: !!_qcSettings.enforce };
    const isPending = _qcPendingLots.some(p => p.MaterialCode === code && p.Lot === lot);
    return { status: isPending ? 'pending' : 'legacy', enforce: !!_qcSettings.enforce };
  } catch (e) { console.error('qcLotStatus', e); return { status: 'unknown', enforce: false }; }
}
// ใช้ตอนเลือก Lot เบิก: คืน true = ไปต่อได้, false = ถูกบล็อก (โหมดบังคับ)
async function qcGuardIssueLot(code, lot) {
  const s = await qcLotStatus(code, lot);
  if (s.status === 'PASS' || s.status === 'legacy' || s.status === 'unknown') return true;
  const label = s.status === 'pending' ? 'ยังไม่ได้ตรวจ QC' : s.status === 'REJECT' ? 'ตรวจแล้ว "ไม่ผ่าน" (Reject)' : 'ผ่านแบบมีเงื่อนไข';
  if (s.status === 'CONDITIONAL' && !s.enforce) { /* เตือนอย่างเดียว */ }
  if (s.enforce && s.status !== 'CONDITIONAL') {
    await Swal.fire({ icon: 'error', title: 'เบิก Lot นี้ไม่ได้', text: `Lot ${lot} ${label}` });
    return false;
  }
  const r = await Swal.fire({ icon: 'warning', title: `Lot ${lot} ${label}`, text: 'ยืนยันจะเบิก Lot นี้ต่อหรือไม่?', showCancelButton: true, confirmButtonText: 'เบิกต่อ', cancelButtonText: 'เลือก Lot อื่น' });
  return r.isConfirmed;
}

// สร้างหน้าตั้งแต่โหลดสคริปต์ — showPage() จะ add class 'active' ให้เฉพาะ element ที่มีอยู่แล้วตอนกดเมนู
// (ถ้ารอสร้างใน qcLoadPage หน้าจะว่างเปล่าจนกว่าจะกดซ้ำ)
_qcEnsurePage();

// ปุ่ม "เพิ่ม/แก้ Spec": รับรหัสจากช่องค้นหา (datalist) — แจ้งเตือนถ้าว่าง/ไม่พบในมาสเตอร์ (เดิมเงียบเฉยๆ ทำให้ดูเหมือนปุ่มกดไม่ได้)
async function qcAddSpecFromInput() {
  const code = (document.getElementById('qc-spec-new')?.value || '').trim();
  if (!code) { Swal.fire({ icon: 'info', title: 'เลือกวัตถุดิบก่อน', text: 'พิมพ์รหัสหรือชื่อในช่องค้นหา แล้วเลือกจากรายการที่ขึ้นมา' }); return; }
  if (_qcMaterials.length && !_qcMaterials.some(m => m.MaterialCode === code)) {
    const r = await Swal.fire({ icon: 'warning', title: `ไม่พบรหัส "${_qcEsc(code)}" ในมาสเตอร์วัตถุดิบ`, text: 'ต้องการสร้าง Spec ให้รหัสนี้ต่อหรือไม่?', showCancelButton: true, confirmButtonText: 'สร้างต่อ', cancelButtonText: 'ยกเลิก' });
    if (!r.isConfirmed) return;
  }
  qcEditSpec(code);
}
