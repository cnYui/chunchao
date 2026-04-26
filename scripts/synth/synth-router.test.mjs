import assert from 'node:assert/strict';
import test from 'node:test';

import { createSynthRouter } from '../../synth/synth-router.js';

test('router 会把占格进入与退出路由到声音引擎', () => {
  const calls = [];
  const router = createSynthRouter({
    audioEngine: {
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
    },
  });

  router.applyOccupancyStates([{ status: 'occupied', transition: 'entered' }]);
  router.applyOccupancyStates([{ status: 'empty', transition: 'exited' }]);

  assert.deepEqual(calls, ['start:0', 'stop:0']);
});

test('router 会把手部输入路由到控件层', () => {
  const knobCalls = [];
  const sliderCalls = [];
  const audioKnobCalls = [];
  const audioSliderCalls = [];
  const router = createSynthRouter({
    audioEngine: {
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

test('router 只在状态边沿触发 start 与 stop', () => {
  const calls = [];
  const router = createSynthRouter({
    audioEngine: {
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
    },
  });

  router.applyOccupancyStates([
    { status: 'occupied', transition: 'entered' },
    { status: 'occupied', transition: null },
    { status: 'empty', transition: 'exited' },
  ]);

  assert.deepEqual(calls, ['start:0', 'stop:2']);
});
