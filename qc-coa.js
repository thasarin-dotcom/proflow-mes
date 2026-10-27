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
const _QC_DATE_RE = String.raw`(\d{1,2}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{2,4}|\d{4}\s*[\/\-.]\s*\d{1,2}\s*[\/\-.]\s*\d{1,2}|\d{1,2}\s*[-/ .]?\s*[A-Za-zก-ฮ.]{3,9}\s*[-/ .,]?\s*\d{2,4}|[A-Za-z]{3,9}\.?\s*[-/ .,]?\s*\d{4}|\d{1,2}\s*[\/\-.]\s*\d{4}|\d{8}|\d{6}|\d{1,2}\s*[\/\-.]\s*\d{2}(?!\d))`;

// แปลงข้อความวันที่ → yyyy-mm-dd. kind = 'mfg' | 'exp' (ใช้ตอนมีแค่เดือน/ปี: mfg → วันที่ 1, exp → วันสุดท้ายของเดือน)
// รูปแบบที่รองรับ: dd/mm/yyyy · dd-mm-yy · yyyy-mm-dd · 14 Oct 2028 · ddmmyy · ddmmyyyy · mm/yyyy · mmyyyy · mm/yy · Oct 2026 (พ.ศ. แปลงให้)
// ตัวเลข 6 หลัก: ถ้า 4 หลักท้ายเป็นปี (20xx/25xx) และ 2 หลักแรกเป็นเดือน → mmyyyy, ไม่งั้น ddmmyy
function _qcParseDate(str, kind) {
  if (!str) return null;
  const s = String(str).trim().replace(/\s*([\/\-.])\s*/g, '$1');
  const fixY = y => (y < 100 ? y + 2000 : y > 2400 ? y - 543 : y);
  const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  const monthOnly = (y, m) => (m >= 1 && m <= 12) ? iso(y, m, kind === 'exp' ? new Date(y, m, 0).getDate() : 1) : null;
  const yearLike = x => /^(20\d\d|25\d\d)$/.test(x);
  let mm;
  if (/^\d{8}$/.test(s)) return iso(fixY(+s.slice(4)), +s.slice(2, 4), +s.slice(0, 2));
  if (/^\d{6}$/.test(s)) {
    if (yearLike(s.slice(2)) && +s.slice(0, 2) >= 1 && +s.slice(0, 2) <= 12) return monthOnly(fixY(+s.slice(2)), +s.slice(0, 2));
    return iso(fixY(+s.slice(4)), +s.slice(2, 4), +s.slice(0, 2));
  }
  if ((mm = s.match(/^(\d{1,2})[\/\-.](\d{4})$/))) return monthOnly(fixY(+mm[2]), +mm[1]);
  if ((mm = s.match(/^(\d{1,2})[\/\-.](\d{2})$/))) return monthOnly(fixY(+mm[2]), +mm[1]);
  if ((mm = s.match(/^([A-Za-z]{3,9})\.?[\s\-\/.,]*(\d{2,4})$/)) && _QC_MONTHS[mm[1].toLowerCase().slice(0, 3)]) return monthOnly(fixY(+mm[2]), _QC_MONTHS[mm[1].toLowerCase().slice(0, 3)]);
  return _qcParseDateBase(s);
}
function _qcParseDateBase(str) {
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

// psm: '3' = อัตโนมัติ (ค่าเริ่มต้น) · '6' = บล็อกข้อความเดียว (เหมาะกับตาราง: อ่านเป็นบรรทัดตามแถว) — ทั้งคู่เปิด preserve_interword_spaces
// เพื่อคงช่องว่างระหว่างคอลัมน์ (ตัวแยกตารางใช้ช่องว่าง ≥2 เป็นขอบคอลัมน์)
async function _qcOcrCanvas(canvas, label, psm) {
  await _qcLoadScript(QC_TESS_SRC);
  const logger = m => {
    if (!m.status) return;
    _qcScanMsg(`<i class="fas fa-spinner fa-spin me-1"></i>${label} ${_qcEsc(m.status)}${m.progress != null ? ' ' + Math.round(m.progress * 100) + '%' : ''} <span class="text-muted">(ครั้งแรกต้องโหลดชุดภาษาไทย อาจใช้เวลาสักครู่)</span>`);
  };
  let worker = null;
  try {
    worker = await Tesseract.createWorker('tha+eng', 1, { logger });
    await worker.setParameters({ tessedit_pageseg_mode: psm || '3', preserve_interword_spaces: '1' });
    const r = await worker.recognize(canvas);
    return r.data.text || '';
  } catch (e) {
    console.warn('createWorker ไม่สำเร็จ ใช้ recognize ตรงๆ แทน', e);
    const r = await Tesseract.recognize(canvas, 'tha+eng', { logger });
    return r.data.text || '';
  } finally { try { if (worker) await worker.terminate(); } catch (e) {} }
}

// ทำภาพขาว-ดำแบบปรับตามความสว่างรอบจุด (adaptive threshold) — ช่วยรูปถ่ายกระดาษที่แสงไม่เท่ากัน/มีเงา (ใช้ในรอบอ่านซ้ำ)
function _qcBinarize(src) {
  const w = src.width, h = src.height, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = d[i * 4];                       // ภาพเป็นเกรย์แล้ว (R=G=B)
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) { let row = 0; for (let x = 1; x <= w; x++) { row += gray[(y - 1) * w + (x - 1)]; integral[y * (w + 1) + x] = integral[(y - 1) * (w + 1) + x] + row; } }
  const r = Math.max(12, Math.round(Math.min(w, h) / 40));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const sum = integral[(y1 + 1) * (w + 1) + x1 + 1] - integral[y0 * (w + 1) + x1 + 1] - integral[(y1 + 1) * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      const v = gray[y * w + x] < mean - 12 ? 0 : 255;
      const k = (y * w + x) * 4; d[k] = d[k + 1] = d[k + 2] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// outCanvases (ถ้าส่งมา): เก็บภาพของหน้าที่ต้อง OCR ไว้ให้รอบอ่านซ้ำ (PDF ที่มีตัวอักษรอยู่แล้วไม่ต้อง)
async function _qcReadPdf(file, outCanvases) {
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
      text += lines[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join('  ') + '\n';   // เว้น 2 ช่อง = ขอบคอลัมน์ (ตัวแยกตารางผลวิเคราะห์ใช้)
    });
  }
  if (text.replace(/\s/g, '').length > 80) return text;   // PDF มีตัวอักษรจริง
  text = '';                                              // PDF สแกน → render แล้ว OCR
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const pc = await _qcPrepCanvas(c);
    if (outCanvases) outCanvases.push(pc);
    text += (await _qcOcrCanvas(pc, `หน้า ${p}/${pages}`, '6')) + '\n';
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
  // วันผลิต/หมดอายุ: ป้าย Mfd/Mfg/Mfd.date/Production date/วันผลิต · Exp/Expiry/Best before/วันหมดอายุ
  // รูปแบบ dd/mm/yyyy, dd-mm-yy, ddmmyy, ddmmyyyy, mm/yyyy, mmyyyy, Oct 2026, 14 Oct 2028 (ดู _qcParseDate)
  f.mfg = _qcParseDate(grab(new RegExp(String.raw`(?:\bm[fkil1][dg]\b\.?|manufactur\w*|\bprod(?:uction)?\b\.?|date\s*of\s*manufacture|วันผลิต|ผลิตเมื่อ)\s*(?:date|dt\.?|on)?\s*[:.\-=]?\s*` + _QC_DATE_RE, 'i')), 'mfg');
  f.exp = _qcParseDate(grab(new RegExp(String.raw`(?:\bexp(?:iry|ire[sd]?|iration)?\b\.?|best\s*before|use\s*by|retest(?:\s*date)?|วันหมดอายุ|หมดอายุ)\s*(?:date|dt\.?|on)?\s*[:.\-=]?\s*` + _QC_DATE_RE, 'i')), 'exp');
  f.docNo = grab(/\b(?:coa|certificate|report|document|doc)\b\.?\s*(?:no\.?|number|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\-\/.]{2,})/i);
  // ชื่อสินค้า "ตามเอกสารของซัพ" (อาจไม่ตรงกับชื่อที่เราตั้งในระบบ) — เก็บไว้เทียบ/ทำข้อมูลชื่อจากซัพ
  f.product = (grab(/(?:product\s*name|name\s*of\s*(?:the\s*)?(?:product|material)|trade\s*name|commercial\s*name|inci\s*name|material\s*name|item\s*name|sample\s*name|product|material|item|sample|description|ชื่อสินค้า|ชื่อผลิตภัณฑ์|ชื่อวัตถุดิบ|ผลิตภัณฑ์)\s*[:\-]\s*([^\n]+)/i) || '').split(/\s{2,}|\|/)[0].trim().slice(0, 100) || null;
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

