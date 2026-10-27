// ════════════════════════════════════════════════════
// QC: สแกนเอกสาร CoA (ถ่ายรูป/อัปโหลดรูป/PDF) → อ่านข้อความในเบราว์เซอร์ → ดึงเฉพาะข้อมูลมาใส่ฟอร์มตรวจรับ
// โหลดต่อจาก qc.js (<script src="qc-coa.js?v=..."> ต้องอัปโหลดคู่กัน) — ใช้ _qcCurInsp / qcCalcResult / _qcEsc ของ qc.js
// ไม่อัปโหลดรูป/ไฟล์ไปไหนและไม่เก็บลง DB — เก็บเฉพาะค่าที่ดึงได้ (qc_inspections.CoA_* — alter_qc_inspections_add_coa_fields.sql)
// PDF ที่มีตัวอักษรอยู่ในไฟล์ (pdf.js getTextContent) อ่านตรงๆ แม่นกว่า; รูป/PDF สแกน ใช้ Tesseract.js (ไทย+อังกฤษ)
// ผลที่ดึงได้เป็น "ค่าแนะนำ" ขึ้นสีเหลืองให้ผู้ตรวจทวนก่อนบันทึกเสมอ
// ════════════════════════════════════════════════════

const QC_TESS_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const QC_PDFJS_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
const QC_PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
const _qcLibP = {};
function _qcLoadScript(src) {
  return _qcLibP[src] || (_qcLibP[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => { delete _qcLibP[src]; rej(new Error('โหลดไลบรารีไม่ได้ (ตรวจอินเทอร์เน็ต)')); };
    document.head.appendChild(s);
  }));
}
function _qcScanMsg(html) { const el = document.getElementById('qc-scan-status'); if (el) el.innerHTML = html; }

