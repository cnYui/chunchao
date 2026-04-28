import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEmptyManualLayoutDraft,
  manualLayoutSteps,
  validateManualLayout,
} from '../../synth/manual-layout-config.js';

const createRect = (id, label) => ({
  id,
  label,
  x: 10,
  y: 12,
  width: 50,
  height: 40,
});

const createCompleteLayout = () => ({
  version: 1,
  previewSize: { width: 320, height: 240 },
  pads: Array.from({ length: 16 }, (_, index) => createRect(`pad-${index + 1}`, `Pad ${index + 1}`)),
  controls: {
    vibe: createRect('vibe', 'VIBE'),
    volume: createRect('volume', 'VOL'),
    reverb: createRect('reverb', 'REV'),
    position: createRect('position', 'POS'),
  },
  consoleFrame: createRect('console-frame', '控制台'),
});

test('手工布局步骤顺序固定为 16 个 pad、4 个控件和控制台外框', () => {
  assert.equal(manualLayoutSteps.length, 21);
  assert.equal(manualLayoutSteps[0].id, 'pad-1');
  assert.equal(manualLayoutSteps[15].id, 'pad-16');
  assert.equal(manualLayoutSteps[16].id, 'vibe');
  assert.equal(manualLayoutSteps[17].id, 'volume');
  assert.equal(manualLayoutSteps[18].id, 'reverb');
  assert.equal(manualLayoutSteps[19].id, 'position');
  assert.equal(manualLayoutSteps[20].id, 'console-frame');
});

test('空草稿会保留固定结构', () => {
  assert.deepEqual(buildEmptyManualLayoutDraft(), {
    version: 1,
    previewSize: null,
    pads: [],
    controls: {},
    consoleFrame: null,
  });
});

test('未完成布局不会通过校验', () => {
  const draft = buildEmptyManualLayoutDraft();
  draft.previewSize = { width: 320, height: 240 };
  draft.pads.push(createRect('pad-1', 'Pad 1'));

  assert.deepEqual(validateManualLayout(draft), {
    ok: false,
    reason: 'pad-count-mismatch',
  });
});

test('完整布局会通过校验', () => {
  assert.deepEqual(validateManualLayout(createCompleteLayout()), {
    ok: true,
  });
});

