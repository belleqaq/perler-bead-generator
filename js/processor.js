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
 * @param {Object} opts { palette, dither, contrast, brightness, kmeans, smooth }
 * @returns {Array<Array>} 2D grid
 */
function imageToGrid(img, cols, rows, opts = {}) {
  const palette  = opts.palette  || HAMA_PALETTE;
  const dither   = opts.dither   ?? false;
  const contrast = opts.contrast ?? 1.0;     // 1.0 = no change
  const brightness = opts.brightness ?? 0;   // -100 ~ 100
  const kmeans     = opts.kmeans     ?? 0;   // 0 = 关闭；否则聚成 N 个主色
  const smooth     = opts.smooth     ?? 0;   // 0 = 关闭；越大越激进地把局部小色差合并（双边滤波 σc）
  const maxColors  = opts.maxColors  ?? 0;   // 0 = 关闭；否则最终图纸只允许 ≤ N 种色号
  const minRegion  = opts.minRegion  ?? 1;   // ≤1 = 关闭；否则连通色块 < N 颗的并入最大邻居

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

  // ── Step 3.4 双边滤波：把孤立的高光/杂色拉回邻域均值，但保留真实边缘 ──
  if (smooth > 0) {
    bilateralSmooth(buf, cols, rows, smooth);
  }

  // ── Step 3.5 K-means 预聚类：先把整图收敛到 k 个主色，再去近邻拼豆色 ──
  if (kmeans && kmeans >= 2) {
    kmeansQuantize(buf, kmeans);
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

  // ── Step 5. 硬限色数：只保留用量前 N 的色号，其余就近映射 ─────
  let result = grid;
  if (maxColors >= 2) {
    result = capColors(result, palette, maxColors);
  }

  // ── Step 6. 连通分量合并：把面积 < N 的小孤岛吞进最大邻居 ─────
  if (minRegion >= 2) {
    result = mergeSmallRegions(result, minRegion);
  }

  return result;
}

/**
 * 硬限色数：统计当前图纸里每个色号用量，只保留 top-N，其余像素就近映射到保留色。
 * 这是"少色拼起来不累"的关键步骤，比任何平滑/聚类都直接。
 */
function capColors(grid, palette, maxColors) {
  const counts = new Map();
  for (const row of grid) {
    for (const c of row) {
      if (!c) continue;
      counts.set(c.code, (counts.get(c.code) || 0) + 1);
    }
  }
  if (counts.size <= maxColors) return grid;

  const keepCodes = new Set(
    Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxColors)
      .map(e => e[0])
  );
  const keepPalette = palette.filter(c => keepCodes.has(c.code));
  const remap = new Map();

  return grid.map(row => row.map(c => {
    if (!c) return null;
    if (keepCodes.has(c.code)) return c;
    if (remap.has(c.code)) return remap.get(c.code);
    const [r, g, b] = hexToRgb(c.hex);
    const replacement = findClosestColor(r, g, b, keepPalette);
    remap.set(c.code, replacement);
    return replacement;
  }));
}

/**
 * 合并小色块：4-连通分量分析，把 < minSize 颗的色块整体并入最大相邻色块。
 * 多次迭代直到收敛——这样能把"小孤岛被并入新邻居后又变成更大孤岛"的情况一并清掉。
 */
function mergeSmallRegions(grid, minSize) {
  const rows = grid.length, cols = grid[0].length;
  let cur = grid.map(r => [...r]);

  for (let pass = 0; pass < 4; pass++) {
    const labels = Array.from({ length: rows }, () => new Int32Array(cols).fill(-1));
    const components = []; // { code, color, cells }
    let nextLabel = 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (labels[y][x] !== -1) continue;
        const c = cur[y][x];
        if (!c) { labels[y][x] = -2; continue; }
        const stack = [[y, x]];
        const cells = [];
        labels[y][x] = nextLabel;
        while (stack.length) {
          const [cy, cx] = stack.pop();
          cells.push([cy, cx]);
          const NB = [[cy - 1, cx], [cy + 1, cx], [cy, cx - 1], [cy, cx + 1]];
          for (const [ny, nx] of NB) {
            if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
            if (labels[ny][nx] !== -1) continue;
            const n = cur[ny][nx];
            if (!n || n.code !== c.code) continue;
            labels[ny][nx] = nextLabel;
            stack.push([ny, nx]);
          }
        }
        components.push({ code: c.code, cells });
        nextLabel++;
      }
    }

    let merged = 0;
    for (const comp of components) {
      if (comp.cells.length >= minSize) continue;
      // 统计相邻色块的色号 → 总相邻边长，选最多的
      const nbCounts = new Map();
      const nbColor  = new Map();
      for (const [cy, cx] of comp.cells) {
        const NB = [[cy - 1, cx], [cy + 1, cx], [cy, cx - 1], [cy, cx + 1]];
        for (const [ny, nx] of NB) {
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue;
          const n = cur[ny][nx];
          if (!n || n.code === comp.code) continue;
          nbCounts.set(n.code, (nbCounts.get(n.code) || 0) + 1);
          if (!nbColor.has(n.code)) nbColor.set(n.code, n);
        }
      }
      if (nbCounts.size === 0) continue;
      let bestCode = null, bestCount = 0;
      nbCounts.forEach((cnt, code) => {
        if (cnt > bestCount) { bestCount = cnt; bestCode = code; }
      });
      const replacement = nbColor.get(bestCode);
      if (!replacement) continue;
      for (const [cy, cx] of comp.cells) cur[cy][cx] = replacement;
      merged++;
    }
    if (merged === 0) break;
  }
  return cur;
}

