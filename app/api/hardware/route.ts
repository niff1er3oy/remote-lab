import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { rigAccess } from '@/lib/rig-access';
import { BREAK_SCRIPTS, rigState, runRigScript, SUPPLY_OFF, SUPPLY_ON } from '@/lib/rig';

// The rig's whole command set. Nothing else is ever run, and nothing from the
// request reaches a shell: the script name is matched against these lists and
// the only argument, the probe position, is a checked integer.
const COIL_SCRIPTS = ['coil_1.py', 'coil_2.py', 'coil_3.py']; // switch a single coil on
const SOLENOID_SCRIPT = 'sole.py';                            // solenoid on, probe to --position
const POSITION_MIN = -15; // cm along the solenoid's axis
const POSITION_MAX = 15;

// Switching off stays possible for a short while after a booking ends, so a
// student who leaves a moment late does not leave a circuit live.
const BREAK_GRACE_MS = 10 * 60 * 1000;

let armBusy = false;

type Command = { argv: string[]; isBreak: boolean };

function readCommand(body: unknown): Command | null {
  if (!body || typeof body !== 'object') return null;
  const { script, position } = body as { script?: unknown; position?: unknown };
  if (typeof script !== 'string') return null;

  if (COIL_SCRIPTS.includes(script)) return { argv: [script], isBreak: false };
  if (BREAK_SCRIPTS.includes(script)) return { argv: [script], isBreak: true };
  // Switching the supply off is allowed whenever cutting a circuit is.
  if (script === SUPPLY_ON) return { argv: [script], isBreak: false };
  if (script === SUPPLY_OFF) return { argv: [script], isBreak: true };
  if (script === SOLENOID_SCRIPT) {
    if (typeof position !== 'number' || !Number.isInteger(position)) return null;
    if (position < POSITION_MIN || position > POSITION_MAX) return null;
    return { argv: [script, '--position', String(position)], isBreak: false };
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ busy: armBusy, supply: rigState().supply });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });

  const command = readCommand(await request.json().catch(() => null));
  if (!command) return NextResponse.json({ error: 'คำสั่งอุปกรณ์ไม่ถูกต้อง' }, { status: 400 });

  // Signing in is open to any Google account; the rig is only for whoever has
  // it booked at this moment.
  let access;
  try {
    access = await rigAccess(user.uid, BREAK_GRACE_MS);
  } catch (err) {
    console.error('[Hardware API] Could not check the booking:', err);
    return NextResponse.json({ error: 'ตรวจสอบรอบทดลองไม่ได้ ลองใหม่อีกครั้ง' }, { status: 500 });
  }
  if (access !== 'active' && !(command.isBreak && access === 'just-ended')) {
    return NextResponse.json({ error: 'ไม่มีรอบทดลองที่กำลังดำเนินอยู่ จึงสั่งอุปกรณ์ไม่ได้' }, { status: 403 });
  }

  if (armBusy) return NextResponse.json({ error: 'อุปกรณ์กำลังทำงานอยู่ รอสักครู่แล้วลองใหม่' }, { status: 409 });

  const shown = `python ${command.argv.join(' ')}`;
  console.log(`[Hardware API] Executing: ${shown} (user ${user.uid})`);

  armBusy = true;
  try {
    const { stdout, stderr } = await runRigScript(command.argv);
    console.log(`[Hardware API] Success: ${stdout}`);
    if (stderr) console.error(`[Hardware API] Stderr: ${stderr}`);
    return NextResponse.json({ success: stdout.includes('Path finished.'), output: stdout });
  } catch (execError) {
    // The details (paths, the script's traceback) stay in the server log.
    console.error(`[Hardware API] Execution failed: ${shown}`, execError);
    return NextResponse.json({ error: 'สคริปต์ควบคุมอุปกรณ์ทำงานผิดพลาด' }, { status: 500 });
  } finally {
    armBusy = false;
  }
}
