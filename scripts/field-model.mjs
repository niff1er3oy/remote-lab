// Generates lib/field-model.ts, the field lines of the lab room's field model
// (the 2D section and the 3D view are both drawn from it).
//
//   node scripts/field-model.mjs
//
// The lines are traced through the exact Biot-Savart field of the rig's two
// windings: a thin circular loop (elliptic integrals) and a finite solenoid
// taken as a continuous sheet of current (the same model as the handout's
// on-axis formula). Rerun this if a dimension or a tuning constant changes.

import { writeFileSync } from 'node:fs';

// The rig, in cm.
const COIL_R = 1.3;
const SOL_R = 2.1;
const SOL_L = 8;

// Which lines are drawn. A line's level is g(rho0) / step, where g is the
// integral of B_z / B0 along the mid-plane from the axis: equal steps of g put
// neighbouring lines a distance apart that is inversely proportional to the
// field between them.
const COIL_TOP = 0.8; // rho0 / R of the coil's outermost line
const COIL_TOP_LEVEL = 24;
// The n-turn drawing shows every COIL_LEVEL_STRIDE[n]-th level. The step is the
// same field step for all three, so n turns show n times the lines.
const COIL_LEVEL_STRIDE = { 1: 6, 2: 3, 3: 2 };
const SOLENOID_TOP = 0.9; // rho0 / R of the solenoid's outermost line
const SOLENOID_LINES = 6;

const COIL_FRAME = { z: 6.5, rho: 4.5 };
const SOLENOID_FRAME = { z: 14, rho: 8 };

// Sampling of the stored lines.
const MAX_POINTS = 90;
const MAX_SEGMENT = 0.58; // cm; under 0.6 once the points are rounded
const MIN_SEGMENT = 0.04; // cm; well above the 0.001 cm rounding
const TRACE_STEP = 0.002; // cm
const COIL_AXIS_STEP = 0.25; // cm; the coil's axial field falls off within a radius
const SOLENOID_AXIS_STEP = 0.5;

