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
 * @param {Object} opts { palette, dither, contrast, brightness, kmeans, smooth, maxColors, minRegion, style }
 * @returns {Array<Array>} 2D grid
 */
function imageToGrid(img, cols, rows, opts = {}) {
  const palette  = opts.palette  || MARD_PALETTE;
  const dither   = opts.dither   ?? false;
  const contrast = opts.contrast ?? 1.0;     // 1.0 = no change
  const brightness = opts.brightness ?? 0;   // -100 ~ 100
  const kmeans     = opts.kmeans     ?? 0;   // 0 = 关闭；否则聚成 N 个主色
  const smooth     = opts.smooth     ?? 0;   // 0 = 关闭；越大越激进地把局部小色差合并（双边滤波 σc）
  const maxColors  = opts.maxColors  ?? 0;   // 0 = 关闭；否则最终图纸只允许 ≤ N 种色号
  const minRegion  = opts.minRegion  ?? 1;   // ≤1 = 关闭；否则连通色块 < N 颗的并入最大邻居
  const style      = opts.style      || 'none'; // 'none' | '8bit' | 'comic' | 'watercolor' | 'noir'
  const sampling   = opts.sampling   || 'mode'; // 'mode' = 投票（净边） | 'mean' = 平均（旧）

  // ── Step 1. 画到原图全分辨率离屏 canvas ──────────────────
  const src = document.createElement('canvas');
  src.width  = img.naturalWidth  || img.width;
  src.height = img.naturalHeight || img.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img, 0, 0);
  const srcData = sctx.getImageData(0, 0, src.width, src.height).data;

  // ── Step 2. 把全图采样到 cols × rows ───────────────────
  // sampling = 'mode'     投票——按 4bit/通道分桶，取最大桶均值；净边/卡通好
  // sampling = 'mean'     box-filter 平均；照片渐变好但会晕染边缘
  // sampling = 'pixelart' 中心采样——只取每格中心 40% 区域的 mode；像素画专用
  const buf = new Float32Array(cols * rows * 4);
  const W = src.width, H = src.height;

  for (let py = 0; py < rows; py++) {
    const y0 = Math.floor(py * H / rows);
    const y1 = Math.max(y0 + 1, Math.floor((py + 1) * H / rows));
    for (let px = 0; px < cols; px++) {
      const x0 = Math.floor(px * W / cols);
      const x1 = Math.max(x0 + 1, Math.floor((px + 1) * W / cols));
      const k = (py * cols + px) * 4;

      if (sampling === 'pixelart') {
        // 只采格子中心 40% 的区域，彻底排除边缘反走样像素的干扰
        const marg = Math.max(0, Math.floor((x1 - x0) * 0.3));
        const margY = Math.max(0, Math.floor((y1 - y0) * 0.3));
        const cx0 = x0 + marg, cx1 = Math.max(cx0 + 1, x1 - marg);
        const cy0 = y0 + margY, cy1 = Math.max(cy0 + 1, y1 - margY);
        const [r, g, b, a] = sampleCellMode(srcData, W, cx0, cy0, cx1, cy1);
        buf[k] = r; buf[k + 1] = g; buf[k + 2] = b; buf[k + 3] = a;
      } else if (sampling === 'mode') {
        const [r, g, b, a] = sampleCellMode(srcData, W, x0, y0, x1, y1);
        buf[k] = r; buf[k + 1] = g; buf[k + 2] = b; buf[k + 3] = a;
      } else {
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            r += srcData[i]; g += srcData[i + 1]; b += srcData[i + 2]; a += srcData[i + 3]; n++;
          }
        }
        buf[k] = r / n; buf[k + 1] = g / n; buf[k + 2] = b / n; buf[k + 3] = a / n;
      }
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

  // ── Step 3.2 风格化预设（8-bit/漫画描边/水彩/黑白）──────
  if (style && style !== 'none') {
    applyStyle(buf, cols, rows, style);
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
 * 模式采样（净边采样）：把格子里的源像素按 4 位/通道（16³=4096 桶）分桶，
 * 取像素数最多那个桶的均值作为格子颜色。透明度走原始平均（避免边缘抖动）。
 *
 * 为什么 mode 解决"卡通描边变成杂色阶梯"：
 *   边缘格 60% 白 + 40% 黑 → 白桶赢 → 格子白；下一格 40% 白 + 60% 黑 → 黑桶赢 → 格子黑
 *   描边整条单色，不再被反走样像素平均成各种"米/灰/褐"。
 *
 * "暗少数派救援"：只挑最多桶会丢小特征——粗格子里嘴/眼/细轮廓只占 5-10%
 * 像素，会被白色背景压死。规则：当主胜方很亮（>180）且某个少数桶
 *   1) 比主胜方暗 ≥50 亮度
 *   2) saliency 分数 = 面积比 × √(亮度落差/200) ≥ 0.04
 * 就改用那个深色桶。这样嘴/眼/线条在低精细度下也能保住。
 */
