// Low-level canvas drawing primitives shared by element renderers.
// All helpers draw in the element's LOCAL frame: (0,0) is the box top-left and
// (w,h) is the bottom-right. The renderer sets up translate+rotate beforehand.

export interface FillStrokeStyle {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillStroke(ctx: CanvasRenderingContext2D, opts: FillStrokeStyle = {}): void {
  const { fill, stroke, lineWidth = 1.5 } = opts;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export interface LabelOptions {
  color?: string;
  size?: number;
  weight?: number | string;
  y?: number;
  maxWidth?: number;
}

/** Draw centered, auto-shrinking label text inside a box of width w. */
export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number,
  h: number,
  opts: LabelOptions = {},
): void {
  if (!text) return;
  const {
    color = '#3a3a36',
    size = 13,
    weight = 600,
    y = h / 2,
    maxWidth = w - 8,
  } = opts;
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = size;
  ctx.font = `${weight} ${fontSize}px system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && fontSize > 7) {
    fontSize -= 1;
    ctx.font = `${weight} ${fontSize}px system-ui, sans-serif`;
  }
  ctx.fillText(text, w / 2, y);
  ctx.restore();
}

/** Filled circle in local coords. */
export function circle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, radius: number,
  style?: FillStrokeStyle,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  fillStroke(ctx, style);
}

/** A small status dot in the top-right corner of the box. */
export function statusDot(ctx: CanvasRenderingContext2D, w: number, color?: string): void {
  if (!color) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(w - 7, 7, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
