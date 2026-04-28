import assert from 'node:assert/strict';
import test from 'node:test';

import { computeOccupancyScore, createOccupancyDetector } from '../../synth/occupancy-detector.js';

test('ROI 差分分数会把边缘密度变化放大到可参与判定', () => {
  const score = computeOccupancyScore(
    { brightness: 100, variance: 4, edgeDensity: 0.05 },
    { brightness: 102, variance: 4.5, edgeDensity: 0.25 },
  );

  assert.ok(score >= 20);
});

test('baseline 未准备好时不会抛错或误判 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 1,
    exitFrames: 1,
    enterThreshold: 10,
    exitThreshold: 4,
  });

  const states = detector.update([
    { brightness: 255, variance: 100, edgeDensity: 1, overlapWithHand: 0 },
  ]);

  assert.equal(states[0].status, 'empty');
  assert.equal(states[0].transition, null);
  assert.equal(states[0].reason, 'baseline-missing');
});

test('ROI 有效像素过少时不会进入 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 1,
    exitFrames: 1,
    enterThreshold: 10,
    exitThreshold: 4,
    minPixelCount: 5,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 0.1, pixelCount: 12 }]);

  const states = detector.update([
    { brightness: 80, variance: 20, edgeDensity: 0.9, overlapWithHand: 0, pixelCount: 2 },
  ]);

  assert.equal(states[0].status, 'empty');
  assert.equal(states[0].reason, 'sample-too-small');
});

test('稳定遮挡超过 enterFrames 后进入 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 3,
    exitFrames: 2,
    enterThreshold: 10,
    exitThreshold: 4,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 1 }]);

  detector.update([
    { brightness: 30, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);
  detector.update([
    { brightness: 31, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);
  const states = detector.update([
    { brightness: 32, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);

  assert.equal(states[0].status, 'occupied');
  assert.equal(states[0].transition, 'entered');
});

test('主要由手部造成的变化不进入 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 2,
    exitFrames: 2,
    enterThreshold: 10,
    exitThreshold: 4,
    maxHandOverlap: 0.35,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 1 }]);
  const states = detector.update([
    { brightness: 40, variance: 10, edgeDensity: 5, overlapWithHand: 0.8 },
  ]);

  assert.equal(states[0].status, 'empty');
  assert.equal(states[0].transition, null);
  assert.equal(states[0].reason, 'hand-overlap');
});

test('已占用格子被手遮挡时不会退出 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 1,
    exitFrames: 1,
    enterThreshold: 10,
    exitThreshold: 4,
    maxHandOverlap: 0.35,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 0.1 }]);
  detector.update([
    { brightness: 40, variance: 10, edgeDensity: 0.5, overlapWithHand: 0 },
  ]);

  const states = detector.update([
    { brightness: 11, variance: 2, edgeDensity: 0.1, overlapWithHand: 0.8 },
  ]);

  assert.equal(states[0].status, 'occupied');
  assert.equal(states[0].transition, null);
  assert.equal(states[0].reason, 'hand-overlap');
});
