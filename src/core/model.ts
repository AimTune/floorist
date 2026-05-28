// FloorPlanModel — owns a BUILDING document (one or more floors) and is the
// only thing that mutates it. Element/layer operations target the ACTIVE floor.
// Emits "change" so the component can re-render and persist. Includes a simple
// snapshot-based undo/redo history.

import {
  normalizeBuilding,
  normalizeElement,
  normalizeFloor,
  validateDocument,
  uid,
  type TypeDefaults,
  type ValidationResult,
} from './schema.js';
import { getTypeDefaults } from '../elements/registry.js';
import { boundsOf } from './geometry.js';
import type {
  Building,
  Floor,
  Layer,
  ModelEvent,
  PlanElement,
  Rect,
} from './types.js';

export type ModelListener = (event: ModelEvent & { type: 'change' | 'load' | 'floor-change' }) => void;

export interface MutationOptions {
  history?: boolean;
}

const defaultsResolver = (type: string): TypeDefaults => getTypeDefaults(type);

export class FloorPlanModel {
  doc: Building;
  private _listeners = new Set<ModelListener>();
  private _undo: Building[] = [];
  private _redo: Building[] = [];
  private _historyLimit = 100;

  constructor(doc?: Partial<Building>) {
    this.doc = normalizeBuilding(doc ?? {}, defaultsResolver);
  }