function sampleCellMode(srcData, W, x0, y0, x1, y1) {
  const bins = new Map(); // 12-bit key (4 bits per channel) → [r, g, b, n]
  let sumA = 0, totalN = 0, validN = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4;
      const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2], a = srcData[i + 3];
      sumA += a;
      totalN++;
      if (a < 64) continue;
      validN++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key);
      if (bin) { bin[0] += r; bin[1] += g; bin[2] += b; bin[3]++; }
      else     { bins.set(key, [r, g, b, 1]); }
    }
  }
  const avgA = totalN ? sumA / totalN : 0;
  if (bins.size === 0) return [0, 0, 0, avgA];

  // 主胜方
  let winner = null, winnerN = 0;
  bins.forEach(bin => { if (bin[3] > winnerN) { winnerN = bin[3]; winner = bin; } });

  // 暗少数派救援：仅当主胜方是浅色（背景/填充）才触发
  const winnerBright = (winner[0] + winner[1] + winner[2]) / (3 * winner[3]);
  if (winnerBright > 180 && validN > 0) {
    let bestDark = null, bestScore = 0;
    bins.forEach(bin => {
      if (bin === winner) return;
      const bright = (bin[0] + bin[1] + bin[2]) / (3 * bin[3]);
      const drop = winnerBright - bright;
      if (drop < 50) return;                         // 必须明显暗
      const pct = bin[3] / validN;
      const score = pct * Math.sqrt(drop / 200);
      if (score > 0.04 && score > bestScore) { bestScore = score; bestDark = bin; }
    });
    if (bestDark) winner = bestDark;
  }

  return [winner[0] / winner[3], winner[1] / winner[3], winner[2] / winner[3], avgA];
}

/**
 * 风格化预设：在量化前对降采样后的图像做艺术化变形。
 * 不会真的把照片变成 Stardew，但能给照片加明显的"卡通/复古"味道。
 */
function applyStyle(buf, cols, rows, style) {
  switch (style) {
    case '8bit':       // 复古 8-bit：极少色阶 + 高饱和
      posterize(buf, 4);
      adjustSaturation(buf, 1.45);
      break;
    case 'comic':      // 漫画描边：海报化 + Sobel 黑色描边
      adjustSaturation(buf, 1.2);
      posterize(buf, 5);
      sobelOutline(buf, cols, rows, 70);
      break;
    case 'watercolor': // 水彩：强双边平滑 + 略降饱和
      bilateralSmooth(buf, cols, rows, 35, 3);
      adjustSaturation(buf, 0.85);
      posterize(buf, 6);
      break;
    case 'noir':       // 单色版画：去饱和 + 二值化描边
      adjustSaturation(buf, 0.0);
      posterize(buf, 3);
      sobelOutline(buf, cols, rows, 50);
      break;
  }
}

/**
 * 海报化：每个通道压缩到 levels 个色阶。levels 越小越"卡通"。
 */
function posterize(buf, levels) {
  const step = 255 / (levels - 1);
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 64) continue;
    buf[i]     = Math.round(buf[i]     / step) * step;
    buf[i + 1] = Math.round(buf[i + 1] / step) * step;
    buf[i + 2] = Math.round(buf[i + 2] / step) * step;
  }
}

