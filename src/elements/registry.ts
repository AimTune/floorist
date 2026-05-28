// Element type registry — the extensible heart of floorist.
// Register a type once and it becomes available to the model (defaults),
// the renderer (draw), the editor palette (category/label/icon) and actions.

import { roundRectPath, fillStroke, drawLabel, circle, statusDot } from '../render/shapes.js';
import { hitTestBox, unrotatePoint } from '../core/geometry.js';
import type {
  ElementTypeDef,
  PlanElement,
  Point,
  SeatStatus,
  TypeEnv,
} from '../core/types.js';

const _types = new Map<string, ElementTypeDef>();

export function registerType(def: ElementTypeDef): ElementTypeDef {
  if (!def || !def.type) throw new Error('registerType requires a "type"');
  _types.set(def.type, { ...def, defaults: def.defaults ?? {} });
  return def;
}

export function getType(type: string): ElementTypeDef {
  return _types.get(type) ?? _types.get('rect')!; // 'rect' is always registered
}

export function hasType(type: string): boolean {
  return _types.has(type);
}

/** Defaults for a type, used by schema normalization. */
export function getTypeDefaults(type: string): NonNullable<ElementTypeDef['defaults']> {
  const def = _types.get(type);
  return (def?.defaults ?? {}) as NonNullable<ElementTypeDef['defaults']>;
}

/** All registered definitions (for building an editor palette). */
export function listTypes(): ElementTypeDef[] {
  return [..._types.values()];
}

export function hitTest(el: PlanElement, point: Point): boolean {
  const def = _types.get(el.type);
  if (def && typeof def.hitTest === 'function') return def.hitTest(el, point);
  return hitTestBox(el, point);
}

// ---------------------------------------------------------------------------
// Status color palettes used by several furniture types.
// ---------------------------------------------------------------------------
const SEAT_STATUS: Record<SeatStatus, string> = {
  available: '#34c759',
  reserved: '#ff9f0a',
  occupied: '#ff3b30',
  disabled: '#9b9b9b',
};

function fillForStatus(el: PlanElement, base: string): string {
  const status = el.props?.status;
  if (status && SEAT_STATUS[status]) return SEAT_STATUS[status];
  return (el.style?.fill as string) || base;
}

// ---------------------------------------------------------------------------
// Built-in element types
// ---------------------------------------------------------------------------

// Generic rectangle (also the fallback type).
registerType({
  type: 'rect',
  category: 'shape',
  label: 'Rectangle',
  icon: '▭',
  defaults: { width: 100, height: 70, style: { fill: '#dfe6ee', stroke: '#9fb0c0', radius: 6 } },
  draw(ctx, el, env) {
    roundRectPath(ctx, 0, 0, el.width, el.height, (el.style.radius as number) ?? 4);
    fillStroke(ctx, el.style);
    if (env.showLabel) drawLabel(ctx, el.label, el.width, el.height);
  },
});

registerType({
  type: 'circle',
  category: 'shape',
  label: 'Circle',
  icon: '◯',
  defaults: { width: 80, height: 80, style: { fill: '#dfe6ee', stroke: '#9fb0c0' } },
  draw(ctx, el, env) {
    circle(ctx, el.width / 2, el.height / 2, Math.min(el.width, el.height) / 2, el.style);
    if (env.showLabel) drawLabel(ctx, el.label, el.width, el.height);
  },
});

