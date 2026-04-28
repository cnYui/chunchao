import assert from 'node:assert/strict';
import test from 'node:test';

import { previewModes } from '../../synth/preview-mode.js';
import { shouldAutoCaptureBaselineOnModeChange } from '../../synth/roi-runtime-flow.js';

test('进入运行模式且 baseline 未准备好时会自动采集空场', () => {
  assert.equal(
    shouldAutoCaptureBaselineOnModeChange({
      nextPreviewMode: previewModes.run,
      baselineReady: false,
      geometryReady: true,
    }),
    true,
  );
});

test('对位模式或几何未就绪时不会自动采集空场', () => {
  assert.equal(
    shouldAutoCaptureBaselineOnModeChange({
      nextPreviewMode: previewModes.align,
      baselineReady: false,
      geometryReady: true,
    }),
    false,
  );
  assert.equal(
    shouldAutoCaptureBaselineOnModeChange({
      nextPreviewMode: previewModes.run,
      baselineReady: false,
      geometryReady: false,
    }),
    false,
  );
  assert.equal(
    shouldAutoCaptureBaselineOnModeChange({
      nextPreviewMode: previewModes.run,
      baselineReady: true,
      geometryReady: true,
    }),
    false,
  );
});

