import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FloorPlanModel } from '../dist/core/model.js';
import { getWallSegments, snapToWalls, snapsToWall } from '../dist/core/walls.js';
import { normalizeFloor } from '../dist/core/schema.js';

const floorWith = (elements) => normalizeFloor({
  id: 'g', name: 'G', level: 0,
  size: { width: 800, height: 600 },
  layers: [{ id: 'd', name: 'D' }],
  elements,
});

describe('getWallSegments — sources', () => {
  test('a `floor` element contributes 4 inset perimeter segments', () => {
    const f = floorWith([
      { type: 'floor', x: 0, y: 0, width: 200, height: 100, style: { wall: 10, stroke: '#000' } },
    ]);
    const segs = getWallSegments(f);
    assert.equal(segs.length, 4);
    // top segment goes from (5,5) → (195,5) — inset by wall/2
    const top = segs.find((s) => s.a.y === 5 && s.b.y === 5);
    assert.ok(top, 'has the top segment inset by wall/2');
    assert.equal(top.thickness, 10);
    assert.equal(top.sourceType, 'floor');
  });
  test('a `room` element contributes 4 thin perimeter segments', () => {
    const f = floorWith([
      { type: 'room', x: 10, y: 10, width: 100, height: 50 },
    ]);
    const segs = getWallSegments(f);
    assert.equal(segs.length, 4);
    assert.ok(segs.every((s) => s.sourceType === 'room'));
    assert.equal(segs[0].thickness, 0);
  });
  test('a standalone `wall` produces one segment along its long axis', () => {
    const horiz = floorWith([{ type: 'wall', x: 0, y: 50, width: 200, height: 8 }]);
    const segs = getWallSegments(horiz);
    assert.equal(segs.length, 1);
    // the segment runs horizontally through the wall's center y = 54
    assert.equal(segs[0].a.y, 54);
    assert.equal(segs[0].b.y, 54);
    assert.equal(segs[0].thickness, 8);
  });
  test('vertical standalone wall picks the vertical axis', () => {
    const vert = floorWith([{ type: 'wall', x: 50, y: 0, width: 8, height: 200 }]);
    const segs = getWallSegments(vert);
    assert.equal(segs.length, 1);
    assert.equal(segs[0].a.x, 54);
    assert.equal(segs[0].b.x, 54);
  });
  test('hidden elements contribute nothing', () => {
    const f = floorWith([{ type: 'wall', x: 0, y: 50, width: 200, height: 8, hidden: true }]);
    assert.equal(getWallSegments(f).length, 0);
  });
  test('rotated room rotates its perimeter segments', () => {
    const f = floorWith([{ type: 'room', x: 0, y: 0, width: 100, height: 100, rotation: 45 }]);
    const segs = getWallSegments(f);
    // an axis-aligned square rotated 45° → no segments stay exactly horizontal
    const horizontalCount = segs.filter((s) => Math.abs(s.a.y - s.b.y) < 1e-6).length;
    assert.equal(horizontalCount, 0);
  });
  test('tiny standalone walls are dropped', () => {
    const f = floorWith([{ type: 'wall', x: 0, y: 0, width: 2, height: 2 }]);
    assert.equal(getWallSegments(f).length, 0);
  });
});

describe('snapToWalls', () => {
  const segs = getWallSegments(floorWith([
    { type: 'floor', x: 0, y: 0, width: 200, height: 100, style: { wall: 10, stroke: '#000' } },
  ]));

  test('finds the nearest segment + its angle', () => {
    const r = snapToWalls({ x: 100, y: 20 }, segs); // above the top wall
    assert.ok(r);
    assert.equal(r.point.y, 5, 'snaps onto the inset top wall');
    assert.ok(Math.abs(r.angleDeg) < 1e-6, 'top wall is horizontal');
    assert.ok(r.distance > 0);
  });
  test('returns null when no segments exist', () => {
    assert.equal(snapToWalls({ x: 0, y: 0 }, []), null);
  });
  test('excludeId skips a segment from a given element', () => {
    const all = snapToWalls({ x: 100, y: 50 }, segs);
    const skipped = snapToWalls({ x: 100, y: 50 }, segs, all.segment.sourceId);
    assert.equal(skipped, null, 'no other walls in this floor');
  });
});

describe('snapsToWall — heuristic', () => {
  const baseDoor = {
    id: 'd', type: 'door', x: 0, y: 0, width: 70, height: 70, rotation: 0,
    label: '', showLabel: false, locked: false, hidden: false, room: null,
    style: {}, props: {}, actions: [],
  };
  test('door / door-double / door-slide / window default to true', () => {
    assert.equal(snapsToWall({ ...baseDoor, type: 'door' }), true);
    assert.equal(snapsToWall({ ...baseDoor, type: 'door-double' }), true);
    assert.equal(snapsToWall({ ...baseDoor, type: 'door-slide' }), true);
    assert.equal(snapsToWall({ ...baseDoor, type: 'window' }), true);
  });
  test('explicit props.snap = false frees an element', () => {
    assert.equal(snapsToWall({ ...baseDoor, props: { snap: false } }), false);
  });
  test('explicit props.snap = true opts a non-wall type IN', () => {
    assert.equal(snapsToWall({ ...baseDoor, type: 'chair', props: { snap: true } }), true);
  });
  test('non-wall types default to false', () => {
    assert.equal(snapsToWall({ ...baseDoor, type: 'chair', props: {} }), false);
  });
});

describe('FloorPlanModel + walls integration', () => {
  test('walls extracted via the model', () => {
    const m = new FloorPlanModel({
      floors: [{
        id: 'g', name: 'G', level: 0,
        size: { width: 800, height: 600 },
        layers: [{ id: 'd', name: 'D' }],
        elements: [
          { type: 'floor', x: 0, y: 0, width: 200, height: 200, style: { wall: 12, stroke: '#000' } },
          { type: 'wall', x: 50, y: 50, width: 80, height: 10 },
        ],
      }],
      activeFloor: 'g',
    });
    const segs = getWallSegments(m.activeFloor);
    assert.ok(segs.length >= 5, `got ${segs.length}`);
  });
});
