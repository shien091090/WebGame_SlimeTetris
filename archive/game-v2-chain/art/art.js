/* SlimeChain Demo - Art layer
 * 全部以 Canvas 2D 幾何繪製, 不引用任何外部資源。
 * 只負責「給我狀態, 我畫出來」; 不含任何遊戲邏輯。
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- 佈局常數
  var CELL = 28;
  var ROWS = 16;                 // 可見列數 (列 1 = 最底列)
  var MID_X = 480;               // 中線 = 絕對欄 2|3 接縫, 固定在畫面正中
  var BOARD_BOTTOM = 596;        // 列 1 的下緣
  var BOARD_TOP = BOARD_BOTTOM - ROWS * CELL;        // 148 = 列 16 的上緣
  var COL_MIN = -2, COL_MAX = 7; // 絕對欄的最大可能範圍 (滿寬 10 欄)
  var BOARD_X0 = MID_X + (COL_MIN - 3) * CELL;       // 340
  var BOARD_X1 = MID_X + (COL_MAX + 1 - 3) * CELL;   // 620

  var FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif';

  var PANEL = {
    left:  { x: 30,  y: 162, w: 286, h: 300 },
    right: { x: 644, y: 162, w: 286, h: 300 }
  };

  // ---------------------------------------------------------------- 色票
  var palette = {
    bg: '#0E1220',
    bgDeep: '#070A12',
    panel: '#19202F',
    panelEdge: '#2B3750',
    panelHeadLeft: '#2A3350',
    panelHeadRight: '#20304A',

    boardLeft: '#1B2333',        // 左半空格底色 (略亮)
    boardRight: '#141A28',       // 右半空格底色 (略暗)
    gridLine: '#28324A',
    boardEdge: '#48587A',
    locked: '#0C1019',           // 尚未解鎖的欄位
    lockedStripe: '#1A2132',
    danger: '#FF5A5A',           // 頂部危險區淡染

    midline: '#FFFFFF',
    midlineGlow: '#63D6FF',
    midlineShadow: '#000000',

    slimeA: '#FFD24A',           // 色 A 琥珀黃
    slimeB: '#3FC8F0',           // 色 B 湖水藍
    slimeC: '#FF6FA8',           // 色 C 莓果粉

    clearFlash: '#FFFFFF',
    ghost: '#FFFFFF',
    lockPulse: '#FFFFFF',

    text: '#E9EFFC',
    textDim: '#8C9AB8',
    textFaint: '#5B6884',

    expensive: '#FF8A5C',
    cheap: '#7BE8A6',
    progressBar: '#63D6FF',
    pending: '#FFD24A',
    maxed: '#7E8CA8',

    chain: '#C9B6FF',
    expansion: '#7BE8A6',
    bonus: '#FFD24A',
    offside: '#7E8CA8',
    mask: 'rgba(8,11,18,0.94)',
    overlay: 'rgba(8,11,18,0.78)'
  };

  var SLIME = {
    A: { base: palette.slimeA, light: '#FFE9A3', dark: '#B07C10', glyph: 'dot' },
    B: { base: palette.slimeB, light: '#B6EEFF', dark: '#14657F', glyph: 'bar' },
    C: { base: palette.slimeC, light: '#FFC3DA', dark: '#9E3560', glyph: 'cross' }
  };

  // ---------------------------------------------------------------- 小工具
  function colorKey(c) {
    if (c === 0 || c === '0' || c === 'A' || c === 'a') return 'A';
    if (c === 1 || c === '1' || c === 'B' || c === 'b') return 'B';
    if (c === 2 || c === '2' || c === 'C' || c === 'c') return 'C';
    return 'A';
  }
  function slime(c) { return SLIME[colorKey(c)]; }

  function colToX(col) { return MID_X + (col - 3) * CELL; }   // 該欄左緣
  function rowToY(row) { return BOARD_BOTTOM - row * CELL; }  // 該列上緣
  function xToCol(px) { return Math.floor((px - MID_X) / CELL) + 3; }

  function pulse(speed) {
    return 0.5 + 0.5 * Math.sin(Date.now() / 1000 * (speed || 4));
  }

  function rr(ctx, x, y, w, h, r) {
    var m = Math.min(w, h) / 2;
    if (r > m) r = m;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || '600') + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function clipBoard(ctx) {
    ctx.beginPath();
    ctx.rect(BOARD_X0, BOARD_TOP, BOARD_X1 - BOARD_X0, BOARD_BOTTOM - BOARD_TOP);
    ctx.clip();
  }

  // 色卡上的辨識符號 (色盲輔助: 每色一種幾何符號)
  function glyph(ctx, kind, cx, cy, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 0.5 : alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1.6, s * 0.22);
    ctx.lineCap = 'round';
    if (kind === 'dot') {
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.30, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 'bar') {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.38, cy - s * 0.18);
      ctx.lineTo(cx + s * 0.38, cy - s * 0.18);
      ctx.moveTo(cx - s * 0.38, cy + s * 0.18);
      ctx.lineTo(cx + s * 0.38, cy + s * 0.18);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.30, cy - s * 0.30);
      ctx.lineTo(cx + s * 0.30, cy + s * 0.30);
      ctx.moveTo(cx + s * 0.30, cy - s * 0.30);
      ctx.lineTo(cx - s * 0.30, cy + s * 0.30);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 一顆史萊姆 (通用: 盤面格、方塊格、預覽格、色票)
  function slimeBody(ctx, x, y, size, c, opts) {
    opts = opts || {};
    var sk = slime(c);
    var pad = size * 0.06;
    var w = size - pad * 2;
    var r = size * 0.30;
    ctx.save();
    ctx.globalAlpha = opts.alpha === undefined ? 1 : opts.alpha;

    rr(ctx, x + pad, y + pad, w, w, r);
    ctx.fillStyle = sk.base;
    ctx.fill();

    // 底部暗邊 (體積感, 無外框)
    ctx.save();
    rr(ctx, x + pad, y + pad, w, w, r);
    ctx.clip();
    ctx.fillStyle = sk.dark;
    ctx.globalAlpha = (opts.alpha === undefined ? 1 : opts.alpha) * 0.38;
    ctx.fillRect(x, y + size * 0.66, size, size * 0.4);
    ctx.restore();

    // 高光
    ctx.save();
    ctx.globalAlpha = (opts.alpha === undefined ? 1 : opts.alpha) * 0.85;
    ctx.fillStyle = sk.light;
    ctx.beginPath();
    ctx.ellipse(x + size * 0.34, y + size * 0.30, size * 0.15, size * 0.10, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    glyph(ctx, sk.glyph, x + size / 2, y + size * 0.56, size * 0.46, sk.dark,
      (opts.alpha === undefined ? 1 : opts.alpha) * 0.45);

    ctx.restore();
  }

  // ---------------------------------------------------------------- 背景
  function drawBackground(ctx) {
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, 640);
    g.addColorStop(0, palette.bg);
    g.addColorStop(1, palette.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 960, 640);

    // 左右半的環境提示 (極低對比, 只給方位感)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.016;
    ctx.fillRect(0, 0, MID_X, 640);
    ctx.globalAlpha = 1;

    // 側欄底板
    [PANEL.left, PANEL.right].forEach(function (p) {
      rr(ctx, p.x, p.y, p.w, p.h, 14);
      ctx.fillStyle = palette.panel;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = palette.panelEdge;
      ctx.stroke();
    });

    // 上方情報帶分隔線
    ctx.strokeStyle = palette.panelEdge;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 132.5);
    ctx.lineTo(380, 132.5);
    ctx.moveTo(580, 132.5);
    ctx.lineTo(930, 132.5);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 盤面邊界
  // state: { minCol, maxCol }  絕對欄; 開局 0..5, 滿寬 -2..7
  function drawBoard(ctx, state) {
    state = state || {};
    var minCol = state.minCol === undefined ? 0 : state.minCol;
    var maxCol = state.maxCol === undefined ? 5 : state.maxCol;
    ctx.save();

    // 1) 未解鎖區 (滿寬範圍內、當前寬度外): 斜線影線, 告訴玩家「這裡可以開出來」
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD_X0, BOARD_TOP, BOARD_X1 - BOARD_X0, BOARD_BOTTOM - BOARD_TOP);
    ctx.clip();
    ctx.fillStyle = palette.locked;
    ctx.fillRect(BOARD_X0, BOARD_TOP, colToX(minCol) - BOARD_X0, BOARD_BOTTOM - BOARD_TOP);
    ctx.fillRect(colToX(maxCol + 1), BOARD_TOP, BOARD_X1 - colToX(maxCol + 1), BOARD_BOTTOM - BOARD_TOP);
    ctx.save();
    ctx.beginPath();
    ctx.rect(BOARD_X0, BOARD_TOP, colToX(minCol) - BOARD_X0, BOARD_BOTTOM - BOARD_TOP);
    ctx.rect(colToX(maxCol + 1), BOARD_TOP, BOARD_X1 - colToX(maxCol + 1), BOARD_BOTTOM - BOARD_TOP);
    ctx.clip();
    ctx.strokeStyle = palette.lockedStripe;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var sx = BOARD_X0 - 460; sx < BOARD_X1 + 460; sx += 12) {
      ctx.moveTo(sx, BOARD_BOTTOM);
      ctx.lineTo(sx + 460, BOARD_TOP);
    }
    ctx.stroke();
    ctx.restore();
    // 鎖頭提示
    ctx.globalAlpha = 0.85;
    if (minCol > COL_MIN) {
      text(ctx, '未解鎖', (BOARD_X0 + colToX(minCol)) / 2, BOARD_TOP + 26, 11,
        palette.textFaint, 'center', '600');
    }
    if (maxCol < COL_MAX) {
      text(ctx, '未解鎖', (BOARD_X1 + colToX(maxCol + 1)) / 2, BOARD_TOP + 26, 11,
        palette.textFaint, 'center', '600');
    }
    ctx.restore();

    // 2) 可放置區底色: 左半略亮 / 右半略暗
    var bx = colToX(minCol), bw = colToX(maxCol + 1) - bx;
    var bh = BOARD_BOTTOM - BOARD_TOP;
    var leftW = Math.max(0, Math.min(MID_X, bx + bw) - bx);
    ctx.fillStyle = palette.boardLeft;
    ctx.fillRect(bx, BOARD_TOP, leftW, bh);
    ctx.fillStyle = palette.boardRight;
    ctx.fillRect(bx + leftW, BOARD_TOP, bw - leftW, bh);

    // 3) 頂部危險區 (列 14~16): 越靠頂越紅
    var dg = ctx.createLinearGradient(0, BOARD_TOP, 0, BOARD_TOP + CELL * 3);
    dg.addColorStop(0, 'rgba(255,90,90,0.13)');
    dg.addColorStop(1, 'rgba(255,90,90,0)');
    ctx.fillStyle = dg;
    ctx.fillRect(bx, BOARD_TOP, bw, CELL * 3);

    // 4) 格線
    ctx.strokeStyle = palette.gridLine;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (var c = minCol; c <= maxCol + 1; c++) {
      var gx = colToX(c) + 0.5;
      ctx.moveTo(gx, BOARD_TOP);
      ctx.lineTo(gx, BOARD_BOTTOM);
    }
    for (var r = 0; r <= ROWS; r++) {
      var gy = BOARD_BOTTOM - r * CELL + 0.5;
      ctx.moveTo(bx, gy);
      ctx.lineTo(bx + bw, gy);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 5) 外框 + 底座
    ctx.strokeStyle = palette.boardEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, BOARD_TOP + 1, bw - 2, bh - 2);
    ctx.fillStyle = palette.boardEdge;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(bx, BOARD_BOTTOM, bw, 3);
    ctx.globalAlpha = 1;

    // 6) 寬度讀數 (盤面上緣外側左端, 不與底部的放棄計時條打架)
    text(ctx, '盤面 ' + (maxCol - minCol + 1) + ' 欄', bx + 2, BOARD_TOP - 18, 12,
      palette.textFaint, 'left', '600');

    ctx.restore();
  }

  // ---------------------------------------------------------------- 中線
  // state: 不需要欄位 (中線恆為絕對欄 2|3 接縫); 可傳 {} 或 null
  function drawMidline(ctx, state) {
    ctx.save();
    var top = BOARD_TOP - 12, bot = BOARD_BOTTOM + 8;

    // 外暈 (讓它在任何顏色的史萊姆上都跳出來)
    ctx.globalAlpha = 0.30 + 0.12 * pulse(1.6);
    ctx.strokeStyle = palette.midlineGlow;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(MID_X, top);
    ctx.lineTo(MID_X, bot);
    ctx.stroke();

    // 暗描邊
    ctx.globalAlpha = 0.65;
    ctx.strokeStyle = palette.midlineShadow;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(MID_X, top);
    ctx.lineTo(MID_X, bot);
    ctx.stroke();

    // 主線
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = palette.midline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MID_X, top);
    ctx.lineTo(MID_X, bot);
    ctx.stroke();

    // 每一列的刻度點: 讓玩家逐列讀得出接縫
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = palette.midlineGlow;
    for (var r = 1; r <= ROWS; r++) {
      ctx.fillRect(MID_X - 2.5, rowToY(r) + CELL / 2 - 1.5, 5, 3);
    }

    // 上下端帽
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.midline;
    ctx.beginPath();
    ctx.moveTo(MID_X - 6, top);
    ctx.lineTo(MID_X + 6, top);
    ctx.lineTo(MID_X, top + 9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(MID_X - 6, bot);
    ctx.lineTo(MID_X + 6, bot);
    ctx.lineTo(MID_X, bot - 9);
    ctx.closePath();
    ctx.fill();

    // 左右半標籤 (盤面上緣外側)
    text(ctx, '左半', MID_X - 12, BOARD_TOP - 18, 13, palette.text, 'right', '700');
    text(ctx, '右半', MID_X + 12, BOARD_TOP - 18, 13, palette.text, 'left', '700');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 盤面格位
  // state: { col, row, color, clearing, clearProgress }
  function drawCell(ctx, state) {
    if (!state) return;
    ctx.save();
    clipBoard(ctx);
    var x = colToX(state.col), y = rowToY(state.row);
    slimeBody(ctx, x, y, CELL, state.color);

    if (state.clearing) {
      var p = state.clearProgress === undefined ? pulse(12) : state.clearProgress;
      ctx.globalAlpha = 0.35 + 0.5 * p;
      rr(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, CELL * 0.28);
      ctx.fillStyle = palette.clearFlash;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.clearFlash;
      rr(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, CELL * 0.30);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 落下方塊
  // state: { cells:[{col,row,color}], phase:'falling'|'softdrop'|'lockdelay'|'locked' }
  function drawPiece(ctx, state) {
    if (!state || !state.cells) return;
    ctx.save();
    clipBoard(ctx);
    var phase = state.phase || 'falling';
    var lock = phase === 'lockdelay';
    var soft = phase === 'softdrop';

    state.cells.forEach(function (c) {
      var x = colToX(c.col), y = rowToY(c.row);
      if (soft) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = slime(c.color).base;
        ctx.fillRect(x + 4, y + CELL, CELL - 8, CELL * 0.8);
        ctx.restore();
      }
      slimeBody(ctx, x, y, CELL, c.color);
    });

    if (lock) {
      var a = 0.45 + 0.5 * pulse(7);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = palette.lockPulse;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      state.cells.forEach(function (c) {
        rr(ctx, colToX(c.col) + 1, rowToY(c.row) + 1, CELL - 2, CELL - 2, CELL * 0.28);
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 落點指示
  // state: { cells:[{col,row,color}] }
  function drawGhost(ctx, state) {
    if (!state || !state.cells) return;
    ctx.save();
    clipBoard(ctx);
    state.cells.forEach(function (c) {
      var x = colToX(c.col), y = rowToY(c.row);
      var sk = slime(c.color);
      ctx.globalAlpha = 0.22;
      rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, CELL * 0.26);
      ctx.fillStyle = sk.base;
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 2;
      ctx.strokeStyle = sk.base;
      ctx.setLineDash([4, 3]);
      rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, CELL * 0.26);
      ctx.stroke();
      ctx.setLineDash([]);
      glyph(ctx, sk.glyph, x + CELL / 2, y + CELL / 2, CELL * 0.46, sk.base, 0.9);
    });
    // 落地基準線
    var minCol = 99, maxCol = -99, minRow = 99;
    state.cells.forEach(function (c) {
      if (c.col < minCol) minCol = c.col;
      if (c.col > maxCol) maxCol = c.col;
      if (c.row < minRow) minRow = c.row;
    });
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = palette.ghost;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(colToX(minCol) + 2, rowToY(minRow) + CELL - 1);
    ctx.lineTo(colToX(maxCol + 1) - 2, rowToY(minRow) + CELL - 1);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 下一塊預覽
  // state: { cells:[{x,y,color}], hidden }  x/y 為形狀內的局部座標, y 大者在上
  function drawNextPreview(ctx, state) {
    state = state || {};
    var box = { x: 402, y: 16, w: 156, h: 96 };
    ctx.save();
    rr(ctx, box.x, box.y, box.w, box.h, 12);
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.panelEdge;
    ctx.stroke();
    text(ctx, '下一塊', box.x + box.w / 2, box.y + 20, 12, palette.textDim, 'center', '600');

    if (state.hidden || !state.cells || !state.cells.length) {
      text(ctx, state.hidden ? '— 遮蔽中 —' : '—', box.x + box.w / 2, box.y + 68, 14,
        palette.textFaint, 'center', '700');
      ctx.restore();
      return;
    }

    var s = 20;
    var xs = state.cells.map(function (c) { return c.x; });
    var ys = state.cells.map(function (c) { return c.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var ox = box.x + box.w / 2 - (x1 - x0 + 1) * s / 2;
    var oy = box.y + 30 + (box.h - 38) / 2 - (y1 - y0 + 1) * s / 2;
    state.cells.forEach(function (c) {
      slimeBody(ctx, ox + (c.x - x0) * s, oy + (y1 - c.y) * s, s, c.color);
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- 目標色指示
  // state: { side:'left'|'right', color, frozen }
  function drawTargetColor(ctx, state) {
    if (!state) return;
    var p = PANEL[state.side === 'right' ? 'right' : 'left'];
    var sk = slime(state.color);
    ctx.save();
    // 面板標頭
    ctx.save();
    rr(ctx, p.x, p.y, p.w, p.h, 14);
    ctx.clip();
    ctx.fillStyle = state.side === 'right' ? palette.panelHeadRight : palette.panelHeadLeft;
    ctx.fillRect(p.x, p.y, p.w, 34);
    ctx.restore();
    text(ctx, state.side === 'right' ? '右半 (絕對欄 ≥3)' : '左半 (絕對欄 ≤2)',
      p.x + 14, p.y + 23, 13, palette.text, 'left', '700');

    // 色票
    var sw = 52, sx = p.x + 16, sy = p.y + 52;
    slimeBody(ctx, sx, sy, sw, state.color);
    text(ctx, '目標色', sx + sw + 14, sy + 22, 13, palette.textDim, 'left', '600');
    text(ctx, '色 ' + colorKey(state.color), sx + sw + 14, sy + 44, 20, sk.base, 'left', '800');

    if (state.frozen) {
      text(ctx, '已凍結 · 不再重抽', sx + sw + 14, sy + 62, 11, palette.maxed, 'left', '600');
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- 昂貴側指示
  // state: { side:'left'|'right', expensive:true|false }
  function drawExpensiveSide(ctx, state) {
    if (!state) return;
    var p = PANEL[state.side === 'right' ? 'right' : 'left'];
    var exp = !!state.expensive;
    var col = exp ? palette.expensive : palette.cheap;
    var bx = p.x + 16, by = p.y + 118, bw = p.w - 32, bh = 26;
    ctx.save();
    rr(ctx, bx, by, bw, bh, 8);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = col;
    ctx.stroke();
    text(ctx, exp ? '昂貴側' : '便宜側', bx + 10, by + 18, 13, col, 'left', '800');
    text(ctx, exp ? '7 / 19 顆 (共 26)' : '2 / 14 顆 (共 16)', bx + bw - 10, by + 18, 12,
      palette.textDim, 'right', '600');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 解鎖進度
  // state: { side, stage:1|2, remaining, need, status:'counting'|'pending'|'maxed', unlockedCols }
  function drawUnlockProgress(ctx, state) {
    if (!state) return;
    var p = PANEL[state.side === 'right' ? 'right' : 'left'];
    var status = state.status || 'counting';
    var need = state.need || 0;
    var remain = state.remaining === undefined ? need : state.remaining;
    var done = Math.max(0, Math.min(need, need - remain));
    var ratio = need > 0 ? done / need : 1;
    if (status !== 'counting') ratio = 1;

    var bx = p.x + 16, by = p.y + 156, bw = p.w - 32;
    ctx.save();
    text(ctx, '解鎖進度', bx, by, 12, palette.textDim, 'left', '600');

    // 階段 pip
    for (var i = 1; i <= 2; i++) {
      var px = bx + bw - 54 + (i - 1) * 26;
      var on = status === 'maxed' || (status === 'pending' ? i <= state.stage : i < state.stage);
      var cur = status === 'counting' && i === state.stage;
      rr(ctx, px, by - 12, 20, 14, 5);
      ctx.fillStyle = on ? palette.expansion : (cur ? palette.progressBar : palette.panelEdge);
      ctx.globalAlpha = on || cur ? 0.9 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      text(ctx, String(i), px + 10, by - 1, 10, '#0E1220', 'center', '800');
    }

    // 主讀數
    var label, col;
    if (status === 'maxed') { label = '滿級'; col = palette.maxed; }
    else if (status === 'pending') { label = '已滿 · 待延展'; col = palette.pending; }
    else { label = '第 ' + state.stage + ' 階 · 剩 ' + Math.max(0, remain) + ' 顆'; col = palette.text; }
    text(ctx, label, bx, by + 32, status === 'counting' ? 19 : 20, col, 'left', '800');

    // 進度條
    var gy = by + 46, gh = 12;
    rr(ctx, bx, gy, bw, gh, 6);
    ctx.fillStyle = '#0E1220';
    ctx.fill();
    if (ratio > 0) {
      ctx.save();
      rr(ctx, bx, gy, bw, gh, 6);
      ctx.clip();
      ctx.fillStyle = status === 'maxed' ? palette.maxed
        : (status === 'pending' ? palette.pending : palette.progressBar);
      ctx.fillRect(bx, gy, bw * ratio, gh);
      ctx.restore();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = palette.panelEdge;
    rr(ctx, bx, gy, bw, gh, 6);
    ctx.stroke();

    if (status === 'counting') {
      text(ctx, done + ' / ' + need, bx + bw, gy + 30, 12, palette.textFaint, 'right', '600');
    }
    text(ctx, '已開 ' + (state.unlockedCols || 0) + ' / 2 欄', bx, gy + 30, 12,
      palette.textFaint, 'left', '600');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 延展待執行
  // state: { side, visible }
  function drawExpansionPending(ctx, state) {
    if (!state || !state.visible) return;
    var left = state.side !== 'right';
    var p = PANEL[left ? 'left' : 'right'];
    var bx = p.x + 16, by = p.y + 250, bw = p.w - 32, bh = 30;
    var a = 0.55 + 0.45 * pulse(3);
    ctx.save();
    ctx.globalAlpha = a;
    rr(ctx, bx, by, bw, bh, 8);
    ctx.fillStyle = palette.pending;
    ctx.globalAlpha = a * 0.20;
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = palette.pending;
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, (left ? '◀ ' : '') + '延展待執行' + (left ? '' : ' ▶'),
      bx + bw / 2, by + 20, 13, palette.pending, 'center', '800');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 連鎖段指示
  // state: { visible, segment, multiplier }
  function drawChainIndicator(ctx, state) {
    if (!state || !state.visible) return;
    var w = 186, h = 36, x = MID_X - w / 2, y = BOARD_TOP + 10;
    ctx.save();
    rr(ctx, x, y, w, h, 18);
    ctx.fillStyle = 'rgba(10,13,22,0.88)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.chain;
    ctx.stroke();
    text(ctx, '連鎖 第 ' + (state.segment || 1) + ' 段', x + 14, y + 24, 15, palette.chain, 'left', '800');
    text(ctx, '×' + (state.multiplier === undefined ? 1 : state.multiplier).toFixed(2),
      x + w - 14, y + 24, 15, palette.text, 'right', '800');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 消除結算標記
  // state: { marks:[{col,row,kind:'left'|'right'|'offside'|'plain'}], leftCount, rightCount, alpha }
  function drawClearMarks(ctx, state) {
    if (!state) return;
    ctx.save();
    ctx.globalAlpha = state.alpha === undefined ? 1 : state.alpha;

    ctx.save();
    clipBoard(ctx);
    (state.marks || []).forEach(function (m) {
      var x = colToX(m.col), y = rowToY(m.row), cx = x + CELL / 2, cy = y + CELL / 2;
      var col = m.kind === 'left' || m.kind === 'right' ? palette.expansion
        : (m.kind === 'offside' ? palette.offside : palette.textFaint);
      rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, CELL * 0.26);
      ctx.globalAlpha = (state.alpha === undefined ? 1 : state.alpha) * 0.22;
      ctx.fillStyle = col;
      ctx.fill();
      ctx.globalAlpha = state.alpha === undefined ? 1 : state.alpha;
      ctx.lineWidth = 2;
      ctx.strokeStyle = col;
      ctx.lineCap = 'round';
      if (m.kind === 'left' || m.kind === 'right') {
        var d = m.kind === 'left' ? -1 : 1;
        ctx.beginPath();  // 指向該側的箭頭 = 這顆算進那一半
        ctx.moveTo(cx - d * 3, cy - 6);
        ctx.lineTo(cx + d * 4, cy);
        ctx.lineTo(cx - d * 3, cy + 6);
        ctx.stroke();
      } else if (m.kind === 'offside') {
        ctx.beginPath();  // 斜槓 = 顏色對但位置不對
        ctx.moveTo(cx - 5, cy + 5);
        ctx.lineTo(cx + 5, cy - 5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
    });
    ctx.restore();

    // 兩側扣減小結
    [['left', state.leftCount], ['right', state.rightCount]].forEach(function (pair) {
      var n = pair[1];
      if (!n) return;
      var p = PANEL[pair[0]];
      var bx = p.x + p.w / 2 - 50, by = p.y + p.h + 14;
      rr(ctx, bx, by, 100, 28, 14);
      ctx.fillStyle = 'rgba(10,13,22,0.9)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.expansion;
      ctx.stroke();
      text(ctx, '−' + n + ' 顆', bx + 50, by + 19, 14, palette.expansion, 'center', '800');
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- 延展事件
  // state: { visible, side, newCol, progress }
  function drawExpansionEvent(ctx, state) {
    if (!state || !state.visible) return;
    var left = state.side !== 'right';
    var pr = state.progress === undefined ? 1 : state.progress;
    ctx.save();

    // 新欄高亮
    if (state.newCol !== undefined && state.newCol !== null) {
      var nx = colToX(state.newCol);
      ctx.save();
      clipBoard(ctx);
      ctx.globalAlpha = 0.25 + 0.35 * pulse(5);
      ctx.fillStyle = palette.expansion;
      ctx.fillRect(nx, BOARD_TOP, CELL, BOARD_BOTTOM - BOARD_TOP);
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = palette.expansion;
      ctx.strokeRect(nx + 1.5, BOARD_TOP + 1.5, CELL - 3, BOARD_BOTTOM - BOARD_TOP - 3);
      ctx.restore();
    }

    // 事件橫幅 (盤面中段, 不與消除結算共用位置)
    var w = 250, h = 46, x = MID_X - w / 2, y = BOARD_TOP + 96;
    ctx.globalAlpha = 0.35 + 0.65 * Math.min(1, pr * 3);
    rr(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(10,13,22,0.94)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = palette.expansion;
    ctx.stroke();
    text(ctx, (left ? '◀◀ ' : '') + (left ? '左側' : '右側') + '延展 +1 欄' + (left ? '' : ' ▶▶'),
      MID_X, y + 29, 18, palette.expansion, 'center', '800');

    // 外推箭頭
    var ax = left ? x - 24 : x + w + 24;
    ctx.beginPath();
    ctx.moveTo(ax + (left ? 10 : -10), y + 12);
    ctx.lineTo(ax + (left ? -8 : 8), y + 23);
    ctx.lineTo(ax + (left ? 10 : -10), y + 34);
    ctx.closePath();
    ctx.fillStyle = palette.expansion;
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- 目標色重抽提示
  // state: { visible, side, color }
  function drawRerollHint(ctx, state) {
    if (!state || !state.visible) return;
    var left = state.side !== 'right';
    var w = 230, h = 38, x = MID_X - w / 2, y = BOARD_TOP + 150;
    ctx.save();
    rr(ctx, x, y, w, h, 10);
    ctx.fillStyle = 'rgba(10,13,22,0.94)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.chain;
    ctx.stroke();
    text(ctx, (left ? '左側' : '右側') + '目標色重抽 →', x + 12, y + 25, 14, palette.chain, 'left', '800');
    slimeBody(ctx, x + w - 42, y + 6, 26, state.color);
    ctx.restore();
  }

  // ---------------------------------------------------------------- 滿寬完成獎勵
  // state: { visible, bonus }
  function drawFullWidthBonus(ctx, state) {
    if (!state || !state.visible) return;
    var w = 270, h = 52, x = MID_X - w / 2, y = BOARD_TOP + 200;
    ctx.save();
    ctx.globalAlpha = 0.85 + 0.15 * pulse(6);
    rr(ctx, x, y, w, h, 12);
    ctx.fillStyle = 'rgba(10,13,22,0.95)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = palette.bonus;
    ctx.stroke();
    text(ctx, '滿寬 10 欄達成', MID_X, y + 22, 13, palette.textDim, 'center', '700');
    text(ctx, '+' + (state.bonus === undefined ? 1500 : state.bonus).toLocaleString(),
      MID_X, y + 44, 22, palette.bonus, 'center', '800');
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD
  // state: { score, best, time, status }
  function drawHud(ctx, state) {
    state = state || {};
    ctx.save();
    text(ctx, '分數', 30, 46, 12, palette.textDim, 'left', '600');
    text(ctx, String(Math.floor(state.score || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','),
      30, 82, 32, palette.text, 'left', '800');

    var bestStr = (state.best === undefined || state.best === null || state.best < 0)
      ? '尚無紀錄'
      : String(Math.floor(state.best)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    text(ctx, '最佳紀錄', 30, 112, 12, palette.textDim, 'left', '600');
    text(ctx, bestStr, 92, 112, 14, palette.textFaint, 'left', '700');

    text(ctx, '經過時間', 930, 46, 12, palette.textDim, 'right', '600');
    var t = Math.max(0, state.time || 0);
    text(ctx, t.toFixed(1) + ' s', 930, 82, 28, palette.text, 'right', '800');

    var st = state.status || 'playing';
    var stText = st === 'settling' ? '結算中' : st === 'paused' ? '暫停' : st === 'over' ? '已結束' : '進行中';
    var stCol = st === 'settling' ? palette.chain : st === 'over' ? palette.expensive : palette.textFaint;
    text(ctx, stText, 930, 112, 14, stCol, 'right', '700');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 暫停遮罩
  // state: { visible }
  function drawPauseMask(ctx, state) {
    if (!state || !state.visible) return;
    ctx.save();
    ctx.fillStyle = palette.mask;
    ctx.fillRect(0, 0, 960, 640);
    text(ctx, '暫 停', MID_X, 300, 46, palette.text, 'center', '800');
    text(ctx, '盤面與所有情報已遮蔽', MID_X, 336, 15, palette.textDim, 'center', '600');
    text(ctx, 'Esc 恢復 · 長按 R 放棄本局', MID_X, 372, 14, palette.textFaint, 'center', '600');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 放棄計時
  // state: { visible, progress, remaining }
  function drawAbandonTimer(ctx, state) {
    if (!state || !state.visible) return;
    var p = Math.max(0, Math.min(1, state.progress === undefined ? 0 : state.progress));
    var w = 260, h = 14, x = MID_X - w / 2, y = 612;
    ctx.save();
    rr(ctx, x, y, w, h, 7);
    ctx.fillStyle = 'rgba(10,13,22,0.92)';
    ctx.fill();
    ctx.save();
    rr(ctx, x, y, w, h, 7);
    ctx.clip();
    ctx.fillStyle = palette.expensive;
    ctx.fillRect(x, y, w * p, h);
    ctx.restore();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = palette.expensive;
    rr(ctx, x, y, w, h, 7);
    ctx.stroke();
    var rem = state.remaining === undefined ? (1 - p) : state.remaining;
    text(ctx, '放棄本局 ' + rem.toFixed(1) + ' s', MID_X, y - 6, 13, palette.expensive, 'center', '800');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 結束資訊
  // state: { visible, score, seconds, unlockedCols, reason, best, isNewBest }
  function drawGameOver(ctx, state) {
    if (!state || !state.visible) return;
    var w = 420, h = 300, x = MID_X - w / 2, y = 170;
    ctx.save();
    ctx.fillStyle = palette.overlay;
    ctx.fillRect(0, 0, 960, 640);

    rr(ctx, x, y, w, h, 16);
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = palette.panelEdge;
    ctx.stroke();

    var reason = state.reason === 'lockout' ? 'Lock out (殘存格位全在頂列之上)'
      : state.reason === 'blockout' ? 'Block out (生成位置被占)'
      : state.reason === 'abandon' ? '玩家放棄' : '—';

    text(ctx, '本局結束', MID_X, y + 44, 26, palette.text, 'center', '800');
    text(ctx, reason, MID_X, y + 70, 13, palette.expensive, 'center', '600');

    var rows = [
      ['分數', String(Math.floor(state.score || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')],
      ['存活秒數', (state.seconds || 0).toFixed(1) + ' s'],
      ['已解鎖欄數', (state.unlockedCols || 0) + ' / 4'],
      ['最佳紀錄', (state.best === undefined || state.best === null || state.best < 0)
        ? '尚無紀錄'
        : String(Math.floor(state.best)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')]
    ];
    rows.forEach(function (r, i) {
      var ry = y + 108 + i * 32;
      text(ctx, r[0], x + 40, ry, 14, palette.textDim, 'left', '600');
      text(ctx, r[1], x + w - 40, ry, 17, palette.text, 'right', '800');
    });

    if (state.isNewBest) {
      text(ctx, '★ 新紀錄', MID_X, y + 258, 17, palette.bonus, 'center', '800');
    }
    text(ctx, 'R 或點此重開一局', MID_X, y + h - 18, 14, palette.textFaint, 'center', '700');
    ctx.restore();
  }

  // ---------------------------------------------------------------- 匯出
  window.Art = {
    canvas: { width: 960, height: 640 },
    cellSize: CELL,
    board: {
      top: BOARD_TOP, bottom: BOARD_BOTTOM, midX: MID_X,
      rows: ROWS, colMin: COL_MIN, colMax: COL_MAX,
      x0: BOARD_X0, x1: BOARD_X1
    },
    palette: palette,
    colToX: colToX,
    rowToY: rowToY,
    xToCol: xToCol,

    drawBackground: drawBackground,
    drawBoard: drawBoard,
    drawMidline: drawMidline,
    drawCell: drawCell,
    drawPiece: drawPiece,
    drawPlayer: drawPiece,   // 別名: 本作「玩家操作的物件」就是落下方塊
    drawGhost: drawGhost,
    drawNextPreview: drawNextPreview,
    drawTargetColor: drawTargetColor,
    drawExpensiveSide: drawExpensiveSide,
    drawUnlockProgress: drawUnlockProgress,
    drawExpansionPending: drawExpansionPending,
    drawChainIndicator: drawChainIndicator,
    drawClearMarks: drawClearMarks,
    drawExpansionEvent: drawExpansionEvent,
    drawRerollHint: drawRerollHint,
    drawFullWidthBonus: drawFullWidthBonus,
    drawHud: drawHud,
    drawPauseMask: drawPauseMask,
    drawAbandonTimer: drawAbandonTimer,
    drawGameOver: drawGameOver
  };
})();
