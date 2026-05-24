// =============================================================
// main.js
// Entry point for DashSign 3D.
// Owns the Three.js scene, camera, renderer, and game state.
// Imports from road.js, car.js, obstacles.js, gestures.js,
// and ui.js — each responsible for one area of the game.
//
// Game state machine:
//   'login'      — login overlay visible, nothing running
//   'startSign'  — post-login, player must sign PLAY
//   'playing'    — normal driving, obstacles spawning
//   'stuck'      — popup active, road and car frozen
//   'lanePrompt' — barricade approaching, sign LEFT or RIGHT
//   'difficulty' — more obstacles prompt active
//   'paused'     — game frozen, no input processed
// =============================================================

import * as THREE from 'three';

import { createRoad, updateRoad, ROAD_LENGTH } from './road.js';
import { createCar, updateCar, updateCamera }  from './car.js';
import {
  OBSTACLE_TYPES,
  spawnObstacle, updateObstacles, checkCollision,
  clearActiveObstacle, openTollGate,
  getActiveObstacleType, isObstacleActive, setWaiting,
  boxesOverlap
} from './obstacles.js';
import {
  initMediaPipe, checkGesture, checkDifficultyGesture,
  resetGestureState, recognizeGesture
} from './gestures.js';
import {
  initUI, updateHUD,
  showChoicePopup, showSignItPopup, showStartSignPopup,
  showLaneDodgePrompt, showMoreObstaclesPrompt, showFlashBanner,
  hideAllPopups, showHandCanvas, hideHandCanvas,
  setSignResult, setChoiceFeedback,
  getDifficultyLocked, lockDifficulty,
  setPauseButtonLabel
} from './ui.js';


// =============================================================
// THREE.JS SCENE SETUP
// Scene, camera, renderer, fog, and lights are created once
// at module level. They don't change during gameplay.
// =============================================================

const scene = new THREE.Scene();

// Fog makes the road fade into darkness at distance — free polish
scene.fog = new THREE.Fog(0x0a0a14, 45, 130);
scene.background = new THREE.Color(0x0a0a14);

// PerspectiveCamera(fov, aspect, near, far)
// fov=60 gives a natural driving perspective
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 4.5, 18);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // cap at 2x for performance
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;   // softer shadow edges
document.body.appendChild(renderer.domElement);

// Resize handler — keeps canvas filling the window
window.addEventListener('resize', function() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});


// ── Lighting ────────────────────────────────────────────────
// Ambient: fills shadows so nothing is pure black
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);

// Sun: main directional light, casts shadows
const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
sun.position.set(8, 24, 12);
sun.castShadow              = true;
sun.shadow.mapSize.width    = 1024;
sun.shadow.mapSize.height   = 1024;
sun.shadow.camera.near      = 0.5;
sun.shadow.camera.far       = 80;
sun.shadow.camera.left      = -20;
sun.shadow.camera.right     = 20;
sun.shadow.camera.top       = 20;
sun.shadow.camera.bottom    = -20;
scene.add(sun);

// Fill: cool blue light from behind, adds depth
const fill = new THREE.DirectionalLight(0x8ab4f8, 0.3);
fill.position.set(-6, 6, -15);
scene.add(fill);


// ── Roadside scenery ────────────────────────────────────────
// Simple tree shapes (cone on cylinder) along both road edges.
// Static in the world — the road scrolling past them creates
// the illusion of movement without needing to animate them.
(function addTrees() {
  const trunkMat  = new THREE.MeshLambertMaterial({ color: 0x5c3d1e });
  const leavesMat = new THREE.MeshLambertMaterial({ color: 0x2d5a1b });

  for (let i = 0; i < 20; i++) {
    [-9, 9].forEach(function(side) {
      const group = new THREE.Group();

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.22, 1.2, 6),
        trunkMat
      );
      trunk.position.y = 0.6;

      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 2.2, 7),
        leavesMat
      );
      leaves.position.y = 2.3;

      group.add(trunk, leaves);
      group.position.set(side, 0, -i * 9 - 5);
      scene.add(group);
    });
  }
})();


