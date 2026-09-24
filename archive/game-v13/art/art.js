/* 史萊姆擴張 v13 — 美術繪製層
 * 全域物件 window.Art, 不用 ES module。
 * 只負責「給狀態, 畫出來」; 不做任何判定。
 * 盤面座標: x = 絕對欄(-2~7), y = 列(1 = 最底列, 19 = 頂列, 20 以上不可見; 可帶小數供下落動畫)。
 */
(function () {
  'use strict';

  // ================= 常數 =================
  const W = 960, H = 640;
  const CELL = 26;
  const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';

  const PAL = {
    bg: '#12141c',
    panel: '#1a1d29',
    panelEdge: '#2c3146',
    boardBg: '#1c2030',
    grid: '#262b3d',
    slot: '#14161e',
    slotHatch: '#232736',
    boundary: '#c9d1e6',
    topLine: '#ff8a3d',
    text: '#e8ecf5',
    textDim: '#8a93ab',
    slimeA: '#f25a4a',
    slimeB: '#2657c8',
    slimeC: '#f5cc2a',
    ballBase: '#353b52',
    ballOrb: '#e6e9f2',
    ballArrow: '#262b3a',
    clear: '#ffffff',
    gravity: '#4fe0ff',
    gravityStay: '#9aa3b8',
    shave: '#b58cff',
    expand: '#5fe39a',
    danger: '#ff8a3d',
    outline: '#0b0d13',
    player: '#ffffff', // 操作中方塊的外框(契約保留名)
  };

  const SLIME = {
    A: { fill: PAL.slimeA, dark: '#c23a2e', rim: '#ff9488', mark: 'rgba(70,10,4,0.55)', name: '紅', symbolName: '圓', symbol: 'circle' },
    B: { fill: PAL.slimeB, dark: '#183d96', rim: '#7aa0ff', mark: 'rgba(235,242,255,0.8)', name: '藍', symbolName: '方', symbol: 'square' },
    C: { fill: PAL.slimeC, dark: '#c99c0e', rim: '#fff3a8', mark: 'rgba(80,56,0,0.55)', name: '黃', symbolName: '三角', symbol: 'triangle' },
  };

  // 固定版位(P11: 常駐資訊位置固定)
  const BOX = {
    target: { x: 24, y: 110, w: 302, h: 104 },
    task: { x: 24, y: 224, w: 302, h: 118 },
    supply: { x: 24, y: 352, w: 302, h: 52 },
    abandon: { x: 24, y: 548, w: 302, h: 56 },
    preview: { x: 634, y: 110, w: 302, h: 140 },
    score: { x: 634, y: 260, w: 302, h: 80 },
    mult: { x: 634, y: 350, w: 302, h: 48 },
    best: { x: 634, y: 408, w: 302, h: 48 },
    time: { x: 634, y: 466, w: 302, h: 48 },
    banner: { x: 330, y: 18, w: 300, h: 54 },
  };

  // ================= 盤面版位 =================
  // 預設: 滿寬 10 欄的外框固定不動(絕對欄 -2~7), 未開的欄畫成「預留槽」
  const DEFAULT_LAY = { left: 350, bottom: 604, col0: -2, frameMin: -2, frameMax: 7, rows: 19, showTop: true };
  let LAY = DEFAULT_LAY;
  function withLay(lay, fn) {
    const prev = LAY;
    LAY = Object.assign({}, DEFAULT_LAY, lay);
    try { fn(); } finally { LAY = prev; }
  }
  function cx(col) { return LAY.left + (col - LAY.col0) * CELL; }
  function cy(row) { return LAY.bottom - row * CELL; } // 該列格子的上緣
  function boardRect() {
    const x = cx(LAY.frameMin);
    const w = (LAY.frameMax - LAY.frameMin + 1) * CELL;
    const h = LAY.rows * CELL;
    return { x: x, y: LAY.bottom - h, w: w, h: h };
  }
  function clipBoard(ctx) {
    const b = boardRect();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
  }

  // ================= 基礎工具 =================
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function font(size, weight) { return (weight || 'bold') + ' ' + size + 'px ' + FONT; }
  // 文字; outline 給色則加描邊(P10)
  function txt(ctx, s, x, y, size, color, align, outline, weight) {
    ctx.font = font(size, weight);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = outline;
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  function fmt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }
  function panel(ctx, b, title, edge) {
    rr(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = PAL.panel;
    ctx.fill();
    ctx.lineWidth = edge ? 2 : 1;
    ctx.strokeStyle = edge || PAL.panelEdge;
    ctx.stroke();
    if (title) txt(ctx, title, b.x + 14, b.y + 16, 13, PAL.textDim, 'left');
  }
  function arrow(ctx, x1, y1, x2, y2, color, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hl = 6 + lw * 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.5) * hl, y2 - Math.sin(a - 0.5) * hl);
    ctx.lineTo(x2 - Math.cos(a + 0.5) * hl, y2 - Math.sin(a + 0.5) * hl);
    ctx.closePath();
    ctx.fill();
  }
  function hatch(ctx, x, y, w, h, color, gap, lw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath();
    for (let d = -h; d < w + h; d += gap) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ================= 格位畫家(全畫面共用一本字典, P3) =================
  function symbolPath(ctx, sym, mx, my, s) {
    ctx.beginPath();
    if (sym === 'circle') {
      ctx.arc(mx, my, s * 0.5, 0, Math.PI * 2);
    } else if (sym === 'square') {
      ctx.rect(mx - s * 0.42, my - s * 0.42, s * 0.84, s * 0.84);
    } else {
      ctx.moveTo(mx, my - s * 0.55);
      ctx.lineTo(mx + s * 0.56, my + s * 0.42);
      ctx.lineTo(mx - s * 0.56, my + s * 0.42);
      ctx.closePath();
    }
  }
  function paintSlime(ctx, px, py, size, color) {
    const c = SLIME[color] || SLIME.A;
    const i = size * 0.06;
    const x = px + i, y = py + i, s = size - 2 * i;
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = c.dark;
    ctx.fillRect(x, y + s * 0.74, s, s * 0.3);
    ctx.restore();
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = c.rim;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.3, y + s * 0.22, s * 0.15, s * 0.08, -0.45, 0, Math.PI * 2);
    ctx.fill();
    symbolPath(ctx, c.symbol, px + size / 2, py + size * 0.54, size * 0.34);
    ctx.fillStyle = c.mark;
    ctx.fill();
  }
  function ballArrowPath(ctx, mx, my, s) {
    ctx.beginPath();
    ctx.moveTo(mx, my - s * 0.2);
    ctx.lineTo(mx, my + s * 0.08);
    ctx.moveTo(mx - s * 0.13, my - s * 0.02);
    ctx.lineTo(mx, my + s * 0.15);
    ctx.lineTo(mx + s * 0.13, my - s * 0.02);
  }
  function paintBall(ctx, px, py, size) {
    const i = size * 0.06;
    rr(ctx, px + i, py + i, size - 2 * i, size - 2 * i, size * 0.2);
    ctx.fillStyle = PAL.ballBase;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.strokeStyle = '#5d6582';
    ctx.stroke();
    const mx = px + size / 2, my = py + size / 2, r = size * 0.36;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = PAL.ballOrb;
    ctx.fill();
    // 三色環 = 萬用色
    const cols = [PAL.slimeA, PAL.slimeB, PAL.slimeC];
    ctx.lineWidth = size * 0.1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(mx, my, r, -Math.PI / 2 + k * (Math.PI * 2 / 3) + 0.12, -Math.PI / 2 + (k + 1) * (Math.PI * 2 / 3) - 0.12);
      ctx.strokeStyle = cols[k];
      ctx.stroke();
    }
    // 向下箭頭 = 重力
    ballArrowPath(ctx, mx, my, size);
    ctx.strokeStyle = PAL.ballArrow;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  function paintBody(ctx, px, py, size, kind, color) {
    if (kind === 'ball') paintBall(ctx, px, py, size);
    else paintSlime(ctx, px, py, size, color);
  }
  function paintGhost(ctx, px, py, size, kind, color) {
    if (kind === 'ball') {
      const mx = px + size / 2, my = py + size / 2;
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(230,233,242,0.14)';
      ctx.fill();
      ctx.strokeStyle = PAL.ballOrb;
      ctx.lineWidth = 2;
      ctx.stroke();
      ballArrowPath(ctx, mx, my, size);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      return;
    }
    const c = SLIME[color] || SLIME.A;
    const i = size * 0.1;
    rr(ctx, px + i, py + i, size - 2 * i, size - 2 * i, size * 0.26);
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = 2;
    ctx.stroke();
    symbolPath(ctx, c.symbol, px + size / 2, py + size / 2, size * 0.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // 一格含標記的完整畫法
  function paintMarkedCell(ctx, px, py, kind, color, mark, t) {
    t = clamp01(t);
    if (mark === 'clearing') {
      // 消除: 白色單框 + 縮小閃白(「我造成的」)
      const s = CELL * (1 - 0.35 * t);
      const o = (CELL - s) / 2;
      paintBody(ctx, px + o, py + o, s, kind, color);
      ctx.globalAlpha = 0.75 * (1 - t) + 0.1;
      rr(ctx, px + o, py + o, s, s, s * 0.3);
      ctx.fillStyle = PAL.clear;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PAL.clear;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
      if (kind === 'ball') {
        // 觸發: 青色外擴環
        ctx.beginPath();
        ctx.arc(px + CELL / 2, py + CELL / 2, CELL * 0.45 + 10 * t, 0, Math.PI * 2);
        ctx.strokeStyle = PAL.gravity;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    } else if (mark === 'shaving') {
      // 削頂: 紫色斜紋 + 橫切線, 淡出(「系統給的」)
      ctx.globalAlpha = 1 - 0.6 * t;
      paintBody(ctx, px, py, CELL, kind, color);
      ctx.globalAlpha = 1;
      hatch(ctx, px + 1, py + 1, CELL - 2, CELL - 2, PAL.shave, 5, 2);
      ctx.strokeStyle = PAL.shave;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
    } else if (mark === 'falling') {
      // 下落中: 青色拖尾(上方三道)
      paintBody(ctx, px, py, CELL, kind, color);
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      [6, 13, 20].forEach(function (dx, k) {
        ctx.moveTo(px + dx, py - 2);
        ctx.lineTo(px + dx, py - 8 - (k === 1 ? 5 : 0));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      paintBody(ctx, px, py, CELL, kind, color);
    }
  }

  // 格位集合外框(可含小數 y, 同一組需有相同小數)
  function cellSet(cells) {
    const set = new Set();
    cells.forEach(function (c) { set.add(c.x + ',' + Math.round(c.y * 100)); });
    return function has(x, y) { return set.has(x + ',' + Math.round(y * 100)); };
  }
  function contourPath(ctx, cells, inset) {
    const has = cellSet(cells);
    const i = inset;
    ctx.beginPath();
    cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      const L = has(c.x - 1, c.y), R = has(c.x + 1, c.y), U = has(c.x, c.y + 1), D = has(c.x, c.y - 1);
      if (!U) { ctx.moveTo(L ? px : px + i, py + i); ctx.lineTo(R ? px + CELL : px + CELL - i, py + i); }
      if (!D) { ctx.moveTo(L ? px : px + i, py + CELL - i); ctx.lineTo(R ? px + CELL : px + CELL - i, py + CELL - i); }
      if (!L) { ctx.moveTo(px + i, U ? py : py + i); ctx.lineTo(px + i, D ? py + CELL : py + CELL - i); }
      if (!R) { ctx.moveTo(px + CELL - i, U ? py : py + i); ctx.lineTo(px + CELL - i, D ? py + CELL : py + CELL - i); }
    });
    return has;
  }

  // ================= 背景 / 盤面 =================
  function drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // state: { minCol, maxCol }  目前已開的絕對欄範圍
  function drawBoard(ctx, s) {
    s = s || {};
    const minCol = s.minCol != null ? s.minCol : 0;
    const maxCol = s.maxCol != null ? s.maxCol : 5;
    ctx.save();
    const b = boardRect();
    for (let c = LAY.frameMin; c <= LAY.frameMax; c++) {
      const x = cx(c);
      if (c >= minCol && c <= maxCol) {
        ctx.fillStyle = PAL.boardBg;
        ctx.fillRect(x, b.y, CELL, b.h);
      } else {
        ctx.fillStyle = PAL.slot;
        ctx.fillRect(x, b.y, CELL, b.h);
        hatch(ctx, x, b.y, CELL, b.h, PAL.slotHatch, 8, 1.5);
      }
    }
    // 格線
    const ox = cx(minCol), ow = (maxCol - minCol + 1) * CELL;
    ctx.strokeStyle = PAL.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = minCol + 1; c <= maxCol; c++) {
      ctx.moveTo(cx(c) + 0.5, b.y);
      ctx.lineTo(cx(c) + 0.5, b.y + b.h);
    }
    for (let r = 1; r < LAY.rows; r++) {
      ctx.moveTo(ox, cy(r) + 0.5);
      ctx.lineTo(ox + ow, cy(r) + 0.5);
    }
    ctx.stroke();
    // 邊界(目前可放置範圍)
    ctx.strokeStyle = PAL.boundary;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 1, b.y, ow + 2, b.h + 1);
    ctx.fillStyle = PAL.boundary;
    ctx.fillRect(ox - 2, b.y + b.h, ow + 4, 3);
    // 頂線(堆出即結束)
    if (LAY.showTop) {
      ctx.strokeStyle = PAL.topLine;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(ox - 4, b.y + 1);
      ctx.lineTo(ox + ow + 4, b.y + 1);
      ctx.stroke();
      ctx.setLineDash([]);
      txt(ctx, '頂線', b.x + b.w + 3, b.y + 2, 11, PAL.topLine, 'left');
    }
    ctx.restore();
  }

  // state: { x, y, kind: 'empty'|'color'|'ball', color: 'A'|'B'|'C', mark: 'none'|'clearing'|'shaving'|'falling', t }
  function drawCell(ctx, s) {
    if (!s || s.kind === 'empty') return; // 空格(含開放 / 封閉空洞)由盤面底色呈現
    ctx.save();
    clipBoard(ctx);
    paintMarkedCell(ctx, cx(s.x), cy(s.y), s.kind, s.color, s.mark, s.t);
    ctx.restore();
  }

  // state: { x, y, mark, t }  與 drawCell(kind:'ball') 等價
  function drawGravityBall(ctx, s) {
    drawCell(ctx, Object.assign({}, s, { kind: 'ball' }));
  }

  // state: { x, y, n }  (x,y) 為錨點(團中 y 最大、同 y 取 x 最小); n 只畫 2 / 3
  function drawClusterCount(ctx, s) {
    if (!s || (s.n !== 2 && s.n !== 3)) return;
    ctx.save();
    const hidden = s.y > LAY.rows;
    const row = hidden ? LAY.rows : s.y;
    const px = cx(s.x), py = cy(row);
    const bx = px + CELL - 14, by = py + 1;
    rr(ctx, bx, by, 13, 13, 3);
    ctx.fillStyle = 'rgba(10,12,20,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    txt(ctx, String(s.n), bx + 6.5, by + 7, 11, '#ffffff', 'center');
    if (hidden) {
      // 錨點在不可見區: 貼頂線畫, 加一個向上小三角
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(bx + 6.5, by - 5);
      ctx.lineTo(bx + 10.5, by - 1);
      ctx.lineTo(bx + 2.5, by - 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // state: { cells: [{x,y}], group }  一個懸空連通塊一次呼叫; group = 塊序號(0,1,2...)
  function drawFloatingMark(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    ctx.save();
    clipBoard(ctx);
    const cells = s.cells;
    ctx.fillStyle = 'rgba(79,224,255,0.10)';
    cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
    const has = contourPath(ctx, cells, 1.5);
    ctx.strokeStyle = PAL.gravity;
    ctx.lineWidth = 2;
    ctx.setLineDash((s.group || 0) % 2 ? [4, 3] : [9, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 連接桿: 同塊相鄰格之間畫短桿, 表達「整塊一起動」
    ctx.fillStyle = PAL.gravity;
    cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      if (has(c.x + 1, c.y)) ctx.fillRect(px + CELL - 4, py + CELL / 2 - 2, 8, 4);
      if (has(c.x, c.y + 1)) ctx.fillRect(px + CELL / 2 - 2, py - 4, 4, 8);
    });
    ctx.restore();
  }

  // state: { cells: [{x,y}], role: 'fall'|'stay', t }  重力事件期間的受影響連通塊
  function drawFloatingEventBlock(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const cells = s.cells;
    if (s.role === 'fall') {
      ctx.fillStyle = 'rgba(79,224,255,0.18)';
      cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      const has = contourPath(ctx, cells, 1.5);
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 3;
      ctx.stroke();
      // 每欄最低格下方畫向下 V 形
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      cells.forEach(function (c) {
        if (has(c.x, c.y - 1)) return;
        const mx = cx(c.x) + CELL / 2, my = cy(c.y) + CELL + 4 + 4 * t;
        ctx.beginPath();
        ctx.moveTo(mx - 6, my);
        ctx.lineTo(mx, my + 5);
        ctx.lineTo(mx + 6, my);
        ctx.stroke();
      });
    } else {
      const has = contourPath(ctx, cells, 1.5);
      ctx.strokeStyle = PAL.gravityStay;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      // 最低格底下畫「⊥」錨: 不動
      ctx.strokeStyle = PAL.gravityStay;
      ctx.lineWidth = 2.5;
      cells.forEach(function (c) {
        if (has(c.x, c.y - 1)) return;
        const mx = cx(c.x) + CELL / 2, by = cy(c.y) + CELL - 3;
        ctx.beginPath();
        ctx.moveTo(mx, by - 7);
        ctx.lineTo(mx, by);
        ctx.moveTo(mx - 7, by);
        ctx.lineTo(mx + 7, by);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // state: { x, y, size: 'small'|'large'|'zero', t }  (x,y) = 觸發團錨點或重力球原位
  function drawGravityEvent(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const mx = cx(s.x) + CELL / 2, my = cy(s.y) + CELL / 2;
    if (s.size === 'zero') {
      // 空轉: 灰青虛線環往內收 + 橫槓, 與有效版本形狀相反
      ctx.strokeStyle = '#8fb8c4';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(mx, my, 28 - 14 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - 11, my);
      ctx.lineTo(mx + 11, my);
      ctx.stroke();
      txt(ctx, '無下落', mx, my - 36, 13, '#cfe6ec', 'center', PAL.outline);
    } else if (s.size === 'large') {
      ctx.globalAlpha = 1 - 0.7 * t;
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(mx, my, 12 + 44 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(mx, my, 8 + 26 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const r1 = 16 + 30 * t, r2 = r1 + 10;
        ctx.moveTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1);
        ctx.lineTo(mx + Math.cos(a) * r2, my + Math.sin(a) * r2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 1 - 0.7 * t;
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(mx, my, 8 + 22 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // state: { cells: [{x,y}], t }  追加消除: 青色雙框 + 「下落後消除」
  function drawExtraClear(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    ctx.globalAlpha = 1 - 0.4 * t;
    ctx.strokeStyle = PAL.gravity;
    let top = -Infinity, sumX = 0;
    s.cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 6, py + 6, CELL - 12, CELL - 12);
      if (c.y > top) top = c.y;
      sumX += px + CELL / 2;
    });
    ctx.globalAlpha = 1;
    const b = boardRect();
    const lx = Math.max(b.x + 50, Math.min(b.x + b.w - 50, sumX / s.cells.length));
    const ly = Math.max(b.y + 12, cy(Math.min(top, LAY.rows)) - 12);
    rr(ctx, lx - 46, ly - 10, 92, 20, 6);
    ctx.fillStyle = 'rgba(10,12,20,0.82)';
    ctx.fill();
    txt(ctx, '↓ 下落後消除', lx, ly, 12, PAL.gravity, 'center');
    ctx.restore();
  }

  // state: { cells: [{x,y,isTarget}], deducted, balls, targetColor, t }  消除結算標記(事後回饋)
  function drawClearResult(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    let top = -Infinity, sumX = 0;
    s.cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      if (c.isTarget) {
        // 目標色格: 左下角白色倒三角(= 扣 1)
        ctx.beginPath();
        ctx.moveTo(px + 2, py + CELL - 11);
        ctx.lineTo(px + 12, py + CELL - 11);
        ctx.lineTo(px + 7, py + CELL - 3);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = PAL.outline;
        ctx.stroke();
      }
      if (c.y > top) top = c.y;
      sumX += px + CELL / 2;
    });
    const deducted = s.deducted || 0, balls = s.balls || 0;
    if (deducted > 0 || balls > 0) {
      const b = boardRect();
      const parts = [];
      if (deducted > 0) parts.push({ kind: 'target', text: '目標 −' + deducted });
      if (balls > 0) parts.push({ kind: 'ball', text: '球 ×' + balls });
      ctx.font = font(13);
      let wsum = 0;
      parts.forEach(function (p) { p.w = 18 + ctx.measureText(p.text).width; wsum += p.w; });
      wsum += (parts.length - 1) * 8 + 12;
      const lx = Math.max(b.x + wsum / 2 + 2, Math.min(b.x + b.w - wsum / 2 - 2, sumX / s.cells.length));
      const ly = Math.max(b.y + 12, cy(Math.min(top, LAY.rows)) - 12 - 8 * t);
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.6 : 1;
      rr(ctx, lx - wsum / 2, ly - 11, wsum, 22, 6);
      ctx.fillStyle = 'rgba(10,12,20,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      let x = lx - wsum / 2 + 6;
      parts.forEach(function (p) {
        if (p.kind === 'target') paintSlime(ctx, x, ly - 7, 14, s.targetColor || 'A');
        else paintBall(ctx, x, ly - 7, 14);
        txt(ctx, p.text, x + 17, ly, 13, '#ffffff', 'left');
        x += p.w + 8;
      });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // ================= 操作中方塊 / 落點 / 預覽 =================
  // state: { cells: [{x,y,kind,color}], mode: 'falling'|'softDrop'|'lockDelay'|'locked', lockT }
  function drawPiece(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    ctx.save();
    clipBoard(ctx);
    s.cells.forEach(function (c) { paintBody(ctx, cx(c.x), cy(c.y), CELL, c.kind, c.color); });
    const lockT = clamp01(s.lockT);
    let has = contourPath(ctx, s.cells, 0.5);
    ctx.strokeStyle = PAL.player;
    if (s.mode === 'lockDelay') {
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.globalAlpha = 0.6 + 0.4 * lockT;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.25 * lockT;
      ctx.fillStyle = '#ffffff';
      s.cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      ctx.globalAlpha = 1;
    } else {
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.mode === 'softDrop') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.cells.forEach(function (c) {
        if (has(c.x, c.y + 1)) return;
        const px = cx(c.x), py = cy(c.y);
        ctx.moveTo(px + 8, py - 3); ctx.lineTo(px + 8, py - 14);
        ctx.moveTo(px + 18, py - 3); ctx.lineTo(px + 18, py - 14);
      });
      ctx.stroke();
    }
    if (s.mode === 'locked') {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ffffff';
      s.cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // state: { cells: [{x,y,kind,color}] }
  function drawGhost(ctx, s) {
    if (!s || !s.cells) return;
    ctx.save();
    clipBoard(ctx);
    s.cells.forEach(function (c) { paintGhost(ctx, cx(c.x), cy(c.y), CELL, c.kind, c.color); });
    ctx.restore();
  }

  // state: { cells: [{dx,dy,kind,color}], masked }  dx/dy 為相對格, dy 向上為正
  function drawNextPreview(ctx, s) {
    s = s || {};
    ctx.save();
    const b = BOX.preview;
    panel(ctx, b, '下一塊');
    if (s.masked || !s.cells || !s.cells.length) {
      txt(ctx, '—', b.x + b.w / 2, b.y + b.h / 2 + 6, 24, PAL.textDim, 'center');
      ctx.restore();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, hasBall = false;
    s.cells.forEach(function (c) {
      minX = Math.min(minX, c.dx); maxX = Math.max(maxX, c.dx);
      minY = Math.min(minY, c.dy); maxY = Math.max(maxY, c.dy);
      if (c.kind === 'ball') hasBall = true;
    });
    const w = (maxX - minX + 1) * CELL, h = (maxY - minY + 1) * CELL;
    const ox = b.x + (b.w - w) / 2, oy = b.y + 22 + (b.h - 44 - h) / 2 + h;
    s.cells.forEach(function (c) {
      paintBody(ctx, ox + (c.dx - minX) * CELL, oy - (c.dy - minY + 1) * CELL, CELL, c.kind, c.color);
    });
    if (hasBall) txt(ctx, '含重力球', b.x + b.w - 14, b.y + b.h - 14, 12, PAL.gravity, 'right');
    ctx.restore();
  }

  // ================= 側欄常駐資訊 =================
  // state: { color: 'A'|'B'|'C', announcing, t }
  function drawTargetColor(ctx, s) {
    s = s || {};
    ctx.save();
    const b = BOX.target;
    const t = clamp01(s.t);
    panel(ctx, b, '目標色', s.announcing ? PAL.expand : null);
    const c = SLIME[s.color];
    if (c) {
      paintSlime(ctx, b.x + 16, b.y + 32, 58, s.color);
      txt(ctx, c.name, b.x + 90, b.y + 58, 34, c.fill === PAL.slimeB ? '#8fb0ff' : c.fill, 'left', PAL.outline);
      txt(ctx, '記號: ' + c.symbolName, b.x + 90, b.y + 86, 13, PAL.textDim, 'left');
    } else {
      txt(ctx, '—', b.x + 30, b.y + 60, 28, PAL.textDim, 'left');
    }
    if (s.announcing) {
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 6);
      rr(ctx, b.x + b.w - 78, b.y + 8, 66, 22, 11);
      ctx.fillStyle = PAL.expand;
      ctx.fill();
      txt(ctx, '新目標', b.x + b.w - 45, b.y + 19, 13, '#0d1a12', 'center');
      rr(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 10);
      ctx.strokeStyle = 'rgba(95,227,154,' + (0.3 + 0.5 * pulse) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // state: { stage, remaining, required, phase: 'expand'|'extend', color }
  function drawTaskProgress(ctx, s) {
    s = s || {};
    ctx.save();
    const b = BOX.task;
    panel(ctx, b, '任務');
    const ext = s.phase === 'extend';
    const tag = ext ? '延伸' : '開地';
    rr(ctx, b.x + 60, b.y + 6, 46, 20, 10);
    ctx.fillStyle = ext ? '#9fb0d8' : PAL.expand;
    ctx.fill();
    txt(ctx, tag, b.x + 83, b.y + 16, 12, '#11141c', 'center');
    txt(ctx, '第 ' + (s.stage || 1) + ' 階', b.x + 116, b.y + 16, 16, PAL.text, 'left');
    const req = Math.max(1, s.required || 1);
    const rem = s.remaining != null ? s.remaining : req;
    const done = rem <= 0;
    if (done) {
      txt(ctx, '已達成, 待結算', b.x + 16, b.y + 58, 24, PAL.expand, 'left');
    } else {
      txt(ctx, '剩餘', b.x + 16, b.y + 62, 14, PAL.textDim, 'left');
      ctx.font = font(40);
      const nw = ctx.measureText(String(rem)).width;
      txt(ctx, String(rem), b.x + 54, b.y + 58, 40, PAL.text, 'left');
      txt(ctx, '顆', b.x + 60 + nw, b.y + 64, 16, PAL.textDim, 'left');
    }
    // 進度條: 圖形給趨勢、數字給精確
    const got = Math.min(req, req - Math.max(0, rem));
    const bx = b.x + 16, by = b.y + 90, bw = b.w - 100, bh = 12;
    rr(ctx, bx, by, bw, bh, 6);
    ctx.fillStyle = '#10131b';
    ctx.fill();
    if (got > 0) {
      rr(ctx, bx, by, Math.max(bh, bw * got / req), bh, 6);
      const c = SLIME[s.color];
      ctx.fillStyle = done ? PAL.expand : (c ? c.fill : PAL.text);
      ctx.fill();
    }
    rr(ctx, bx, by, bw, bh, 6);
    ctx.strokeStyle = PAL.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    txt(ctx, got + ' / ' + req, b.x + b.w - 16, by + 6, 14, PAL.textDim, 'right');
    ctx.restore();
  }

  // state: { side: 'left'|'right'|null, col }  col = 下一次會開的絕對欄
  function drawNextExpandSide(ctx, s) {
    if (!s || !s.side || s.col == null) return;
    ctx.save();
    const b = boardRect();
    const x = cx(s.col);
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 2, b.y + 2, CELL - 4, b.h - 4);
    ctx.setLineDash([]);
    const ay = b.y + b.h + 16;
    const mid = x + CELL / 2;
    if (s.side === 'left') {
      arrow(ctx, mid + 10, ay, mid - 10, ay, PAL.expand, 3);
      txt(ctx, '下次開這側', mid + 16, ay, 12, PAL.expand, 'left');
    } else {
      arrow(ctx, mid - 10, ay, mid + 10, ay, PAL.expand, 3);
      txt(ctx, '下次開這側', mid - 16, ay, 12, PAL.expand, 'right');
    }
    ctx.restore();
  }

  // state: { remaining }  0 或未給 = 隱藏
  function drawSupplyRemaining(ctx, s) {
    if (!s || !s.remaining) return;
    ctx.save();
    const b = BOX.supply;
    panel(ctx, b, null, PAL.gravity);
    paintBall(ctx, b.x + 12, b.y + 13, 26);
    txt(ctx, '重力球補給', b.x + 48, b.y + 26, 14, PAL.textDim, 'left');
    txt(ctx, '剩餘 ' + s.remaining + ' 塊', b.x + b.w - 16, b.y + 26, 20, PAL.gravity, 'right');
    ctx.restore();
  }

  // state: { progress: 0~1 }  長按 R 期間
  function drawAbandonTimer(ctx, s) {
    if (!s) return;
    const p = clamp01(s.progress);
    ctx.save();
    const b = BOX.abandon;
    panel(ctx, b, null, PAL.danger);
    txt(ctx, '放棄本局: 按住 R 不放', b.x + 14, b.y + 17, 14, PAL.text, 'left');
    txt(ctx, (1 - p).toFixed(1) + ' 秒', b.x + b.w - 14, b.y + 17, 14, PAL.danger, 'right');
    const bx = b.x + 14, by = b.y + 34, bw = b.w - 28, bh = 10;
    rr(ctx, bx, by, bw, bh, 5);
    ctx.fillStyle = '#10131b';
    ctx.fill();
    if (p > 0) {
      rr(ctx, bx, by, Math.max(bh, bw * p), bh, 5);
      ctx.fillStyle = PAL.danger;
      ctx.fill();
    }
    ctx.restore();
  }

  // state: { score, multiplier, multiplierFlash (0~1, 倍率剛變動時由 1 遞減), best (null = 尚無紀錄), time (秒) }
  function drawHud(ctx, s) {
    s = s || {};
    ctx.save();
    let b = BOX.score;
    panel(ctx, b, '分數');
    txt(ctx, fmt(s.score), b.x + b.w - 16, b.y + 50, 34, PAL.text, 'right');

    b = BOX.mult;
    const f = clamp01(s.multiplierFlash);
    panel(ctx, b, null, f > 0 ? PAL.expand : null);
    txt(ctx, '分數倍率', b.x + 14, b.y + b.h / 2, 13, PAL.textDim, 'left');
    txt(ctx, '×' + (s.multiplier != null ? s.multiplier : 1).toFixed(2), b.x + b.w - 16, b.y + b.h / 2, 22, f > 0 ? PAL.expand : PAL.text, 'right');

    b = BOX.best;
    panel(ctx, b);
    txt(ctx, '最佳紀錄', b.x + 14, b.y + b.h / 2, 13, PAL.textDim, 'left');
    if (s.best == null) txt(ctx, '尚無紀錄', b.x + b.w - 16, b.y + b.h / 2, 16, PAL.textDim, 'right');
    else txt(ctx, fmt(s.best), b.x + b.w - 16, b.y + b.h / 2, 20, PAL.text, 'right');

    b = BOX.time;
    panel(ctx, b);
    txt(ctx, '時間', b.x + 14, b.y + b.h / 2, 13, PAL.textDim, 'left');
    txt(ctx, fmtTime(s.time), b.x + b.w - 16, b.y + b.h / 2, 20, PAL.text, 'right');

    txt(ctx, 'Esc 暫停　H 說明　長按 R 放棄', BOX.time.x + BOX.time.w, 600, 12, PAL.textDim, 'right');
    ctx.restore();
  }

  // ================= 事件(結算期間) =================
  function eventBanner(ctx, accent, icon, title, sub, t, ann) {
    const b = BOX.banner;
    rr(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(14,17,26,0.96)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (ann && ann.color && t >= 0.7) {
      // 尾端公告: 新目標色與需求顆數
      txt(ctx, title, b.x + 14, b.y + 14, 12, accent, 'left');
      txt(ctx, '新目標', b.x + 14, b.y + 38, 14, PAL.expand, 'left');
      paintSlime(ctx, b.x + 70, b.y + 25, 26, ann.color);
      const c = SLIME[ann.color];
      txt(ctx, c.name + '　' + (ann.required != null ? ann.required + ' 顆' : ''), b.x + 104, b.y + 38, 20, PAL.text, 'left');
    } else {
      if (icon) icon(b.x + 12, b.y + 14);
      const tx = icon ? b.x + 50 : b.x + 14;
      txt(ctx, title, tx, b.y + 19, 17, accent, 'left');
      if (sub) txt(ctx, sub, tx, b.y + 40, 13, PAL.text, 'left');
    }
  }

  function colFlash(ctx, col, side, t) {
    ctx.save();
    clipBoard(ctx);
    const b = boardRect();
    const x = cx(col);
    ctx.globalAlpha = 0.12 + 0.4 * (1 - clamp01(t));
    ctx.fillStyle = PAL.expand;
    ctx.fillRect(x, b.y, CELL, b.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 1.5, b.y + 1.5, CELL - 3, b.h - 3);
    const my = b.y + b.h / 2;
    if (side === 'left') arrow(ctx, x + CELL - 4, my, x + 4, my, PAL.expand, 3);
    else arrow(ctx, x + 4, my, x + CELL - 4, my, PAL.expand, 3);
    ctx.restore();
  }

  // state: { side: 'left'|'right', col, K, t (0~1, 1.2 秒), nextColor, nextRequired }
  function drawExpandEvent(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    if (s.col != null) colFlash(ctx, s.col, s.side, t);
    eventBanner(ctx, PAL.expand, null,
      '開欄　' + (s.side === 'left' ? '◀ 左側 +1 欄' : '右側 +1 欄 ▶'),
      s.K ? '同時削頂: 每欄最上面 ' + s.K + ' 格' : null,
      t, { color: s.nextColor, required: s.nextRequired });
    ctx.restore();
  }

  // state: { perCol: [{x, count}], total, t }  延展削頂與延伸削頂共用
  function drawShaveIndicator(ctx, s) {
    if (!s) return;
    ctx.save();
    const b = boardRect();
    (s.perCol || []).forEach(function (p) {
      const mx = cx(p.x) + CELL / 2;
      txt(ctx, p.count > 0 ? '−' + p.count : '0', mx, b.y - 7, 11, p.count > 0 ? PAL.shave : PAL.textDim, 'center', PAL.outline);
    });
    if (s.total != null) {
      const label = '削頂 共 −' + s.total + ' 格';
      ctx.font = font(12);
      const w = ctx.measureText(label).width + 20;
      const mx = b.x + b.w / 2;
      rr(ctx, mx - w / 2, b.y - 33, w, 17, 8);
      ctx.fillStyle = 'rgba(14,17,26,0.95)';
      ctx.fill();
      ctx.strokeStyle = PAL.shave;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      txt(ctx, label, mx, b.y - 24.5, 12, PAL.shave, 'center');
    }
    ctx.restore();
  }

  // state: { t }
  function drawFullWidthBonus(ctx, s) {
    const t = clamp01(s && s.t);
    ctx.save();
    const b = boardRect();
    const mx = b.x + b.w / 2, my = b.y + b.h * 0.42;
    const k = t < 0.12 ? 0.7 + 0.3 * (t / 0.12) : 1;
    ctx.translate(mx, my);
    ctx.scale(k, k);
    rr(ctx, -120, -30, 240, 60, 14);
    ctx.fillStyle = 'rgba(14,17,26,0.92)';
    ctx.fill();
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 3;
    ctx.stroke();
    txt(ctx, '滿寬完成', 0, -12, 14, PAL.expand, 'center');
    txt(ctx, '+1,500', 0, 12, 28, '#ffffff', 'center', PAL.outline);
    ctx.restore();
  }

  // state: { kind: 'multiplier'|'supply'|'shave', amount, value, t, nextColor, nextRequired }
  function drawExtendReward(ctx, s) {
    if (!s || !s.kind) return;
    const t = clamp01(s.t);
    ctx.save();
    let accent, icon, title, sub;
    if (s.kind === 'multiplier') {
      accent = PAL.expand;
      title = '獎勵: 分數倍率 +' + (s.amount != null ? s.amount : 0.25);
      sub = s.value != null ? '倍率變為 ×' + Number(s.value).toFixed(2) : null;
      icon = function (x, y) { txt(ctx, '×', x + 13, y + 13, 30, PAL.expand, 'center'); };
    } else if (s.kind === 'supply') {
      accent = PAL.gravity;
      title = '獎勵: 重力球補給';
      sub = '接下來 ' + (s.amount || 4) + ' 塊, 每塊都含重力球';
      icon = function (x, y) { paintBall(ctx, x, y, 28); };
    } else {
      accent = PAL.shave;
      title = '獎勵: 削頂';
      sub = '每欄最上面 ' + (s.amount || 2) + ' 格';
      icon = function (x, y) {
        ctx.strokeStyle = PAL.shave;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, 26, 26);
        hatch(ctx, x + 1, y + 1, 26, 26, PAL.shave, 5, 2);
      };
    }
    eventBanner(ctx, accent, icon, title, sub, t, { color: s.nextColor, required: s.nextRequired });
    ctx.restore();
  }

  // ================= 全畫面介面 =================
  function drawPauseMask(ctx) {
    ctx.save();
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(0, 0, W, H);
    txt(ctx, '暫停', W / 2, 250, 48, PAL.text, 'center');
    txt(ctx, 'Esc 繼續', W / 2, 320, 20, PAL.text, 'center');
    txt(ctx, 'H 看說明', W / 2, 354, 20, PAL.text, 'center');
    txt(ctx, '長按 R 1 秒 放棄這局', W / 2, 388, 20, PAL.danger, 'center');
    ctx.restore();
  }

  const REASON = { blockout: '新方塊沒有位置了', lockout: '堆出盤面頂線', abandon: '玩家放棄' };
  function gameOverPanel(ctx, x, y, s) {
    const w = 360, h = 300;
    rr(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(20,23,34,0.97)';
    ctx.fill();
    ctx.strokeStyle = PAL.danger;
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, '本局結束', x + w / 2, y + 34, 28, PAL.text, 'center');
    txt(ctx, REASON[s.reason] || '', x + w / 2, y + 66, 15, PAL.danger, 'center');
    txt(ctx, '分數', x + 30, y + 110, 15, PAL.textDim, 'left');
    txt(ctx, fmt(s.score), x + w - 30, y + 110, 34, '#ffffff', 'right');
    if (s.newRecord) {
      rr(ctx, x + 30, y + 128, 84, 22, 11);
      ctx.fillStyle = PAL.expand;
      ctx.fill();
      txt(ctx, '新紀錄!', x + 72, y + 139, 13, '#0d1a12', 'center');
    }
    const rows = [
      ['存活', Math.floor(s.seconds || 0) + ' 秒'],
      ['已解鎖欄數', (s.columns || 0) + ' / 4'],
      ['達成階數', String(s.stage || 0)],
      ['最佳紀錄', s.best == null ? '尚無紀錄' : fmt(s.best)],
    ];
    rows.forEach(function (r, i) {
      const yy = y + 168 + i * 24;
      txt(ctx, r[0], x + 30, yy, 14, PAL.textDim, 'left');
      txt(ctx, r[1], x + w - 30, yy, 16, PAL.text, 'right');
    });
    if (s.reason === 'abandon') txt(ctx, '放棄局不更新紀錄', x + w / 2, y + h - 36, 12, PAL.textDim, 'center');
    txt(ctx, 'R 重開　H 說明', x + w / 2, y + h - 16, 14, PAL.text, 'center');
  }

  // state: { score, seconds, columns, stage, reason: 'blockout'|'lockout'|'abandon', newRecord, best }
  function drawGameOver(ctx, s) {
    s = s || {};
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(0, 0, W, H);
    gameOverPanel(ctx, (W - 360) / 2, 170, s);
    ctx.restore();
  }

  // ================= 說明頁 =================
  const GUIDE = [
    { title: '同色連 4 顆就消掉', lines: ['方塊上的每一格都是一隻史萊姆。', '同色上下左右連到 4 隻, 整團消失。斜的不算。'] },
    { title: '消掉的地方會留下洞', lines: ['史萊姆消掉後, 那裡變成空洞。', '上面的史萊姆不會自己掉下來。'] },
    { title: '目標色與盤面變寬', lines: ['消掉目標色的史萊姆, 任務數字就減少; 歸零時盤面長出一欄, 每一欄最上面削掉一截。每次長完換一個目標色。', '每一塊只有一個落點 — 這塊要拿去湊哪一團, 由你決定。'] },
    { title: '重力球', lines: ['重力球可以當任何顏色湊團, 但它不算目標色。', '它被消掉時, 和那團相連的懸空史萊姆會整塊落到底。盤面上會標出哪些是懸空的。'] },
    { title: '開滿之後、結束與目標', lines: ['盤面長滿後不再變寬, 目標色任務照樣繼續, 每達成一次換拿一份獎勵。', '堆出盤面頂線就結束。挑戰更高的分數與最佳紀錄。'] },
    { title: '操作: 方塊', lines: ['← → 移動(按住連續移動)　↑ 順轉　Z 逆轉　X 轉半圈', '↓ 加速下落　空白鍵 直接落下', '(A / D 也能移動, W 順轉, S 加速下落)'] },
    { title: '操作: 暫停、說明、放棄、重開', lines: ['Esc 暫停 / 繼續　H 再看一次這份說明', '長按 R 1 秒 放棄這局(看說明時要先關掉)　結束後按 R 重開'] },
  ];

  function wrap(ctx, text, maxW) {
    const out = [];
    let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out;
  }
  // 字串盤面: 第一行 = 最上列; R/B/Y = 色 A/B/C, o = 重力球, . = 空
  function grid(lines, col0) {
    const out = [];
    const n = lines.length;
    col0 = col0 || 0;
    lines.forEach(function (ln, i) {
      for (let k = 0; k < ln.length; k++) {
        const ch = ln[k];
        if (ch === '.') continue;
        const cell = { x: col0 + k, y: n - i };
        if (ch === 'o') cell.kind = 'ball';
        else { cell.kind = 'color'; cell.color = { R: 'A', B: 'B', Y: 'C' }[ch]; }
        out.push(cell);
      }
    });
    return out;
  }
  function mini(ctx, left, bottom, frameMin, frameMax, rows, minCol, maxCol, fn) {
    withLay({ left: left, bottom: bottom, col0: frameMin, frameMin: frameMin, frameMax: frameMax, rows: rows, showTop: false }, function () {
      drawBoard(ctx, { minCol: minCol, maxCol: maxCol });
      if (fn) fn();
    });
  }
  function cells(ctx, list, mark, t) {
    list.forEach(function (c) { drawCell(ctx, Object.assign({}, c, { mark: mark || 'none', t: t || 0 })); });
  }
  // 把固定版位的元件搬到指定位置縮放畫
  function placeAt(ctx, src, dx, dy, k, fn) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(k, k);
    ctx.translate(-src.x, -src.y);
    fn();
    ctx.restore();
  }
  function keycap(ctx, x, y, label, w) {
    w = w || 40;
    rr(ctx, x, y, w, 36, 7);
    ctx.fillStyle = '#2a2f42';
    ctx.fill();
    ctx.strokeStyle = '#6a7290';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#20243a';
    ctx.fillRect(x + 3, y + 30, w - 6, 3);
    txt(ctx, label, x + w / 2, y + 17, label.length > 2 ? 14 : 17, PAL.text, 'center');
    return x + w;
  }
  function checkMark(ctx, x, y, ok) {
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = ok ? PAL.expand : '#5a6178';
    ctx.fill();
    ctx.strokeStyle = ok ? '#0d1a12' : '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (ok) { ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x + 8, y - 6); }
    else { ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); }
    ctx.stroke();
  }
  function caption(ctx, s, x, y, color, align, size) {
    txt(ctx, s, x, y, size || 15, color || PAL.text, align || 'center');
  }
  function miniPiece(ctx, x, y, s, rot) {
    // 小 T 形示意(用遊戲內史萊姆畫法)
    const shape = rot ? [[1, 0], [0, 1], [1, 1], [1, 2]] : [[0, 1], [1, 1], [2, 1], [1, 0]];
    const cols = ['A', 'B', 'C', 'A'];
    shape.forEach(function (p, i) { paintSlime(ctx, x + p[0] * s, y + p[1] * s, s, cols[i]); });
  }
  function rotIcon(ctx, x, y, dir, half) {
    // 旋轉箭頭: dir 1 = 順時針, -1 = 逆時針
    ctx.strokeStyle = PAL.text;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const r = 12;
    const a0 = -Math.PI * 0.8, a1 = half ? a0 + Math.PI * 1.6 : a0 + Math.PI * 1.1;
    ctx.beginPath();
    if (dir > 0) ctx.arc(x, y, r, a0, a1, false);
    else ctx.arc(x, y, r, -a0 - Math.PI, -a1 - Math.PI, true);
    ctx.stroke();
    const ea = dir > 0 ? a1 : -a1 - Math.PI;
    const ex = x + Math.cos(ea) * r, ey = y + Math.sin(ea) * r;
    const ta = ea + dir * Math.PI / 2;
    arrow(ctx, ex - Math.cos(ta) * 4, ey - Math.sin(ta) * 4, ex + Math.cos(ta) * 3, ey + Math.sin(ta) * 3, PAL.text, 2.5);
  }

  const FIG = {};

  FIG[1] = function (ctx) {
    // 左: 四方向相連 4 隻 → 消除
    const ok = grid(['....', 'R...', 'R...', 'RR..']);
    checkMark(ctx, 242, 196, true);
    mini(ctx, 190, 330, 0, 3, 4, 0, 3, function () { cells(ctx, ok, 'clearing', 0.35); });
    caption(ctx, '上下左右相連 4 隻 → 整團消失', 242, 352);
    // 右: 其中一隻只斜著碰到 → 不消
    const ng = grid(['....', '..R.', '.R..', '.RR.']);
    checkMark(ctx, 712, 196, false);
    mini(ctx, 660, 330, 0, 3, 4, 0, 3, function () {
      cells(ctx, ng);
      drawClusterCount(ctx, { x: 1, y: 2, n: 3 });
    });
    caption(ctx, '有一隻只斜著碰到 → 不消', 712, 352);
    // 下: 顆數數字
    const cnt = grid(['......', 'BB..Y.', 'RY.YY.']);
    mini(ctx, 300, 500, 0, 5, 3, 0, 5, function () {
      cells(ctx, cnt);
      drawClusterCount(ctx, { x: 0, y: 2, n: 2 });
      drawClusterCount(ctx, { x: 4, y: 2, n: 3 });
    });
    caption(ctx, '格子右上角的數字 = 這團現在有幾隻', 480, 450, PAL.text, 'left');
    caption(ctx, '(只有 1 隻不標; 到 4 隻就消掉了)', 480, 476, PAL.textDim, 'left', 13);
  };

  FIG[2] = function (ctx) {
    const before = grid(['.....', '.BY..', 'RRRR.', 'BYBYB', 'YBYBY']);
    const after = grid(['.....', '.BY..', '.....', 'BYBYB', 'YBYBY']);
    caption(ctx, '消除前', 265, 230, PAL.textDim);
    caption(ctx, '消除後', 695, 230, PAL.textDim);
    mini(ctx, 200, 390, 0, 4, 5, 0, 4, function () {
      cells(ctx, before.filter(function (c) { return c.y !== 3; }));
      cells(ctx, before.filter(function (c) { return c.y === 3; }), 'clearing', 0.3);
    });
    arrow(ctx, 360, 325, 600, 325, PAL.text, 3);
    mini(ctx, 630, 390, 0, 4, 5, 0, 4, function () {
      cells(ctx, after);
      drawFloatingMark(ctx, { cells: [{ x: 1, y: 4 }, { x: 2, y: 4 }], group: 0 });
    });
    caption(ctx, '消掉的位置變成空洞', 695, 424);
    caption(ctx, '上面的史萊姆停在原處, 懸在洞上', 695, 450);
    caption(ctx, '青色框 = 懸空的史萊姆(第 4 頁會用到)', 695, 480, PAL.gravity, 'center', 13);
  };

  FIG[3] = function (ctx) {
    // 前
    const k = 0.55;
    placeAt(ctx, BOX.target, 24, 240, k, function () { drawTargetColor(ctx, { color: 'A' }); });
    placeAt(ctx, BOX.task, 24, 304, k, function () { drawTaskProgress(ctx, { stage: 1, remaining: 3, required: 3, phase: 'expand', color: 'A' }); });
    const before = grid(['......', 'RR....', 'BRRY..', 'YBYBY.', 'BYBYBY']);
    const red = function (c) { return c.color === 'A'; };
    mini(ctx, 206, 410, -1, 6, 6, 0, 5, function () {
      cells(ctx, before.filter(function (c) { return !red(c); }));
      cells(ctx, before.filter(red), 'clearing', 0.3);
      drawClearResult(ctx, { cells: before.filter(red).map(function (c) { return { x: c.x, y: c.y, isTarget: true }; }), deducted: 4, balls: 0, targetColor: 'A', t: 0 });
      drawNextExpandSide(ctx, { side: 'left', col: -1 });
    });
    caption(ctx, '消掉目標色 → 任務數字減少', 240, 458);
    // 箭頭
    caption(ctx, '歸零', 470, 310, PAL.expand, 'center', 14);
    arrow(ctx, 434, 332, 506, 332, PAL.expand, 3);
    // 後
    placeAt(ctx, BOX.target, 516, 240, k, function () { drawTargetColor(ctx, { color: 'B', announcing: true, t: 0.1 }); });
    placeAt(ctx, BOX.task, 516, 304, k, function () { drawTaskProgress(ctx, { stage: 2, remaining: 5, required: 6, phase: 'expand', color: 'B' }); });
    const after = grid(['......', '......', 'B..Y..', 'YBYBY.', 'BYBYBY']);
    const tops = { 0: 3, 1: 2, 2: 2, 3: 3, 4: 2, 5: 1 };
    mini(ctx, 698, 410, -1, 6, 6, -1, 5, function () {
      cells(ctx, after.filter(function (c) { return tops[c.x] !== c.y; }));
      cells(ctx, after.filter(function (c) { return tops[c.x] === c.y; }), 'shaving', 0.4);
      colFlash(ctx, -1, 'left', 0.3);
      drawShaveIndicator(ctx, { perCol: [-1, 0, 1, 2, 3, 4, 5].map(function (x) { return { x: x, count: x < 0 ? 0 : 1 }; }), total: 6 });
      drawNextExpandSide(ctx, { side: 'right', col: 6 });
    });
    caption(ctx, '指示的那一側多一欄, 每欄最上面削掉一截', 735, 458, PAL.text, 'center', 14);
    caption(ctx, '目標色換成新的一色', 735, 482, PAL.textDim, 'center', 13);
  };

  FIG[4] = function (ctx) {
    // 已依規則驗算: 紅團 = 球 + 3 紅(唯一候選團); A 塊整體落 3 格; B 塊不相連、仍懸空
    // 第一行 = 第 7 列
    const bef = grid(['.......', '..B..YY', '..YB...', '..o....', '..R....', '.RR....', 'BYBY.BY']);
    const inA = { '2,6': 1, '2,5': 1, '3,5': 1 };
    const inB = { '5,6': 1, '6,6': 1 };
    const inCluster = { '2,4': 1, '2,3': 1, '2,2': 1, '1,2': 1 };
    const key = function (c) { return c.x + ',' + c.y; };
    const blockA = bef.filter(function (c) { return inA[key(c)]; });
    const blockB = bef.filter(function (c) { return inB[key(c)]; });
    const rest = bef.filter(function (c) { return !inA[key(c)] && !inCluster[key(c)]; });
    caption(ctx, '消除前', 241, 214, PAL.textDim);
    caption(ctx, '消除後', 711, 214, PAL.textDim);
    mini(ctx, 150, 440, 0, 6, 7, 0, 6, function () {
      cells(ctx, rest);
      cells(ctx, blockA);
      cells(ctx, bef.filter(function (c) { return inCluster[key(c)]; }), 'clearing', 0.25);
      drawFloatingMark(ctx, { cells: blockA, group: 0 });
      drawFloatingMark(ctx, { cells: blockB, group: 1 });
      drawClusterCount(ctx, { x: 5, y: 6, n: 2 });
    });
    // 右側說明
    txt(ctx, '不相連的懸空塊', 342, 297, 14, PAL.gravity, 'left');
    txt(ctx, '和它相連的懸空塊', 342, 330, 14, PAL.gravity, 'left');
    txt(ctx, '含重力球的一團(消除中)', 342, 375, 14, PAL.text, 'left');
    arrow(ctx, 338, 330, 258, 322, PAL.textDim, 1.5);
    arrow(ctx, 338, 375, 232, 375, PAL.textDim, 1.5);

    const blockA2 = blockA.map(function (c) { return Object.assign({}, c, { y: c.y - 3 }); });
    mini(ctx, 620, 440, 0, 6, 7, 0, 6, function () {
      cells(ctx, rest);
      drawClusterCount(ctx, { x: 5, y: 6, n: 2 });
      cells(ctx, blockA2, 'falling', 1);
      // 原位虛線 + 落下箭頭
      contourPath(ctx, blockA, 3);
      ctx.save();
      ctx.strokeStyle = 'rgba(79,224,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();
      drawFloatingMark(ctx, { cells: blockB, group: 1 });
    });
    arrow(ctx, 620 + 4 * CELL - 6, 440 - 5 * CELL + 8, 620 + 4 * CELL - 6, 440 - 2 * CELL - 4, PAL.gravity, 2.5);
    txt(ctx, '相連的那塊', 812, 380, 14, PAL.gravity, 'left');
    txt(ctx, '整塊落到底, 形狀不變', 812, 402, 13, PAL.text, 'left');
    txt(ctx, '不相連的那塊', 812, 290, 14, PAL.gravity, 'left');
    txt(ctx, '原地不動', 812, 312, 13, PAL.text, 'left');
    caption(ctx, '重力球: 三色環 + 向下箭頭。能當任何顏色湊團, 但不算目標色。', 480, 490);
    caption(ctx, '青色框框起來的 = 懸空的一整塊; 只有和被消那團相連的才會落。', 480, 518, PAL.textDim, 'center', 14);
  };

  FIG[5] = function (ctx) {
    // 上: 滿寬 → 任務歸零 → 獎勵
    placeAt(ctx, BOX.task, 30, 200, 0.62, function () { drawTaskProgress(ctx, { stage: 7, remaining: 0, required: 12, phase: 'extend', color: 'C' }); });
    const strip = grid(['..Y....B..', 'B.BY.RBYR.', 'YRYBRYBRYB'], -2);
    mini(ctx, 240, 290, -2, 7, 3, -2, 7, function () { cells(ctx, strip); });
    caption(ctx, '滿寬 10 欄, 不再變寬', 370, 306, PAL.textDim, 'center', 13);
    arrow(ctx, 516, 250, 600, 250, PAL.expand, 3);
    rr(ctx, 612, 212, 220, 76, 12);
    ctx.fillStyle = 'rgba(14,17,26,0.96)';
    ctx.fill();
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 禮物盒
    ctx.fillStyle = PAL.expand;
    ctx.fillRect(630, 240, 34, 28);
    ctx.fillRect(626, 232, 42, 10);
    ctx.fillStyle = '#0d1a12';
    ctx.fillRect(644, 232, 6, 36);
    txt(ctx, '拿到一份獎勵', 680, 244, 17, PAL.expand, 'left');
    txt(ctx, '每達成一次就一份', 680, 268, 13, PAL.text, 'left');

    // 下: 堆到頂線 → 結束
    const k = 0.45;
    ctx.save();
    ctx.translate(300 - 350 * k, 340 - 110 * k);
    ctx.scale(k, k);
    drawBoard(ctx, { minCol: -2, maxCol: 7 });
    const heights = [16, 18, 19, 17, 19, 18, 15, 19, 17, 16];
    const col = ['A', 'B', 'C'];
    for (let i = 0; i < 10; i++) {
      for (let y = 1; y <= heights[i]; y++) {
        if (((i * 7 + y * 13) % 11) === 0 && y < heights[i]) continue; // 洞
        drawCell(ctx, { x: i - 2, y: y, kind: 'color', color: col[(i + y) % 3] });
      }
    }
    ctx.restore();
    txt(ctx, '堆出頂線', 150, 356, 16, PAL.topLine, 'left');
    txt(ctx, '→ 這局結束', 150, 380, 14, PAL.text, 'left');
    arrow(ctx, 240, 356, 292, 344, PAL.topLine, 2);
    ctx.save();
    ctx.translate(520, 346);
    ctx.scale(0.62, 0.62);
    gameOverPanel(ctx, 0, 0, { score: 18240, seconds: 214, columns: 4, stage: 9, reason: 'lockout', newRecord: false, best: 21500 });
    ctx.restore();
    txt(ctx, '分數與最佳紀錄', 756, 400, 15, PAL.text, 'left');
    txt(ctx, '挑戰更高分', 756, 424, 13, PAL.textDim, 'left');
  };

  FIG[6] = function (ctx) {
    const rows = [
      { keys: ['←', '→'], icon: 'move', label: '左右移動(按住連續移動)' },
      { keys: ['↑'], icon: 'cw', label: '順時針轉' },
      { keys: ['Z'], icon: 'ccw', label: '逆時針轉' },
      { keys: ['X'], icon: 'half', label: '轉半圈' },
      { keys: ['↓'], icon: 'soft', label: '加速下落' },
      { keys: ['空白鍵'], icon: 'hard', label: '直接落下', wide: true },
    ];
    rows.forEach(function (r, i) {
      const y = 186 + i * 56;
      let x = 70;
      r.keys.forEach(function (kk) { x = keycap(ctx, x, y, kk, r.wide ? 96 : 40) + 8; });
      const ix = 250, iy = y + 18;
      miniPiece(ctx, ix - 15, iy - 10, 10, false);
      if (r.icon === 'move') {
        arrow(ctx, ix - 20, iy, ix - 36, iy, PAL.text, 2.5);
        arrow(ctx, ix + 20, iy, ix + 36, iy, PAL.text, 2.5);
      } else if (r.icon === 'cw') rotIcon(ctx, ix + 42, iy, 1, false);
      else if (r.icon === 'ccw') rotIcon(ctx, ix + 42, iy, -1, false);
      else if (r.icon === 'half') rotIcon(ctx, ix + 42, iy, 1, true);
      else if (r.icon === 'soft') { arrow(ctx, ix + 34, iy - 12, ix + 34, iy + 4, PAL.text, 2.5); arrow(ctx, ix + 44, iy - 12, ix + 44, iy + 4, PAL.text, 2.5); }
      else { arrow(ctx, ix + 40, iy - 14, ix + 40, iy + 14, PAL.text, 3); ctx.fillStyle = PAL.text; ctx.fillRect(ix + 30, iy + 15, 20, 3); }
      txt(ctx, r.label, 320, iy, 16, PAL.text, 'left');
    });
    // 右: 落點指示
    const stack = grid(['......', '......', 'Y...B.', 'BRYBRY', 'RYBRYB']);
    mini(ctx, 660, 566, 0, 5, 12, 0, 5, function () {
      cells(ctx, stack);
      const piece = [{ x: 1, y: 12, kind: 'color', color: 'B' }, { x: 2, y: 12, kind: 'color', color: 'C' }, { x: 3, y: 12, kind: 'color', color: 'A' }, { x: 2, y: 11, kind: 'ball' }];
      const ghost = piece.map(function (c) { return Object.assign({}, c, { y: c.y - 8 }); });
      drawGhost(ctx, { cells: ghost });
      drawPiece(ctx, { cells: piece, mode: 'falling' });
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx(2) + CELL / 2, cy(11) + CELL + 2);
      ctx.lineTo(cx(2) + CELL / 2, cy(4) - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    txt(ctx, '空白鍵', 830, 440, 16, PAL.text, 'left');
    txt(ctx, '→ 直接落到', 830, 464, 14, PAL.text, 'left');
    txt(ctx, '　這個框的位置', 830, 486, 14, PAL.text, 'left');
    arrow(ctx, 826, 475, 772, 475, PAL.text, 2);
  };

  FIG[7] = function (ctx) {
    const items = [
      { key: 'Esc', cap: '暫停 / 繼續' },
      { key: 'H', cap: '再看一次說明' },
      { key: 'R', cap: '按住 1 秒: 放棄這局', hold: true },
      { key: 'R', cap: '結束後按: 重開' },
    ];
    items.forEach(function (it, i) {
      const x = 50 + i * 220, y = 180;
      rr(ctx, x, y, 200, 360, 12);
      ctx.fillStyle = PAL.panel;
      ctx.fill();
      ctx.strokeStyle = it.hold ? PAL.danger : PAL.panelEdge;
      ctx.lineWidth = it.hold ? 2 : 1;
      ctx.stroke();
      const kw = it.key.length > 1 ? 60 : 44;
      keycap(ctx, x + 100 - kw / 2, y + 16, it.key, kw);
      if (it.hold) {
        // 按住: 外圈進度環
        ctx.beginPath();
        ctx.arc(x + 100, y + 34, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.7);
        ctx.strokeStyle = PAL.danger;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      txt(ctx, it.cap, x + 100, y + 86, 14, it.hold ? PAL.danger : PAL.text, 'center');
      const sx = x + 4, sy = y + 110, sw = 192, sh = 128;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
      ctx.translate(sx, sy);
      ctx.scale(0.2, 0.2);
      if (i === 0) drawPauseMask(ctx);
      else if (i === 1) drawGuidePage(ctx, { page: 1, mode: 'ingame' });
      else if (i === 2) { drawPauseMask(ctx); ctx.restore(); ctx.save(); }
      else { drawBackground(ctx); drawGameOver(ctx, { score: 9870, seconds: 168, columns: 3, stage: 4, reason: 'blockout', best: 12400 }); }
      ctx.restore();
      if (i === 2) {
        placeAt(ctx, BOX.abandon, sx + 2, sy + 86, 188 / 302, function () { drawAbandonTimer(ctx, { progress: 0.7 }); });
        txt(ctx, '暫停中也可以', sx + sw / 2, sy + 20, 12, PAL.textDim, 'center');
      }
      ctx.strokeStyle = PAL.panelEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      if (it.hold) {
        // 時間軸: 要按住不是點一下
        const tx = x + 20, ty = y + 270, tw = 160;
        txt(ctx, '按下', tx, ty - 14, 12, PAL.textDim, 'left');
        txt(ctx, '1 秒', tx + tw, ty - 14, 12, PAL.textDim, 'right');
        rr(ctx, tx, ty, tw, 10, 5);
        ctx.fillStyle = '#10131b';
        ctx.fill();
        rr(ctx, tx, ty, tw * 0.7, 10, 5);
        ctx.fillStyle = PAL.danger;
        ctx.fill();
        txt(ctx, '放開就取消', x + 100, ty + 30, 12, PAL.textDim, 'center');
        txt(ctx, '看說明時要先關掉', x + 100, ty + 52, 12, PAL.textDim, 'center');
      } else if (i === 0) {
        txt(ctx, '暫停時看不到盤面', x + 100, y + 290, 12, PAL.textDim, 'center');
      } else if (i === 1) {
        txt(ctx, '← → 翻頁　Enter / H 關閉', x + 100, y + 290, 12, PAL.textDim, 'center');
      } else {
        txt(ctx, '立刻開始新的一局', x + 100, y + 290, 12, PAL.textDim, 'center');
      }
    });
  };

  // state: { page (1~7), mode: 'opening'|'ingame'|'gameover' }
  function drawGuidePage(ctx, s) {
    s = s || {};
    const total = GUIDE.length;
    const page = Math.max(1, Math.min(total, s.page || 1));
    const g = GUIDE[page - 1];
    ctx.save();
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, W, H);
    txt(ctx, '玩家說明', 50, 22, 13, PAL.textDim, 'left');
    txt(ctx, page + ' / ' + total, W - 50, 22, 13, PAL.textDim, 'right');
    txt(ctx, g.title, 50, 54, 28, PAL.text, 'left');
    ctx.font = font(16, 'normal');
    let y = 92;
    g.lines.forEach(function (ln) {
      wrap(ctx, ln, W - 100).forEach(function (l) {
        txt(ctx, l, 50, y, 16, PAL.text, 'left', null, 'normal');
        y += 24;
      });
    });
    ctx.save();
    if (FIG[page]) FIG[page](ctx);
    ctx.restore();
    // 頁尾: 翻頁與關閉(每頁固定)
    ctx.fillStyle = '#0e1017';
    ctx.fillRect(0, 598, W, 42);
    for (let i = 1; i <= total; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 - (total - 1) * 7 + (i - 1) * 14, 606, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === page ? PAL.text : '#3a4058';
      ctx.fill();
    }
    txt(ctx, '← / A 上一頁', 50, 624, 15, page > 1 ? PAL.text : '#474e66', 'left');
    txt(ctx, '→ / D 下一頁', W - 50, 624, 15, page < total ? PAL.text : '#474e66', 'right');
    txt(ctx, 'Enter / H 關閉' + (s.mode === 'opening' ? '(開始遊戲)' : ''), W / 2, 624, 15, PAL.expand, 'center');
    ctx.restore();
  }

  // ================= 匯出 =================
  window.Art = {
    canvas: { width: W, height: H },
    palette: PAL,
    slimeColors: SLIME,
    cellSize: CELL,
    // RD 用: 盤面座標 → 畫布像素(預設版位)
    cellRect: function (x, y) { return { x: cx(x), y: cy(y), w: CELL, h: CELL }; },
    board: { left: 350, right: 610, top: 110, bottom: 604, minAbsCol: -2, maxAbsCol: 7, rows: 19 },
    drawBackground: drawBackground,
    drawPlayer: drawPiece, // 契約保留名, 等同 drawPiece
    drawBoard: drawBoard,
    drawCell: drawCell,
    drawGravityBall: drawGravityBall,
    drawClusterCount: drawClusterCount,
    drawFloatingMark: drawFloatingMark,
    drawFloatingEventBlock: drawFloatingEventBlock,
    drawGravityEvent: drawGravityEvent,
    drawExtraClear: drawExtraClear,
    drawClearResult: drawClearResult,
    drawPiece: drawPiece,
    drawGhost: drawGhost,
    drawNextPreview: drawNextPreview,
    drawTargetColor: drawTargetColor,
    drawTaskProgress: drawTaskProgress,
    drawNextExpandSide: drawNextExpandSide,
    drawSupplyRemaining: drawSupplyRemaining,
    drawAbandonTimer: drawAbandonTimer,
    drawExpandEvent: drawExpandEvent,
    drawShaveIndicator: drawShaveIndicator,
    drawFullWidthBonus: drawFullWidthBonus,
    drawExtendReward: drawExtendReward,
    drawPauseMask: drawPauseMask,
    drawGameOver: drawGameOver,
    drawGuidePage: drawGuidePage,
    drawHud: drawHud,
  };
})();
