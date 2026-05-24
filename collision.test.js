// =============================================================
// tests/collision.test.js
// Unit tests for the boxesOverlap collision function.
// This function is the foundation of the game loop —
// if it breaks, nothing stops the car when it should.
// Run with: npm test
// =============================================================

import { describe, it, expect } from 'vitest';
import { boxesOverlap } from '../obstacles.js';

describe('boxesOverlap', function() {

  it('returns true when objects are at the same position', function() {
    expect(boxesOverlap(0, 0, 0, 0, 2.5, 3)).toBe(true);
  });

  it('returns true when objects overlap on both axes', function() {
    expect(boxesOverlap(1, 1, 0, 0, 2.5, 3)).toBe(true);
  });

  it('returns false when too far apart on X axis', function() {
    expect(boxesOverlap(6, 0, 0, 0, 2.5, 3)).toBe(false);
  });

  it('returns false when too far apart on Z axis', function() {
    expect(boxesOverlap(0, 9, 0, 0, 2.5, 3)).toBe(false);
  });

  it('returns false when beyond threshold on both axes', function() {
    expect(boxesOverlap(6, 9, 0, 0, 2.5, 3)).toBe(false);
  });

  it('returns true just inside X threshold', function() {
    expect(boxesOverlap(2.4, 0, 0, 0, 2.5, 3)).toBe(true);
  });

  it('returns false just outside X threshold', function() {
    expect(boxesOverlap(2.6, 0, 0, 0, 2.5, 3)).toBe(false);
  });

  it('returns true just inside Z threshold', function() {
    expect(boxesOverlap(0, 2.9, 0, 0, 2.5, 3)).toBe(true);
  });

  it('returns false just outside Z threshold', function() {
    expect(boxesOverlap(0, 3.1, 0, 0, 2.5, 3)).toBe(false);
  });

  it('works with negative positions', function() {
    expect(boxesOverlap(-1, -1, 0, 0, 2.5, 3)).toBe(true);
  });

  it('works when both objects are offset from origin', function() {
    expect(boxesOverlap(10, 10, 11, 11, 2.5, 3)).toBe(true);
  });

});
