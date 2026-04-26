# 桌面投影合成器交互实现计划

> **执行要求：** 实现该计划时，必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。所有步骤统一使用 checkbox 追踪。

**目标：** 在 `synthesizer.html` 中接入“内置摄像头 + MediaPipe 手部调控 + 16 格实体方块占格触发”的桌面投影 MVP，并保持现有视频时间轴结构不变。

**架构：** 最终展示页继续作为独立静态页面运行，但将当前内联脚本拆成独立模块。输入分成两路：`MediaPipe Hand Landmarker` 只负责手部关键点和控件调节，`Occupancy Detector` 只负责 16 个 pad 的占格状态；二者通过 `synth-router` 汇总到声音和 UI 控制层。

**技术栈：** 原生 HTML/CSS/ES Module、Web Audio API、`@mediapipe/tasks-vision` CDN、`node:test`

---

## 文件结构与职责

### 运行时代码

- `synthesizer.html`
  最终展示页 DOM、调试层挂载点、模块脚本入口
- `synth/app.js`
  最终展示页运行时入口，负责串起摄像头、标定、占格检测、手部检测、UI 和音频
- `synth/audio-engine.js`
  管理 `AudioContext`、持续型 pad 声音生命周期、波形分析
- `synth/ui-controls.js`
  管理旋钮、滑杆、pad DOM 引用，以及鼠标 / 手部 / 路由层的 UI 更新
- `synth/projection-calibration.js`
  管理手动四点标定、单应性变换、`page space -> camera space`
- `synth/occupancy-detector.js`
  管理 16 个 pad 的 ROI、baseline、分数计算和四态状态机
- `synth/hand-controller.js`
  管理 MediaPipe Hand Landmarker 加载、逐帧检测、关键点输出
- `synth/hand-math.js`
  纯函数：手部外接框、手部遮挡区域、手到旋钮 / 滑杆的映射
- `synth/synth-router.js`
  管理手部与占格输入路由到 `audio-engine` 和 `ui-controls`
- `synth/debug-overlay.js`
  渲染摄像头预览、标定点、ROI 边框和格子状态

### 测试代码

- `scripts/synth/audio-engine.test.mjs`
  验证 pad 声音的 `start / stop` 生命周期
- `scripts/synth/projection-calibration.test.mjs`
  验证四点标定和坐标映射
- `scripts/synth/occupancy-detector.test.mjs`
  验证 baseline、占格分数、进入 / 退出防抖
- `scripts/synth/hand-math.test.mjs`
  验证手部区域与控件映射
- `scripts/synth/synth-router.test.mjs`
  验证 `empty -> occupied` 开声、`occupied -> empty` 停声，以及手部调控路由
- `scripts/synthesizer-pad-count.test.mjs`
  继续承担静态 DOM smoke test，并追加入口脚本和调试层容器检查

### 文档

- `docs/ai/context/projection-table-laptop-camera-synth-design.md`
  已确认的设计 spec
- `docs/ai/context/projection-table-mediapipe-occupancy-evaluation.md`
  方案评估与风险依据
- `docs/ai/context/AGENTS.md`
  项目记忆

## 实现约束

- 不改 `index.html`、`main.js` 的视频时间轴逻辑
- 最终展示页仍由 `iframe` 加载 `synthesizer.html`
- 第一版不识别具体方块种类，只识别格子占位
- 第一版不做自动角点识别，只做手动四点标定
- 第一版保留鼠标作为后备输入，方便现场调试

## Task 1：抽离持续型声音引擎

**Files:**
- Create: `synth/audio-engine.js`
- Test: `scripts/synth/audio-engine.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 pad 声音生命周期**

```js
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
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\audio-engine.test.mjs`
Expected: FAIL，报错 `Cannot find module '../../synth/audio-engine.js'`

- [ ] **Step 3: 写最小实现**

```js
const defaultVoiceBackendFactory = () => {
  throw new Error('createVoiceBackend is required');
};

