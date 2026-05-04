# 拼豆图纸生成器 · Perler Bead Pattern Generator

> 一个零依赖、纯前端的拼豆图纸生成器。手绘、图片转换、AI 辅助风格化、一键导出 PNG / SVG / PDF。
>
> A zero-dependency, pure-frontend perler / hama bead pattern generator. Draw, convert images, AI-assisted stylization, export to PNG / SVG / PDF.

![License: MIT](https://img.shields.io/badge/license-MIT-black?style=flat-square)
![No build step](https://img.shields.io/badge/build-none-c5471f?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS-1d1a16?style=flat-square)
![Palette: MARD 221](https://img.shields.io/badge/palette-MARD%20221-1d1a16?style=flat-square)

---

## ✨ Features · 功能

| | |
| :-- | :-- |
| 🎨 **Hand-draw** | 在 Canvas 网格上绘制，支持画笔 / 橡皮 / 填充 / 取色 |
| 🎯 **MARD 221 palette** | 完整 MARD 221 色 + 6 档色板规模切换（24 / 48 / 96 / 144 / 168 / 221）|
| 🖼 **Image to pattern** | 上传任意图片，多档算法可调（精细度 / 平滑 / 聚类 / 限色 / 区块合并 / 净边采样）|
| 🤖 **AI cartoon (fal.ai)** | 真人照片→像素卡通：Pixel Art / Stardew / Terraria / 8-bit / Anime / Ghibli |
| ✂️ **Background removal** | 本地 flood-fill 抠图（带容差滑块）+ AI 抠图（fal.ai BiRefNet）|
| 🔍 **Viewport zoom + pan** | 放大显示局部，方向键 / 按钮 / 触控板手势平移；以光标为锚点的捏合缩放 |
| 🔵 **Square / round beads** | 渲染样式可切换：方形（熨过）/ 圆形（未熨）|
| ↶ **Undo / Redo** | 完整的历史栈，最多 50 步 |
| 🧮 **Color stats** | 实时色号统计 + 材料清单（每色用量 + 百分比）|
| 📐 **Resizable grid** | 5×5 到 200×200，常用预设 + 上传后自动适配 |
| 💾 **Export** | PNG · SVG · 打印 · PDF（jsPDF）· JSON 工程文件 |
| 🌏 **Bilingual** | 中文 / English 切换 |

---

## 🚀 Quick Start · 快速开始

### Option 1 — 直接打开
```bash
git clone https://github.com/<your-username>/perler-bead-generator.git
cd perler-bead-generator
open index.html        # macOS
```

### Option 2 — 本地服务器（图片转换推荐）
```bash
python3 -m http.server 8000
# → http://localhost:8000
```

### Option 3 — Deploy to GitHub Pages
1. Push to GitHub
2. Repository → **Settings** → **Pages** → Source: `main` / root
3. Visit `https://<your-username>.github.io/perler-bead-generator/`

---

## 📂 Project Structure · 项目结构

```
perler-bead-generator/
├── index.html
├── css/
│   └── style.css         # Vintage workshop aesthetic
├── js/
│   ├── i18n.js           # 中英双语字典
│   ├── palette.js        # MARD 221 色板 + 颜色匹配 + 子集采样
│   ├── processor.js      # 图片→图纸管线（采样/平滑/聚类/限色/风格化）
│   ├── editor.js         # Canvas 编辑器 + 视窗 + 缩放 + 平移
│   ├── exporter.js       # PNG / SVG / PDF / 打印 / 工程文件
│   └── app.js            # UI 控制器 + AI 集成 + 抠图
├── README.md
└── LICENSE
```

**No build step. No npm. No bundler.** Just open `index.html`.

---

## 🎮 Usage · 使用说明

### Drawing tools · 绘图工具
- **Draw / 绘制** · **Erase / 橡皮** · **Fill / 填充**（4 邻接洪水填充）· **Pick / 取色**

### Keyboard shortcuts · 快捷键
| Key | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | Redo |
| `+` / `=` | 放大（按当前尺寸 18% 自适应步进，从中心放大）|
| `-` / `_` | 缩小 |
| `0` | 重置：自动适配整张图纸 |
| `↑ ↓ ← →` | 平移视窗 1 格 |
| `Shift + 方向键` | 平移视窗 5 格 |

### Trackpad gestures · 触控板手势
- **两指滑动** → 平移视窗（自然滚动方向）
- **两指捏合** → 缩放，**以光标位置为锚点**（光标下的格子不动）

### Image conversion · 图片转换
拖图到右侧虚线框或点选文件。新图自动按宽高比适配画布尺寸，并按以下管线转换：

| 控件 | 作用 |
| --- | --- |
| **风格** | 原图 / 8-bit 复古 / 漫画描边 / 水彩 / 单色版画 |
| **自动尺寸** + **精细度** | 控制图纸长边像素数；关闭后用手动 cols/rows |
| **净边采样** | 投票法采样：把孤立反走样像素拉回主色，保留小特征（眼/嘴/线）|
| **平滑（双边滤波）** | 保边缘的色彩平滑 |
| **主色聚类（K-means）** | 量化前先把颜色聚成 N 个主色 |
| **最多色数** | 强制图纸最多用 N 种 MARD 色号（剩下的就近映射）|
| **最小色块** | 把面积 < N 的孤岛并入最大相邻色块 |
| **抖动 / 亮度 / 对比度** | 经典图像处理参数 |

> **默认所有简化都是关的**——上传后先看忠实转换，再按需要主动加平滑/限色/聚类。

### AI photo → cartoon (advanced) · AI 真人转卡通
需要 [fal.ai API Key](https://fal.ai/dashboard/keys)。展开"AI 真人转卡通（高级）"折叠区：
- 填 Key（存 localStorage，下次自动填回）
- 选风格：像素艺术 / Stardew Valley / Terraria / 8-bit 游戏 / 日系动漫 / 吉卜力
- 调"改造强度"（0.5 = 轻度卡通化；0.85 = 完全重画）
- 点"生成卡通版" → 5–15 秒后自动跑图纸管线

### Background removal · 抠图
两个按钮：
- **本地抠图**：从四角 flood-fill 把和角落颜色相似的连通区域设为透明。带容差滑块。适合**纯色 / 近纯色背景**
- **AI 抠图**：调 fal.ai BiRefNet/rembg，质量近完美，处理头发/复杂背景。需要 fal.ai Key
- **还原**：随时回到最初上传的原图

### Palette size · 色板规模
色板面板顶部 6 档：**221 / 168 / 144 / 96 / 48 / 24**。
- 221 = 完整 MARD 标准色卡
- 子集用 **farthest-point sampling** 算出，确保覆盖整个色域而不是堆在某个色相
- 切换后已加载的图纸会用新色板重新量化
- 选择记在 localStorage

### View navigation · 视窗导航
图纸大、放大后画布只显示一个窗口（不再撑满全屏滚动）。右下角浮动控件：
- 十字方向按钮（上 / 下 / 左 / 右 / 居中）
- 缩放按钮（+ / 重置 / -）：长按连续触发
- 当前 cellSize 数字
- 到边界自动 disable

### Export options · 导出
- **PNG** · **SVG** · **打印** · **PDF（jsPDF）** · **保存工程（.bead.json）** · **打开工程**
- PDF / 打印可勾选：色号网格 / 彩色网格 / 色号统计 / 材料清单
- 导出始终是**完整图纸**，不受当前缩放视窗影响

---

## 🎨 Customization · 自定义

### 替换 / 扩充色板
编辑 `js/palette.js`：
```js
const MARD_PALETTE = [
  { code: 'A1', hex: '#FAF4C8' },
  // …
];
```
所有内部 API（`findClosestColor` / `findColorByCode` / 色板规模子集）都基于这个数组。

### AI prompts
编辑 `js/app.js` 中的 `AI_PROMPTS`：
```js
const AI_PROMPTS = {
  pixel: 'pixel art, 16-bit, vibrant colors, sharp pixels, …',
  // … 添加你自己的风格
};
```

### 调整美学
所有颜色 / 字体 / 间距通过 CSS 变量控制（`css/style.css` 顶部 `:root`）。

---

## 🛠 Tech · 技术

- **Vanilla JS (ES6+)** — no framework, no bundler
- **Canvas 2D** — 编辑器渲染 + 图像采样 + 双边滤波 + K-means + flood-fill
- **fal.ai** — 可选 AI 图生图 / 抠图（BYO API key，浏览器直连）
- **jsPDF** — PDF export (CDN)
- **Google Fonts** — Fraunces · Space Mono · Inter

Page weight (excl. fonts/jsPDF): **~50 KB**。

### 关键算法
- **采样**：`mode`（按 4 位/通道分桶投票，带"暗少数派救援"保留小特征）/ `mean`（box-filter 平均）
- **平滑**：双边滤波（保边）
- **聚类**：K-means++（子采样加速）
- **限色**：top-N 用量 + 就近映射
- **区块合并**：4-连通分量分析 + 多数邻居投票
- **色板子集**：farthest-point sampling
- **抠图**：4 角 BFS flood-fill / fal.ai rembg
- **缩放锚点**：`gridX_anchor = viewX + screenX/cellSize` → 换 cellSize 后保持 `screenX` 不变求新 viewX

---

## 🗺 Roadmap · 后续计划

- [x] 多色板支持（MARD 221 + 子集切换）
- [x] 抖动 (dithering) 算法选项
- [x] AI 图生图风格化
- [x] AI / 本地抠图
- [x] 视窗化缩放 + 触控板手势
- [ ] 自定义色板导入（CSV/JSON 上传）
- [ ] Hama / Perler / Artkal 等其他品牌色板
- [ ] 大图纸自动分块（A4 拼接）
- [ ] PWA 离线支持
- [ ] 边缘对齐采样（让横平竖直的物体真的横平竖直）

---

## 🤝 Contributing

PRs welcome. Open an issue first for major changes.

---

## 📜 License

[MIT](./LICENSE) © 2026

---

<sub>Made with ❤ · 拼豆愉快 · Happy beading</sub>
