'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  aboutAxis, arrowLength, arrowParts, axisField, brightness, cameraDistance, copiesRound, edgeFade, isMarked, linesFor, midPlaneMarks, modelFor, samples,
  startAngle, strongest, VIEW,
  type FieldKind, type Sample,
} from '@/lib/field-geometry';
import { COIL_MODEL, SOLENOID_MODEL } from '@/lib/field-model';
import { prefersReducedMotion } from '@/lib/motion';
import type { FieldViewProps } from './FieldViz';

// The field model in three dimensions. Nothing here is drawn by eye: the lines
// are the model's own (lib/field-model.ts), each turned about the axis, and
// shaded by the size of the field along them. Lengths are in cm, x along the
// axis, and the current runs counterclockwise seen from +x, so the field
// points along +x through the winding.

const GREEN = new THREE.Color('#c8ff00');
const CYAN = 0x22d3ee;
const WIRE = 0x9ca3af;
const CURRENT = 0xffffff;
const FOV = 36;

// Sizes that depend on the scale of the thing drawn, cm.
const LOOK: Record<FieldKind, {
  /**
   * What the camera keeps in the picture however it is turned: the axis out to
   * ±z (for the solenoid, the whole of the probe's travel), and a ring of
   * radius rho round each end of the winding.
   */
  view: { z: number; rho: number };
  /** Where the camera starts (radians), and how far it sways either side of where it was left. */
  bearing: { azimuth: number; elevation: number };
  sway: number;
  cone: [radius: number, height: number];
  dash: [dash: number, gap: number];
  /** How fast the dashes run along the lines, cm/s. They only show direction. */
  flow: number;
  probe: number;
  shaft: number;
}> = {
  coil: {
    view: { z: 3.3, rho: 2.6 }, bearing: { azimuth: 0.6, elevation: 0.32 }, sway: 0.3,
    cone: [0.05, 0.16], dash: [0.13, 0.36], flow: 0.45, probe: 0.085, shaft: 0.034,
  },
  // Seen more from the side than the coil: its panel is wide and low, and the
  // probe travels 10 cm either way along the axis.
  solenoid: {
    view: { z: 10.5, rho: 3.2 }, bearing: { azimuth: 0.4, elevation: 0.24 }, sway: 0.22,
    cone: [0.12, 0.38], dash: [0.32, 0.86], flow: 1.1, probe: 0.2, shaft: 0.075,
  },
};

/** The points the camera keeps in the picture (see LOOK.view). */
function inView(kind: FieldKind): Array<[number, number, number]> {
  const { view } = LOOK[kind];
  const { halfLength } = modelFor(kind);
  const points: Array<[number, number, number]> = [[-view.z, 0, 0], [view.z, 0, 0]];
  for (const end of halfLength > 0 ? [-halfLength, halfLength] : [0]) {
    for (let i = 0; i < 16; i++) points.push(aboutAxis({ z: end, rho: view.rho }, (2 * Math.PI * i) / 16));
  }
  return points;
}

// A line is dimmest at this share of its colour and brightest at all of it,
// for the strongest field in the drawing (`top`).
const shade = (b: number, top: number) => 0.14 + 0.86 * brightness(b, top);
// A line next to the dashes that run along it: they are about a third brighter
// than it, as in the section.
const SOLID = 1 / 1.35;
// Lines that leave the traced region fade out over this share of its radius.
const FADE = 0.2;

/**
 * An arrow along +x made of a rod and a cone, whose length can be set. It is
 * drawn over everything else: it is the reading, and must not be lost among
 * the lines.
 */
