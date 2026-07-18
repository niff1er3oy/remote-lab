import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { getSessionUser } from '@/lib/session';

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const lab   = req.nextUrl.searchParams.get('lab') ?? 'LAB8';
  const since = req.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(0);

  try {
    const snap = await adminDb.collection('lab_chat')
      .where('lab_code', '==', lab)
      .where('created_at', '>', Timestamp.fromDate(sinceDate))
      .orderBy('created_at', 'asc')
      .limit(80)
      .get();

    const messages = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        user_id: data.user_id,
        user_name: data.user_name,
        content: data.content,
        created_at: (data.created_at as Timestamp).toDate().toISOString(),
      };
    });

    return NextResponse.json({ ok: true, messages });
  } catch (err) {
    console.error('[lab/chat GET]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const { lab, content } = await req.json();
    if (!content?.trim()) return NextResponse.json({ ok: false }, { status: 400 });

    const authUser = await adminAuth.getUser(user.uid);
    const userName = authUser.displayName ?? 'ผู้ใช้';
    const chatKey = lab ?? 'LAB8';
    const now = new Date();

    const ref = await adminDb.collection('lab_chat').add({
      lab_code: chatKey,
      user_id: user.uid,
      user_name: userName,
      content: content.trim(),
      created_at: FieldValue.serverTimestamp(),
    });

    const message = {
      id: ref.id,
      user_id: user.uid,
      user_name: userName,
      content: content.trim(),
      created_at: now.toISOString(),
    };

    // Broadcast to WebSocket room so all clients receive instantly
    const broadcast = (global as { __wssBroadcastToRoom?: (room: string, msg: unknown) => void }).__wssBroadcastToRoom;
    if (broadcast) broadcast(`lab:${chatKey}`, { type: 'chat', payload: message });

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    console.error('[lab/chat POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
