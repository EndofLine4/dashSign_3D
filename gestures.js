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
// =============================================================

// ── Module-level state ──────────────────────────────────────
// currentLandmarks: updated every MediaPipe frame
// lastDetectedGesture / gestureConfidenceCount: stability filter
// A gesture must match for CONFIDENCE_THRESHOLD consecutive frames
// before it's accepted — reduces false positives from hand jitter.
let currentLandmarks       = null;
let lastDetectedGesture    = null;
let gestureConfidenceCount = 0;
const CONFIDENCE_THRESHOLD = 2;

// Callbacks registered by ui.js so gestures can trigger game events
// without gestures.js needing to know about the game state
let onGestureConfirmed = null;  // called with gesture name when confirmed
let onGestureAttempt   = null;  // called every frame with current best guess


// =============================================================
// initMediaPipe
// Starts the webcam and feeds frames to MediaPipe Hands.
// MediaPipe runs entirely in the browser — no server needed.
// The onResults callback updates currentLandmarks every frame.
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
    modelComplexity: 0,           // 0 = lite model, fast enough for 60fps
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults(function(results) {
    // Update the current landmarks from MediaPipe's output
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      currentLandmarks = results.multiHandLandmarks[0];
    } else {
      currentLandmarks = null;
    }

    // Draw yellow dots on the hand overlay canvas so the player
    // can see their hand is being tracked
    drawHandOverlay(handCtx, handCanvasEl, results);
  });

  // Request webcam access and start feeding frames to MediaPipe
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
// ui.js calls this to hook into gesture events without
// gestures.js needing to import anything from ui.js.
// This keeps the dependency flow one-directional.
// =============================================================
export function registerGestureCallbacks(onConfirmed, onAttempt) {
  onGestureConfirmed = onConfirmed;
  onGestureAttempt   = onAttempt;
}


// =============================================================
// checkGesture
// Called from main.js every frame while a sign-it popup is open.
// gestureName: which gesture to look for (e.g. 'snow', 'open')
// Uses confidence filtering to require N matching frames.
// =============================================================
export function checkGesture(gestureName) {
  if (!currentLandmarks) return false;

  const matched = recognizeGesture(gestureName, currentLandmarks);

  if (matched) {
    if (lastDetectedGesture === gestureName) {
      gestureConfidenceCount++;
      if (gestureConfidenceCount >= CONFIDENCE_THRESHOLD) {
        // Reset counter so it doesn't keep firing after first confirm
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
// checkDifficultyGesture
// Special case for the MORE/NO difficulty choice.
// Checks both gestures and returns 'more', 'no', or null.
// =============================================================
export function checkDifficultyGesture() {
  if (!currentLandmarks) return null;
  if (gestureMore(currentLandmarks)) return 'more';
  if (gestureNo(currentLandmarks))   return 'no';
  return null;
}


// =============================================================
// resetGestureState
// Called when a popup closes so partial gesture matches don't
// carry over into the next interaction.
// =============================================================
export function resetGestureState() {
  lastDetectedGesture    = null;
  gestureConfidenceCount = 0;
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
  return false;
}


// ── Gesture detection functions ────────────────────────────
// Each function receives the 21-landmark array from MediaPipe.
// In MediaPipe coords: x and y are 0-1 normalized to the video
// frame. Y increases DOWNWARD, so tip.y < base.y means the
// fingertip is HIGHER than the knuckle = finger is extended.

// PLAY: reuses GO or OUT — any "forward" hand shape starts the game
export function gesturePlay(landmarks) {
  return gestureGo(landmarks) || gestureOut(landmarks);
}

// SNOW: open spread hand — all four fingertips above knuckles,
// thumb spread away from index finger
export function gestureSnow(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const allExtended = tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
  const thumbSpread = Math.abs(landmarks[4].x - landmarks[5].x) > 0.08;
  return allExtended && thumbSpread;
}

// STOP: flat open hand — same check as snow but without the
// thumb spread requirement (thumb can be closer in)
export function gestureStop(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  return tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
}

// GO: index finger extended upward, other three fingers curled
export function gestureGo(landmarks) {
  const indexExtended = landmarks[8].y  < landmarks[6].y;
  const middleCurled  = landmarks[12].y > landmarks[10].y;
  const ringCurled    = landmarks[16].y > landmarks[14].y;
  const pinkyCurled   = landmarks[20].y > landmarks[18].y;
  return indexExtended && middleCurled && ringCurled && pinkyCurled;
}

// HELP: closed fist — all four fingertips curled below PIPs,
// thumb tucked close to index base
export function gestureHelp(landmarks) {
  const allCurled = [8, 12, 16, 20].every(function(tip) {
    return landmarks[tip].y > landmarks[tip - 2].y;
  });
  const thumbIn = Math.abs(landmarks[4].x - landmarks[3].x) < 0.06;
  return allCurled && thumbIn;
}

// OUT: loose open hand — at least 3 of 4 fingers extended,
// thumb away from index. More lenient than STOP to account
// for natural hand variation when signing outward.
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

// LEFT: index pointing left relative to wrist, others curled
export function gestureLeft(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const othersCurled  = landmarks[12].y > landmarks[10].y &&
                        landmarks[16].y > landmarks[14].y &&
                        landmarks[20].y > landmarks[18].y;
  const pointingLeft  = landmarks[8].x < landmarks[0].x - 0.06;
  return indexExtended && othersCurled && pointingLeft;
}

// RIGHT: index pointing right relative to wrist, others curled
export function gestureRight(landmarks) {
  const indexExtended = landmarks[8].y < landmarks[6].y;
  const othersCurled  = landmarks[12].y > landmarks[10].y &&
                        landmarks[16].y > landmarks[14].y &&
                        landmarks[20].y > landmarks[18].y;
  const pointingRight = landmarks[8].x > landmarks[0].x + 0.06;
  return indexExtended && othersCurled && pointingRight;
}

// MORE: fingertips gathered close to thumb tip
// (one-hand approximation of both hands tapping together)
export function gestureMore(landmarks) {
  const thumbTip = landmarks[4];
  return [8, 12, 16, 20].every(function(i) {
    return Math.hypot(landmarks[i].x - thumbTip.x, landmarks[i].y - thumbTip.y) < 0.11;
  });
}

// NO: index and middle extended together and close,
// ring and pinky curled
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

// OPEN: spread hand — all fingers extended AND
// thumb and pinky tips are far apart horizontally
export function gestureOpen(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const allExtended = tips.every(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  });
  const spread = Math.abs(landmarks[4].x - landmarks[20].x) > 0.25;
  return allExtended && spread;
}

// CLOSE: compact hand — some fingers extended but
// thumb and pinky tips are close together horizontally
export function gestureClose(landmarks) {
  const tips  = [8, 12, 16, 20];
  const bases = [6, 10, 14, 18];
  const someExtended = tips.filter(function(tip, i) {
    return landmarks[tip].y < landmarks[bases[i]].y;
  }).length >= 2;
  const compact = Math.abs(landmarks[4].x - landmarks[20].x) < 0.12;
  return someExtended && compact;
}


// =============================================================
// drawHandOverlay
// Draws yellow dots at each of the 21 hand landmark positions
// on the handCanvas element so the player gets visual feedback
// that their hand is being tracked during sign-it mode.
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
