/**
 * editor.js — 拼豆网格编辑器（Canvas）
 */

class BeadEditor {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellSize = options.cellSize || 20;
    this.cols = options.cols || 29;
    this.rows = options.rows || 29;
    this.currentColor = findColorByCode('H7') || MARD_PALETTE[0]; // 默认黑色
    this.tool = 'draw'; // draw | erase | fill | pick
    this.showGrid = true;
    this.showNumbers = true;
    this.beadShape = options.beadShape || 'square'; // 'square' | 'round'

    this.grid = this._emptyGrid();
    this.undoStack = [];
    this.redoStack = [];
    this.MAX_UNDO = 50;

    this._isDrawing = false;
    this._lastCell = null;

    // 框选 & 套索
    this.selection        = null;   // { x1,y1,x2,y2[,cells:Set] } — cells 存在时为套索遮罩
    this._clipboard       = null;   // 2D array of color objects
    this._clipboardOrigin = null;   // { x, y } 复制时的左上角
    this._isSelecting     = false;
    this._lassoPath       = [];     // [{gx, gy}] 套索路径（网格坐标）
    this._isLassoing      = false;

    // 视窗：当 cellSize 大到画板装不下时，只渲染视窗内的格子，由用户平移
    this.viewX = 0;
    this.viewY = 0;
    this.displayW = 720;
    this.displayH = 720;
    this._renderFullGrid = false; // 给 renderToCanvas 用的逃生口
    this._panAccumX = 0;          // 触控板两指平移的亚格累加器
    this._panAccumY = 0;

