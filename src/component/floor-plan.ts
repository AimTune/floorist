// <floor-plan> — the public web component (the floorist library entry point).
// Wires model + camera + renderer + interaction controller together behind a
// small, framework-agnostic API.
import { FloorPlanModel } from '../core/model.js';
import { Renderer, type OverlayRenderer } from '../render/renderer.js';
import { Camera } from '../render/camera.js';
import { InteractionController } from '../editor/controller.js';
import { boundsOf } from '../core/geometry.js';
import type {
  Building,
  Floor,
  ModelEvent,
  PlanElement,
  Point,
  ElementListener,
  ElementListenerType,
  ElementEventDetail,
} from '../core/types.js';

const STYLES = `
  :host {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 240px;
    overflow: hidden;
    contain: layout paint;
    background: #3a3d42;
    --fp-font: system-ui, -apple-system, sans-serif;
  }
  canvas { display: block; touch-action: none; }
  :host([hidden]) { display: none; }
  .fp-hover {
    position: absolute; left: 0; top: 0; z-index: 5;
    pointer-events: none; display: none;
    max-width: 280px; font: 12px/1.4 var(--fp-font);
    background: rgba(18,22,30,0.92); color: #fff;
    padding: 6px 9px; border-radius: 7px;
    box-shadow: 0 6px 20px rgba(0,0,0,.25);
  }
`;

export type HoverContentFn = (el: PlanElement) => string | HTMLElement | null | undefined;

export interface FloorSummary {
  id: string;
  name: string;
  level: number;
  count: number;
}

export interface RoomSummary {
  id: string;
  type: string;
  label: string;
}