// ── วันที่ ──
const _QC_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  'ม.ค': 1, 'ก.พ': 2, 'มี.ค': 3, 'เม.ย': 4, 'พ.ค': 5, 'มิ.ย': 6, 'ก.ค': 7, 'ส.ค': 8, 'ก.ย': 9, 'ต.ค': 10, 'พ.ย': 11, 'ธ.ค': 12 };
const _QC_DATE_RE = '(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{4}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{1,2}|\\d{1,2}\\s*[-/ ]?\\s*[A-Za-z\\u0E01-\\u0E2E.]{3,5}\\s*[-/ .,]?\\s*\\d{2,4})';
function _qcParseDate(str) {
  if (!str) return null;
  str = String(str).trim();
  let d, m, y, mm;
  if ((mm = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) {
    d = +mm[1]; m = +mm[2]; y = +mm[3];
    if (m > 12 && d <= 12) { const t = d; d = m; m = t; }
  } else if ((mm = str.match(/^(\d{1,2})\s*[-/ ]?\s*([A-Za-zก-ฮ.]{3,5}?)\.?\s*[-/ .,]?\s*(\d{2,4})$/))) {
    d = +mm[1]; y = +mm[3];
    m = _QC_MONTHS[mm[2].toLowerCase().replace(/\.$/, '').slice(0, 3)] || _QC_MONTHS[mm[2].replace(/\.$/, '')];
  } else return null;
  if (!m || !d) return null;
  if (y < 100) y += 2000;
  if (y > 2400) y -= 543;   // พ.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── อ่านข้อความจากไฟล์ ──
// ย่อรูปให้ด้านยาวไม่เกิน 2200px + ขาวดำ (OCR เร็วขึ้น/ไม่กินแรม)
// rot = 0/90/180/270 (หมุนตามที่ผู้ใช้กดบนภาพตัวอย่าง — ถ่ายแท็บเลตแนวตั้ง/แนวนอนก็อ่านได้)
async function _qcPrepCanvas(src, rot = 0) {
  const bmp = src instanceof HTMLCanvasElement ? src : await createImageBitmap(src);
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  const swap = rot === 90 || rot === 270;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const g = c.getContext('2d');
  g.filter = 'grayscale(1) contrast(1.25)';
  g.translate(c.width / 2, c.height / 2);
  g.rotate(rot * Math.PI / 180);
  g.drawImage(bmp, -w / 2, -h / 2, w, h);
  return c;
}

async function _qcOcrCanvas(canvas, label) {
  await _qcLoadScript(QC_TESS_SRC);
  const r = await Tesseract.recognize(canvas, 'tha+eng', {
    logger: m => {
      if (!m.status) return;
      _qcScanMsg(`<i class="fas fa-spinner fa-spin me-1"></i>${label} ${_qcEsc(m.status)}${m.progress != null ? ' ' + Math.round(m.progress * 100) + '%' : ''} <span class="text-muted">(ครั้งแรกต้องโหลดชุดภาษาไทย อาจใช้เวลาสักครู่)</span>`);
    },
  });
  return r.data.text || '';
}

async function _qcReadPdf(file) {
  await _qcLoadScript(QC_PDFJS_SRC);
  pdfjsLib.GlobalWorkerOptions.workerSrc = QC_PDFJS_WORKER;
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = Math.min(pdf.numPages, 3);
  let text = '';
  for (let p = 1; p <= pages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    // รวมตัวอักษรเป็นบรรทัดตามพิกัด y เพื่อให้ชื่อรายการกับค่าอยู่บรรทัดเดียวกัน
    const lines = {};
    tc.items.forEach(it => { const y = Math.round(it.transform[5] / 3); (lines[y] = lines[y] || []).push(it); });
    Object.keys(lines).sort((a, b) => b - a).forEach(y => {
      text += lines[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ') + '\n';
    });
  }
  if (text.replace(/\s/g, '').length > 80) return text;   // PDF มีตัวอักษรจริง
  text = '';                                              // PDF สแกน → render แล้ว OCR
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    text += (await _qcOcrCanvas(await _qcPrepCanvas(c), `หน้า ${p}/${pages}`)) + '\n';
  }
  return text;
}

// ── คิวหน้าเอกสาร (หลายหน้า/หลายไฟล์) — เก็บในหน่วยความจำของหน้านี้เท่านั้น ──
// ถ่ายทีละหน้าได้ต่อเนื่อง, หมุน/ลบหน้าได้ก่อนกด "อ่านเอกสาร"; อ่านเสร็จหรือปิดโมดัล = ทิ้งไฟล์ทั้งหมดทันที
let _qcScanQueue = [];
let _qcScanBusy = false;
function qcClearScanQueue() {
  _qcScanQueue.forEach(q => { if (q.url) URL.revokeObjectURL(q.url); });
  _qcScanQueue = [];
  _qcRenderScanQueue();
}
function qcAddScanFiles(input) {
  const files = [...(input.files || [])];
  input.value = '';   // ไม่เก็บอ้างอิงไฟล์ใน input
  files.forEach(f => {
    const isPdf = f.type === 'application/pdf';
    _qcScanQueue.push({ file: f, isPdf, url: isPdf ? null : URL.createObjectURL(f), rot: 0 });
  });
  _qcScanMsg('');
  _qcRenderScanQueue();
}
function qcRotateScan(i) { if (_qcScanQueue[i]) { _qcScanQueue[i].rot = (_qcScanQueue[i].rot + 90) % 360; _qcRenderScanQueue(); } }
function qcRemoveScan(i) {
  const q = _qcScanQueue[i]; if (!q) return;
  if (q.url) URL.revokeObjectURL(q.url);
  _qcScanQueue.splice(i, 1);
  _qcRenderScanQueue();
}
function _qcRenderScanQueue() {
  const box = document.getElementById('qc-scan-queue'); if (!box) return;
  box.innerHTML = _qcScanQueue.map((q, i) => `<div class="qc-thumb text-center">
      ${q.isPdf
        ? '<div class="d-flex flex-column align-items-center justify-content-center" style="width:108px;height:108px;border:1px solid #cbd5e1;border-radius:6px;background:#fff"><i class="fas fa-file-pdf fa-2x text-danger"></i><small class="text-truncate w-100 px-1">' + _qcEsc(q.file.name) + '</small></div>'
        : `<img src="${q.url}" style="transform:rotate(${q.rot}deg)" alt="หน้า ${i + 1}">`}
      <div class="small text-muted">หน้า ${i + 1}</div>
      <div class="d-flex gap-1 justify-content-center">
        ${q.isPdf ? '' : `<button type="button" class="btn btn-outline-secondary" onclick="qcRotateScan(${i})" title="หมุน 90°"><i class="fas fa-rotate-right"></i></button>`}
        <button type="button" class="btn btn-outline-danger" onclick="qcRemoveScan(${i})" title="ลบหน้านี้"><i class="fas fa-trash"></i></button>
      </div></div>`).join('');
  const act = document.getElementById('qc-scan-actions');
  if (act) {
    act.style.display = _qcScanQueue.length ? '' : 'none';
    const b = act.querySelector('button');
    if (b) b.innerHTML = `<i class="fas fa-magnifying-glass me-1"></i>อ่านเอกสาร (${_qcScanQueue.length} หน้า)`;
  }
}
// ปิดโมดัลตรวจรับ → ทิ้งรูป/ไฟล์ที่ค้างในคิว
document.getElementById('qcInspModal')?.addEventListener('hidden.bs.modal', qcClearScanQueue);

// ปุ่ม "อ่านเอกสาร": อ่านทุกหน้าในคิว รวมข้อความ แล้วดึงข้อมูลครั้งเดียว
async function qcRunScan() {
  if (_qcScanBusy || !_qcScanQueue.length) return;
  _qcScanBusy = true;
  const btn = document.querySelector('#qc-scan-actions button'); if (btn) btn.disabled = true;
  try {
    let text = '';
    for (let i = 0; i < _qcScanQueue.length; i++) {
      const q = _qcScanQueue[i], label = `หน้า ${i + 1}/${_qcScanQueue.length}`;
      _qcScanMsg(`<i class="fas fa-spinner fa-spin me-1"></i>กำลังอ่าน${label}...`);
      text += (q.isPdf ? await _qcReadPdf(q.file) : await _qcOcrCanvas(await _qcPrepCanvas(q.file, q.rot), label)) + '\n';
    }
    const raw = document.getElementById('qc-scan-rawtext');
    if (raw) { raw.textContent = text; document.getElementById('qc-scan-raw').style.display = ''; }
    if (text.replace(/\s/g, '').length < 20) {
      _qcScanMsg('<span class="text-danger">อ่านข้อความไม่ได้ — ลองหมุนรูปให้ตรง ถ่ายใหม่ให้สว่าง/ชัด หรืออัปโหลดเป็น PDF</span>');
      return;   // เก็บคิวไว้ให้หมุน/แก้แล้วอ่านซ้ำ
    }
    _qcApplyExtract(_qcExtractCoA(text, _qcCurInsp.items));
    qcClearScanQueue();   // อ่านสำเร็จ — ทิ้งรูป/ไฟล์ ไม่เก็บ
  } catch (e) {
    console.error('qcRunScan', e);
    _qcScanMsg(`<span class="text-danger">อ่านเอกสารไม่สำเร็จ: ${_qcEsc(e.message || e)}</span>`);
  } finally {
    _qcScanBusy = false;
    const b2 = document.querySelector('#qc-scan-actions button'); if (b2) b2.disabled = false;
  }
}

// ── แยกข้อมูลจากข้อความ ──
function _qcNum(s) { const m = String(s).match(/-?\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : null; }

// ชื่อรายการ Spec → คำพ้อง/ตัวย่อที่พบบ่อยใน CoA (ไม่ตรงตารางนี้ใช้ชื่อรายการตรงๆ)
const _QC_SYN = [
  [/^ph\b|พีเอช/i, /\bpH\b/i],
  [/ความถ่วงจำเพาะ|specific\s*gravity|density/i, /specific\s*gravity|\bS\.?G\.?\b|density|ความถ่วงจำเพาะ/i],
  [/refractive|ดัชนีหักเห/i, /refractive\s*index|\bR\.?I\.?\b/i],
  [/acid\s*value|ค่ากรด/i, /acid\s*value|\bA\.?V\.?\b|ค่ากรด/i],
  [/peroxide|เปอร์ออกไซด์/i, /peroxide|เปอร์ออกไซด์/i],
  [/saponif|สะปอน/i, /saponification|สะปอนิฟิเคชัน/i],
  [/ลักษณะ|appearance/i, /appearance|ลักษณะ/i],
  [/(^|\s)สี($|\s)|colou?r/i, /colou?r|(^|\s)สี($|\s)/i],
  [/กลิ่น|odou?r|scent|fragrance/i, /odou?r|กลิ่น|fragrance/i],
  [/ความชื้น|moisture|water\s*content/i, /moisture|water\s*content|ความชื้น/i],
  [/ความหนืด|viscosity/i, /viscosity|ความหนืด/i],
];
function _qcLabelRegex(param) {
  for (const [test, rx] of _QC_SYN) if (test.test(param)) return rx;
  const base = param.replace(/\(.*?\)/g, '').trim();
  if (base.length < 2) return null;
  return new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i');
}
// คืน number (numeric) หรือ 1/0 (ผ่าน/ไม่ผ่าน) หรือ null ถ้าบรรทัดนี้ไม่ใช่รายการนี้/อ่านค่าไม่ได้
function _qcValueFromLine(line, labelRx, numeric) {
  const m = line.match(labelRx);
  if (!m) return null;
  let rest = line.slice(m.index + m[0].length);
  if (!numeric) {
    if (/not\s*compl|fail|reject|ไม่ผ่าน|ไม่ตรง/i.test(rest)) return 0;
    if (/pass|compl|conform|\bok\b|normal|ผ่าน|ตรงตาม|เป็นไปตาม/i.test(rest)) return 1;
    return null;
  }
  rest = rest.replace(/\([^)]*\)/g, ' ')                                          // (25°C) ฯลฯ
    .replace(/[<>≤≥]=?\s*\d+(?:[.,]\d+)?/g, ' ')                                  // < 0.5
    .replace(/\d+(?:[.,]\d+)?\s*(?:-|–|—|~|to|ถึง)\s*\d+(?:[.,]\d+)?/gi, ' ')     // 5.5 - 7.0 (ช่วง spec ในเอกสาร)
    .replace(/\d+(?:[.,]\d+)?\s*°\s*[CF]/gi, ' ');                                // อุณหภูมิ
  return _qcNum(rest);
}

function _qcExtractCoA(text, items) {
  const flat = text.replace(/\r/g, '');
  const lines = flat.split('\n').map(l => l.trim()).filter(Boolean);
  const out = { fields: {}, values: {} };
  const grab = (rx) => { const m = flat.match(rx); return m ? m[1].trim() : null; };
  const f = out.fields;
  f.lot = grab(/\b(?:lot|batch)\b\s*(?:no\.?|number|#)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i)
    || grab(/(?:เลขที่ผลิต|ล็อต|ลอต)\s*(?:ที่)?\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i);
  f.mfg = _qcParseDate(grab(new RegExp('(?:mfg\\.?|manufactur\\w*|prod(?:uction)?\\.?|วันผลิต)\\s*(?:date)?\\s*[:.\\-]?\\s*' + _QC_DATE_RE, 'i')));
  f.exp = _qcParseDate(grab(new RegExp('(?:exp\\w*\\.?|best\\s*before|use\\s*by|วันหมดอายุ)\\s*(?:date)?\\s*[:.\\-]?\\s*' + _QC_DATE_RE, 'i')));
  f.docNo = grab(/\b(?:coa|certificate|report|document|doc)\b\.?\s*(?:no\.?|number|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i);
  f.product = (grab(/(?:product(?:\s*name)?|material|item|sample|ชื่อสินค้า|ผลิตภัณฑ์)\s*[:\-]\s*(.+)/i) || '').slice(0, 100) || null;
  f.supplier = (grab(/(?:manufacturer|supplier|vendor|produced\s*by|ผู้ผลิต|ผู้จำหน่าย)\s*[:\-]?\s*(.+)/i)
    || grab(/((?:บริษัท|บจก\.?|หจก\.?)\s*[^\n]{3,70})/)
    || grab(/([A-Z][A-Za-z0-9&.,' \-]{3,60}\s(?:Co\.?,?\s*Ltd\.?|Company|Limited|Inc\.?|Corp\.?))/) || '').slice(0, 100) || null;
  items.forEach((it, i) => {
    const rx = _qcLabelRegex(it.Parameter);
    if (!rx) return;
    for (const line of lines) {
      const v = _qcValueFromLine(line, rx, it.ParamType === 'numeric');
      if (v != null) { out.values[i] = v; break; }
    }
  });
  return out;
}

// ใส่ค่าลงฟอร์ม (ช่องสีเหลือง = ดึงจากเอกสาร) + เทียบกับข้อมูลตอนรับเข้า
function _qcApplyExtract(ex) {
  const f = ex.fields, lot = _qcCurInsp.lot;
  const setv = (id, v) => { const el = document.getElementById(id); if (el && v) { el.value = v; el.style.background = '#fff8c4'; } };
  setv('qc-d-lot', f.lot); setv('qc-d-mfg', f.mfg); setv('qc-d-exp', f.exp);
  setv('qc-d-no', f.docNo); setv('qc-d-prod', f.product); setv('qc-d-sup', f.supplier);
  let filled = 0;
  _qcCurInsp.items.forEach((it, i) => {
    if (ex.values[i] == null) return;
    const el = document.getElementById('qc-m-' + i);
    if (!el) return;
    el.value = String(ex.values[i]);
    if (it.ParamType === 'numeric') el.style.background = '#fff8c4'; else el.dataset.auto = '1';   // passfail = ปุ่ม; qcSyncPF ทำสีเหลืองให้กลุ่มปุ่ม
    filled++;
  });
  document.getElementById('qc-i-coa').checked = true;
  qcCalcResult();
  const warn = [], norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (f.lot && lot.MfgLotNo) {
    if (norm(f.lot) !== norm(lot.MfgLotNo)) warn.push(`⚠ Lot ผู้ผลิตตาม CoA (${_qcEsc(f.lot)}) ไม่ตรงกับที่บันทึกตอนรับเข้า (${_qcEsc(lot.MfgLotNo)})`);
  } else if (f.lot && !lot.MfgLotNo) warn.push(`ℹ ตอนรับเข้ายังไม่ได้บันทึก Lot ผู้ผลิต — ใน CoA คือ ${_qcEsc(f.lot)}`);
  if (f.exp && lot.ExpDate && String(lot.ExpDate).slice(0, 10) !== f.exp) warn.push(`⚠ วันหมดอายุตาม CoA (${f.exp}) ไม่ตรงกับที่บันทึกตอนรับเข้า (${_qcEsc(String(lot.ExpDate).slice(0, 10))})`);
  if (f.exp && f.exp < new Date().toISOString().slice(0, 10)) warn.push('⚠ วันหมดอายุตาม CoA ผ่านไปแล้ว');
  document.getElementById('qc-d-warn').innerHTML = warn.map(w => `<div class="${w.startsWith('⚠') ? 'text-danger' : 'text-muted'}">${w}</div>`).join('');
  const found = ['lot', 'mfg', 'exp', 'docNo', 'product', 'supplier'].filter(k => f[k]).length;
  _qcScanMsg(`<span class="text-success"><i class="fas fa-check-circle me-1"></i>อ่านได้ ข้อมูลเอกสาร ${found}/6 ช่อง · ผลตรวจ ${filled}/${_qcCurInsp.items.length} รายการ</span> <span class="text-muted">— ช่องสีเหลืองคือค่าที่ดึงจากเอกสาร ตรวจทานให้ตรงกับกระดาษก่อนบันทึก</span>`);
}