function makeArrow(color: number, shaft: number, y: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const headLength = shaft * 6.5;
  // Both are built along +y; turned a quarter turn they lie along +x.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(shaft, shaft, 1, 10), material);
  const head = new THREE.Mesh(new THREE.ConeGeometry(shaft * 2.6, headLength, 14), material);
  body.rotation.z = head.rotation.z = -Math.PI / 2;
  body.renderOrder = head.renderOrder = 10;
  group.add(body, head);
  group.position.y = y;
  return {
    group,
    /** `length` in cm; negative points the arrow back along the axis. */
    set(x: number, length: number) {
      const size = Math.abs(length);
      // A short arrow keeps its true length: the head shrinks to fit it.
      const parts = arrowParts(size, headLength);
      group.visible = size > 0;
      body.visible = parts.shaft > 0;
      body.scale.y = Math.max(parts.shaft, 1e-4);
      body.position.x = parts.shaft / 2;
      head.scale.setScalar(Math.max(parts.head / headLength, 1e-4));
      head.position.x = size - parts.head / 2;
      group.position.x = x;
      group.rotation.y = length < 0 ? Math.PI : 0;
    },
  };
}

function cone(at: [number, number, number], direction: THREE.Vector3, [radius, height]: [number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 10), material);
  mesh.position.set(...at);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

type Built = {
  scene: THREE.Scene;
  /** The dashed copies of the lines, with the distances their dashes are laid out by. */
  flows: Array<{ attribute: THREE.BufferAttribute; base: Float32Array }>;
  probe: THREE.Mesh;
  theory: ReturnType<typeof makeArrow>;
  measured: ReturnType<typeof makeArrow>;
};