    this._bindEvents();
    this._observeContainer();
    this.render();
  }

  _observeContainer() {
    const main = this.canvas.closest('.app-main');
    if (!main || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const s = getComputedStyle(main);
      const padX = parseInt(s.paddingLeft) + parseInt(s.paddingRight);
      const padY = parseInt(s.paddingTop) + parseInt(s.paddingBottom);
      const frame = this.canvas.closest('.canvas-frame');
      const fp = frame ? parseInt(getComputedStyle(frame).padding) || 18 : 0;
      this.displayW = Math.max(240, main.clientWidth  - padX - fp * 2 - 8);
      this.displayH = Math.max(240, main.clientHeight - padY - fp * 2 - 8);
      this._clampView();
      this.render();
    };
    new ResizeObserver(update).observe(main);
    update();
  }

  // ─── 网格管理 ────────────────────────────────────────────────

  _emptyGrid() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  loadGrid(grid) {
    this._saveState();
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.grid = grid.map(row => [...row]);
    this.fitToView();   // 新图先全显示，用户再放大改细节
    this._emit('gridChanged');
  }

  resize(cols, rows) {
    this._saveState();
    const newGrid = Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) =>
        y < this.rows && x < this.cols ? this.grid[y][x] : null
      )
    );
    this.cols = cols;
    this.rows = rows;
    this.grid = newGrid;
    this._clampCellSize();
    this.viewX = 0; this.viewY = 0;
    this._clampView();
    this.render();
    this._emit('gridChanged');
  }

  _clampCellSize() {
    const cap = this.maxCellSize;
    if (this.cellSize > cap) this.cellSize = cap;
  }

  clear() {
    this._saveState();
    this.grid = this._emptyGrid();
    this.render();
    this._emit('gridChanged');
  }

  // ─── 缩放 + 平移 ─────────────────────────────────────────────
  // 现在画布大小由视窗 (displayW × displayH) 决定，cellSize 大了不会让画布
  // 撑爆——只是让一屏看到的格子变少。所以上限解除得很大（每格半个手掌）。
  static MIN_CELL = 3;
  static MAX_CELL = 200;
  static DEFAULT_CELL = 14;

  get maxCellSize() { return BeadEditor.MAX_CELL; }

  zoom(delta)        { this.zoomAt(this.cellSize + delta); }   // 中心锚点
  setCellSize(n)     { this.zoomAt(n); }                       // 中心锚点

  /**
   * 以指定屏幕点为锚点缩放——锚点在屏幕上的位置不变，view 自动平移。
   * 屏幕坐标 anchorScreenX/Y 是 canvas 像素坐标（已含 CSS scale），从 canvas 左上角算。
   * 没传 / 在 canvas 外 → 退回到 canvas 内容中心为锚点。
   */
  zoomAt(newSize, anchorScreenX, anchorScreenY) {
    newSize = Math.max(BeadEditor.MIN_CELL, Math.min(BeadEditor.MAX_CELL, newSize));
    if (newSize === this.cellSize) return;
    const MARGIN = this.showNumbers ? 24 : 0;

    const inside = anchorScreenX !== undefined && anchorScreenY !== undefined
                && anchorScreenX >= 0 && anchorScreenX <= this.canvas.width
                && anchorScreenY >= 0 && anchorScreenY <= this.canvas.height;
    if (!inside) {
      // 默认：当前可视内容中心
      const v = this._visibleCells();
      anchorScreenX = MARGIN + Math.min(v.c, this.cols - this.viewX) * this.cellSize / 2;
      anchorScreenY = MARGIN + Math.min(v.r, this.rows - this.viewY) * this.cellSize / 2;
    }
    const ax = Math.max(0, anchorScreenX - MARGIN);
    const ay = Math.max(0, anchorScreenY - MARGIN);
    // 锚点对应的（连续）格子坐标
    const gridX = this.viewX + ax / this.cellSize;
    const gridY = this.viewY + ay / this.cellSize;
    this.cellSize = newSize;
    // 让同一格子坐标在新尺寸下落回同一屏幕像素
    this.viewX = Math.round(gridX - ax / newSize);
    this.viewY = Math.round(gridY - ay / newSize);
    this._clampView();
    this.render();
    this._emit('zoomChanged');
  }

  pan(dx, dy) {
    if (!dx && !dy) return;
    this.viewX += dx;
    this.viewY += dy;
    this._clampView();
    this.render();
    this._emit('viewChanged');
  }

  centerView() {
    const v = this._visibleCells();
    this.viewX = Math.max(0, Math.floor((this.cols - v.c) / 2));
    this.viewY = Math.max(0, Math.floor((this.rows - v.r) / 2));
    this.render();
    this._emit('viewChanged');
  }

  /**
   * 把 cellSize 自适应成"整张图纸刚好能装进视窗"——
   * cols × cs ≤ 可用宽，rows × cs ≤ 可用高。
   * 用于刚载入图纸时让用户先看到完整图，再决定是否放大局部。
   * 视窗归零（已经全显示完了，原点就是居中）。
   */
  fitToView() {
    const MARGIN = this.showNumbers ? 24 : 0;
    const csW = Math.floor((this.displayW - MARGIN) / this.cols);
    const csH = Math.floor((this.displayH - MARGIN) / this.rows);
    const fit = Math.max(BeadEditor.MIN_CELL,
                Math.min(BeadEditor.MAX_CELL, Math.min(csW, csH)));
    this.cellSize = fit;
    this.viewX = 0;
    this.viewY = 0;
    this.render();
    this._emit('zoomChanged');
  }

  _visibleCells() {
    const MARGIN = this.showNumbers ? 24 : 0;
    return {
      c: Math.max(1, Math.floor((this.displayW - MARGIN) / this.cellSize)),
      r: Math.max(1, Math.floor((this.displayH - MARGIN) / this.cellSize)),
    };
  }

  _clampView() {
    const v = this._visibleCells();
    const maxX = Math.max(0, this.cols - v.c);
    const maxY = Math.max(0, this.rows - v.r);
    if (this.viewX > maxX) this.viewX = maxX;
    if (this.viewY > maxY) this.viewY = maxY;
    if (this.viewX < 0) this.viewX = 0;
    if (this.viewY < 0) this.viewY = 0;
  }

  // 当前可平移信息（给 UI 用来 disable 按钮）
  get canPanLeft()  { return this.viewX > 0; }
  get canPanRight() { return this.viewX + this._visibleCells().c < this.cols; }
  get canPanUp()    { return this.viewY > 0; }
  get canPanDown()  { return this.viewY + this._visibleCells().r < this.rows; }

  // ─── 撤销/重做 ───────────────────────────────────────────────

  _saveState() {
    this.undoStack.push(this._serialize());
    if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this._emit('historyChanged');
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this._serialize());
    this._deserialize(this.undoStack.pop());
    this.render();
    this._emit('gridChanged');
    this._emit('historyChanged');
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this._serialize());
    this._deserialize(this.redoStack.pop());
    this.render();
    this._emit('gridChanged');
    this._emit('historyChanged');
  }

  _serialize() {
    return {
      rows: this.rows, cols: this.cols,
      grid: this.grid.map(row => row.map(c => c ? c.code : null))
    };
  }

  _deserialize({ rows, cols, grid }) {
    this.rows = rows; this.cols = cols;
    this.grid = grid.map(row =>
      row.map(code => code ? findColorByCode(code) : null)
    );
  }

  // ─── 工具应用 ────────────────────────────────────────────────

  _applyTool(x, y, saveState = false) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    if (saveState) this._saveState();

    if (this.tool === 'draw') {
      this.grid[y][x] = this.currentColor;
    } else if (this.tool === 'erase') {
      this.grid[y][x] = null;
    } else if (this.tool === 'fill') {
      this._floodFill(x, y, this.currentColor);
    } else if (this.tool === 'pick') {
      if (this.grid[y][x]) {
        this.currentColor = this.grid[y][x];
        this._emit('colorPicked', this.currentColor);
      }
    }
    this.render();
    this._emit('gridChanged');
  }

  _floodFill(x, y, newColor) {
    const target = this.grid[y][x];
    const same = (c) => (target === null ? c === null : c !== null && c.hex === target.hex);
    if (newColor && target && newColor.hex === target.hex) return;

    const stack = [{ x, y }];
    const seen = new Set([`${x},${y}`]);

    while (stack.length) {
      const { x: cx, y: cy } = stack.pop();
      if (!same(this.grid[cy][cx])) continue;
      this.grid[cy][cx] = newColor;

      for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !seen.has(key)) {
          seen.add(key);
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  // ─── 框选（marquee selection）────────────────────────────────

  _normSel() {
    const s = this.selection;
    if (!s) return null;
    return {
      x1: Math.max(0, Math.min(s.x1, s.x2)),
      y1: Math.max(0, Math.min(s.y1, s.y2)),
      x2: Math.min(this.cols - 1, Math.max(s.x1, s.x2)),
      y2: Math.min(this.rows - 1, Math.max(s.y1, s.y2)),
    };
  }

  clearSelection() {
    this.selection = null;
    this._lassoPath = [];
    this.render();
    this._emit('selectionChanged');
  }

  // 判断格子是否在当前选区内（支持矩形 / 套索遮罩两种模式）
  _inSelection(x, y) {
    if (!this.selection) return false;
    const sel = this._normSel();
    if (!sel || x < sel.x1 || x > sel.x2 || y < sel.y1 || y > sel.y2) return false;
    return sel.cells ? sel.cells.has(`${x},${y}`) : true;
  }

  selectAll() {
    this.selection = { x1: 0, y1: 0, x2: this.cols - 1, y2: this.rows - 1 };
    this.render();
    this._emit('selectionChanged');
  }

  copySelection() {
    const sel = this._normSel();
    if (!sel) return;
    this._clipboardOrigin = { x: sel.x1, y: sel.y1 };
    this._clipboard = [];
    for (let y = sel.y1; y <= sel.y2; y++) {
      const row = [];
      for (let x = sel.x1; x <= sel.x2; x++)
        row.push(this._inSelection(x, y) ? this.grid[y][x] : null);
      this._clipboard.push(row);
    }
  }

  cutSelection() {
    this.copySelection();
    this.deleteSelection();
  }

  deleteSelection() {
    const sel = this._normSel();
    if (!sel) return;
    this._saveState();
    for (let y = sel.y1; y <= sel.y2; y++)
      for (let x = sel.x1; x <= sel.x2; x++)
        if (this._inSelection(x, y)) this.grid[y][x] = null;
    this.render();
    this._emit('gridChanged');
  }

  fillSelection() {
    const sel = this._normSel();
    if (!sel) return;
    this._saveState();
    const color = this.currentColor;
    for (let y = sel.y1; y <= sel.y2; y++)
      for (let x = sel.x1; x <= sel.x2; x++)
        if (this._inSelection(x, y)) this.grid[y][x] = color;
    this.render();
    this._emit('gridChanged');
  }

  pasteClipboard() {
    if (!this._clipboard || !this._clipboard.length) return;
    this._saveState();
    const sel = this._normSel();
    const ox = sel ? sel.x1 : (this._clipboardOrigin ? this._clipboardOrigin.x : 0);
    const oy = sel ? sel.y1 : (this._clipboardOrigin ? this._clipboardOrigin.y : 0);
    const H = this._clipboard.length;
    const W = this._clipboard[0].length;
    for (let dy = 0; dy < H; dy++)
      for (let dx = 0; dx < W; dx++) {
        const gx = ox + dx, gy = oy + dy;
        if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows)
          this.grid[gy][gx] = this._clipboard[dy][dx];
      }
    this.selection = {
      x1: ox, y1: oy,
      x2: Math.min(this.cols - 1, ox + W - 1),
      y2: Math.min(this.rows - 1, oy + H - 1),
    };
    this.render();
    this._emit('gridChanged');
    this._emit('selectionChanged');
  }

  // ─── 全局换色 ─────────────────────────────────────────────────

  replaceColor(fromColor, toColor) {
    if (!fromColor || !toColor || fromColor.code === toColor.code) return;
    this._saveState();
    let changed = false;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.grid[y][x]?.code === fromColor.code) {
          this.grid[y][x] = toColor; changed = true;
        }
    if (changed) { this.render(); this._emit('gridChanged'); }
  }

  // ─── 套索选择 ─────────────────────────────────────────────────

  _pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].gx, yi = polygon[i].gy;
      const xj = polygon[j].gx, yj = polygon[j].gy;
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi))
        inside = !inside;
    }
    return inside;
  }

  _buildLassoSelection() {
    const path = this._lassoPath;
    if (path.length < 3) {
      this.selection = null;
      this._lassoPath = [];
      this.render();
      this._emit('selectionChanged');
      return;
    }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const p of path) {
      if (p.gx < x1) x1 = p.gx; if (p.gy < y1) y1 = p.gy;
      if (p.gx > x2) x2 = p.gx; if (p.gy > y2) y2 = p.gy;
    }
    x1 = Math.max(0, Math.floor(x1));         y1 = Math.max(0, Math.floor(y1));
    x2 = Math.min(this.cols - 1, Math.ceil(x2)); y2 = Math.min(this.rows - 1, Math.ceil(y2));

    const cells = new Set();
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++)
        if (this._pointInPolygon(x + 0.5, y + 0.5, path))
          cells.add(`${x},${y}`);

    this.selection = cells.size ? { x1, y1, x2, y2, cells } : null;
    this._lassoPath = [];
    this.render();
    this._emit('selectionChanged');
  }

  // ─── 事件绑定 ────────────────────────────────────────────────

  _bindEvents() {
    const getCell = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const s = this.canvas.width / r.width;
      const MARGIN = this.showNumbers ? 24 : 0;
      return {
        x: this.viewX + Math.floor(((e.clientX - r.left) * s - MARGIN) / this.cellSize),
        y: this.viewY + Math.floor(((e.clientY - r.top)  * s - MARGIN) / this.cellSize),
      };
    };

    const getTouchCell = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      const s = this.canvas.width / r.width;
      const MARGIN = this.showNumbers ? 24 : 0;
      return {
        x: this.viewX + Math.floor(((t.clientX - r.left) * s - MARGIN) / this.cellSize),
        y: this.viewY + Math.floor(((t.clientY - r.top)  * s - MARGIN) / this.cellSize),
      };
    };

    // Mouse
    this.canvas.addEventListener('mousedown', (e) => {
      // Alt + 拖动 = 平移视窗（不进入绘画模式）
      if (e.altKey) {
        this._isPanning = true;
        this._panStart = {
          mx: e.clientX, my: e.clientY,
          vx: this.viewX, vy: this.viewY,
        };
        this.canvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      // 框选工具：开始拖选矩形
      if (this.tool === 'select') {
        const cell = getCell(e);
        const cx = Math.max(0, Math.min(this.cols - 1, cell.x));
        const cy = Math.max(0, Math.min(this.rows - 1, cell.y));
        this._isSelecting = true;
        this.selection = { x1: cx, y1: cy, x2: cx, y2: cy };
        this.render();
        this._emit('selectionChanged');
        return;
      }
      // 套索工具：开始徒手画范围
      if (this.tool === 'lasso') {
        const cell = getCell(e);
        this._isLassoing = true;
        this._lassoPath = [{ gx: cell.x, gy: cell.y }];
        return;
      }
      this._isDrawing = true;
      this._lastCell = null;
      const cell = getCell(e);
      this._applyTool(cell.x, cell.y, true);
      this._lastCell = cell;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      // Alt 平移：把鼠标位移换算成"格子"再加到视窗起点
      if (this._isPanning) {
        const r = this.canvas.getBoundingClientRect();
        const s = this.canvas.width / r.width;
        const dxCells = (e.clientX - this._panStart.mx) * s / this.cellSize;
        const dyCells = (e.clientY - this._panStart.my) * s / this.cellSize;
        // 拖鼠标向右 → 看左边的内容 → viewX 减小
        const newX = Math.round(this._panStart.vx - dxCells);
        const newY = Math.round(this._panStart.vy - dyCells);
        if (newX !== this.viewX || newY !== this.viewY) {
          this.viewX = newX; this.viewY = newY;
          this._clampView();
          this.render();
          this._emit('viewChanged');
        }
        return;
      }
      // 框选拖动
      if (this._isSelecting) {
        const cell = getCell(e);
        const nx = Math.max(0, Math.min(this.cols - 1, cell.x));
        const ny = Math.max(0, Math.min(this.rows - 1, cell.y));
        if (nx !== this.selection.x2 || ny !== this.selection.y2) {
          this.selection.x2 = nx;
          this.selection.y2 = ny;
          this.render();
          this._emit('selectionChanged');
        }
        return;
      }
      // 套索拖动：每移动 ≥0.3 格才记录一个点，避免冗余
      if (this._isLassoing) {
        const cell = getCell(e);
        const last = this._lassoPath[this._lassoPath.length - 1];
        const dx = cell.x - last.gx, dy = cell.y - last.gy;
        if (dx * dx + dy * dy >= 0.09) {
          this._lassoPath.push({ gx: cell.x, gy: cell.y });
          this.render();
        }
        return;
      }
      // 光标提示
      this.canvas.style.cursor = e.altKey ? 'grab'
        : (this.tool === 'select' || this.tool === 'lasso' ? 'crosshair' : '');
      if (!this._isDrawing) return;
      const cell = getCell(e);
      if (this._lastCell && cell.x === this._lastCell.x && cell.y === this._lastCell.y) return;
      this._applyTool(cell.x, cell.y, false);
      this._lastCell = cell;
    });

    document.addEventListener('mouseup', () => {
      this._isDrawing = false;
      this._isSelecting = false;
      if (this._isLassoing) {
        this._isLassoing = false;
        this._buildLassoSelection();
      }
      if (this._isPanning) {
        this._isPanning = false;
        this.canvas.style.cursor = '';
      }
    });

    // Alt 键按下/松开时切换光标提示（即使没在拖也能感知到可平移）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Alt' && !this._isDrawing && !this._isPanning && !this._isLassoing) {
        this.canvas.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt' && !this._isPanning) {
        const isSel = this.tool === 'select' || this.tool === 'lasso';
        this.canvas.style.cursor = isSel ? 'crosshair' : '';
      }
    });

    // Touch
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._isDrawing = true;
      this._lastCell = null;
      const cell = getTouchCell(e);
      this._applyTool(cell.x, cell.y, true);
      this._lastCell = cell;
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this._isDrawing) return;
      const cell = getTouchCell(e);
      if (this._lastCell && cell.x === this._lastCell.x && cell.y === this._lastCell.y) return;
      this._applyTool(cell.x, cell.y, false);
      this._lastCell = cell;
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => { this._isDrawing = false; });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); this.redo();
      }
      // Selection shortcuts（不在输入框内时生效）
      const inInput = e.target.matches('input, textarea, select, [contenteditable]');
      if (!inInput) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.tool === 'select') {
          this.selectAll(); e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.selection) {
          this.copySelection(); e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'x' && this.selection) {
          this.cutSelection(); e.preventDefault();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v' && this._clipboard) {
          this.pasteClipboard(); e.preventDefault();
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selection && this.tool === 'select') {
          this.deleteSelection(); e.preventDefault();
        }
        if (e.key === 'Escape' && this.selection) {
          this.clearSelection(); e.preventDefault();
        }
      }
    });

    // ── 触控板两指手势：滑动 = 平移视窗，捏合 = 缩放 ──────
    // 浏览器把两指捏合 emit 成 wheel 事件 + ctrlKey=true（Chrome/Safari/Firefox 都这么做）
    // 普通两指滑动是 wheel 事件 + ctrlKey=false，deltaX/Y 是滑动距离（像素）。
    const wheelTarget = this.canvas.closest('.app-main') || this.canvas;
    wheelTarget.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey) {
        // 捏合缩放：multiplicative，捏开 → cellSize 变大；以光标位置为锚点
        const rect = this.canvas.getBoundingClientRect();
        const scale = this.canvas.width / rect.width;
        const ax = (e.clientX - rect.left) * scale;
        const ay = (e.clientY - rect.top)  * scale;
        const factor = 1 - e.deltaY * 0.012;
        const next = Math.round(this.cellSize * factor);
        if (next !== this.cellSize) this.zoomAt(next, ax, ay);
      } else {
        // 两指滑动平移：累加亚格分量，跨过整数才推动一格
        this._panAccumX += e.deltaX / this.cellSize;
        this._panAccumY += e.deltaY / this.cellSize;
        const dx = Math.trunc(this._panAccumX);
        const dy = Math.trunc(this._panAccumY);
        if (dx || dy) {
          this._panAccumX -= dx;
          this._panAccumY -= dy;
          this.pan(dx, dy);
        }
      }
    }, { passive: false });
  }

  // ─── 渲染 ────────────────────────────────────────────────────

  render() {
    const { ctx, cellSize, cols, rows } = this;
    const MARGIN = this.showNumbers ? 24 : 0;

    // 决定要画的范围：导出时画整张；普通时只画视窗内
    let originX, originY, viewC, viewR;
    if (this._renderFullGrid) {
      originX = 0; originY = 0; viewC = cols; viewR = rows;
    } else {
      const v = this._visibleCells();
      viewC = Math.min(cols, v.c);
      viewR = Math.min(rows, v.r);
      originX = this.viewX;
      originY = this.viewY;
    }
    const W = viewC * cellSize + MARGIN;
    const H = viewR * cellSize + MARGIN;

    this.canvas.width  = W;
    this.canvas.height = H;

    // Background
    ctx.fillStyle = '#C8C4BC';
    ctx.fillRect(0, 0, W, H);

    // Number labels（用绝对格子坐标）
    if (this.showNumbers) {
      ctx.fillStyle = '#6B6560';
      ctx.font = `${Math.max(9, Math.min(12, cellSize * 0.55))}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const xStart = Math.ceil(originX / 5) * 5;
      for (let gx = xStart; gx < originX + viewC; gx += 5) {
        const localX = gx - originX;
        ctx.fillText(gx + 1, MARGIN + localX * cellSize + cellSize / 2, MARGIN / 2);
      }
      ctx.textAlign = 'right';
      const yStart = Math.ceil(originY / 5) * 5;
      for (let gy = yStart; gy < originY + viewR; gy += 5) {
        const localY = gy - originY;
        ctx.fillText(gy + 1, MARGIN - 3, MARGIN + localY * cellSize + cellSize / 2);
      }
    }

    // Cells
    for (let ly = 0; ly < viewR; ly++) {
      const gy = originY + ly;
      if (gy < 0 || gy >= rows) continue;
      for (let lx = 0; lx < viewC; lx++) {
        const gx = originX + lx;
        if (gx < 0 || gx >= cols) continue;
        this._renderBead(ctx, MARGIN + lx * cellSize, MARGIN + ly * cellSize, this.grid[gy][gx]);
      }
    }

    // Grid lines
    if (this.showGrid && cellSize >= 8) {
      for (let x = 0; x <= viewC; x++) {
        const absX = originX + x;
        ctx.strokeStyle = absX % 5 === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.10)';
        ctx.lineWidth   = absX % 5 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN + x * cellSize, MARGIN);
        ctx.lineTo(MARGIN + x * cellSize, MARGIN + viewR * cellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= viewR; y++) {
        const absY = originY + y;
        ctx.strokeStyle = absY % 5 === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.10)';
        ctx.lineWidth   = absY % 5 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN, MARGIN + y * cellSize);
        ctx.lineTo(MARGIN + viewC * cellSize, MARGIN + y * cellSize);
        ctx.stroke();
      }
    }

    // ── 框选 / 套索 覆盖层 ────────────────────────────────────
    if (this.selection) {
      const sel = this._normSel();
      if (sel) {
        const vx1 = Math.max(sel.x1, originX) - originX;
        const vy1 = Math.max(sel.y1, originY) - originY;
        const vx2 = Math.min(sel.x2, originX + viewC - 1) - originX;
        const vy2 = Math.min(sel.y2, originY + viewR - 1) - originY;

        if (sel.cells) {
          // 套索遮罩：逐格着色（只遍历视窗内格子）
          ctx.fillStyle = 'rgba(30, 100, 255, 0.28)';
          for (let ly = Math.max(0, vy1); ly <= Math.min(vy2, viewR - 1); ly++)
            for (let lx = Math.max(0, vx1); lx <= Math.min(vx2, viewC - 1); lx++)
              if (sel.cells.has(`${originX + lx},${originY + ly}`))
                ctx.fillRect(MARGIN + lx * cellSize, MARGIN + ly * cellSize, cellSize, cellSize);
        } else if (vx1 <= vx2 && vy1 <= vy2) {
          // 矩形框选：整块填色
          ctx.fillStyle = 'rgba(30, 100, 255, 0.16)';
          ctx.fillRect(MARGIN + vx1 * cellSize, MARGIN + vy1 * cellSize,
                       (vx2 - vx1 + 1) * cellSize, (vy2 - vy1 + 1) * cellSize);
        }

        // 蚂蚁线边框（两色虚线模拟）
        if (vx1 <= vx2 && vy1 <= vy2) {
          const sx = MARGIN + vx1 * cellSize, sy = MARGIN + vy1 * cellSize;
          const sw = (vx2 - vx1 + 1) * cellSize, sh = (vy2 - vy1 + 1) * cellSize;
          ctx.save();
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#1460ff';
          ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineDashOffset = 5;
          ctx.strokeRect(sx + 1, sy + 1, sw - 2, sh - 2);
          ctx.restore();
        }
      }
    }

    // ── 套索拖动中的预览路径 ───────────────────────────────────
    if (this._lassoPath.length > 1 && !this._renderFullGrid) {
      ctx.save();
      ctx.beginPath();
      const toScreen = (p) => ({
        sx: MARGIN + (p.gx - originX) * cellSize,
        sy: MARGIN + (p.gy - originY) * cellSize,
      });
      const f = toScreen(this._lassoPath[0]);
      ctx.moveTo(f.sx, f.sy);
      for (let i = 1; i < this._lassoPath.length; i++) {
        const s = toScreen(this._lassoPath[i]);
        ctx.lineTo(s.sx, s.sy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(30, 100, 255, 0.10)';
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#1460ff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  _renderBead(ctx, px, py, color) {
    const cs = this.cellSize;
    const cx = px + cs / 2;
    const cy = py + cs / 2;

    // Base
    ctx.fillStyle = '#B8B4AC';
    ctx.fillRect(px, py, cs, cs);

    if (!color) {
      // Empty peg hole (always small dot regardless of shape)
      ctx.beginPath();
      ctx.arc(cx, cy, cs * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#A0A099';
      ctx.fill();
      return;
    }

    if (this.beadShape === 'square') {
      // ── Square bead (拼好熨过的样子) ─────────────────────
      const inset = cs >= 12 ? 0.5 : 0;
      const sx = px + inset, sy = py + inset, sw = cs - inset * 2;

      ctx.fillStyle = color.hex;
      ctx.fillRect(sx, sy, sw, sw);

      if (cs >= 10) {
        const grad = ctx.createLinearGradient(sx, sy, sx, sy + sw);
        grad.addColorStop(0,    'rgba(255,255,255,0.22)');
        grad.addColorStop(0.5,  'rgba(255,255,255,0.00)');
        grad.addColorStop(1,    'rgba(0,0,0,0.15)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx, sy, sw, sw);
      }

      if (cs >= 12) {
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + 0.25, sy + 0.25, sw - 0.5, sw - 0.5);
      }
    } else {
      // ── Round bead (未熨开的拼豆) ─────────────────────────
      const r = cs * 0.43;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color.hex;
      ctx.fill();

      if (cs >= 10) {
        const grad = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.28, r * 0.08, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.45)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        grad.addColorStop(1, 'rgba(0,0,0,0.18)');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = cs >= 14 ? 0.8 : 0.5;
      ctx.stroke();
    }
  }

  // ─── 统计 ────────────────────────────────────────────────────

  getColorStats() {
    const map = {};
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++) {
        const c = this.grid[y][x];
        if (c) { map[c.code] = map[c.code] || { color: c, count: 0 }; map[c.code].count++; }
      }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }

  getTotalBeads() {
    let n = 0;
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        if (this.grid[y][x]) n++;
    return n;
  }

  // ─── 导出原始网格 Canvas（无边距）───────────────────────────

  renderToCanvas(cellSize = 15) {
    const { cols, rows } = this;
    const oc = document.createElement('canvas');
    oc.width  = cols * cellSize;
    oc.height = rows * cellSize;
    const octx = oc.getContext('2d');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, oc.width, oc.height);

    const savedCtx = this.ctx;
    const savedCanvas = this.canvas;
    const savedCS = this.cellSize;
    const savedSN = this.showNumbers;

    this.canvas = oc;
    this.ctx = octx;
    this.cellSize = cellSize;
    this.showNumbers = false;
    this._renderFullGrid = true;
    this.render();
    this._renderFullGrid = false;

    // Restore
    this.canvas = savedCanvas;
    this.ctx = savedCtx;
    this.cellSize = savedCS;
    this.showNumbers = savedSN;
    this.render();

    return oc;
  }

  // ─── 工具方法 ────────────────────────────────────────────────

  _emit(event, detail) {
    document.dispatchEvent(new CustomEvent('bead:' + event, { detail }));
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
