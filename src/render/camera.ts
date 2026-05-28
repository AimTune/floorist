// Camera = the 2D viewport transform (pan + zoom) between world and screen.
// screen = world * zoom + offset.
import { clamp } from '../core/geometry.js';
import type { Point, Rect } from '../core/types.js';

export interface CameraOptions {
  minZoom?: number;
  maxZoom?: number;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  minZoom: number;
  maxZoom: number;

  constructor({ minZoom = 0.1, maxZoom = 8 }: CameraOptions = {}) {
    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
  }

  worldToScreen(p: Point): Point {
    return { x: p.x * this.zoom + this.x, y: p.y * this.zoom + this.y };
  }

  screenToWorld(p: Point): Point {
    return { x: (p.x - this.x) / this.zoom, y: (p.y - this.y) / this.zoom };
  }

  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  /** Zoom toward a fixed screen point (keeps that point stationary). */
  zoomAt(screenPoint: Point, factor: number): void {
    const before = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screenPoint);
    this.x += (after.x - before.x) * this.zoom;
    this.y += (after.y - before.y) * this.zoom;
  }

  setZoom(zoom: number, screenPoint?: Point): void {
    const target = clamp(zoom, this.minZoom, this.maxZoom);
    if (screenPoint) {
      this.zoomAt(screenPoint, target / this.zoom);
    } else {
      this.zoom = target;
    }
  }

  /** Fit a world-space box into the viewport with padding. */
  fitTo(box: Rect, viewW: number, viewH: number, padding = 40): void {
    const w = Math.max(1, box.width);
    const h = Math.max(1, box.height);
    const zoom = clamp(
      Math.min((viewW - padding * 2) / w, (viewH - padding * 2) / h),
      this.minZoom,
      this.maxZoom,
    );
    this.zoom = zoom;
    this.x = (viewW - w * zoom) / 2 - box.x * zoom;
    this.y = (viewH - h * zoom) / 2 - box.y * zoom;
  }
}
