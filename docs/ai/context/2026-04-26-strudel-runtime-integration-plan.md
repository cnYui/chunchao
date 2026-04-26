# Strudel Runtime 接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前 `synthesizer.html` 页面中真实运行 Strudel，把四向旋钮映射为 `warm / cold / bright / dark` 四组 vibe，把 `4x4` 格子映射为用户给定的 Strudel pattern，并在占格进入时开始循环、占格退出时停止循环。

**Architecture:** 保留现有 `synthesizer.html + synth/app.js` 页面结构与摄像头占格链路，移除当前自建 pad 声音后端，改为由新的 `Strudel runtime` 模块统一生成并播放 `stack(...)` 表达式。运行时只维护两类状态：当前旋钮选择的 vibe，当前 16 格 occupied 布尔数组；每次状态变更都重建目标 Strudel 组合并切换播放。

**Tech Stack:** `Vite`、`@strudel/web`、浏览器 `WebAudio`、现有 `MediaPipe + ROI occupancy detector`

---

## 文件结构

- 新建：`package.json`
  - 负责声明 `vite`、`@strudel/web` 和启动脚本。
- 新建：`vite.config.js`
  - 保持静态资源目录兼容当前仓库结构。
- 新建：`scripts/strudel-runtime-state.test.mjs`
  - 负责验证旋钮档位、16 格坐标映射、`(3,4)` 留空和最终组合代码生成。
- 新建：`synth/strudel-score.js`
  - 保存用户提供的带注释 Strudel 源码拆分结果、格子坐标映射和组合辅助函数。
- 新建：`synth/strudel-runtime.js`
  - 负责初始化 Strudel、管理当前运行状态、生成最终 `stack(...)`、开始/停止播放。
- 修改：`synth/app.js`
  - 把现有页面的占格边沿和旋钮变化接到新的 Strudel runtime。
- 修改：`synth/audio-engine.js`
  - 去掉对页面主音频职责的依赖，保留必要工具或彻底移出页面主链路。
- 修改：`synth/ui-controls.js`
  - 如有需要，暴露当前旋钮方向标签或设置钩子，保证 UI 与 Strudel 状态一致。
- 修改：`synthesizer.html`
  - 切到 Vite 入口，保留现有页面结构与按钮/旋钮 DOM。
- 修改：`docs/ai/context/synthesizer-final-page.md`
  - 记录 Strudel runtime 已接入、四档旋钮与 16 格映射。
- 修改：`AGENTS.md`
  - 记录当前最终展示页已从自建 pad 合成切换为真实 Strudel runtime。

### 任务 1：先锁定 Strudel 映射行为

**Files:**
- Create: `scripts/strudel-runtime-state.test.mjs`
- Create: `synth/strudel-score.js`

- [ ] **Step 1: 写失败测试**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOccupiedGridCode,
  getGridCellPatternKey,
  getVibeKeyFromIndex,
} from '../synth/strudel-score.js';

test('旋钮四档按页面方向映射到 warm cold bright dark', () => {
  assert.equal(getVibeKeyFromIndex(0), 'warm');
  assert.equal(getVibeKeyFromIndex(1), 'bright');
  assert.equal(getVibeKeyFromIndex(2), 'cold');
  assert.equal(getVibeKeyFromIndex(3), 'dark');
});

test('16 格按 4x4 坐标映射 pattern，(3,4) 留空', () => {
  assert.equal(getGridCellPatternKey(0), 'walking');
  assert.equal(getGridCellPatternKey(5), 'breakbeat');
  assert.equal(getGridCellPatternKey(11), null);
  assert.equal(getGridCellPatternKey(15), 'recitative');
});

