# 2026-04-28 最终合成器页 ROI 差分判断重写

## 本次范围

- 只处理 `synth/occupancy-detector.js`
- 不改手势识别、不改标定几何、不改 Strudel 映射

## 原问题

- 原先 `occupancyScore` 直接把亮度差、方差差、边缘密度差相加
- 三种特征量纲不同，`edgeDensity` 几乎不起作用
- baseline 缺失时没有保护
- ROI 有效像素过少时没有保护
- 结果没有原因码，现场无法区分“被手挡住了”还是“baseline 没准备好”

## 当前实现

- 新增 `computeOccupancyScore()`，独立导出，便于单测锁定评分逻辑
- 当前默认评分权重：
  - `brightness: 1`
  - `variance: 4`
  - `edgeDensity: 100`
- `createOccupancyDetector()` 新增：
  - `minPixelCount`
  - `scoreWeights`
- baseline 缺失时直接返回：
  - `reason: 'baseline-missing'`
- ROI 有效像素过少时直接返回：
  - `reason: 'sample-too-small'`
- 手部遮挡超过阈值时保留当前状态，不触发进入或退出，并返回：
  - `reason: 'hand-overlap'`

## 测试保护

- `scripts/synth/occupancy-detector.test.mjs` 新增覆盖：
  - 边缘密度权重必须足以参与判定
  - baseline 缺失时不能误判
  - 小样本 ROI 不能误判
  - 手遮挡不能把已占用格子误清空

## 后续

- 下一步若继续优化 ROI，应优先调：
  - `scoreWeights`
  - `enterThreshold / exitThreshold`
  - `minPixelCount`
- 不要把“调阈值”和“改采样几何”混成同一次改动
