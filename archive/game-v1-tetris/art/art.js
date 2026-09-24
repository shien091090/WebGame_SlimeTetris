/* Slime Tetris - Demo art layer.
 * Pure Canvas 2D geometry. No external assets, no game logic.
 * Every draw function is (ctx, state) and self-contained (save/restore).
 */
(function () {
  'use strict';

  /* ---------- constants ---------- */
  var CANVAS_W = 960;
  var CANVAS_H = 640;
  var CELL = 32;
  var ROWS = 16;
  var MAX_COLS = 10;
  var BOARD_CX = 480;
  var BOARD_TOP = 104;
  var BOARD_BOTTOM = BOARD_TOP + ROWS * CELL;          /* 616 */
  var BOARD_MAX_LEFT = BOARD_CX - MAX_COLS * CELL / 2; /* 320 */
  var BOARD_MAX_W = MAX_COLS * CELL;                   /* 320 */

  var PLATE_L = { x: 32, y: 24, w: 264, h: 132 };   /* best / time / state */
  var PLATE_R = { x: 664, y: 24, w: 264, h: 132 };  /* next preview */
  var PLATE_SCORE = { x: 320, y: 24, w: 320, h: 72 };
  var PANEL_L = { x: 32, y: 180, w: 264, h: 236 };
  var PANEL_R = { x: 664, y: 180, w: 264, h: 236 };
  var RESULT = { x: 260, y: 150, w: 440, h: 340 };
  var RESTART_BTN = { x: 370, y: 412, w: 220, h: 52 };

  var FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';

  var PALETTE = {
    bg: '#10131f',
    bgVignette: '#0a0c15',
    plate: '#171c2e',
    plateEdge: '#262d47',
    boardBg: '#141829',
    boardGrid: '#232a44',
    boardFrame: '#59668f',
    boardLocked: '#1b2038',   /* not-yet-unlocked columns inside max extent */
    cellA: '#ff5d73',         /* slime color A - red */
    cellB: '#3fa9ff',         /* slime color B - blue */
    cellC: '#ffc63f',         /* slime color C - yellow */
    cellInert: '#6d7486',     /* inert cell - colourless */
    cellGloss: 'rgba(255,255,255,0.35)',
    cellGlyph: 'rgba(18,16,32,0.45)',
    ghost: 'rgba(232,236,248,0.55)',
    lockPulse: '#ffffff',
    softTrail: 'rgba(160,200,255,0.30)',
    segmentMark: '#ffffff',
    expensive: '#ffcc57',
    progressTrack: '#232a44',
    progressFill: '#7de3a4',
    progressMax: '#ffcc57',
    expandHint: '#7de3a4',
    rerollHint: '#c9a7ff',
    pauseMask: 'rgba(9,11,19,0.97)',
    resultMask: 'rgba(9,11,19,0.82)',
    danger: '#ff6b6b',
    text: '#e8ecf8',
    textMuted: '#8b93ad',
    textDark: '#141829'
  };

  var COLOR_OF = { A: PALETTE.cellA, B: PALETTE.cellB, C: PALETTE.cellC };
  var COLOR_NAME = { A: '紅', B: '藍', C: '黃' };

  /* ---------- low level helpers ---------- */
  function rr(ctx, x, y, w, h, r) {
    var m = Math.min(w, h) / 2;
    if (r > m) { r = m; }
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
    ctx.fillStyle = color || PALETTE.text;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function plate(ctx, box, fill, edge) {
    ctx.fillStyle = fill || PALETTE.plate;
    rr(ctx, box.x, box.y, box.w, box.h, 12);
    ctx.fill();
    ctx.strokeStyle = edge || PALETTE.plateEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount >= 0) {
      r = r + (255 - r) * amount;
      g = g + (255 - g) * amount;
      b = b + (255 - b) * amount;
    } else {
      r = r * (1 + amount);
      g = g * (1 + amount);
      b = b * (1 + amount);
    }
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }

  /* board geometry */
  function boardLeft(width) {
    var w = width || MAX_COLS;
    return BOARD_CX - w * CELL / 2;
  }
  function cellX(col, width) { return boardLeft(width) + (col - 1) * CELL; }
  function cellY(row) { return BOARD_TOP + (ROWS - row) * CELL; }

  /* ---------- cell painters ---------- */
  function glyph(ctx, key, cx, cy, s) {
    ctx.fillStyle = PALETTE.cellGlyph;
    if (key === 'A') {
      ctx.beginPath();
      ctx.arc(cx, cy + 2, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
    } else if (key === 'B') {
      rr(ctx, cx - s * 0.22, cy + 2 - s * 0.06, s * 0.44, s * 0.12, s * 0.06);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy + 2 - s * 0.18);
      ctx.lineTo(cx + s * 0.18, cy + 2);
      ctx.lineTo(cx, cy + 2 + s * 0.18);
      ctx.lineTo(cx - s * 0.18, cy + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* one coloured slime blob inside x,y,size */
  function blob(ctx, key, x, y, size, alpha) {
    var base = COLOR_OF[key] || PALETTE.cellInert;
    var pad = size * 0.06;
    var bx = x + pad, by = y + pad, bs = size - pad * 2;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;

    ctx.fillStyle = shade(base, -0.35);
    rr(ctx, bx, by + bs * 0.12, bs, bs * 0.88, bs * 0.3);
    ctx.fill();

    ctx.fillStyle = base;
    rr(ctx, bx, by, bs, bs * 0.88, bs * 0.3);
    ctx.fill();

    ctx.fillStyle = PALETTE.cellGloss;
    ctx.beginPath();
    ctx.ellipse(bx + bs * 0.32, by + bs * 0.26, bs * 0.18, bs * 0.11, -0.5, 0, Math.PI * 2);
    ctx.fill();

    glyph(ctx, key, bx + bs / 2, by + bs / 2, bs);
    ctx.globalAlpha = 1;
  }

  /* inert cell: hard edges, grey, hatched. Deliberately NOT a slime. */
  function inert(ctx, x, y, size, alpha) {
    var pad = size * 0.06;
    var bx = x + pad, by = y + pad, bs = size - pad * 2;
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;

    ctx.fillStyle = shade(PALETTE.cellInert, -0.45);
    ctx.fillRect(bx, by, bs, bs);
    ctx.fillStyle = PALETTE.cellInert;
    ctx.fillRect(bx, by, bs, bs - 3);

    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bs, bs);
    ctx.clip();
    ctx.strokeStyle = 'rgba(20,24,41,0.55)';
    ctx.lineWidth = 3;
    for (var i = -bs; i < bs * 2; i += 9) {
      ctx.beginPath();
      ctx.moveTo(bx + i, by);
      ctx.lineTo(bx + i + bs, by + bs);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = shade(PALETTE.cellInert, 0.18);
    ctx.lineWidth = 2;
    ctx.strokeRect(bx + 1, by + 1, bs - 2, bs - 2);
    ctx.globalAlpha = 1;
  }

  function paintCell(ctx, kind, key, x, y, size, alpha) {
    if (kind === 'inert') { inert(ctx, x, y, size, alpha); }
    else if (kind === 'filled') { blob(ctx, key, x, y, size, alpha); }
  }

  function clipBoard(ctx, width) {
    ctx.beginPath();
    ctx.rect(boardLeft(width), BOARD_TOP, (width || MAX_COLS) * CELL, ROWS * CELL);
    ctx.clip();
  }

  function panelOf(side) { return side === 'right' ? PANEL_R : PANEL_L; }

  /* =====================================================================
   * public API
   * =================================================================== */

  var Art = {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    palette: PALETTE,

    /* geometry the RD needs for input mapping (mouse column follow etc.) */
    layout: {
      cell: CELL,
      rows: ROWS,
      maxCols: MAX_COLS,
      boardTop: BOARD_TOP,
      boardBottom: BOARD_BOTTOM,
      boardLeft: boardLeft,
      cellX: cellX,
      cellY: cellY,
      restartButton: RESTART_BTN,
      columnAtX: function (px, width) {
        var w = width || MAX_COLS;
        var c = Math.floor((px - boardLeft(w)) / CELL) + 1;
        if (c < 1) { c = 1; }
        if (c > w) { c = w; }
        return c;
      }
    },

    colorName: function (key) { return COLOR_NAME[key] || '-'; },

    /* ---- background: static furniture only ---- */
    drawBackground: function (ctx) {
      ctx.save();
      var g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      g.addColorStop(0, PALETTE.bg);
      g.addColorStop(1, PALETTE.bgVignette);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      plate(ctx, PLATE_L);
      plate(ctx, PLATE_R);
      plate(ctx, PANEL_L);
      plate(ctx, PANEL_R);

      /* max extent (10 columns) ghosted, so the cage-to-court idea reads */
      ctx.strokeStyle = PALETTE.boardGrid;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      rr(ctx, BOARD_MAX_LEFT - 6, BOARD_TOP - 6, BOARD_MAX_W + 12, ROWS * CELL + 12, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, '滿寬 10 欄', BOARD_CX, BOARD_BOTTOM + 18, 12, PALETTE.textMuted, 'center', '500');
      ctx.restore();
    },

    /* ---- board boundary: current playable width ---- */
    drawBoardFrame: function (ctx, state) {
      var w = (state && state.width) || MAX_COLS;
      var x = boardLeft(w), y = BOARD_TOP, pw = w * CELL, ph = ROWS * CELL;
      ctx.save();

      /* locked (not yet unlocked) area inside max extent */
      ctx.fillStyle = PALETTE.boardLocked;
      ctx.fillRect(BOARD_MAX_LEFT, y, x - BOARD_MAX_LEFT, ph);
      ctx.fillRect(x + pw, y, BOARD_MAX_LEFT + BOARD_MAX_W - (x + pw), ph);

      ctx.fillStyle = PALETTE.boardBg;
      ctx.fillRect(x, y, pw, ph);

      ctx.strokeStyle = PALETTE.boardGrid;
      ctx.lineWidth = 1;
      var i;
      for (i = 1; i < w; i++) {
        ctx.beginPath();
        ctx.moveTo(x + i * CELL + 0.5, y);
        ctx.lineTo(x + i * CELL + 0.5, y + ph);
        ctx.stroke();
      }
      for (i = 1; i < ROWS; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + i * CELL + 0.5);
        ctx.lineTo(x + pw, y + i * CELL + 0.5);
        ctx.stroke();
      }

      ctx.strokeStyle = PALETTE.boardFrame;
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 1.5, y - 1.5, pw + 3, ph + 3);

      text(ctx, w + ' 欄', x + pw / 2, y - 12, 13, PALETTE.boardFrame, 'center', '700');
      ctx.restore();
    },

    /* ---- single board cell ---- */
    drawCell: function (ctx, state) {
      if (!state) { return; }
      var kind = state.kind || 'empty';
      if (kind === 'empty') { return; }
      var w = state.boardWidth || MAX_COLS;
      ctx.save();
      clipBoard(ctx, w);
      paintCell(ctx, kind, state.color, cellX(state.col, w), cellY(state.row), CELL, state.alpha);
      ctx.restore();
    },

    /* ---- falling piece ---- */
    drawFallingPiece: function (ctx, state) {
      if (!state || !state.cells) { return; }
      var w = state.boardWidth || MAX_COLS;
      var phase = state.phase || 'falling';
      var i, c, x, y;
      ctx.save();
      clipBoard(ctx, w);

      if (phase === 'softdrop') {
        ctx.fillStyle = PALETTE.softTrail;
        for (i = 0; i < state.cells.length; i++) {
          c = state.cells[i];
          x = cellX(c.col, w);
          y = cellY(c.row);
          ctx.fillRect(x + 10, y - 26, 4, 22);
          ctx.fillRect(x + 20, y - 18, 4, 14);
        }
      }

      for (i = 0; i < state.cells.length; i++) {
        c = state.cells[i];
        blob(ctx, c.color, cellX(c.col, w), cellY(c.row), CELL);
      }

      if (phase === 'locking') {
        var p = state.lockProgress === undefined ? 0 : state.lockProgress;
        var pulse = 0.35 + 0.45 * Math.abs(Math.sin(p * Math.PI * 3));
        ctx.globalAlpha = pulse;
        ctx.strokeStyle = PALETTE.lockPulse;
        ctx.lineWidth = 2;
        for (i = 0; i < state.cells.length; i++) {
          c = state.cells[i];
          rr(ctx, cellX(c.col, w) + 2, cellY(c.row) + 2, CELL - 4, CELL - 4, 8);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (phase === 'locked') {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = PALETTE.lockPulse;
        for (i = 0; i < state.cells.length; i++) {
          c = state.cells[i];
          rr(ctx, cellX(c.col, w) + 2, cellY(c.row) + 2, CELL - 4, CELL - 4, 8);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    },

    /* ---- ghost / landing indicator ---- */
    drawGhost: function (ctx, state) {
      if (!state || !state.cells) { return; }
      var w = state.boardWidth || MAX_COLS;
      var i, c, x, y, base;
      ctx.save();
      clipBoard(ctx, w);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      for (i = 0; i < state.cells.length; i++) {
        c = state.cells[i];
        x = cellX(c.col, w);
        y = cellY(c.row);
        base = COLOR_OF[c.color] || PALETTE.ghost;
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = base;
        rr(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
        ctx.fill();
        ctx.globalAlpha = 0.75;
        ctx.strokeStyle = base;
        rr(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    /* ---- next preview ---- */
    drawNextPreview: function (ctx, state) {
      var box = PLATE_R;
      ctx.save();
      text(ctx, '下一塊 NEXT', box.x + 18, box.y + 22, 13, PALETTE.textMuted, 'left', '600');

      if (!state || state.hidden || !state.cells) {
        ctx.fillStyle = PALETTE.boardLocked;
        rr(ctx, box.x + 18, box.y + 38, box.w - 36, box.h - 56, 10);
        ctx.fill();
        text(ctx, '遮蔽中', box.x + box.w / 2, box.y + 38 + (box.h - 56) / 2, 18, PALETTE.textMuted, 'center', '700');
        ctx.restore();
        return;
      }

      var P = 24, i, c;
      var minC = 99, maxC = -99, minR = 99, maxR = -99;
      for (i = 0; i < state.cells.length; i++) {
        c = state.cells[i];
        if (c.col < minC) { minC = c.col; }
        if (c.col > maxC) { maxC = c.col; }
        if (c.row < minR) { minR = c.row; }
        if (c.row > maxR) { maxR = c.row; }
      }
      var gw = (maxC - minC + 1) * P, gh = (maxR - minR + 1) * P;
      var ox = box.x + box.w / 2 - gw / 2 - minC * P;
      var oy = box.y + 38 + (box.h - 56) / 2 - gh / 2 - minR * P;
      for (i = 0; i < state.cells.length; i++) {
        c = state.cells[i];
        blob(ctx, c.color, ox + c.col * P, oy + c.row * P, P);
      }
      ctx.restore();
    },

    /* ---- target colour indicators ---- */
    drawLeftTargetColor: function (ctx, state) { targetColor(ctx, state, 'left'); },
    drawRightTargetColor: function (ctx, state) { targetColor(ctx, state, 'right'); },

    /* ---- expensive side mark ---- */
    drawExpensiveSideMark: function (ctx, state) {
      if (!state || !state.side) { return; }
      var p = panelOf(state.side);
      var bw = 92, bh = 26;
      var bx = p.x + p.w - bw - 16, by = p.y + 12;
      ctx.save();
      ctx.fillStyle = PALETTE.expensive;
      rr(ctx, bx, by, bw, bh, 13);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx + 16, by + bh / 2, 7, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE.textDark;
      ctx.fill();
      text(ctx, '昂貴側', bx + 30, by + bh / 2 + 1, 13, PALETTE.textDark, 'left', '800');
      ctx.restore();
    },

    /* ---- unlock progress ---- */
    drawLeftUnlockProgress: function (ctx, state) { unlockProgress(ctx, state, 'left'); },
    drawRightUnlockProgress: function (ctx, state) { unlockProgress(ctx, state, 'right'); },

    /* ---- segment settlement marks ---- */
    drawSegmentMarks: function (ctx, state) {
      if (!state || !state.marks || !state.marks.length) { return; }
      var w = state.boardWidth || MAX_COLS;
      var a = state.alpha === undefined ? 1 : state.alpha;
      ctx.save();
      for (var i = 0; i < state.marks.length; i++) {
        var m = state.marks[i];
        var x = cellX(m.col, w), y = cellY(m.row);
        var pw = m.length * CELL;
        var tint = COLOR_OF[m.color] || PALETTE.segmentMark;

        ctx.fillStyle = tint;
        ctx.globalAlpha = a * 0.25;
        rr(ctx, x + 2, y + 2, pw - 4, CELL - 4, 12);
        ctx.fill();

        ctx.globalAlpha = a;
        ctx.strokeStyle = PALETTE.segmentMark;
        ctx.lineWidth = 3;
        rr(ctx, x + 2, y + 2, pw - 4, CELL - 4, 12);
        ctx.stroke();

        /* +N tag, anchored toward the owning side */
        var tagW = 46, tagH = 22;
        var tx = m.side === 'right' ? x + pw + 6 : x - tagW - 6;
        var ty = y + CELL / 2 - tagH / 2;
        ctx.fillStyle = tint;
        rr(ctx, tx, ty, tagW, tagH, 11);
        ctx.fill();
        text(ctx, '+' + m.points, tx + tagW / 2, ty + tagH / 2 + 1, 14, PALETTE.textDark, 'center', '800');
      }
      ctx.restore();
    },

    /* ---- expansion hint ---- */
    drawExpandHint: function (ctx, state) {
      if (!state || !state.side) { return; }
      var w = state.boardWidth || MAX_COLS;
      var a = state.alpha === undefined ? 1 : state.alpha;
      var right = state.side === 'right';
      var edge = right ? boardLeft(w) + w * CELL : boardLeft(w);
      var dir = right ? 1 : -1;
      var cy = BOARD_TOP + ROWS * CELL / 2;
      ctx.save();
      ctx.fillStyle = PALETTE.expandHint;

      var i;
      for (i = 0; i < 3; i++) {
        var ax = edge + dir * (14 + i * 16);
        ctx.globalAlpha = a * (0.9 - i * 0.25);
        ctx.beginPath();
        ctx.moveTo(ax, cy - 14);
        ctx.lineTo(ax + dir * 12, cy);
        ctx.lineTo(ax, cy + 14);
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = a;
      var label = (right ? '右側' : '左側') + '延展 +1 欄';
      var lw = 132, lh = 28;
      var lx = right ? edge + 16 : edge - 16 - lw;
      var ly = cy - 60;
      ctx.fillStyle = PALETTE.expandHint;
      rr(ctx, lx, ly, lw, lh, 14);
      ctx.fill();
      text(ctx, label, lx + lw / 2, ly + lh / 2 + 1, 14, PALETTE.textDark, 'center', '800');
      ctx.restore();
    },

    /* ---- target colour reroll hint ---- */
    drawRerollHint: function (ctx, state) {
      if (!state || !state.side) { return; }
      var p = panelOf(state.side);
      var a = state.alpha === undefined ? 1 : state.alpha;
      var bw = 200, bh = 44;
      var bx = p.x + p.w / 2 - bw / 2, by = p.y + 46;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = PALETTE.rerollHint;
      rr(ctx, bx, by, bw, bh, 12);
      ctx.fill();
      text(ctx, '目標色重抽', bx + 14, by + bh / 2 + 1, 15, PALETTE.textDark, 'left', '800');
      text(ctx, '→', bx + bw - 58, by + bh / 2 + 1, 16, PALETTE.textDark, 'center', '800');
      blob(ctx, state.color, bx + bw - 44, by + 6, 32);
      ctx.restore();
    },

    /* ---- pause mask: must hide board AND all info ---- */
    drawPauseOverlay: function (ctx, state) {
      ctx.save();
      ctx.fillStyle = PALETTE.pauseMask;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      var bx = BOARD_CX - 150, by = 250, bw = 300;
      ctx.fillStyle = PALETTE.plate;
      rr(ctx, bx - 40, by - 70, bw + 80, 200, 16);
      ctx.fill();
      ctx.strokeStyle = PALETTE.plateEdge;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = PALETTE.text;
      ctx.fillRect(BOARD_CX - 18, by - 52, 12, 36);
      ctx.fillRect(BOARD_CX + 6, by - 52, 12, 36);

      text(ctx, '已暫停', BOARD_CX, by + 10, 30, PALETTE.text, 'center', '800');
      text(ctx, '盤面與情報全部遮蔽', BOARD_CX, by + 44, 14, PALETTE.textMuted, 'center', '500');
      text(ctx, 'Esc 恢復　長按 R 放棄本局', BOARD_CX, by + 70, 14, PALETTE.textMuted, 'center', '500');

      if (state && state.pauseCount !== undefined) {
        text(ctx, '暫停次數 ' + state.pauseCount, BOARD_CX, by + 96, 12, PALETTE.textMuted, 'center', '500');
      }
      ctx.restore();
    },

    /* ---- abandon hold timer ---- */
    drawAbandonTimer: function (ctx, state) {
      if (!state) { return; }
      var p = Math.max(0, Math.min(1, state.progress === undefined ? 0 : state.progress));
      var cx = BOARD_CX, cy = 540, r = 34;
      ctx.save();
      ctx.fillStyle = 'rgba(9,11,19,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = PALETTE.progressTrack;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = PALETTE.danger;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
      ctx.stroke();

      text(ctx, '放棄', cx, cy - 6, 15, PALETTE.danger, 'center', '800');
      var remain = state.remain === undefined ? (1 - p) : state.remain;
      text(ctx, remain.toFixed(1) + 's', cx, cy + 13, 13, PALETTE.textMuted, 'center', '600');
      ctx.restore();
    },

    /* ---- score / best / time / game state ---- */
    drawHud: function (ctx, state) {
      var s = state || {};
      ctx.save();

      text(ctx, '分數 SCORE', PLATE_SCORE.x + PLATE_SCORE.w / 2, PLATE_SCORE.y + 14, 12, PALETTE.textMuted, 'center', '600');
      text(ctx, String(s.score === undefined ? 0 : s.score),
        PLATE_SCORE.x + PLATE_SCORE.w / 2, PLATE_SCORE.y + 46, 34, PALETTE.text, 'center', '800');

      var b = PLATE_L;
      text(ctx, '最佳 BEST', b.x + 18, b.y + 24, 12, PALETTE.textMuted, 'left', '600');
      var bestStr = (s.best === undefined || s.best === null) ? '尚無紀錄' : String(s.best);
      text(ctx, bestStr, b.x + b.w - 18, b.y + 24, 18, PALETTE.expensive, 'right', '800');

      text(ctx, '時間 TIME', b.x + 18, b.y + 62, 12, PALETTE.textMuted, 'left', '600');
      var sec = s.seconds === undefined ? 0 : s.seconds;
      text(ctx, sec.toFixed(1) + ' s', b.x + b.w - 18, b.y + 62, 20, PALETTE.text, 'right', '800');

      text(ctx, '落速', b.x + 18, b.y + 96, 12, PALETTE.textMuted, 'left', '600');
      var sp = s.fallSpeed === undefined ? 1 : s.fallSpeed;
      text(ctx, sp.toFixed(2) + ' 格/秒', b.x + b.w - 18, b.y + 96, 14, PALETTE.text, 'right', '700');

      var st = s.status || 'playing';
      var map = {
        playing: ['進行中', PALETTE.progressFill],
        paused: ['暫停', PALETTE.expensive],
        over: ['結束', PALETTE.danger]
      };
      var m = map[st] || map.playing;
      var pw2 = 76, ph2 = 22;
      var px = b.x + b.w / 2 - pw2 / 2, py = b.y + b.h - 28;
      ctx.fillStyle = m[1];
      rr(ctx, px, py, pw2, ph2, 11);
      ctx.fill();
      text(ctx, m[0], px + pw2 / 2, py + ph2 / 2 + 1, 13, PALETTE.textDark, 'center', '800');
      ctx.restore();
    },

    /* ---- result panel ---- */
    drawResultPanel: function (ctx, state) {
      if (!state || state.visible === false) { return; }
      var s = state;
      ctx.save();
      ctx.fillStyle = PALETTE.resultMask;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      plate(ctx, RESULT, PALETTE.plate, PALETTE.plateEdge);

      var cx = RESULT.x + RESULT.w / 2;
      text(ctx, '本局結束', cx, RESULT.y + 36, 26, PALETTE.text, 'center', '800');

      var reasonMap = {
        blockout: 'Block out 生成受阻',
        lockout: 'Lock out 鎖定於緩衝列',
        abandon: '玩家放棄'
      };
      text(ctx, reasonMap[s.reason] || String(s.reason || '-'), cx, RESULT.y + 64, 14, PALETTE.textMuted, 'center', '600');

      var rows = [
        ['分數', String(s.score === undefined ? 0 : s.score)],
        ['存活秒數', (s.seconds === undefined ? 0 : s.seconds).toFixed(1) + ' s'],
        ['已解鎖欄數', (s.unlockedCols === undefined ? 0 : s.unlockedCols) + ' / 4'],
        ['最佳紀錄', (s.best === undefined || s.best === null) ? '尚無紀錄' : String(s.best)]
      ];
      var ry = RESULT.y + 104;
      for (var i = 0; i < rows.length; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        rr(ctx, RESULT.x + 36, ry - 15, RESULT.w - 72, 30, 8);
        ctx.fill();
        text(ctx, rows[i][0], RESULT.x + 50, ry, 14, PALETTE.textMuted, 'left', '600');
        text(ctx, rows[i][1], RESULT.x + RESULT.w - 50, ry, 17, PALETTE.text, 'right', '800');
        ry += 38;
      }

      if (s.isNewRecord) {
        text(ctx, '★ 新紀錄 ★', cx, ry + 2, 16, PALETTE.expensive, 'center', '800');
      } else if (s.reason === 'abandon') {
        text(ctx, '放棄局不更新最佳紀錄', cx, ry + 2, 13, PALETTE.textMuted, 'center', '600');
      }

      ctx.fillStyle = PALETTE.progressFill;
      rr(ctx, RESTART_BTN.x, RESTART_BTN.y, RESTART_BTN.w, RESTART_BTN.h, 14);
      ctx.fill();
      text(ctx, '按 R 或點此重開', RESTART_BTN.x + RESTART_BTN.w / 2, RESTART_BTN.y + RESTART_BTN.h / 2 + 1,
        16, PALETTE.textDark, 'center', '800');
      ctx.restore();
    }
  };

  /* ---------- shared side-panel painters ---------- */
  function targetColor(ctx, state, side) {
    var p = panelOf(side);
    var s = state || {};
    ctx.save();
    text(ctx, (side === 'right' ? '右側 RIGHT' : '左側 LEFT'), p.x + 18, p.y + 25, 13, PALETTE.textMuted, 'left', '700');

    var cx = p.x + 18, cy = p.y + 46, size = 56;
    if (s.hidden || !s.color) {
      ctx.fillStyle = PALETTE.boardLocked;
      rr(ctx, cx, cy, size, size, 14);
      ctx.fill();
      text(ctx, '?', cx + size / 2, cy + size / 2, 26, PALETTE.textMuted, 'center', '800');
      text(ctx, '目標色遮蔽中', cx + size + 14, cy + size / 2, 14, PALETTE.textMuted, 'left', '600');
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      rr(ctx, cx - 4, cy - 4, size + 8, size + 8, 16);
      ctx.fill();
      blob(ctx, s.color, cx, cy, size);
      text(ctx, '目標色', cx + size + 14, cy + 18, 12, PALETTE.textMuted, 'left', '600');
      text(ctx, COLOR_NAME[s.color] || '-', cx + size + 14, cy + 40, 20, COLOR_OF[s.color], 'left', '800');
      if (s.frozen) {
        text(ctx, '已凍結', p.x + p.w - 18, cy + 40, 12, PALETTE.expensive, 'right', '700');
      }
    }
    ctx.restore();
  }

  function unlockProgress(ctx, state, side) {
    var p = panelOf(side);
    var s = state || {};
    var stage = s.stage === undefined ? 1 : s.stage;   /* 1 | 2 | 'max' */
    var pts = s.points === undefined ? 0 : s.points;
    var need = s.need === undefined ? 0 : s.need;
    var bx = p.x + 18, by = p.y + 148, bw = p.w - 36, bh = 20;

    ctx.save();
    var label = stage === 'max' ? '滿級' : ('第 ' + stage + ' 階');
    text(ctx, label, bx, by - 14, 13, stage === 'max' ? PALETTE.expensive : PALETTE.text, 'left', '700');
    if (stage === 'max') {
      text(ctx, '80 分/點', bx + bw, by - 14, 12, PALETTE.textMuted, 'right', '600');
    } else {
      text(ctx, pts + ' / ' + need, bx + bw, by - 14, 13, PALETTE.text, 'right', '800');
    }

    ctx.fillStyle = PALETTE.progressTrack;
    rr(ctx, bx, by, bw, bh, 10);
    ctx.fill();

    var ratio = stage === 'max' ? 1 : (need > 0 ? Math.max(0, Math.min(1, pts / need)) : 0);
    if (ratio > 0) {
      ctx.fillStyle = stage === 'max' ? PALETTE.progressMax : PALETTE.progressFill;
      rr(ctx, bx, by, Math.max(bh, bw * ratio), bh, 10);
      ctx.fill();
    }
    ctx.strokeStyle = PALETTE.plateEdge;
    ctx.lineWidth = 2;
    rr(ctx, bx, by, bw, bh, 10);
    ctx.stroke();

    var unlocked = s.unlockedCols === undefined ? 0 : s.unlockedCols;
    var py = by + 34, ps = 18;
    text(ctx, '已延展', bx, py + ps / 2, 12, PALETTE.textMuted, 'left', '600');
    for (var i = 0; i < 2; i++) {
      var px = bx + 58 + i * (ps + 8);
      if (i < unlocked) {
        ctx.fillStyle = PALETTE.progressFill;
        rr(ctx, px, py, ps, ps, 5);
        ctx.fill();
      } else {
        ctx.strokeStyle = PALETTE.plateEdge;
        ctx.lineWidth = 2;
        rr(ctx, px, py, ps, ps, 5);
        ctx.stroke();
      }
    }
    if (s.overflow) {
      text(ctx, '承接溢出 +' + s.overflow, bx + bw, py + ps / 2, 12, PALETTE.progressFill, 'right', '700');
    }
    ctx.restore();
  }

  /* contract alias: the player-controlled object here is the falling piece */
  Art.drawPlayer = function (ctx, state) { Art.drawFallingPiece(ctx, state); };

  window.Art = Art;
}());