/**
 * 双边滤波 (bilateral filter)：保边缘的平滑。
 * 对每个像素，邻域加权平均，权重 = 空间高斯 × 颜色高斯。
 * 颜色相近的邻居贡献大（同一片肤色相互"合并"），颜色差大的邻居权重接近 0
 *（眼睛/嘴唇这种真边缘不会被周围皮肤稀释）。
 *
 * @param {Float32Array} buf RGBA Float buffer
 * @param {number} cols
 * @param {number} rows
 * @param {number} sigmaC 颜色标准差，越大越能合并差异更大的颜色
 * @param {number} radius 空间窗口半径（默认 2，即 5×5）
 */
function bilateralSmooth(buf, cols, rows, sigmaC, radius = 2) {
  const sigmaS = Math.max(1, radius);
  const inv2sigS2 = 1 / (2 * sigmaS * sigmaS);
  const inv2sigC2 = 1 / (2 * sigmaC * sigmaC);

  const out = new Float32Array(buf.length);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ki = (y * cols + x) * 4;
      const ca = buf[ki + 3];
      out[ki + 3] = ca;
      if (ca < 64) continue;
      const cr = buf[ki], cg = buf[ki + 1], cb = buf[ki + 2];

      let sumW = 0, sR = 0, sG = 0, sB = 0;
      const y0 = Math.max(0, y - radius), y1 = Math.min(rows - 1, y + radius);
      const x0 = Math.max(0, x - radius), x1 = Math.min(cols - 1, x + radius);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const kn = (ny * cols + nx) * 4;
          if (buf[kn + 3] < 64) continue;
          const nr = buf[kn], ng = buf[kn + 1], nb = buf[kn + 2];
          const dy = ny - y, dx = nx - x;
          const ws = Math.exp(-(dx * dx + dy * dy) * inv2sigS2);
          const dr = nr - cr, dg = ng - cg, db = nb - cb;
          const wc = Math.exp(-(dr * dr + dg * dg + db * db) * inv2sigC2);
          const w = ws * wc;
          sumW += w;
          sR += w * nr; sG += w * ng; sB += w * nb;
        }
      }
      out[ki]     = sR / sumW;
      out[ki + 1] = sG / sumW;
      out[ki + 2] = sB / sumW;
    }
  }

  for (let i = 0; i < buf.length; i++) buf[i] = out[i];
}

/**
 * K-means 颜色聚类：把 buf 中的所有不透明像素聚成 k 个主色，
 * 然后把每个像素替换为它所属簇的中心。
 * 用 k-means++ 初始化 + 子采样加速。
 */
function kmeansQuantize(buf, k) {
  // 1. 收集不透明像素的索引
  const idxs = [];
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] >= 64) idxs.push(i);
  }
  if (idxs.length <= k) return;

  // 2. 子采样（最多 4000 个像素参与训练，避免大图慢）
  const sample = [];
  const sampleMax = Math.min(4000, idxs.length);
  const step = idxs.length / sampleMax;
  for (let s = 0; s < sampleMax; s++) {
    sample.push(idxs[Math.floor(s * step)]);
  }

  // 3. k-means++ 初始化
  const centers = [];
  const first = sample[Math.floor(Math.random() * sample.length)];
  centers.push([buf[first], buf[first + 1], buf[first + 2]]);
  while (centers.length < k) {
    const dists = sample.map(i => {
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      let best = Infinity;
      for (const c of centers) {
        const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (d < best) best = d;
      }
      return best;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    if (sum === 0) break;
    let r = Math.random() * sum;
    let pick = 0;
    for (let i = 0; i < dists.length; i++) {
      r -= dists[i];
      if (r <= 0) { pick = sample[i]; break; }
    }
    centers.push([buf[pick], buf[pick + 1], buf[pick + 2]]);
  }

  // 4. 迭代收敛（只在子采样上跑，最多 12 轮）
  const assign = new Int32Array(sample.length);
  for (let iter = 0; iter < 12; iter++) {
    let moved = 0;
    for (let i = 0; i < sample.length; i++) {
      const idx = sample[i];
      const r = buf[idx], g = buf[idx + 1], b = buf[idx + 2];
      let best = 0, bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dr = r - centers[c][0], dg = g - centers[c][1], db = b - centers[c][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; moved++; }
    }
    // 重新计算中心
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < sample.length; i++) {
      const idx = sample[i], a = assign[i];
      sums[a][0] += buf[idx];
      sums[a][1] += buf[idx + 1];
      sums[a][2] += buf[idx + 2];
      sums[a][3]++;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c][0] = sums[c][0] / sums[c][3];
        centers[c][1] = sums[c][1] / sums[c][3];
        centers[c][2] = sums[c][2] / sums[c][3];
      }
    }
    if (moved === 0) break;
  }

  // 5. 把 buf 里所有不透明像素替换成最近的中心色
  for (const i of idxs) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    let best = 0, bestD = Infinity;
    for (let c = 0; c < centers.length; c++) {
      const dr = r - centers[c][0], dg = g - centers[c][1], db = b - centers[c][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = c; }
    }
    buf[i]     = centers[best][0];
    buf[i + 1] = centers[best][1];
    buf[i + 2] = centers[best][2];
  }
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
