# 最终合成器页

## 当前实现

- 最终展示页文件是 `synthesizer.html`
- 主时间轴第三段视频结束后，通过全屏 `iframe` 显示该页面
- 页面右侧触发按钮已从 `3x3` 扩展为 `4x4`
- 当前触发按钮总数为 16 个
- 16 个按钮已按从左到右、从上到下顺序叠加 `pic/1.png` 到 `pic/16.png`
- 按钮图案使用低透明度印在格子上，当前透明度标记为 `opacity-[0.34]`
- 最终展示页已改成暗红舞台风格：黑红烟雾背景、旧金属控制台、暗红屏幕和低饱和按钮光泽
- 当前最终展示页已切换为真实 Strudel runtime，运行时入口是 `synth/strudel-browser.js`
- 当前页面已新增最小 npm 工程，使用 `Vite + @strudel/web`
- 当前摄像头主预览已移出控制台，改为页面右下角独立悬浮监视器，原因是控制台内空间不足，容易遮住旋钮和滑杆区
- 当前标定状态与控制按钮继续压在摄像头画面上的轻量覆盖层中，原因是要保留现场调试能力，同时不占控制台主操作区
- 当前右下角标定预览四角会显示 `1 / 2 / 3 / 4` 小黄点，对应 `左上 / 右上 / 右下 / 左下`，并随标定进度区分当前点、已完成点和待点击点
- 当前左侧控制列只保留 `VIBE` 旋钮和 `VOL / REV / POS` 滑杆，原因是控制台主操作区应稳定可见，不再与摄像头预览共用纵向空间
- 当前右下角摄像头浮层必须保持“视频层 < ROI 调试层 < 标定按钮层”的层级关系，原因是摄像头启动后按钮仍需可见可点
- 当前标定覆盖层除按钮区外必须允许点击穿透到摄像头预览，原因是四角标定依赖直接点击预览画面，不能再被整层遮挡
- 当前摄像头调试监视器已改为全屏固定覆盖层，直接压在电子合成器页面之上
- 当前全屏摄像头覆盖层默认保持半透明，原因是用户需要一边看摄像头中的真实投影，一边看下方 HTML 合成器做对位
- 当前第三页已切换为“右手食指单指交互”模式：只识别 `Right` handedness，并仅使用 `landmark 8` 食指指尖作为唯一控制点
- 当前第三页手部识别仍基于 `MediaPipe Hand Landmarker`，但启动参数已固定为 `numHands: 1`
- 当前第三页手部检测已加入约 `24fps` 节流：同一视频帧或最小检测间隔内直接复用上次结果，不再对每个 `requestAnimationFrame` 都重新推理
- 当前最终合成器页右下角已新增独立手部关节预览小窗，复用主摄像头流并叠加骨架描边，原因是需要与前两个交互场景保持一致的现场识别确认方式
- 当前右下角手部预览只绘制食指相关关节 `5 / 6 / 7 / 8`，不再绘制整只手骨架，原因是第三页只验证单指触发链路
- 当前右侧 16 格不再使用 ROI 差分或空场 baseline；手指进入格子后稳定停留数帧才算一次点击，并按点击切换 pad 开关
- 当前左侧 `VIBE / VOL / REV / POS` 继续通过右手食指在控件区域内拖动映射
- 当前对位模式只用于调整摄像头与自动触发图，不允许直接发声；运行模式才允许右手食指点击和拖动
- 当前“采集空场”按钮已停用并隐藏，避免继续沿用旧 ROI 流程
- 当前最终合成器页已改为“自动触发图”主流程：直接读取真实 HTML 控件位置，自动生成控制台外框、16 个 pad、`VIBE / VOL / REV / POS` 的覆盖框
- 当前自动触发图按“页面视口坐标 -> 摄像头视频像素坐标”的线性比例映射生成 ROI，适用于摄像头正对屏幕的现场对位方案
- 当前第三页命中检测、控件拖动和调试描边都会优先读取自动触发图派生几何
- 当前手工布局模式保留在代码中但已降级为历史实验，不再作为默认对位方案
- 当前最终合成器页已拆为 `对位模式 / 运行模式`
- 对位模式下显示半透明摄像头回显和自动触发图，只用于调整机位与投影对齐
- 运行模式下隐藏摄像头回显、触发图和调试覆盖层，但后台摄像头采样与右手食指识别继续运行
- 当前旋钮四档映射为 `warm / bright / cold / dark`
- 当前 16 格按从左到右、从上到下映射到 Strudel pattern，其中 `(3,4)` 留空，不绑定任何循环
- 当前 16 格由点击切换开关，不再走“按住/占格持续检测”；发声仍由真实 Strudel `stack(...)` 驱动
- 当前 `VOL / REV / POS` 会作为全局 `.gain() / .room() / .pan()` 作用于最终 Strudel 组合
- 当前鼓组 sample 通过 `samples('github:tidalcycles/dirt-samples')` 预加载

## 取舍

- 当前只引入 `Vite` 作为最小 bundler，不引入前端框架，原因是页面仍是独立静态展示页，只是 Strudel runtime 需要 npm 依赖解析
- 保留静态 HTML 按钮而不是运行时生成，原因是当前页面结构简单，现场查看源码和测试数量都更直接
- `gap` 从 `gap-5` 调整为 `gap-4`，原因是 `4x4` 下需要给 16 个按钮留出更稳定的显示空间
- 贴图直接作为按钮内部的 `<img>`，并设置 `pointer-events-none`，原因是要避免图案遮挡原按钮点击事件
- 暗红舞台风格通过 `club-stage`、`stage-console`、`stage-panel`、`stage-pad` 等样式类完成，原因是要把视觉改动和现有脚本逻辑隔离
- pad 激活态不再修改按钮 `transform`，原因是要避免展示状态影响 `getBoundingClientRect()` 并污染 ROI 几何
- 16 格点击命中继续复用自动触发图几何而不是直接读 DOM 绝对位置，原因是摄像头画面与页面坐标之间仍需要一层视频空间映射
- pad 点击采用“稳定停留数帧后触发一次”的状态机，原因是单纯按进入边沿切换过于敏感，手指掠过时容易误触
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
- 新增 `scripts/synth/hand-preview-ui.test.mjs`
- 新增 `scripts/synth/finger-pad-trigger.test.mjs`
- 新增 `scripts/synth/finger-only-flow.test.mjs`
- 两个测试分别检查四边形 ROI 不统计包围盒角落像素、pad 激活态不修改按钮 `transform`
- 手部预览测试检查第三页页面已挂载 `synth-hand-preview-panel / video / overlay`，并且 `synth/app.js` 已接入 `renderHandPreview`
- 食指点击状态机测试检查：同一格稳定停留达到阈值后才触发、离开后可再次触发、快速掠过不会误触
- 手势链路测试检查：第三页 `app.js` 不再接入 ROI detector / baseline 采集，并改为 `createFingerPadTrigger`
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