// ════════════════════════════════════════════════════
// ตารางผลวิเคราะห์ใน CoA: รายการทดสอบ · Spec (เกณฑ์ตามเอกสาร) · ผล → แถว {Parameter, SpecText, ResultText, Unit}
// ใช้ข้อความดิบ (SpecText/ResultText) เป็นหลัก แล้วคำนวณ min/max/ตัวเลข/ผ่านไม่ผ่านจากข้อความด้วย _qcEvalCoARow
// (ผู้ใช้แก้ข้อความในช่องได้ ค่าที่คำนวณจึงตามแก้ทันที) — parser เป็น heuristic ผู้ตรวจต้องทวนเสมอ
// ════════════════════════════════════════════════════
const _QC_UNIT_RE = /(cfu\s*\/\s*m?l|cfu\s*\/\s*g|mg\s*KOH\s*\/\s*g|meq\s*\/\s*kg|mg\s*\/\s*kg|g\s*\/\s*(?:ml|cm3|cm³)|mPa\s*[·.]?\s*s|ppm|ppb|cP|%|°\s*C)/i;
const _QC_BAD_RE = /(not\s*compl\w*|non[- ]?conform\w*|fail\w*|reject\w*|ไม่ผ่าน|ไม่ตรง)/i;
const _QC_OK_RE = /(match(?:es)?\s*(?:to\s*|with\s*)?(?:the\s*)?standard|meets?\s*(?:the\s*)?(?:standard|spec\w*)|within\s*(?:limit|spec\w*)|in\s*spec\w*|satisfactory|acceptable|not\s*detected|n\.?\s?d\.?(?![a-z])|negative|absent|complies|complying|conforms?|comply|pass(?:es|ed)?|ผ่าน|เป็นไปตาม(?:ข้อกำหนด)?|ตรงตาม|ไม่พบ|ปกติ)/i;
const _QC_POS_RE = /(positive|detected)/i;
const _QC_PARAM_START = /^(appearance|colou?r|odou?r|scent|fragrance|ph|specific\s*gravity|density|refractive\s*index|acid\s*value|peroxide\s*value|saponification\s*value|iodine\s*value|moisture|water\s*content|viscosity|melting\s*point|boiling\s*point|flash\s*point|heavy\s*metals?|lead|arsenic|mercury|cadmium|total\s*(?:plate|bacterial|viable)\s*count|yeast(?:\s*(?:and|&)\s*mou?ld[s]?)?|mou?ld[s]?|e\.?\s?coli|s\.?\s?aureus|p\.?\s?aeruginosa|c\.?\s?albicans|salmonella|assay|purity|solubility|ลักษณะ|สี|กลิ่น|ความถ่วงจำเพาะ|ความหนืด|ความชื้น|ค่ากรด|ค่าเปอร์ออกไซด์|โลหะหนัก|ตะกั่ว|สารหนู|ปรอท|แคดเมียม|จุลินทรีย์|ยีสต์และรา)(?![A-Za-z])/i;
const _QC_NOT_PARAM = /\b(date|lot|batch|no\.?|exp|mfg|page|tel|fax|doc|report|issued|tested|signed|certificate)\b/i;
const _QC_NUMTOK = String.raw`(?:[<>≤≥]=?\s*)?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)`;

