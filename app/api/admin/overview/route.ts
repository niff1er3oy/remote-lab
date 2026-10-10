import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getAdminUser } from '@/lib/admin';
import { rigSettings } from '@/lib/rig-settings';

const LIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];
const DAY_MS = 86_400_000;
const MAX_DAYS = 31;

type BookingDoc = {
  user_id: string; lab_id: string; status: string;
  start_time: Timestamp; end_time: Timestamp;
  blocked?: boolean; note?: string;
};

// Names and emails live in Firebase Auth, not in Firestore.
async function people(uids: string[]): Promise<Map<string, { name: string; email: string }>> {
  const found = new Map<string, { name: string; email: string }>();
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await adminAuth.getUsers(uids.slice(i, i + 100).map(uid => ({ uid })));
    for (const u of users) found.set(u.uid, { name: u.displayName ?? '', email: u.email ?? '' });
  }
  return found;
}

// GET /api/admin/overview?from=YYYY-MM-DD&days=7
// Everything the admin page shows: the labs, who is in the lab room right now,
// and every booking that starts in the days asked for (Thai time).
export async function GET(req: NextRequest) {
  if (!(await getAdminUser())) return NextResponse.json({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const from = params.get('from') ?? today;
  const days = Number(params.get('days') ?? 7);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00+07:00`) : new Date(NaN);
  if (Number.isNaN(start.getTime()) || !Number.isInteger(days) || days < 1 || days > MAX_DAYS)
    return NextResponse.json({ ok: false, error: 'ช่วงวันที่ไม่ถูกต้อง' }, { status: 400 });

  try {
    const now = Date.now();
    const [labsSnap, rangeSnap, recentSnap] = await Promise.all([
      adminDb.collection('labs').get(),
      adminDb.collection('bookings')
        .where('start_time', '>=', Timestamp.fromDate(start))
        .where('start_time', '<', Timestamp.fromMillis(start.getTime() + days * DAY_MS))
        .orderBy('start_time', 'asc')
        .get(),
      // Whatever is running now started within the last day.
      adminDb.collection('bookings')
        .where('start_time', '<=', Timestamp.fromMillis(now))
        .where('start_time', '>=', Timestamp.fromMillis(now - DAY_MS))
        .orderBy('start_time', 'asc')
        .get(),
    ]);

    const running = recentSnap.docs
      .map(d => ({ id: d.id, ...(d.data() as BookingDoc) }))
      .filter(b => LIVE_STATUSES.includes(b.status) && b.end_time.toMillis() >= now);
    const listed = rangeSnap.docs.map(d => ({ id: d.id, ...(d.data() as BookingDoc) }));
    const who = await people([...new Set([...listed, ...running].map(b => b.user_id))]);

    const shape = (b: BookingDoc & { id: string }) => ({
      booking_id: b.id,
      lab_id: b.lab_id,
      status: b.status,
      start_time: b.start_time.toDate().toISOString(),
      end_time: b.end_time.toDate().toISOString(),
      blocked: b.blocked === true,
      note: b.note ?? '',
      user: { uid: b.user_id, name: who.get(b.user_id)?.name ?? '', email: who.get(b.user_id)?.email ?? '' },
    });

    return NextResponse.json({
      ok: true,
      from,
      days,
      labs: labsSnap.docs.map(d => {
        const lab = d.data() as { code?: string; name_th?: string; is_active?: boolean };
        return { lab_id: d.id, code: lab.code ?? d.id, name_th: lab.name_th ?? '', is_active: lab.is_active === true };
      }),
      ...await rigSettings(),
      running: running.map(shape),
      bookings: listed.map(shape),
    });
  } catch (err) {
    console.error('[admin/overview]', err);
    return NextResponse.json({ ok: false, error: 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
}
