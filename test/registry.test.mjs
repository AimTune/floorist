import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerType, getType, hasType, listTypes,
  getTypeDefaults, hitTest,
} from '../dist/elements/registry.js';

describe('built-in types', () => {
  const expected = [
    'rect', 'circle', 'floor', 'room', 'wall',
    'door', 'door-double', 'door-slide', 'window',
    'stairs', 'table-round', 'table-rect',
    'chair', 'sofa', 'ac', 'plant', 'entrance', 'wc',
    'text', 'image',
  ];
  for (const type of expected) {
    test(`"${type}" is registered`, () => {
      assert.equal(hasType(type), true);
    });
  }
  test('listTypes returns every registered definition', () => {
    const all = listTypes();
    assert.ok(all.length >= expected.length, `got ${all.length}`);
    for (const t of expected) assert.ok(all.some((d) => d.type === t), t);
  });
});

describe('getType', () => {
  test('returns the matching definition', () => {
    const d = getType('table-round');
    assert.equal(d.type, 'table-round');
    assert.equal(d.category, 'furniture');
  });
  test('unknown type falls back to "rect"', () => {
    const d = getType('does-not-exist');
    assert.equal(d.type, 'rect');
  });
});

describe('getTypeDefaults', () => {
  test('returns size + style + props for door', () => {
    const d = getTypeDefaults('door');
    assert.equal(d.width, 80);
    assert.equal(d.height, 80);
    assert.equal(d.props.open, true);
    assert.equal(d.props.snap, true);
  });
  test('returns {} for unknown type', () => {
    assert.deepEqual(getTypeDefaults('nope'), {});
  });
  test('door-double has wider default width', () => {
    assert.equal(getTypeDefaults('door-double').width, 140);
  });
});

describe('hitTest', () => {
  const elBase = (over = {}) => ({
    id: 'x', type: 'rect', layer: 'd',
    x: 0, y: 0, width: 100, height: 50, rotation: 0,
    label: '', showLabel: false, locked: false, hidden: false, room: null,
    style: {}, props: {}, actions: [],
    ...over,
  });
  test('default box hit-test', () => {
    assert.equal(hitTest(elBase({ type: 'rect' }), { x: 50, y: 25 }), true);
    assert.equal(hitTest(elBase({ type: 'rect' }), { x: -1, y: -1 }), false);
  });
  test('floor uses its wall-band hit-test (interior misses)', () => {
    const f = elBase({ type: 'floor', width: 200, height: 200, style: { wall: 12 } });
    // wall band hits
    assert.equal(hitTest(f, { x: 5, y: 100 }), true);
    // interior is intentionally not hittable
    assert.equal(hitTest(f, { x: 100, y: 100 }), false);
  });
});

describe('registerType', () => {
  test('rejects definitions without a type', () => {
    assert.throws(() => registerType({ category: 'misc', label: 'X', draw: () => {} }));
  });
  test('a custom type appears in listTypes', () => {
    const before = listTypes().length;
    registerType({
      type: 'unit-test-piano',
      category: 'furniture',
      label: 'Piano',
      draw: () => {},
    });
    assert.equal(hasType('unit-test-piano'), true);
    assert.equal(listTypes().length, before + 1);
  });
});
