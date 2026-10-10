import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { fixed, signedFixed } from '@/lib/physics';

const TYPHOON_API = 'https://api.opentyphoon.ai/v1/chat/completions';

// The conversation is trimmed before it goes upstream: the key is ours, so the
// size of a request must not be up to the caller.
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 4000;
// The tutor is told to answer in at most 100 words; this is the backstop, with
// room for the formulas, which take many tokens. The page tells the student
// when an answer still runs into this limit.
const MAX_ANSWER_TOKENS = 600;
// The state of the lab room that comes with a question is bounded like the
// conversation is: so many recorded values, an error line so long.
const MAX_RECORDED = 30;
const MAX_ERROR_CHARS = 160;
const MAX_MINUTES_LEFT = 600;
const UPSTREAM_TIMEOUT_MS = 60_000;

interface ChatContext {
  instrumentName: string;
  instSub: string;
  instType: 'coil' | 'solenoid';
  I: number;
  /** The room's own field already taken off bMeasured, mT; null when it could not be read. */
  background?: number | null;
  bTheory: number;
  bMeasured: number;
  z?: number;
  /** The power supply: on, off, or held off by an admin. */
  supply?: 'on' | 'off' | 'held';
  /** The rig is carrying out a command right now. */
  busy?: boolean;
  /** Whether the sensor is sending values. When it is not, bMeasured is 0 for want of one. */
  sensor?: boolean;
  /** How many times the student set the zero again with Set 0. */
  rezeroed?: number;
  /** The last command the rig did not carry out, as the student sees it. */
  error?: string;
  /** Minutes until the round ends. */
  minutesLeft?: number;
  /** The values recorded so far in this visit. */
  recorded?: Recorded[];
}

type Recorded = { instrument: string; zCm: number | null; I: number; bTheory: number; bMeasured: number | null };

type Turn = { role: 'user' | 'assistant'; content: string };