export const createAudioEngine = ({
  frequencies,
  createVoiceBackend = defaultVoiceBackendFactory,
}) => {
  const activeVoices = new Map();

  const startPadVoice = (padId) => {
    if (activeVoices.has(padId)) {
      return;
    }

    const frequency = frequencies[padId];
    if (!Number.isFinite(frequency)) {
      return;
    }

    const voice = createVoiceBackend({ padId, frequency });
    voice.start();
    activeVoices.set(padId, voice);
  };

  const stopPadVoice = (padId) => {
    const voice = activeVoices.get(padId);
    if (!voice) {
      return;
    }

    voice.stop();
    activeVoices.delete(padId);
  };

  return {
    startPadVoice,
    stopPadVoice,
    getActiveVoiceIds: () => [...activeVoices.keys()],
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test .\scripts\synth\audio-engine.test.mjs`
Expected: PASS，2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add synth/audio-engine.js scripts/synth/audio-engine.test.mjs
git commit -m "feat: add sustained synth audio engine"
```

## Task 2：实现四点标定与坐标映射

**Files:**
- Create: `synth/projection-calibration.js`
- Test: `scripts/synth/projection-calibration.test.mjs`

- [ ] **Step 1: 写失败测试，锁定单应性映射行为**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectiveTransform,
  mapPoint,
  mapDomRectToQuad,
} from '../../synth/projection-calibration.js';

test('单位正方形映射到自身时保持坐标不变', () => {
  const transform = createProjectiveTransform({
    source: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    target: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  });

  assert.deepEqual(mapPoint(transform, { x: 0.25, y: 0.75 }), { x: 0.25, y: 0.75 });
});

test('DOM 矩形可以映射为摄像头四边形 ROI', () => {
  const transform = createProjectiveTransform({
    source: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    target: [
      { x: 20, y: 30 },
      { x: 180, y: 40 },
      { x: 170, y: 190 },
      { x: 10, y: 180 },
    ],
  });

  const quad = mapDomRectToQuad(transform, {
    left: 25,
    top: 25,
    right: 75,
    bottom: 75,
  });

  assert.equal(quad.length, 4);
  assert.ok(quad.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\projection-calibration.test.mjs`
Expected: FAIL，报错 `Cannot find module '../../synth/projection-calibration.js'`

- [ ] **Step 3: 写最小实现**

```js
const solveLinearSystem = (matrix, vector) => {
  const size = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[maxRow][pivot])) {
        maxRow = row;
      }
    }

    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    if (Math.abs(divisor) < 1e-9) {
      throw new Error('Cannot solve homography');
    }

    for (let col = pivot; col <= size; col += 1) {
      augmented[pivot][col] /= divisor;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= size; col += 1) {
        augmented[row][col] -= factor * augmented[pivot][col];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

export const createProjectiveTransform = ({ source, target }) => {
  const matrix = [];
  const vector = [];

  source.forEach((point, index) => {
    const mapped = target[index];
    matrix.push([point.x, point.y, 1, 0, 0, 0, -mapped.x * point.x, -mapped.x * point.y]);
    vector.push(mapped.x);
    matrix.push([0, 0, 0, point.x, point.y, 1, -mapped.y * point.x, -mapped.y * point.y]);
    vector.push(mapped.y);
  });

  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector);
  return { a, b, c, d, e, f, g, h };
};

export const mapPoint = (transform, point) => {
  const denominator = transform.g * point.x + transform.h * point.y + 1;
  const x = (transform.a * point.x + transform.b * point.y + transform.c) / denominator;
  const y = (transform.d * point.x + transform.e * point.y + transform.f) / denominator;
  return {
    x: Number(x.toFixed(6)),
    y: Number(y.toFixed(6)),
  };
};

export const mapDomRectToQuad = (transform, rect) => {
  return [
    mapPoint(transform, { x: rect.left, y: rect.top }),
    mapPoint(transform, { x: rect.right, y: rect.top }),
    mapPoint(transform, { x: rect.right, y: rect.bottom }),
    mapPoint(transform, { x: rect.left, y: rect.bottom }),
  ];
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test .\scripts\synth\projection-calibration.test.mjs`
Expected: PASS，2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add synth/projection-calibration.js scripts/synth/projection-calibration.test.mjs
git commit -m "feat: add projective calibration utilities"
```

## Task 3：实现 16 格占格检测与状态机

**Files:**
- Create: `synth/occupancy-detector.js`
- Test: `scripts/synth/occupancy-detector.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 baseline、进入占格、退出占格和手部抑制**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createOccupancyDetector } from '../../synth/occupancy-detector.js';

test('稳定遮挡超过 enterFrames 后进入 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 3,
    exitFrames: 2,
    enterThreshold: 10,
    exitThreshold: 4,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 1 }]);

  detector.update([
    { brightness: 30, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);
  detector.update([
    { brightness: 31, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);
  const states = detector.update([
    { brightness: 32, variance: 8, edgeDensity: 4, overlapWithHand: 0.1 },
  ]);

  assert.equal(states[0].status, 'occupied');
  assert.equal(states[0].transition, 'entered');
});

test('主要由手部造成的变化不进入 occupied', () => {
  const detector = createOccupancyDetector({
    padCount: 1,
    enterFrames: 2,
    exitFrames: 2,
    enterThreshold: 10,
    exitThreshold: 4,
    maxHandOverlap: 0.35,
  });

  detector.setBaseline([{ brightness: 10, variance: 2, edgeDensity: 1 }]);
  const states = detector.update([
    { brightness: 40, variance: 10, edgeDensity: 5, overlapWithHand: 0.8 },
  ]);

  assert.equal(states[0].status, 'empty');
  assert.equal(states[0].transition, null);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\occupancy-detector.test.mjs`
Expected: FAIL，报错 `Cannot find module '../../synth/occupancy-detector.js'`

- [ ] **Step 3: 写最小实现**

```js
const createPadState = () => ({
  status: 'empty',
  enterCount: 0,
  exitCount: 0,
  transition: null,
});

const computeScore = (baseline, sample) => {
  return (
    Math.abs(sample.brightness - baseline.brightness) +
    Math.abs(sample.variance - baseline.variance) +
    Math.abs(sample.edgeDensity - baseline.edgeDensity) * 2
  );
};

export const createOccupancyDetector = ({
  padCount,
  enterFrames,
  exitFrames,
  enterThreshold,
  exitThreshold,
  maxHandOverlap = 0.35,
}) => {
  const states = Array.from({ length: padCount }, createPadState);
  let baseline = [];

  const setBaseline = (nextBaseline) => {
    baseline = nextBaseline;
  };

  const update = (samples) => {
    return states.map((state, index) => {
      const sample = samples[index];
      const base = baseline[index];
      const score = computeScore(base, sample);
      const blockedByHand = (sample.overlapWithHand ?? 0) > maxHandOverlap;
      state.transition = null;

      if (state.status === 'empty') {
        if (!blockedByHand && score >= enterThreshold) {
          state.enterCount += 1;
          if (state.enterCount >= enterFrames) {
            state.status = 'occupied';
            state.enterCount = 0;
            state.transition = 'entered';
          }
        } else {
          state.enterCount = 0;
        }
      } else {
        if (!blockedByHand && score <= exitThreshold) {
          state.exitCount += 1;
          if (state.exitCount >= exitFrames) {
            state.status = 'empty';
            state.exitCount = 0;
            state.transition = 'exited';
          }
        } else {
          state.exitCount = 0;
        }
      }

      return {
        status: state.status,
        transition: state.transition,
        score,
      };
    });
  };

  return {
    setBaseline,
    update,
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test .\scripts\synth\occupancy-detector.test.mjs`
Expected: PASS，2 个测试通过

- [ ] **Step 5: 提交**

```bash
git add synth/occupancy-detector.js scripts/synth/occupancy-detector.test.mjs
git commit -m "feat: add occupancy detector state machine"
```

## Task 4：实现手部几何与输入路由

**Files:**
- Create: `synth/hand-math.js`
- Create: `synth/synth-router.js`
- Test: `scripts/synth/hand-math.test.mjs`
- Test: `scripts/synth/synth-router.test.mjs`

- [ ] **Step 1: 写失败测试，锁定手部区域和控件路由行为**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHandBounds,
  mapPointToSliderValue,
  mapPointToKnobAngle,
} from '../../synth/hand-math.js';
import { createSynthRouter } from '../../synth/synth-router.js';

test('手部关键点可生成外接区域', () => {
  const bounds = createHandBounds([
    { x: 10, y: 20 },
    { x: 40, y: 50 },
  ], 8);

  assert.deepEqual(bounds, { left: 2, top: 12, right: 48, bottom: 58 });
});

test('手指在滑杆底部与顶部可映射到 0 到 1', () => {
  const rect = { top: 100, bottom: 300, left: 20, right: 60 };
  assert.equal(mapPointToSliderValue({ x: 30, y: 300 }, rect), 0);
  assert.equal(mapPointToSliderValue({ x: 30, y: 100 }, rect), 1);
});

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
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\hand-math.test.mjs .\scripts\synth\synth-router.test.mjs`
Expected: FAIL，报错缺少 `hand-math.js` 和 `synth-router.js`

- [ ] **Step 3: 写最小实现**

```js
export const createHandBounds = (points, padding = 0) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: Math.min(...xs) - padding,
    top: Math.min(...ys) - padding,
    right: Math.max(...xs) + padding,
    bottom: Math.max(...ys) + padding,
  };
};

