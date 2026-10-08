import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { cutAllCircuits } from '@/lib/rig';

// POST /api/admin/rig/stop
// The emergency stop: cuts the coil and the solenoid circuits now, whoever has
// the rig and whatever it is doing. It does not wait for a command in
// progress, since waiting is the one thing an emergency stop must not do.
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  console.log(`[admin/rig/stop] circuits cut by ${admin.uid}`);
  const failed = await cutAllCircuits();
  if (failed.length)
    return NextResponse.json({ ok: false, error: 'ตัดวงจรไม่สำเร็จ ตรวจสอบอุปกรณ์ที่ห้องแลปโดยตรง', failed }, { status: 500 });
  return NextResponse.json({ ok: true });
}
