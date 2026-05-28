// Example floor plans in the floorist document format.
// Each sample is { id, name, description, document }. The demo page lets you
// pick one and renders it. These double as living documentation of the format.

// ---- small builders to keep the data readable -----------------------------
let n = 0;
const id = (p) => `${p}_${++n}`;

/** A round/rect table with a status + a "cycle status" click action. */
function table(type, x, y, opts = {}) {
  return {
    id: id(type),
    type,
    x,
    y,
    label: opts.label,
    showLabel: opts.showLabel ?? Boolean(opts.label), // opt-in labels (on if labelled)
    width: opts.width,
    height: opts.height,
    rotation: opts.rotation || 0,
    props: { seats: opts.seats ?? (type === 'table-round' ? 4 : 6), status: opts.status || 'available' },
    actions: [
      { on: 'click', do: 'cycle', prop: 'status', values: ['available', 'reserved', 'occupied'] },
    ],
  };
}

/** A door with an open/closed toggle action.
 *  Pass opts.type = 'door' | 'door-double' | 'door-slide' (default 'door'). */
function door(x, y, opts = {}) {
  const type = opts.type || 'door';
  return {
    id: id(type),
    type,
    x,
    y,
    width: opts.width || (type === 'door-double' ? 140 : type === 'door-slide' ? 130 : 70),
    height: opts.height || (type === 'door-slide' ? 16 : 70),
    rotation: opts.rotation || 0,
    label: opts.label,
    showLabel: opts.label ? true : false,
    props: { open: opts.open !== false, snap: opts.snap !== false },
    actions: [{ on: 'click', do: 'toggle', prop: 'open' }],
  };
}

function el(type, x, y, props = {}) {
  const node = { id: id(type), type, x, y, ...props };
  // opt-in labels: anything given a label shows it by default in these samples
  if (node.label && node.showLabel === undefined) node.showLabel = true;
  return node;
}

// A tiny inline logo (data URI) used by the "image" element — no network needed.
const LOGO = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
  <rect width="160" height="160" rx="24" fill="#1f6f54"/>
  <circle cx="80" cy="64" r="34" fill="#fff"/>
  <rect x="58" y="64" width="44" height="46" rx="6" fill="#fff"/>
  <text x="80" y="138" font-family="system-ui" font-size="22" font-weight="700"
    fill="#fff" text-anchor="middle">CAFÉ</text>