// Floor / room as a single rectangular container with solid wall borders.
registerType({
  type: 'floor',
  category: 'structure',
  label: 'Floor / Room',
  icon: '🏠',
  defaults: {
    width: 600,
    height: 400,
    style: { fill: '#ffffff', stroke: '#3f3f3f', wall: 12, radius: 4, labelColor: '#7a7a72' },
  },
  draw(ctx, el, env) {
    const wall = (el.style.wall as number) ?? 12;
    const r = (el.style.radius as number) ?? 0;
    roundRectPath(ctx, 0, 0, el.width, el.height, r);
    if (el.style.fill) {
      ctx.fillStyle = el.style.fill as string;
      ctx.fill();
    }
    if (wall > 0 && el.style.stroke) {
      ctx.lineJoin = 'miter';
      ctx.lineWidth = wall;
      ctx.strokeStyle = el.style.stroke as string;
      roundRectPath(ctx, wall / 2, wall / 2, el.width - wall, el.height - wall, Math.max(0, r - wall / 2));
      ctx.stroke();
    }
    if (env.showLabel) {
      drawLabel(ctx, el.label, el.width, wall + 22, {
        y: wall + 12,
        color: (el.style.labelColor as string) || '#7a7a72',
        size: 13,
        weight: 700,
      });
    }
  },
  // Only the wall band is clickable, so elements placed on the floor stay pickable.
  hitTest(el, point) {
    if (!hitTestBox(el, point)) return false;
    const wall = ((el.style?.wall as number) ?? 12) + 4;
    const c = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const local = unrotatePoint(point, c, el.rotation || 0);
    const inX = local.x - el.x;
    const inY = local.y - el.y;
    const insideInner =
      inX > wall && inX < el.width - wall && inY > wall && inY < el.height - wall;
    return !insideInner;
  },
});

registerType({
  type: 'room',
  category: 'structure',
  label: 'Room / Zone',
  icon: '⬚',
  defaults: {
    width: 400,
    height: 300,
    style: { fill: 'rgba(120,144,170,0.10)', stroke: '#8ea2b8', radius: 4, dash: [8, 6] },
  },
  draw(ctx, el, env) {
    ctx.save();
    if (el.style.dash) ctx.setLineDash(el.style.dash as number[]);
    roundRectPath(ctx, 0, 0, el.width, el.height, (el.style.radius as number) ?? 0);
    fillStroke(ctx, { ...el.style, lineWidth: 2 });
    ctx.restore();
    if (env.showLabel) {
      drawLabel(ctx, el.label, el.width, 30, { y: 18, color: '#5d6f82', size: 14, weight: 700 });
    }
  },
});

// Wall — a thick line segment. width spans length, height = thickness.
registerType({
  type: 'wall',
  category: 'structure',
  label: 'Wall',
  icon: '▬',
  defaults: { width: 300, height: 12, style: { fill: '#4a4a4a' } },
  draw(ctx, el) {
    ctx.fillStyle = (el.style.fill as string) || '#4a4a4a';
    ctx.fillRect(0, 0, el.width, el.height);
  },
});

// Single-leaf swing door.
registerType({
  type: 'door',
  category: 'structure',
  label: 'Door',
  icon: '🚪',
  snapsToWall: true,
  defaults: {
    width: 80,
    height: 80,
    style: { stroke: '#8a6d3b', fill: '#caa472' },
    props: { open: true, snap: true },
  },
  draw(ctx, el, env) {
    const w = el.width;
    const open = el.props?.open !== false;
    ctx.save();
    ctx.translate(0, el.height);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = (el.style.stroke as string) || '#8a6d3b';
    ctx.lineWidth = 1.5;
    ctx.arc(0, 0, w, -Math.PI / 2, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    const angle = open ? -Math.PI / 2 : 0;
    ctx.rotate(angle);
    ctx.fillStyle = (el.style.fill as string) || '#caa472';
    ctx.strokeStyle = (el.style.stroke as string) || '#8a6d3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.stroke();
    ctx.restore();
    if (env.showLabel) {
      drawLabel(ctx, el.label, el.width, el.height, { y: el.height - 6, size: 10, color: '#8a6d3b' });
    }
  },
});

// Double-leaf swing door — two halves opening apart from the center.
registerType({
  type: 'door-double',
  category: 'structure',
  label: 'Double door',
  icon: '🚪🚪',
  snapsToWall: true,
  defaults: {
    width: 140,
    height: 70,
    style: { stroke: '#8a6d3b', fill: '#caa472' },
    props: { open: true, snap: true },
  },
  draw(ctx, el, env) {
    const w = el.width;
    const h = el.height;
    const half = w / 2;
    const open = el.props?.open !== false;
    const stroke = (el.style.stroke as string) || '#8a6d3b';
    const fill = (el.style.fill as string) || '#caa472';

    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    // arcs for each leaf (hinges at the two ends, swinging inward to the center)
    ctx.beginPath();
    ctx.arc(0, h, half, -Math.PI / 2, 0); // left leaf swing
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w, h, half, Math.PI, -Math.PI / 2, true); // right leaf swing
    ctx.stroke();
    ctx.setLineDash([]);

    // left leaf
    ctx.save();
    ctx.translate(0, h);
    ctx.rotate(open ? -Math.PI / 2 : 0);
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.restore();

    // right leaf (mirror)
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(open ? Math.PI / 2 : 0);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-half, 0);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    if (env.showLabel) {
      drawLabel(ctx, el.label, el.width, el.height, { y: el.height - 6, size: 10, color: '#8a6d3b' });
    }
  },
});

