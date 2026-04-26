import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHandBounds,
  mapPointToKnobAngle,
  mapPointToSliderValue,
} from '../../synth/hand-math.js';

test('手部关键点可生成外接区域', () => {
  const bounds = createHandBounds([
    { x: 10, y: 20 },
    { x: 40, y: 50 },
  ], 8);

  assert.deepEqual(bounds, { left: 2, top: 12, right: 48, bottom: 58 });
});

test('手指在滑杆底部与顶部可映射到 0 到 1', () => {
  const rect = { top: 100, bottom: 300, left: 20, right: 60 };

  assert.equal(mapPointToSliderValue({ x: 30, y: 300 }, rect), 0);
  assert.equal(mapPointToSliderValue({ x: 30, y: 100 }, rect), 1);
});

test('手指位置可换算为旋钮角度', () => {
  const rect = { left: 0, top: 0, right: 100, bottom: 100 };
  const angle = mapPointToKnobAngle({ x: 100, y: 50 }, rect);

  assert.equal(angle, 0);
});
