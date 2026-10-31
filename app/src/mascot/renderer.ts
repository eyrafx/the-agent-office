import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MascotState } from '../shared/contract';
import { buildMascot, disposeModel, frameSize, MASCOT_VIEW } from './model';
import { MascotMotion } from './motion';
import { createStillMascot } from './still';

export interface MascotController {
  setState(state: MascotState): void;
  setPointer(x: number, y: number): void;
  setVisible(visible: boolean): void;
  setReducedMotion(reduced: boolean): void;
  /** The island opened or closed (only the product mascot reacts). */
  setOpen?(open: boolean): void;
  dispose(): void;
}

const stateLabels: Record<MascotState, string> = { idle: 'Hazır', working: 'Çalışıyor', waiting: 'Yanıt bekliyor', replyEnded: 'Yanıt tamamlandı', error: 'Dikkat gerekiyor', resting: 'Dinleniyor', dragged: 'Taşınıyor' };

/** Product mascot: the approved picture, sharp, blinking and now and then waving (see still.ts). The
 *  procedural WebGL rig stays available for the studio (`engine: 'webgl'`) and as the base for exports. */
export function createMascot(element: HTMLElement, options: { compact?: boolean; reducedMotion?: boolean; engine?: 'sprite' | 'webgl' } = {}): MascotController {
  if ((options.engine ?? 'sprite') === 'sprite') return createStillMascot(element, options.reducedMotion);
  let renderer: THREE.WebGLRenderer;
  let state: MascotState = 'idle';
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    const fallback = document.createElement('div'); fallback.className = 'mascot-fallback';
    fallback.setAttribute('role', 'img'); fallback.setAttribute('aria-label', 'Robot maskot — 3B görünüm kullanılamıyor');
    fallback.style.cssText = 'display:grid;place-content:center;text-align:center;gap:6px;width:100%;height:100%;color:#ff9b42;font:12px system-ui;padding:12px;box-sizing:border-box';
    const icon = document.createElement('span'); icon.textContent = '◉ ◉'; icon.style.cssText = 'font-size:28px;border:2px solid #ff8b28;border-radius:20px;background:#12171c;padding:12px';
    const label = document.createElement('span'); label.textContent = '3B görünüm kullanılamıyor';
    const status = document.createElement('span'); status.textContent = stateLabels.idle;
    fallback.append(icon, label, status); element.append(fallback);
    return { setState(next) { state = next; status.textContent = stateLabels[next]; }, setPointer() {}, setVisible(visible) { fallback.hidden = !visible; }, setReducedMotion() {}, dispose() { fallback.remove(); } };
  }
  // Compact mascots are shown scaled down by CSS; rendering at the full device
  // ratio keeps them crisp instead of upscaled.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .97;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:inherit';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `AgentOffice robot — ${stateLabels[state]}`);
  element.append(canvas);
  const scene = new THREE.Scene();
  const rig = buildMascot(); scene.add(rig.root);
  const motion = new MascotMotion(rig);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  camera.position.set(...MASCOT_VIEW.position); camera.lookAt(...MASCOT_VIEW.target);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .06); scene.environment = environment.texture; scene.environmentIntensity = .55;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#e5efff', '#76543a', 1.1));
  const key = new THREE.DirectionalLight('#fff0d8', 2.4); key.position.set(-3, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe4ff', 2); rim.position.set(4, 3, -4); scene.add(rim);
  // Local radial contact shadow is stable and soft even at compact notch sizes.
  const shadowData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
    shadowData[(y * 64 + x) * 4 + 3] = Math.round(Math.max(0, 1 - radius) ** 2 * 120);
  }
  const shadowTexture = new THREE.DataTexture(shadowData, 64, 64); shadowTexture.needsUpdate = true;
  const floorGeometry = new THREE.PlaneGeometry(4.8, 4.8); const floorMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = .1; floor.receiveShadow = true; scene.add(floor);
  let visible = true, reduced = options.reducedMotion ?? false, disposed = false, frame = 0, lastTime = 0;
  let width = 0, height = 0;
  const canDraw = () => !disposed && visible && !document.hidden && width > 0 && height > 0;
  const draw = () => { if (canDraw()) renderer.render(scene, camera); };
  const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; lastTime = 0; };
  const tick = (now: number) => {
    frame = 0;
    if (!canDraw() || reduced) return;
    // Cap at 30 Hz: a small desktop companion must not monopolize the GPU.
    if (!lastTime || now - lastTime >= 1000 / 30 - .5) {
      motion.update(lastTime ? (now - lastTime) / 1000 : 1 / 30); lastTime = now; draw();
    }
    frame = requestAnimationFrame(tick);
  };
  const refresh = () => {
    if (!canDraw()) { stop(); return; }
    if (reduced) { stop(); motion.update(0, true); draw(); }
    else if (!frame) frame = requestAnimationFrame(tick);
  };
  const resize = () => {
    if (disposed) return;
    // Layout size, not the bounding rect: a CSS transform on the element must
    // not shrink the canvas it is drawn into.
    width = Math.round(element.offsetWidth); height = Math.round(element.offsetHeight);
    if (width && height) {
      renderer.setSize(width, height, false);
      const { width: viewWidth, height: viewHeight } = frameSize(width / height);
      camera.left = -viewWidth / 2; camera.right = viewWidth / 2; camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
    }
    refresh();
  };
  const observer = new ResizeObserver(resize); observer.observe(element);
  const onVisibility = () => refresh(); document.addEventListener('visibilitychange', onVisibility);
  const onContextLost = (event: Event) => { event.preventDefault(); visible = false; stop(); canvas.setAttribute('aria-label', '3B görünüm duraklatıldı'); };
  const onContextRestored = () => { visible = true; refresh(); };
  canvas.addEventListener('webglcontextlost', onContextLost); canvas.addEventListener('webglcontextrestored', onContextRestored);
  resize();
  return {
    setState(next) { if (disposed) return; state = next; motion.setState(next); canvas.setAttribute('aria-label', `AgentOffice robot — ${stateLabels[next]}`); refresh(); },
    setPointer(x, y) { if (disposed) return; motion.setPointer(x, y); if (reduced) refresh(); },
    setVisible(next) { if (disposed) return; visible = next; canvas.style.visibility = next ? 'visible' : 'hidden'; refresh(); },
    setReducedMotion(next) { if (disposed) return; reduced = next; refresh(); },
    dispose() {
      if (disposed) return; disposed = true; stop(); observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost); canvas.removeEventListener('webglcontextrestored', onContextRestored);
      disposeModel(rig); floorGeometry.dispose(); floorMaterial.dispose(); shadowTexture.dispose(); environment.dispose();
      scene.clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
