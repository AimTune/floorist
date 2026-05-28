// The floorist document format (a.k.a. .floorist.json).
//
// A document is a BUILDING with one or more FLOORS (storeys). See types.ts
// for the full shapes. Legacy single-plan documents (top-level
// `elements`/`layers`/`size`, no `floors`) are auto-migrated into a one-floor
// building on load — older files keep working.

import type {
  Building,
  Floor,
  Layer,
  PlanElement,
  ElementAction,
  ElementProps,
  ElementStyle,
} from './types.js';

export const FORMAT_VERSION = '2.0';

export const DEFAULT_FLOOR: Readonly<Floor> = Object.freeze({
  id: 'ground',
  name: 'Ground floor',
  level: 0,
  size: { width: 1200, height: 800 },
  background: {
    color: '#f7f7f4',
    grid: { enabled: true, size: 25, color: '#e4e4dd' },
  },
  layers: [{ id: 'default', name: 'Default', visible: true, locked: false, opacity: 1 }],
  elements: [],
});

export const DEFAULT_BUILDING: Readonly<Building> = Object.freeze({
  version: FORMAT_VERSION,
  meta: { name: 'Untitled building', units: 'm', scale: 50 },
  floors: [DEFAULT_FLOOR as Floor],
  activeFloor: 'ground',
});

