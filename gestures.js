// =============================================================
// gestures.js
// Sets up MediaPipe Hands and the webcam feed.
// Contains every gesture recognition function.
// Gesture functions are pure math — they only take a landmarks
// array and return true/false. No browser/Three.js dependency,
// which is why they're easy to unit test (see tests/).
//
// MediaPipe landmark index reference:
//   0  = wrist
//   4  = thumb tip
//   5  = index MCP (knuckle base)
//   6  = index PIP (middle knuckle)
//   8  = index tip
//   10 = middle PIP
//   12 = middle tip
//   14 = ring PIP
//   16 = ring tip
//   18 = pinky PIP
//   20 = pinky tip
//
// Speed gestures added:
//   FAST — both index and middle extended (V/peace shape), ring and pinky curled
//   SLOW — open flat hand pushed forward (same as STOP but with downward wrist offset)
//          Implemented as STOP held low in frame (wrist y > 0.55) to distinguish
//          from a generic open-hand stop
// =============================================================

// ── Module-level state ──────────────────────────────────────
let currentLandmarks       = null;
let lastDetectedGesture    = null;
let gestureConfidenceCount = 0;
const CONFIDENCE_THRESHOLD = 2;

let onGestureConfirmed = null;
let onGestureAttempt   = null;


// =============================================================
// initMediaPipe
// Starts the webcam and feeds frames to MediaPipe Hands.
// =============================================================
export function initMediaPipe(handCanvasEl) {
  const handCtx = handCanvasEl.getContext('2d');

  const hands = new Hands({
    locateFile: function(file) {
      return 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/' + file;
    }
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 0,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults(function(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      currentLandmarks = results.multiHandLandmarks[0];
    } else {
      currentLandmarks = null;
    }
    drawHandOverlay(handCtx, handCanvasEl, results);
  });

  navigator.mediaDevices.getUserMedia({ video: true }).then(function(stream) {
    const webcamVideo = document.getElementById('webcam');
    webcamVideo.srcObject = stream;
    webcamVideo.play();

    const camera = new Camera(webcamVideo, {
      onFrame: async function() {
        await hands.send({ image: webcamVideo });
      },
      width: 320,
      height: 240
    });
    camera.start();
  }).catch(function(err) {
    console.warn('Webcam not available:', err);
  });
}


// =============================================================
// registerGestureCallbacks
// =============================================================
export function registerGestureCallbacks(onConfirmed, onAttempt) {
  onGestureConfirmed = onConfirmed;
  onGestureAttempt   = onAttempt;
}


// =============================================================
// checkGesture
// Called from main.js every frame while a popup is open.
// Uses confidence filtering to require N matching frames.
// =============================================================
export function checkGesture(gestureName) {
  if (!currentLandmarks) return false;

  const matched = recognizeGesture(gestureName, currentLandmarks);

  if (matched) {
    if (lastDetectedGesture === gestureName) {
      gestureConfidenceCount++;
      if (gestureConfidenceCount >= CONFIDENCE_THRESHOLD) {
        gestureConfidenceCount = 0;
        lastDetectedGesture    = null;
        if (onGestureConfirmed) onGestureConfirmed(gestureName);
        return true;
      }
    } else {
      lastDetectedGesture    = gestureName;
      gestureConfidenceCount = 1;
    }
  } else {
    if (lastDetectedGesture === gestureName) {
      lastDetectedGesture    = null;
      gestureConfidenceCount = 0;
    }
    if (onGestureAttempt) onGestureAttempt('keep trying');
  }

  return false;
}


// =============================================================
// checkSpeedGesture
// Special-purpose polling function called every frame during
// 'playing' state — separate from checkGesture so speed signs
// never interfere with obstacle sign matching.
// Returns 'fast', 'slow', or null.
// Uses its own independent confidence counter so obstacle
// challenges and speed gestures don't share state.
// =============================================================
let lastSpeedGesture    = null;
let speedConfidenceCount = 0;
const SPEED_CONFIDENCE  = 3;  // slightly higher bar than obstacles

export function checkSpeedGesture() {
  if (!currentLandmarks) return null;

  const isFast = gestureFast(currentLandmarks);
  const isSlow = gestureSlow(currentLandmarks);

  const detected = isFast ? 'fast' : isSlow ? 'slow' : null;

  if (detected) {
    if (lastSpeedGesture === detected) {
      speedConfidenceCount++;
      if (speedConfidenceCount >= SPEED_CONFIDENCE) {
        speedConfidenceCount = 0;
        lastSpeedGesture     = null;
        return detected;
      }
    } else {
      lastSpeedGesture     = detected;
      speedConfidenceCount = 1;
    }
  } else {
    lastSpeedGesture     = null;
    speedConfidenceCount = 0;
  }

  return null;
}


// =============================================================
// checkDifficultyGesture
// =============================================================
export function checkDifficultyGesture() {
  if (!currentLandmarks) return null;
  if (gestureMore(currentLandmarks)) return 'more';
  if (gestureNo(currentLandmarks))   return 'no';
  return null;
}


// =============================================================
// resetGestureState
// =============================================================
export function resetGestureState() {
  lastDetectedGesture    = null;
  gestureConfidenceCount = 0;
  lastSpeedGesture       = null;
  speedConfidenceCount   = 0;
}


// =============================================================
// recognizeGesture
// Routes a gesture name to its detection function.
// Exported so unit tests can call it directly.
// =============================================================
export function recognizeGesture(gestureName, landmarks) {
  if (gestureName === 'play')  return gesturePlay(landmarks);
  if (gestureName === 'snow')  return gestureSnow(landmarks);
  if (gestureName === 'stop')  return gestureStop(landmarks);
  if (gestureName === 'go')    return gestureGo(landmarks);
  if (gestureName === 'help')  return gestureHelp(landmarks);
  if (gestureName === 'left')  return gestureLeft(landmarks);
  if (gestureName === 'right') return gestureRight(landmarks);
  if (gestureName === 'more')  return gestureMore(landmarks);
  if (gestureName === 'no')    return gestureNo(landmarks);
  if (gestureName === 'open')  return gestureOpen(landmarks);
  if (gestureName === 'close') return gestureClose(landmarks);
  if (gestureName === 'fast')  return gestureFast(landmarks);
  if (gestureName === 'slow')  return gestureSlow(landmarks);
  return false;
}


// ── Gesture detection functions ────────────────────────────
// In MediaPipe coords: y INCREASES downward.
// tip.y < base.y = finger is UP (extended).

export function gesturePlay(landmarks) {
  return gestureGo(landmarks) || gestureOut(landmarks);
}

export function gestureSnow(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const allExtended = tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
  const thumbSpread = Math.abs(landmarks[4].x - landmarks[5].x) > 0.08;
  return allExtended && thumbSpread;
}

export function gestureStop(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  return tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
}

export function gestureGo(landmarks) {
  const indexExtended = landmarks[8].y  < landmarks[6].y;
  const middleCurled  = landmarks[12].y > landmarks[10].y;
  const ringCurled    = landmarks[16].y > landmarks[14].y;
  const pinkyCurled   = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

export function gestureHelp(landmarks) {
  const allCurled = [8, 12, 16, 20].every(function(tip) {
    return landmarks[tip].y > landmarks[tip - 2].y;
  });
  const thumbIn = Math.abs(landmarks[4].x - landmarks[3].x) < 0.06;
  return allCurled && thumbIn;
}

export function gestureOut(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const extendedCount = tips.reduce(function(count, tip, i) {
    return count + (landmarks[tip].y < landmarks[bases[i]].y ? 1 : 0);
  }, 0);
  const thumbAway = (Math.abs(landmarks[4].x - landmarks[5].x) +
                     Math.abs(landmarks[4].y - landmarks[5].y)) > 0.08;
  return extendedCount >= 3 && thumbAway;
}

export function gestureLeft(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const othersCurled  = landmarks[12].y > landmarks[10].y &&
                        landmarks[16].y > landmarks[14].y &&
                        landmarks[20].y > landmarks[18].y;
  const pointingLeft  = landmarks[8].x < landmarks[0].x - 0.06;
  return indexExtended && othersCurled && pointingLeft;
}

export function gestureRight(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const othersCurled  = landmarks[12].y > landmarks[10].y &&
                        landmarks[16].y > landmarks[14].y &&
                        landmarks[20].y > landmarks[18].y;
  const pointingRight = landmarks[8].x > landmarks[0].x + 0.06;
  return indexExtended && othersCurled && pointingRight;
}

export function gestureMore(landmarks) {
  const thumbTip = landmarks[4];
  return [8, 12, 16, 20].every(function(i) {
    return Math.hypot(landmarks[i].x - thumbTip.x, landmarks[i].y - thumbTip.y) < 0.11;
  });
}

export function gestureNo(landmarks) {
  const indexExtended  = landmarks[8].y  < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[10].y;
  const ringCurled     = landmarks[16].y > landmarks[14].y;
  const pinkyCurled    = landmarks[20].y > landmarks[18].y;
  const fingersClose   = Math.hypot(
    landmarks[8].x  - landmarks[12].x,
    landmarks[8].y  - landmarks[12].y
  ) < 0.07;
  return indexExtended && middleExtended && ringCurled && pinkyCurled && fingersClose;
}

export function gestureOpen(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const allExtended = tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
  const spread = Math.abs(landmarks[4].x - landmarks[20].x) > 0.25;
  return allExtended && spread;
}

export function gestureClose(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const someExtended = tips.filter(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  }).length >= 2;
  const compact = Math.abs(landmarks[4].x - landmarks[20].x) < 0.12;
  return someExtended && compact;
}

// FAST: index AND middle extended together (V / peace sign shape),
// ring and pinky curled. This is distinct from GO (index only) and
// NO (index + middle but close together) because the two fingers
// are spread apart in a V shape — middle tip further from index tip.
export function gestureFast(landmarks) {
  const indexExtended  = landmarks[8].y  < landmarks[6].y;
  const middleExtended = landmarks[12].y < landmarks[10].y;
  const ringCurled     = landmarks[16].y > landmarks[14].y;
  const pinkyCurled    = landmarks[20].y > landmarks[18].y;
  // Fingers must be visibly spread apart (V shape, not grouped like NO)
  const fingersSpread  = Math.hypot(
    landmarks[8].x  - landmarks[12].x,
    landmarks[8].y  - landmarks[12].y
  ) > 0.08;
  return indexExtended && middleExtended && ringCurled && pinkyCurled && fingersSpread;
}

// SLOW: flat open hand held LOW in the camera frame.
// The wrist landmark (0) must be in the lower half of the frame
// (y > 0.55) — player pushes palm downward rather than holding it
// straight up. This distinguishes SLOW from STOP (which is held up).
// All four fingers must be extended (same base check as STOP).
export function gestureSlow(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const allExtended = tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
  // Wrist low in frame = hand pushed downward = "slow down" motion
  const handLow = landmarks[0].y > 0.52;
  return allExtended && handLow;
}


// =============================================================
// drawHandOverlay
// =============================================================
function drawHandOverlay(handCtx, canvas, results) {
  handCtx.clearRect(0, 0, canvas.width, canvas.height);
  if (!results.multiHandLandmarks) return;

  results.multiHandLandmarks.forEach(function(landmarks) {
    landmarks.forEach(function(lm) {
      handCtx.beginPath();
      handCtx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, Math.PI * 2);
      handCtx.fillStyle = '#f5c842';
      handCtx.fill();
    });
  });
}
