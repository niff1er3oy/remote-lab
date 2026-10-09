import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { rigAccess } from '@/lib/rig-access';
import { rigState } from '@/lib/rig';
import { enterRoom, isInRoom, leaveRoom, stayInRoom } from '@/lib/lab-presence';

// POST /api/lab/presence  { action: 'enter' | 'stay' | 'leave' }
// The lab page tells the server it has been opened, is still open, or is being
// left. The power supply follows: on while someone is in the room, off when it
// is empty. Answers with whether the supply is on, as far as the server knows.

// How long a round that was found running is trusted before it is looked up again.
const RECHECK_MS = 60_000;
const holder = globalThis as typeof globalThis & { __labPresenceChecked?: Map<string, number> };
const checked = () => (holder.__labPresenceChecked ??= new Map<string, number>());

const answer = () => NextResponse.json({ ok: true, supply: rigState().supply });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const body = await request.json().catch(() => null) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== 'enter' && action !== 'stay' && action !== 'leave')
    return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });

  // Leaving needs no round: it only ever switches things off.
  if (action === 'leave') {
    checked().delete(user.uid);
    await leaveRoom(user.uid);
    return answer();
  }

  const known = isInRoom(user.uid);
  const fresh = Date.now() - (checked().get(user.uid) ?? 0) < RECHECK_MS;
  if (!(action === 'stay' && known && fresh)) {
    let access;
    try {
      access = await rigAccess(user.uid, 0);
    } catch (err) {
      console.error('[lab/presence] Could not check the booking:', err);
      return NextResponse.json({ ok: false, error: 'ตรวจสอบรอบทดลองไม่ได้ ลองใหม่อีกครั้ง' }, { status: 500 });
    }
    if (access !== 'active') {
      // The round is over: whoever is still on the page is no longer in the room.
      checked().delete(user.uid);
      await leaveRoom(user.uid);
      return NextResponse.json({ ok: false, error: 'ไม่มีรอบทดลองที่กำลังดำเนินอยู่' }, { status: 403 });
    }
    checked().set(user.uid, Date.now());
  }

  if (action === 'stay' && known) stayInRoom(user.uid);
  // A page heard from for the first time without having said it entered was
  // open all along (the server restarted, or the page went quiet for a while).
  else await enterRoom(user.uid, action === 'enter');
  return answer();
}