export class FloorPlanElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['mode', 'src', 'grid-snap', 'readonly'];
  }

  model = new FloorPlanModel({});
  camera = new Camera();
  renderer: Renderer;
  controller: InteractionController;

  private _canvas: HTMLCanvasElement;
  private _hoverEl: HTMLDivElement;
  private _rafId = 0;
  private _fitPending = false;
  private _cssW = 0;
  private _cssH = 0;
  private _elListeners = new Map<string, Map<ElementListenerType, Set<ElementListener>>>();
  private _lastHoverId: string | null = null;
  private _overlayRenderer: OverlayRenderer | null = null;
  private _hoverContentFn: HoverContentFn | null = null;
  private _hoverRenderedId: string | null = null;
  private _resizeObserver: ResizeObserver;
  private _unbindModel: () => void;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLES;
    this._canvas = document.createElement('canvas');
    this._hoverEl = document.createElement('div');
    this._hoverEl.className = 'fp-hover';
    root.append(style, this._canvas, this._hoverEl);

    this.renderer = new Renderer(this._canvas, {
      camera: this.camera,
      onImageLoad: () => this.requestRender(),
    });
    this.controller = new InteractionController({
      canvas: this._canvas,
      model: this.model,
      camera: this.camera,
      renderer: this.renderer,
      host: this,
    });

    this._unbindModel = this.model.on((ev: ModelEvent) => this._onModelEvent(ev));
    this._resizeObserver = new ResizeObserver(() => this._resize());
  }

  // ---- lifecycle --------------------------------------------------------
  connectedCallback(): void {
    this._resizeObserver.observe(this);
    this._resize();
    if (this.hasAttribute('src')) {
      void this._loadFromSrc(this.getAttribute('src')!);
    } else {
      this._fitPending = true;
      this.requestRender();
      this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }));
    }
  }

  disconnectedCallback(): void {
    this._resizeObserver.disconnect();
    this.controller.destroy();
    this._unbindModel?.();
    cancelAnimationFrame(this._rafId);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === 'mode') {
      this.controller.setMode(value === 'edit' ? 'edit' : 'view');
    } else if (name === 'src' && value && this.isConnected) {
      void this._loadFromSrc(value);
    } else if (name === 'grid-snap') {
      this.controller.snapStep = value ? Number(value) || 0 : 0;
    } else if (name === 'readonly') {
      this.controller.readonly = value !== null && value !== 'false';
    }
  }

  // ---- public API -------------------------------------------------------
  get data(): Building {
    return this.model.toJSON();
  }

  set data(doc: Partial<Building>) {
    this.load(doc);
  }

  get mode(): 'view' | 'edit' {
    return this.controller.mode;
  }

  set mode(m: 'view' | 'edit') {
    this.setAttribute('mode', m);
  }

  load(doc: Partial<Building>): this {
    this.model.load(doc);
    this._fitPending = true;
    this.requestRender();
    return this;
  }

  getDocument(): Building {
    return this.model.toJSON();
  }

  exportJSON(pretty = true): string {
    return JSON.stringify(this.model.toJSON(), null, pretty ? 2 : 0);
  }

  addElement(el: Partial<PlanElement> & { type: string }): PlanElement {
    return this.model.addElement(el);
  }

  /** World-space point at the center of the current viewport. */
  getViewCenter(): Point {
    return this.camera.screenToWorld({ x: this._cssW / 2, y: this._cssH / 2 });
  }

  /** Add an element centered in the current view (handy for editor palettes). */
  addElementAtCenter(partial: Partial<PlanElement> & { type: string }): PlanElement {
    const c = this.getViewCenter();
    const w = partial.width ?? 80;
    const h = partial.height ?? 80;
    return this.model.addElement({
      ...partial,
      x: Math.round(c.x - w / 2),
      y: Math.round(c.y - h / 2),
    });
  }

  setMode(m: 'view' | 'edit'): this {
    this.mode = m;
    return this;
  }

  select(ids: string | string[]): void {
    this.controller.setSelection(Array.isArray(ids) ? ids : [ids]);
  }

  getSelection(): string[] {
    return [...this.controller.selectedIds];
  }

  clearSelection(): void {
    this.controller.clearSelection();
    this.requestRender();
  }

  undo(): boolean { return this.model.undo(); }
  redo(): boolean { return this.model.redo(); }

  fitToContent(padding = 60): void {
    this.camera.fitTo(this.model.contentBounds(), this._cssW, this._cssH, padding);
    this.requestRender();
    this.emit('zoom-change', { zoom: this.camera.zoom });
  }

  zoomIn(): void {
    this.camera.zoomAt({ x: this._cssW / 2, y: this._cssH / 2 }, 1.2);
    this.requestRender();
  }

  zoomOut(): void {
    this.camera.zoomAt({ x: this._cssW / 2, y: this._cssH / 2 }, 1 / 1.2);
    this.requestRender();
  }

  resetZoom(): void {
    this.camera.zoom = 1;
    this.camera.x = 0;
    this.camera.y = 0;
    this.requestRender();
  }

  // ---- floors (storeys) -------------------------------------------------
  getFloors(): FloorSummary[] {
    return this.model.floors.map((f) => ({
      id: f.id, name: f.name, level: f.level, count: f.elements.length,
    }));
  }

  getActiveFloorId(): string {
    return this.model.activeFloorId;
  }

  setActiveFloor(id: string): boolean {
    return this.model.setActiveFloor(id);
  }

  addFloor(floor?: Partial<Floor>): Floor {
    return this.model.addFloor(floor);
  }

  removeFloor(id: string): boolean {
    return this.model.removeFloor(id);
  }

  duplicateFloor(id: string = this.model.activeFloorId): Floor | null {
    return this.model.duplicateFloor(id);
  }

  /** Smoothly frame a single element (e.g. focus a room from a navigator). */
  focusElement(id: string, padding = 80): boolean {
    const bounds = this.model.elementBounds(id);
    if (!bounds) return false;
    this.camera.fitTo(bounds, this._cssW, this._cssH, padding);
    this.requestRender();
    this.emit('zoom-change', { zoom: this.camera.zoom });
    return true;
  }

  /** Rooms (floor/room elements) on the active floor — for a room navigator. */
  getRooms(): RoomSummary[] {
    return this.model.elements
      .filter((el) => el.type === 'floor' || el.type === 'room')
      .map((el) => ({ id: el.id, type: el.type, label: el.label || el.type }));
  }

  // ---- per-element listeners (imperative, keyed by element id) ----------
  on(id: string, type: ElementListenerType, handler: ElementListener): () => void {
    const key = id ?? '*';
    if (!this._elListeners.has(key)) this._elListeners.set(key, new Map());
    const byType = this._elListeners.get(key)!;
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type)!.add(handler);
    return () => this.off(id, type, handler);
  }

  off(id: string, type: ElementListenerType, handler: ElementListener): void {
    const byType = this._elListeners.get(id ?? '*');
    byType?.get(type)?.delete(handler);
  }

  private _dispatchEl(type: ElementListenerType, id: string | null, payload: ElementEventDetail | { id: string; element: PlanElement | null }): void {
    const fire = (key: string): void => {
      this._elListeners.get(key)?.get(type)?.forEach((fn) => fn(payload));
    };
    if (id != null) fire(id);
    fire('*');
  }

  /** Register a canvas overlay drawn each frame (world transform active). */
  setOverlayRenderer(fn: OverlayRenderer | null): void {
    this._overlayRenderer = fn || null;
    this.requestRender();
  }

  /** Register a hover HTML content callback. fn(element) → HTML string / element. */
  setHoverContent(fn: HoverContentFn | null): void {
    this._hoverContentFn = fn || null;
    this._hoverRenderedId = null;
    this._syncHover();
  }

  /** Viewport (client) rect of an element's bounding box — for positioning menus. */
  getElementScreenRect(id: string): { left: number; top: number; width: number; height: number } | null {
    const el = this.model.getElement(id);
    if (!el) return null;
    const b = boundsOf(el);
    const rect = this._canvas.getBoundingClientRect();
    const tl = this.camera.worldToScreen({ x: b.minX, y: b.minY });
    const br = this.camera.worldToScreen({ x: b.maxX, y: b.maxY });
    return {
      left: rect.left + tl.x,
      top: rect.top + tl.y,
      width: br.x - tl.x,
      height: br.y - tl.y,
    };
  }

  /** Host hook used by the controller. Also bridges to per-element listeners. */
  emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));

    const ELEMENT_EVENT: Record<string, ElementListenerType> = {
      'element-click': 'click',
      'element-dblclick': 'dblclick',
      'element-contextmenu': 'contextmenu',
      'element-action': 'action',
    };
    const d = detail as Partial<ElementEventDetail> | undefined;
    if (ELEMENT_EVENT[name] && d?.id) {
      this._dispatchEl(ELEMENT_EVENT[name], d.id, d as ElementEventDetail);
    } else if (name === 'hover-change') {
      const next = (detail as { id: string | null } | undefined)?.id ?? null;
      const prev = this._lastHoverId;
      if (prev && prev !== next) {
        this._dispatchEl('hoverout', prev, { id: prev, element: this.model.getElement(prev) });
      }
      if (next && next !== prev) {
        this._dispatchEl('hover', next, { id: next, element: this.model.getElement(next) });
      }
      this._lastHoverId = next;
    }
  }

  // ---- internals --------------------------------------------------------
  requestRender(): void {
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this._render();
    });
  }

  private _render(): void {
    if (this._fitPending && this._cssW > 0) {
      this._fitPending = false;
      this.camera.fitTo(this.model.contentBounds(), this._cssW, this._cssH, 60);
    }
    this.renderer.render(this.model.activeFloor, {
      selectedIds: this.controller.selectedIds,
      hoverId: this.controller.hoverId,
      showHandles: this.controller.mode === 'edit',
      marquee: this.controller.getMarquee(),
      time: performance.now(),
      overlay: this._overlayRenderer
        ? (ctx, info) => this._overlayWithModel(ctx, info)
        : null,
    });
    this._syncHover();
  }

  private _overlayWithModel(ctx: CanvasRenderingContext2D, info: Parameters<OverlayRenderer>[1]): void {
    if (!this._overlayRenderer) return;
    const hoverEl = info.hoverId ? this.model.getElement(info.hoverId) : null;
    this._overlayRenderer(ctx, { ...info, hoverElement: hoverEl, model: this.model } as never);
  }

  private _syncHover(): void {
    const el = this._hoverEl;
    const id = this.controller.hoverId;
    const element = id ? this.model.getElement(id) : null;

    if (!element) {
      if (el.style.display !== 'none') { el.style.display = 'none'; el.replaceChildren(); }
      this._hoverRenderedId = null;
      return;
    }
    if (this._hoverRenderedId !== id) {
      let content: string | HTMLElement | null | undefined = this._hoverContentFn ? this._hoverContentFn(element) : null;
      if (content == null && typeof element.props?.tooltip === 'string') content = element.props.tooltip;
      if (content == null) {
        el.style.display = 'none';
        el.replaceChildren();
        this._hoverRenderedId = id;
        return;
      }
      if (content instanceof HTMLElement) el.replaceChildren(content);
      else el.innerHTML = String(content);
      el.style.display = 'block';
      this._hoverRenderedId = id;
    }
    if (el.style.display === 'none') return;
    const b = boundsOf(element);
    const tl = this.camera.worldToScreen({ x: b.minX, y: b.minY });
    const rect = el.getBoundingClientRect();
    let x = tl.x;
    let y = tl.y - rect.height - 8;
    x = Math.max(4, Math.min(x, this._cssW - rect.width - 4));
    if (y < 4) y = this.camera.worldToScreen({ x: b.minX, y: b.maxY }).y + 8;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  private _resize(): void {
    const rect = this.getBoundingClientRect();
    this._cssW = Math.max(1, rect.width);
    this._cssH = Math.max(1, rect.height);
    this.renderer.resize(this._cssW, this._cssH);
    this.requestRender();
  }

  private _onModelEvent(e: ModelEvent): void {
    if (e.type === 'floor-change' || e.reason === 'floor-add' || e.reason === 'floor-remove' || e.reason === 'floor-duplicate') {
      this.controller.clearSelection();
      this._fitPending = true;
      this.requestRender();
      this.emit('floor-change', { floorId: this.model.activeFloorId });
      return;
    }
    if (e.type === 'load') this._fitPending = true;
    this.requestRender();
    this.emit('change', { reason: e.reason, ids: e.ids });
  }

  private async _loadFromSrc(url: string): Promise<void> {
    try {
      const res = await fetch(url);
      const doc = await res.json() as Building;
      this.load(doc);
      this.dispatchEvent(new CustomEvent('ready', { bubbles: true, composed: true }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: { error: err }, bubbles: true, composed: true,
      }));
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('floor-plan')) {
  customElements.define('floor-plan', FloorPlanElement);
}

declare global {
  interface HTMLElementTagNameMap {
    'floor-plan': FloorPlanElement;
  }
}