</svg>`);

// ===========================================================================
// 1) Restaurant ground floor
// ===========================================================================
const restaurant = {
  version: '1.0',
  meta: { name: 'Restaurant — Ground Floor', units: 'm', scale: 50 },
  size: { width: 1000, height: 680 },
  background: { color: '#fbfaf6', grid: { enabled: true, size: 25, color: '#ecebe3' } },
  layers: [
    { id: 'structure', name: 'Structure', visible: true, locked: false, opacity: 1 },
    { id: 'furniture', name: 'Furniture', visible: true, locked: false, opacity: 1 },
    { id: 'equipment', name: 'Equipment', visible: true, locked: false, opacity: 1 },
  ],
  elements: [
    // the room itself — one rectangular container with walls
    { ...el('floor', 40, 40, { width: 920, height: 600, label: 'Dining Hall',
      style: { fill: '#fdfbf6', stroke: '#42423d', wall: 14, radius: 6 } }), layer: 'structure' },
    // kitchen zone
    { ...el('room', 700, 60, { width: 246, height: 220, label: 'Kitchen' }), layer: 'structure' },
    { ...el('wc', 720, 470, { width: 100, height: 90, label: 'WC' }), layer: 'structure' },
    // windows + doors
    { ...el('window', 200, 40, { width: 140, height: 14 }), layer: 'structure' },
    { ...el('window', 480, 40, { width: 140, height: 14 }), layer: 'structure' },
    { ...door(120, 560, { label: 'Service', rotation: 0 }), layer: 'structure' },
    // entrance / exit
    { ...el('entrance', 60, 300, { width: 80, height: 44, props: { kind: 'entrance' }, label: 'Main' }), layer: 'structure' },
    { ...el('entrance', 860, 580, { width: 80, height: 44, props: { kind: 'exit' }, label: 'Exit' }), layer: 'structure' },

    // dining furniture
    { ...table('table-round', 130, 110, { label: 'T1', seats: 4 }), layer: 'furniture' },
    // a stable, human-readable id so a host can attach a listener by id later
    { ...table('table-round', 300, 110, { label: 'VIP', seats: 4, status: 'reserved' }), id: 'vip-table', layer: 'furniture' },
    { ...table('table-round', 470, 110, { label: 'T3', seats: 4, status: 'occupied' }), layer: 'furniture' },
    { ...table('table-rect', 110, 280, { label: 'T4', seats: 6 }), layer: 'furniture' },
    { ...table('table-rect', 320, 280, { label: 'T5', seats: 6, status: 'occupied' }), layer: 'furniture' },
    { ...table('table-round', 540, 300, { label: 'T6', width: 110, height: 110, seats: 6 }), layer: 'furniture' },
    { ...el('sofa', 110, 430, { width: 200, height: 60, label: 'Booth A' }), layer: 'furniture' },
    { ...el('sofa', 360, 430, { width: 200, height: 60, label: 'Booth B' }), layer: 'furniture' },
    { ...table('table-round', 150, 520, { label: 'T7', width: 70, height: 70, seats: 2 }), layer: 'furniture' },
    { ...table('table-round', 400, 520, { label: 'T8', width: 70, height: 70, seats: 2 }), layer: 'furniture' },
    // bar
    { ...el('rect', 560, 470, { width: 120, height: 110, label: 'Bar', style: { fill: '#cdb08e', stroke: '#9c7b54', radius: 8 } }), layer: 'furniture' },

    // equipment
    { ...el('ac', 250, 60, { width: 90, height: 24, props: { on: true } }), layer: 'equipment',
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
    { ...el('ac', 560, 60, { width: 90, height: 24, props: { on: false } }), layer: 'equipment',
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
    { ...el('plant', 80, 110, { width: 40, height: 40 }), layer: 'equipment' },
    { ...el('plant', 640, 600, { width: 40, height: 40 }), layer: 'equipment' },
  ],
};

// ===========================================================================
// 2) Open-plan office
// ===========================================================================
function deskCluster(ox, oy) {
  const out = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const x = ox + c * 130;
      const y = oy + r * 150;
      out.push(
        { ...el('table-rect', x, y, { width: 110, height: 60, label: `D${r * 3 + c + 1}` }), layer: 'furniture', props: { seats: 0 } },
        { ...el('chair', x + 38, y + 66, { width: 32, height: 32 }), layer: 'furniture' },
      );
    }
  }
  return out;
}

const office = {
  version: '1.0',
  meta: { name: 'Open-plan Office', units: 'm', scale: 50 },
  size: { width: 1100, height: 720 },
  background: { color: '#f6f8fa', grid: { enabled: true, size: 25, color: '#e7ecf1' } },
  layers: [
    { id: 'structure', name: 'Structure', visible: true, opacity: 1 },
    { id: 'furniture', name: 'Furniture', visible: true, opacity: 1 },
    { id: 'equipment', name: 'Equipment', visible: true, opacity: 1 },
  ],
  elements: [
    { ...el('floor', 40, 40, { width: 1020, height: 640, label: 'Office Floor',
      style: { fill: '#fbfdff', stroke: '#3a4453', wall: 12, radius: 6 } }), layer: 'structure' },
    { ...el('room', 760, 70, { width: 270, height: 230, label: 'Meeting Room' }), layer: 'structure' },
    { ...el('room', 760, 360, { width: 270, height: 280, label: 'Lounge' }), layer: 'structure' },
    { ...door(60, 330, { label: 'Entry' }), layer: 'structure' },
    { ...el('entrance', 56, 300, { width: 70, height: 40, props: { kind: 'entrance' } }), layer: 'structure' },

    ...deskCluster(110, 110),
    ...deskCluster(110, 430),

    // meeting room table
    { ...el('table-rect', 810, 130, { width: 170, height: 90, label: 'Board', props: { seats: 8 } }), layer: 'furniture' },
    // lounge sofas
    { ...el('sofa', 800, 420, { width: 180, height: 64, label: 'Sofa' }), layer: 'furniture' },
    { ...el('sofa', 800, 520, { width: 180, height: 64, label: 'Sofa' }), layer: 'furniture' },
    { ...el('plant', 720, 600, { width: 46, height: 46 }), layer: 'furniture' },

    { ...el('ac', 300, 60, { width: 90, height: 24, props: { on: true } }), layer: 'equipment',
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
    { ...el('ac', 600, 60, { width: 90, height: 24, props: { on: true } }), layer: 'equipment',
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
  ],
};

// ===========================================================================
// 3) Classroom
// ===========================================================================
function studentRows() {
  const out = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 120 + c * 130;
      const y = 200 + r * 110;
      out.push(
        { ...el('table-rect', x, y, { width: 90, height: 50, props: { seats: 0 } }), layer: 'furniture' },
        { ...el('chair', x + 29, y + 56, { width: 32, height: 32 }), layer: 'furniture' },
      );
    }
  }
  return out;
}

const classroom = {
  version: '1.0',
  meta: { name: 'Classroom', units: 'm', scale: 50 },
  size: { width: 900, height: 720 },
  background: { color: '#fdfdf8', grid: { enabled: true, size: 25, color: '#ececdf' } },
  layers: [
    { id: 'structure', name: 'Structure', visible: true, opacity: 1 },
    { id: 'furniture', name: 'Furniture', visible: true, opacity: 1 },
  ],
  elements: [
    { ...el('floor', 40, 40, { width: 820, height: 640, label: 'Classroom 1-A',
      style: { fill: '#fffdf6', stroke: '#43423a', wall: 12, radius: 6 } }), layer: 'structure' },
    { ...el('rect', 250, 70, { width: 400, height: 40, label: 'Whiteboard',
      style: { fill: '#2c3e50', stroke: '#1c2b38', radius: 4 } }), layer: 'structure' },
    { ...el('text', 120, 120, { label: 'Teacher desk', style: { color: '#777', size: 14 } }), layer: 'structure' },
    { ...el('table-rect', 360, 130, { width: 160, height: 60, label: 'Teacher', props: { seats: 0 } }), layer: 'furniture' },
    { ...el('window', 120, 40, { width: 160, height: 12 }), layer: 'structure' },
    { ...el('window', 420, 40, { width: 160, height: 12 }), layer: 'structure' },
    { ...door(120, 600, { label: 'Door' }), layer: 'structure' },
    { ...el('ac', 700, 70, { width: 90, height: 24, props: { on: true } }), layer: 'structure',
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
    ...studentRows(),
  ],
};

// ===========================================================================
// 4) Café with a custom image + linked actions
// ===========================================================================
const cafe = {
  version: '1.0',
  meta: { name: 'Café (custom image + links)', units: 'm', scale: 50 },
  size: { width: 820, height: 560 },
  background: { color: '#fff8f0', grid: { enabled: true, size: 20, color: '#f0e6da' } },
  layers: [{ id: 'default', name: 'Default', visible: true, opacity: 1 }],
  elements: [
    { ...el('floor', 30, 30, { width: 760, height: 500, label: 'Café',
      style: { fill: '#fffaf2', stroke: '#5a4332', wall: 12, radius: 8 } }) },
    // the custom image element (a logo)
    { ...el('image', 330, 60, { width: 150, height: 150, props: { src: LOGO, fit: 'contain' } }),
      actions: [{ on: 'click', do: 'link', url: 'https://example.com', target: '_blank' }] },
    { ...el('text', 300, 220, { label: 'Welcome ☕', style: { color: '#7a5230', size: 22, weight: 700, align: 'center' }, width: 220 }) },
    { ...table('table-round', 90, 280, { label: 'C1', width: 80, height: 80, seats: 2 }) },
    { ...table('table-round', 250, 280, { label: 'C2', width: 80, height: 80, seats: 2, status: 'occupied' }) },
    { ...table('table-round', 410, 280, { label: 'C3', width: 80, height: 80, seats: 2 }) },
    { ...table('table-round', 570, 280, { label: 'C4', width: 80, height: 80, seats: 2, status: 'reserved' }) },
    { ...el('rect', 90, 410, { width: 220, height: 80, label: 'Counter', style: { fill: '#c9a27a', stroke: '#9c7b54', radius: 8 } }) },
    { ...el('entrance', 360, 470, { width: 80, height: 44, props: { kind: 'entrance' }, label: 'Door' }) },
    { ...el('plant', 720, 60, { width: 44, height: 44 }) },
    { ...el('ac', 600, 50, { width: 90, height: 24, props: { on: true } }),
      actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
  ],
};

// ===========================================================================
// 5) Multi-floor office building (the new building format)
// ===========================================================================
function buildingFloor(fid, name, level, elements) {
  return {
    id: fid,
    name,
    level,
    size: { width: 800, height: 560 },
    background: { color: '#f8f9fb', grid: { enabled: true, size: 25, color: '#e8ecf1' } },
    layers: [
      { id: 'structure', name: 'Structure', visible: true, opacity: 1 },
      { id: 'furniture', name: 'Furniture', visible: true, opacity: 1 },
    ],
    elements,
  };
}
const shell = (label) => ({ ...el('floor', 30, 30, { width: 740, height: 500, label,
  style: { fill: '#ffffff', stroke: '#3a4453', wall: 12, radius: 6 } }), layer: 'structure' });

const building = {
  version: '2.0',
  meta: { name: 'Office Building', units: 'm', scale: 50 },
  activeFloor: 'ground',
  floors: [
    buildingFloor('ground', 'Ground · Reception', 0, [
      shell('Ground · Reception'),
      { ...el('room', 80, 90, { width: 380, height: 240, label: 'Lobby' }), layer: 'structure' },
      { ...el('table-rect', 130, 150, { width: 180, height: 70, label: 'Reception', showLabel: true, props: { seats: 0 } }), layer: 'furniture' },
      { ...el('sofa', 110, 250, { width: 160, height: 60, label: 'Wait', showLabel: true }), layer: 'furniture' },
      { ...el('plant', 300, 250, { width: 44, height: 44 }), layer: 'furniture' },
      { ...el('wc', 560, 360, { width: 90, height: 90, label: 'WC' }), layer: 'structure' },
      { ...el('stairs', 560, 90, { width: 150, height: 90, label: 'Stairs', showLabel: true }), layer: 'structure' },
      { ...el('entrance', 60, 250, { width: 70, height: 40, props: { kind: 'entrance' }, label: 'In', showLabel: true }), layer: 'structure' },
      // 3 kapı türü — duvara snap'li (right-click → "Free from wall" ile bırakılabilir)
      { ...door(350, -4, { type: 'door-double', width: 140, height: 70, label: 'Main', showLabel: true }), layer: 'structure' },
      { ...door(80, 290, { type: 'door', width: 70, height: 70, label: 'Office' }), layer: 'structure' },
      { ...door(540, 384, { type: 'door-slide', width: 110, height: 16, label: 'WC' }), layer: 'structure' },
    ]),
    buildingFloor('f1', 'Floor 1 · Workspace', 1, [
      shell('Floor 1 · Workspace'),
      ...deskCluster(90, 110),
      ...deskCluster(90, 330),
      { ...el('stairs', 560, 90, { width: 150, height: 90, label: 'Stairs', showLabel: true }), layer: 'structure' },
      { ...el('ac', 300, 50, { width: 90, height: 24, props: { on: true } }), layer: 'structure',
        actions: [{ on: 'click', do: 'toggle', prop: 'on' }] },
    ]),
    buildingFloor('f2', 'Floor 2 · Meeting', 2, [
      shell('Floor 2 · Meeting'),
      { ...el('room', 70, 90, { width: 420, height: 300, label: 'Boardroom' }), layer: 'structure' },
      { ...el('table-rect', 150, 170, { width: 240, height: 120, label: 'Board', showLabel: true, props: { seats: 10 } }), layer: 'furniture' },
      { ...el('sofa', 540, 110, { width: 180, height: 64, label: 'Lounge', showLabel: true }), layer: 'furniture' },
      { ...el('sofa', 540, 210, { width: 180, height: 64 }), layer: 'furniture' },
      { ...el('plant', 560, 320, { width: 46, height: 46 }), layer: 'furniture' },
      { ...el('stairs', 560, 400, { width: 150, height: 90, label: 'Stairs', showLabel: true }), layer: 'structure' },
    ]),
  ],
};

// ===========================================================================
// 6) Empty canvas — handy starting point for the editor
// ===========================================================================
const blank = {
  version: '1.0',
  meta: { name: 'Blank canvas', units: 'm', scale: 50 },
  size: { width: 800, height: 600 },
  background: { color: '#ffffff', grid: { enabled: true, size: 25, color: '#eeeeee' } },
  layers: [{ id: 'default', name: 'Default', visible: true, opacity: 1 }],
  elements: [],
};

export const SAMPLES = [
  { id: 'restaurant', name: '🍽️ Restaurant', description: 'Tables, booths, bar, doors, A/C, WC.', document: restaurant },
  { id: 'building', name: '🏬 Building (3 floors)', description: 'Multi-floor: reception, workspace, meeting.', document: building },
  { id: 'office', name: '🏢 Office', description: 'Desk clusters, meeting room, lounge.', document: office },
  { id: 'classroom', name: '🎓 Classroom', description: 'Student desks, whiteboard, teacher desk.', document: classroom },
  { id: 'cafe', name: '☕ Café', description: 'Custom image logo + linked actions.', document: cafe },
  { id: 'blank', name: '➕ Blank', description: 'Empty canvas for the editor.', document: blank },
];

export default SAMPLES;
