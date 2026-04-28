import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calibrationMarkerLayout,
  getCalibrationMarkerState,
} from '../../synth/calibration-markers.js';

test('标定点 1 2 3 4 固定对应预览四角顺序', () => {
  assert.deepEqual(
    calibrationMarkerLayout.map(({ index, anchorX, anchorY }) => ({ index, anchorX, anchorY })),
    [
      { index: 0, anchorX: 'left', anchorY: 'top' },
      { index: 1, anchorX: 'right', anchorY: 'top' },
      { index: 2, anchorX: 'right', anchorY: 'bottom' },
      { index: 3, anchorX: 'left', anchorY: 'bottom' },
    ],
  );
});

test('标定点状态会区分已完成 当前点 和 未完成', () => {
  assert.equal(getCalibrationMarkerState(0, 0), 'current');
  assert.equal(getCalibrationMarkerState(0, 1), 'done');
  assert.equal(getCalibrationMarkerState(1, 1), 'current');
  assert.equal(getCalibrationMarkerState(3, 1), 'pending');
  assert.equal(getCalibrationMarkerState(3, 4), 'done');
});
