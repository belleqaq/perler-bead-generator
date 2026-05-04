/**
 * app.js — 主应用控制器
 */

(function () {
  'use strict';

  let editor;
  let lastImage = null;       // 最近一次上传的图片，用于实时重新转换
  let reprocessTimer = null;  // 防抖
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    applyI18n();

    const canvas = $('#bead-canvas');
    editor = new BeadEditor(canvas, { cols: 64, rows: 64, cellSize: 14 });
    window.editor = editor; // for debugging

    buildPalette();
    bindToolbar();
    bindSizeControls();
    bindActions();
    bindImageUpload();
    bindExport();
    bindLanguage();
    bindEditorEvents();

    updateStats();
    updateHistoryButtons();
    selectColor(HAMA_PALETTE[39]); // black default
  }

  // ─── 色板 ────────────────────────────────────────────────────
  function buildPalette() {
    const wrap = $('#palette-grid');
    wrap.innerHTML = '';
    HAMA_PALETTE.forEach(c => {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = c.hex;
      sw.dataset.code = c.code;
      sw.title = `${c.code} · ${colorName(c.code)}`;
      sw.setAttribute('aria-label', `${c.code} ${colorName(c.code)}`);
      // light color → dark border
      if (Exporter._luminance(c.hex) > 0.85) sw.classList.add('light');
      sw.addEventListener('click', () => selectColor(c));
      wrap.appendChild(sw);
    });
  }

  function selectColor(color) {
    editor.currentColor = color;
    $$('.swatch').forEach(el => el.classList.toggle('active', el.dataset.code === color.code));
    $('#current-color-swatch').style.background = color.hex;
    $('#current-color-code').textContent = color.code;
    $('#current-color-name').textContent = colorName(color.code);
  }

  // ─── 工具栏 ──────────────────────────────────────────────────
  function bindToolbar() {
    $$('[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        editor.tool = btn.dataset.tool;
        $$('[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  }

  // ─── 尺寸 ────────────────────────────────────────────────────
  function bindSizeControls() {
    $('#size-apply').addEventListener('click', () => {
      const cols = parseInt($('#size-cols').value, 10);
      const rows = parseInt($('#size-rows').value, 10);
      if (cols >= 5 && cols <= 200 && rows >= 5 && rows <= 200) {
        // 已上传图片且未启用自动尺寸 → 用新尺寸重新转换图片
        if (lastImage && !$('#opt-auto-size').checked) {
          reprocessImage();
        } else {
          editor.resize(cols, rows);
        }
      }
    });

    $$('[data-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const [c, r] = b.dataset.preset.split('x').map(Number);
        $('#size-cols').value = c;
        $('#size-rows').value = r;
        if (lastImage && !$('#opt-auto-size').checked) {
          reprocessImage();
        } else {
          editor.resize(c, r);
        }
      });
    });
  }

  // ─── 操作按钮 ────────────────────────────────────────────────
  function bindActions() {
    $('#btn-undo').addEventListener('click', () => editor.undo());
    $('#btn-redo').addEventListener('click', () => editor.redo());
    $('#btn-clear').addEventListener('click', () => {
      if (confirm(getLang() === 'zh' ? '确认清空画布？' : 'Clear canvas?')) editor.clear();
    });
    $('#btn-grid').addEventListener('click', () => {
      editor.showGrid = !editor.showGrid;
      $('#btn-grid').classList.toggle('active', editor.showGrid);
      editor.render();
    });
    $('#btn-numbers').addEventListener('click', () => {
      editor.showNumbers = !editor.showNumbers;
      $('#btn-numbers').classList.toggle('active', editor.showNumbers);
      editor.render();
    });
    $('#btn-shape').addEventListener('click', () => {
      editor.beadShape = editor.beadShape === 'square' ? 'round' : 'square';
      const btn = $('#btn-shape');
      btn.textContent = editor.beadShape === 'square' ? t('action.shape') : t('action.shape-round');
      editor.render();
    });
  }

  // ─── 图片上传 ────────────────────────────────────────────────
  function bindImageUpload() {
    const drop = $('#drop-zone');
    const fileInput = $('#image-input');

    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleImage(e.target.files[0]);
    });

    drop.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));

    drop.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (f) handleImage(f);
    });

    // 滑块实时显示数值
    const bSlider = $('#opt-brightness'), bVal = $('#opt-brightness-val');
    if (bSlider) bSlider.addEventListener('input', () => bVal.textContent = bSlider.value);
    const cSlider = $('#opt-contrast'),   cVal = $('#opt-contrast-val');
    if (cSlider) cSlider.addEventListener('input', () => cVal.textContent = parseFloat(cSlider.value).toFixed(1));
    const tSlider = $('#opt-target-size'), tVal = $('#opt-target-size-val');
    if (tSlider) tSlider.addEventListener('input', () => tVal.textContent = tSlider.value);
    const kSlider = $('#opt-kmeans'), kVal = $('#opt-kmeans-val');
    if (kSlider) {
      const syncK = () => {
        const v = parseInt(kSlider.value, 10);
        kVal.textContent = (v < 2) ? t('image.kmeans-off') : v;
      };
      kSlider.addEventListener('input', syncK);
      document.addEventListener('lang:changed', syncK);
      syncK();
    }
    const sSlider = $('#opt-smooth'), sVal = $('#opt-smooth-val');
    if (sSlider) {
      const syncS = () => {
        const v = parseInt(sSlider.value, 10);
        sVal.textContent = (v <= 0) ? t('image.kmeans-off') : v;
      };
      sSlider.addEventListener('input', syncS);
      document.addEventListener('lang:changed', syncS);
      syncS();
    }
    const mcSlider = $('#opt-max-colors'), mcVal = $('#opt-max-colors-val');
    if (mcSlider) {
      const syncMC = () => {
        const v = parseInt(mcSlider.value, 10);
        mcVal.textContent = (v < 2) ? t('image.kmeans-off') : v;
      };
      mcSlider.addEventListener('input', syncMC);
      document.addEventListener('lang:changed', syncMC);
      syncMC();
    }
    const mrSlider = $('#opt-min-region'), mrVal = $('#opt-min-region-val');
    if (mrSlider) {
      const syncMR = () => {
        const v = parseInt(mrSlider.value, 10);
        mrVal.textContent = (v <= 1) ? t('image.kmeans-off') : v;
      };
      mrSlider.addEventListener('input', syncMR);
      document.addEventListener('lang:changed', syncMR);
      syncMR();
    }

    // 自动尺寸开关：禁用手动 cols/rows
    const autoSize = $('#opt-auto-size');
    if (autoSize) {
      const sync = () => {
        const disabled = autoSize.checked;
        $('#size-cols').disabled = disabled;
        $('#size-rows').disabled = disabled;
        $('#opt-target-size').disabled = !disabled;
      };
      autoSize.addEventListener('change', sync);
      sync();
    }

    // 图片上传后，调整任何转换参数都自动重新生成
    ['#opt-target-size', '#opt-brightness', '#opt-contrast', '#opt-kmeans', '#opt-smooth',
     '#opt-max-colors', '#opt-min-region'].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener('input', scheduleReprocess);
    });
    ['#opt-dither', '#opt-auto-size'].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener('change', scheduleReprocess);
    });
  }

  // 防抖触发重新处理
  function scheduleReprocess() {
    if (!lastImage) return;
    clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(reprocessImage, 120);
  }

  // 用当前控件参数重新转换最近一次上传的图片
  function reprocessImage() {
    if (!lastImage) return;
    let cols, rows;
    if ($('#opt-auto-size').checked) {
      const target = parseInt($('#opt-target-size').value, 10) || 80;
      const s = suggestSize(lastImage, target);
      cols = s.cols; rows = s.rows;
      $('#size-cols').value = cols;
      $('#size-rows').value = rows;
    } else {
      cols = parseInt($('#size-cols').value, 10) || 64;
      rows = parseInt($('#size-rows').value, 10) || 64;
    }
    const grid = imageToGrid(lastImage, cols, rows, {
      dither: $('#opt-dither').checked,
      contrast: parseFloat($('#opt-contrast').value) || 1.0,
      brightness: parseInt($('#opt-brightness').value, 10) || 0,
      kmeans:    parseInt($('#opt-kmeans').value, 10) || 0,
      smooth:    parseInt($('#opt-smooth').value, 10) || 0,
      maxColors: parseInt($('#opt-max-colors').value, 10) || 0,
      minRegion: parseInt($('#opt-min-region').value, 10) || 1,
    });
    editor.loadGrid(grid);
  }

  async function handleImage(file) {
    try {
      lastImage = await loadImageFile(file);
      reprocessImage();
    } catch (err) {
      alert((getLang() === 'zh' ? '图片加载失败：' : 'Image load failed: ') + err.message);
    }
  }

  // ─── 导出 ────────────────────────────────────────────────────
  function bindExport() {
    $('#exp-png').addEventListener('click', () => Exporter.exportPNG(editor));
    $('#exp-svg').addEventListener('click', () => Exporter.exportSVG(editor));
    $('#exp-print').addEventListener('click', () => Exporter.printPattern(editor, getExportOpts()));
    $('#exp-pdf').addEventListener('click', () => Exporter.exportPDF(editor, getExportOpts()));
    $('#exp-json').addEventListener('click', () => Exporter.exportProject(editor));

    $('#proj-input').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { await Exporter.loadProject(f, editor); }
      catch (err) {
        alert((getLang() === 'zh' ? '工程文件无效：' : 'Invalid project file: ') + err.message);
      }
      e.target.value = '';
    });
    $('#exp-json-load').addEventListener('click', () => $('#proj-input').click());
  }

  function getExportOpts() {
    return {
      codedGrid:     $('#opt-coded').checked,
      coloredGrid:   $('#opt-colored').checked,
      statsTable:    $('#opt-stats').checked,
      materialsList: $('#opt-materials').checked,
    };
  }

  // ─── 语言切换 ────────────────────────────────────────────────
  function bindLanguage() {
    $('#btn-lang').addEventListener('click', () => {
      setLang(getLang() === 'zh' ? 'en' : 'zh');
    });
    document.addEventListener('lang:changed', () => {
      buildPalette();
      selectColor(editor.currentColor);
      updateStats();
    });
  }

  // ─── Editor 事件桥接 ─────────────────────────────────────────
  function bindEditorEvents() {
    document.addEventListener('bead:gridChanged', updateStats);
    document.addEventListener('bead:historyChanged', updateHistoryButtons);
    document.addEventListener('bead:colorPicked', (e) => selectColor(e.detail));
  }

  // ─── 统计 ────────────────────────────────────────────────────
  function updateStats() {
    const stats = editor.getColorStats();
    const total = editor.getTotalBeads();
    $('#stat-total').textContent = total;
    $('#stat-colors').textContent = stats.length;

    const list = $('#stats-list');
    list.innerHTML = '';
    if (!stats.length) {
      const empty = document.createElement('div');
      empty.className = 'stats-empty';
      empty.textContent = t('stats.empty');
      list.appendChild(empty);
      return;
    }
    stats.forEach(s => {
      const row = document.createElement('div');
      row.className = 'stats-row';
      const pct = ((s.count / total) * 100).toFixed(1);
      row.innerHTML = `
        <span class="stats-sw" style="background:${s.color.hex}"></span>
        <span class="stats-code">${s.color.code}</span>
        <span class="stats-name">${colorName(s.color.code)}</span>
        <span class="stats-count">${s.count}</span>
        <span class="stats-pct">${pct}%</span>`;
      row.addEventListener('click', () => selectColor(s.color));
      list.appendChild(row);
    });
  }

  function updateHistoryButtons() {
    $('#btn-undo').disabled = !editor.canUndo;
    $('#btn-redo').disabled = !editor.canRedo;
  }

})();
