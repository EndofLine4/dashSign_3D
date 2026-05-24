// =============================================================
// tests/gestures.test.js
// Unit tests for every gesture recognition function.
// Gesture functions are pure math — they take a landmarks array
// and return true/false, with zero browser or Three.js dependency.
//
// MediaPipe coordinate system:
//   x, y are 0–1 normalized to the video frame
//   y INCREASES downward — so tip.y < base.y means finger is UP
//
// makeLandmarks() builds a neutral 21-point array.
// Individual landmarks are overridden per test to simulate
// specific hand shapes.
// =============================================================

import { describe, it, expect } from 'vitest';
import {
  gestureSnow, gestureStop, gestureGo, gestureHelp,
  gestureLeft, gestureRight, gestureMore, gestureNo,
  gestureOpen, gestureClose, gesturePlay
} from '../gestures.js';


// ── Test helper ─────────────────────────────────────────────
// Returns a flat array of 21 landmarks at neutral positions.
// All at x=0.5, y=0.5 — neither extended nor curled.
function makeLandmarks() {
  const lm = [];
  for (let i = 0; i < 21; i++) {
    lm.push({ x: 0.5, y: 0.5, z: 0 });
  }
  return lm;
}

// Helper: extend all four fingers (tips above bases, y-wise)
function extendAllFingers(lm) {
  [8, 12, 16, 20].forEach(function(tip) { lm[tip].y = 0.15; });
  [6, 10, 14, 18].forEach(function(base) { lm[base].y = 0.50; });
  return lm;
}

// Helper: curl all four fingers (tips below bases)
function curlAllFingers(lm) {
  [8, 12, 16, 20].forEach(function(tip) { lm[tip].y = 0.85; });
  [6, 10, 14, 18].forEach(function(base) { lm[base].y = 0.50; });
  return lm;
}

// Helper: extend only index finger, curl the rest
function extendIndexOnly(lm) {
  lm[8].y = 0.15; lm[6].y = 0.50;  // index extended
  lm[12].y = 0.85; lm[10].y = 0.50; // middle curled
  lm[16].y = 0.85; lm[14].y = 0.50; // ring curled
  lm[20].y = 0.85; lm[18].y = 0.50; // pinky curled
  return lm;
}


// ── SNOW ────────────────────────────────────────────────────
describe('gestureSnow', function() {

  it('detects an open spread hand', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[4].x = 0.2;   // thumb tip left
    lm[5].x = 0.5;   // index base right — spread > 0.08 threshold
    expect(gestureSnow(lm)).toBe(true);
  });

  it('rejects when fingers are curled', function() {
    const lm = makeLandmarks();
    curlAllFingers(lm);
    lm[4].x = 0.2; lm[5].x = 0.5;
    expect(gestureSnow(lm)).toBe(false);
  });

  it('rejects when thumb is not spread from index', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[4].x = 0.49; lm[5].x = 0.5; // thumb and index very close
    expect(gestureSnow(lm)).toBe(false);
  });

});


// ── STOP ────────────────────────────────────────────────────
describe('gestureStop', function() {

  it('detects flat open hand with all fingers extended', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    expect(gestureStop(lm)).toBe(true);
  });

  it('rejects when pinky is curled', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[20].y = 0.85; // pinky curled
    expect(gestureStop(lm)).toBe(false);
  });

  it('rejects a fully curled fist', function() {
    const lm = makeLandmarks();
    curlAllFingers(lm);
    expect(gestureStop(lm)).toBe(false);
  });

});


// ── GO ──────────────────────────────────────────────────────
describe('gestureGo', function() {

  it('detects index extended with others curled', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    expect(gestureGo(lm)).toBe(true);
  });

  it('rejects when middle finger is also extended', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    lm[12].y = 0.15; lm[10].y = 0.50; // middle also extended
    expect(gestureGo(lm)).toBe(false);
  });

  it('rejects a fully open hand', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    expect(gestureGo(lm)).toBe(false);
  });

});


// ── HELP ────────────────────────────────────────────────────
describe('gestureHelp', function() {

  it('detects a closed fist with thumb tucked in', function() {
    const lm = makeLandmarks();
    // All tips below tip-2 (curled fist check)
    [8, 12, 16, 20].forEach(function(tip) {
      lm[tip].y     = 0.85;
      lm[tip - 2].y = 0.50;
    });
    lm[4].x = 0.48; lm[3].x = 0.50; // thumb tucked close
    expect(gestureHelp(lm)).toBe(true);
  });

  it('rejects when thumb is spread out', function() {
    const lm = makeLandmarks();
    [8, 12, 16, 20].forEach(function(tip) {
      lm[tip].y     = 0.85;
      lm[tip - 2].y = 0.50;
    });
    lm[4].x = 0.2; lm[3].x = 0.5; // thumb far from index
    expect(gestureHelp(lm)).toBe(false);
  });

});


