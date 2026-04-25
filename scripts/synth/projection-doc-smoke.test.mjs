import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const designDoc = readFileSync(
  new URL('../../docs/ai/context/projection-table-laptop-camera-synth-design.md', import.meta.url),
  'utf8',
);
const verificationDocPath = new URL(
  '../../docs/ai/context/projection-table-laptop-camera-synth-verification.md',
  import.meta.url,
);
const verificationDoc = existsSync(verificationDocPath)
  ? readFileSync(verificationDocPath, 'utf8')
  : '';

test('设计文档记录了手动四点标定与 occupied 边沿语义', () => {
  assert.match(designDoc, /手动四点标定/);
  assert.match(designDoc, /empty -> occupied/);
  assert.match(designDoc, /occupied -> empty/);
});

test('验证文档包含标定、占格与手部检查项', () => {
  assert.match(verificationDoc, /## 标定/);
  assert.match(verificationDoc, /## 占格/);
  assert.match(verificationDoc, /## 手部/);
});
