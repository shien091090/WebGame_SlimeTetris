/* ============================================================
 * Slime Tetris - Art layer (spec v9)
 * 全域物件, 非 ES module。只負責「給我狀態, 我畫出來」。
 * 不算碰撞、不管輸入、不改狀態。
 * ============================================================ */
(function () {
  'use strict';

  // ---------- 幾何常數 ----------
  var W = 960, H = 640;
  var CELL = 26;
  var ROWS_VISIBLE = 19;        // 列 1 ~ 列 19 可見
  var MID_X = 480;              // 中線 = 絕對欄 2|3 接縫, 固定在畫布正中
  var BOARD_BOTTOM = 606;       // 列 1 的下緣
  var BOARD_TOP = BOARD_BOTTOM - ROWS_VISIBLE * CELL;   // 112, 列 19 的上緣
  var FULL_LEFT = MID_X - 5 * CELL;    // 350, 絕對欄 -2 的左緣
  var FULL_RIGHT = MID_X + 5 * CELL;   // 610, 絕對欄 7 的右緣

  // 面板矩形
  var BOX_SCORE = { x: 24, y: 16, w: 314, h: 96 };
  var BOX_CENTER = { x: 352, y: 16, w: 256, h: 88 };
  var BOX_NEXT = { x: 622, y: 16, w: 314, h: 96 };
  var PANEL_L = { x: 24, y: 130, w: 314, h: 186 };
  var PANEL_R = { x: 622, y: 130, w: 314, h: 186 };
  var PICK_L = { x: 24, y: 332, w: 314, h: 180 };
  var PICK_R = { x: 622, y: 332, w: 314, h: 180 };
  var RESTART_BTN = { x: 380, y: 452, w: 200, h: 46 };

  var P = {
    bg: '#0b111c',
    bgGlow: '#152238',
    panelFill: '#141d2e',
    panelEdge: '#2a3a58',
    well: '#070b13',
    wellHalfL: '#0c1320',
    wellHalfR: '#090f1a',
    wellLine: '#1a2540',
    wellSlot: '#121a2b',
    frame: '#33456a',
    midline: '#f2f7ff',
    midlineDim: '#7f93b8',
    slimeA: '#4ee39f',
    slimeB: '#ffab2e',
    slimeC: '#a78bff',
    ghost: '#9fb4d8',
    text: '#e9f0ff',
    textDim: '#8ba0c4',
    accent: '#ffd54a',
    expensive: '#ff5f6d',
    cheap: '#5fd0ff',
    expand: '#7ee8ff',
    trim: '#7ee8ff',
    clearGood: '#ffd54a',
    clearOff: '#7b8aa6',
    mask: 'rgba(6,10,18,0.90)'
  };

  var SLIME = { A: P.slimeA, B: P.slimeB, C: P.slimeC, 0: P.slimeA, 1: P.slimeB, 2: P.slimeC };

  // ---------- 幾何工具 ----------
  function colToX(absCol) { return MID_X + (absCol - 3) * CELL; }
  function rowToY(row) { return BOARD_BOTTOM - row * CELL; }
  function cellRect(absCol, row) { return { x: colToX(absCol), y: rowToY(row), w: CELL, h: CELL }; }
  function slimeColor(c) { return SLIME[c] || P.slimeA; }

  function shade(hex, amt) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= (1 + amt); g *= (1 + amt); b *= (1 + amt); }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function rgba(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }
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
  function clipBoard(ctx) {
    ctx.beginPath();
    ctx.rect(FULL_LEFT - 2, BOARD_TOP, (FULL_RIGHT - FULL_LEFT) + 4, BOARD_BOTTOM - BOARD_TOP);
    ctx.clip();
  }
  function text(ctx, str, x, y, font, color, align, baseline) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'alphabetic';
    ctx.fillText(str, x, y);
  }
  function panelPlate(ctx, box, edge) {
    var g = ctx.createLinearGradient(box.x, box.y, box.x, box.y + box.h);
    g.addColorStop(0, '#182338');
    g.addColorStop(1, '#101828');
    ctx.fillStyle = g;
    rr(ctx, box.x, box.y, box.w, box.h, 10); ctx.fill();
    ctx.strokeStyle = edge || P.panelEdge;
    ctx.lineWidth = 1;
    rr(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10); ctx.stroke();
  }
  function sideOf(state) { return (state && state.side === 'right') ? 'right' : 'left'; }
  function sidePanel(side) { return side === 'right' ? PANEL_R : PANEL_L; }
  function sidePick(side) { return side === 'right' ? PICK_R : PICK_L; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // 單顆史萊姆本體(不含標記), rect 為格位矩形
  function slimeBody(ctx, x, y, w, h, color, alpha) {
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    var inset = 1.5;
    var bx = x + inset, by = y + inset, bw = w - inset * 2, bh = h - inset * 2;
    var g = ctx.createLinearGradient(bx, by, bx, by + bh);
    g.addColorStop(0, shade(color, 0.22));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.30));
    ctx.fillStyle = g;
    rr(ctx, bx, by, bw, bh, 7); ctx.fill();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.ellipse(bx + bw * 0.34, by + bh * 0.28, bw * 0.20, bh * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 外緣
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.lineWidth = 1;
    rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ============================================================
  // 背景(靜態): 底色、面板底板、滿寬 10 欄的預留footprint
  // ============================================================
  function drawBackground(ctx) {
    ctx.save();
    var g = ctx.createRadialGradient(MID_X, 300, 60, MID_X, 300, 640);
    g.addColorStop(0, P.bgGlow);
    g.addColorStop(1, P.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 滿寬 10 欄的預留範圍(未解鎖欄以虛線槽位示意)
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    rr(ctx, FULL_LEFT - 12, BOARD_TOP - 12, (FULL_RIGHT - FULL_LEFT) + 24, (BOARD_BOTTOM - BOARD_TOP) + 24, 12);
    ctx.fill();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = P.wellSlot;
    ctx.lineWidth = 1;
    var slots = [-2, -1, 6, 7];
    for (var i = 0; i < slots.length; i++) {
      var x = colToX(slots[i]);
      rr(ctx, x + 1.5, BOARD_TOP + 1.5, CELL - 3, (BOARD_BOTTOM - BOARD_TOP) - 3, 4);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 面板底板
    panelPlate(ctx, BOX_SCORE);
    panelPlate(ctx, BOX_NEXT);
    panelPlate(ctx, PANEL_L);
    panelPlate(ctx, PANEL_R);

    // 底部資訊條
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    rr(ctx, 24, 612, 912, 20, 6); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 盤面(井、格線、邊界、新開欄提示)
  // state: { minCol, maxCol, newCols:[absCol...], newColT:0~1 }
  // ============================================================
  function drawBoard(ctx, state) {
    ctx.save();
    var minC = state && state.minCol !== undefined ? state.minCol : 0;
    var maxC = state && state.maxCol !== undefined ? state.maxCol : 5;
    var x0 = colToX(minC), x1 = colToX(maxC) + CELL;
    var y0 = BOARD_TOP, y1 = BOARD_BOTTOM;

    // 井底
    ctx.fillStyle = P.well;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // 左右半底色(極輕微色差, 強化半盤歸屬)
    if (x0 < MID_X) { ctx.fillStyle = P.wellHalfL; ctx.fillRect(x0, y0, Math.min(MID_X, x1) - x0, y1 - y0); }
    if (x1 > MID_X) { ctx.fillStyle = P.wellHalfR; ctx.fillRect(Math.max(MID_X, x0), y0, x1 - Math.max(MID_X, x0), y1 - y0); }

    // 格線
    ctx.strokeStyle = P.wellLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = minC; c <= maxC + 1; c++) {
      var gx = colToX(c) + 0.5;
      ctx.moveTo(gx, y0); ctx.lineTo(gx, y1);
    }
    for (var r = 0; r <= ROWS_VISIBLE; r++) {
      var gy = rowToY(r) + 0.5;
      ctx.moveTo(x0, gy); ctx.lineTo(x1, gy);
    }
    ctx.stroke();

    // 天花板開口(列 20 以上不可見): 上緣漸層淡出, 表示沒有硬界
    var fg = ctx.createLinearGradient(0, y0, 0, y0 + 34);
    fg.addColorStop(0, 'rgba(120,150,200,0.16)');
    fg.addColorStop(1, 'rgba(120,150,200,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(x0, y0, x1 - x0, 34);

    // 邊框(左右牆較粗, 表示可推出去的邊界)
    ctx.strokeStyle = P.frame;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 + 1, y0); ctx.lineTo(x0 + 1, y1);
    ctx.moveTo(x1 - 1, y0); ctx.lineTo(x1 - 1, y1);
    ctx.moveTo(x0, y1 - 1); ctx.lineTo(x1, y1 - 1);
    ctx.stroke();

    // 本次新開的欄
    var nc = (state && state.newCols) || [];
    var t = state && state.newColT !== undefined ? clamp01(state.newColT) : 0;
    for (var i = 0; i < nc.length; i++) {
      var nx = colToX(nc[i]);
      ctx.fillStyle = rgba(P.expand, 0.10 + 0.16 * (1 - t));
      ctx.fillRect(nx, y0, CELL, y1 - y0);
      ctx.strokeStyle = rgba(P.expand, 0.35 + 0.5 * (1 - t));
      ctx.lineWidth = 2;
      ctx.strokeRect(nx + 1, y0 + 1, CELL - 2, (y1 - y0) - 2);
    }

    // 欄底刻度(每欄一個小點, 幫忙對欄)
    ctx.fillStyle = 'rgba(160,190,230,0.25)';
    for (var c2 = minC; c2 <= maxC; c2++) {
      ctx.fillRect(colToX(c2) + CELL / 2 - 1, y1 + 3, 2, 3);
    }
    ctx.restore();
  }

  // ============================================================
  // 中線(絕對欄 2|3 接縫, 全程可見, 畫在格位之上)
  // state: { emphasis: 0~1 }  (可省略)
  // ============================================================
  function drawMidline(ctx, state) {
    ctx.save();
    var em = state && state.emphasis ? clamp01(state.emphasis) : 0;
    var top = BOARD_TOP - 14, bot = BOARD_BOTTOM + 10;

    // 暗底(讓線在任何顏色上都讀得到)
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(MID_X, top); ctx.lineTo(MID_X, bot); ctx.stroke();

    ctx.strokeStyle = rgba(P.midline, 0.75 + 0.25 * em);
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.moveTo(MID_X, top); ctx.lineTo(MID_X, bot); ctx.stroke();
    ctx.setLineDash([]);

    // 上下端菱形端點
    ctx.fillStyle = rgba(P.midline, 0.9);
    [top, bot].forEach(function (y) {
      ctx.beginPath();
      ctx.moveTo(MID_X, y - 5); ctx.lineTo(MID_X + 4, y); ctx.lineTo(MID_X, y + 5); ctx.lineTo(MID_X - 4, y);
      ctx.closePath(); ctx.fill();
    });

    // 半盤標籤(貼在盤頂內側, 常空著的區域)
    text(ctx, '左半', MID_X - 8, BOARD_TOP + 16, '11px sans-serif', rgba(P.midlineDim, 0.85), 'right', 'middle');
    text(ctx, '右半', MID_X + 8, BOARD_TOP + 16, '11px sans-serif', rgba(P.midlineDim, 0.85), 'left', 'middle');
    ctx.restore();
  }

  // ============================================================
  // 盤面格位(單格; RD 逐格呼叫)
  // state: { col, row, color:'A'|'B'|'C', mark:null|'clear'|'trim', markT:0~1 }
  // ============================================================
  function drawCell(ctx, state) {
    ctx.save();
    clipBoard(ctx);
    var r = cellRect(state.col, state.row);
    var color = slimeColor(state.color);
    var mark = state.mark || null;
    var t = state.markT !== undefined ? clamp01(state.markT) : 0;

    if (mark === 'trim') {
      // 獎勵削除標記中: 去彩度 + 向下箭頭 + 青色虛框(延展送的)
      slimeBody(ctx, r.x, r.y, r.w, r.h, color, 0.35 * (1 - t) + 0.15);
      ctx.strokeStyle = rgba(P.trim, 0.9 - 0.6 * t);
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(P.trim, 0.95 - 0.6 * t);
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2 - 5, r.y + 9);
      ctx.lineTo(r.x + r.w / 2 + 5, r.y + 9);
      ctx.lineTo(r.x + r.w / 2, r.y + 18);
      ctx.closePath(); ctx.fill();
    } else if (mark === 'clear') {
      // 消除標記中: 保留顏色 + 白閃 + 外擴環(我消掉的)
      slimeBody(ctx, r.x, r.y, r.w, r.h, color, 1);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * (1 - t)).toFixed(3) + ')';
      rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - t)).toFixed(3) + ')';
      ctx.lineWidth = 2;
      var grow = 4 * t;
      rr(ctx, r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, 8); ctx.stroke();
    } else {
      slimeBody(ctx, r.x, r.y, r.w, r.h, color, 1);
    }
    ctx.restore();
  }

  // ============================================================
  // 同色團顆數標示(每團一個, 錨在團的左上角格位)
  // state: { col, row, n, color }
  // ============================================================
  function drawClusterCount(ctx, state) {
    ctx.save();
    clipBoard(ctx);
    var r = cellRect(state.col, state.row);
    var n = state.n;
    var col = slimeColor(state.color);
    var cx = r.x + 9, cy = r.y + 9, rad = 8;
    // 深色圓底, 不蓋住顏色(只佔格位左上 1/4 不到)
    ctx.fillStyle = 'rgba(8,12,20,0.86)';
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    // n=3(差一顆就消)用白色實環 + 外暈; n=2 用該團顏色細環
    if (n >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, rad + 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
    }
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    text(ctx, String(n), cx, cy + 0.5, 'bold 12px sans-serif', n >= 3 ? '#ffffff' : col, 'center', 'middle');
    ctx.restore();
  }

  // ============================================================
  // 落點指示 ghost(全程顯示, 每格帶色, 不做任何預測)
  // state: { cells:[{col,row,color}] }
  // ============================================================
  function drawGhost(ctx, state) {
    ctx.save();
    clipBoard(ctx);
    var cells = (state && state.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], r = cellRect(c.col, c.row), col = slimeColor(c.color);
      ctx.fillStyle = rgba(col, 0.18);
      rr(ctx, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 7); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.85);
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6); ctx.stroke();
      ctx.setLineDash([]);
      // 底邊實心條, 一眼看出停駐列
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fillRect(r.x + 4, r.y + r.h - 5, r.w - 8, 3);
    }
    ctx.restore();
  }

  // ============================================================
  // 落下方塊
  // state: { cells:[{col,row,color}], phase:'fall'|'soft'|'lock', lockT:0~1 }
  // ============================================================
  function drawPiece(ctx, state) {
    ctx.save();
    clipBoard(ctx);
    var cells = (state && state.cells) || [];
    var phase = (state && state.phase) || 'fall';
    var lockT = state && state.lockT !== undefined ? clamp01(state.lockT) : 0;
    var i, c, r;

    if (phase === 'soft') {
      for (i = 0; i < cells.length; i++) {
        c = cells[i]; r = cellRect(c.col, c.row);
        var sg = ctx.createLinearGradient(0, r.y - 22, 0, r.y + r.h);
        sg.addColorStop(0, rgba(slimeColor(c.color), 0));
        sg.addColorStop(1, rgba(slimeColor(c.color), 0.30));
        ctx.fillStyle = sg;
        ctx.fillRect(r.x + 4, r.y - 22, r.w - 8, 22);
      }
    }
    for (i = 0; i < cells.length; i++) {
      c = cells[i]; r = cellRect(c.col, c.row);
      slimeBody(ctx, r.x, r.y, r.w, r.h, slimeColor(c.color), 1);
    }
    if (phase === 'lock') {
      // 鎖定延遲中: 白色脈動外框(快到了)
      var a = 0.35 + 0.45 * Math.abs(Math.sin(lockT * Math.PI * 3));
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (i = 0; i < cells.length; i++) {
        c = cells[i]; r = cellRect(c.col, c.row);
        rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 7); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ============================================================
  // 下一塊預覽
  // state: { cells:[{x,y,color}], masked:false }  x 向右 0..3, y 向上 0..1
  // ============================================================
  function drawNextPreview(ctx, state) {
    ctx.save();
    var b = BOX_NEXT;
    text(ctx, 'NEXT', b.x + 16, b.y + 26, 'bold 13px sans-serif', P.textDim, 'left', 'middle');
    text(ctx, '下一塊', b.x + 16, b.y + 48, '12px sans-serif', P.textDim, 'left', 'middle');

    if (state && state.masked) {
      ctx.fillStyle = 'rgba(10,15,24,0.92)';
      rr(ctx, b.x + 86, b.y + 12, b.w - 102, b.h - 24, 8); ctx.fill();
      text(ctx, '?', b.x + 86 + (b.w - 102) / 2, b.y + b.h / 2, 'bold 30px sans-serif', P.textDim, 'center', 'middle');
      ctx.restore(); return;
    }
    var cells = (state && state.cells) || [];
    if (!cells.length) { ctx.restore(); return; }
    var minX = 99, maxX = -99, minY = 99, maxY = -99, i;
    for (i = 0; i < cells.length; i++) {
      minX = Math.min(minX, cells[i].x); maxX = Math.max(maxX, cells[i].x);
      minY = Math.min(minY, cells[i].y); maxY = Math.max(maxY, cells[i].y);
    }
    var pc = 22;
    var pw = (maxX - minX + 1) * pc, ph = (maxY - minY + 1) * pc;
    var ox = b.x + 86 + ((b.w - 102) - pw) / 2;
    var oy = b.y + (b.h - ph) / 2;
    for (i = 0; i < cells.length; i++) {
      var cx = ox + (cells[i].x - minX) * pc;
      var cy = oy + (maxY - cells[i].y) * pc;   // y 向上 → 畫布向下
      slimeBody(ctx, cx, cy, pc, pc, slimeColor(cells[i].color), 1);
    }
    ctx.restore();
  }

  // ============================================================
  // 目標色指示(左右共用, 以 state.side 區分)
  // state: { side:'left'|'right', color, masked:false, justChanged:false }
  // ============================================================
  function drawTargetColor(ctx, state) {
    ctx.save();
    var side = sideOf(state);
    var b = sidePanel(side);
    var label = side === 'left' ? '左側目標色' : '右側目標色';
    text(ctx, label, b.x + 16, b.y + 24, 'bold 13px sans-serif', P.text, 'left', 'middle');

    var sx = b.x + 16, sy = b.y + 38, sw = 96, sh = 40;
    if (state && state.masked) {
      ctx.fillStyle = 'rgba(10,15,24,0.92)';
      rr(ctx, sx, sy, sw, sh, 8); ctx.fill();
      text(ctx, '?', sx + sw / 2, sy + sh / 2, 'bold 20px sans-serif', P.textDim, 'center', 'middle');
      ctx.restore(); return;
    }
    var col = slimeColor(state.color);
    slimeBody(ctx, sx, sy, sw, sh, col, 1);
    if (state.justChanged) {
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      rr(ctx, sx - 3, sy - 3, sw + 6, sh + 6, 10); ctx.stroke();
      text(ctx, 'NEW', sx + sw + 10, sy + sh / 2, 'bold 11px sans-serif', P.accent, 'left', 'middle');
    }
    // 這一側的方向箭頭, 提示「這色要消在這半邊」
    var ax = side === 'left' ? sx + sw + 14 : sx + sw + 14;
    if (!state.justChanged) {
      ctx.fillStyle = rgba(P.textDim, 0.8);
      ctx.beginPath();
      if (side === 'left') { ctx.moveTo(ax + 12, sy + 12); ctx.lineTo(ax, sy + 20); ctx.lineTo(ax + 12, sy + 28); }
      else { ctx.moveTo(ax, sy + 12); ctx.lineTo(ax + 12, sy + 20); ctx.lineTo(ax, sy + 28); }
      ctx.closePath(); ctx.fill();
      text(ctx, side === 'left' ? '消在左半才算' : '消在右半才算', ax + 18, sy + 20, '11px sans-serif', P.textDim, 'left', 'middle');
    }
    ctx.restore();
  }

  // ============================================================
  // 昂貴側指示(一次畫兩側: 指定側標昂貴, 另一側標便宜)
  // state: { side:'left'|'right' }  = 昂貴側在哪
  // ============================================================
  function drawExpensiveSide(ctx, state) {
    ctx.save();
    var exp = sideOf(state);
    [['left', PANEL_L], ['right', PANEL_R]].forEach(function (pair) {
      var isExp = pair[0] === exp;
      var b = pair[1];
      var bw = 76, bh = 20;
      var bx = b.x + b.w - bw - 16, by = b.y + 14;
      ctx.fillStyle = isExp ? rgba(P.expensive, 0.20) : rgba(P.cheap, 0.16);
      rr(ctx, bx, by, bw, bh, 10); ctx.fill();
      ctx.strokeStyle = isExp ? P.expensive : P.cheap;
      ctx.lineWidth = 1;
      rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 10); ctx.stroke();
      text(ctx, isExp ? '昂貴側 5/16' : '便宜側 2/11', bx + bw / 2, by + bh / 2 + 0.5,
        'bold 11px sans-serif', isExp ? P.expensive : P.cheap, 'center', 'middle');
    });
    ctx.restore();
  }

  // ============================================================
  // 解鎖進度(左右共用)
  // state: { side, A, E, remain, need, masked }
  // ============================================================
  function drawUnlockProgress(ctx, state) {
    ctx.save();
    var side = sideOf(state);
    var b = sidePanel(side);
    var x = b.x + 16, y = b.y + 94, w = b.w - 32;
    var A = state.A || 0, E = state.E || 0;
    var remain = state.remain, need = state.need || 1;

    // 階數 pip
    for (var i = 0; i < 2; i++) {
      var px = x + i * 22, py = y;
      var done = A > i;
      ctx.fillStyle = done ? P.accent : 'rgba(255,255,255,0.12)';
      rr(ctx, px, py, 16, 8, 4); ctx.fill();
    }
    text(ctx, '解鎖進度', x + 52, y + 4, '12px sans-serif', P.textDim, 'left', 'middle');

    if (state.masked) {
      ctx.fillStyle = 'rgba(10,15,24,0.92)';
      rr(ctx, x, y + 16, w, 46, 8); ctx.fill();
      text(ctx, '?', x + w / 2, y + 39, 'bold 20px sans-serif', P.textDim, 'center', 'middle');
      ctx.restore(); return;
    }

    var statusText, statusCol, ratio;
    if (A >= 2 && E >= A) { statusText = '滿級'; statusCol = P.accent; ratio = 1; }
    else if (E < A) { statusText = '已滿, 待延展'; statusCol = P.expand; ratio = 1; }
    else {
      statusText = null; statusCol = P.text;
      ratio = need > 0 ? clamp01((need - Math.max(0, remain)) / need) : 1;
    }

    // 進度條
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, x, y + 40, w, 10, 5); ctx.fill();
    ctx.fillStyle = statusCol;
    if (ratio > 0) { rr(ctx, x, y + 40, Math.max(6, w * ratio), 10, 5); ctx.fill(); }

    if (statusText) {
      text(ctx, statusText, x, y + 30, 'bold 17px sans-serif', statusCol, 'left', 'middle');
    } else {
      text(ctx, '第 ' + (A + 1) + ' 階  還要', x, y + 30, '12px sans-serif', P.textDim, 'left', 'middle');
      text(ctx, String(Math.max(0, remain)), x + 82, y + 30, 'bold 22px sans-serif', P.text, 'left', 'middle');
      text(ctx, '顆', x + 82 + ctx.measureText(String(Math.max(0, remain))).width + 4, y + 32,
        '12px sans-serif', P.textDim, 'left', 'middle');
    }
    text(ctx, 'A ' + A + ' / E ' + E, x + w, y + 30, '11px sans-serif', P.textDim, 'right', 'middle');
    ctx.restore();
  }

  // ============================================================
  // 延展待執行指示(E<A 期間持續顯示)
  // state: { side, pending:bool, t:任意遞增秒數 }
  // ============================================================
  function drawPendingExpand(ctx, state) {
    if (!state || !state.pending) return;
    ctx.save();
    var side = sideOf(state);
    var t = state.t || 0;
    var pulse = 0.55 + 0.45 * Math.abs(Math.sin(t * 3));
    var b = sidePanel(side);
    var bx = side === 'left' ? b.x + 16 : b.x + b.w - 16 - 150;
    var by = b.y + b.h - 34;
    ctx.fillStyle = rgba(P.expand, 0.16 * pulse + 0.06);
    rr(ctx, bx, by, 150, 22, 11); ctx.fill();
    ctx.strokeStyle = rgba(P.expand, pulse);
    ctx.lineWidth = 1;
    rr(ctx, bx + 0.5, by + 0.5, 149, 21, 11); ctx.stroke();
    text(ctx, '延展待執行 ▸', bx + 75, by + 12, 'bold 12px sans-serif', P.expand, 'center', 'middle');

    // 盤面外側的箭頭
    var ax = side === 'left' ? FULL_LEFT - 24 : FULL_RIGHT + 24;
    var ay = 360;
    ctx.fillStyle = rgba(P.expand, pulse);
    ctx.beginPath();
    if (side === 'left') { ctx.moveTo(ax + 10, ay - 10); ctx.lineTo(ax - 6, ay); ctx.lineTo(ax + 10, ay + 10); }
    else { ctx.moveTo(ax - 10, ay - 10); ctx.lineTo(ax + 6, ay); ctx.lineTo(ax - 10, ay + 10); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 消除結算標記(事後回饋: 哪些格算左/算右/位置不對)
  // state: { cells:[{col,row,kind:'left'|'right'|'offside'|'none'}],
  //          leftCount, rightCount, offCount, t:0~1 }
  // ============================================================
  function drawClearMark(ctx, state) {
    ctx.save();
    var t = state && state.t !== undefined ? clamp01(state.t) : 0;
    var fade = 1 - t * 0.5;
    ctx.save();
    clipBoard(ctx);
    var cells = (state && state.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], r = cellRect(c.col, c.row);
      if (c.kind === 'left' || c.kind === 'right') {
        ctx.strokeStyle = rgba(P.clearGood, fade);
        ctx.lineWidth = 2;
        rr(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 6); ctx.stroke();
        // 指向所屬半邊的小箭頭
        ctx.fillStyle = rgba(P.clearGood, fade);
        var mx = r.x + r.w / 2, my = r.y + r.h / 2;
        ctx.beginPath();
        if (c.kind === 'left') { ctx.moveTo(mx + 5, my - 6); ctx.lineTo(mx - 6, my); ctx.lineTo(mx + 5, my + 6); }
        else { ctx.moveTo(mx - 5, my - 6); ctx.lineTo(mx + 6, my); ctx.lineTo(mx - 5, my + 6); }
        ctx.closePath(); ctx.fill();
      } else if (c.kind === 'offside') {
        ctx.strokeStyle = rgba(P.clearOff, fade);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.x + 7, r.y + 7); ctx.lineTo(r.x + r.w - 7, r.y + r.h - 7);
        ctx.moveTo(r.x + r.w - 7, r.y + 7); ctx.lineTo(r.x + 7, r.y + r.h - 7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * fade).toFixed(3) + ')';
        ctx.lineWidth = 1.5;
        rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6); ctx.stroke();
      }
    }
    ctx.restore();

    // 盤底計數 chip
    var cy = 622, ch = 20;
    function chip(x, align, label, col) {
      ctx.font = 'bold 12px sans-serif';
      var w = ctx.measureText(label).width + 18;
      var bx = align === 'right' ? x - w : x;
      ctx.fillStyle = rgba(col, 0.18 * fade + 0.04);
      rr(ctx, bx, cy - ch / 2, w, ch, 10); ctx.fill();
      ctx.strokeStyle = rgba(col, fade); ctx.lineWidth = 1;
      rr(ctx, bx + 0.5, cy - ch / 2 + 0.5, w - 1, ch - 1, 10); ctx.stroke();
      text(ctx, label, bx + w / 2, cy + 0.5, 'bold 12px sans-serif', rgba(col, fade), 'center', 'middle');
      return w;
    }
    if (state && state.leftCount) chip(MID_X - 10, 'right', '左 −' + state.leftCount + ' 顆', P.clearGood);
    if (state && state.rightCount) chip(MID_X + 10, 'left', '右 −' + state.rightCount + ' 顆', P.clearGood);
    if (state && state.offCount) chip(MID_X + 120, 'left', '位置不符 ×' + state.offCount, P.clearOff);
    ctx.restore();
  }

  // ============================================================
  // 延展事件指示(獨立事件, 1.2 秒)
  // state: { side, col, order, t:0~1 }
  // ============================================================
  function drawExpandEvent(ctx, state) {
    ctx.save();
    var side = sideOf(state);
    var t = state && state.t !== undefined ? clamp01(state.t) : 0;
    var pop = t < 0.25 ? t / 0.25 : 1;
    var fade = t > 0.85 ? (1 - t) / 0.15 : 1;
    var a = Math.min(pop, fade);

    // 新欄光柱
    if (state && state.col !== undefined) {
      var x = colToX(state.col);
      var g = ctx.createLinearGradient(0, BOARD_TOP, 0, BOARD_BOTTOM);
      g.addColorStop(0, rgba(P.expand, 0.05 * a));
      g.addColorStop(1, rgba(P.expand, 0.30 * a));
      ctx.fillStyle = g;
      ctx.fillRect(x, BOARD_TOP, CELL, BOARD_BOTTOM - BOARD_TOP);
      ctx.strokeStyle = rgba(P.expand, a);
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, BOARD_TOP + 1, CELL - 2, BOARD_BOTTOM - BOARD_TOP - 2);
    }
    // 橫幅(貼在該側盤外, 不蓋盤面中央)
    var bw = 178, bh = 40;
    var bx = side === 'left' ? FULL_LEFT - 20 - bw : FULL_RIGHT + 20;
    var by = 200 - (1 - pop) * 10;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,14,24,0.92)';
    rr(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = P.expand; ctx.lineWidth = 2;
    rr(ctx, bx + 1, by + 1, bw - 2, bh - 2, 8); ctx.stroke();
    text(ctx, (side === 'left' ? '左側' : '右側') + '延展  +1 欄', bx + bw / 2, by + 15,
      'bold 15px sans-serif', P.expand, 'center', 'middle');
    text(ctx, '第 ' + (state && state.order ? state.order : 1) + ' 次延展', bx + bw / 2, by + 31,
      '11px sans-serif', P.textDim, 'center', 'middle');
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ============================================================
  // 延展獎勵削除指示(整側同步下沉一層)
  // state: { side, k, total, cols:[{col, rows:[...]}], t:0~1 }
  // ============================================================
  function drawTrimEffect(ctx, state) {
    ctx.save();
    var t = state && state.t !== undefined ? clamp01(state.t) : 0;
    var a = t > 0.8 ? (1 - t) / 0.2 : 1;
    var cols = (state && state.cols) || [];
    var side = sideOf(state);

    ctx.save();
    clipBoard(ctx);
    var minX = 9999, maxX = -9999, highestY = 9999, lowestNewY = -9999;
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      if (!c.rows || !c.rows.length) continue;
      var top = Math.max.apply(null, c.rows);
      var bot = Math.min.apply(null, c.rows);
      var x = colToX(c.col);
      var yTop = rowToY(top);
      var yNew = rowToY(bot) + CELL;   // 削掉之後該欄新的頂面
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + CELL);
      highestY = Math.min(highestY, yTop);
      lowestNewY = Math.max(lowestNewY, yNew);

      // 被削走的包絡(整段往下沉的感覺)
      ctx.fillStyle = rgba(P.trim, 0.16 * a);
      ctx.fillRect(x + 2, yTop, CELL - 4, yNew - yTop);
      // 舊頂面: 虛線
      ctx.strokeStyle = rgba(P.trim, 0.55 * a);
      ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x + 1, yTop + 1); ctx.lineTo(x + CELL - 1, yTop + 1); ctx.stroke();
      ctx.setLineDash([]);
      // 新頂面: 實線
      ctx.strokeStyle = rgba(P.trim, a);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 1, yNew - 1); ctx.lineTo(x + CELL - 1, yNew - 1); ctx.stroke();
      // 下沉箭頭(隨 t 往下走)
      var ay = yTop + (yNew - yTop - 14) * Math.min(1, t * 1.4) + 7;
      ctx.fillStyle = rgba(P.trim, a);
      ctx.beginPath();
      ctx.moveTo(x + CELL / 2 - 6, ay - 6); ctx.lineTo(x + CELL / 2 + 6, ay - 6); ctx.lineTo(x + CELL / 2, ay + 7);
      ctx.closePath(); ctx.fill();
      // 該欄削了幾格
      text(ctx, '−' + c.rows.length, x + CELL / 2, yTop - 9, 'bold 12px sans-serif', rgba(P.trim, a), 'center', 'middle');
    }
    // 整側橫貫線: 讓「半盤矮了一截」一眼成立
    if (minX < 9999) {
      ctx.strokeStyle = rgba(P.trim, 0.30 * a);
      ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(minX, highestY); ctx.lineTo(maxX, highestY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba(P.trim, 0.55 * a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(minX, lowestNewY); ctx.lineTo(maxX, lowestNewY); ctx.stroke();
    }
    ctx.restore();

    // 摘要 chip(貼該側盤外, 接在延展橫幅下面)
    var bw = 178, bh = 34;
    var bx = side === 'left' ? FULL_LEFT - 20 - bw : FULL_RIGHT + 20;
    var by = 246;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,14,24,0.92)';
    rr(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = rgba(P.trim, 0.8); ctx.lineWidth = 1;
    rr(ctx, bx + 0.5, by + 0.5, bw - 1, bh - 1, 8); ctx.stroke();
    text(ctx, '每欄削頂 −' + (state && state.k ? state.k : 1) + ' 格', bx + 10, by + 12,
      'bold 13px sans-serif', P.trim, 'left', 'middle');
    text(ctx, '共 ' + (state && state.total ? state.total : 0) + ' 格, 整側下沉',
      bx + 10, by + 26, '11px sans-serif', P.textDim, 'left', 'middle');
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ============================================================
  // 滿寬完成獎勵指示(第 4 次延展事件內)
  // state: { t:0~1 }
  // ============================================================
  function drawFullWidthBonus(ctx, state) {
    ctx.save();
    var t = state && state.t !== undefined ? clamp01(state.t) : 0;
    var pop = t < 0.2 ? t / 0.2 : 1;
    var a = t > 0.85 ? (1 - t) / 0.15 : 1;
    var bw = 300, bh = 62;
    var bx = MID_X - bw / 2, by = 136 - (1 - pop) * 12;
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(8,14,24,0.90)';
    rr(ctx, bx, by, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    rr(ctx, bx + 1, by + 1, bw - 2, bh - 2, 10); ctx.stroke();
    text(ctx, '滿寬 10 欄達成', MID_X, by + 20, 'bold 15px sans-serif', P.text, 'center', 'middle');
    text(ctx, '+1,500', MID_X, by + 44, 'bold 26px sans-serif', P.accent, 'center', 'middle');
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ============================================================
  // 目標色改選介面(3.0 秒上限, 盤面不遮蔽)
  // state: { side, candidates:[c1,c2], current, selectedIndex:-1|0|1,
  //          phase:'open'|'picked'|'timeout', remain:秒 }
  // ============================================================
  function drawColorPick(ctx, state) {
    ctx.save();
    var side = sideOf(state);
    var b = sidePick(side);
    var phase = (state && state.phase) || 'open';
    var cands = (state && state.candidates) || ['A', 'B'];
    var sel = state && state.selectedIndex !== undefined ? state.selectedIndex : -1;
    var remain = state && state.remain !== undefined ? state.remain : 3;

    ctx.fillStyle = 'rgba(10,16,26,0.96)';
    rr(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    rr(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 10); ctx.stroke();

    text(ctx, (side === 'left' ? '左側' : '右側') + '目標色改選', b.x + 16, b.y + 22,
      'bold 15px sans-serif', P.accent, 'left', 'middle');
    text(ctx, '選一個, 逾時隨機', b.x + 16, b.y + 42, '11px sans-serif', P.textDim, 'left', 'middle');

    // 倒數條
    var tw = b.w - 32, ratio = clamp01(remain / 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    rr(ctx, b.x + 16, b.y + 52, tw, 6, 3); ctx.fill();
    ctx.fillStyle = ratio < 0.34 ? P.expensive : P.accent;
    if (ratio > 0) { rr(ctx, b.x + 16, b.y + 52, Math.max(3, tw * ratio), 6, 3); ctx.fill(); }
    text(ctx, remain.toFixed(1) + 's', b.x + b.w - 16, b.y + 42, 'bold 12px sans-serif', P.textDim, 'right', 'middle');

    // 兩個候選
    var boxes = pickHitboxes(side);
    for (var i = 0; i < 2; i++) {
      var hb = boxes[i];
      var col = slimeColor(cands[i]);
      var isSel = sel === i;
      var isOrig = state && state.current !== undefined && cands[i] === state.current;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      rr(ctx, hb.x, hb.y, hb.w, hb.h, 8); ctx.fill();
      slimeBody(ctx, hb.x + 12, hb.y + 12, hb.w - 24, hb.h - 44, col, 1);
      text(ctx, i === 0 ? '← / A' : '→ / D', hb.x + hb.w / 2, hb.y + hb.h - 18,
        'bold 12px sans-serif', P.textDim, 'center', 'middle');
      if (isOrig) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        rr(ctx, hb.x + 12, hb.y + 12, 28, 16, 8); ctx.fill();
        text(ctx, '原色', hb.x + 26, hb.y + 20, '10px sans-serif', P.textDim, 'center', 'middle');
      }
      if (isSel) {
        ctx.strokeStyle = phase === 'timeout' ? P.expensive : P.accent;
        ctx.lineWidth = 3;
        rr(ctx, hb.x + 1.5, hb.y + 1.5, hb.w - 3, hb.h - 3, 8); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.lineWidth = 1;
        rr(ctx, hb.x + 0.5, hb.y + 0.5, hb.w - 1, hb.h - 1, 8); ctx.stroke();
      }
    }
    if (phase === 'timeout') {
      text(ctx, '逾時, 隨機選定', b.x + b.w / 2, b.y + b.h - 6, 'bold 12px sans-serif', P.expensive, 'center', 'bottom');
    } else if (phase === 'picked') {
      text(ctx, '已選定', b.x + b.w / 2, b.y + b.h - 6, 'bold 12px sans-serif', P.accent, 'center', 'bottom');
    }
    ctx.restore();
  }

  function pickHitboxes(side) {
    var b = side === 'right' ? PICK_R : PICK_L;
    var w = 132, h = 96, gap = 18;
    var x0 = b.x + (b.w - w * 2 - gap) / 2;
    var y = b.y + 68;
    return [{ x: x0, y: y, w: w, h: h }, { x: x0 + w + gap, y: y, w: w, h: h }];
  }

  // ============================================================
  // 暫停遮罩(盤面與所有情報區一律不可讀)
  // state: { }
  // ============================================================
  function drawPauseOverlay(ctx, state) {
    ctx.save();
    ctx.fillStyle = P.mask;
    ctx.fillRect(0, 0, W, H);
    text(ctx, '暫停', MID_X, 292, 'bold 46px sans-serif', P.text, 'center', 'middle');
    text(ctx, 'Esc 恢復 ・ 長按 R 放棄本局', MID_X, 334, '15px sans-serif', P.textDim, 'center', 'middle');
    ctx.restore();
  }

  // ============================================================
  // 放棄計時指示(長按 R)
  // state: { progress:0~1 }
  // ============================================================
  function drawAbandonGauge(ctx, state) {
    ctx.save();
    var p = clamp01(state && state.progress || 0);
    var bw = 260, bh = 44;
    var bx = MID_X - bw / 2, by = H - 96;
    ctx.fillStyle = 'rgba(8,12,20,0.92)';
    rr(ctx, bx, by, bw, bh, 8); ctx.fill();
    ctx.strokeStyle = P.expensive; ctx.lineWidth = 2;
    rr(ctx, bx + 1, by + 1, bw - 2, bh - 2, 8); ctx.stroke();
    text(ctx, '放棄本局…', bx + 14, by + 16, 'bold 13px sans-serif', P.expensive, 'left', 'middle');
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    rr(ctx, bx + 14, by + 26, bw - 28, 8, 4); ctx.fill();
    ctx.fillStyle = P.expensive;
    if (p > 0) { rr(ctx, bx + 14, by + 26, Math.max(4, (bw - 28) * p), 8, 4); ctx.fill(); }
    ctx.restore();
  }

  // ============================================================
  // HUD: 分數 / 最佳紀錄 / 經過時間 / 倍率 / 寬度 / 遊戲狀態
  // state: { score, best, time, multiplier, width, status }
  //   status: 'playing'|'settle'|'picking'|'paused'|'over'
  // ============================================================
  function drawHud(ctx, state) {
    ctx.save();
    var s = state || {};
    var b = BOX_SCORE;
    text(ctx, '分數', b.x + 16, b.y + 26, '12px sans-serif', P.textDim, 'left', 'middle');
    text(ctx, String(s.score !== undefined ? s.score : 0), b.x + 16, b.y + 62,
      'bold 32px sans-serif', P.accent, 'left', 'middle');
    text(ctx, '最佳', b.x + b.w - 16, b.y + 26, '12px sans-serif', P.textDim, 'right', 'middle');
    var best = (s.best === undefined || s.best === null) ? '尚無紀錄' : String(s.best);
    text(ctx, best, b.x + b.w - 16, b.y + 58, 'bold 18px sans-serif', P.text, 'right', 'middle');

    var c = BOX_CENTER;
    var tm = s.time !== undefined ? s.time : 0;
    text(ctx, tm.toFixed(1) + 's', MID_X, c.y + 26, 'bold 24px sans-serif', P.text, 'center', 'middle');
    var mult = s.multiplier !== undefined ? s.multiplier : 1;
    text(ctx, '倍率 ×' + mult.toFixed(2) + '  ・  寬 ' + (s.width !== undefined ? s.width : 6) + ' 欄',
      MID_X, c.y + 50, '12px sans-serif', P.textDim, 'center', 'middle');

    var st = s.status || 'playing';
    var stMap = {
      playing: ['進行中', P.textDim],
      settle: ['結算中', P.expand],
      picking: ['目標色改選中 ・ 時間凍結', P.accent],
      paused: ['暫停', P.textDim],
      over: ['結束', P.expensive]
    };
    var sm = stMap[st] || stMap.playing;
    text(ctx, sm[0], MID_X, c.y + 72, 'bold 12px sans-serif', sm[1], 'center', 'middle');
    ctx.restore();
  }

  // ============================================================
  // 結束資訊
  // state: { score, seconds, unlocked, reason:'blockout'|'lockout'|'abandon', isBest }
  // ============================================================
  function drawGameOver(ctx, state) {
    ctx.save();
    var s = state || {};
    ctx.fillStyle = 'rgba(5,8,14,0.86)';
    ctx.fillRect(0, 0, W, H);
    var bw = 420, bh = 330;
    var bx = MID_X - bw / 2, by = 150;
    ctx.fillStyle = '#131c2c';
    rr(ctx, bx, by, bw, bh, 14); ctx.fill();
    ctx.strokeStyle = P.panelEdge; ctx.lineWidth = 2;
    rr(ctx, bx + 1, by + 1, bw - 2, bh - 2, 14); ctx.stroke();

    var reasonMap = { blockout: 'Block out', lockout: 'Lock out', abandon: '玩家放棄' };
    text(ctx, '本局結束', MID_X, by + 34, 'bold 24px sans-serif', P.text, 'center', 'middle');
    text(ctx, reasonMap[s.reason] || '—', MID_X, by + 58, '13px sans-serif', P.expensive, 'center', 'middle');

    text(ctx, String(s.score !== undefined ? s.score : 0), MID_X, by + 104,
      'bold 42px sans-serif', P.accent, 'center', 'middle');
    if (s.isBest) text(ctx, '新紀錄!', MID_X, by + 134, 'bold 14px sans-serif', P.accent, 'center', 'middle');

    var rowY = by + 166;
    var items = [
      ['存活秒數', (s.seconds !== undefined ? s.seconds.toFixed(1) : '0.0') + ' s'],
      ['已解鎖欄數', String(s.unlocked !== undefined ? s.unlocked : 0) + ' 欄']
    ];
    for (var i = 0; i < items.length; i++) {
      text(ctx, items[i][0], bx + 40, rowY + i * 28, '13px sans-serif', P.textDim, 'left', 'middle');
      text(ctx, items[i][1], bx + bw - 40, rowY + i * 28, 'bold 15px sans-serif', P.text, 'right', 'middle');
    }

    var r = RESTART_BTN;
    ctx.fillStyle = rgba(P.accent, 0.16);
    rr(ctx, r.x, r.y, r.w, r.h, 10); ctx.fill();
    ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
    rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 10); ctx.stroke();
    text(ctx, '按 R 重開一局', r.x + r.w / 2, r.y + r.h / 2, 'bold 16px sans-serif', P.accent, 'center', 'middle');
    ctx.restore();
  }

  // ---------- 匯出 ----------
  window.Art = {
    canvas: { width: W, height: H },
    metrics: {
      cell: CELL,
      rowsVisible: ROWS_VISIBLE,
      boardTop: BOARD_TOP,
      boardBottom: BOARD_BOTTOM,
      midX: MID_X,
      fullLeft: FULL_LEFT,
      fullRight: FULL_RIGHT
    },
    palette: {
      bg: P.bg,
      well: P.well,
      frame: P.frame,
      midline: P.midline,
      slimeA: P.slimeA,
      slimeB: P.slimeB,
      slimeC: P.slimeC,
      ghost: P.ghost,
      text: P.text,
      textDim: P.textDim,
      accent: P.accent,
      expensive: P.expensive,
      cheap: P.cheap,
      expand: P.expand,
      trim: P.trim,
      mask: P.mask
    },
    // 幾何工具(RD 可用於命中測試)
    colToX: colToX,
    rowToY: rowToY,
    cellRect: cellRect,
    slimeColor: slimeColor,
    pickHitboxes: pickHitboxes,
    restartHitbox: function () { return { x: RESTART_BTN.x, y: RESTART_BTN.y, w: RESTART_BTN.w, h: RESTART_BTN.h }; },

    drawBackground: drawBackground,
    drawBoard: drawBoard,
    drawMidline: drawMidline,
    drawCell: drawCell,
    drawClusterCount: drawClusterCount,
    drawGhost: drawGhost,
    drawPiece: drawPiece,
    drawNextPreview: drawNextPreview,
    drawTargetColor: drawTargetColor,
    drawExpensiveSide: drawExpensiveSide,
    drawUnlockProgress: drawUnlockProgress,
    drawPendingExpand: drawPendingExpand,
    drawClearMark: drawClearMark,
    drawExpandEvent: drawExpandEvent,
    drawTrimEffect: drawTrimEffect,
    drawFullWidthBonus: drawFullWidthBonus,
    drawColorPick: drawColorPick,
    drawPauseOverlay: drawPauseOverlay,
    drawAbandonGauge: drawAbandonGauge,
    drawHud: drawHud,
    drawGameOver: drawGameOver
  };
})();
