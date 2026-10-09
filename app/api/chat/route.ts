import { NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { fixed, signedFixed } from '@/lib/physics';

const TYPHOON_API = 'https://api.opentyphoon.ai/v1/chat/completions';

// The conversation is trimmed before it goes upstream: the key is ours, so the
// size of a request must not be up to the caller.
const MAX_TURNS = 20;
const MAX_TURN_CHARS = 4000;
// Long enough for a worked calculation in Thai. The page tells the student
// when an answer still runs into this limit.
const MAX_ANSWER_TOKENS = 1536;
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
}

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
   - ตอบให้กระชับ ยาวไม่เกินประมาณ 200 คำต่อครั้ง ถ้าเนื้อหายาวหรือต้องคำนวณหลายขั้น ให้ทำทีละช่วงแล้วถามนักเรียนก่อนไปขั้นต่อไป
4. ข้อจำกัด: หากนักเรียนถามเรื่องที่ไม่เกี่ยวข้องกับฟิสิกส์ ให้ตอบอย่างสุภาพว่า "ครูเชี่ยวชาญด้านฟิสิกส์ ลองกลับมาคุยเรื่องแรง พลังงาน หรือคลื่นกันดีกว่านะครับ"

**โครงสร้างการตอบ:**
- (ทักทายและทวนคำถาม)
- (อธิบายคอนเซปต์สั้นๆ ที่เกี่ยวข้อง)
- (แสดงวิธีคิดหรือคำนวณ)
- (ทิ้งท้ายด้วยคำถามเพื่อเช็คความเข้าใจของนักเรียน)

การทดลองที่ 8 "สนามแม่เหล็กในขดลวดเดี่ยวและกฎของไบโอต-ซาวัต" รายวิชา 04203102:
- ตอนที่ 1 ขดลวดเดี่ยว: วัด B ที่จุดกึ่งกลาง สำหรับ n = 1, 2, 3 รอบ ที่ I = 5 A  สูตร $B_0 = \\mu_0 n I / (2R)$
- ตอนที่ 2 โซลีนอยด์ (ชุดทดลองมีขดเดียว n = 100 รอบ): วัด B ตามแนวแกน Z 21 ตำแหน่ง ห่างกัน 1 cm (Z = −10 ถึง +10 cm) ที่ I = 0.5 A  L = 80 mm, R = 21 mm (เส้นผ่านศูนย์กลาง 42 mm)  สูตรตามใบแลป $B_Z = \\frac{\\mu_0 n I}{2L}\\left[\\frac{a}{\\sqrt{R^2+a^2}} - \\frac{b}{\\sqrt{R^2+b^2}}\\right]$ โดย $a = Z + \\frac{L}{2}$ และ $b = Z - \\frac{L}{2}$ (ใช้สัญลักษณ์และรูปสมการนี้เสมอเมื่ออธิบาย) ค่าคงที่ $\\mu_0 = 1.2566 \\times 10^{-6}$ H/m`;

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

  return {
    instrumentName: label(c.instrumentName),
    instSub: label(c.instSub),
    instType: c.instType,
    I, bTheory, bMeasured,
    z: num(c.z) ?? undefined,
    background: c.background === null ? null : num(c.background) ?? undefined,
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
      : `\n- ค่าวัดจริงหักสนามพื้นหลัง ${fixed(context.background, 3)} mT ออกแล้ว (อ่านด้วยเซนเซอร์ขณะแหล่งจ่ายไฟปิด)`;

  const contextBlock = `\n\n**บริบทการทดลองปัจจุบัน:**
- อุปกรณ์: ${context.instrumentName} (${context.instSub})
- กระแสที่จ่าย I = ${context.I.toFixed(2)} A (ค่าที่ตั้งไว้ ชุดทดลองไม่ได้วัดกระแส)${zLine}
- สนามแม่เหล็กทฤษฎี B_theory = ${context.bTheory.toFixed(3)} mT
- สนามแม่เหล็กวัดจริง B_measured = ${fixed(context.bMeasured, 3)} mT${backgroundLine}
- ΔB = ${signedFixed(delta, 3)} mT${percent}`;

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
