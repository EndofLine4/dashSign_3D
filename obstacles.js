// =============================================================
// obstacles.js
// Defines every obstacle type, handles spawning one obstacle
// at a time, scrolls it toward the car, checks collision,
// and draws type-specific 3D meshes (mud patch, snow bank,
// cones, barricade, toll booth with animated gate).
//
// The OBSTACLE_TYPES array is the single source of truth for
// all obstacle data — add new rows here to expand the game.
// =============================================================

import * as THREE from 'three';

// ── Constants ──────────────────────────────────────────────
const SPAWN_Z          = -65;  // how far ahead obstacles spawn
const DESPAWN_Z        =  18;  // how far past camera before removed
const CHALLENGE_ZONE_Z =  4;   // Z position that triggers popup challenge
const LANE_PROMPT_Z    =  2;   // Z position that triggers lane dodge prompt

// ── Obstacle type definitions ───────────────────────────────
// Each entry describes one obstacle type. The game loop reads
// these to know what popup to show and what gesture to expect.
// mechanic options:
//   'choice'  — player presses S/G/P key to pick correct sign
//   'signIt'  — player signs a word to camera to clear obstacle
//   'avoid'   — no popup, player must steer around it
export const OBSTACLE_TYPES = [
  {
    id: 'mud',
    label: 'MUD',
    color: 0x7a5c2e,
    mechanic: 'choice',
    prompt: 'Pick GO.',
    correctKey: 'g',
    // Signs shown in choice popup — no word labels, just images
    signs: {
      s: 'signs/sign_stop.png',
      g: 'signs/sign_go.png',
      p: 'signs/sign_park.png'
    }
  },
  {
    id: 'snow',
    label: 'SNOW',
    color: 0xb8e4f5,
    mechanic: 'signIt',
    prompt: 'Sign SNOW to get unstuck.',
    signImage: 'signs/sign_snow.png',
    gesture: 'snow'
  },
  {
    id: 'cones',
    label: 'CONES',
    color: 0xff7a00,
    mechanic: 'signIt',
    prompt: 'Sign HELP.',
    signImage: 'signs/sign_help.png',
    gesture: 'help',
    w: 5, h: 0.1, d: 1.5  // wide but flat — cones drawn separately
  },
  {
    id: 'barricade',
    label: 'BARRIER',
    color: 0xe14d2a,
    mechanic: 'avoid',
    w: 6, h: 1.2, d: 0.4
  },
  {
    id: 'tollOpen',
    label: 'TOLL',
    color: 0xf5c842,
    mechanic: 'signIt',
    prompt: 'Sign OPEN to raise the gate!',
    signImage: 'signs/sign_open.png',
    gesture: 'open'
  },
  {
    id: 'tollClose',
    label: 'TOLL',
    color: 0xf5c842,
    mechanic: 'signIt',
    prompt: 'Sign CLOSE as you pass through.',
    signImage: 'signs/sign_close.png',
    gesture: 'close'
  }
];

// ── Module-level state ──────────────────────────────────────
// Only one obstacle exists on screen at a time.
// activeObstacleMesh: the Three.js Group in the scene
// activeObstacleType: the matching entry from OBSTACLE_TYPES
// tollGateGroup: reference to the animated gate bar mesh
let activeObstacleMesh = null;
let activeObstacleType = null;
let tollGateBar        = null;  // the animated gate mesh inside a toll booth
let gateOpenPct        = 0;     // 0=closed, 1=fully open
let isWaiting          = false; // true while waiting between obstacle spawns
let challengeTriggered = false; // true once the popup has been shown for this obstacle
let lanePromptTriggered = false;


// =============================================================
// spawnObstacle
// Picks a random obstacle type, builds its 3D mesh group,
// and positions it far ahead on the road.
// bonusEnabled: if false, cones and barricade are excluded.
// Returns the type object so main.js can read its mechanic.
// =============================================================
export function spawnObstacle(scene, bonusEnabled) {
  if (activeObstacleMesh || isWaiting) return null;

  // Filter available types based on game settings
  const pool = OBSTACLE_TYPES.filter(function(t) {
    if (!bonusEnabled && (t.id === 'cones' || t.id === 'barricade')) return false;
    return true;
  });

  const type = pool[Math.floor(Math.random() * pool.length)];

  // Build the mesh group for this obstacle type
  const group = buildObstacleMesh(type, scene);
  group.position.set(
    (Math.random() - 0.5) * 7,  // random lane position
    0,
    SPAWN_Z
  );

  scene.add(group);
  activeObstacleMesh  = group;
  activeObstacleType  = type;
  challengeTriggered  = false;
  lanePromptTriggered = false;

  // Initialize toll booth gate state
  if (type.id === 'tollOpen')  gateOpenPct = 0;
  if (type.id === 'tollClose') gateOpenPct = 1;

  return type;
}