// Sliding door — leaf slides along the wall into a pocket.
registerType({
  type: 'door-slide',
  category: 'structure',
  label: 'Sliding door',
  icon: '↔️',
  snapsToWall: true,
  defaults: {
    width: 130,
    height: 16,
    style: { stroke: '#6e7c8a', fill: '#cdd7e0' },
    props: { open: true, snap: true },
  },
  draw(ctx, el) {
    const w = el.width;
    const h = el.height;
    const open = el.props?.open !== false;
    const stroke = (el.style.stroke as string) || '#6e7c8a';
    const fill = (el.style.fill as string) || '#cdd7e0';

    // wall opening track
    ctx.save();
    ctx.fillStyle = '#eef1f4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    ctx.restore();

    // the sliding leaf: covers either left half (closed) or hides into a pocket (open)
    const leafW = w * 0.45;
    const leafX = open ? -leafW * 0.4 : (w - leafW) / 2;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(leafX, 2, leafW, h - 4);
    ctx.strokeRect(leafX, 2, leafW, h - 4);
    // a small direction tick
    ctx.beginPath();
    ctx.moveTo(leafX + leafW * 0.4, h / 2);
    ctx.lineTo(leafX + leafW * 0.6, h / 2);
    ctx.stroke();
    ctx.restore();
  },
});

registerType({
  type: 'window',
  category: 'structure',
  label: 'Window',
  icon: '🪟',
  snapsToWall: true,
  defaults: {
    width: 120,
    height: 12,
    style: { fill: '#bcdcf0', stroke: '#6fa8cc' },
    props: { snap: true },
  },
  draw(ctx, el) {
    ctx.fillStyle = (el.style.fill as string) || '#bcdcf0';
    ctx.fillRect(0, 0, el.width, el.height);
    ctx.strokeStyle = (el.style.stroke as string) || '#6fa8cc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, el.width, el.height);
    ctx.beginPath();
    ctx.moveTo(0, el.height / 2);
    ctx.lineTo(el.width, el.height / 2);
    ctx.stroke();
  },
});

registerType({
  type: 'stairs',
  category: 'structure',
  label: 'Stairs',
  icon: '🪜',
  defaults: { width: 140, height: 90, style: { fill: '#e6e6e0', stroke: '#9a9a90' } },
  draw(ctx, el) {
    roundRectPath(ctx, 0, 0, el.width, el.height, 2);
    fillStroke(ctx, el.style);
    const steps = 6;
    ctx.strokeStyle = (el.style.stroke as string) || '#9a9a90';
    ctx.lineWidth = 1;
    for (let i = 1; i < steps; i++) {
      const x = (el.width / steps) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, el.height);
      ctx.stroke();
    }
  },
});

registerType({
  type: 'table-round',
  category: 'furniture',
  label: 'Round table',
  icon: '🍽️',
  statusColors: SEAT_STATUS,
  defaults: {
    width: 90,
    height: 90,
    style: { fill: '#d9b38c', stroke: '#9c7b54' },
    props: { seats: 4, status: 'available' },
  },
  draw(ctx, el, env) {
    const r = Math.min(el.width, el.height) / 2;
    const cx = el.width / 2;
    const cy = el.height / 2;
    drawSeatsAround(ctx, cx, cy, r + 11, (el.props?.seats as number) ?? 4);
    circle(ctx, cx, cy, r - 6, { fill: fillForStatus(el, '#d9b38c'), stroke: el.style.stroke as string, lineWidth: 2 });
    statusDot(ctx, el.width, SEAT_STATUS[el.props?.status as SeatStatus]);
    if (env.showLabel) drawLabel(ctx, el.label, el.width, el.height, { color: '#4a3a28' });
  },
});