const SYSTEM_PROMPT = `คุณคือ "ครูฟิสิกส์ Typhoon" ผู้เชี่ยวชาญการสอนวิชาฟิสิกส์ระดับมัธยมปลายและมหาวิทยาลัย
หน้าที่ของคุณคือการช่วยให้นักเรียนเข้าใจ "ที่มาและหลักการ" ของฟิสิกส์ ไม่ใช่แค่การบอกคำตอบเพียงอย่างเดียว

**หลักการตอบคำถาม:**
1. บุคลิก: ใจดี, กระตือรือร้นในการสอน, และใช้ภาษาที่เข้าใจง่ายแต่ถูกต้องตามหลักวิชาการ
2. การสอน: ใช้ "Socratic Method" (การตั้งคำถามกลับ) เพื่อให้นักเรียนได้ลองคิดตามก่อนจะเฉลยทั้งหมด
3. รูปแบบการเขียน:
   - ใช้ Markdown ในการจัดหัวข้อให้ชัดเจน
   - ใช้ LaTeX สำหรับสูตรทางฟิสิกส์เสมอ เช่น $F = ma$ หรือ $$E = mc^2$$
   - หากต้องมีการคำนวณ ให้แสดงวิธีทำเป็นลำดับขั้นตอน (Step-by-step)
   - ตอบสั้นและตรงประเด็น ยาวไม่เกิน 100 คำต่อครั้งเสมอ ไม่ต้องทักทายและไม่ต้องทวนคำถาม ถ้าต้องคำนวณหลายขั้น ให้ทำครั้งละหนึ่งขั้นแล้วถามนักเรียนก่อนไปขั้นต่อไป
4. ข้อจำกัด: หากนักเรียนถามเรื่องที่ไม่เกี่ยวข้องกับฟิสิกส์ ให้ตอบอย่างสุภาพว่า "ครูเชี่ยวชาญด้านฟิสิกส์ ลองกลับมาคุยเรื่องแรง พลังงาน หรือคลื่นกันดีกว่านะครับ"

**โครงสร้างการตอบ:**
- (ตอบประเด็นที่ถาม พร้อมหลักการหรือขั้นคำนวณที่เกี่ยวข้องเพียงขั้นเดียว)
- (ปิดด้วยคำถามสั้นๆ หนึ่งข้อเพื่อเช็คความเข้าใจ)

**การใช้สถานะห้องแลป:** ทุกคำถามมีสถานะปัจจุบันของห้องแลปแนบมา ให้ใช้ประกอบการตอบเสมอ ถ้าสถานะบอกว่าแหล่งจ่ายไฟปิดหรือถูกล็อก เซนเซอร์ไม่ส่งค่า อุปกรณ์กำลังทำงาน หรือมีคำสั่งที่ไม่สำเร็จ และสิ่งนั้นอธิบายค่าที่นักเรียนเห็นได้ ให้บอกสาเหตุนั้นก่อนอธิบายฟิสิกส์ ถ้ามีค่าที่บันทึกแล้ว ให้อ้างตัวเลขจากค่าเหล่านั้นเมื่อพูดถึงแนวโน้ม ห้ามแต่งค่าที่ไม่มีในข้อมูล

การทดลองที่ 8 "สนามแม่เหล็กในขดลวดเดี่ยวและกฎของไบโอต-ซาวัต" รายวิชา 04203102:
- ตอนที่ 1 ขดลวดเดี่ยว: วัด B ที่จุดกึ่งกลาง สำหรับ n = 1, 2, 3 รอบ รัศมี R = 13 mm ที่ I = 5 A (ค่าปกติ)  สูตร $B_0 = \\mu_0 n I / (2R)$
- ตอนที่ 2 โซลีนอยด์ (ชุดทดลองมีขดเดียว n = 100 รอบ): วัด B ตามแนวแกน Z 21 ตำแหน่ง ห่างกัน 1 cm (Z = −10 ถึง +10 cm) ที่ I = 0.3 A (ค่าปกติ)  L = 80 mm, R = 21 mm (เส้นผ่านศูนย์กลาง 42 mm)  สูตรตามใบแลป $B_Z = \\frac{\\mu_0 n I}{2L}\\left[\\frac{a}{\\sqrt{R^2+a^2}} - \\frac{b}{\\sqrt{R^2+b^2}}\\right]$ โดย $a = Z + \\frac{L}{2}$ และ $b = Z - \\frac{L}{2}$ (ใช้สัญลักษณ์และรูปสมการนี้เสมอเมื่ออธิบาย) ค่าคงที่ $\\mu_0 = 1.2566 \\times 10^{-6}$ H/m
- ค่ากระแสของแต่ละอุปกรณ์ผู้ดูแลระบบปรับได้ ถ้าข้อมูลการทดลองที่แนบมากับคำถามบอกค่ากระแส ให้ใช้ค่านั้นแทนค่าปกติเสมอ
- ค่าวัดจริงคือขนาดของสนามที่เหลือเมื่อนำค่าที่เซนเซอร์อ่านได้ทั้งสามแกน ลบด้วยสนามพื้นหลัง (สนามโลกและสิ่งรอบชุดทดลอง) ทีละแกน สนามพื้นหลังอ่านไว้ขณะแหล่งจ่ายไฟปิด และเซนเซอร์อ่านได้สูงสุดราว 1.09 mT

**เอกสารประกอบการทดลอง 3 ฉบับ** (นักเรียนเปิดได้จากปุ่มเอกสารในห้องแลปและในแดชบอร์ด เป็นไฟล์ PDF) ให้เรียกชื่อตามนี้ และบอกนักเรียนได้ว่าเรื่องที่ถามอยู่ในฉบับไหน:
1. **Lab Manual** (คู่มือการทดลอง 5 หน้า หน้า 43–47 ของหนังสือหลักฟิสิกส์ภาคปฏิบัติการ 04203102)
   - วัตถุประสงค์: เข้าใจการเกิดสนามแม่เหล็กจากขดลวดที่มีกระแสไหลผ่าน และประเมินค่าสนามแม่เหล็กได้อย่างมีหลักการ
   - ทฤษฎี: กฎของไบโอต-ซาวัต $d\\vec{B} = \\frac{\\mu_0 I}{4\\pi}\\frac{d\\vec{l}\\times\\hat{r}}{r^2}$ ขดลวดวงกลมบนแกน Z เหลือเฉพาะองค์ประกอบตามแกน $B_Z = \\frac{\\mu_0 I R^2}{2(R^2+Z^2)^{3/2}}$ ที่กึ่งกลางขดลวด n รอบ $B_0 = \\frac{\\mu_0 n I}{2R}$ (กราฟ B กับ n เป็นเส้นตรง รูปที่ 3) โซลีนอยด์ยาว L ใช้สมการ $B_Z$ ข้างบน และที่กึ่งกลาง $B = \\frac{\\mu_0 n I}{2}\\left(R^2+\\frac{L^2}{4}\\right)^{-1/2}$ (รูปที่ 4 และ 5)
   - อุปกรณ์: แหล่งจ่ายไฟ เครื่องวัดสนามแม่เหล็กและหัววัด มัลติมิเตอร์ ขดลวดเดี่ยว 1, 2, 3 รอบ โซลีนอยด์ 200, 150, 100 และ 75 รอบ ไม้เมตร สายไฟ
   - วิธีทดลองตอนที่ 1: ตั้งแหล่งจ่าย 18 V ต่ออนุกรมกับมัลติมิเตอร์และขดลวด ปรับศูนย์เครื่องวัดก่อนจ่ายกระแส (Zero Adjust) จ่าย 5 A วัด B ที่กึ่งกลางของขดลวด 1, 2, 3 รอบ เขียนกราฟ B กับจำนวนรอบ แล้วหา $\\mu_0$ จากความชันและค่าความคลาดเคลื่อน
   - วิธีทดลองตอนที่ 2: เปลี่ยนเป็นโซลีนอยด์ จ่าย 1 A ให้กึ่งกลางเป็น Z = 0 เลื่อนหัววัดทีละ 1 cm บันทึก B เขียนกราฟ B กับ Z คำนวณ B ที่กึ่งกลางของโซลีนอยด์ยาว 160 mm รัศมี 13 mm แล้วสรุปและวิจารณ์ผล
2. **Briefing Slides** (สไลด์อธิบายก่อนทำการทดลอง 11 หน้า)
   - กฎมือขวาและสนามรอบลวดตรง $B = \\frac{\\mu_0 I}{2\\pi a}$ (รูปที่ 1) ทิศสนามของขดลวดวงกลม (รูปที่ 2) เส้นสนามของโซลีนอยด์ (รูปที่ 3)
   - โซลีนอยด์ยาว ที่กึ่งกลาง $B = \\frac{\\mu_0 n I}{L} = \\mu_0 N I$ โดย $N = n/L$ และสมการ $B_Z$ ตามแนวแกนแบบเดียวกับใน Lab Manual
   - รูปที่ 4: กราฟ B กับ Z ของโซลีนอยด์ n = 75, 150, 300 รอบ สนามมากที่สุดและเกือบคงที่ช่วงกลางขดลวด ลดลงเร็วที่ปลาย และมากขึ้นตามจำนวนรอบ
   - รูปถ่ายอุปกรณ์จริง และรูปการต่อวงจรของตอนที่ 1 และตอนที่ 2 (แหล่งจ่ายไฟ มัลติมิเตอร์ ขดลวด ต่ออนุกรมกัน ปุ่มปรับหยาบและปรับละเอียดของเครื่องวัดสนามแม่เหล็ก ตอนที่ 2 ปรับกระแส 1.0 A)
3. **Worksheet** (ใบบันทึกผลการทดลอง 4 หน้า หน้า 11–14) สิ่งที่นักเรียนต้องกรอก:
   - วัตถุประสงค์
   - ตอนที่ 1: ความต่างศักย์และกระแสที่ใช้ ตาราง B (mT) ของ n = 1, 2, 3 กราฟ B กับจำนวนรอบ คำตอบว่าเมื่อจำนวนรอบเพิ่มขึ้นสนามเป็นอย่างไร ค่า $\\mu_0$ จากความชันของกราฟ และเปอร์เซ็นต์ความคลาดเคลื่อน
   - ตอนที่ 2: ตาราง B ที่ Z ทุก 1 cm กราฟ B กับ Z และการแสดงวิธีคำนวณ B
   - สรุปและวิจารณ์ผลการทดลอง

**ข้อที่เอกสารต่างจากชุดทดลองระยะไกลนี้** (ถ้านักเรียนสับสน ให้อธิบายตามนี้ และให้ใช้ค่าของชุดทดลองนี้ในการคำนวณเทียบกับค่าที่วัดได้):
- เอกสารเขียนสำหรับห้องแลปจริงที่นักเรียนต่อวงจรและอ่านมัลติมิเตอร์เอง ที่นี่ระบบต่อวงจรไว้แล้ว นักเรียนเลือกอุปกรณ์และจุดวัดจากหน้าจอ และกระแสเป็นค่าที่ตั้งไว้ ไม่ได้วัด
- โซลีนอยด์ในเอกสาร: 150 รอบ ยาว 160 mm รัศมี 13 mm กระแส 1 A ตาราง Z = −15 ถึง +15 cm ชุดทดลองนี้: 100 รอบ ยาว 80 mm รัศมี 21 mm กระแสตามบริบทที่แนบมา Z = −10 ถึง +10 cm ตารางใน Worksheet จึงกรอกเฉพาะช่วงที่วัดได้
- การปรับศูนย์เครื่องวัด (Zero Adjust) ในเอกสาร ตรงกับปุ่ม Set 0 ในห้องแลปนี้
- กราฟและตารางใน Worksheet นักเรียนทำเองจากค่าที่บันทึก โดยดาวน์โหลด CSV จากห้องแลปหรือจากหน้าสรุปได้
- เนื้อหาเอกสารที่สรุปไว้นี้ไม่ใช่ทั้งหมด ถ้านักเรียนถามรายละเอียดที่ไม่มีในนี้ (เช่น ข้อความในหน้าใดหน้าหนึ่ง) ให้บอกตรงๆ ว่าให้เปิดเอกสารฉบับนั้นดู ห้ามแต่งเนื้อหาขึ้นเอง`;