// Complete elliptic integrals K(m) and E(m), m = k², by the arithmetic-geometric mean.
function ellipKE(m) {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let c = Math.sqrt(m);
  let sum = 0.5 * c * c;
  let pow = 0.5;
  while (Math.abs(c) > 1e-13) {
    const an = (a + b) / 2;
    c = (a - b) / 2;
    b = Math.sqrt(a * b);
    a = an;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

// Field of a loop of radius a centred on the axis at z = 0, at the point
// (rho, z). Returned as [B_rho, B_z] in units of μ₀I/π.
function loopB(a, rho, z) {
  const r2 = a * a + rho * rho + z * z;
  const al2 = r2 - 2 * a * rho;
  const be = Math.sqrt(r2 + 2 * a * rho);
  const [K, E] = ellipKE(Math.max(0, 1 - al2 / (be * be)));
  const bz = ((a * a - rho * rho - z * z) * E + al2 * K) / (2 * al2 * be);
  const brho = rho < 1e-9 ? 0 : (z * (r2 * E - al2 * K)) / (2 * al2 * be * rho);
  return [brho, bz];
}

// Flux function Ψ = ρ·A_φ of the same loop, in units of μ₀I/π. 2πΨ is the flux
// through the circle of radius rho at height z, so Ψ is constant along a field
// line: the test every traced line has to pass.
function loopPsi(a, rho, z) {
  if (rho < 1e-12) return 0;
  const k2 = (4 * a * rho) / ((a + rho) ** 2 + z * z);
  const [K, E] = ellipKE(k2);
  return (rho * Math.sqrt(a / rho) * ((1 - k2 / 2) * K - E)) / Math.sqrt(k2);
}

// Bulirsch's generalised complete elliptic integral, as given by Derby and
// Olbert (Am. J. Phys. 78, 229, 2010).
function cel(kc, p, c, s) {
  let k = Math.abs(kc);
  let pp = p;
  let cc = c;
  let ss = s;
  let em = 1;
  if (p > 0) {
    pp = Math.sqrt(p);
    ss = s / pp;
  } else {
    let f = kc * kc;
    let q = 1 - f;
    const g = 1 - pp;
    f -= pp;
    q *= ss - c * pp;
    pp = Math.sqrt(f / g);
    cc = (c - ss) / g;
    ss = -q / (g * g * pp) + cc * pp;
  }
  let f = cc;
  cc += ss / pp;
  let g = k / pp;
  ss = 2 * (ss + f * g);
  pp += g;
  g = em;
  em += k;
  let kk = k;
  while (Math.abs(g - k) > g * 1e-9) {
    k = 2 * Math.sqrt(kk);
    kk = k * em;
    f = cc;
    cc += ss / pp;
    g = kk / pp;
    ss = 2 * (ss + f * g);
    pp += g;
    g = em;
    em += k;
  }
  return ((Math.PI / 2) * (ss + cc * em)) / (em * (em + pp));
}

// Field of the solenoid as a continuous cylindrical sheet of current, radius
// SOL_R and length SOL_L, in closed form (Derby and Olbert). Returned as
// [B_rho, B_z] in units of μ₀·(N/L)·I, the field of an infinite solenoid.
// A sheet rather than 100 separate turns because that is the model behind the
// handout's on-axis formula, and it has no turn-by-turn ripple for a line to
// be caught in where it passes out through the winding.
function solenoidB(rho, z) {
  const a = SOL_R;
  const zp = z + SOL_L / 2;
  const zm = z - SOL_L / 2;
  const sp = Math.hypot(zp, rho + a);
  const sm = Math.hypot(zm, rho + a);
  const kp = Math.hypot(zp, a - rho) / sp;
  const km = Math.hypot(zm, a - rho) / sm;
  const gamma = (a - rho) / (a + rho);
  const brho = ((a / sp) * cel(kp, 1, 1, -1) - (a / sm) * cel(km, 1, 1, -1)) / Math.PI;
  const bz = (a / (Math.PI * (a + rho))) * ((zp / sp) * cel(kp, gamma * gamma, 1, gamma) - (zm / sm) * cel(km, gamma * gamma, 1, gamma));
  return [rho < 1e-9 ? 0 : brho, bz];
}

// The same sheet as a stack of loops, far more of them than real turns. Slow,
// and by a different route (a sum of loops instead of the closed form), so it
// is used only to check the closed form and the traced lines.
const STACK_LOOPS = 20000;
function stackSum(loopValue, rho, z) {
  let sum = 0;
  for (let i = 0; i < STACK_LOOPS; i++) {
    const zi = -SOL_L / 2 + ((i + 0.5) * SOL_L) / STACK_LOOPS;
    sum += loopValue(SOL_R, rho, z - zi);
  }
  // Loops per cm times μ₀I/π, in units of μ₀·(N/L)·I: one loop stands for a
  // strip of sheet SOL_L / STACK_LOOPS long.
  return (sum * SOL_L) / STACK_LOOPS / Math.PI;
}
const stackB = (rho, z) => [0, 1].map(i => stackSum((a, r, dz) => loopB(a, r, dz)[i], rho, z));
const stackPsi = (rho, z) => stackSum(loopPsi, rho, z);

const coilB = (rho, z) => loopB(COIL_R, rho, z);
const coilPsi = (rho, z) => loopPsi(COIL_R, rho, z);

// g(rho) = (1 / B0) ∫ B_z(rho', 0) d rho' from the axis, by Simpson's rule.
function gSimpson(field, rho, n = 2000) {
  const b0 = field(0, 0)[1];
  const h = rho / n;
  let sum = field(0, 0)[1] + field(rho, 0)[1];
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * field(i * h, 0)[1];
  return (sum * h) / 3 / b0;
}

// The same integral by the midpoint rule on a different grid, for the check.
function gMidpoint(field, rho, n = 3001) {
  const b0 = field(0, 0)[1];
  const h = rho / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += field((i + 0.5) * h, 0)[1];
  return (sum * h) / b0;
}

// B_z is positive everywhere inside the winding on the mid-plane, so g rises
// steadily and bisection finds the one rho with g(rho) = target.
function solveG(field, target, rhoMax) {
  let lo = 0;
  let hi = rhoMax;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (gSimpson(field, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Follows the field from (rho0, z = 0) in the +z direction until the line comes
// back to the mid-plane (a closed line) or leaves the frame. The other half is
// the mirror image, so only this half is traced.
function trace(field, rho0, frame, sheet, step = TRACE_STEP) {
  const dir = (rho, z) => {
    const [br, bz] = field(rho, z);
    const n = Math.hypot(br, bz);
    return [br / n, bz / n];
  };
  let rho = rho0;
  let z = 0;
  const pts = [[z, rho]];
  const corners = new Set();
  for (let i = 0; i < 400000; i++) {
    const [r1, z1] = dir(rho, z);
    // B_z jumps across a sheet of current, and a Runge-Kutta step that
    // straddles the jump is no better than first order. So the last step up to
    // the sheet is a straight one that lands just beyond it. The line has a
    // corner there (it is refracted by the sheet), so that point is kept.
    const toSheet = sheet && Math.abs(z) < sheet.halfLength ? (sheet.radius - rho) / r1 : -1;
    if (toSheet > 0 && toSheet <= step) {
      const t = toSheet + 1e-9;
      rho += t * r1;
      z += t * z1;
      pts.push([z, rho]);
      // The field strength steps there too, so a point is kept close by on
      // either side: the shading then changes at the sheet, not along the
      // whole segment leading up to it.
      const beside = Math.round((1.25 * MIN_SEGMENT) / step);
      for (const index of [-beside, 0, beside]) corners.add(pts.length - 1 + index);
      continue;
    }
    const [r2, z2] = dir(rho + (step / 2) * r1, z + (step / 2) * z1);
    const [r3, z3] = dir(rho + (step / 2) * r2, z + (step / 2) * z2);
    const [r4, z4] = dir(rho + step * r3, z + step * z3);
    const nextRho = rho + (step / 6) * (r1 + 2 * r2 + 2 * r3 + r4);
    const nextZ = z + (step / 6) * (z1 + 2 * z2 + 2 * z3 + z4);
    if (nextZ <= 0 && i > 10) {
      // Back at the mid-plane: land exactly on it.
      const t = z / (z - nextZ);
      pts.push([0, rho + t * (nextRho - rho)]);
      return { pts, corners, closed: true };
    }
    if (nextZ > frame.z || nextRho > frame.rho) {
      // Leaving the frame: stop exactly on its edge.
      const t = Math.min(
        nextZ > frame.z ? (frame.z - z) / (nextZ - z) : 1,
        nextRho > frame.rho ? (frame.rho - rho) / (nextRho - rho) : 1,
      );
      pts.push([z + t * (nextZ - z), rho + t * (nextRho - rho)]);
      return { pts, corners, closed: false };
    }
    rho = nextRho;
    z = nextZ;
    pts.push([z, rho]);
  }
  throw new Error(`line from rho0=${rho0} did not finish`);
}

// Keeps a point wherever the line has turned by `angle` since the last one kept,
// and at least every MAX_SEGMENT along straight stretches, where the field
// strength still changes and has to be sampled for the shading.
function thin(pts, corners, angle) {
  const out = [pts[0]];
  let last = pts[0];
  let lastDir = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
  let dist = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const d = Math.atan2(pts[i + 1][1] - p[1], pts[i + 1][0] - p[0]);
    if (corners.has(i)) {
      // These replace a point kept just before them, so that no two stored
      // points round to the same place.
      if (dist < MIN_SEGMENT && out.length > 1) out.pop();
      out.push(p);
      last = p;
      lastDir = d;
      dist = 0;
      continue;
    }
    if (dist < MIN_SEGMENT) continue;
    const turned = Math.abs(Math.atan2(Math.sin(d - lastDir), Math.cos(d - lastDir)));
    const next = Math.hypot(pts[i + 1][0] - p[0], pts[i + 1][1] - p[1]);
    if (turned > angle || dist + next > MAX_SEGMENT || Math.hypot(p[0] - last[0], p[1] - last[1]) + next > MAX_SEGMENT) {
      out.push(p);
      last = p;
      lastDir = d;
      dist = 0;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const round3 = x => +x.toFixed(3) + 0; // "+ 0" turns -0 into 0

const report = { psi: 0, g: 0, gRounded: 0, axis: 0, sheet: 0, points: 0, segment: 0 };

function buildLine(winding, level, rho0, frame) {
  const { field, psi } = winding;
  const b0 = field(0, 0)[1];
  const { pts, corners, closed } = trace(field, rho0, frame, winding.halfLength > 0 ? winding : null);
  // The whole line has 2·half − 2 points when closed, 2·half − 1 when open.
  const count = half => 2 * half.length - (closed ? 2 : 1);
  let angle = 0.06;
  let half = thin(pts, corners, angle);
  while (count(half) > MAX_POINTS && angle < 0.5) {
    angle *= 1.15;
    half = thin(pts, corners, angle);
  }

  // Ψ along the points kept, before rounding: rounding rho to 0.001 cm alone
  // moves Ψ by up to 2 × 0.0005 / rho, which near the axis is more than the
  // tracing error this is looking for.
  const values = half.map(([z, rho]) => psi(rho, z));
  const spread = (Math.max(...values) - Math.min(...values)) / values[0];
  if (!(spread < 5e-3)) throw new Error(`level ${level}: flux function varies by ${spread} along the line`);
  report.psi = Math.max(report.psi, spread);

  // A point on the sheet itself rounds to rho = R exactly, where the closed
  // form gives the mean of the fields on the two sides: b has a step there.
  const stored = half.map(([z, rho]) => {
    const zr = round3(z);
    const rr = round3(rho);
    const [br, bz] = field(rr, zr);
    return [zr, rr, round3(Math.hypot(br, bz) / b0)];
  });
  const mirrored = stored.map(([z, rho, b]) => [round3(-z), rho, b]).reverse();
  // Both halves run along the field: mirroring in the mid-plane keeps B_z and
  // flips B_rho, so the mirror image run backwards is again a field line.
  const all = closed ? [...stored, ...mirrored.slice(1, -1)] : [...mirrored.slice(0, -1), ...stored];
  report.points = Math.max(report.points, all.length);
  for (let i = 1; i < all.length; i++) {
    report.segment = Math.max(report.segment, Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]));
  }
  return { level, rho0: round3(rho0), closed, points: all.flat() };
}

function axisLine(winding, frame, spacing) {
  const b0 = winding.field(0, 0)[1];
  const n = Math.ceil(frame.z / spacing);
  const points = [];
  for (let i = -n; i <= n; i++) {
    const z = round3((i * frame.z) / n);
    points.push(z, 0, round3(winding.field(0, z)[1] / b0));
  }
  return { level: 0, rho0: 0, closed: false, points };
}

function buildModel(winding, frame, levels, topLevel, topRho, axisSpacing) {
  const { field } = winding;
  const step = gSimpson(field, topRho) / topLevel;
  const lines = [axisLine(winding, frame, axisSpacing)];
  for (const level of levels) {
    const rho0 = level === topLevel ? topRho : solveG(field, level * step, topRho);
    const line = buildLine(winding, level, rho0, frame);
    // Checked for the rho0 that was traced and for the rounded one that is stored.
    for (const [key, value] of [['g', rho0], ['gRounded', line.rho0]]) {
      const error = Math.abs(gMidpoint(field, value) / (level * step) - 1);
      if (!(error < 5e-3)) throw new Error(`level ${level}: g(rho0) is off its level by ${error} (${key})`);
      report[key] = Math.max(report[key], error);
    }
    lines.push(line);
  }
  return { radius: winding.radius, halfLength: winding.halfLength, frame, step, lines };
}

// On the axis both fields have the closed forms the lab room teaches
// (lib/physics.ts); the field functions above have to reproduce them.
function checkAxis(name, field, closedForm, zs) {
  for (const z of zs) {
    const error = Math.abs(field(0, z)[1] / closedForm(z) - 1);
    if (!(error < 1e-3)) throw new Error(`${name}: on-axis field at z=${z} is off by ${error}`);
    report.axis = Math.max(report.axis, error);
  }
}
// Loop: B_z = μ₀IR² / 2(R² + z²)^(3/2), here in units of μ₀I/π.
checkAxis('coil', coilB, z => (Math.PI * COIL_R ** 2) / (2 * (COIL_R ** 2 + z * z) ** 1.5), [0, 0.5, 1.3, 3, 6.5]);
// Solenoid: B_z = (μ₀NI/2L)·[a/√(R² + a²) + b/√(R² + b²)], a = L/2 + z, b = L/2 − z.
checkAxis('solenoid', solenoidB, z => {
  const a = SOL_L / 2 + z;
  const b = SOL_L / 2 - z;
  return (a / Math.hypot(SOL_R, a) + b / Math.hypot(SOL_R, b)) / 2;
}, [0, 1, 2, 4, 5, 8, 10, 14]);
// Off the axis the closed form is checked against the stack of loops.
for (const [rho, z] of [[0.5, 0], [1.9, 0], [1.9, 3.5], [2.6, 0], [1, 4], [2.6, 4.4], [3, 6], [7, 2], [5, 12]]) {
  const exact = solenoidB(rho, z);
  const stack = stackB(rho, z);
  const error = Math.hypot(exact[0] - stack[0], exact[1] - stack[1]) / Math.hypot(...stack);
  if (!(error < 1e-3)) throw new Error(`solenoid: closed form and stack of loops differ by ${error} at (${rho}, ${z})`);
  report.sheet = Math.max(report.sheet, error);
}

const strides = Object.values(COIL_LEVEL_STRIDE);
const coilLevels = [];
for (let level = 1; level <= COIL_TOP_LEVEL; level++) {
  if (strides.some(stride => level % stride === 0)) coilLevels.push(level);
}
const solenoidLevels = Array.from({ length: SOLENOID_LINES }, (_, i) => i + 1);

const coil = buildModel(
  { field: coilB, psi: coilPsi, radius: COIL_R, halfLength: 0 },
  COIL_FRAME, coilLevels, COIL_TOP_LEVEL, COIL_TOP * COIL_R, COIL_AXIS_STEP,
);
const solenoid = buildModel(
  { field: solenoidB, psi: stackPsi, radius: SOL_R, halfLength: SOL_L / 2 },
  SOLENOID_FRAME, solenoidLevels, SOLENOID_LINES, SOLENOID_TOP * SOL_R, SOLENOID_AXIS_STEP,
);

const modelSource = model => `{
  radius: ${model.radius},
  halfLength: ${model.halfLength},
  frame: { z: ${model.frame.z}, rho: ${model.frame.rho} },
  lines: [
${model.lines.map(l => `    { level: ${l.level}, rho0: ${l.rho0}, closed: ${l.closed}, points: [${l.points.join(',')}] },`).join('\n')}
  ],
}`;

const out = `// Generated by scripts/field-model.mjs — do not edit by hand.
//
// Field lines of the rig's single coil (radius ${COIL_R} cm) and its solenoid
// (${SOL_L} cm long, radius ${SOL_R} cm), traced through the exact Biot-Savart field.
// Cylindrical coordinates in cm: z along the axis, rho from it. The current
// runs counterclockwise seen from +z, so B points along +z on the axis.

/** One field line in a half-plane through the axis (rho >= 0). */
export type ModelLine = {
  /** The line's level: it crosses the mid-plane, inside the winding, where g(rho0) = level x (the model's step). 0 is the axis itself. */
  level: number;
  /** Where it crosses the mid-plane z = 0 inside the winding, cm. 0 for the axis. */
  rho0: number;
  /** True when the line closes on itself around the winding inside the frame. */
  closed: boolean;
  /**
   * The line as flattened triples [z, rho, b, z, rho, b, ...] in the direction
   * of the field: z and rho in cm, b = |B| at that point divided by the field
   * at the centre (0, 0). A closed line starts at its inside crossing of the
   * mid-plane and runs once round (the last point is NOT a repeat of the
   * first). An open line runs from where it enters the frame to where it
   * leaves it.
   */
  points: number[];
};

export type FieldModel = {
  /** Winding radius, cm. */
  radius: number;
  /** Half the winding's length, cm (0 for the single coil). */
  halfLength: number;
  /** The region the lines were traced in: |z| <= frame.z and rho <= frame.rho, cm. */
  frame: { z: number; rho: number };
  /** Sorted by level, the axis (level 0) first. */
  lines: ModelLine[];
};

export const COIL_MODEL: FieldModel = ${modelSource(coil)};

export const SOLENOID_MODEL: FieldModel = ${modelSource(solenoid)};

/** The coil's n-turn drawing shows the lines whose level is a multiple of COIL_LEVEL_STRIDE[n] (and the axis). */
export const COIL_LEVEL_STRIDE: Record<1 | 2 | 3, number> = { 1: ${COIL_LEVEL_STRIDE[1]}, 2: ${COIL_LEVEL_STRIDE[2]}, 3: ${COIL_LEVEL_STRIDE[3]} };
`;

writeFileSync(new URL('../lib/field-model.ts', import.meta.url), out);

const describe = (name, lines) => {
  const rho0 = lines.map(l => l.rho0);
  const gaps = rho0.slice(1).map((r, i) => r - rho0[i]);
  console.log(`${name}: rho0 = ${rho0.join(', ')} cm; smallest gap ${Math.min(...gaps).toFixed(3)} cm; closed ${lines.filter(l => l.closed).length} of ${lines.length}`);
};
console.log(`coil step ${coil.step.toFixed(5)} cm, solenoid step ${solenoid.step.toFixed(5)} cm`);
for (const n of [1, 2, 3]) describe(`coil, ${n} turn(s)`, coil.lines.filter(l => l.level > 0 && l.level % COIL_LEVEL_STRIDE[n] === 0));
describe('solenoid', solenoid.lines.filter(l => l.level > 0));
console.log(`largest errors: on-axis ${report.axis.toExponential(2)}, sheet vs stack ${report.sheet.toExponential(2)}, flux function ${report.psi.toExponential(2)}, g ${report.g.toExponential(2)} (stored rho0 ${report.gRounded.toExponential(2)})`);
console.log(`most points on a line ${report.points}, longest segment ${report.segment.toFixed(3)} cm`);
console.log(`wrote lib/field-model.ts (${(Buffer.byteLength(out) / 1024).toFixed(1)} KB)`);