/**
 * 调整饱和度。factor=1 不变；>1 更艳；0 = 黑白。
 */
function adjustSaturation(buf, factor) {
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i + 3] < 64) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    buf[i]     = Math.max(0, Math.min(255, gray + (r - gray) * factor));
    buf[i + 1] = Math.max(0, Math.min(255, gray + (g - gray) * factor));
    buf[i + 2] = Math.max(0, Math.min(255, gray + (b - gray) * factor));
  }
}

/**
 * Sobel 边缘检测：超过阈值的像素直接涂黑，做"描边"效果。
 */
function sobelOutline(buf, cols, rows, threshold) {
  const gray = new Float32Array(cols * rows);
  for (let i = 0, k = 0; i < buf.length; i += 4, k++) {
    gray[k] = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2];
  }
  const edges = new Uint8Array(cols * rows);
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const tl = gray[i - cols - 1], tc = gray[i - cols], tr = gray[i - cols + 1];
      const ml = gray[i - 1],                              mr = gray[i + 1];
      const bl = gray[i + cols - 1], bc = gray[i + cols], br = gray[i + cols + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      if (Math.sqrt(gx * gx + gy * gy) > threshold) edges[i] = 1;
    }
  }
  for (let i = 0, k = 0; i < buf.length; i += 4, k++) {
    if (edges[k]) { buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; }
  }
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

/**
 * 自动识别像素画的放大倍数（块尺寸）。
 *
 * 核心原理：对于一张 N× 放大的像素画，相邻像素颜色变化永远发生在 N 的整数倍位置，
 * 因此所有水平/垂直"色段"长度都是 N 的倍数，GCD（最大公约数）= N。
 *
 * 步骤：
 *  1. 把图缩到 ≤800px（大图检测速度慢）
 *  2. 对颜色做 5bit/通道量化（消除 JPEG 压缩噪声）
 *  3. 扫描若干行/列，收集所有连续同色段长度
 *  4. 返回所有段长的 GCD，再换算回原图坐标
 *
 * 返回 { blockSize, cols, rows }
 *  - blockSize: 原图上每个"像素画像素"的边长（单位：原图像素）
 *  - cols/rows: 建议的图纸尺寸（已 clamp 到 5–200）
 */
function detectPixelBlockSize(img) {
  const W0 = img.naturalWidth  || img.width;
  const H0 = img.naturalHeight || img.height;
  const MAX_DIM = 800;
  const scale = Math.min(1, MAX_DIM / Math.max(W0, H0));
  const W = Math.round(W0 * scale);
  const H = Math.round(H0 * scale);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;

  // 5 bit/channel 量化：消除轻微 JPEG 压缩色差
  const qkey = (i) => ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);

  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  let g = 0;

  // 扫描约 40 行（均匀分布）
  const rowSamples = Math.min(40, H);
  for (let si = 0; si < rowSamples && g !== 1; si++) {
    const y = Math.floor(si * H / rowSamples);
    let run = 1, prev = qkey(y * W * 4);
    for (let x = 1; x < W; x++) {
      const k = qkey((y * W + x) * 4);
      if (k === prev) { run++; }
      else { g = g ? gcd(g, run) : run; run = 1; prev = k; }
    }
    g = g ? gcd(g, run) : run;
  }

  // 扫描约 40 列（均匀分布）
  const colSamples = Math.min(40, W);
  for (let si = 0; si < colSamples && g !== 1; si++) {
    const x = Math.floor(si * W / colSamples);
    let run = 1, prev = qkey(x * 4);
    for (let y = 1; y < H; y++) {
      const k = qkey((y * W + x) * 4);
      if (k === prev) { run++; }
      else { g = g ? gcd(g, run) : run; run = 1; prev = k; }
    }
    g = g ? gcd(g, run) : run;
  }

  // 转回原图坐标（最小 1）
  const blockSize = Math.max(1, Math.round(g / scale));
  const cols = Math.max(5, Math.min(200, Math.round(W0 / blockSize)));
  const rows = Math.max(5, Math.min(200, Math.round(H0 / blockSize)));
  return { blockSize, cols, rows };
}

