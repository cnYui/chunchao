import assert from 'node:assert/strict';
import test from 'node:test';

import {
  previewModes,
  resolvePreviewPresentation,
  togglePreviewMode,
} from '../../synth/preview-mode.js';

test('对位模式会显示摄像头回显和触发图，但不允许手指直接触发声音', () => {
  assert.deepEqual(resolvePreviewPresentation(previewModes.align), {
    showCameraFeed: true,
    showGuideOverlay: true,
    showDebugOverlay: true,
    allowFingerInput: false,
  });
});

test('运行模式会隐藏回显和触发图，并允许右手食指交互', () => {
  assert.deepEqual(resolvePreviewPresentation(previewModes.run), {
    showCameraFeed: false,
    showGuideOverlay: false,
    showDebugOverlay: false,
    allowFingerInput: true,
  });
});

test('模式切换在对位和运行之间双向切换', () => {
  assert.equal(togglePreviewMode(previewModes.align), previewModes.run);
  assert.equal(togglePreviewMode(previewModes.run), previewModes.align);
});
