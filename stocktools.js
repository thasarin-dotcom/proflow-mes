// ════════════════════════════════════════════════════════════════════════════
// ProFlow Wise MES — เครื่องมือสต็อก: Integrity Check (ตรวจความถูกต้อง) · Stock Count (ตรวจนับสต็อก) · Backup (สำรองข้อมูล)
// เพิ่ม 2026-10-30 ตามคำขอผู้ใช้ "อยากให้มีฟังชั่น ตรวจสอบความถูกต้อง ตรวจนับสต็อก และสำรองข้อมูลเหมือนระบบ BM Flow"
// ไฟล์นี้ต้องอัปโหลดคู่กับ index.html เสมอ (<script src="stocktools.js?v=..."> ท้าย index.html) — แก้ไฟล์นี้แล้วเลื่อนเลข ?v=
// สร้างหน้า (page-integrity / page-stockcount / page-backup) เองตอนโหลดไฟล์ แบบเดียวกับ qc.js — ไม่ต้องแก้โครงหน้าใน index.html
// ใช้ global ของสคริปต์หลักตรงๆ: _sb, Swal, bootstrap, _hasRole, _currentUser, _err, _showLoader/_hideLoader, _logAudit,
// _fetchAllPaged, _planWeekLocalDateStr, showPage, stockcard* (เปิดการ์ดสต็อกจากผลตรวจ)
//
// สูตร "ยอดตามประวัติ" (ledger) ต่อ Lot ต้องตรงกับการ์ดสต็อก (stockcardBuildMatTxns / stockcardBuildFgTxns ใน index.html) เป๊ะ:
//   วัตถุดิบ = รับ (mr_receive) − เบิกผลิต (issue_production) + คืนจากบันทึกผลิต (production_record_details.ReturnedQty
//              ของบันทึกที่ยังอยู่) − เบิกเบ็ดเตล็ด (issue_misc) − ย้ายเข้า Defect/Retain + Rework คืน + ปรับยอดตรวจนับ
//   FG       = รับ FG (fg_receive) − เบิก FG (fg_withdraw) − ย้ายเข้า Defect/Retain + Rework คืน + ปรับยอดตรวจนับ
// ถ้าเพิ่มแหล่งรับ/จ่ายใหม่ในการ์ดสต็อก ต้องเพิ่มใน _stLedgerAll ด้วย ไม่งั้นหน้าตรวจความถูกต้องจะฟ้องผิด
// ════════════════════════════════════════════════════════════════════════════

function _stEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function _stJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function _stNum(n, d = 3) { const v = Number(n) || 0; return v.toLocaleString('th-TH', { maximumFractionDigits: d }); }
// สิทธิ์ใช้ Integrity Check / Stock Count = แอดมินเท่านั้น (คำขอผู้ใช้ 2026-10-30 "ให้แอดมินเห็นคนเดียว") — role admin ใน user_roles หรือ app_metadata isAdmin
function _stSupervisor() { return (typeof _hasRole === 'function' && _hasRole('admin')) || !!(typeof _currentUser !== 'undefined' && _currentUser && _currentUser.isAdmin); }
function _stAdmin() { return (typeof _hasRole === 'function' && _hasRole('admin')) || !!(typeof _currentUser !== 'undefined' && _currentUser && _currentUser.isAdmin); }
function _stWho() { return (typeof _currentUser !== 'undefined' && _currentUser && (_currentUser.name || _currentUser.email)) || null; }
const _stKey = (code, lot) => `${code || ''}|${lot || ''}`;
const _ST_EPS = 0.001;

// ── สร้างหน้าทั้ง 3 ตั้งแต่โหลดไฟล์ (showPage ใส่ class active ได้เฉพาะ element ที่มีอยู่แล้ว — เหตุผลเดียวกับ qc.js) ──
function _stEnsurePages() {
  const host = document.getElementById('page-holdstock')?.parentNode;
  if (!host || document.getElementById('page-integrity')) return;
  const page = (id, icon, title, sub, btn) => {
    const div = document.createElement('div');
    div.className = 'page-view'; div.id = 'page-' + id;
    div.innerHTML = `<div class="page-header"><div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
      <div><h4 class="fw-bold mb-0" style="color:white"><i class="fas fa-${icon} me-2"></i>${title}</h4><div class="text-white-50 small">${sub}</div></div>${btn}</div></div>
      <div class="scroll-content" id="${id}-body"></div>`;
    host.appendChild(div);
  };
  page('integrity', 'shield-halved', 'Integrity Check — ตรวจความถูกต้อง',
    'เทียบยอดสต็อกกับประวัติรับ-จ่าย (สูตรเดียวกับการ์ดสต็อก) และเอกสารที่อ้างถึงกัน — อ่านอย่างเดียว ไม่แก้ข้อมูล · แอดมินเท่านั้น',
    '<button class="btn btn-light btn-sm fw-bold text-primary shadow-sm" id="integrity-run-btn" onclick="integrityRun()"><i class="fas fa-magnifying-glass-chart me-1"></i>ตรวจตอนนี้</button>');
  page('stockcount', 'list-check', 'Stock Count — ตรวจนับสต็อก',
    'นับของจริงเทียบยอดในระบบ แล้วปรับยอดอย่างมีเอกสารและเหตุผล · แอดมินเท่านั้น',
    '<button class="btn btn-light btn-sm fw-bold text-primary shadow-sm" onclick="stockCountNew()"><i class="fas fa-plus me-1"></i>เริ่มตรวจนับใหม่</button>');
  page('backup', 'database', 'Backup — สำรองข้อมูล',
    'ดาวน์โหลดสำเนาข้อมูลทุกตารางเก็บไว้ในเครื่อง (Supabase แผน Free ไม่สำรองให้อัตโนมัติ) · แอดมินเท่านั้น',
    '<button class="btn btn-light btn-sm fw-bold text-success shadow-sm me-1" id="backup-xlsx-btn" onclick="backupXlsx()" title="ตารางที่ติ๊กไว้ รวมเป็นไฟล์ Excel ไฟล์เดียว (1 ตาราง = 1 ชีท) — ไว้เปิดดู/ทำรายงาน"><i class="fas fa-file-excel me-1"></i>ดาวน์โหลด Excel (.xlsx)</button>'
    + '<button class="btn btn-light btn-sm fw-bold text-success shadow-sm" id="backup-run-btn" onclick="backupRun()" title="ไฟล์ JSON สำหรับกู้คืนระบบ — นับเป็นการสำรองล่าสุด"><i class="fas fa-download me-1"></i>ดาวน์โหลดสำรองข้อมูล</button>');
  const modal = document.createElement('div');
  modal.innerHTML = `<div class="modal fade" id="stockCountModal" tabindex="-1"><div class="modal-dialog modal-xl modal-fullscreen-lg-down modal-dialog-scrollable"><div class="modal-content">
    <div class="modal-header"><div><h5 class="modal-title mb-0" id="scnt-title"></h5><div class="small text-muted" id="scnt-info"></div></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body"><div id="scnt-warn"></div><div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>รายการ</th><th>Lot</th><th class="text-end">ยอดในระบบ</th><th style="width:130px">นับจริง</th><th class="text-end" style="width:90px">ต่าง</th><th style="width:220px">เหตุผล (ถ้าต่าง)</th></tr></thead>
      <tbody id="scnt-rows"></tbody></table></div></div>
    <div class="modal-footer"><div class="text-danger small me-auto" id="scnt-err"></div>
      <button class="btn btn-outline-secondary" onclick="stockCountPrint()"><i class="fas fa-print me-1"></i>พิมพ์ใบนับ</button>
      <button class="btn btn-outline-danger" id="scnt-btn-cancel" onclick="stockCountCancel()">ยกเลิกใบนับ</button>
      <button class="btn btn-outline-primary" id="scnt-btn-save" onclick="stockCountSave()"><i class="fas fa-floppy-disk me-1"></i>บันทึกยอดนับ</button>
      <button class="btn btn-primary" id="scnt-btn-apply" onclick="stockCountApply()"><i class="fas fa-check me-1"></i>ปรับยอดตามที่นับ</button>
    </div></div></div></div>`;
  document.body.appendChild(modal.firstElementChild);
}

// ════════════════════════════════════════════════════════════════════════════
// Ledger — ยอดตามประวัติของทุก Lot (ทั้งตาราง, อ่านทีละหน้า 1000 แถว)
// ════════════════════════════════════════════════════════════════════════════
async function _stLedgerAll() {
  const [mr, iss, misc, det, recs, moves, adj, fgr, fgw] = await Promise.all([
    _fetchAllPaged('mr_receive', '*'),
    _fetchAllPaged('issue_production', 'MaterialCode,Lot,IssuedQty,MO_ID'),
    _fetchAllPaged('issue_misc', 'MaterialCode,Lot,IssuedQty'),
    _fetchAllPaged('production_record_details', 'ProdRecord_ID,MaterialCode,LotMaterial,ReturnedQty'),
    _fetchAllPaged('production_records', 'ProdRecord_ID'),
    _fetchAllPaged('hold_stock_moves', 'ItemType,ItemCode,Lot,MoveType,Qty'),
    _fetchAllPaged('stock_adjustments', 'ItemType,ItemCode,Lot,Qty,AdjDate,Reason,Count_ID,CreatedBy'),
    _fetchAllPaged('fg_receive', '*'),
    _fetchAllPaged('fg_withdraw', '*'),
  ]);
  const fatal = [['mr_receive', mr], ['issue_production', iss], ['issue_misc', misc], ['production_record_details', det], ['production_records', recs], ['hold_stock_moves', moves], ['fg_receive', fgr], ['fg_withdraw', fgw]].find(([, r]) => r.error);
  if (fatal) throw new Error(`อ่าน ${fatal[0]} ไม่ได้: ${fatal[1].error.message}`);
  const rm = new Map(), fg = new Map();
  const add = (m, code, lot, q) => { if (!code) return; const k = _stKey(code, lot); m.set(k, (m.get(k) || 0) + q); };
  (mr.data || []).forEach(r => add(rm, r.MaterialCode, r.Lot, parseFloat(r.Qty ?? r.QtyIn) || 0));
  (iss.data || []).forEach(r => add(rm, r.MaterialCode, r.Lot, -(parseFloat(r.IssuedQty) || 0)));
  (misc.data || []).forEach(r => add(rm, r.MaterialCode, r.Lot, -(parseFloat(r.IssuedQty) || 0)));
  const liveRecs = new Set((recs.data || []).map(r => r.ProdRecord_ID));
  (det.data || []).forEach(r => { const q = parseFloat(r.ReturnedQty) || 0; if (q > 0 && liveRecs.has(r.ProdRecord_ID)) add(rm, r.MaterialCode, r.LotMaterial, q); });
  (moves.data || []).forEach(m => {
    const q = parseFloat(m.Qty) || 0; if (q <= 0) return;
    const target = m.ItemType === 'FG' ? fg : (m.ItemType === 'BULK' || m.ItemType === 'PAC') ? rm : null;
    if (!target) return;
    if (m.MoveType === 'IN') add(target, m.ItemCode, m.Lot, -q);
    else if (m.MoveType === 'REWORK') add(target, m.ItemCode, m.Lot, q);
  });
  // คอลัมน์ Lot/จำนวนของ fg_receive / fg_withdraw ต่างกันตามยุคข้อมูล — อ่านแบบเดียวกับ fgStockRecalculate
  const fgLot = r => r.LotFG || r.Lot_FG || r.LOT || '';
  const fgQty = r => parseFloat(r.Qty ?? r.QtyFG ?? r.QtyReceive ?? r.ReceivedQty ?? 0) || 0;
  (fgr.data || []).forEach(r => add(fg, r.ProductCode, fgLot(r), fgQty(r)));
  (fgw.data || []).forEach(r => add(fg, r.ProductCode, fgLot(r), -fgQty(r)));
  const adjRows = adj.error ? [] : (adj.data || []);
  adjRows.forEach(a => add(a.ItemType === 'FG' ? fg : rm, a.ItemCode, a.Lot, parseFloat(a.Qty) || 0));
  return { rm, fg, adjRows, adjOk: !adj.error, issues: iss.data || [], fgReceives: fgr.data || [] };
}

