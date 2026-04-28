import assert from 'node:assert/strict';
import test from 'node:test';

import {
  previewModes,
  resolvePreviewPresentation,
  togglePreviewMode,
} from '../../synth/preview-mode.js';

test('对位模式会显示摄像头回显和触发图，但不允许直接采空场', () => {
  assert.deepEqual(resolvePreviewPresentation(previewModes.align), {
    showCameraFeed: true,
    showGuideOverlay: true,
    showDebugOverlay: true,
    allowBaselineCapture: false,
  });
});

test('运行模式会隐藏回显和触发图，只保留后台识别', () => {
  assert.deepEqual(resolvePreviewPresentation(previewModes.run), {
    showCameraFeed: false,
    showGuideOverlay: false,
    showDebugOverlay: false,
    allowBaselineCapture: true,
  });
});

test('模式切换在对位和运行之间双向切换', () => {
  assert.equal(togglePreviewMode(previewModes.align), previewModes.run);
  assert.equal(togglePreviewMode(previewModes.run), previewModes.align);
});

