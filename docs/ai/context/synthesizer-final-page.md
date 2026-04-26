# 最终合成器页

## 当前实现

- 最终展示页文件是 `synthesizer.html`
- 主时间轴第三段视频结束后，通过全屏 `iframe` 显示该页面
- 页面右侧触发按钮已从 `3x3` 扩展为 `4x4`
- 当前触发按钮总数为 16 个
- 每个按钮都有独立音高，音高数组与按钮数量保持一致
- 16 个按钮已按从左到右、从上到下顺序叠加 `pic/1.png` 到 `pic/16.png`
- 按钮图案使用低透明度印在格子上，当前透明度标记为 `opacity-[0.34]`
- 最终展示页已改成暗红舞台风格：黑红烟雾背景、旧金属控制台、暗红屏幕和低饱和按钮光泽
- 当前只改视觉元素层，不改按钮点击逻辑、音高数组和播放器时间轴逻辑
- 当前占格 ROI 在完成四点标定后生成，运行循环不再每帧重算 ROI
- 当前 ROI 采样使用四边形 mask，只统计透视四边形内部像素，不再直接统计轴对齐包围盒全部像素
- 当前 16 个按钮已从单纯音高数组升级为 16 个 Strudel 风格音效预设，定义在 `synth/sound-presets.js`
- 当前按钮音效顺序为：`bd`、`sd`、`hh`、`cp`、`rim`、`tom`、`perc`、`sub`、`bass`、`pluck`、`arp`、`acid`、`fm`、`noise`、`glass`、`pad`
- 当前音频引擎仍使用 WebAudio 自建合成，不直接引入 `@strudel/web`
- 当前 `VIBE / VOL / REV / POS` 继续作用于 16 个按钮音效，按钮按住和占格发声逻辑不变

## 取舍

- 当前只调整按钮矩阵，不引入前端框架或构建链路，原因是该页面仍是独立静态展示页
- 保留静态 HTML 按钮而不是运行时生成，原因是当前页面结构简单，现场查看源码和测试数量都更直接
- `gap` 从 `gap-5` 调整为 `gap-4`，原因是 `4x4` 下需要给 16 个按钮留出更稳定的显示空间
- 贴图直接作为按钮内部的 `<img>`，并设置 `pointer-events-none`，原因是要避免图案遮挡原按钮点击事件
- 暗红舞台风格通过 `club-stage`、`stage-console`、`stage-panel`、`stage-pad` 等样式类完成，原因是要把视觉改动和现有脚本逻辑隔离
- pad 激活态不再修改按钮 `transform`，原因是要避免展示状态影响 `getBoundingClientRect()` 并污染 ROI 几何
- ROI 采样先采用 mask 而不是完整透视 warp，原因是第一版需要先消除串格误判，mask 改动更小且足够覆盖当前占格检测
- 这次没有直接接入 Strudel runtime，原因是当前页面需要“占格持续发声，移开停止”的实时控制，而 Strudel 更偏向 pattern 调度；引入 runtime 和默认样本会增加外部依赖、加载不确定性和授权复杂度
- `synth/audio-engine.js` 保留 `frequencies` 兼容输入，并新增 `padSounds` 输入，原因是旧测试和旧调用仍能按音高工作，新按钮可以按索引拿到完整音色预设

## 验证

- 新增 `scripts/synthesizer-pad-count.test.mjs`
- 该测试检查：
  - 页面存在 16 个 `.pad-btn` 按钮
  - 网格类为 `grid-cols-4` 与 `grid-rows-4`
  - 16 个按钮按顺序引用 `pic/1.png` 到 `pic/16.png`
  - 每个按钮图案都带 `pad-symbol` 和 `opacity-[0.34]`
  - 页面包含暗红舞台风格标记
  - `freqs` 音高数组长度为 16
- 新增 `scripts/synth/roi-sampling.test.mjs`
- 新增 `scripts/synth/ui-controls.test.mjs`
- 两个测试分别检查四边形 ROI 不统计包围盒角落像素、pad 激活态不修改按钮 `transform`
- 新增 `scripts/synth-audio-engine.test.mjs`
- 该测试检查：
  - 音频引擎会把按钮索引对应的 `padSounds` 预设传给声音后端
  - 最终展示页提供 16 个 Strudel 风格按钮音效
- 当前验证命令：
  `node --test scripts/synthesizer-pad-count.test.mjs scripts/synth/*.test.mjs`
- 当前音效映射验证命令：
  `node --no-warnings --test scripts/synth-audio-engine.test.mjs`
