import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../dist/render/camera.js';

describe('Camera', () => {
  test('default identity transform', () => {
    const cam = new Camera();
    assert.deepEqual(cam.worldToScreen({ x: 10, y: 20 }), { x: 10, y: 20 });
    assert.deepEqual(cam.screenToWorld({ x: 10, y: 20 }), { x: 10, y: 20 });
  });
  test('worldToScreen ↔ screenToWorld inverse', () => {
    const cam = new Camera();
    cam.zoom = 2.5; cam.x = 33; cam.y = -10;
    const p = { x: 70, y: 5 };
    const round = cam.screenToWorld(cam.worldToScreen(p));
    assert.ok(Math.abs(round.x - p.x) < 1e-9);
    assert.ok(Math.abs(round.y - p.y) < 1e-9);
  });
  test('panBy translates the camera', () => {
    const cam = new Camera();
    cam.panBy(50, -20);
    assert.equal(cam.x, 50);
    assert.equal(cam.y, -20);
  });
  test('zoomAt keeps the focal screen point stationary', () => {
    const cam = new Camera();
    const focal = { x: 100, y: 100 };
    const beforeWorld = cam.screenToWorld(focal);
    cam.zoomAt(focal, 2);
    const afterWorld = cam.screenToWorld(focal);
    assert.ok(Math.abs(beforeWorld.x - afterWorld.x) < 1e-9);
    assert.ok(Math.abs(beforeWorld.y - afterWorld.y) < 1e-9);
  });
  test('setZoom clamps to [minZoom, maxZoom]', () => {
    const cam = new Camera({ minZoom: 0.5, maxZoom: 4 });
    cam.setZoom(99);
    assert.equal(cam.zoom, 4);
    cam.setZoom(0.01);
    assert.equal(cam.zoom, 0.5);
  });
  test('setZoom around a screen point preserves the focal world point', () => {
    const cam = new Camera();
    const focal = { x: 50, y: 50 };
    const w1 = cam.screenToWorld(focal);
    cam.setZoom(2, focal);
    const w2 = cam.screenToWorld(focal);
    assert.ok(Math.abs(w1.x - w2.x) < 1e-9);
  });
  test('fitTo centers and scales a box into the viewport', () => {
    const cam = new Camera();
    cam.fitTo({ x: 0, y: 0, width: 100, height: 100 }, 200, 200, 0);
    assert.equal(cam.zoom, 2);
    // 100×2 = 200 → centered: offset 0,0
    assert.equal(cam.x, 0);
    assert.equal(cam.y, 0);
  });
  test('fitTo with padding shrinks zoom', () => {
    const cam = new Camera();
    cam.fitTo({ x: 0, y: 0, width: 100, height: 100 }, 200, 200, 20);
    assert.ok(cam.zoom < 2);
  });
});
