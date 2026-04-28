import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildViewportGuideGeometry,
  mapViewportRectToVideoBounds,
} from '../../synth/viewport-guide.js';

test('页面矩形可按视口比例映射到视频像素矩形', () => {
  const bounds = mapViewportRectToVideoBounds(
    { left: 100, top: 50, right: 300, bottom: 250 },
    { width: 1000, height: 500 },
    { width: 2000, height: 1000 },
  );

  assert.deepEqual(bounds, {
    left: 200,
    top: 100,
    right: 600,
    bottom: 500,
  });
});

test('自动触发图会生成 pad、控件和控制台外框几何', () => {
  const geometry = buildViewportGuideGeometry({
    viewportSize: { width: 1000, height: 500 },
    videoSize: { width: 2000, height: 1000 },
    stageRect: { left: 100, top: 40, right: 900, bottom: 460 },
    padRects: [
      { left: 300, top: 120, right: 360, bottom: 180 },
      { left: 380, top: 120, right: 440, bottom: 180 },
    ],
    knobRect: { left: 180, top: 160, right: 260, bottom: 240 },
    sliderRects: {
      volume: { left: 150, top: 260, right: 190, bottom: 420 },
      reverb: { left: 210, top: 260, right: 250, bottom: 420 },
      position: { left: 270, top: 260, right: 310, bottom: 420 },
    },
  });

  assert.equal(geometry.padRois.length, 2);
  assert.deepEqual(geometry.padRois[0], [
    { x: 600, y: 240 },
    { x: 720, y: 240 },
    { x: 720, y: 360 },
    { x: 600, y: 360 },
  ]);
  assert.deepEqual(geometry.controlRects.vibe, {
    left: 360,
    top: 320,
    right: 520,
    bottom: 480,
  });
  assert.deepEqual(geometry.stageFrameRect, {
    left: 200,
    top: 80,
    right: 1800,
    bottom: 920,
  });
});

