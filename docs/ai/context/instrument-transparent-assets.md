# 乐器素材透明背景处理

## 目标

为 `pic/` 下的乐器图片生成透明背景版本，便于直接叠加到排练室背景图上。

## 输入文件

- `pic/guitar.png`
- `pic/shuqin.jpg`
- `pic/jiazigu.png`
- `pic/dianziqin.png`
- `pic/violin.jpg`

## 输出文件

- `pic/guitar_transparent.png`
- `pic/shuqin_transparent.png`
- `pic/jiazigu_transparent.png`
- `pic/dianziqin_transparent.png`
- `pic/violin_transparent.png`

## 处理策略

- 使用代码从图片四周开始查找“高亮且低色差”的连通区域
- 仅将这部分区域改为透明
- 不直接删除整张图中的浅色区域，原因是乐器内部存在高光、反光和插画留白
- 对 `jpg` 输入不覆盖原文件，输出为带透明通道的 `png`
- 对带假透明棋盘格的素材，首轮边缘抠除后，再做一轮“内部背景孤岛”清理
- 二次清理仅处理仍然不透明、颜色接近背景、且连成明显内部块的区域

## 当前阈值

- 亮度阈值使用 `min(R, G, B) >= 205`
- 色差阈值使用 `max(R, G, B) - min(R, G, B) <= 35`
- 该阈值适合当前这批浅灰白棋盘格假透明背景和彩色乐器素材
- 二次清理使用更保守的阈值：`min(R, G, B) >= 210` 且 `max(R, G, B) - min(R, G, B) <= 30`
- 二次清理最小连通块阈值为 `120 px`

## 校验结果

- 5 张输出图片四角 alpha 均为 `0`
- 输出格式仍为 PNG，可直接用于前端叠加显示
- 对 `shuqin_transparent.png`、`dianziqin_transparent.png`、`jiazigu_transparent.png` 已追加二次清理，移除了主体内部被轮廓包住的棋盘格背景残留