registerType({
  type: 'table-rect',
  category: 'furniture',
  label: 'Rect table',
  icon: '🍴',
  statusColors: SEAT_STATUS,
  defaults: {
    width: 140,
    height: 80,
    style: { fill: '#d9b38c', stroke: '#9c7b54', radius: 8 },
    props: { seats: 6, status: 'available' },
  },
  draw(ctx, el, env) {
    drawSeatsRect(ctx, el.width, el.height, (el.props?.seats as number) ?? 6);
    roundRectPath(ctx, 8, 8, el.width - 16, el.height - 16, (el.style.radius as number) ?? 6);
    fillStroke(ctx, { fill: fillForStatus(el, '#d9b38c'), stroke: el.style.stroke as string, lineWidth: 2 });
    statusDot(ctx, el.width, SEAT_STATUS[el.props?.status as SeatStatus]);
    if (env.showLabel) drawLabel(ctx, el.label, el.width, el.height, { color: '#4a3a28' });
  },
});

registerType({
  type: 'chair',
  category: 'furniture',
  label: 'Chair',
  icon: '💺',
  defaults: { width: 34, height: 34, style: { fill: '#b8c4d0', stroke: '#7d8b99' } },
  draw(ctx, el) {
    roundRectPath(ctx, 4, 8, el.width - 8, el.height - 10, 4);
    fillStroke(ctx, { fill: el.style.fill as string, stroke: el.style.stroke as string, lineWidth: 1.5 });
    roundRectPath(ctx, 4, 0, el.width - 8, 7, 3);
    fillStroke(ctx, { fill: el.style.stroke as string, stroke: el.style.stroke as string });
  },
});

registerType({
  type: 'sofa',
  category: 'furniture',
  label: 'Sofa / Booth',
  icon: '🛋️',
  defaults: { width: 160, height: 64, style: { fill: '#9fb1a6', stroke: '#6f8378' } },
  draw(ctx, el, env) {
    roundRectPath(ctx, 0, 0, el.width, el.height, 10);
    fillStroke(ctx, { fill: el.style.fill as string, stroke: el.style.stroke as string, lineWidth: 2 });
    roundRectPath(ctx, 4, 4, el.width - 8, 12, 6);
    fillStroke(ctx, { fill: el.style.stroke as string });
    if (env.showLabel) drawLabel(ctx, el.label, el.width, el.height, { color: '#33403a' });
  },
});

registerType({
  type: 'ac',
  category: 'equipment',
  label: 'A/C unit',
  icon: '❄️',
  defaults: { width: 90, height: 28, style: { fill: '#eef3f7', stroke: '#9bb4c4' }, props: { on: true } },
  draw(ctx, el) {
    roundRectPath(ctx, 0, 0, el.width, el.height, 6);
    fillStroke(ctx, { fill: el.style.fill as string, stroke: el.style.stroke as string, lineWidth: 1.5 });
    ctx.strokeStyle = (el.style.stroke as string) || '#9bb4c4';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = (el.height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(6, y);
      ctx.lineTo(el.width - 6, y);
      ctx.stroke();
    }
    statusDot(ctx, el.width, el.props?.on ? '#34c759' : '#9b9b9b');
  },
});

registerType({
  type: 'plant',
  category: 'equipment',
  label: 'Plant',
  icon: '🪴',
  defaults: { width: 44, height: 44, style: { fill: '#5fae6a', stroke: '#3f7d48' } },
  draw(ctx, el) {
    const cx = el.width / 2;
    circle(ctx, cx, el.height / 2 - 3, Math.min(el.width, el.height) / 2 - 3, {
      fill: el.style.fill as string,
      stroke: el.style.stroke as string,
      lineWidth: 2,
    });
    ctx.fillStyle = '#8a6240';
    ctx.fillRect(cx - 6, el.height - 8, 12, 8);
  },
});

registerType({
  type: 'entrance',
  category: 'structure',
  label: 'Entrance / Exit',
  icon: '🚏',
  defaults: { width: 70, height: 40, style: { fill: '#2e7d32', stroke: '#1b5e20' }, props: { kind: 'entrance' } },
  draw(ctx, el, env) {
    const exit = el.props?.kind === 'exit';
    const fill = (el.style.fill as string) || (exit ? '#c62828' : '#2e7d32');
    roundRectPath(ctx, 0, 0, el.width, el.height, 6);
    fillStroke(ctx, { fill, stroke: el.style.stroke as string, lineWidth: 2 });
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 3;
    const cy = el.height / 2;
    const x0 = exit ? el.width - 14 : 14;
    const x1 = exit ? 14 : el.width - 14;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x1, cy);
    ctx.stroke();
    const dir = exit ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.lineTo(x1 - dir * 8, cy - 6);
    ctx.lineTo(x1 - dir * 8, cy + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (env.showLabel) {
      drawLabel(ctx, el.label, el.width, el.height, { y: el.height - 6, size: 9, color: '#ffffff' });
    }
  },
});