export const mapPointToSliderValue = (point, rect) => {
  const ratio = (rect.bottom - point.y) / (rect.bottom - rect.top);
  return Math.max(0, Math.min(1, Number(ratio.toFixed(4))));
};

export const mapPointToKnobAngle = (point, rect) => {
  const centerX = (rect.left + rect.right) / 2;
  const centerY = (rect.top + rect.bottom) / 2;
  return Math.atan2(point.y - centerY, point.x - centerX);
};
```

```js
export const createSynthRouter = ({ audioEngine, uiControls }) => {
  return {
    applyOccupancyStates(states) {
      states.forEach((state, index) => {
        if (state.transition === 'entered') {
          audioEngine.startPadVoice(index);
        }
        if (state.transition === 'exited') {
          audioEngine.stopPadVoice(index);
        }
      });
    },
    applyHandInput({ knobAngle, sliders }) {
      if (Number.isFinite(knobAngle)) {
        uiControls.setKnobAngle(knobAngle);
      }
      Object.entries(sliders).forEach(([key, value]) => {
        uiControls.setSliderValue(key, value);
      });
    },
  };
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test .\scripts\synth\hand-math.test.mjs .\scripts\synth\synth-router.test.mjs`
Expected: PASS，全部测试通过

- [ ] **Step 5: 提交**

```bash
git add synth/hand-math.js synth/synth-router.js scripts/synth/hand-math.test.mjs scripts/synth/synth-router.test.mjs
git commit -m "feat: add hand math helpers and synth router"
```

## Task 5：抽离 UI 控制层并把最终展示页改成模块入口

**Files:**
- Create: `synth/ui-controls.js`
- Create: `synth/app.js`
- Modify: `synthesizer.html`
- Modify: `scripts/synthesizer-pad-count.test.mjs`

- [ ] **Step 1: 写失败测试，锁定模块入口和调试层容器**

```js
test('最终展示页包含模块入口和调试层容器', () => {
  assert.match(html, /<script type="module" src="\.\/synth\/app\.js\?v=20260426-projection-runtime"><\/script>/);
  assert.match(html, /id="synth-camera-preview"/);
  assert.match(html, /id="synth-debug-canvas"/);
  assert.match(html, /id="synth-calibration-layer"/);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node .\scripts\synthesizer-pad-count.test.mjs`
Expected: FAIL，报错缺少模块入口和调试层 DOM

- [ ] **Step 3: 写最小实现**

在 `synthesizer.html` 的控制台容器末尾加入：

```html
<div id="synth-calibration-layer" class="pointer-events-none absolute inset-0 z-20"></div>
<canvas id="synth-debug-canvas" class="pointer-events-none absolute inset-0 z-30"></canvas>
<video id="synth-camera-preview" class="hidden" playsinline muted></video>
```

把当前内联 `<script>` 替换为：

```html
<script type="module" src="./synth/app.js?v=20260426-projection-runtime"></script>
```

创建 `synth/ui-controls.js`：

```js
export const createUiControls = (root = document) => {
  const knob = root.querySelector('#knob');
  const sliderTracks = new Map(
    [...root.querySelectorAll('.slider-track')].map((element) => [element.dataset.param, element]),
  );

  return {
    getPadElements: () => [...root.querySelectorAll('.pad-btn')],
    getKnobRect: () => knob.getBoundingClientRect(),
    getSliderRect: (key) => sliderTracks.get(key)?.getBoundingClientRect() ?? null,
    setKnobAngle: (angleInRadians) => {
      knob.style.transform = `rotate(${Math.round((angleInRadians * 180) / Math.PI)}deg)`;
    },
    setSliderValue: (key, value) => {
      const track = sliderTracks.get(key);
      if (!track) return;
      const fill = track.querySelector('.slider-fill');
      const thumb = track.querySelector('.slider-thumb');
      const display = track.querySelector('.slider-value');
      const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
      fill.style.height = `${percent}%`;
      thumb.style.bottom = `calc(${percent}% - 6px)`;
      display.textContent = String(percent);
    },
  };
};
```

创建最小 `synth/app.js`，避免模块入口落地后页面直接报错：

```js
import { createUiControls } from './ui-controls.js';

const uiControls = createUiControls(document);

window.synthRuntime = {
  uiControls,
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node .\scripts\synthesizer-pad-count.test.mjs`
Expected: PASS，原有测试和新增 DOM smoke test 一起通过

- [ ] **Step 5: 提交**

```bash
git add synthesizer.html synth/ui-controls.js synth/app.js scripts/synthesizer-pad-count.test.mjs
git commit -m "refactor: switch synth page to module shell"
```

## Task 6：接入摄像头、MediaPipe 和调试层

**Files:**
- Create: `synth/camera-controller.js`
- Create: `synth/hand-controller.js`
- Create: `synth/debug-overlay.js`
- Modify: `synth/app.js`
- Test: `scripts/synth/hand-controller.test.mjs`

- [ ] **Step 1: 写失败测试，锁定手部控制器对外接口**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandController } from '../../synth/hand-controller.js';

test('hand controller 会把 detectForVideo 结果转换成简化手部状态', async () => {
  const controller = createHandController({
    createLandmarker: async () => ({
      detectForVideo() {
        return {
          landmarks: [[
            { x: 0.2, y: 0.3 },
            { x: 0.3, y: 0.4 },
          ]],
          handednesses: [[{ categoryName: 'Right' }]],
        };
      },
    }),
  });

  await controller.start({
    video: { currentTime: 1 },
    now: 1000,
  });

  const state = controller.detect({
    video: { currentTime: 2 },
    now: 1033,
  });

  assert.equal(state.active, true);
  assert.equal(state.handedness, 'Right');
  assert.equal(state.points.length, 2);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\hand-controller.test.mjs`
Expected: FAIL，报错缺少 `hand-controller.js`

- [ ] **Step 3: 写最小实现**

`synth/camera-controller.js`

```js
export const createCameraController = ({ videoElement, width = 960, height = 540 }) => {
  let stream = null;

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });

      videoElement.srcObject = stream;
      await videoElement.play().catch(() => undefined);
      return stream;
    },
    stop() {
      stream?.getTracks().forEach((track) => track.stop());
      videoElement.srcObject = null;
      stream = null;
    },
  };
};
```

`synth/hand-controller.js`

```js
const defaultCreateLandmarker = async () => {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
  );

  return vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });
};

export const createHandController = ({ createLandmarker = defaultCreateLandmarker } = {}) => {
  let handLandmarker = null;

  return {
    async start() {
      handLandmarker = await createLandmarker();
    },
    detect({ video, now }) {
      const result = handLandmarker.detectForVideo(video, now);
      const points = result.landmarks?.[0] ?? [];
      const handedness = result.handednesses?.[0]?.[0]?.categoryName ?? 'Unknown';

      return {
        active: points.length > 0,
        handedness,
        points,
      };
    },
  };
};
```

`synth/debug-overlay.js`

```js
export const createDebugOverlay = ({ canvas }) => {
  const context = canvas.getContext('2d');

  return {
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    render({ rois = [], occupied = [], calibrationPoints = [] }) {
      context.clearRect(0, 0, canvas.width, canvas.height);

      calibrationPoints.forEach((point) => {
        context.fillStyle = '#ffd2ad';
        context.beginPath();
        context.arc(point.x, point.y, 6, 0, Math.PI * 2);
        context.fill();
      });

      rois.forEach((roi, index) => {
        context.strokeStyle = occupied[index] ? '#ff5d3f' : '#5ed6d0';
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(roi[0].x, roi[0].y);
        roi.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.closePath();
        context.stroke();
      });
    },
  };
};
```

`synth/app.js`

```js
import { createAudioEngine } from './audio-engine.js';
import { createCameraController } from './camera-controller.js';
import { createDebugOverlay } from './debug-overlay.js';
import { createHandController } from './hand-controller.js';
import { createUiControls } from './ui-controls.js';

const frequencies = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5, 1174.66];
const uiControls = createUiControls(document);
const cameraPreview = document.querySelector('#synth-camera-preview');
const debugCanvas = document.querySelector('#synth-debug-canvas');

const cameraController = createCameraController({ videoElement: cameraPreview });
const handController = createHandController();
const debugOverlay = createDebugOverlay({ canvas: debugCanvas });
const audioEngine = createAudioEngine({
  frequencies,
  createVoiceBackend: ({ frequency }) => ({
    start() {
      console.log('voice:start', frequency);
    },
    stop() {
      console.log('voice:stop', frequency);
    },
  }),
});

window.synthRuntime = {
  uiControls,
  cameraController,
  handController,
  debugOverlay,
  audioEngine,
};
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test .\scripts\synth\hand-controller.test.mjs`
Expected: PASS，手部控制器接口测试通过

- [ ] **Step 5: 提交**

```bash
git add synth/camera-controller.js synth/hand-controller.js synth/debug-overlay.js synth/app.js scripts/synth/hand-controller.test.mjs
git commit -m "feat: add camera, hand tracking, and debug runtime modules"
```

## Task 7：把占格、手部、声音和页面真正接通

**Files:**
- Modify: `synth/audio-engine.js`
- Modify: `synth/app.js`
- Modify: `synth/ui-controls.js`
- Modify: `synth/projection-calibration.js`
- Modify: `synth/occupancy-detector.js`
- Modify: `synth/synth-router.js`
- Modify: `synthesizer.html`

- [ ] **Step 1: 写失败测试，锁定占格进入 / 退出会真实驱动 router**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSynthRouter } from '../../synth/synth-router.js';

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
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\synth-router.test.mjs`
Expected: FAIL，当前 `applyOccupancyStates` 不支持同帧多 pad 边沿处理或与真实 app 不一致

- [ ] **Step 3: 写最小实现**

把 `synth/app.js` 替换为真正串联运行时的版本：

```js
import { createAudioEngine } from './audio-engine.js';
import { createCameraController } from './camera-controller.js';
import { createDebugOverlay } from './debug-overlay.js';
import { createHandController } from './hand-controller.js';
import { createHandBounds, mapPointToKnobAngle, mapPointToSliderValue } from './hand-math.js';
import { createOccupancyDetector } from './occupancy-detector.js';
import { createProjectiveTransform, mapDomRectToQuad } from './projection-calibration.js';
import { createSynthRouter } from './synth-router.js';
import { createUiControls } from './ui-controls.js';

const frequencies = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5, 1174.66];
const uiControls = createUiControls(document);
const cameraPreview = document.querySelector('#synth-camera-preview');
const debugCanvas = document.querySelector('#synth-debug-canvas');

const audioEngine = createAudioEngine({
  frequencies,
  createVoiceBackend: ({ frequency }) => createBrowserVoiceBackend({ frequency }),
});
const cameraController = createCameraController({ videoElement: cameraPreview });
const handController = createHandController();
const debugOverlay = createDebugOverlay({ canvas: debugCanvas });
const occupancyDetector = createOccupancyDetector({
  padCount: 16,
  enterFrames: 10,
  exitFrames: 8,
  enterThreshold: 10,
  exitThreshold: 4,
});
const router = createSynthRouter({ audioEngine, uiControls });

const analysisCanvas = document.createElement('canvas');
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });

