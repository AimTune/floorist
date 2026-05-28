import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FloorPlanModel } from '../dist/core/model.js';
import { registerActionHandler, runActions } from '../dist/core/actions.js';

const buildModelWith = (el) => new FloorPlanModel({
  floors: [{
    id: 'g', name: 'G', level: 0,
    size: { width: 100, height: 100 },
    layers: [{ id: 'd', name: 'D' }],
    elements: [el],
  }],
  activeFloor: 'g',
});

describe('runActions — built-ins', () => {
  test('toggle flips a boolean prop', () => {
    const m = buildModelWith({
      id: 'door1', type: 'door', x: 0, y: 0,
      props: { open: true },
      actions: [{ on: 'click', do: 'toggle', prop: 'open' }],
    });
    const out = runActions(m, m.getElement('door1'), 'click');
    assert.equal(out.mutated, true);
    assert.equal(m.getElement('door1').props.open, false);
    assert.equal(out.effects[0].kind, 'toggle');
  });
  test('toggle default prop is "open"', () => {
    const m = buildModelWith({
      id: 'd', type: 'door', x: 0, y: 0,
      props: { open: false },
      actions: [{ on: 'click', do: 'toggle' }],
    });
    runActions(m, m.getElement('d'), 'click');
    assert.equal(m.getElement('d').props.open, true);
  });
  test('set assigns a fixed value', () => {
    const m = buildModelWith({
      id: 't', type: 'table-round', x: 0, y: 0,
      props: { status: 'available' },
      actions: [{ on: 'click', do: 'set', prop: 'status', value: 'reserved' }],
    });
    runActions(m, m.getElement('t'), 'click');
    assert.equal(m.getElement('t').props.status, 'reserved');
  });
  test('cycle advances through values', () => {
    const m = buildModelWith({
      id: 't', type: 'table-round', x: 0, y: 0,
      props: { status: 'available' },
      actions: [{ on: 'click', do: 'cycle', prop: 'status', values: ['available', 'reserved', 'occupied'] }],
    });
    runActions(m, m.getElement('t'), 'click');
    assert.equal(m.getElement('t').props.status, 'reserved');
    runActions(m, m.getElement('t'), 'click');
    assert.equal(m.getElement('t').props.status, 'occupied');
    runActions(m, m.getElement('t'), 'click'); // wraps
    assert.equal(m.getElement('t').props.status, 'available');
  });
  test('link surfaces a side-effect (no mutation)', () => {
    const m = buildModelWith({
      id: 'i', type: 'image', x: 0, y: 0,
      actions: [{ on: 'click', do: 'link', url: 'https://example.com' }],
    });
    const out = runActions(m, m.getElement('i'), 'click');
    assert.equal(out.mutated, false);
    assert.equal(out.effects[0].kind, 'link');
    assert.equal(out.effects[0].url, 'https://example.com');
    assert.equal(out.effects[0].target, '_blank');
  });
  test('emit relays a named event', () => {
    const m = buildModelWith({
      id: 'x', type: 'rect', x: 0, y: 0,
      actions: [{ on: 'click', do: 'emit', name: 'hello', payload: { a: 1 } }],
    });
    const out = runActions(m, m.getElement('x'), 'click');
    assert.equal(out.effects[0].kind, 'emit');
    assert.equal(out.effects[0].name, 'hello');
    assert.deepEqual(out.effects[0].payload, { a: 1 });
  });
});

describe('runActions — filtering', () => {
  test('only fires actions whose "on" matches', () => {
    const m = buildModelWith({
      id: 'a', type: 'door', x: 0, y: 0,
      props: { open: false },
      actions: [
        { on: 'click', do: 'toggle', prop: 'open' },
        { on: 'dblclick', do: 'emit', name: 'double' },
      ],
    });
    const click = runActions(m, m.getElement('a'), 'click');
    assert.equal(click.effects.length, 1);
    assert.equal(click.effects[0].kind, 'toggle');
    const dbl = runActions(m, m.getElement('a'), 'dblclick');
    assert.equal(dbl.effects.length, 1);
    assert.equal(dbl.effects[0].kind, 'emit');
  });
  test('null element returns an empty result', () => {
    const m = buildModelWith({ id: 'a', type: 'rect', x: 0, y: 0 });
    const out = runActions(m, null, 'click');
    assert.equal(out.mutated, false);
    assert.deepEqual(out.effects, []);
  });
  test('unknown action kind surfaces as-is (no handler)', () => {
    const m = buildModelWith({
      id: 'a', type: 'rect', x: 0, y: 0,
      actions: [{ on: 'click', do: 'do-custom', foo: 1 }],
    });
    const out = runActions(m, m.getElement('a'), 'click');
    assert.equal(out.mutated, false);
    assert.equal(out.effects[0].kind, 'do-custom');
  });
});

describe('registerActionHandler', () => {
  test('custom handler can mutate + emit', () => {
    registerActionHandler('mark', ({ model, el }) => {
      model.updateElement(el.id, { props: { marked: true } });
      return { mutated: true, effect: { kind: 'mark' } };
    });
    const m = buildModelWith({
      id: 'q', type: 'rect', x: 0, y: 0,
      actions: [{ on: 'click', do: 'mark' }],
    });
    runActions(m, m.getElement('q'), 'click');
    assert.equal(m.getElement('q').props.marked, true);
  });
});
