/** @jest-environment node */
import { cutAllCircuits, resetRigState, rigState, runRigScript, SUPPLY_OFF, SUPPLY_ON } from '@/lib/rig';

type RunScript = (file: string, args: string[], options: { cwd?: string; shell?: unknown }) => Promise<{ stdout: string; stderr: string }>;

// execFile hands every call made through util.promisify to runScript.
jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const runScript = jest.fn();
  return { runScript, execFile: Object.assign(jest.fn(), { [promisify.custom]: runScript }) };
});

const { runScript } = jest.requireMock<{ runScript: jest.MockedFunction<RunScript> }>('child_process');
const PYTHON = '/home/admin/Documents/venv/bin/python';

beforeEach(() => {
  runScript.mockReset().mockResolvedValue({ stdout: 'Path finished.\n', stderr: '' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('runRigScript', () => {
  it('runs the script with the rig\'s own Python, in the scripts folder, without a shell', async () => {
    await runRigScript(['sole.py', '--position', '4']);
    expect(runScript).toHaveBeenCalledWith(PYTHON, ['sole.py', '--position', '4'], { cwd: '/home/admin/Documents' });
  });
});

describe('where the scripts are', () => {
  // The paths are read once, when the module loads.
  const load = (env: Record<string, string | undefined>) => {
    const saved = { dir: process.env.RIG_SCRIPT_DIR, python: process.env.RIG_PYTHON };
    Object.assign(process.env, { RIG_SCRIPT_DIR: env.RIG_SCRIPT_DIR ?? '', RIG_PYTHON: env.RIG_PYTHON ?? '' });
    let rig!: typeof import('@/lib/rig');
    jest.isolateModules(() => { rig = jest.requireActual<typeof import('@/lib/rig')>('@/lib/rig'); });
    Object.assign(process.env, { RIG_SCRIPT_DIR: saved.dir, RIG_PYTHON: saved.python });
    return rig;
  };

  it('uses the lab machine\'s own layout when nothing is set', () => {
    const rig = load({});
    expect(rig.SCRIPT_DIR).toBe('/home/admin/Documents');
    expect(rig.PYTHON).toBe('/home/admin/Documents/venv/bin/python');
  });

  it('takes the folder from RIG_SCRIPT_DIR, and the Python from the venv inside it', () => {
    const rig = load({ RIG_SCRIPT_DIR: ' /opt/lab8/scripts/ ' });
    expect(rig.SCRIPT_DIR).toBe('/opt/lab8/scripts');
    expect(rig.PYTHON).toBe('/opt/lab8/scripts/venv/bin/python');
  });

  it('takes the Python from RIG_PYTHON when that is set', () => {
    const rig = load({ RIG_SCRIPT_DIR: '/opt/lab8', RIG_PYTHON: '/usr/bin/python3' });
    expect(rig.PYTHON).toBe('/usr/bin/python3');
  });

  it('runs the relay scripts from that same folder', async () => {
    const rig = load({ RIG_SCRIPT_DIR: '/opt/lab8' });
    await rig.runRigScript([rig.SUPPLY_OFF]);
    expect(runScript).toHaveBeenCalledWith('/opt/lab8/venv/bin/python', ['relay_off.py'], { cwd: '/opt/lab8' });
  });

  it('runs the scripts from the folder and with the Python that were set', async () => {
    const rig = load({ RIG_SCRIPT_DIR: '/opt/lab8', RIG_PYTHON: '/usr/bin/python3' });
    await rig.runRigScript(['coil_1.py']);
    expect(runScript).toHaveBeenCalledWith('/usr/bin/python3', ['coil_1.py'], { cwd: '/opt/lab8' });
  });
});

describe('cutAllCircuits', () => {
  it('cuts both circuits and then switches the power supply off', async () => {
    expect(await cutAllCircuits()).toEqual([]);
    expect(runScript.mock.calls.map(([, args]) => args)).toEqual([['coil_b.py'], ['sole_b.py'], ['relay_off.py']]);
  });

  it('carries on with the rest when the first script fails, and reports the one that failed', async () => {
    runScript.mockRejectedValueOnce(new Error('relay not responding'));
    expect(await cutAllCircuits()).toEqual(['coil_b.py']);
    expect(runScript).toHaveBeenCalledTimes(3);
  });

  it('reports every script when none could be run', async () => {
    runScript.mockRejectedValue(new Error('no rig'));
    expect(await cutAllCircuits()).toEqual(['coil_b.py', 'sole_b.py', 'relay_off.py']);
  });
});

describe('rigState — what the rig was last told to do', () => {
  const NOW = Date.parse('2026-10-09T03:00:00Z');

  beforeEach(() => {
    resetRigState();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('knows nothing before any command has been sent', () => {
    expect(rigState()).toEqual({ busy: false, circuit: null, position: null, supply: null, last: null });
  });

  it('records the coil that was switched on, and the command with its time', async () => {
    await runRigScript(['coil_2.py']);
    expect(rigState()).toEqual({
      busy: false, circuit: 'coil_2.py', position: null, supply: null,
      last: { command: 'coil_2.py', ok: true, at: NOW },
    });
  });

  it('records the solenoid and where the probe was sent', async () => {
    await runRigScript(['sole.py', '--position', '0']);
    await runRigScript(['sole.py', '--position', '-7']);
    expect(rigState()).toMatchObject({ circuit: 'sole.py', position: -7 });
  });

  it('clears a circuit when its own break script runs, not the other one\'s', async () => {
    await runRigScript(['coil_1.py']);
    await runRigScript(['sole_b.py']);
    expect(rigState().circuit).toBe('coil_1.py');
    await runRigScript(['coil_b.py']);
    expect(rigState().circuit).toBeNull();

    await runRigScript(['sole.py', '--position', '3']);
    await runRigScript(['coil_b.py']);
    expect(rigState()).toMatchObject({ circuit: 'sole.py', position: 3 });
    await runRigScript(['sole_b.py']);
    expect(rigState()).toMatchObject({ circuit: null, position: null });
  });

  it('is cleared by cutting both circuits', async () => {
    await runRigScript(['sole.py', '--position', '5']);
    await cutAllCircuits();
    expect(rigState()).toMatchObject({ circuit: null, position: null, supply: false, last: { command: 'relay_off.py', ok: true } });
  });

  it('records the power supply being switched on and off, leaving the circuit as it was', async () => {
    await runRigScript(['coil_1.py']);
    await runRigScript([SUPPLY_ON]);
    expect(rigState()).toMatchObject({ supply: true, circuit: 'coil_1.py' });
    await runRigScript([SUPPLY_OFF]);
    expect(rigState()).toMatchObject({ supply: false, circuit: 'coil_1.py' });
  });

  it('does not count the supply as switched when the script fails', async () => {
    runScript.mockRejectedValueOnce(new Error('no answer'));
    await expect(runRigScript([SUPPLY_ON])).rejects.toThrow();
    expect(rigState().supply).toBeNull();
  });

  it('keeps what was on when a command fails, and records the failure', async () => {
    await runRigScript(['coil_1.py']);
    runScript.mockRejectedValueOnce(new Error('relay not responding'));
    await expect(runRigScript(['coil_3.py'])).rejects.toThrow('relay not responding');
    expect(rigState()).toMatchObject({ busy: false, circuit: 'coil_1.py', last: { command: 'coil_3.py', ok: false } });
  });

  it('is busy while a script is running', async () => {
    let finish!: (r: { stdout: string; stderr: string }) => void;
    runScript.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const running = runRigScript(['sole.py', '--position', '7']);
    expect(rigState().busy).toBe(true);
    finish({ stdout: 'Path finished.\n', stderr: '' });
    await running;
    expect(rigState().busy).toBe(false);
  });
});
