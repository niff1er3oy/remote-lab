import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { validateRoom } from '@/lib/validate-room';
import { getSessionUser } from '@/lib/session';

export async function GET(req: NextRequest) {
  if (!(await getSessionUser()))
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const roomCode = req.nextUrl.searchParams.get('room')?.toUpperCase().trim();
  if (!roomCode)
    return NextResponse.json({ ok: false, error: 'กรุณาระบุรหัสห้อง' }, { status: 400 });

  try {
    const booking = await validateRoom(roomCode);
    if (!booking)
      return NextResponse.json(
        { ok: false, error: 'รหัสห้องไม่ถูกต้อง หรือห้องนี้ไม่ได้เปิดใช้งานอยู่' },
        { status: 404 }
      );

    const labSnap = await adminDb.collection('labs').doc(booking.labId).get();
    const lab = labSnap.data();
    const hostUser = await adminAuth.getUser(booking.userId);

    return NextResponse.json({
      ok:        true,
      room_code: booking.roomCode,
      lab_code:  lab?.code,
      lab_name:  lab?.name_th,
      host_name: hostUser.displayName ?? 'ผู้ใช้',
      end_time:  booking.endTime.toISOString(),
    });
  } catch (err) {
    console.error('[lab/join]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