test('最终组合代码包含当前 vibe 与 occupied 格子 pattern', () => {
  const code = createOccupiedGridCode({
    vibeKey: 'warm',
    occupied: [
      true, false, true, false,
      false, false, false, false,
      false, false, false, false,
      false, false, false, true,
    ],
  });

  assert.match(code, /vibe\\.warm/);
  assert.match(code, /bass\\.walking/);
  assert.match(code, /bass\\.sidechain/);
  assert.match(code, /melody\\.recitative/);
  assert.doesNotMatch(code, /style\\.[a-z]+/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/strudel-runtime-state.test.mjs`
Expected: FAIL，提示 `synth/strudel-score.js` 或导出方法不存在。

- [ ] **Step 3: 写最小实现**

```js
export const vibeOrder = ['warm', 'bright', 'cold', 'dark'];

export const gridPatternKeys = [
  'walking', 'riff', 'sidechain', 'drone',
  'fourfour', 'breakbeat', 'backbeat', 'halftime',
  'hiphop', 'rnb', 'electronic', null,
  'lyrical', 'dance', 'instrumental', 'recitative',
];

export const getVibeKeyFromIndex = (index) => vibeOrder[index] ?? vibeOrder[0];
export const getGridCellPatternKey = (index) => gridPatternKeys[index] ?? null;
```

- [ ] **Step 4: 再补最终组合代码生成**

```js
export const createOccupiedGridCode = ({ vibeKey, occupied }) => {
  const activeLayers = occupied
    .map((active, index) => (active ? getGridCellPatternKey(index) : null))
    .filter(Boolean)
    .map((key) => patternKeyToReference[key]);

  return [
    strudelSourceHeader,
    '',
    'stack(',
    `  vibe.${vibeKey},`,
    ...activeLayers.map((layer, index) => {
      const suffix = index === activeLayers.length - 1 ? '' : ',';
      return `  ${layer}${suffix}`;
    }),
    ')',
  ].join('\n');
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test scripts/strudel-runtime-state.test.mjs`
Expected: PASS

### 任务 2：把项目升级为 npm + Vite + Strudel

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Modify: `synthesizer.html`

- [ ] **Step 1: 写失败测试，要求页面入口改为 Vite 可解析模块**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../synthesizer.html', import.meta.url), 'utf8');

test('最终展示页通过本地模块入口加载 synth/app.js', () => {
  assert.match(html, /<script type="module" src="\\/synth\\/app\\.js"><\\/script>/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/synthesizer-pad-count.test.mjs`
Expected: FAIL，旧版 query string 入口不匹配。

- [ ] **Step 3: 写最小 npm 工程配置**

```json
{
  "name": "chunchao-demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "node --no-warnings --test scripts/**/*.test.mjs"
  },
  "dependencies": {
    "@strudel/web": "^1.0.0"
  },
  "devDependencies": {
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 4: 调整页面入口与 Vite 配置**

```js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 8002,
  },
});
```

- [ ] **Step 5: 安装依赖并验证**

Run: `npm install`
Expected: 生成 `package-lock.json`，无安装错误。

Run: `npm run build`
Expected: Vite 构建成功。

### 任务 3：接入 Strudel runtime

**Files:**
- Create: `synth/strudel-runtime.js`
- Modify: `synth/app.js`

- [ ] **Step 1: 写失败测试，要求运行时根据状态生成并切换代码**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createStrudelRuntime } from '../synth/strudel-runtime.js';

test('状态变化会触发新的 Strudel 组合代码', () => {
  const calls = [];
  const runtime = createStrudelRuntime({
    runCode(code) {
      calls.push(code);
    },
  });

  runtime.setVibeByIndex(0);
  runtime.setOccupied(0, true);

  assert.equal(calls.length, 1);
  assert.match(calls[0], /vibe\\.warm/);
  assert.match(calls[0], /bass\\.walking/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/strudel-runtime-state.test.mjs`
Expected: FAIL，`createStrudelRuntime` 不存在或未触发调用。

- [ ] **Step 3: 写最小运行时适配层**

```js
export const createStrudelRuntime = ({ runCode }) => {
  const state = {
    vibeKey: 'warm',
    occupied: Array.from({ length: 16 }, () => false),
  };

  const sync = () => {
    const hasActivePad = state.occupied.some(Boolean);
    if (!hasActivePad) {
      runCode('hush()');
      return;
    }

    runCode(createOccupiedGridCode(state));
  };

  return {
    setVibeByIndex(index) {
      state.vibeKey = getVibeKeyFromIndex(index);
      if (state.occupied.some(Boolean)) {
        sync();
      }
    },
    setOccupied(index, active) {
      state.occupied[index] = active;
      sync();
    },
  };
};
```

- [ ] **Step 4: 在 `synth/app.js` 把占格边沿与旋钮变化接到运行时**

```js
const strudelRuntime = createStrudelRuntime({
  runCode: async (code) => {
    await browserStrudel.run(code);
  },
});

router.applyOccupancyStates = (states) => {
  states.forEach((state, index) => {
    if (state.transition === 'entered') strudelRuntime.setOccupied(index, true);
    if (state.transition === 'exited') strudelRuntime.setOccupied(index, false);
  });
};
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --no-warnings --test scripts/strudel-runtime-state.test.mjs scripts/synth/*.test.mjs`
Expected: PASS

### 任务 4：把页面控件对齐 Strudel 模型

**Files:**
- Modify: `synth/app.js`
- Modify: `synth/ui-controls.js`

- [ ] **Step 1: 写失败测试，要求旋钮映射到四个 vibe 档位**

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { getVibeIndexFromAngle } from '../synth/audio-engine.js';

test('旋钮角度稳定映射到 4 个档位', () => {
  assert.equal(getVibeIndexFromAngle(-Math.PI / 2), 0);
  assert.equal(getVibeIndexFromAngle(0), 1);
  assert.equal(getVibeIndexFromAngle(Math.PI / 2), 2);
  assert.equal(getVibeIndexFromAngle(Math.PI), 3);
});
```

- [ ] **Step 2: 运行测试确认行为与 Strudel 顺序一致**

Run: `node --test scripts/synth/audio-engine.test.mjs`
Expected: 若顺序不一致则 FAIL。

- [ ] **Step 3: 最小实现**

```js
router.applyHandInput({ knobAngle, sliders }) {
  if (Number.isFinite(knobAngle)) {
    uiControls.setKnobAngle(knobAngle);
    strudelRuntime.setVibeByIndex(getVibeIndexFromAngle(knobAngle));
  }
}
```

- [ ] **Step 4: 验证鼠标 fallback**

Run: `npm run dev`
Expected: 鼠标拖动旋钮能切换 vibe；鼠标按住格子会触发对应 Strudel 层。

### 任务 5：补文档和最终验证

**Files:**
- Modify: `docs/ai/context/synthesizer-final-page.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新上下文文档**

```md
- 当前最终展示页已切换为真实 Strudel runtime
- 旋钮四档映射为 `warm / bright / cold / dark`
- 16 格中 `(3,4)` 当前留空，不绑定 Strudel pattern
```

- [ ] **Step 2: 跑完整验证**

Run: `npm run build`
Expected: PASS

Run: `node --no-warnings --test scripts/**/*.test.mjs`
Expected: PASS

- [ ] **Step 3: 本地启动并人工检查**

Run: `npm run dev -- --host 127.0.0.1 --port 8002`
Expected: 浏览器可访问 `http://127.0.0.1:8002/synthesizer.html`，占格与旋钮能触发对应 Strudel 循环。
