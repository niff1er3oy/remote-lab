/** @jest-environment node */
import { NextRequest } from 'next/server';
import { PATCH as setInstruments } from '@/app/api/admin/rig/instruments/route';
import { GET as overview } from '@/app/api/admin/overview/route';
import { GET as activeSession } from '@/app/api/bookings/active-session/route';
import { POST as command } from '@/app/api/hardware/route';
import { cleanDisabled, INSTRUMENT_SCRIPTS } from '@/lib/instruments';
import { disabledInstruments } from '@/lib/rig-settings';
import { runRigScript } from '@/lib/rig';
import { breakDb, LAB8, read, resetDb, seed, seedBooking } from '../helpers/server/firestore';
import { resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/rig', () => ({
  ...jest.requireActual<typeof import('@/lib/rig')>('@/lib/rig'),
  runRigScript: jest.fn(),
}));

const NOW = Date.parse('2026-10-08T03:00:00Z');
const close = async (disabled: unknown) => {
  const res = await setInstruments(new NextRequest('http://localhost/api/admin/rig/instruments', { method: 'PATCH', body: JSON.stringify({ disabled }) }));
  return { status: res.status, body: await res.json() };
};
const send = async (body: unknown) => {
  const res = await command(new Request('http://localhost/api/hardware', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const COILS = ['coil_1.py', 'coil_2.py', 'coil_3.py'];

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  resetAuth();
  seed('labs', 'LAB8', LAB8);
  seedBooking('running', { start: NOW - HOUR, end: NOW + HOUR });
  jest.mocked(runRigScript).mockReset().mockResolvedValue({ stdout: 'Path finished.\n', stderr: '' });
  signInAs(ADMIN);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('cleanDisabled', () => {
  it('keeps known instruments, once each, in the rig\'s order', () => {
    expect(cleanDisabled(['sole.py', 'coil_2.py', 'coil_2.py', 'evil.py', 7])).toEqual(['coil_2.py', 'sole.py']);
  });

  it.each([[undefined], [null], ['coil_1.py'], [{ 0: 'coil_1.py' }]])('treats %j as nothing closed', (raw) => {
    expect(cleanDisabled(raw)).toEqual([]);
  });
});

describe('PATCH /api/admin/rig/instruments', () => {
  it('has nothing closed until an admin closes something', async () => {
    expect(await disabledInstruments()).toEqual([]);
  });

  it('closes every single-coil instrument and leaves the solenoid open', async () => {
    expect(await close(COILS)).toEqual({ status: 200, body: { ok: true, disabled_instruments: COILS } });
    expect(await disabledInstruments()).toEqual(COILS);
    expect(read('settings', 'rig')).toMatchObject({ disabled_instruments: COILS, updated_by: 'admin-1' });
  });

  it('replaces the list, so an empty one opens everything again', async () => {
    await close(COILS);
    await close(['coil_3.py']);
    expect(await disabledInstruments()).toEqual(['coil_3.py']);
    await close([]);
    expect(await disabledInstruments()).toEqual([]);
  });

  it('refuses to close every instrument', async () => {
    expect((await close([...INSTRUMENT_SCRIPTS])).status).toBe(400);
    expect(await disabledInstruments()).toEqual([]);
  });

  it.each([['coil_1.py'], [['coil_1.py', 'coil_b.py']], [['relay_on.py']], [[1]], [null], [undefined]])('answers 400 for %j and changes nothing', async (disabled) => {
    await close(['coil_3.py']);
    expect((await close(disabled)).status).toBe(400);
    expect(await disabledInstruments()).toEqual(['coil_3.py']);
  });

  it.each([['a student', () => signInAs(STUDENT)], ['a signed-out visitor', () => signOut()]])('answers 403 to %s and changes nothing', async (_who, become) => {
    become();
    expect((await close(COILS)).status).toBe(403);
    expect(read('settings', 'rig')).toBeUndefined();
  });

  it('answers 500 when the setting cannot be saved', async () => {
    breakDb();
    expect((await close(COILS)).status).toBe(500);
  });
});

describe('what a closed instrument means', () => {
  beforeEach(async () => {
    await close(COILS);
    signInAs(STUDENT);
  });

  it.each(COILS)('the rig refuses to start %s, even for the student whose round is running', async (script) => {
    const { status, body } = await send({ script });
    expect(status).toBe(403);
    expect(body.error).toContain('ปิดใช้งาน');
    expect(runRigScript).not.toHaveBeenCalled();
  });

  it('the solenoid still starts and moves', async () => {
    expect((await send({ script: 'sole.py', position: 3 })).status).toBe(200);
    expect(runRigScript).toHaveBeenCalledWith(['sole.py', '--position', '3']);
  });

  it.each(['coil_b.py', 'sole_b.py'])('cutting a circuit is not held back: %s', async (script) => {
    expect((await send({ script })).status).toBe(200);
  });

  it('a closed solenoid refuses every probe position', async () => {
    signInAs(ADMIN);
    await close(['sole.py']);
    signInAs(STUDENT);
    expect((await send({ script: 'sole.py', position: 0 })).status).toBe(403);
    expect((await send({ script: 'coil_1.py' })).status).toBe(200);
  });

  it('opening it again lets it start', async () => {
    signInAs(ADMIN);
    await close([]);
    signInAs(STUDENT);
    expect((await send({ script: 'coil_1.py' })).status).toBe(200);
  });

  it('the lab room is told which instruments not to offer', async () => {
    const body = await (await activeSession()).json();
    expect(body).toMatchObject({ active: true, disabled_instruments: COILS });
  });

  it('the admin page is told too', async () => {
    signInAs(ADMIN);
    const body = await (await overview(new NextRequest('http://localhost/api/admin/overview'))).json();
    expect(body.disabled_instruments).toEqual(COILS);
  });

  it('the rig answers 500, and starts nothing, when Firestore cannot be read', async () => {
    breakDb();
    expect((await send({ script: 'sole.py', position: 1 })).status).toBe(500);
    expect(runRigScript).not.toHaveBeenCalled();
  });
});
