/** @jest-environment node */
import { GET, POST } from '@/app/api/hardware/route';
import { resetRigState, runRigScript } from '@/lib/rig';
import { breakDb, resetDb, seedBooking } from '../helpers/server/firestore';
import { signInAs, signOut } from '../helpers/server/session';
import { freezeTime, restoreTime, HOUR, MINUTE } from '../helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));

type ScriptResult = { stdout: string; stderr: string };
type RunScript = (file: string, args: string[], options: { cwd?: string; shell?: unknown }) => Promise<ScriptResult>;
type ChildProcessMock = { runScript: jest.MockedFunction<RunScript> } & Record<string, jest.Mock>;

// execFile hands every call to runScript, both when called with a callback and
// through util.promisify (which then resolves to { stdout, stderr } like the
// real one). Every other way of starting a process throws.
jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const runScript = jest.fn();
  const execFile = Object.assign(
    jest.fn((file: string, args: string[], options: object, callback: (e: unknown, out: string, err: string) => void) => {
      (runScript(file, args, options) as Promise<ScriptResult>).then(
        (r) => callback(null, r.stdout, r.stderr),
        (e) => callback(e, '', ''),
      );
    }),
    { [promisify.custom]: runScript },
  );
  const forbidden = (name: string) => jest.fn(() => {
    throw new Error(`child_process.${name} must not be used to command the rig`);
  });
  return {
    runScript,
    execFile,
    exec: forbidden('exec'),
    execSync: forbidden('execSync'),
    execFileSync: forbidden('execFileSync'),
    spawn: forbidden('spawn'),
    spawnSync: forbidden('spawnSync'),
    fork: forbidden('fork'),
  };
});

const childProcess = jest.requireMock<ChildProcessMock>('child_process');
const runScript = childProcess.runScript;

const NOW = Date.parse('2026-10-05T03:00:00Z');
const PYTHON = '/home/admin/Documents/venv/bin/python';
const FINISHED = { stdout: 'Moving...\nPath finished.\n', stderr: '' };

const send = (body: unknown) =>
  POST(new Request('http://localhost/api/hardware', { method: 'POST', body: JSON.stringify(body) }));
const sendRaw = (body: string) =>
  POST(new Request('http://localhost/api/hardware', { method: 'POST', body }));
const isBusy = async () => (await (await GET()).json()).busy;

// A round of the signed-in student that started 30 minutes ago.
const runningRound = (status = 'confirmed') =>
  seedBooking('round', { status, start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE });
// A round that ended `ago` milliseconds before now.
const endedRound = (ago: number, status = 'confirmed') =>
  seedBooking('round', { status, start: NOW - ago - 2 * HOUR, end: NOW - ago });

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
  runScript.mockReset();
  runScript.mockResolvedValue(FINISHED);
  signInAs();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  restoreTime();
  jest.restoreAllMocks();
});