// ════════════════════════════════════════════════════════════════════════════
// Integrity Check — อ่านอย่างเดียว คืนเฉพาะรายการผิดปกติ · กดปุ่ม "ตรวจตอนนี้" เท่านั้น (ไม่รันเองตอน realtime — หนัก)
// sev: error = ข้อมูลน่าจะผิดจริง · warn = ควรตรวจ · info = แจ้งให้ทราบ
// ════════════════════════════════════════════════════════════════════════════
const INTEGRITY_CHECKS = [
  ['RM_NEG', 'error', 'ยอดวัตถุดิบติดลบ', 'มีการเบิกเกินสต็อก — ตรวจรายการเบิกล่าสุดของ Lot นั้นในการ์ดสต็อก'],
  ['RM_LEDGER', 'error', 'ยอดวัตถุดิบหน้า Stock ไม่ตรงกับการ์ดสต็อก (ประวัติรับ − จ่าย)', 'หน้า Stock กับการ์ดสต็อกโชว์ตัวเลขไม่เท่ากัน — มักเกิดจากแก้/ลบเอกสารนอกระบบ หรือบันทึกค้างกลางทาง กด "ดูการ์ดสต็อก" เทียบ · ถ้ายอดของจริงที่คลังรู้แน่ ให้ทำใบตรวจนับปรับยอดแทนการแก้ฐานข้อมูลตรงๆ'],
  ['FG_NEG', 'error', 'ยอด FG ติดลบ', 'มีการเบิกเกินสต็อก — ตรวจรายการเบิก FG ล่าสุดของ Lot นั้น'],
  ['FG_LEDGER', 'error', 'ยอด FG หน้า Stock FG ไม่ตรงกับการ์ดสต็อก (รับ − เบิก)', 'ถ้าประวัติรับ/เบิกถูกต้อง กด "คำนวณ Stock ใหม่" ที่หน้า Stock FG เพื่อแก้ยอดให้ตรง · "ประวัติติดลบ" = เบิกมากกว่าที่รับ ต้องหาเอกสารที่ผิดก่อน'],
  ['HOLD_NEG', 'error', 'สต็อก Defect/Retain ติดลบ', 'ตรวจรายการย้าย/ทิ้ง/Rework ของ Lot นั้นที่หน้าสต็อก Defect/Retain'],
  ['RM_VALUE', 'warn', 'มูลค่าสต็อกวัตถุดิบ ≠ จำนวน × ราคา/หน่วย', 'มูลค่าเพี้ยน (เช่น เบิกก่อนใส่ราคาในใบรับ) — รัน repair_stock_balance_value.sql (ดูผลขั้นที่ 1 ก่อน)'],
  ['ISSUE_NO_MO', 'warn', 'รายการเบิกผลิตอ้าง MO ที่ไม่มีในระบบ', 'MO ถูกลบไปแต่รายการเบิกยังอยู่ — ตรวจที่หน้าเบิกผลิต'],
  ['FG_NO_MO', 'warn', 'รับ FG อ้าง MO ที่ไม่มีในระบบ', 'MO ถูกลบไปแต่รายการรับ FG ยังอยู่ — ตรวจที่หน้ารับ FG'],
  ['RM_NO_COST', 'info', 'Lot วัตถุดิบที่มียอดแต่ไม่มีราคา/หน่วย', 'ใส่ราคาในใบรับวัตถุดิบ (MR) ของ Lot นั้น ไม่งั้นมูลค่าสต็อก/ต้นทุนผลิตจะต่ำกว่าจริง'],
  ['RM_EXPIRED', 'info', 'Lot วัตถุดิบหมดอายุแล้วแต่ยังมียอดในระบบ', 'ตรวจของจริง — ใช้ไม่ได้แล้วให้ย้ายเข้าสต็อก Defect หรือเบิกทิ้ง ถ้าไม่มีของแล้วให้ทำใบตรวจนับ'],
  ['ADJ_RECENT', 'info', 'ปรับยอดตรวจนับใน 30 วันล่าสุด', 'ไว้ให้หัวหน้าตรวจย้อนว่าปรับบ่อย/ปรับมากผิดปกติหรือไม่'],
];
let _integrityData = null, _integrityAt = null, _integrityBusy = false, _integrityNote = '';

function integrityLoadPage() { _stEnsurePages(); integrityRender(); }

async function integrityRun() {
  if (_integrityBusy) return;
  if (!_stSupervisor()) { _err('ไม่มีสิทธิ์', 'หน้านี้สำหรับแอดมินเท่านั้น'); return; }
  _integrityBusy = true;
  const btn = document.getElementById('integrity-run-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>กำลังตรวจ...'; }
  _showLoader();
  try {
    const [led, sb, sf, hold, mos, mats] = await Promise.all([
      _stLedgerAll(),
      _fetchAllPaged('stock_balance', 'MaterialCode,MaterialName,Lot,QtyBalance,UnitCost,StockValue,ExpDate,UOM'),
      _fetchAllPaged('stock_fg', 'ProductCode,ProductName,LotFG,FGBalance,UOM'),
      _fetchAllPaged('hold_stock', 'HoldType,ItemCode,ItemName,Lot,QtyBalance,UOM'),
      _fetchAllPaged('manufacturing_orders', 'MO_ID'),
      _fetchAllPaged('materials', 'MaterialCode,MaterialName'),
    ]);
    if (sb.error) throw new Error('อ่าน stock_balance ไม่ได้: ' + sb.error.message);
    if (sf.error) throw new Error('อ่าน stock_fg ไม่ได้: ' + sf.error.message);
    const out = [];
    const push = (chk, sev, ref, detail, link) => out.push({ chk, sev, ref, detail, link });
    const today = _planWeekLocalDateStr(new Date());
    const matName = new Map((mats.data || []).map(m => [m.MaterialCode, m.MaterialName]));

    // วัตถุดิบ: ยอดหน้า Stock (stock_balance) เทียบประวัติ
    const sbMap = new Map();
    (sb.data || []).forEach(r => { const k = _stKey(r.MaterialCode, r.Lot); const p = sbMap.get(k); sbMap.set(k, p ? { ...p, QtyBalance: (parseFloat(p.QtyBalance) || 0) + (parseFloat(r.QtyBalance) || 0), dup: true } : r); });
    sbMap.forEach((r, k) => {
      const bal = parseFloat(r.QtyBalance) || 0, name = r.MaterialName || matName.get(r.MaterialCode) || '';
      const link = { mode: 'mat', code: r.MaterialCode, name, lot: r.Lot };
      if (bal < -_ST_EPS) push('RM_NEG', 'error', `${r.MaterialCode} / ${r.Lot}`, `${name} — คงเหลือ ${_stNum(bal)} ${r.UOM || ''}`, link);
      const led_ = led.rm.get(k) || 0;
      if (Math.abs(bal - led_) > _ST_EPS) push('RM_LEDGER', 'error', `${r.MaterialCode} / ${r.Lot}`, `${name} — หน้า Stock ${_stNum(bal)} · การ์ดสต็อก ${_stNum(led_)} (ต่าง ${_stNum(bal - led_)} ${r.UOM || ''})${r.dup ? ' · มีแถว stock_balance ซ้ำของ Lot นี้' : ''}`, link);
      const cost = parseFloat(r.UnitCost) || 0, val = parseFloat(r.StockValue) || 0;
      if (Math.abs(val - bal * cost) > 1) push('RM_VALUE', 'warn', `${r.MaterialCode} / ${r.Lot}`, `${name} — มูลค่า ฿${_stNum(val, 2)} แต่ ${_stNum(bal)} × ฿${_stNum(cost, 4)} = ฿${_stNum(bal * cost, 2)}`, link);
      if (bal > _ST_EPS && !(cost > 0)) push('RM_NO_COST', 'info', `${r.MaterialCode} / ${r.Lot}`, `${name} — คงเหลือ ${_stNum(bal)} ${r.UOM || ''} ไม่มีราคา`, link);
      if (bal > _ST_EPS && r.ExpDate && String(r.ExpDate).slice(0, 10) < today) push('RM_EXPIRED', 'info', `${r.MaterialCode} / ${r.Lot}`, `${name} — หมดอายุ ${String(r.ExpDate).slice(0, 10)} · คงเหลือ ${_stNum(bal)} ${r.UOM || ''}`, link);
    });
    led.rm.forEach((q, k) => {   // มีประวัติแต่ไม่มีแถวในหน้า Stock เลย
      if (sbMap.has(k) || Math.abs(q) <= _ST_EPS) return;
      const [code, lot] = k.split('|');
      push('RM_LEDGER', 'error', `${code} / ${lot}`, `${matName.get(code) || ''} — การ์ดสต็อกเหลือ ${_stNum(q)} แต่ไม่มี Lot นี้ในหน้า Stock`, { mode: 'mat', code, name: matName.get(code) || '', lot });
    });

    // FG
    const sfMap = new Map();
    (sf.data || []).forEach(r => { const k = _stKey(r.ProductCode, r.LotFG); const p = sfMap.get(k); sfMap.set(k, p ? { ...p, FGBalance: (parseFloat(p.FGBalance) || 0) + (parseFloat(r.FGBalance) || 0), dup: true } : r); });
    const fgName = new Map((sf.data || []).map(r => [r.ProductCode, r.ProductName]));
    led.fgReceives.forEach(r => { if (r.ProductCode && r.ProductName && !fgName.has(r.ProductCode)) fgName.set(r.ProductCode, r.ProductName); });
    sfMap.forEach((r, k) => {
      const bal = parseFloat(r.FGBalance) || 0, led_ = led.fg.get(k) || 0, name = r.ProductName || fgName.get(r.ProductCode) || '';
      const link = { mode: 'fg', code: r.ProductCode, name, lot: r.LotFG };
      if (bal < -_ST_EPS) push('FG_NEG', 'error', `${r.ProductCode} / ${r.LotFG}`, `${name} — คงเหลือ ${_stNum(bal)} ${r.UOM || ''}`, link);
      if (Math.abs(bal - led_) > _ST_EPS) push('FG_LEDGER', 'error', `${r.ProductCode} / ${r.LotFG}`, `${name} — หน้า Stock FG ${_stNum(bal)} · การ์ดสต็อก ${_stNum(led_)}${led_ < -_ST_EPS ? ' (ประวัติติดลบ = เบิกมากกว่ารับ)' : ''}${r.dup ? ' · มีแถว stock_fg ซ้ำของ Lot นี้' : ''}`, link);
    });
    led.fg.forEach((q, k) => {
      if (sfMap.has(k) || Math.abs(q) <= _ST_EPS) return;
      const [code, lot] = k.split('|');
      push('FG_LEDGER', 'error', `${code} / ${lot}`, `${fgName.get(code) || ''} — การ์ดสต็อก ${_stNum(q)}${q < 0 ? ' (ประวัติติดลบ = เบิกมากกว่ารับ)' : ''} แต่ไม่มี Lot นี้ในหน้า Stock FG`, { mode: 'fg', code, name: fgName.get(code) || '', lot });
    });

    (hold.data || []).forEach(r => { const b = parseFloat(r.QtyBalance) || 0; if (b < -_ST_EPS) push('HOLD_NEG', 'error', `${r.HoldType} ${r.ItemCode} / ${r.Lot}`, `${r.ItemName || ''} — คงเหลือ ${_stNum(b)} ${r.UOM || ''}`); });

    if (!mos.error) {
      const moSet = new Set((mos.data || []).map(m => m.MO_ID));
      const missIss = {}, missFg = {};
      led.issues.forEach(r => { if (r.MO_ID && !moSet.has(r.MO_ID)) missIss[r.MO_ID] = (missIss[r.MO_ID] || 0) + 1; });
      led.fgReceives.forEach(r => { if (r.MO_ID && !moSet.has(r.MO_ID)) missFg[r.MO_ID] = (missFg[r.MO_ID] || 0) + 1; });
      Object.entries(missIss).forEach(([mo, n]) => push('ISSUE_NO_MO', 'warn', mo, `${n} รายการเบิกผลิตอ้าง MO นี้`));
      Object.entries(missFg).forEach(([mo, n]) => push('FG_NO_MO', 'warn', mo, `${n} รายการรับ FG อ้าง MO นี้`));
    }
    const d30 = _planWeekLocalDateStr(new Date(Date.now() - 30 * 864e5));
    led.adjRows.filter(a => String(a.AdjDate || '') >= d30).forEach(a => push('ADJ_RECENT', 'info', `${a.ItemCode} / ${a.Lot}`,
      `${String(a.AdjDate).slice(0, 10)} · ${a.ItemType === 'FG' ? 'FG' : 'วัตถุดิบ'} ${Number(a.Qty) > 0 ? '+' : ''}${_stNum(a.Qty)} · ${a.Reason || ''}${a.Count_ID ? ' · ' + a.Count_ID : ''}${a.CreatedBy ? ' · โดย ' + a.CreatedBy : ''}`,
      { mode: a.ItemType === 'FG' ? 'fg' : 'mat', code: a.ItemCode, name: '', lot: a.Lot }));

    _integrityData = out; _integrityAt = new Date();
    _integrityNote = led.adjOk ? '' : 'ยังไม่ได้รัน create_stock_count.sql — ตรวจได้ตามปกติ แต่ยังไม่มีข้อมูลการปรับยอดตรวจนับ';
    integrityRender();
  } catch (e) {
    console.error(e);
    _err('ตรวจไม่สำเร็จ', _stEsc(e.message || e));
  } finally {
    _hideLoader();
    _integrityBusy = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magnifying-glass-chart me-1"></i>ตรวจตอนนี้'; }
  }
}

