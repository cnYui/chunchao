import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const htmlSource = fs.readFileSync(new URL('../../synthesizer.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器页面包含独立的手部关节预览小窗', () => {
  assert.match(htmlSource, /synth-hand-preview-panel/);
  assert.match(htmlSource, /synth-hand-preview-video/);
  assert.match(htmlSource, /synth-hand-preview-overlay/);
});

test('最终合成器脚本接入手部关节预览绘制', () => {
  assert.match(appSource, /renderHandPreview/);
  assert.match(appSource, /synth-hand-preview-overlay/);
  assert.match(appSource, /handPreviewVideo/);
});