const computeFeatureForQuad = (video, quad, handBounds) => {
  const xs = quad.map((point) => point.x);
  const ys = quad.map((point) => point.y);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const width = Math.max(8, Math.ceil(Math.max(...xs) - left));
  const height = Math.max(8, Math.ceil(Math.max(...ys) - top));

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisContext.drawImage(video, left, top, width, height, 0, 0, width, height);

  const { data } = analysisContext.getImageData(0, 0, width, height);
  let brightnessSum = 0;
  let brightnessSquareSum = 0;
  let edgeHits = 0;

  for (let index = 0; index < data.length; index += 4) {
    const brightness = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    brightnessSum += brightness;
    brightnessSquareSum += brightness * brightness;
    if (index >= 4 && Math.abs(brightness - (data[index - 4] * 0.299 + data[index - 3] * 0.587 + data[index - 2] * 0.114)) > 18) {
      edgeHits += 1;
    }
  }

  const pixelCount = data.length / 4;
  const meanBrightness = brightnessSum / pixelCount;
  const variance = brightnessSquareSum / pixelCount - meanBrightness * meanBrightness;
  const edgeDensity = edgeHits / pixelCount;

  const overlapWithHand = !handBounds
    ? 0
    : Math.max(
        0,
        Math.min(handBounds.right, left + width) - Math.max(handBounds.left, left),
      ) *
        Math.max(
          0,
          Math.min(handBounds.bottom, top + height) - Math.max(handBounds.top, top),
        ) /
      (width * height);

  return {
    brightness: Number(meanBrightness.toFixed(4)),
    variance: Number(variance.toFixed(4)),
    edgeDensity: Number(edgeDensity.toFixed(4)),
    overlapWithHand: Number(overlapWithHand.toFixed(4)),
  };
};

