import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FloorPlanModel } from '../dist/core/model.js';
import { hitTest } from '../dist/elements/registry.js';

const sampleBuilding = () => ({
  version: '2.0',
  meta: { name: 'B', units: 'm', scale: 50 },
  activeFloor: 'g',
  floors: [
    {
      id: 'g', name: 'Ground', level: 0,
      size: { width: 800, height: 600 },
      background: { color: '#fff', grid: { enabled: true, size: 25 } },
      layers: [{ id: 'default', name: 'D', visible: true, opacity: 1 }],
      elements: [
        { id: 'r1', type: 'room', x: 50, y: 50, width: 300, height: 200, label: 'Lobby' },
        { id: 't1', type: 'table-round', x: 120, y: 120, width: 60, height: 60 },
        { id: 't2', type: 'table-round', x: 220, y: 120, width: 60, height: 60 },
      ],
    },
    {
      id: 'f1', name: 'Floor 1', level: 1,
      size: { width: 800, height: 600 },
      background: {},
      layers: [{ id: 'default', name: 'D', visible: true }],
      elements: [],
    },
  ],
});

describe('FloorPlanModel — construction & serialization', () => {
  test('constructs from a building', () => {
    const m = new FloorPlanModel(sampleBuilding());
    assert.equal(m.floors.length, 2);
    assert.equal(m.activeFloorId, 'g');
    assert.equal(m.activeFloor.id, 'g');
  });
  test('constructs from empty input (default building)', () => {
    const m = new FloorPlanModel();
    assert.equal(m.floors.length, 1);
    assert.equal(m.validate().ok, true);
  });
  test('toJSON returns a deep clone', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const j = m.toJSON();
    j.meta.name = 'CHANGED';
    assert.notEqual(m.doc.meta.name, 'CHANGED');
  });
  test('exportFloor returns a one-floor building', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const exp = m.exportFloor('g');
    assert.equal(exp.floors.length, 1);
    assert.equal(exp.floors[0].id, 'g');
    assert.equal(exp.activeFloor, 'g');
  });
  test('exportFloor with bad id falls back to whole building', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const exp = m.exportFloor('nope');
    assert.equal(exp.floors.length, 2);
  });
});

describe('FloorPlanModel — floors API', () => {
  let m;
  beforeEach(() => { m = new FloorPlanModel(sampleBuilding()); });

  test('setActiveFloor switches and emits floor-change', () => {
    let event = null;
    m.on((e) => { if (e.type === 'floor-change') event = e; });
    assert.equal(m.setActiveFloor('f1'), true);
    assert.equal(m.activeFloorId, 'f1');
    assert.equal(event?.floorId, 'f1');
  });
  test('setActiveFloor noops for the current floor', () => {
    assert.equal(m.setActiveFloor('g'), false);
  });
  test('setActiveFloor noops for missing id', () => {
    assert.equal(m.setActiveFloor('nope'), false);
  });
  test('addFloor appends and becomes active', () => {
    const n0 = m.floors.length;
    const f = m.addFloor({ name: 'Roof' });
    assert.equal(m.floors.length, n0 + 1);
    assert.equal(m.activeFloorId, f.id);
    assert.equal(f.name, 'Roof');
  });
  test('removeFloor keeps at least one floor', () => {
    const m1 = new FloorPlanModel({ floors: [{ id: 'a' }], activeFloor: 'a' });
    assert.equal(m1.removeFloor('a'), false);
  });
  test('removeFloor reassigns active when needed', () => {
    m.removeFloor('g');
    assert.equal(m.activeFloorId, 'f1');
  });
  test('duplicateFloor creates a fresh-id clone with renamed elements', () => {
    const orig = m.getFloor('g');
    const dup = m.duplicateFloor('g');
    assert.ok(dup);
    assert.notEqual(dup.id, 'g');
    assert.ok(/copy/.test(dup.name));
    assert.equal(dup.elements.length, orig.elements.length);
    // elements get fresh ids
    for (const el of dup.elements) {
      assert.ok(!orig.elements.some((e) => e.id === el.id), 'fresh element id');
    }
  });
  test('updateFloor merges background.grid', () => {
    m.updateFloor('g', { background: { grid: { color: '#abc' } } });
    assert.equal(m.activeFloor.background.grid.color, '#abc');
    // existing background fields preserved
    assert.equal(m.activeFloor.background.color, '#fff');
  });
});

