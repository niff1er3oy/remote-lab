import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { rigState } from '@/lib/rig';
import { checkCameras, checkSensor } from '@/lib/lab-status';

// GET /api/admin/status
// The state of the equipment in the lab room: what the rig was last told to
// do, and whether the cameras and the sensor service answer right now.
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const [cameras, sensor] = await Promise.all([checkCameras(), checkSensor()]);
  return NextResponse.json({ ok: true, checked_at: new Date().toISOString(), rig: rigState(), cameras, sensor });
}
