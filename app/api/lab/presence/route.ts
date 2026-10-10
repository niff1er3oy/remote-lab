import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { rigAccess } from '@/lib/rig-access';
import { rigState } from '@/lib/rig';
import { INSTRUMENT_SCRIPTS } from '@/lib/instruments';
import { enterRoom, isHeld, isInRoom, leaveRoom, stayInRoom, studentSwitch } from '@/lib/lab-presence';

// POST /api/lab/presence  { action: 'enter' | 'stay' | 'leave' | 'on' | 'off', instrument? }
// The lab page tells the server it has been opened, is still open, or is being
// left. The power supply follows: on when someone enters the room, off when it
// is empty. 'on' and 'off' are the student's own switch, for as long as their
// round runs. `instrument` is the script of the instrument selected on the
// page: its relay is the one switched on. Answers with whether the supply is on, as far as the server
// knows, and whether an admin is holding it off.

// How long a round that was found running is trusted before it is looked up again.
const RECHECK_MS = 60_000;
const holder = globalThis as typeof globalThis & { __labPresenceChecked?: Map<string, number> };
const checked = () => (holder.__labPresenceChecked ??= new Map<string, number>());

const state = () => ({ supply: rigState().supply, held: isHeld() });
const answer = () => NextResponse.json({ ok: true, ...state() });

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const body = await request.json().catch(() => null) as { action?: unknown; instrument?: unknown } | null;
  const action = body?.action;
  // Anything but a known instrument is as good as not said.
  const instrument = INSTRUMENT_SCRIPTS.includes(body?.instrument as string) ? body?.instrument : undefined;
  if (action !== 'enter' && action !== 'stay' && action !== 'leave' && action !== 'on' && action !== 'off')
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

  if (action === 'on' || action === 'off') {
    const result = await studentSwitch(user.uid, action === 'on', instrument);
    if (result === 'held')
      return NextResponse.json({ ok: false, error: 'ผู้ดูแลระบบปิดแหล่งจ่ายไฟไว้ จึงเปิดเองไม่ได้', ...state() }, { status: 409 });
    if (result === 'failed')
      return NextResponse.json({ ok: false, error: 'สั่งแหล่งจ่ายไฟไม่สำเร็จ ลองใหม่อีกครั้ง', ...state() }, { status: 500 });
    return answer();
  }

  if (action === 'stay' && known) stayInRoom(user.uid);
  // A page heard from for the first time without having said it entered was
  // open all along (the server restarted, or the page went quiet for a while).
  else await enterRoom(user.uid, action === 'enter', instrument);
  return answer();
}
