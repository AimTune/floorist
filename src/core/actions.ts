// Action system — data-driven, real-world behaviours attached to elements.
// An action lives on element.actions and fires when the matching interaction
// happens in view mode. Actions can mutate the model (toggle a door, cycle a
// table's status) and/or surface intent to the host app via emitted effects.

import type { FloorPlanModel } from './model.js';
import type {
  ActionEffect,
  ActionEvent,
  ElementAction,
  PlanElement,
} from './types.js';

export interface ActionContext {
  mode: 'view' | 'edit';
}

export interface ActionHandlerArgs {
  model: FloorPlanModel;
  el: PlanElement;
  action: ElementAction;
  ctx: ActionContext;
}

export interface ActionHandlerResult {
  mutated?: boolean;
  effect?: ActionEffect;
}

export type ActionHandler = (args: ActionHandlerArgs) => ActionHandlerResult;

const _handlers = new Map<string, ActionHandler>();

export function registerActionHandler(name: string, fn: ActionHandler): void {
  _handlers.set(name, fn);
}

export interface RunActionsResult {
  mutated: boolean;
  effects: (ActionEffect & { action: ElementAction; el: PlanElement })[];
}

/**
 * Run every action on `el` that matches `eventName`.
 */
export function runActions(
  model: FloorPlanModel,
  el: PlanElement | null,
  eventName: ActionEvent,
  ctx: Partial<ActionContext> = {},
): RunActionsResult {
  const fullCtx: ActionContext = { mode: ctx.mode ?? 'view' };
  const result: RunActionsResult = { mutated: false, effects: [] };
  if (!el || !Array.isArray(el.actions)) return result;
  for (const action of el.actions) {
    if ((action.on || 'click') !== eventName) continue;
    const handler = _handlers.get(action.do);
    if (!handler) {
      // unknown action kind → surface as-is so the host can react
      result.effects.push({ kind: action.do, action, el, ...(action as Record<string, unknown>) } as ActionEffect & { action: ElementAction; el: PlanElement });
      continue;
    }
    const out = handler({ model, el, action, ctx: fullCtx });
    if (out?.mutated) result.mutated = true;
    if (out?.effect) result.effects.push({ ...out.effect, action, el });
  }
  return result;
}

// ---- built-in handlers ----------------------------------------------------
registerActionHandler('toggle', ({ model, el, action }) => {
  const a = action as Extract<ElementAction, { do: 'toggle' }>;
  const prop = a.prop || 'open';
  const next = !el.props?.[prop as keyof typeof el.props];
  model.updateElement(el.id, { props: { [prop]: next } as Partial<PlanElement['props']> });
  return { mutated: true, effect: { kind: 'toggle', prop, value: next } };
});

registerActionHandler('set', ({ model, el, action }) => {
  const a = action as Extract<ElementAction, { do: 'set' }>;
  model.updateElement(el.id, { props: { [a.prop]: a.value } as Partial<PlanElement['props']> });
  return { mutated: true, effect: { kind: 'set', prop: a.prop, value: a.value } };
});

registerActionHandler('cycle', ({ model, el, action }) => {
  const a = action as Extract<ElementAction, { do: 'cycle' }>;
  const values = a.values || ['available', 'reserved', 'occupied'];
  const prop = a.prop || 'status';
  const current = el.props?.[prop as keyof typeof el.props];
  const idx = values.indexOf(current as unknown);
  const next = values[(idx + 1) % values.length];
  model.updateElement(el.id, { props: { [prop]: next } as Partial<PlanElement['props']> });
  return { mutated: true, effect: { kind: 'cycle', prop, value: next } };
});

registerActionHandler('link', ({ action }) => {
  const a = action as Extract<ElementAction, { do: 'link' }>;
  return { effect: { kind: 'link', url: a.url, target: a.target || '_blank' } };
});

registerActionHandler('emit', ({ action }) => {
  const a = action as Extract<ElementAction, { do: 'emit' }>;
  return { effect: { kind: 'emit', name: a.name || 'action', payload: a.payload } };
});
