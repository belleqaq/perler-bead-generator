/**
 * app.js — 主应用控制器
 */

(function () {
  'use strict';

  let editor;
  let lastImage = null;       // 当前用于转换的图片（可能是去过背景或 AI 重绘后的）
  let originalImage = null;   // 用户最初上传的原图，用于"还原"
  let reprocessTimer = null;  // 防抖
  let activePalette = MARD_PALETTE;  // 当前生效的色板（按规模筛选后的子集）
  const subsetCache = new Map();     // size → palette 子集，避免重复计算
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    applyI18n();

    const canvas = $('#bead-canvas');
    editor = new BeadEditor(canvas, { cols: 64, rows: 64, cellSize: 14 });
    window.editor = editor; // for debugging

    bindPaletteSize();
    const savedSize = parseInt(localStorage.getItem('bead.palette_size'), 10);
    setPaletteSize(savedSize > 0 ? savedSize : MARD_PALETTE.length);
    bindToolbar();
    bindSizeControls();
    bindActions();
    bindImageUpload();
    bindExport();
    bindLanguage();
    bindEditorEvents();

    updateStats();
    updateHistoryButtons();
    // 默认色已由 setPaletteSize 设置（黑色锚点 H7）
  }

  // ─── 色板 ────────────────────────────────────────────────────
  function buildPalette() {
    const wrap = $('#palette-grid');
    wrap.innerHTML = '';
    activePalette.forEach(c => {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = c.hex;
      sw.dataset.code = c.code;
      sw.title = `${c.code} · ${c.hex}`;
      sw.setAttribute('aria-label', `${c.code} ${c.hex}`);
      if (Exporter._luminance(c.hex) > 0.85) sw.classList.add('light');
      sw.addEventListener('click', () => selectColor(c));
      wrap.appendChild(sw);
    });
  }

  /**
   * 从 MARD 221 里挑出 N 色子集——farthest-point sampling：
   * 先放黑白两个锚点，然后每次选离已选集合"最远"的色，直到 N 个。
   * 这样 N 色能均匀覆盖整个色域，不会全堆在一个色相里。
   * 没有官方 144/96 子集表时这是最合理的近似。
   */
  function pickPaletteSubset(n) {
    if (n >= MARD_PALETTE.length) return MARD_PALETTE.slice();
    if (subsetCache.has(n)) return subsetCache.get(n);

    const anchors = ['H7', 'H2'].map(code => MARD_PALETTE.find(c => c.code === code)).filter(Boolean);
    const picked = [...anchors];
    const pool = MARD_PALETTE.filter(c => !picked.includes(c));

    // 预算 RGB 缓存
    const rgb = new Map(MARD_PALETTE.map(c => [c.code, hexToRgb(c.hex)]));
    const minDist = new Map(); // pool color → 当前到 picked 的最近距离
    pool.forEach(c => {
      const [r, g, b] = rgb.get(c.code);
      let d = Infinity;
      for (const p of picked) {
        const [pr, pg, pb] = rgb.get(p.code);
        const dd = colorDistance(r, g, b, pr, pg, pb);
        if (dd < d) d = dd;
      }
      minDist.set(c.code, d);
    });

    while (picked.length < n && pool.length) {
      // 选 minDist 最大者
      let best = null, bestD = -Infinity;
      for (const c of pool) {
        const d = minDist.get(c.code);
        if (d > bestD) { bestD = d; best = c; }
      }
      picked.push(best);
      pool.splice(pool.indexOf(best), 1);
      // 更新剩余 pool 的 minDist
      const [br, bg, bb] = rgb.get(best.code);
      for (const c of pool) {
        const [r, g, b] = rgb.get(c.code);
        const dd = colorDistance(r, g, b, br, bg, bb);
        if (dd < minDist.get(c.code)) minDist.set(c.code, dd);
      }
    }

    // 按原色板顺序输出，方便色板面板里同系色仍然挨着
    const codes = new Set(picked.map(c => c.code));
    const result = MARD_PALETTE.filter(c => codes.has(c.code));
    subsetCache.set(n, result);
    return result;
  }

  function bindPaletteSize() {
    $$('.palette-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setPaletteSize(parseInt(btn.dataset.paletteSize, 10));
      });
    });
  }

  function setPaletteSize(n) {
    activePalette = pickPaletteSubset(n);
    $$('.palette-size-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.paletteSize, 10) === n));
    buildPalette();
    // 当前选中色不在新子集里 → 退到子集第一色
    if (!activePalette.find(c => c.code === editor.currentColor.code)) {
      selectColor(activePalette.find(c => c.code === 'H7') || activePalette[0]);
    } else {
      selectColor(editor.currentColor);
    }
    // 已上传图片 → 用新色板重新量化
    if (lastImage) reprocessImage();
    localStorage.setItem('bead.palette_size', String(n));
  }

  function selectColor(color) {
    editor.currentColor = color;
    $$('.swatch').forEach(el => el.classList.toggle('active', el.dataset.code === color.code));
    $('#current-color-swatch').style.background = color.hex;
    $('#current-color-code').textContent = color.code;
    $('#current-color-name').textContent = color.hex;
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
    ['#opt-dither', '#opt-auto-size', '#opt-style', '#opt-mode-sample'].forEach(sel => {
      const el = $(sel);
      if (el) el.addEventListener('change', scheduleReprocess);
    });

    bindAI();
    bindBackgroundRemoval();
    bindZoom();
  }

  // ─── 缩放 + 平移：长按按钮 + 键盘 ────────────────────────────
  function bindZoom() {
    const inBtn  = $('#zoom-in');
    const outBtn = $('#zoom-out');
    const rstBtn = $('#zoom-reset');
    const level  = $('#zoom-level');
    const upBtn    = $('#pan-up');
    const downBtn  = $('#pan-down');
    const leftBtn  = $('#pan-left');
    const rightBtn = $('#pan-right');
    const ctrBtn   = $('#pan-center');
    if (!inBtn) return;

    const refresh = () => {
      level.textContent = editor.cellSize;
      inBtn.disabled  = editor.cellSize >= editor.maxCellSize;
      outBtn.disabled = editor.cellSize <= BeadEditor.MIN_CELL;
      upBtn.disabled    = !editor.canPanUp;
      downBtn.disabled  = !editor.canPanDown;
      leftBtn.disabled  = !editor.canPanLeft;
      rightBtn.disabled = !editor.canPanRight;
      ctrBtn.disabled   = !(editor.canPanLeft || editor.canPanRight ||
                            editor.canPanUp   || editor.canPanDown);
    };
    document.addEventListener('bead:zoomChanged', refresh);
    document.addEventListener('bead:viewChanged', refresh);
    document.addEventListener('bead:gridChanged', refresh);
    refresh();

    // 缩放：自适应步进（当前尺寸的 18%，最少 ±3）
    const stepIn  = () => editor.zoom(Math.max(3, Math.round(editor.cellSize * 0.18)));
    const stepOut = () => editor.zoom(-Math.max(3, Math.round(editor.cellSize * 0.18)));
    attachLongPress(inBtn,  stepIn);
    attachLongPress(outBtn, stepOut);
    rstBtn.addEventListener('click', () => {
      editor.fitToView();
      refresh();
    });

    // 平移：每次 1 格，长按连续。Shift 倍速 5 格。
    attachLongPress(upBtn,    () => editor.pan(0, -1));
    attachLongPress(downBtn,  () => editor.pan(0, +1));
    attachLongPress(leftBtn,  () => editor.pan(-1, 0));
    attachLongPress(rightBtn, () => editor.pan(+1, 0));
    ctrBtn.addEventListener('click', () => editor.centerView());

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const step = e.shiftKey ? 5 : 1;
      switch (e.key) {
        case '+': case '=':  stepIn();  e.preventDefault(); break;
        case '-': case '_':  stepOut(); e.preventDefault(); break;
        case '0': editor.fitToView(); refresh(); e.preventDefault(); break;
        case 'ArrowUp':    editor.pan(0, -step); e.preventDefault(); break;
        case 'ArrowDown':  editor.pan(0, +step); e.preventDefault(); break;
        case 'ArrowLeft':  editor.pan(-step, 0); e.preventDefault(); break;
        case 'ArrowRight': editor.pan(+step, 0); e.preventDefault(); break;
      }
    });
  }

  /**
   * 长按重复触发：按下立即触发一次，按住 300ms 后开始 60ms 重复，松手停止。
   * 用 pointer 事件统一桌面/触屏。
   */
  function attachLongPress(btn, action) {
    let initialTimer = null, repeatTimer = null;
    const stop = () => {
      if (initialTimer) { clearTimeout(initialTimer); initialTimer = null; }
      if (repeatTimer)  { clearInterval(repeatTimer);  repeatTimer  = null; }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      action();
      initialTimer = setTimeout(() => { repeatTimer = setInterval(action, 30); }, 180);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      btn.addEventListener(ev, stop));
  }

  // ─── 抠图（本地 flood-fill + AI fal.ai/rembg） ───────────────
  function bindBackgroundRemoval() {
    const tolEl    = $('#opt-bg-tol');
    const tolVal   = $('#opt-bg-tol-val');
    const btnLocal = $('#btn-remove-bg');
    const btnAI    = $('#btn-remove-bg-ai');
    const btnReset = $('#btn-restore-bg');
    const status   = $('#bg-status');
    if (!btnLocal) return;

    if (tolEl) tolEl.addEventListener('input', () => tolVal.textContent = tolEl.value);

    const refresh = () => {
      btnLocal.disabled = !lastImage;
      btnAI.disabled    = !lastImage || !($('#ai-key')?.value.trim());
      btnReset.disabled = !originalImage || lastImage === originalImage;
    };
    document.addEventListener('bead:imageLoaded', refresh);
    $('#ai-key')?.addEventListener('input', refresh);
    refresh();

    const setStatus = (msg, cls) => {
      status.textContent = msg;
      status.className = 'ai-status' + (cls ? ' ' + cls : '');
    };

    btnLocal.addEventListener('click', async () => {
      if (!lastImage) return;
      const tol = parseInt(tolEl.value, 10) || 35;
      try {
        const img = await floodFillTransparent(lastImage, tol);
        lastImage = img;
        document.dispatchEvent(new CustomEvent('bead:imageLoaded'));
        reprocessImage();
        setStatus(t('image.bg-done'), 'success');
      } catch (err) {
        setStatus(t('image.bg-fail') + err.message, 'error');
      }
    });

    btnAI.addEventListener('click', async () => {
      if (!lastImage) return;
      const key = $('#ai-key')?.value.trim();
      if (!key) { setStatus(t('ai.no-key'), 'error'); return; }
      btnAI.disabled = true;
      setStatus(t('image.bg-busy'), '');
      try {
        const dataUri = imageToDataUri(lastImage, 1024);
        const url = await callFalRemoveBg(key, dataUri);
        const img = await loadImageFromUrl(url);
        lastImage = img;
        document.dispatchEvent(new CustomEvent('bead:imageLoaded'));
        reprocessImage();
        setStatus(t('image.bg-done'), 'success');
      } catch (err) {
        setStatus(t('image.bg-fail') + err.message, 'error');
      } finally {
        refresh();
      }
    });

    btnReset.addEventListener('click', () => {
      if (!originalImage) return;
      lastImage = originalImage;
      document.dispatchEvent(new CustomEvent('bead:imageLoaded'));
      reprocessImage();
      setStatus(t('image.bg-restored'), 'success');
    });
  }

  /**
   * 本地抠图：从四个角各 BFS 一次 flood-fill，把和角落颜色距离 ≤ tolerance
   * 的所有连通像素 alpha 设为 0。适用于纯色/近纯色背景。
   * 主体颜色和背景接近 / 复杂背景就用 AI 抠图。
   */
  function floodFillTransparent(img, tolerance) {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;
    const visited = new Uint8Array(W * H);
    const tol2 = tolerance * tolerance;

    const fillFrom = (sx, sy) => {
      const startIdx = sy * W + sx;
      if (visited[startIdx]) return;
      const si = startIdx * 4;
      const sr = data[si], sg = data[si + 1], sb = data[si + 2];
      const stack = [sx, sy];
      while (stack.length) {
        const y = stack.pop();
        const x = stack.pop();
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const idx = y * W + x;
        if (visited[idx]) continue;
        const i = idx * 4;
        const dr = data[i] - sr, dg = data[i + 1] - sg, db = data[i + 2] - sb;
        if (dr * dr + dg * dg + db * db > tol2) continue;
        visited[idx] = 1;
        data[i + 3] = 0;
        stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
      }
    };
    fillFrom(0, 0);
    fillFrom(W - 1, 0);
    fillFrom(0, H - 1);
    fillFrom(W - 1, H - 1);

    ctx.putImageData(imgData, 0, 0);
    return new Promise((resolve, reject) => {
      const out = new Image();
      out.onload = () => resolve(out);
      out.onerror = () => reject(new Error('canvas → image failed'));
      out.src = c.toDataURL('image/png');
    });
  }

  /**
   * AI 抠图：调 fal.ai/imageutils/rembg。
   * 返回 transparent PNG 的 URL，调用方自己去 loadImageFromUrl。
   */
  async function callFalRemoveBg(apiKey, imageDataUri) {
    const res = await fetch('https://fal.run/fal-ai/imageutils/rembg', {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: imageDataUri }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (text ? ' — ' + text.slice(0, 120) : ''));
    }
    const data = await res.json();
    const url = data?.image?.url || data?.images?.[0]?.url;
    if (!url) throw new Error('no image in response');
    return url;
  }

  // ─── AI 真人转卡通 (fal.ai img2img) ──────────────────────────
  const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/dev/image-to-image';
  const AI_PROMPTS = {
    pixel:       'pixel art, 16-bit, vibrant colors, sharp pixels, retro game style, no anti-aliasing, clean palette',
    stardew:     'Stardew Valley pixel art portrait, cute character, warm colors, soft hand-drawn pixels, ConcernedApe style',
    terraria:    'Terraria pixel art character, fantasy adventure game sprite, detailed 32-bit pixel art, bright palette',
    '8bit-game': 'NES 8-bit pixel art sprite, blocky pixels, limited 16-color palette, retro video game character',
    anime:       'anime portrait, cel-shaded, flat vibrant colors, clean line art, expressive eyes, manga style',
    ghibli:      'Studio Ghibli inspired character portrait, soft watercolor textures, painterly hand-drawn, Miyazaki style',
  };
  const AI_NEGATIVE = 'photorealistic, photo, blurry, smooth gradients, 3D render, depth of field';

  function bindAI() {
    const keyEl    = $('#ai-key');
    const styleEl  = $('#ai-style');
    const strEl    = $('#ai-strength');
    const strVal   = $('#ai-strength-val');
    const btn      = $('#ai-generate');
    const status   = $('#ai-status');
    if (!btn) return;

    keyEl.value = localStorage.getItem('bead.fal_key') || '';
    keyEl.addEventListener('change', () => {
      localStorage.setItem('bead.fal_key', keyEl.value.trim());
      refreshBtn();
    });
    styleEl.value = localStorage.getItem('bead.ai_style') || 'pixel';
    styleEl.addEventListener('change', () => localStorage.setItem('bead.ai_style', styleEl.value));
    strEl.addEventListener('input', () => strVal.textContent = parseFloat(strEl.value).toFixed(2));
    strVal.textContent = parseFloat(strEl.value).toFixed(2);

    const refreshBtn = () => {
      btn.disabled = !lastImage || !keyEl.value.trim();
    };
    document.addEventListener('bead:imageLoaded', refreshBtn);
    refreshBtn();

    btn.addEventListener('click', async () => {
      if (!lastImage) { setStatus(t('ai.no-image'), 'error'); return; }
      const key = keyEl.value.trim();
      if (!key) { setStatus(t('ai.no-key'), 'error'); return; }
      btn.disabled = true;
      setStatus(t('ai.busy'), '');
      try {
        const dataUri = imageToDataUri(lastImage, 1024);
        const prompt  = AI_PROMPTS[styleEl.value] || AI_PROMPTS.pixel;
        const url = await callFalImg2Img(key, dataUri, prompt, parseFloat(strEl.value));
        const img = await loadImageFromUrl(url);
        lastImage = img;
        document.dispatchEvent(new CustomEvent('bead:imageLoaded'));
        reprocessImage();
        setStatus(t('ai.done'), 'success');
      } catch (err) {
        setStatus(t('ai.fail') + err.message, 'error');
      } finally {
        refreshBtn();
      }
    });

    function setStatus(msg, cls) {
      status.textContent = msg;
      status.className = 'ai-status' + (cls ? ' ' + cls : '');
    }
  }

  async function callFalImg2Img(apiKey, imageDataUri, prompt, strength) {
    const res = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Key ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageDataUri,
        prompt,
        negative_prompt: AI_NEGATIVE,
        strength,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (text ? ' — ' + text.slice(0, 120) : ''));
    }
    const data = await res.json();
    const url = data?.images?.[0]?.url || data?.image?.url || data?.url;
    if (!url) throw new Error('no image in response');
    return url;
  }

  function imageToDataUri(img, maxSide) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(img, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', 0.92);
  }

  function loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
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
      palette:   activePalette,
      sampling:  $('#opt-mode-sample')?.checked ? 'mode' : 'mean',
      dither: $('#opt-dither').checked,
      contrast: parseFloat($('#opt-contrast').value) || 1.0,
      brightness: parseInt($('#opt-brightness').value, 10) || 0,
      kmeans:    parseInt($('#opt-kmeans').value, 10) || 0,
      smooth:    parseInt($('#opt-smooth').value, 10) || 0,
      maxColors: parseInt($('#opt-max-colors').value, 10) || 0,
      minRegion: parseInt($('#opt-min-region').value, 10) || 1,
      style:     $('#opt-style')?.value || 'none',
    });
    editor.loadGrid(grid);
  }

  async function handleImage(file) {
    try {
      const img = await loadImageFile(file);
      originalImage = img;
      lastImage = img;
      document.dispatchEvent(new CustomEvent('bead:imageLoaded'));
      reprocessImage();
    } catch (err) {
      alert((getLang() === 'zh' ? '图片加载失败：' : 'Image load failed: ') + err.message);
    }
  }

  // ─── 导出 ────────────────────────────────────────────────────
  function bindExport() {
    $('#exp-png').addEventListener('click', () => Exporter.exportPNG(editor));
    $('#exp-png-pixel').addEventListener('click', () => Exporter.exportPNGPixelArt(editor));
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
