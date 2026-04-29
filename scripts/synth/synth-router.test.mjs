import assert from 'node:assert/strict';
import test from 'node:test';

import { createSynthRouter } from '../../synth/synth-router.js';

test('router 会按当前状态切换 pad 的启停', () => {
  const calls = [];
  const router = createSynthRouter({
    audioEngine: {
      getControlState() {
        return {
          occupied: [false],
        };
      },
      startPadVoice(id) {
        calls.push(`start:${id}`);
      },
      stopPadVoice(id) {
        calls.push(`stop:${id}`);
      },
    },
    uiControls: {
      setKnobAngle() {},
      setSliderValue() {},
      setPadActive() {},
    },
  });

  router.togglePad(0);

  assert.deepEqual(calls, ['start:0']);
});

test('router 会把手部输入路由到控件层', () => {
  const knobCalls = [];
  const sliderCalls = [];
  const audioKnobCalls = [];
  const audioSliderCalls = [];
  const router = createSynthRouter({
    audioEngine: {
      getControlState() {
        return {
          occupied: [],
        };
      },
      startPadVoice() {},
      stopPadVoice() {},
      setKnobAngle(angle) {
        audioKnobCalls.push(angle);
      },
      setSliderValue(key, value) {
        audioSliderCalls.push([key, value]);
      },
    },
    uiControls: {
      setKnobAngle(angle) {
        knobCalls.push(angle);
      },
      setSliderValue(key, value) {
        sliderCalls.push([key, value]);
      },
      setPadActive() {},
    },
  });

  router.applyHandInput({
    knobAngle: Math.PI / 2,
    sliders: {
      volume: 0.7,
      reverb: 0.4,
    },
  });

  assert.deepEqual(knobCalls, [Math.PI / 2]);
  assert.deepEqual(sliderCalls, [
    ['volume', 0.7],
    ['reverb', 0.4],
  ]);
  assert.deepEqual(audioKnobCalls, [Math.PI / 2]);
  assert.deepEqual(audioSliderCalls, [
    ['volume', 0.7],
    ['reverb', 0.4],
  ]);
});

test('router 会同步 pad 激活态到界面层', () => {
  const calls = [];
  const router = createSynthRouter({
    audioEngine: {
      getControlState() {
        return {
          occupied: [],
        };
      },
      startPadVoice() {},
      stopPadVoice() {},
      setKnobAngle() {},
      setSliderValue() {},
    },
    uiControls: {
      setKnobAngle() {},
      setSliderValue() {},
      setPadActive(index, active) {
        calls.push([index, active]);
      },
    },
  });

  router.syncPadStates([true, false, true]);

  assert.deepEqual(calls, [
    [0, true],
    [1, false],
    [2, true],
  ]);
});

test('router 在已激活 pad 上再次点击时会停止声音', () => {
  const calls = [];
  const router = createSynthRouter({
    audioEngine: {
      getControlState() {
        return {
          occupied: [true],
        };
      },
      startPadVoice(id) {
        calls.push(`start:${id}`);
      },
      stopPadVoice(id) {
        calls.push(`stop:${id}`);
      },
      setKnobAngle() {},
      setSliderValue() {},
    },
    uiControls: {
      setKnobAngle() {},
      setSliderValue() {},
      setPadActive() {},
    },
  });

  router.togglePad(0);

  assert.deepEqual(calls, ['stop:0']);
});
