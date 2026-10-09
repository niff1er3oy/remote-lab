import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { cleanDisabled, INSTRUMENT_SCRIPTS } from '@/lib/instruments';
import { setDisabledInstruments } from '@/lib/rig-settings';

// PATCH /api/admin/rig/instruments  { disabled: string[] }
// Closes instruments to students, by the script that starts each one. The list
// replaces the one before; an empty list opens everything again.
export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const body = await req.json().catch(() => null) as { disabled?: unknown } | null;
  const sent = body?.disabled;
  if (!Array.isArray(sent) || sent.some(s => typeof s !== 'string' || !INSTRUMENT_SCRIPTS.includes(s)))
    return NextResponse.json({ ok: false, error: 'รายการอุปกรณ์ไม่ถูกต้อง' }, { status: 400 });

  const disabled = cleanDisabled(sent);
  if (disabled.length === INSTRUMENT_SCRIPTS.length)
    return NextResponse.json({ ok: false, error: 'ต้องเปิดไว้อย่างน้อยหนึ่งอุปกรณ์ ถ้าจะปิดทั้งหมดให้ปิดรับจองแทน' }, { status: 400 });

  try {
    await setDisabledInstruments(disabled, admin.uid);
    return NextResponse.json({ ok: true, disabled_instruments: disabled });
  } catch (err) {
    console.error('[admin/rig/instruments]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
