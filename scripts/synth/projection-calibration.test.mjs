import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectiveTransform,
  mapDomRectToQuad,
  mapPoint,
} from '../../synth/projection-calibration.js';

test('单位正方形映射到自身时保持坐标不变', () => {
  const transform = createProjectiveTransform({
    source: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    target: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });

  assert.deepEqual(mapPoint(transform, { x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});

test('DOM 矩形可以映射为摄像头四边形 ROI', () => {
  const transform = createProjectiveTransform({
    source: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    target: [
      { x: 20, y: 30 },
      { x: 180, y: 40 },
      { x: 170, y: 190 },
      { x: 10, y: 180 },
    ],
  });

  const quad = mapDomRectToQuad(transform, {
    left: 25,
    top: 25,
    right: 75,
    bottom: 75,
  });

  assert.equal(quad.length, 4);
  assert.ok(quad.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
