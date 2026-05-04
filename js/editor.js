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
    this.currentColor = HAMA_PALETTE[39]; // 默认黑色
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

    this._bindEvents();
    this.render();
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
    this.render();
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
    this.render();
    this._emit('gridChanged');
  }

  clear() {
    this._saveState();
    this.grid = this._emptyGrid();
    this.render();
    this._emit('gridChanged');
  }

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
      row.map(code => code ? HAMA_PALETTE.find(c => c.code === code) || null : null)
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

  // ─── 事件绑定 ────────────────────────────────────────────────

  _bindEvents() {
    const getCell = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const s = this.canvas.width / r.width;
      const MARGIN = this.showNumbers ? 24 : 0;
      return {
        x: Math.floor(((e.clientX - r.left) * s - MARGIN) / this.cellSize),
        y: Math.floor(((e.clientY - r.top)  * s - MARGIN) / this.cellSize),
      };
    };

    const getTouchCell = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      const s = this.canvas.width / r.width;
      const MARGIN = this.showNumbers ? 24 : 0;
      return {
        x: Math.floor(((t.clientX - r.left) * s - MARGIN) / this.cellSize),
        y: Math.floor(((t.clientY - r.top)  * s - MARGIN) / this.cellSize),
      };
    };

    // Mouse
    this.canvas.addEventListener('mousedown', (e) => {
      this._isDrawing = true;
      this._lastCell = null;
      const cell = getCell(e);
      this._applyTool(cell.x, cell.y, true);
      this._lastCell = cell;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this._isDrawing) return;
      const cell = getCell(e);
      if (this._lastCell && cell.x === this._lastCell.x && cell.y === this._lastCell.y) return;
      this._applyTool(cell.x, cell.y, false);
      this._lastCell = cell;
    });

    document.addEventListener('mouseup', () => { this._isDrawing = false; });

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
    });
  }

  // ─── 渲染 ────────────────────────────────────────────────────

  render() {
    const { ctx, cellSize, cols, rows } = this;
    const MARGIN = this.showNumbers ? 24 : 0;
    const W = cols * cellSize + MARGIN;
    const H = rows * cellSize + MARGIN;

    this.canvas.width  = W;
    this.canvas.height = H;

    // Background
    ctx.fillStyle = '#C8C4BC';
    ctx.fillRect(0, 0, W, H);

    // Number labels
    if (this.showNumbers) {
      ctx.fillStyle = '#6B6560';
      ctx.font = `${Math.max(9, Math.min(12, cellSize * 0.55))}px "Space Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let x = 0; x < cols; x += 5) {
        ctx.fillText(x + 1, MARGIN + x * cellSize + cellSize / 2, MARGIN / 2);
      }
      ctx.textAlign = 'right';
      for (let y = 0; y < rows; y += 5) {
        ctx.fillText(y + 1, MARGIN - 3, MARGIN + y * cellSize + cellSize / 2);
      }
    }

    // Cells
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this._renderBead(ctx, MARGIN + x * cellSize, MARGIN + y * cellSize, this.grid[y][x]);
      }
    }

    // Grid lines
    if (this.showGrid && cellSize >= 8) {
      for (let x = 0; x <= cols; x++) {
        ctx.strokeStyle = x % 5 === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.10)';
        ctx.lineWidth   = x % 5 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN + x * cellSize, MARGIN);
        ctx.lineTo(MARGIN + x * cellSize, MARGIN + rows * cellSize);
        ctx.stroke();
      }
      for (let y = 0; y <= rows; y++) {
        ctx.strokeStyle = y % 5 === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.10)';
        ctx.lineWidth   = y % 5 === 0 ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(MARGIN, MARGIN + y * cellSize);
        ctx.lineTo(MARGIN + cols * cellSize, MARGIN + y * cellSize);
        ctx.stroke();
      }
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
    this.render();

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
