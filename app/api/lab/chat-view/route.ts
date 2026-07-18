import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { validateRoom } from '@/lib/validate-room';

export async function GET(req: NextRequest) {
  const roomCode = req.nextUrl.searchParams.get('room')?.toUpperCase().trim();
  const since    = req.nextUrl.searchParams.get('since');
  const sinceDate = since ? new Date(since) : new Date(0);

  if (!roomCode)
    return NextResponse.json({ ok: false }, { status: 400 });

  try {
    if (!await validateRoom(roomCode)) return NextResponse.json({ ok: false }, { status: 404 });

    const snap = await adminDb.collection('lab_chat')
      .where('lab_code', '==', roomCode)
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

    return NextResponse.json({ ok: true, messages, lab_code: roomCode });
  } catch (err) {
    console.error('[lab/chat-view GET]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const roomCode  = (body.room   as string)?.toUpperCase().trim();
    const name      = (body.name   as string)?.trim().slice(0, 40);
    const rawId     = (body.viewer_id as string)?.trim() ?? '';
    const viewerId  = rawId.startsWith('viewer_') ? rawId.slice(7) : rawId;
    const content   = (body.content as string)?.trim().slice(0, 1000);

    if (!roomCode || !name || !viewerId || !content)
      return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ครบ' }, { status: 400 });

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(viewerId))
      return NextResponse.json({ ok: false, error: 'viewer_id ไม่ถูกต้อง' }, { status: 400 });

    if (!await validateRoom(roomCode))
      return NextResponse.json({ ok: false, error: 'ห้องปิดแล้วหรือไม่มีอยู่' }, { status: 404 });

    const now = new Date();
    const ref = await adminDb.collection('lab_chat').add({
      lab_code: roomCode,
      user_id: viewerId,
      user_name: name,
      content,
      created_at: FieldValue.serverTimestamp(),
    });

    const message = { id: ref.id, user_id: viewerId, user_name: name, content, created_at: now.toISOString() };

    const broadcast = (global as { __wssBroadcastToRoom?: (room: string, msg: unknown) => void }).__wssBroadcastToRoom;
    if (broadcast) broadcast(`lab:${roomCode}`, { type: 'chat', payload: message });

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    console.error('[lab/chat-view POST]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
