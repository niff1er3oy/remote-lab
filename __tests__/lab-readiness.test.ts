/** @jest-environment node */
import { POST } from '@/app/api/admin/readiness/route';
import { checkReadiness, RIG_SCRIPTS, type ReadyCheck } from '@/lib/lab-readiness';
import { checkCameras } from '@/lib/lab-status';
import { breakDb, LAB8, resetDb, seed } from './helpers/server/firestore';
import { knownAccount, resetAuth } from './helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from './helpers/server/session';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('./helpers/server/firestore')>('./helpers/server/firestore').db,
  adminAuth: jest.requireActual<typeof import('./helpers/server/auth')>('./helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('@/lib/lab-status', () => ({ checkCameras: jest.fn() }));
jest.mock('fs/promises', () => ({ access: jest.fn(), stat: jest.fn(), constants: { R_OK: 4, X_OK: 1 } }));

type Run = (file: string, args: string[], options: { cwd?: string; timeout?: number }) => Promise<{ stdout: string; stderr: string }>;
jest.mock('child_process', () => {
  const { promisify } = jest.requireActual<typeof import('util')>('util');
  const run = jest.fn();
  return { run, execFile: Object.assign(jest.fn(), { [promisify.custom]: run }) };
});

const fsMock = jest.requireMock<{ access: jest.Mock; stat: jest.Mock }>('fs/promises');
const { run } = jest.requireMock<{ run: jest.MockedFunction<Run> }>('child_process');

const DIR = '/home/admin/Documents';
const PYTHON = `${DIR}/venv/bin/python`;

// The lab machine as the tests describe it.
const machine = {
  folder: true,
  python: true as boolean | 'broken',
  missingFiles: [] as string[],
  inspection: {} as Record<string, { missing?: string[]; error?: string }>,
  inspectFails: false,
};

// A sensor service that does what the test says once it is connected to.
type SensorDoes = 'sends' | 'silent' | 'refuses';
let sensor: SensorDoes = 'sends';
let sensorUrls: string[] = [];
class FakeSocket {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = jest.fn();
  constructor(url: string) {
    sensorUrls.push(url);
    setImmediate(() => {
      if (sensor === 'refuses') { this.onerror?.(); return; }
      this.onopen?.();
      if (sensor === 'sends') this.onmessage?.({ data: JSON.stringify({ bx: 30, by: 40, bz: 0 }) });
    });
  }
}

const check = (checks: ReadyCheck[], id: string) => checks.find(c => c.id === id) as ReadyCheck;

beforeEach(() => {
  Object.assign(machine, { folder: true, python: true, missingFiles: [], inspection: {}, inspectFails: false });
  sensor = 'sends';
  sensorUrls = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  resetDb();
  resetAuth();
  seed('labs', 'LAB8', LAB8);
  knownAccount(ADMIN.uid, 'Admin One', 'admin@example.com');
  signInAs(ADMIN);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.mocked(checkCameras).mockResolvedValue([{ key: 'cam1', state: 'online' }, { key: 'cam2', state: 'online' }, { key: 'cam3', state: 'online' }]);

  fsMock.stat.mockImplementation(async (p: string) => {
    if (p === DIR && machine.folder) return { isDirectory: () => true };
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  fsMock.access.mockImplementation(async (p: string) => {
    const name = p.replace(/\\/g, '/');
    const gone = name === PYTHON ? machine.python === false : machine.missingFiles.some(f => name.endsWith(`/${f}`));
    if (gone || !machine.folder) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  run.mockReset().mockImplementation(async (_file, args) => {
    if (args[0] === '--version') {
      if (machine.python === 'broken') throw Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
      return { stdout: 'Python 3.11.2\n', stderr: '' };
    }
    if (machine.inspectFails) throw Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' });
    const scripts = args.slice(2);
    return { stdout: JSON.stringify(Object.fromEntries(scripts.map(s => [s, machine.inspection[s] ?? { missing: [] }]))), stderr: '' };
  });
});

afterEach(() => {
  delete (globalThis as { WebSocket?: unknown }).WebSocket;
  jest.restoreAllMocks();
});

describe('checkReadiness — a lab machine with everything in place', () => {
  it('is ready, with every check passed', async () => {
    const result = await checkReadiness();
    expect(result.ready).toBe(true);
    expect(result.checks.filter(c => c.ok !== true)).toEqual([]);
    expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
  });

  it('checks the folder, Python, every script the web app can run, the sensor, three cameras and the database', async () => {
    const { checks } = await checkReadiness();
    expect(RIG_SCRIPTS).toEqual(['coil_1.py', 'coil_2.py', 'coil_3.py', 'sole.py', 'coil_b.py', 'sole_b.py', 'relay.py']);
    expect(checks.map(c => c.id)).toEqual([
      'rig-folder', 'rig-python', ...RIG_SCRIPTS.map(s => `rig-${s}`), 'sensor-data', 'camera-cam1', 'camera-cam2', 'camera-cam3', 'database',
    ]);
  });

  it('says which Python it found and what the sensor read', async () => {
    const { checks } = await checkReadiness();
    expect(check(checks, 'rig-python').detail).toBe(`Python 3.11.2 ที่ ${PYTHON}`);
    // sqrt(30^2 + 40^2) = 50 uT = 0.05 mT; calibrated, 1.1076 x 0.05 + 0.0692 = 0.12458.
    expect(check(checks, 'sensor-data').detail).toContain('ได้ค่า 0.125 mT');
  });
});

describe('checkReadiness — it never runs the rig', () => {
  it('starts Python only to ask its version and to read the scripts, never to run one', async () => {
    await checkReadiness();
    expect(run).toHaveBeenCalledTimes(2);
    const [version, inspect] = run.mock.calls;
    expect(version).toEqual([PYTHON, ['--version'], expect.objectContaining({ timeout: expect.any(Number) })]);
    expect(inspect[0]).toBe(PYTHON);
    expect(inspect[1][0]).toBe('-c');
    // The script names come after the inspector's own code: they are its arguments, not what Python runs.
    expect(inspect[1].slice(2)).toEqual(RIG_SCRIPTS);
    expect(inspect[1][1]).toContain('ast.parse');
    expect(inspect[1][1]).not.toMatch(/exec\(|runpy|__import__|import_module/);
    expect(inspect[2]).toMatchObject({ cwd: DIR });
  });
});

describe('checkReadiness — what can be wrong with the rig', () => {
  it('names a script that is missing, and is not ready', async () => {
    machine.missingFiles = ['coil_1.py'];
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'rig-coil_1.py')).toMatchObject({ ok: false, detail: 'ไม่พบไฟล์นี้ในโฟลเดอร์สคริปต์' });
    expect(check(checks, 'rig-coil_2.py').ok).toBe(true);
    // A missing file is not handed to Python to read.
    expect(run.mock.calls[1][1].slice(2)).not.toContain('coil_1.py');
  });

  it('names every missing script when several are', async () => {
    machine.missingFiles = ['coil_1.py', 'coil_2.py', 'coil_3.py', 'coil_b.py'];
    const { checks } = await checkReadiness();
    expect(checks.filter(c => c.ok === false).map(c => c.id)).toEqual(['rig-coil_1.py', 'rig-coil_2.py', 'rig-coil_3.py', 'rig-coil_b.py']);
  });

  it('says which library a script needs that the venv does not have', async () => {
    machine.inspection = { 'sole.py': { missing: ['xarm'] }, 'sole_b.py': { missing: ['xarm', 'serial'] } };
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'rig-sole.py')).toMatchObject({ ok: false, detail: 'ขาดไลบรารีใน venv: xarm' });
    expect(check(checks, 'rig-sole_b.py').detail).toBe('ขาดไลบรารีใน venv: xarm, serial');
  });

  it('says so when Python cannot read a script', async () => {
    machine.inspection = { 'relay.py': { error: 'SyntaxError: invalid syntax (relay.py, line 3)' } };
    const { checks } = await checkReadiness();
    expect(check(checks, 'rig-relay.py')).toMatchObject({ ok: false, label: 'relay.py (เปิดและปิดแหล่งจ่ายไฟ)', detail: 'Python อ่านไฟล์ไม่ผ่าน: SyntaxError: invalid syntax (relay.py, line 3)' });
  });

  it('says where it looked when the scripts folder is not there', async () => {
    machine.folder = false;
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'rig-folder')).toMatchObject({ ok: false, detail: `ไม่พบโฟลเดอร์ ${DIR} (ตั้งที่ RIG_SCRIPT_DIR)` });
    expect(run).not.toHaveBeenCalled();
  });

  it('says where it looked for Python when it is not there, and leaves the scripts it has as not fully checked', async () => {
    machine.python = false;
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'rig-python')).toMatchObject({ ok: false, detail: `ไม่พบ ${PYTHON} (ตั้งที่ RIG_PYTHON)` });
    expect(check(checks, 'rig-sole.py')).toMatchObject({ ok: null, detail: 'มีไฟล์ แต่ยังตรวจไลบรารีไม่ได้เพราะ Python ใช้ไม่ได้' });
    expect(run).not.toHaveBeenCalled();
  });

  it('says so when Python is there but will not start', async () => {
    machine.python = 'broken';
    const { checks } = await checkReadiness();
    expect(check(checks, 'rig-python')).toMatchObject({ ok: false, detail: `มีไฟล์ ${PYTHON} แต่เรียกใช้ไม่ได้ (EACCES)` });
  });

  it('leaves the scripts as not checked, not as failed, when reading them could not be done', async () => {
    machine.inspectFails = true;
    const { checks } = await checkReadiness();
    expect(check(checks, 'rig-sole.py')).toMatchObject({ ok: null, detail: 'มีไฟล์ แต่ตรวจเนื้อหาไม่ได้ (ETIMEDOUT)' });
  });
});

