// floorist — public API surface.
// Importing this module registers the <floor-plan> custom element as a side
// effect and re-exports the building blocks for advanced/headless use.

export { FloorPlanElement } from './component/floor-plan.js';

export { FloorPlanModel } from './core/model.js';

export {
  FORMAT_VERSION,
  DEFAULT_BUILDING,
  DEFAULT_FLOOR,
  uid,
  normalizeBuilding,
  normalizeFloor,
  normalizeDocument, // back-compat alias of normalizeBuilding
  normalizeElement,
  normalizeAction,
  validateDocument,
} from './core/schema.js';

export {
  registerType,
  getType,
  hasType,
  listTypes,
  getTypeDefaults,
  hitTest,
} from './elements/registry.js';

export {
  registerActionHandler,
  runActions,
} from './core/actions.js';

export { Renderer } from './render/renderer.js';
export { Camera } from './render/camera.js';
export { InteractionController } from './editor/controller.js';

export {
  encodeShare,
  decodeShare,
  buildShareUrl,
  buildEmbedCode,
  parseShareHash,
} from './core/share.js';

export {
  getWallSegments,
  snapToWalls,
  snapsToWall,
} from './core/walls.js';

export * as geometry from './core/geometry.js';

// Public types — everything a consumer needs to talk to the library safely.
export type {
  Point,
  Size,
  Rect,
  SeatStatus,
  EntranceKind,
  ImageFit,
  ElementStyle,
  ElementProps,
  ActionEvent,
  ElementAction,
  ToggleAction,
  SetAction,
  CycleAction,
  LinkAction,
  EmitAction,
  CustomAction,
  PlanElement,
  Layer,
  Background,
  Floor,
  BuildingMeta,
  Building,
  ElementCategory,
  TypeEnv,
  ElementTypeDef,
  ElementEventDetail,
  ActionEffect,
  FloorPlanEventMap,
  ElementListenerType,
  ElementListener,
  ModelEvent,
  WallSegment,
  SnapResult,
} from './core/types.js';