// =============================================================
// GAME STATE
// All mutable game state lives here in main.js.
// Other modules read/write state only through function args
// or the callbacks registered in initUI.
// =============================================================

// Keyboard input — keys object is read every frame in updateCar
const keys = {};
document.addEventListener('keydown', function(e) { keys[e.key] = true; });
document.addEventListener('keyup',   function(e) { keys[e.key] = false; });

let gameState       = 'login';   // see state machine comment at top
let score           = 0;
let distance        = 0;
let mudAvoidedCount = 0;         // tracks when to show difficulty prompt
let bonusEnabled    = false;     // true after player signs MORE
let askedForMore    = false;     // difficulty prompt shown only once
let lanePromptLocked = false;    // prevents lane prompt firing twice

// Flash banner timer — mud obstacle pre-flash
let flashActive = false;
let flashTimer  = 0;
const FLASH_DURATION     = 120;  // frames at 60fps (~2 seconds)
const NEXT_OBSTACLE_DELAY = 4000; // ms between obstacle spawns
const POPUP_CLOSE_DELAY   = 500;  // ms before popup hides after resolve
const ROAD_SPEED          = 0.18; // 3D units per frame

// Build world objects
const roadTiles = createRoad(scene);
const carGroup  = createCar(scene);


// =============================================================
// initUI CALLBACKS
// These callbacks let ui.js trigger game events without
// importing game state. main.js owns state, ui.js owns DOM.
// =============================================================

initUI({
  // Called after successful login — show the PLAY sign prompt
  onLoginSuccess: function() {
    gameState = 'startSign';
    showStartSignPopup();
  },

  // Called when player presses S, G, or P during choice mode
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

  // Called when difficulty gesture (MORE or NO) is confirmed
  onDifficultyChoice: function(choice) {
    if (gameState !== 'difficulty') return;
    if (choice === 'more') {
      bonusEnabled = true;
      setSignResult('Nice! More obstacles enabled.', true);
    } else {
      setSignResult('Standard obstacles.', true);
    }
    setTimeout(finishDifficultyPrompt, 900);
  },

  // Called when pause button is clicked
  onPause: function() {
    if (gameState === 'paused') {
      gameState = previousState;
    } else {
      previousState = gameState;
      gameState = 'paused';
    }
    setPauseButtonLabel(gameState === 'paused');
  }
});

// Store state before pause so we can restore it on resume
let previousState = 'playing';


// =============================================================
// MediaPipe and gesture setup
// =============================================================

const handCanvasEl = document.getElementById('handCanvas');
initMediaPipe(handCanvasEl);


// =============================================================
// GAME LOOP
// requestAnimationFrame keeps this running at ~60fps.
// The loop is always running — game state controls what happens
// each frame rather than starting/stopping the loop.
// =============================================================

