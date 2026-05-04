# 拼豆图纸生成器 · Perler Bead Pattern Generator

> 一个零依赖、纯前端的拼豆 / Hama 图纸生成器。手绘、图片转换、一键导出 PNG / SVG / PDF。
>
> A zero-dependency, pure-frontend perler / hama bead pattern generator. Draw, convert images, and export to PNG / SVG / PDF.

![License: MIT](https://img.shields.io/badge/license-MIT-black?style=flat-square)
![No build step](https://img.shields.io/badge/build-none-c5471f?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/vanilla-JS-1d1a16?style=flat-square)

---

## ✨ Features · 功能

| | |
| :-- | :-- |
| 🎨 **Hand-draw** | 在 Canvas 网格上绘制，支持画笔 / 橡皮 / 填充 / 取色 |
| 🖼 **Image to pattern** | 上传任意图片，自动像素化并匹配 Hama Midi 色板（40 色） |
| ↶ **Undo / Redo** | 完整的历史栈，最多 50 步 |
| 🧮 **Color stats** | 实时色号统计 + 材料清单（每色用量 + 百分比） |
| 📐 **Resizable grid** | 5×5 到 200×200，常用预设：14² / 29² / 50² / 100² |
| 💾 **Export** | PNG · SVG · 打印图纸（浏览器） · PDF（jsPDF）· JSON 工程文件 |
| 🌏 **Bilingual** | 中文 / English 切换 |
| 📱 **Responsive** | 桌面三栏，移动端自动堆叠 |

---

## 🚀 Quick Start · 快速开始

### Option 1 — Just open it
```bash
git clone https://github.com/<your-username>/perler-bead-generator.git
cd perler-bead-generator
open index.html        # macOS
# or: xdg-open / start
```

### Option 2 — Local server (recommended for image-to-pattern)
```bash
python3 -m http.server 8000
# → http://localhost:8000
```

> 浏览器对本地 `file://` 协议下的图片读取有时会受限，建议用一个简单的本地服务器。

### Option 3 — Deploy to GitHub Pages
1. Push to GitHub
2. Repository → **Settings** → **Pages**
3. Source: `main` branch / root
4. Visit `https://<your-username>.github.io/perler-bead-generator/`

---

## 📂 Project Structure · 项目结构

```
perler-bead-generator/
├── index.html
├── css/
│   └── style.css         # Vintage workshop aesthetic
├── js/
│   ├── i18n.js           # 中英双语字典
│   ├── palette.js        # Hama Midi 40-color palette + color matching
│   ├── processor.js      # Image → bead grid pixelization
│   ├── editor.js         # Canvas editor (BeadEditor class)
│   ├── exporter.js       # PNG / SVG / PDF / print / project file
│   └── app.js            # UI controller
├── README.md
└── LICENSE
```

**No build step. No npm. No bundler.** Just open `index.html`.

---

## 🎮 Usage · 使用说明

### Drawing tools · 绘图工具
- **Draw / 绘制** — 单击或拖拽放置当前选中色
- **Erase / 橡皮** — 移除珠子
- **Fill / 填充** — 油漆桶（4 邻接洪水填充）
- **Pick / 取色** — 从画布拾取颜色

### Keyboard shortcuts · 快捷键
| Key | Action |
| --- | --- |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z` | Redo |

### Image conversion · 图片转换
拖拽图片到右侧的虚线框，或点击选择文件。图片会按当前画布尺寸缩放，并通过感知加权颜色距离（近似 CIE94）匹配最接近的 Hama 色号。

> 💡 建议先调好画布尺寸再上传图片，避免后续缩放损失细节。

### Export options · 导出选项
- **PNG** — 高清栅格化的图纸
- **SVG** — 矢量图，可无限缩放，便于打印
- **打印 / Print** — 打开新窗口生成打印友好的 A4 图纸（包含色号网格 + 彩色网格 + 材料清单）。在打印对话框中选择"另存为 PDF"即可
- **PDF** — 直接通过 jsPDF 生成 PDF 文件
- **保存工程 / Save Project** — 导出 `.bead.json`，可日后重新加载继续编辑

PDF / 打印输出可以勾选包含哪些内容：
- ☑ 带色号字母的网格
- ☑ 纯色块网格
- ☑ 色号统计表
- ☑ 材料清单（总数 / 各色用量 / 百分比）

---

## 🎨 Customization · 自定义

### 添加 / 修改色板
编辑 `js/palette.js`：
```js
const HAMA_PALETTE = [
  { code: 'H01', name: '白色', hex: '#FFFFFF' },
  // …
];
```

并在 `js/i18n.js` 的 `I18N_COLOR_NAMES` 中添加中英文名。

### 调整美学
所有颜色 / 字体 / 间距通过 CSS 变量控制（见 `css/style.css` 顶部 `:root` 区块）：
```css
:root {
  --bg: #E8E1D2;
  --accent: #C5471F;
  --font-display: 'Fraunces', serif;
  /* … */
}
```

---

## 🛠 Tech · 技术

- **Vanilla JS (ES6+)** — no framework
- **Canvas 2D** — for the editor
- **jsPDF** — PDF export (loaded from CDN)
- **Google Fonts** — Fraunces (display) · Space Mono · Inter

Total page weight (excluding fonts/jsPDF): **~25 KB**.

---

## 🗺 Roadmap · 后续计划

- [ ] 多色板支持（Hama Mini, Perler, Artkal…）
- [ ] 抖动 (dithering) 算法选项
- [ ] 自定义色板
- [ ] 大图纸自动分块（A4 拼接）
- [ ] PWA 离线支持

---

## 🤝 Contributing

PRs welcome. Open an issue first for major changes.

---

## 📜 License

[MIT](./LICENSE) © 2026

---

<sub>Made with ❤ · 拼豆愉快 · Happy beading</sub>
