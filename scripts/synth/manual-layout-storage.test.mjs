import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadManualLayout,
  manualLayoutStorageKey,
  saveManualLayout,
} from '../../synth/manual-layout-storage.js';

test('损坏的布局 JSON 会被忽略', () => {
  const storage = {
    getItem: () => '{bad json',
    setItem: () => {},
  };

  assert.equal(loadManualLayout(storage), null);
});

test('不存在布局时返回 null', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {},
  };

  assert.equal(loadManualLayout(storage), null);
});

test('合法布局会按固定 key 序列化保存', () => {
  let writeKey = null;
  let writeValue = null;
  const storage = {
    getItem: () => null,
    setItem: (key, value) => {
      writeKey = key;
      writeValue = value;
    },
  };

  saveManualLayout(storage, {
    version: 1,
    previewSize: { width: 10, height: 10 },
    pads: [],
    controls: {},
    consoleFrame: null,
  });

  assert.equal(writeKey, manualLayoutStorageKey);
  assert.match(writeValue, /"version":1/);
});

