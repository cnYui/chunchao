import assert from 'node:assert/strict';
import test from 'node:test';

import { createFingerPadTrigger } from '../../synth/finger-pad-trigger.js';

const createQuad = (left, top, right, bottom) => ([
  { x: left, y: top },
  { x: right, y: top },
  { x: right, y: bottom },
  { x: left, y: bottom },
]);

test('手指在同一格稳定停留达到阈值后才触发一次点击', () => {
  const trigger = createFingerPadTrigger({ activateFrames: 3 });
  const padRois = [createQuad(0, 0, 100, 100)];

  assert.equal(trigger.update({ point: { x: 40, y: 40 }, padRois }), null);
  assert.equal(trigger.update({ point: { x: 41, y: 41 }, padRois }), null);
  assert.equal(trigger.update({ point: { x: 42, y: 42 }, padRois }), 0);
  assert.equal(trigger.update({ point: { x: 43, y: 43 }, padRois }), null);
});

test('手指离开后重新进入同一格可以再次触发', () => {
  const trigger = createFingerPadTrigger({ activateFrames: 2 });
  const padRois = [createQuad(0, 0, 100, 100)];

  trigger.update({ point: { x: 30, y: 30 }, padRois });
  assert.equal(trigger.update({ point: { x: 31, y: 31 }, padRois }), 0);

  assert.equal(trigger.update({ point: null, padRois }), null);
  trigger.update({ point: { x: 32, y: 32 }, padRois });
  assert.equal(trigger.update({ point: { x: 33, y: 33 }, padRois }), 0);
});

test('手指快速掠过不同格子不会立即触发，必须在目标格停留到阈值', () => {
  const trigger = createFingerPadTrigger({ activateFrames: 3 });
  const padRois = [
    createQuad(0, 0, 100, 100),
    createQuad(120, 0, 220, 100),
  ];

  assert.equal(trigger.update({ point: { x: 40, y: 40 }, padRois }), null);
  assert.equal(trigger.update({ point: { x: 150, y: 40 }, padRois }), null);
  assert.equal(trigger.update({ point: { x: 151, y: 41 }, padRois }), null);
  assert.equal(trigger.update({ point: { x: 152, y: 42 }, padRois }), 1);
});
