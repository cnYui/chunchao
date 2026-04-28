# 2026-04-28 最终合成器页手势识别重写

## 本次范围

- 只处理最终合成器页的手势识别
- 不改 ROI 差分算法和占格阈值
- 目标是让 `VIBE / VOL / REV / POS` 的手部调节不再被 ROI baseline 阻塞

## 问题

- 原先 `synth/app.js` 把 `handController.detect()` 放在 `baselineReady && padRois.length === padCount` 分支内部
- 结果是用户没有完成空场 baseline 前，即使摄像头和 MediaPipe 已启动，手势也不会被检测和渲染
- 这把“手部调控”和“16 格占格”错误绑定到了一起

## 当前实现

- `synth/hand-controller.js` 现在输出统一手部状态：
  - `active`
  - `handedness`
  - `confidence`
  - `points`
  - `normalizedPoints`
  - `controlPoint`
  - `hands`
- 多手同时出现时，按 handedness 置信度选择主手
- 低于 `minConfidence` 的手会被过滤
- `controlPoint` 优先使用食指指尖，其次回退到拇指或第一个关键点
- `synth/app.js` 现在每帧先执行手势识别，再根据是否有 baseline 决定是否执行 ROI 差分
- 手部调参只要求四点标定后的控制区域存在，不再要求 baseline

## 测试保护

- `scripts/synth/hand-controller.test.mjs`
  - 覆盖手部状态转换
  - 覆盖主手选择
  - 覆盖低置信度过滤
- `scripts/synth/hand-flow.test.mjs`
  - 覆盖手势识别必须在 baseline 判断之前执行

## 后续

- 下一步再处理 ROI 差分判断，不要和手势识别混在同一次改动里
