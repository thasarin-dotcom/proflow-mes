// ════════════════════════════════════════════════════════════════════════════
// ProFlow Wise MES — หน้า "ผังโรงงานเรียลไทม์" (Floor Pulse) แยกออกจาก index.html (2026-10-18)
// ไฟล์นี้ต้องอัปโหลดคู่กับ index.html เสมอ (โหลดด้วย <script src="floorpulse.js?v=..."> ต่อจากสคริปต์หลัก)
// เปลี่ยนไฟล์นี้เมื่อไหร่ ให้เลื่อนเลข ?v= ใน index.html ด้วย ไม่งั้นเบราว์เซอร์อาจใช้ไฟล์เก่าในแคช
// ใช้ตัวแปร/ฟังก์ชันของสคริปต์หลักได้ตรงๆ (global เดียวกัน) เช่น _sb, PLAN_LINES, _whLineStatus, _planEmployees,
// loadProdStatusData, _prodStatus* — ส่วนตัวช่วยเลือกห้องแพ็คของหน้าสแกน (FP_PACK_ROOM_OPTIONS, _fpIsPackLine,
// _fpRoomPickerHTML, _fpPickedRoom, _fpPackRoomLabel) ยังอยู่ใน index.html ตั้งใจ — หน้าสแกน QR ต้องใช้ได้
// แม้ไฟล์นี้โหลดไม่สำเร็จ
// ════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════
// หน้า "ผังโรงงานเรียลไทม์" (#page-floorpulse) — ผังห้อง SVG ทับสถานะไลน์ผลิตสด ต่อยอดจาก
// _whLineStatus/PLAN_LINES ข้างบนตรงๆ (ไม่ query ซ้ำ) + production_labor_log สำหรับ "ใครอยู่ไลน์นี้
// ตอนนี้" (ยืนยันกับผู้ใช้แล้ว: ใช้ WorkerCodes ในแผนเป็น fallback ถ้ายังไม่มีคนสแกนเข้าเลยวันนี้)
// พิกัดห้องแปลงจากระยะจริงในแปลนสถาปนิก (ชั้น 3 บลูมมิ่ง) scale ~34px/ม. — เป็นผังเวกเตอร์จำลอง
// สัดส่วนจริง ไม่ใช่รูปสแกนแปลนจริง (เครื่องนี้ไม่มีตัวแปลง PDF→รูปภาพ ยืนยันแนวทางนี้กับผู้ใช้แล้ว
// 2026-09-13 — ถ้าต้องการเปลี่ยนเป็นรูปจริงทีหลัง แค่แทน svg rect ด้วย <image> เดียว ไม่กระทบส่วนอื่น)
// ══════════════════════════════════════════════════════════════════════════

// ห้อง "บรรจุหีบห่อ" ห้องเดียวแบ่ง 5 สถานี (ยืนยันกับผู้ใช้แล้ว): 4 ไลน์แพ็ค + ยิง Lot
const FP_PACK_SUBLINES = [
  { key: 'pack-mix',    label: 'แพ็ค-ผสมใหญ่',   line: 'ห้องแพ็ค (ห้องผสมใหญ่)' },
  { key: 'pack-lotion', label: 'แพ็ค-ครีมโลชั่น', line: 'ห้องแพ็ค (ห้องบรรจุครีมโลชั่น)' },
  { key: 'pack-sham',   label: 'แพ็ค-แชมพู',     line: 'ห้องแพ็ค (ห้องบรรจุแชมพูครีมอาบน้ำ)' },
  { key: 'pack-aroma',  label: 'แพ็ค-อโรม่า',    line: 'ห้องแพ็ค (ห้องบรรจุน้ำมัน Aroma)' },
  { key: 'lot',         label: 'ยิง Lot',        line: 'ยิง Lot' },
];

// ห้องเดี่ยวที่ผูกกับ 1 ไลน์ใน PLAN_LINES ตรงๆ (ห้องที่ไม่อยู่ในนี้ = ไม่ผูกไลน์ ดู FP_ROOM_NOTE)
const FP_ROOM_LINE = {
  mixall:     'ห้องผสมใหญ่',
  filllotion: 'ห้องบรรจุครีมโลชั่น',
  fillsh:     'ห้องบรรจุแชมพูครีมอาบน้ำ',
  filloil:    'ห้องบรรจุน้ำมัน Aroma',
};

// หมายเหตุห้องที่ไม่มีไลน์ผูก (คลัง/สนับสนุน) — "ห้องผสมน้ำมัน(อโรม่า)" ยืนยันแล้วว่าอยู่กลุ่มนี้ด้วย
// แม้อยู่ติดห้องบรรจุน้ำมัน เพราะ PLAN_LINES ไม่มีไลน์แยกให้ขั้นตอนผสม (ห้ามเดาว่าใช้ข้อมูลร่วมกัน)
const FP_ROOM_NOTE = {
  prep:    'พื้นที่จัดเก็บวัตถุดิบ/บรรจุภัณฑ์ก่อนเบิกเข้าสายผลิต (FG/RM/PM)',
  bulk:    'จุดพัก Bulk เครื่องสำอางรอก่อนส่งเข้าไลน์บรรจุ',
  mixoil:  'ขั้นผสมน้ำมันหอมระเหยก่อนส่งต่อห้องบรรจุ — ระบบยังไม่มีไลน์แยกติดตามขั้นตอนนี้',
  fgstore: 'จุดพักสินค้าสำเร็จรูปก่อนส่งต่อคลังกลาง',
  locker:  'พื้นที่เปลี่ยนชุด/ล็อกเกอร์พนักงานก่อนเข้าสายผลิต',
  qc:      'ตรวจสอบคุณภาพ (COA) ของล็อตผลิต — ยังไม่ผูกกับข้อมูลไลน์ผลิตในเดโมนี้',
  samples: 'อ้างอิง/เก็บกันตัวอย่างเครื่องสำอาง แยกจากห้องทดสอบคุณภาพ',
  wash:    'ล้างและเก็บอุปกรณ์การผลิต — เข้าทางช่องทางเดินระหว่างห้อง QC กับห้องเก็บตัวอย่าง',
};

// พิกัดห้องวัดจากแบบแปลนสถาปนิกจริง (ชั้น 3 โซนเครื่องสำอาง) ทั้งหมด 2026-10-17 — สเกลเดียวทั้งผัง
// ~32.4 px/ม. (ไม่ยืดรายแถวแบบเดิมอีกแล้ว เพราะความกว้างจริงของโซนพอดีกรอบอยู่แล้ว) ตัวเลขความกว้าง/ลึก
// ตรงกับเลขบอกระยะในแบบ (เช่น ชั่งสาร 2.00, Bulk 2.50, หีบห่อ 4.53, ทางเดินหลัก 2.00, แถวล่าง 7.13/4.00/
// 11.36 ม.) — ผังจริงมี "ทางเดินหลัก" คั่นกลางระหว่างแถวบนกับแถวกลาง ห้องแถวบนทุกห้องเปิดประตูลงทางเดินนี้
// ส่วนห้องบรรจุแชมพู/ครีม และห้องผสมรวม เข้าออกผ่านช่องทางเดินย่อยระหว่างห้องบรรจุ 2 ห้อง (ดู FP_WALKWAYS/
// FP_DOORS) ทิศทาง: ซ้าย = ฝั่งลิฟต์/บันได (ตะวันตก), ขวาสุด = ผนังติดโซนลูกประคบ (ไม่มีประตูทะลุ)
const FP_VIEW = { w: 800, h: 460 };
const FP_GEOM = {
  prep:       { x:125, y:40,  w:146, h:123 },
  weigh:      { x:271, y:40,  w:67,  h:123 },
  bulk:       { x:338, y:40,  w:81,  h:123 },
  packbox:    { x:419, y:40,  w:147, h:123 },  // แบ่ง 5 สถานีข้างใน (FP_PACK_SUBLINES)
  mixoil:     { x:566, y:40,  w:98,  h:123 },  // ไม่ผูกไลน์ (ดู FP_ROOM_NOTE)
  filloil:    { x:664, y:40,  w:96,  h:123 },
  locker:     { x:125, y:228, w:146, h:114 },
  qc:         { x:271, y:228, w:78,  h:89 },
  samples:    { x:401, y:228, w:67,  h:89 },
  fillsh:     { x:468, y:228, w:120, h:89 },
  filllotion: { x:653, y:228, w:107, h:89 },
  fgstore:    { x:40,  y:342, w:231, h:77 },
  wash:       { x:271, y:317, w:130, h:102 },
  mixall:     { x:401, y:317, w:359, h:102 },
};

// ทางเดิน/โถง (ไม่ใช่ห้อง คลิกไม่ได้ ไม่ผูกไลน์) — ใช้วาดทั้ง 2D และ 3D
const FP_WALKWAYS = [
  { key: 'hall',     x:40,  y:163, w:85,  h:179, label: 'โถงลิฟต์/บันได', ly: 229 },  // ly: ป้ายไม่ทับลูกศรทางเข้า
  { key: 'al',       x:125, y:163, w:106, h:65,  label: 'A/L สินค้าเข้า' },
  { key: 'corridor', x:231, y:163, w:529, h:65,  label: 'ทางเดินหลัก' },
  { key: 'washpass', x:349, y:228, w:52,  h:89,  label: 'ทางเข้าห้องล้าง', vertical: true },
  { key: 'fillpass', x:588, y:228, w:65,  h:89,  label: 'ทางเดินบรรจุ/ผสม', vertical: true },
];

// ประตู: จุดกึ่งกลางบนแนวผนัง (x,y) + แนวผนัง ('h' = ผนังแนวนอน, 'v' = ผนังแนวตั้ง) + ความกว้างช่องประตู (px)
// ตำแหน่งอ่านจากสัญลักษณ์บานเปิด/ลูกศรในแบบแปลนจริง
const FP_DOORS = [
  { x:151, y:163, o:'h', w:28 },  // เตรียมวัตถุดิบ ↔ A/L สินค้าเข้า
  { x:246, y:163, o:'h', w:28 },  // เตรียมวัตถุดิบ ↔ ทางเดินหลัก
  { x:296, y:163, o:'h', w:28 },  // ชั่งสาร
  { x:363, y:163, o:'h', w:28 },  // เก็บ Bulk
  { x:445, y:163, o:'h', w:28 },  // บรรจุหีบห่อ
  { x:591, y:163, o:'h', w:28 },  // ผสมน้ำมัน
  { x:689, y:163, o:'h', w:28 },  // บรรจุน้ำมัน
  { x:127, y:196, o:'v', w:50 },  // A/L ประตูคู่ฝั่งลิฟต์ขนของ (ทางสินค้าเข้า)
  { x:231, y:196, o:'v', w:50 },  // A/L ประตูคู่ ↔ ทางเดินหลัก
  { x:218, y:228, o:'h', w:28 },  // Locker → ทางเดินหลัก (ทางออกหลังเปลี่ยนชุด)
  { x:125, y:314, o:'v', w:28 },  // Locker ← โถงลิฟต์ (ทางพนักงานเข้า)
  { x:326, y:228, o:'h', w:28 },  // ทดสอบคุณภาพ
  { x:425, y:228, o:'h', w:28 },  // เก็บตัวอย่าง
  { x:356, y:317, o:'h', w:28 },  // ห้องล้าง/เก็บอุปกรณ์ ↔ ช่องทางเดิน
  { x:612, y:228, o:'h', w:28 },  // ทางเดินบรรจุ/ผสม ↔ ทางเดินหลัก
  { x:588, y:290, o:'v', w:28 },  // บรรจุแชมพู ↔ ทางเดินบรรจุ/ผสม
  { x:653, y:253, o:'v', w:28 },  // บรรจุครีม/โลชั่น ↔ ทางเดินบรรจุ/ผสม
  { x:627, y:317, o:'h', w:28 },  // ผสมรวม ↔ ทางเดินบรรจุ/ผสม
  { x:98,  y:342, o:'h', w:34 },  // คลังสำเร็จรูป ↔ โถงลิฟต์ (FG ออก)
];

// ทางเข้า-ออกของโซน (ลูกศรบนผัง) — dx/dy = ทิศลูกศร
const FP_ENTRANCES = [
  { x:62, y:196, dx:1,  dy:0, label: 'สินค้าเข้า' },
  { x:62, y:262, dx:-1, dy:0, label: 'FG ออก' },     // ออกจากคลังสำเร็จรูปขึ้นโถง แล้วไปลิฟต์ขนของ
  { x:96, y:314, dx:1,  dy:0, label: 'พนักงานเข้า' },
];

const FP_ROOM_LABEL = {
  prep: 'เตรียมวัตถุดิบ', weigh: 'ห้องชั่งสาร', bulk: 'เก็บ Bulk', packbox: 'บรรจุหีบห่อ',
  mixoil: 'ผสมน้ำมัน (อโรม่า)', filloil: 'บรรจุน้ำมัน (อโรม่า)', locker: 'Locker',
  qc: 'ทดสอบคุณภาพ', samples: 'เก็บตัวอย่าง', fillsh: 'บรรจุแชมพู', filllotion: 'บรรจุครีม/โลชั่น',
  fgstore: 'คลังสำเร็จรูป', wash: 'ห้องล้าง/อุปกรณ์', mixall: 'ผสมรวม',
};
const FP_ROOM_FULL = {
  prep: 'ห้องเก็บสินค้าสำหรับเตรียมการผลิต (FG/RM/PM)', weigh: 'ห้องชั่งสาร',
  bulk: 'ห้องเก็บ Bulk เครื่องสำอางรอบรรจุ', packbox: 'ห้องบรรจุหีบห่อ',
  mixoil: 'ห้องผสมน้ำมัน (อโรม่า)', filloil: 'ห้องบรรจุน้ำมัน (อโรม่า)',
  locker: 'ห้องสวมชุดปฏิบัติงาน / Locker', qc: 'ห้องทดสอบคุณภาพ (QC)',
  samples: 'ห้องเก็บตัวอย่างเครื่องสำอาง', fillsh: 'ห้องบรรจุแชมพู/ครีมนวด/เจลอาบน้ำ',
  filllotion: 'ห้องบรรจุครีม/โลชั่น/สครับขัดผิว', fgstore: 'ห้องเก็บเครื่องสำอางสำเร็จรูป',
  wash: 'ห้องล้าง/เก็บอุปกรณ์',
  mixall: 'ห้องผสมแชมพู/ผสมครีม/โลชั่น/ครีมนวด/เจลอาบน้ำ/สครับขัดผิว',
};


// ห้องที่ไลน์แพ็คนี้ใช้จริงตอนนี้ (จาก Room ของแถวสแกนล่าสุดของงานปัจจุบัน) — null = ห้องปกติ (สถานีในห้อง
// บรรจุหีบห่อ) ใช้ทั้งผัง 2D/3D, แผงรายละเอียด และเส้นโฟลงาน
function _fpPackRoomFor(line, moRef) {
  if (!moRef || !_fpIsPackLine(line)) return null;
  const prog = _prodStatusProgressData[`${moRef}|${line}`];
  const room = prog && prog.Room;
  return room && room !== 'packbox' && FP_GEOM[room] ? room : null;
}
function _fpPackLineRoom(line) {
  const r = _fpData[line];
  if (!r || r.status === 'idle' || !r.item) return null;
  return _fpPackRoomFor(line, r.item.MO_Ref);
}
// ไลน์แพ็คที่ย้ายมาใช้ห้องนี้ (ชั่งสาร/Bulk/ผสมน้ำมัน) — หลายไลน์มาห้องเดียวกัน เอาไลน์ที่กำลังทำก่อน
function _fpHostedLine(roomId) {
  if (FP_ROOM_LINE[roomId]) return null;
  const lines = FP_PACK_SUBLINES.map(s => s.line).filter(l => _fpPackLineRoom(l) === roomId);
  return lines.find(l => ['running', 'behind'].includes(_fpData[l].status)) || lines[0] || null;
}
function _fpPackSubLabel(line) { return (FP_PACK_SUBLINES.find(s => s.line === line) || {}).label || line; }

let _fpData = {};       // line name (PLAN_LINES) -> _whLineStatus() + .roster (+ .eta/.alerts) — ระหว่างย้อนดู = snapshot ณ เวลานั้น
let _fpLiveData = {};   // ข้อมูลสดรอบล่าสุด (เก็บไว้ตอนย้อนดู _fpData ถูกแทนด้วย snapshot)
let _fpLaborRowsByLine = {};   // production_labor_log วันนี้ แยกตามไลน์ (เวลาเข้า-ออกของพนักงาน)
let _fpReplayAt = null;        // Date ที่กำลังย้อนดูอยู่ / null = ดูสด
let _fpReplayTimer = null;     // interval ตอนกดเล่นย้อนหลัง
let _fpTvMode = false;         // โหมดจอทีวี (เต็มจอ + กล้อง 3D หมุนเอง)
let _fpSelectedPerson = null;  // EmployeeCode ที่เปิดรายละเอียดอยู่ในแผงขวา
let _fpHoldStock = [];  // hold_stock rows (DEFECT+RETAIN, QtyBalance>0) โชว์ในห้องเก็บตัวอย่าง (ยืนยันกับผู้ใช้แล้ว 2026-09-14 ว่าเอาทั้ง 2 ประเภทมารวมกัน)
let _fpInterval = null;
let _fpSelectedId = null;

function _fpStatusMeta(status) {
  return {
    running: { label: 'กำลังผลิต',    cls: 'fp-status-running' },
    behind:  { label: 'ล่าช้ากว่าแผน', cls: 'fp-status-behind' },
    done:    { label: 'เสร็จตามแผน',  cls: 'fp-status-done' },
    idle:    { label: 'ว่าง/รอคิว',   cls: 'fp-status-idle' },
  }[status] || { label: status, cls: 'fp-status-idle' };
}