describe('POST /api/hardware — who may command the rig', () => {
  it('refuses a caller who is not signed in', async () => {
    signOut();
    runningRound();
    const res = await send({ script: 'coil_1.py' });
    expect(res.status).toBe(401);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who has no booking', async () => {
    const res = await send({ script: 'coil_1.py' });
    expect(res.status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('refuses a user whose round has not started yet', async () => {
    seedBooking('round', { start: NOW + MINUTE, end: NOW + 2 * HOUR });
    expect((await send({ script: 'coil_1.py' })).status).toBe(403);
    expect((await send({ script: 'coil_b.py' })).status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('refuses a user while the running round belongs to someone else', async () => {
    seedBooking('round', { user: 'someone-else', start: NOW - 30 * MINUTE, end: NOW + 90 * MINUTE });
    expect((await send({ script: 'coil_1.py' })).status).toBe(403);
    expect((await send({ script: 'sole_b.py' })).status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('refuses a user whose round covering this moment was cancelled', async () => {
    runningRound('cancelled');
    expect((await send({ script: 'coil_1.py' })).status).toBe(403);
    expect((await send({ script: 'coil_b.py' })).status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each(['confirmed', 'pending', 'in_progress'])('runs a command while the user has a %s round running', async (status) => {
    runningRound(status);
    const res = await send({ script: 'coil_1.py' });
    expect(res.status).toBe(200);
    expect(runScript).toHaveBeenCalledTimes(1);
  });

  it.each(['coil_b.py', 'sole_b.py'])('still runs %s for a round that ended five minutes ago', async (script) => {
    endedRound(5 * MINUTE);
    const res = await send({ script });
    expect(res.status).toBe(200);
    expect(runScript).toHaveBeenCalledWith(PYTHON, [script], expect.anything());
  });

  it.each([
    { script: 'coil_1.py' },
    { script: 'coil_2.py' },
    { script: 'coil_3.py' },
    { script: 'sole.py', position: 0 },
  ])('refuses $script for a round that ended five minutes ago', async (body) => {
    endedRound(5 * MINUTE);
    const res = await send(body);
    expect(res.status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('allows the break scripts up to exactly ten minutes after the round ended and no longer', async () => {
    endedRound(10 * MINUTE);
    expect((await send({ script: 'coil_b.py' })).status).toBe(200);

    resetDb();
    endedRound(10 * MINUTE + 1);
    expect((await send({ script: 'coil_b.py' })).status).toBe(403);
    expect(runScript).toHaveBeenCalledTimes(1);
  });

  it('allows only the break scripts once a round was completed before its slot ran out', async () => {
    runningRound('completed');
    expect((await send({ script: 'coil_2.py' })).status).toBe(403);
    expect(runScript).not.toHaveBeenCalled();
    expect((await send({ script: 'sole_b.py' })).status).toBe(200);
  });

  it('answers 500 and runs nothing when the booking cannot be checked', async () => {
    runningRound();
    breakDb();
    const res = await send({ script: 'coil_b.py' });
    expect(res.status).toBe(500);
    expect(runScript).not.toHaveBeenCalled();
  });
});

describe('POST /api/hardware — the accepted commands', () => {
  beforeEach(() => runningRound());

  it('reports whether the power supply was last switched on or off', async () => {
    resetRigState();
    expect(await (await GET()).json()).toEqual({ busy: false, supply: null });
    await runRigScript(['relay.py', '--status', 'on', '--name', 'solenoid']);
    expect(await (await GET()).json()).toEqual({ busy: false, supply: true });
    await runRigScript(['relay.py', '--status', 'off', '--name', 'all']);
    expect(await (await GET()).json()).toEqual({ busy: false, supply: false });
  });

  describe('the relay follows the instrument being started', () => {
    const ran = () => runScript.mock.calls.map(([, args]) => (args as string[]).join(' '));
    afterEach(() => resetRigState());

    it('moves a supply that is on to the instrument, before starting it', async () => {
      await runRigScript(['relay.py', '--status', 'on', '--name', 'coil1']);
      runScript.mockClear();
      expect((await send({ script: 'sole.py', position: 0 })).status).toBe(200);
      expect(ran()).toEqual(['relay.py --status off --name all', 'relay.py --status on --name solenoid', 'sole.py --position 0']);
    });

    it('leaves the relay alone when it already feeds that instrument', async () => {
      await runRigScript(['relay.py', '--status', 'on', '--name', 'coil2']);
      runScript.mockClear();
      await send({ script: 'coil_2.py' });
      expect(ran()).toEqual(['coil_2.py']);
    });

    it('leaves the relays alone when all of them are on', async () => {
      await runRigScript(['relay.py', '--status', 'on', '--name', 'all']);
      runScript.mockClear();
      await send({ script: 'coil_1.py' });
      expect(ran()).toEqual(['coil_1.py']);
    });

    it.each([[false, ['relay.py', '--status', 'off', '--name', 'all']], [null, null]])('does not switch on a supply that is %s', async (_supply, before) => {
      resetRigState();
      if (before) await runRigScript(before);
      runScript.mockClear();
      await send({ script: 'coil_1.py' });
      expect(ran()).toEqual(['coil_1.py']);
    });

    it('does not touch the relay for a break script', async () => {
      await runRigScript(['relay.py', '--status', 'on', '--name', 'coil1']);
      runScript.mockClear();
      await send({ script: 'sole_b.py' });
      expect(ran()).toEqual(['sole_b.py']);
    });

    it('answers 500 and does not start the instrument when the relay cannot be moved', async () => {
      await runRigScript(['relay.py', '--status', 'on', '--name', 'coil1']);
      runScript.mockClear();
      runScript.mockRejectedValueOnce(new Error('Traceback: /home/admin/Documents/relay.py'));
      const res = await send({ script: 'sole.py', position: 0 });
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('สลับแหล่งจ่ายไฟมายังอุปกรณ์นี้ไม่สำเร็จ');
      expect(ran()).toEqual(['relay.py --status off --name all']);
      // The arm is not left marked busy.
      expect((await send({ script: 'coil_b.py' })).status).toBe(200);
    });
  });

  // The supply follows who is in the room; a student has no switch for it.
  it.each(['relay.py', 'relay_on.py', 'relay_off.py'])('refuses %s: students do not switch the power supply', async (script) => {
    expect((await send({ script })).status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each(['psu_on.py', '/home/admin/Documents/relay.py', '../relay.py'])('refuses %s: a script is named, never given by path', async (script) => {
    expect((await send({ script })).status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each(['coil_1.py', 'coil_2.py', 'coil_3.py', 'coil_b.py', 'sole_b.py'])(
    'runs %s with the rig\'s Python, the script name as the only argument, in the script folder',
    async (script) => {
      const res = await send({ script });
      expect(res.status).toBe(200);
      expect(runScript.mock.calls).toEqual([[PYTHON, [script], { cwd: '/home/admin/Documents' }]]);
    },
  );

  it('runs sole.py --position <n> for every whole number from -6 to 6', async () => {
    for (let n = -6; n <= 6; n++) {
      runScript.mockClear();
      const res = await send({ script: 'sole.py', position: n });
      expect(res.status).toBe(200);
      expect(runScript.mock.calls).toEqual([[PYTHON, ['sole.py', '--position', String(n)], { cwd: '/home/admin/Documents' }]]);
    }
  });

  it.each(['set0', 'SET0', 'zero', 'set0; rm -rf /'])('refuses the position %j: a position is a whole number', async (position) => {
    runScript.mockClear();
    expect((await send({ script: 'sole.py', position })).status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each(['coil_1.py', 'coil_b.py'])('ignores a position sent along with %s', async (script) => {
    await send({ script, position: 7 });
    expect(runScript.mock.calls).toEqual([[PYTHON, [script], expect.anything()]]);
  });

  it.each([
    ['one below the range', -11],
    ['one above the range', 11],
    ['a fraction', 1.5],
    ['a number written as text', '5'],
    ['text with a second command in it', '3; reboot'],
    ['an extra flag', '3 --force'],
    ['null', null],
    ['true', true],
    ['a list', [5]],
    ['a very large number', 1e21],
  ])('refuses sole.py when the position is %s', async (_label, position) => {
    const res = await send({ script: 'sole.py', position });
    expect(res.status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('refuses sole.py without a position', async () => {
    const res = await send({ script: 'sole.py' });
    expect(res.status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each([
    ['a script that is not on the list', 'coil_4.py'],
    ['another file on the lab machine', 'venv/bin/python'],
    ['a listed script reached through a path', '../Documents/coil_1.py'],
    ['a listed script with a second command appended', 'coil_1.py; rm -rf /'],
    ['a listed script with an argument appended', 'sole.py --position 3'],
    ['a listed script in different letter case', 'COIL_1.PY'],
    ['a listed script with a space after it', 'coil_1.py '],
    ['an empty name', ''],
    ['a number', 1],
    ['a list holding a listed script', ['coil_1.py']],
    ['nothing', undefined],
  ])('refuses %s', async (_label, script) => {
    const res = await send({ script, position: 3 });
    expect(res.status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it.each([
    ['is not JSON', 'coil_1.py'],
    ['is empty', ''],
    ['is null', 'null'],
    ['is a bare string', '"coil_1.py"'],
    ['is a list', '["coil_1.py"]'],
  ])('refuses a body that %s', async (_label, body) => {
    const res = await sendRaw(body);
    expect(res.status).toBe(400);
    expect(runScript).not.toHaveBeenCalled();
  });

  it('never goes through a shell', async () => {
    await send({ script: 'coil_1.py' });
    await send({ script: 'sole.py', position: -4 });
    await send({ script: 'sole_b.py' });

    expect(runScript).toHaveBeenCalledTimes(3);
    for (const [file, args, options] of runScript.mock.calls) {
      expect(file).toBe(PYTHON);
      expect(Array.isArray(args)).toBe(true);
      expect(options.shell).toBeUndefined();
    }
    for (const name of ['exec', 'execSync', 'execFileSync', 'spawn', 'spawnSync', 'fork']) {
      expect(childProcess[name]).not.toHaveBeenCalled();
    }
  });
});

describe('POST /api/hardware — one command at a time', () => {
  beforeEach(() => runningRound());

  // A script that keeps running until the test ends it.
  function scriptInProgress() {
    let finish!: (result: ScriptResult) => void;
    let fail!: (error: Error) => void;
    runScript.mockImplementationOnce(() => new Promise<ScriptResult>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    }));
    return { finish: (r: ScriptResult = FINISHED) => finish(r), fail: (e: Error) => fail(e) };
  }
  // Lets the handler get as far as starting the script.
  const scriptStarted = async () => {
    while (runScript.mock.calls.length === 0) await new Promise((r) => setImmediate(r));
  };

  it('reports the rig as free when nothing is running', async () => {
    expect(await isBusy()).toBe(false);
  });

  it('refuses a second command while one is running, then accepts one again after it succeeds', async () => {
    const script = scriptInProgress();
    const first = send({ script: 'sole.py', position: 6 });
    await scriptStarted();

    expect(await isBusy()).toBe(true);
    const second = await send({ script: 'coil_1.py' });
    expect(second.status).toBe(409);
    expect(runScript).toHaveBeenCalledTimes(1);

    script.finish();
    expect((await first).status).toBe(200);
    expect(await isBusy()).toBe(false);

    expect((await send({ script: 'coil_1.py' })).status).toBe(200);
    expect(runScript).toHaveBeenCalledTimes(2);
  });

  it('frees the rig again after a script fails', async () => {
    const script = scriptInProgress();
    const first = send({ script: 'coil_3.py' });
    await scriptStarted();
    expect(await isBusy()).toBe(true);

    script.fail(new Error('Command failed'));
    expect((await first).status).toBe(500);
    expect(await isBusy()).toBe(false);
    expect((await send({ script: 'coil_b.py' })).status).toBe(200);
  });

  it('does not mark the rig busy for a command it refuses', async () => {
    await send({ script: 'coil_9.py' });
    signOut();
    await send({ script: 'coil_1.py' });
    expect(await isBusy()).toBe(false);
  });
});

describe('POST /api/hardware — the answer', () => {
  beforeEach(() => runningRound());

  it('reports success and returns the output when the script prints "Path finished."', async () => {
    const res = await send({ script: 'coil_1.py' });
    expect(await res.json()).toEqual({ success: true, output: 'Moving...\nPath finished.\n' });
  });

  it('reports no success when the script exits cleanly without printing "Path finished."', async () => {
    runScript.mockResolvedValue({ stdout: 'Moving...\nLimit switch hit.\n', stderr: '' });
    const res = await send({ script: 'coil_1.py' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: false, output: 'Moving...\nLimit switch hit.\n' });
  });

  it('answers 500 for a failing script without passing on its output', async () => {
    const failure = Object.assign(
      new Error(`Command failed: ${PYTHON} coil_3.py\nTraceback (most recent call last):\n  File "/home/admin/Documents/coil_3.py", line 12`),
      { code: 1, stdout: 'GPIO 17 high', stderr: 'RuntimeError: relay not responding' },
    );
    runScript.mockRejectedValue(failure);

    const res = await send({ script: 'coil_3.py' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error).not.toMatch(/Traceback|\/home\/admin|coil_3|GPIO|relay|Command failed/);
  });
});