function integrityRender() {
  const body = document.getElementById('integrity-body');
  if (!body) return;
  if (!_integrityData) {
    body.innerHTML = `<div class="glass-card text-center text-muted py-5"><i class="fas fa-shield-halved fa-2x d-block mb-3 opacity-50"></i>
      กด “ตรวจตอนนี้” เพื่อเทียบยอดสต็อกกับประวัติรับ-จ่าย และเอกสารที่อ้างถึงกัน
      <div class="small mt-2">ใช้เวลาไม่กี่วินาที · อ่านอย่างเดียว ไม่แก้ข้อมูล · ควรตรวจหลังปิดงานแต่ละวัน และก่อน/หลังตรวจนับสต็อก</div></div>`;
    return;
  }
  const by = {};
  _integrityData.forEach(r => (by[r.chk] ||= []).push(r));
  const count = sev => _integrityData.filter(r => r.sev === sev).length;
  const nOk = INTEGRITY_CHECKS.filter(c => !(by[c[0]] || []).length).length;
  const kpi = (n, label, color) => `<div class="col-6 col-lg-3"><div class="kpi-card"><div class="kpi-num" style="${color ? 'color:' + color : ''}">${n}</div><div class="kpi-label">${label}</div></div></div>`;
  const SEV = { error: ['danger', 'ผิดปกติ'], warn: ['warning text-dark', 'ควรตรวจ'], info: ['secondary', 'แจ้งทราบ'] };
  window._integrityLinks = [];
  const sections = INTEGRITY_CHECKS.map(([k, sev, title, hint]) => {
    const rows = by[k] || [];
    if (!rows.length) return `<div class="glass-card py-2 mb-2"><span class="text-success"><i class="fas fa-circle-check me-2"></i></span>${_stEsc(title)} <span class="text-muted small">— ผ่าน</span></div>`;
    const shown = rows.slice(0, 200);
    return `<div class="glass-card mb-2">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-1"><b>${_stEsc(title)}</b><span class="badge bg-${SEV[sev][0]}">${SEV[sev][1]}</span><span class="text-muted small">${rows.length} รายการ</span></div>
      <div class="small text-muted mb-2">${_stEsc(hint)}</div>
      <div class="table-responsive"><table class="table table-sm mb-0"><thead><tr><th style="width:240px">อ้างอิง</th><th>รายละเอียด</th><th style="width:110px"></th></tr></thead><tbody>${shown.map(r => {
        const li = r.link ? window._integrityLinks.push(r.link) - 1 : -1;
        return `<tr><td class="text-break"><code>${_stEsc(r.ref)}</code></td><td class="text-break" style="white-space:normal">${_stEsc(r.detail)}</td>
          <td>${li >= 0 ? `<button class="btn btn-sm btn-outline-primary py-0" onclick="_integrityOpenCard(${li})">ดูการ์ดสต็อก</button>` : ''}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<div class="small text-muted mt-1">แสดง ${shown.length} จาก ${rows.length} รายการ</div>` : ''}</div>`;
  }).join('');
  body.innerHTML = `<div class="row g-2 mb-2">${kpi(count('error'), 'ผิดปกติ (ควรแก้)', count('error') ? '#dc2626' : '')}${kpi(count('warn'), 'ควรตรวจ', count('warn') ? '#d97706' : '')}${kpi(count('info'), 'แจ้งให้ทราบ', '')}${kpi(`${nOk}/${INTEGRITY_CHECKS.length}`, 'หัวข้อที่ผ่าน', '#16a34a')}</div>
    <div class="small text-white-50 mb-2">ตรวจเมื่อ ${_integrityAt.toLocaleString('th-TH')}${_integrityNote ? ' · ' + _stEsc(_integrityNote) : ''}</div>${sections}`;
}

// เปิดการ์ดสต็อกของ Lot ที่ผิดปกติ — เลือกโหมด/สินค้า/Lot ให้แล้วแสดงผลเลย
async function _integrityOpenCard(i) {
  const l = (window._integrityLinks || [])[i];
  if (!l || typeof stockcardSelectItem !== 'function') return;
  showPage('stockcard', document.getElementById('nav-stockcard'));
  const fgRadio = document.getElementById('stockcard-mode-fg'), matRadio = document.getElementById('stockcard-mode-mat');
  if (l.mode === 'fg' ? !fgRadio.checked : !matRadio.checked) {
    (l.mode === 'fg' ? fgRadio : matRadio).checked = true;
    await stockcardOnModeChange();
  }
  await stockcardSelectItem(l.code, l.name || l.code);
  const lotSel = document.getElementById('stockcard-f-lot');
  if (lotSel && [...lotSel.options].some(o => o.value === l.lot)) { lotSel.value = l.lot; stockcardRun(); }
}

// ════════════════════════════════════════════════════════════════════════════
// Stock Count — ใบตรวจนับ (create_stock_count.sql) · แอดมินเท่านั้น
// สร้างใบ: ถ่ายยอดในระบบทุก Lot ที่มียอด > 0 → กรอกยอดนับ → ปรับยอด (ยอดปรับ = ยอดนับ − ยอดในระบบ "ตอนกดปรับ")
// ปรับแล้ว: บันทึก stock_adjustments ก่อน (หลักฐานแก้ไม่ได้) แล้วค่อยปรับ stock_balance / stock_fg — การ์ดสต็อกโชว์ "ปรับยอดตรวจนับ"
// v1 นับเฉพาะ Lot ที่มียอดในระบบ (ของที่เจอเพิ่มแต่ไม่มี Lot ในระบบ ให้บันทึกรับเข้าตามปกติ)
// ════════════════════════════════════════════════════════════════════════════
let _scnt = null;   // { head, lines, cur: { Line_ID → ยอดในระบบตอนนี้ } }
const SCNT_STATUS_CLS = { 'กำลังนับ': 'warning text-dark', 'ปรับยอดแล้ว': 'success', 'ยกเลิก': 'secondary' };

