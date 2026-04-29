import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readAppSource = () => readFile(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('重新采集空场前会先关闭旧声音并暂停 ROI 运行态', async () => {
  const source = await readAppSource();
  const captureBaselineBlock = source.match(/const captureBaseline = async \(\) => \{([\s\S]*?)\n\};/);

  assert.ok(captureBaselineBlock, '必须存在 captureBaseline');
  assert.match(captureBaselineBlock[1], /state\.baselineReady = false/);
  assert.match(captureBaselineBlock[1], /clearOccupancyRuntime\(\)/);
});
