// Public type surface for the floorist library.
// These types are emitted as .d.ts files and exposed via the package "types".

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

// ---- element-side ---------------------------------------------------------

export type SeatStatus = 'available' | 'reserved' | 'occupied' | 'disabled';
export type EntranceKind = 'entrance' | 'exit';
export type ImageFit = 'contain' | 'cover';

export interface ElementStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  radius?: number;
  /** Wall thickness (used by the `floor` container type). */
  wall?: number;
  dash?: number[];
  opacity?: number;
  color?: string;
  size?: number;
  weight?: number | string;
  align?: CanvasTextAlign;
  labelColor?: string;
  [key: string]: unknown;
}

export interface ElementProps {
  status?: SeatStatus;
  seats?: number;
  /** Door: open/closed state. */
  open?: boolean;
  /** A/C: on/off state. */
  on?: boolean;
  /** Entrance vs. exit marker. */
  kind?: EntranceKind;
  /** Image element source (URL or data URI). */
  src?: string;
  fit?: ImageFit;
  /** Tooltip HTML/text shown by the default hover renderer. */
  tooltip?: string;
  /**
   * Whether this element snaps to walls during edit-mode drags.
   * Defaults to true for door / door-double / door-slide / window types.
   * Set to false to free the element from the wall.
   */
  snap?: boolean;
  [key: string]: unknown;
}

// ---- actions --------------------------------------------------------------

export type ActionEvent = 'click' | 'dblclick' | 'hover';

interface ActionBase {
  id?: string;
  on?: ActionEvent;
}
export interface ToggleAction extends ActionBase { do: 'toggle'; prop: string }
export interface SetAction extends ActionBase { do: 'set'; prop: string; value: unknown }
export interface CycleAction extends ActionBase { do: 'cycle'; prop: string; values: unknown[] }
export interface LinkAction extends ActionBase { do: 'link'; url: string; target?: string }
export interface EmitAction extends ActionBase { do: 'emit'; name?: string; payload?: unknown }
export interface CustomAction extends ActionBase { do: string; [key: string]: unknown }
export type ElementAction = ToggleAction | SetAction | CycleAction | LinkAction | EmitAction | CustomAction;

// ---- element / floor / building ------------------------------------------

export interface PlanElement {
  id: string;
  type: string;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  showLabel: boolean;
  locked: boolean;
  hidden: boolean;
  /** Optional id of a containing room/floor element (for grouping). */
  room: string | null;
  style: ElementStyle;
  props: ElementProps;
  actions: ElementAction[];
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

export interface Background {
  color?: string;
  grid?: { enabled?: boolean; size?: number; color?: string };
}

export interface Floor {
  id: string;
  name: string;
  /** Storey number (0 = ground). */
  level: number;
  size: Size;
  background: Background;
  layers: Layer[];
  elements: PlanElement[];
}

export interface BuildingMeta {
  name?: string;
  units?: 'm' | 'ft' | string;
  /** Pixels per real-world unit. */
  scale?: number;
  [key: string]: unknown;
}

export interface Building {
  version: string;
  meta: BuildingMeta;
  floors: Floor[];
  /** Active floor id. */
  activeFloor: string;
}

// ---- registry & rendering -------------------------------------------------

export type ElementCategory = 'structure' | 'furniture' | 'equipment' | 'shape' | 'misc';

export interface TypeEnv {
  showLabel: boolean;
  selected: boolean;
  hovered: boolean;
  opacity: number;
  time: number;
  getImage: (src: string) => HTMLImageElement | null;
}

export interface ElementTypeDef {
  type: string;
  category: ElementCategory;
  label: string;
  icon?: string;
  defaults?: {
    width?: number;
    height?: number;
    rotation?: number;
    style?: ElementStyle;
    props?: ElementProps;
  };
  draw: (ctx: CanvasRenderingContext2D, el: PlanElement, env: TypeEnv) => void;
  hitTest?: (el: PlanElement, point: Point) => boolean;
  statusColors?: Record<string, string>;
  /** Whether this type should be snapped to walls during drags. */
  snapsToWall?: boolean;
}

// ---- events ---------------------------------------------------------------

export interface ElementEventDetail {
  id: string;
  element: PlanElement;
  /** Pointer position relative to the canvas top-left. */
  screen: Point;
  /** Pointer position in viewport coordinates (use for fixed-position menus). */
  client: Point;
  canvasRect: { left: number; top: number; width: number; height: number };
}

export interface ActionEffect {
  kind: string;
  prop?: string;
  value?: unknown;
  name?: string;
  payload?: unknown;
  url?: string;
  target?: string;
}

export type FloorPlanEventMap = {
  'ready': void;
  'change': { reason?: string; ids?: string[] };
  'element-click': ElementEventDetail;
  'element-dblclick': ElementEventDetail;
  'element-contextmenu': ElementEventDetail;
  'element-action': ElementEventDetail & ActionEffect;
  'element-change': { ids?: string[]; reason: string };
  'selection-change': { ids: string[] };
  'hover-change': { id: string | null };
  'floor-change': { floorId: string };
  'zoom-change': { zoom: number };
};

// ---- listener API ---------------------------------------------------------

export type ElementListenerType = 'click' | 'dblclick' | 'contextmenu' | 'action' | 'hover' | 'hoverout';

export type ElementListener = (detail: ElementEventDetail | { id: string; element: PlanElement | null }) => void;

// ---- model event payload --------------------------------------------------

export interface ModelEvent {
  type: 'change' | 'load' | 'floor-change';
  reason?: string;
  ids?: string[];
  floorId?: string;
  model?: unknown;
}

// ---- wall segments (for door/window snapping) -----------------------------

export interface WallSegment {
  /** Endpoint 1 in world coords. */
  a: Point;
  /** Endpoint 2 in world coords. */
  b: Point;
  /** Wall thickness in world units (0 = thin/zone border). */
  thickness: number;
  /** Element id this segment came from. */
  sourceId: string;
  /** Element type the segment was extracted from. */
  sourceType: string;
}

export interface SnapResult {
  /** Closest point on the matched wall segment. */
  point: Point;
  /** Segment's angle in degrees (used for door rotation). */
  angleDeg: number;
  /** Perpendicular distance from the input to the segment. */
  distance: number;
  segment: WallSegment;
}
