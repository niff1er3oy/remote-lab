import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getAdminUser } from '@/lib/admin';

// PATCH /api/admin/labs/[id]  { is_active: boolean }
// Opens or closes a lab to booking. Bookings already made are left alone.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => null) as { is_active?: unknown } | null;
  if (typeof body?.is_active !== 'boolean')
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  try {
    const ref = adminDb.collection('labs').doc(id);
    if (!(await ref.get()).exists) return NextResponse.json({ ok: false, error: 'ไม่พบห้องทดลองนี้' }, { status: 404 });
    await ref.update({ is_active: body.is_active });
    return NextResponse.json({ ok: true, is_active: body.is_active });
  } catch (err) {
    console.error('[admin/labs PATCH]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
