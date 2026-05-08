'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Mode = 'theory' | 'measured';
type InstType = 'coil' | 'solenoid';

// ── Primitive helpers ─────────────────────────────────────────────────────────

function mkLine(pts: THREE.Vector3[], color: number, opacity = 1): THREE.Line {
  const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false });
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

function mkArrow(pos: THREE.Vector3, dir: THREE.Vector3, color: number): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.035, 0.11, 5);
  const mat = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function jitter(v: number, mag: number): number {
  return v + (Math.random() * 2 - 1) * mag;
}

// ── Solenoid: closed stadium field-line loops ─────────────────────────────────
// Each loop: top = inside solenoid (goes right), bottom = outside (goes left).

function stadiumLoop(halfL: number, R: number, P: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const S = 28;
  // Top: left → right (inside, y = +R)
  for (let i = 0; i <= S; i++) {
    pts.push(new THREE.Vector3(
      jitter(-halfL + (i / S) * 2 * halfL, P * 0.01),
      jitter(R, P * 0.008), 0,
    ));
  }
  // Right cap: +R → −R (outer arc)
  for (let i = 0; i <= S; i++) {
    const a = Math.PI / 2 - (i / S) * Math.PI;
    pts.push(new THREE.Vector3(
      jitter(halfL + R * Math.cos(a), P * 0.025),
      jitter(R * Math.sin(a),          P * 0.025), 0,
    ));
  }
  // Bottom: right → left (outside, y = −R)
  for (let i = 0; i <= S; i++) {
    pts.push(new THREE.Vector3(
      jitter(halfL - (i / S) * 2 * halfL, P * 0.01),
      jitter(-R, P * 0.008), 0,
    ));
  }
  // Left cap: −R → +R (outer arc)
  for (let i = 0; i <= S; i++) {
    const a = -Math.PI / 2 - (i / S) * Math.PI;
    pts.push(new THREE.Vector3(
      jitter(-halfL + R * Math.cos(a), P * 0.025),
      jitter(R * Math.sin(a),           P * 0.025), 0,
    ));
  }
  pts.push(pts[0]);
  return pts;
}

function addArrowAt(scene: THREE.Scene, pts: THREE.Vector3[], idx: number, color: number) {
  const lo = Math.max(0, idx - 2), hi = Math.min(pts.length - 1, idx + 2);
  if (lo >= hi) return;
  const dir = new THREE.Vector3().subVectors(pts[hi], pts[lo]).normalize();
  scene.add(mkArrow(pts[idx], dir, color));
}

function buildSolenoidScene(scene: THREE.Scene, color: number, P: number) {
  const TURNS = 9, LENGTH = 2.2, CR = 0.38;
  const halfL = LENGTH / 2;

  // Helix wire
  const helixPts: THREE.Vector3[] = [];
  for (let i = 0; i <= TURNS * 90; i++) {
    const t = i / (TURNS * 90);
    const a = t * TURNS * Math.PI * 2;
    helixPts.push(new THREE.Vector3((t - 0.5) * LENGTH, CR * Math.cos(a), CR * Math.sin(a)));
  }
  scene.add(mkLine(helixPts, 0xaaaaaa));

  // Lead wires at both ends
  const h0 = helixPts[0], hN = helixPts[helixPts.length - 1];
  scene.add(mkLine([h0, new THREE.Vector3(h0.x, h0.y - 0.55, h0.z)], 0x888888));
  scene.add(mkLine([hN, new THREE.Vector3(hN.x, hN.y - 0.55, hN.z)], 0x888888));

  // Field line loops
  const RADII = [0.12, 0.22, 0.42, 0.78, 1.25, 1.85];
  for (const R of RADII) {
    const op = R > 1.4 ? 0.28 : R > 0.6 ? 0.55 : 0.82;
    const pts = stadiumLoop(halfL, R + jitter(0, P * R * 0.06), P);
    scene.add(mkLine(pts, color, op));

    // Arrow inside (top segment ≈ first quarter of points)
    const segLen = Math.floor(pts.length / 4);
    addArrowAt(scene, pts, Math.floor(segLen * 0.5), color);   // top (going right)
    addArrowAt(scene, pts, Math.floor(segLen * 2.5), color);   // bottom (going left)
  }
}

// ── Single coil: magnetic-dipole field lines ──────────────────────────────────
// r = r₀ · sin²(θ) in spherical coords, with coil axis along X.

function dipoleLine(r0: number, phi: number, P: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 100; i++) {
    const theta = 0.12 + (Math.PI - 0.24) * (i / 100);
    const r  = r0 * Math.sin(theta) ** 2;
    const rp = r * Math.sin(theta);
    pts.push(new THREE.Vector3(
      jitter(r * Math.cos(theta), P * r * 0.04),
      jitter(rp * Math.cos(phi),  P * r * 0.04),
      jitter(rp * Math.sin(phi),  P * r * 0.04),
    ));
  }
  return pts;
}

function buildCoilScene(scene: THREE.Scene, color: number, P: number) {
  // Coil ring in YZ plane (axis = X)
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(0, 0.5 * Math.cos(a), 0.5 * Math.sin(a)));
  }
  scene.add(mkLine(ringPts, 0xaaaaaa));

  // Lead wire (diagonal, lower left)
  scene.add(mkLine([
    new THREE.Vector3(0, -0.5, 0),
    new THREE.Vector3(-1.6, -1.6, 0),
  ], 0x888888));

  // Dipole field lines — multiple azimuthal planes
  const R0_VALS = [0.72, 1.15, 1.85];
  const N_PHI = 8;
  for (const r0 of R0_VALS) {
    const op = r0 > 1.5 ? 0.3 : r0 > 1.0 ? 0.58 : 0.85;
    for (let n = 0; n < N_PHI; n++) {
      const phi = (n / N_PHI) * Math.PI * 2;
      const pts = dipoleLine(r0, phi, P);
      scene.add(mkLine(pts, color, op));
      const mid = Math.floor(pts.length / 2);
      addArrowAt(scene, pts, mid, color);
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FieldViz3D({ instType, mode }: { instType: InstType; mode: Mode }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const w = el.clientWidth  || 400;
    const h = el.clientHeight || 280;

    const scene    = new THREE.Scene();
    const camera   = new THREE.PerspectiveCamera(48, w / h, 0.01, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });

    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // Camera start position
    const IS_SOL = instType === 'solenoid';
    const camBase = IS_SOL
      ? new THREE.Vector3(0, 2.4, 5.2)
      : new THREE.Vector3(2.6, 1.8, 3.8);
    camera.position.copy(camBase);
    camera.lookAt(0, 0, 0);

    const color  = mode === 'theory' ? 0xc8ff00 : 0x22d3ee;
    const P      = mode === 'measured' ? 1 : 0;   // perturbation amount

    if (IS_SOL) buildSolenoidScene(scene, color, P);
    else        buildCoilScene(scene, color, P);

    // Gentle orbit
    let raf: number;
    let t = mode === 'theory' ? 0 : Math.PI * 0.15;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      t += 0.004;
      camera.position.x = camBase.x + Math.sin(t) * (IS_SOL ? 0.7 : 0.9);
      camera.position.z = camBase.z + Math.cos(t) * (IS_SOL ? 0.5 : 0.6);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [instType, mode]);

  return <div ref={mountRef} className="w-full h-full" />;
}
