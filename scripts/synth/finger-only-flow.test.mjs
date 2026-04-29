import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readAppSource = () => readFile(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器页不再接入 ROI 占格检测与 baseline 采集链路', async () => {
  const source = await readAppSource();

  assert.doesNotMatch(source, /createOccupancyDetector/);
  assert.doesNotMatch(source, /captureBaseline/);
  assert.match(source, /createFingerPadTrigger/);
});
