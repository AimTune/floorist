// Canvas2D renderer. Draws a normalized floor through a Camera onto a canvas.
// Stateless about selection/editor — those are passed in per-frame via `view`.
import { Camera } from './camera.js';
import { getType } from '../elements/registry.js';
import { centerOf, corners, toRad } from '../core/geometry.js';
import type { Floor, PlanElement, Point } from '../core/types.js';

export { boundsOf } from '../core/geometry.js';

const SELECT_COLOR = '#2f7df6';
const HOVER_COLOR = '#7aa9f7';

export interface OverlayInfo {
  camera: Camera;
  dpr: number;
  hoverId: string | null;
  selectedIds: Set<string>;
  cssWidth: number;
  cssHeight: number;
}

export type OverlayRenderer = (ctx: CanvasRenderingContext2D, info: OverlayInfo) => void;

export interface RenderView {
  selectedIds?: Set<string>;
  hoverId?: string | null;
  showHandles?: boolean;
  marquee?: { a: Point; b: Point } | null;
  time?: number;
  overlay?: OverlayRenderer | null;
}

export interface RendererOptions {
  camera?: Camera;
  onImageLoad?: (src: string) => void;
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  dpr: number;
  cssWidth = 0;
  cssHeight = 0;
  onImageLoad: (src: string) => void;
  private _images = new Map<string, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.camera = opts.camera ?? new Camera();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.onImageLoad = opts.onImageLoad ?? (() => {});
  }

  /** Lazily load + cache an image; re-renders happen via onImageLoad. */
  getImage(src: string): HTMLImageElement | null {
    if (!src) return null;
    const cached = this._images.get(src);
    if (cached) return cached;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => this.onImageLoad(src);
    img.onerror = () => this.onImageLoad(src);
    img.src = src;
    this._images.set(src, img);
    return img;
  }

  /** Resize the backing store to the element's CSS size * DPR. */
  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  render(floor: Floor, view: RenderView = {}): void {
    const { ctx, camera } = this;
    const W = this.cssWidth;
    const H = this.cssHeight;
    const selectedIds = view.selectedIds ?? new Set<string>();
    const hoverId = view.hoverId ?? null;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // outside-canvas backdrop
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(0, 0, W, H);

    // world transform
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    this._drawBackground(floor);
    this._drawGrid(floor);

    const layerMap = new Map(floor.layers.map((l) => [l.id, l]));
    const ordered = this._orderElements(floor);
    const time = view.time ?? 0;

    for (const el of ordered) {
      const layer = layerMap.get(el.layer);
      if (el.hidden || layer?.visible === false) continue;
      this._drawElement(ctx, el, {
        opacity: layer?.opacity ?? 1,
        selected: selectedIds.has(el.id),
        hovered: hoverId === el.id,
        time,
      });
    }

    if (view.showHandles) {
      for (const el of ordered) {
        if (selectedIds.has(el.id)) this._drawSelection(ctx, el);
      }
    }

    if (view.marquee) this._drawMarquee(ctx, view.marquee);

    // Host overlay — drawn while the world transform is still active so callers
    // can paint in world coords. dpr/camera are provided for screen-space draws.
    if (typeof view.overlay === 'function') {
      ctx.save();
      view.overlay(ctx, {
        camera: this.camera,
        dpr: this.dpr,
        hoverId,
        selectedIds,
        cssWidth: this.cssWidth,
        cssHeight: this.cssHeight,
      });
      ctx.restore();
    }

    ctx.restore();
  }

  private _orderElements(floor: Floor): PlanElement[] {
    const layerOrder = new Map(floor.layers.map((l, i) => [l.id, i]));
    return floor.elements
      .map((el, i) => ({ el, i }))
      .sort((a, b) => {
        const la = layerOrder.get(a.el.layer) ?? 0;
        const lb = layerOrder.get(b.el.layer) ?? 0;
        if (la !== lb) return la - lb;
        return a.i - b.i; // stable by insertion order within a layer
      })
      .map((x) => x.el);
  }

  private _drawBackground(floor: Floor): void {
    const { ctx } = this;
    ctx.fillStyle = floor.background?.color || '#ffffff';
    ctx.fillRect(0, 0, floor.size.width, floor.size.height);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.strokeRect(0, 0, floor.size.width, floor.size.height);
  }

  private _drawGrid(floor: Floor): void {
    const grid = floor.background?.grid;
    if (!grid || grid.enabled === false) return;
    const step = grid.size || 25;
    if (step * this.camera.zoom < 4) return; // too dense, skip
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    for (let x = 0; x <= floor.size.width; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, floor.size.height);
    }
    for (let y = 0; y <= floor.size.height; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(floor.size.width, y);
    }
    ctx.strokeStyle = grid.color || '#e4e4dd';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.stroke();
    ctx.restore();
  }

  private _drawElement(
    ctx: CanvasRenderingContext2D,
    el: PlanElement,
    env: { opacity: number; selected: boolean; hovered: boolean; time: number },
  ): void {
    const def = getType(el.type);
    const c = centerOf(el);
    ctx.save();
    ctx.globalAlpha = (env.opacity ?? 1) * (typeof el.style?.opacity === 'number' ? el.style.opacity : 1);
    ctx.translate(c.x, c.y);
    if (el.rotation) ctx.rotate(toRad(el.rotation));
    ctx.translate(-el.width / 2, -el.height / 2);
    try {
      def.draw(ctx, el, {
        ...env,
        showLabel: el.showLabel === true,
        getImage: (s: string) => this.getImage(s),
      });
    } catch (err) {
      // never let one bad element kill the whole frame
      console.warn('[floorist] draw failed for', el.type, err);
    }
    ctx.restore();

    if (env.hovered && !env.selected) {
      this._strokeBox(ctx, el, HOVER_COLOR, 1.5);
    }
  }

  private _strokeBox(ctx: CanvasRenderingContext2D, el: PlanElement, color: string, width: number): void {
    const c = centerOf(el);
    ctx.save();
    ctx.translate(c.x, c.y);
    if (el.rotation) ctx.rotate(toRad(el.rotation));
    ctx.translate(-el.width / 2, -el.height / 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width / this.camera.zoom;
    ctx.strokeRect(-2, -2, el.width + 4, el.height + 4);
    ctx.restore();
  }

  private _drawMarquee(ctx: CanvasRenderingContext2D, m: { a: Point; b: Point }): void {
    const x = Math.min(m.a.x, m.b.x);
    const y = Math.min(m.a.y, m.b.y);
    const w = Math.abs(m.b.x - m.a.x);
    const h = Math.abs(m.b.y - m.a.y);
    ctx.save();
    ctx.fillStyle = 'rgba(47,125,246,0.12)';
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private _drawSelection(ctx: CanvasRenderingContext2D, el: PlanElement): void {
    const cs = corners(el);
    ctx.save();
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.beginPath();
    ctx.moveTo(cs.nw.x, cs.nw.y);
    ctx.lineTo(cs.ne.x, cs.ne.y);
    ctx.lineTo(cs.se.x, cs.se.y);
    ctx.lineTo(cs.sw.x, cs.sw.y);
    ctx.closePath();
    ctx.stroke();

    const r = 4 / this.camera.zoom;
    ctx.fillStyle = '#ffffff';
    for (const key of ['nw', 'ne', 'se', 'sw'] as const) {
      ctx.beginPath();
      ctx.arc(cs[key].x, cs[key].y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
