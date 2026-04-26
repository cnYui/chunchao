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