// =============================================================
// updateObstacles
// Called every frame. Scrolls the active obstacle toward the
// camera. Returns an event string when something happens:
//   'challenge'   — obstacle is close enough to trigger popup
//   'lanePrompt'  — barricade is close enough to trigger dodge
//   'missed'      — obstacle passed without interaction
//   null          — nothing to report this frame
// =============================================================
export function updateObstacles(speed) {
  if (!activeObstacleMesh) return null;

  activeObstacleMesh.position.z += speed;

  // Animate toll booth gate opening when player has signed OPEN
  if (tollGateBar && gateOpenPct < 1) {
    // Only animate if the gate is supposed to be opening
    if (activeObstacleType && activeObstacleType.id === 'tollOpen' && gateOpenPct > 0) {
      gateOpenPct = Math.min(1, gateOpenPct + 0.04);
      // Scale gate bar down on X as it opens (it shrinks to nothing)
      tollGateBar.scale.x = Math.max(0.01, 1 - gateOpenPct);
      tollGateBar.position.x = 1.5 * (1 - gateOpenPct); // shift right as it shrinks
    }
  }

  // Barricade triggers a lane dodge prompt when it gets close
  if (!lanePromptTriggered &&
      activeObstacleType &&
      activeObstacleType.mechanic === 'avoid' &&
      activeObstacleMesh.position.z > LANE_PROMPT_Z - 4) {
    lanePromptTriggered = true;
    return 'lanePrompt';
  }

  // Choice and signIt obstacles trigger popup when close to car
  if (!challengeTriggered &&
      activeObstacleType &&
      (activeObstacleType.mechanic === 'choice' || activeObstacleType.mechanic === 'signIt') &&
      activeObstacleMesh.position.z > CHALLENGE_ZONE_Z) {
    challengeTriggered = true;
    return 'challenge';
  }

  // Obstacle has passed the camera without being cleared
  if (activeObstacleMesh.position.z > DESPAWN_Z) {
    return 'missed';
  }

  return null;
}


// =============================================================
// checkCollision
// Pure function — no Three.js dependency, easy to unit test.
// Returns true if car and obstacle bounding boxes overlap.
// threshX and threshZ are the combined half-widths on each axis.
// =============================================================
export function boxesOverlap(ax, az, bx, bz, threshX, threshZ) {
  return Math.abs(ax - bx) < threshX && Math.abs(az - bz) < threshZ;
}

export function checkCollision(carGroup) {
  if (!activeObstacleMesh) return false;
  return boxesOverlap(
    carGroup.position.x, carGroup.position.z,
    activeObstacleMesh.position.x, activeObstacleMesh.position.z,
    3.2, 3.5
  );
}


// =============================================================
// clearActiveObstacle
// Removes the current obstacle from the scene and resets state.
// Called after the player resolves a popup or misses an obstacle.
// =============================================================
export function clearActiveObstacle(scene) {
  if (!activeObstacleMesh) return;
  scene.remove(activeObstacleMesh);
  activeObstacleMesh  = null;
  activeObstacleType  = null;
  tollGateBar         = null;
  gateOpenPct         = 0;
  challengeTriggered  = false;
  lanePromptTriggered = false;
}


// =============================================================
// openTollGate
// Called when the player successfully signs OPEN.
// Starts the gate animation by setting gateOpenPct above 0.
// The animation runs inside updateObstacles each frame.
// =============================================================
export function openTollGate() {
  gateOpenPct = 0.01; // kick off the animation
}


// Getters so main.js can read current obstacle state
export function getActiveObstacleType() { return activeObstacleType; }
export function isObstacleActive()      { return activeObstacleMesh !== null; }
export function setWaiting(val)         { isWaiting = val; }


