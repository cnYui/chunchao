import assert from 'node:assert/strict';
import test from 'node:test';

import { createTimelineRefreshStore } from '../timeline-refresh-state.js';

const createMemoryStorage = () => {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

test('可保存并恢复视频段状态', () => {
  const storage = createMemoryStorage();
  const store = createTimelineRefreshStore(storage);

  store.saveVideoSegment(2);

  assert.deepEqual(store.read(), {
    mode: 'video',
    segmentIndex: 2,
  });
});

test('可保存并恢复交互页状态', () => {
  const storage = createMemoryStorage();
  const store = createTimelineRefreshStore(storage);

  store.saveInteraction({
    segmentIndex: 1,
    interactionIndex: 0,
    sceneIndex: 1,
  });

  assert.deepEqual(store.read(), {
    mode: 'interaction',
    segmentIndex: 1,
    interactionIndex: 0,
    sceneIndex: 1,
  });
});

test('可保存并恢复最终页状态', () => {
  const storage = createMemoryStorage();
  const store = createTimelineRefreshStore(storage);

  store.saveFinal();

  assert.deepEqual(store.read(), {
    mode: 'final',
  });
});

test('非法状态会被忽略', () => {
  const storage = createMemoryStorage();
  const store = createTimelineRefreshStore(storage);

  storage.setItem('chunchao:timeline-refresh-state', '{"mode":"interaction","segmentIndex":"bad"}');

  assert.equal(store.read(), null);
});

test('可清除已保存状态', () => {
  const storage = createMemoryStorage();
  const store = createTimelineRefreshStore(storage);

  store.saveFinal();
  store.clear();

  assert.equal(store.read(), null);
});
