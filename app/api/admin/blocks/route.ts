import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getAdminUser } from '@/lib/admin';

const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];
const MAX_BLOCK_MS = 7 * 86_400_000;

class OverlapError extends Error {
  constructor(readonly count: number) { super('overlap'); }
}

const parse = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// POST /api/admin/blocks  { lab_id, start_time, end_time, note? }
// Closes a stretch of time to booking (maintenance, a class using the room).
// The block is a booking held by the admin and marked `blocked`, so the
// calendar and the overlap check treat it like any other taken time. It is
// lifted by cancelling it.
export async function POST(req: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const body = await req.json().catch(() => null) as { lab_id?: unknown; start_time?: unknown; end_time?: unknown; note?: unknown } | null;
  const labId = body?.lab_id;
  const start = parse(body?.start_time);
  const end = parse(body?.end_time);
  if (typeof labId !== 'string' || !labId || !start || !end)
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบถ้วน' }, { status: 400 });
  if (end <= start) return NextResponse.json({ ok: false, error: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม' }, { status: 400 });
  if (end.getTime() <= Date.now()) return NextResponse.json({ ok: false, error: 'ช่วงเวลานี้ผ่านไปแล้ว' }, { status: 400 });
  if (end.getTime() - start.getTime() > MAX_BLOCK_MS)
    return NextResponse.json({ ok: false, error: 'ปิดได้ครั้งละไม่เกิน 7 วัน' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.replace(/\s+/g, ' ').trim().slice(0, 120) : '';

  try {
    const lab = await adminDb.collection('labs').doc(labId).get();
    if (!lab.exists) return NextResponse.json({ ok: false, error: 'ไม่พบห้องทดลองนี้' }, { status: 404 });

    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);
    try {
      await adminDb.runTransaction(async (tx) => {
        const candidates = await tx.get(
          adminDb.collection('bookings')
            .where('lab_id', '==', labId)
            .where('status', 'in', ACTIVE_STATUSES)
            .where('start_time', '<', endTs)
        );
        const overlapping = candidates.docs.filter(d => (d.data().end_time as Timestamp).toMillis() > startTs.toMillis());
        if (overlapping.length) throw new OverlapError(overlapping.length);

        tx.set(adminDb.collection('bookings').doc(), {
          user_id: admin.uid,
          lab_id: labId,
          start_time: startTs,
          end_time: endTs,
          status: 'confirmed',
          blocked: true,
          note,
          created_at: FieldValue.serverTimestamp(),
        });
      });
    } catch (err) {
      if (err instanceof OverlapError)
        return NextResponse.json({ ok: false, error: `มีการจองอยู่ในช่วงนี้ ${err.count} รายการ ยกเลิกก่อนจึงจะปิดได้` }, { status: 409 });
      throw err;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/blocks POST]', err);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 });
  }
}