async function stockCountLoad() {
  _stEnsurePages();
  const body = document.getElementById('stockcount-body');
  if (!body) return;
  if (!_stSupervisor()) { body.innerHTML = '<div class="glass-card text-muted">หน้านี้สำหรับแอดมินเท่านั้น</div>'; return; }
  const { data, error } = await _sb.from('stock_counts').select('*').order('CreatedAt', { ascending: false }).limit(100);
  if (error) {
    body.innerHTML = `<div class="glass-card text-center py-4"><div class="text-danger fw-semibold mb-1">ยังไม่ได้ตั้งค่าตรวจนับสต็อก</div>
      <div class="small text-muted">รัน <code>create_stock_count.sql</code> ใน Supabase SQL Editor ก่อน</div><div class="small text-muted">(${_stEsc(error.message)})</div></div>`;
    return;
  }
  const ids = (data || []).map(c => c.Count_ID);
  const lr = ids.length ? await _sb.from('stock_count_lines').select('Count_ID,CountedQty,AdjID').in('Count_ID', ids).limit(50000) : { data: [] };
  const st = {};
  (lr.data || []).forEach(l => { const s = (st[l.Count_ID] ||= { n: 0, c: 0, a: 0 }); s.n++; if (l.CountedQty !== null) s.c++; if (l.AdjID) s.a++; });
  const rows = (data || []).map(c => {
    const s = st[c.Count_ID] || { n: 0, c: 0, a: 0 };
    return `<tr><td><code>${_stEsc(c.Count_ID)}</code></td><td class="text-nowrap">${String(c.CountDate || '').slice(0, 10)}</td><td>${c.ItemType === 'FG' ? 'สินค้าสำเร็จรูป (FG)' : 'วัตถุดิบ'}</td>
      <td>${_stEsc(c.Scope || '')}${c.Note ? `<div class="small text-muted">${_stEsc(c.Note)}</div>` : ''}</td>
      <td class="text-end">${s.c} / ${s.n}</td><td class="text-end">${s.a || '-'}</td><td><span class="badge bg-${SCNT_STATUS_CLS[c.Status] || 'secondary'}">${_stEsc(c.Status)}</span></td>
      <td class="text-center"><button class="btn btn-sm btn-outline-primary" onclick="stockCountOpen('${_stJs(c.Count_ID)}')">เปิด</button></td></tr>`;
  }).join('');
  body.innerHTML = `<div class="glass-card"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
    <thead><tr><th>เลขที่ใบนับ</th><th>วันที่</th><th>ประเภท</th><th>ขอบเขต</th><th class="text-end">นับแล้ว</th><th class="text-end">ปรับยอด</th><th>สถานะ</th><th class="text-center">จัดการ</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="text-center text-muted py-4">ยังไม่เคยตรวจนับ — กด "เริ่มตรวจนับใหม่"</td></tr>'}</tbody></table></div></div>
    <div class="small text-white-50 mt-1">ขั้นตอน: เริ่มตรวจนับใหม่ → พิมพ์ใบนับไปนับที่คลัง (ใบพิมพ์ไม่โชว์ยอดในระบบ) → กรอกยอดนับ → ปรับยอด · ปรับแล้วแก้/ลบย้อนหลังไม่ได้ ถ้าผิดให้ทำใบใหม่</div>`;
}

async function stockCountNew() {
  if (!_stSupervisor()) { _err('ไม่มีสิทธิ์', 'สร้างใบตรวจนับได้เฉพาะแอดมิน'); return; }
  const r = await Swal.fire({
    title: 'เริ่มตรวจนับใหม่', width: 520, showCancelButton: true, confirmButtonText: 'สร้างใบนับ', cancelButtonText: 'ยกเลิก',
    html: `<div class="text-start">
      <label class="form-label small mb-1">ประเภท</label>
      <select id="scn-type" class="form-select mb-2" onchange="document.getElementById('scn-scope-wrap').style.display = this.value === 'RM' ? '' : 'none'">
        <option value="RM">วัตถุดิบ (Stock วัตถุดิบ)</option><option value="FG">สินค้าสำเร็จรูป (Stock FG)</option></select>
      <div id="scn-scope-wrap"><label class="form-label small mb-1">ขอบเขต</label>
        <select id="scn-scope" class="form-select mb-2"><option value="">ทั้งหมด</option><option value="BULK">BULK</option><option value="PAC">PAC</option></select></div>
      <label class="form-label small mb-1">หมายเหตุ (ไม่บังคับ)</label><input id="scn-note" class="form-control" placeholder="เช่น นับสิ้นเดือน">
      <div class="small text-muted mt-2">ระบบถ่ายยอดในระบบของทุก Lot ที่มียอดลงใบ · พิมพ์ใบไปนับได้ (ใบพิมพ์ไม่โชว์ยอดในระบบ กันนับแบบเอนเอียง)</div></div>`,
    preConfirm: () => ({ type: document.getElementById('scn-type').value, scope: document.getElementById('scn-scope').value, note: document.getElementById('scn-note').value.trim() }),
  });
  if (!r.isConfirmed) return;
  _showLoader();
  try {
    const { type, scope, note } = r.value;
    let lines = [];
    if (type === 'RM') {
      const [sb, mats] = await Promise.all([_fetchAllPaged('stock_balance', 'MaterialCode,MaterialName,Lot,QtyBalance,UOM'), _fetchAllPaged('materials', 'MaterialCode,MaterialName,TYPE')]);
      if (sb.error) throw new Error(sb.error.message);
      const typeOf = new Map((mats.data || []).map(m => [m.MaterialCode, String(m.TYPE || '').toUpperCase()]));
      lines = (sb.data || []).filter(x => (parseFloat(x.QtyBalance) || 0) > _ST_EPS && (!scope || typeOf.get(x.MaterialCode) === scope))
        .map(x => ({ ItemCode: x.MaterialCode, ItemName: x.MaterialName, Lot: x.Lot, UOM: x.UOM, SystemQty: parseFloat(x.QtyBalance) || 0 }));
    } else {
      const sf = await _fetchAllPaged('stock_fg', 'ProductCode,ProductName,LotFG,FGBalance,UOM');
      if (sf.error) throw new Error(sf.error.message);
      lines = (sf.data || []).filter(x => (parseFloat(x.FGBalance) || 0) > _ST_EPS)
        .map(x => ({ ItemCode: x.ProductCode, ItemName: x.ProductName, Lot: x.LotFG, UOM: x.UOM, SystemQty: parseFloat(x.FGBalance) || 0 }));
    }
    if (!lines.length) throw new Error('ไม่มี Lot ที่มียอดในขอบเขตนี้');
    lines.sort((a, b) => String(a.ItemName || a.ItemCode).localeCompare(String(b.ItemName || b.ItemCode), 'th') || String(a.Lot).localeCompare(String(b.Lot)));
    // เลขใบ CNT-YYYYMM-NNN — ชนกันได้ถ้าสองเครื่องสร้างพร้อมกัน (PK บังคับไม่ซ้ำ) ลองเลขถัดไปอีก 3 ครั้ง
    const d = new Date(), prefix = `CNT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
    const { data: ex } = await _sb.from('stock_counts').select('Count_ID').like('Count_ID', prefix + '%');
    let n = Math.max(0, ...(ex || []).map(x => parseInt(String(x.Count_ID).slice(prefix.length), 10) || 0)), id = null, lastErr = null;
    for (let t = 0; t < 4 && !id; t++) {
      const tryId = prefix + String(++n).padStart(3, '0');
      const { error } = await _sb.from('stock_counts').insert({ Count_ID: tryId, ItemType: type, Scope: type === 'FG' ? 'สินค้าสำเร็จรูป' : (scope || 'ทั้งหมด'), Note: note || null, CreatedBy: _stWho() });
      if (!error) id = tryId; else lastErr = error;
    }
    if (!id) throw new Error(lastErr ? lastErr.message : 'สร้างเลขใบนับไม่ได้');
    for (let i = 0; i < lines.length; i += 500) {
      const { error } = await _sb.from('stock_count_lines').insert(lines.slice(i, i + 500).map(l => ({ Count_ID: id, ...l })));
      if (error) { await _sb.from('stock_counts').delete().eq('Count_ID', id); throw new Error(error.message); }
    }
    if (typeof _logAudit === 'function') _logAudit('INSERT', 'stock_counts', id, `สร้างใบตรวจนับ ${type} ${lines.length} Lot`);
    _hideLoader();
    await stockCountLoad();
    stockCountOpen(id);
  } catch (e) {
    _hideLoader();
    _err('สร้างใบนับไม่สำเร็จ', `${_stEsc(e.message || e)}<br><small>ถ้ายังไม่ได้รัน create_stock_count.sql ใน Supabase ให้รันก่อน</small>`);
  }
}

// ยอดในระบบ "ตอนนี้" ของทุกแถวในใบ — อ่านสดทุกครั้งที่เปิด/ก่อนปรับ
async function _scntCurrent(head) {
  const m = new Map();
  if (head.ItemType === 'RM') {
    const r = await _fetchAllPaged('stock_balance', 'MaterialCode,Lot,QtyBalance');
    (r.data || []).forEach(x => m.set(_stKey(x.MaterialCode, x.Lot), (m.get(_stKey(x.MaterialCode, x.Lot)) || 0) + (parseFloat(x.QtyBalance) || 0)));
  } else {
    const r = await _fetchAllPaged('stock_fg', 'ProductCode,LotFG,FGBalance');
    (r.data || []).forEach(x => m.set(_stKey(x.ProductCode, x.LotFG), (m.get(_stKey(x.ProductCode, x.LotFG)) || 0) + (parseFloat(x.FGBalance) || 0)));
  }
  const cur = {};
  _scnt.lines.forEach(l => { cur[l.Line_ID] = m.get(_stKey(l.ItemCode, l.Lot)) || 0; });
  return cur;
}

async function stockCountOpen(id) {
  _showLoader();
  const [h, l] = await Promise.all([
    _sb.from('stock_counts').select('*').eq('Count_ID', id).maybeSingle(),
    _sb.from('stock_count_lines').select('*').eq('Count_ID', id).order('Line_ID').limit(20000),
  ]);
  if (h.error || !h.data) { _hideLoader(); _err('เปิดใบนับไม่ได้', _stEsc(h.error?.message || 'ไม่พบใบนับ')); return; }
  _scnt = { head: h.data, lines: l.data || [], cur: {} };
  _scnt.cur = await _scntCurrent(_scnt.head);
  _hideLoader();
  stockCountRender();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('stockCountModal')).show();
}

function _scntDiffHtml(diff) {
  if (diff === null) return '';
  return Math.abs(diff) < _ST_EPS ? '<span class="text-muted">0</span>' : `<b class="${diff > 0 ? 'text-success' : 'text-danger'}">${diff > 0 ? '+' : ''}${_stNum(diff)}</b>`;
}

function stockCountRender() {
  const { head, lines, cur } = _scnt, draft = head.Status === 'กำลังนับ', can = draft && _stSupervisor();
  document.getElementById('scnt-title').innerHTML = `${_stEsc(head.Count_ID)} <span class="badge bg-${SCNT_STATUS_CLS[head.Status] || 'secondary'}">${_stEsc(head.Status)}</span>`;
  document.getElementById('scnt-info').innerHTML = `${head.ItemType === 'FG' ? 'สินค้าสำเร็จรูป (FG)' : 'วัตถุดิบ'} · ขอบเขต: <b>${_stEsc(head.Scope || '')}</b> · เริ่มนับ ${String(head.CountDate || '').slice(0, 10)}${head.Note ? ` · ${_stEsc(head.Note)}` : ''}`
    + (head.AppliedAt ? ` · ปรับยอดเมื่อ ${new Date(head.AppliedAt).toLocaleString('th-TH')}${head.AppliedBy ? ' โดย ' + _stEsc(head.AppliedBy) : ''}` : '');
  const moved = draft ? lines.filter(x => Math.abs((cur[x.Line_ID] || 0) - Number(x.SystemQty)) > _ST_EPS).length : 0;
  document.getElementById('scnt-warn').innerHTML = moved ? `<div class="alert alert-warning py-2 small"><i class="fas fa-triangle-exclamation me-1"></i>ยอดในระบบของ <b>${moved} แถว</b> เปลี่ยนไปหลังเริ่มนับ (มีรับ/เบิกระหว่างนับ) — ยอดปรับคิดจาก “ยอดในระบบตอนนี้” ตรวจแถวที่แรเงาก่อนกดปรับ</div>` : '';
  document.getElementById('scnt-err').textContent = '';
  document.getElementById('scnt-rows').innerHTML = lines.map(x => {
    const now = draft ? (cur[x.Line_ID] || 0) : Number(x.BeforeQty ?? x.SystemQty), changed = draft && Math.abs(now - Number(x.SystemQty)) > _ST_EPS;
    const diff = x.CountedQty === null ? null : Number(x.CountedQty) - now;
    const inputs = can
      ? `<td><input type="number" min="0" step="any" inputmode="decimal" class="form-control form-control-sm scnt-in" data-line="${x.Line_ID}" data-now="${now}" value="${x.CountedQty ?? ''}" oninput="stockCountDiff(this)"></td>
         <td class="text-end small" id="scnt-d-${x.Line_ID}">${_scntDiffHtml(diff)}</td>
         <td><input class="form-control form-control-sm scnt-rs" data-line="${x.Line_ID}" value="${_stEsc(x.Reason || '')}" placeholder="เช่น ชั่งจริงน้อยกว่า / ของหาย"></td>`
      : `<td class="text-end">${x.CountedQty === null ? '<span class="text-muted">—</span>' : _stNum(x.CountedQty)}</td><td class="text-end small">${_scntDiffHtml(diff)}</td><td class="small">${_stEsc(x.Reason || '')}</td>`;
    return `<tr${changed ? ' class="table-warning"' : ''}><td>${_stEsc(x.ItemName || x.ItemCode)}<div class="small text-muted"><code>${_stEsc(x.ItemCode)}</code></div></td><td>${_stEsc(x.Lot)}</td>
      <td class="text-end text-nowrap">${_stNum(now)} <span class="small text-muted">${_stEsc(x.UOM || '')}</span>${changed ? `<div class="small text-muted">เริ่มนับ ${_stNum(x.SystemQty)}</div>` : ''}</td>${inputs}</tr>`;
  }).join('');
  ['scnt-btn-cancel', 'scnt-btn-save', 'scnt-btn-apply'].forEach(i => { document.getElementById(i).style.display = can ? '' : 'none'; });
}

function stockCountDiff(inp) {
  const cell = document.getElementById('scnt-d-' + inp.dataset.line);
  cell.innerHTML = inp.value === '' ? '' : _scntDiffHtml(Number(inp.value) - Number(inp.dataset.now));
}

function _scntCollect() {
  return [...document.querySelectorAll('#scnt-rows .scnt-in')].map(i => ({
    line: Number(i.dataset.line), now: Number(i.dataset.now), counted: i.value === '' ? null : Number(i.value),
    reason: (document.querySelector(`#scnt-rows .scnt-rs[data-line="${i.dataset.line}"]`)?.value || '').trim(),
  }));
}

