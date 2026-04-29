# 最终合成器手工布局编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为最终合成器页增加右下预览手工布局模式，让用户手工绘制 `16` 个 pad、`VIBE / VOL / REV / POS` 和控制台外框，并让运行态优先使用该布局。

**Architecture:** 先把“布局步骤定义、布局校验、坐标换算、持久化”拆成纯函数模块并用测试锁定，再把 `synth/app.js` 接入一个最小绘制层与模式切换。运行时继续保留旧四点标定兜底，但几何优先级切到手工布局派生数据。

**Tech Stack:** 原生 JS、Vite、Node test runner、浏览器 `localStorage`

---

### Task 1: 抽出布局步骤与数据纯函数

**Files:**
- Create: `synth/manual-layout-config.js`
- Create: `synth/manual-layout-storage.js`
- Test: `scripts/synth/manual-layout-config.test.mjs`
- Test: `scripts/synth/manual-layout-storage.test.mjs`

- [ ] **Step 1: 写失败测试，锁定步骤顺序与布局校验**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  manualLayoutSteps,
  buildEmptyManualLayoutDraft,
  validateManualLayout,
} from '../../synth/manual-layout-config.js';

test('手工布局步骤顺序固定为 16 个 pad、4 个控件和控制台外框', () => {
  assert.equal(manualLayoutSteps.length, 21);
  assert.equal(manualLayoutSteps[0].id, 'pad-1');
  assert.equal(manualLayoutSteps[15].id, 'pad-16');
  assert.equal(manualLayoutSteps[16].id, 'vibe');
  assert.equal(manualLayoutSteps[20].id, 'console-frame');
});

test('未完成布局不会通过校验', () => {
  const draft = buildEmptyManualLayoutDraft();
  draft.pads.push({ id: 'pad-1', label: 'Pad 1', x: 10, y: 10, width: 30, height: 30 });
  assert.equal(validateManualLayout(draft).ok, false);
});
```

- [ ] **Step 2: 运行测试并确认按“模块不存在”失败**

Run: `node --test scripts/synth/manual-layout-config.test.mjs`
Expected: FAIL，提示 `manual-layout-config.js` 不存在或缺少导出

- [ ] **Step 3: 写最小实现，提供步骤定义与布局校验**

```js
export const manualLayoutSteps = [
  ...Array.from({ length: 16 }, (_, index) => ({
    id: `pad-${index + 1}`,
    kind: 'pad',
    label: `Pad ${index + 1}`,
  })),
  { id: 'vibe', kind: 'control', label: 'VIBE' },
  { id: 'volume', kind: 'control', label: 'VOL' },
  { id: 'reverb', kind: 'control', label: 'REV' },
  { id: 'position', kind: 'control', label: 'POS' },
  { id: 'console-frame', kind: 'frame', label: '控制台' },
];

export const buildEmptyManualLayoutDraft = () => ({
  version: 1,
  previewSize: null,
  pads: [],
  controls: {},
  consoleFrame: null,
});

export const validateManualLayout = (layout) => {
  if (!layout?.previewSize?.width || !layout?.previewSize?.height) {
    return { ok: false, reason: 'preview-size-missing' };
  }

  if (layout.pads?.length !== 16) {
    return { ok: false, reason: 'pad-count-mismatch' };
  }

  return layout.consoleFrame && layout.controls?.vibe && layout.controls?.volume && layout.controls?.reverb && layout.controls?.position
    ? { ok: true }
    : { ok: false, reason: 'control-missing' };
};
```

- [ ] **Step 4: 再补持久化失败测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { loadManualLayout, saveManualLayout } from '../../synth/manual-layout-storage.js';

test('损坏的布局 JSON 会被忽略', () => {
  const storage = {
    getItem: () => '{bad json',
    setItem: () => {},
  };

  assert.equal(loadManualLayout(storage), null);
});

test('合法布局会被序列化保存', () => {
  let written = null;
  const storage = {
    getItem: () => null,
    setItem: (_, value) => {
      written = value;
    },
  };

  saveManualLayout(storage, { version: 1, previewSize: { width: 10, height: 10 }, pads: [], controls: {}, consoleFrame: null });
  assert.ok(written.includes('"version":1'));
});
```

- [ ] **Step 5: 运行测试确认失败**

Run: `node --test scripts/synth/manual-layout-storage.test.mjs`
Expected: FAIL，提示 `manual-layout-storage.js` 不存在

- [ ] **Step 6: 写最小持久化实现并跑通过**

