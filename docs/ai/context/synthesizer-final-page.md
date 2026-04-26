# 最终合成器页

## 当前实现

- 最终展示页文件是 `synthesizer.html`
- 主时间轴第三段视频结束后，通过全屏 `iframe` 显示该页面
- 页面右侧触发按钮已从 `3x3` 扩展为 `4x4`
- 当前触发按钮总数为 16 个
- 16 个按钮已按从左到右、从上到下顺序叠加 `pic/1.png` 到 `pic/16.png`
- 按钮图案使用低透明度印在格子上，当前透明度标记为 `opacity-[0.34]`
- 最终展示页已改成暗红舞台风格：黑红烟雾背景、旧金属控制台、暗红屏幕和低饱和按钮光泽
- 当前占格 ROI 在完成四点标定后生成，运行循环不再每帧重算 ROI
- 当前 ROI 采样使用四边形 mask，只统计透视四边形内部像素，不再直接统计轴对齐包围盒全部像素
- 当前最终展示页已切换为真实 Strudel runtime，运行时入口是 `synth/strudel-browser.js`
- 当前页面已新增最小 npm 工程，使用 `Vite + @strudel/web`
- 当前摄像头主预览已移入控制台左上角固定监视器位，不再使用右下角悬浮小窗
- 当前标定状态与控制按钮已压缩为摄像头画面上的轻量覆盖层，原因是要保留现场调试能力，但不再让大块说明文字遮挡控制台
- 当前旋钮四档映射为 `warm / bright / cold / dark`
- 当前 16 格按从左到右、从上到下映射到 Strudel pattern，其中 `(3,4)` 留空，不绑定任何循环
- 当前按钮按住和占格检测都不再走自建 pad 音色，而是生成并执行真实 Strudel `stack(...)`
- 当前 `VOL / REV / POS` 会作为全局 `.gain() / .room() / .pan()` 作用于最终 Strudel 组合
- 当前鼓组 sample 通过 `samples('github:tidalcycles/dirt-samples')` 预加载

## 取舍

- 当前只引入 `Vite` 作为最小 bundler，不引入前端框架，原因是页面仍是独立静态展示页，只是 Strudel runtime 需要 npm 依赖解析
- 保留静态 HTML 按钮而不是运行时生成，原因是当前页面结构简单，现场查看源码和测试数量都更直接
- `gap` 从 `gap-5` 调整为 `gap-4`，原因是 `4x4` 下需要给 16 个按钮留出更稳定的显示空间
- 贴图直接作为按钮内部的 `<img>`，并设置 `pointer-events-none`，原因是要避免图案遮挡原按钮点击事件
- 暗红舞台风格通过 `club-stage`、`stage-console`、`stage-panel`、`stage-pad` 等样式类完成，原因是要把视觉改动和现有脚本逻辑隔离
- pad 激活态不再修改按钮 `transform`，原因是要避免展示状态影响 `getBoundingClientRect()` 并污染 ROI 几何
- ROI 采样先采用 mask 而不是完整透视 warp，原因是第一版需要先消除串格误判，mask 改动更小且足够覆盖当前占格检测
- Strudel 运行时采用“状态变化时重建最终 `stack(...)` 并重新 evaluate”策略，原因是第一版重点是稳定映射旋钮与占格，而不是保留每一层完全独立的相位连续性
- `synth/audio-engine.js` 当前只保留控件默认值和旋钮档位映射，页面主发声职责已移交给 Strudel runtime
- 运行时拆成 `synth/strudel-score.js`、`synth/strudel-runtime.js`、`synth/strudel-browser.js` 三层，原因是要把源码定义、纯状态逻辑和浏览器依赖分开，保证 Node 测试可跑

## 验证

- 新增 `scripts/synthesizer-pad-count.test.mjs`
- 该测试检查：
  - 页面存在 16 个 `.pad-btn` 按钮
  - 网格类为 `grid-cols-4` 与 `grid-rows-4`
  - 16 个按钮按顺序引用 `pic/1.png` 到 `pic/16.png`
  - 每个按钮图案都带 `pad-symbol` 和 `opacity-[0.34]`
  - 页面包含暗红舞台风格标记
  - 页面主脚本已切到 Strudel grid 映射
- 新增 `scripts/synth/roi-sampling.test.mjs`
- 新增 `scripts/synth/ui-controls.test.mjs`
- 两个测试分别检查四边形 ROI 不统计包围盒角落像素、pad 激活态不修改按钮 `transform`
- 新增 `scripts/strudel-runtime-state.test.mjs`
- 该测试检查：
  - 旋钮四档映射为 `warm / bright / cold / dark`
  - 16 格按 `4x4` 坐标映射到 Strudel pattern，`(3,4)` 留空
  - 最终 Strudel 组合代码会带上全局 `gain / room / pan`
  - 运行时控制器会在占格变化时切换 `evaluate / hush`
- 当前验证命令：
  `npm test`
- 当前构建验证命令：
  `npm run build`
