import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { checkReadiness } from '@/lib/lab-readiness';

// POST /api/admin/readiness
// Checks the lab machine itself, when an admin asks: the rig's scripts and
// their Python, a reading from the sensor, the cameras and the database.
// Nothing on the rig is run or switched (lib/lab-readiness.ts).
export async function POST() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, ...(await checkReadiness()) });
  } catch (err) {
    console.error('[admin/readiness]', err);
    return NextResponse.json({ ok: false, error: 'ตรวจความพร้อมไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
}
