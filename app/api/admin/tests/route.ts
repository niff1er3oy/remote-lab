import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import report from '@/lib/test-report.json';

// GET /api/admin/tests
// The unit tests and how they went the last time `npm run test:report` was
// run: lib/test-report.json, as that script wrote it. Nothing is run here.
// Test names say how the system is guarded, so this is for admins only.
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });
  return NextResponse.json({ ok: true, report });
}
