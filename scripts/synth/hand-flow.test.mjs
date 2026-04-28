import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readAppSource = () => readFile(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器页手势识别不依赖 ROI baseline', async () => {
  const source = await readAppSource();
  const detectIndex = source.indexOf('const handState = handController.detect');
  const baselineIndex = source.indexOf('if (!state.layoutMode && state.baselineReady && activeGeometry.padRois.length === padCount)');

  assert.notEqual(detectIndex, -1);
  assert.notEqual(baselineIndex, -1);
  assert.ok(
    detectIndex < baselineIndex,
    '手势识别必须在 baselineReady 判断之前执行，避免未采集 ROI 空场时手势完全不可用',
  );
});
