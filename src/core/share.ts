// Sharing helpers — encode a document (whole building or a single floor) into a
// URL-safe string, build shareable links and embeddable iframe snippets.
// No backend required: the data travels inside the URL hash.

import type { Building } from './types.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Object or JSON string → URL-safe base64 string. */
export function encodeShare(obj: unknown): string {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return bytesToBase64(enc.encode(json))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** URL-safe base64 string → object (throws on malformed input). */
export function decodeShare<T = unknown>(str: string): T {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(dec.decode(base64ToBytes(b64))) as T;
}

export interface ShareUrlOptions {
  baseUrl?: string;
  mode?: 'view' | 'edit';
}

/** Build a shareable link that loads `obj` from the URL hash. */
export function buildShareUrl(obj: unknown, opts: ShareUrlOptions = {}): string {
  const base = opts.baseUrl
    ?? (typeof location !== 'undefined' ? location.href.split('#')[0] : '');
  const mode = opts.mode || 'view';
  return `${base}#data=${encodeShare(obj)}&mode=${mode}`;
}

export interface ParsedShareHash {
  data?: Building;
  mode?: 'view' | 'edit';
  [key: string]: unknown;
}

/** Parse a location hash like "#data=...&mode=view" into { data?, mode? }. */
export function parseShareHash(
  hash: string = typeof location !== 'undefined' ? location.hash : '',
): ParsedShareHash {
  const out: ParsedShareHash = {};
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of h.split('&')) {
    const [k, v] = part.split('=');
    if (!k) continue;
    if (k === 'data' && v) {
      try { out.data = decodeShare<Building>(v); } catch { /* ignore malformed */ }
    } else if (v) {
      out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

export interface EmbedOptions {
  baseUrl?: string;
  width?: string | number;
  height?: string | number;
}

/** Build an embeddable iframe snippet for a read-only viewer. */
export function buildEmbedCode(obj: unknown, opts: EmbedOptions = {}): string {
  const url = buildShareUrl(obj, { baseUrl: opts.baseUrl, mode: 'view' });
  const width = opts.width ?? '100%';
  const height = opts.height ?? '480';
  return `<iframe src="${url}" width="${width}" height="${height}" style="border:1px solid #ddd;border-radius:8px" loading="lazy"></iframe>`;
}
