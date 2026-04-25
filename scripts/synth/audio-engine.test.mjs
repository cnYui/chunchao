import assert from 'node:assert/strict';
import test from 'node:test';

import { createAudioEngine } from '../../synth/audio-engine.js';

test('startPadVoice 只为同一个 pad 启动一条持续声音', async () => {
  const calls = [];
  const engine = createAudioEngine({
    frequencies: [220, 330],
    createVoiceBackend: ({ frequency }) => {
      return {
        start() {
          calls.push(`start:${frequency}`);
        },
        stop() {
          calls.push(`stop:${frequency}`);
        },
      };
    },
  });

  engine.startPadVoice(0);
  engine.startPadVoice(0);

  assert.deepEqual(calls, ['start:220']);
  assert.deepEqual(engine.getActiveVoiceIds(), [0]);
});

test('stopPadVoice 会停止指定 pad 的持续声音', async () => {
  const calls = [];
  const engine = createAudioEngine({
    frequencies: [220, 330],
    createVoiceBackend: ({ frequency }) => {
      return {
        start() {
          calls.push(`start:${frequency}`);
        },
        stop() {
          calls.push(`stop:${frequency}`);
        },
      };
    },
  });

  engine.startPadVoice(1);
  engine.stopPadVoice(1);

  assert.deepEqual(calls, ['start:330', 'stop:330']);
  assert.deepEqual(engine.getActiveVoiceIds(), []);
});

test('手部调节会把旋钮和滑杆参数推送给已激活声音', () => {
  const updates = [];
  const engine = createAudioEngine({
    frequencies: [220],
    createVoiceBackend: ({ controlState }) => {
      return {
        start() {},
        stop() {},
        update(nextState) {
          updates.push({
            initial: controlState,
            next: nextState,
          });
        },
      };
    },
  });

  engine.startPadVoice(0);
  engine.setKnobAngle(Math.PI);
  engine.setSliderValue('volume', 0.25);

  assert.equal(updates.length, 2);
  assert.equal(updates[0].next.knobAngle, Math.PI);
  assert.equal(updates[1].next.volume, 0.25);
});
