// InteractionController — turns raw pointer/wheel/keyboard input into camera
// movement (view) and selection/move/resize edits (edit). Mode-agnostic input
// like pan & zoom works in both modes. Doors and windows snap to walls.

import { snap, corners, centerOf } from '../core/geometry.js';
import { hitTest } from '../elements/registry.js';
import { runActions } from '../core/actions.js';
import { getWallSegments, snapToWalls, snapsToWall } from '../core/walls.js';
import type { FloorPlanModel } from '../core/model.js';
import type { Camera } from '../render/camera.js';
import type { Renderer } from '../render/renderer.js';
import type {
  ActionEvent,
  ElementEventDetail,
  PlanElement,
  Point,
  WallSegment,
} from '../core/types.js';

const HANDLE_HIT_PX = 9;

type Mode = 'view' | 'edit';
type HandleKey = 'nw' | 'ne' | 'se' | 'sw';

interface PanDrag {
  kind: 'pan';
  startScreen: Point;
  camStart: Point;
}
interface TapDrag {
  kind: 'tap';
  el: PlanElement;
  startScreen: Point;
  moved: boolean;
}
interface MoveDrag {
  kind: 'move';
  startWorld: Point;
  starts: Map<string, { x: number; y: number; rotation: number }>;
  moved: boolean;
  walls: WallSegment[];
}
interface ResizeDrag {
  kind: 'resize';
  handle: HandleKey;
  id: string;
  startWorld: Point;
  start: { x: number; y: number; width: number; height: number };
  moved: boolean;
}
interface MarqueeDrag {
  kind: 'marquee';
  startWorld: Point;
  world: Point;
}
type ActiveDrag = PanDrag | TapDrag | MoveDrag | ResizeDrag | MarqueeDrag | null;

export interface HostHook {
  requestRender: () => void;
  emit: (name: string, detail: unknown) => void;
}

export interface InteractionControllerConfig {
  canvas: HTMLCanvasElement;
  model: FloorPlanModel;
  camera: Camera;
  renderer: Renderer;
  host: HostHook;
}

export class InteractionController {
  canvas: HTMLCanvasElement;
  model: FloorPlanModel;
  camera: Camera;
  renderer: Renderer;
  host: HostHook;

  mode: Mode = 'view';
  selectedIds = new Set<string>();
  hoverId: string | null = null;
  snapStep = 0;
  readonly = false;

  private _drag: ActiveDrag = null;
  private _spaceDown = false;
  private _bound: Record<string, (ev: Event) => void> = {};

  constructor(cfg: InteractionControllerConfig) {
    this.canvas = cfg.canvas;
    this.model = cfg.model;
    this.camera = cfg.camera;
    this.renderer = cfg.renderer;
    this.host = cfg.host;
    this._attach();
  }

  private _attach(): void {
    const b = this._bound;
    b['down'] = (e) => this._onPointerDown(e as PointerEvent);
    b['move'] = (e) => this._onPointerMove(e as PointerEvent);
    b['up'] = (e) => this._onPointerUp(e as PointerEvent);
    b['wheel'] = (e) => this._onWheel(e as WheelEvent);
    b['dblclick'] = (e) => this._onDblClick(e as MouseEvent);
    b['contextmenu'] = (e) => this._onContextMenu(e as MouseEvent);
    b['keydown'] = (e) => this._onKeyDown(e as KeyboardEvent);
    b['keyup'] = (e) => this._onKeyUp(e as KeyboardEvent);
    b['leave'] = () => this._setHover(null);

    this.canvas.addEventListener('pointerdown', b['down']);
    this.canvas.addEventListener('pointermove', b['move']);
    window.addEventListener('pointerup', b['up']);
    this.canvas.addEventListener('wheel', b['wheel'], { passive: false });
    this.canvas.addEventListener('dblclick', b['dblclick']);
    this.canvas.addEventListener('contextmenu', b['contextmenu']);
    this.canvas.addEventListener('pointerleave', b['leave']);
    window.addEventListener('keydown', b['keydown']);
    window.addEventListener('keyup', b['keyup']);
  }

