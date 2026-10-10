/** @jest-environment node */
import { adminSwitched, enterRoom, isInRoom, leaveRoom, occupants, relayFor, resetPresence, STALE_MS, stayInRoom, studentSwitch, sweep } from '@/lib/lab-presence';
import { resetRigState, rigState, runRigScript } from '@/lib/rig';

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
    expect(ran()).toEqual([ON]);
    expect(isInRoom('student-1')).toBe(true);
  });

  it('does not run the script again when the supply is already on', async () => {
    await enterRoom('student-1');
    await enterRoom('student-2');
    expect(ran()).toEqual([ON]);
    expect(occupants()).toBe(2);
  });

  it('says the supply is not on when the relay does not answer, and still counts the student as in', async () => {
    runScript.mockRejectedValueOnce(new Error('no relay'));
    expect(await enterRoom('student-1')).toBe(false);
    expect(isInRoom('student-1')).toBe(true);
  });
});

describe('the relay of the instrument in use', () => {
  const on = (name: string) => `relay.py --status on --name ${name}`;

  it.each([['coil_1.py', 'coil1'], ['coil_2.py', 'coil2'], ['coil_3.py', 'coil3'], ['sole.py', 'solenoid']])(
    'entering with %s selected switches on the relay %s, after switching every relay off', async (script, name) => {
      expect(await enterRoom('student-1', true, script)).toBe(true);
      expect(ran()).toEqual([OFF, on(name)]);
      expect(rigState()).toMatchObject({ supply: true, relay: name });
    });

  it('does not switch everything off first when the supply is known to be off', async () => {
    await runRigScript(OFF.split(' '));
    runScript.mockClear();
    await enterRoom('student-1', true, 'sole.py');
    expect(ran()).toEqual([on('solenoid')]);
  });

  it('switches every relay on for a page that names no instrument, or one that is not an instrument', async () => {
    expect(relayFor()).toBe('all');
    expect(relayFor('coil_b.py')).toBe('all');
    expect(relayFor('../relay.py')).toBe('all');
  });

  it('takes the relay of the circuit that is on when the page names none', async () => {
    await runRigScript(['coil_2.py']);
    expect(relayFor()).toBe('coil2');
    expect(relayFor('sole.py')).toBe('solenoid');
  });

  it('the student\'s own switch feeds the instrument selected, and switches every relay off', async () => {
    await enterRoom('student-1', true, 'coil_1.py');
    runScript.mockClear();
    expect(await studentSwitch('student-1', false, 'coil_1.py')).toBe('done');
    expect(await studentSwitch('student-1', true, 'sole.py')).toBe('done');
    expect(ran()).toEqual([OFF, on('solenoid')]);
  });

  it('a page only heard from again leaves the relay that is on as it is', async () => {
    await enterRoom('student-1', true, 'coil_1.py');
    runScript.mockClear();
    expect(await enterRoom('student-1', false, 'sole.py')).toBe(true);
    expect(ran()).toEqual([]);
    expect(rigState().relay).toBe('coil1');
  });

  it('says the supply is not on when the relay answers for off but not for on', async () => {
    runScript.mockResolvedValueOnce({ stdout: '', stderr: '' }).mockRejectedValueOnce(new Error('no relay'));
    expect(await enterRoom('student-1', true, 'sole.py')).toBe(false);
    expect(rigState()).toMatchObject({ supply: false, relay: null });
  });
});

describe('leaving the lab room', () => {
  it('switches the supply off when that leaves the room empty', async () => {
    await enterRoom('student-1');
    await leaveRoom('student-1');
    expect(ran()).toEqual([ON, OFF]);
    expect(rigState().supply).toBe(false);
  });

  it('leaves the supply on while someone else is still in', async () => {
    await enterRoom('student-1');
    await enterRoom('student-2');
    await leaveRoom('student-1');
    expect(ran()).toEqual([ON]);
    await leaveRoom('student-2');
    expect(ran()).toEqual([ON, OFF]);
  });

  it.each([
    ['a coil', ['coil_2.py'], 'coil_b.py'],
    ['the solenoid', ['sole.py', '--position', '3'], 'sole_b.py'],
  ])('cuts %s left on before switching the supply off', async (_what, start, cut) => {
    await enterRoom('student-1');
    await runRigScript(start);
    await leaveRoom('student-1');
    expect(ran().slice(-2)).toEqual([cut, OFF]);
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
    expect(ran()).toEqual([ON, OFF]);
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
    expect(ran()).toEqual([ON]);
  });

  it('is taken to have left, and the supply goes off', async () => {
    await enterRoom('student-1');
    now += STALE_MS + 1;
    await sweep();
    expect(isInRoom('student-1')).toBe(false);
    expect(ran()).toEqual([ON, OFF]);
  });

  it('tries switching off again on the next rounds when the relay does not answer, then gives up', async () => {
    await enterRoom('student-1');
    runScript.mockRejectedValue(new Error('no relay'));
    now += STALE_MS + 1;
    for (let i = 0; i < 6; i++) await sweep();
    expect(ran().filter((s) => s === OFF)).toHaveLength(3);
  });

  it('stops trying once switching off has worked', async () => {
    await enterRoom('student-1');
    runScript.mockRejectedValueOnce(new Error('no relay'));
    now += STALE_MS + 1;
    for (let i = 0; i < 4; i++) await sweep();
    expect(ran()).toEqual([ON, OFF, OFF]);
  });

  it('does not switch anything off in an empty room nobody has left', async () => {
    await sweep();
    expect(ran()).toEqual([]);
  });
});

describe('an admin switching the supply by hand', () => {
  it('off: it stays off for the student who is still in the room', async () => {
    await enterRoom('student-1');
    await runRigScript(OFF.split(' '));
    adminSwitched(false);
    // The page is heard from again without having walked in anew.
    expect(await enterRoom('student-1', false)).toBe(false);
    expect(ran()).toEqual([ON, OFF]);
  });

  it('off: the next student to walk in switches it on again', async () => {
    await runRigScript(OFF.split(' '));
    adminSwitched(false);
    expect(await enterRoom('student-2')).toBe(true);
    expect(ran()).toEqual([OFF, ON]);
  });

  it('on, with nobody in the room: it is left on', async () => {
    await runRigScript(ON.split(' '));
    adminSwitched(true);
    for (let i = 0; i < 3; i++) await sweep();
    expect(ran()).toEqual([ON]);
  });

  it('on: a page heard from again is no longer held off', async () => {
    adminSwitched(false);
    adminSwitched(true);
    expect(await enterRoom('student-1', false)).toBe(true);
  });
});
