# motion

用代码做的视频。画面、文字、音乐全部由程序生成，没有使用任何外部素材。

| 作品 | 源文件 | 成品 |
|---|---|---|
| 《冬冬和我们》像素风 MV（64 秒，带配乐） | `cat-mv.html` + `cat-mv-music.mjs` | `out/cat-mv.mp4` |
| AI Agent 原理科普（48 秒） | `agent-explainer.html` | `out/agent-explainer.mp4` |

## 《冬冬和我们》

一对情侣和一只白色金吉拉小猫「冬冬」的故事。8 个场景，每个 8 秒，正好对应音乐的 4 个小节：

| 时间 | 场景 | 音乐 |
|---|---|---|
| 0–8s | 夜空片头，小猫坐在屋顶 | 琶音前奏 |
| 8–16s | 猫舍卖家开车把小猫送到家门口 | 加入贝斯，喇叭「嘀嘀」，一声「喵」 |
| 16–24s | 男女主一起接猫，取名「冬冬」 | 主旋律 + 轻鼓 |
| 24–32s | 追毛线球，每拍跳一下 | 主旋律 + 轻鼓 |
| 32–40s | 深夜加班，小猫在键盘旁睡着 | 安静的低八度主旋律 |
| 40–48s | 窗台上的春夏秋冬，小猫长大 | 副歌，完整鼓组 |
| 48–56s | 夕阳下，两人一猫坐在长椅上 | 副歌 + 和声 |
| 56–64s | 结尾 THE END | 尾声，渐弱 |

- **画面**：先画到 320×180 的像素缓冲区，再无平滑放大 4 倍，每个「像素」都是清晰的 4×4 方块。
  角色是逐格画的像素图（见 `KIT_SIT`、`OWN_HEAD` 等字符画），光影用有序抖动（dither）表现。
- **字幕**：Unifont 像素字体，RPG 对话框逐字打出。
- **音乐**：`cat-mv-music.mjs` 用方波、三角波和噪声合成 8-bit 音乐（120 BPM，C–G–Am–F），输出 WAV；
  合成视频时响度统一标准化到 -14 LUFS。

## 原理

AI 不直接"生成"视频，而是写一段程序画出每一帧：

1. **场景页面**：一个 Canvas 页面，`renderFrame(t)` 根据时间 `t`（秒）画出那一帧。
   每一帧只由 `t` 决定，所以可以随意跳到任意帧。
2. **`render.mjs`**：用无头 Chromium 逐帧截取画布，交给 ffmpeg 编码成 MP4（可以合入音轨），
   最后生成一张拼板图 `out/<名字>-contact-sheet.png`，一眼检查整条片子。

## 用法

```bash
cd motion
npm install
npm run render:cat                          # 生成音乐并渲染 out/cat-mv.mp4
npm run render:agent                        # 渲染 out/agent-explainer.mp4
npm run still -- cat-mv.html --still 12.5   # 只渲染一帧，调效果时用
```

直接在浏览器里打开 `cat-mv.html` 就能预览；先运行一次 `node cat-mv-music.mjs`，点画面即可带音乐播放。需要本机装好 ffmpeg。
