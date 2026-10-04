// Lab 8 (Biot–Savart) field formulas. Shared by the lab room and the landing
// page's field plot so both always show the same theory. SI units in, mT out.

const MU0 = 4 * Math.PI * 1e-7;

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
