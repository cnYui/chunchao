import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOccupiedGridCode,
  createStrudelRuntimeState,
  getGridCellPatternKey,
  getVibeKeyFromIndex,
} from '../synth/strudel-score.js';
import { createStrudelRuntimeController } from '../synth/strudel-runtime.js';

test('旋钮四档按页面方向映射到 warm bright cold dark', () => {
  assert.equal(getVibeKeyFromIndex(0), 'warm');
  assert.equal(getVibeKeyFromIndex(1), 'bright');
  assert.equal(getVibeKeyFromIndex(2), 'cold');
  assert.equal(getVibeKeyFromIndex(3), 'dark');
});

test('16 格按 4x4 坐标映射 pattern，(3,4) 留空', () => {
  assert.equal(getGridCellPatternKey(0), 'walking');
  assert.equal(getGridCellPatternKey(1), 'riff');
  assert.equal(getGridCellPatternKey(4), 'fourfour');
  assert.equal(getGridCellPatternKey(8), 'hiphop');
  assert.equal(getGridCellPatternKey(11), null);
  assert.equal(getGridCellPatternKey(15), 'recitative');
});

test('最终组合代码包含当前 vibe 与 occupied 格子 pattern', () => {
  const code = createOccupiedGridCode({
    vibeKey: 'warm',
    occupied: [
      true, false, true, false,
      false, false, false, false,
      false, false, false, false,
      false, false, false, true,
    ],
    volume: 0.7,
    reverb: 0.4,
    position: 0.5,
  });

  assert.match(code, /setcpm\(128\/4\)/);
  assert.match(code, /vibe\.warm/);
  assert.match(code, /bass\.walking/);
  assert.match(code, /bass\.sidechain/);
  assert.match(code, /melody\.recitative/);
  assert.match(code, /\.gain\(0\.7\)/);
  assert.match(code, /\.room\(0\.4\)/);
  assert.match(code, /\.pan\(0\)/);
  assert.doesNotMatch(code, /style\.[a-z]+/);
});

test('状态变化时生成新的 Strudel 组合代码，无占格时返回 hush', () => {
  const runtime = createStrudelRuntimeState();

  assert.equal(runtime.getCommand(), 'hush()');

  runtime.setVibeByIndex(3);
  runtime.setOccupied(0, true);

  const activeCommand = runtime.getCommand();
  assert.match(activeCommand, /vibe\.dark/);
  assert.match(activeCommand, /bass\.walking/);

  runtime.setControlValue('volume', 0.25);
  runtime.setControlValue('reverb', 0.8);
  runtime.setControlValue('position', 1);

  const controlledCommand = runtime.getCommand();
  assert.match(controlledCommand, /\.gain\(0\.25\)/);
  assert.match(controlledCommand, /\.room\(0\.8\)/);
  assert.match(controlledCommand, /\.pan\(1\)/);

  runtime.setOccupied(0, false);
  assert.equal(runtime.getCommand(), 'hush()');
});

test('运行时控制器在占格变化时调用 evaluate 和 hush', async () => {
  const calls = [];
  const runtime = createStrudelRuntimeController({
    evaluate: async (code) => {
      calls.push(['evaluate', code]);
    },
    hush: async () => {
      calls.push(['hush']);
    },
  });

  await runtime.setOccupied(0, true);
  await runtime.setVibeByIndex(2);
  await runtime.setOccupied(0, false);

  assert.equal(calls[0][0], 'evaluate');
  assert.match(calls[0][1], /vibe\.warm/);
  assert.equal(calls[1][0], 'evaluate');
  assert.match(calls[1][1], /vibe\.cold/);
  assert.deepEqual(calls[2], ['hush']);
});
