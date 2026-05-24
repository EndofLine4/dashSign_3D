// =============================================================
// main.js
// Entry point for DashSign 3D.
// Owns the Three.js scene, camera, renderer, and all game state.
//
// Game state machine:
//   'login'      — login overlay visible, nothing running
//   'startSign'  — post-login, player must sign PLAY
//   'playing'    — normal driving, obstacles spawning
//   'stuck'      — popup active, road and car frozen
//   'lanePrompt' — barricade approaching, sign LEFT or RIGHT
//   'difficulty' — more obstacles prompt active
//   'paused'     — game frozen, no input processed
//
// Speed system:
//   2.5s after driving starts, a non-blocking corner banner
//   appears inviting the player to sign FAST.
//   Speed is a lerp target — it accelerates and decelerates
//   smoothly rather than snapping. Visual effects (fog, FOV,
//   camera shake) reinforce the feeling of speed change.
//   Score multiplier is 1.5x at fast speed (15pts vs 10pts).
//   SLOW is always available once FAST has been signed.
//   Speed resets to normal automatically when a popup opens
//   so obstacle challenges stay fair regardless of speed.
// =============================================================

import * as THREE from 'three';

import { createRoad, updateRoad }              from './road.js';
import { createCar, updateCar, updateCamera }  from './car.js';
import {
  OBSTACLE_TYPES,
  spawnObstacle, updateObstacles, checkCollision,
  clearActiveObstacle, openTollGate,
  getActiveObstacleType, isObstacleActive, setWaiting,
  boxesOverlap
} from './obstacles.js';
import {
  initMediaPipe, checkGesture, checkSpeedGesture,
  checkDifficultyGesture, resetGestureState, recognizeGesture
} from './gestures.js';
import {
  initUI, updateHUD,
  showChoicePopup, showSignItPopup, showStartSignPopup,
  showLaneDodgePrompt, showMoreObstaclesPrompt, showFlashBanner,
  hideAllPopups, showHandCanvas, hideHandCanvas,
  setSignResult, setChoiceFeedback,
  getDifficultyLocked, lockDifficulty, setPauseButtonLabel,
  showSpeedPrompt, hideSpeedPrompt, showSlowHint, hideSlowHint
} from './ui.js';


// =============================================================
// THREE.JS SCENE SETUP
// =============================================================

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0a14, 45, 130);
scene.background = new THREE.Color(0x0a0a14);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4.5, 18);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', function() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});


// ── Lighting ────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(8, 24, 12);
sun.castShadow           = true;
sun.shadow.mapSize.width = sun.shadow.mapSize.height = 1024;
sun.shadow.camera.near   = 0.5;
sun.shadow.camera.far    = 80;
sun.shadow.camera.left   = sun.shadow.camera.bottom = -20;
sun.shadow.camera.right  = sun.shadow.camera.top    =  20;
scene.add(sun);

const fill = new THREE.DirectionalLight(0x8ab4f8, 0.3);
fill.position.set(-6, 6, -15);
scene.add(fill);


// ── Roadside scenery ────────────────────────────────────────
(function addTrees() {
  const trunkMat  = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2d5a1b });
  for (let i = 0; i < 20; i++) {
    [-9, 9].forEach(function(side) {
      const group  = new THREE.Group();
      const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6), trunkMat);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 7), leavesMat);
      trunk.position.y  = 0.6;
      leaves.position.y = 2.3;
      group.add(trunk, leaves);
      group.position.set(side, 0, -i * 9 - 5);
      scene.add(group);
    });
  }
})();


// =============================================================
// GAME STATE
// =============================================================

const keys = {};
document.addEventListener('keydown', function(e) { keys[e.key] = true; });
document.addEventListener('keyup',   function(e) { keys[e.key] = false; });

let gameState        = 'login';
let score            = 0;
let distance         = 0;
let mudAvoidedCount  = 0;
let bonusEnabled     = false;
let askedForMore     = false;
let lanePromptLocked = false;

// Flash banner
let flashActive = false;
let flashTimer  = 0;
const FLASH_DURATION      = 120;
const NEXT_OBSTACLE_DELAY = 4000;
const POPUP_CLOSE_DELAY   = 500;

// ── Speed system state ──────────────────────────────────────
// currentSpeed: the actual speed used this frame (lerped)
// targetSpeed:  what we're lerping toward
// SPEED_NORMAL: base road speed in 3D units per frame
// SPEED_FAST:   2x normal
// LERP_ACCEL:   how quickly speed increases (lower = smoother ramp-up)
// LERP_DECEL:   how quickly speed decreases (faster decel feels more responsive)
const SPEED_NORMAL  = 0.18;
const SPEED_FAST    = 0.36;   // exactly 2x
const LERP_ACCEL    = 0.018;  // ~1 second to reach full speed
const LERP_DECEL    = 0.04;   // ~half second to slow down
let   currentSpeed  = SPEED_NORMAL;
let   targetSpeed   = SPEED_NORMAL;

