import assert from 'node:assert/strict';
import test from 'node:test';

import { createAudioEngine, defaultControlState } from '../synth/audio-engine.js';
import { strudelPadSounds } from '../synth/sound-presets.js';

const createTestBackend = (records) => {
  return (options) => {
    records.push(options);

    return {
      start() {},
      stop() {},
      update() {},
    };
  };
};

test('音频引擎会把按钮索引对应的音色预设传给后端', () => {
  const records = [];
  const padSounds = [
    { key: 'bd', frequency: 55 },
    { key: 'sd', frequency: 180 },
  ];
  const engine = createAudioEngine({
    padSounds,
    createVoiceBackend: createTestBackend(records),
    initialControlState: defaultControlState,
  });

  engine.startPadVoice(1);

  assert.equal(records.length, 1);
  assert.equal(records[0].frequency, 180);
  assert.equal(records[0].sound.key, 'sd');
});

test('最终展示页提供 16 个 Strudel 风格按钮音效', () => {
  assert.equal(strudelPadSounds.length, 16);
  assert.deepEqual(
    strudelPadSounds.map((sound) => sound.key),
    [
      'bd',
      'sd',
      'hh',
      'cp',
      'rim',
      'tom',
      'perc',
      'sub',
      'bass',
      'pluck',
      'arp',
      'acid',
      'fm',
      'noise',
      'glass',
      'pad',
    ],
  );
  assert.ok(strudelPadSounds.every((sound) => Number.isFinite(sound.frequency)));
});