const samplePadFeatures = (video, rois, handBounds) => {
  return rois.map((quad) => computeFeatureForQuad(video, quad, handBounds));
};

const bootstrap = async () => {
  await cameraController.start();
  await handController.start();

  const calibration = createProjectiveTransform({
    source: [
      { x: 0, y: 0 },
      { x: window.innerWidth, y: 0 },
      { x: window.innerWidth, y: window.innerHeight },
      { x: 0, y: window.innerHeight },
    ],
    target: [
      { x: 0, y: 0 },
      { x: cameraPreview.videoWidth, y: 0 },
      { x: cameraPreview.videoWidth, y: cameraPreview.videoHeight },
      { x: 0, y: cameraPreview.videoHeight },
    ],
  });

  const rois = uiControls.getPadElements().map((element) =>
    mapDomRectToQuad(calibration, element.getBoundingClientRect()),
  );

  occupancyDetector.setBaseline(
    rois.map(() => ({ brightness: 10, variance: 2, edgeDensity: 1 })),
  );

  const loop = (now) => {
    const handState = handController.detect({ video: cameraPreview, now });
    const handBounds = handState.active ? createHandBounds(handState.points, 24) : null;
    const occupancyStates = occupancyDetector.update(samplePadFeatures(cameraPreview, rois, handBounds));

    router.applyOccupancyStates(occupancyStates);

    if (handState.active) {
      const indexFinger = handState.points[1] ?? handState.points[0];
      router.applyHandInput({
        knobAngle: mapPointToKnobAngle(indexFinger, uiControls.getKnobRect()),
        sliders: {
          volume: mapPointToSliderValue(indexFinger, uiControls.getSliderRect('volume')),
        },
      });
    }

    debugOverlay.resize(window.innerWidth, window.innerHeight);
    debugOverlay.render({
      rois,
      occupied: occupancyStates.map((state) => state.status === 'occupied'),
      calibrationPoints: [],
    });

    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};

bootstrap().catch((error) => {
  console.error(error);
});
```

同时把 `audio-engine.js` 补成真实浏览器后端：

```js
const createBrowserVoiceBackend = ({ frequency }) => {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'sawtooth';
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.12;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  return {
    start() {
      oscillator.start();
    },
    stop() {
      gain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.08);
      oscillator.stop(audioContext.currentTime + 0.12);
    },
  };
};
```

- [ ] **Step 4: 运行 smoke 验证**

Run:

```bash
node .\scripts\synthesizer-pad-count.test.mjs
node --test .\scripts\synth\audio-engine.test.mjs .\scripts\synth\projection-calibration.test.mjs .\scripts\synth\occupancy-detector.test.mjs .\scripts\synth\hand-math.test.mjs .\scripts\synth\synth-router.test.mjs .\scripts\synth\hand-controller.test.mjs
```

Expected:

- 全部 PASS
- 浏览器打开 `http://127.0.0.1:4173/` 后，第三段结束进入最终页时，控制台无模块加载报错