let _idSeq = 0;
/** Stable-ish unique id generator (no crypto dependency required). */
export function uid(prefix = 'el'): string {
  _idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${_idSeq}${rand}`;
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export interface TypeDefaults {
  width?: number;
  height?: number;
  rotation?: number;
  style?: ElementStyle;
  props?: ElementProps;
}

export type TypeDefaultsResolver = (type: string) => TypeDefaults;

const noDefaults: TypeDefaultsResolver = () => ({});

/** Fill in any missing fields on an element with safe defaults. */
export function normalizeElement(raw: Partial<PlanElement> & { type?: string }, defaults: TypeDefaults = {}): PlanElement {
  if (!raw || typeof raw !== 'object') throw new Error('Element must be an object');
  if (!raw.type) throw new Error('Element is missing "type"');
  const type = raw.type;
  return {
    id: raw.id || uid(type),
    type,
    layer: raw.layer || 'default',
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    width: num(raw.width, defaults.width ?? 60),
    height: num(raw.height, defaults.height ?? 60),
    rotation: num(raw.rotation, defaults.rotation ?? 0),
    label: raw.label ?? '',
    showLabel: raw.showLabel === true,
    locked: raw.locked === true,
    hidden: raw.hidden === true,
    room: raw.room ?? null,
    style: { ...(defaults.style ?? {}), ...(raw.style ?? {}) },
    props: { ...(defaults.props ?? {}), ...(raw.props ?? {}) },
    actions: Array.isArray(raw.actions) ? raw.actions.map(normalizeAction) : [],
  };
}

export function normalizeAction(raw: Partial<ElementAction> & { do?: string }): ElementAction {
  return {
    id: raw.id || uid('act'),
    on: raw.on || 'click',
    do: raw.do || 'emit',
    ...raw,
  } as ElementAction;
}

function normalizeLayers(rawLayers: unknown): Layer[] {
  if (Array.isArray(rawLayers) && rawLayers.length) {
    return rawLayers.map((l: Partial<Layer>) => ({
      id: l.id || uid('layer'),
      name: l.name || 'Layer',
      visible: l.visible !== false,
      locked: l.locked === true,
      opacity: num(l.opacity, 1),
    }));
  }
  return structuredClone(DEFAULT_FLOOR.layers) as Layer[];
}

/** Normalize a single floor (applies defaults + per-type element defaults). */
export function normalizeFloor(
  raw: Partial<Floor> | undefined,
  getTypeDefaults: TypeDefaultsResolver = noDefaults,
  index = 0,
): Floor {
  const base: Partial<Floor> = raw && typeof raw === 'object' ? raw : {};
  const layers = normalizeLayers(base.layers);
  const layerIds = new Set(layers.map((l) => l.id));
  const elements: PlanElement[] = Array.isArray(base.elements)
    ? base.elements.map((el) => {
        const defaults = getTypeDefaults(el.type as string);
        const norm = normalizeElement(el, defaults);
        if (!layerIds.has(norm.layer)) norm.layer = layers[0].id;
        return norm;
      })
    : [];
  return {
    id: base.id || (index === 0 ? 'ground' : uid('floor')),
    name: base.name || (index === 0 ? 'Ground floor' : `Floor ${index + 1}`),
    level: num(base.level, index),
    size: { ...DEFAULT_FLOOR.size, ...(base.size ?? {}) },
    background: {
      ...DEFAULT_FLOOR.background,
      ...(base.background ?? {}),
      grid: { ...DEFAULT_FLOOR.background.grid, ...(base.background?.grid ?? {}) },
    },
    layers,
    elements,
  };
}

interface LegacyPlan {
  elements?: unknown;
  layers?: unknown;
  size?: unknown;
  background?: unknown;
}

/** True if `doc` looks like a legacy single-plan (no floors[]). */
function isLegacyPlan(doc: Partial<Building> & LegacyPlan): boolean {
  return !!doc && !Array.isArray(doc.floors) &&
    (Array.isArray(doc.elements) || Array.isArray(doc.layers) || !!doc.size);
}

/**
 * Normalize a whole BUILDING document. Accepts both the building format and
 * legacy single-plan documents (which are wrapped into a one-floor building).
 */
export function normalizeBuilding(
  doc: Partial<Building> & LegacyPlan = {},
  getTypeDefaults: TypeDefaultsResolver = noDefaults,
): Building {
  const base = doc && typeof doc === 'object' ? doc : {};

  let floorsRaw: Partial<Floor>[];
  if (Array.isArray(base.floors) && base.floors.length) {
    floorsRaw = base.floors;
  } else if (isLegacyPlan(base)) {
    floorsRaw = [{
      id: 'ground',
      name: base.meta?.name || 'Ground floor',
      level: 0,
      size: base.size as Floor['size'] | undefined,
      background: base.background as Floor['background'] | undefined,
      layers: base.layers as Layer[] | undefined,
      elements: base.elements as PlanElement[] | undefined,
    }];
  } else {
    floorsRaw = [structuredClone(DEFAULT_FLOOR) as Floor];
  }

  const floors = floorsRaw.map((f, i) => normalizeFloor(f, getTypeDefaults, i));
  const activeFloor = floors.some((f) => f.id === base.activeFloor)
    ? (base.activeFloor as string)
    : floors[0].id;

  return {
    version: FORMAT_VERSION,
    meta: { ...DEFAULT_BUILDING.meta, ...(base.meta ?? {}) },
    floors,
    activeFloor,
  };
}

// Back-compat alias for callers that imported the old name.
export const normalizeDocument = normalizeBuilding;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Lightweight structural validation; returns { ok, errors[] }. */
export function validateDocument(doc: unknown): ValidationResult {
  const errors: string[] = [];
  if (!doc || typeof doc !== 'object') {
    return { ok: false, errors: ['Document is not an object'] };
  }
  const b = doc as Building;
  if (!Array.isArray(b.floors) || b.floors.length === 0) {
    errors.push('floors must be a non-empty array');
  }
  (b.floors || []).forEach((floor, fi) => {
    if (!floor.id) errors.push(`floors[${fi}] missing id`);
    if (!Array.isArray(floor.elements)) errors.push(`floors[${fi}].elements must be an array`);
    if (!Array.isArray(floor.layers) || floor.layers.length === 0) {
      errors.push(`floors[${fi}].layers must be a non-empty array`);
    }
    (floor.elements || []).forEach((el, i) => {
      if (!el.type) errors.push(`floors[${fi}].elements[${i}] missing type`);
      if (!el.id) errors.push(`floors[${fi}].elements[${i}] missing id`);
    });
  });
  return { ok: errors.length === 0, errors };
}
