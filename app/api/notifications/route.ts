import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

// GET — ดึงการแจ้งเตือน 20 รายการล่าสุด
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const snap = await adminDb.collection('notifications')
    .where('user_id', '==', user.uid)
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();

  const notifications = snap.docs.map(d => {
    const data = d.data();
    return {
      notification_id: d.id,
      title: data.title,
      message: data.message,
      type: data.type,
      action_url: data.action_url ?? null,
      is_read: data.is_read,
      created_at: (data.created_at as Timestamp).toDate().toISOString(),
    };
  });
  const unread = notifications.filter(n => !n.is_read).length;
  return NextResponse.json({ ok: true, notifications, unread });
}

// PATCH — อ่านทั้งหมด
export async function PATCH(_req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const snap = await adminDb.collection('notifications').where('user_id', '==', user.uid).where('is_read', '==', false).get();
  const batch = adminDb.batch();
  snap.docs.forEach(d => batch.update(d.ref, { is_read: true }));
  await batch.commit();

  return NextResponse.json({ ok: true });
}
