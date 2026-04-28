import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getInteractionStep,
  getTimelineSegment,
  interactionTimeline,
  isLastTimelineSegment,
  videoSegments,
} from '../timeline-config.js';

test('视频时间轴只保留当前实际使用的三段视频', () => {
  assert.deepEqual(videoSegments.map((segment) => segment.sourceFile), [
    './video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4',
    './video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4',
    './video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4',
  ]);
});

test('三段视频按 score、music、final 的时间线流转', () => {
  assert.equal(getTimelineSegment(0).interactionIndex, 0);
  assert.equal(getTimelineSegment(1).interactionIndex, 1);
  assert.equal(getTimelineSegment(2).interactionIndex, null);
  assert.equal(isLastTimelineSegment(0), false);
  assert.equal(isLastTimelineSegment(1), false);
  assert.equal(isLastTimelineSegment(2), true);
});

test('交互插入点按琴谱页再乐器页排列', () => {
  assert.deepEqual(interactionTimeline.map((step) => step.sceneIndex), [1, 0]);
  assert.deepEqual(getInteractionStep(0), { sceneIndex: 1, id: 'bg2-score' });
  assert.deepEqual(getInteractionStep(1), { sceneIndex: 0, id: 'bg1-music' });
  assert.equal(getInteractionStep(2), null);
});

test('首页不再直接硬编码视频文件路径', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /src="\.\/video\/[^"]+\.mp4/);
});
