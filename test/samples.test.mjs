// Smoke-test every example floor plan so the on-disk samples can't drift
// without us noticing (load → validate → walk the public API).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FloorPlanModel } from '../dist/core/model.js';
import { getWallSegments } from '../dist/core/walls.js';
import { encodeShare, decodeShare } from '../dist/core/share.js';
import SAMPLES from '../demo/samples.js';

describe('SAMPLES — index', () => {
  test('every sample has an id, name and document', () => {
    for (const s of SAMPLES) {
      assert.ok(s.id && typeof s.id === 'string', `sample id: ${s.id}`);
      assert.ok(s.name);
      assert.ok(s.document);
    }
  });
});

for (const s of SAMPLES) {
  describe(`SAMPLES — ${s.id}`, () => {
    test('loads + validates', () => {
      const m = new FloorPlanModel(s.document);
      const v = m.validate();
      assert.equal(v.ok, true, v.errors.join(', '));
    });
    test('round-trips through share encoding', () => {
      const m = new FloorPlanModel(s.document);
      const out = decodeShare(encodeShare(m.toJSON()));
      assert.equal(out.floors.length, m.floors.length);
    });
    test('produces wall segments (where applicable)', () => {
      const m = new FloorPlanModel(s.document);
      const segs = getWallSegments(m.activeFloor);
      // 'blank' has nothing, but every other sample has a perimeter
      if (s.id !== 'blank') assert.ok(segs.length > 0, `no walls in ${s.id}`);
    });
  });
}

describe('SAMPLES — building (multi-floor)', () => {
  const b = new FloorPlanModel(SAMPLES.find((s) => s.id === 'building').document);
  test('has multiple floors', () => {
    assert.ok(b.floors.length >= 2);
  });
  test('ground floor shows all 3 door types', () => {
    const types = new Set(b.activeFloor.elements.map((e) => e.type));
    assert.ok(types.has('door'));
    assert.ok(types.has('door-double'));
    assert.ok(types.has('door-slide'));
  });
});
