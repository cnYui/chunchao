import assert from 'node:assert/strict';
import test from 'node:test';

import { createOccupancyDetector } from '../../synth/occupancy-detector.js';

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
});
