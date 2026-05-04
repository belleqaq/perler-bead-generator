/**
 * exporter.js — 导出 PNG / SVG / PDF / 打印
 */

const Exporter = {

  // ─── PNG ──────────────────────────────────────────────────
  exportPNG(editor, filename = 'pattern.png') {
    const oc = editor.renderToCanvas(20);
    oc.toBlob(blob => {
      this._download(blob, filename);
    }, 'image/png');
  },

  /**
   * 像素画 PNG：每格 = 一块纯色方块，无网格、无坐标、无珠样、无背景（透明）。
   * 适合贴 Discord/社交/二次创作。空格保持透明。
   * 输出尺寸：每格 16px（32×32 图纸 → 512×512；100×100 → 1600×1600）。
   */
  exportPNGPixelArt(editor, filename = 'pattern-pixel.png') {
    const SCALE = 16;
    const { cols, rows, grid } = editor;
    const c = document.createElement('canvas');
    c.width  = cols * SCALE;
    c.height = rows * SCALE;
    const ctx = c.getContext('2d');
    // 透明背景：不调 fillRect 全屏，跳过空格即可
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cell = grid[y][x];
        if (!cell) continue;
        ctx.fillStyle = cell.hex;
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    c.toBlob(blob => this._download(blob, filename), 'image/png');
  },

  // ─── SVG ──────────────────────────────────────────────────
  exportSVG(editor, filename = 'pattern.svg', opts = {}) {
    const cell = opts.cell || 20;
    const margin = opts.margin || 30;
    const showCodes = opts.showCodes !== false;
    const { cols, rows, grid } = editor;
    const W = cols * cell + margin * 2;
    const H = rows * cell + margin * 2;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    svg += `<rect width="${W}" height="${H}" fill="#F5EFE4"/>`;

    // Cells
    const useSquare = (editor.beadShape || 'square') === 'square';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = grid[y][x];
        const px = margin + x * cell;
        const py = margin + y * cell;
        if (c) {
          const cx = px + cell / 2;
          const cy = py + cell / 2;
          if (useSquare) {
            const inset = 0.5;
            svg += `<rect x="${px + inset}" y="${py + inset}" width="${cell - inset * 2}" height="${cell - inset * 2}" `
                +  `fill="${c.hex}" stroke="rgba(0,0,0,0.2)" stroke-width="0.4"/>`;
          } else {
            const r = cell * 0.42;
            svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.hex}" stroke="rgba(0,0,0,0.25)" stroke-width="0.6"/>`;
          }
          if (showCodes && cell >= 14) {
            const lum = this._luminance(c.hex);
            const txtColor = lum > 0.55 ? '#222' : '#fff';
            const num = c.code.replace(/^H/, '');
            svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" `
                +  `font-family="monospace" font-size="${Math.max(6, cell * 0.42)}" fill="${txtColor}">${num}</text>`;
          }
        } else {
          // empty hole indicator
          svg += `<circle cx="${px + cell / 2}" cy="${py + cell / 2}" r="${cell * 0.1}" fill="#CFC9BD"/>`;
        }
      }
    }

    // Grid lines
    for (let x = 0; x <= cols; x++) {
      const major = x % 5 === 0;
      svg += `<line x1="${margin + x * cell}" y1="${margin}" x2="${margin + x * cell}" y2="${margin + rows * cell}" `
          + `stroke="rgba(0,0,0,${major ? 0.35 : 0.12})" stroke-width="${major ? 1 : 0.5}"/>`;
    }
    for (let y = 0; y <= rows; y++) {
      const major = y % 5 === 0;
      svg += `<line x1="${margin}" y1="${margin + y * cell}" x2="${margin + cols * cell}" y2="${margin + y * cell}" `
          + `stroke="rgba(0,0,0,${major ? 0.35 : 0.12})" stroke-width="${major ? 1 : 0.5}"/>`;
    }

    // Coordinate labels
    svg += `<g font-family="monospace" font-size="10" fill="#6B6560">`;
    for (let x = 0; x < cols; x += 5) {
      svg += `<text x="${margin + x * cell + cell / 2}" y="${margin - 6}" text-anchor="middle">${x + 1}</text>`;
    }
    for (let y = 0; y < rows; y += 5) {
      svg += `<text x="${margin - 6}" y="${margin + y * cell + cell / 2}" text-anchor="end" dominant-baseline="central">${y + 1}</text>`;
    }
    svg += `</g></svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    this._download(blob, filename);
  },

  // ─── JSON 工程文件 ─────────────────────────────────────────
  exportProject(editor, filename = 'project.bead.json') {
    const data = {
      version: 1,
      cols: editor.cols,
      rows: editor.rows,
      grid: editor.grid.map(row => row.map(c => c ? c.code : null)),
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this._download(blob, filename);
  },

  loadProject(file, editor) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.grid || !Array.isArray(data.grid)) throw new Error('Invalid project');
          const grid = data.grid.map(row =>
            row.map(code => code ? findColorByCode(code) : null)
          );
          editor.loadGrid(grid);
          resolve(data);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  },

  // ─── 打印 / PDF (window.print) ─────────────────────────────
  /**
   * 打开新窗口生成可打印的图纸 (用户可选择"另存为 PDF")
   * @param {BeadEditor} editor
   * @param {Object} opts { codedGrid, coloredGrid, statsTable, materialsList }
   */
  printPattern(editor, opts = {}) {
    const html = this._buildPrintHTML(editor, opts);
    const w = window.open('', '_blank');
    if (!w) { alert(t('export.popup-blocked') || 'Popup blocked'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    // give the browser time to layout
    setTimeout(() => { w.print(); }, 500);
  },

  // ─── PDF 文件 (jsPDF) ─────────────────────────────────────
  // 关键：jsPDF 默认 helvetica 字体不含 CJK 字形，直接 doc.text 中文会乱码。
  // 解法：所有文字都先用 canvas 的 fillText（用系统 PingFang/Noto 字体，原生支持
  // 中英任何语言）渲染成图，jsPDF 只负责 addImage 拼版。零字体依赖。
  async exportPDF(editor, opts = {}) {
    if (typeof window.jspdf === 'undefined') {
      alert('jsPDF not loaded');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PAGE_W = 210, PAGE_H = 297, M = 12;
    const CONTENT_W = PAGE_W - 2 * M;
    let y = M;

    const stats = editor.getColorStats();
    const total = editor.getTotalBeads();

    const place = (img, maxWmm) => {
      const wmm = Math.min(CONTENT_W, maxWmm ?? CONTENT_W);
      const hmm = wmm * (img.height / img.width);
      if (y + hmm > PAGE_H - M) { doc.addPage(); y = M; }
      doc.addImage(img.dataURL, 'PNG', M, y, wmm, hmm);
      y += hmm + 4;
    };

    // ── 标题 + meta ──────────────────────────────────────
    place(this._renderTitleBlock(editor, stats, total));
    y += 2;

    // ── 带色号网格 ───────────────────────────────────────
    if (opts.codedGrid !== false) {
      place(this._renderSectionHeader(t('pdf.coded')), 80);
      place(this._renderGridImageDataURL(editor, { coded: true, cell: 24 }), 170);
      y += 2;
    }

    // ── 彩色网格 ─────────────────────────────────────────
    if (opts.coloredGrid !== false) {
      place(this._renderSectionHeader(t('pdf.colored')), 80);
      place(this._renderGridImageDataURL(editor, { coded: false, cell: 24 }), 170);
      y += 2;
    }

    // ── 材料清单 ─────────────────────────────────────────
    if (opts.materialsList !== false && stats.length) {
      place(this._renderSectionHeader(t('pdf.materials')), 80);
      // 表格可能很长，按页分批
      const rowsPerPage = 38;
      for (let i = 0; i < stats.length; i += rowsPerPage) {
        const chunk = stats.slice(i, i + rowsPerPage);
        const tableImg = this._renderMaterialsTable(chunk, total, i === 0);
        place(tableImg);
      }
    }

    doc.save('perler-pattern.pdf');
  },

  // ─── 内部：渲染文字块到 canvas（用系统 CJK 字体）──────────
  _txtCanvas(width, height) {
    const dpr = 2; // PDF 高清
    const c = document.createElement('canvas');
    c.width = width * dpr;
    c.height = height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.textBaseline = 'top';
    return { c, ctx, dpr, w: width, h: height };
  },

  _font(size, weight = 'normal') {
    return `${weight} ${size}px -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Helvetica Neue", Arial, sans-serif`;
  },

  _renderTitleBlock(editor, stats, total) {
    const W = 800, H = 90;
    const { c, ctx } = this._txtCanvas(W, H);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.fillStyle = '#1d1a16';
    ctx.font = this._font(28, 'bold');
    ctx.fillText(t('pdf.title'), 0, 0);

    // 分隔线
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 42); ctx.lineTo(W, 42);
    ctx.stroke();

    // meta
    ctx.fillStyle = '#555';
    ctx.font = this._font(13);
    const meta = [
      `${t('pdf.size')}: ${editor.cols} × ${editor.rows}`,
      `${t('pdf.total')}: ${total}`,
      `${t('pdf.colors')}: ${stats.length}`,
      `${t('pdf.generated')}: ${new Date().toLocaleString()}`,
    ];
    meta.forEach((line, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      ctx.fillText(line, col * (W / 2), 52 + row * 19);
    });

    return { dataURL: c.toDataURL('image/png'), width: c.width, height: c.height };
  },

  _renderSectionHeader(text) {
    const W = 800, H = 38;
    const { c, ctx } = this._txtCanvas(W, H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1d1a16';
    ctx.font = this._font(15, 'bold');
    ctx.fillText(text, 0, 6);
    ctx.strokeStyle = '#1d1a16';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, 30); ctx.lineTo(W, 30);
    ctx.stroke();
    return { dataURL: c.toDataURL('image/png'), width: c.width, height: c.height };
  },

  _renderMaterialsTable(rows, total, includeHeader) {
    const W = 800;
    const ROW_H = 22;
    const HEADER_H = includeHeader ? 26 : 0;
    const H = HEADER_H + rows.length * ROW_H + 4;
    const { c, ctx } = this._txtCanvas(W, H);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    const COL = { code: 32, name: 130, count: 600, pct: 720 };

    if (includeHeader) {
      ctx.fillStyle = '#f5efe4';
      ctx.fillRect(0, 0, W, HEADER_H);
      ctx.fillStyle = '#1d1a16';
      ctx.font = this._font(12, 'bold');
      ctx.fillText(t('stats.code'),  COL.code, 5);
      ctx.fillText(t('stats.name'),  COL.name, 5);
      ctx.textAlign = 'right';
      ctx.fillText(t('stats.count'), COL.count, 5);
      ctx.fillText('%',              COL.pct,   5);
      ctx.textAlign = 'left';
    }

    ctx.font = this._font(12);
    let y = HEADER_H + 2;
    for (const s of rows) {
      // 行底分割线
      ctx.strokeStyle = '#e6e0d2';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_H - 1); ctx.lineTo(W, y + ROW_H - 1);
      ctx.stroke();

      // 色块
      ctx.fillStyle = s.color.hex;
      ctx.fillRect(8, y + 4, 14, 14);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(8, y + 4, 14, 14);

      // 文字
      ctx.fillStyle = '#1d1a16';
      ctx.fillText(s.color.code, COL.code, y + 5);
      ctx.fillText(colorName(s.color.code), COL.name, y + 5);
      ctx.textAlign = 'right';
      ctx.fillText(String(s.count), COL.count, y + 5);
      ctx.fillText(((s.count / total) * 100).toFixed(1) + '%', COL.pct, y + 5);
      ctx.textAlign = 'left';

      y += ROW_H;
    }

    return { dataURL: c.toDataURL('image/png'), width: c.width, height: c.height };
  },

  // ─── 内部：渲染网格为 dataURL ──────────────────────────────
  _renderGridImageDataURL(editor, { coded, cell = 22 } = {}) {
    const { cols, rows, grid } = editor;
    const margin = 22;
    const W = cols * cell + margin * 2;
    const H = rows * cell + margin * 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // coordinate labels
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x < cols; x += 5) {
      ctx.fillText(String(x + 1), margin + x * cell + cell / 2, margin / 2);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y < rows; y += 5) {
      ctx.fillText(String(y + 1), margin - 4, margin + y * cell + cell / 2);
    }

    // cells
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = margin + x * cell;
        const py = margin + y * cell;
        const cell_color = grid[y][x];
        if (cell_color) {
          if (coded) {
            // outlined cell with code letter
            ctx.fillStyle = cell_color.hex;
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
            const lum = Exporter._luminance(cell_color.hex);
            ctx.fillStyle = lum > 0.55 ? '#222' : '#fff';
            ctx.font = `bold ${Math.max(7, cell * 0.45)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const num = cell_color.code.replace(/^H/, '');
            ctx.fillText(num, px + cell / 2, py + cell / 2);
          } else {
            // filled circle (color preview)
            ctx.beginPath();
            ctx.arc(px + cell / 2, py + cell / 2, cell * 0.42, 0, Math.PI * 2);
            ctx.fillStyle = cell_color.hex;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
    }

    // grid lines
    for (let x = 0; x <= cols; x++) {
      const major = x % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = major ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(margin + x * cell, margin);
      ctx.lineTo(margin + x * cell, margin + rows * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      const major = y % 5 === 0;
      ctx.strokeStyle = major ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)';
      ctx.lineWidth = major ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(margin, margin + y * cell);
      ctx.lineTo(margin + cols * cell, margin + y * cell);
      ctx.stroke();
    }

    return { dataURL: c.toDataURL('image/png'), width: W, height: H };
  },

  // ─── 内部：构造可打印 HTML ─────────────────────────────────
  _buildPrintHTML(editor, opts = {}) {
    const stats = editor.getColorStats();
    const total = editor.getTotalBeads();
    const codedURL  = this._renderGridImageDataURL(editor, { coded: true,  cell: 26 }).dataURL;
    const colorURL  = this._renderGridImageDataURL(editor, { coded: false, cell: 26 }).dataURL;
    const date = new Date().toLocaleString();

    const showCoded   = opts.codedGrid     !== false;
    const showColored = opts.coloredGrid   !== false;
    const showStats   = opts.statsTable    !== false;
    const showMats    = opts.materialsList !== false;

    const statsRows = stats.map(s => {
      const pct = ((s.count / total) * 100).toFixed(1);
      return `<tr>
        <td><span class="sw" style="background:${s.color.hex}"></span>${s.color.code}</td>
        <td>${colorName(s.color.code)}</td>
        <td class="num">${s.count}</td>
        <td class="num">${pct}%</td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="${getLang() === 'zh' ? 'zh-CN' : 'en'}"><head>
<meta charset="UTF-8"><title>${t('pdf.title')}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; color: #1d1a16; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: 0.02em; }
  h2 { font-size: 13pt; margin: 14pt 0 4pt; padding-bottom: 3pt; border-bottom: 1px solid #444; letter-spacing: 0.05em; text-transform: uppercase; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 18pt; font-size: 10pt; color: #555; margin-bottom: 6pt; padding-bottom: 6pt; border-bottom: 2px solid #1d1a16; }
  .grid-img { display: block; max-width: 100%; max-height: 230mm; margin: 4pt auto; border: 1px solid #ddd; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4pt; }
  th, td { padding: 4pt 6pt; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f5efe4; font-weight: 700; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .sw { display: inline-block; width: 10pt; height: 10pt; vertical-align: middle; margin-right: 5pt; border: 1px solid rgba(0,0,0,0.3); }
  .footer { margin-top: 14pt; font-size: 8pt; color: #999; text-align: center; }
  .page-break { page-break-before: always; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <h1>${t('pdf.title')}</h1>
  <div class="meta">
    <div><strong>${t('pdf.size')}:</strong> ${editor.cols} × ${editor.rows}</div>
    <div><strong>${t('pdf.total')}:</strong> ${total} ${t('stats.beads')}</div>
    <div><strong>${t('pdf.colors')}:</strong> ${stats.length} ${t('stats.colors')}</div>
    <div><strong>${t('pdf.generated')}:</strong> ${date}</div>
  </div>

  ${showCoded ? `
  <h2>${t('pdf.coded')}</h2>
  <img class="grid-img" src="${codedURL}" alt="coded grid">` : ''}

  ${showColored ? `
  <div class="${showCoded ? 'page-break' : ''}"></div>
  <h2>${t('pdf.colored')}</h2>
  <img class="grid-img" src="${colorURL}" alt="colored grid">` : ''}

  ${showMats || showStats ? `
  <div class="page-break"></div>
  <h2>${t('pdf.materials')}</h2>
  <table>
    <thead><tr>
      <th>${t('stats.code')}</th>
      <th>${t('stats.name')}</th>
      <th class="num">${t('stats.count')}</th>
      <th class="num">%</th>
    </tr></thead>
    <tbody>${statsRows}</tbody>
  </table>` : ''}

  <div class="footer">${t('pdf.title')} · perler-bead-generator</div>
</body></html>`;
  },

  // ─── helpers ──────────────────────────────────────────────
  _luminance(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return 0;
    const [r, g, b] = [1, 2, 3].map(i => parseInt(m[i], 16) / 255);
    const lin = v => (v <= 0.03928) ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  },

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  },
};
