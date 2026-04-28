import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器接入布局模式控制按钮', () => {
  assert.match(appSource, /布局模式/);
  assert.match(appSource, /保存布局/);
  assert.match(appSource, /退出布局/);
  assert.match(appSource, /撤销/);
  assert.match(appSource, /重画当前/);
});

test('最终合成器接入手工布局运行态模块', () => {
  assert.match(appSource, /buildEmptyManualLayoutDraft/);
  assert.match(appSource, /buildRuntimeLayout/);
  assert.match(appSource, /loadManualLayout/);
  assert.match(appSource, /saveManualLayout/);
});

