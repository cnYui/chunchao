# 2026-04-28 项目正式重构起点

## 本次目标

- 清理 `video/` 中未被代码使用的视频文件
- 开始把原型期硬编码配置从 `main.js` 中拆出
- 第一阶段只处理视频时间轴配置，不改变播放、交互、粒子和合成器行为

## 已确认保留的视频

- `video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4`
- `video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4`
- `video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4`

## 已删除的视频

- `video/0baa12eb2ae33a003c103a1a1a269781_raw.mp4`
- `video/33bf26e484a3a504099f10ecbd2e8c13.mp4`
- `video/33bf26e484a3a504099f10ecbd2e8c13_part1.mp4`
- `video/33bf26e484a3a504099f10ecbd2e8c13_part2.mp4`
- `video/33bf26e484a3a504099f10ecbd2e8c13_part3.mp4`
- `video/7b8e95fe6e49261b02e7e7d8c41b8601_raw.mp4`
- `video/ab039202842864c33ee0cfe180f29e57_raw.mp4`

## 第一阶段重构决策

- 新增 `timeline-config.js`，集中维护 `videoSegments` 和 `interactionTimeline`
- `main.js` 继续负责时间轴运行状态和 DOM 切换，但不再直接声明三段视频数组
- 视频地址通过 `new URL(..., import.meta.url).href` 生成，原因是 Vite 构建需要静态识别三段 mp4 资产，否则只会打包 HTML 中直接引用的第一段视频
- `index.html` 不再硬编码第一段视频 `src`，入口视频源由 `main.js` 按 `timeline-config.js` 初始化
- 新增 `scripts/timeline-config.test.mjs`，锁定当前三段视频、交互顺序和最后一段判断
- 当前项目本地标准启动方式固定为仓库根目录执行 `npm run dev`
- 当前项目本地标准访问地址固定为 `http://127.0.0.1:8002/`
- 旧的 `python http.server` 仅视为历史调试方式，不再作为默认启动入口

## 后续建议

- 下一阶段拆 `main.js` 的输入源与手部追踪，目标是合并主场景和最终合成器中的两套 MediaPipe 加载逻辑
- 再下一阶段拆 `synthesizer.html` 的重复 pad 结构和 inline style，改成本地 CSS 与数据驱动渲染
- 当前已新增最终合成器页自动触发图链路：`viewport-guide.js`
- 当前最终合成器页运行态已支持“自动触发图优先、历史手工布局和四点标定兜底”的几何来源切换
- 当前最终合成器页已新增 `preview-mode.js`，用于区分 `对位模式 / 运行模式`
