import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readAppSource = () => readFile(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器页会把右手食指检测接到单指交互链路', async () => {
  const source = await readAppSource();
  const detectIndex = source.indexOf('const handState = handController.detect');
  const interactionIndex = source.indexOf('applyFingerInteraction(handPoint)');

  assert.notEqual(detectIndex, -1);
  assert.notEqual(interactionIndex, -1);
  assert.ok(
    detectIndex < interactionIndex,
    '必须先完成右手食指检测，再把控制点送入单指点击/拖拽链路',
  );
});