registerType({
  type: 'wc',
  category: 'equipment',
  label: 'WC / Toilet',
  icon: '🚻',
  defaults: { width: 80, height: 80, style: { fill: '#eaf2f6', stroke: '#9bb4c4' } },
  draw(ctx, el) {
    roundRectPath(ctx, 0, 0, el.width, el.height, 4);
    fillStroke(ctx, { fill: el.style.fill as string, stroke: el.style.stroke as string, lineWidth: 1.5 });
    drawLabel(ctx, el.label || 'WC', el.width, el.height, { color: '#5b6e7a', size: 16, weight: 700 });
  },
});

registerType({
  type: 'text',
  category: 'misc',
  label: 'Text',
  icon: '🔤',
  defaults: { width: 160, height: 30, style: { color: '#333', size: 18, weight: 600, align: 'left' } },
  draw(ctx, el) {
    ctx.fillStyle = (el.style.color as string) || '#333';
    ctx.textBaseline = 'middle';
    ctx.textAlign = (el.style.align as CanvasTextAlign) || 'left';
    ctx.font = `${el.style.weight || 600} ${el.style.size || 18}px system-ui, sans-serif`;
    const align = el.style.align as string | undefined;
    const x = align === 'center' ? el.width / 2 : align === 'right' ? el.width : 0;
    ctx.fillText(el.label || 'Text', x, el.height / 2);
  },
});

registerType({
  type: 'image',
  category: 'misc',
  label: 'Image',
  icon: '🖼️',
  defaults: { width: 120, height: 120, style: { radius: 0 }, props: { src: '', fit: 'contain' } },
  draw(ctx, el, env) {
    const src = el.props?.src as string | undefined;
    const img = src && env.getImage ? env.getImage(src) : null;
    if (img && img.complete && img.naturalWidth) {
      ctx.save();
      if (el.style.radius) {
        roundRectPath(ctx, 0, 0, el.width, el.height, el.style.radius as number);
        ctx.clip();
      }
      if (el.props?.fit === 'cover') drawImageCover(ctx, img, el.width, el.height);
      else drawImageContain(ctx, img, el.width, el.height);
      ctx.restore();
    } else {
      roundRectPath(ctx, 0, 0, el.width, el.height, (el.style.radius as number) || 4);
      fillStroke(ctx, { fill: '#eceae4', stroke: '#c9c6bd', lineWidth: 1.5 });
      drawLabel(ctx, src ? 'loading…' : '🖼 image', el.width, el.height, { color: '#9a978d', size: 12 });
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers used by the built-in furniture renderers.
// ---------------------------------------------------------------------------
function drawSeatsAround(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, count: number): void {
  if (!count) return;
  ctx.save();
  ctx.fillStyle = '#b8c4d0';
  ctx.strokeStyle = '#7d8b99';
  ctx.lineWidth = 1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawSeatsRect(ctx: CanvasRenderingContext2D, w: number, h: number, count: number): void {
  if (!count) return;
  ctx.save();
  ctx.fillStyle = '#b8c4d0';
  ctx.strokeStyle = '#7d8b99';
  ctx.lineWidth = 1;
  const perSide = Math.ceil(count / 2);
  let placed = 0;
  for (let i = 0; i < perSide && placed < count; i++, placed++) {
    const x = ((i + 0.5) / perSide) * w;
    chairDot(ctx, x, 4);
  }
  for (let i = 0; i < perSide && placed < count; i++, placed++) {
    const x = ((i + 0.5) / perSide) * w;
    chairDot(ctx, x, h - 4);
  }
  ctx.restore();
}

function chairDot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawImageContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

// Unused export kept on the public surface for `TypeEnv` consumers.
export type { TypeEnv };
