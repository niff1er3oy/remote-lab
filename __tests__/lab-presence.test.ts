/** @jest-environment node */
import { adminSwitched, enterRoom, isInRoom, leaveRoom, occupants, resetPresence, STALE_MS, stayInRoom, sweep } from '@/lib/lab-presence';
import { resetRigState, rigState, runRigScript } from '@/lib/rig';

type RunScript = (file: string, args: string[], options: { cwd?: string }) => Promise<{ stdout: string; stderr: string }>;

jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const runScript = jest.fn();
  return { runScript, execFile: Object.assign(jest.fn(), { [promisify.custom]: runScript }) };
});

const { runScript } = jest.requireMock<{ runScript: jest.MockedFunction<RunScript> }>('child_process');
const ran = () => runScript.mock.calls.map(([, args]) => args.join(' '));

let now = Date.parse('2026-10-09T03:00:00Z');

beforeEach(() => {
  resetPresence();
  resetRigState();
  runScript.mockReset().mockResolvedValue({ stdout: '', stderr: '' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  resetPresence();
  jest.restoreAllMocks();
});

describe('entering the lab room', () => {
  it('switches the power supply on', async () => {
    expect(await enterRoom('student-1')).toBe(true);
    expect(ran()).toEqual(['relay_on.py']);
    expect(isInRoom('student-1')).toBe(true);
  });

  it('does not run the script again when the supply is already on', async () => {
    await enterRoom('student-1');
    await enterRoom('student-2');
    expect(ran()).toEqual(['relay_on.py']);
    expect(occupants()).toBe(2);
  });

  it('says the supply is not on when the relay does not answer, and still counts the student as in', async () => {
    runScript.mockRejectedValueOnce(new Error('no relay'));
    expect(await enterRoom('student-1')).toBe(false);
    expect(isInRoom('student-1')).toBe(true);
  });
});

describe('leaving the lab room', () => {
  it('switches the supply off when that leaves the room empty', async () => {
    await enterRoom('student-1');
    await leaveRoom('student-1');
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py']);
    expect(rigState().supply).toBe(false);
  });

  it('leaves the supply on while someone else is still in', async () => {
    await enterRoom('student-1');
    await enterRoom('student-2');
    await leaveRoom('student-1');
    expect(ran()).toEqual(['relay_on.py']);
    await leaveRoom('student-2');
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py']);
  });

  it.each([
    ['a coil', ['coil_2.py'], 'coil_b.py'],
    ['the solenoid', ['sole.py', '--position', '3'], 'sole_b.py'],
  ])('cuts %s left on before switching the supply off', async (_what, start, cut) => {
    await enterRoom('student-1');
    await runRigScript(start);
    await leaveRoom('student-1');
    expect(ran().slice(-2)).toEqual([cut, 'relay_off.py']);
    expect(rigState().circuit).toBeNull();
  });

  it('runs nothing for someone who was not in the room', async () => {
    await leaveRoom('stranger');
    expect(ran()).toEqual([]);
  });

  it('runs nothing the second time the same student says goodbye', async () => {
    await enterRoom('student-1');
    await leaveRoom('student-1');
    await leaveRoom('student-1');
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py']);
  });
});

describe('a page that goes quiet', () => {
  it('is kept while it keeps saying it is open', async () => {
    await enterRoom('student-1');
    for (let i = 0; i < 10; i++) {
      now += STALE_MS - 1000;
      stayInRoom('student-1');
      await sweep();
    }
    expect(isInRoom('student-1')).toBe(true);
    expect(ran()).toEqual(['relay_on.py']);
  });

  it('is taken to have left, and the supply goes off', async () => {
    await enterRoom('student-1');
    now += STALE_MS + 1;
    await sweep();
    expect(isInRoom('student-1')).toBe(false);
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py']);
  });

  it('tries switching off again on the next rounds when the relay does not answer, then gives up', async () => {
    await enterRoom('student-1');
    runScript.mockRejectedValue(new Error('no relay'));
    now += STALE_MS + 1;
    for (let i = 0; i < 6; i++) await sweep();
    expect(ran().filter((s) => s === 'relay_off.py')).toHaveLength(3);
  });

  it('stops trying once switching off has worked', async () => {
    await enterRoom('student-1');
    runScript.mockRejectedValueOnce(new Error('no relay'));
    now += STALE_MS + 1;
    for (let i = 0; i < 4; i++) await sweep();
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py', 'relay_off.py']);
  });

  it('does not switch anything off in an empty room nobody has left', async () => {
    await sweep();
    expect(ran()).toEqual([]);
  });
});

describe('an admin switching the supply by hand', () => {
  it('off: it stays off for the student who is still in the room', async () => {
    await enterRoom('student-1');
    await runRigScript(['relay_off.py']);
    adminSwitched(false);
    // The page is heard from again without having walked in anew.
    expect(await enterRoom('student-1', false)).toBe(false);
    expect(ran()).toEqual(['relay_on.py', 'relay_off.py']);
  });

  it('off: the next student to walk in switches it on again', async () => {
    await runRigScript(['relay_off.py']);
    adminSwitched(false);
    expect(await enterRoom('student-2')).toBe(true);
    expect(ran()).toEqual(['relay_off.py', 'relay_on.py']);
  });

  it('on, with nobody in the room: it is left on', async () => {
    await runRigScript(['relay_on.py']);
    adminSwitched(true);
    for (let i = 0; i < 3; i++) await sweep();
    expect(ran()).toEqual(['relay_on.py']);
  });

  it('on: a page heard from again is no longer held off', async () => {
    adminSwitched(false);
    adminSwitched(true);
    expect(await enterRoom('student-1', false)).toBe(true);
  });
});