  destroy(): void {
    const b = this._bound;
    this.canvas.removeEventListener('pointerdown', b['down']);
    this.canvas.removeEventListener('pointermove', b['move']);
    window.removeEventListener('pointerup', b['up']);
    this.canvas.removeEventListener('wheel', b['wheel']);
    this.canvas.removeEventListener('dblclick', b['dblclick']);
    this.canvas.removeEventListener('contextmenu', b['contextmenu']);
    this.canvas.removeEventListener('pointerleave', b['leave']);
    window.removeEventListener('keydown', b['keydown']);
    window.removeEventListener('keyup', b['keyup']);
  }

  /** Build a rich payload (screen + viewport coords) for an element event. */
  private _eventInfo(el: PlanElement, e?: { clientX: number; clientY: number }): ElementEventDetail {
    const rect = this.canvas.getBoundingClientRect();
    const screen: Point = e
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : this.camera.worldToScreen(centerOf(el));
    return {
      id: el.id,
      element: structuredClone(el),
      screen,
      client: { x: e ? e.clientX : rect.left + screen.x, y: e ? e.clientY : rect.top + screen.y },
      canvasRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  }

  setMode(mode: Mode): void {
    this.mode = mode;
    if (mode !== 'edit') this.clearSelection();
    this.host.requestRender();
  }

  private _localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private _worldPoint(e: { clientX: number; clientY: number }): Point {
    return this.camera.screenToWorld(this._localPoint(e));
  }

  clearSelection(): void {
    if (this.selectedIds.size) {
      this.selectedIds.clear();
      this.host.emit('selection-change', { ids: [] });
    }
  }

  setSelection(ids: string[]): void {
    this.selectedIds = new Set(ids);
    this.host.emit('selection-change', { ids: [...this.selectedIds] });
    this.host.requestRender();
  }

  private _setHover(id: string | null): void {
    if (this.hoverId === id) return;
    this.hoverId = id;
    this.canvas.style.cursor = this._cursorFor(id);
    this.host.emit('hover-change', { id });
    this.host.requestRender();
  }

  private _cursorFor(id: string | null): string {
    if (this._spaceDown) return 'grab';
    if (this.mode === 'edit') return id ? 'move' : 'default';
    return id ? 'pointer' : 'default';
  }

  /** Which selection handle (if any) is under the screen point? */
  private _handleAt(localPt: Point): { key: HandleKey; el: PlanElement } | null {
    if (this.mode !== 'edit' || this.selectedIds.size !== 1) return null;
    const id = [...this.selectedIds][0];
    const el = this.model.getElement(id);
    if (!el || el.locked) return null;
    const cs = corners(el);
    for (const key of ['nw', 'ne', 'se', 'sw'] as const) {
      const s = this.camera.worldToScreen(cs[key]);
      if (Math.hypot(s.x - localPt.x, s.y - localPt.y) <= HANDLE_HIT_PX) {
        return { key, el };
      }
    }
    return null;
  }

  // ---- pointer ----------------------------------------------------------
  private _onPointerDown(e: PointerEvent): void {
    if (e.button === 2) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const local = this._localPoint(e);
    const world = this.camera.screenToWorld(local);

    const wantPan = e.button === 1 || this._spaceDown;
    if (wantPan) {
      this._drag = { kind: 'pan', startScreen: local, camStart: { x: this.camera.x, y: this.camera.y } };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    if (this.mode === 'edit' && !this.readonly) {
      const handle = this._handleAt(local);
      if (handle) {
        this._beginResize(handle, world);
        return;
      }
      const picked = this.model.pickAt(world, hitTest);
      if (picked) {
        this._selectForDrag(picked, e);
        this._beginMove(world);
        return;
      }
      this._drag = { kind: 'marquee', startWorld: world, world };
      if (!e.shiftKey) this.clearSelection();
      return;
    }

    // view mode
    const picked = this.model.pickAt(world, hitTest);
    if (picked) {
      this._drag = { kind: 'tap', el: picked, startScreen: local, moved: false };
    } else {
      this._drag = { kind: 'pan', startScreen: local, camStart: { x: this.camera.x, y: this.camera.y } };
      this.canvas.style.cursor = 'grabbing';
    }
  }

  private _selectForDrag(el: PlanElement, e: PointerEvent): void {
    const isRoom = el.type === 'room' || el.type === 'floor';
    const group = isRoom ? [el.id, ...this.model.elementsInRoom(el.id)] : [el.id];
    if (e.shiftKey) {
      const adding = !this.selectedIds.has(el.id);
      for (const id of group) {
        if (adding) this.selectedIds.add(id);
        else this.selectedIds.delete(id);
      }
    } else if (!this.selectedIds.has(el.id)) {
      this.selectedIds = new Set(group);
    }
    this.host.emit('selection-change', { ids: [...this.selectedIds] });
  }

  private _beginMove(world: Point): void {
    const starts = new Map<string, { x: number; y: number; rotation: number }>();
    for (const id of this.selectedIds) {
      const el = this.model.getElement(id);
      if (el && !el.locked) starts.set(id, { x: el.x, y: el.y, rotation: el.rotation });
    }
    this._drag = {
      kind: 'move',
      startWorld: world,
      starts,
      moved: false,
      walls: getWallSegments(this.model.activeFloor),
    };
  }

  private _beginResize(handle: { key: HandleKey; el: PlanElement }, world: Point): void {
    const el = handle.el;
    this._drag = {
      kind: 'resize',
      handle: handle.key,
      id: el.id,
      startWorld: world,
      start: { x: el.x, y: el.y, width: el.width, height: el.height },
      moved: false,
    };
  }

  private _onPointerMove(e: PointerEvent): void {
    const local = this._localPoint(e);
    const world = this.camera.screenToWorld(local);

    if (!this._drag) {
      const handle = this._handleAt(local);
      if (handle) {
        this.canvas.style.cursor =
          handle.key === 'nw' || handle.key === 'se' ? 'nwse-resize' : 'nesw-resize';
        return;
      }
      const picked = this.model.pickAt(world, hitTest);
      this._setHover(picked ? picked.id : null);
      return;
    }

    const d = this._drag;
    if (d.kind === 'pan') {
      const pd = d;
      this.camera.x = pd.camStart.x + (local.x - pd.startScreen.x);
      this.camera.y = pd.camStart.y + (local.y - pd.startScreen.y);
      this.host.requestRender();
    } else if (d.kind === 'tap') {
      if (Math.hypot(local.x - d.startScreen.x, local.y - d.startScreen.y) > 4) {
        // turned into a pan
        this._drag = {
          kind: 'pan',
          startScreen: local,
          camStart: { x: this.camera.x, y: this.camera.y },
        };
        this.canvas.style.cursor = 'grabbing';
      }
    } else if (d.kind === 'move') {
      const dx = world.x - d.startWorld.x;
      const dy = world.y - d.startWorld.y;
      d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
      for (const [id, s] of d.starts) {
        const el = this.model.getElement(id);
        if (!el) continue;
        const next = { x: snap(s.x + dx, this.snapStep), y: snap(s.y + dy, this.snapStep), rotation: el.rotation };
        // wall-snap for door/window types
        if (snapsToWall(el)) {
          const center = { x: next.x + el.width / 2, y: next.y + el.height / 2 };
          const found = snapToWalls(center, d.walls);
          if (found) {
            next.x = found.point.x - el.width / 2;
            next.y = found.point.y - el.height / 2;
            // normalize the wall angle to [-90, 90) so doors aren't drawn upside-down
            let angle = found.angleDeg;
            while (angle >= 90) angle -= 180;
            while (angle < -90) angle += 180;
            next.rotation = angle;
          }
        }
        this.model.updateElementLive(id, next);
      }
      this.host.requestRender();
    } else if (d.kind === 'resize') {
      this._applyResize(d, world);
    } else if (d.kind === 'marquee') {
      d.world = world;
      this.host.requestRender();
    }
  }

  private _applyResize(d: ResizeDrag, world: Point): void {
    const dx = world.x - d.startWorld.x;
    const dy = world.y - d.startWorld.y;
    let { x, y, width, height } = d.start;
    if (d.handle.includes('w')) {
      x = d.start.x + dx;
      width = d.start.width - dx;
    }
    if (d.handle.includes('e')) {
      width = d.start.width + dx;
    }
    if (d.handle.includes('n')) {
      y = d.start.y + dy;
      height = d.start.height - dy;
    }
    if (d.handle.includes('s')) {
      height = d.start.height + dy;
    }
    const MIN = 8;
    if (width < MIN) width = MIN;
    if (height < MIN) height = MIN;
    d.moved = true;
    this.model.updateElementLive(d.id, {
      x: snap(x, this.snapStep),
      y: snap(y, this.snapStep),
      width: snap(width, this.snapStep),
      height: snap(height, this.snapStep),
    });
    this.host.requestRender();
  }

  private _onPointerUp(e: PointerEvent): void {
    const d = this._drag;
    this._drag = null;
    this.canvas.style.cursor = this._cursorFor(this.hoverId);
    if (!d) return;

    if (d.kind === 'tap') {
      this._fireActions(d.el, 'click', e);
      this.host.emit('element-click', this._eventInfo(d.el, e));
    } else if (d.kind === 'move' && d.moved) {
      this.model.commit('move');
      this.host.emit('element-change', { ids: [...this.selectedIds], reason: 'move' });
    } else if (d.kind === 'resize' && d.moved) {
      this.model.commit('resize');
      this.host.emit('element-change', { ids: [d.id], reason: 'resize' });
    } else if (d.kind === 'marquee') {
      this._commitMarquee(d, e);
    }
  }

  private _commitMarquee(d: MarqueeDrag, e: PointerEvent): void {
    const a = d.startWorld;
    const b = d.world;
    const box = {
      minX: Math.min(a.x, b.x),
      minY: Math.min(a.y, b.y),
      maxX: Math.max(a.x, b.x),
      maxY: Math.max(a.y, b.y),
    };
    if (Math.abs(box.maxX - box.minX) < 3 && Math.abs(box.maxY - box.minY) < 3) {
      this.host.requestRender();
      return;
    }
    const next = e.shiftKey ? new Set(this.selectedIds) : new Set<string>();
    for (const el of this.model.elements) {
      const c = centerOf(el);
      if (c.x >= box.minX && c.x <= box.maxX && c.y >= box.minY && c.y <= box.maxY) next.add(el.id);
    }
    this.setSelection([...next]);
  }

  getMarquee(): { a: Point; b: Point } | null {
    return this._drag && this._drag.kind === 'marquee'
      ? { a: this._drag.startWorld, b: this._drag.world }
      : null;
  }

  private _onDblClick(e: MouseEvent): void {
    const world = this._worldPoint(e);
    const picked = this.model.pickAt(world, hitTest);
    if (!picked) return;
    if (this.mode === 'view') this._fireActions(picked, 'dblclick', e);
    this.host.emit('element-dblclick', this._eventInfo(picked, e));
  }

  private _onContextMenu(e: MouseEvent): void {
    const world = this._worldPoint(e);
    const picked = this.model.pickAt(world, hitTest);
    if (!picked) return;
    e.preventDefault();
    this.host.emit('element-contextmenu', this._eventInfo(picked, e));
  }

  private _fireActions(el: PlanElement, eventName: ActionEvent, e?: { clientX: number; clientY: number }): void {
    const { mutated, effects } = runActions(this.model, el, eventName, { mode: this.mode });
    if (mutated) this.host.requestRender();
    const info = this._eventInfo(el, e);
    for (const effect of effects) {
      this.host.emit('element-action', { ...info, ...effect });
    }
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const local = this._localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.camera.zoomAt(local, factor);
    this.host.requestRender();
    this.host.emit('zoom-change', { zoom: this.camera.zoom });
  }

  private _onKeyDown(e: KeyboardEvent): void {
    if (this._isTypingTarget(e.target)) return;
    if (e.code === 'Space') {
      this._spaceDown = true;
      this.canvas.style.cursor = 'grab';
      return;
    }
    if (this.mode !== 'edit' || this.readonly) return;

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedIds.size) {
        e.preventDefault();
        this.model.removeElements([...this.selectedIds]);
        this.clearSelection();
        this.host.emit('element-change', { reason: 'delete' });
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      if (this.selectedIds.size) {
        const created = this.model.duplicate([...this.selectedIds]);
        this.setSelection(created.map((c) => c.id));
      }
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.model.redo();
      else this.model.undo();
    } else if (e.key.startsWith('Arrow') && this.selectedIds.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      for (const id of this.selectedIds) {
        const el = this.model.getElement(id);
        if (el && !el.locked) this.model.updateElementLive(id, { x: el.x + dx, y: el.y + dy });
      }
      this.model.commit('nudge');
    }
  }

  private _onKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      this._spaceDown = false;
      this.canvas.style.cursor = this._cursorFor(this.hoverId);
    }
  }

  private _isTypingTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
  }
}
