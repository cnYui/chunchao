import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../../synth/app.js', import.meta.url), 'utf8');

test('最终合成器接入自动触发图几何来源', () => {
  assert.match(appSource, /buildViewportGuideGeometry/);
  assert.match(appSource, /自动触发图/);
  assert.match(appSource, /source: 'viewport'/);
  assert.match(appSource, /进入运行/);
  assert.match(appSource, /回到对位/);
  assert.match(appSource, /previewModes/);
});
