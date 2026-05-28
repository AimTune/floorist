// Geometry helpers: vectors, rectangles, rotation and hit-testing.
// All elements are axis-aligned boxes (x, y = top-left, width, height) that may
// carry a rotation (degrees, around the box center). Hit-testing accounts for it.
import type { Point, PlanElement } from './types.js';

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));
export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Center point of an element's bounding box. */
export function centerOf(el: PlanElement): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/**
 * Rotate point p around pivot by -angleDeg (i.e. transform a world point into
 * the element's local, unrotated frame). Useful for hit-testing rotated boxes.
 */
export function unrotatePoint(p: Point, pivot: Point, angleDeg: number): Point {
  if (!angleDeg) return { x: p.x, y: p.y };
  const a = toRad(-angleDeg);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - pivot.x;
  const dy = p.y - pivot.y;
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
}

/** Rotate a point around pivot by angleDeg (local → world). */
export function rotatePoint(p: Point, pivot: Point, angleDeg: number): Point {
  return unrotatePoint(p, pivot, -angleDeg);
}

/** Is world point inside the (possibly rotated) box of an element? */
export function hitTestBox(el: PlanElement, point: Point): boolean {
  const c = centerOf(el);
  const local = unrotatePoint(point, c, el.rotation || 0);
  return (
    local.x >= el.x &&
    local.x <= el.x + el.width &&
    local.y >= el.y &&
    local.y <= el.y + el.height
  );
}

/** Distance from a point to a line segment (a→b). */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Closest point on segment a→b to p, with the parameter t in [0,1]. */
export function closestOnSegment(p: Point, a: Point, b: Point): Point & { t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: a.x, y: a.y, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return { x: a.x + t * dx, y: a.y + t * dy, t };
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Axis-aligned bounding box that contains the rotated element. */
export function boundsOf(el: PlanElement): AABB {
  const c = centerOf(el);
  const corners = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ].map((corner) => rotatePoint(corner, c, el.rotation || 0));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export interface ElementCorners {
  nw: Point;
  ne: Point;
  se: Point;
  sw: Point;
}

/** The four corner handles (world space) of a rotated element box. */
export function corners(el: PlanElement): ElementCorners {
  const c = centerOf(el);
  return {
    nw: rotatePoint({ x: el.x, y: el.y }, c, el.rotation || 0),
    ne: rotatePoint({ x: el.x + el.width, y: el.y }, c, el.rotation || 0),
    se: rotatePoint({ x: el.x + el.width, y: el.y + el.height }, c, el.rotation || 0),
    sw: rotatePoint({ x: el.x, y: el.y + el.height }, c, el.rotation || 0),
  };
}

/** Snap a value to the nearest multiple of step (step <= 0 disables). */
export function snap(value: number, step: number): number {
  if (!step || step <= 0) return value;
  return Math.round(value / step) * step;
}
