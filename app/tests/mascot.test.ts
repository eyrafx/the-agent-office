import { describe, expect, it } from 'vitest';
import { Mesh, OrthographicCamera, Vector3 } from 'three';
import { buildMascot, JOINT_LIMITS, disposeModel, frameSize, MASCOT_VIEW } from '../src/mascot/model';
import { MascotMotion } from '../src/mascot/motion';
import type { MascotState } from '../src/shared/contract';

describe('articulated robot', () => {
  it('has eight independently articulated chains whose distal pads follow each pivot', () => {
    const rig = buildMascot();
    expect(rig.arms).toHaveLength(8);
    for (const arm of rig.arms) {
      expect(arm.joints).toHaveLength(3);
      expect(arm.joints[1].parent).toBe(arm.joints[0]);
      expect(arm.joints[2].parent).toBe(arm.joints[1]);
      for (const joint of arm.joints) {
        rig.root.updateMatrixWorld(true);
        const before = arm.pad.getWorldPosition(new Vector3());
        joint.rotation.z += .2;
        rig.root.updateMatrixWorld(true);
        expect(arm.pad.getWorldPosition(new Vector3()).distanceTo(before)).toBeGreaterThan(.03);
        joint.rotation.z -= .2;
      }
    }
    const bodyRotation = rig.body.rotation.clone();
    rig.head.rotation.y = .3;
    rig.eyes[0].scale.y = .1;
    expect(rig.body.rotation.equals(bodyRotation)).toBe(true);
    expect(rig.eyes[1].scale.y).toBe(1);
    disposeModel(rig);
  });

  it('blends state changes without jumps and respects limits across every mode', () => {
    const rig = buildMascot(); const motion = new MascotMotion(rig);
    const states: MascotState[] = ['working', 'waiting', 'replyEnded', 'error', 'resting', 'dragged', 'idle'];
    for (const state of states) {
      const before = rig.arms[0].joints[0].rotation.z;
      motion.setState(state);
      expect(rig.arms[0].joints[0].rotation.z).toBe(before);
      for (let frame = 0; frame < 240; frame++) {
        motion.update(1 / 60);
        rig.arms.forEach(arm => arm.joints.forEach((joint, index) => {
          expect(joint.rotation.z).toBeGreaterThanOrEqual(JOINT_LIMITS[index][0]);
          expect(joint.rotation.z).toBeLessThanOrEqual(JOINT_LIMITS[index][1]);
          expect(Number.isFinite(joint.rotation.z)).toBe(true);
        }));
      }
    }
    disposeModel(rig);
  });

  it('raises the signal arm while waiting and recovers after dragging', () => {
    const rig = buildMascot(); const motion = new MascotMotion(rig);
    const initial = rig.arms[0].joints[0].rotation.z;
    motion.setState('waiting'); for (let i = 0; i < 120; i++) motion.update(1 / 60);
    expect(rig.arms[0].joints[0].rotation.z).toBeGreaterThan(initial + .5);
    motion.setState('dragged'); for (let i = 0; i < 60; i++) motion.update(1 / 60);
    expect(Math.abs(rig.root.rotation.z)).toBeGreaterThan(.04);
    motion.setState('idle'); for (let i = 0; i < 300; i++) motion.update(1 / 60);
    expect(Math.abs(rig.root.rotation.z)).toBeLessThan(.025);
    disposeModel(rig);
  });

  it('clamps pointer input and freezes meaningful reduced-motion poses', () => {
    const rig = buildMascot(); const motion = new MascotMotion(rig);
    motion.setPointer(300, -200);
    motion.setState('waiting'); motion.update(0, true);
    expect(rig.head.rotation.y).toBeGreaterThan(0);
    expect(rig.head.rotation.y).toBeLessThan(.3);
    const first = rig.arms[0].joints.map(j => j.rotation.z);
    motion.update(15, true);
    expect(rig.arms[0].joints.map(j => j.rotation.z)).toEqual(first);
    motion.setPointer(Number.NaN, Number.POSITIVE_INFINITY); motion.update(0, true);
    expect(Number.isFinite(rig.head.rotation.y)).toBe(true);
    disposeModel(rig);
  });

  it('keeps every state inside the normal and compact camera frame', () => {
    const rig = buildMascot(); const motion = new MascotMotion(rig);
    for (const aspect of [240 / 260, 84 / 76]) {
      const { width, height } = frameSize(aspect);
      const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, .1, 30);
      camera.position.set(...MASCOT_VIEW.position); camera.lookAt(...MASCOT_VIEW.target); camera.updateMatrixWorld();
      for (const state of ['idle', 'working', 'waiting', 'replyEnded', 'error', 'resting', 'dragged'] as MascotState[]) {
        motion.setState(state); motion.update(0, true);
        rig.root.updateMatrixWorld(true);
        let maxX = 0, maxY = 0;
        const point = new Vector3();
        rig.root.traverse(object => {
          if (!(object instanceof Mesh)) return;
          const positions = object.geometry.getAttribute('position');
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
            maxX = Math.max(maxX, Math.abs(point.x)); maxY = Math.max(maxY, Math.abs(point.y));
          }
        });
        expect(maxX, `${state} horizontal framing`).toBeLessThan(1);
        expect(maxY, `${state} vertical framing`).toBeLessThan(1);
      }
    }
    disposeModel(rig);
  });

  it('exports finite unit surface normals without invisible zero-normal vertices', () => {
    const rig = buildMascot(); let minimum = Infinity, maximum = 0;
    rig.root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const normals = object.geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) {
        const length = new Vector3().fromBufferAttribute(normals, i).length();
        minimum = Math.min(minimum, length); maximum = Math.max(maximum, length);
      }
    });
    expect(minimum).toBeGreaterThan(.999);
    expect(maximum).toBeLessThan(1.001);
    disposeModel(rig);
  });
});
