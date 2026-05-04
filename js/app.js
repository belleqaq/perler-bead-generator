/**
 * app.js — 主应用控制器
 */

(function () {
  'use strict';

  let editor;
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
        editor.resize(cols, rows);
      }
    });

    $$('[data-preset]').forEach(b => {
      b.addEventListener('click', () => {
        const [c, r] = b.dataset.preset.split('x').map(Number);
        $('#size-cols').value = c;
        $('#size-rows').value = r;
        editor.resize(c, r);
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
  }

  async function handleImage(file) {
    try {
      const img = await loadImageFile(file);

      // 1. 决定目标尺寸：勾选了"自动适配"就按图片宽高比建议；否则用当前输入框
      let cols, rows;
      if ($('#opt-auto-size').checked) {
        const target = parseInt($('#opt-target-size').value, 10) || 80;
        const s = suggestSize(img, target);
        cols = s.cols; rows = s.rows;
        $('#size-cols').value = cols;
        $('#size-rows').value = rows;
      } else {
        cols = parseInt($('#size-cols').value, 10) || 64;
        rows = parseInt($('#size-rows').value, 10) || 64;
      }

      // 2. 转换 (box-filter + 可选 dither)
      const grid = imageToGrid(img, cols, rows, {
        dither: $('#opt-dither').checked,
        contrast: parseFloat($('#opt-contrast').value) || 1.0,
        brightness: parseInt($('#opt-brightness').value, 10) || 0,
      });
      editor.loadGrid(grid);
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
