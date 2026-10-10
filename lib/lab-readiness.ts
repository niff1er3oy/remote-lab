import { execFile } from 'child_process';
import { access, constants, stat } from 'fs/promises';
import path from 'path';
import util from 'util';
import { adminDb } from '@/lib/firebase-admin';
import { INSTRUMENT_SCRIPTS } from '@/lib/instruments';
import { checkCameras } from '@/lib/lab-status';
import { BREAK_SCRIPTS, PYTHON, RELAY_SCRIPT, SCRIPT_DIR } from '@/lib/rig';
import { fieldFromSensor } from '@/lib/sensor';

// Whether the lab machine is ready for a round, checked on the machine itself
// when an admin asks: the things the unit tests cannot know, because they run
// against stand-ins. Nothing here moves the rig or switches anything: scripts
// are looked at, never run.

const execFileAsync = util.promisify(execFile);

/** One thing checked. `ok` is null when it could not be checked, or does not apply. */
export type ReadyCheck = { id: string; group: string; label: string; ok: boolean | null; detail: string };
export type Readiness = { ready: boolean; checkedAt: string; checks: ReadyCheck[] };

const RIG = 'สคริปต์ควบคุมอุปกรณ์';
const SENSOR = 'เซนเซอร์สนามแม่เหล็ก';
const CAMERA = 'กล้อง';
const DATABASE = 'ฐานข้อมูล';

/** Every script the web app can ask the rig to run. */
export const RIG_SCRIPTS = [...INSTRUMENT_SCRIPTS, ...BREAK_SCRIPTS, RELAY_SCRIPT];
const SCRIPT_LABEL: Record<string, string> = {
  'coil_1.py': 'เปิดขดลวด 1 รอบ', 'coil_2.py': 'เปิดขดลวด 2 รอบ', 'coil_3.py': 'เปิดขดลวด 3 รอบ',
  'sole.py': 'เปิดโซลีนอยด์และเลื่อนหัววัด', 'coil_b.py': 'ตัดวงจรขดลวด', 'sole_b.py': 'เก็บแขนกลของโซลีนอยด์',
  'relay.py': 'เปิดและปิดแหล่งจ่ายไฟ',
};

const PROCESS_TIMEOUT_MS = 8000;
const SENSOR_TIMEOUT_MS = 3000;

// Reads each script without running it: does it parse, and can every module it
// imports be found by this Python? Prints one JSON object, script name to
// { missing: [...] } or { error: "..." }.
const INSPECT = [
  'import ast, importlib.util, json, sys',
  'out = {}',
  'for name in sys.argv[1:]:',
  '    try:',
  '        tree = ast.parse(open(name, encoding="utf-8").read(), name)',
  '    except Exception as e:',
  '        out[name] = {"error": type(e).__name__ + ": " + str(e)}',
  '        continue',
  '    mods = set()',
  '    for node in ast.walk(tree):',
  '        if isinstance(node, ast.Import):',
  '            mods.update(a.name.split(".")[0] for a in node.names)',
  '        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:',
  '            mods.add(node.module.split(".")[0])',
  '    missing = []',
  '    for m in sorted(mods):',
  '        try:',
  '            found = importlib.util.find_spec(m) is not None',
  '        except Exception:',
  '            found = False',
  '        if not found:',
  '            missing.append(m)',
  '    out[name] = {"missing": missing}',
  'print(json.dumps(out))',
].join('\n');

const exists = (file: string, mode = constants.R_OK) => access(file, mode).then(() => true, () => false);
const why = (err: unknown) => (err as { code?: string })?.code ?? (err instanceof Error ? err.message.split('\n')[0].slice(0, 120) : 'ไม่ทราบสาเหตุ');

async function checkRig(): Promise<ReadyCheck[]> {
  const checks: ReadyCheck[] = [];

  const folder = await stat(SCRIPT_DIR).then(s => s.isDirectory(), () => false);
  checks.push({ id: 'rig-folder', group: RIG, label: 'โฟลเดอร์สคริปต์', ok: folder, detail: folder ? SCRIPT_DIR : `ไม่พบโฟลเดอร์ ${SCRIPT_DIR} (ตั้งที่ RIG_SCRIPT_DIR)` });

  // Python has to be there and has to start.
  let python = false;
  let pythonDetail = `ไม่พบ ${PYTHON} (ตั้งที่ RIG_PYTHON)`;
  if (await exists(PYTHON, constants.X_OK)) {
    try {
      const { stdout, stderr } = await execFileAsync(PYTHON, ['--version'], { timeout: PROCESS_TIMEOUT_MS });
      python = true;
      pythonDetail = `${(stdout || stderr).trim()} ที่ ${PYTHON}`;
    } catch (err) {
      pythonDetail = `มีไฟล์ ${PYTHON} แต่เรียกใช้ไม่ได้ (${why(err)})`;
    }
  }
  checks.push({ id: 'rig-python', group: RIG, label: 'Python ของชุดทดลอง', ok: python, detail: pythonDetail });

  const present = await Promise.all(RIG_SCRIPTS.map(script => exists(path.join(SCRIPT_DIR, script))));
  const found = RIG_SCRIPTS.filter((_, i) => present[i]);

  // What Python makes of the scripts that are there.
  let inspected: Record<string, { missing?: string[]; error?: string }> | null = null;
  let inspectFailed = '';
  if (python && found.length) {
    try {
      const { stdout } = await execFileAsync(PYTHON, ['-c', INSPECT, ...found], { cwd: SCRIPT_DIR, timeout: PROCESS_TIMEOUT_MS });
      inspected = JSON.parse(stdout);
    } catch (err) {
      inspectFailed = why(err);
    }
  }

  RIG_SCRIPTS.forEach((script, i) => {
    const label = `${script} (${SCRIPT_LABEL[script] ?? 'สคริปต์'})`;
    const id = `rig-${script}`;
    if (!present[i]) { checks.push({ id, group: RIG, label, ok: false, detail: 'ไม่พบไฟล์นี้ในโฟลเดอร์สคริปต์' }); return; }
    const seen = inspected?.[script];
    if (!seen) {
      checks.push({ id, group: RIG, label, ok: null, detail: python ? `มีไฟล์ แต่ตรวจเนื้อหาไม่ได้ (${inspectFailed || 'ไม่มีผล'})` : 'มีไฟล์ แต่ยังตรวจไลบรารีไม่ได้เพราะ Python ใช้ไม่ได้' });
    } else if (seen.error) {
      checks.push({ id, group: RIG, label, ok: false, detail: `Python อ่านไฟล์ไม่ผ่าน: ${seen.error.slice(0, 160)}` });
    } else if (seen.missing?.length) {
      checks.push({ id, group: RIG, label, ok: false, detail: `ขาดไลบรารีใน venv: ${seen.missing.join(', ')}` });
    } else {
      checks.push({ id, group: RIG, label, ok: true, detail: 'มีไฟล์ และไลบรารีที่ใช้ครบ' });
    }
  });
  return checks;
}

