# 春潮

一个基于静态网页的乐器交互场景演示。

当前版本用排练室背景图和 5 个乐器贴图构建场景，并把“接近触发”统一抽象为交互输入源。现在已经支持两种输入：

- 鼠标接近乐器时触发斥力位移
- 浏览器摄像头 + MediaPipe 手部识别驱动同样的接近效果
- 左下角前后翻页，在互动页和谱面页之间切换
- 第 2 页可拖拽和调试琴谱位置，并复制当前参数

当前默认前端入口已临时切换为视频时间轴模式：

- 当前顺播 3 段视频：
  - `video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4`
  - `video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4`
  - `video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4`
- 第一段视频结束后插入 `bg2` 交互，第二段视频结束后插入 `bg1` 交互
- 每个交互页面右上角都有“继续”按钮，点击后恢复下一段视频播放

## 当前能力

- 使用 `pic/` 下现有素材直接生成场景
- 乐器在用户接近时沿远离输入源的方向移动
- 输入离开后，乐器按弹簧阻尼效果自然回位
- 鼠标和手部输入共用同一套场景响应逻辑
- 左手和右手都可以作为交互输入
- 手部识别失败时，鼠标仍可作为后备输入

## 项目结构

```text
.
├─ index.html
├─ styles.css
├─ main.js
├─ timeline-config.js
├─ timeline-refresh-state.js
├─ synthesizer.html
├─ synth/
├─ pic/
├─ video/
└─ docs/ai/context/
```

说明：

- `index.html`：场景结构和乐器默认摆位
- `styles.css`：场景布局和视觉表现
- `main.js`：主页面编排、输入源、手部识别接入和交互场景逻辑
- `timeline-config.js`：三段视频和交互插入顺序配置
- `timeline-refresh-state.js`：视频时间轴刷新恢复状态
- `synthesizer.html` / `synth/`：最终合成器展示页和运行模块
- `pic/`：背景图和乐器素材
- `video/`：视频素材
- `docs/ai/context/`：项目上下文和设计记录

## 本地运行

当前项目使用最小 Vite 构建链路。

但如果要启用摄像头手部识别，不能直接用 `file://` 打开，必须通过 `localhost` 或 `https` 访问。

例如在项目目录执行：

```bash
npm run dev
```

然后在浏览器打开：

```text
http://127.0.0.1:8002
```

如果只想快速看静态画面，直接打开 `index.html` 也可以，但这种方式下浏览器通常不会允许摄像头能力，最终合成器依赖的模块加载也不如本地服务稳定。

## 当前素材

- 当前背景：`pic/bg1.png`
- 备用背景：`pic/bg2.png`
- 当前谱面图：`pic/琴谱 new_transparent.png`
- 当前时间轴视频 1：`video/1a21117e4e7916df5b51a3864ea114a9_raw.mp4`
- 当前时间轴视频 2：`video/4577a95e9284af02d27603fb8d11bc3e_raw.mp4`
- 当前时间轴视频 3：`video/e1e4aa1ee14b1794a6d6d781f966be1a_raw.mp4`
- 乐器透明图：`pic/violin_transparent.png`
- 乐器透明图：`pic/shuqin_transparent.png`
- 乐器透明图：`pic/dianziqin_transparent.png`
- 乐器透明图：`pic/jiazigu_transparent.png`
- 乐器透明图：`pic/guitar_transparent.png`

## 已知约束

- 当前优先解决“画面内接近”，还没有解决真实空间深度
- MediaPipe 通过官方 CDN 动态加载，前提是网络可访问对应资源
- 手部输入默认使用掌心近似中心，不使用指尖作为主交互点
- 如果后续目标变成“手真的靠近墙上的乐器才触发”，需要补侧拍距离通道

## 后续方向

- 增加现场机位映射和标定参数
- 为真实空间接近补充侧拍深度估算
- 在确认交互稳定后，再决定是否升级为正式前端工程
