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
            row.map(code => code ? HAMA_PALETTE.find(c => c.code === code) || null : null)
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
  async exportPDF(editor, opts = {}) {
    if (typeof window.jspdf === 'undefined') {
      alert('jsPDF not loaded');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const PAGE_W = 210, PAGE_H = 297, M = 12;
    let y = M;

    // ── Title block ──────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(t('pdf.title'), M, y + 6);
    y += 10;
    doc.setDrawColor(60); doc.setLineWidth(0.4);
    doc.line(M, y, PAGE_W - M, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const stats = editor.getColorStats();
    const total = editor.getTotalBeads();
    const meta = [
      `${t('pdf.size')}: ${editor.cols} × ${editor.rows}`,
      `${t('pdf.total')}: ${total}`,
      `${t('pdf.colors')}: ${stats.length}`,
      `${t('pdf.generated')}: ${new Date().toLocaleString()}`,
    ];
    meta.forEach((line, i) => doc.text(line, M + (i % 2) * 95, y + Math.floor(i / 2) * 5));
    y += 14;

    // ── Coded grid ───────────────────────────────────────
    if (opts.codedGrid !== false) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(t('pdf.coded'), M, y);
      y += 4;

      const gridImg = this._renderGridImageDataURL(editor, { coded: true, cell: 24 });
      const aspect = gridImg.height / gridImg.width;
      const drawW = Math.min(PAGE_W - 2 * M, 160);
      const drawH = drawW * aspect;

      // page break check
      if (y + drawH > PAGE_H - M) { doc.addPage(); y = M; }

      doc.addImage(gridImg.dataURL, 'PNG', M, y, drawW, drawH);
      y += drawH + 8;
    }

    // ── Colored grid ─────────────────────────────────────
    if (opts.coloredGrid !== false) {
      if (y > PAGE_H - 80) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(t('pdf.colored'), M, y);
      y += 4;

      const gridImg = this._renderGridImageDataURL(editor, { coded: false, cell: 24 });
      const aspect = gridImg.height / gridImg.width;
      const drawW = Math.min(PAGE_W - 2 * M, 160);
      const drawH = drawW * aspect;

      if (y + drawH > PAGE_H - M) { doc.addPage(); y = M; }
      doc.addImage(gridImg.dataURL, 'PNG', M, y, drawW, drawH);
      y += drawH + 8;
    }

    // ── Materials list ───────────────────────────────────
    if (opts.materialsList !== false && stats.length) {
      if (y > PAGE_H - 60) { doc.addPage(); y = M; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(t('pdf.materials'), M, y);
      y += 6;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(t('stats.code'), M, y);
      doc.text(t('stats.name'), M + 25, y);
      doc.text(t('stats.count'), M + 90, y, { align: 'right' });
      doc.text('%', M + 110, y, { align: 'right' });
      y += 1;
      doc.line(M, y, M + 115, y);
      y += 4;

      doc.setFont('helvetica', 'normal');
      for (const s of stats) {
        if (y > PAGE_H - M) { doc.addPage(); y = M; }
        const pct = ((s.count / total) * 100).toFixed(1);
        // color swatch
        doc.setFillColor(s.color.hex);
        doc.rect(M - 0.2, y - 3, 3, 3, 'F');
        doc.setTextColor(30);
        doc.text(s.color.code, M + 5, y);
        doc.text(colorName(s.color.code), M + 25, y);
        doc.text(String(s.count), M + 90, y, { align: 'right' });
        doc.text(pct + '%', M + 110, y, { align: 'right' });
        y += 5;
      }
    }

    doc.save('perler-pattern.pdf');
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