function build(kind: FieldKind, turns: number, still: boolean): Built {
  const scene = new THREE.Scene();
  const look = LOOK[kind];
  const flows: Built['flows'] = [];

  // Every line is drawn solid, and once more as dashes that run along it to
  // show which way the field points. Both carry the field's size as colour,
  // and neither is see-through except where a line fades out at the edge of
  // the traced region: where two lines meet on screen one simply covers the
  // other, and nothing adds up to a brightness the field does not have.
  const top = strongest(kind);
  const { frame } = modelFor(kind);
  const solid = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, color: still ? 0xffffff : new THREE.Color(SOLID, SOLID, SOLID) });
  const dashed = new THREE.LineDashedMaterial({ vertexColors: true, transparent: true, depthWrite: false, dashSize: look.dash[0], gapSize: look.dash[1] });
  const coneMaterials = new Map<number, THREE.MeshBasicMaterial>();
  const coneMaterial = (b: number) => {
    const key = Math.round(shade(b, top) * 10);
    if (!coneMaterials.has(key)) coneMaterials.set(key, new THREE.MeshBasicMaterial({ color: GREEN.clone().multiplyScalar(key / 10) }));
    return coneMaterials.get(key)!;
  };

  linesFor(kind, turns).forEach((line, index) => {
    const pts: Sample[] = samples(line);
    const copies = copiesRound(line.rho0, VIEW[kind].perCm);
    const count = pts.length + (line.closed ? 1 : 0);
    const marks = isMarked(kind, line.level) ? midPlaneMarks(pts, line.closed) : [];
    // Arrowheads on about three copies of a line; on every copy they would
    // hide the winding behind a cloud of them.
    const everyNth = Math.ceil(copies / 3);

    for (let k = 0; k < copies; k++) {
      const angle = startAngle(index) + (2 * Math.PI * k) / copies;
      const position = new Float32Array(count * 3);
      const color = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const p = pts[i % pts.length];
        position.set(aboutAxis(p, angle), i * 3);
        const c = shade(p.b, top);
        // A line that closes never reaches the edge; one that does not goes on
        // beyond it, and fades out there instead of stopping in mid-air.
        color.set([GREEN.r * c, GREEN.g * c, GREEN.b * c, line.closed ? 1 : edgeFade(p, frame, FADE * frame.rho)], i * 4);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 4));
      scene.add(new THREE.Line(geometry, solid));
      if (!still) {
        const flow = new THREE.Line(geometry, dashed);
        flow.renderOrder = 1;
        flow.computeLineDistances();
        const attribute = geometry.getAttribute('lineDistance') as THREE.BufferAttribute;
        flows.push({ attribute, base: Float32Array.from(attribute.array as Float32Array) });
        scene.add(flow);
      }

      if (k % everyNth !== 0) continue;
      for (const mark of marks) {
        const along = new THREE.Vector3(Math.cos(mark.angle), Math.sin(mark.angle) * Math.cos(angle), Math.sin(mark.angle) * Math.sin(angle));
        scene.add(cone(aboutAxis(mark, angle), along, look.cone, coneMaterial(mark.b)));
      }
    }
  });
  for (const share of [-0.82, -0.42, 0.42, 0.82]) {
    const z = share * look.view.z;
    scene.add(cone([z, 0, 0], new THREE.Vector3(1, 0, 0), look.cone, coneMaterial(axisField(kind, z))));
  }

  // The winding, with a few cones on it for the way the current runs.
  const wire = new THREE.MeshBasicMaterial({ color: WIRE });
  const currentMaterial = new THREE.MeshBasicMaterial({ color: CURRENT });
  const current = (x: number, radius: number, angle: number) =>
    cone([x, radius * Math.cos(angle), radius * Math.sin(angle)], new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle)), [look.cone[0] * 1.5, look.cone[1] * 1.5], currentMaterial);
  if (kind === 'coil') {
    const radius = COIL_MODEL.radius;
    const tube = 0.04;
    for (let i = 0; i < turns; i++) {
      // The turns lie side by side; the model takes them as one loop.
      const x = (i - (turns - 1) / 2) * tube * 2.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 96), wire);
      ring.rotation.y = Math.PI / 2;
      ring.position.x = x;
      scene.add(ring);
    }
    for (const angle of [0.6, 0.6 + Math.PI / 2, 0.6 + Math.PI, 0.6 + (3 * Math.PI) / 2]) scene.add(current(0, radius, angle));
  } else {
    const { radius, halfLength } = SOLENOID_MODEL;
    const TURNS = 100;
    const STEPS = TURNS * 28;
    const helix: THREE.Vector3[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      helix.push(new THREE.Vector3(...aboutAxis({ z: -halfLength + 2 * halfLength * t, rho: radius }, 2 * Math.PI * TURNS * t)));
    }
    // Faint, or a hundred turns would wall off the field inside them. The two
    // end turns are drawn again, plainly, so the winding keeps its outline.
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(helix), new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.2, depthWrite: false })));
    for (const end of [-halfLength, halfLength]) {
      const rim: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) rim.push(new THREE.Vector3(...aboutAxis({ z: end, rho: radius }, (2 * Math.PI * i) / 96)));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color: WIRE, transparent: true, opacity: 0.8, depthWrite: false })));
    }
    for (const [share, angle] of [[-0.75, 0.5], [-0.25, 2.1], [0.25, 3.7], [0.75, 5.3]]) scene.add(current(share * halfLength, radius, angle));

    // One mark per centimetre of the probe's travel.
    const ticks = new Float32Array(21 * 3);
    for (let i = 0; i < 21; i++) ticks[i * 3] = i - 10;
    const tickGeometry = new THREE.BufferGeometry();
    tickGeometry.setAttribute('position', new THREE.BufferAttribute(ticks, 3));
    scene.add(new THREE.Points(tickGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, transparent: true, opacity: 0.5 })));
  }

  // The probe, and the field at it: from theory above the axis, from the
  // sensor below it.
  const probe = new THREE.Mesh(new THREE.SphereGeometry(look.probe, 20, 14), new THREE.MeshBasicMaterial({ color: CYAN, depthTest: false }));
  probe.renderOrder = 11;
  const theory = makeArrow(GREEN.getHex(), look.shaft, look.probe * 1.9);
  const measured = makeArrow(CYAN, look.shaft, -look.probe * 1.9);
  scene.add(probe, theory.group, measured.group);

  return { scene, flows, probe, theory, measured };
}