describe('checkReadiness — the sensor', () => {
  it('asks the sensor service at its own address', async () => {
    await checkReadiness();
    expect(sensorUrls).toEqual(['ws://127.0.0.1:8888']);
  });

  it('is not ready when the service cannot be reached', async () => {
    sensor = 'refuses';
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'sensor-data')).toMatchObject({ ok: false });
    expect(check(checks, 'sensor-data').detail).toContain('ต่อบริการเซนเซอร์ที่ ws://127.0.0.1:8888 ไม่ได้');
  });

  it('is not ready when the service answers but sends no reading: an open port is not a working sensor', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    sensor = 'silent';
    const pending = checkReadiness();
    await jest.advanceTimersByTimeAsync(3100);
    const { ready, checks } = await pending;
    jest.useRealTimers();
    expect(ready).toBe(false);
    expect(check(checks, 'sensor-data').detail).toContain('ต่อบริการเซนเซอร์ได้ แต่ไม่มีค่าส่งมาใน 3 วินาที');
  });

  it('says it could not check, rather than guess, on a Node without WebSocket', async () => {
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    const { ready, checks } = await checkReadiness();
    expect(check(checks, 'sensor-data').ok).toBeNull();
    expect(ready).toBe(true);
  });
});

describe('checkReadiness — cameras and the database', () => {
  it('is not ready when a camera does not answer, and names it', async () => {
    jest.mocked(checkCameras).mockResolvedValue([{ key: 'cam1', state: 'online' }, { key: 'cam2', state: 'offline' }, { key: 'cam3', state: 'unset' }]);
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'camera-cam2')).toMatchObject({ ok: false, label: 'กล้องเสริม (โซลีนอยด์)', detail: 'เซิร์ฟเวอร์กล้องไม่ตอบ' });
    // A camera with no address set is not counted against the machine.
    expect(check(checks, 'camera-cam3')).toMatchObject({ ok: null, detail: 'ยังไม่ได้ตั้งค่าที่อยู่ (cam3)' });
  });

  it('is not ready when the database cannot be read, without the database\'s own words', async () => {
    breakDb(new Error('UNAVAILABLE: firestore credentials'));
    const { ready, checks } = await checkReadiness();
    expect(ready).toBe(false);
    expect(check(checks, 'database').ok).toBe(false);
    expect(check(checks, 'database').detail).not.toContain('UNAVAILABLE');
  });

  it('is not ready when the database answers but holds no lab', async () => {
    resetDb();
    const { checks } = await checkReadiness();
    expect(check(checks, 'database')).toMatchObject({ ok: false });
  });
});

describe('POST /api/admin/readiness', () => {
  const ask = async () => {
    const res = await POST();
    return { status: res.status, body: await res.json() };
  };

  it('answers 403 to a student and checks nothing', async () => {
    signInAs(STUDENT);
    expect((await ask()).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
    expect(sensorUrls).toEqual([]);
  });

  it('answers 403 to someone who is not signed in', async () => {
    signOut();
    expect((await ask()).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('gives an admin the result', async () => {
    machine.missingFiles = ['coil_1.py'];
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, ready: false });
    expect(body.checks.find((c: ReadyCheck) => c.id === 'rig-coil_1.py').ok).toBe(false);
  });
});
