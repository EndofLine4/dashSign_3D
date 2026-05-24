// =============================================================
// car.js
// Builds the player's car from Three.js box geometries —
// no external 3D model file needed. Handles left/right
// steering, boundary clamping, and a gentle tilt on turns.
// Also exports the camera follow function so main.js can
// keep the camera locked behind the car as it steers.
// =============================================================

import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────
const CAR_SPEED    = 0.1;   // lateral movement per frame in 3D units
const BOUNDARY_X   = 5;     // max distance left or right from center
const TILT_AMOUNT  = 0.06;  // radians the car tilts when turning
const CAM_LAG      = 0.07;  // how quickly the camera catches up (0=instant, 1=never)
const CAM_OFFSET_Y = 4.5;   // camera height above road
const CAM_OFFSET_Z = 11;    // camera distance behind car


// =============================================================
// createCar
// Assembles a car group from three box meshes:
//   body       — the main hull
//   roof       — sits on top of the body
//   windshield — semi-transparent glass at the front
// Returns the Group so main.js can pass it to updateCar.
// =============================================================
export function createCar(scene) {
  const group = new THREE.Group();

  // Materials
  const bodyMat  = new THREE.MeshLambertMaterial({ color: 0x1a6fbd });
  const roofMat  = new THREE.MeshLambertMaterial({ color: 0x145291 });
  const glassMat = new THREE.MeshLambertMaterial({
    color: 0x7ec8e3,
    transparent: true,
    opacity: 0.65
  });
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });

  // Body — the main horizontal hull
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 4.2), bodyMat);
  body.position.y = 0.38;
  body.castShadow = true;

  // Roof — smaller box sitting centered on top of body
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.4), roofMat);
  roof.position.set(0, 1.1, -0.2);
  roof.castShadow = true;

  // Windshield — thin glass panel at the front of the roof
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.58, 0.12), glassMat);
  windshield.position.set(0, 0.95, 0.95);

  // Four wheels — cylinders rotated 90° to lie flat
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  const wheelPositions = [
    [-1.2, 0.38, 1.4],   // front-left
    [ 1.2, 0.38, 1.4],   // front-right
    [-1.2, 0.38, -1.6],  // rear-left
    [ 1.2, 0.38, -1.6]   // rear-right
  ];
  wheelPositions.forEach(function(pos) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2; // lay the cylinder on its side
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    group.add(wheel);
  });

  group.add(body, roof, windshield);

  // Start position: center of road, slightly in front of camera
  group.position.set(0, 0, 7);
  scene.add(group);

  return group;
}


// =============================================================
// updateCar
// Called every frame. Reads the keys object and moves the car
// left or right. Clamps position to road boundaries.
// Applies a small Z-rotation tilt for visual feedback.
// =============================================================
export function updateCar(carGroup, keys, isStuck) {
  // Car doesn't move while a popup challenge is active
  if (isStuck) {
    carGroup.rotation.z = 0;
    return;
  }

  if (keys['ArrowLeft'])  carGroup.position.x -= CAR_SPEED;
  if (keys['ArrowRight']) carGroup.position.x += CAR_SPEED;

  // Keep car within road edges
  carGroup.position.x = Math.max(-BOUNDARY_X, Math.min(BOUNDARY_X, carGroup.position.x));

  // Tilt into the turn for visual feel — reset when not turning
  if (keys['ArrowLeft'])       carGroup.rotation.z =  TILT_AMOUNT;
  else if (keys['ArrowRight']) carGroup.rotation.z = -TILT_AMOUNT;
  else                         carGroup.rotation.z =  0;
}


// =============================================================
// updateCamera
// Smoothly follows the car's X position using linear
// interpolation (lerp). The camera never snaps — it drifts
// toward the car's position at CAM_LAG speed each frame.
// Called from main.js after updateCar each frame.
// =============================================================
export function updateCamera(camera, carGroup) {
  // Target X is dampened — camera swings less than the car moves
  const targetX = carGroup.position.x * 0.45;

  // Lerp: move CAM_LAG fraction of the remaining gap each frame
  camera.position.x += (targetX - camera.position.x) * CAM_LAG;
  camera.position.y  = CAM_OFFSET_Y;
  camera.position.z  = carGroup.position.z + CAM_OFFSET_Z;

  // Always look slightly ahead of the car
  camera.lookAt(carGroup.position.x * 0.3, 0.5, carGroup.position.z - 5);
}
