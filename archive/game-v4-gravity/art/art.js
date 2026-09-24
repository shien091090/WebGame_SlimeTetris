/* art.js - SlimeTetris Demo v11 美術層
 * 全域 window.Art, 不使用 ES module。純 Canvas 2D 幾何繪製, 無任何外部資源。
 * 所有繪製函式簽章固定為 (ctx, state); drawBackground 只有 (ctx)。
 * 本層不含任何遊戲邏輯: 不算碰撞、不讀輸入、不改狀態。
 */
(function () {
  'use strict';

  /* ---------------- 尺寸常數 ---------------- */
  var CANVAS_W = 960;
  var CANVAS_H = 640;
  var CELL = 26;
  var ROWS_VISIBLE = 19;        // 列 1(最底) ~ 列 19(頂列); 列 20 以上不可見
  var MID_X = 480;              // 中線螢幕 x = 絕對欄 2 與 3 的接縫, 全局固定
  var BOARD_BOTTOM = 606;       // 列 1 的底緣
  var BOARD_TOP = BOARD_BOTTOM - ROWS_VISIBLE * CELL; // 112
  var COL_MIN_ABS = -2;         // 滿寬最左絕對欄
  var COL_MAX_ABS = 7;          // 滿寬最右絕對欄

  var PANEL_L = { x: 24, y: 112, w: 306, h: 494 };
  var PANEL_R = { x: 630, y: 112, w: 306, h: 494 };
  var HEADER = { x: 24, y: 8, w: 912, h: 70 };
  var FOOT = { x: 350, y: 612, w: 260, h: 22 };

  var FONT = '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif';

  /* ---------------- 色票 ---------------- */
  var P = {
    bg: '#0a0e15',
    bgDeep: '#060910',
    panel: '#141c28',
    panelEdge: '#25324a',
    boardBg: '#161e2b',
    boardCell: '#1d2736',
    boardEdge: '#33445e',
    boardLocked: '#222d3e',

    colorA: '#4ecb8b',
    colorB: '#ff6b5e',
    colorC: '#49a8ff',
    colorADark: '#2a7d55',
    colorBDark: '#a23a33',
    colorCDark: '#245f93',

    ballCore: '#2b1f52',
    ballRing: '#cba8ff',
    ballGlow: '#8a5cf6',
    ballSpark: '#ffffff',

    mid: '#ffffff',
    midCase: '#05080d',
    midTick: '#9fb4cc',

    float: '#dbe6f2',
    floatFill: '#8fb4d8',

    sideL: '#6fd3ff',
    sideR: '#ffb968',

    gravSmall: '#7fd4ff',
    gravLarge: '#ffd166',
    gravIdle: '#94a3b5',
    extra: '#f78bff',

    clear: '#ffffff',
    shave: '#ffe9a8',
    bonus: '#ffd166',
    danger: '#ff5f56',

    text: '#e8eff7',
    textDim: '#8b9cb2',
    textFaint: '#5b6b80',
    ink: '#0b1018'
  };

  var COLOR_OF = { A: P.colorA, B: P.colorB, C: P.colorC };
  var COLOR_DARK_OF = { A: P.colorADark, B: P.colorBDark, C: P.colorCDark };
  var COLOR_NAME = { A: '色A', B: '色B', C: '色C' };

  /* ---------------- 小工具 ---------------- */
  function colX(col) { return MID_X + (col - 3) * CELL; }
  function rowTop(row) { return BOARD_BOTTOM - row * CELL; }

  function hexToRgb(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function rgba(h, a) {
    var c = hexToRgb(h);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function mix(h1, h2, k) {
    var a = hexToRgb(h1), b = hexToRgb(h2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * k) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

  function rrPath(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
  }
  function fillRR(ctx, x, y, w, h, r, fill) { rrPath(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
  function strokeRR(ctx, x, y, w, h, r, stroke, lw) {
    rrPath(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke();
  }
  function text(ctx, str, x, y, size, color, align, weight, baseline) {
    ctx.font = (weight || '500') + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(str, x, y);
  }
  function chip(ctx, str, x, y, size, fg, bg, padX, align) {
    ctx.font = '700 ' + size + 'px ' + FONT;
    var w = ctx.measureText(str).width + (padX || 8) * 2;
    var h = size + 10;
    var left = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
    fillRR(ctx, left, y - h / 2, w, h, h / 2, bg);
    text(ctx, str, left + w / 2, y + 0.5, size, fg, 'center', '700');
    return w;
  }
  function seg(ctx, x1, y1, x2, y2, ext) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
    ctx.moveTo(x1 - dx / L * ext, y1 - dy / L * ext);
    ctx.lineTo(x2 + dx / L * ext, y2 + dy / L * ext);
  }
  function hatch(ctx, x, y, w, h, angle, gap, color, lw) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.lineWidth = lw || 1;
    var rad = angle * Math.PI / 180;
    var len = w + h;
    var cx = x + w / 2, cy = y + h / 2;
    ctx.translate(cx, cy); ctx.rotate(rad);
    ctx.beginPath();
    for (var i = -len; i <= len; i += gap) { ctx.moveTo(i, -len); ctx.lineTo(i, len); }
    ctx.stroke();
    ctx.restore();
  }

  /* 取一組格位的輪廓(只畫沒有同塊鄰居的邊) */
  function cellKey(c, r) { return c + ':' + r; }
  function makeSet(cells) {
    var s = {};
    for (var i = 0; i < cells.length; i++) s[cellKey(cells[i].col, cells[i].row)] = 1;
    return s;
  }
  function pathContour(ctx, cells, inset) {
    var s = makeSet(cells), i, c, r, x1, y1, x2, y2;
    ctx.beginPath();
    for (i = 0; i < cells.length; i++) {
      c = cells[i].col; r = cells[i].row;
      x1 = colX(c) + inset; y1 = rowTop(r) + inset;
      x2 = colX(c) + CELL - inset; y2 = rowTop(r) + CELL - inset;
      if (!s[cellKey(c, r + 1)]) seg(ctx, x1, y1, x2, y1, inset);   // 上緣(列號大者在上)
      if (!s[cellKey(c, r - 1)]) seg(ctx, x1, y2, x2, y2, inset);   // 下緣
      if (!s[cellKey(c - 1, r)]) seg(ctx, x1, y1, x1, y2, inset);   // 左緣
      if (!s[cellKey(c + 1, r)]) seg(ctx, x2, y1, x2, y2, inset);   // 右緣
    }
  }
  function clipCells(ctx, cells, inset) {
    ctx.beginPath();
    for (var i = 0; i < cells.length; i++) {
      ctx.rect(colX(cells[i].col) + inset, rowTop(cells[i].row) + inset, CELL - inset * 2, CELL - inset * 2);
    }
    ctx.clip();
  }
  function bboxOf(cells) {
    var c0 = 1e9, c1 = -1e9, r0 = 1e9, r1 = -1e9;
    for (var i = 0; i < cells.length; i++) {
      c0 = Math.min(c0, cells[i].col); c1 = Math.max(c1, cells[i].col);
      r0 = Math.min(r0, cells[i].row); r1 = Math.max(r1, cells[i].row);
    }
    return { c0: c0, c1: c1, r0: r0, r1: r1 };
  }

  /* 每種顏色的辨識符號(色盲備援): A=圓 B=三角 C=方 */
  function colorGlyph(ctx, color, cx, cy, s, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (color === 'A') {
      ctx.arc(cx, cy, s * 0.5, 0, Math.PI * 2);
    } else if (color === 'B') {
      ctx.moveTo(cx, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.55, cy + s * 0.42);
      ctx.lineTo(cx - s * 0.55, cy + s * 0.42);
      ctx.closePath();
    } else {
      ctx.rect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
    }
    ctx.fill();
  }

  /* 塊識別徽章形狀(懸空結構用, 依塊序號輪替) */
  function badgeGlyph(ctx, idx, cx, cy, s, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    var k = ((idx % 6) + 6) % 6, i, a;
    if (k === 0) {            // 菱形
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
    } else if (k === 1) {     // 圓
      ctx.arc(cx, cy, s * 0.92, 0, Math.PI * 2);
    } else if (k === 2) {     // 三角
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.92, cy + s * 0.7); ctx.lineTo(cx - s * 0.92, cy + s * 0.7);
    } else if (k === 3) {     // 方
      ctx.rect(cx - s * 0.8, cy - s * 0.8, s * 1.6, s * 1.6);
    } else if (k === 4) {     // 十字
      ctx.rect(cx - s * 0.32, cy - s, s * 0.64, s * 2);
      ctx.rect(cx - s, cy - s * 0.32, s * 2, s * 0.64);
    } else {                  // 六邊形
      for (i = 0; i < 6; i++) {
        a = Math.PI / 6 + i * Math.PI / 3;
        if (i === 0) ctx.moveTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
        else ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  var BLOCK_DASH = [[], [9, 5], [3, 4], [14, 4, 3, 4], [6, 4], [2, 3, 8, 3]];
  var BLOCK_HATCH = [45, -45, 0, 90, 22, -22];

  /* ---------------- 背景 ---------------- */
  function drawBackground(ctx) {
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    g.addColorStop(0, P.bg);
    g.addColorStop(1, P.bgDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 極淡的底紋, 讓盤面與面板有層次
    ctx.globalAlpha = 0.5;
    hatch(ctx, 0, 0, CANVAS_W, CANVAS_H, 45, 34, rgba('#2a3a52', 0.16), 1);
    ctx.globalAlpha = 1;

    // 資訊面板底板
    fillRR(ctx, PANEL_L.x, PANEL_L.y, PANEL_L.w, PANEL_L.h, 14, P.panel);
    strokeRR(ctx, PANEL_L.x + 0.5, PANEL_L.y + 0.5, PANEL_L.w - 1, PANEL_L.h - 1, 14, P.panelEdge, 1);
    fillRR(ctx, PANEL_R.x, PANEL_R.y, PANEL_R.w, PANEL_R.h, 14, P.panel);
    strokeRR(ctx, PANEL_R.x + 0.5, PANEL_R.y + 0.5, PANEL_R.w - 1, PANEL_R.h - 1, 14, P.panelEdge, 1);
    fillRR(ctx, HEADER.x, HEADER.y, HEADER.w, HEADER.h, 14, P.panel);
    strokeRR(ctx, HEADER.x + 0.5, HEADER.y + 0.5, HEADER.w - 1, HEADER.h - 1, 14, P.panelEdge, 1);
    ctx.restore();
  }

  /* ---------------- 盤面 ---------------- */
  function drawBoard(ctx, state) {
    state = state || {};
    var minC = num(state.minCol, 0);
    var maxC = num(state.maxCol, 5);
    ctx.save();

    // 尚未解鎖的欄: 極淡虛線, 讓玩家讀得出盤面還能往哪邊長
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(P.boardLocked, 0.55);
    for (var c = COL_MIN_ABS; c <= COL_MAX_ABS; c++) {
      if (c >= minC && c <= maxC) continue;
      ctx.strokeRect(colX(c) + 2.5, BOARD_TOP + 2.5, CELL - 5, ROWS_VISIBLE * CELL - 5);
    }
    ctx.setLineDash([]);

    var bx = colX(minC), bw = (maxC - minC + 1) * CELL;
    // 外框
    fillRR(ctx, bx - 6, BOARD_TOP - 6, bw + 12, ROWS_VISIBLE * CELL + 12, 10, rgba(P.boardEdge, 0.35));
    strokeRR(ctx, bx - 6.5, BOARD_TOP - 6.5, bw + 13, ROWS_VISIBLE * CELL + 13, 10, P.boardEdge, 2);
    // 底板
    ctx.fillStyle = P.boardBg;
    ctx.fillRect(bx, BOARD_TOP, bw, ROWS_VISIBLE * CELL);
    // 空格位
    for (var cc = minC; cc <= maxC; cc++) {
      for (var r = 1; r <= ROWS_VISIBLE; r++) {
        fillRR(ctx, colX(cc) + 1.5, rowTop(r) + 1.5, CELL - 3, CELL - 3, 5, P.boardCell);
      }
    }
    // 頂緣 = 不可見區的分界(列 20 起不可見)
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = rgba(P.textFaint, 0.9);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, BOARD_TOP - 0.5); ctx.lineTo(bx + bw, BOARD_TOP - 0.5); ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, '列 20 以上不可見', bx, BOARD_TOP - 14, 10, P.textFaint, 'left', '500');
    // 底緣(列 1)
    ctx.strokeStyle = rgba(P.boardEdge, 1); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx, BOARD_BOTTOM + 1); ctx.lineTo(bx + bw, BOARD_BOTTOM + 1); ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 中線(可讀性最高優先) ---------------- */
  function drawCenterLine(ctx, state) {
    state = state || {};
    var minC = num(state.minCol, 0), maxC = num(state.maxCol, 5);
    var top = BOARD_TOP - 8, bot = BOARD_BOTTOM + 8;
    ctx.save();
    // 暗色襯底: 保證壓在任何顏色的史萊姆上都讀得到
    ctx.strokeStyle = rgba(P.midCase, 0.92);
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(MID_X, top); ctx.lineTo(MID_X, bot); ctx.stroke();
    // 主線
    ctx.strokeStyle = P.mid;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(MID_X, top); ctx.lineTo(MID_X, bot); ctx.stroke();
    // 每 4 列一個刻痕, 幫助對位讀欄
    ctx.strokeStyle = rgba(P.midTick, 0.85); ctx.lineWidth = 2;
    ctx.beginPath();
    for (var r = 4; r <= ROWS_VISIBLE; r += 4) {
      var y = rowTop(r) + CELL / 2;
      ctx.moveTo(MID_X - 5, y); ctx.lineTo(MID_X - 2, y);
      ctx.moveTo(MID_X + 2, y); ctx.lineTo(MID_X + 5, y);
    }
    ctx.stroke();
    // 上下端帽
    ctx.fillStyle = P.mid;
    ctx.beginPath();
    ctx.moveTo(MID_X - 6, top); ctx.lineTo(MID_X + 6, top); ctx.lineTo(MID_X, top + 9); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(MID_X - 6, bot); ctx.lineTo(MID_X + 6, bot); ctx.lineTo(MID_X, bot - 9); ctx.closePath(); ctx.fill();
    // 左右半標籤, 永遠貼著中線
    if (maxC >= 3) chip(ctx, '右半', MID_X + 10, BOARD_TOP - 20, 11, P.ink, P.sideR, 7, 'left');
    if (minC <= 2) chip(ctx, '左半', MID_X - 10, BOARD_TOP - 20, 11, P.ink, P.sideL, 7, 'right');
    ctx.restore();
  }

  /* ---------------- 格位 / 史萊姆 ---------------- */
  function slimeBody(ctx, x, y, s, color, alpha) {
    var base = COLOR_OF[color] || P.colorA;
    var dark = COLOR_DARK_OF[color] || P.colorADark;
    var pad = s * 0.07, w = s - pad * 2, rad = s * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    var g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, mix(base, '#ffffff', 0.28));
    g.addColorStop(0.55, base);
    g.addColorStop(1, dark);
    fillRR(ctx, x + pad, y + pad, w, w, rad, g);
    // 上緣高光
    fillRR(ctx, x + pad + s * 0.14, y + pad + s * 0.1, w - s * 0.28, s * 0.16, s * 0.08, rgba('#ffffff', 0.35));
    // 辨識符號
    colorGlyph(ctx, color, x + s / 2, y + s * 0.58, s * 0.38, rgba(P.ink, 0.5));
    strokeRR(ctx, x + pad + 0.5, y + pad + 0.5, w - 1, w - 1, rad, rgba(P.ink, 0.45), 1);
    ctx.restore();
  }

  function drawCell(ctx, state) {
    state = state || {};
    var s = num(state.size, CELL);
    var x = num(state.px, colX(num(state.col, 0)));
    var y = num(state.py, rowTop(num(state.row, 1)));
    var mark = state.mark || 'none';
    var t = clamp01(num(state.t, 0));

    if (state.color === 'ball') { drawGravityBall(ctx, state); return; }

    ctx.save();
    if (mark === 'ghost') {
      var base = COLOR_OF[state.color] || P.colorA;
      fillRR(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.28, rgba(base, 0.18));
      ctx.setLineDash([5, 3]);
      strokeRR(ctx, x + 2.5, y + 2.5, s - 5, s - 5, s * 0.28, rgba(base, 0.8), 1.5);
      ctx.setLineDash([]);
      colorGlyph(ctx, state.color, x + s / 2, y + s * 0.56, s * 0.3, rgba(base, 0.55));
      ctx.restore();
      return;
    }

    if (mark === 'falling') {
      // 隨重力事件下落中: 垂直拖尾 + 冷色鑲邊
      ctx.globalAlpha = 0.5;
      for (var i = 1; i <= 3; i++) {
        fillRR(ctx, x + 4 + i, y - i * 7, s - 8 - i * 2, s * 0.5, 4, rgba(P.gravSmall, 0.22 - i * 0.05));
      }
      ctx.globalAlpha = 1;
    }
    if (mark === 'piece') {
      ctx.shadowColor = rgba('#000000', 0.55);
      ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    }

    slimeBody(ctx, x, y, s, state.color, mark === 'shaving' ? 0.45 + 0.35 * (1 - t) : 1);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    if (mark === 'piece') {
      strokeRR(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.3, rgba('#ffffff', 0.75), 2);
    } else if (mark === 'falling') {
      strokeRR(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.3, P.gravSmall, 2);
    } else if (mark === 'clearing') {
      // 消除標記中: 白閃 + 外擴圈
      var k = 0.55 + 0.45 * Math.sin(t * Math.PI);
      fillRR(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.28, rgba('#ffffff', 0.55 * k));
      ctx.strokeStyle = rgba('#ffffff', (1 - t) * 0.9);
      ctx.lineWidth = 2;
      var e = t * s * 0.45;
      strokeRR(ctx, x - e, y - e, s + e * 2, s + e * 2, s * 0.3 + e, rgba('#ffffff', (1 - t) * 0.9), 2);
    } else if (mark === 'shaving') {
      // 削除標記中: 上緣亮條 + 橫向切片, 整格往上淡出
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
      ctx.strokeStyle = rgba(P.shave, 0.8); ctx.lineWidth = 2;
      ctx.beginPath();
      for (var sy = y + 3; sy < y + s; sy += 6) { ctx.moveTo(x + 1, sy); ctx.lineTo(x + s - 1, sy); }
      ctx.stroke();
      ctx.restore();
      fillRR(ctx, x + 2, y - 1, s - 4, 4, 2, P.shave);
    }
    ctx.restore();
  }

  /* ---------------- 重力觸發球 ---------------- */
  function drawGravityBall(ctx, state) {
    state = state || {};
    var s = num(state.size, CELL);
    var x = num(state.px, colX(num(state.col, 0)));
    var y = num(state.py, rowTop(num(state.row, 1)));
    var cx = x + s / 2, cy = y + s / 2, R = s * 0.40;
    var mark = state.mark || 'none';
    var t = clamp01(num(state.t, 0));
    var pulse = 0.5 + 0.5 * Math.sin(num(state.time, t) * 6.0);

    ctx.save();

    if (mark === 'ghost') {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = rgba(P.ballRing, 0.85); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(P.ballGlow, 0.18);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      sparkle(ctx, cx, cy, s * 0.2, rgba(P.ballSpark, 0.8));
      ctx.restore();
      return;
    }

    if (mark === 'falling') {
      ctx.globalAlpha = 0.55;
      for (var i = 1; i <= 3; i++) {
        ctx.fillStyle = rgba(P.ballRing, 0.2 - i * 0.045);
        ctx.beginPath(); ctx.arc(cx, cy - i * 7, R * 0.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 光暈: 球是盤面上唯一會發光的物件
    var gg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * (1.75 + pulse * 0.2));
    gg.addColorStop(0, rgba(P.ballGlow, 0.55));
    gg.addColorStop(1, rgba(P.ballGlow, 0));
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(cx, cy, R * 2, 0, Math.PI * 2); ctx.fill();

    // 深色球體(刻意不是圓角方形, 與史萊姆的形狀語言區隔)
    var bg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    bg.addColorStop(0, mix(P.ballCore, '#ffffff', 0.28));
    bg.addColorStop(1, P.ballCore);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // 亮環 + 四個缺口(萬用色的記號)
    ctx.strokeStyle = P.ballRing;
    ctx.lineWidth = Math.max(2, s * 0.09);
    for (var a = 0; a < 4; a++) {
      var a0 = a * Math.PI / 2 + Math.PI / 8;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.98, a0, a0 + Math.PI / 2 - Math.PI / 4.2); ctx.stroke();
    }
    // 外環(常駐脈動)
    ctx.strokeStyle = rgba(P.ballRing, 0.28 + pulse * 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2); ctx.stroke();
    sparkle(ctx, cx, cy, s * 0.24, P.ballSpark);

    if (mark === 'piece') {
      ctx.strokeStyle = rgba('#ffffff', 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.12, 0, Math.PI * 2); ctx.stroke();
    } else if (mark === 'clearing') {
      // 觸發: 大幅外擴震波
      ctx.strokeStyle = rgba(P.ballRing, 1 - t); ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath(); ctx.arc(cx, cy, R + t * s * 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.7 * (1 - t));
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    } else if (mark === 'shaving') {
      // 被削頂削除: 不觸發下落, 用灰色斜槓明講
      ctx.strokeStyle = rgba(P.gravIdle, 0.95); ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.1, cy + R * 1.1); ctx.lineTo(cx + R * 1.1, cy - R * 1.1); ctx.stroke();
      fillRR(ctx, x + 2, y - 1, s - 4, 4, 2, P.shave);
    }
    ctx.restore();
  }

  function sparkle(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 0.18, cy - r * 0.18, cx + r, cy);
    ctx.quadraticCurveTo(cx + r * 0.18, cy + r * 0.18, cx, cy + r);
    ctx.quadraticCurveTo(cx - r * 0.18, cy + r * 0.18, cx - r, cy);
    ctx.quadraticCurveTo(cx - r * 0.18, cy - r * 0.18, cx, cy - r);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------- 同色團顆數標示 ---------------- */
  function drawClusterCount(ctx, state) {
    state = state || {};
    var x = colX(num(state.col, 0)), y = rowTop(num(state.row, 1));
    var cx = x + CELL / 2, cy = y + CELL / 2;
    var col = COLOR_OF[state.color] || P.text;
    ctx.save();
    ctx.fillStyle = rgba(P.ink, 0.82);
    ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 8.5, 0, Math.PI * 2); ctx.stroke();
    text(ctx, String(num(state.count, 2)), cx, cy + 0.5, 12, '#ffffff', 'center', '700');
    ctx.restore();
  }

  /* ---------------- 懸空結構標示(常駐) ----------------
   * 要讀出: 哪些格位懸空 + 哪些格位同屬一個連通塊(塊間彼此可區分)。
   * 刻意不表達任何下落格數。
   */
  function drawFloatingStructures(ctx, state) {
    state = state || {};
    var blocks = state.blocks || [];
    var tm = num(state.time, 0);
    ctx.save();
    for (var b = 0; b < blocks.length; b++) {
      var blk = blocks[b] || {};
      var cells = blk.cells || [];
      if (!cells.length) continue;
      var idx = num(blk.id, b);
      var dash = BLOCK_DASH[((idx % BLOCK_DASH.length) + BLOCK_DASH.length) % BLOCK_DASH.length];
      var ang = BLOCK_HATCH[((idx % BLOCK_HATCH.length) + BLOCK_HATCH.length) % BLOCK_HATCH.length];
      var bb = bboxOf(cells);

      // 1) 同塊填色網點(角度依塊輪替): 不必追輪廓也看得出歸屬
      ctx.save();
      clipCells(ctx, cells, 1.5);
      hatch(ctx, colX(bb.c0), rowTop(bb.r1), (bb.c1 - bb.c0 + 1) * CELL, (bb.r1 - bb.r0 + 1) * CELL,
        ang, 6, rgba(P.floatFill, 0.30), 1.5);
      ctx.restore();

      // 2) 塊內鍵結: 相鄰同塊格位以短桿相連, 表達「整塊是一個剛體」
      var set = makeSet(cells);
      ctx.strokeStyle = rgba(P.float, 0.75);
      ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i].col, r = cells[i].row;
        var x0 = colX(c) + CELL / 2, y0 = rowTop(r) + CELL / 2;
        if (set[cellKey(c + 1, r)]) { ctx.moveTo(x0 + 5, y0); ctx.lineTo(x0 + CELL - 5, y0); }
        if (set[cellKey(c, r + 1)]) { ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 - CELL + 5); }
      }
      ctx.stroke();

      // 3) 整塊外輪廓(虛線樣式依塊輪替)
      ctx.setLineDash(dash);
      ctx.lineDashOffset = -(tm * 14) % 40;
      ctx.strokeStyle = rgba(P.ink, 0.75);
      ctx.lineWidth = 5;
      pathContour(ctx, cells, 2); ctx.stroke();
      ctx.strokeStyle = P.float;
      ctx.lineWidth = 2.5;
      pathContour(ctx, cells, 2); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;

      // 4) 底緣「沒有支撐」的點線(不表達落幾格)
      ctx.strokeStyle = rgba(P.float, 0.9);
      ctx.lineWidth = 2; ctx.setLineDash([2, 3]);
      ctx.beginPath();
      for (var j = 0; j < cells.length; j++) {
        var cc = cells[j].col, rr = cells[j].row;
        if (set[cellKey(cc, rr - 1)]) continue;
        var by = rowTop(rr) + CELL + 3.5;
        ctx.moveTo(colX(cc) + 3, by); ctx.lineTo(colX(cc) + CELL - 3, by);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // 5) 塊徽章: 掛在整塊外框右上角, 形狀依塊輪替
      var bx = colX(bb.c1) + CELL, by2 = rowTop(bb.r1);
      ctx.fillStyle = rgba(P.ink, 0.9);
      ctx.beginPath(); ctx.arc(bx, by2, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.float; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, by2, 8, 0, Math.PI * 2); ctx.stroke();
      badgeGlyph(ctx, idx, bx, by2, 4, P.float);
    }
    ctx.restore();
  }

  /* ---------------- 重力事件指示(依規模分級) ---------------- */
  function boardSpanX(state) {
    var minC = num(state.minCol, 0), maxC = num(state.maxCol, 5);
    return { x: colX(minC), w: (maxC - minC + 1) * CELL, cx: colX(minC) + (maxC - minC + 1) * CELL / 2 };
  }

  function drawGravityEvent(ctx, state) {
    state = state || {};
    var kind = state.kind || 'small';           // 'small' | 'large' | 'idle'
    var t = clamp01(num(state.t, 0));
    var span = boardSpanX(state);
    var accent = kind === 'large' ? P.gravLarge : (kind === 'idle' ? P.gravIdle : P.gravSmall);
    var i, blk, cells, bb;
    ctx.save();

    // 觸發點: 被消掉的含球團原座標
    var org = state.originCells || (state.origin ? [state.origin] : []);
    if (org.length) {
      var ob = bboxOf(org);
      var ocx = colX(ob.c0) + (ob.c1 - ob.c0 + 1) * CELL / 2;
      var ocy = rowTop(ob.r1) + (ob.r1 - ob.r0 + 1) * CELL / 2;
      ctx.strokeStyle = rgba(kind === 'idle' ? P.gravIdle : P.ballRing, 1 - t);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(ocx, ocy, 8 + t * 34, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = rgba(kind === 'idle' ? P.gravIdle : P.ballRing, 0.75);
      ctx.lineWidth = 2;
      pathContour(ctx, org, 3); ctx.stroke();
      ctx.setLineDash([]);
      if (kind === 'idle') {
        // 零位移: 灰色 X, 與有位移事件的形狀語言完全不同
        ctx.strokeStyle = P.gravIdle; ctx.lineWidth = 4; ctx.lineCap = 'round';
        var d = 11;
        ctx.beginPath();
        ctx.moveTo(ocx - d, ocy - d); ctx.lineTo(ocx + d, ocy + d);
        ctx.moveTo(ocx + d, ocy - d); ctx.lineTo(ocx - d, ocy + d);
        ctx.stroke();
      }
    }

    // 受影響且懸空(將下落)的塊
    var fall = state.fallingBlocks || [];
    for (i = 0; i < fall.length; i++) {
      blk = fall[i] || {}; cells = blk.cells || [];
      if (!cells.length) continue;
      ctx.save();
      clipCells(ctx, cells, 1.5);
      ctx.fillStyle = rgba(accent, 0.18);
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.restore();
      ctx.strokeStyle = rgba(P.ink, 0.8); ctx.lineWidth = 6;
      pathContour(ctx, cells, 2); ctx.stroke();
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      pathContour(ctx, cells, 2); ctx.stroke();
      bb = bboxOf(cells);
      chip(ctx, '落', colX(bb.c1) + CELL, rowTop(bb.r1) - 2, 11, P.ink, accent, 6, 'left');
      // 底緣雙箭頭(方向語意, 固定兩個, 不代表格數)
      ctx.fillStyle = accent;
      var st = makeSet(cells);
      for (var j = 0; j < cells.length; j++) {
        var c = cells[j].col, r = cells[j].row;
        if (st[cellKey(c, r - 1)]) continue;
        var ax = colX(c) + CELL / 2, ay = rowTop(r) + CELL + 4 + Math.sin(t * Math.PI * 2) * 2;
        for (var k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.moveTo(ax - 5, ay + k * 6); ctx.lineTo(ax + 5, ay + k * 6); ctx.lineTo(ax, ay + 5 + k * 6);
          ctx.closePath(); ctx.fill();
        }
      }
    }

    // 受影響但不懸空(不動)的塊
    var stay = state.staticBlocks || [];
    for (i = 0; i < stay.length; i++) {
      blk = stay[i] || {}; cells = blk.cells || [];
      if (!cells.length) continue;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = rgba(P.gravIdle, 0.9); ctx.lineWidth = 2;
      pathContour(ctx, cells, 2); ctx.stroke();
      ctx.setLineDash([]);
      bb = bboxOf(cells);
      chip(ctx, '不動', colX(bb.c1) + CELL, rowTop(bb.r1) - 2, 10, P.ink, P.gravIdle, 5, 'left');
    }

    // 事件橫幅: 三種規模各自一個字面
    var label = kind === 'large' ? '重力事件 · 大型' : (kind === 'idle' ? '重力事件 · 空轉(無相連懸空結構)' : '重力事件');
    bannerOverBoard(ctx, label, span, accent, kind === 'idle' ? 'hex' : 'bar', t);
    ctx.restore();
  }

  /* 盤面上方的事件橫幅; shape 切換外框造型, 讓不同事件不會被讀成同一個 */
  function bannerOverBoard(ctx, label, span, accent, shape, t) {
    var y = BOARD_TOP + 16;
    ctx.save();
    ctx.font = '700 13px ' + FONT;
    var w = ctx.measureText(label).width + 26, h = 24;
    var x = span.cx - w / 2;
    ctx.globalAlpha = 0.92;
    if (shape === 'hex') {
      ctx.beginPath();
      ctx.moveTo(x + 9, y - h / 2); ctx.lineTo(x + w - 9, y - h / 2); ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - 9, y + h / 2); ctx.lineTo(x + 9, y + h / 2); ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = rgba(P.ink, 0.92); ctx.fill();
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke();
    } else {
      fillRR(ctx, x, y - h / 2, w, h, 6, rgba(P.ink, 0.92));
      strokeRR(ctx, x + 0.5, y - h / 2 + 0.5, w - 1, h - 1, 6, accent, 2);
    }
    text(ctx, label, span.cx, y + 0.5, 13, accent, 'center', '700');
    ctx.restore();
  }

  /* ---------------- 消除結算標記 ---------------- */
  var TAG_STYLE = {
    left: { c: '#6fd3ff', s: '左' },
    right: { c: '#ffb968', s: '右' },
    stage: { c: '#b9f27c', s: '階' },
    wrong: { c: '#94a3b5', s: '×' },
    ball: { c: '#cba8ff', s: '球' },
    plain: null
  };

  function drawClearResult(ctx, state) {
    state = state || {};
    var cells = state.cells || [];
    var t = clamp01(num(state.t, 0));
    var span = boardSpanX(state);
    ctx.save();
    for (var i = 0; i < cells.length; i++) {
      var cel = cells[i];
      var st = TAG_STYLE[cel.tag] || null;
      var x = colX(cel.col), y = rowTop(cel.row);
      ctx.strokeStyle = rgba('#ffffff', 0.85 * (1 - t * 0.4));
      strokeRR(ctx, x + 2.5, y + 2.5, CELL - 5, CELL - 5, 7, rgba('#ffffff', 0.85 * (1 - t * 0.4)), 2);
      if (!st) continue;
      var bx = x + CELL - 7, by = y + 7;
      ctx.fillStyle = rgba(P.ink, 0.9);
      ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = st.c; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, Math.PI * 2); ctx.stroke();
      text(ctx, st.s, bx, by + 0.5, 9, st.c, 'center', '700');
    }
    // 結算摘要
    var sm = state.summary || {};
    var parts = [];
    if (num(sm.left, 0) > 0) parts.push(['左 −' + sm.left, TAG_STYLE.left.c]);
    if (num(sm.right, 0) > 0) parts.push(['右 −' + sm.right, TAG_STYLE.right.c]);
    if (num(sm.stage, 0) > 0) parts.push(['本階 −' + sm.stage, TAG_STYLE.stage.c]);
    if (num(sm.wrong, 0) > 0) parts.push(['位置不對 ' + sm.wrong, TAG_STYLE.wrong.c]);
    if (num(sm.ball, 0) > 0) parts.push(['球 ' + sm.ball, TAG_STYLE.ball.c]);
    if (parts.length) {
      ctx.font = '700 12px ' + FONT;
      var total = 0, ws = [], k;
      for (k = 0; k < parts.length; k++) { ws[k] = ctx.measureText(parts[k][0]).width + 16; total += ws[k] + 6; }
      var cx = span.cx - total / 2, yy = BOARD_TOP + 44;
      for (k = 0; k < parts.length; k++) {
        fillRR(ctx, cx, yy - 11, ws[k], 22, 5, rgba(P.ink, 0.9));
        strokeRR(ctx, cx + 0.5, yy - 10.5, ws[k] - 1, 21, 5, parts[k][1], 1.5);
        text(ctx, parts[k][0], cx + ws[k] / 2, yy + 0.5, 12, parts[k][1], 'center', '700');
        cx += ws[k] + 6;
      }
    }
    ctx.restore();
  }

  /* ---------------- 追加消除指示 ---------------- */
  function drawExtraClear(ctx, state) {
    state = state || {};
    var cells = state.cells || [];
    var t = clamp01(num(state.t, 0));
    var span = boardSpanX(state);
    ctx.save();
    for (var i = 0; i < cells.length; i++) {
      var x = colX(cells[i].col), y = rowTop(cells[i].row);
      strokeRR(ctx, x + 1.5, y + 1.5, CELL - 3, CELL - 3, 8, P.extra, 2);
      strokeRR(ctx, x + 5.5, y + 5.5, CELL - 11, CELL - 11, 5, rgba(P.extra, 0.7), 1.5);
    }
    ctx.save();
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * Math.PI * 4);
    bannerOverBoard(ctx, '追加消除(下落後才成立)', span, P.extra, 'bar', t);
    ctx.restore();
    ctx.restore();
  }

  /* ---------------- 落下方塊 / ghost / 預覽 ---------------- */
  function drawPiece(ctx, state) {
    state = state || {};
    var cells = state.cells || [];
    var phase = state.phase || 'falling';
    var i;
    ctx.save();
    for (i = 0; i < cells.length; i++) {
      drawCell(ctx, {
        col: cells[i].col, row: cells[i].row, color: cells[i].color,
        mark: 'piece', time: num(state.time, 0)
      });
    }
    if (phase === 'soft') {
      ctx.fillStyle = rgba('#ffffff', 0.35);
      for (i = 0; i < cells.length; i++) {
        var x = colX(cells[i].col) + CELL / 2, y = rowTop(cells[i].row);
        ctx.fillRect(x - 1, y - 12, 2, 8);
      }
    }
    if (phase === 'lock' && cells.length) {
      var bb = bboxOf(cells);
      var p = clamp01(num(state.lockProgress, 0));
      var lx = colX(bb.c0), lw = (bb.c1 - bb.c0 + 1) * CELL;
      ctx.setLineDash([4, 3]);
      strokeRR(ctx, lx - 2.5, rowTop(bb.r1) - 2.5, lw + 5, (bb.r1 - bb.r0 + 1) * CELL + 5, 8,
        rgba('#ffffff', 0.55 + 0.35 * Math.sin(num(state.time, 0) * 12)), 2);
      ctx.setLineDash([]);
      var by = rowTop(bb.r0) + CELL + 4;
      fillRR(ctx, lx, by, lw, 3, 1.5, rgba('#ffffff', 0.25));
      fillRR(ctx, lx, by, lw * p, 3, 1.5, P.danger);
    }
    ctx.restore();
  }

  function drawGhost(ctx, state) {
    state = state || {};
    var cells = state.cells || [];
    if (!cells.length) return;
    ctx.save();
    var bb = bboxOf(cells);
    // 兩側導軌: 幫助讀出「這一塊會落在中線的哪一半」
    ctx.fillStyle = rgba('#ffffff', 0.07);
    ctx.fillRect(colX(bb.c0), BOARD_TOP, (bb.c1 - bb.c0 + 1) * CELL, rowTop(bb.r1) - BOARD_TOP);
    for (var i = 0; i < cells.length; i++) {
      drawCell(ctx, { col: cells[i].col, row: cells[i].row, color: cells[i].color, mark: 'ghost' });
    }
    ctx.restore();
  }

  function drawNextPreview(ctx, state) {
    state = state || {};
    var box = { x: PANEL_R.x + 16, y: PANEL_R.y + 16, w: PANEL_R.w - 32, h: 118 };
    ctx.save();
    fillRR(ctx, box.x, box.y, box.w, box.h, 10, rgba(P.ink, 0.45));
    strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, P.panelEdge, 1);
    text(ctx, '下一塊', box.x + 12, box.y + 18, 13, P.textDim, 'left', '700');

    if (state.masked) {
      hatch(ctx, box.x + 2, box.y + 28, box.w - 4, box.h - 30, 45, 8, rgba(P.textFaint, 0.5), 2);
      text(ctx, '暫停中', box.x + box.w / 2, box.y + 74, 14, P.textDim, 'center', '700');
      ctx.restore();
      return;
    }

    var cells = state.cells || [];
    var s = 24;
    if (cells.length) {
      var c0 = 1e9, c1 = -1e9, r0 = 1e9, r1 = -1e9, i;
      for (i = 0; i < cells.length; i++) {
        c0 = Math.min(c0, cells[i].dx); c1 = Math.max(c1, cells[i].dx);
        r0 = Math.min(r0, cells[i].dy); r1 = Math.max(r1, cells[i].dy);
      }
      var gw = (c1 - c0 + 1) * s, gh = (r1 - r0 + 1) * s;
      var ox = box.x + box.w / 2 - gw / 2, oy = box.y + 30 + (box.h - 38 - gh) / 2;
      for (i = 0; i < cells.length; i++) {
        drawCell(ctx, {
          color: cells[i].color, mark: 'none', size: s,
          px: ox + (cells[i].dx - c0) * s, py: oy + (cells[i].dy - r0) * s,
          time: num(state.time, 0)
        });
      }
    }
    if (state.hasBall) {
      chip(ctx, '含重力球', box.x + box.w - 12, box.y + 18, 11, P.ink, P.ballRing, 7, 'right');
    }
    ctx.restore();
  }

  /* ---------------- 兩側資訊面板(目標色 / 昂貴側 / 解鎖進度 / 待延展) ---------------- */
  function drawSidePanel(ctx, state) {
    state = state || {};
    var isLeft = state.side !== 'right';
    var accent = isLeft ? P.sideL : P.sideR;
    var base = isLeft ? PANEL_L : PANEL_R;
    var box = { x: base.x + 16, y: isLeft ? base.y + 16 : base.y + 150, w: base.w - 32, h: 176 };
    var dim = !!state.disabled;
    ctx.save();
    ctx.globalAlpha = dim ? 0.38 : 1;

    fillRR(ctx, box.x, box.y, box.w, box.h, 10, rgba(P.ink, 0.45));
    strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, rgba(accent, 0.55), 1.5);
    fillRR(ctx, box.x, box.y, box.w, 26, 10, rgba(accent, 0.22));
    text(ctx, isLeft ? '左半盤(絕對欄 ≤ 2)' : '右半盤(絕對欄 ≥ 3)', box.x + 12, box.y + 14, 12, accent, 'left', '700');

    // 目標色大色塊
    var sw = 46, sx = box.x + 14, sy = box.y + 40;
    if (state.targetColor) {
      slimeBody(ctx, sx, sy, sw, state.targetColor, 1);
      text(ctx, '目標色', sx + sw + 12, sy + 14, 12, P.textDim, 'left', '500');
      text(ctx, COLOR_NAME[state.targetColor] || '—', sx + sw + 12, sy + 33, 17, COLOR_OF[state.targetColor], 'left', '700');
    } else {
      strokeRR(ctx, sx + 0.5, sy + 0.5, sw - 1, sw - 1, 12, P.textFaint, 1.5);
      text(ctx, '—', sx + sw / 2, sy + sw / 2, 18, P.textFaint, 'center', '700');
    }
    // 昂貴 / 便宜
    chip(ctx, state.expensive ? '昂貴側' : '便宜側', box.x + box.w - 12, sy + 12,
      11, P.ink, state.expensive ? P.danger : P.textDim, 7, 'right');

    // 解鎖進度
    var py = box.y + 106;
    var status = state.status || 'counting';
    var msg, msgColor;
    if (status === 'maxed') { msg = '滿級(A=2)'; msgColor = P.bonus; }
    else if (status === 'pendingExpand') { msg = '已滿, 待延展'; msgColor = P.bonus; }
    else { msg = '第 ' + num(state.stageIndex, 1) + ' 階 · 剩 ' + num(state.remain, 0) + ' 顆'; msgColor = P.text; }
    text(ctx, '解鎖進度', box.x + 14, py, 12, P.textDim, 'left', '500');
    text(ctx, msg, box.x + 14, py + 22, 16, msgColor, 'left', '700');

    // A / E 兩階指示燈
    var A = num(state.stageA, 0), E = num(state.stageE, 0);
    for (var i = 0; i < 2; i++) {
      var gx = box.x + box.w - 56 + i * 22, gy = py + 16;
      fillRR(ctx, gx, gy - 8, 16, 16, 4, i < A ? accent : rgba(P.textFaint, 0.35));
      if (i < A && i >= E) { // 已達成但尚未執行延展
        strokeRR(ctx, gx - 1.5, gy - 9.5, 19, 19, 5, P.bonus, 2);
      }
    }
    if (status === 'pendingExpand') {
      ctx.globalAlpha *= 0.6 + 0.4 * Math.abs(Math.sin(num(state.time, 0) * 4));
      chip(ctx, '待延展', box.x + 14, box.y + box.h - 16, 11, P.ink, P.bonus, 7, 'left');
    }
    ctx.restore();

    if (dim) {
      ctx.save();
      chip(ctx, '延伸關卡中 · 停用', box.x + box.w / 2, box.y + box.h / 2, 12, P.ink, P.textDim, 9, 'center');
      ctx.restore();
    }
  }

  /* ---------------- 延伸關卡: 進度 / 目標色 / 指定側 ---------------- */
  function drawExtendPanel(ctx, state) {
    state = state || {};
    var box = { x: PANEL_L.x + 16, y: PANEL_L.y + 16, w: PANEL_L.w - 32, h: 292 };
    ctx.save();
    fillRR(ctx, box.x, box.y, box.w, box.h, 10, rgba(P.ink, 0.45));
    strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, rgba(P.bonus, 0.5), 1.5);
    fillRR(ctx, box.x, box.y, box.w, 26, 10, rgba(P.bonus, 0.2));
    text(ctx, '延伸關卡', box.x + 12, box.y + 14, 12, P.bonus, 'left', '700');

    if (!state.active) {
      text(ctx, '未進入', box.x + box.w / 2, box.y + box.h / 2, 16, P.textFaint, 'center', '700');
      ctx.restore();
      return;
    }
    text(ctx, '第 ' + num(state.stage, 1) + ' 階', box.x + box.w - 12, box.y + 14, 12, P.bonus, 'right', '700');

    // 本階目標色
    var sw = 46, sx = box.x + 14, sy = box.y + 40;
    slimeBody(ctx, sx, sy, sw, state.color || 'A', 1);
    text(ctx, '本階目標色', sx + sw + 12, sy + 14, 12, P.textDim, 'left', '500');
    text(ctx, COLOR_NAME[state.color] || '—', sx + sw + 12, sy + 33, 17, COLOR_OF[state.color] || P.text, 'left', '700');

    // 本階指定側: 用縮圖把中線與左右半直接畫出來
    var isLeft = state.side !== 'right';
    var accent = isLeft ? P.sideL : P.sideR;
    var my = box.y + 104;
    text(ctx, '本階指定側(以中線為準)', box.x + 14, my, 12, P.textDim, 'left', '500');
    var mw = box.w - 28, mh = 34, mx = box.x + 14, mmid = mx + mw / 2;
    fillRR(ctx, mx, my + 14, mw, mh, 6, rgba('#ffffff', 0.05));
    ctx.fillStyle = rgba(accent, 0.3);
    if (isLeft) ctx.fillRect(mx + 2, my + 16, mw / 2 - 3, mh - 4);
    else ctx.fillRect(mmid + 1, my + 16, mw / 2 - 3, mh - 4);
    ctx.strokeStyle = P.mid; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mmid, my + 12); ctx.lineTo(mmid, my + 14 + mh + 2); ctx.stroke();
    text(ctx, '左半', mx + mw / 4, my + 31, 12, isLeft ? accent : P.textFaint, 'center', isLeft ? '700' : '500');
    text(ctx, '右半', mmid + mw / 4, my + 31, 12, !isLeft ? accent : P.textFaint, 'center', !isLeft ? '700' : '500');
    chip(ctx, isLeft ? '本階算左半' : '本階算右半', box.x + box.w / 2, my + 66, 12, P.ink, accent, 9, 'center');

    // 剩餘顆數
    var py = box.y + 214;
    text(ctx, '本階剩餘', box.x + 14, py, 12, P.textDim, 'left', '500');
    if (state.pending) {
      text(ctx, '已達成, 待結算', box.x + 14, py + 24, 17, P.bonus, 'left', '700');
    } else {
      text(ctx, num(state.remain, 0) + ' 顆', box.x + 14, py + 24, 22, P.text, 'left', '700');
      text(ctx, '/ 需求 ' + num(state.need, 0), box.x + 100, py + 26, 12, P.textDim, 'left', '500');
      var pw = box.w - 28, pr = clamp01(1 - num(state.remain, 0) / Math.max(1, num(state.need, 1)));
      fillRR(ctx, box.x + 14, py + 44, pw, 6, 3, rgba('#ffffff', 0.12));
      fillRR(ctx, box.x + 14, py + 44, pw * pr, 6, 3, accent);
    }
    // 下一個獎勵預告(固定循環, 玩家讀得到節奏)
    if (state.nextReward) {
      chip(ctx, '下個獎勵: ' + state.nextReward, box.x + 14, box.y + box.h - 16, 11, P.ink, P.textDim, 7, 'left');
    }
    ctx.restore();
  }

  /* 盤面上的指定側標示: 與中線一起讀 */
  function drawExtendSideMarker(ctx, state) {
    state = state || {};
    if (!state.active) return;
    var isLeft = state.side !== 'right';
    var accent = isLeft ? P.sideL : P.sideR;
    var minC = num(state.minCol, -2), maxC = num(state.maxCol, 7);
    var x0 = isLeft ? colX(minC) : MID_X;
    var x1 = isLeft ? MID_X : colX(maxC) + CELL;
    var w = x1 - x0;
    ctx.save();
    // 半盤底色染色(極淡, 不搶史萊姆顏色)
    var g = ctx.createLinearGradient(isLeft ? x1 : x0, 0, isLeft ? x0 : x1, 0);
    g.addColorStop(0, rgba(accent, 0.16));
    g.addColorStop(1, rgba(accent, 0.03));
    ctx.fillStyle = g;
    ctx.fillRect(x0, BOARD_TOP, w, ROWS_VISIBLE * CELL);
    // 上下括號
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, BOARD_TOP - 12); ctx.lineTo(x0 + 2, BOARD_TOP - 5);
    ctx.lineTo(x1 - 2, BOARD_TOP - 5); ctx.lineTo(x1 - 2, BOARD_TOP - 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x0 + 2, BOARD_BOTTOM + 12); ctx.lineTo(x0 + 2, BOARD_BOTTOM + 5);
    ctx.lineTo(x1 - 2, BOARD_BOTTOM + 5); ctx.lineTo(x1 - 2, BOARD_BOTTOM + 12);
    ctx.stroke();
    chip(ctx, '本階計入這半邊', x0 + w / 2, BOARD_BOTTOM + 22, 11, P.ink, accent, 8, 'center');
    ctx.restore();
  }

  /* ---------------- 延伸關卡獎勵指示 ---------------- */
  function rewardIcon(ctx, kind, cx, cy, s) {
    ctx.save();
    if (kind === 'supply') {
      for (var i = 0; i < 3; i++) {
        drawGravityBall(ctx, { px: cx - s * 0.75 + i * s * 0.5, py: cy - s * 0.25, size: s * 0.5, time: i });
      }
    } else if (kind === 'multiplier') {
      ctx.strokeStyle = P.bonus; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.35, cy - s * 0.35); ctx.lineTo(cx + s * 0.35, cy + s * 0.35);
      ctx.moveTo(cx + s * 0.35, cy - s * 0.35); ctx.lineTo(cx - s * 0.35, cy + s * 0.35);
      ctx.stroke();
    } else {
      // 削頂: 上方一排被切掉的格位 + 整體下沉箭頭
      ctx.strokeStyle = P.shave; ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(cx - s * 0.5, cy - s * 0.55, s, s * 0.32);
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(P.shave, 0.9);
      for (var k = 0; k < 3; k++) ctx.fillRect(cx - s * 0.5 + k * s * 0.36, cy - s * 0.08, s * 0.26, s * 0.4);
      ctx.fillStyle = P.shave;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.72, cy - s * 0.2); ctx.lineTo(cx + s * 0.72, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.9, cy + s * 0.1); ctx.lineTo(cx + s * 0.62, cy + s * 0.45);
      ctx.lineTo(cx + s * 0.34, cy + s * 0.1); ctx.lineTo(cx + s * 0.52, cy + s * 0.1);
      ctx.lineTo(cx + s * 0.52, cy - s * 0.2);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawExtendReward(ctx, state) {
    state = state || {};
    var kind = state.kind || 'shave';
    var span = boardSpanX(state);
    var t = clamp01(num(state.t, 0));
    var label = kind === 'supply' ? '重力球補給' : (kind === 'multiplier' ? '分數倍率' : '削頂');
    var detail = kind === 'supply'
      ? '接下來 ' + num(state.value, 4) + ' 塊必含重力球'
      : (kind === 'multiplier' ? '永久 +' + num(state.value, 0.25).toFixed(2) : '全盤每欄各削 ' + num(state.value, 3) + ' 格');
    var w = 260, h = 118;
    var x = span.cx - w / 2, y = BOARD_TOP + 150;
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.min(1, t * 6);
    fillRR(ctx, x, y, w, h, 12, rgba(P.ink, 0.95));
    strokeRR(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12, P.bonus, 2);
    text(ctx, '延伸關卡 第 ' + num(state.stage, 1) + ' 階達成', x + w / 2, y + 20, 12, P.textDim, 'center', '700');
    rewardIcon(ctx, kind, x + 46, y + 66, 40);
    text(ctx, label, x + 86, y + 54, 19, P.bonus, 'left', '700');
    text(ctx, detail, x + 86, y + 80, 12, P.text, 'left', '500');
    ctx.restore();
  }

  /* ---------------- 重力球補給剩餘 ---------------- */
  function drawBallSupply(ctx, state) {
    state = state || {};
    var box = { x: PANEL_R.x + 16, y: PANEL_R.y + 342, w: PANEL_R.w - 32, h: 66 };
    ctx.save();
    if (!state.remain) {
      strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, rgba(P.panelEdge, 0.6), 1);
      text(ctx, '重力球補給 · 無', box.x + 12, box.y + box.h / 2, 12, P.textFaint, 'left', '500');
      ctx.restore();
      return;
    }
    fillRR(ctx, box.x, box.y, box.w, box.h, 10, rgba(P.ballGlow, 0.16));
    strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, P.ballRing, 1.5);
    text(ctx, '重力球補給', box.x + 12, box.y + 18, 12, P.ballRing, 'left', '700');
    text(ctx, '剩餘 ' + num(state.remain, 0) + ' 塊', box.x + 12, box.y + 44, 18, P.text, 'left', '700');
    var n = Math.min(6, num(state.remain, 0));
    for (var i = 0; i < n; i++) {
      drawGravityBall(ctx, { px: box.x + box.w - 24 - i * 22, py: box.y + 30, size: 20, time: i * 0.7 });
    }
    ctx.restore();
  }

  /* ---------------- 延展事件(含削除指示與滿寬完成獎勵) ---------------- */
  function drawExpandEvent(ctx, state) {
    state = state || {};
    var isLeft = state.side !== 'right';
    var accent = isLeft ? P.sideL : P.sideR;
    var span = boardSpanX(state);
    var t = clamp01(num(state.t, 0));
    ctx.save();

    // 新開的那一欄
    if (typeof state.newCol === 'number') {
      var nx = colX(state.newCol);
      ctx.fillStyle = rgba(accent, 0.18 + 0.12 * Math.sin(t * Math.PI));
      ctx.fillRect(nx, BOARD_TOP, CELL, ROWS_VISIBLE * CELL);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.strokeRect(nx + 1, BOARD_TOP + 1, CELL - 2, ROWS_VISIBLE * CELL - 2);
      ctx.setLineDash([]);
      // 向外的箭頭
      ctx.fillStyle = accent;
      var ax = nx + CELL / 2, ay = (BOARD_TOP + BOARD_BOTTOM) / 2, dir = isLeft ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 10, ay); ctx.lineTo(ax - dir * 6, ay - 7); ctx.lineTo(ax - dir * 6, ay + 7);
      ctx.closePath(); ctx.fill();
    }

    // 每一欄被削掉幾格
    var per = state.perColumn || [];
    for (var i = 0; i < per.length; i++) {
      var cx = colX(per[i].col) + CELL / 2;
      chip(ctx, '−' + num(per[i].count, 0), cx, BOARD_BOTTOM + 24, 10, P.ink, P.shave, 5, 'center');
    }

    var label = (isLeft ? '左側' : '右側') + '延展 +1 欄 · 削頂 K=' + num(state.k, 1) + ' · 共削 ' + num(state.shavedTotal, 0) + ' 格';
    bannerOverBoard(ctx, label, span, accent, 'bar', t);

    if (state.fullWidth) {
      var w = 240, h = 56, x = span.cx - w / 2, y = BOARD_TOP + 90;
      fillRR(ctx, x, y, w, h, 10, rgba(P.ink, 0.95));
      strokeRR(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10, P.bonus, 2);
      text(ctx, '滿寬 10 欄達成', x + w / 2, y + 20, 12, P.textDim, 'center', '700');
      text(ctx, '+1,500 分', x + w / 2, y + 40, 18, P.bonus, 'center', '700');
    }
    ctx.restore();
  }

  /* ---------------- 目標色改選介面(盤面不遮蔽, 一律畫在該側的資訊欄) ---------------- */
  function drawRecolor(ctx, state) {
    state = state || {};
    if (!state.open) return;
    var isLeft = state.side !== 'right';
    var accent = isLeft ? P.sideL : P.sideR;
    var base = isLeft ? PANEL_L : PANEL_R;
    var box = { x: base.x + 16, y: base.y + 330, w: base.w - 32, h: 160 };
    var cand = state.candidates || ['A', 'B'];
    ctx.save();
    fillRR(ctx, box.x, box.y, box.w, box.h, 10, rgba(P.ink, 0.95));
    strokeRR(ctx, box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1, 10, accent, 2);
    text(ctx, (isLeft ? '左側' : '右側') + '目標色改選', box.x + 12, box.y + 18, 13, accent, 'left', '700');

    var sw = 58, gap = 26;
    var totalW = sw * 2 + gap, ox = box.x + (box.w - totalW) / 2, oy = box.y + 40;
    for (var i = 0; i < 2; i++) {
      var cx = ox + i * (sw + gap);
      var chosen = state.chosen === i;
      slimeBody(ctx, cx, oy, sw, cand[i], chosen || state.chosen == null ? 1 : 0.35);
      if (chosen) strokeRR(ctx, cx - 3.5, oy - 3.5, sw + 7, sw + 7, 16, P.bonus, 3);
      text(ctx, i === 0 ? '← / A' : '→ / D', cx + sw / 2, oy + sw + 14, 11, P.textDim, 'center', '700');
    }
    // 倒數環
    var rem = clamp01(num(state.remain, 3) / 3);
    var bx = box.x + 12, by = box.y + box.h - 22, bw = box.w - 24;
    fillRR(ctx, bx, by, bw, 6, 3, rgba('#ffffff', 0.12));
    fillRR(ctx, bx, by, bw * rem, 6, 3, rem < 0.34 ? P.danger : accent);
    if (state.chosen != null) {
      chip(ctx, state.byTimeout ? '逾時隨機' : '已選定', box.x + box.w / 2, box.y + box.h - 44,
        12, P.ink, state.byTimeout ? P.textDim : P.bonus, 9, 'center');
    } else {
      text(ctx, '3.0 秒內選一色(t 凍結)', box.x + box.w / 2, box.y + box.h - 44, 11, P.textDim, 'center', '500');
    }
    ctx.restore();
  }

  /* ---------------- HUD(分數 / 倍率 / 時間 / 最佳 / 遊戲狀態) ---------------- */
  var STATE_LABEL = {
    playing: ['進行中', P.textDim],
    resolving: ['結算中', P.gravSmall],
    gravity: ['重力事件中', P.ballRing],
    recolor: ['目標色改選中', P.bonus],
    paused: ['暫停', P.danger],
    over: ['結束', P.danger]
  };

  function drawHud(ctx, state) {
    state = state || {};
    ctx.save();
    var y0 = HEADER.y, cy = y0 + HEADER.h / 2;

    text(ctx, '分數', HEADER.x + 24, y0 + 20, 12, P.textDim, 'left', '500');
    text(ctx, String(num(state.score, 0)), HEADER.x + 24, y0 + 46, 30, P.text, 'left', '700');

    var mx = HEADER.x + 200;
    text(ctx, '分數倍率', mx, y0 + 20, 12, P.textDim, 'left', '500');
    text(ctx, '×' + num(state.multiplier, 1).toFixed(2), mx, y0 + 47, 20, P.bonus, 'left', '700');

    var t = num(state.time, 0);
    var mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    text(ctx, '經過時間', CANVAS_W / 2, y0 + 20, 12, P.textDim, 'center', '500');
    text(ctx, mm + ':' + (ss < 10 ? '0' : '') + ss, CANVAS_W / 2, y0 + 47, 22, P.text, 'center', '700');

    var rx = HEADER.x + HEADER.w - 24;
    text(ctx, '最佳紀錄', rx, y0 + 20, 12, P.textDim, 'right', '500');
    text(ctx, state.best == null ? '尚無紀錄' : String(state.best), rx, y0 + 47, 20, P.textDim, 'right', '700');

    var sl = STATE_LABEL[state.phase] || STATE_LABEL.playing;
    chip(ctx, sl[0], CANVAS_W / 2 + 190, cy, 12, P.ink, sl[1], 9, 'center');

    // 盤面寬度讀數
    if (state.minCol != null && state.maxCol != null) {
      var wcols = state.maxCol - state.minCol + 1;
      var lcols = Math.max(0, Math.min(2, state.maxCol) - state.minCol + 1);
      chip(ctx, '寬 ' + wcols + ' 欄 · ' + lcols + '|' + (wcols - lcols), CANVAS_W / 2 - 190, cy,
        12, P.ink, P.textDim, 9, 'center');
    }
    ctx.restore();
  }

  /* ---------------- 暫停遮罩(盤面與所有情報區皆須不可讀) ---------------- */
  function drawPauseOverlay(ctx, state) {
    state = state || {};
    ctx.save();
    ctx.fillStyle = rgba(P.bgDeep, 0.82);
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    var regions = [PANEL_L, PANEL_R, HEADER,
      { x: colX(COL_MIN_ABS) - 8, y: BOARD_TOP - 8, w: (COL_MAX_ABS - COL_MIN_ABS + 1) * CELL + 16, h: ROWS_VISIBLE * CELL + 16 }];
    for (var i = 0; i < regions.length; i++) {
      var r = regions[i];
      fillRR(ctx, r.x, r.y, r.w, r.h, 12, rgba(P.panel, 0.99));
      ctx.save();
      rrPath(ctx, r.x, r.y, r.w, r.h, 12); ctx.clip();
      hatch(ctx, r.x, r.y, r.w, r.h, 45, 12, rgba(P.textFaint, 0.28), 2);
      ctx.restore();
      strokeRR(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 12, P.panelEdge, 1);
    }
    text(ctx, '暫停', CANVAS_W / 2, CANVAS_H / 2 - 16, 40, P.text, 'center', '700');
    text(ctx, 'Esc 恢復 · 盤面與所有情報全部遮蔽', CANVAS_W / 2, CANVAS_H / 2 + 22, 14, P.textDim, 'center', '500');
    ctx.restore();
  }

  /* ---------------- 放棄本局計時 ---------------- */
  function drawAbandonGauge(ctx, state) {
    state = state || {};
    if (!state.active) return;
    var w = 220, h = 46, x = PANEL_L.x + 16, y = CANVAS_H - h - 8;
    var p = clamp01(num(state.progress, 0));
    ctx.save();
    fillRR(ctx, x, y, w, h, 8, rgba(P.ink, 0.95));
    strokeRR(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8, P.danger, 2);
    text(ctx, '放棄本局 · 長按 R', x + 12, y + 16, 12, P.danger, 'left', '700');
    fillRR(ctx, x + 12, y + 30, w - 24, 6, 3, rgba('#ffffff', 0.15));
    fillRR(ctx, x + 12, y + 30, (w - 24) * p, 6, 3, P.danger);
    ctx.restore();
  }

  /* ---------------- 結束資訊 ---------------- */
  function drawGameOver(ctx, state) {
    state = state || {};
    var w = 380, h = 300, x = CANVAS_W / 2 - w / 2, y = CANVAS_H / 2 - h / 2;
    ctx.save();
    ctx.fillStyle = rgba(P.bgDeep, 0.78);
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    fillRR(ctx, x, y, w, h, 14, P.panel);
    strokeRR(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14, state.isBest ? P.bonus : P.panelEdge, 2);
    text(ctx, '本局結束', x + w / 2, y + 34, 22, P.text, 'center', '700');
    text(ctx, state.reason || '—', x + w / 2, y + 60, 13, P.danger, 'center', '700');

    var rows = [
      ['分數', String(num(state.score, 0))],
      ['存活秒數', num(state.seconds, 0).toFixed(1) + ' 秒'],
      ['已解鎖欄數', String(num(state.unlocked, 0))],
      ['延伸關卡階數', state.stage == null ? '未進入' : ('第 ' + state.stage + ' 階')],
      ['最終倍率', '×' + num(state.multiplier, 1).toFixed(2)]
    ];
    for (var i = 0; i < rows.length; i++) {
      var ry = y + 96 + i * 30;
      text(ctx, rows[i][0], x + 28, ry, 13, P.textDim, 'left', '500');
      text(ctx, rows[i][1], x + w - 28, ry, 15, P.text, 'right', '700');
    }
    if (state.isBest) chip(ctx, '新紀錄', x + w / 2, y + h - 56, 13, P.ink, P.bonus, 10, 'center');
    text(ctx, 'R 或點此重開一局', x + w / 2, y + h - 24, 13, P.textDim, 'center', '700');
    ctx.restore();
  }

  /* ---------------- 匯出 ---------------- */
  window.Art = {
    canvas: { width: CANVAS_W, height: CANVAS_H },
    metrics: {
      cell: CELL, rowsVisible: ROWS_VISIBLE, midX: MID_X,
      boardTop: BOARD_TOP, boardBottom: BOARD_BOTTOM,
      colMinAbs: COL_MIN_ABS, colMaxAbs: COL_MAX_ABS,
      panelLeft: PANEL_L, panelRight: PANEL_R, header: HEADER
    },
    colX: colX,
    rowTop: rowTop,
    palette: {
      bg: P.bg, panel: P.panel, board: P.boardBg, boardCell: P.boardCell, boardEdge: P.boardEdge,
      colorA: P.colorA, colorB: P.colorB, colorC: P.colorC,
      ball: P.ballRing, ballCore: P.ballCore, ballGlow: P.ballGlow,
      midline: P.mid, floating: P.float,
      sideLeft: P.sideL, sideRight: P.sideR,
      gravitySmall: P.gravSmall, gravityLarge: P.gravLarge, gravityIdle: P.gravIdle,
      extraClear: P.extra, shave: P.shave, bonus: P.bonus, danger: P.danger,
      text: P.text, textDim: P.textDim
    },
    drawBackground: drawBackground,
    drawBoard: drawBoard,
    drawCenterLine: drawCenterLine,
    drawCell: drawCell,
    drawGravityBall: drawGravityBall,
    drawClusterCount: drawClusterCount,
    drawFloatingStructures: drawFloatingStructures,
    drawGravityEvent: drawGravityEvent,
    drawClearResult: drawClearResult,
    drawExtraClear: drawExtraClear,
    drawPiece: drawPiece,
    drawGhost: drawGhost,
    drawNextPreview: drawNextPreview,
    drawSidePanel: drawSidePanel,
    drawExtendPanel: drawExtendPanel,
    drawExtendSideMarker: drawExtendSideMarker,
    drawExtendReward: drawExtendReward,
    drawBallSupply: drawBallSupply,
    drawExpandEvent: drawExpandEvent,
    drawRecolor: drawRecolor,
    drawHud: drawHud,
    drawPauseOverlay: drawPauseOverlay,
    drawAbandonGauge: drawAbandonGauge,
    drawGameOver: drawGameOver
  };
})();