- [ ] **Step 5: 提交**

```bash
git add synth/audio-engine.js synth/app.js synth/ui-controls.js synth/projection-calibration.js synth/occupancy-detector.js synth/synth-router.js synthesizer.html
git commit -m "feat: wire projection synth camera, hand, and occupancy runtime"
```

## Task 8：更新上下文文档并完成现场验证清单

**Files:**
- Modify: `docs/ai/context/projection-table-laptop-camera-synth-design.md`
- Modify: `docs/ai/context/projection-table-mediapipe-occupancy-evaluation.md`
- Modify: `AGENTS.md`
- Create: `docs/ai/context/projection-table-laptop-camera-synth-verification.md`
- Test: `scripts/synth/projection-doc-smoke.test.mjs`

- [ ] **Step 1: 写失败 smoke 检查，要求文档同步实现事实**

```js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const designDoc = readFileSync(new URL('../../docs/ai/context/projection-table-laptop-camera-synth-design.md', import.meta.url), 'utf8');

test('设计文档记录了手动四点标定与 occupied 边沿语义', () => {
  assert.match(designDoc, /手动四点标定/);
  assert.match(designDoc, /empty -> occupied/);
  assert.match(designDoc, /occupied -> empty/);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test .\scripts\synth\projection-doc-smoke.test.mjs`