// ── OPEN ────────────────────────────────────────────────────
describe('gestureOpen', function() {

  it('detects all fingers extended and thumb/pinky spread wide', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[4].x  = 0.15;  // thumb far left
    lm[20].x = 0.80;  // pinky far right — spread > 0.25
    expect(gestureOpen(lm)).toBe(true);
  });

  it('rejects when fingers are extended but not spread enough', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[4].x  = 0.46;  // thumb and pinky close together
    lm[20].x = 0.54;
    expect(gestureOpen(lm)).toBe(false);
  });

  it('rejects when fingers are curled even if spread', function() {
    const lm = makeLandmarks();
    curlAllFingers(lm);
    lm[4].x = 0.1; lm[20].x = 0.9;
    expect(gestureOpen(lm)).toBe(false);
  });

});


// ── CLOSE ───────────────────────────────────────────────────
describe('gestureClose', function() {

  it('detects a compact hand with some fingers extended', function() {
    const lm = makeLandmarks();
    // Extend index and middle
    lm[8].y = 0.15; lm[6].y = 0.50;
    lm[12].y = 0.15; lm[10].y = 0.50;
    // Curl ring and pinky
    lm[16].y = 0.85; lm[14].y = 0.50;
    lm[20].y = 0.85; lm[18].y = 0.50;
    // Thumb and pinky close together
    lm[4].x  = 0.48;
    lm[20].x = 0.52;
    expect(gestureClose(lm)).toBe(true);
  });

  it('rejects a widely spread hand', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[4].x  = 0.1;
    lm[20].x = 0.9;
    expect(gestureClose(lm)).toBe(false);
  });

});


// ── MORE ────────────────────────────────────────────────────
describe('gestureMore', function() {

  it('detects fingertips gathered near thumb', function() {
    const lm = makeLandmarks();
    lm[4] = { x: 0.50, y: 0.50, z: 0 }; // thumb tip center
    // All finger tips very close to thumb
    [8, 12, 16, 20].forEach(function(i) {
      lm[i] = { x: 0.51, y: 0.51, z: 0 };
    });
    expect(gestureMore(lm)).toBe(true);
  });

  it('rejects when fingertips are spread from thumb', function() {
    const lm = makeLandmarks();
    lm[4]  = { x: 0.5, y: 0.5, z: 0 };
    lm[8]  = { x: 0.9, y: 0.1, z: 0 }; // far from thumb
    lm[12] = { x: 0.1, y: 0.9, z: 0 };
    lm[16] = { x: 0.9, y: 0.9, z: 0 };
    lm[20] = { x: 0.1, y: 0.1, z: 0 };
    expect(gestureMore(lm)).toBe(false);
  });

});


// ── NO ──────────────────────────────────────────────────────
describe('gestureNo', function() {

  it('detects index and middle extended together and close', function() {
    const lm = makeLandmarks();
    lm[8].y  = 0.15; lm[6].y  = 0.50; // index extended
    lm[12].y = 0.15; lm[10].y = 0.50; // middle extended
    lm[16].y = 0.85; lm[14].y = 0.50; // ring curled
    lm[20].y = 0.85; lm[18].y = 0.50; // pinky curled
    // Index and middle tips close together
    lm[8].x  = 0.50;
    lm[12].x = 0.54;
    lm[8].y  = 0.15;
    lm[12].y = 0.18;
    expect(gestureNo(lm)).toBe(true);
  });

  it('rejects when ring and pinky are also extended', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm); // all four extended — not NO
    lm[8].x = 0.50; lm[12].x = 0.52;
    expect(gestureNo(lm)).toBe(false);
  });

});


// ── LEFT / RIGHT ────────────────────────────────────────────
describe('gestureLeft', function() {

  it('detects index pointing left of wrist', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    lm[0].x = 0.5;   // wrist center
    lm[8].x = 0.35;  // index tip left of wrist (0.5 - 0.06 = 0.44, 0.35 < 0.44)
    expect(gestureLeft(lm)).toBe(true);
  });

  it('rejects when index tip is to the right of wrist', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    lm[0].x = 0.5;
    lm[8].x = 0.65;
    expect(gestureLeft(lm)).toBe(false);
  });

  it('rejects when other fingers are extended', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    lm[0].x = 0.5;
    lm[8].x = 0.35;
    expect(gestureLeft(lm)).toBe(false);
  });

});

describe('gestureRight', function() {

  it('detects index pointing right of wrist', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    lm[0].x = 0.5;
    lm[8].x = 0.65;  // index tip right of wrist (0.5 + 0.06 = 0.56, 0.65 > 0.56)
    expect(gestureRight(lm)).toBe(true);
  });

  it('rejects when index tip is to the left of wrist', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    lm[0].x = 0.5;
    lm[8].x = 0.35;
    expect(gestureRight(lm)).toBe(false);
  });

});


// ── PLAY ────────────────────────────────────────────────────
describe('gesturePlay', function() {

  it('accepts a GO hand shape (reuses gestureGo)', function() {
    const lm = makeLandmarks();
    extendIndexOnly(lm);
    expect(gesturePlay(lm)).toBe(true);
  });

  it('accepts an OUT hand shape (reuses gestureOut)', function() {
    const lm = makeLandmarks();
    extendAllFingers(lm);
    // gestureOut checks at least 3 extended + thumb away
    lm[4].x = 0.2; lm[5].x = 0.5; // thumb away from index
    expect(gesturePlay(lm)).toBe(true);
  });

});
