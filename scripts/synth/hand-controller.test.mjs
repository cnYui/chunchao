import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandController } from '../../synth/hand-controller.js';

test('hand controller 会把右手食指转换成简化控制点', async () => {
  let receivedOptions = null;
  const controller = createHandController({
    createLandmarker: async (options) => {
      receivedOptions = options;
      return {
        detectForVideo() {
          return {
            landmarks: [[
              { x: 0.2, y: 0.3 },
              { x: 0.21, y: 0.31 },
              { x: 0.22, y: 0.32 },
              { x: 0.23, y: 0.33 },
              { x: 0.24, y: 0.34 },
              { x: 0.25, y: 0.35 },
              { x: 0.26, y: 0.36 },
              { x: 0.27, y: 0.37 },
              { x: 0.6, y: 0.7 },
            ]],
            handednesses: [[{ categoryName: 'Right', score: 0.91 }]],
          };
        },
      };
    },
  });

  await controller.start({
    video: { currentTime: 1 },
    now: 1000,
  });

  const state = controller.detect({
    video: { currentTime: 2 },
    now: 1033,
  });

  assert.equal(state.active, true);
  assert.equal(state.handedness, 'Right');
  assert.deepEqual(state.controlPoint, { x: 0.6, y: 0.7 });
  assert.equal(state.points.length, 9);
  assert.deepEqual(receivedOptions, { numHands: 1 });
});

test('hand controller 只会保留右手并选择置信度最高的右手', async () => {
  const controller = createHandController({
    minConfidence: 0.5,
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [
            [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.2 },
              { x: 0.21, y: 0.21 },
              { x: 0.22, y: 0.22 },
              { x: 0.23, y: 0.23 },
              { x: 0.24, y: 0.24 },
              { x: 0.25, y: 0.25 },
              { x: 0.26, y: 0.26 },
              { x: 0.27, y: 0.27 },
            ],
            [
              { x: 0.4, y: 0.5 },
              { x: 0.6, y: 0.7 },
              { x: 0.8, y: 0.9 },
              { x: 0.1, y: 0.2 },
              { x: 0.2, y: 0.3 },
              { x: 0.3, y: 0.4 },
              { x: 0.4, y: 0.5 },
              { x: 0.5, y: 0.6 },
              { x: 0.75, y: 0.25 },
            ],
          ],
          handednesses: [
            [{ categoryName: 'Left', score: 0.99 }],
            [{ categoryName: 'Right', score: 0.91 }],
          ],
        };
      },
    }),
  });

  await controller.start();

  const state = controller.detect({
    video: { videoWidth: 1000, videoHeight: 500 },
    now: 1000,
  });

  assert.equal(state.active, true);
  assert.equal(state.handedness, 'Right');
  assert.equal(state.confidence, 0.91);
  assert.equal(state.hands.length, 1);
  assert.deepEqual(state.controlPoint, { x: 750, y: 125 });
});

test('hand controller 在没有可信右手时返回 inactive', async () => {
  const controller = createHandController({
    minConfidence: 0.8,
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [[
            { x: 0.2, y: 0.3 },
            { x: 0.21, y: 0.31 },
            { x: 0.22, y: 0.32 },
            { x: 0.23, y: 0.33 },
            { x: 0.24, y: 0.34 },
            { x: 0.25, y: 0.35 },
            { x: 0.26, y: 0.36 },
            { x: 0.27, y: 0.37 },
            { x: 0.28, y: 0.38 },
          ]],
          handednesses: [[{ categoryName: 'Left', score: 0.96 }]],
        };
      },
    }),
  });

  await controller.start();

  const state = controller.detect({
    video: { videoWidth: 1000, videoHeight: 500 },
    now: 1000,
  });

  assert.equal(state.active, false);
  assert.equal(state.handedness, 'Unknown');
  assert.deepEqual(state.points, []);
  assert.deepEqual(state.controlPoint, null);
});

test('hand controller 会对第三幕检测做帧节流，避免每个 raf 都跑一次推理', async () => {
  let detectCount = 0;
  const controller = createHandController({
    predictionIntervalMs: 50,
    createLandmarker: async () => ({
      detectForVideo() {
        detectCount += 1;
        return {
          landmarks: [[
            { x: 0.2, y: 0.3 },
            { x: 0.21, y: 0.31 },
            { x: 0.22, y: 0.32 },
            { x: 0.23, y: 0.33 },
            { x: 0.24, y: 0.34 },
            { x: 0.25, y: 0.35 },
            { x: 0.26, y: 0.36 },
            { x: 0.27, y: 0.37 },
            { x: 0.6, y: 0.7 },
          ]],
          handednesses: [[{ categoryName: 'Right', score: 0.91 }]],
        };
      },
    }),
  });

  await controller.start();

  const video = { videoWidth: 1000, videoHeight: 500, currentTime: 1 };
  const firstState = controller.detect({ video, now: 1000 });
  const sameFrameState = controller.detect({ video, now: 1016 });
  const earlyNextFrameState = controller.detect({
    video: { ...video, currentTime: 2 },
    now: 1030,
  });
  const throttledReleasedState = controller.detect({
    video: { ...video, currentTime: 3 },
    now: 1065,
  });

  assert.equal(detectCount, 2);
  assert.deepEqual(sameFrameState, firstState);
  assert.deepEqual(earlyNextFrameState, firstState);
  assert.equal(throttledReleasedState.active, true);
});
