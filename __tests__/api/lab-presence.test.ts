/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/lab/presence/route';
import { POST as switchSupply } from '@/app/api/admin/rig/power/route';
import { POST as stopRig } from '@/app/api/admin/rig/stop/route';
import { isInRoom, resetPresence } from '@/lib/lab-presence';
import { resetRigState, runRigScript } from '@/lib/rig';
import { breakDb, resetDb, seedBooking } from '../helpers/server/firestore';
import { knownAccount, resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from '../helpers/server/session';
import { freezeTime, moveTimeTo, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

type RunScript = (file: string, args: string[], options: { cwd?: string }) => Promise<{ stdout: string; stderr: string }>;
jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const runScript = jest.fn();
  return { runScript, execFile: Object.assign(jest.fn(), { [promisify.custom]: runScript }) };
});
const { runScript } = jest.requireMock<{ runScript: jest.MockedFunction<RunScript> }>('child_process');
const ran = () => runScript.mock.calls.map(([, args]) => args.join(' '));
const ON = 'relay.py --status on --name all';
const OFF = 'relay.py --status off --name all';

const NOW = Date.parse('2026-10-08T03:00:00Z');
const tell = async (action: unknown, instrument?: unknown) => {
  const res = await POST(new Request('http://localhost/api/lab/presence', { method: 'POST', body: JSON.stringify({ action, instrument }) }));
  return { status: res.status, body: await res.json() };
};
const adminPower = (on: boolean) =>
  switchSupply(new NextRequest('http://localhost/api/admin/rig/power', { method: 'POST', body: JSON.stringify({ on }) }));
const round = (startAgo: number, length = 2 * HOUR, status = 'confirmed') =>
  seedBooking('b1', { user: STUDENT.uid, status, start: NOW - startAgo, end: NOW - startAgo + length });

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  resetAuth();
  resetPresence();
  resetRigState();
  (globalThis as { __labPresenceChecked?: unknown }).__labPresenceChecked = undefined;
  knownAccount(ADMIN.uid, 'Admin One', 'admin@example.com');
  runScript.mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  signInAs(STUDENT);
});

afterEach(() => {
  resetPresence();
  restoreTime();
  jest.restoreAllMocks();
});

