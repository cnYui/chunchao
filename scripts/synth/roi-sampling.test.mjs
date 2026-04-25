import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMaskedFeatureFromImageData } from '../../synth/roi-sampling.js';

test('四边形 ROI 采样不统计包围盒角落像素', () => {
  const width = 5;
  const height = 5;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 255;
  }

  const setPixel = (x, y, value) => {
    const index = (y * width + x) * 4;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  };

  setPixel(0, 0, 255);
  setPixel(4, 0, 255);
  setPixel(2, 2, 100);

  const feature = computeMaskedFeatureFromImageData({
    data,
    width,
    height,
    offsetX: 0,
    offsetY: 0,
    quad: [
      { x: 2, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 3 },
      { x: 1, y: 2 },
    ],
    handBounds: null,
  });

  assert.equal(feature.pixelCount, 5);
  assert.ok(feature.brightness > 19);
  assert.ok(feature.brightness < 21);
});