async function stockCountSave(silent) {
  if (!_scnt || _scnt.head.Status !== 'กำลังนับ') return true;
  const rows = _scntCollect();
  const changed = rows.filter(r => { const l = _scnt.lines.find(x => x.Line_ID === r.line); return l && ((l.CountedQty ?? null) !== r.counted || (l.Reason || '') !== r.reason); });
  if (rows.some(r => r.counted !== null && (isNaN(r.counted) || r.counted < 0))) { document.getElementById('scnt-err').textContent = 'ยอดนับต้องเป็นตัวเลข 0 ขึ้นไป'; return false; }
  for (const r of changed) {
    const { error } = await _sb.from('stock_count_lines').update({ CountedQty: r.counted, Reason: r.reason || null }).eq('Line_ID', r.line);
    if (error) { document.getElementById('scnt-err').textContent = error.message; return false; }
    const l = _scnt.lines.find(x => x.Line_ID === r.line); l.CountedQty = r.counted; l.Reason = r.reason || null;
  }
  if (silent !== true) Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: `บันทึกยอดนับแล้ว (${changed.length} แถว)`, showConfirmButton: false, timer: 1500 });
  return true;
}

async function stockCountApply() {
  if (!_scnt || _scnt.head.Status !== 'กำลังนับ' || !_stSupervisor()) return;
  const errEl = document.getElementById('scnt-err'); errEl.textContent = '';
  const rows = _scntCollect(), counted = rows.filter(r => r.counted !== null);
  if (!counted.length) { errEl.textContent = 'ยังไม่ได้กรอกยอดนับสักแถว'; return; }
  const diffs = counted.map(r => ({ ...r, d: r.counted - r.now })).filter(r => Math.abs(r.d) >= _ST_EPS);
  const noReason = diffs.filter(r => !r.reason);
  document.querySelectorAll('#scnt-rows .scnt-rs.is-invalid').forEach(e => e.classList.remove('is-invalid'));
  if (noReason.length) {
    noReason.forEach(r => document.querySelector(`#scnt-rows .scnt-rs[data-line="${r.line}"]`)?.classList.add('is-invalid'));
    errEl.textContent = `กรอกเหตุผลให้ครบทุกแถวที่ยอดนับต่างจากระบบ (ขาด ${noReason.length} แถว)`;
    return;
  }
  const plus = diffs.filter(r => r.d > 0).reduce((s, r) => s + r.d, 0), minus = -diffs.filter(r => r.d < 0).reduce((s, r) => s + r.d, 0);
  const c = await Swal.fire({ icon: 'warning', title: `ปรับยอดตามที่นับ (${_scnt.head.Count_ID})?`, showCancelButton: true, confirmButtonText: 'ปรับยอด', cancelButtonText: 'กลับไปตรวจ',
    html: `<div class="small text-start">นับแล้ว <b>${counted.length}</b> แถว · ต่างจากระบบ <b>${diffs.length}</b> แถว (เพิ่ม +${_stNum(plus)} / ลด −${_stNum(minus)})<br>
      แถวที่นับเท่าระบบไม่ถูกปรับ · แถวที่ไม่ได้กรอกยอดนับไม่ถูกแตะ<br><br>ระบบจะปรับสต็อกเป็นยอดที่นับ และบันทึกเป็นรายการ “ปรับยอดตรวจนับ” (เห็นในการ์ดสต็อก) <span class="text-danger">ลบ/แก้ย้อนหลังไม่ได้</span> — ถ้าปรับผิดให้ทำใบตรวจนับใหม่</div>` });
  if (!c.isConfirmed) return;
  if (!(await stockCountSave(true))) return;
  _showLoader();
  const fg = _scnt.head.ItemType === 'FG', who = _stWho(), done = [], failed = [];
  try {
    // ยอดในระบบล่าสุดจริงตอนกดปรับ (อาจต่างจากตอนเปิดใบ)
    const fresh = await _scntCurrent(_scnt.head);
    for (const r of counted) {
      const line = _scnt.lines.find(x => x.Line_ID === r.line);
      const before = fresh[r.line] || 0, d = r.counted - before;
      if (Math.abs(d) < _ST_EPS) { await _sb.from('stock_count_lines').update({ BeforeQty: before }).eq('Line_ID', r.line); continue; }
      // 1) อ่านแถวสต็อกจริง
      const sel = fg
        ? await _sb.from('stock_fg').select('_row_id,FGBalance').eq('ProductCode', line.ItemCode).eq('LotFG', line.Lot)
        : await _sb.from('stock_balance').select('_row_id,QtyIn,QtyOut,QtyBalance,UnitCost,StockValue,TotalCost').eq('MaterialCode', line.ItemCode).eq('Lot', line.Lot);
      const srow = (sel.data || [])[0];
      if (sel.error || !srow) { failed.push(`${line.ItemCode}/${line.Lot}: ${sel.error ? sel.error.message : 'ไม่พบแถวสต็อก'}`); continue; }
      const unitCost = fg ? null : (parseFloat(srow.UnitCost) || 0);
      // 2) บันทึกหลักฐานการปรับก่อน (insert-only) แล้วค่อยปรับสต็อก
      const { data: adj, error: adjErr } = await _sb.from('stock_adjustments').insert({
        ItemType: fg ? 'FG' : 'RM', ItemCode: line.ItemCode, ItemName: line.ItemName, Lot: line.Lot, UOM: line.UOM,
        Qty: d, BeforeQty: before, AfterQty: r.counted, UnitCost: unitCost, Reason: r.reason, Count_ID: _scnt.head.Count_ID, CreatedBy: who,
      }).select('_row_id').single();
      if (adjErr) { failed.push(`${line.ItemCode}/${line.Lot}: ${adjErr.message}`); continue; }
      const upd = fg
        ? { FGBalance: (parseFloat(srow.FGBalance) || 0) + d }
        : { QtyBalance: (parseFloat(srow.QtyBalance) || 0) + d,
            QtyIn: (parseFloat(srow.QtyIn) || 0) + (d > 0 ? d : 0), QtyOut: (parseFloat(srow.QtyOut) || 0) + (d < 0 ? -d : 0),
            StockValue: (parseFloat(srow.StockValue) || 0) + d * unitCost, TotalCost: (parseFloat(srow.TotalCost) || 0) + d * unitCost };
      const { error: uErr } = await _sb.from(fg ? 'stock_fg' : 'stock_balance').update(upd).eq('_row_id', srow._row_id);
      if (uErr) { failed.push(`${line.ItemCode}/${line.Lot}: บันทึกการปรับแล้วแต่ปรับสต็อกไม่สำเร็จ (${uErr.message}) — แจ้งแอดมิน`); continue; }
      await _sb.from('stock_count_lines').update({ BeforeQty: before, AdjID: adj._row_id }).eq('Line_ID', r.line);
      done.push(line);
    }
    await _sb.from('stock_counts').update({ Status: 'ปรับยอดแล้ว', AppliedBy: who, AppliedAt: new Date().toISOString() }).eq('Count_ID', _scnt.head.Count_ID);
    if (typeof _logAudit === 'function') _logAudit('EDIT', 'stock_counts', _scnt.head.Count_ID, `ปรับยอดตรวจนับ ${done.length} Lot${failed.length ? ` (ไม่สำเร็จ ${failed.length})` : ''}`);
  } finally { _hideLoader(); }
  bootstrap.Modal.getInstance(document.getElementById('stockCountModal'))?.hide();
  await stockCountLoad();
  Swal.fire({ icon: failed.length ? 'warning' : 'success', title: failed.length ? 'ปรับยอดได้บางส่วน' : 'ปรับยอดแล้ว',
    html: `ปรับสต็อก <b>${done.length}</b> Lot — ดูรายการได้ในการ์ดสต็อก${failed.length ? `<div class="text-danger small text-start mt-2">${failed.map(_stEsc).join('<br>')}</div>` : ''}` });
}