function dispose(scene: THREE.Scene) {
  scene.traverse(object => {
    const { geometry, material } = object as THREE.Mesh;
    geometry?.dispose();
    for (const m of Array.isArray(material) ? material : [material]) m?.dispose();
  });
}

type Readings = Pick<FieldViewProps, 'zCm' | 'bTheory' | 'bMeasured' | 'bPeak'>;
type Stage = {
  /** Draws into a box of this size from now on. */
  fit(width: number, height: number): void;
  /** Stops drawing and gives the canvas and its WebGL context back. */
  close(): void;
};

/**
 * Puts the model on a canvas inside `el` and keeps it drawn. `live` holds what
 * the probe reads now, picked up frame by frame without the scene being
 * rebuilt. Null when this machine cannot start WebGL.
 */
function openStage(el: HTMLElement, kind: FieldKind, turns: number, live: { current: Readings }): Stage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.cursor = 'grab';
  // Dragging sideways turns the model; dragging up and down is left to the page.
  canvas.style.touchAction = 'pan-y';
  el.appendChild(canvas);

  const still = prefersReducedMotion();
  const look = LOOK[kind];
  const { scene, flows, probe, theory, measured } = build(kind, turns, still);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 400);
  const period = look.dash[0] + look.dash[1];

  // Where the camera sits round the model, and a slow sway while nobody is
  // holding it.
  const view = { ...look.bearing, distance: 10, sway: 0, swayPhase: 0, held: false, lastX: 0, lastY: 0, idleSince: 0 };
  const swayOffset = () => view.sway * look.sway * Math.sin(view.swayPhase);

  // How far back the camera has to be for the winding and the probe's whole
  // travel to stay in the picture, turned as it is. It is worked out for both
  // ends of the sway as well, so the camera does not creep in and out with it.
  const kept = inView(kind);
  const angle = { tanV: 1, tanH: 1 };
  const reach = () => Math.max(1, ...(still ? [0] : [-look.sway, 0, look.sway]).map(turned =>
    cameraDistance(kept, { azimuth: view.azimuth + turned, elevation: view.elevation }, angle.tanV, angle.tanH)));
  // Set when the box changes size: the camera then goes straight to its place.
  let snap = true;
  const place = () => {
    const azimuth = view.azimuth + swayOffset();
    camera.position.set(
      view.distance * Math.sin(azimuth) * Math.cos(view.elevation),
      view.distance * Math.sin(view.elevation),
      view.distance * Math.cos(azimuth) * Math.cos(view.elevation),
    );
    camera.lookAt(0, 0, 0);
  };
  // Taking hold of the model keeps it where the sway had carried it.
  const hold = () => { view.azimuth += swayOffset(); view.sway = 0; view.held = true; };
  const release = () => { view.held = false; view.idleSince = performance.now(); };
  const turn = (dAzimuth: number, dElevation: number) => {
    view.azimuth += dAzimuth;
    view.elevation = Math.min(1.3, Math.max(-1.3, view.elevation + dElevation));
  };

  const onDown = (e: PointerEvent) => {
    hold();
    view.lastX = e.clientX;
    view.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    if (!view.held) return;
    turn(-(e.clientX - view.lastX) * 0.008, (e.clientY - view.lastY) * 0.006);
    view.lastX = e.clientX;
    view.lastY = e.clientY;
  };
  const onUp = () => { release(); canvas.style.cursor = 'grab'; };
  const KEYS: Record<string, [number, number]> = { ArrowLeft: [0.15, 0], ArrowRight: [-0.15, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
  const onKey = (e: KeyboardEvent) => {
    const step = KEYS[e.key];
    if (!step) return;
    e.preventDefault();
    hold();
    turn(step[0], step[1]);
    release();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  el.addEventListener('keydown', onKey);

  let probeX = live.current.zCm;
  let offset = 0;
  let last = performance.now();
  let frame = 0;
  let running = false;

  const tick = (now: number) => {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (!still) {
      // The sway comes back gently a few seconds after the model is let go.
      const idle = !view.held && now - view.idleSince > 2500;
      view.sway += ((idle ? 1 : 0) - view.sway) * Math.min(1, dt * 1.5);
      view.swayPhase += dt * 0.35;

      // The dashes move along the lines by sliding the distances they are
      // laid out by.
      offset = (offset + look.flow * dt) % period;
      for (const { attribute, base } of flows) {
        const distances = attribute.array as Float32Array;
        for (let i = 0; i < distances.length; i++) distances[i] = base[i] - offset;
        attribute.needsUpdate = true;
      }
    }

    const { zCm, bTheory, bMeasured, bPeak } = live.current;
    probeX += (zCm - probeX) * (still ? 1 : Math.min(1, dt * 7));
    probe.position.x = probeX;
    theory.set(probeX, arrowLength(bTheory, bPeak, VIEW[kind].arrow));
    measured.set(probeX, arrowLength(bMeasured, bPeak, VIEW[kind].arrow));

    // Turned end-on, the near end of the axis comes toward the camera: it
    // backs off, gently, rather than let the probe leave the picture.
    const far = reach();
    view.distance = snap ? far : view.distance + (far - view.distance) * Math.min(1, dt * 5);
    snap = false;

    place();
    renderer.render(scene, camera);
  };

  return {
    fit(width, height) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // A little inside the edge of the picture, not on it. No haze with
      // distance either, so depth does not dim a line: its brightness is the
      // field's, and the slow sway is what gives the model its depth.
      angle.tanV = 0.94 * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      angle.tanH = angle.tanV * camera.aspect;
      snap = true;
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    },
    close() {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      el.removeEventListener('keydown', onKey);
      dispose(scene);
      renderer.dispose();
      if (el.contains(canvas)) el.removeChild(canvas);
    },
  };
}

export default function FieldView3D({ kind, turns, zCm, bTheory, bMeasured, bPeak }: FieldViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const live = useRef<Readings>({ zCm, bTheory, bMeasured, bPeak });
  useEffect(() => { live.current = { zCm, bTheory, bMeasured, bPeak }; }, [zCm, bTheory, bMeasured, bPeak]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let stage: Stage | null = null;
    let gone = false;

    // The lab room keeps two layouts mounted and hides one: nothing is built
    // while this one has no size, and what was built is given back when it
    // loses its size (a browser allows only so many WebGL contexts).
    const fit = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (!width || !height) {
        stage?.close();
        stage = null;
        return;
      }
      if (!stage) {
        stage = openStage(el, kind, turns, live);
        if (!stage) {
          // No WebGL on this machine: the section is still there to switch back to.
          observer?.disconnect();
          queueMicrotask(() => { if (!gone) setFailed(true); });
          return;
        }
      }
      stage.fit(width, height);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);

    observer?.observe(el);
    fit();
    return () => {
      gone = true;
      observer?.disconnect();
      stage?.close();
    };
  }, [kind, turns]);

  if (failed) {
    return (
      <p role="status" className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-gray-400">
        เครื่องนี้แสดงมุมมอง 3D ไม่ได้ สลับกลับไปที่ 2D เพื่อดูแบบจำลอง
      </p>
    );
  }
  return (
    <div
      ref={mountRef}
      tabIndex={0}
      role="img"
      aria-label={`แบบจำลองสนามแม่เหล็กสามมิติของ${kind === 'coil' ? `ขดลวดเดี่ยว ${turns} รอบ` : 'โซลีนอยด์'} ลากหรือกดปุ่มลูกศรเพื่อหมุน`}
      className="h-full w-full rounded-b-xl focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cyan-400"
    />
  );
}