// รวมรายชื่อคนของ 1 ไลน์วันนี้: คนตามแผน (WorkerCodes) + คนที่มีแถวสแกนจริง (production_labor_log)
// แนวทางเดียวกับ scanlaborLoad() ข้างบน แค่ scope เป็น "ต่อไลน์/วันนี้" แทน "ต่อ MO เดียว"
function _fpBuildRoster(line, planItem, laborRowsByLine) {
  const planCodes = planItem && planItem.WorkerCodes
    ? planItem.WorkerCodes.split(',').map(x => x.trim()).filter(Boolean) : [];
  const laborRows = laborRowsByLine[line] || [];
  const laborByCode = new Map(laborRows.map(r => [r.EmployeeCode, r]));
  const codes = [...new Set([...planCodes, ...laborByCode.keys()])];
  return codes.map(code => {
    const emp = _planEmployees.find(e => e.EmployeeCode === code);
    const row = laborByCode.get(code);
    const confirmed = !!(row && row.TimeIn && !row.TimeOut); // สแกนเข้าแล้วและยังไม่สแกนออก = อยู่จริงตอนนี้
    return { code, name: emp ? (emp.NickName || emp.FirstName || code) : code, confirmed, line,
      gender: emp && (emp.Gender === 'F' || emp.Gender === 'M') ? emp.Gender : null,
      timeIn: row ? row.TimeIn || null : null, timeOut: row ? row.TimeOut || null : null };
  });
}

// สรุปพนักงานทั้งหมด (ยืนยันกับผู้ใช้แล้ว 2026-09-20 ว่าอยากเห็นว่าใครทำอะไรอยู่/ว่างกี่คน) — ไล่ทุกไลน์ใน
// PLAN_LINES (รวม 5 สถานีในห้องบรรจุหีบห่อ เพราะเป็นไลน์แยกกันใน PLAN_LINES อยู่แล้ว) หาว่าพนักงานแต่ละคน
// "สแกนเข้าแล้ว" อยู่ไลน์ไหน (ให้ความสำคัญสูงสุด) รองลงมาคือ "อยู่ในแผนแต่ยังไม่สแกน" ที่เหลือถือว่า "ว่าง"
function _fpBuildStaffOverview() {
  const workingLine = {}, plannedLine = {};
  PLAN_LINES.forEach(line => {
    const r = _fpData[line];
    (r && r.roster || []).forEach(p => {
      if (p.confirmed) { if (!workingLine[p.code]) workingLine[p.code] = line; }
      else if (!plannedLine[p.code]) plannedLine[p.code] = line;
    });
  });
  return _planEmployees.map(emp => {
    const code = emp.EmployeeCode;
    const name = emp.NickName || emp.FirstName || code;
    if (workingLine[code]) return { code, name, status: 'working', line: workingLine[code] };
    if (plannedLine[code]) return { code, name, status: 'planned', line: plannedLine[code] };
    return { code, name, status: 'idle', line: null };
  });
}

async function loadFloorPulseData() {
  await Promise.all([ loadProdStatusData(), _planLoadSkillData() ]);

  const todayStr = _planWeekLocalDateStr(new Date());
  const [laborRes, holdRes] = await Promise.all([
    _sb.from('production_labor_log').select('Line,EmployeeCode,TimeIn,TimeOut').eq('WorkDate', todayStr),
    _sb.from('hold_stock').select('HoldType,ItemType,ItemCode,ItemName,Lot,UOM,QtyBalance').gt('QtyBalance', 0),
  ]);
  const laborRowsByLine = {};
  (laborRes.data || []).forEach(row => {
    if (!laborRowsByLine[row.Line]) laborRowsByLine[row.Line] = [];
    laborRowsByLine[row.Line].push(row);
  });
  _fpLaborRowsByLine = laborRowsByLine;
  _fpHoldStock = holdRes.data || [];

  _fpData = {};
  PLAN_LINES.forEach(line => {
    const r = _whLineStatus(line);
    r.roster = _fpBuildRoster(line, r.item, laborRowsByLine);

    // เติมยอดสแกนสด (production_progress) ทับเข้าไปเฉพาะงานที่ "ยังไม่เสร็จ" และยังไม่มีผลจริงอย่างเป็น
    // ทางการ — _whLineStatus เช็ค MO ปิดงาน (ปกติ/force-close) ไว้แล้วในตัว (r.status==='done') ไม่ต้อง
    // เช็คซ้ำที่นี่อีก กันงานที่ปิดไปแล้วโดนยอดสแกนเก่าทับสถานะกลับไปเป็น running/behind ผิดๆ
    if (r.status !== 'done' && r.item && r.actual == null) {
      const liveProg = r.item.MO_Ref ? _prodStatusProgressData[`${r.item.MO_Ref}|${line}`] : null;
      if (liveProg) {
        const liveQty = parseFloat(liveProg.Qty) || 0;
        const target = (r.mo && parseFloat(r.mo.OrderQty)) || r.planned;
        r.actual = liveQty;
        r.planned = target;
        r.pct = target > 0 ? Math.round(liveQty / target * 100) : 0;
        r.status = liveQty >= target ? 'done' : (r.pct < 70 ? 'behind' : 'running');
        r.isLiveScan = true; // บอกใน UI ว่าเลขนี้มาจากสแกนสด ยังไม่ใช่ผลจริงที่ยืนยันอย่างเป็นทางการ
      }
    }

    r.eta = _fpComputeEta(line, r);
    r.alerts = _fpComputeAlerts(line, r);
    _fpData[line] = r;
  });
  _fpLiveData = _fpData;
  if (_fpReplayAt) _fpData = _fpSnapshotAt(_fpReplayAt);   // กำลังย้อนดูอยู่ — รีเฟรชข้อมูลสดเบื้องหลังแต่ยังแสดงเวลาที่เลือก

  _fpRender();
  _fpStartAutoRefresh();
}

