import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp, toRad, toDeg,
  centerOf, unrotatePoint, rotatePoint,
  hitTestBox, distToSegment, closestOnSegment,
  boundsOf, corners, snap,
} from '../dist/core/geometry.js';

const el = (over = {}) => ({
  id: 't', type: 'rect', layer: 'default',
  x: 100, y: 200, width: 80, height: 40, rotation: 0,
  label: '', showLabel: false, locked: false, hidden: false, room: null,
  style: {}, props: {}, actions: [],
  ...over,
});

describe('clamp', () => {
  test('inside range returns the value', () => {
    assert.equal(clamp(5, 0, 10), 5);
  });
  test('clamps below', () => assert.equal(clamp(-3, 0, 10), 0));
  test('clamps above', () => assert.equal(clamp(99, 0, 10), 10));
  test('handles equal min/max', () => assert.equal(clamp(7, 5, 5), 5));
});

describe('toRad / toDeg', () => {
  test('toRad(180) ≈ π', () => assert.ok(Math.abs(toRad(180) - Math.PI) < 1e-9));
  test('toDeg(π) ≈ 180', () => assert.ok(Math.abs(toDeg(Math.PI) - 180) < 1e-9));
  test('toDeg(toRad(x)) ≈ x', () => assert.ok(Math.abs(toDeg(toRad(42.5)) - 42.5) < 1e-9));
});

describe('centerOf', () => {
  test('returns the geometric center', () => {
    assert.deepEqual(centerOf(el()), { x: 140, y: 220 });
  });
});

describe('unrotatePoint / rotatePoint', () => {
  test('angle 0 is a no-op', () => {
    const p = unrotatePoint({ x: 10, y: 20 }, { x: 5, y: 5 }, 0);
    assert.deepEqual(p, { x: 10, y: 20 });
  });
  test('90° unrotate then rotate is identity', () => {
    const p = { x: 7, y: 3 };
    const pivot = { x: 4, y: 2 };
    const r = rotatePoint(unrotatePoint(p, pivot, 90), pivot, 90);
    assert.ok(Math.abs(r.x - p.x) < 1e-9);
    assert.ok(Math.abs(r.y - p.y) < 1e-9);
  });
});

describe('hitTestBox', () => {
  test('inside the box hits', () => {
    assert.equal(hitTestBox(el(), { x: 120, y: 220 }), true);
  });
  test('outside the box misses', () => {
    assert.equal(hitTestBox(el(), { x: 0, y: 0 }), false);
  });
  test('on the edge is included', () => {
    assert.equal(hitTestBox(el(), { x: 100, y: 200 }), true);
  });
  test('respects rotation (rotated 90°)', () => {
    // an 80×40 box rotated 90° becomes effectively 40 wide × 80 tall
    const rotated = el({ rotation: 90 });
    // a point that's inside the un-rotated box but outside the rotated one
    assert.equal(hitTestBox(rotated, { x: 175, y: 220 }), false);
    // a point inside the rotated bounds
    assert.equal(hitTestBox(rotated, { x: 140, y: 240 }), true);
  });
});

describe('distToSegment', () => {
  test('point on segment → 0', () => {
    const d = distToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.ok(d < 1e-9);
  });
  test('perpendicular distance', () => {
    const d = distToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.ok(Math.abs(d - 4) < 1e-9);
  });
  test('endpoint distance when projection is outside', () => {
    const d = distToSegment({ x: -3, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.ok(Math.abs(d - 3) < 1e-9);
  });
  test('degenerate segment (a == b)', () => {
    const d = distToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    assert.ok(Math.abs(d - 5) < 1e-9);
  });
});

describe('closestOnSegment', () => {
  test('projection inside returns the foot', () => {
    const p = closestOnSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.deepEqual({ x: p.x, y: p.y }, { x: 5, y: 0 });
    assert.equal(p.t, 0.5);
  });
  test('projection outside clamps to endpoints', () => {
    const a = closestOnSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.deepEqual({ x: a.x, y: a.y, t: a.t }, { x: 0, y: 0, t: 0 });
    const b = closestOnSegment({ x: 99, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 });
    assert.deepEqual({ x: b.x, y: b.y, t: b.t }, { x: 10, y: 0, t: 1 });
  });
  test('degenerate segment', () => {
    const p = closestOnSegment({ x: 3, y: 4 }, { x: 1, y: 1 }, { x: 1, y: 1 });
    assert.deepEqual({ x: p.x, y: p.y, t: p.t }, { x: 1, y: 1, t: 0 });
  });
});

describe('boundsOf', () => {
  test('axis-aligned box', () => {
    assert.deepEqual(boundsOf(el()), { minX: 100, minY: 200, maxX: 180, maxY: 240 });
  });
  test('rotated box has enlarged AABB', () => {
    const b = boundsOf(el({ rotation: 45 }));
    assert.ok(b.maxX - b.minX > 80, 'wider than the original width');
    assert.ok(b.maxY - b.minY > 40, 'taller than the original height');
  });
});

describe('corners', () => {
  test('returns four labelled corners', () => {
    const c = corners(el());
    assert.deepEqual(c.nw, { x: 100, y: 200 });
    assert.deepEqual(c.ne, { x: 180, y: 200 });
    assert.deepEqual(c.se, { x: 180, y: 240 });
    assert.deepEqual(c.sw, { x: 100, y: 240 });
  });
});

describe('snap', () => {
  test('zero/negative step disables snapping', () => {
    assert.equal(snap(7.3, 0), 7.3);
    assert.equal(snap(7.3, -1), 7.3);
  });
  test('rounds to the nearest multiple', () => {
    assert.equal(snap(7.3, 5), 5);
    assert.equal(snap(7.6, 5), 10);
    assert.equal(snap(-3, 4), -4);
  });
});
