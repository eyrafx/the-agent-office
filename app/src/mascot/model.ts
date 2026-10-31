import * as THREE from 'three';

/** Shoulder (out/down), elbow (curls back up), wrist (curls up strongly). */
export const JOINT_LIMITS = [[-2.4, .3], [-1.2, 1.25], [-1.0, 1.9]] as const;
export interface RobotArm { mount: THREE.Group; joints: [THREE.Group, THREE.Group, THREE.Group]; pad: THREE.Group }
export interface MascotRig { root: THREE.Group; body: THREE.Group; head: THREE.Group; eyes: [THREE.Group, THREE.Group]; arms: RobotArm[] }
/** Tentacles rest spread out and slightly down, their tips curling up. */
export const REST_JOINTS = [-2.0, -.05, 1.55] as const;
export const EYE_BASE = { x: .41, y: -.08 } as const;
/** Shared by the renderer and framing tests so the camera can never drift apart. */
export const MASCOT_VIEW = { position: [-2.3, 2.3, 7] as const, target: [0, 1.4, 0] as const };
export function frameSize(aspect: number): { width: number; height: number } {
  const height = Math.max(4.3, 4.4 / aspect);
  return { width: height * aspect, height };
}

/** Curve of one tentacle segment in the joint's local XY plane: starts along +y and
 *  bends by `bend` toward +x. The next pivot sits at its end. */
const arcPoint = (length: number, bend: number, t: number) => {
  const r = length / bend, a = bend * t;
  return new THREE.Vector3(r * (1 - Math.cos(a)), r * Math.sin(a), 0);
};

