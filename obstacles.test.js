// =============================================================
// tests/obstacles.test.js
// Data integrity tests for OBSTACLE_TYPES.
// These tests verify that every obstacle entry is correctly
// structured — so adding a new obstacle without all required
// fields gets caught immediately by the test runner rather
// than silently breaking the game at runtime.
// =============================================================

import { describe, it, expect } from 'vitest';
import { OBSTACLE_TYPES } from '../obstacles.js';

describe('OBSTACLE_TYPES data integrity', function() {

  it('array is not empty', function() {
    expect(OBSTACLE_TYPES.length).toBeGreaterThan(0);
  });

  it('every obstacle has a non-empty id string', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      expect(typeof type.id).toBe('string');
      expect(type.id.length).toBeGreaterThan(0);
    });
  });

  it('every obstacle has a non-empty label string', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      expect(typeof type.label).toBe('string');
      expect(type.label.length).toBeGreaterThan(0);
    });
  });

  it('every obstacle has a valid mechanic', function() {
    const valid = ['choice', 'signIt', 'avoid'];
    OBSTACLE_TYPES.forEach(function(type) {
      expect(valid).toContain(type.mechanic);
    });
  });

  it('every signIt obstacle has a gesture string', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      if (type.mechanic === 'signIt') {
        expect(typeof type.gesture).toBe('string');
        expect(type.gesture.length).toBeGreaterThan(0);
      }
    });
  });

  it('every signIt obstacle has a signImage path ending in .png or .gif', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      if (type.mechanic === 'signIt') {
        expect(typeof type.signImage).toBe('string');
        expect(type.signImage).toMatch(/\.(png|gif|jpg)$/);
      }
    });
  });

  it('every choice obstacle has a correctKey string', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      if (type.mechanic === 'choice') {
        expect(typeof type.correctKey).toBe('string');
        expect(['s', 'g', 'p']).toContain(type.correctKey);
      }
    });
  });

  it('every choice obstacle has all three sign image paths', function() {
    OBSTACLE_TYPES.forEach(function(type) {
      if (type.mechanic === 'choice') {
        expect(typeof type.signs).toBe('object');
        expect(typeof type.signs.s).toBe('string');
        expect(typeof type.signs.g).toBe('string');
        expect(typeof type.signs.p).toBe('string');
      }
    });
  });

  it('all obstacle ids are unique', function() {
    const ids = OBSTACLE_TYPES.map(function(t) { return t.id; });
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('mud obstacle is present and correctly configured', function() {
    const mud = OBSTACLE_TYPES.find(function(t) { return t.id === 'mud'; });
    expect(mud).toBeDefined();
    expect(mud.mechanic).toBe('choice');
    expect(mud.correctKey).toBe('g');
  });

  it('snow obstacle is present and correctly configured', function() {
    const snow = OBSTACLE_TYPES.find(function(t) { return t.id === 'snow'; });
    expect(snow).toBeDefined();
    expect(snow.mechanic).toBe('signIt');
    expect(snow.gesture).toBe('snow');
  });

  it('tollOpen obstacle is present and correctly configured', function() {
    const toll = OBSTACLE_TYPES.find(function(t) { return t.id === 'tollOpen'; });
    expect(toll).toBeDefined();
    expect(toll.mechanic).toBe('signIt');
    expect(toll.gesture).toBe('open');
  });

  it('no tunnel obstacles exist (removed in current version)', function() {
    const tunnelIds = ['tunnel_in', 'tunnel_out'];
    OBSTACLE_TYPES.forEach(function(type) {
      expect(tunnelIds).not.toContain(type.id);
    });
  });

});
