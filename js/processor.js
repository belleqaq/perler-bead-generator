/**
 * processor.js — 图片像素化转换（高质量版）
 *
 * 核心改进：
 *  - 先把图片画到全分辨率离屏 canvas 上
 *  - 对每个目标格子做 box-filter 平均 (而不是浏览器的双线性缩放)
 *  - 这样可以保留更多颜色信息，避免每个像素只采到一点
 *  - 可选 Floyd–Steinberg 抖动以保留色调过渡
 */

/**
 * 将 Image 转换为拼豆色格网格
 * @param {HTMLImageElement} img
 * @param {number} cols
 * @param {number} rows
 * @param {Object} opts { palette, dither, contrast, brightness }
 * @returns {Array<Array>} 2D grid
 */
function imageToGrid(img, cols, rows, opts = {}) {
  const palette  = opts.palette  || HAMA_PALETTE;
  const dither   = opts.dither   ?? false;
  const contrast = opts.contrast ?? 1.0;     // 1.0 = no change
  const brightness = opts.brightness ?? 0;   // -100 ~ 100

  // ── Step 1. 画到原图全分辨率离屏 canvas ──────────────────
  const src = document.createElement('canvas');
  src.width  = img.naturalWidth  || img.width;
  src.height = img.naturalHeight || img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0);
  const srcData = sctx.getImageData(0, 0, src.width, src.height).data;

  // ── Step 2. 用 box-filter 把全图采样到 cols × rows ──────
  // 每个目标格子覆盖原图的一块区域，对该区域所有像素 RGB 取平均
  const buf = new Float32Array(cols * rows * 4); // r,g,b,a 累加
  const W = src.width, H = src.height;

  for (let py = 0; py < rows; py++) {
    const y0 = Math.floor(py * H / rows);
    const y1 = Math.max(y0 + 1, Math.floor((py + 1) * H / rows));
    for (let px = 0; px < cols; px++) {
      const x0 = Math.floor(px * W / cols);
      const x1 = Math.max(x0 + 1, Math.floor((px + 1) * W / cols));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          r += srcData[i];
          g += srcData[i + 1];
          b += srcData[i + 2];
          a += srcData[i + 3];
          n++;
        }
      }
      const k = (py * cols + px) * 4;
      buf[k]     = r / n;
      buf[k + 1] = g / n;
      buf[k + 2] = b / n;
      buf[k + 3] = a / n;
    }
  }

  // ── Step 3. 亮度/对比度调整 ────────────────────────────
  if (contrast !== 1.0 || brightness !== 0) {
    for (let i = 0; i < buf.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        let v = buf[i + c];
        v = (v - 128) * contrast + 128 + brightness;
        buf[i + c] = Math.max(0, Math.min(255, v));
      }
    }
  }

  // ── Step 4. 量化到色板（可选抖动）────────────────────────
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));

  for (let py = 0; py < rows; py++) {
    for (let px = 0; px < cols; px++) {
      const k = (py * cols + px) * 4;
      const a = buf[k + 3];
      if (a < 64) continue;
      const r = Math.round(buf[k]);
      const g = Math.round(buf[k + 1]);
      const b = Math.round(buf[k + 2]);
      const matched = findClosestColor(r, g, b, palette);
      grid[py][px] = matched;

      if (dither) {
        const [mr, mg, mb] = hexToRgb(matched.hex);
        const er = r - mr, eg = g - mg, eb = b - mb;
        // Floyd–Steinberg 误差扩散
        diffuse(buf, cols, rows, px + 1, py,     er, eg, eb, 7 / 16);
        diffuse(buf, cols, rows, px - 1, py + 1, er, eg, eb, 3 / 16);
        diffuse(buf, cols, rows, px,     py + 1, er, eg, eb, 5 / 16);
        diffuse(buf, cols, rows, px + 1, py + 1, er, eg, eb, 1 / 16);
      }
    }
  }
  return grid;
}

function diffuse(buf, cols, rows, x, y, er, eg, eb, w) {
  if (x < 0 || x >= cols || y < 0 || y >= rows) return;
  const k = (y * cols + x) * 4;
  buf[k]     = Math.max(0, Math.min(255, buf[k]     + er * w));
  buf[k + 1] = Math.max(0, Math.min(255, buf[k + 1] + eg * w));
  buf[k + 2] = Math.max(0, Math.min(255, buf[k + 2] + eb * w));
}

/**
 * 从 File 加载图片
 */
function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件 / Please select an image'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 根据图片宽高比自动建议画布尺寸（保留长边为 targetMax）
 */
function suggestSize(img, targetMax = 80) {
  const w = img.naturalWidth  || img.width;
  const h = img.naturalHeight || img.height;
  const ratio = w / h;
  if (w >= h) {
    return { cols: targetMax, rows: Math.max(5, Math.round(targetMax / ratio)) };
  } else {
    return { cols: Math.max(5, Math.round(targetMax * ratio)), rows: targetMax };
  }
}
