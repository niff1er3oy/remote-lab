import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { feed, runRigScript, SUPPLY_OFF } from '@/lib/rig';
import { adminSwitched, relayFor } from '@/lib/lab-presence';

// POST /api/admin/rig/power  { on: boolean }
// Switches the power supply that feeds the coils and the solenoid, with or
// without a booking. On is for the instrument whose circuit is on, or every
// relay when none is; off is every relay. Switched off, it stays off for whoever is in the lab room
// now; it comes on again when an admin says so or the next student walks in.
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const body = await req.json().catch(() => null) as { on?: unknown } | null;
  if (typeof body?.on !== 'boolean') return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  console.log(`[admin/rig/power] supply switched ${body.on ? 'on' : 'off'} by ${admin.uid}`);
  try {
    if (body.on) await feed(relayFor());
    else await runRigScript(SUPPLY_OFF);
    adminSwitched(body.on);
    return NextResponse.json({ ok: true, on: body.on });
  } catch (err) {
    console.error('[admin/rig/power]', err);
    return NextResponse.json({ ok: false, error: 'สั่งแหล่งจ่ายไฟไม่สำเร็จ ตรวจสอบอุปกรณ์ที่ห้องแลปโดยตรง' }, { status: 500 });
  }
}
