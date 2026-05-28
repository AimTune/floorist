# 🏠 floorist

<!-- badges-start -->
![build](https://img.shields.io/badge/build-passing-brightgreen) ![types](https://img.shields.io/badge/types-TypeScript-blue) ![license](https://img.shields.io/badge/license-MIT-blue)
<!-- badges-end -->

<!-- coverage-start -->

![coverage](https://img.shields.io/badge/coverage-78.3%25-yellow)

<!-- coverage-end -->

A **dependency-free web component** for drawing and editing real-world floor
plans — tables, chairs, doors, windows, A/C units, plants, entrances, custom
images and more. Elements carry **domain data and attachable actions** (toggle a
door, cycle a table's status, open a link), so a plan models the real space, not
just a picture of it.

- **Zero runtime dependencies.** Ships as plain ES modules + Canvas 2D, with **TypeScript types** out of the box.
- **One custom element:** `<floor-plan>`.
- **Its own JSON format** (`.floorist.json`) — a building with one or more floors.
- **Multi-floor buildings.** Switch storeys; share the whole building or one floor.
- **View & edit modes.** Pan/zoom, click-to-act, drag, resize, marquee, undo/redo.
- **3 door types** (single / double / sliding) and **windows** that **snap to walls** automatically — release each one per-element.
- **Listeners by id, custom HTML/canvas hover, room grouping.**
- **Import / export / share** (file, clipboard, data-URL link, embed snippet).
- **Extensible.** Register your own element types and action handlers.

```html
<floor-plan mode="view"></floor-plan>
<script type="module">
  import 'floorist/component';
  document.querySelector('floor-plan').load(myFloorPlan);
</script>
```

## Demo

```bash
npm install      # one-off, just installs the TypeScript dev dependency
npm run dev      # compiles src → dist, then serves http://localhost:5173/demo.html
# or
npm run build    # compile + tests + coverage + regenerates the README block
npm run compile  # tsc only — emits dist/*.js + dist/*.d.ts (+ source maps)
```

The demo lets you pick a sample (restaurant / office / classroom / café / blank),
toggle **View ↔ Edit**, drop elements from a palette, edit properties, and export
the document as JSON.

## Install / use

This is a native-ESM package — no bundler needed.

```js
// registers <floor-plan> as a side effect + exposes the API
import 'floorist';
// or just the element:
import 'floorist/component';
// advanced / headless building blocks:
import { FloorPlanModel, registerType, registerActionHandler } from 'floorist';
```

## The `<floor-plan>` element

### Attributes
| Attribute    | Values            | Description                                  |
|--------------|-------------------|----------------------------------------------|
| `mode`       | `view` \| `edit`  | Interaction mode (default `view`).           |
| `src`        | URL               | Fetch + load a `.floorist.json` document.    |
| `grid-snap`  | number (px)       | Snap step while editing (`0` = off).         |
| `readonly`   | boolean attr      | Disable mutations even in edit mode.         |

### Properties & methods
```js
el.data            // get/set the document object
el.model           // the FloorPlanModel (advanced)
el.load(doc)
el.getDocument()
el.exportJSON(pretty = true)
el.addElement(partial)            // add anywhere
el.addElementAtCenter(partial)    // add centered in the current view
el.setMode('view' | 'edit')
el.select(ids); el.getSelection(); el.clearSelection()
el.undo(); el.redo()
el.fitToContent(); el.zoomIn(); el.zoomOut(); el.resetZoom()

// floors (storeys)
el.getFloors()                     // [{ id, name, level, count }]
el.getActiveFloorId()
el.setActiveFloor(id)
el.addFloor({ name }); el.removeFloor(id); el.duplicateFloor(id)
el.getRooms()                      // floor/room elements on the active floor
el.focusElement(id)                // frame an element (e.g. focus a room)

// imperative per-element listeners (see below)
el.on(id, type, handler)   // returns an unsubscribe fn; id '*' = all elements
el.off(id, type, handler)
el.setOverlayRenderer(fn)          // custom CANVAS overlay (e.g. hover ring)
el.setHoverContent(fn)             // custom HTML on hover (fn(el) → string|Node)
el.getElementScreenRect(id)        // viewport rect of an element, for menus
```

### Events (all `CustomEvent`, bubble + composed)
| Event              | `detail`                                   |
|--------------------|--------------------------------------------|
| `ready`            | —                                          |
| `change`           | `{ reason, ids }`                          |
| `element-click`    | `{ id, element }`                          |
| `element-dblclick` | `{ id, element }`                          |
| `element-action`   | `{ id, kind, ... }` (after an action runs) |
| `selection-change` | `{ ids }`                                  |
| `hover-change`     | `{ id }`                                    |
| `element-change`   | `{ ids, reason }` (move/resize/delete)     |
| `element-contextmenu` | `{ id, element, screen, client, canvasRect }` |
| `floor-change`     | `{ floorId }` (active storey switched)     |
| `zoom-change`      | `{ zoom }`                                 |

Element events (`element-click`, `element-dblclick`, `element-contextmenu`,
`element-action`) carry positions so you can place DOM tooltips/menus:
`detail.client` (viewport x/y), `detail.screen` (relative to the canvas) and
`detail.canvasRect`.

```js
el.addEventListener('element-action', (e) => {
  if (e.detail.kind === 'link') window.open(e.detail.url, e.detail.target);
});
```

### Listening by element id (and custom hover render)

Give an element a stable `id` in the JSON, then attach behaviour from JS — no
need to encode everything as data-driven `actions`:

```js
// JSON:  { "id": "vip-table", "type": "table-round", ... }
el.on('vip-table', 'click', (e) => openReservationModal(e.id, e.client));
el.on('vip-table', 'hover', (e) => showInfo(e.element));
const off = el.on('*', 'contextmenu', (e) => openMenu(e.id, e.client)); // all elements
// off();  // unsubscribe

// Open your own DOM menu on right-click, positioned at the cursor:
el.addEventListener('element-contextmenu', (e) => {
  menu.style.left = e.detail.client.x + 'px';
  menu.style.top  = e.detail.client.y + 'px';
  menu.show(e.detail.element);
});
```

Listener `type`s: `click`, `dblclick`, `contextmenu`, `action`, `hover`,
`hoverout`. The id `'*'` matches every element.

**Custom canvas rendering on hover** — `setOverlayRenderer` runs every frame
after the scene (world transform active) so you can paint highlights, ranges,
labels, heatmaps, etc.:

```js
el.setOverlayRenderer((ctx, info) => {
  const hovered = info.hoverElement;
  if (!hovered) return;
  // world-space ring around the hovered element
  ctx.strokeStyle = '#2f7df6';
  ctx.lineWidth = 2 / info.camera.zoom;
  ctx.strokeRect(hovered.x - 5, hovered.y - 5, hovered.width + 10, hovered.height + 10);
  // for screen-space drawing: ctx.setTransform(info.dpr,0,0,info.dpr,0,0)
});
```
`info` = `{ camera, dpr, hoverId, hoverElement, selectedIds, model, cssWidth, cssHeight }`.

## The document format (`.floorist.json`)

A document is a **building** with one or more **floors** (storeys). Element and
layer operations always target the active floor.

```jsonc
{
  "version": "2.0",
  "meta": { "name": "Office Building", "units": "m", "scale": 50 },
  "activeFloor": "ground",
  "floors": [
    {
      "id": "ground",
      "name": "Ground · Reception",
      "level": 0,
      "size": { "width": 1000, "height": 680 },
      "background": { "color": "#fbfaf6", "grid": { "enabled": true, "size": 25, "color": "#ecebe3" } },
      "layers": [
        { "id": "furniture", "name": "Furniture", "visible": true, "locked": false, "opacity": 1 }
      ],
      "elements": [
        {
          "id": "t1",
          "type": "table-round",
          "layer": "furniture",
          "x": 130, "y": 110, "width": 90, "height": 90, "rotation": 0,
          "label": "T1", "showLabel": true,
          "style": { "fill": "#d9b38c", "stroke": "#9c7b54" },
          "props": { "seats": 4, "status": "available", "tooltip": "<b>Table 1</b>" },
          "actions": [
            { "on": "click", "do": "cycle", "prop": "status",
              "values": ["available", "reserved", "occupied"] }
          ]
        }
      ]
    }
  ]
}
```

Missing fields are filled in from each type's defaults during `load()`, so
hand-written documents can be terse. Coordinates are in pixels; `meta.scale`
(pixels per real-world unit) lets you map them back to metres/feet.

- **`showLabel`** is opt-in: an element's `label` is only drawn when
  `showLabel: true`. (`text` and `wc` always render their text.)
- **`props.tooltip`** provides default HTML shown on hover (overridable via
  `el.setHoverContent`).
- **Legacy single-plan documents** (top-level `elements`/`layers`/`size`, no
  `floors`) are auto-migrated into a one-floor building on load — older files
  keep working.

### Built-in element types
`floor` (a rectangular room/container with solid wall borders — use this instead
of assembling four `wall` bars), `room` (dashed zone), `wall`, **`door`**
(single-leaf swing), **`door-double`** (two leaves), **`door-slide`** (sliding
on the wall), `window`, `stairs`, `entrance` (entrance/exit), `table-round`,
`table-rect`, `chair`, `sofa`, `ac`, `plant`, `wc`, `text`, `image` (custom
PNG/SVG via `props.src`), plus generic `rect` / `circle`.

### Doors and windows snap to walls
Doors and windows are *wall-mounted* by default: dragging one snaps it to the
nearest wall and rotates it to match the wall's angle. Walls come from three
sources on the active floor: `floor` element perimeters, `room` element borders
and standalone `wall` elements (use those for partitions inside a room).

Per-element override — set `props.snap = false` to free a door/window from the
walls (or `true` on any other type to make it snap too):

```jsonc
{ "type": "door-double", "x": 350, "y": 0, "width": 140, "height": 70,
  "props": { "open": true, "snap": false /* free placement */ } }
```

Programmatic API:

```ts
import { getWallSegments, snapToWalls, snapsToWall } from 'floorist';
const segs = getWallSegments(model.activeFloor);
const hit  = snapToWalls({ x: 700, y: 50 }, segs); // { point, angleDeg, segment }
```

```jsonc
// a whole room as ONE element (walls = the rectangle's border)
{ "type": "floor", "x": 40, "y": 40, "width": 920, "height": 600,
  "label": "Dining Hall",
  "style": { "fill": "#fdfbf6", "stroke": "#42423d", "wall": 14, "radius": 6 } }
```

### Actions
Attach behaviours to any element via its `actions` array. Built-in `do` handlers:

| `do`     | params                       | effect                                 |
|----------|------------------------------|----------------------------------------|
| `toggle` | `prop`                       | flip a boolean prop (door `open`, ac `on`) |
| `set`    | `prop`, `value`              | set a prop to a fixed value            |
| `cycle`  | `prop`, `values[]`           | advance a prop through a list          |
| `link`   | `url`, `target`              | host opens a URL (via `element-action`)|
| `emit`   | `name`, `payload`            | notify the host only                   |

`on` can be `click`, `dblclick` or `hover`.

## Floors & rooms

```js
el.getFloors();                 // [{ id, name, level, count }]
el.setActiveFloor('f1');        // switch storey (fires "floor-change")
el.addFloor({ name: 'Roof' });
el.duplicateFloor('ground');
el.removeFloor('f2');           // keeps at least one floor

// rooms = floor/room elements on the active floor
el.getRooms();                  // [{ id, type, label }]
el.focusElement(roomId);        // frame/zoom the camera onto it
```

In **edit** mode, clicking a `room`/`floor` container selects it **and the
elements inside it**, so the whole room moves as a group.

## Import / export / share

```js
el.getDocument();               // the whole building (serializable)
el.exportJSON();                // pretty-printed JSON string
el.model.exportFloor('f1');     // a building containing only that floor

import { buildShareUrl, buildEmbedCode, parseShareHash, encodeShare, decodeShare } from 'floorist';

const link  = buildShareUrl(el.getDocument());          // ...#data=<base64>&mode=view
const embed = buildEmbedCode(el.model.exportFloor('f1')); // <iframe src="...#data=...">

// on load, hydrate from a share link (no backend needed):
const { data, mode } = parseShareHash(location.hash);
if (data) { el.load(data); if (mode) el.setMode(mode); }
```

Import is just `el.load(JSON.parse(fileText))`. The data travels inside the URL
hash, so links and embeds work without any server.

## Extending

```js
import { registerType, registerActionHandler } from 'floorist';

// custom element type — draw in the element's LOCAL frame (0,0 = top-left)
registerType({
  type: 'piano',
  category: 'furniture',
  label: 'Piano',
  icon: '🎹',
  defaults: { width: 120, height: 70, style: { fill: '#222' } },
  draw(ctx, el /*, env */) {
    ctx.fillStyle = el.style.fill;
    ctx.fillRect(0, 0, el.width, el.height);
  },
});

// custom action handler
registerActionHandler('reserve', ({ model, el }) => {
  model.updateElement(el.id, { props: { status: 'reserved' } });
  return { mutated: true, effect: { kind: 'reserved' } };
});
```

## Headless / framework use

`FloorPlanModel` is UI-free — generate, validate and serialize plans on a server
or in tests:

```js
import { FloorPlanModel } from 'floorist';
const model = new FloorPlanModel(doc);
model.addElement({ type: 'table-round', x: 100, y: 100 });
const json = JSON.stringify(model.toJSON());
```

## Editor shortcuts (edit mode)
`Drag` move · corner handles resize · `Delete`/`Backspace` remove ·
`⌘/Ctrl+D` duplicate · `⌘/Ctrl+Z` / `⇧⌘/Ctrl+Z` undo/redo · arrows nudge
(`Shift`+arrow = 10px) · `Space`+drag or middle-mouse pan · wheel zoom ·
marquee-drag on empty space to multi-select.

## Project layout
```
src/
  index.js                 public API (registers the element)
  component/floor-plan.js   the <floor-plan> custom element
  core/   schema · model · geometry · actions · share
  render/ renderer · camera · shapes
  elements/registry.js      extensible element types
  editor/controller.js      pointer/keyboard interactions
demo/samples.js             example floor plans
demo.html                   interactive demo
```

## Testing & coverage

Headless unit tests run with Node's built-in test runner — no extra dev
dependency on Jest/Vitest. Coverage is produced by Node itself
(`--experimental-test-coverage`) and the summary below is regenerated by
`npm run build` (or `npm run coverage`).

```bash
npm test          # tsc + node --test test/
npm run coverage  # tests with coverage + updates the table at the top
```

The overall percentage shown in the badge at the top of this README is regenerated on every `npm run build`.

## Publishing

The npm package ships only the compiled `dist/` (JS + `.d.ts` + source maps),
`README.md` and `LICENSE`. To publish:

```bash
npm run build              # compiles src/*.ts → dist/
npm pack --dry-run         # sanity-check the file list
npm publish --access public
```

`prepublishOnly` runs `clean + build` so the published artifact always matches
the current source.

## License
MIT
