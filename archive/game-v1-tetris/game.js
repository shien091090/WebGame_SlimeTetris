/* Slime Tetris - Demo game logic.
 * Pure vanilla JS, no modules, no dependencies. Rendering is delegated
 * entirely to window.Art (see art/art.js + art/style.md).
 * 座標約定與 Art 一致: 欄 col 自左起 1~w; 列 row 自底部起 1~16, 另有
 * row 17/18 為不可見緩衝列。
 */
(function () {
  'use strict';

  /* Placeholder 幾何(目前規格物件皆已由 Art 涵蓋, 無需佔位圖形)。
   * 保留空物件以符合專案慣例, 供未來規格新增物件時使用。 */
  var Placeholder = {};

  /* ---------------------------------------------------------------
   * 常數
   * ------------------------------------------------------------- */
  var CELL = Art.layout.cell;         // 32
  var ROWS = Art.layout.rows;         // 16
  var BUFFER = 2;
  var MAX_ROW = ROWS + BUFFER;        // 18
  var MIN_W = 6;
  var MAX_W = Art.layout.maxCols;     // 10
  var COLORS = ['A', 'B', 'C'];

  var CLEAR_BASE = { 1: 100, 2: 300, 3: 500, 4: 800 };
  var UNMAXED_RATE = 50;
  var MAXED_RATE = 80;
  var DAS = 0.15;
  var ARR = 0.04;
  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 3;
  var ABANDON_HOLD = 1.0; // seconds, real wall-clock

  var SHAPES = {
    I: { N: 4, cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }] },
    O: { N: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    T: { N: 3, cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    S: { N: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    Z: { N: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    J: { N: 3, cells: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    L: { N: 3, cells: [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }] }
  };
  var SHAPE_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  var STORAGE_BEST = 'slimeTetris.best.v1';
  var STORAGE_GAMES = 'slimeTetris.games.v1';

  /* ---------------------------------------------------------------
   * 小工具
   * ------------------------------------------------------------- */
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function loadBest() {
    try {
      var v = window.localStorage.getItem(STORAGE_BEST);
      return v === null ? null : Number(v);
    } catch (e) { return null; }
  }
  function saveBest(v) {
    try { window.localStorage.setItem(STORAGE_BEST, String(v)); } catch (e) { /* ignore */ }
  }
  function nextGameIndex() {
    var n = 1;
    try {
      var v = window.localStorage.getItem(STORAGE_GAMES);
      n = (v === null ? 0 : Number(v)) + 1;
      window.localStorage.setItem(STORAGE_GAMES, String(n));
    } catch (e) { /* ignore, keep n=1 style counting per-session */ }
    return n;
  }

  /* ---------------------------------------------------------------
   * 顏色 / 形狀 bag
   * ------------------------------------------------------------- */
  function makeBags() {
    var colorQueue = [];
    var shapeQueue = [];
    return {
      nextColor: function () {
        if (colorQueue.length === 0) {
          var fresh = [];
          for (var i = 0; i < COLORS.length; i++) {
            for (var k = 0; k < 8; k++) { fresh.push(COLORS[i]); }
          }
          colorQueue = shuffle(fresh);
        }
        return colorQueue.shift();
      },
      nextShape: function () {
        if (shapeQueue.length === 0) {
          shapeQueue = shuffle(SHAPE_KEYS.slice());
        }
        return shapeQueue.shift();
      }
    };
  }

  /* ---------------------------------------------------------------
   * 盤面 (col-major 動態高度陣列, index0 = row1)
   * ------------------------------------------------------------- */
  function makeBoard(width) {
    var cols = [];
    for (var i = 0; i < width; i++) { cols.push([]); }
    return { width: width, cols: cols };
  }

  function getCell(board, col, row) {
    if (col < 1 || col > board.width || row < 1) { return null; }
    var arr = board.cols[col - 1];
    if (!arr || row - 1 >= arr.length) { return null; }
    return arr[row - 1];
  }

  function setCell(board, col, row, val) {
    var arr = board.cols[col - 1];
    while (arr.length < row) { arr.push(null); }
    arr[row - 1] = val;
  }

  function trimColumn(board, colIdx) {
    var arr = board.cols[colIdx];
    while (arr.length > 0 && arr[arr.length - 1] === null) { arr.pop(); }
  }

  function heightOf(board, col) {
    var arr = board.cols[col - 1];
    return arr ? arr.length : 0;
  }

  function cellBlocked(board, col, row) {
    if (col < 1 || col > board.width) { return true; }
    if (row < 1 || row > MAX_ROW) { return true; }
    return !!getCell(board, col, row);
  }

  /* ---------------------------------------------------------------
   * 方塊
   * ------------------------------------------------------------- */
  function spawnPiece(board, spec) {
    var shape = SHAPES[spec.shapeKey];
    var N = shape.N;
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y }; });
    var leftCol = Math.floor((board.width - N) / 2) + 1;
    return {
      shapeKey: spec.shapeKey,
      N: N,
      localCells: localCells,
      colors: spec.colors.slice(),
      anchorCol: leftCol,
      anchorRow: MAX_ROW,
      phase: 'falling',
      lockTimer: 0,
      resetCount: 0,
      dropAccum: 0,
      rotationIndex: 0
    };
  }

  function pieceCells(piece, anchorCol, anchorRow, localCells) {
    var lc = localCells || piece.localCells;
    var ac = anchorCol === undefined ? piece.anchorCol : anchorCol;
    var ar = anchorRow === undefined ? piece.anchorRow : anchorRow;
    var out = [];
    for (var i = 0; i < lc.length; i++) {
      out.push({ col: ac + lc[i].x, row: ar - lc[i].y, color: piece.colors[i] });
    }
    return out;
  }

  function canPlace(board, cells) {
    for (var i = 0; i < cells.length; i++) {
      if (cellBlocked(board, cells[i].col, cells[i].row)) { return false; }
    }
    return true;
  }

  function canMoveDown(board, piece) {
    var cells = pieceCells(piece, piece.anchorCol, piece.anchorRow - 1);
    return canPlace(board, cells);
  }

  /* =================================================================
   * 遊戲主體
   * ================================================================= */
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');

  function setupCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Art.canvas.width * dpr;
    canvas.height = Art.canvas.height * dpr;
    canvas.style.width = Art.canvas.width + 'px';
    canvas.style.height = Art.canvas.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  setupCanvas();
  window.addEventListener('resize', setupCanvas);

  var G = null; // 目前對局狀態(見 newGame)

  function needsFor(isExpensive) { return isExpensive ? [10, 20] : [6, 15]; }

  function pickInitialColors() {
    var left = COLORS[Math.floor(Math.random() * COLORS.length)];
    var rest = COLORS.filter(function (c) { return c !== left; });
    var right = rest[Math.floor(Math.random() * rest.length)];
    return { left: left, right: right };
  }

  function rerollColor(exclude) {
    var options = COLORS.filter(function (c) { return c !== exclude; });
    return options[Math.floor(Math.random() * options.length)];
  }

  function newGame() {
    var bags = makeBags();
    var expensiveSide = Math.random() < 0.5 ? 'left' : 'right';
    var initColors = pickInitialColors();

    var left = {
      side: 'left',
      expensive: expensiveSide === 'left',
      stage: 1,
      points: 0,
      needs: needsFor(expensiveSide === 'left'),
      need: needsFor(expensiveSide === 'left')[0],
      unlockedCols: 0,
      overflow: undefined,
      targetColor: initColors.left,
      frozen: false
    };
    var right = {
      side: 'right',
      expensive: expensiveSide === 'right',
      stage: 1,
      points: 0,
      needs: needsFor(expensiveSide === 'right'),
      need: needsFor(expensiveSide === 'right')[0],
      unlockedCols: 0,
      overflow: undefined,
      targetColor: initColors.right,
      frozen: false
    };

    var board = makeBoard(MIN_W);

    var g = {
      status: 'playing', // 'playing' | 'paused' | 'over'
      board: board,
      bags: bags,
      left: left,
      right: right,
      t: 0,
      score: 0,
      best: loadBest(),
      gameIndex: nextGameIndex(),
      pauseCount: 0,
      pauseSeconds: 0,
      dropAccum: 0,
      softDropHeld: false,
      inputSource: null, // 'keyboard' | 'mouse'
      keyLeftHeld: false,
      keyRightHeld: false,
      lastMouseX: null,
      hasMouse: false,
      hDir: 0,
      hDasTimer: 0,
      hArrTimer: 0,
      rHoldStart: null,
      abandonProgress: 0,
      segmentMarks: [],   // {row,col,length,side,color,points,alpha}
      expandHints: [],    // {side,alpha,timer}
      rerollHints: [],    // {side,color,alpha,timer}
      lockFlash: null,    // {cells,boardWidth,timer}
      result: null,       // 結束時填入 drawResultPanel 用資料
      telemetry: {
        totalPieces: 0,
        totalClears: 0,
        totalClearedCells: 0,
        lockSamples: [],
        clearSamples: [],
        leftStageTimes: [],
        rightStageTimes: []
      },
      current: null,
      next: null
    };

    g.current = spawnPiece(board, { shapeKey: bags.nextShape(), colors: [bags.nextColor(), bags.nextColor(), bags.nextColor(), bags.nextColor()] });
    g.next = { shapeKey: bags.nextShape(), colors: [bags.nextColor(), bags.nextColor(), bags.nextColor(), bags.nextColor()] };

    console.log('[SlimeTetris] 新局開始 #' + g.gameIndex + ' 昂貴側=' + expensiveSide);
    return g;
  }

  /* ---------------------------------------------------------------
   * 相鄰對 / 段落 計算 (埋點與結算共用)
   * ------------------------------------------------------------- */
  function countAdjPairs(board, colorFilter) {
    var count = 0;
    for (var r = 1; r <= ROWS; r++) {
      for (var c = 1; c < board.width; c++) {
        var a = getCell(board, c, r);
        var b = getCell(board, c + 1, r);
        if (a && b && a.kind === 'filled' && b.kind === 'filled' && a.color === b.color) {
          if (!colorFilter || a.color === colorFilter) { count++; }
        }
      }
    }
    return count;
  }

  function rowSegments(board, row) {
    var segs = [];
    var c = 1;
    while (c <= board.width) {
      var cell = getCell(board, c, row);
      if (cell && cell.kind === 'filled') {
        var start = c, color = cell.color, end = c;
        while (end + 1 <= board.width) {
          var nxt = getCell(board, end + 1, row);
          if (nxt && nxt.kind === 'filled' && nxt.color === color) { end++; } else { break; }
        }
        var len = end - start + 1;
        if (len >= 2) { segs.push({ col: start, length: len, color: color }); }
        c = end + 1;
      } else {
        c++;
      }
    }
    return segs;
  }

  function isRowFull(board, row) {
    for (var c = 1; c <= board.width; c++) {
      if (!getCell(board, c, row)) { return false; }
    }
    return true;
  }

  /* ---------------------------------------------------------------
   * 延展
   * ------------------------------------------------------------- */
  function sideColumnRange(width, side) {
    var leftEnd = Math.ceil(width / 2);
    var rightStart = Math.floor(width / 2) + 1;
    if (side === 'left') { return { from: 1, to: leftEnd }; }
    return { from: rightStart, to: width };
  }

  function baseHeightFor(board, side) {
    var range = sideColumnRange(board.width, side);
    var min = Infinity;
    for (var c = range.from; c <= range.to; c++) {
      var h = heightOf(board, c);
      if (h < min) { min = h; }
    }
    if (min === Infinity) { min = 0; }
    return min;
  }

  function expandBoard(board, side) {
    var baseHeight = baseHeightFor(board, side);
    var col = [];
    for (var r = 1; r <= baseHeight; r++) { col.push({ kind: 'inert', color: null }); }
    if (side === 'left') {
      board.cols.unshift(col);
    } else {
      board.cols.push(col);
    }
    board.width += 1;
  }

  /* ---------------------------------------------------------------
   * 鎖定與結算時序
   * ------------------------------------------------------------- */
  function pushSegmentMark(g, mark) {
    mark.alpha = 1;
    mark.timer = 0.6;
    g.segmentMarks.push(mark);
  }
  function pushExpandHint(g, side) {
    g.expandHints.push({ side: side, alpha: 1, timer: 1.6 });
  }
  function pushRerollHint(g, side, color) {
    g.rerollHints.push({ side: side, color: color, alpha: 1, timer: 1.8 });
  }

  function lockPiece(g) {
    var board = g.board;
    var piece = g.current;
    var lockedCells = pieceCells(piece);

    // 結算時序 步驟1: 鎖定埋點取樣
    var beforeLeftAdj = countAdjPairs(board, g.left.targetColor);
    var beforeRightAdj = countAdjPairs(board, g.right.targetColor);
    var beforeAllAdj = countAdjPairs(board, null);

    for (var i = 0; i < lockedCells.length; i++) {
      setCell(board, lockedCells[i].col, lockedCells[i].row, { kind: 'filled', color: lockedCells[i].color });
    }
    for (i = 0; i < lockedCells.length; i++) { trimColumn(board, lockedCells[i].col - 1); }

    var afterLeftAdj = countAdjPairs(board, g.left.targetColor);
    var afterRightAdj = countAdjPairs(board, g.right.targetColor);
    var afterAllAdj = countAdjPairs(board, null);

    g.telemetry.totalPieces++;
    g.telemetry.lockSamples.push({
      boardWidth: board.width,
      seconds: g.t,
      minCol: Math.min.apply(null, lockedCells.map(function (c) { return c.col; })),
      rotationIndex: piece.rotationIndex,
      colors: piece.colors.slice(),
      leftAdjBefore: beforeLeftAdj, leftAdjAfter: afterLeftAdj, leftAdjDelta: afterLeftAdj - beforeLeftAdj,
      rightAdjBefore: beforeRightAdj, rightAdjAfter: afterRightAdj, rightAdjDelta: afterRightAdj - beforeRightAdj,
      allAdjBefore: beforeAllAdj, allAdjAfter: afterAllAdj, allAdjDelta: afterAllAdj - beforeAllAdj
    });

    g.lockFlash = { cells: lockedCells, timer: 0.12 };

    var lockoutTriggered = lockedCells.every(function (c) { return c.row > ROWS; });

    // 結算時序 步驟2: 判定成立列
    var clearedRows = [];
    for (var r = 1; r <= ROWS; r++) { if (isRowFull(board, r)) { clearedRows.push(r); } }

    if (clearedRows.length > 0) {
      var unlockedAtStart = g.left.unlockedCols + g.right.unlockedCols;
      var multiplier = 1 + 0.25 * unlockedAtStart;
      var baseClear = CLEAR_BASE[clearedRows.length] || 0;
      var leftPtsEarned = 0, rightPtsEarned = 0;

      for (var ri = 0; ri < clearedRows.length; ri++) {
        var row = clearedRows[ri];
        var segs = rowSegments(board, row);
        for (var si = 0; si < segs.length; si++) {
          var seg = segs[si];
          var side = null, pts = 0;
          if (seg.color === g.left.targetColor) { side = 'left'; pts = seg.length - 1; leftPtsEarned += pts; }
          else if (seg.color === g.right.targetColor) { side = 'right'; pts = seg.length - 1; rightPtsEarned += pts; }
          g.telemetry.clearSamples.push({
            row: row, length: seg.length, color: seg.color, side: side, points: pts,
            boardWidth: board.width, seconds: g.t
          });
          if (side) { pushSegmentMark(g, { row: row, col: seg.col, length: seg.length, side: side, color: seg.color, points: pts }); }
        }
      }

      var leftRate = g.left.stage === 'max' ? MAXED_RATE : UNMAXED_RATE;
      var rightRate = g.right.stage === 'max' ? MAXED_RATE : UNMAXED_RATE;
      var scoreAdd = Math.round((baseClear + leftPtsEarned * leftRate + rightPtsEarned * rightRate) * multiplier);
      g.score += scoreAdd;

      if (g.left.stage !== 'max') { g.left.points += leftPtsEarned; }
      if (g.right.stage !== 'max') { g.right.points += rightPtsEarned; }

      g.telemetry.totalClears += clearedRows.length;
      g.telemetry.totalClearedCells += clearedRows.length * board.width;

      // 結算時序 步驟4: 清除成立列, 上方下落
      var clearedSet = {};
      for (ri = 0; ri < clearedRows.length; ri++) { clearedSet[clearedRows[ri]] = true; }
      for (var ci = 0; ci < board.cols.length; ci++) {
        var col = board.cols[ci];
        var newCol = [];
        for (var idx = 0; idx < col.length; idx++) {
          var rowNum = idx + 1;
          if (!clearedSet[rowNum]) { newCol.push(col[idx]); }
        }
        board.cols[ci] = newCol;
        trimColumn(board, ci);
      }

      // 結算時序 步驟5/6: 依序左右檢查解鎖並延展 (每側最多1欄)
      var expandedSides = [];
      ['left', 'right'].forEach(function (sideName) {
        var side = g[sideName];
        if (side.stage !== 'max' && side.points >= side.need) {
          side.points -= side.need;
          if (side.stage === 1) {
            side.stage = 2;
            side.need = side.needs[1];
            side.overflow = side.points > 0 ? side.points : undefined;
          } else {
            side.stage = 'max';
            side.need = undefined;
            side.overflow = undefined;
            side.frozen = true;
          }
          side.unlockedCols += 1;
          expandBoard(board, sideName);
          if (sideName === 'left') {
            // 左側延展會讓既有欄位編號整體 +1, 已建立的視覺標記需一併平移
            g.segmentMarks.forEach(function (m) { m.col += 1; });
            if (g.lockFlash) { g.lockFlash.cells.forEach(function (c) { c.col += 1; }); }
          }
          expandedSides.push(sideName);
          pushExpandHint(g, sideName);
          g.telemetry[sideName + 'StageTimes'].push(g.t);
        }
      });

      // 結算時序 步驟7: 對本次延展側重抽目標色 (先左後右)
      if (expandedSides.indexOf('left') !== -1) {
        g.left.targetColor = rerollColor(g.right.targetColor);
        pushRerollHint(g, 'left', g.left.targetColor);
      }
      if (expandedSides.indexOf('right') !== -1) {
        g.right.targetColor = rerollColor(g.left.targetColor);
        pushRerollHint(g, 'right', g.right.targetColor);
      }
    }

    // 結算時序 步驟8: 判定結束條件, 未結束則生成下一塊
    if (lockoutTriggered) {
      endGame(g, 'lockout');
      return;
    }

    var spec = g.next;
    var spawned = spawnPiece(board, spec);
    var spawnCells = pieceCells(spawned);
    if (!canPlace(board, spawnCells)) {
      endGame(g, 'blockout');
      return;
    }
    g.current = spawned;
    g.next = { shapeKey: g.bags.nextShape(), colors: [g.bags.nextColor(), g.bags.nextColor(), g.bags.nextColor(), g.bags.nextColor()] };
  }

  function lockResetOnSuccessfulAction(g) {
    var piece = g.current;
    if (!canMoveDown(g.board, piece)) {
      if (piece.resetCount < MAX_LOCK_RESETS) {
        piece.lockTimer = 0;
        piece.resetCount++;
      } else {
        lockPiece(g);
      }
    }
  }

  function moveHorizontal(g, dir) {
    if (g.status !== 'playing' || dir === 0) { return false; }
    var piece = g.current;
    var cells = pieceCells(piece, piece.anchorCol + dir, piece.anchorRow);
    if (!canPlace(g.board, cells)) { return false; }
    piece.anchorCol += dir;
    lockResetOnSuccessfulAction(g);
    return true;
  }

  function rotatePiece(g, dir) {
    if (g.status !== 'playing') { return false; }
    var piece = g.current;
    var N = piece.N;
    var newLocal = piece.localCells.map(function (p) {
      if (dir === 'cw') { return { x: N - 1 - p.y, y: p.x }; }
      return { x: p.y, y: N - 1 - p.x };
    });
    var offsets = [0, -1, 1];
    for (var i = 0; i < offsets.length; i++) {
      var testCol = piece.anchorCol + offsets[i];
      var cells = pieceCells(piece, testCol, piece.anchorRow, newLocal);
      if (canPlace(g.board, cells)) {
        piece.localCells = newLocal;
        piece.anchorCol = testCol;
        piece.rotationIndex = (piece.rotationIndex + (dir === 'cw' ? 1 : 3)) % 4;
        lockResetOnSuccessfulAction(g);
        return true;
      }
    }
    return false;
  }

  function computeGhostRow(g) {
    var piece = g.current;
    var row = piece.anchorRow;
    while (canPlace(g.board, pieceCells(piece, piece.anchorCol, row - 1))) { row--; }
    return row;
  }

  function hardDrop(g) {
    if (g.status !== 'playing') { return; }
    var piece = g.current;
    piece.anchorRow = computeGhostRow(g);
    lockPiece(g);
  }

  function softDropOneStep(g) {
    if (g.status !== 'playing') { return; }
    var piece = g.current;
    if (canMoveDown(g.board, piece)) {
      piece.anchorRow -= 1;
      lockResetOnSuccessfulAction(g);
    }
  }

  /* ---------------------------------------------------------------
   * 結束 / 重開
   * ------------------------------------------------------------- */
  function endGame(g, reason) {
    g.status = 'over';
    var isNewRecord = false;
    if (reason !== 'abandon') {
      if (g.best === null || g.score > g.best) {
        g.best = g.score;
        saveBest(g.score);
        isNewRecord = true;
      }
    }
    g.telemetry.endReason = reason;
    g.telemetry.endSeconds = g.t;
    g.telemetry.finalScore = g.score;
    g.telemetry.expensiveSide = g.left.expensive ? 'left' : 'right';
    g.telemetry.pauseCount = g.pauseCount;
    g.telemetry.pauseSeconds = g.pauseSeconds;
    var w = g.telemetry.totalClears > 0
      ? 1 - (g.telemetry.totalClearedCells) / (g.telemetry.totalPieces * 4)
      : null;
    g.telemetry.wasteRate = w;
    console.log('[SlimeTetris] 本局結束 #' + g.gameIndex + ' 原因=' + reason + ' 分數=' + g.score + ' 存活=' + g.t.toFixed(1) + 's');
    console.log('[SlimeTetris] 埋點摘要', g.telemetry);

    g.result = {
      visible: true,
      score: g.score,
      seconds: g.t,
      unlockedCols: g.left.unlockedCols + g.right.unlockedCols,
      reason: reason,
      isNewRecord: isNewRecord,
      best: g.best
    };
    // 放棄局與 block out / lock out 一致: 停在結算畫面, 等玩家按 R 或點重開按鈕。
    // drawResultPanel 對 reason:'abandon' 已內建「放棄局不更新最佳紀錄」文字。
  }

  function restart() {
    G = newGame();
  }

  /* ---------------------------------------------------------------
   * 輸入
   * ------------------------------------------------------------- */
  var LEFT_CODES = { ArrowLeft: 1, KeyA: 1 };
  var RIGHT_CODES = { ArrowRight: 1, KeyD: 1 };
  var SOFT_CODES = { ArrowDown: 1, KeyS: 1 };
  var CW_CODES = { ArrowUp: 1, KeyW: 1 };
  var CCW_CODES = { KeyZ: 1 };

  function setHDir(g, dir, source) {
    if (g.hDir !== dir || g.inputSource !== source) {
      g.inputSource = source;
      g.hDir = dir;
      g.hDasTimer = 0;
      g.hArrTimer = 0;
      if (dir !== 0) { moveHorizontal(g, dir); }
    }
  }

  window.addEventListener('keydown', function (e) {
    var code = e.code;
    if (code === 'Escape') {
      e.preventDefault();
      if (G.status === 'playing') { G.status = 'paused'; G.pauseCount++; }
      else if (G.status === 'paused') { G.status = 'playing'; }
      return;
    }
    if (code === 'KeyR') {
      e.preventDefault();
      if (e.repeat) { return; }
      if (G.status === 'over') { restart(); return; }
      if (G.status === 'playing' || G.status === 'paused') {
        G.rHoldStart = performance.now();
      }
      return;
    }

    if (G.status !== 'playing') {
      // 暫停期間除 Esc 與放棄長按外所有輸入無效; over 狀態下其餘輸入無效
      if (LEFT_CODES[code] || RIGHT_CODES[code] || SOFT_CODES[code] || CW_CODES[code] || CCW_CODES[code] || code === 'Space') {
        e.preventDefault();
      }
      return;
    }

    if (LEFT_CODES[code]) {
      e.preventDefault();
      if (!e.repeat) { G.keyLeftHeld = true; updateKeyboardDir(G); }
      return;
    }
    if (RIGHT_CODES[code]) {
      e.preventDefault();
      if (!e.repeat) { G.keyRightHeld = true; updateKeyboardDir(G); }
      return;
    }
    if (SOFT_CODES[code]) {
      e.preventDefault();
      G.softDropHeld = true;
      return;
    }
    if (CW_CODES[code]) {
      e.preventDefault();
      if (!e.repeat) { rotatePiece(G, 'cw'); }
      return;
    }
    if (CCW_CODES[code]) {
      e.preventDefault();
      if (!e.repeat) { rotatePiece(G, 'ccw'); }
      return;
    }
    if (code === 'Space') {
      e.preventDefault();
      if (!e.repeat) { hardDrop(G); }
      return;
    }
  });

  window.addEventListener('keyup', function (e) {
    var code = e.code;
    if (code === 'KeyR') {
      G.rHoldStart = null; // 未滿 1 秒放開則取消
      return;
    }
    if (LEFT_CODES[code]) { G.keyLeftHeld = false; if (G.inputSource === 'keyboard') { updateKeyboardDir(G); } return; }
    if (RIGHT_CODES[code]) { G.keyRightHeld = false; if (G.inputSource === 'keyboard') { updateKeyboardDir(G); } return; }
    if (SOFT_CODES[code]) { G.softDropHeld = false; return; }
  });

  function updateKeyboardDir(g) {
    var dir = 0;
    if (g.keyLeftHeld && !g.keyRightHeld) { dir = -1; }
    else if (g.keyRightHeld && !g.keyLeftHeld) { dir = 1; }
    if (dir === 0 && g.inputSource !== 'keyboard') { return; }
    setHDir(g, dir, 'keyboard');
  }

  function canvasLogicalPos(evt) {
    var rect = canvas.getBoundingClientRect();
    var sx = Art.canvas.width / rect.width;
    var sy = Art.canvas.height / rect.height;
    return { x: (evt.clientX - rect.left) * sx, y: (evt.clientY - rect.top) * sy };
  }

  canvas.addEventListener('mousemove', function (evt) {
    var pos = canvasLogicalPos(evt);
    G.lastMouseX = pos.x;
    G.hasMouse = true;
    if (G.status !== 'playing') { return; }
    G.inputSource = 'mouse';
  });

  canvas.addEventListener('mousedown', function (evt) {
    var pos = canvasLogicalPos(evt);
    if (G.status === 'over') {
      var btn = Art.layout.restartButton;
      if (pos.x >= btn.x && pos.x <= btn.x + btn.w && pos.y >= btn.y && pos.y <= btn.y + btn.h) {
        restart();
      }
      return;
    }
    if (G.status !== 'playing') { return; }
    if (evt.button === 0) { rotatePiece(G, 'cw'); }
    else if (evt.button === 2) { hardDrop(G); }
  });

  canvas.addEventListener('contextmenu', function (evt) { evt.preventDefault(); });

  canvas.addEventListener('wheel', function (evt) {
    evt.preventDefault();
    if (G.status !== 'playing') { return; }
    if (evt.deltaY > 0) { softDropOneStep(G); }
    else if (evt.deltaY < 0) { rotatePiece(G, 'ccw'); }
  }, { passive: false });

  /* ---------------------------------------------------------------
   * 固定步長更新
   * ------------------------------------------------------------- */
  var STEP = 1 / 60;

  function tickFading(list, step) {
    for (var i = list.length - 1; i >= 0; i--) {
      list[i].timer -= step;
      if (list[i].timer <= 0) {
        list.splice(i, 1);
      } else {
        list[i].alpha = Math.max(0, Math.min(1, list[i].timer / 0.6));
      }
    }
  }

  function pieceCenterCol(piece) {
    var xs = piece.localCells.map(function (p) { return p.x; });
    var minX = Math.min.apply(null, xs);
    var maxX = Math.max.apply(null, xs);
    var boxWidth = maxX - minX + 1;
    return piece.anchorCol + minX + Math.floor((boxWidth - 1) / 2);
  }

  function updateHorizontal(g, step) {
    if (g.inputSource === 'mouse' && g.hasMouse && g.lastMouseX !== null) {
      var targetCol = Art.layout.columnAtX(g.lastMouseX, g.board.width);
      var refCol = pieceCenterCol(g.current);
      var dir = 0;
      if (targetCol > refCol) { dir = 1; } else if (targetCol < refCol) { dir = -1; }
      if (dir !== g.hDir) {
        g.hDir = dir;
        g.hDasTimer = 0;
        g.hArrTimer = 0;
        if (dir !== 0) { moveHorizontal(g, dir); }
      }
    }

    if (g.hDir === 0) { g.hDasTimer = 0; g.hArrTimer = 0; return; }
    g.hDasTimer += step;
    if (g.hDasTimer >= DAS) {
      g.hArrTimer += step;
      while (g.hArrTimer >= ARR) {
        g.hArrTimer -= ARR;
        if (!moveHorizontal(g, g.hDir)) { break; }
        if (g.inputSource === 'mouse') {
          var tCol = Art.layout.columnAtX(g.lastMouseX, g.board.width);
          var rCol = pieceCenterCol(g.current);
          if (tCol === rCol) { g.hDir = 0; break; }
        }
      }
    }
  }

  function update(g, step) {
    if (g.status !== 'playing') { return; }
    g.t += step;

    updateHorizontal(g, step);

    var fallSpeed = 1.0 * Math.pow(2, g.t / 60);
    g.currentFallSpeed = fallSpeed;
    var effSpeed = g.softDropHeld ? Math.max(fallSpeed * 20, 20) : fallSpeed;
    g.dropAccum += effSpeed * step;
    var cellsToTry = Math.min(Math.floor(g.dropAccum), ROWS);
    g.dropAccum -= cellsToTry;

    var piece = g.current;
    for (var i = 0; i < cellsToTry; i++) {
      if (canMoveDown(g.board, piece)) { piece.anchorRow -= 1; } else { break; }
    }
    if (g.status !== 'playing') { return; } // 保險: 若上面途中已鎖定結束

    var grounded = !canMoveDown(g.board, piece);
    if (grounded) {
      piece.lockTimer += step;
      piece.phase = 'locking';
      if (piece.lockTimer >= LOCK_DELAY) {
        lockPiece(g);
        return;
      }
    } else {
      piece.lockTimer = 0;
      piece.resetCount = 0;
      piece.phase = g.softDropHeld ? 'softdrop' : 'falling';
    }

    tickFading(g.segmentMarks, step);
    tickFading(g.expandHints, step);
    tickFading(g.rerollHints, step);
    if (g.lockFlash) {
      g.lockFlash.timer -= step;
      if (g.lockFlash.timer <= 0) { g.lockFlash = null; }
    }
  }

  /* ---------------------------------------------------------------
   * 繪製
   * ------------------------------------------------------------- */
  function unlockProgressState(side) {
    return {
      stage: side.stage,
      points: side.points,
      need: side.need,
      unlockedCols: side.unlockedCols,
      overflow: side.overflow
    };
  }

  function draw(g) {
    Art.drawBackground(ctx);
    Art.drawBoardFrame(ctx, { width: g.board.width });

    for (var r = 1; r <= ROWS; r++) {
      for (var c = 1; c <= g.board.width; c++) {
        var cell = getCell(g.board, c, r);
        if (!cell) { continue; }
        Art.drawCell(ctx, { col: c, row: r, boardWidth: g.board.width, kind: cell.kind, color: cell.color });
      }
    }

    if (g.status === 'playing' && g.current) {
      var ghostRow = computeGhostRow(g);
      Art.drawGhost(ctx, { cells: pieceCells(g.current, g.current.anchorCol, ghostRow), boardWidth: g.board.width });
    }

    if (g.lockFlash) {
      Art.drawFallingPiece(ctx, { cells: g.lockFlash.cells, boardWidth: g.board.width, phase: 'locked' });
    }

    if (g.status !== 'over' && g.current) {
      Art.drawFallingPiece(ctx, {
        cells: pieceCells(g.current),
        boardWidth: g.board.width,
        phase: g.current.phase || 'falling',
        lockProgress: g.current.lockTimer !== undefined ? Math.min(1, g.current.lockTimer / LOCK_DELAY) : 0
      });
    }

    g.segmentMarks.forEach(function (m) {
      Art.drawSegmentMarks(ctx, { boardWidth: g.board.width, alpha: m.alpha, marks: [m] });
    });

    g.expandHints.forEach(function (h) {
      Art.drawExpandHint(ctx, { side: h.side, boardWidth: g.board.width, alpha: h.alpha });
    });
    g.rerollHints.forEach(function (h) {
      Art.drawRerollHint(ctx, { side: h.side, color: h.color, alpha: h.alpha });
    });

    var hidden = g.status === 'paused';
    Art.drawLeftTargetColor(ctx, { color: g.left.targetColor, hidden: hidden, frozen: g.left.stage === 'max' });
    Art.drawRightTargetColor(ctx, { color: g.right.targetColor, hidden: hidden, frozen: g.right.stage === 'max' });
    Art.drawLeftUnlockProgress(ctx, unlockProgressState(g.left));
    Art.drawRightUnlockProgress(ctx, unlockProgressState(g.right));
    Art.drawExpensiveSideMark(ctx, { side: g.left.expensive ? 'left' : 'right' });
    Art.drawNextPreview(ctx, {
      cells: g.next ? g.next.colors.map(function (col, i) {
        var sh = SHAPES[g.next.shapeKey].cells[i];
        return { col: sh.x, row: sh.y, color: col };
      }) : null,
      hidden: hidden
    });

    Art.drawHud(ctx, {
      score: g.score,
      best: g.best,
      seconds: g.t,
      fallSpeed: g.currentFallSpeed || 1,
      status: g.status
    });

    if (g.rHoldStart !== null && g.status === 'playing') {
      var held = (performance.now() - g.rHoldStart) / 1000;
      Art.drawAbandonTimer(ctx, { progress: Math.min(1, held / ABANDON_HOLD), remain: Math.max(0, ABANDON_HOLD - held) });
    }

    if (g.status === 'over' && g.result) {
      Art.drawResultPanel(ctx, g.result);
    }

    if (g.status === 'paused') {
      Art.drawPauseOverlay(ctx, { pauseCount: g.pauseCount });
    }
  }

  /* ---------------------------------------------------------------
   * 主迴圈
   * ------------------------------------------------------------- */
  var lastTime = null;
  var acc = 0;

  function frame(ts) {
    if (lastTime === null) { lastTime = ts; }
    var dt = (ts - lastTime) / 1000;
    lastTime = ts;
    if (dt > 0.25) { dt = 0.25; } // 分頁切回時避免瞬間補跑大量步數

    if (G.rHoldStart !== null) {
      var held = (performance.now() - G.rHoldStart) / 1000;
      if (held >= ABANDON_HOLD) {
        G.rHoldStart = null;
        endGame(G, 'abandon');
      }
    }

    if (G.status === 'paused') {
      G.pauseSeconds += dt;
      acc = 0;
    } else if (G.status === 'playing') {
      acc += dt;
      var steps = 0;
      while (acc >= STEP && steps < 12) {
        update(G, STEP);
        acc -= STEP;
        steps++;
        if (G.status !== 'playing') { break; }
      }
      if (steps >= 12) { acc = 0; }
    } else {
      acc = 0;
    }

    draw(G);
    requestAnimationFrame(frame);
  }

  G = newGame();
  requestAnimationFrame(frame);
})();