async function stockCountCancel() {
  if (!_scnt || _scnt.head.Status !== 'กำลังนับ') return;
  const c = await Swal.fire({ icon: 'question', title: `ยกเลิกใบ ${_scnt.head.Count_ID}?`, text: 'ยังไม่ได้ปรับสต็อก — ยกเลิกแล้วยอดนับที่กรอกไว้จะไม่ถูกใช้', showCancelButton: true, confirmButtonText: 'ยกเลิกใบนับ', cancelButtonText: 'ไม่ยกเลิก' });
  if (!c.isConfirmed) return;
  const { error } = await _sb.from('stock_counts').update({ Status: 'ยกเลิก' }).eq('Count_ID', _scnt.head.Count_ID);
  if (error) { document.getElementById('scnt-err').textContent = error.message; return; }
  bootstrap.Modal.getInstance(document.getElementById('stockCountModal'))?.hide();
  await stockCountLoad();
}

// ใบตรวจนับสำหรับพิมพ์ไปนับที่คลัง — ไม่โชว์ยอดในระบบ (นับแบบไม่เห็นยอด กันเอนเอียง) ช่อง "นับจริง" เว้นว่างให้เขียน
function stockCountPrint() {
  if (!_scnt) return;
  const { head, lines } = _scnt, PER = 28, pages = [];
  for (let i = 0; i < lines.length; i += PER) pages.push(lines.slice(i, i + PER));
  const w = window.open('', '_blank');
  if (!w) { _err('เปิดหน้าพิมพ์ไม่ได้', 'เบราว์เซอร์บล็อกหน้าต่างใหม่ — อนุญาต pop-up ของเว็บนี้แล้วลองใหม่'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${_stEsc(head.Count_ID)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
    <style>@page{size:A4;margin:12mm} body{font-family:Sarabun,sans-serif;font-size:12px;color:#0f172a} .pg{page-break-after:always}
    h2{margin:0 0 2px;font-size:17px} .meta{color:#475569;margin-bottom:8px} table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #94a3b8;padding:4px 6px;text-align:left} th{background:#e2e8f0} td.n{text-align:center;width:28px}
    .sign{display:flex;justify-content:space-around;margin-top:22px} .sign div{text-align:center;width:30%;border-top:1px solid #0f172a;padding-top:4px}</style></head><body>
    ${pages.map((ch, pi) => `<div class="pg"><h2>ใบตรวจนับสต็อก / Stock Count Sheet — ${_stEsc(head.Count_ID)}</h2>
      <div class="meta">${head.ItemType === 'FG' ? 'สินค้าสำเร็จรูป (FG)' : 'วัตถุดิบ'} · ขอบเขต ${_stEsc(head.Scope || '')} · วันที่ ${String(head.CountDate || '').slice(0, 10)}${head.Note ? ' · ' + _stEsc(head.Note) : ''} · หน้า ${pi + 1}/${pages.length} · ทั้งหมด ${lines.length} แถว</div>
      <table><thead><tr><th>#</th><th>รหัส</th><th>รายการ</th><th style="width:16%">Lot</th><th style="width:7%">หน่วย</th><th style="width:14%">นับจริง</th><th style="width:16%">หมายเหตุ</th></tr></thead>
      <tbody>${ch.map((x, i) => `<tr style="height:24px"><td class="n">${pi * PER + i + 1}</td><td>${_stEsc(x.ItemCode)}</td><td>${_stEsc(x.ItemName || '')}</td><td>${_stEsc(x.Lot)}</td><td>${_stEsc(x.UOM || '')}</td><td></td><td></td></tr>`).join('')}</tbody></table>
      <div class="sign"><div>ผู้นับ<br><br>วันที่ ...../...../.....</div><div>ผู้ตรวจสอบ<br><br>วันที่ ...../...../.....</div></div></div>`).join('')}
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

// ════════════════════════════════════════════════════════════════════════════
// Backup — แอดมินเท่านั้น: อ่านทุกตารางหลักทีละหน้า (1000 แถว) แล้วดาวน์โหลดเป็นไฟล์ JSON ไฟล์เดียว + CSV ทีละตาราง (เปิดใน Excel)
// เป็น "สำเนาข้อมูลตาราง" ไม่ใช่สำรองทั้งฐานข้อมูล (ไม่รวมรูปใน Storage / บัญชีผู้ใช้ / โครงสร้าง-ฟังก์ชัน — SQL อยู่ในโฟลเดอร์โปรเจกต์)
// ไม่มีปุ่มกู้คืนอัตโนมัติ (ตั้งใจ: กู้ผิดอันตรายกว่า) · ไม่รวม signup_requests (มีรหัสผ่านเริ่มต้น) · ตัวเลือกปิดไว้ก่อน: ข้อมูลอ่อนไหว/ใหญ่
// เตือนทุก 7 วันผ่าน badge "!" ที่เมนู (เวลาสำรองล่าสุดเก็บใน localStorage ของเครื่องนี้ — ไม่ข้ามเครื่อง)
// ════════════════════════════════════════════════════════════════════════════
const BACKUP_TABLES = [
  ['materials', 'Master Material', 'Master'], ['bom', 'BOM', 'Master'], ['material_price_tiers', 'ราคาซื้อ Bulk', 'Master'],
  ['cost_standards', 'ต้นทุนมาตรฐาน', 'Master'], ['employees', 'พนักงาน', 'Master'], ['skills', 'สกิล', 'Master'], ['employee_skills', 'สกิลพนักงาน', 'Master'],
  ['product_packing_defaults', 'ค่าแพ็คเริ่มต้นสินค้า', 'Master'], ['floor_machines', 'ชื่อเครื่องจักร', 'Master'],
  ['stock_balance', 'Stock วัตถุดิบ', 'Inventory'], ['stock_fg', 'Stock FG', 'Inventory'], ['hold_stock', 'สต็อก Defect/Retain', 'Inventory'],
  ['hold_stock_moves', 'ความเคลื่อนไหว Defect/Retain', 'Inventory'], ['hold_stock_report_numbers', 'เลขรายงาน Defect/Retain', 'Inventory'],
  ['stock_counts', 'ใบตรวจนับสต็อก', 'Inventory'], ['stock_count_lines', 'รายการในใบตรวจนับ', 'Inventory'], ['stock_adjustments', 'ปรับยอดตรวจนับ', 'Inventory'],
  ['purchase_requests', 'ใบขอซื้อ', 'Purchasing'], ['purchase_request_lines', 'รายการในใบขอซื้อ', 'Purchasing'], ['mr_receive', 'รับวัตถุดิบ (MR)', 'Purchasing'],
  ['mr_rc_numbers', 'เลข RC', 'Purchasing'], ['fg_receive', 'รับ FG', 'Purchasing'], ['issue_misc', 'เบิกเบ็ดเตล็ด', 'Purchasing'], ['misc_issue_numbers', 'เลขใบเบิกเบ็ดเตล็ด', 'Purchasing'],
  ['customer_orders', 'คำสั่งลูกค้า (CO)', 'Sales'], ['fg_withdraw', 'เบิก FG', 'Sales'], ['delivery', 'จัดส่ง', 'Sales'], ['delivery_bill_numbers', 'เลขใบส่งของ', 'Sales'],
  ['manufacturing_orders', 'ไลน์ผลิต (MO)', 'Production'], ['mo_material_reservations', 'จองวัตถุดิบ MO', 'Production'], ['production_plan', 'แผนผลิต', 'Production'],
  ['production_plan_step_overrides', 'ปรับขั้นตอนแผน', 'Production'], ['issue_production', 'เบิกผลิต', 'Production'], ['production_records', 'บันทึกผลิต', 'Production'],
  ['production_record_details', 'รายละเอียดบันทึกผลิต', 'Production'], ['production_progress', 'สแกนยอดผลิต', 'Production'], ['production_labor_log', 'เวลาแรงงาน', 'Production'],
  ['production_status_log', 'สถานะหน้างาน (NFC)', 'Production'],
  ['qc_settings', 'QC ตั้งค่า', 'Quality'], ['qc_spec_items', 'QC Spec', 'Quality'], ['qc_inspections', 'QC ใบตรวจ', 'Quality'], ['qc_inspection_results', 'QC ผลตรวจ', 'Quality'],
  ['qc_ncr', 'NCR', 'Quality'], ['qc_coa_results', 'CoA', 'Quality'],
  ['rd_projects', 'R&D โปรเจกต์', 'R&D'], ['rd_formulas', 'R&D สูตร', 'R&D'], ['rd_trials', 'R&D ทดลอง', 'R&D'], ['rd_stability_checks', 'R&D Stability', 'R&D'],
  ['rd_ingredients', 'R&D วัตถุดิบ', 'R&D'], ['rd_presets', 'R&D Preset', 'R&D'], ['rd_rules', 'R&D กฎ', 'R&D'], ['rd_claims', 'R&D Claim', 'R&D'], ['rd_product_types', 'R&D ประเภทสินค้า', 'R&D'],
  ['employee_leaves', 'ขาด/ลา/มาสาย', 'System'], ['user_roles', 'สิทธิ์ผู้ใช้', 'System'], ['mr_edit_requests', 'คำขอแก้ไข MR', 'System'],
  ['issue_edit_requests', 'คำขอแก้ไขเบิกผลิต', 'System'], ['co_edit_requests', 'คำขอแก้ไข CO', 'System'], ['production_labor_edit_requests', 'คำขอแก้ไขเวลาแรงงาน', 'System'],
  ['admindash_payroll_actual', 'ค่าแรงจริง (อ่อนไหว)', 'System'], ['audit_log', 'Audit Log (ข้อมูลเยอะ)', 'System'],
];
const BACKUP_OPT_IN = new Set(['admindash_payroll_actual', 'audit_log']);
const BACKUP_KEY = 'proflow_last_backup', BACKUP_COUNTS_KEY = 'proflow_last_backup_counts';
let _bkCounts = null, _bkBusy = false;
// สำรองล่าสุด { at, by, file, counts:{ตาราง: จำนวนแถวตอนสำรอง}, shared } — อ่านจากตาราง backup_log (เห็นทุกเครื่อง, create_backup_log.sql)
// ถ้ายังไม่มีตาราง/อ่านไม่ได้ ใช้ localStorage ของเครื่องนี้แทน (shared = false)
let _bkLastRec, _bkLastPromise = null;
function _bkLocalRec() {
  try {
    const at = localStorage.getItem(BACKUP_KEY);
    return at ? { at, by: null, file: null, counts: JSON.parse(localStorage.getItem(BACKUP_COUNTS_KEY) || 'null'), shared: false } : null;
  } catch (e) { return null; }
}
function _bkLoadLast(force) {
  if (force || !_bkLastPromise) _bkLastPromise = (async () => {
    const local = _bkLocalRec();
    const { data, error } = await _sb.from('backup_log').select('*').order('CreatedAt', { ascending: false }).limit(1);
    const row = !error && data && data[0];
    const rec = row ? { at: row.CreatedAt, by: row.CreatedBy, file: row.FileName, counts: row.Counts || null, shared: true } : null;
    // เครื่องนี้สำรองทีหลังแถวล่าสุดในตาราง (เช่น บันทึกลงตารางไม่สำเร็จ) → ใช้ของเครื่องนี้
    _bkLastRec = rec && (!local || new Date(rec.at) >= new Date(local.at)) ? rec : local;
    return _bkLastRec;
  })();
  return _bkLastPromise;
}
const _bkDaysAgo = () => (_bkLastRec && _bkLastRec.at ? (Date.now() - new Date(_bkLastRec.at).getTime()) / 86400000 : null);
async function _backupBadge() {
  const el = document.getElementById('nav-backup-badge');
  if (!el) return;
  if (!_stAdmin()) { el.style.display = 'none'; return; }
  if (_bkLastRec === undefined) { try { await _bkLoadLast(); } catch (e) { _bkLastRec = _bkLocalRec(); } }
  const d = _bkDaysAgo();
  el.style.display = d === null || d > 7 ? '' : 'none';
}
// จำนวนแถวที่เพิ่ม/ลดตั้งแต่สำรองล่าสุด ของตาราง t (null = สำรองล่าสุดไม่ได้รวมตารางนี้ หรือยังนับไม่เสร็จ)
function _bkDelta(t) {
  const now = _bkCounts && _bkCounts[t], base = _bkLastRec && _bkLastRec.counts;
  if (!now || now.err || !base || base[t] === undefined || base[t] === null) return null;
  return Number(now.n) - Number(base[t]);
}
function _bkRenderDelta(t) {
  const el = document.getElementById('bk-d-' + t);
  if (!el) return;
  const d = _bkDelta(t);
  el.innerHTML = d === null ? '<span class="text-muted">—</span>'
    : d > 0 ? `<span class="badge bg-warning-subtle text-warning-emphasis">+${d.toLocaleString('th-TH')}</span>`
    : d < 0 ? `<span class="badge bg-secondary-subtle text-secondary-emphasis" title="แถวถูกลบตั้งแต่สำรองล่าสุด">${d.toLocaleString('th-TH')}</span>`
    : '<span class="text-success small"><i class="fas fa-check"></i></span>';
}
async function _bkCount(t) {
  const { count, error } = await _sb.from(t).select('*', { count: 'exact', head: true });
  return error ? { err: error.message } : { n: count };
}

async function backupLoad() {
  _stEnsurePages();
  const body = document.getElementById('backup-body');
  if (!body) return;
  if (!_stAdmin()) { body.innerHTML = '<div class="glass-card text-muted">หน้านี้สำหรับแอดมินเท่านั้น</div>'; return; }
  if (!document.getElementById('backup-table-body')) {
    body.innerHTML = `<div class="glass-card" id="backup-info"></div>
      <div class="glass-card d-none" id="backup-prog-card"><div class="fw-semibold mb-2" id="backup-prog-text"></div><div class="progress" style="height:10px"><div class="progress-bar" id="backup-prog-bar" style="width:0%"></div></div></div>
      <div class="glass-card"><div class="d-flex flex-wrap align-items-center gap-2 mb-2"><h6 class="mb-0">ตารางที่จะสำรอง</h6>
        <button class="btn btn-sm btn-outline-secondary" onclick="backupToggleAll(true)">เลือกทั้งหมด</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="backupToggleAll(false)">ไม่เลือก</button>
        <button class="btn btn-sm btn-outline-secondary ms-auto" onclick="backupRecount()"><i class="fas fa-rotate me-1"></i>นับจำนวนแถวใหม่</button></div>
        <div class="table-responsive"><table class="table table-sm align-middle mb-0">
          <thead><tr><th style="width:32px"></th><th>ข้อมูล</th><th>กลุ่ม</th><th class="text-end">จำนวนแถว</th><th class="text-end" title="จำนวนแถวตอนนี้ เทียบกับตอนสำรองล่าสุด">ใหม่ตั้งแต่สำรอง</th><th class="text-end">เฉพาะตารางนี้</th></tr></thead>
          <tbody id="backup-table-body">${BACKUP_TABLES.map(([t, label, grp]) => `<tr><td><input type="checkbox" class="form-check-input bk-chk" value="${t}"${BACKUP_OPT_IN.has(t) ? '' : ' checked'}></td>
            <td>${_stEsc(label)}<div class="small text-muted"><code>${t}</code></div></td><td class="small text-muted">${_stEsc(grp)}</td><td class="text-end" id="bk-n-${t}">…</td>
            <td class="text-end" id="bk-d-${t}">…</td>
            <td class="text-end"><button class="btn btn-sm btn-outline-secondary" onclick="backupCsv('${t}')" title="ดาวน์โหลดตารางนี้เป็น CSV (เปิดใน Excel)">CSV</button></td></tr>`).join('')}</tbody>
        </table></div></div>`;
  }
  backupRenderInfo();
  await _bkLoadLast(true);
  backupRenderInfo();
  await backupRecount();
}
async function backupRecount() {
  _bkCounts = {};
  await Promise.all(BACKUP_TABLES.map(async ([t]) => {
    const r = await _bkCount(t);
    _bkCounts[t] = r;
    const el = document.getElementById('bk-n-' + t);
    if (el) el.innerHTML = r.err ? `<span class="text-danger small" title="${_stEsc(r.err)}">อ่านไม่ได้</span>` : Number(r.n).toLocaleString('th-TH');
    _bkRenderDelta(t);
  }));
  backupRenderInfo();
}
function backupToggleAll(on) { document.querySelectorAll('#backup-table-body .bk-chk').forEach(c => { c.checked = on; }); }
function backupRenderInfo() {
  const el = document.getElementById('backup-info');
  if (!el) return;
  const d = _bkDaysAgo(), r = _bkLastRec;
  const ago = d === null ? '' : d < 1 / 24 ? 'เมื่อสักครู่' : d < 1 ? Math.floor(d * 24) + ' ชั่วโมงที่แล้ว' : Math.floor(d) + ' วันที่แล้ว';
  const last = r === undefined ? '<span class="text-muted">กำลังโหลดประวัติการสำรอง…</span>'
    : r ? `<i class="fas fa-clock-rotate-left me-1 text-primary"></i>สำรองล่าสุด: <b>${new Date(r.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</b> · ${ago}`
        + (r.by ? ` · โดย ${_stEsc(r.by)}` : '') + (r.shared ? '' : ' <span class="text-muted small">(จำไว้แค่เครื่องนี้ — รัน create_backup_log.sql เพื่อให้เห็นทุกเครื่อง)</span>')
    : '<b>ยังไม่เคยสำรองข้อมูล</b>';
  // สรุปแถวใหม่ตั้งแต่สำรองล่าสุด (รวมทุกตารางที่สำรองล่าสุดมีจำนวนไว้)
  let summary = '';
  if (r && _bkCounts) {
    if (!r.counts) summary = '<div class="small text-muted mb-2">สำรองครั้งล่าสุดยังไม่ได้เก็บจำนวนแถวไว้ — สำรองอีกครั้งเพื่อเริ่มนับแถวใหม่</div>';
    else {
      let added = 0, removed = 0, tables = 0;
      BACKUP_TABLES.forEach(([t]) => { const x = _bkDelta(t); if (x) { tables++; if (x > 0) added += x; else removed -= x; } });
      summary = tables
        ? `<div class="mb-2"><span class="badge bg-warning text-dark fs-6 me-1">+${added.toLocaleString('th-TH')} แถวใหม่</span>${removed ? `<span class="badge bg-secondary me-1">−${removed.toLocaleString('th-TH')} ถูกลบ</span>` : ''}<span class="small text-muted">ใน ${tables} ตาราง ยังไม่อยู่ในไฟล์สำรองล่าสุด</span></div>`
        : '<div class="mb-2 text-success"><i class="fas fa-circle-check me-1"></i>ไม่มีแถวใหม่ตั้งแต่สำรองล่าสุด</div>';
    }
  }
  const warn = (r !== undefined && (d === null || d > 7)) ? '<div class="alert alert-warning py-2 small mb-2"><i class="fas fa-triangle-exclamation me-1"></i>ควรสำรองข้อมูลอย่างน้อยสัปดาห์ละครั้ง และก่อนรันไฟล์ SQL ที่แก้ข้อมูลทุกครั้ง</div>' : '';
  el.innerHTML = `${warn}<div class="mb-2 fs-6">${last}</div>${summary}
    <div class="small text-muted mb-1">"ใหม่ตั้งแต่สำรอง" นับจากจำนวนแถวที่เพิ่ม/ลด — การแก้ไขแถวเดิมจะไม่ถูกนับ แต่ก็ยังไม่อยู่ในไฟล์สำรองเช่นกัน</div>
    <div class="small text-muted">ไฟล์ที่ได้ = ข้อมูลตารางทั้งหมดที่เลือกในรูป JSON (เก็บไว้กู้คืนด้วยมือ/ให้ผู้ดูแลระบบนำเข้า) · <b>ไม่รวม</b> รูปภาพ, บัญชีผู้ใช้ (รหัสผ่าน), โครงสร้างฐานข้อมูล (ไฟล์ SQL อยู่ในโฟลเดอร์โปรเจกต์) · ไม่มีปุ่มกู้คืนอัตโนมัติ<br>
    เก็บไฟล์ไว้ที่ปลอดภัย (ไม่ส่งต่อทางแชต/อีเมลสาธารณะ) เพราะมีข้อมูลธุรกิจ · สำรองตอนที่ไม่มีคนกำลังบันทึกจะนิ่งที่สุด · ถ้าจำนวนแถวเปลี่ยนระหว่างสำรอง ระบบจะแจ้งให้สำรองใหม่</div>`;
}
// อ่านทั้งตารางทีละหน้า 1000 แถว (PostgREST จำกัดต่อคำขอ) · คืน { rows, expected } เพื่อเทียบจำนวนกับที่นับไว้ก่อนอ่าน
async function _bkFetch(t, onPage) {
  const first = await _bkCount(t);
  if (first.err) throw new Error(first.err);
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await _sb.from(t).select('*').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (onPage) onPage(rows.length, first.n);
    if (!data || data.length < 1000) break;
  }
  return { rows, expected: first.n };
}
function _bkDownload(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const _bkStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };
async function backupRun() {
  if (_bkBusy || !_stAdmin()) return;
  const picked = [...document.querySelectorAll('#backup-table-body .bk-chk:checked')].map(c => c.value);
  if (!picked.length) { Swal.fire('ยังไม่ได้เลือกตาราง', 'ติ๊กอย่างน้อย 1 ตาราง', 'info'); return; }
  _bkBusy = true;
  const btn = document.getElementById('backup-run-btn'), card = document.getElementById('backup-prog-card'), txt = document.getElementById('backup-prog-text'), bar = document.getElementById('backup-prog-bar');
  btn.disabled = true; card.classList.remove('d-none');
  const out = { app: 'ProFlow Wise MES', version: 1, createdAt: new Date().toISOString(), createdBy: (_currentUser && _currentUser.email) || null, tables: {}, skipped: {}, mismatch: [] };
  const labelOf = Object.fromEntries(BACKUP_TABLES.map(([t, l]) => [t, l]));
  try {
    for (let i = 0; i < picked.length; i++) {
      const t = picked[i];
      txt.textContent = `(${i + 1}/${picked.length}) กำลังอ่าน ${labelOf[t]} …`;
      bar.style.width = Math.round((i / picked.length) * 100) + '%';
      try {
        const { rows, expected } = await _bkFetch(t, (n, tot) => { txt.textContent = `(${i + 1}/${picked.length}) ${labelOf[t]} — ${n.toLocaleString('th-TH')} / ${Number(tot).toLocaleString('th-TH')} แถว`; });
        out.tables[t] = { count: rows.length, rows };
        if (expected !== null && expected !== rows.length) out.mismatch.push({ table: t, expected, got: rows.length });
      } catch (e) { out.skipped[t] = e.message; }
    }
    bar.style.width = '100%';
    txt.textContent = 'กำลังสร้างไฟล์ …';
    const text = JSON.stringify(out);
    const fname = `proflow-backup-${_bkStamp()}.json`;
    _bkDownload(fname, text, 'application/json');
    // เก็บจำนวนแถวตอนสำรอง → ใช้คำนวณ "ใหม่ตั้งแต่สำรอง" · บันทึกทั้ง localStorage (กันพลาด) และ backup_log (เห็นทุกเครื่อง)
    const counts = Object.fromEntries(Object.entries(out.tables).map(([t, x]) => [t, x.count]));
    const nowIso = new Date().toISOString(), by = (_currentUser && (_currentUser.name || _currentUser.email)) || null;
    try { localStorage.setItem(BACKUP_KEY, nowIso); localStorage.setItem(BACKUP_COUNTS_KEY, JSON.stringify(counts)); } catch (e) { /* บันทึกเวลาไม่ได้ก็ไม่เป็นไร */ }
    const { error: logErr } = await _sb.from('backup_log').insert({ CreatedBy: by, FileName: fname, TableCount: Object.keys(counts).length,
      RowCount: Object.values(counts).reduce((s, n) => s + n, 0), Counts: counts });
    _bkLastRec = { at: nowIso, by, file: fname, counts, shared: !logErr };
    _bkLastPromise = Promise.resolve(_bkLastRec);
    // จำนวนแถวตอนนี้ = ที่เพิ่งอ่าน (คอลัมน์ "ใหม่ตั้งแต่สำรอง" จะเป็น ✓)
    Object.entries(counts).forEach(([t, n]) => { _bkCounts = _bkCounts || {}; _bkCounts[t] = { n }; const el = document.getElementById('bk-n-' + t); if (el) el.textContent = n.toLocaleString('th-TH'); });
    BACKUP_TABLES.forEach(([t]) => _bkRenderDelta(t));
    _backupBadge(); backupRenderInfo();
    if (typeof _logAudit === 'function') _logAudit('EXPORT', 'backup', fname, `${Object.keys(out.tables).length} ตาราง`);
    const nRows = Object.values(out.tables).reduce((s, x) => s + x.count, 0), skipped = Object.keys(out.skipped), mism = out.mismatch;
    const problems = [
      skipped.length ? `<div class="text-danger mb-1">อ่านไม่ได้ ${skipped.length} ตาราง (อาจยังไม่ได้สร้างตาราง): ${skipped.map(k => `<code>${_stEsc(k)}</code>`).join(', ')}</div>` : '',
      mism.length ? `<div class="text-warning-emphasis mb-1">จำนวนแถวเปลี่ยนระหว่างสำรอง (มีคนบันทึกอยู่): ${mism.map(m => `<code>${_stEsc(m.table)}</code> ${m.expected}→${m.got}`).join(', ')} — ควรสำรองใหม่ตอนไม่มีคนใช้งาน</div>` : '',
    ].join('');
    Swal.fire({ icon: skipped.length || mism.length ? 'warning' : 'success', title: 'ดาวน์โหลดไฟล์สำรองแล้ว',
      html: `<div class="small text-start"><b>${_stEsc(fname)}</b><br>${Object.keys(out.tables).length} ตาราง · ${nRows.toLocaleString('th-TH')} แถว · ${(text.length / 1048576).toFixed(1)} MB<br><br>${problems}<span class="text-muted">เก็บไฟล์ไว้ที่ปลอดภัย (เช่น ไดรฟ์ที่แยกจากเครื่องนี้)</span></div>` });
  } finally { _bkBusy = false; btn.disabled = false; setTimeout(() => card.classList.add('d-none'), 1500); }
}
// ดาวน์โหลดตารางที่ติ๊กเป็น Excel ไฟล์เดียว: ชีทแรก "สารบัญ" + 1 ตาราง = 1 ชีท (ใช้ SheetJS ที่ index.html โหลดไว้แล้ว)
// ข้อความเก็บเป็นข้อความ (รหัส/Lot ที่ขึ้นต้นด้วย 0 ไม่หาย, วันที่ไม่สลับวัน-เดือน) · ตัวเลขเป็นตัวเลข · ค่า JSON ใส่เป็นข้อความ JSON
// ไว้เปิดดู/ทำรายงานเท่านั้น — ไม่นับเป็น "สำรองล่าสุด" (ไฟล์กู้คืนคือ JSON)
async function backupXlsx() {
  if (_bkBusy || !_stAdmin()) return;
  if (typeof XLSX === 'undefined') { _err('สร้างไฟล์ Excel ไม่ได้', 'ไลบรารี Excel (SheetJS) ยังโหลดไม่เสร็จ — รีเฟรชหน้าแล้วลองใหม่'); return; }
  const picked = [...document.querySelectorAll('#backup-table-body .bk-chk:checked')].map(c => c.value);
  if (!picked.length) { Swal.fire('ยังไม่ได้เลือกตาราง', 'ติ๊กอย่างน้อย 1 ตาราง', 'info'); return; }
  _bkBusy = true;
  const btn = document.getElementById('backup-xlsx-btn'), card = document.getElementById('backup-prog-card'), txt = document.getElementById('backup-prog-text'), bar = document.getElementById('backup-prog-bar');
  btn.disabled = true; card.classList.remove('d-none');
  const meta = Object.fromEntries(BACKUP_TABLES.map(([t, l, g]) => [t, { label: l, grp: g }]));
  const wb = XLSX.utils.book_new(), used = new Set(['สารบัญ']), toc = [], skipped = [];
  // ชื่อชีท: ไม่เกิน 31 ตัว, ห้าม : \ / ? * [ ] และห้ามซ้ำ
  const sheetName = label => {
    const base = label.replace(/[:\\/?*\[\]]/g, '-').slice(0, 28).trim() || 'Sheet';
    let n = base, i = 2;
    while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)}(${i++})`;
    used.add(n.toLowerCase());
    return n;
  };
  const cell = v => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v).slice(0, 32000)
    : typeof v === 'string' ? v.slice(0, 32000) : v;   // Excel รับข้อความได้ไม่เกิน 32,767 ตัวต่อช่อง
  try {
    for (let i = 0; i < picked.length; i++) {
      const t = picked[i], m = meta[t];
      txt.textContent = `(${i + 1}/${picked.length}) กำลังอ่าน ${m.label} …`;
      bar.style.width = Math.round((i / picked.length) * 100) + '%';
      try {
        const { rows } = await _bkFetch(t, (n, tot) => { txt.textContent = `(${i + 1}/${picked.length}) ${m.label} — ${n.toLocaleString('th-TH')} / ${Number(tot).toLocaleString('th-TH')} แถว`; });
        const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const ws = XLSX.utils.aoa_to_sheet([cols.length ? cols : ['(ไม่มีข้อมูล)'], ...rows.map(r => cols.map(c => cell(r[c])))]);
        // ความกว้างคอลัมน์ตามข้อมูล 200 แถวแรก (8–40 ตัวอักษร)
        ws['!cols'] = cols.map(c => ({ wch: Math.min(40, Math.max(8, String(c).length + 2, ...rows.slice(0, 200).map(r => String(cell(r[c])).length + 1))) }));
        if (cols.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: cols.length - 1 } }) };
        const name = sheetName(m.label);
        XLSX.utils.book_append_sheet(wb, ws, name);
        toc.push([name, t, m.grp, rows.length]);
      } catch (e) { skipped.push(t); toc.push(['(อ่านไม่ได้)', t, m.grp, e.message]); }
    }
    bar.style.width = '100%';
    txt.textContent = 'กำลังสร้างไฟล์ Excel …';
    const tocWs = XLSX.utils.aoa_to_sheet([
      ['ProFlow Wise MES — ข้อมูลส่งออก', '', '', ''],
      ['สร้างเมื่อ', new Date().toLocaleString('th-TH'), 'โดย', (_currentUser && (_currentUser.name || _currentUser.email)) || ''],
      [],
      ['ชีท', 'ตาราง', 'กลุ่ม', 'จำนวนแถว'], ...toc]);
    tocWs['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, tocWs, 'สารบัญ');
    wb.SheetNames.unshift(wb.SheetNames.pop());   // ให้ "สารบัญ" เป็นชีทแรก
    const fname = `proflow-data-${_bkStamp()}.xlsx`;
    XLSX.writeFile(wb, fname);
    if (typeof _logAudit === 'function') _logAudit('EXPORT', 'backup', fname, `Excel ${toc.length - skipped.length} ตาราง`);
    const nRows = toc.reduce((s, x) => s + (typeof x[3] === 'number' ? x[3] : 0), 0);
    Swal.fire({ icon: skipped.length ? 'warning' : 'success', title: 'ดาวน์โหลดไฟล์ Excel แล้ว',
      html: `<div class="small text-start"><b>${_stEsc(fname)}</b><br>${toc.length - skipped.length} ชีท · ${nRows.toLocaleString('th-TH')} แถว<br><br>`
        + (skipped.length ? `<div class="text-danger mb-1">อ่านไม่ได้ ${skipped.length} ตาราง: ${skipped.map(k => `<code>${_stEsc(k)}</code>`).join(', ')}</div>` : '')
        + '<span class="text-muted">ไฟล์ Excel ไว้เปิดดู/ทำรายงาน — ไฟล์สำหรับกู้คืนระบบยังเป็นปุ่ม "ดาวน์โหลดสำรองข้อมูล" (JSON)</span></div>' });
  } catch (e) { _err('สร้างไฟล์ Excel ไม่สำเร็จ', _stEsc(e.message)); }
  finally { _bkBusy = false; btn.disabled = false; setTimeout(() => card.classList.add('d-none'), 1500); }
}
// ดาวน์โหลดตารางเดียวเป็น CSV — BOM นำหน้าเพื่อให้ Excel อ่านภาษาไทยถูก · ค่าที่เป็น JSON ใส่เป็นข้อความ JSON
async function backupCsv(t) {
  if (!_stAdmin()) return;
  _showLoader();
  try {
    const { rows } = await _bkFetch(t);
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const cell = v => { if (v === null || v === undefined) return ''; const s = typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
    _bkDownload(`${t}_${_bkStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  } catch (e) { _err('ดาวน์โหลดไม่สำเร็จ', _stEsc(e.message)); }
  finally { _hideLoader(); }
}

// สร้างหน้าตั้งแต่โหลดสคริปต์ (เหมือน qc.js)
_stEnsurePages();