/** Rings around a centreline: a soft tube whose radius eases r0 → r1. */
function tube(points: THREE.Vector3[], radiusAt: (t: number) => number, columns = 18): THREE.BufferGeometry {
  const rows = points.length - 1, positions: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const radius = radiusAt(row / rows);
    const tangent = (row < rows ? points[row + 1].clone().sub(points[row]) : points[row].clone().sub(points[row - 1])).normalize();
    const normal = new THREE.Vector3(tangent.y, -tangent.x, 0);
    for (let column = 0; column <= columns; column++) {
      const phi = column / columns * Math.PI * 2;
      positions.push(points[row].x + normal.x * Math.cos(phi) * radius, points[row].y + normal.y * Math.cos(phi) * radius, Math.sin(phi) * radius);
    }
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** A tapered tentacle segment along a gentle arc. */
const tentacleSegment = (length: number, bend: number, r0: number, r1: number) =>
  tube(Array.from({ length: 15 }, (_, i) => arcPoint(length, bend, i / 14)), t => { const e = t * t * (3 - 2 * t); return r0 + (r1 - r0) * e; });

/** The signature curl at a tentacle's tip: a tapering spiral continuing along +y. */
const tipCurl = (r0: number) =>
  tube(Array.from({ length: 22 }, (_, i) => { const t = i / 21, angle = t * 3.4, radius = .13 * (1 - .5 * t); return new THREE.Vector3(radius * (1 - Math.cos(angle)), radius * Math.sin(angle) + .02 * t, 0); }), t => r0 * (1 - .72 * t) + .006, 14);

/** Original soft-bodied cartoon octopus. Every moving part is a named local pivot. */
export function buildMascot(): MascotRig {
  const skin = new THREE.MeshPhysicalMaterial({ color: '#ff5e08', roughness: .38, metalness: 0, clearcoat: .55, clearcoatRoughness: .35, sheen: .2, sheenColor: new THREE.Color('#ffb98a') });
  const belly = new THREE.MeshPhysicalMaterial({ color: '#ffa35e', roughness: .5, metalness: 0, clearcoat: .2, clearcoatRoughness: .6 });
  const sucker = new THREE.MeshStandardMaterial({ color: '#ffd4b2', roughness: .6 });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#fffaf3', roughness: .18, clearcoat: 1, clearcoatRoughness: .1 });
  const pupil = new THREE.MeshPhysicalMaterial({ color: '#15141c', roughness: .25, clearcoat: 1, clearcoatRoughness: .08 });
  const iris = new THREE.MeshPhysicalMaterial({ color: '#2f5aa8', roughness: .3, clearcoat: .8, clearcoatRoughness: .2 });
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const blush = new THREE.MeshStandardMaterial({ color: '#ff8d93', roughness: .7, transparent: true, opacity: .75 });
  const mouth = new THREE.MeshStandardMaterial({ color: '#4a1f12', roughness: .6 });

  const root = new THREE.Group(); root.name = 'AgentOffice_Octopus';
  root.userData = { author: 'AgentOffice', design: 'Original procedural cartoon octopus', license: 'Project asset; no external model or texture' };
  const body = new THREE.Group(); body.name = 'body'; body.position.y = .7; root.add(body);
  const head = new THREE.Group(); head.name = 'head_pitch_yaw'; head.position.y = 1.95; root.add(head);
  const mesh = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) => {
    const item = new THREE.Mesh(geometry, material); item.name = name; item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  };
  const sphere = (name: string, radius: number, parent: THREE.Object3D, material: THREE.Material) => mesh(name, new THREE.SphereGeometry(radius, 40, 28), material, parent);

  // One continuous body: a round head, widest just above the eyes, flowing down
  // into a bell where the tentacles attach. A lathe profile keeps the silhouette
  // seamless (no separate head and crown).
  const profile = [[0, 1.04], [.3, 1.02], [.58, .95], [.82, .8], [.98, .6], [1.06, .34], [1.08, .04], [1.03, -.26], [.93, -.5], [.78, -.68], [.6, -.82], [.4, -.92], [.001, -.96]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(profile, 72);
  // The lathe's poles get averaged (near-zero) normals; give them the axis.
  { const n = lathe.getAttribute('normal'), v = lathe.getAttribute('position'); for (let i = 0; i < n.count; i++) { const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i)); if (l < .5) n.setXYZ(i, 0, Math.sign(v.getY(i)) || 1, 0); else n.setXYZ(i, n.getX(i) / l, n.getY(i) / l, n.getZ(i) / l); } }
  mesh('body_shell', lathe, skin, head);
  void body;
  // Face: big glossy eyes with a highlight, round cheeks and a small smile.
  // Surface depth of the lathe body at (x, y), from the profile radius at that height.
  const radiusAt = (y: number) => { for (let i = 1; i < profile.length; i++) { const a = profile[i - 1], b = profile[i]; if ((y <= a.y && y >= b.y) || (y >= a.y && y <= b.y)) { const t = (y - a.y) / (b.y - a.y || 1); return a.x + (b.x - a.x) * t; } } return .6; };
  const faceZ = (x: number, y: number) => { const r = radiusAt(y); return Math.sqrt(Math.max(0, r * r - x * x)); };
  const eyes = [-1, 1].map(side => {
    const eye = new THREE.Group(); eye.name = side < 0 ? 'eye_left' : 'eye_right';
    eye.position.set(side * EYE_BASE.x, EYE_BASE.y, faceZ(side * EYE_BASE.x, EYE_BASE.y) - .1); head.add(eye);
    sphere('eye_white', .29, eye, eyeWhite);
    const ring = sphere('iris', .18, eye, iris); ring.position.set(side * .015, -.02, .125);
    const dot = sphere('pupil', .105, eye, pupil); dot.position.set(side * .02, -.02, .185);
    const glint = sphere('eye_shine', .055, eye, shine); glint.position.set(.065, .09, .255);
    const glint2 = sphere('eye_shine_small', .025, eye, shine); glint2.position.set(-.045, -.07, .265);
    // A thin brow arc above the eye, slightly raised toward the outside.
    // A soft brow: a shallow arc above the eye, its outer end a touch higher.
    const brow = Array.from({ length: 8 }, (_, i) => { const t = i / 7; return new THREE.Vector3(side * (t - .5) * .3 + side * .03, .4 + .04 * Math.sin(t * Math.PI) + t * .05, .04 - .1 * Math.abs(t - .5)); });
    mesh('brow', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(brow), 16, .015, 8, false), mouth, eye);
    return eye;
  }) as [THREE.Group, THREE.Group];
  for (const side of [-1, 1]) {
    const cheek = sphere(`cheek_${side < 0 ? 'left' : 'right'}`, .12, head, blush); cheek.scale.set(1, .65, .4);
    cheek.position.set(side * .72, -.4, faceZ(side * .72, -.4) - .02);
  }
  const smile = Array.from({ length: 12 }, (_, i) => { const t = i / 11, x = (t - .5) * .22 + .06; return new THREE.Vector3(x, -.5 - .05 * Math.cos((t - .5) * Math.PI), faceZ(x, -.5) + .005); });
  mesh('smile', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(smile), 24, .016, 8, false), mouth, head);

  // Eight tentacles: three soft tapered segments on named pivots, blended with
  // spheres at each pivot so the chain reads as one continuous arm, suckers
  // along the underside, and a curled tip.
  const lengths = [.66, .6, .46], bends = [.3, .55, .8], radii = [.26, .19, .13, .075];
  const segments = [0, 1, 2].map(j => tentacleSegment(lengths[j], bends[j], radii[j], radii[j + 1]));
  const curl = tipCurl(radii[3]);
  const suckerGeometry = new THREE.CylinderGeometry(1, .8, .35, 12);
  const arms: RobotArm[] = [];
  const azimuths = [.05, .8, 1.6, 2.35, 3.15, 3.9, 4.6, 5.55];
  for (let i = 0; i < 8; i++) {
    const angle = azimuths[i];
    const mount = new THREE.Group(); mount.name = `arm_${i + 1}_azimuth`; mount.rotation.y = angle;
    mount.position.set(.5 * Math.cos(angle), .9, -.5 * Math.sin(angle)); root.add(mount);
    const joints = [0, 1, 2].map(j => {
      const pivot = new THREE.Group(); pivot.name = `arm_${i + 1}_${['shoulder', 'elbow', 'wrist'][j]}`; pivot.rotation.z = REST_JOINTS[j]; return pivot;
    }) as RobotArm['joints'];
    mount.add(joints[0]);
    joints[0].add(joints[1]); joints[1].position.copy(arcPoint(lengths[0], bends[0], 1));
    joints[1].add(joints[2]); joints[2].position.copy(arcPoint(lengths[1], bends[1], 1));
    joints.forEach((joint, j) => {
      sphere('joint_blend', radii[j] * .98, joint, skin);
      mesh(`tentacle_segment_${j + 1}`, segments[j], skin, joint);
      // Suckers on the underside (local +x, which faces down when the arm is out).
      for (let k = 0; k < 3; k++) {
        const t = (k + .5) / 3, c = arcPoint(lengths[j], bends[j], t), r = radii[j] + (radii[j + 1] - radii[j]) * t;
        for (const z of [-.45, .45]) {
          const s = mesh('sucker', suckerGeometry, sucker, joint); const size = r * .26;
          s.scale.set(size, size, size); s.position.set(c.x + r * .92, c.y, z * r); s.rotation.z = -Math.PI / 2;
        }
      }
    });
    const pad = new THREE.Group(); pad.name = `arm_${i + 1}_end_pad`; pad.position.copy(arcPoint(lengths[2], bends[2], 1)); pad.rotation.z = -bends[2]; joints[2].add(pad);
    sphere('tip_blend', radii[3] * .98, pad, skin);
    mesh('tip_curl', curl, skin, pad);
    arms.push({ mount, joints, pad });
  }
  return { root, head, body, eyes, arms };
}

/** Geometries/materials are intentionally shared; release each exactly once. */
export function disposeModel(rig: MascotRig): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  rig.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    }
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
}