// =============================================================
// buildObstacleMesh
// Routes to the correct mesh builder for each obstacle type.
// All builders return a THREE.Group so the caller always gets
// the same interface regardless of obstacle complexity.
// =============================================================
function buildObstacleMesh(type, scene) {
  if (type.id === 'mud')                          return buildMud(type);
  if (type.id === 'snow')                         return buildSnow(type);
  if (type.id === 'cones')                        return buildCones(type);
  if (type.id === 'barricade')                    return buildBarricade(type);
  if (type.id === 'tollOpen' || type.id === 'tollClose') return buildTollBooth(type);

  // Fallback — plain colored box for any future obstacle types
  const group = new THREE.Group();
  const w = type.w || 3, h = type.h || 0.5, d = type.d || 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: type.color })
  );
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}


// ── Individual mesh builders ────────────────────────────────

function buildMud(type) {
  const group = new THREE.Group();
  // Wide flat slab sitting on the road surface
  const mud = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.18, 2.5),
    new THREE.MeshLambertMaterial({ color: type.color })
  );
  mud.position.y = 0.09;
  mud.receiveShadow = true;
  group.add(mud);
  return group;
}

function buildSnow(type) {
  const group = new THREE.Group();
  // Slightly taller and whiter than mud — snow bank
  const snow = new THREE.Mesh(
    new THREE.BoxGeometry(5.5, 0.55, 2.8),
    new THREE.MeshLambertMaterial({ color: type.color })
  );
  snow.position.y = 0.28;
  snow.receiveShadow = true;
  group.add(snow);
  return group;
}

function buildCones(type) {
  const group = new THREE.Group();
  const coneMat = new THREE.MeshLambertMaterial({ color: 0xff7a00 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  // Three cones spread across the road
  [-2.5, 0, 2.5].forEach(function(xOffset) {
    // Cone body
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.0, 8),
      coneMat
    );
    cone.position.set(xOffset, 0.5, 0);
    cone.castShadow = true;

    // White reflective band around the cone
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.12, 8),
      bandMat
    );
    band.position.set(xOffset, 0.38, 0);

    group.add(cone, band);
  });

  return group;
}

function buildBarricade(type) {
  const group = new THREE.Group();
  const barMat    = new THREE.MeshLambertMaterial({ color: 0xe14d2a });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const postMat   = new THREE.MeshLambertMaterial({ color: 0x888888 });

  // Horizontal bar spanning the road
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.35, 0.35),
    barMat
  );
  bar.position.y = 1.1;
  bar.castShadow = true;

  // White diagonal stripes on the bar (four thin boxes)
  for (let i = 0; i < 4; i++) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.36, 0.36),
      stripeMat
    );
    stripe.position.set(-3 + i * 2, 1.1, 0);
    group.add(stripe);
  }

  // Two vertical support posts
  [-3.5, 3.5].forEach(function(x) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 1.2, 0.25),
      postMat
    );
    post.position.set(x, 0.6, 0);
    post.castShadow = true;
    group.add(post);
  });

  group.add(bar);
  return group;
}

function buildTollBooth(type) {
  const group = new THREE.Group();
  const grayMat  = new THREE.MeshLambertMaterial({ color: 0xc8c8c8 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xa8d8ea, transparent: true, opacity: 0.7 });
  const redMat   = new THREE.MeshLambertMaterial({ color: 0xe14d2a });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  // Central booth box — the attendant's booth
  const booth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.4), grayMat);
  booth.position.set(-3.5, 1.3, 0);
  booth.castShadow = true;

  // Booth window
  const window3d = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.12), glassMat);
  window3d.position.set(-3.5, 1.6, 0.75);

  // Left support post (booth side)
  const postL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), grayMat);
  postL.position.set(-3.5, 1.4, 0);

  // Right support post (open road side)
  const postR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.8, 0.25), grayMat);
  postR.position.set(3.5, 1.4, 0);

  // Gate bar — this animates when OPEN is signed
  // Positioned to extend from the booth rightward across the road
  const gate = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 0.2), redMat);
  gate.position.set(0, 2.0, 0);
  gate.castShadow = true;

  // White stripe accents on gate bar
  [-2, 0, 2].forEach(function(x) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.21, 0.21), whiteMat);
    stripe.position.set(x, 2.0, 0);
    group.add(stripe);
  });

  group.add(booth, window3d, postL, postR, gate);

  // Store gate reference for animation in updateObstacles
  tollGateBar = gate;

  // If this is a tollClose obstacle, gate starts open (already lifted)
  if (type.id === 'tollClose') {
    gate.scale.x = 0.01;
    gate.position.x = 3;
  }

  return group;
}
