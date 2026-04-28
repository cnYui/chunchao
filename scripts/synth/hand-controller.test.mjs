import assert from 'node:assert/strict';
import test from 'node:test';

import { createHandController } from '../../synth/hand-controller.js';

test('hand controller 会把 detectForVideo 结果转换成简化手部状态', async () => {
  const controller = createHandController({
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [[
            { x: 0.2, y: 0.3 },
            { x: 0.3, y: 0.4 },
          ]],
          handednesses: [[{ categoryName: 'Right' }]],
        };
      },
    }),
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
  assert.equal(state.points.length, 2);
});

test('hand controller 会选择置信度最高且超过阈值的主手', async () => {
  const controller = createHandController({
    minConfidence: 0.5,
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [
            [
              { x: 0.1, y: 0.1 },
              { x: 0.2, y: 0.2 },
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
            [{ categoryName: 'Left', score: 0.42 }],
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

test('hand controller 在没有可信手部时返回 inactive', async () => {
  const controller = createHandController({
    minConfidence: 0.8,
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [[{ x: 0.2, y: 0.3 }]],
          handednesses: [[{ categoryName: 'Right', score: 0.4 }]],
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
