import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { cutAllCircuits } from '@/lib/rig';
import { adminSwitched } from '@/lib/lab-presence';

// POST /api/admin/rig/stop
// The emergency stop: cuts the coil and the solenoid circuits now, whoever has
// the rig and whatever it is doing. It does not wait for a command in
// progress, since waiting is the one thing an emergency stop must not do.
// The supply is then held off, as when an admin switches it off: it is not the
// student's to switch back on, even when a script could not be run.
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  console.log(`[admin/rig/stop] circuits cut by ${admin.uid}`);
  const failed = await cutAllCircuits();
  adminSwitched(false);
  if (failed.length)
    return NextResponse.json({ ok: false, error: 'ตัดวงจรไม่สำเร็จ ตรวจสอบอุปกรณ์ที่ห้องแลปโดยตรง', failed }, { status: 500 });
  return NextResponse.json({ ok: true });
}