  // -- events -------------------------------------------------------------
  on(fn: ModelListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(type: 'change' | 'load' | 'floor-change', payload: Partial<ModelEvent> = {}): void {
    const event = { type, model: this, ...payload } as Parameters<ModelListener>[0];
    for (const fn of this._listeners) fn(event);
  }

  // -- loading / serialization -------------------------------------------
  load(doc: Partial<Building>): void {
    this.doc = normalizeBuilding(doc ?? {}, defaultsResolver);
    this._undo = [];
    this._redo = [];
    this._emit('load');
  }

  /** A clean, serializable copy of the whole building. */
  toJSON(): Building {
    return structuredClone(this.doc);
  }

  /** A building containing only one floor — for sharing/exporting a floor. */
  exportFloor(floorId: string = this.doc.activeFloor): Building {
    const floor = this.getFloor(floorId);
    if (!floor) return this.toJSON();
    return {
      version: this.doc.version,
      meta: { ...this.doc.meta },
      floors: [structuredClone(floor)],
      activeFloor: floor.id,
    };
  }

  validate(): ValidationResult {
    return validateDocument(this.doc);
  }

  // -- floors -------------------------------------------------------------
  get floors(): Floor[] {
    return this.doc.floors;
  }

  get activeFloorId(): string {
    return this.doc.activeFloor;
  }

  get activeFloor(): Floor {
    return this.getFloor(this.doc.activeFloor) ?? this.doc.floors[0];
  }

  getFloor(id: string): Floor | null {
    return this.doc.floors.find((f) => f.id === id) ?? null;
  }

  setActiveFloor(id: string): boolean {
    if (!this.getFloor(id) || id === this.doc.activeFloor) return false;
    this.doc.activeFloor = id;
    this._emit('floor-change', { floorId: id });
    return true;
  }

  addFloor(floor: Partial<Floor> = {}): Floor {
    this._snapshot();
    const index = this.doc.floors.length;
    const f = normalizeFloor(
      { id: floor.id || uid('floor'), name: floor.name, level: floor.level ?? index, ...floor },
      defaultsResolver,
      index,
    );
    this.doc.floors.push(f);
    this.doc.activeFloor = f.id;
    this._emit('change', { reason: 'floor-add', floorId: f.id });
    return f;
  }

  removeFloor(id: string): boolean {
    if (this.doc.floors.length <= 1) return false;
    this._snapshot();
    const wasActive = this.doc.activeFloor === id;
    this.doc.floors = this.doc.floors.filter((f) => f.id !== id);
    if (wasActive) this.doc.activeFloor = this.doc.floors[0].id;
    this._emit('change', { reason: 'floor-remove', floorId: this.doc.activeFloor });
    return true;
  }

  updateFloor(id: string, patch: Partial<Floor>): Floor | null {
    const f = this.getFloor(id);
    if (!f) return null;
    // capture the originals BEFORE Object.assign overwrites them
    const origBg = f.background;
    const origGrid = origBg?.grid;
    Object.assign(f, patch);
    if (patch.background) {
      f.background = { ...origBg, ...patch.background };
      if (patch.background.grid) f.background.grid = { ...origGrid, ...patch.background.grid };
    }
    this._emit('change', { reason: 'floor-update', floorId: id });
    return f;
  }

  duplicateFloor(id: string): Floor | null {
    const src = this.getFloor(id);
    if (!src) return null;
    this._snapshot();
    const clone = structuredClone(src);
    clone.id = uid('floor');
    clone.name = `${src.name} (copy)`;
    clone.level = this.doc.floors.length;
    clone.elements = clone.elements.map((el) => ({ ...el, id: uid(el.type) }));
    this.doc.floors.push(clone);
    this.doc.activeFloor = clone.id;
    this._emit('change', { reason: 'floor-duplicate', floorId: clone.id });
    return clone;
  }

  // -- history ------------------------------------------------------------
  private _snapshot(): void {
    this._undo.push(structuredClone(this.doc));
    if (this._undo.length > this._historyLimit) this._undo.shift();
    this._redo.length = 0;
  }

  canUndo(): boolean { return this._undo.length > 0; }
  canRedo(): boolean { return this._redo.length > 0; }

  undo(): boolean {
    if (!this._undo.length) return false;
    this._redo.push(structuredClone(this.doc));
    this.doc = this._undo.pop()!;
    this._emit('change', { reason: 'undo' });
    return true;
  }

  redo(): boolean {
    if (!this._redo.length) return false;
    this._undo.push(structuredClone(this.doc));
    this.doc = this._redo.pop()!;
    this._emit('change', { reason: 'redo' });
    return true;
  }

  // -- element queries (active floor) -------------------------------------
  get elements(): PlanElement[] { return this.activeFloor.elements; }
  get layers(): Layer[] { return this.activeFloor.layers; }

  getElement(id: string): PlanElement | null {
    return this.activeFloor.elements.find((e) => e.id === id) ?? null;
  }

  /** Topmost element (last drawn) whose hit-test passes at world point. */
  pickAt(point: { x: number; y: number }, hitTestFn: (el: PlanElement, p: { x: number; y: number }) => boolean): PlanElement | null {
    const floor = this.activeFloor;
    for (let i = floor.elements.length - 1; i >= 0; i--) {
      const el = floor.elements[i];
      if (el.hidden) continue;
      const layer = floor.layers.find((l) => l.id === el.layer);
      if (layer && (layer.visible === false || layer.locked)) continue;
      if (hitTestFn(el, point)) return el;
    }
    return null;
  }

  /** Ids of elements whose center lies inside a room/container element. */
  elementsInRoom(roomId: string): string[] {
    const room = this.getElement(roomId);
    if (!room) return [];
    const minX = room.x, minY = room.y;
    const maxX = room.x + room.width, maxY = room.y + room.height;
    return this.activeFloor.elements
      .filter((el) => {
        if (el.id === roomId) return false;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
      })
      .map((el) => el.id);
  }

  // -- element mutations (active floor) -----------------------------------
  addElement(raw: Partial<PlanElement> & { type: string }, opts: MutationOptions = {}): PlanElement {
    if (opts.history !== false) this._snapshot();
    const floor = this.activeFloor;
    const el = normalizeElement(raw, defaultsResolver(raw.type));
    if (!floor.layers.some((l) => l.id === el.layer)) el.layer = floor.layers[0].id;
    floor.elements.push(el);
    this._emit('change', { reason: 'add', ids: [el.id] });
    return el;
  }

  updateElement(id: string, patch: Partial<PlanElement>, opts: MutationOptions = {}): PlanElement | null {
    const el = this.getElement(id);
    if (!el) return null;
    if (opts.history !== false) this._snapshot();
    const { style, props, ...rest } = patch;
    Object.assign(el, rest);
    if (style) el.style = { ...el.style, ...style };
    if (props) el.props = { ...el.props, ...props };
    this._emit('change', { reason: 'update', ids: [id] });
    return el;
  }

  /** Update without recording history — for high-frequency drag previews. */
  updateElementLive(id: string, patch: Partial<PlanElement>): PlanElement | null {
    return this.updateElement(id, patch, { history: false });
  }

  /** Persist the current state to history (call once after a live drag ends). */
  commit(reason = 'commit'): void {
    this._snapshot();
    this._emit('change', { reason });
  }

  removeElements(ids: string | string[], opts: MutationOptions = {}): number {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    if (opts.history !== false) this._snapshot();
    const floor = this.activeFloor;
    const before = floor.elements.length;
    floor.elements = floor.elements.filter((e) => !set.has(e.id));
    if (floor.elements.length !== before) {
      this._emit('change', { reason: 'remove', ids: [...set] });
    }
    return before - floor.elements.length;
  }

  duplicate(ids: string | string[], offset = 20): PlanElement[] {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    this._snapshot();
    const floor = this.activeFloor;
    const created: PlanElement[] = [];
    for (const el of floor.elements.filter((e) => set.has(e.id))) {
      const clone = structuredClone(el);
      clone.id = uid(clone.type);
      clone.x += offset;
      clone.y += offset;
      floor.elements.push(clone);
      created.push(clone);
    }
    this._emit('change', { reason: 'duplicate', ids: created.map((e) => e.id) });
    return created;
  }

  reorder(ids: string | string[], where: 'front' | 'back'): void {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    this._snapshot();
    const floor = this.activeFloor;
    const sel = floor.elements.filter((e) => set.has(e.id));
    const rest = floor.elements.filter((e) => !set.has(e.id));
    if (where === 'front') floor.elements = [...rest, ...sel];
    else if (where === 'back') floor.elements = [...sel, ...rest];
    this._emit('change', { reason: 'reorder', ids: [...set] });
  }

  // -- layers (active floor) ----------------------------------------------
  addLayer(layer: Partial<Layer> = {}): Layer {
    this._snapshot();
    const floor = this.activeFloor;
    const l: Layer = {
      id: layer.id || uid('layer'),
      name: layer.name || `Layer ${floor.layers.length + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: layer.opacity ?? 1,
    };
    floor.layers.push(l);
    this._emit('change', { reason: 'layer-add' });
    return l;
  }

  updateLayer(id: string, patch: Partial<Layer>): Layer | null {
    const l = this.activeFloor.layers.find((x) => x.id === id);
    if (!l) return null;
    Object.assign(l, patch);
    this._emit('change', { reason: 'layer-update' });
    return l;
  }

  // -- document props -----------------------------------------------------
  setMeta(patch: Partial<Building['meta']>): void {
    Object.assign(this.doc.meta, patch);
    this._emit('change', { reason: 'meta' });
  }

  setBackground(patch: Partial<Floor['background']>): void {
    const floor = this.activeFloor;
    const origGrid = floor.background?.grid;
    floor.background = { ...floor.background, ...patch };
    if (patch.grid) floor.background.grid = { ...origGrid, ...patch.grid };
    this._emit('change', { reason: 'background' });
  }

  /** World-space bounds of all elements on the active floor. */
  contentBounds(): Rect {
    const floor = this.activeFloor;
    if (!floor.elements.length) {
      return { x: 0, y: 0, width: floor.size.width, height: floor.size.height };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of floor.elements) {
      const b = boundsOf(el);
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  /** Bounds of a single element (for "focus on room"). */
  elementBounds(id: string): Rect | null {
    const el = this.getElement(id);
    if (!el) return null;
    const b = boundsOf(el);
    return { x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY };
  }
}
