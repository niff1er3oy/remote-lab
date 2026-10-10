import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { CURRENT_MAX, INSTRUMENT_SCRIPTS, isCurrent } from '@/lib/instruments';
import { instrumentCurrents, setInstrumentCurrents } from '@/lib/rig-settings';

// PATCH /api/admin/rig/currents  { currents: { [script]: amperes } }
// Sets the current the theory is worked out with, for the instruments named;
// the others keep what they had. The rig's supply is set by hand: this does not
// change what flows, only the number the lab room calculates from.
export async function PATCH(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const body = await req.json().catch(() => null) as { currents?: unknown } | null;
  const sent = body?.currents;
  if (!sent || typeof sent !== 'object' || Array.isArray(sent) || Object.keys(sent).length === 0
    || Object.keys(sent).some(script => !INSTRUMENT_SCRIPTS.includes(script)))
    return NextResponse.json({ ok: false, error: 'รายการอุปกรณ์ไม่ถูกต้อง' }, { status: 400 });
  if (Object.values(sent).some(value => !isCurrent(value)))
    return NextResponse.json({ ok: false, error: `ค่ากระแสต้องมากกว่า 0 และไม่เกิน ${CURRENT_MAX} A ละเอียดได้ถึง 0.001 A` }, { status: 400 });

  try {
    const currents = { ...await instrumentCurrents(), ...sent as Record<string, number> };
    await setInstrumentCurrents(currents, admin.uid);
    return NextResponse.json({ ok: true, currents });
  } catch (err) {
    console.error('[admin/rig/currents]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