// Not only that the sensor service's port is open: that a reading arrives.
function checkSensorData(): Promise<ReadyCheck> {
  const base = { id: 'sensor-data', group: SENSOR, label: 'ค่าจากเซนเซอร์' };
  const url = (process.env.SENSOR_URL?.trim() || 'ws://127.0.0.1:8888').replace(/^http/, 'ws');
  if (typeof WebSocket === 'undefined')
    return Promise.resolve({ ...base, ok: null, detail: 'Node รุ่นนี้ตรวจไม่ได้ ดูสถานะการเชื่อมต่อในส่วนสถานะอุปกรณ์แทน' });

  return new Promise((resolve) => {
    let opened = false;
    let socket: WebSocket;
    const done = (ok: boolean, detail: string) => {
      clearTimeout(timer);
      try { socket?.close(); } catch { /* already closed */ }
      resolve({ ...base, ok, detail });
    };
    const timer = setTimeout(() => done(false, opened
      ? `ต่อบริการเซนเซอร์ได้ แต่ไม่มีค่าส่งมาใน ${SENSOR_TIMEOUT_MS / 1000} วินาที (ตรวจสายและที่อยู่ I2C ของเซนเซอร์)`
      : `ต่อบริการเซนเซอร์ที่ ${url} ไม่ได้`), SENSOR_TIMEOUT_MS);
    try {
      socket = new WebSocket(url);
    } catch {
      done(false, `ที่อยู่ของบริการเซนเซอร์ใช้ไม่ได้: ${url}`);
      return;
    }
    socket.onopen = () => { opened = true; };
    socket.onerror = () => { if (!opened) done(false, `ต่อบริการเซนเซอร์ที่ ${url} ไม่ได้ (บริการอาจไม่ได้รันอยู่)`); };
    socket.onmessage = (event) => {
      const field = fieldFromSensor(typeof event.data === 'string' ? event.data : String(event.data));
      if (field !== null) done(true, `ได้ค่า ${field.toFixed(3)} mT (คาลิเบตแล้ว ยังไม่หักพื้นหลัง)`);
    };
  });
}

async function checkCameraFeeds(): Promise<ReadyCheck[]> {
  const NAMES: Record<string, string> = { cam1: 'กล้องหลัก', cam2: 'กล้องเสริม (โซลีนอยด์)', cam3: 'กล้องเสริม (ขดลวด)' };
  return (await checkCameras()).map(({ key, state }) => ({
    id: `camera-${key}`, group: CAMERA, label: NAMES[key] ?? key,
    ok: state === 'online' ? true : state === 'offline' ? false : null,
    detail: state === 'online' ? 'เซิร์ฟเวอร์กล้องตอบ' : state === 'offline' ? 'เซิร์ฟเวอร์กล้องไม่ตอบ' : `ยังไม่ได้ตั้งค่าที่อยู่ (${key})`,
  }));
}

async function checkDatabase(): Promise<ReadyCheck> {
  const base = { id: 'database', group: DATABASE, label: 'Firestore' };
  try {
    const snap = await adminDb.collection('labs').limit(1).get();
    return { ...base, ok: snap.size > 0, detail: snap.size > 0 ? 'อ่านข้อมูลได้' : 'ต่อได้ แต่ยังไม่มีข้อมูลห้องแลป (collection labs ว่าง)' };
  } catch (err) {
    console.error('[lab-readiness] Firestore', err);
    return { ...base, ok: false, detail: 'อ่านข้อมูลไม่ได้ (ตรวจ credential และการเชื่อมต่ออินเทอร์เน็ต)' };
  }
}

/** Checks everything at once. Ready means nothing checked came out wrong. */
export async function checkReadiness(): Promise<Readiness> {
  const [rig, sensor, cameras, database] = await Promise.all([checkRig(), checkSensorData(), checkCameraFeeds(), checkDatabase()]);
  const checks = [...rig, sensor, ...cameras, database];
  return { ready: checks.every(c => c.ok !== false), checkedAt: new Date().toISOString(), checks };
}
