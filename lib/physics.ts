// Lab 8 (Biot–Savart) field formulas. Shared by the lab room and the landing
// page's field plot so both always show the same theory. SI units in, mT out.

const MU0 = 4 * Math.PI * 1e-7;

// The rig's solenoid and the row of points its probe is taken to. The arm
// (sole.py on the lab machine) moves the probe in 13 steps over 115 mm, so one
// step is a little under a centimetre: position n is n × PROBE_STEP_M from the
// middle of the solenoid.
export const SOLENOID = { N: 75, L: 0.08, R: 0.013, I: 1 };
export const PROBE_MIN = -6;
export const PROBE_MAX = 6;
export const PROBE_STEP_M = 0.115 / 12;
export const PROBE_POSITIONS = Array.from({ length: PROBE_MAX - PROBE_MIN + 1 }, (_, i) => PROBE_MIN + i);
/** Where the probe is at position `n`, in metres from the middle of the solenoid. */
export const probeZ = (position: number) => position * PROBE_STEP_M;
/** A length in metres as centimetres, to at most two decimals: "2.88", "0", "-5.75". */
export const cmText = (metres: number) => String(+(metres * 100).toFixed(2));

// Single coil at center (Z=0): B₀ = μ₀·n·I / (2R)  [mT]
export function calcBCoil(n: number, I: number, R: number): number {
  return (MU0 * n * I) / (2 * R) * 1e3;
}

// Finite solenoid on axis at Z from center: [mT]
// B_z = (μ₀·N·I / 2L) × [ (L/2+Z)/√(R²+(L/2+Z)²) + (L/2−Z)/√(R²+(L/2−Z)²) ]
export function calcBSolenoid(N: number, I: number, L: number, R: number, Z: number): number {
  const a = L / 2 + Z;
  const b = L / 2 - Z;
  return (MU0 * N * I) / (2 * L) * (a / Math.sqrt(R * R + a * a) + b / Math.sqrt(R * R + b * b)) * 1e3;
}