```js
const manualLayoutStorageKey = 'synthManualLayout';

export const loadManualLayout = (storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem?.(manualLayoutStorageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveManualLayout = (storage = globalThis.localStorage, layout) => {
  storage?.setItem?.(manualLayoutStorageKey, JSON.stringify(layout));
};
```

Run: `node --test scripts/synth/manual-layout-config.test.mjs scripts/synth/manual-layout-storage.test.mjs`
Expected: PASS

### Task 2: 抽出坐标换算与运行态矩形派生

**Files:**
- Create: `synth/manual-layout-runtime.js`
- Test: `scripts/synth/manual-layout-runtime.test.mjs`

- [ ] **Step 1: 写失败测试，锁定预览坐标到视频坐标的换算**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { mapManualRectToVideoRect, buildRuntimeLayout } from '../../synth/manual-layout-runtime.js';

test('预览矩形可按比例换算到视频矩形', () => {
  const result = mapManualRectToVideoRect(
    { x: 10, y: 20, width: 50, height: 40 },
    { width: 100, height: 100 },
    { width: 1000, height: 500 },
  );

  assert.deepEqual(result, {
    left: 100,
    top: 100,
    right: 600,
    bottom: 300,
  });
});

test('运行态布局会生成 16 个 pad 和 4 个 control rect', () => {
  const runtime = buildRuntimeLayout(sampleManualLayout, { width: 960, height: 540 });
  assert.equal(runtime.padRois.length, 16);
  assert.ok(runtime.controlRects.vibe);
  assert.ok(runtime.consoleFrameRect);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/synth/manual-layout-runtime.test.mjs`
Expected: FAIL，提示 `manual-layout-runtime.js` 不存在

- [ ] **Step 3: 写最小实现**

```js
const toBounds = ({ x, y, width, height }, targetSize, previewSize) => {
  const scaleX = targetSize.width / previewSize.width;
  const scaleY = targetSize.height / previewSize.height;

  return {
    left: x * scaleX,
    top: y * scaleY,
    right: (x + width) * scaleX,
    bottom: (y + height) * scaleY,
  };
};

export const mapManualRectToVideoRect = (rect, previewSize, targetSize) => {
  return toBounds(rect, targetSize, previewSize);
};

export const buildRuntimeLayout = (layout, targetSize) => ({
  padRois: layout.pads.map((item) => {
    const bounds = toBounds(item, targetSize, layout.previewSize);
    return [
      { x: bounds.left, y: bounds.top },
      { x: bounds.right, y: bounds.top },
      { x: bounds.right, y: bounds.bottom },
      { x: bounds.left, y: bounds.bottom },
    ];
  }),
  controlRects: {
    vibe: toBounds(layout.controls.vibe, targetSize, layout.previewSize),
    volume: toBounds(layout.controls.volume, targetSize, layout.previewSize),
    reverb: toBounds(layout.controls.reverb, targetSize, layout.previewSize),
    position: toBounds(layout.controls.position, targetSize, layout.previewSize),
  },
  consoleFrameRect: toBounds(layout.consoleFrame, targetSize, layout.previewSize),
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/synth/manual-layout-runtime.test.mjs`
Expected: PASS

### Task 3: 接入右下预览布局模式 UI

**Files:**
- Modify: `synth/app.js`
- Test: `scripts/synth/manual-layout-ui.test.mjs`

- [ ] **Step 1: 写失败测试，锁定布局模式步骤与按钮文案**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

test('最终合成器接入布局模式控制按钮', () => {
  const source = fs.readFileSync(new URL('../../synth/app.js', import.meta.url), 'utf8');
  assert.match(source, /布局模式/);
  assert.match(source, /保存布局/);
  assert.match(source, /退出布局/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/synth/manual-layout-ui.test.mjs`
Expected: FAIL，找不到布局模式按钮文案

- [ ] **Step 3: 在 `synth/app.js` 加入最小布局编辑状态**

```js
state.layoutMode = false;
state.manualLayout = loadManualLayout();
state.manualLayoutDraft = buildEmptyManualLayoutDraft();
state.layoutDraftIndex = 0;
state.layoutDrawingRect = null;
```

- [ ] **Step 4: 加入布局模式按钮与预览拖拽层**

```js
ui.layoutButton = createControlButton('布局模式', 'layout');
ui.undoLayoutButton = createControlButton('撤销', 'layout-undo');
ui.redrawLayoutButton = createControlButton('重画当前', 'layout-redraw');
ui.clearLayoutButton = createControlButton('清空', 'layout-clear');
ui.saveLayoutButton = createControlButton('保存布局', 'layout-save');
ui.exitLayoutButton = createControlButton('退出布局', 'layout-exit');
```

- [ ] **Step 5: 接入布局拖拽逻辑**

```js
const beginLayoutDraw = (event) => {
  state.layoutPointerStart = getPreviewRelativePoint(event);
  state.layoutDrawingRect = null;
};

const updateLayoutDraw = (event) => {
  if (!state.layoutPointerStart) {
    return;
  }

  state.layoutDrawingRect = createRectFromPoints(
    state.layoutPointerStart,
    getPreviewRelativePoint(event),
  );
};

const completeLayoutDraw = () => {
  commitCurrentLayoutRect(state.layoutDrawingRect);
  state.layoutPointerStart = null;
  state.layoutDrawingRect = null;
};
```

- [ ] **Step 6: 运行测试确认通过**

Run: `node --test scripts/synth/manual-layout-ui.test.mjs`
Expected: PASS

### Task 4: 让运行态优先读取手工布局

**Files:**
- Modify: `synth/app.js`
- Test: `scripts/synth/manual-layout-flow.test.mjs`

- [ ] **Step 1: 写失败测试，锁定运行态优先级**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveActiveGeometrySource } from '../../synth/manual-layout-runtime.js';

test('存在手工布局时优先返回 manual', () => {
  assert.equal(resolveActiveGeometrySource({ manualLayout: {}, calibrationReady: true }), 'manual');
});

test('没有手工布局时回退 calibration', () => {
  assert.equal(resolveActiveGeometrySource({ manualLayout: null, calibrationReady: true }), 'calibration');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/synth/manual-layout-flow.test.mjs`
Expected: FAIL，缺少 `resolveActiveGeometrySource`

- [ ] **Step 3: 在运行态模块补优先级与 `app.js` 接线**

```js
export const resolveActiveGeometrySource = ({ manualLayout, calibrationReady }) => {
  if (manualLayout) {
    return 'manual';
  }

  return calibrationReady ? 'calibration' : 'none';
};
```

```js
const geometrySource = resolveActiveGeometrySource({
  manualLayout: state.manualLayout,
  calibrationReady: state.padRois.length === padCount,
});

const activePadRois = geometrySource === 'manual'
  ? state.runtimeManualLayout?.padRois ?? []
  : state.padRois;
```

- [ ] **Step 4: 让手势控制和 baseline 采样都切到活动几何**

```js
const activeKnobRect = geometrySource === 'manual'
  ? state.runtimeManualLayout?.controlRects?.vibe ?? null
  : state.knobRect;
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test scripts/synth/manual-layout-runtime.test.mjs scripts/synth/manual-layout-flow.test.mjs`
Expected: PASS

### Task 5: 回归、文档与验证

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/ai/context/synthesizer-final-page.md`
- Modify: `docs/ai/context/2026-04-28-project-refactor-start.md`

- [ ] **Step 1: 补上下文记忆**

```md
- 当前最终合成器页已接入手工布局模式，默认优先读取 `localStorage` 中的 `synthManualLayout`
- 当前布局模式绘制顺序固定为 `Pad 1-16 -> VIBE -> VOL -> REV -> POS -> 控制台外框`
```

- [ ] **Step 2: 运行单测**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: 运行构建验证**

Run: `npm run build`
Expected: PASS，允许保留现有 chunk size warning

- [ ] **Step 4: 提交本轮改动**

```bash
git add AGENTS.md docs/ai/context/2026-04-28-project-refactor-start.md docs/ai/context/synthesizer-final-page.md synth/app.js synth/manual-layout-config.js synth/manual-layout-runtime.js synth/manual-layout-storage.js scripts/synth/manual-layout-config.test.mjs scripts/synth/manual-layout-flow.test.mjs scripts/synth/manual-layout-runtime.test.mjs scripts/synth/manual-layout-storage.test.mjs scripts/synth/manual-layout-ui.test.mjs
git commit -m "feat: add synth manual layout editor"
```

## 自检

- 规格中的 `21` 个绘制步骤已有对应任务：Task 1 锁顺序，Task 3 接 UI，Task 4 接运行态
- 无 `TBD`、`TODO`、`类似上一步` 这类占位描述
- 统一使用 `manualLayout`、`runtimeManualLayout`、`resolveActiveGeometrySource` 三个命名，避免后续接线时漂移
