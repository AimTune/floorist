import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeShare, decodeShare,
  buildShareUrl, buildEmbedCode, parseShareHash,
} from '../dist/core/share.js';

const sample = {
  version: '2.0',
  meta: { name: 'Test', units: 'm', scale: 50 },
  activeFloor: 'g',
  floors: [{
    id: 'g', name: 'Ground', level: 0,
    size: { width: 800, height: 600 },
    background: {}, layers: [{ id: 'd', name: 'D' }],
    elements: [{ id: 'r', type: 'rect', x: 0, y: 0, width: 10, height: 10 }],
  }],
};

describe('encodeShare / decodeShare', () => {
  test('round-trips an object', () => {
    const out = decodeShare(encodeShare(sample));
    assert.deepEqual(out, sample);
  });
  test('accepts a JSON string directly', () => {
    const out = decodeShare(encodeShare(JSON.stringify(sample)));
    assert.deepEqual(out, sample);
  });
  test('produced string is URL-safe (no +, /, =)', () => {
    const s = encodeShare(sample);
    assert.ok(!/[+/=]/.test(s), `expected URL-safe, got "${s}"`);
  });
  test('handles unicode (Turkish + emoji)', () => {
    const data = { v: 'Şişli — café 🍽️' };
    assert.deepEqual(decodeShare(encodeShare(data)), data);
  });
  test('handles a large building (chunked base64 conversion)', () => {
    const big = {
      ...sample,
      floors: [{
        ...sample.floors[0],
        elements: Array.from({ length: 5000 }, (_, i) => ({
          id: 'e' + i, type: 'rect', x: i, y: i, width: 5, height: 5,
        })),
      }],
    };
    const out = decodeShare(encodeShare(big));
    assert.equal(out.floors[0].elements.length, 5000);
  });
});

describe('buildShareUrl', () => {
  test('appends #data= and mode=', () => {
    const url = buildShareUrl(sample, { baseUrl: 'http://x/y.html' });
    assert.ok(url.startsWith('http://x/y.html#data='));
    assert.ok(/&mode=view$/.test(url));
  });
  test('honors a custom mode', () => {
    const url = buildShareUrl(sample, { baseUrl: 'http://x/y.html', mode: 'edit' });
    assert.ok(/&mode=edit$/.test(url));
  });
});

describe('parseShareHash', () => {
  test('extracts data + mode from a built URL', () => {
    const url = buildShareUrl(sample, { baseUrl: 'http://x/y.html', mode: 'view' });
    const hash = url.split('#')[1];
    const parsed = parseShareHash('#' + hash);
    assert.deepEqual(parsed.data, sample);
    assert.equal(parsed.mode, 'view');
  });
  test('handles malformed data gracefully', () => {
    const parsed = parseShareHash('#data=NOTREALLY&mode=view');
    assert.equal(parsed.data, undefined);
    assert.equal(parsed.mode, 'view');
  });
  test('empty hash → empty result', () => {
    assert.deepEqual(parseShareHash(''), {});
    assert.deepEqual(parseShareHash('#'), {});
  });
});

describe('buildEmbedCode', () => {
  test('returns an iframe snippet with our share URL', () => {
    const code = buildEmbedCode(sample, { baseUrl: 'http://x/y.html' });
    assert.ok(code.includes('<iframe'));
    assert.ok(code.includes('src="http://x/y.html#data='));
    assert.ok(code.includes('mode=view'));
  });
  test('honors width/height options', () => {
    const code = buildEmbedCode(sample, { baseUrl: 'http://x/y.html', width: 600, height: 400 });
    assert.ok(code.includes('width="600"'));
    assert.ok(code.includes('height="400"'));
  });
});