function loop() {
  update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

loop();


// =============================================================
// UPDATE — called every frame
// Dispatches to the correct logic based on current gameState.
// =============================================================

function update() {
  if (gameState === 'paused' || gameState === 'login') return;

  // Camera always follows car regardless of state
  updateCamera(camera, carGroup);

  if (gameState === 'startSign') {
    handleStartSign();
    return;
  }

  if (gameState === 'playing') {
    handlePlaying();
    return;
  }

  if (gameState === 'stuck') {
    handleStuck();
    return;
  }

  if (gameState === 'lanePrompt') {
    handleLanePrompt();
    return;
  }

  if (gameState === 'difficulty') {
    handleDifficulty();
    return;
  }
}


// =============================================================
// handleStartSign
// Waits for the player to sign PLAY before starting the game.
// =============================================================

function handleStartSign() {
  const confirmed = checkGesture('play');
  if (confirmed) {
    setSignResult('Great signing!', true);
    resetGestureState();
    setTimeout(function() {
      hideAllPopups();
      hideHandCanvas();
      gameState = 'playing';
    }, 700);
  } else {
    setSignResult('Sign PLAY.', false);
  }
}


// =============================================================
// handlePlaying
// Normal gameplay: scroll road, move car, spawn and move
// obstacles, check collision and spawn triggers.
// =============================================================

function handlePlaying() {
  // Scroll road tiles
  updateRoad(roadTiles, ROAD_SPEED);

  // Move car with arrow keys
  updateCar(carGroup, keys, false);

  // Advance distance counter
  distance += ROAD_SPEED;
  updateHUD(score, distance);

  // Flash timer countdown for mud pre-flash
  if (flashActive) {
    flashTimer--;
    if (flashTimer <= 0) {
      flashActive = false;
      if (gameState === 'playing') hideAllPopups();
    }
  }

  // Spawn first obstacle after warm-up distance
  if (!isObstacleActive() && distance > 300) {
    triggerSpawn();
  }

  // Scroll active obstacle and check for events
  const event = updateObstacles(ROAD_SPEED);

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

    // After enough obstacles passed, ask about difficulty
    if (!askedForMore && mudAvoidedCount >= 4) {
      askedForMore = true;
      gameState    = 'difficulty';
      showMoreObstaclesPrompt();
      return;
    }

    setTimeout(triggerSpawn, 2000);
  }

  // Direct collision fallback (in case challenge_zone was missed)
  if (checkCollision(carGroup)) {
    triggerStuck();
  }
}


// =============================================================
// handleStuck
// Popup is open. Road and car are frozen.
// Checks for gesture input each frame for signIt obstacles.
// Choice obstacles are handled via keyboard in initUI callbacks.
// =============================================================

function handleStuck() {
  const type = getActiveObstacleType();
  if (!type || type.mechanic !== 'signIt') return;

  const confirmed = checkGesture(type.gesture);
  if (confirmed) {
    setSignResult('Great signing!', true);
    resetGestureState();

    // For toll open, start gate animation before resolving
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
// Barricade is approaching — player signs LEFT or RIGHT.
// Car jumps sideways then the popup closes.
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
// Player signs MORE or NO to choose obstacle difficulty.
// getDifficultyLocked prevents double-firing.
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
// Picks a random obstacle and starts the pre-flash for mud.
// =============================================================

function triggerSpawn() {
  if (gameState !== 'playing') return;

  const type = spawnObstacle(scene, bonusEnabled);
  if (!type) return;

  // Mud gets a pre-flash banner so player can study the signs
  if (type.id === 'mud') {
    flashActive = true;
    flashTimer  = FLASH_DURATION;
    showFlashBanner(type);
  }
}


// =============================================================
// triggerStuck
// Called when an obstacle's challenge zone is reached.
// Freezes gameplay and shows the appropriate popup.
// =============================================================

function triggerStuck() {
  if (gameState === 'stuck') return; // already stuck

  const type = getActiveObstacleType();
  if (!type) return;

  // Avoid obstacles just clear and respawn — no popup
  if (type.mechanic === 'avoid') {
    score = Math.max(0, score - 5);
    clearActiveObstacle(scene);
    setWaiting(false);
    setTimeout(triggerSpawn, 1500);
    return;
  }

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
// Called when the player correctly answers a popup challenge.
// Adds score, clears the obstacle, returns to playing state.
// =============================================================

function resolveObstacle(correct) {
  if (correct) score += 10;

  gameState = 'playing';
  flashActive = false;
  flashTimer  = 0;
  resetGestureState();
  clearActiveObstacle(scene);
  setWaiting(false);

  setTimeout(function() {
    hideAllPopups();
    hideHandCanvas();
  }, POPUP_CLOSE_DELAY);

  setTimeout(triggerSpawn, NEXT_OBSTACLE_DELAY);
}