describe('POST /api/lab/presence', () => {
  it('answers 401 to someone who is not signed in', async () => {
    signOut();
    expect((await tell('enter')).status).toBe(401);
    expect(ran()).toEqual([]);
  });

  it.each(['toggle', ON, '', null, 1])('answers 400 for the action %j', async (action) => {
    round(30 * MINUTE);
    expect((await tell(action)).status).toBe(400);
    expect(ran()).toEqual([]);
  });

  it('entering during a running round switches the supply on', async () => {
    round(30 * MINUTE);
    expect(await tell('enter')).toEqual({ status: 200, body: { ok: true, supply: true, held: false } });
    expect(ran()).toEqual([ON]);
  });

  it.each([
    ['no round at all', () => {}],
    ['a round that has ended', () => round(3 * HOUR)],
    ['a round that was cancelled', () => round(30 * MINUTE, 2 * HOUR, 'cancelled')],
  ])('entering with %s answers 403 and switches nothing', async (_label, arrange) => {
    arrange();
    expect((await tell('enter')).status).toBe(403);
    expect(ran()).toEqual([]);
    expect(isInRoom(STUDENT.uid)).toBe(false);
  });

  it('answers 500 and switches nothing when the round cannot be looked up', async () => {
    round(30 * MINUTE);
    breakDb(new Error('UNAVAILABLE: firestore'));
    const { status, body } = await tell('enter');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('UNAVAILABLE');
    expect(ran()).toEqual([]);
  });

  it('leaving switches the supply off, and reports it', async () => {
    round(30 * MINUTE);
    await tell('enter');
    expect(await tell('leave')).toEqual({ status: 200, body: { ok: true, supply: false, held: false } });
    expect(ran()).toEqual([ON, OFF]);
  });

  it('leaving is accepted after the round has ended', async () => {
    round(30 * MINUTE);
    await tell('enter');
    moveTimeTo(NOW + 3 * HOUR);
    expect((await tell('leave')).status).toBe(200);
    expect(ran()).toEqual([ON, OFF]);
  });

  it('staying does not run the relay again', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await tell('stay');
    await tell('stay');
    expect(ran()).toEqual([ON]);
  });

  it('a page still open after its round ended is put out, and the supply goes off', async () => {
    round(30 * MINUTE);
    await tell('enter');
    moveTimeTo(NOW + 2 * HOUR + MINUTE);
    expect((await tell('stay')).status).toBe(403);
    expect(isInRoom(STUDENT.uid)).toBe(false);
    expect(ran()).toEqual([ON, OFF]);
  });

  it('a page heard from for the first time by "stay" is let in and the supply comes on', async () => {
    // As after a server restart with the lab page still open.
    round(30 * MINUTE);
    expect(await tell('stay')).toEqual({ status: 200, body: { ok: true, supply: true, held: false } });
    expect(isInRoom(STUDENT.uid)).toBe(true);
  });

  it('after an admin switches off, staying reports the supply off and does not switch it back on', async () => {
    round(30 * MINUTE);
    await tell('enter');
    signInAs(ADMIN);
    expect((await adminPower(false)).status).toBe(200);
    signInAs(STUDENT);
    expect(await tell('stay')).toEqual({ status: 200, body: { ok: true, supply: false, held: true } });
    expect(ran()).toEqual([ON, OFF]);
  });

  it('after an admin switches off, walking in anew switches the supply on again', async () => {
    round(30 * MINUTE);
    signInAs(ADMIN);
    await adminPower(false);
    signInAs(STUDENT);
    expect((await tell('enter')).body.supply).toBe(true);
    expect(ran()).toEqual([OFF, ON]);
  });
});

describe('POST /api/lab/presence — the instrument selected on the page', () => {
  it('entering switches on the relay of that instrument', async () => {
    round(30 * MINUTE);
    expect((await tell('enter', 'sole.py')).body.supply).toBe(true);
    expect(ran()).toEqual([OFF, 'relay.py --status on --name solenoid']);
  });

  it('the student\'s switch switches on the relay of the instrument now selected', async () => {
    round(30 * MINUTE);
    await tell('enter', 'coil_1.py');
    await tell('off', 'coil_3.py');
    runScript.mockClear();
    expect((await tell('on', 'coil_3.py')).body.supply).toBe(true);
    expect(ran()).toEqual(['relay.py --status on --name coil3']);
  });

  it.each(['coil_b.py', 'relay.py', '../sole.py', 'all', 7, { script: 'sole.py' }])('takes the instrument %j as not said: nothing from the request reaches the command', async (instrument) => {
    round(30 * MINUTE);
    expect((await tell('enter', instrument)).status).toBe(200);
    expect(ran()).toEqual([ON]);
  });

  it('an admin switching on feeds the instrument whose circuit is on', async () => {
    round(30 * MINUTE);
    await tell('enter', 'coil_2.py');
    await runRigScript(['coil_2.py']);
    signInAs(ADMIN);
    await adminPower(false);
    runScript.mockClear();
    expect((await adminPower(true)).status).toBe(200);
    expect(ran()).toEqual(['relay.py --status on --name coil2']);
  });
});

