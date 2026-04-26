import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

import { gridPatternKeys } from '../synth/strudel-score.js';

const html = readFileSync(new URL('../synthesizer.html', import.meta.url), 'utf8');
const appJsPath = new URL('../synth/app.js', import.meta.url);
const appJs = existsSync(appJsPath) ? readFileSync(appJsPath, 'utf8') : '';
const padButtonMatches = [...html.matchAll(/<button\b[^>]*\bpad-btn\b[^>]*>[\s\S]*?<\/button>/g)];

test('最终合成器页面显示 16 个触发按钮', () => {
  const padCount = padButtonMatches.length;

  assert.equal(padCount, 16);
  assert.match(html, /\bgrid-cols-4\b/);
  assert.match(html, /\bgrid-rows-4\b/);
});

test('16 个触发按钮按顺序印入 1 到 16 号半透明图案', () => {
  assert.equal(padButtonMatches.length, 16);

  padButtonMatches.forEach((match, index) => {
    const expectedNumber = index + 1;

    assert.match(match[0], new RegExp(`src="pic/${expectedNumber}\\.png"`));
    assert.match(match[0], /\bpad-symbol\b/);
    assert.match(match[0], /opacity-\[0\.34\]/);
  });
});

test('最终合成器页面使用暗红舞台风格标记', () => {
  assert.match(html, /\bclub-stage\b/);
  assert.match(html, /\bstage-console\b/);
  assert.match(html, /\bstage-panel\b/);
});

test('每个触发按钮都有对应 Strudel 格子映射', () => {
  assert.match(appJs, /createBrowserStrudelRuntime/);
  assert.match(appJs, /getGridCellPatternKey/);
  assert.equal(gridPatternKeys.length, 16);
  assert.equal(gridPatternKeys[11], null);
});

test('最终展示页包含模块入口和调试层容器', () => {
  assert.match(html, /<script type="module" src="\.\/synth\/app\.js\?v=20260426-projection-runtime"><\/script>/);
  assert.match(html, /id="synth-camera-preview"/);
  assert.match(html, /id="synth-debug-canvas"/);
  assert.match(html, /id="synth-calibration-layer"/);
});
