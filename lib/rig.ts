import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

// Where the rig's control scripts live on the lab machine, and the Python that
// runs them. Both come from the environment (RIG_SCRIPT_DIR, RIG_PYTHON), read
// once when the server starts; the defaults are the lab machine's own layout.
const fromEnv = (name: string) => process.env[name]?.trim() || undefined;
export const SCRIPT_DIR = (fromEnv('RIG_SCRIPT_DIR') ?? '/home/admin/Documents').replace(/[\\/]+$/, '');
export const PYTHON = fromEnv('RIG_PYTHON') ?? `${SCRIPT_DIR}/venv/bin/python`;

export const BREAK_SCRIPTS = ['coil_b.py', 'sole_b.py']; // cut a circuit
// The relays that switch the supply feeding the coils and the solenoid, one
// per instrument: relay.py --status on|off --name <relay>. It sits in the same
// folder as the rest. RELAY_ALL is every relay at once.
export const RELAY_SCRIPT = 'relay.py';
export const RELAY_ALL = 'all';
export const RELAY_NAMES = ['solenoid', 'coil1', 'coil2', 'coil3', RELAY_ALL];
export const supplyCommand = (on: boolean, name: string) => [RELAY_SCRIPT, '--status', on ? 'on' : 'off', '--name', name];
export const SUPPLY_OFF = supplyCommand(false, RELAY_ALL);

// What the rig should be doing, going by the commands this server has sent it.
// The rig reports nothing back, so this is a record of commands, not a reading:
// it starts empty on every restart and knows nothing of a switch thrown by hand.
export type RigState = {
  /** Scripts running right now. */
  busy: boolean;
  /** The script that last switched a circuit on and has not been cut since. */
  circuit: string | null;
  /** Where the probe was last sent, in cm, while the solenoid is on. */
  position: number | null;
  /** Whether the power supply was last switched on (true) or off (false). Null until either has been sent. */
  supply: boolean | null;
  /** The relay that is on while the supply is: an instrument's own, or RELAY_ALL. */
  relay: string | null;
  /** `error` is why the last command failed, for the admin page only: it can hold paths. */
  last: { command: string; ok: boolean; at: number; error?: string } | null;
};

type Tracked = Omit<RigState, 'busy'> & { running: number };
// On globalThis so that every route handler sees the same record, however the
// bundler splits them.
const holder = globalThis as typeof globalThis & { __rigState?: Tracked };
const tracked = (): Tracked => (holder.__rigState ??= { running: 0, circuit: null, position: null, supply: null, relay: null, last: null });

export function rigState(): RigState {
  const { running, ...rest } = tracked();
  return { busy: running > 0, ...rest };
}

/** Forgets everything; for tests. */
export function resetRigState(): void {
  holder.__rigState = undefined;
}

// What went wrong, in a few lines: the script's own last output when it ran,
// otherwise why it could not be started (no such file, no such Python).
function reason(err: unknown): string {
  const e = err as { stderr?: unknown; stdout?: unknown; message?: unknown; code?: unknown };
  const output = [e?.stderr, e?.stdout].filter((t): t is string => typeof t === 'string' && t.trim() !== '').join('\n').trim();
  const text = output ? output.split('\n').slice(-4).join('\n') : String(e?.message ?? err);
  return (e?.code !== undefined ? `[${String(e.code)}] ` : '') + text.slice(-400);
}

function note(argv: string[], ok: boolean, err?: unknown) {
  const state = tracked();
  state.last = { command: argv.join(' '), ok, at: Date.now(), ...(ok ? {} : { error: reason(err) }) };
  if (!ok) return;
  const [script] = argv;
  if (script === RELAY_SCRIPT) {
    const name = argv[4];
    if (argv[2] === 'on') {
      state.supply = true;
      state.relay = name;
    } else if (name === RELAY_ALL || name === state.relay || state.supply === null) {
      // Switching off a relay other than the one that is on changes nothing.
      state.supply = false;
      state.relay = null;
    }
  } else if (script === 'sole.py') {
    state.circuit = script;
    state.position = Number(argv[2]);
  } else if (script === 'coil_b.py') {
    if (state.circuit !== 'sole.py') state.circuit = null;
  } else if (script === 'sole_b.py') {
    if (state.circuit === 'sole.py') state.circuit = null;
    state.position = null;
  } else {
    state.circuit = script;
    state.position = null;
  }
}

/** Runs one of the rig's scripts. Never through a shell: `argv` is passed as it is. */
export async function runRigScript(argv: string[]) {
  const state = tracked();
  state.running++;
  try {
    const result = await execFileAsync(PYTHON, argv, { cwd: SCRIPT_DIR });
    note(argv, true);
    return result;
  } catch (err) {
    note(argv, false, err);
    throw err;
  } finally {
    state.running--;
  }
}

/** Whether the relay `name` is on, going by the commands sent. */
export function isFeeding(name: string): boolean {
  const { supply, relay } = tracked();
  return supply === true && (relay === name || relay === RELAY_ALL);
}

/**
 * Switches the supply on for one relay. Only one instrument is fed at a time:
 * unless everything is known to be off, every relay is switched off first
 * (not for RELAY_ALL, which leaves none out). Does nothing when that relay is
 * already on. Throws when relay.py fails.
 */
export async function feed(name: string): Promise<void> {
  if (isFeeding(name)) return;
  if (name !== RELAY_ALL && tracked().supply !== false) await runRigScript(SUPPLY_OFF);
  await runRigScript(supplyCommand(true, name));
}

/**
 * Cuts both circuits and switches every relay off, whatever is on.
 * Returns the scripts that could not be run.
 */
export async function cutAllCircuits(): Promise<string[]> {
  const failed: string[] = [];
  for (const argv of [...BREAK_SCRIPTS.map(script => [script]), SUPPLY_OFF]) {
    try {
      await runRigScript(argv);
    } catch (err) {
      console.error(`[rig] ${argv.join(' ')} failed`, err);
      failed.push(argv[0]);
    }
  }
  return failed;
}
