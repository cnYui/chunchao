# 视频素材目录约定

## 当前约定

- 项目中的视频素材统一放在根目录 `video/`
- 图片继续放在 `pic/`，不和视频混放
- `video/` 下文件属于运行主资源，默认纳入版本管理

## 本次新增素材

- 源路径原先由用户提供为：
  `D:\xwechat_files\wxid_4lkns2swsaad22_1df8\msg\video\2026-04\33bf26e484a3a504099f10ecbd2e8c13_raw.mp4`
- 实际复制时该 `_raw` 文件已不存在
- 同目录下存在标准导出的 `33bf26e484a3a504099f10ecbd2e8c13.mp4`
- 当前已复制到项目：
  `video/33bf26e484a3a504099f10ecbd2e8c13.mp4`

## 后续新增素材

- 新增复制到项目的 3 个视频：
  - `video/0baa12eb2ae33a003c103a1a1a269781_raw.mp4`
  - `video/ab039202842864c33ee0cfe180f29e57_raw.mp4`
  - `video/7b8e95fe6e49261b02e7e7d8c41b8601_raw.mp4`
- 当前前端时间轴实际引用已切换到这 3 个新视频
- 旧的：
  - `video/33bf26e484a3a504099f10ecbd2e8c13_part1.mp4`
  - `video/33bf26e484a3a504099f10ecbd2e8c13_part2.mp4`
  - `video/33bf26e484a3a504099f10ecbd2e8c13_part3.mp4`
  继续保留在仓库中，不删除

## 原因

- 当前项目已经把图片素材集中在 `pic/`
- 新增视频后继续混放会让素材语义变乱
- 先按资源类型拆分为 `pic/` 和 `video/`，后续无论前端播放还是做参考素材管理都更稳定