// Speed mode tracks whether FAST has been activated.
// 'normal' | 'fast' — SLOW always returns to 'normal'
let speedMode = 'normal';

// Prompt shown 2.5s after driving starts, only once per session
let speedPromptShown    = false;
let speedPromptDismissed = false;
let drivingStartTime    = 0;   // timestamp when gameState becomes 'playing'

// Camera shake accumulator — applied at fast speed for physical feel
let shakeAmount = 0;

// FOV target — widens at fast speed for tunnel-vision effect
const FOV_NORMAL = 60;
const FOV_FAST   = 72;  // wider FOV feels faster
let   targetFOV  = FOV_NORMAL;


// ── World objects ───────────────────────────────────────────
const roadTiles = createRoad(scene);
const carGroup  = createCar(scene);


// =============================================================
// initUI CALLBACKS
// =============================================================

initUI({
  onLoginSuccess: function() {
    gameState = 'startSign';
    showStartSignPopup();
  },

  onChoiceAnswer: function(key) {
    if (gameState !== 'stuck') return;
    const type = getActiveObstacleType();
    if (!type || type.mechanic !== 'choice') return;
    if (key === type.correctKey) {
      resolveObstacle(true);
    } else {
      setChoiceFeedback('Try again.', true);
    }
  },

  onDifficultyChoice: function(choice) {
    if (gameState !== 'difficulty') return;
    bonusEnabled = choice === 'more';
    setSignResult(
      choice === 'more' ? 'Nice! More obstacles enabled.' : 'Standard obstacles.',
      true
    );
    setTimeout(finishDifficultyPrompt, 900);
  },

  onPause: function() {
    if (gameState === 'paused') {
      gameState = previousState;
    } else {
      previousState = gameState;
      gameState     = 'paused';
    }
    setPauseButtonLabel(gameState === 'paused');
  }
});

let previousState = 'playing';


// =============================================================
// MediaPipe setup
// =============================================================

const handCanvasEl = document.getElementById('handCanvas');
initMediaPipe(handCanvasEl);


// =============================================================
// GAME LOOP
// =============================================================

