import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeLayout,
  mapManualRectToVideoRect,
  resolveActiveGeometrySource,
} from '../../synth/manual-layout-runtime.js';

const createRect = (id, label, x = 10, y = 12, width = 50, height = 40) => ({
  id,
  label,
  x,
  y,
  width,
  height,
});

const sampleManualLayout = {
  version: 1,
  previewSize: { width: 100, height: 100 },
  pads: Array.from({ length: 16 }, (_, index) => createRect(`pad-${index + 1}`, `Pad ${index + 1}`, index, index + 1, 10, 8)),
  controls: {
    vibe: createRect('vibe', 'VIBE', 4, 6, 12, 16),
    volume: createRect('volume', 'VOL', 20, 30, 8, 30),
    reverb: createRect('reverb', 'REV', 32, 30, 8, 30),
    position: createRect('position', 'POS', 44, 30, 8, 30),
  },
  consoleFrame: createRect('console-frame', '控制台', 2, 3, 70, 60),
};

test('预览矩形可按比例换算到视频矩形', () => {
  const result = mapManualRectToVideoRect(
    { x: 10, y: 20, width: 50, height: 40 },
    { width: 100, height: 100 },
    { width: 1000, height: 500 },
  );

  assert.deepEqual(result, {
    left: 100,
    top: 100,
    right: 600,
    bottom: 300,
  });
});

test('运行态布局会生成 16 个 pad、4 个控件和控制台外框', () => {
  const runtime = buildRuntimeLayout(sampleManualLayout, { width: 960, height: 540 });

  assert.equal(runtime.padRois.length, 16);
  assert.deepEqual(runtime.padRois[0], [
    { x: 0, y: 5.4 },
    { x: 96, y: 5.4 },
    { x: 96, y: 48.6 },
    { x: 0, y: 48.6 },
  ]);
  assert.deepEqual(runtime.controlRects.vibe, {
    left: 38.4,
    top: 32.4,
    right: 153.6,
    bottom: 118.8,
  });
  assert.ok(runtime.consoleFrameRect);
});

test('存在手工布局时优先返回 manual', () => {
  assert.equal(resolveActiveGeometrySource({ manualLayout: {}, calibrationReady: true }), 'manual');
});

test('没有手工布局时回退 calibration 或 none', () => {
  assert.equal(resolveActiveGeometrySource({ manualLayout: null, calibrationReady: true }), 'calibration');
  assert.equal(resolveActiveGeometrySource({ manualLayout: null, calibrationReady: false }), 'none');
});

