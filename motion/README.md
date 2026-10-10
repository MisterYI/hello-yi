# motion

用代码做的科普动效视频：**AI Agent 是怎么工作的？**
成品见 `out/agent-explainer.mp4`（48 秒，1280×720，30fps）。

| 时间 | 场景 |
|---|---|
| 0–5s | 片头：AI Agent 是怎么工作的？ |
| 5–11.5s | 聊天机器人 vs Agent：只会「说」 vs 也会「做」 |
| 11.5–19.5s | 组成：大模型 + 规划 / 工具 / 记忆 / 环境 |
| 19.5–31.5s | 核心循环：思考 → 行动 → 观察，跑三轮后完成 |
| 31.5–42s | 实例：查天气，下雨就发邮件提醒带伞 |
| 42–48s | 总结：Agent = 大模型 + 工具 + 记忆 + 循环 |

## 原理

AI 不直接"生成"视频，而是写一段程序画出每一帧：

1. **`scene.html`**：一个 Canvas 页面，里面的 `renderFrame(t)` 根据时间 `t`（秒）画出那一帧。
   不能用 `Date.now` / `Math.random`，每一帧只由 `t` 决定，所以可以随意跳到任意帧。
2. **`render.mjs`**：用无头 Chromium 打开页面，逐帧调用 `renderFrame(t)` 并截取画布，
   把 PNG 流式交给 ffmpeg 编码成 MP4，最后生成一张拼板 `out/contact-sheet.png`，一眼检查整条片子。

## 用法

```bash
cd motion
npm install
npm run render          # 输出 out/agent-explainer.mp4 和 out/contact-sheet.png
npm run still -- 22.5   # 只渲染第 22.5 秒那一帧，调效果时用
```

直接在浏览器里打开 `scene.html` 就能实时预览（循环播放）。需要本机装好 ffmpeg。

## 想改成自己的内容

改 `scene.html` 里的场景函数和 `SCENES` 时间表即可。跟 AI 提需求时，建议这样说：

> 用一个独立的 HTML 文件写 1280×720 的 Canvas 动画，暴露 `renderFrame(t)`，每帧只由 t 决定，
> 不用外部资源。时长 10–20 秒，分 3–5 个场景，每个场景只讲一个视觉点。
> 先列出场景和时间轴，再写代码；渲染几张静帧检查后再出完整视频。