Expected: FAIL，报错缺少 `projection-doc-smoke.test.mjs`

- [ ] **Step 3: 写最小实现**

`docs/ai/context/projection-table-laptop-camera-synth-verification.md`

```md
# 桌面投影合成器现场验证

## 启动前

- 内置摄像头能拍到整张投影桌面
- 浏览器在 `localhost` 打开页面
- 桌面初始 16 格为空

## 标定

- 4 个角点点击顺序正确
- 标定完成后 ROI 与 16 个格子对齐

## 占格

- 任一格放入方块后 300-500ms 内开始发声
- 移开后 300-500ms 内停止发声
- 手经过格子上方时不应频繁误触发

## 手部

- `VIBE` 可调
- `VOL / REV / POS` 可调
```

创建 `scripts/synth/projection-doc-smoke.test.mjs`：

```js
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const designDoc = readFileSync(new URL('../../docs/ai/context/projection-table-laptop-camera-synth-design.md', import.meta.url), 'utf8');
const verificationDoc = readFileSync(new URL('../../docs/ai/context/projection-table-laptop-camera-synth-verification.md', import.meta.url), 'utf8');

test('设计文档记录了手动四点标定与 occupied 边沿语义', () => {
  assert.match(designDoc, /手动四点标定/);
  assert.match(designDoc, /empty -> occupied/);
  assert.match(designDoc, /occupied -> empty/);
});

test('验证文档包含标定、占格与手部检查项', () => {
  assert.match(verificationDoc, /## 标定/);
  assert.match(verificationDoc, /## 占格/);
  assert.match(verificationDoc, /## 手部/);
});
```