function loop() {
  update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();


// =============================================================
// UPDATE
// =============================================================

function update() {
  if (gameState === 'paused' || gameState === 'login') return;

  // ── Smooth FOV transition — every frame regardless of state ──
  if (Math.abs(camera.fov - targetFOV) > 0.1) {
    camera.fov += (targetFOV - camera.fov) * 0.06;
    camera.updateProjectionMatrix();
  }

  // ── Speed lerp — runs in ALL states except paused/login ──
  // This means the car smoothly decelerates even while a popup
  // is open, and re-accelerates as soon as the popup closes.
  const lerpRate = targetSpeed > currentSpeed ? LERP_ACCEL : LERP_DECEL;
  currentSpeed  += (targetSpeed - currentSpeed) * lerpRate;
  if (Math.abs(currentSpeed - targetSpeed) < 0.001) currentSpeed = targetSpeed;

  // ── Speed gesture polling — runs in ALL states except paused/login ──
  // This is the fix: FAST and SLOW are readable at any time,
  // including during stuck, lanePrompt, and difficulty states.
  // checkSpeedGesture uses its own confidence counter so it never
  // interferes with obstacle sign matching in checkGesture.
  // We skip 'startSign' only because the player hasn't begun
  // driving yet and the speed system isn't meaningful there.
  if (gameState !== 'startSign') {
    const speedGesture = checkSpeedGesture();
    if (speedGesture === 'fast' && speedMode !== 'fast') {
      activateFastMode();
    } else if (speedGesture === 'slow' && speedMode === 'fast') {
      activateSlowMode();
    }
  }

  // Camera always follows car
  updateCamera(camera, carGroup);

  if (gameState === 'startSign') { handleStartSign();  return; }
  if (gameState === 'playing')   { handlePlaying();    return; }
  if (gameState === 'stuck')     { handleStuck();      return; }
  if (gameState === 'lanePrompt'){ handleLanePrompt(); return; }
  if (gameState === 'difficulty'){ handleDifficulty(); return; }
}


// =============================================================
// handleStartSign
// =============================================================

function handleStartSign() {
  const confirmed = checkGesture('play');
  if (confirmed) {
    setSignResult('Great signing!', true);
    resetGestureState();
    setTimeout(function() {
      hideAllPopups();
      hideHandCanvas();
      gameState        = 'playing';
      drivingStartTime = Date.now();  // start the speed prompt countdown
    }, 700);
  } else {
    setSignResult('Sign PLAY.', false);
  }
}


// =============================================================
// handlePlaying
// Normal gameplay loop. Also handles:
//   - Smooth speed lerp each frame
//   - Speed gesture polling (never blocks gameplay)
//   - Speed prompt timing (2.5s after driving starts)
//   - Camera shake at fast speed
//   - Fog compression at fast speed (world feels closer/faster)
// =============================================================

function handlePlaying() {
  // ── Speed prompt — 2.5s after driving starts, shown once ──
  if (!speedPromptShown && Date.now() - drivingStartTime > 2500) {
    speedPromptShown = true;
    showSpeedPrompt();
    // Auto-dismiss after 5 seconds if player doesn't act on it
    setTimeout(function() {
      if (!speedPromptDismissed) {
        speedPromptDismissed = true;
        hideSpeedPrompt();
      }
    }, 5000);
  }

  // ── Visual effects scale with speed ─────────────────────
  // Fog end distance compresses as speed increases — world appears
  // to rush by faster even though it's just geometry getting closer.
  const speedRatio  = (currentSpeed - SPEED_NORMAL) / (SPEED_FAST - SPEED_NORMAL);
  const fogFar      = THREE.MathUtils.lerp(130, 70, speedRatio);
  scene.fog.far     = fogFar;

  // Camera shake — subtle random Y offset at fast speed
  // Magnitude scales with how close we are to SPEED_FAST
  shakeAmount = speedRatio * 0.04;
  camera.position.y += (Math.random() - 0.5) * shakeAmount;

  // ── Normal gameplay ──────────────────────────────────────
  updateRoad(roadTiles, currentSpeed);
  updateCar(carGroup, keys, false);
  distance += currentSpeed;
  updateHUD(score, distance, currentSpeed > SPEED_NORMAL + 0.02 ? 2 : 1);

  // Flash timer for mud pre-flash
  if (flashActive) {
    flashTimer--;
    if (flashTimer <= 0) {
      flashActive = false;
      if (gameState === 'playing') hideAllPopups();
    }
  }

  if (!isObstacleActive() && distance > 300) {
    triggerSpawn();
  }

  const event = updateObstacles(currentSpeed);

  if (event === 'lanePrompt') {
    gameState = 'lanePrompt';
    lanePromptLocked = false;
    showLaneDodgePrompt();
    return;
  }

  if (event === 'challenge') {
    triggerStuck();
    return;
  }

  if (event === 'missed') {
    const type = getActiveObstacleType();
    if (type && (type.id === 'mud' || type.id === 'snow')) mudAvoidedCount++;
    clearActiveObstacle(scene);
    setWaiting(false);

    if (!askedForMore && mudAvoidedCount >= 4) {
      askedForMore = true;
      gameState    = 'difficulty';
      showMoreObstaclesPrompt();
      return;
    }

    setTimeout(triggerSpawn, 2000);
  }

  if (checkCollision(carGroup)) {
    triggerStuck();
  }
}


// =============================================================
// activateFastMode
// Called once when FAST gesture is confirmed.
// Sets target speed to 2x, updates visual systems,
// dismisses the speed prompt banner if still visible.
// =============================================================

function activateFastMode() {
  speedMode    = 'fast';
  targetSpeed  = SPEED_FAST;
  targetFOV    = FOV_FAST;

  // Dismiss the prompt if it's still showing
  if (!speedPromptDismissed) {
    speedPromptDismissed = true;
    hideSpeedPrompt();
  }

  // Show the SLOW hint so the player knows how to ease off
  showSlowHint();
}


// =============================================================
// activateSlowMode
// Returns to normal speed. Hides the slow hint.
// Fog and FOV lerp back automatically each frame.
// =============================================================

function activateSlowMode() {
  speedMode   = 'normal';
  targetSpeed = SPEED_NORMAL;
  targetFOV   = FOV_NORMAL;
  hideSlowHint();
}


// =============================================================
// handleStuck
// Popup is open. Road and car are frozen.
// Speed is reset to normal while stuck — fair for all obstacles.
// =============================================================

function handleStuck() {
  const type = getActiveObstacleType();
  if (!type || type.mechanic !== 'signIt') return;

  const confirmed = checkGesture(type.gesture);
  if (confirmed) {
    setSignResult('Great signing!', true);
    resetGestureState();

    if (type.id === 'tollOpen') {
      openTollGate();
      setTimeout(function() { resolveObstacle(true); }, 900);
    } else {
      setTimeout(function() { resolveObstacle(true); }, 800);
    }
  } else {
    setSignResult('Keep trying.', false);
  }
}


// =============================================================
// handleLanePrompt
// =============================================================

function handleLanePrompt() {
  if (lanePromptLocked) return;

  const leftConfirmed  = checkGesture('left');
  const rightConfirmed = checkGesture('right');

  if (leftConfirmed) {
    lanePromptLocked = true;
    carGroup.position.x = Math.max(-5, carGroup.position.x - 4.5);
    setSignResult('Dodging LEFT!', true);
    resetGestureState();
    setTimeout(finishLanePrompt, 500);
  } else if (rightConfirmed) {
    lanePromptLocked = true;
    carGroup.position.x = Math.min(5, carGroup.position.x + 4.5);
    setSignResult('Dodging RIGHT!', true);
    resetGestureState();
    setTimeout(finishLanePrompt, 500);
  } else {
    setSignResult('Sign LEFT or RIGHT.', false);
  }
}

function finishLanePrompt() {
  clearActiveObstacle(scene);
  setWaiting(false);
  hideAllPopups();
  hideHandCanvas();
  gameState = 'playing';
  setTimeout(triggerSpawn, 2000);
}


// =============================================================
// handleDifficulty
// =============================================================

function handleDifficulty() {
  if (getDifficultyLocked()) return;

  const choice = checkDifficultyGesture();
  if (choice === 'more' || choice === 'no') {
    lockDifficulty();
    bonusEnabled = choice === 'more';
    setSignResult(
      choice === 'more' ? 'Nice! More obstacles enabled.' : 'Standard obstacles.',
      true
    );
    setTimeout(finishDifficultyPrompt, 900);
  } else {
    setSignResult('Sign MORE or NO.', false);
  }
}

function finishDifficultyPrompt() {
  hideAllPopups();
  hideHandCanvas();
  gameState = 'playing';
  setTimeout(triggerSpawn, NEXT_OBSTACLE_DELAY);
}


// =============================================================
// triggerSpawn
// =============================================================

function triggerSpawn() {
  if (gameState !== 'playing') return;

  const type = spawnObstacle(scene, bonusEnabled);
  if (!type) return;

  if (type.id === 'mud') {
    flashActive = true;
    flashTimer  = FLASH_DURATION;
    showFlashBanner(type);
  }
}


// =============================================================
// triggerStuck
// Resets speed to normal when a popup opens — keeps all
// obstacle challenges fair regardless of current speed mode.
// =============================================================

function triggerStuck() {
  if (gameState === 'stuck') return;

  const type = getActiveObstacleType();
  if (!type) return;

  if (type.mechanic === 'avoid') {
    score = Math.max(0, score - 5);
    clearActiveObstacle(scene);
    setWaiting(false);
    setTimeout(triggerSpawn, 1500);
    return;
  }

  // Pause speed while stuck — resume whatever mode was active after resolve
  targetSpeed  = SPEED_NORMAL;
  currentSpeed = SPEED_NORMAL;
  targetFOV    = FOV_NORMAL;
  scene.fog.far = 130;

  gameState   = 'stuck';
  flashActive = false;
  flashTimer  = 0;
  resetGestureState();

  if (type.mechanic === 'choice') {
    showChoicePopup(type);
  } else if (type.mechanic === 'signIt') {
    showSignItPopup(type);
  }
}


// =============================================================
// resolveObstacle
// Score multiplier: 15pts at fast speed, 10pts at normal.
// After resolving, speed restores to whatever mode was active.
// =============================================================

function resolveObstacle(correct) {
  if (correct) {
    // Award more points when playing at fast speed — earned risk
    score += speedMode === 'fast' ? 15 : 10;
  }

  gameState   = 'playing';
  flashActive = false;
  flashTimer  = 0;
  resetGestureState();
  clearActiveObstacle(scene);
  setWaiting(false);

  // Restore speed mode target after popup closes
  targetSpeed = speedMode === 'fast' ? SPEED_FAST : SPEED_NORMAL;
  targetFOV   = speedMode === 'fast' ? FOV_FAST   : FOV_NORMAL;

  setTimeout(function() {
    hideAllPopups();
    hideHandCanvas();
  }, POPUP_CLOSE_DELAY);

  setTimeout(triggerSpawn, NEXT_OBSTACLE_DELAY);
}
