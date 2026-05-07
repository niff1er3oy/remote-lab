import { NextRequest } from 'next/server';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY กรุณาเพิ่มใน .env.local' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, context }: { messages: { role: string; content: string }[]; context: ChatContext } =
    await req.json();

  const delta = context.bMeasured - context.bTheory;
  const zLine = context.instType === 'solenoid' && context.z !== undefined
    ? `\n- ตำแหน่งหัววัด Z = ${(context.z * 100).toFixed(0)} cm จากจุดกึ่งกลาง`
    : '';

  const systemText = `คุณเป็นผู้ช่วยสอนฟิสิกส์สำหรับการทดลองที่ 8 เรื่อง "สนามแม่เหล็กในขดลวดเดี่ยวและกฎของไบโอต-ซาวัต" รายวิชา 04203102 หลักฟิสิกส์ภาคปฏิบัติการ ตอบเป็นภาษาไทยเสมอ ตอบกระชับ ใช้สมการในรูปแบบอ่านง่าย

การทดลองแบ่งเป็น 2 ตอน:
- ตอนที่ 1 ขดลวดเดี่ยว: วัด B ที่จุดกึ่งกลาง สำหรับ n = 1, 2, 3 รอบ ที่ I = 5 A  สูตร B₀ = μ₀nI / (2R)
- ตอนที่ 2 โซลีนอยด์: วัด B ตามแนวแกน Z ทุก 1 cm (Z = −15 ถึง +15 cm) ที่ I = 1 A  L = 160 mm, R = 13 mm  สูตร B_z = (μ₀NI/2L)·[(L/2+Z)/√(R²+(L/2+Z)²) + (L/2−Z)/√(R²+(L/2−Z)²)]  ใช้โซลีนอยด์ 75 รอบ และ 150 รอบ เปรียบเทียบกัน

**บริบทการทดลองปัจจุบัน:**
- อุปกรณ์: ${context.instrumentName} (${context.instSub})
- กระแสออกแบบ I₀ = ${context.I0.toFixed(2)} A
- กระแสที่วัดได้ I = ${context.I.toFixed(4)} A${zLine}
- สนามแม่เหล็กทฤษฎี B_theory = ${context.bTheory.toFixed(3)} mT
- สนามแม่เหล็กวัดจริง B_measured = ${context.bMeasured.toFixed(3)} mT
- ΔB = ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} mT (${Math.abs(delta / context.bTheory * 100).toFixed(1)}% ต่างจากทฤษฎี)`;

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemText,
      messages,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Anthropic API error: ${err}` }),
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