在 `AGENTS.md` 新增：

```md
- 当前桌面投影实现计划已确认按模块拆分：`audio-engine`、`projection-calibration`、`occupancy-detector`、`hand-controller`、`synth-router`、`debug-overlay`
- 当前桌面投影现场验证基线已确认：一次标定进入运行态、方块放入 300-500ms 内开始发声、移开 300-500ms 内停止发声、手部可稳定调节 `VIBE / VOL / REV / POS`
```

在 `docs/ai/context/projection-table-laptop-camera-synth-design.md` 末尾新增：

```md
## 实现计划状态

- 已生成实现计划文档：`docs/ai/context/2026-04-26-projection-table-laptop-camera-synth-implementation-plan.md`
- 实现将按 TDD 顺序推进：声音生命周期、标定、占格检测、手部几何、路由、页面接入、现场验证
```

在 `docs/ai/context/projection-table-mediapipe-occupancy-evaluation.md` 末尾新增：

```md
## 实施备注

- 已确认第一版实现继续采用 `ROI 占格检测 + MediaPipe 手部调控`
- 已确认实现计划中保留调试层与现场验证清单，不以“完全免调试”作为第一版目标
```

- [ ] **Step 4: 运行文档 smoke 检查**

Run:

```bash
node --test .\scripts\synth\projection-doc-smoke.test.mjs
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add docs/ai/context/projection-table-laptop-camera-synth-design.md docs/ai/context/projection-table-mediapipe-occupancy-evaluation.md docs/ai/context/projection-table-laptop-camera-synth-verification.md AGENTS.md scripts/synth/projection-doc-smoke.test.mjs
git commit -m "docs: add projection synth verification checklist"
```

## 自检

### Spec 覆盖检查

- 只用内置摄像头：Task 6 接入 `camera-controller`
- 手动四点标定：Task 2 与 Task 7
- 16 格占格检测：Task 3 与 Task 7
- 手部调控旋钮 / 滑杆：Task 4 与 Task 7
- `empty -> occupied` 开声、`occupied -> empty` 停声：Task 1、Task 4、Task 7
- 调试层：Task 5 与 Task 6
- 文档与现场验证：Task 8

### Placeholder 扫描

- 计划中没有 `TODO`、`TBD`、`implement later`
- 每个任务都给了明确文件路径、测试命令和提交点
- 所有需要新建的运行时模块都已命名

### 类型与命名一致性

- `startPadVoice` / `stopPadVoice` 在 Task 1、Task 4、Task 7 保持一致
- `createProjectiveTransform` / `mapDomRectToQuad` 在 Task 2、Task 7 保持一致
- `createOccupancyDetector` 在 Task 3、Task 7 保持一致
- `createSynthRouter` 在 Task 4、Task 7 保持一致
