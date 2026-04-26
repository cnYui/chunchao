import assert from 'node:assert/strict';
import test from 'node:test';

import { createUiControls } from '../../synth/ui-controls.js';

const createElement = ({ dataset = {}, children = [] } = {}) => ({
  dataset,
  style: {},
  children,
  classList: {
    toggle() {},
  },
  querySelector(selector) {
    return children.find((child) => child.selector === selector) ?? null;
  },
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 10, bottom: 10 };
  },
});

test('pad 激活态不修改按钮 transform，避免污染 ROI 几何测量', () => {
  const pad = createElement();
  const root = {
    querySelector(selector) {
      if (selector === '.stage-console' || selector === '#knob') {
        return createElement();
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.pad-btn') {
        return [pad];
      }
      return [];
    },
  };

  const uiControls = createUiControls(root);
  uiControls.setPadActive(0, true);

  assert.equal(pad.style.transform ?? '', '');
});
