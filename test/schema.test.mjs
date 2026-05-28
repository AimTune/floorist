import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT_VERSION, DEFAULT_BUILDING, DEFAULT_FLOOR,
  normalizeBuilding, normalizeFloor, normalizeElement, normalizeAction,
  validateDocument, uid,
} from '../dist/core/schema.js';

describe('uid', () => {
  test('returns a string with the given prefix', () => {
    const id = uid('test');
    assert.equal(typeof id, 'string');
    assert.ok(id.startsWith('test_'), `got ${id}`);
  });
  test('successive ids are different', () => {
    assert.notEqual(uid('x'), uid('x'));
  });
  test('default prefix is "el"', () => {
    assert.ok(uid().startsWith('el_'));
  });
});

describe('normalizeElement', () => {
  test('throws on missing type', () => {
    assert.throws(() => normalizeElement({}), /missing "type"/);
  });
  test('throws on non-object', () => {
    assert.throws(() => normalizeElement(null), /must be an object/);
  });
  test('fills defaults for unspecified fields', () => {
    const el = normalizeElement({ type: 'rect' });
    assert.equal(el.type, 'rect');
    assert.equal(el.layer, 'default');
    assert.equal(el.x, 0);
    assert.equal(el.y, 0);
    assert.equal(el.rotation, 0);
    assert.equal(el.label, '');
    assert.equal(el.showLabel, false); // opt-in
    assert.equal(el.locked, false);
    assert.equal(el.hidden, false);
    assert.equal(el.room, null);
    assert.deepEqual(el.actions, []);
  });
  test('applies type defaults (width/height/style/props)', () => {
    const el = normalizeElement(
      { type: 'rect' },
      { width: 200, height: 100, style: { fill: '#abc' }, props: { custom: 1 } },
    );
    assert.equal(el.width, 200);
    assert.equal(el.height, 100);
    assert.equal(el.style.fill, '#abc');
    assert.equal(el.props.custom, 1);
  });
  test('explicit values win over defaults', () => {
    const el = normalizeElement(
      { type: 'rect', width: 50, style: { fill: 'red' } },
      { width: 200, style: { fill: '#abc', stroke: '#def' } },
    );
    assert.equal(el.width, 50);
    assert.equal(el.style.fill, 'red');
    assert.equal(el.style.stroke, '#def', 'default stroke is preserved');
  });
  test('showLabel is strictly boolean true', () => {
    assert.equal(normalizeElement({ type: 'rect', showLabel: 'yes' }).showLabel, false);
    assert.equal(normalizeElement({ type: 'rect', showLabel: true }).showLabel, true);
  });
});

describe('normalizeAction', () => {
  test('fills id + on/do defaults', () => {
    const a = normalizeAction({ do: 'toggle', prop: 'open' });
    assert.equal(typeof a.id, 'string');
    assert.equal(a.on, 'click');
    assert.equal(a.do, 'toggle');
    assert.equal(a.prop, 'open');
  });
});

describe('normalizeFloor', () => {
  test('produces a default-shaped floor from empty input', () => {
    const f = normalizeFloor({});
    assert.equal(f.id, 'ground');
    assert.equal(f.name, 'Ground floor');
    assert.equal(f.level, 0);
    assert.ok(Array.isArray(f.layers) && f.layers.length > 0);
    assert.deepEqual(f.elements, []);
  });
  test('reassigns orphan element layers to the first layer', () => {
    const f = normalizeFloor({
      layers: [{ id: 'a', name: 'A' }],
      elements: [{ type: 'rect', layer: 'nope' }],
    });
    assert.equal(f.elements[0].layer, 'a');
  });
});

describe('normalizeBuilding', () => {
  test('empty input yields the default building', () => {
    const b = normalizeBuilding({});
    assert.equal(b.version, FORMAT_VERSION);
    assert.ok(Array.isArray(b.floors) && b.floors.length === 1);
    assert.equal(b.activeFloor, b.floors[0].id);
  });
  test('legacy single-plan migrates to a one-floor building', () => {
    const b = normalizeBuilding({
      size: { width: 500, height: 400 },
      layers: [{ id: 'l1', name: 'L1' }],
      elements: [{ type: 'rect', x: 1, y: 1 }],
    });
    assert.equal(b.floors.length, 1);
    assert.equal(b.floors[0].size.width, 500);
    assert.equal(b.floors[0].elements.length, 1);
  });
  test('invalid activeFloor falls back to the first floor', () => {
    const b = normalizeBuilding({ floors: [{ id: 'a' }, { id: 'b' }], activeFloor: 'missing' });
    assert.equal(b.activeFloor, 'a');
  });
  test('preserves valid activeFloor', () => {
    const b = normalizeBuilding({ floors: [{ id: 'a' }, { id: 'b' }], activeFloor: 'b' });
    assert.equal(b.activeFloor, 'b');
  });
});

describe('validateDocument', () => {
  test('rejects non-object', () => {
    const r = validateDocument(null);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });
  test('requires floors[]', () => {
    const r = validateDocument({ floors: [] });
    assert.equal(r.ok, false);
  });
  test('flags elements missing type/id', () => {
    const r = validateDocument({
      floors: [{ id: 'f', name: 'F', layers: [{ id: 'l' }], elements: [{}] }],
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /missing type/.test(e)));
    assert.ok(r.errors.some((e) => /missing id/.test(e)));
  });
  test('accepts a normalized building', () => {
    const r = validateDocument(normalizeBuilding({}));
    assert.equal(r.ok, true, r.errors.join(', '));
  });
});

describe('frozen defaults', () => {
  test('DEFAULT_BUILDING + DEFAULT_FLOOR are frozen', () => {
    assert.throws(() => { DEFAULT_BUILDING.version = 'x'; });
    assert.throws(() => { DEFAULT_FLOOR.id = 'x'; });
  });
});