// ── เครื่องมือเวลา ── เวลาใน production_plan/production_labor_log เป็นข้อความ 'HH:MM' หรือ 'HH:MM:SS'
function _fpTimeOnDate(dateStr, hm) {
  if (!dateStr || !hm) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = String(hm).split(':').map(Number);
  if ([y, m, d, hh].some(isNaN)) return null;
  return new Date(y, m - 1, d, hh, mm || 0, ss || 0);
}
function _fpHM(d) { return d ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'; }
// เวลาเสร็จโดยประมาณ — ถ้าไม่ใช่วันนี้ใส่วันที่ด้วย (กันอ่าน "08:26" ของพรุ่งนี้ผิดเป็นเช้าวันนี้)
function _fpEtaLabel(d) {
  if (!d) return '—';
  const n = new Date();
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? _fpHM(d) : `${d.getDate()}/${d.getMonth() + 1} ${_fpHM(d)}`;
}
function _fpDur(min) { return min >= 90 ? `${Math.floor(min / 60)} ชม. ${Math.round(min % 60)} นาที` : `${Math.round(min)} นาที`; }

// ── เวลาเสร็จโดยประมาณ (2026-10-18) ── จากความเร็วสแกนจริงของ (MO, ไลน์) นี้: เทียบสแกนล่าสุดกับสแกนเก่าสุดในช่วง
// 2 ชม.ก่อนหน้า (ต้องห่างกัน ≥10 นาทีและยอดเพิ่มขึ้น ไม่งั้นยังคำนวณไม่ได้ → null) แล้วฉายต่อไปจนถึงยอดเป้าหมาย —
// ใช้เฉพาะงานที่ยอดมาจากสแกนสด (isLiveScan) ยังไม่เสร็จ — late = คาดว่าเลยเวลาเลิกกะของแผน
function _fpComputeEta(line, r) {
  if (!r.item || !r.item.MO_Ref || !r.isLiveScan || r.status === 'done' || !(r.planned > 0)) return null;
  const hist = _prodStatusProgressHist[`${r.item.MO_Ref}|${line}`] || [];
  if (hist.length < 2) return null;
  const tLatest = new Date(hist[0].CreatedAt).getTime();
  const win = hist.filter(h => tLatest - new Date(h.CreatedAt).getTime() <= 2 * 3600e3);
  const oldest = win[win.length - 1];
  const dtMin = (tLatest - new Date(oldest.CreatedAt).getTime()) / 60000;
  const latestQty = parseFloat(hist[0].Qty) || 0;
  const dq = latestQty - (parseFloat(oldest.Qty) || 0);
  if (dtMin < 10 || dq <= 0) return null;
  const perMin = dq / dtMin;
  const eta = new Date(tLatest + Math.max(0, r.planned - latestQty) / perMin * 60000);
  const shiftEnd = _fpTimeOnDate(r.item.PlanDate, r.item.TimeEnd);
  return { eta, perHour: Math.round(perMin * 60), late: !!shiftEnd && eta > shiftEnd, shiftEnd };
}

// ── แจ้งเตือนข้อมูลไม่สอดคล้อง (2026-10-18) ── เฉพาะไลน์ที่มีงานค้างอยู่ (running/behind) — level danger = แดง, warn = ส้ม
function _fpComputeAlerts(line, r) {
  const out = [];
  if (!r.item || !(r.status === 'running' || r.status === 'behind')) return out;
  const now = new Date(), today = _planWeekLocalDateStr(now);
  if (r.item.PlanDate && r.item.PlanDate < today) {
    out.push({ level: 'warn', text: `งานค้างจากแผนวันที่ ${_fmtDate(r.item.PlanDate)}` });
  }
  const start = _fpTimeOnDate(r.item.PlanDate, r.item.TimeStart), end = _fpTimeOnDate(r.item.PlanDate, r.item.TimeEnd);
  const inShift = r.item.PlanDate === today && start && end && now >= start && now <= end;
  if (inShift) {
    const sinceStart = (now - start) / 60000;
    if (!r.roster.length) out.push({ level: 'warn', text: 'ไม่มีรายชื่อพนักงานในแผนของไลน์นี้' });
    else if (!r.roster.some(p => p.confirmed)) out.push({ level: 'warn', text: 'มีงานในแผน แต่ยังไม่มีใครสแกนเข้าไลน์' });
    const prog = r.item.MO_Ref ? _prodStatusProgressData[`${r.item.MO_Ref}|${line}`] : null;
    if (!prog) {
      if (sinceStart > 30) out.push({ level: 'danger', text: `เริ่มกะมาแล้ว ${_fpDur(sinceStart)} ยังไม่มีการสแกนยอด` });
    } else {
      const idle = (now - new Date(prog.CreatedAt)) / 60000;
      if (idle > 30 && sinceStart > 30) out.push({ level: 'warn', text: `ยอดไม่ขยับมา ${_fpDur(Math.min(idle, sinceStart))}` });
    }
  }
  if (r.eta && r.eta.late) out.push({ level: 'danger', text: `คาดว่าเสร็จ ${_fpEtaLabel(r.eta.eta)} เลยเวลาเลิกกะ (${_fpHM(r.eta.shiftEnd)})` });
  return out;
}
function _fpAlertLevel(alerts) {
  return !alerts || !alerts.length ? null : alerts.some(a => a.level === 'danger') ? 'danger' : 'warn';
}

// ── ย้อนดูทั้งวัน (2026-10-18) ── สร้างสถานะของทุกไลน์ "ณ เวลา T" จากข้อมูลที่โหลดไว้แล้ว (ไม่ query เพิ่ม):
// ยอด = สแกนล่าสุดที่ ≤ T, คนอยู่ไลน์ = สแกนเข้า ≤ T และยังไม่สแกนออก ณ T — งานที่ดูคืองานปัจจุบันของแต่ละไลน์
// (_fpLiveData) ไม่ย้อนไปหางานอื่นที่จบไปแล้วก่อนหน้านี้ของวันเดียวกัน ไม่มีแจ้งเตือน/ETA ระหว่างย้อนดู
function _fpSnapshotAt(T) {
  const today = _planWeekLocalDateStr(new Date());
  const snap = {};
  PLAN_LINES.forEach(line => {
    const live = _fpLiveData[line];
    if (!live || !live.item) { snap[line] = live; return; }
    const hist = live.item.MO_Ref ? (_prodStatusProgressHist[`${live.item.MO_Ref}|${line}`] || []) : [];
    const at = hist.find(h => new Date(h.CreatedAt) <= T);
    const qty = at ? (parseFloat(at.Qty) || 0) : null;
    const laborRows = _fpLaborRowsByLine[line] || [];
    const roster = (live.roster || []).map(p => {
      const row = laborRows.find(l => l.EmployeeCode === p.code);
      const tIn = row ? _fpTimeOnDate(today, row.TimeIn) : null, tOut = row ? _fpTimeOnDate(today, row.TimeOut) : null;
      return { ...p, confirmed: !!tIn && tIn <= T && (!tOut || tOut > T) };
    });
    const planned = live.planned || 0;
    const end = _fpTimeOnDate(live.item.PlanDate, live.item.TimeEnd);
    let status = 'idle';
    if (qty != null && planned > 0 && qty >= planned) status = 'done';
    else if (qty != null || roster.some(p => p.confirmed)) status = (end && T > end && planned > 0 && (qty || 0) / planned < 0.7) ? 'behind' : 'running';
    snap[line] = { ...live, status, actual: qty, pct: planned > 0 && qty != null ? Math.round(qty / planned * 100) : null,
      roster, alerts: [], eta: null, isLiveScan: true };
  });
  return snap;
}

// รีเฟรชทุก 60 วิ เฉพาะขณะหน้านี้ active เท่านั้น (ยืนยันกับผู้ใช้แล้ว) — เช็คคลาส active ทุก tick แทนการ
// พึ่ง hook "ออกจากหน้า" ที่ไม่มีอยู่ในระบบ showPage เดิม กัน query ค้างเมื่อสลับไปหน้าอื่น
function _fpStartAutoRefresh() {
  if (_fpInterval) clearInterval(_fpInterval);
  _fpInterval = setInterval(() => {
    const pageEl = document.getElementById('page-floorpulse');
    if (!pageEl || !pageEl.classList.contains('active')) { clearInterval(_fpInterval); _fpInterval = null; return; }
    if (document.hidden) return;   // ข้ามรอบเมื่อแท็บถูกซ่อน ลด log ingestion (2026-10-12)
    loadFloorPulseData();
  }, 60000);
}

function _fpRender() {
  const root = document.getElementById('fp-root');
  if (!root) return;
  root.innerHTML = `
    <div class="fp-stage">
      <div class="fp-topbar" id="fp-kpi-strip"></div>
      <div class="fp-main">
        <div class="fp-floor-wrap">
          <div class="fp-view-toggle" role="group" aria-label="มุมมองผัง">
            <button type="button" class="${_fpViewMode === '2d' ? 'active' : ''}" aria-pressed="${_fpViewMode === '2d'}" onclick="_fpSetViewMode('2d')">2D</button>
            <button type="button" class="${_fpViewMode === '3d' ? 'active' : ''}" aria-pressed="${_fpViewMode === '3d'}" onclick="_fpSetViewMode('3d')">3D</button>
          </div>
          <div class="fp-floor-tilt">
            ${_fpViewMode === '3d'
              ? '<div class="fp-3d" id="fp-3d"></div>'
              : `<svg class="fp-svg" viewBox="0 0 ${FP_VIEW.w} ${FP_VIEW.h}" xmlns="http://www.w3.org/2000/svg" id="fp-svg"></svg>`}
          </div>
        </div>
        <aside class="fp-drawer" id="fp-drawer"></aside>
      </div>
      ${_fpReplayBarHTML()}
      <section class="fp-staff-panel" id="fp-staff-panel" aria-label="พนักงานทั้งหมด"></section>
      <div class="fp-legend">
        <span><span class="fp-swatch" style="background:var(--fp-accent)"></span>กำลังผลิต</span>
        <span><span class="fp-swatch" style="background:var(--fp-accent-2)"></span>เสร็จตามแผน</span>
        <span><span class="fp-swatch" style="background:var(--fp-warn)"></span>ล่าช้า/ว่าง</span>
        <span><span class="fp-swatch" style="background:var(--fp-muted)"></span>คลัง/สนับสนุน (ไม่ผูกไลน์)</span>
        <span class="fp-demo" id="fp-updated-at"></span>
      </div>
    </div>
  `;
  _fpRefreshViews();
  const upd = document.getElementById('fp-updated-at');
  if (upd) upd.textContent = 'อัปเดตล่าสุด ' + new Date().toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// วาดส่วนที่ขึ้นกับ _fpData ใหม่ทั้งหมด (ผัง/ตัวเลข/พนักงาน/แผงขวา) โดยไม่สร้างโครงหน้าใหม่ — ใช้ตอนรีเฟรชและตอนเลื่อน
// แถบย้อนดู (สร้างโครงใหม่ทุกครั้งจะทำให้แถบเลื่อนหลุดมือตอนกำลังลาก)
function _fpRefreshViews() {
  _fpBuildSvg();
  _fpRenderKpis();
  _fpRenderStaffPanel();
  if (_fpSelectedPerson) _fpShowPerson(_fpSelectedPerson);
  else if (_fpSelectedId) _fpSelectRoom(_fpSelectedId);
  else _fpRenderOverview();
}

// ── แถบย้อนดูทั้งวัน ── 06:00 ถึงตอนนี้ ทีละ 5 นาที ลากถึงขวาสุด = กลับมาดูสด
function _fpNowMin() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }
function _fpMinLabel(m) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function _fpReplayBarHTML() {
  const max = Math.max(_fpNowMin(), 365), min = Math.min(360, max - 5);
  const val = _fpReplayAt ? _fpReplayAt.getHours() * 60 + _fpReplayAt.getMinutes() : max;
  return `<div class="fp-replay${_fpReplayAt ? ' fp-replay-on' : ''}" id="fp-replay">
    <button type="button" class="fp-replay-btn" id="fp-replay-play" onclick="_fpReplayTogglePlay()" aria-label="เล่นย้อนหลังทั้งวัน">
      <i class="fas fa-${_fpReplayTimer ? 'pause' : 'play'}"></i></button>
    <span class="fp-replay-edge fp-mono">${_fpMinLabel(min)}</span>
    <input type="range" id="fp-replay-range" min="${min}" max="${max}" step="5" value="${val}"
      aria-label="เลือกเวลาที่จะย้อนดู" oninput="_fpReplaySet(+this.value)">
    <span class="fp-replay-edge fp-mono">ตอนนี้</span>
    <span class="fp-replay-label" id="fp-replay-label">${_fpReplayAt ? `<i class="fas fa-clock-rotate-left me-1"></i>ย้อนดู ${_fpHM(_fpReplayAt)}` : '<i class="fas fa-circle me-1" style="color:#ef4444;font-size:8px"></i>ดูสด'}</span>
    ${_fpReplayAt ? '<button type="button" class="fp-replay-btn fp-replay-live" onclick="_fpReplayLive()">กลับไปดูสด</button>' : ''}
  </div>`;
}
let _fpReplayRaf = null;
function _fpReplaySet(minutes) {
  const range = document.getElementById('fp-replay-range');
  const max = range ? +range.max : _fpNowMin();
  if (minutes >= max) { _fpReplayLive(); return; }
  const d = new Date(); d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  _fpReplayAt = d;
  _fpData = _fpSnapshotAt(d);
  const bar = document.getElementById('fp-replay');
  if (bar) bar.classList.add('fp-replay-on');
  const lbl = document.getElementById('fp-replay-label');
  if (lbl) lbl.innerHTML = `<i class="fas fa-clock-rotate-left me-1"></i>ย้อนดู ${_fpHM(d)}`;
  if (range && +range.value !== minutes) range.value = minutes;
  // ลากแถบแล้วยิง input ถี่มาก — วาดใหม่อย่างมากเฟรมละครั้ง (3D สร้างฉากใหม่ทุกครั้งค่อนข้างหนัก)
  if (!_fpReplayRaf) _fpReplayRaf = requestAnimationFrame(() => { _fpReplayRaf = null; _fpRefreshViews(); });
}
function _fpReplayLive() {
  if (_fpReplayTimer) { clearInterval(_fpReplayTimer); _fpReplayTimer = null; }
  _fpReplayAt = null;
  _fpData = _fpLiveData;
  _fpRender();
}
function _fpReplayTogglePlay() {
  if (_fpReplayTimer) {
    clearInterval(_fpReplayTimer); _fpReplayTimer = null;
  } else {
    const range = document.getElementById('fp-replay-range');
    if (!range) return;
    let m = _fpReplayAt ? +range.value : +range.min;   // ดูสดอยู่ → เริ่มเล่นจากต้นวัน
    _fpReplaySet(m);
    _fpReplayTimer = setInterval(() => {
      m += 10;
      if (m >= +range.max) { _fpReplayLive(); return; }
      _fpReplaySet(m);
    }, 450);
  }
  const btn = document.getElementById('fp-replay-play');
  if (btn) btn.innerHTML = `<i class="fas fa-${_fpReplayTimer ? 'pause' : 'play'}"></i>`;
}

// ── โหมดจอทีวี ── เต็มจอ (Fullscreen API ถ้ามี — iPhone ไม่มี ก็ยังขยายเต็มหน้าต่างด้วยคลาส fp-tv) ซ่อนแถวพนักงาน
// ผังสูงเต็มจอ และในโหมด 3D กล้องหมุนรอบโรงงานช้าๆ เอง (ดู _fp3dStartLoop) — กด Esc/ปุ่มออกเพื่อกลับ
function _fpToggleTv() {
  _fpTvMode = !_fpTvMode;
  const page = document.getElementById('page-floorpulse');
  page.classList.toggle('fp-tv', _fpTvMode);
  try {
    if (_fpTvMode && page.requestFullscreen) page.requestFullscreen().catch(() => {});
    else if (!_fpTvMode && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch (e) {}
  _fpRenderKpis();
  if (_fp3d) setTimeout(_fp3dResize, 50);
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && _fpTvMode) _fpToggleTv();   // ผู้ใช้กด Esc ออกจากเต็มจอ
});

function _fpRenderKpis() {
  let running = 0, behind = 0;
  PLAN_LINES.forEach(line => {
    const r = _fpData[line];
    if (!r) return;
    if (r.status === 'running') running++;
    else if (r.status === 'behind') behind++;
  });
  const staff = _fpBuildStaffOverview();
  const working = staff.filter(s => s.status === 'working').length;
  const idle = staff.filter(s => s.status === 'idle').length;
  const alertCount = PLAN_LINES.reduce((n, l) => n + ((_fpData[l] && _fpData[l].alerts) || []).length, 0);
  const el = document.getElementById('fp-kpi-strip');
  if (!el) return;
  el.innerHTML = `
    <div class="fp-kpi"><b>${running + behind}/${PLAN_LINES.length}</b><span>ไลน์มีงานค้าง</span></div>
    <div class="fp-kpi"><b>${behind}</b><span>ล่าช้ากว่าแผน</span></div>
    <div class="fp-kpi"><b>${working}</b><span>พนักงานสแกนเข้าแล้ว</span></div>
    <div class="fp-kpi"><b>${idle}</b><span>พนักงานว่าง</span></div>
    <div class="fp-kpi${alertCount ? ' fp-kpi-alert' : ''}" role="button" tabindex="0" title="ดูรายการแจ้งเตือนในแผงขวา"
      onclick="_fpSelectedId=null;_fpSelectedPerson=null;_fpRenderOverview();_fpBuildSvg()"><b>${alertCount}</b><span>แจ้งเตือน</span></div>
    <div class="fp-clock"><b id="fp-clock-time">--:--:--</b></div>
    <button type="button" class="fp-tv-btn" onclick="_fpToggleTv()" aria-pressed="${_fpTvMode}">
      <i class="fas fa-${_fpTvMode ? 'compress' : 'tv'} me-1"></i>${_fpTvMode ? 'ออกจากโหมดจอทีวี' : 'โหมดจอทีวี'}</button>
  `;
  const clockEl = document.getElementById('fp-clock-time');
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function _fpSvgEl(tag, attrs) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// ตัดชื่อห้องให้ไม่ยาวเกินพื้นที่ที่มี (กันจุดสถานะที่มุมขวาบนทับตัวหนังสือ — วัดความกว้าง SVG text จริง
// ไม่ได้เพราะ element ยังไม่ถูก attach เข้า DOM ตอนสร้าง เลยประมาณจากความกว้างเฉลี่ยตัวอักษรแทน)
// นับ/ตัดตาม "กลุ่มตัวอักษร" (grapheme) ไม่ใช่ code unit — สระบน/ล่าง/วรรณยุกต์ไทยไม่กินความกว้าง และห้าม
// ถูกตัดแยกจากพยัญชนะ (เดิมตัดด้วย slice ทำให้ได้ "ห้องชั่ | งสาร" — แก้ 2026-10-17 ตอนห้องแคบลงตามแปลนจริง)
const _fpGraphemeSeg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
const _fpWordSeg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
function _fpGraphemes(text) {
  return _fpGraphemeSeg ? Array.from(_fpGraphemeSeg.segment(text), s => s.segment) : Array.from(text);
}

function _fpFitLabel(text, maxPx, fontPx) {
  const maxChars = Math.max(3, Math.floor(maxPx / (fontPx * 0.62)));
  const g = _fpGraphemes(text);
  return g.length <= maxChars ? text : g.slice(0, maxChars - 1).join('') + '…';
}

// เหมือน _fpFitLabel แต่ขึ้นบรรทัดใหม่ได้สูงสุด maxLines บรรทัดก่อนค่อยตัดจบด้วย "…" (คำขอผู้ใช้ 2026-09-14)
// ตัดบรรทัดตามขอบคำภาษาไทย (Intl.Segmenter) ก่อน ถ้าคำเดียวยาวเกินบรรทัดค่อยตัดกลางคำตาม grapheme
function _fpWrapLabel(text, maxPx, fontPx, maxLines) {
  maxLines = maxLines || 2;
  const maxChars = Math.max(3, Math.floor(maxPx / (fontPx * 0.62)));
  if (_fpGraphemes(text).length <= maxChars) return [text];
  const words = _fpWordSeg ? Array.from(_fpWordSeg.segment(text), s => s.segment) : [text];
  const lines = [];
  let cur = [];
  const pushLine = () => { if (cur.length) lines.push(cur.join('')); cur = []; };
  words.forEach(w => {
    _fpGraphemes(w).forEach((ch, i, arr) => {
      // เริ่มคำใหม่แล้วคำนี้ไม่พอดีบรรทัดเดิม → ขึ้นบรรทัดใหม่ก่อน (ถ้าคำสั้นพอใส่บรรทัดใหม่ได้ทั้งคำ)
      if (i === 0 && cur.length && cur.length + arr.length > maxChars && arr.length <= maxChars) pushLine();
      if (cur.length >= maxChars) pushLine();
      cur.push(ch);
    });
  });
  pushLine();
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  const last = _fpGraphemes(out[maxLines - 1]);
  out[maxLines - 1] = last.slice(0, Math.max(1, Math.min(last.length, maxChars - 1))).join('') + '…';
  return out;
}

function _fpBuildSvg() {
  // ทุกจุดที่สั่งวาดผังใหม่ (render/เลือกห้อง/ปุ่มกลับภาพรวม) เรียกผ่านฟังก์ชันนี้ — โหมด 3D แยกไปวาดเองที่นี่
  if (_fpViewMode === '3d') { _fp3dUpdate(); return; }
  const svg = document.getElementById('fp-svg');
  if (!svg) return;
  svg.innerHTML = '';
  const mk = _fpSvgEl;
  _fpBuildWalkways(svg);

  Object.keys(FP_GEOM).forEach(roomId => {
    const g = FP_GEOM[roomId];
    if (roomId === 'packbox') { _fpBuildPackRoom(svg, g); return; }

    // ห้องชั่งสาร/Bulk/ผสมน้ำมัน ปกติไม่ผูกไลน์ แต่ถ้ามีงานแพ็คย้ายมาใช้ห้องนี้ (ดู _fpHostedLine) แสดงงานนั้นที่นี่
    const hosted = _fpHostedLine(roomId);
    const line = FP_ROOM_LINE[roomId] || hosted;
    const r = line ? _fpData[line] : null;
    const isMonitored = !!r;
    const status = isMonitored ? r.status : null;

    let color = 'var(--fp-muted)', fill = 'var(--fp-muted-fill)';
    if (status === 'running')      { color = 'var(--fp-accent)';   fill = '#e3f5f3'; }
    else if (status === 'behind')  { color = 'var(--fp-warn)';     fill = '#fdf1e0'; }
    else if (status === 'done')    { color = 'var(--fp-accent-2)'; fill = '#f0e9fc'; }

    const dim = !isMonitored || status === 'idle';
    const grp = mk('g', { class: `fp-zone${dim ? ' fp-dim' : ''}${_fpSelectedId === roomId ? ' fp-selected' : ''}`,
      'data-id': roomId, tabindex: '0', role: 'button', 'aria-label': FP_ROOM_LABEL[roomId] });
    grp.addEventListener('click', () => _fpSelectRoom(roomId));
    grp.addEventListener('keypress', e => { if (e.key === 'Enter') _fpSelectRoom(roomId); });
    grp.appendChild(mk('rect', { class: 'fp-room', x: g.x, y: g.y, width: g.w, height: g.h, rx: 10, fill, stroke: color, 'stroke-opacity': .85 }));

    const hasDot = isMonitored && status !== 'idle';
    const alertLvl = isMonitored ? _fpAlertLevel(r.alerts) : null;
    const labelFs = 11.5;
    const labelLines = _fpWrapLabel(FP_ROOM_LABEL[roomId], g.w - 24 - (hasDot ? 16 : 0) - (alertLvl ? 16 : 0), labelFs, 2);
    const label = mk('text', { class: 'fp-room-label', x: g.x + 12, y: g.y + 22, 'font-size': labelFs });
    labelLines.forEach((line, i) => {
      const tspan = mk('tspan', { x: g.x + 12, dy: i === 0 ? 0 : labelFs + 2 });
      tspan.textContent = line;
      label.appendChild(tspan);
    });
    grp.appendChild(label);

    if (hasDot) {
      grp.appendChild(mk('circle', {
        class: status === 'running' ? 'fp-dot-live' : '',
        cx: g.x + g.w - 18, cy: g.y + 18, r: 5, fill: color,
      }));
    }
    if (alertLvl) grp.appendChild(_fpSvgAlertBadge(g.x + g.w - (hasDot ? 34 : 18), g.y + 18, alertLvl, r.alerts));

    if (hasDot) {
      const pct = r.planned > 0 && r.actual != null ? Math.min(100, Math.round(r.actual / r.planned * 100)) : 0;
      const barY = g.y + g.h - 22, barX = g.x + 12, barW = g.w - 24;
      const sub = mk('text', { class: 'fp-room-sub', x: barX, y: barY - 6, 'font-size': 10 });
      const nums = `${(r.actual ?? 0).toLocaleString()} / ${r.planned.toLocaleString()}`;
      const fits = (s, fs) => _fpGraphemes(s).length * fs * 0.62 <= barW;
      // ห้องแคบ (ตามแปลนจริง): ตัด "สแกนสด" → ตัดหน่วย → ย่อตัวอักษร ตามลำดับ ตัวเลขต้องครบเสมอ
      // (รายละเอียดเต็มยังอยู่ในแผงขวาเมื่อคลิกห้อง) — มี ETA ใส่ " · ~15:40" ต่อท้ายเฉพาะเมื่อที่พอ
      const eta = r.eta ? ` · ~${_fpEtaLabel(r.eta.eta)}` : '';
      const options = [
        ...(eta ? [`${r.isLiveScan ? 'สแกนสด ' : ''}${nums} ${r.item.UOM || ''}${eta}`, `${nums} ${r.item.UOM || ''}${eta}`, `${nums}${eta}`] : []),
        `${r.isLiveScan ? 'สแกนสด ' : ''}${nums} ${r.item.UOM || ''}`, `${nums} ${r.item.UOM || ''}`, nums];
      if (r.eta && r.eta.late) sub.setAttribute('style', 'fill:#dc2626');
      let subText = options.find(s => fits(s, 10));
      if (!subText) {
        subText = nums;
        sub.setAttribute('font-size', Math.max(7, barW / (_fpGraphemes(nums).length * 0.62)).toFixed(1));
      }
      sub.textContent = subText;
      grp.appendChild(sub);
      grp.appendChild(mk('rect', { class: 'fp-metric-track', x: barX, y: barY, width: barW, height: 6, rx: 3 }));
      grp.appendChild(mk('rect', { x: barX, y: barY, width: Math.max(0, barW * pct / 100), height: 6, rx: 3, fill: color }));
      if (hosted) {   // บอกว่างานแพ็คไลน์ไหนมาใช้ห้องนี้ — บรรทัดเล็กใต้ชื่อห้อง (ห้องแคบ ใส่ต่อท้ายชื่อแล้วโดนตัด)
        const tag = mk('text', { x: g.x + 12, y: g.y + 22 + labelLines.length * (labelFs + 2) + 4, 'font-size': 9, fill: color, 'font-weight': 600 });
        tag.textContent = _fpFitLabel(_fpPackSubLabel(hosted), g.w - 24, 9);
        grp.appendChild(tag);
      }
      // หุ่นพนักงานของไลน์นี้ ระหว่างชื่อห้องกับแถบความคืบหน้า
      const peopleTop = g.y + 22 + labelLines.length * (labelFs + 2) + (hosted ? 11 : 0);
      const peopleBot = barY - 15;
      const availH = peopleBot - peopleTop;
      if (availH >= 9) {
        const withName = availH >= 22;
        _fpPlacePeople(grp, r.roster, g.x + 10, g.x + g.w - 10, withName ? peopleBot - 8 : peopleBot, availH, withName);
      }
    } else {
      // วางต่อจากบรรทัดสุดท้ายของชื่อห้องจริง (ไม่ใช่ y คงที่) กันทับกันตอนชื่อห้องขึ้น 2 บรรทัด
      const subY = g.y + 22 + labelLines.length * (labelFs + 2) + 4;
      const subText = isMonitored ? 'ว่าง/ไม่มีแผนวันนี้'
        : roomId === 'samples' ? `${_fpHoldStock.length.toLocaleString()} รายการ (Defect/Retain)`
        : 'ไม่ติดตามเรียลไทม์';
      const sub = mk('text', { class: 'fp-room-sub', x: g.x + 12, y: subY, 'font-size': 9.5 });
      sub.textContent = _fpFitLabel(subText, g.w - 24, 9.5);
      grp.appendChild(sub);
    }
    svg.appendChild(grp);
  });
  _fpBuildDoors(svg);
}

// หุ่นการ์ตูนพนักงานแบบแบนในผัง 2D (2026-10-18 "ให้หุ่นแสดงใน 2D ด้วย") — หน้าตาเดียวกับหุ่น 3D (_fp3dMakePerson):
// ชุดชมพู, หญิง = ชุดทรงบาน+ผมยาว+มวย, ชาย = ชุดตรง+ผมสั้น, ไม่ระบุเพศ = หมวกคลุมผมขาว, ยังไม่สแกนเข้า = สีเทาจาง
// ไม่ขยับ ส่วนคนที่สแกนเข้าแล้วโยกตัว+เดินซ้ายขวาด้วย CSS (ดู .fp-person-*) วาดที่จุดเท้า (x,y) สูง 16*s
const FP_PERSON_COLORS = { uniform: '#ec4899', skin: '#f2c9a0', pants: '#1e3a5f', hair: '#3b2a20', ghost: '#b6c0cc' };
function _fpSvgPerson(p, x, y, s, withName) {
  const mk = _fpSvgEl, C = FP_PERSON_COLORS, ghost = !p.confirmed;
  const col = c => (ghost ? C.ghost : c);
  const outer = mk('g', { class: 'fp-person', transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`, opacity: ghost ? 0.55 : 1 });
  if (p.code) {   // คลิกหุ่น = ดูรายละเอียดพนักงานคนนั้น (ไม่ส่งต่อไปเป็นคลิกห้อง)
    outer.addEventListener('click', e => { e.stopPropagation(); _fpShowPerson(p.code); });
    const tt = mk('title', {}); tt.textContent = `${p.name} — คลิกเพื่อดูรายละเอียด`; outer.appendChild(tt);
    // พื้นที่คลิกโปร่งใสครอบตัวหุ่น (หุ่นเล็ก คลิกโดนยาก)
    outer.appendChild(mk('rect', { x: -6 * s, y: -20 * s, width: 12 * s, height: 20 * s + (withName ? 8 : 0), fill: 'transparent' }));
  }
  const walk = mk('g', ghost ? {} : { class: 'fp-person-walk', style: `animation-delay:-${(Math.random() * 6).toFixed(2)}s` });
  const bob = mk('g', ghost ? { transform: `scale(${s})` } : { class: 'fp-person-bob', style: `animation-delay:-${(Math.random() * 1.1).toFixed(2)}s` });
  const fig = ghost ? bob : mk('g', { transform: `scale(${s})` });
  if (!ghost) bob.appendChild(fig);
  const put = (tag, attrs) => fig.appendChild(mk(tag, attrs));
  put('rect', { x: -2.4, y: -4.2, width: 1.8, height: 4.2, rx: 0.6, fill: col(C.pants) });
  put('rect', { x: 0.6, y: -4.2, width: 1.8, height: 4.2, rx: 0.6, fill: col(C.pants) });
  if (p.gender === 'F') put('path', { d: 'M -2.6 -10.2 L 2.6 -10.2 L 4.2 -3.6 L -4.2 -3.6 Z', fill: col(C.uniform) });
  else put('rect', { x: -3.4, y: -10.2, width: 6.8, height: 6.8, rx: 1.6, fill: col(C.uniform) });
  if (p.gender === 'F') {   // ผมยาวด้านหลัง (วาดก่อนหัวให้อยู่ใต้)
    put('rect', { x: -4.1, y: -15.2, width: 8.2, height: 6.4, rx: 2.4, fill: col(C.hair) });
  }
  put('circle', { cx: 0, cy: -13.4, r: 3.5, fill: col(C.skin) });
  put('circle', { cx: -1.2, cy: -13.1, r: 0.45, fill: col('#1f2937') });
  put('circle', { cx: 1.2, cy: -13.1, r: 0.45, fill: col('#1f2937') });
  if (p.gender === 'F') {
    put('path', { d: 'M -3.6 -13.8 A 3.6 3.6 0 0 1 3.6 -13.8 Q 0 -15.2 -3.6 -13.8 Z', fill: col(C.hair) });
    put('circle', { cx: 0, cy: -17.4, r: 1.5, fill: col(C.hair) });
  } else if (p.gender === 'M') {
    put('path', { d: 'M -3.6 -13.4 A 3.6 3.6 0 0 1 3.6 -13.4 Q 0 -15.6 -3.6 -13.4 Z', fill: col(C.hair) });
  } else {
    put('path', { d: 'M -3.9 -13.6 A 3.9 3.9 0 0 1 3.9 -13.6 Z', fill: col('#ffffff'), stroke: '#cbd5e1', 'stroke-width': 0.5 });
  }
  walk.appendChild(bob);
  outer.appendChild(walk);
  if (withName) {
    const t = mk('text', { x: 0, y: 7, 'font-size': 6.5, 'text-anchor': 'middle', 'font-weight': 600,
      fill: ghost ? '#94a3b8' : '#831843' });
    t.textContent = p.name;
    outer.appendChild(t);
  }
  return outer;
}

// ป้ายสามเหลี่ยมแจ้งเตือนบนห้อง/สถานี (แดง = danger, ส้ม = warn) + tooltip รายการแจ้งเตือน
function _fpSvgAlertBadge(cx, cy, level, alerts, size) {
  const mk = _fpSvgEl, s = size || 1;
  const g = mk('g', { class: 'fp-alert-badge' });
  const tt = mk('title', {}); tt.textContent = (alerts || []).map(a => a.text).join('\n'); g.appendChild(tt);
  g.appendChild(mk('polygon', { points: `${cx},${cy - 6 * s} ${cx + 6.5 * s},${cy + 5 * s} ${cx - 6.5 * s},${cy + 5 * s}`,
    fill: level === 'danger' ? '#dc2626' : '#f59e0b', stroke: '#fff', 'stroke-width': 1 }));
  const t = mk('text', { x: cx, y: cy + 3.6 * s, 'font-size': 8 * s, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle' });
  t.textContent = '!';
  g.appendChild(t);
  return g;
}

// วางหุ่นเรียงแถวเดียวในกรอบ (x0..x1) เท้าอยู่ที่ footY ขนาดหุ่นย่อให้พอดีความสูงที่มี (availH) ถ้าคนเกินที่
// เหลือ ใส่ "+N" ต่อท้าย — ชื่อใต้เท้าเฉพาะตอนที่มีที่พอ (ห้องแคบ/สถานีย่อยไม่ใส่ชื่อ — ดูชื่อได้ที่แผงขวา)
function _fpPlacePeople(svg, roster, x0, x1, footY, availH, withName) {
  if (!roster || !roster.length) return;
  const s = Math.max(0.5, Math.min(1, (availH - (withName ? 8 : 0)) / 18));
  const step = withName ? Math.max(18 * s, 19) : 13 * s;
  const fit = Math.max(1, Math.floor((x1 - x0) / step));
  const shown = roster.length > fit ? roster.slice(0, fit - 1) : roster;
  shown.forEach((p, i) => svg.appendChild(_fpSvgPerson(p, x0 + step / 2 + i * step, footY, s, withName)));
  if (roster.length > shown.length) {
    const t = _fpSvgEl('text', { x: x0 + step / 2 + shown.length * step, y: footY - 4, 'font-size': 8, 'text-anchor': 'middle',
      fill: 'var(--fp-text-dim)', 'font-weight': 600 });
    t.textContent = `+${roster.length - shown.length}`;
    svg.appendChild(t);
  }
}

// ทางเดิน/โถง (FP_WALKWAYS) — วาดก่อนห้อง ให้อยู่ชั้นล่างสุด สีพื้นอ่อน+เส้นประ แยกจากห้องชัดเจน
function _fpBuildWalkways(svg) {
  const mk = _fpSvgEl;
  FP_WALKWAYS.forEach(wk => {
    svg.appendChild(mk('rect', { x: wk.x, y: wk.y, width: wk.w, height: wk.h, fill: '#f8fafc',
      stroke: '#cbd5e1', 'stroke-dasharray': '4 3', 'stroke-width': 1 }));
    const cx = wk.x + wk.w / 2, cy = wk.ly || (wk.y + wk.h / 2);
    const t = mk('text', { x: cx, y: cy, 'font-size': 9, fill: 'var(--fp-text-faint)', 'text-anchor': 'middle',
      'dominant-baseline': 'middle', transform: wk.vertical ? `rotate(-90 ${cx} ${cy})` : '' });
    t.textContent = wk.label;
    svg.appendChild(t);
  });
}

// ช่องประตู (FP_DOORS) เจาะเส้นผนังให้เห็นเป็นช่องเปิด + ขอบวงกบเล็กๆ 2 ข้าง และลูกศรทางเข้า-ออกของโซน
function _fpBuildDoors(svg) {
  const mk = _fpSvgEl;
  FP_DOORS.forEach(d => {
    const h = d.o === 'h', half = d.w / 2;
    const [x1, y1, x2, y2] = h ? [d.x - half, d.y, d.x + half, d.y] : [d.x, d.y - half, d.x, d.y + half];
    svg.appendChild(mk('line', { x1, y1, x2, y2, stroke: '#ffffff', 'stroke-width': 4 }));
    const jamb = (x, y) => svg.appendChild(mk('line', h
      ? { x1: x, y1: y - 4, x2: x, y2: y + 4, stroke: '#475569', 'stroke-width': 1.6 }
      : { x1: x - 4, y1: y, x2: x + 4, y2: y, stroke: '#475569', 'stroke-width': 1.6 }));
    jamb(x1, y1);
    jamb(x2, y2);
  });
  FP_ENTRANCES.forEach(e => {
    const len = 22, x2 = e.x + e.dx * len / 2, y2 = e.y + e.dy * len / 2;
    const x1 = e.x - e.dx * len / 2, y1 = e.y - e.dy * len / 2;
    svg.appendChild(mk('line', { x1, y1, x2, y2, stroke: '#0f766e', 'stroke-width': 2 }));
    const px = -e.dy, py = e.dx;   // แกนตั้งฉากของหัวลูกศร
    svg.appendChild(mk('polygon', { fill: '#0f766e',
      points: `${x2 + e.dx * 6},${y2 + e.dy * 6} ${x2 + px * 4},${y2 + py * 4} ${x2 - px * 4},${y2 - py * 4}` }));
    const t = mk('text', { x: e.x, y: e.y - 8, 'font-size': 8.5, fill: '#0f766e', 'text-anchor': 'middle', 'font-weight': 600 });
    t.textContent = e.label;
    svg.appendChild(t);
  });
}

function _fpBuildPackRoom(svg, g) {
  const mk = _fpSvgEl;
  const outer = mk('g', { class: 'fp-zone fp-dim' });
  outer.appendChild(mk('rect', { class: 'fp-room', x: g.x, y: g.y, width: g.w, height: g.h, rx: 10, fill: 'var(--fp-muted-fill)', stroke: 'var(--fp-muted)', 'stroke-opacity': .6 }));
  const title = mk('text', { class: 'fp-room-label', x: g.x + 10, y: g.y + 16, 'font-size': 10 });
  title.textContent = 'บรรจุหีบห่อ (5 สถานี)';
  outer.appendChild(title);
  svg.appendChild(outer);

  const slotH = (g.h - 24) / FP_PACK_SUBLINES.length;
  FP_PACK_SUBLINES.forEach((sub, i) => {
    const sy = g.y + 24 + i * slotH;
    const r = _fpData[sub.line];
    // งานแพ็คของสถานีนี้ย้ายไปทำห้องอื่น (เลือกตอนสแกน) — สถานีนี้แสดงเป็นว่าง + บอกว่าย้ายไปห้องไหน
    const movedTo = _fpPackLineRoom(sub.line);
    const status = r && !movedTo ? r.status : 'idle';
    const id = `packbox__${sub.key}`;
    let color = 'var(--fp-muted)', fill = 'var(--fp-muted-fill)';
    if (status === 'running')      { color = 'var(--fp-accent)';   fill = '#e3f5f3'; }
    else if (status === 'behind')  { color = 'var(--fp-warn)';     fill = '#fdf1e0'; }
    else if (status === 'done')    { color = 'var(--fp-accent-2)'; fill = '#f0e9fc'; }

    const sg = mk('g', { class: `fp-zone${status === 'idle' ? ' fp-dim' : ''}${_fpSelectedId === id ? ' fp-selected' : ''}`,
      'data-id': id, tabindex: '0', role: 'button', 'aria-label': sub.label });
    sg.addEventListener('click', () => _fpSelectRoom(id));
    sg.appendChild(mk('rect', { class: 'fp-room', x: g.x + 6, y: sy, width: g.w - 12, height: slotH - 4, rx: 6, fill, stroke: color, 'stroke-opacity': .85 }));
    const hasDot = status !== 'idle';
    const lbl = mk('text', { class: 'fp-room-label', x: g.x + 14, y: sy + slotH / 2 - 2, 'font-size': 8.5 });
    lbl.textContent = _fpFitLabel(movedTo ? `${sub.label} → ${FP_ROOM_LABEL[movedTo]}` : sub.label, (g.w - 12) - 24 - (hasDot ? 12 : 0), 8.5);
    sg.appendChild(lbl);
    if (hasDot) {
      sg.appendChild(mk('circle', {
        class: status === 'running' ? 'fp-dot-live' : '',
        cx: g.x + g.w - 16, cy: sy + slotH / 2 - 4, r: 3.4, fill: color,
      }));
      // สถานีแคบ — หุ่นจิ๋วไม่มีชื่อ ด้านขวาของชื่อสถานี (ชื่อคนดูได้ที่แผงขวาเมื่อคลิก)
      _fpPlacePeople(sg, r.roster, g.x + g.w * 0.62, g.x + g.w - 30, sy + slotH - 5, slotH - 5, false);
      const lvl = _fpAlertLevel(r.alerts);
      if (lvl) sg.appendChild(_fpSvgAlertBadge(g.x + g.w - 26, sy + slotH / 2 - 3, lvl, r.alerts, 0.7));
    }
    svg.appendChild(sg);
  });
}

// ══════════════════════════════════════════════════════════════════════════
// มุมมอง 3D แบบเรียลไทม์ (เพิ่ม 2026-10-17 ตามคำขอผู้ใช้ "ทำมุมมอง 3D แบบ realtime ก่อน") — ยกผัง FP_GEOM เดิม
// ขึ้นเป็นห้อง 3 มิติ ใช้ _fpData ชุดเดียวกับผัง 2D ทุกอย่าง (สี/สถานะ/ยอด/คน) จึงรีเฟรชตามรอบ 60 วิเดิมเอง
// three.js r128 โหลดจาก jsDelivr ตอนกด 3D ครั้งแรกเท่านั้น (ไม่ถ่วงการโหลดแอปปกติ) — renderer/กล้องสร้าง
// ครั้งเดียวแล้วย้าย canvas เข้า container ใหม่ทุกครั้งที่ _fpRender สร้าง DOM ใหม่ มุมกล้องที่หมุนไว้จึงไม่รีเซ็ต
// ตอนรีเฟรชข้อมูล — ยังไม่ใช่ "จำลองสถานการณ์" (what-if) ซึ่งตกลงกันว่าแยกเป็นเฟสถัดไป
// ══════════════════════════════════════════════════════════════════════════
let _fpViewMode = (() => { try { return localStorage.getItem('fpViewMode') === '3d' ? '3d' : '2d'; } catch (e) { return '2d'; } })();
let _fp3d = null;          // { renderer, scene, camera, controls, roomsGroup, raycaster, pointer, pickables, pulses, raf, ro }
let _fp3dLoading = null;   // Promise การโหลด three.js (ครั้งเดียวต่อ session)

const FP3D_COLORS = {
  running: { stroke: 0x0d9488, fill: 0xd5f0ec },
  behind:  { stroke: 0xd97706, fill: 0xfbe9cf },
  done:    { stroke: 0x7c3aed, fill: 0xe9defb },
  muted:   { stroke: 0x94a3b8, fill: 0xe6ebf2 },
};

// ห้องที่มีไฟล์สแกน 3 มิติจริง (Polycam → Export GLTF/GLB, เพิ่ม 2026-10-17) — วางโมเดลสแกนแทนผนังโปร่ง
// ของห้องนั้น ย่อ/ขยายให้พอดีกรอบห้องใน FP_GEOM (คงสัดส่วนจริง) ไฟล์ต้องอัปโหลดขึ้น repo คู่กับ index.html
// ด้วย ไม่งั้นโหลดไม่เจอ (ห้องนั้นจะกลับไปเป็นกล่องธรรมดาเอง ไม่พัง) — rotY หมุนให้ด้านยาวของสแกนตรงกับผัง
// ถ้าประตู/ผนังหันผิดด้าน ปรับ rotY ทีละ Math.PI/2
const FP3D_SCANS = {
  // ปิดไว้ก่อนตามคำขอผู้ใช้ 2026-10-19 "เอารูปห้องจริงออกก่อน" — ห้องบรรจุแชมพูกลับไปเป็นกล่องธรรมดาเหมือนห้องอื่น
  // จะเปิดกลับ: เอา // หน้าบรรทัด fillsh ออก (ไฟล์ room-fillsh.glb ยังอยู่ในโฟลเดอร์ ต้องอัปโหลดคู่ด้วย)
  // ห้องจริง 3.70×2.78 ม. (กว้าง>ลึก ตามแปลน) สแกนดิบ 4.36×3.22 ม. — ด้านยาวตรงกันแล้วโดยไม่ต้องหมุน 90°
  // ประตูจริงอยู่ผนังด้านขวา (ตะวันออก) ค่อนไปทางล่าง ถ้าประตูในโมเดลอยู่ผิดฝั่ง ให้ลอง rotY: Math.PI
  // fillsh: { url: 'room-fillsh.glb', rotY: 0 },
};

function _fpSetViewMode(mode) {
  if (mode === _fpViewMode) return;
  _fpViewMode = mode;
  try { localStorage.setItem('fpViewMode', mode); } catch (e) {}
  _fpRender();
}

function _fpLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('โหลดไม่สำเร็จ: ' + src));
    document.head.appendChild(s);
  });
}

function _fp3dLoadLib() {
  if (window.THREE && THREE.OrbitControls) return Promise.resolve();
  if (!_fp3dLoading) {
    _fp3dLoading = _fpLoadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js')
      .then(() => _fpLoadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'))
      .catch(err => { _fp3dLoading = null; throw err; });
  }
  return _fp3dLoading;
}

async function _fp3dUpdate() {
  if (!document.getElementById('fp-3d')) return;
  if (!_fp3d) {
    document.getElementById('fp-3d').innerHTML = '<div class="fp-3d-msg">กำลังโหลดมุมมอง 3D…</div>';
    try {
      await _fp3dLoadLib();
      if (!_fp3d) _fp3dInit();
    } catch (e) {
      console.error('Floor Pulse 3D:', e);
      const h = document.getElementById('fp-3d');
      if (h) h.innerHTML = '<div class="fp-3d-msg">เปิดมุมมอง 3D ในเครื่องนี้ไม่ได้ (โหลดไลบรารีไม่สำเร็จ หรือเบราว์เซอร์ไม่รองรับ WebGL) — กดปุ่ม 2D เพื่อใช้ผังแบบเดิม</div>';
      return;
    }
  }
  const host = document.getElementById('fp-3d');   // _fpRender อาจสร้าง container ใหม่ระหว่างรอโหลด
  if (!host) return;
  const canvas = _fp3d.renderer.domElement;
  if (canvas.parentNode !== host) {
    host.innerHTML = '';
    host.appendChild(canvas);
    host.insertAdjacentHTML('beforeend', '<div class="fp-3d-hint">ลากเพื่อหมุน · คลิกขวาลากเพื่อเลื่อน · ลูกกลิ้งเพื่อซูม · คลิกห้องเพื่อดูรายละเอียด</div>');
    _fp3d.ro.disconnect();
    _fp3d.ro.observe(host);
  }
  _fp3dResize();
  _fp3dBuildRooms();
  _fp3dRenderFlowLegend();
  _fp3dStartLoop();
  _fp3dLoadScans();
}

// โหลดโมเดลสแกนห้องจริงครั้งเดียวต่อ session — เก็บไว้ใน scansGroup แยกจาก roomsGroup เพราะ roomsGroup ถูก
// ล้าง+dispose ทุกครั้งที่ข้อมูลรีเฟรช (ไม่อยากโหลดไฟล์ 3 MB ซ้ำทุก 60 วิ) พอโหลดเสร็จค่อยวาดห้องใหม่อีกรอบ
// เพื่อซ่อนผนังโปร่งของห้องนั้น (ดู scanned ใน _fp3dAddRoom)
function _fp3dLoadScans() {
  if (_fp3d.scansStarted) return;
  _fp3d.scansStarted = true;
  if (!Object.keys(FP3D_SCANS).length) return;   // ไม่มีห้องที่ใช้สแกนจริง — ไม่ต้องโหลด GLTFLoader
  const libReady = THREE.GLTFLoader ? Promise.resolve()
    : _fpLoadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');
  libReady.then(() => {
    const loader = new THREE.GLTFLoader();
    Object.keys(FP3D_SCANS).forEach(id => {
      const cfg = FP3D_SCANS[id];
      loader.load(cfg.url, gltf => {
        const root = gltf.scene;
        // สแกนแบบภาพถ่ายมีแสงเงาจริงฝังใน texture อยู่แล้ว — ใช้วัสดุไม่รับแสง (MeshBasic) ไม่งั้นจะมืดซ้ำซ้อน
        root.traverse(m => {
          if (!m.isMesh) return;
          const old = m.material;
          m.material = new THREE.MeshBasicMaterial({ map: old.map || null, color: old.map ? 0xffffff : 0xdddddd });
          old.dispose();
        });
        const height = _fp3dPlaceScan(id, cfg, root);
        _fp3d.scansGroup.add(root);
        _fp3d.scanReady[id] = { height };
        if (document.getElementById('fp-3d')) _fp3dBuildRooms();
      }, undefined, err => console.warn('Floor Pulse 3D: โหลดสแกนห้อง ' + id + ' ไม่ได้ (' + cfg.url + ')', err));
    });
  }).catch(err => console.warn('Floor Pulse 3D: โหลด GLTFLoader ไม่ได้', err));
}

// วางโมเดลให้อยู่กลางห้อง พื้นสแกนแตะพื้นห้อง ย่อแบบคงสัดส่วนให้พอดีกรอบ FP_GEOM — คืนความสูงหลังย่อ
function _fp3dPlaceScan(id, cfg, root) {
  const T = THREE, g = FP_GEOM[id];
  root.rotation.y = cfg.rotY || 0;
  root.updateMatrixWorld(true);
  const size = new T.Box3().setFromObject(root).getSize(new T.Vector3());
  const s = Math.min((g.w - 6) / size.x, (g.h - 6) / size.z);
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(root);
  const c = box.getCenter(new T.Vector3());
  root.position.set(g.x + g.w / 2 - FP_VIEW.w / 2 - c.x, 4.2 - box.min.y, g.y + g.h / 2 - FP_VIEW.h / 2 - c.z);
  return box.max.y - box.min.y;
}

function _fp3dInit() {
  const T = THREE;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xffffff, 1);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(38, 1, 1, 5000);
  camera.position.set(0, 640, 620);

  const controls = new T.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 10);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.46;   // ไม่ให้มุดลงใต้พื้น
  controls.minDistance = 220;
  controls.maxDistance = 1600;
  controls.update();

  scene.add(new T.HemisphereLight(0xffffff, 0xcbd5e1, 0.9));
  const sun = new T.DirectionalLight(0xffffff, 0.5);
  sun.position.set(-300, 700, 400);
  scene.add(sun);

  // พื้นอาคาร (ขนาดเท่า viewBox ของผัง 2D — FP_VIEW) + เส้นกริดจางๆ
  const floor = new T.Mesh(new T.BoxGeometry(FP_VIEW.w + 20, 6, FP_VIEW.h + 20), new T.MeshLambertMaterial({ color: 0xf1f5f9 }));
  floor.position.y = -3;
  scene.add(floor);
  const grid = new T.GridHelper(FP_VIEW.w, 40, 0xe2e8f0, 0xe2e8f0);
  grid.scale.z = FP_VIEW.h / FP_VIEW.w;
  grid.position.y = 0.2;
  scene.add(grid);

  const roomsGroup = new T.Group();
  scene.add(roomsGroup);
  const scansGroup = new T.Group();   // โมเดลสแกนห้องจริง (FP3D_SCANS) — ไม่ถูกล้างตอนรีเฟรชข้อมูล
  scene.add(scansGroup);

  // คลิกเลือกห้อง — นับเป็นคลิกเฉพาะตอนเมาส์แทบไม่ขยับ (ไม่งั้นการลากหมุนกล้องจะเผลอเลือกห้อง)
  let downAt = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => {
    const moved = !downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5;
    downAt = null;
    if (moved) return;
    const ud = _fp3dPick(e);
    if (ud && ud.fpPerson) _fpShowPerson(ud.fpPerson);
    else if (ud && ud.fpId) _fpSelectRoom(ud.fpId);
  });
  el.addEventListener('pointermove', e => {
    if (e.buttons) return;
    const ud = _fp3dPick(e);
    el.style.cursor = ud && (ud.fpId || ud.fpPerson) ? 'pointer' : 'grab';
  });

  const ro = new ResizeObserver(() => _fp3dResize());
  _fp3d = { renderer, scene, camera, controls, roomsGroup, scansGroup, scanReady: {}, scansStarted: false,
    raycaster: new T.Raycaster(), pointer: new T.Vector2(), pickables: [], pulses: [], flowMovers: [], raf: null, ro };
}

function _fp3dPick(e) {
  const { renderer, camera, raycaster, pointer, pickables } = _fp3d;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // หุ่นอยู่ "ข้างใน" กล่องผนังโปร่งของห้อง รังสีจึงชนผนังห้องก่อนเสมอ — ถ้าแนวรังสีผ่านหุ่นตัวไหน ให้หุ่นชนะ
  const hits = raycaster.intersectObjects(pickables, false);
  const hit = hits.find(h => h.object.userData.fpPerson) || hits[0];
  return hit ? hit.object.userData : null;   // { fpId } = ห้อง/สถานี, { fpPerson } = หุ่นพนักงาน
}

function _fp3dResize() {
  if (!_fp3d) return;
  const host = _fp3d.renderer.domElement.parentNode;
  if (!host) return;
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  _fp3d.renderer.setSize(w, h, false);
  _fp3d.camera.aspect = w / h;
  _fp3d.camera.updateProjectionMatrix();
}

// วนวาดเฉพาะตอนหน้านี้เปิดอยู่ในโหมด 3D เท่านั้น — หยุดเองเมื่อสลับหน้า/สลับเป็น 2D/canvas หลุดจาก DOM
function _fp3dStartLoop() {
  if (!_fp3d || _fp3d.raf) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick = t => {
    const pageEl = document.getElementById('page-floorpulse');
    if (!_fp3d.renderer.domElement.isConnected || _fpViewMode !== '3d' || !pageEl || !pageEl.classList.contains('active')) {
      _fp3d.raf = null;
      return;
    }
    _fp3d.raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (!reduceMotion) {
      const k = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(t / 420));   // ห้องที่กำลังผลิต ผนังเต้นเบาๆ
      _fp3d.pulses.forEach(m => { m.opacity = k; });
      _fp3d.flowMovers.forEach(mv => mv.tick());   // จุดไข่ปลาเดินตามเส้นโฟลงาน (ดู _fp3dDottedPath)
    }
    _fp3d.controls.autoRotate = _fpTvMode && !reduceMotion;   // โหมดจอทีวี: กล้องหมุนรอบโรงงานช้าๆ
    _fp3d.controls.autoRotateSpeed = 0.5;
    _fp3d.controls.update();
    _fp3d.renderer.render(_fp3d.scene, _fp3d.camera);
  };
  _fp3d.raf = requestAnimationFrame(tick);
}

function _fp3dClearRooms() {
  const g = _fp3d.roomsGroup;
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
  });
  while (g.children.length) g.remove(g.children[0]);
  _fp3d.pickables = [];
  _fp3d.pulses = [];
  _fp3d.flowMovers = [];
}

function _fp3dHex(n) { return '#' + n.toString(16).padStart(6, '0'); }

// ป้ายชื่อห้องลอยเหนือห้อง — วาดลง canvas แล้วทำเป็น sprite (หันหน้าเข้ากล้องเสมอ อ่านง่ายทุกมุม)
function _fp3dLabel(title, sub, strokeHex, worldPerPx) {
  const S = 2;   // วาดใหญ่ 2 เท่าให้คมบนจอความละเอียดสูง
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const titleFont = `600 ${15 * S}px Sarabun, sans-serif`;
  const subFont = `500 ${12 * S}px 'IBM Plex Mono', Sarabun, monospace`;
  ctx.font = titleFont;
  const tw = ctx.measureText(title).width;
  ctx.font = subFont;
  const sw = sub ? ctx.measureText(sub).width : 0;
  const padX = 9 * S;
  const w = Math.ceil(Math.max(tw, sw) + padX * 2), h = (sub ? 44 : 26) * S;
  cv.width = w;
  cv.height = h;
  const r = 7 * S;
  ctx.beginPath();
  ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r); ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h); ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.lineWidth = 1.5 * S;
  ctx.strokeStyle = strokeHex;
  ctx.stroke();
  ctx.textBaseline = 'top';
  ctx.font = titleFont;
  ctx.fillStyle = '#1e293b';
  ctx.fillText(title, padX, 5 * S);
  if (sub) {
    ctx.font = subFont;
    ctx.fillStyle = '#64748b';
    ctx.fillText(sub, padX, 25 * S);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(w * worldPerPx / S, h * worldPerPx / S, 1);
  sp.renderOrder = 10;
  return sp;
}

// สร้างห้อง 1 ห้อง: พื้น + ผนังโปร่ง + เส้นขอบ + เสาแสดง % + หุ่นพนักงาน + ป้ายชื่อ
// o.id = null คือกรอบที่คลิกไม่ได้ (กรอบนอกห้องบรรจุหีบห่อ), o.small = สถานีย่อยในห้องบรรจุหีบห่อ
function _fp3dAddRoom(o) {
  const T = THREE, g = _fp3d.roomsGroup;
  const active = o.monitored && o.status !== 'idle';
  const c = active ? (FP3D_COLORS[o.status] || FP3D_COLORS.muted) : FP3D_COLORS.muted;
  const cx = o.x + o.w / 2 - FP_VIEW.w / 2, cz = o.y + o.h / 2 - FP_VIEW.h / 2;
  // ห้องที่มีสแกนจริงโหลดเสร็จแล้ว: ผนังโปร่งซ่อนไว้ (ยังคลิกได้ — raycast ไม่สนใจ material.visible) ใช้ความ
  // สูงของสแกนแทน ให้เส้นขอบสีสถานะ/ป้ายชื่อครอบตัวโมเดลพอดี
  const scanned = o.id && _fp3d.scanReady[o.id];
  const W = o.w - 6, D = o.h - 6, H = scanned ? scanned.height : o.height;

  if (!o.noSlab) {
    const slab = new T.Mesh(new T.BoxGeometry(W, 4, D), new T.MeshLambertMaterial({ color: c.fill }));
    slab.position.set(cx, 2, cz);
    g.add(slab);
    if (o.id) { slab.userData.fpId = o.id; _fp3d.pickables.push(slab); }
  }

  const wallMat = new T.MeshLambertMaterial({ color: c.stroke, transparent: true, opacity: active ? 0.14 : 0.05, depthWrite: false });
  if (scanned) wallMat.visible = false;
  const box = new T.Mesh(new T.BoxGeometry(W, H, D), wallMat);
  box.position.set(cx, 4 + H / 2, cz);
  g.add(box);
  if (o.id) { box.userData.fpId = o.id; _fp3d.pickables.push(box); }
  if (o.status === 'running') _fp3d.pulses.push(wallMat);

  const edges = new T.LineSegments(new T.EdgesGeometry(box.geometry),
    new T.LineBasicMaterial({ color: c.stroke, transparent: true, opacity: o.selected ? 1 : (active ? 0.85 : 0.4) }));
  edges.position.copy(box.position);
  g.add(edges);

  if (o.selected) {
    const ring = new T.Mesh(new T.PlaneGeometry(W + 14, D + 14),
      new T.MeshBasicMaterial({ color: active ? c.stroke : 0x0d9488, transparent: true, opacity: 0.22, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.6, cz);
    g.add(ring);
  }

  // เสาความคืบหน้า (สูงสุด = ครบแผน) ที่มุมห้อง — เฉพาะห้องเดี่ยวที่มีงาน
  if (active && !o.small) {
    const pillarH = 70, px = cx + W / 2 - 14, pz = cz + D / 2 - 14;
    const track = new T.Mesh(new T.CylinderGeometry(5, 5, pillarH, 16),
      new T.MeshLambertMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.55, depthWrite: false }));
    track.position.set(px, 4 + pillarH / 2, pz);
    g.add(track);
    const fillH = Math.max(1, pillarH * o.pct / 100);
    const fill = new T.Mesh(new T.CylinderGeometry(5.6, 5.6, fillH, 16), new T.MeshLambertMaterial({ color: c.stroke }));
    fill.position.set(px, 4 + fillH / 2, pz);
    g.add(fill);
  }

  // พนักงานในไลน์ = หุ่นการ์ตูนตามเพศจริง (employees.Gender) + ป้ายชื่อ — สแกนเข้าแล้ว = สีชุดเต็ม ขยับทำงาน/
  // เดินในห้อง, อยู่ในแผนแต่ยังไม่สแกนเข้า = หุ่นเทาโปร่งยืนนิ่ง (ดู _fp3dMakePerson)
  const roster = (o.roster || []).slice(0, 14);
  const cols = Math.max(1, Math.floor((W - 34) / 18));
  const bounds = { x0: cx - W / 2 + 8, x1: cx + W / 2 - 8, z0: cz - D / 2 + 6, z1: cz + D / 2 - 6 };
  roster.forEach((p, i) => {
    const row = Math.floor(i / cols);
    const wx = cx - W / 2 + 16 + (i % cols) * 18;
    const wz = D < 50 ? cz : cz - D / 2 + 20 + row * 20;
    _fp3dMakePerson(p, wx, wz, bounds, o.small);
  });

  const label = _fp3dLabel(o.title, o.sub, _fp3dHex(c.stroke), o.small ? 0.32 : 0.5);
  label.position.set(cx, 4 + H + (o.labelLift || (o.small ? 7 : 16)), cz);
  g.add(label);
  // แจ้งเตือนข้อมูลไม่สอดคล้อง (_fpComputeAlerts) — ป้ายแดง/ส้มลอยเหนือชื่อห้อง ข้อความแรก + จำนวนที่เหลือ
  if (o.alerts && o.alerts.length) {
    const lvl = _fpAlertLevel(o.alerts);
    const more = o.alerts.length > 1 ? ` (+${o.alerts.length - 1})` : '';
    const warn = _fp3dLabel(`⚠ ${o.alerts[0].text}${more}`, '', lvl === 'danger' ? '#dc2626' : '#f59e0b', o.small ? 0.26 : 0.34);
    warn.position.set(cx, label.position.y + (o.small ? 9 : 16), cz);
    g.add(warn);
  }
}

// หุ่นการ์ตูนพนักงาน 1 คน (เพิ่ม 2026-10-18 คำขอ "แสดง Animation พนักงานที่อยู่แต่ละไลน์ ขึ้นป้ายชื่อด้วย การ์ตูน
// ผู้หญิง ผู้ชายตามพนักงานจริง") — เพศมาจาก employees.Gender ('F'/'M') เท่านั้น ห้ามเดาจากชื่อ ถ้ายังไม่ระบุ =
// หุ่นกลางๆ สวมหมวกคลุมผมสีขาว ทุกคนใส่ชุดยูนิฟอร์มสีชมพูเหมือนกัน แยกเพศด้วยทรงผม/ทรงชุดเท่านั้น
// (ผัง 2D ใช้หุ่นหน้าตาเดียวกันแบบแบน — ดู _fpSvgPerson)
// สแกนเข้าแล้ว: เดินไปมาในห้อง (เดิน = ขาก้าว, หยุด = แขนขยับทำงาน) + ป้ายชื่อตามตัว
// ยังไม่สแกนเข้า: หุ่นเทาโปร่งยืนนิ่งที่จุดประจำ — สื่อว่า "อยู่ในแผน แต่ยังไม่มาจริง"
function _fp3dMakePerson(p, homeX, homeZ, bounds, small) {
  const T = THREE, g = _fp3d.roomsGroup;
  const ghost = !p.confirmed;
  const mat = (color) => new T.MeshLambertMaterial(ghost
    ? { color: 0xa8b3c2, transparent: true, opacity: 0.45, depthWrite: false }
    : { color });
  // ชุดยูนิฟอร์มสีชมพูตามที่ผู้ใช้ขอ (2026-10-18) — ใช้ค่าเดียวกับหุ่นในผัง 2D (FP_PERSON_COLORS)
  const skin = mat(0xf2c9a0), uniform = mat(0xec4899), pants = mat(0x1e3a5f), hair = mat(0x3b2a20), eye = mat(0x1f2937);
  const S = small ? 0.75 : 1;   // สถานีย่อยในห้องหีบห่อแคบ ย่อหุ่นลงหน่อย

  const person = new T.Group();
  const add = (geo, m, x, y, z) => { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); person.add(mesh); return mesh; };
  // ขา (pivot ที่สะโพก ให้แกว่งตอนเดิน)
  const legs = [-1.5, 1.5].map(x => {
    const pivot = new T.Group(); pivot.position.set(x, 7, 0); person.add(pivot);
    const leg = new T.Mesh(new T.CylinderGeometry(1.1, 1.1, 7, 8), pants); leg.position.y = -3.5; pivot.add(leg);
    return pivot;
  });
  // ลำตัว: หญิง = ชุดทรงเอ (บนแคบล่างบาน), ชาย/ไม่ระบุ = ทรงกระบอกตรง
  if (p.gender === 'F') add(new T.CylinderGeometry(2.6, 4.4, 8.5, 14), uniform, 0, 11, 0);
  else add(new T.CylinderGeometry(3.3, 3.5, 8.5, 14), uniform, 0, 11, 0);
  // แขน (pivot ที่ไหล่ ให้ขยับตอนทำงาน)
  const arms = [-1, 1].map(side => {
    const pivot = new T.Group(); pivot.position.set(side * (p.gender === 'F' ? 3.2 : 3.9), 14.5, 0); person.add(pivot);
    const arm = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 6.5, 8), uniform); arm.position.y = -3.2; pivot.add(arm);
    const hand = new T.Mesh(new T.SphereGeometry(1.1, 8, 6), skin); hand.position.y = -6.6; pivot.add(hand);
    return pivot;
  });
  // หัว + ตา (หน้าหันไปทาง +z ของตัวเอง)
  add(new T.SphereGeometry(4.2, 18, 14), skin, 0, 19.6, 0);
  add(new T.SphereGeometry(0.55, 8, 6), eye, -1.4, 20.1, 3.85);
  add(new T.SphereGeometry(0.55, 8, 6), eye, 1.4, 20.1, 3.85);
  // ผม: หญิง = ผมยาวคลุมหลังลงถึงไหล่ + มวยด้านหลัง, ชาย = ผมสั้นครอบหัว, ไม่ระบุ = หมวกคลุมผมสีขาว
  const capGeo = new T.SphereGeometry(4.5, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  if (p.gender === 'F') {
    const cap = add(capGeo, hair, 0, 19.8, -0.2); cap.rotation.x = -0.25;
    add(new T.CylinderGeometry(4.0, 4.6, 7, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8), hair, 0, 17.4, -0.4).rotation.y = Math.PI;
    add(new T.SphereGeometry(2.0, 10, 8), hair, 0, 22.5, -4.0);
  } else if (p.gender === 'M') {
    const cap = add(capGeo, hair, 0, 20.2, -0.3); cap.rotation.x = -0.35;
  } else {
    const cap = add(capGeo, mat(0xf8fafc), 0, 20.3, -0.2); cap.rotation.x = -0.3;
  }
  // กล่องคลิกล่องหนครอบตัวหุ่น — คลิกหุ่น = ดูรายละเอียดพนักงาน (raycast ไม่สนใจ visible:false ของวัสดุ)
  if (p.code) {
    const hit = new T.Mesh(new T.BoxGeometry(10, 27, 10), new T.MeshBasicMaterial({ visible: false }));
    hit.position.y = 13;
    hit.userData.fpPerson = p.code;
    person.add(hit);
    _fp3d.pickables.push(hit);
  }
  person.scale.setScalar(S);
  person.position.set(homeX, 4, homeZ);
  person.rotation.y = Math.random() * Math.PI * 2;
  g.add(person);

  // ป้ายชื่อเหนือหัว (ตามตัวไปด้วยตอนเดิน)
  const tag = _fp3dLabel(p.name, ghost ? 'ยังไม่สแกนเข้า' : '', ghost ? '#94a3b8' : '#0f766e', 0.22);
  tag.position.set(homeX, 4 + 29 * S, homeZ);
  if (ghost) tag.material.opacity = 0.7;
  g.add(tag);

  if (ghost) return;
  // เดินสุ่มภายในห้อง: เลือกจุดใหม่ใกล้ๆ จุดประจำ เดินไป แล้วหยุดทำงานสักพัก — ขยับเฉพาะใน render loop
  const clampX = x => Math.min(bounds.x1, Math.max(bounds.x0, x)), clampZ = z => Math.min(bounds.z1, Math.max(bounds.z0, z));
  const pickTarget = () => ({ x: clampX(homeX + (Math.random() - 0.5) * 30), z: clampZ(homeZ + (Math.random() - 0.5) * 22) });
  let target = pickTarget(), pause = Math.random() * 120, phase = Math.random() * 10;
  _fp3d.flowMovers.push({ tick: () => {
    phase += 0.12;
    const dx = target.x - person.position.x, dz = target.z - person.position.z, dist = Math.hypot(dx, dz);
    if (pause > 0) {
      pause--;
      arms.forEach((a, i) => { a.rotation.x = -0.9 + Math.sin(phase * 1.6 + i * Math.PI) * 0.35; });   // ทำงานมือ
      legs.forEach(l => { l.rotation.x = 0; });
      person.position.y = 4 + Math.abs(Math.sin(phase * 0.8)) * 0.15;
      if (pause <= 0) target = pickTarget();
    } else if (dist < 0.6) {
      pause = 90 + Math.random() * 200;
    } else {
      const step = Math.min(dist, 0.28);
      person.position.x += dx / dist * step;
      person.position.z += dz / dist * step;
      person.rotation.y = Math.atan2(dx, dz);
      legs.forEach((l, i) => { l.rotation.x = Math.sin(phase * 2 + i * Math.PI) * 0.6; });
      arms.forEach((a, i) => { a.rotation.x = Math.sin(phase * 2 + i * Math.PI + Math.PI) * 0.45; });
      person.position.y = 4 + Math.abs(Math.sin(phase * 2)) * 0.5;
    }
    tag.position.set(person.position.x, 4 + 29 * S, person.position.z);
  } });
}

function _fp3dRoomOpts(id, g, r, title, idleSub) {
  const monitored = !!r, status = r ? r.status : 'idle';
  const active = monitored && status !== 'idle';
  const pct = active && r.planned > 0 && r.actual != null ? Math.min(100, Math.round(r.actual / r.planned * 100)) : 0;
  const sub = active
    ? `${r.isLiveScan ? 'สแกนสด ' : ''}${(r.actual ?? 0).toLocaleString()} / ${r.planned.toLocaleString()} ${(r.item && r.item.UOM) || ''} · ${pct}%${r.eta ? ` · เสร็จ ~${_fpEtaLabel(r.eta.eta)}` : ''}`
    : monitored ? 'ว่าง/ไม่มีแผนวันนี้' : (idleSub || '');
  return { id, x: g.x, y: g.y, w: g.w, h: g.h, height: active ? 46 : 24, status, monitored, title, sub, pct,
    roster: active ? (r.roster || []) : [], selected: _fpSelectedId === id, alerts: r ? (r.alerts || []) : [] };
}

// ทางเดิน (พื้นสีอ่อน+ป้าย), ประตู (บานสีเข้มบนแนวผนัง) และลูกศรทางเข้า-ออก — ชุดข้อมูลเดียวกับผัง 2D
function _fp3dBuildCirculation() {
  const T = THREE, g = _fp3d.roomsGroup, ox = FP_VIEW.w / 2, oz = FP_VIEW.h / 2;
  FP_WALKWAYS.forEach(wk => {
    const cx = wk.x + wk.w / 2 - ox, cz = wk.y + wk.h / 2 - oz;
    const plane = new T.Mesh(new T.PlaneGeometry(wk.w - 2, wk.h - 2), new T.MeshBasicMaterial({ color: 0xf8fafc }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, 0.8, cz);
    g.add(plane);
    const edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(wk.w - 2, 0.1, wk.h - 2)),
      new T.LineBasicMaterial({ color: 0xcbd5e1 }));
    edge.position.set(cx, 0.9, cz);
    g.add(edge);
    const lbl = _fp3dLabel(wk.label, '', '#cbd5e1', 0.3);
    lbl.position.set(cx, 8, (wk.ly || (wk.y + wk.h / 2)) - oz);
    g.add(lbl);
  });
  const doorMat = new T.MeshLambertMaterial({ color: 0x475569, transparent: true, opacity: 0.75 });
  FP_DOORS.forEach(d => {
    const h = d.o === 'h';
    const door = new T.Mesh(new T.BoxGeometry(h ? d.w : 2.5, 20, h ? 2.5 : d.w), doorMat);
    door.position.set(d.x - ox, 4 + 10, d.y - oz);
    g.add(door);
  });
  const arrowMat = new T.MeshBasicMaterial({ color: 0x0f766e, side: T.DoubleSide });
  FP_ENTRANCES.forEach(e => {
    const shape = new T.Shape();
    shape.moveTo(0, 9); shape.lineTo(7, 0); shape.lineTo(2.5, 0); shape.lineTo(2.5, -9);
    shape.lineTo(-2.5, -9); shape.lineTo(-2.5, 0); shape.lineTo(-7, 0); shape.closePath();
    const arrow = new T.Mesh(new T.ShapeGeometry(shape), arrowMat);
    arrow.rotation.x = -Math.PI / 2;                           // วางราบกับพื้น (แกน +y ของรูป = -z ของฉาก)
    arrow.rotation.z = Math.atan2(-e.dx, -e.dy);               // หมุนให้ชี้ตามทิศ dx/dy (2D: +y ลงล่าง)
    arrow.position.set(e.x - ox, 1.2, e.y - oz);
    g.add(arrow);
    const lbl = _fp3dLabel(e.label, '', '#0f766e', 0.3);
    lbl.position.set(e.x - ox, 14, e.y - oz);
    g.add(lbl);
  });
}

// ── เส้นโฟลงานตามแผนผลิต (3D เท่านั้น, 2026-10-17) — ผู้ใช้ขอ "แสดงเส้นโฟลงาน จากไหนไปไหน" แล้วยืนยันว่า
// หมายถึง "ลำดับงานตามแพลน เช่น ห้องบรรจุ ไปห้องยิงล็อต ไปห้องแพ็ค" (เวอร์ชันแรกวาดเส้นทางมาตรฐานตายตัว
// ตามหน้าที่ห้อง ซึ่งผิดความต้องการ — ยกเลิกไปแล้ว) — 1 งานในแผน = หลายแถว production_plan (ไลน์บรรจุ/ยิง Lot/
// แพ็ค) จับกลุ่มด้วย _fpFlowJobKey แล้วเรียงตามวันที่+เวลาเริ่มในแผนจริง (งานขวดบางตัวยิง Lot ก่อนบรรจุ 1 วัน
// ลำดับจึงต้องมาจากแผน ไม่ใช่ตายตัว) แสดงเฉพาะงานที่กำลังอยู่บนพื้นโรงงานตอนนี้ (เป็น item ปัจจุบันของไลน์ใด
// ไลน์หนึ่งใน _fpData) — เส้นวิ่งจากขั้นที่ 1 → 2 → 3 ป้ายลอยบนแต่ละขั้นบอกลำดับ+สถานะ
const FP_FLOW_COLORS = [0x2563eb, 0xd97706, 0xdb2777, 0x7c3aed, 0x0d9488, 0x16a34a, 0xdc2626, 0x0891b2];
const FP_FLOW_MAX_JOBS = 8;
let _fpFlowOn = (() => { try { return localStorage.getItem('fpFlowOn') !== '0'; } catch (e) { return true; } })();
let _fpFlowJobs = [];   // ผลจาก _fpBuildFlowJobs() รอบล่าสุด — ใช้ร่วมกันระหว่างเส้นในฉากกับคำอธิบายมุมซ้ายบน

function _fpToggleFlow() {
  _fpFlowOn = !_fpFlowOn;
  try { localStorage.setItem('fpFlowOn', _fpFlowOn ? '1' : '0'); } catch (e) {}
  if (_fp3d) { _fp3dBuildRooms(); _fp3dRenderFlowLegend(); }
}

function _fpFlowJobKey(r) {
  return r.BatchRef || (r.MO_Ref ? `MO|${r.MO_Ref}` : `${r.PlanDate}|${r.ProductCode}`);
}

// จุดบนผังของไลน์ใน PLAN_LINES — ไลน์บรรจุ = กลางห้องนั้น, ไลน์แพ็ค/ยิง Lot = กลางสถานีย่อยในห้องบรรจุหีบห่อ
// (คำนวณตำแหน่งสถานีแบบเดียวกับ _fpBuildPackRoom/_fp3dBuildPackRoom)
function _fpLinePoint(line, moRef) {
  // งานแพ็คที่เลือกตอนสแกนว่าใช้ห้องอื่น → จุดอยู่ในห้องนั้นแทน (ดูจากสแกนของ MO งานนี้เอง ถ้าส่ง moRef มา)
  const moved = moRef !== undefined ? _fpPackRoomFor(line, moRef) : _fpPackLineRoom(line);
  if (moved) { const g = FP_GEOM[moved]; return { x: g.x + g.w / 2, y: g.y + g.h / 2, label: `${FP_ROOM_LABEL[moved]} (${_fpPackSubLabel(line)})` }; }
  const roomId = Object.keys(FP_ROOM_LINE).find(id => FP_ROOM_LINE[id] === line);
  if (roomId) { const g = FP_GEOM[roomId]; return { x: g.x + g.w / 2, y: g.y + g.h / 2, label: FP_ROOM_LABEL[roomId] }; }
  const i = FP_PACK_SUBLINES.findIndex(s => s.line === line);
  if (i < 0) return null;
  const g = FP_GEOM.packbox, slotH = (g.h - 24) / FP_PACK_SUBLINES.length;
  return { x: g.x + g.w / 2, y: g.y + 24 + i * slotH + (slotH - 4) / 2, label: FP_PACK_SUBLINES[i].label };
}

// ขั้นนี้เสร็จหรือยัง — ยอดสแกนสดของ (MO, ไลน์นี้) ถึงยอดสั่งผลิต หรือ MO ปิดแล้ว (หลักเดียวกับ _planLineFinished)
function _fpFlowStepDone(row) {
  if (!row.MO_Ref) return false;
  const mo = _prodStatusMOAllData.find(m => m.MO_ID === row.MO_Ref);
  if (mo && _moDoneStatuses.includes(mo.Status)) return true;
  const prog = _prodStatusProgressData[`${row.MO_Ref}|${row.Line}`];
  const target = (mo && parseFloat(mo.OrderQty)) || parseFloat(row.PlanQty) || 0;
  return !!prog && target > 0 && (parseFloat(prog.Qty) || 0) >= target;
}

// ขั้นนี้ "กำลังทำจริง" หรือยัง — ใช้เวลาที่ย้อนดูอยู่แทนเวลาปัจจุบันถ้ากำลังย้อนดู
// working = ถึงเวลาเริ่มกะของแถวแผนแล้ว และมีสแกนยอดของ (MO, ไลน์) ตั้งแต่เริ่มกะนั้น (ไม่นับสแกนเก่าจากวันก่อน)
function _fpFlowStepWorking(rows, line) {
  const nowT = _fpReplayAt || new Date();
  const fmt = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const starts = rows.map(r => _fpTimeOnDate(r.PlanDate, r.TimeStart) || _fpTimeOnDate(r.PlanDate, '00:00')).filter(Boolean);
  const started = starts.filter(t => t <= nowT);
  if (!started.length) {
    const next = starts.sort((a, b) => a - b)[0];
    return { working: false, note: next ? `รอเริ่มกะ ${fmt(next)}` : 'รอเริ่ม' };
  }
  const since = started.sort((a, b) => b - a)[0];   // กะล่าสุดที่เริ่มไปแล้ว
  const moRef = rows[0] && rows[0].MO_Ref;
  const hist = moRef ? (_prodStatusProgressHist[`${moRef}|${line}`] || []) : [];
  const scanned = hist.some(h => { const t = new Date(h.CreatedAt); return t >= since && t <= nowT; });
  return scanned ? { working: true, note: '' } : { working: false, note: 'เริ่มกะแล้ว ยังไม่มีสแกน' };
}

function _fpBuildFlowJobs() {
  const seen = new Set();
  const rows = [..._prodStatusPlanWeekData, ..._prodStatusPlanAllData].filter(r => !seen.has(r._row_id) && seen.add(r._row_id));
  const byJob = {};
  rows.forEach(r => { (byJob[_fpFlowJobKey(r)] ||= []).push(r); });

  // งานที่อยู่บนพื้นโรงงานตอนนี้ = item ปัจจุบันของไลน์ใดไลน์หนึ่ง (ไม่นับไลน์ว่าง) เรียงงานที่ "กำลังทำ" ขึ้นก่อน
  const current = [];
  PLAN_LINES.forEach(line => {
    const r = _fpData[line];
    if (!r || r.status === 'idle' || !r.item) return;
    const key = _fpFlowJobKey(r.item);
    const live = r.status === 'running' || r.status === 'behind';
    const ex = current.find(c => c.key === key);
    if (ex) { ex.live = ex.live || live; ex.liveLines.push(live ? line : null); }
    else current.push({ key, live, liveLines: [live ? line : null], item: r.item });
  });
  current.sort((a, b) => (b.live - a.live));
  const catOrder = { fill: 0, lot: 1, pack: 2 };

  return current.slice(0, FP_FLOW_MAX_JOBS).map((c, idx) => {
    const jobRows = (byJob[c.key] || [c.item]).slice().sort((a, b) =>
      (a.PlanDate || '').localeCompare(b.PlanDate || '') ||
      (a.TimeStart || '').localeCompare(b.TimeStart || '') ||
      ((catOrder[_planLineCategoryOf(a.Line)] ?? 9) - (catOrder[_planLineCategoryOf(b.Line)] ?? 9)));
    // ไลน์เดียวกันหลายวันติดกัน (แผนหลายวัน) รวมเป็นขั้นเดียว
    const steps = [];
    jobRows.forEach(r => {
      const pt = _fpLinePoint(r.Line, r.MO_Ref || null);
      if (!pt) return;
      const last = steps[steps.length - 1];
      if (last && last.line === r.Line) { last.rows.push(r); return; }
      steps.push({ line: r.Line, pt, rows: [r] });
    });
    // "กำลังทำ" จริง = ไลน์นั้นกำลังโชว์งานนี้อยู่ + ถึงเวลากะของแผนแล้ว + มีสแกนอัปเดตยอดตั้งแต่เริ่มกะ (คำขอผู้ใช้
    // 2026-10-19 "งานที่อยู่กะบ่าย หรือยังไม่มีการสแกนอัพเดต ยังไม่ต้องมีเส้นวิ่ง ป้องกันสับสนว่ากำลังทำอยู่") —
    // ไม่ครบเงื่อนไข = 'pending' (ป้ายบอกว่ารอเริ่มกะ/ยังไม่มีสแกน) เส้นที่วิ่งเข้าขั้นนั้นนิ่งจางแทน
    steps.forEach(s => {
      const done = s.rows.every(_fpFlowStepDone);
      const onLine = c.liveLines.includes(s.line);
      const w = onLine && !done ? _fpFlowStepWorking(s.rows, s.line) : null;
      s.state = done ? 'done' : (w && w.working ? 'now' : (onLine ? 'pending' : 'wait'));
      s.note = w && !w.working ? w.note : '';
    });
    c.live = steps.some(s => s.state === 'now');
    return { key: c.key, live: c.live, color: FP_FLOW_COLORS[idx % FP_FLOW_COLORS.length],
      mo: c.item.MO_Ref || '', product: c.item.ProductName || c.item.ProductCode || '', steps };
  }).sort((a, b) => b.live - a.live);   // งานที่กำลังทำจริงขึ้นก่อนในคำอธิบาย
}

function _fp3dRenderFlowLegend() {
  const host = document.getElementById('fp-3d');
  if (!host || !_fp3d || _fp3d.renderer.domElement.parentNode !== host) return;
  let el = host.querySelector('.fp-flow-legend');
  if (!el) { el = document.createElement('div'); el.className = 'fp-flow-legend'; host.appendChild(el); }
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  let rows = '';
  if (_fpFlowOn) {
    rows = _fpFlowJobs.length
      ? _fpFlowJobs.map(j => `<div class="fp-flow-row" style="align-items:flex-start">
          <span class="fp-flow-sw" style="background:${_fp3dHex(j.color)};margin-top:7px"></span>
          <div><b>${esc(j.mo || 'ไม่มี MO')}</b> ${esc(j.product)}<br>
          <span style="color:var(--fp-text-dim)">${j.steps.map(s => esc(s.pt.label) + (s.state === 'done' ? ' ✓' : '')).join(' → ')}</span></div></div>`).join('')
        + '<div class="fp-flow-note">เรียงตามวัน/เวลาในแผนผลิต · ✓ = ขั้นนั้นเสร็จแล้ว</div>'
      : '<div class="fp-flow-note">ตอนนี้ไม่มีงานบนพื้นโรงงาน</div>';
  }
  el.innerHTML = `<button type="button" aria-pressed="${_fpFlowOn}" onclick="_fpToggleFlow()">${_fpFlowOn ? 'ซ่อน' : 'แสดง'}เส้นโฟลงาน</button>${rows}`;
}

// เส้นโค้งลอยข้ามผนังระหว่างขั้นที่ติดกันของงานเดียวกัน (ไม่เดินตามทางเดินจริง เพราะหลายงานจะซ้อนกันในทางเดิน
// 2 ม. จนอ่านไม่ออก) + หัวลูกศร + จุดวิ่งตามทิศทาง (เฉพาะงานที่กำลังทำ) + ป้ายลำดับ/สถานะลอยเหนือแต่ละขั้น
function _fp3dBuildFlows() {
  _fpFlowJobs = _fpBuildFlowJobs();
  if (!_fpFlowOn) return;
  const T = THREE, g = _fp3d.roomsGroup, ox = FP_VIEW.w / 2, oz = FP_VIEW.h / 2;
  const stateText = { done: 'เสร็จ', now: 'กำลังทำ', wait: 'รอ' };
  _fpFlowJobs.forEach((job, ji) => {
    const hex = _fp3dHex(job.color);
    const lift = ji * 7;   // แต่ละงานโค้งสูงต่างกัน กันเส้นของ 2 งานที่ผ่านห้องเดียวกันทับกันสนิท
    job.steps.forEach((s, si) => {
      const lbl = _fp3dLabel(`${si + 1}. ${s.pt.label}`, s.state === 'pending' ? s.note : stateText[s.state], hex, 0.28);
      lbl.position.set(s.pt.x - ox, 70 + lift + (si % 2) * 10, s.pt.y - oz);
      if (s.state === 'done' || s.state === 'pending' || s.state === 'wait') lbl.material.opacity = s.state === 'done' ? 0.55 : 0.75;
      g.add(lbl);
    });
    for (let i = 0; i < job.steps.length - 1; i++) {
      const route = _fpFlowRoute(job.steps[i].line, job.steps[i + 1].line, ji, _fpFlowJobs.length, job.mo || null);
      if (!route) continue;
      // วิ่งเฉพาะเส้นที่ต่อกับขั้นที่ "กำลังทำจริง" (ถึงกะแล้ว + มีสแกน) — ทั้งเส้นที่เข้าขั้นนั้น (ของเข้ามา) และเส้นที่
      // ออกจากขั้นนั้นไปขั้นถัดไป (ของที่ทำเสร็จกำลังไหลต่อ) ยกเว้นขั้นปลายทางเสร็จไปแล้ว — ที่เหลือแค่เส้นจางนิ่ง
      const src = job.steps[i], dst = job.steps[i + 1];
      const bright = (src.state === 'now' || dst.state === 'now') && dst.state !== 'done';
      _fp3dDottedPath(route, job.color, bright);
    }
  });
}

// ── เส้นทางเดินจริงบนผัง (2026-10-17 ผู้ใช้ขอ "อนิเมชั่นจุดไข่ปลาเดินบนทางจริงๆ" แทนเส้นโค้งลอยข้ามผนัง) ──
// แต่ละไลน์มี "ทางออก" = ลำดับจุดจากกลางห้อง → ประตู → จุดบนแนวกลางทางเดินหลัก (ตรงกับ FP_DOORS/FP_WALKWAYS)
// เส้นทาง A→B = ทางออกของ A + วิ่งตามแนวทางเดินหลัก + ทางออกของ B แบบกลับด้าน ถ้าอยู่ห้องเดียวกัน (สถานีใน
// ห้องบรรจุหีบห่อ เช่น ยิง Lot → แพ็ค) เดินภายในห้องตรงๆ ไม่ออกทางเดิน
const FP_CORRIDOR_Y = 195.5;
const FP_LINE_EXITS = {
  'ห้องบรรจุน้ำมัน Aroma':     [{ x:712, y:101 }, { x:689, y:120 }, { x:689, y:163 }, { x:689, y:FP_CORRIDOR_Y }],
  'ห้องผสมใหญ่':              [{ x:580, y:368 }, { x:627, y:368 }, { x:627, y:317 }, { x:620, y:300 }, { x:612, y:240 }, { x:612, y:228 }, { x:612, y:FP_CORRIDOR_Y }],
  'ห้องบรรจุแชมพูครีมอาบน้ำ': [{ x:528, y:272 }, { x:570, y:290 }, { x:588, y:290 }, { x:618, y:290 }, { x:612, y:240 }, { x:612, y:228 }, { x:612, y:FP_CORRIDOR_Y }],
  'ห้องบรรจุครีมโลชั่น':       [{ x:706, y:272 }, { x:670, y:253 }, { x:653, y:253 }, { x:624, y:253 }, { x:612, y:228 }, { x:612, y:FP_CORRIDOR_Y }],
};
// สถานีในห้องบรรจุหีบห่อ: ออกทางประตูห้อง (445,163) — คำนวณจากตำแหน่งสถานีจริง
// ทางออกของห้องที่ใช้แพ็คแทนได้ (ประตูอยู่ผนังล่างลงทางเดินหลักทุกห้อง — ตรงกับ FP_DOORS)
const FP_ALT_PACK_DOOR_X = { weigh: 296, bulk: 363, mixoil: 591 };
function _fpLineExit(line, moRef) {
  const moved = _fpPackRoomFor(line, moRef);
  if (moved && FP_ALT_PACK_DOOR_X[moved]) {
    const g = FP_GEOM[moved], dx = FP_ALT_PACK_DOOR_X[moved];
    return [{ x: g.x + g.w / 2, y: g.y + g.h / 2 }, { x: dx, y: 135 }, { x: dx, y: 163 }, { x: dx, y: FP_CORRIDOR_Y }];
  }
  if (FP_LINE_EXITS[line]) return FP_LINE_EXITS[line];
  const pt = _fpLinePoint(line, null);
  if (!pt) return null;
  return [{ x: pt.x + 30, y: pt.y }, { x: 445, y: pt.y }, { x: 445, y: 163 }, { x: 445, y: FP_CORRIDOR_Y }];
}

function _fpFlowRoute(lineA, lineB, jobIdx, jobCount, moRef) {
  const ea = _fpLineExit(lineA, moRef), eb = _fpLineExit(lineB, moRef);
  if (!ea || !eb) return null;
  // "อยู่ห้องบรรจุหีบห่อจริง" = เป็นสถานีในห้องนั้น และไม่ได้ย้ายไปใช้ห้องอื่น
  const inPackbox = l => FP_PACK_SUBLINES.some(s => s.line === l) && !_fpPackRoomFor(l, moRef);
  const packA = inPackbox(lineA), packB = inPackbox(lineB);
  if (packA && packB) return [ea[0], { x: 470, y: ea[0].y }, { x: 470, y: eb[0].y }, eb[0]];
  // แต่ละงานเดินคนละเลนในทางเดินหลัก (เยื้องกันเล็กน้อย) กันจุดของหลายงานทับกันเป็นเส้นเดียว
  const lane = (jobIdx - (jobCount - 1) / 2) * 6;
  const shift = p => (p.y === FP_CORRIDOR_Y ? { x: p.x, y: p.y + lane } : p);
  return [...ea.map(shift), ...eb.slice().reverse().map(shift)];
}

// วาดจุดไข่ปลาบนพื้นตามเส้นทาง (polyline) — InstancedMesh ก้อนเดียวต่อเส้น ขยับทุกเฟรมด้วย tick() ให้จุดเดิน
// จากต้นทางไปปลายทาง (bright) หรือนิ่งจางๆ (ขั้นที่เสร็จแล้ว/งานที่ยังไม่เริ่ม) + หัวลูกศรแบนที่ปลายทาง
function _fp3dDottedPath(route, color, bright) {
  const T = THREE, g = _fp3d.roomsGroup, ox = FP_VIEW.w / 2, oz = FP_VIEW.h / 2, Y = 4.8;
  const pts = route.map(p => new T.Vector3(p.x - ox, Y, p.y - oz))
    .filter((p, i, arr) => i === 0 || p.distanceTo(arr[i - 1]) > 0.5);
  if (pts.length < 2) return;
  const path = new T.CurvePath();
  for (let i = 0; i < pts.length - 1; i++) path.add(new T.LineCurve3(pts[i], pts[i + 1]));
  const length = path.getLength();
  const spacing = 9, count = Math.max(2, Math.floor(length / spacing));
  const dotGeo = new T.CircleGeometry(bright ? 2.4 : 1.8, 10);
  dotGeo.rotateX(-Math.PI / 2);
  const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: bright ? 0.95 : 0.35, depthWrite: false });
  const inst = new T.InstancedMesh(dotGeo, mat, count);
  inst.renderOrder = 5;
  inst.frustumCulled = false;   // bounding sphere ของ InstancedMesh อิงตัว geometry ที่จุดกำเนิด — กันจุดหายตอนหมุนกล้อง
  g.add(inst);
  const m = new T.Matrix4();
  let offset = 0;
  const place = () => {
    for (let k = 0; k < count; k++) {
      const u = ((k * spacing + offset) % length) / length;
      m.makeTranslation(...path.getPointAt(u).toArray());
      inst.setMatrixAt(k, m);
    }
    inst.instanceMatrix.needsUpdate = true;
  };
  place();
  if (bright) _fp3d.flowMovers.push({ tick: () => { offset = (offset + 0.45) % spacing; place(); } });

  // หัวลูกศรแบนบนพื้นตรงทางเข้าห้องปลายทาง
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const dir = end.clone().sub(prev).normalize();
  const shape = new T.Shape();
  shape.moveTo(0, 7); shape.lineTo(6, -4); shape.lineTo(-6, -4); shape.closePath();
  const arrow = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshBasicMaterial({ color, transparent: true, opacity: bright ? 0.95 : 0.4, side: T.DoubleSide, depthWrite: false }));
  arrow.rotation.x = -Math.PI / 2;
  arrow.rotation.z = Math.atan2(-dir.x, -dir.z);
  arrow.position.set(end.x, Y + 0.1, end.z);
  arrow.renderOrder = 5;
  g.add(arrow);
}

function _fp3dBuildRooms() {
  _fp3dClearRooms();
  _fp3dBuildCirculation();
  _fp3dBuildFlows();
  Object.keys(FP_GEOM).forEach(roomId => {
    const g = FP_GEOM[roomId];
    if (roomId === 'packbox') { _fp3dBuildPackRoom(g); return; }
    const hosted = _fpHostedLine(roomId);   // งานแพ็คที่ย้ายมาใช้ห้องนี้ (เลือกตอนสแกน)
    const line = FP_ROOM_LINE[roomId] || hosted;
    const r = line ? _fpData[line] : null;
    const idleSub = roomId === 'samples' ? `${_fpHoldStock.length.toLocaleString()} รายการ Defect/Retain` : '';
    const title = hosted ? `${FP_ROOM_LABEL[roomId]} (${_fpPackSubLabel(hosted)})` : FP_ROOM_LABEL[roomId];
    _fp3dAddRoom(_fp3dRoomOpts(roomId, g, r, title, idleSub));
  });
}

// ห้องบรรจุหีบห่อ: กรอบนอกเตี้ยๆ (คลิกไม่ได้ ไม่ผูกไลน์) + 5 สถานีข้างในเรียงตามผัง 2D เป๊ะ
function _fp3dBuildPackRoom(g) {
  _fp3dAddRoom({ id: null, x: g.x, y: g.y, w: g.w, h: g.h, height: 10, status: 'idle', monitored: false,
    title: 'บรรจุหีบห่อ (5 สถานี)', sub: '', pct: 0, roster: [], selected: false, noSlab: true, labelLift: 52 });
  const slotH = (g.h - 24) / FP_PACK_SUBLINES.length;
  FP_PACK_SUBLINES.forEach((sub, i) => {
    const movedTo = _fpPackLineRoom(sub.line);   // ย้ายไปแพ็คห้องอื่น → สถานีนี้ว่าง
    const r = movedTo ? { status: 'idle' } : _fpData[sub.line];
    const id = `packbox__${sub.key}`;
    const geo = { x: g.x + 6, y: g.y + 24 + i * slotH, w: g.w - 12, h: slotH - 4 };
    const o = _fp3dRoomOpts(id, geo, r, sub.label, '');
    const active = r && r.status !== 'idle';
    o.title = movedTo ? `${sub.label} → ${FP_ROOM_LABEL[movedTo]}` : active ? `${sub.label} · ${o.pct}%` : sub.label;
    o.sub = '';
    o.height = active ? 26 : 10;
    o.small = true;
    _fp3dAddRoom(o);
  });
}

// รายการทั้งหมดสำหรับภาพรวม/เลือกดูรายละเอียด: ห้องเดี่ยว (ไม่รวมกรอบนอกของห้องบรรจุหีบห่อ) + 5 สถานี
// ข้างในห้องบรรจุหีบห่อ แยกกัน เพราะแต่ละสถานีมีข้อมูล/สถานะเป็นของตัวเอง
function _fpAllEntries() {
  const rooms = Object.keys(FP_GEOM).filter(id => id !== 'packbox');
  // ห้องที่มีงานแพ็คย้ายมาใช้ (hostedLine) ผูกกับไลน์นั้นชั่วคราว ส่วนสถานีต้นทางที่ถูกย้ายออก (movedTo)
  // ไม่ผูกไลน์ในภาพรวม กันงานเดียวโผล่ 2 แถว — แต่คลิกสถานีนั้นยังบอกได้ว่าย้ายไปห้องไหน (ดู _fpSelectRoom)
  const entries = rooms.map(id => {
    const hosted = _fpHostedLine(id);
    return { id, label: hosted ? `${FP_ROOM_LABEL[id]} (${_fpPackSubLabel(hosted)})` : FP_ROOM_LABEL[id],
      full: FP_ROOM_FULL[id], line: FP_ROOM_LINE[id] || hosted || null, hosted };
  });
  FP_PACK_SUBLINES.forEach(sub => {
    const movedTo = _fpPackLineRoom(sub.line);
    entries.push({ id: `packbox__${sub.key}`, label: movedTo ? `${sub.label} → ${FP_ROOM_LABEL[movedTo]}` : sub.label,
      full: `ห้องบรรจุหีบห่อ — ${sub.label}`, line: movedTo ? null : sub.line, movedTo });
  });
  return entries;
}

function _fpRenderOverview() {
  const drawer = document.getElementById('fp-drawer');
  if (!drawer) return;
  const entries = _fpAllEntries();
  const rows = entries.map(entry => {
    const r = entry.line ? _fpData[entry.line] : null;
    const dotColor = !entry.line ? 'var(--fp-muted)'
      : r.status === 'running' ? 'var(--fp-accent)'
      : r.status === 'behind'  ? 'var(--fp-warn)'
      : r.status === 'done'    ? 'var(--fp-accent-2)' : 'var(--fp-muted)';
    const val = !entry.line ? 'คลัง/สนับสนุน'
      : (r.status !== 'idle' && r.item) ? `${(r.actual ?? 0).toLocaleString()}/${r.planned.toLocaleString()}`
      : _fpStatusMeta(r.status).label;
    const lvl = r ? _fpAlertLevel(r.alerts) : null;
    return `<div class="fp-overview-row" onclick="_fpSelectRoom('${entry.id}')">
      <span class="fp-dot" style="background:${dotColor}"></span>
      <span class="fp-oname">${entry.label}${lvl ? ` <i class="fas fa-triangle-exclamation fp-alert-ico fp-alert-${lvl}" title="มีแจ้งเตือน"></i>` : ''}</span>
      <span class="fp-oval fp-mono">${val}</span>
    </div>`;
  }).join('');
  // แจ้งเตือนทั้งหมดของทุกไลน์ รวมไว้บนสุด คลิกแล้วกระโดดไปห้องนั้น
  const alertRows = entries.filter(e => e.line && _fpData[e.line] && (_fpData[e.line].alerts || []).length)
    .flatMap(e => _fpData[e.line].alerts.map(a => `<div class="fp-alert-box fp-alert-${a.level}" role="button" onclick="_fpSelectRoom('${e.id}')">
      <i class="fas fa-triangle-exclamation me-1"></i><b>${e.label}</b> — ${a.text}</div>`)).join('');
  drawer.innerHTML = `
    <div class="fp-eyebrow">ภาพรวมทั้งโรงงาน</div>
    <h2>${entries.length} จุดตรวจสอบ</h2>
    ${_fpReplayAt ? `<div class="fp-hint">กำลังย้อนดูเวลา ${_fpHM(_fpReplayAt)} — ไม่แสดงแจ้งเตือน/เวลาเสร็จโดยประมาณ</div>` : ''}
    ${alertRows ? `<div class="fp-field"><label>แจ้งเตือน</label>${alertRows}</div>` : ''}
    <div class="fp-hint">คลิกห้องบนผัง หรือรายการด้านล่าง เพื่อดูรายละเอียด</div>
    <div>${rows}</div>
  `;
}

// สรุปพนักงานทั้งหมด — ใครทำอะไรอยู่/ว่างกี่คน (คำขอผู้ใช้ 2026-09-20) แยกเป็นกรุ๊ปของตัวเองด้านซ้ายมือ
// (คำขอผู้ใช้ 2026-09-20 รอบสอง — เดิมต่อท้ายรายการห้องในแผงขวา) อยู่คงที่เสมอ ไม่ขึ้นกับว่ากำลังเลือก
// ห้องไหนอยู่ในแผงขวา — คลิกแถวที่ "กำลังทำงาน/ตามแผน" เพื่อกระโดดไปห้อง/สถานีของไลน์นั้นได้เลย
function _fpRenderStaffPanel() {
  const panel = document.getElementById('fp-staff-panel');
  if (!panel) return;
  const staff = _fpBuildStaffOverview();
  if (!staff.length) {
    panel.innerHTML = `<div class="fp-eyebrow">พนักงานทั้งหมด</div><div class="fp-hint">ยังไม่มีข้อมูลพนักงาน</div>`;
    return;
  }
  const order = { working: 0, planned: 1, idle: 2 };
  const metaOf = s => s === 'working' ? { color: 'var(--fp-accent)', label: l => `กำลังทำงาน · ${l}` }
    : s === 'planned' ? { color: 'var(--fp-warn)', label: l => `ตามแผน · ${l}` }
    : { color: 'var(--fp-muted)', label: () => 'ว่าง' };
  const allEntries = _fpAllEntries();
  const rows = staff.slice()
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name, 'th'))
    .map(s => {
      const meta = metaOf(s.status);
      const entry = s.line ? allEntries.find(e => e.line === s.line) : null;
      return `<div class="fp-overview-row" role="button" tabindex="0" onclick="_fpShowPerson('${_fpJsStr(s.code)}')"
        onkeydown="if(event.key==='Enter')_fpShowPerson('${_fpJsStr(s.code)}')">
        <span class="fp-dot" style="background:${meta.color}"></span>
        <span class="fp-oname">${s.name}</span>
        <span class="fp-oval">${meta.label(entry ? entry.label : (s.line || ''))}</span>
      </div>`;
    }).join('');
  const working = staff.filter(s => s.status === 'working').length;
  const idle = staff.filter(s => s.status === 'idle').length;
  // แถวล่างเต็มความกว้าง (2026-10-18) — หัวข้อ+ตัวเลขอยู่บรรทัดเดียว รายชื่อเรียงเป็นกริดหลายคอลัมน์
  panel.innerHTML = `
    <div class="fp-staff-head">
      <div class="fp-eyebrow">พนักงานทั้งหมด</div>
      <h2>${staff.length} คน</h2>
      <div class="fp-hint" style="margin:0">ทำงาน ${working} · ว่าง ${idle}</div>
    </div>
    <div class="fp-staff-grid">${rows}</div>
  `;
}

// รายการสินค้าที่ถือครองอยู่ใน hold_stock (DEFECT+RETAIN, QtyBalance>0) แสดงในห้องเก็บตัวอย่าง —
// ยืนยันกับผู้ใช้แล้ว 2026-09-14 ว่าเอาทั้ง 2 ประเภทมารวมกัน ไม่ใช่ RETAIN อย่างเดียว
function _fpHoldStockListHtml() {
  if (!_fpHoldStock.length) {
    return `<div class="fp-hint">ไม่มีรายการค้างในสต็อก Defect/Retain ตอนนี้</div>`;
  }
  const rows = _fpHoldStock
    .slice().sort((a, b) => (a.HoldType === b.HoldType ? 0 : a.HoldType === 'DEFECT' ? -1 : 1))
    .map(r => `
      <div class="fp-staff-chip">
        <span class="fp-hold-chip fp-hold-${r.HoldType.toLowerCase()}">${r.HoldType === 'DEFECT' ? 'Defect' : 'Retain'}</span>
        <div>
          <div class="fp-name">${r.ItemName || r.ItemCode}</div>
          <div class="fp-role">Lot ${r.Lot || '—'} · ${(r.QtyBalance ?? 0).toLocaleString()} ${r.UOM || ''}</div>
        </div>
      </div>`).join('');
  return `
    <div class="fp-field">
      <label>รายการในสต็อก Defect/Retain (${_fpHoldStock.length})</label>
      <div class="fp-staff-list">${rows}</div>
    </div>`;
}

function _fpSelectRoom(id) {
  _fpSelectedId = id;
  _fpSelectedPerson = null;
  _fpBuildSvg(); // rebuild เพื่ออัปเดตคลาส fp-selected บนห้องที่เพิ่งเลือก

  const entry = _fpAllEntries().find(e => e.id === id);
  const drawer = document.getElementById('fp-drawer');
  if (!entry || !drawer) return;

  if (!entry.line) {
    drawer.innerHTML = `
      <button class="fp-back-link" onclick="_fpSelectedId=null;_fpRenderOverview();_fpBuildSvg()">← ภาพรวมทั้งหมด</button>
      <div><div class="fp-eyebrow">${entry.id.toUpperCase()}</div><h2>${entry.full}</h2></div>
      <p class="fp-val" style="color:var(--fp-text-dim);font-size:13px">${entry.movedTo
        ? `งานแพ็คของสถานีนี้ย้ายไปทำที่ <b>${FP_ROOM_FULL[entry.movedTo]}</b> (เลือกตอนสแกนอัปเดตยอด) — คลิกห้องนั้นบนผังเพื่อดูรายละเอียดงาน`
        : (FP_ROOM_NOTE[entry.id] || 'พื้นที่นี้ไม่ผูกกับไลน์ผลิตในระบบ')}</p>
      ${entry.id === 'samples' ? _fpHoldStockListHtml() : ''}
    `;
    return;
  }

  const r = _fpData[entry.line];
  const meta = _fpStatusMeta(r.status);
  let body;
  if (r.status === 'idle' || !r.item) {
    body = `<p class="fp-val" style="color:var(--fp-text-dim);font-size:13px">ไม่มีแผนผลิตของไลน์นี้ในวันนี้</p>`;
  } else {
    const pct = r.planned > 0 && r.actual != null ? Math.min(100, Math.round(r.actual / r.planned * 100)) : 0;
    body = `
      <div class="fp-field"><label>สินค้า</label><div class="fp-val">${r.item.ProductName || '—'}</div></div>
      <div class="fp-field"><label>เลขที่ใบสั่งผลิต</label><div class="fp-val fp-mono">${r.mo ? r.mo.MO_ID : '—'}</div></div>
      <div class="fp-field">
        <label>ผลิตแล้ว / แผน${r.isLiveScan ? ' (จากสแกนสด — ยังไม่ยืนยันผลจริงเป็นทางการ)' : ''}</label>
        <div class="fp-val fp-mono">${(r.actual ?? 0).toLocaleString()} / ${r.planned.toLocaleString()} ${r.item.UOM || ''}</div>
        <div class="fp-progress"><i style="width:${pct}%"></i></div>
      </div>
      ${_fpEtaFieldHTML(r)}
      <div class="fp-field"><label>กะ</label><div class="fp-val fp-mono">${r.item.Shift || '—'}${r.item.TimeStart ? ` (${_planShiftTimeLabel(r.item)})` : ''}</div></div>
      <div class="fp-field">
        <label>พนักงานในไลน์ (${r.roster.length}) — คลิกชื่อเพื่อดูรายละเอียด</label>
        <div class="fp-staff-list">
          ${ r.roster.length ? r.roster.map(p => `
            <div class="fp-staff-chip${p.confirmed ? '' : ' fp-staff-planned'}" role="button" tabindex="0" style="cursor:pointer"
              onclick="_fpShowPerson('${_fpJsStr(p.code)}')" onkeydown="if(event.key==='Enter')_fpShowPerson('${_fpJsStr(p.code)}')">
              <div class="fp-avatar">${p.name.slice(0,1)}</div>
              <div><div class="fp-name">${p.name}</div><div class="fp-role">${p.confirmed ? `สแกนเข้าแล้ว${p.timeIn ? ' ' + String(p.timeIn).slice(0, 5) : ''}` : 'ตามแผน — ยังไม่สแกนเข้า'}</div></div>
            </div>`).join('') : '<div class="fp-val" style="color:var(--fp-text-dim)">ยังไม่มีข้อมูลพนักงานประจำไลน์นี้</div>' }
        </div>
      </div>`;
  }
  const alertsHtml = (r.alerts || []).map(a => `<div class="fp-alert-box fp-alert-${a.level}"><i class="fas fa-triangle-exclamation me-1"></i>${a.text}</div>`).join('');
  drawer.innerHTML = `
    <button class="fp-back-link" onclick="_fpSelectedId=null;_fpRenderOverview();_fpBuildSvg()">← ภาพรวมทั้งหมด</button>
    <div>
      <div class="fp-eyebrow">${entry.line}</div>
      <h2>${entry.full}</h2>
      <span class="fp-status-pill ${meta.cls}">${meta.label}</span>
      ${entry.hosted ? `<div class="fp-val mt-1" style="font-size:12px;color:var(--fp-text-dim)"><i class="fas fa-right-left me-1"></i>ใช้ห้องนี้ทำงาน${_fpPackSubLabel(entry.hosted)}แทนห้องบรรจุหีบห่อ (เลือกตอนสแกนอัปเดตยอด)</div>` : ''}
    </div>
    ${alertsHtml}
    ${body}
  `;
}

function _fpJsStr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function _fpEtaFieldHTML(r) {
  if (_fpReplayAt || r.status === 'done' || !r.isLiveScan) return '';
  if (!r.eta) return `<div class="fp-field"><label>คาดว่าเสร็จ</label><div class="fp-val" style="font-size:12px;color:var(--fp-text-dim)">ยังคำนวณไม่ได้ — ต้องมีการสแกนยอดอย่างน้อย 2 ครั้ง ห่างกัน 10 นาทีขึ้นไป</div></div>`;
  return `<div class="fp-field"><label>คาดว่าเสร็จ (จากความเร็วสแกนช่วง 2 ชม.ล่าสุด)</label>
    <div class="fp-val fp-mono" style="${r.eta.late ? 'color:#dc2626;font-weight:600' : ''}">~${_fpEtaLabel(r.eta.eta)} · ${r.eta.perHour.toLocaleString()} ${r.item.UOM || ''}/ชม.${r.eta.late ? ` — เลยเลิกกะ ${_fpHM(r.eta.shiftEnd)}` : ''}</div></div>`;
}

// รายละเอียดพนักงาน 1 คนในแผงขวา (2026-10-18) — เปิดจากคลิกหุ่นบนผัง 2D/3D, ชื่อในรายการพนักงาน หรือชิปในห้อง
// สถานะ/ไลน์จาก _fpBuildStaffOverview, เวลาเข้า-ออกจาก production_labor_log วันนี้, สกิลที่ไลน์นั้นต้องใช้จาก
// แมททริกสกิล (_planSkills/_planSkillLevels — ระดับ 0 ยังไม่ฝึก/1 กำลังฝึก/2 ทำได้เอง/3 สอนได้)
function _fpShowPerson(code) {
  const drawer = document.getElementById('fp-drawer');
  if (!drawer) return;
  _fpSelectedPerson = code;
  const emp = _planEmployees.find(e => e.EmployeeCode === code) || { EmployeeCode: code };
  const ov = _fpBuildStaffOverview().find(s => s.code === code);
  const lines = PLAN_LINES.filter(l => ((_fpData[l] && _fpData[l].roster) || []).some(p => p.code === code));
  const entries = _fpAllEntries();
  const statusText = !ov ? '—' : ov.status === 'working' ? 'กำลังทำงาน (สแกนเข้าแล้ว)' : ov.status === 'planned' ? 'อยู่ในแผน — ยังไม่สแกนเข้า' : 'ว่าง (ไม่มีงานในแผนวันนี้)';
  const statusCls = !ov ? 'fp-status-idle' : ov.status === 'working' ? 'fp-status-running' : ov.status === 'planned' ? 'fp-status-behind' : 'fp-status-idle';
  const levelTxt = ['0 ยังไม่ฝึก', '1 กำลังฝึก', '2 ทำได้เอง', '3 สอนได้'];
  const lineBlocks = lines.map(l => {
    const r = _fpData[l];
    const p = r.roster.find(x => x.code === code);
    const entry = entries.find(e => e.line === l);
    const skills = _planSkills.filter(s => (s.Lines || '').split(',').map(x => x.trim()).includes(l));
    const skillHtml = skills.length ? skills.map(s => {
      const lv = _planSkillLevels[`${code}|${s.SkillCode}`] || 0;
      return `<div class="fp-oval" style="display:flex;justify-content:space-between;gap:8px"><span>${s.SkillName}</span><span style="color:${lv >= 2 ? '#15803d' : lv === 1 ? '#d97706' : '#94a3b8'}">${levelTxt[lv] || lv}</span></div>`;
    }).join('') : '<div class="fp-oval">ไลน์นี้ยังไม่ได้ผูกสกิลในแมททริกสกิล</div>';
    return `<div class="fp-field" style="border:1px solid var(--fp-wall-soft);border-radius:10px;padding:8px 10px">
      <label>${entry ? `<a href="#" onclick="_fpSelectRoom('${entry.id}');return false">${entry.label}</a>` : l}${r.item ? ` · ${r.item.ProductName || ''}` : ''}</label>
      <div class="fp-val fp-mono" style="font-size:12px">${p && p.timeIn ? `เข้า ${String(p.timeIn).slice(0, 5)}` : 'ยังไม่สแกนเข้า'}${p && p.timeOut ? ` · ออก ${String(p.timeOut).slice(0, 5)}` : ''}</div>
      ${skillHtml}
    </div>`;
  }).join('');
  const genderTxt = emp.Gender === 'F' ? 'หญิง' : emp.Gender === 'M' ? 'ชาย' : 'ยังไม่ระบุเพศ';
  drawer.innerHTML = `
    <button class="fp-back-link" onclick="_fpSelectedPerson=null;_fpSelectedId=null;_fpRenderOverview();_fpBuildSvg()">← ภาพรวมทั้งหมด</button>
    <div>
      <div class="fp-eyebrow">${emp.EmployeeCode || code}${emp.Position ? ' · ' + emp.Position : ''}</div>
      <h2>${emp.NickName || emp.FirstName || code}${emp.FirstName ? ` <span style="font-size:12px;color:var(--fp-text-dim);font-family:Sarabun">${emp.FirstName} ${emp.LastName || ''}</span>` : ''}</h2>
      <span class="fp-status-pill ${statusCls}">${statusText}</span>
      <div class="fp-oval mt-1">${genderTxt}</div>
    </div>
    ${lineBlocks ? `<div class="fp-field"><label>งานวันนี้ + สกิลที่ไลน์ต้องใช้</label>${lineBlocks}</div>` : ''}
  `;
}