describe('FloorPlanModel — elements', () => {
  let m;
  beforeEach(() => { m = new FloorPlanModel(sampleBuilding()); });

  test('addElement pushes onto active floor', () => {
    const el = m.addElement({ type: 'rect', x: 10, y: 10 });
    assert.equal(m.elements.length, 4);
    assert.equal(m.getElement(el.id)?.type, 'rect');
  });
  test('addElement on a different active floor targets that floor', () => {
    m.setActiveFloor('f1');
    m.addElement({ type: 'rect' });
    assert.equal(m.getFloor('f1').elements.length, 1);
    assert.equal(m.getFloor('g').elements.length, 3, 'ground floor untouched');
  });
  test('updateElement merges style + props', () => {
    m.updateElement('t1', { props: { status: 'reserved' }, style: { fill: 'red' } });
    const el = m.getElement('t1');
    assert.equal(el.props.status, 'reserved');
    assert.equal(el.style.fill, 'red');
  });
  test('updateElement returns null for unknown id', () => {
    assert.equal(m.updateElement('missing', { x: 1 }), null);
  });
  test('removeElements deletes and reports count', () => {
    const n = m.removeElements(['t1', 't2']);
    assert.equal(n, 2);
    assert.equal(m.elements.length, 1);
  });
  test('duplicate copies with fresh ids + offset', () => {
    const out = m.duplicate(['t1'], 5);
    assert.equal(out.length, 1);
    assert.notEqual(out[0].id, 't1');
    assert.equal(out[0].x, 125);
    assert.equal(out[0].y, 125);
  });
  test('reorder front/back swaps z-order', () => {
    m.reorder(['t1'], 'front');
    assert.equal(m.elements[m.elements.length - 1].id, 't1');
    m.reorder(['t1'], 'back');
    assert.equal(m.elements[0].id, 't1');
  });
});

describe('FloorPlanModel — history', () => {
  test('addElement → undo removes it', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const n = m.elements.length;
    m.addElement({ type: 'rect' });
    assert.equal(m.elements.length, n + 1);
    assert.equal(m.undo(), true);
    assert.equal(m.elements.length, n);
  });
  test('redo re-applies the last undone change', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.addElement({ type: 'rect' });
    m.undo();
    assert.equal(m.redo(), true);
    assert.equal(m.elements.length, 4);
  });
  test('undo on empty history is a noop', () => {
    const m = new FloorPlanModel();
    assert.equal(m.undo(), false);
    assert.equal(m.redo(), false);
  });
  test('updateElementLive skips history (no undo)', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.updateElementLive('t1', { x: 999 });
    assert.equal(m.undo(), false);
    assert.equal(m.getElement('t1').x, 999);
  });
  test('commit records a history checkpoint', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.updateElementLive('t1', { x: 999 });
    m.commit('move');
    m.updateElementLive('t1', { x: 1000 });
    m.undo();
    assert.equal(m.getElement('t1').x, 999);
  });
});

describe('FloorPlanModel — queries', () => {
  test('pickAt returns topmost element at a point', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const hit = m.pickAt({ x: 145, y: 145 }, hitTest);
    assert.ok(hit);
    assert.equal(hit.id, 't1');
  });
  test('pickAt skips hidden elements', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.updateElement('t1', { hidden: true });
    const hit = m.pickAt({ x: 145, y: 145 }, hitTest);
    assert.notEqual(hit?.id, 't1');
  });
  test('elementsInRoom finds elements whose center lies in the room', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const ids = m.elementsInRoom('r1');
    assert.deepEqual(ids.sort(), ['t1', 't2'].sort());
  });
  test('contentBounds wraps every element on the active floor', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const b = m.contentBounds();
    assert.ok(b.width > 0 && b.height > 0);
  });
  test('contentBounds on empty floor falls back to size', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.setActiveFloor('f1');
    const b = m.contentBounds();
    assert.equal(b.width, 800);
    assert.equal(b.height, 600);
  });
  test('elementBounds returns null for unknown id', () => {
    const m = new FloorPlanModel(sampleBuilding());
    assert.equal(m.elementBounds('nope'), null);
  });
});

describe('FloorPlanModel — layers / meta / background', () => {
  test('addLayer + updateLayer', () => {
    const m = new FloorPlanModel(sampleBuilding());
    const l = m.addLayer({ name: 'Decor' });
    assert.equal(m.activeFloor.layers.length, 2);
    m.updateLayer(l.id, { visible: false });
    assert.equal(m.activeFloor.layers.find((x) => x.id === l.id).visible, false);
  });
  test('setMeta merges', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.setMeta({ scale: 100 });
    assert.equal(m.doc.meta.scale, 100);
    assert.equal(m.doc.meta.name, 'B');
  });
  test('setBackground merges grid', () => {
    const m = new FloorPlanModel(sampleBuilding());
    m.setBackground({ grid: { size: 50 } });
    assert.equal(m.activeFloor.background.grid.size, 50);
    assert.equal(m.activeFloor.background.grid.enabled, true);
  });
});

describe('FloorPlanModel — events', () => {
  test('on() returns an unsubscribe', () => {
    const m = new FloorPlanModel();
    let count = 0;
    const off = m.on(() => count++);
    m.addElement({ type: 'rect' });
    off();
    m.addElement({ type: 'rect' });
    assert.equal(count, 1);
  });
});