describe('POST /api/lab/presence — the student\'s own switch', () => {
  it('switches the supply off and on again during the round', async () => {
    round(30 * MINUTE);
    await tell('enter');
    expect(await tell('off')).toEqual({ status: 200, body: { ok: true, supply: false, held: false } });
    expect(await tell('on')).toEqual({ status: 200, body: { ok: true, supply: true, held: false } });
    expect(ran()).toEqual([ON, OFF, ON]);
  });

  it('staying does not switch back on what the student switched off', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await tell('off');
    expect((await tell('stay')).body.supply).toBe(false);
    expect(ran()).toEqual([ON, OFF]);
  });

  it.each(['on', 'off'])('refuses "%s" without a running round', async (action) => {
    round(3 * HOUR);
    expect((await tell(action)).status).toBe(403);
    expect(ran()).toEqual([]);
  });

  it.each(['on', 'off'])('refuses "%s" from someone who is not signed in', async (action) => {
    round(30 * MINUTE);
    signOut();
    expect((await tell(action)).status).toBe(401);
    expect(ran()).toEqual([]);
  });

  it('does not switch on what an admin switched off, and says why', async () => {
    round(30 * MINUTE);
    await tell('enter');
    signInAs(ADMIN);
    await adminPower(false);
    signInAs(STUDENT);
    const { status, body } = await tell('on');
    expect(status).toBe(409);
    expect(body).toMatchObject({ ok: false, supply: false, held: true });
    expect(ran()).toEqual([ON, OFF]);
  });

  it('switches on again once the admin has switched the supply back on', async () => {
    round(30 * MINUTE);
    await tell('enter');
    signInAs(ADMIN);
    await adminPower(false);
    await adminPower(true);
    signInAs(STUDENT);
    await tell('off');
    expect((await tell('on')).status).toBe(200);
  });

  it('still lets the student switch off while an admin holds the supply off', async () => {
    round(30 * MINUTE);
    await tell('enter');
    signInAs(ADMIN);
    await adminPower(false);
    signInAs(STUDENT);
    expect((await tell('off')).status).toBe(200);
  });

  it('answers 500 without the script\'s output when the relay does not answer', async () => {
    round(30 * MINUTE);
    await tell('enter');
    runScript.mockRejectedValueOnce(new Error('Traceback: /home/admin/Documents/relay.py'));
    const { status, body } = await tell('off');
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/Traceback|home\/admin/);
    expect(body.supply).toBe(true);
  });

  it('the supply a student switched on still goes off when they leave', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await tell('off');
    await tell('on');
    await tell('leave');
    expect(ran().slice(-1)).toEqual([OFF]);
  });
});

describe('POST /api/lab/presence — after the emergency stop', () => {
  const STOP = ['coil_b.py', 'sole_b.py', OFF];
  const stop = async () => {
    signInAs(ADMIN);
    const res = await stopRig();
    signInAs(STUDENT);
    return res.status;
  };

  it('does not switch on for the student in the room, and says the supply is held', async () => {
    round(30 * MINUTE);
    await tell('enter');
    expect(await stop()).toBe(200);
    const { status, body } = await tell('on');
    expect(status).toBe(409);
    expect(body).toMatchObject({ ok: false, supply: false, held: true });
    expect(ran()).toEqual([ON, ...STOP]);
  });

  it('staying reports the supply off and held, and does not switch it back on', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await stop();
    expect(await tell('stay')).toEqual({ status: 200, body: { ok: true, supply: false, held: true } });
    expect(ran()).toEqual([ON, ...STOP]);
  });

  it('holds the supply even when none of the scripts could be run', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await tell('off');
    runScript.mockRejectedValue(new Error('Traceback: /home/admin/Documents/relay.py'));
    expect(await stop()).toBe(500);
    runScript.mockReset().mockResolvedValue({ stdout: '', stderr: '' });
    const { status, body } = await tell('on');
    expect(status).toBe(409);
    expect(body.held).toBe(true);
    expect(ran()).toEqual([]);
  });

  it('switches on again once an admin has switched the supply on', async () => {
    round(30 * MINUTE);
    await tell('enter');
    await stop();
    signInAs(ADMIN);
    await adminPower(true);
    signInAs(STUDENT);
    await tell('off');
    expect(await tell('on')).toEqual({ status: 200, body: { ok: true, supply: true, held: false } });
  });

  it('switches on for the next student who walks in', async () => {
    round(30 * MINUTE);
    await stop();
    expect(await tell('enter')).toEqual({ status: 200, body: { ok: true, supply: true, held: false } });
    expect(ran()).toEqual([...STOP, ON]);
  });
});
