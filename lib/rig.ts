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
// The relay that switches the supply feeding the coils and the solenoid. Its
// two scripts sit in the same folder as the rest.
export const SUPPLY_ON = 'relay_on.py';
export const SUPPLY_OFF = 'relay_off.py';

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
  last: { command: string; ok: boolean; at: number } | null;
};

type Tracked = Omit<RigState, 'busy'> & { running: number };
// On globalThis so that every route handler sees the same record, however the
// bundler splits them.
const holder = globalThis as typeof globalThis & { __rigState?: Tracked };
const tracked = (): Tracked => (holder.__rigState ??= { running: 0, circuit: null, position: null, supply: null, last: null });

export function rigState(): RigState {
  const { running, ...rest } = tracked();
  return { busy: running > 0, ...rest };
}

/** Forgets everything; for tests. */
export function resetRigState(): void {
  holder.__rigState = undefined;
}

function note(argv: string[], ok: boolean) {
  const state = tracked();
  state.last = { command: argv.join(' '), ok, at: Date.now() };
  if (!ok) return;
  const [script] = argv;
  if (script === SUPPLY_ON || script === SUPPLY_OFF) {
    state.supply = script === SUPPLY_ON;
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
    note(argv, false);
    throw err;
  } finally {
    state.running--;
  }
}

/**
 * Cuts both circuits and switches the power supply off, whatever is on.
 * Returns the scripts that could not be run.
 */
export async function cutAllCircuits(): Promise<string[]> {
  const failed: string[] = [];
  for (const script of [...BREAK_SCRIPTS, SUPPLY_OFF]) {
    try {
      await runRigScript([script]);
    } catch (err) {
      console.error(`[rig] ${script} failed`, err);
      failed.push(script);
    }
  }
  return failed;
}