function reply(error: string, status: number) {
  return new Response(JSON.stringify({ error }), { status, headers: { 'Content-Type': 'application/json' } });
}

// Only what the lab page sends is let through: user and assistant turns of
// plain text, ending on the student's question. A "system" turn from the
// caller would replace the tutor's instructions, so it is dropped.
function readTurns(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: Turn[] = [];
  for (const m of raw as { role?: unknown; content?: unknown }[]) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (typeof m.content !== 'string' || !m.content.trim()) continue;
    turns.push({ role: m.role, content: m.content.slice(0, MAX_TURN_CHARS) });
  }
  const recent = turns.slice(-MAX_TURNS);
  if (!recent.length || recent[recent.length - 1].role !== 'user') return null;
  return recent;
}

// The readings end up inside the system prompt, so they are checked rather
// than trusted: numbers must be numbers, and the two labels are cut to one
// short line each.
function readContext(raw: unknown): ChatContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const label = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 60) : '');
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  const I = num(c.I), bTheory = num(c.bTheory), bMeasured = num(c.bMeasured);
  if (I === null || bTheory === null || bMeasured === null) return null;
  if (c.instType !== 'coil' && c.instType !== 'solenoid') return null;

  // The state of the room is optional, piece by piece: what is missing or
  // not of the right kind is left out, never guessed.
  const flag = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
  const count = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined);
  const recorded: Recorded[] = [];
  for (const row of Array.isArray(c.recorded) ? c.recorded.slice(-MAX_RECORDED) : []) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const rowI = num(r.I), rowTheory = num(r.bTheory), instrument = label(r.instrument);
    if (rowI === null || rowTheory === null || !instrument) continue;
    recorded.push({ instrument, zCm: num(r.zCm), I: rowI, bTheory: rowTheory, bMeasured: num(r.bMeasured) });
  }

  return {
    instrumentName: label(c.instrumentName),
    instSub: label(c.instSub),
    instType: c.instType,
    I, bTheory, bMeasured,
    z: num(c.z) ?? undefined,
    background: c.background === null ? null : num(c.background) ?? undefined,
    supply: c.supply === 'on' || c.supply === 'off' || c.supply === 'held' ? c.supply : undefined,
    busy: flag(c.busy),
    sensor: flag(c.sensor),
    rezeroed: count(c.rezeroed, 999),
    error: typeof c.error === 'string' ? c.error.replace(/\s+/g, ' ').trim().slice(0, MAX_ERROR_CHARS) || undefined : undefined,
    minutesLeft: count(c.minutesLeft, MAX_MINUTES_LEFT),
    recorded: recorded.length ? recorded : undefined,
  };
}