function _qcNumStr(x) { x = String(x); return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x) ? x.replace(/,/g, '') : x.replace(',', '.'); }

// เกณฑ์ตัวเลขจากข้อความ Spec: ช่วง "5.5 - 7.0", เพดาน "< 1000"/"NMT 2"/"ไม่เกิน 2", พื้น "> 98"/"NLT 98"
function _qcParseSpecText(s) {
  s = String(s || '').trim();
  const N = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?)`;
  let m = s.match(new RegExp(N + String.raw`\s*(?:-|–|—|~|to|ถึง)\s*` + N, 'i'));
  if (m) return { min: +_qcNumStr(m[1]), max: +_qcNumStr(m[2]) };
  m = s.match(new RegExp(String.raw`(?:<=?|≤|NMT|max(?:imum)?\.?|not\s*more\s*than|ไม่เกิน)\s*` + N, 'i'));
  if (m) return { min: null, max: +_qcNumStr(m[1]) };
  m = s.match(new RegExp(String.raw`(?:>=?|≥|NLT|min(?:imum)?\.?|not\s*less\s*than|ไม่น้อยกว่า)\s*` + N, 'i'));
  if (m) return { min: +_qcNumStr(m[1]), max: null };
  return { min: null, max: null };
}

// ประเมินแถว: ผลเป็นตัวเลข+มีเกณฑ์ตัวเลข → เทียบช่วง; ไม่งั้นดูคำ (Complies/Pass/Negative = ผ่าน, Fail/Not comply = ไม่ผ่าน, Positive/Detected = ไม่ผ่าน)
function _qcEvalCoARow(row) {
  const sp = _qcParseSpecText(row.SpecText), rt = String(row.ResultText || '').trim();
  const nm = rt.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/);
  const num = nm && !/^[A-Za-z]{2,}/.test(rt) ? +_qcNumStr(nm[0]) : null;
  let pass = null;
  if (num != null && (sp.min != null || sp.max != null)) pass = !(sp.min != null && num < sp.min) && !(sp.max != null && num > sp.max);
  else if (_qcStrip(rt) && _QC_BAD_RE.test(rt)) pass = false;
  else if (_QC_OK_RE.test(rt)) pass = true;
  else if (_QC_POS_RE.test(rt)) pass = false;
  else if (sp.min == null && sp.max == null && rt) {
    // เกณฑ์เป็นข้อความ: ผลเขียนซ้ำเกณฑ์เดียวกัน (เช่น Spec "Yellow" / ผล "Yellow") = ผ่าน; ต่างกัน = ประเมินเองไม่ได้ (ให้คนตัดสิน)
    const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9ก-๛]/g, '');
    if (norm(row.SpecText) && norm(row.SpecText) === norm(rt)) pass = true;
  }
  return { min: sp.min, max: sp.max, num, pass };
}
function _qcStrip(s) { return String(s || '').trim(); }

function _qcPickResult(after) {
  const m = after.match(new RegExp(_QC_NUMTOK));
  if (m) return m[0].replace(/\s+/g, '');
  let last = null; const rx = new RegExp(_QC_OK_RE.source + '|' + _QC_BAD_RE.source + '|' + _QC_POS_RE.source, 'ig'); let k;
  while ((k = rx.exec(after))) last = k[0];
  return last || '';
}

// ── ตารางแบบมีหัวคอลัมน์ เช่น  Test Parameters | Specification | Method | Result | Reference ──
// หาแถวหัวตาราง (มีคำว่า Specification และ Result) → เรียงคอลัมน์ตามลำดับที่เจอ → แถวถัดไปแยกเป็นช่องด้วย "|" หรือช่องว่าง ≥2
// ถ้า OCR ทำช่องติดกัน (เช่น "Color Yellow", "5-500 Viscometer") แยกซ้ำด้วยเลขอ้างอิง (QCW-07-00) / คำชื่อวิธีตรวจ / คำชื่อรายการ
const _QC_REF_RE = /^[A-Za-z]{2,6}\s?-?\s?\d{2,4}(?:\s?-\s?\d{1,3})*$/;
const _QC_METHOD_RE = /\b(visual(?:\s*(?:of|to)?\s*standard)?|smell|odou?r\s*test|[a-z]*\s?viscometer|refractometer|ph\s*meter|[a-z]*meter|titration|hplc|gc(?:-ms)?|balance|observation|sensory|organoleptic|microscop\w*|culture|plate\s*count)\b/i;
function _qcParseCoAColumns(lines) {
  let hi = -1, cols = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/specif/i.test(l) && /result/i.test(l)) {
      const pos = [['name', l.search(/test\s*param\w*|test\s*item|parameter|item|รายการ/i)], ['spec', l.search(/specif\w*|standard\s*limit|limit/i)],
        ['method', l.search(/method|วิธี/i)], ['result', l.search(/result|ผล/i)], ['ref', l.search(/refer\w*|ref\./i)]].filter(p => p[1] >= 0).sort((a, b) => a[1] - b[1]);
      if (pos.length >= 3) { hi = i; cols = pos.map(p => p[0]); break; }
    }
  }
  if (hi < 0) return [];
  const rows = [], seen = new Set();
  for (let i = hi + 1; i < lines.length && rows.length < 40; i++) {
    const raw = lines[i];
    if (/^\W*(\*|analysis\s*by|approved\s*by|\(miss|\(mr|note|remark)/i.test(raw) || /quality\s*(control|assurance)/i.test(raw)) break;   // จบตาราง
    let cells = raw.split(/\s*\|\s*|\s{2,}/).map(c => c.trim()).filter(c => c && !/^[-—_=.~I]+$/.test(c));
    if (cells.length < 2) continue;
    let ref = '', method = '';
    if (cols.includes('ref') && _QC_REF_RE.test(cells[cells.length - 1])) ref = cells.pop();
    else if (_QC_REF_RE.test(cells[cells.length - 1]) && /\d/.test(cells[cells.length - 1]) && /^[A-Z]{2,6}/.test(cells[cells.length - 1])) ref = cells.pop();
    if (cols.includes('method')) {
      for (let k = 1; k < cells.length; k++) {
        const mm = cells[k].match(_QC_METHOD_RE);
        if (!mm) continue;
        const before = cells[k].slice(0, mm.index).trim(), after = cells[k].slice(mm.index).trim();
        if (before) { cells.splice(k, 1, before, after); k++; }        // "5-500 Viscometer" → spec + method
        method = cells[k]; cells.splice(k, 1); break;
      }
    }
    let name, spec = '', result = '';
    if (cells.length >= 3) { name = cells[0]; spec = cells[1]; result = cells.slice(2).join(' '); }
    else if (cells.length === 2) {                                      // "Color Yellow" + ผล → แยกชื่อรายการออกจากเกณฑ์
      const kw = cells[0].match(_QC_PARAM_START);
      if (kw) { name = kw[0]; let rest = cells[0].slice(kw[0].length); const q = rest.match(/^\s*(\([^)]*\)|@\s*\d+\s*°?\s*C?)/); if (q) { name += q[0]; rest = rest.slice(q[0].length); } spec = rest.trim(); }
      else { const w = cells[0].split(/\s+/); name = w[0]; spec = w.slice(1).join(' '); }
      result = cells[1];
    } else continue;
    name = name.replace(/\s+/g, ' ').replace(/[:.\s]+$/, '').trim();
    if (!spec.trim() || !result.trim()) continue;      // แถวจริงต้องมีทั้งเกณฑ์และผล — ตัดแถวขยะที่ OCR สร้างจากเส้นตาราง/ลายเซ็น
    if (!name || !/[A-Za-zก-ฮ]{3,}/.test(name) || _QC_NOT_PARAM.test(name) || seen.has(name.toLowerCase())) continue;   // ข้ามแถวขยะจาก OCR (เช่น "L", "EE")
    seen.add(name.toLowerCase());
    const unitM = (spec + ' ' + result).match(_QC_UNIT_RE);
    rows.push({ Parameter: name, SpecText: spec.replace(/\s+/g, ' ').trim(), ResultText: result.replace(/\s+/g, ' ').trim(), Unit: unitM ? unitM[0].replace(/\s+/g, '') : '', Method: method, RefNo: ref });
  }
  return rows;
}

function _qcParseCoATable(text) {
  const rows = [], seen = new Set();
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/\s{3,}/g, '  ').trim()).filter(Boolean);
  const colRows = _qcParseCoAColumns(String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean));
  if (colRows.length >= 2) return colRows;      // เจอหัวตารางและอ่านแถวได้ → ใช้แบบมีคอลัมน์
  for (let line of lines) {
    line = line.replace(/^\s*\d{1,2}\s*[.)]\s+/, '').replace(/\|/g, '  ');
    if (line.length < 4 || line.length > 220) continue;
    let name = null, rest = null;
    const kw = line.match(_QC_PARAM_START);
    // แถวที่ชื่อรายการไม่อยู่ในรายการคำที่รู้จัก แต่ลงท้ายด้วยผลแบบคำ เช่น "Odor  Characteristic  Complies"
    const tail = !kw && line.match(/^([A-Za-zก-๙][A-Za-zก-๙ .,&\/()%\-]{2,40}?)\s{2,}(.+?)\s+(complies|conforms?|pass(?:es)?|negative|absent|not\s*detected|ผ่าน|ตรงตาม)\s*$/i);
    if (tail && !_QC_NOT_PARAM.test(tail[1])) {
      const key0 = tail[1].trim().toLowerCase();
      if (!seen.has(key0)) { seen.add(key0); rows.push({ Parameter: tail[1].trim(), SpecText: tail[2].trim(), ResultText: tail[3].trim(), Unit: '' }); }
      continue;
    }
    if (kw) {
      name = kw[0]; rest = line.slice(kw[0].length);
      const q = rest.match(/^\s*(\([^)]*\)|@\s*\d+\s*°?\s*C?)/);       // (25°C) / @25°C / (cfu/g)
      if (q) { name += q[0]; rest = rest.slice(q[0].length); }
    } else {
      const g = line.match(/^([A-Za-zก-๙][A-Za-zก-๙ .,&\/()%\-]{2,45}?)\s+(?=[<>≤≥]|\d)/);
      if (!g || _QC_NOT_PARAM.test(g[1])) continue;
      name = g[1]; rest = line.slice(g[0].length);
      if (!/\d\s*(?:-|–|—|~|to)\s*\d|[<>≤≥]/i.test(rest)) continue;    // ไม่ใช่แถวตาราง (ต้องมีเกณฑ์ช่วง/เปรียบเทียบ)
      if (!new RegExp(_QC_NUMTOK).test(rest.replace(/\d+(?:[.,]\d+)?\s*(?:-|–|—|~|to)\s*\d+(?:[.,]\d+)?/i, ''))) continue;
    }
    name = name.replace(/\s+/g, ' ').replace(/[:.\s]+$/, '').trim();
    rest = rest.replace(/^[\s:.\-–]+/, '');
    const unitM = rest.match(_QC_UNIT_RE);
    const unit = unitM ? unitM[0].replace(/\s+/g, '') : '';
    let spec = '', result = '', m;
    if ((m = rest.match(/(\d+(?:[.,]\d+)?\s*(?:-|–|—|~|to|ถึง)\s*\d+(?:[.,]\d+)?)/i))) {
      spec = m[1]; result = _qcPickResult(rest.slice(m.index + m[0].length));
    } else if ((m = rest.match(/((?:not\s*more\s*than|not\s*less\s*than|<=?|≤|>=?|≥|NMT|NLT|max\.?|min\.?|ไม่เกิน|ไม่น้อยกว่า)\s*\d+(?:[.,]\d+)?)/i))) {
      spec = m[1]; result = _qcPickResult(rest.slice(m.index + m[0].length));
    } else {
      let last = null; const rx = new RegExp(_QC_OK_RE.source + '|' + _QC_BAD_RE.source + '|' + _QC_POS_RE.source, 'ig'); let k;
      while ((k = rx.exec(rest))) last = { w: k[0], i: k.index };
      if (last) { result = last.w; spec = rest.slice(0, last.i).trim(); }
      else {
        const nums = [...rest.matchAll(new RegExp(_QC_NUMTOK, 'g'))];
        if (nums.length) { const lastN = nums[nums.length - 1]; result = lastN[0].replace(/\s+/g, ''); spec = rest.slice(0, lastN.index).trim(); }
        else {
          // ข้อความล้วน เช่น "Pale yellow  Pale yellow" (เกณฑ์ = ผล ซ้ำกัน) → แบ่งครึ่ง
          const w = rest.trim().split(/\s+/), h = w.length / 2;
          if (w.length >= 2 && w.length % 2 === 0 && w.slice(0, h).join(' ').toLowerCase() === w.slice(h).join(' ').toLowerCase()) { spec = w.slice(0, h).join(' '); result = w.slice(h).join(' '); }
          else spec = rest.trim();
        }
      }
    }
    if (!spec && !result) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ Parameter: name, SpecText: spec.replace(/\s+/g, ' ').trim(), ResultText: result, Unit: unit });
    if (rows.length >= 40) break;
  }
  return rows;
}
