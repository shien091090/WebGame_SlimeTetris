/* SlimeChain Demo - 遊戲邏輯 (spec.md v7)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理。
 * 座標約定: 絕對欄 col (全局不重編號, 中線固定在欄2|3接縫), 列 row (1 = 最底列, 17/18 為緩衝列, 19+ 無硬界)。
 */
(function () {
  'use strict';

  /* 佔位圖形: 本作規格物件全部由 Art 涵蓋, 無需佔位幾何。保留空物件以符合專案慣例。 */
  var Placeholder = {};

  /* ---------------------------------------------------------------
   * 常數 (數值參數表, spec.md)
   * ------------------------------------------------------------- */
  var COLORS = ['A', 'B', 'C'];

  var SHAPES = {
    I: { N: 4, width: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    O: { N: 2, width: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    T: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
    J: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] },
    L: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] },
    S: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    Z: { N: 3, width: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] }
  };
  var SHAPE_KEYS = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];

  var CHAIN_MULT = [1.00, 1.25, 1.57, 1.97, 2.48];
  var CHAIN_DURATION = 0.35;      // 每段連鎖呈現時長 (秒)
  var EXPANSION_DURATION = 1.2;   // 每次延展事件呈現時長 (秒)

  var BASE_PER_CELL = 25;
  var QUALIFY_PTS = 12;
  var MAXED_PTS = 5;
  var FULLWIDTH_BONUS = 1500;
  var SCORE_MULT_PER_COL = 0.15;

  var FALL_BASE = 4.5;
  var FALL_DOUBLE_T = 75;
  var FALL_CAP = 40;
  var SOFT_MIN = 20;

  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 1;

  var DAS = 0.1;    // 100ms
  var ARR = 0.033;  // 33ms

  var ABANDON_HOLD = 1.0; // 真實時間秒數

  var CHEAP_NEED = [2, 14];
  var EXPENSIVE_NEED = [7, 19];

  var FIXED_DT = 1 / 60;
  var MAX_SUB_STEPS = 15;
  var MAX_FRAME_DT = 0.25;

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

  function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------------------------------------------------------------
   * 全域狀態
   * ------------------------------------------------------------- */
  var state = null;   // 見 initGame()
  var input = null;   // 鍵盤/長按狀態
  var mouse = null;   // 滑鼠橫移狀態
  var bestScore = -1; // 最佳紀錄 (單一筆, 本次頁面存活期間)

  /* ---------------------------------------------------------------
   * 顏色 / 形狀 bag
   * ------------------------------------------------------------- */
  function refillColorBag() {
    var arr = [];
    COLORS.forEach(function (c) { for (var i = 0; i < 6; i++) arr.push(c); });
    state.colorBag = shuffle(arr);
  }
  function drawColor() {
    if (!state.colorBag.length) refillColorBag();
    return state.colorBag.pop();
  }
  function refillShapeBag() { state.shapeBag = shuffle(SHAPE_KEYS.slice()); }
  function drawShape() {
    if (!state.shapeBag.length) refillShapeBag();
    return state.shapeBag.pop();
  }

  function makeNextPiece() {
    var shapeKey = drawShape();
    var shape = SHAPES[shapeKey];
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y }; });
    // 填色順序寫死: y 小者在前, y 同則 x 小者在前
    var order = localCells.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    order.forEach(function (c) { c.color = drawColor(); });
    return { shapeKey: shapeKey, N: shape.N, cells: localCells };
  }

  function spawnAnchorFor(shapeKey, colMin, colMax) {
    var shape = SHAPES[shapeKey];
    var w = colMax - colMin + 1;
    var leftOffset = Math.floor((w - shape.width) / 2);
    return { col: colMin + leftOffset, row: 17 };
  }

  function instantiatePiece(data) {
    var anchor = spawnAnchorFor(data.shapeKey, state.colMin, state.colMax);
    return {
      shapeKey: data.shapeKey, N: data.N,
      cells: data.cells.map(function (c) { return { x: c.x, y: c.y, color: c.color }; }),
      anchorCol: anchor.col, anchorRow: anchor.row,
      fallProgress: 0, inLockDelay: false, lockTimer: 0, resetsUsed: 0,
      phase: 'falling', hardDropUsed: false
    };
  }

  function computeSpawnCells(nextData, colMin, colMax) {
    var shape = SHAPES[nextData.shapeKey];
    var anchor = spawnAnchorFor(nextData.shapeKey, colMin, colMax);
    return shape.cells.map(function (c) { return { col: anchor.col + c.x, row: anchor.row + c.y }; });
  }

  function spawnNextAsCurrent() {
    state.piece = instantiatePiece(state.nextPiece);
    state.nextPiece = makeNextPiece();
  }

  /* ---------------------------------------------------------------
   * 盤面格位存取 (絕對欄 -> 陣列, 全局不重編號, 不做前端插入)
   * ------------------------------------------------------------- */
  function getCell(col, row) {
    if (col < state.colMin || col > state.colMax || row < 1) return null;
    var arr = state.grid.get(col);
    if (!arr) return null;
    var v = arr[row - 1];
    return v === undefined ? null : v;
  }
  function setCell(col, row, val) {
    var arr = state.grid.get(col);
    if (!arr) { arr = []; state.grid.set(col, arr); }
    arr[row - 1] = val;
    if (val && row > state.topWatermark) state.topWatermark = row;
  }
  function setCellNull(col, row) {
    var arr = state.grid.get(col);
    if (arr) arr[row - 1] = null;
  }

  function collideCells(cells) {
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.col < state.colMin || c.col > state.colMax) return true;
      if (c.row < 1) return true;
      if (getCell(c.col, c.row)) return true;
    }
    return false;
  }

  function findCellById(id) {
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var r = 0; r < arr.length; r++) {
        if (arr[r] && arr[r].id === id) return { col: col, row: r + 1 };
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * 旋轉 (簡化踢牆: 原地 -> 左1 -> 右1; O 形因佔滿 2x2 box, 通用公式自動
   * 等效於「真實旋轉顏色矩陣, 外框不變」)
   * ------------------------------------------------------------- */
  function rotateCellsList(cells, N, dir) {
    return cells.map(function (c) {
      var nx, ny;
      if (dir === 'cw') { nx = c.y; ny = N - 1 - c.x; }
      else if (dir === 'ccw') { nx = N - 1 - c.y; ny = c.x; }
      else { nx = N - 1 - c.x; ny = N - 1 - c.y; } // 180
      return { x: nx, y: ny, color: c.color };
    });
  }

  function tryRotate(dir) {
    var piece = state.piece;
    if (!piece) return false;
    var newCells = rotateCellsList(piece.cells, piece.N, dir);
    var kicks = [0, -1, 1];
    for (var i = 0; i < kicks.length; i++) {
      var off = kicks[i];
      var abs = newCells.map(function (c) { return { col: piece.anchorCol + off + c.x, row: piece.anchorRow + c.y }; });
      if (!collideCells(abs)) {
        piece.cells = newCells;
        piece.anchorCol += off;
        onSuccessfulAction();
        return true;
      }
    }
    return false;
  }

  function tryMove(dx) {
    var piece = state.piece;
    if (!piece) return false;
    var abs = piece.cells.map(function (c) { return { col: piece.anchorCol + dx + c.x, row: piece.anchorRow + c.y }; });
    if (collideCells(abs)) return false;
    piece.anchorCol += dx;
    onSuccessfulAction();
    return true;
  }

  function onSuccessfulAction() {
    var piece = state.piece;
    if (!piece || !piece.inLockDelay) return;
    if (piece.resetsUsed < MAX_LOCK_RESETS) {
      piece.resetsUsed++;
      piece.lockTimer = LOCK_DELAY;
    } else {
      performLock();
    }
  }

  function hardDrop() {
    var piece = state.piece;
    if (!piece) return;
    while (true) {
      var below = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow - 1 + c.y }; });
      if (collideCells(below)) break;
      piece.anchorRow -= 1;
    }
    piece.hardDropUsed = true;
    performLock();
  }

  function softDropStep() {
    var piece = state.piece;
    if (!piece) return;
    var below = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow - 1 + c.y }; });
    if (!collideCells(below)) { piece.anchorRow -= 1; onSuccessfulAction(); }
  }

  function pieceCenterCol(piece) {
    var xs = piece.cells.map(function (c) { return c.x; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var width = maxX - minX + 1;
    var centerLocal = minX + Math.floor((width - 1) / 2);
    return piece.anchorCol + centerLocal;
  }

  function computeGhost() {
    var piece = state.piece;
    if (!piece) return null;
    var row = piece.anchorRow;
    while (true) {
      var below = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row - 1 + c.y }; });
      if (collideCells(below)) break;
      row -= 1;
    }
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row + c.y, color: c.color }; });
  }

  function currentFallSpeed() {
    return Math.min(FALL_BASE * Math.pow(2, state.time / FALL_DOUBLE_T), FALL_CAP);
  }

  /* ---------------------------------------------------------------
   * 下落中方塊每步更新 (playing 狀態)
   * ------------------------------------------------------------- */
  function updatePlaying(dt) {
    var piece = state.piece;
    if (!piece) return;
    var speed = input.softDown ? Math.max(SOFT_MIN, currentFallSpeed()) : currentFallSpeed();
    piece.fallProgress += speed * dt;
    var moved = 0;
    while (piece.fallProgress >= 1 && moved < 18) {
      var below = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow - 1 + c.y }; });
      if (collideCells(below)) { piece.fallProgress = 0; break; }
      piece.anchorRow -= 1;
      piece.fallProgress -= 1;
      moved++;
    }
    if (!state.piece) return;
    var belowNow = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow - 1 + c.y }; });
    var grounded = collideCells(belowNow);
    if (grounded) {
      if (!piece.inLockDelay) { piece.inLockDelay = true; piece.lockTimer = LOCK_DELAY; piece.resetsUsed = 0; }
      else {
        piece.lockTimer -= dt;
        if (piece.lockTimer <= 0) { performLock(); return; }
      }
      piece.phase = 'lockdelay';
    } else {
      piece.inLockDelay = false;
      piece.phase = input.softDown ? 'softdrop' : 'falling';
    }
  }

  /* ---------------------------------------------------------------
   * 結算時序 (方塊鎖定後): 1 鎖定取樣 -> 2~7 連鎖 -> 8 階段推進
   * -> 9 延展 -> 10 重抽 -> 11 結束判定/解鎖
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;
    var ids = [];
    piece.cells.forEach(function (c) {
      var id = state.nextCellId++;
      var col = piece.anchorCol + c.x, row = piece.anchorRow + c.y;
      setCell(col, row, { color: c.color, id: id });
      ids.push({ id: id, col: col, row: row });
    });
    state.stats.totalPieces++;
    if (piece.hardDropUsed) state.stats.hardDropLocks++;
    state.piece = null;
    state.mode = 'settling';
    state.settlement = {
      k: 1,
      leftMaxedFlag: state.left.maxed,
      rightMaxedFlag: state.right.maxed,
      scoreMultiplier: 1 + SCORE_MULT_PER_COL * state.unlockedColsTotal,
      lockedCells: ids,
      phase: 'scan',
      timer: 0,
      marks: null, leftCount: 0, rightCount: 0,
      chainSegment: 0, chainMultiplier: 1,
      expansionQueue: [], currentExpansion: null
    };
    doScan();
  }

  function findGroups() {
    var visited = Object.create(null);
    var groups = [];
    for (var col = state.colMin; col <= state.colMax; col++) {
      for (var row = 1; row <= state.topWatermark; row++) {
        var key = col + '_' + row;
        if (visited[key]) continue;
        visited[key] = true;
        var startCell = getCell(col, row);
        if (!startCell) continue;
        var color = startCell.color;
        var stack = [[col, row]];
        var comp = [{ col: col, row: row, color: color, id: startCell.id }];
        while (stack.length) {
          var cur = stack.pop();
          var nbs = [[cur[0] + 1, cur[1]], [cur[0] - 1, cur[1]], [cur[0], cur[1] + 1], [cur[0], cur[1] - 1]];
          for (var i = 0; i < 4; i++) {
            var nc = nbs[i][0], nr = nbs[i][1];
            if (nr < 1) continue;
            var nkey = nc + '_' + nr;
            if (visited[nkey]) continue;
            var ncell = getCell(nc, nr);
            if (ncell && ncell.color === color) {
              visited[nkey] = true;
              comp.push({ col: nc, row: nr, color: color, id: ncell.id });
              stack.push([nc, nr]);
            }
          }
        }
        if (comp.length >= 4) groups.push({ color: color, cells: comp });
      }
    }
    return groups;
  }

  function recordTeamSize(n) {
    var bucket = n >= 7 ? '7+' : String(n);
    state.stats.teamSize[bucket] = (state.stats.teamSize[bucket] || 0) + 1;
  }

  function applySegmentScoring(groups) {
    var s = state.settlement;
    var mult = CHAIN_MULT[Math.min(s.k, CHAIN_MULT.length) - 1];
    var segBase = 0, qualifyPts = 0;
    var marks = [], leftCount = 0, rightCount = 0, removeCells = [];
    groups.forEach(function (g) {
      segBase += BASE_PER_CELL * g.cells.length;
      recordTeamSize(g.cells.length);
      g.cells.forEach(function (cell) {
        removeCells.push({ col: cell.col, row: cell.row });
        var kind = 'plain';
        if (cell.color === state.left.target) {
          if (s.leftMaxedFlag) {
            qualifyPts += MAXED_PTS;
            state.stats.cat5++;
          } else if (cell.col <= 2) {
            qualifyPts += QUALIFY_PTS;
            kind = 'left';
            leftCount++;
            state.left.remaining -= 1;
            state.stats.cat1++;
            state.stats.leftEffNum++; state.stats.leftEffDen++;
          } else {
            kind = 'offside';
            state.stats.cat3++;
            state.stats.leftEffDen++;
          }
        } else if (cell.color === state.right.target) {
          if (s.rightMaxedFlag) {
            qualifyPts += MAXED_PTS;
            state.stats.cat5++;
          } else if (cell.col >= 3) {
            qualifyPts += QUALIFY_PTS;
            kind = 'right';
            rightCount++;
            state.right.remaining -= 1;
            state.stats.cat2++;
            state.stats.rightEffNum++; state.stats.rightEffDen++;
          } else {
            kind = 'offside';
            state.stats.cat4++;
            state.stats.rightEffDen++;
          }
        } else {
          state.stats.cat5++;
        }
        marks.push({ col: cell.col, row: cell.row, kind: kind });
        for (var i = s.lockedCells.length - 1; i >= 0; i--) {
          if (s.lockedCells[i].col === cell.col && s.lockedCells[i].row === cell.row) {
            s.lockedCells.splice(i, 1);
          }
        }
      });
    });
    state.stats.totalCleared += removeCells.length;
    var scoreAdd = (segBase * mult + qualifyPts) * s.scoreMultiplier;
    state.score += scoreAdd;
    s.marks = marks;
    s.leftCount = leftCount;
    s.rightCount = rightCount;
    s.chainSegment = s.k;
    s.chainMultiplier = mult;
    s.pendingRemoveCells = removeCells;
  }

  function removeCellsAndGravity(cells) {
    cells.forEach(function (c) { setCellNull(c.col, c.row); });
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (arr) state.grid.set(col, arr.filter(function (v) { return v != null; }));
    }
    var s = state.settlement;
    s.lockedCells.forEach(function (entry) {
      var pos = findCellById(entry.id);
      if (pos) { entry.col = pos.col; entry.row = pos.row; }
    });
  }

  function doScan() {
    var s = state.settlement;
    var groups = findGroups();
    if (groups.length === 0) {
      if (s.k - 1 > 0) {
        state.stats.chainSegDist[s.k - 1] = (state.stats.chainSegDist[s.k - 1] || 0) + 1;
      }
      step8();
      var queue = [];
      if (state.left.pendingExpansionCount > 0) queue.push('left');
      if (state.right.pendingExpansionCount > 0) queue.push('right');
      s.expansionQueue = queue;
      if (queue.length) {
        s.phase = 'expansion';
        startNextExpansion();
      } else {
        finishSettlement();
      }
      return;
    }
    applySegmentScoring(groups);
    s.phase = 'chainDisplay';
    s.timer = CHAIN_DURATION;
  }

  function step8() {
    processSide(state.left);
    processSide(state.right);
  }
  function processSide(side) {
    if (side.stage === 1 && side.remaining <= 0) {
      var overflow = -side.remaining;
      side.stage = 2;
      side.remaining = side.need2 - overflow;
      side.pendingExpansionCount++;
    }
    if (side.stage === 2 && side.remaining <= 0 && !side.maxed) {
      side.maxed = true;
      side.pendingExpansionCount++;
    }
  }

  function pickReroll(exclude) {
    var opts = COLORS.filter(function (c) { return c !== exclude; });
    return randOf(opts);
  }

  function logExpansion(sideKey, newCol, isFullWidth) {
    var leftCols = 3 - state.colMin;
    var rightCols = state.colMax - 2;
    var entry = {
      index: state.unlockedColsTotal, side: sideKey,
      pieces: state.stats.totalPieces, seconds: state.time,
      width: state.colMax - state.colMin + 1,
      split: leftCols + '|' + rightCols
    };
    state.stats.expansions.push(entry);
    console.log('[延展] 第' + entry.index + '次 · ' + (sideKey === 'left' ? '左側' : '右側') +
      ' · 第' + entry.pieces + '塊 · ' + entry.seconds.toFixed(1) + 's · 寬度' + entry.width +
      ' · 中線兩側 ' + entry.split + (isFullWidth ? ' · 滿寬達成 +1500' : ''));
  }

  function executeExpansion(sideKey) {
    var side = state[sideKey];
    var other = sideKey === 'left' ? state.right : state.left;
    side.pendingExpansionCount--;
    side.unlockedCount++;
    var newCol;
    if (sideKey === 'left') { newCol = state.colMin - 1; state.colMin = newCol; }
    else { newCol = state.colMax + 1; state.colMax = newCol; }
    state.grid.set(newCol, []);
    state.unlockedColsTotal++;
    var isFullWidth = state.unlockedColsTotal === 4;
    if (isFullWidth) state.score += FULLWIDTH_BONUS;
    var doReroll = !side.maxed;
    var rerollColor = null;
    if (doReroll) {
      rerollColor = pickReroll(other.target);
      side.target = rerollColor;
    }
    logExpansion(sideKey, newCol, isFullWidth);
    var s = state.settlement;
    s.currentExpansion = {
      side: sideKey, newCol: newCol,
      reroll: doReroll ? { visible: true, side: sideKey, color: rerollColor } : { visible: false },
      bonus: { visible: isFullWidth, bonus: FULLWIDTH_BONUS }
    };
    s.timer = EXPANSION_DURATION;
    s.phase = 'expansion';
  }

  function startNextExpansion() {
    var s = state.settlement;
    var side = s.expansionQueue.shift();
    executeExpansion(side);
  }

  function updateSettlementFrame(dt) {
    var s = state.settlement;
    if (!s) return;
    if (s.phase === 'chainDisplay') {
      s.timer -= dt;
      if (s.timer <= 0) {
        removeCellsAndGravity(s.pendingRemoveCells);
        s.marks = null;
        s.k++;
        s.phase = 'scan';
        doScan();
      }
      return;
    }
    if (s.phase === 'expansion') {
      s.timer -= dt;
      if (s.timer <= 0) {
        s.currentExpansion = null;
        if (s.expansionQueue.length) startNextExpansion();
        else finishSettlement();
      }
      return;
    }
  }

  function finishSettlement() {
    var s = state.settlement;
    var lockout = false;
    if (s.lockedCells.length > 0) {
      lockout = s.lockedCells.every(function (c) { return c.row > 16; });
    }
    var blockout = false;
    if (!lockout) {
      var cells = computeSpawnCells(state.nextPiece, state.colMin, state.colMax);
      blockout = cells.some(function (c) { return getCell(c.col, c.row) != null; });
    }
    if (lockout || blockout) {
      endGame(lockout ? 'lockout' : 'blockout');
      return;
    }
    state.settlement = null;
    state.mode = 'playing';
    if (state.pauseRequested) {
      state.pauseRequested = false;
      state.paused = true;
    }
    spawnNextAsCurrent();
  }

  /* ---------------------------------------------------------------
   * 遊戲結束 / 重開
   * ------------------------------------------------------------- */
  function columnHeights() {
    var out = {};
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      out[col] = arr ? arr.length : 0;
    }
    return out;
  }

  function printSummary(reason) {
    var st = state.stats;
    var mergedNum = st.leftEffNum + st.rightEffNum;
    var mergedDen = st.leftEffDen + st.rightEffDen;
    function eff(num, den) { return den > 0 ? (num / den).toFixed(3) : '—'; }
    var expLines = [1, 2, 3, 4].map(function (i) {
      var e = st.expansions[i - 1];
      return e ? ('第' + i + '次(' + (e.side === 'left' ? '左' : '右') + '):第' + e.pieces + '塊/' + e.seconds.toFixed(1) + 's')
        : ('第' + i + '次:—');
    });
    var reasonText = reason === 'lockout' ? 'lock out' : reason === 'blockout' ? 'block out' : '玩家放棄';
    console.log('===== 本局結束彙整 =====');
    console.log('結束原因:', reasonText, ' 總塊數:', st.totalPieces, ' 總秒數:', state.time.toFixed(1));
    console.log('硬降使用率:', st.totalPieces > 0 ? (st.hardDropLocks / st.totalPieces * 100).toFixed(1) + '%' : '—');
    console.log('四次延展:', expLines.join(' | '));
    console.log('已解鎖欄數:', state.unlockedColsTotal, '/4', ' 本局昂貴側:', state.left.expensive ? '左' : '右');
    console.log('消除總顆數:', st.totalCleared);
    console.log('顆數五分類 [①左合格 ②右合格 ③左目標落右半 ④右目標落左半 ⑤非目標色]:',
      st.cat1, st.cat2, st.cat3, st.cat4, st.cat5, ' 合計=', st.cat1 + st.cat2 + st.cat3 + st.cat4 + st.cat5);
    console.log('分邊效率 左:', eff(st.leftEffNum, st.leftEffDen), ' 右:', eff(st.rightEffNum, st.rightEffDen),
      ' 合併(主值):', eff(mergedNum, mergedDen));
    console.log('各側最終達成階數: 左=', state.left.maxed ? 2 : state.left.stage - 1,
      ' 右=', state.right.maxed ? 2 : state.right.stage - 1);
    console.log('連鎖段數分佈:', JSON.stringify(st.chainSegDist));
    console.log('消除團大小分佈:', JSON.stringify(st.teamSize));
    console.log('各欄最終高度:', JSON.stringify(columnHeights()));
    console.log('最終分數:', Math.floor(state.score));
    console.log('=========================');
  }

  function endGame(reason) {
    if (state.mode === 'over') return;
    state.mode = 'over';
    state.paused = false;
    state.piece = null;
    var isNewBest = reason !== 'abandon' && state.score > bestScore;
    if (isNewBest) bestScore = state.score;
    state.gameOverInfo = {
      visible: true, score: state.score, seconds: state.time,
      unlockedCols: state.unlockedColsTotal, reason: reason,
      best: bestScore < 0 ? null : bestScore, isNewBest: isNewBest
    };
    printSummary(reason);
  }

  function makeSide(isExpensive, targetColor) {
    var need = isExpensive ? EXPENSIVE_NEED : CHEAP_NEED;
    return {
      expensive: isExpensive, target: targetColor,
      stage: 1, need1: need[0], need2: need[1], remaining: need[0],
      pendingExpansionCount: 0, unlockedCount: 0, maxed: false
    };
  }

  function freshStats() {
    return {
      totalPieces: 0, hardDropLocks: 0,
      cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0,
      totalCleared: 0,
      leftEffNum: 0, leftEffDen: 0, rightEffNum: 0, rightEffDen: 0,
      teamSize: {}, chainSegDist: {}, expansions: []
    };
  }

  function initGame() {
    state = {
      colorBag: [], shapeBag: [],
      colMin: 0, colMax: 5,
      grid: new Map(),
      topWatermark: 20,
      nextCellId: 1,
      time: 0, score: 0,
      mode: 'playing', paused: false, pauseRequested: false, rKeyLocked: false,
      unlockedColsTotal: 0,
      gameOverInfo: null,
      piece: null, nextPiece: null,
      settlement: null,
      stats: freshStats()
    };
    var expensiveLeft = Math.random() < 0.5;
    var colorsShuffled = shuffle(COLORS.slice());
    var leftColor = colorsShuffled[0];
    var rightColor = randOf(COLORS.filter(function (c) { return c !== leftColor; }));
    state.left = makeSide(expensiveLeft, leftColor);
    state.right = makeSide(!expensiveLeft, rightColor);

    state.nextPiece = makeNextPiece();
    spawnNextAsCurrent();

    input.hActiveDir = 0; input.hPhase = 'idle'; input.hDas = 0;
    input.leftDown = false; input.rightDown = false; input.softDown = false;
    mouse.targetCol = null; mouse.phase = 'idle'; mouse.dasTimer = 0;
    input.abandonHolding = false; input.abandonTriggered = false;
  }

  function restartGame() { initGame(); }

  /* ---------------------------------------------------------------
   * 輸入: 鍵盤 DAS/ARR
   * ------------------------------------------------------------- */
  function startHorizontal(dir) {
    if (dir === -1) input.leftDown = true; else input.rightDown = true;
    input.hActiveDir = dir;
    input.hDas = DAS;
    input.hPhase = 'wait';
    if (!state.paused && state.mode === 'playing' && state.piece) tryMove(dir);
  }
  function endHorizontal(dir) {
    if (dir === -1) input.leftDown = false; else input.rightDown = false;
    if (input.hActiveDir === dir) {
      if (dir === -1 && input.rightDown) startHorizontal(1);
      else if (dir === 1 && input.leftDown) startHorizontal(-1);
      else { input.hActiveDir = 0; input.hPhase = 'idle'; }
    }
  }
  function tickHorizontal(dt) {
    if (input.hPhase === 'idle') return;
    input.hDas -= dt;
    var guard = 0;
    while (input.hDas <= 0 && guard < 10) {
      guard++;
      if (state.mode === 'playing' && state.piece) tryMove(input.hActiveDir);
      input.hPhase = 'repeat';
      input.hDas += ARR;
      if (!state.piece) break;
    }
  }

  function tickMouseChase(dt) {
    if (mouse.phase === 'idle' || mouse.targetCol === null) return;
    mouse.dasTimer -= dt;
    var guard = 0;
    while (mouse.dasTimer <= 0 && guard < 10) {
      guard++;
      if (state.mode === 'playing' && state.piece) {
        var center = pieceCenterCol(state.piece);
        if (center === mouse.targetCol) { mouse.phase = 'idle'; break; }
        tryMove(center < mouse.targetCol ? 1 : -1);
      }
      mouse.phase = 'repeat';
      mouse.dasTimer += ARR;
      if (!state.piece) break;
    }
  }

  /* ---------------------------------------------------------------
   * 放棄長按 (真實時間, 不受暫停影響)
   * ------------------------------------------------------------- */
  function updateAbandon() {
    if (!input.abandonHolding || input.abandonTriggered) return;
    if (state.mode === 'over') return;
    var elapsed = (performance.now() - input.abandonStart) / 1000;
    if (elapsed >= ABANDON_HOLD) {
      input.abandonTriggered = true;
      state.rKeyLocked = true;
      endGame('abandon');
    }
  }
  function abandonProgress() {
    if (!input.abandonHolding) return 0;
    var elapsed = (performance.now() - input.abandonStart) / 1000;
    return Math.max(0, Math.min(1, elapsed / ABANDON_HOLD));
  }

  /* ---------------------------------------------------------------
   * 主更新
   * ------------------------------------------------------------- */
  function tick(dt) {
    updateAbandon();
    if (state.mode === 'over') return;
    if (state.paused) return;
    state.time += dt;
    tickHorizontal(dt);
    tickMouseChase(dt);
    if (state.mode === 'playing') updatePlaying(dt);
    else if (state.mode === 'settling') updateSettlementFrame(dt);
  }

  /* ---------------------------------------------------------------
   * 輸入事件綁定
   * ------------------------------------------------------------- */
  var PREVENT_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1, Spacebar: 1 };

  function normalizeKey(key) {
    switch (key) {
      case 'ArrowLeft': case 'a': case 'A': return 'left';
      case 'ArrowRight': case 'd': case 'D': return 'right';
      case 'ArrowUp': case 'w': case 'W': return 'cw';
      case 'z': case 'Z': return 'ccw';
      case 'x': case 'X': return '180';
      case 'ArrowDown': case 's': case 'S': return 'soft';
      case ' ': case 'Spacebar': return 'hard';
      case 'Escape': return 'pause';
      case 'r': case 'R': return 'r';
      default: return null;
    }
  }

  function requestRotate(dir) {
    if (state.mode === 'playing' && !state.paused && state.piece) tryRotate(dir);
  }
  function requestHardDrop() {
    if (state.mode === 'playing' && !state.paused && state.piece) hardDrop();
  }

  function handlePauseKey() {
    if (state.mode === 'over') return;
    if (state.paused) { state.paused = false; return; }
    if (state.mode === 'playing') state.paused = true;
    else if (state.mode === 'settling') state.pauseRequested = !state.pauseRequested;
  }

  function handleRKeyDown() {
    if (state.rKeyLocked) return;
    if (state.mode === 'over') { restartGame(); return; }
    input.abandonHolding = true;
    input.abandonStart = performance.now();
    input.abandonTriggered = false;
  }
  function handleRKeyUp() {
    if (state.rKeyLocked) state.rKeyLocked = false;
    input.abandonHolding = false;
    input.abandonTriggered = false;
  }

  function onKeyDown(e) {
    if (PREVENT_KEYS[e.key]) e.preventDefault();
    if (e.repeat) return; // OS 按鍵重複事件一律過濾, 重複邏輯全部自管 DAS/ARR 與長按計時
    var code = normalizeKey(e.key);
    if (!code) return;
    if (code === 'pause') { handlePauseKey(); return; }
    if (code === 'r') { handleRKeyDown(); return; }
    if (state.paused) return;
    switch (code) {
      case 'left': startHorizontal(-1); break;
      case 'right': startHorizontal(1); break;
      case 'cw': requestRotate('cw'); break;
      case 'ccw': requestRotate('ccw'); break;
      case '180': requestRotate('180'); break;
      case 'soft': input.softDown = true; break;
      case 'hard': requestHardDrop(); break;
    }
  }
  function onKeyUp(e) {
    var code = normalizeKey(e.key);
    if (!code) return;
    switch (code) {
      case 'left': endHorizontal(-1); break;
      case 'right': endHorizontal(1); break;
      case 'soft': input.softDown = false; break;
      case 'r': handleRKeyUp(); break;
    }
  }

  function toCanvasPoint(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = Art.canvas.width / rect.width;
    var scaleY = Art.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function pointInGameOverPanel(pt) {
    return pt.x >= 270 && pt.x <= 690 && pt.y >= 170 && pt.y <= 470;
  }

  function onMouseMove(e, canvas) {
    if (state.mode === 'over' || state.paused) return;
    var pt = toCanvasPoint(e, canvas);
    var col = Art.xToCol(pt.x);
    col = Math.max(state.colMin, Math.min(state.colMax, col));
    if (mouse.targetCol === null) mouse.targetCol = col;
    var atRest = (mouse.phase === 'idle');
    if (col !== mouse.targetCol) {
      mouse.targetCol = col;
      if (atRest) {
        mouse.dasTimer = DAS;
        mouse.phase = 'wait';
        if (state.mode === 'playing' && state.piece) {
          var center = pieceCenterCol(state.piece);
          if (center !== col) tryMove(center < col ? 1 : -1);
        }
      }
    }
  }

  function onMouseDown(e, canvas) {
    var pt = toCanvasPoint(e, canvas);
    if (state.mode === 'over') {
      if (e.button === 0 && pointInGameOverPanel(pt)) restartGame();
      return;
    }
    if (state.paused) return;
    if (e.button === 0) requestRotate('cw');
    else if (e.button === 1) requestRotate('180');
    else if (e.button === 2) requestHardDrop();
  }

  function onWheel(e) {
    if (state.mode !== 'playing' || state.paused) return;
    e.preventDefault();
    if (e.deltaY > 0) softDropStep();
    else if (e.deltaY < 0) requestRotate('ccw');
  }

  /* ---------------------------------------------------------------
   * 繪製
   * ------------------------------------------------------------- */
  function hudStatus() {
    if (state.mode === 'over') return 'over';
    if (state.paused) return 'paused';
    if (state.mode === 'settling') return 'settling';
    return 'playing';
  }

  function unlockStatus(side) {
    if (side.pendingExpansionCount > 0) return 'pending';
    if (side.maxed) return 'maxed';
    return 'counting';
  }

  function render(ctx) {
    Art.drawBackground(ctx);
    Art.drawBoard(ctx, { minCol: state.colMin, maxCol: state.colMax });

    for (var col = state.colMin; col <= state.colMax; col++) {
      for (var row = 1; row <= 16; row++) {
        var cell = getCell(col, row);
        if (!cell) continue;
        var clearing = false;
        if (state.mode === 'settling' && state.settlement && state.settlement.phase === 'chainDisplay' && state.settlement.marks) {
          for (var i = 0; i < state.settlement.marks.length; i++) {
            var m = state.settlement.marks[i];
            if (m.col === col && m.row === row) { clearing = true; break; }
          }
        }
        Art.drawCell(ctx, { col: col, row: row, color: cell.color, clearing: clearing });
      }
    }

    if (state.piece && !state.paused) {
      var ghostCells = computeGhost();
      if (ghostCells) Art.drawGhost(ctx, { cells: ghostCells });
      Art.drawPiece(ctx, {
        cells: state.piece.cells.map(function (c) { return { col: state.piece.anchorCol + c.x, row: state.piece.anchorRow + c.y, color: c.color }; }),
        phase: state.piece.phase
      });
    }

    Art.drawMidline(ctx, {});

    if (state.mode === 'settling' && state.settlement && state.settlement.phase === 'chainDisplay' && state.settlement.marks) {
      Art.drawClearMarks(ctx, { marks: state.settlement.marks, leftCount: state.settlement.leftCount, rightCount: state.settlement.rightCount });
      Art.drawChainIndicator(ctx, { visible: true, segment: state.settlement.chainSegment, multiplier: state.settlement.chainMultiplier });
    } else {
      Art.drawChainIndicator(ctx, { visible: false });
    }

    if (state.mode === 'settling' && state.settlement && state.settlement.phase === 'expansion' && state.settlement.currentExpansion) {
      var ce = state.settlement.currentExpansion;
      var progress = 1 - (state.settlement.timer / EXPANSION_DURATION);
      Art.drawExpansionEvent(ctx, { visible: true, side: ce.side, newCol: ce.newCol, progress: progress });
      Art.drawRerollHint(ctx, ce.reroll.visible ? { visible: true, side: ce.side, color: ce.reroll.color } : { visible: false });
      Art.drawFullWidthBonus(ctx, ce.bonus.visible ? { visible: true, bonus: ce.bonus.bonus } : { visible: false });
    } else {
      Art.drawExpansionEvent(ctx, { visible: false });
      Art.drawRerollHint(ctx, { visible: false });
      Art.drawFullWidthBonus(ctx, { visible: false });
    }

    Art.drawNextPreview(ctx, { cells: state.nextPiece.cells, hidden: state.paused });

    ['left', 'right'].forEach(function (sideKey) {
      var side = state[sideKey];
      Art.drawTargetColor(ctx, { side: sideKey, color: side.target, frozen: side.maxed });
      Art.drawExpensiveSide(ctx, { side: sideKey, expensive: side.expensive });
      Art.drawUnlockProgress(ctx, {
        side: sideKey, stage: side.stage,
        remaining: side.remaining,
        need: side.stage === 1 ? side.need1 : side.need2,
        status: unlockStatus(side),
        unlockedCols: side.unlockedCount
      });
      Art.drawExpansionPending(ctx, { side: sideKey, visible: side.pendingExpansionCount > 0 });
    });

    Art.drawHud(ctx, { score: state.score, best: bestScore < 0 ? null : bestScore, time: state.time, status: hudStatus() });

    Art.drawAbandonTimer(ctx, {
      visible: input.abandonHolding && !input.abandonTriggered && state.mode !== 'over',
      progress: abandonProgress(),
      remaining: Math.max(0, ABANDON_HOLD - (input.abandonHolding ? (performance.now() - input.abandonStart) / 1000 : 0))
    });

    Art.drawGameOver(ctx, state.gameOverInfo || { visible: false });
    Art.drawPauseMask(ctx, { visible: state.paused });
  }

  /* ---------------------------------------------------------------
   * 啟動
   * ------------------------------------------------------------- */
  function boot() {
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

    input = { hActiveDir: 0, hPhase: 'idle', hDas: 0, leftDown: false, rightDown: false, softDown: false,
      abandonHolding: false, abandonStart: 0, abandonTriggered: false };
    mouse = { targetCol: null, phase: 'idle', dasTimer: 0 };

    initGame();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', function (e) { onMouseMove(e, canvas); });
    canvas.addEventListener('mousedown', function (e) { onMouseDown(e, canvas); });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('wheel', onWheel, { passive: false });

    var lastTime = null;
    var acc = 0;
    function frame(ts) {
      if (lastTime === null) lastTime = ts;
      var rawDt = (ts - lastTime) / 1000;
      lastTime = ts;
      if (rawDt > MAX_FRAME_DT) rawDt = MAX_FRAME_DT; // 分頁切換回來不瞬移
      acc += rawDt;
      var steps = 0;
      while (acc >= FIXED_DT && steps < MAX_SUB_STEPS) {
        tick(FIXED_DT);
        acc -= FIXED_DT;
        steps++;
      }
      render(ctx);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
