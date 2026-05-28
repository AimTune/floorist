// Wall segments — the geometry that doors and windows snap to.
//
// Floors and rooms have walls along their perimeter; standalone `wall` elements
// can be placed anywhere (e.g. partitions inside a room). This module turns the
// floor's element list into a flat array of line segments, then provides a
// snap helper that finds the closest segment to an arbitrary point.

import type { Floor, PlanElement, Point, SnapResult, WallSegment } from './types.js';
import { centerOf, closestOnSegment, rotatePoint, toDeg } from './geometry.js';

/** Default minimum size considered for a standalone `wall` element. */
const WALL_MIN = 4;

/**
 * Extract every wall segment on a floor: floor/room perimeters + standalone
 * `wall` elements. Coordinates are in world space and include rotation.
 */
export function getWallSegments(floor: Floor): WallSegment[] {
  const out: WallSegment[] = [];
  for (const el of floor.elements) {
    if (el.hidden) continue;
    if (el.type === 'floor') {
      out.push(...floorPerimeter(el));
    } else if (el.type === 'room') {
      out.push(...roomPerimeter(el));
    } else if (el.type === 'wall') {
      const seg = wallToSegment(el);
      if (seg) out.push(seg);
    }
  }
  return out;
}

/** The four wall segments around a `floor` element, inset by wall thickness. */
function floorPerimeter(el: PlanElement): WallSegment[] {
  const wall = Number(el.style?.wall ?? 12);
  const half = wall / 2;
  // walls live on the inside of the box, centered on a line inset by wall/2
  const left = el.x + half;
  const top = el.y + half;
  const right = el.x + el.width - half;
  const bottom = el.y + el.height - half;
  const corners: Point[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  return rotateAndConnect(corners, el, wall);
}

/** Room (zone) perimeters are thin walls. */
function roomPerimeter(el: PlanElement): WallSegment[] {
  const corners: Point[] = [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ];
  return rotateAndConnect(corners, el, 0);
}

/** Standalone wall element → one segment along its longer axis. */
function wallToSegment(el: PlanElement): WallSegment | null {
  if (el.width < WALL_MIN && el.height < WALL_MIN) return null;
  // segment runs along the longer axis through the element's center
  const c = centerOf(el);
  let a: Point;
  let b: Point;
  let thickness: number;
  if (el.width >= el.height) {
    a = { x: el.x, y: c.y };
    b = { x: el.x + el.width, y: c.y };
    thickness = el.height;
  } else {
    a = { x: c.x, y: el.y };
    b = { x: c.x, y: el.y + el.height };
    thickness = el.width;
  }
  if (el.rotation) {
    a = rotatePoint(a, c, el.rotation);
    b = rotatePoint(b, c, el.rotation);
  }
  return { a, b, thickness, sourceId: el.id, sourceType: el.type };
}

/** Apply the element's rotation to corner points, then connect them as 4 segments. */
function rotateAndConnect(corners: Point[], el: PlanElement, thickness: number): WallSegment[] {
  const c = centerOf(el);
  const r = el.rotation || 0;
  const pts = r ? corners.map((p) => rotatePoint(p, c, r)) : corners;
  const segs: WallSegment[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    segs.push({ a, b, thickness, sourceId: el.id, sourceType: el.type });
  }
  return segs;
}

/**
 * Find the closest wall segment to `point`. Returns `null` when there are no
 * walls on the floor. If `excludeId` is given, segments coming from that
 * element id are skipped (so dragging a wall doesn't snap to itself).
 */
export function snapToWalls(
  point: Point,
  segments: WallSegment[],
  excludeId?: string,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (const seg of segments) {
    if (excludeId && seg.sourceId === excludeId) continue;
    const proj = closestOnSegment(point, seg.a, seg.b);
    const d = Math.hypot(point.x - proj.x, point.y - proj.y);
    if (!best || d < best.distance) {
      const angle = toDeg(Math.atan2(seg.b.y - seg.a.y, seg.b.x - seg.a.x));
      best = { point: { x: proj.x, y: proj.y }, angleDeg: angle, distance: d, segment: seg };
    }
  }
  return best;
}

/** Element types whose default behaviour is to stick to walls. */
const WALL_TYPES = new Set(['door', 'door-double', 'door-slide', 'window']);

/** Does this element snap to walls (taking explicit `props.snap` into account)? */
export function snapsToWall(el: PlanElement): boolean {
  if (el.props?.snap === false) return false;
  if (el.props?.snap === true) return true;
  return WALL_TYPES.has(el.type);
}
