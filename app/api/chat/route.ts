import { NextRequest } from 'next/server';

const TYPHOON_API = 'https://api.opentyphoon.ai/v1/chat/completions';

interface ChatContext {
  instrumentName: string;
  instSub: string;
  instType: 'coil' | 'solenoid';
  I: number;
  I0: number;
  bTheory: number;
  bMeasured: number;
  z?: number;
}

const SYSTEM_PROMPT = `คุณคือ "ครูฟิสิกส์ Typhoon" ผู้เชี่ยวชาญการสอนวิชาฟิสิกส์ระดับมัธยมปลายและมหาวิทยาลัย
หน้าที่ของคุณคือการช่วยให้นักเรียนเข้าใจ "ที่มาและหลักการ" ของฟิสิกส์ ไม่ใช่แค่การบอกคำตอบเพียงอย่างเดียว

**หลักการตอบคำถาม:**
1. บุคลิก: ใจดี, กระตือรือร้นในการสอน, และใช้ภาษาที่เข้าใจง่ายแต่ถูกต้องตามหลักวิชาการ
2. การสอน: ใช้ "Socratic Method" (การตั้งคำถามกลับ) เพื่อให้นักเรียนได้ลองคิดตามก่อนจะเฉลยทั้งหมด
3. รูปแบบการเขียน:
   - ใช้ Markdown ในการจัดหัวข้อให้ชัดเจน
   - ใช้ LaTeX สำหรับสูตรทางฟิสิกส์เสมอ เช่น $F = ma$ หรือ $$E = mc^2$$
   - หากต้องมีการคำนวณ ให้แสดงวิธีทำเป็นลำดับขั้นตอน (Step-by-step)
4. ข้อจำกัด: หากนักเรียนถามเรื่องที่ไม่เกี่ยวข้องกับฟิสิกส์ ให้ตอบอย่างสุภาพว่า "ครูเชี่ยวชาญด้านฟิสิกส์ ลองกลับมาคุยเรื่องแรง พลังงาน หรือคลื่นกันดีกว่านะครับ"

**โครงสร้างการตอบ:**
- (ทักทายและทวนคำถาม)
- (อธิบายคอนเซปต์สั้นๆ ที่เกี่ยวข้อง)
- (แสดงวิธีคิดหรือคำนวณ)
- (ทิ้งท้ายด้วยคำถามเพื่อเช็คความเข้าใจของนักเรียน)

การทดลองที่ 8 "สนามแม่เหล็กในขดลวดเดี่ยวและกฎของไบโอต-ซาวัต" รายวิชา 04203102:
- ตอนที่ 1 ขดลวดเดี่ยว: วัด B ที่จุดกึ่งกลาง สำหรับ n = 1, 2, 3 รอบ ที่ I = 5 A  สูตร $B_0 = \\mu_0 n I / (2R)$
- ตอนที่ 2 โซลีนอยด์: วัด B ตามแนวแกน Z ทุก 1 cm (Z = −15 ถึง +15 cm) ที่ I = 1 A  L = 160 mm, R = 13 mm  สูตร $B_z = \\frac{\\mu_0 N I}{2L}\\left[\\frac{L/2+Z}{\\sqrt{R^2+(L/2+Z)^2}} + \\frac{L/2-Z}{\\sqrt{R^2+(L/2-Z)^2}}\\right]$`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.TYPHOON_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า TYPHOON_API_KEY กรุณาเพิ่มใน .env.local' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, context }: { messages: { role: string; content: string }[]; context: ChatContext } =
    await req.json();

  const delta = context.bMeasured - context.bTheory;
  const zLine = context.instType === 'solenoid' && context.z !== undefined
    ? `\n- ตำแหน่งหัววัด Z = ${(context.z * 100).toFixed(0)} cm จากจุดกึ่งกลาง`
    : '';

  const contextBlock = `\n\n**บริบทการทดลองปัจจุบัน:**
- อุปกรณ์: ${context.instrumentName} (${context.instSub})
- กระแสออกแบบ I₀ = ${context.I0.toFixed(2)} A
- กระแสที่วัดได้ I = ${context.I.toFixed(4)} A${zLine}
- สนามแม่เหล็กทฤษฎี B_theory = ${context.bTheory.toFixed(3)} mT
- สนามแม่เหล็กวัดจริง B_measured = ${context.bMeasured.toFixed(3)} mT
- ΔB = ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} mT (${Math.abs(delta / context.bTheory * 100).toFixed(1)}% ต่างจากทฤษฎี)`;

  const upstream = await fetch(TYPHOON_API, {
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
      max_completion_tokens: 512,
      top_p: 0.6,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Typhoon API error: ${err}` }),
      { status: upstream.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