export async function POST(req: NextRequest) {
  // The assistant is part of the lab room; like everything else there it is
  // for signed-in users, not an open door to the Typhoon key.
  const user = await getSessionUser();
  if (!user) return reply('กรุณาเข้าสู่ระบบก่อนใช้ผู้ช่วยสอน', 401);

  const apiKey = process.env.TYPHOON_API_KEY;
  if (!apiKey) {
    console.error('[chat] TYPHOON_API_KEY is not set');
    return reply('ผู้ช่วยสอนยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ', 503);
  }

  const body = await req.json().catch(() => null);
  const messages = readTurns(body?.messages);
  const context = readContext(body?.context);
  if (!messages || !context) return reply('คำขอไม่ถูกต้อง', 400);

  const delta = context.bMeasured - context.bTheory;
  const percent = context.bTheory !== 0
    ? ` (${Math.abs(delta / context.bTheory * 100).toFixed(1)}% ต่างจากทฤษฎี)`
    : '';
  const zLine = context.instType === 'solenoid' && context.z !== undefined
    ? `\n- ตำแหน่งหัววัด Z = ${+(context.z * 100).toFixed(2)} cm จากจุดกึ่งกลาง`
    : '';

  // Whether the measured value still has the Earth's field in it changes what
  // can explain a difference from theory.
  const backgroundLine = context.background === undefined ? ''
    : context.background === null
      ? '\n- ค่าวัดจริงยังรวมสนามพื้นหลัง (สนามโลกและสิ่งรอบชุดทดลอง) เพราะยังอ่านค่าพื้นหลังไม่ได้'
      : `\n- ค่าวัดจริงหักสนามพื้นหลัง ${fixed(context.background, 3)} mT ออกแล้วแบบขนาดลบขนาด ก่อนคาลิเบรต (อ่านด้วยเซนเซอร์ขณะแหล่งจ่ายไฟปิด)`;

  // The current to the milliampere an admin can set it to, without trailing zeros.
  const amps = (I: number) => String(+I.toFixed(3));

  const SUPPLY = { on: 'เปิดอยู่', off: 'ปิดอยู่ จึงไม่มีกระแสในขดลวด', held: 'ผู้ดูแลระบบปิดและล็อกไว้ นักเรียนเปิดเองไม่ได้' };
  const state = [
    context.supply && `- แหล่งจ่ายไฟ: ${SUPPLY[context.supply]}`,
    context.busy && '- ชุดทดลองกำลังทำตามคำสั่งอยู่ (กำลังสลับอุปกรณ์หรือเลื่อนหัววัด) ค่าที่เห็นอาจยังไม่นิ่ง',
    context.sensor === false && '- เซนเซอร์ไม่ส่งค่าในขณะนี้ ค่า B_measured = 0 ข้างบนจึงไม่ใช่ค่าที่วัดได้',
    context.sensor === true && '- เซนเซอร์ส่งค่าตามปกติ',
    context.rezeroed ? `- นักเรียนกด Set 0 ตั้งค่าศูนย์ใหม่แล้ว ${context.rezeroed} ครั้ง` : '',
    context.error && `- คำสั่งล่าสุดที่ไม่สำเร็จ: ${context.error}`,
    context.minutesLeft !== undefined && `- เวลาที่เหลือของรอบทดลอง: ${context.minutesLeft} นาที`,
  ].filter(Boolean).join('\n');

  const rows = (context.recorded ?? []).map(r =>
    `- ${r.instrument}${r.zCm === null ? '' : ` Z = ${+r.zCm.toFixed(2)} cm`}: I = ${amps(r.I)} A, ทฤษฎี ${r.bTheory.toFixed(3)} mT, วัดได้ ${r.bMeasured === null ? 'ไม่มีสัญญาณเซนเซอร์' : `${fixed(r.bMeasured, 3)} mT`}`);
  const recordedBlock = rows.length
    ? `\n\n**ค่าที่บันทึกแล้วในการทดลองครั้งนี้ (${rows.length} ค่า):**\n${rows.join('\n')}`
    : '\n\n**ค่าที่บันทึกแล้วในการทดลองครั้งนี้:** ยังไม่มี';

  const contextBlock = `\n\n**บริบทการทดลองปัจจุบัน:**
- อุปกรณ์: ${context.instrumentName} (${context.instSub})
- กระแสที่จ่าย I = ${amps(context.I)} A (ค่าที่ตั้งไว้ ชุดทดลองไม่ได้วัดกระแส)${zLine}
- สนามแม่เหล็กทฤษฎี B_theory = ${context.bTheory.toFixed(3)} mT
- สนามแม่เหล็กวัดจริง B_measured = ${fixed(context.bMeasured, 3)} mT${backgroundLine}
- ΔB = ${signedFixed(delta, 3)} mT${percent}${state ? `\n\n**สถานะห้องแลปตอนนี้:**\n${state}` : ''}${recordedBlock}`;

  let upstream: Response;
  try {
    upstream = await fetch(TYPHOON_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'typhoon-v2.5-30b-a3b-instruct',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + contextBlock },
          ...messages,
        ],
        temperature: 0.6,
        max_completion_tokens: MAX_ANSWER_TOKENS,
        top_p: 0.6,
        stream: true,
      }),
      // Stops the upstream call when the student leaves or it takes too long.
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch (err) {
    console.error('[chat] could not reach Typhoon:', err);
    return reply('เชื่อมต่อผู้ช่วยสอนไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง', 502);
  }

  if (!upstream.ok) {
    // The upstream message stays in the server log: it can name the key or the
    // account, and it means nothing to a student.
    console.error(`[chat] Typhoon answered ${upstream.status}:`, (await upstream.text()).slice(0, 500));
    return upstream.status === 429
      ? reply('มีผู้ใช้ผู้ช่วยสอนจำนวนมาก รอสักครู่แล้วลองใหม่', 429)
      : reply('ผู้ช่วยสอนตอบไม่ได้ในขณะนี้ ลองใหม่อีกครั้ง', 502);
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
