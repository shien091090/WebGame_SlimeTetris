/* SlimeTetris Demo - 遊戲邏輯 (spec.md v9)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理。
 * 座標約定: 絕對欄 col(全局不重編號, 中線固定在絕對欄2|3接縫), 列 row(1 = 最底列,
 * 20、21 為緩衝列, 22 以上無硬界)。盤面不做重力沉降, 格位一旦落定座標永遠不變。
 */
(function () {
  'use strict';

  /* 佔位圖形: 本作規格物件全部由 Art 涵蓋, 無需佔位幾何。保留空物件以符合專案慣例。 */
  var Placeholder = {};

  /* ---------------------------------------------------------------
   * 常數(數值參數表, spec.md)
   * ------------------------------------------------------------- */
  var COLORS = ['A', 'B', 'C'];

  var SHAPES = {
    // N = 旋轉方框邊長(供簡化旋轉公式使用), width = spawn 朝向下的外框寬
    // cells 以外框左下角為原點(x 向右, y 向上), 與 spec 的 spawn 表逐一對應
    I: { N: 4, width: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    O: { N: 2, width: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    T: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
    J: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] },
    L: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] },
    S: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    Z: { N: 3, width: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] }
  };
  var SHAPE_KEYS = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];

  var K_SEQUENCE = [1, 2, 3, 5];
  var CHEAP_NEED = [2, 11];
  var EXPENSIVE_NEED = [5, 16];

  var BASE_PER_CELL = 25;
  var N5_BONUS = 25;
  var QUALIFY_PTS = 12;
  var MAXED_PTS = 5;
  var FULLWIDTH_BONUS = 1500;
  var MULT_PER_COL = 0.15;

  var FALL_BASE = 4.0;
  var FALL_DOUBLE_T = 290;
  var FALL_CAP = 6.0;
  var SOFT_SPEED = 12;

  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 1;

  var DAS = 0.1;
  var ARR = 0.033;

  var ABANDON_HOLD = 1.0;

  var CLEAR_DURATION = 0.4;
  var EXPAND_DURATION = 1.2;
  var PICK_DURATION = 3.0;
  var PICK_HOLD = 0.35;      // 選定/逾時後的視覺停留(非規格數值, 純UI緩衝)
  var NEW_BADGE_TIME = 2.5;  // 改選後 NEW 標籤顯示時間(非規格數值, 純UI提示)

  var SPAWN_ROW = 20;
  var MAX_FALL_STEPS = 21;

  var FIXED_DT = 1 / 60;
  var MAX_FRAME_DT = 0.25;
  var MAX_SUB_STEPS = 15;

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
  function range(a, b) { var out = []; for (var i = a; i <= b; i++) out.push(i); return out; }
  function sizeBucket(n) { return n >= 7 ? '7+' : String(n); }
  function fmtEff(num, den) { return den > 0 ? (num / den).toFixed(3) : '—'; }

  /* ---------------------------------------------------------------
   * 全域狀態
   * ------------------------------------------------------------- */
  var state = null;
  var input = null;
  var mouse = null;

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

  function makeNextPieceData() {
    var shapeKey = drawShape();
    var shape = SHAPES[shapeKey];
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y }; });
    // 填色順序寫死: y 小者在前, y 同則 x 小者在前
    var order = localCells.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    order.forEach(function (c) { c.color = drawColor(); });
    return { shapeKey: shapeKey, cells: localCells };
  }

  function spawnAnchorCol(shapeKey, colMin, colMax) {
    var shape = SHAPES[shapeKey];
    var w = colMax - colMin + 1;
    return colMin + Math.floor((w - shape.width) / 2);
  }

  function instantiatePiece(data) {
    var anchorCol = spawnAnchorCol(data.shapeKey, state.colMin, state.colMax);
    return {
      shapeKey: data.shapeKey, N: SHAPES[data.shapeKey].N,
      cells: data.cells.map(function (c) { return { x: c.x, y: c.y, color: c.color }; }),
      anchorCol: anchorCol, anchorRow: SPAWN_ROW,
      fallProgress: 0, inLockDelay: false, lockTimer: 0, resetsUsed: 0,
      hardDropUsed: false
    };
  }

  function computeSpawnCells(data, colMin, colMax) {
    var anchorCol = spawnAnchorCol(data.shapeKey, colMin, colMax);
    return data.cells.map(function (c) { return { col: anchorCol + c.x, row: SPAWN_ROW + c.y }; });
  }

  function spawnNextAsCurrent() {
    state.piece = instantiatePiece(state.nextPiece);
    state.nextPiece = makeNextPieceData();
  }

  /* ---------------------------------------------------------------
   * 盤面格位存取(絕對欄 -> Map, 全局不重編號, 不做前端插入不需搬移)
   * ------------------------------------------------------------- */
  function getCell(col, row) {
    if (col < state.colMin || col > state.colMax || row < 1) return null;
    var arr = state.grid.get(col);
    if (!arr) return null;
    return arr[row - 1] || null;
  }
  function setCell(col, row, val) {
    var arr = state.grid.get(col);
    if (!arr) { arr = []; state.grid.set(col, arr); }
    arr[row - 1] = val;
  }
  function setCellNull(col, row) {
    var arr = state.grid.get(col);
    if (arr) arr[row - 1] = null;
  }
  function columnFilledDesc(col) {
    var arr = state.grid.get(col);
    if (!arr) return [];
    var out = [];
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i]) out.push(i + 1); }
    return out;
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

  /* ---------------------------------------------------------------
   * 旋轉(簡化踢牆: 原地 -> 左1 -> 右1)
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

  function tryMove(dir) {
    var piece = state.piece;
    if (!piece) return false;
    var abs = piece.cells.map(function (c) { return { col: piece.anchorCol + dir + c.x, row: piece.anchorRow + c.y }; });
    if (collideCells(abs)) return false;
    piece.anchorCol += dir;
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

  function pieceBelowCells(piece, rowOffset) {
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow + rowOffset + c.y }; });
  }

  function hardDrop() {
    var piece = state.piece;
    if (!piece) return;
    var guard = 0;
    while (!collideCells(pieceBelowCells(piece, -1)) && guard < 400) { piece.anchorRow -= 1; guard++; }
    piece.hardDropUsed = true;
    performLock();
  }

  function softDropStep() {
    var piece = state.piece;
    if (!piece) return;
    if (!collideCells(pieceBelowCells(piece, -1))) { piece.anchorRow -= 1; onSuccessfulAction(); }
  }

  function pieceCenterCol(piece) {
    var xs = piece.cells.map(function (c) { return c.x; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var width = maxX - minX + 1;
    return piece.anchorCol + minX + Math.floor((width - 1) / 2);
  }

  function computeGhost() {
    var piece = state.piece;
    if (!piece) return null;
    var row = piece.anchorRow;
    var guard = 0;
    while (!collideCells(piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row - 1 + c.y }; })) && guard < 400) { row -= 1; guard++; }
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row + c.y, color: c.color }; });
  }

  function currentFallSpeed() {
    return Math.min(FALL_BASE * Math.pow(2, state.time / FALL_DOUBLE_T), FALL_CAP);
  }

  /* ---------------------------------------------------------------
   * 下落中方塊每步更新(playing 狀態)
   * ------------------------------------------------------------- */
  function updatePlaying(dt) {
    var piece = state.piece;
    if (!piece) return;
    var speed = input.softDown ? SOFT_SPEED : currentFallSpeed();
    piece.fallProgress += speed * dt;
    var moved = 0;
    while (piece.fallProgress >= 1 && moved < MAX_FALL_STEPS) {
      if (collideCells(pieceBelowCells(piece, -1))) { piece.fallProgress = 0; break; }
      piece.anchorRow -= 1;
      piece.fallProgress -= 1;
      moved++;
    }
    if (!state.piece) return; // 有可能在下落過程中已經觸底鎖定(理論上不會, 保險)
    var grounded = collideCells(pieceBelowCells(piece, -1));
    if (grounded) {
      if (!piece.inLockDelay) { piece.inLockDelay = true; piece.lockTimer = LOCK_DELAY; piece.resetsUsed = 0; }
      else {
        piece.lockTimer -= dt;
        if (piece.lockTimer <= 0) { performLock(); return; }
      }
    } else {
      piece.inLockDelay = false;
    }
  }

  function piecePhase(piece) {
    if (!piece) return 'fall';
    if (piece.inLockDelay) return 'lock';
    if (input.softDown) return 'soft';
    return 'fall';
  }

  /* ---------------------------------------------------------------
   * 同色連通團掃描(4方向, 含不可見區; 一次用途: 找 >=4 團 / 找 n=2,3 顯示團)
   * ------------------------------------------------------------- */
  function scanConnectedComponents() {
    var visited = Object.create(null);
    var comps = [];
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var row = 1; row <= arr.length; row++) {
        var cell = arr[row - 1];
        if (!cell) continue;
        var key = col + '_' + row;
        if (visited[key]) continue;
        var color = cell.color;
        var stack = [[col, row]];
        visited[key] = true;
        var cells = [];
        while (stack.length) {
          var cur = stack.pop();
          var c = cur[0], r = cur[1];
          cells.push({ col: c, row: r, color: color });
          var nbs = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
          for (var ni = 0; ni < nbs.length; ni++) {
            var nc = nbs[ni][0], nr = nbs[ni][1];
            if (nc < state.colMin || nc > state.colMax || nr < 1) continue;
            var nk = nc + '_' + nr;
            if (visited[nk]) continue;
            var ncell = getCell(nc, nr);
            if (!ncell || ncell.color !== color) continue;
            visited[nk] = true;
            stack.push([nc, nr]);
          }
        }
        comps.push({ color: color, cells: cells });
      }
    }
    return comps;
  }

  function recomputeClusterDisplay() {
    var comps = scanConnectedComponents();
    var out = [];
    comps.forEach(function (g) {
      var n = g.cells.length;
      if (n !== 2 && n !== 3) return;
      var anchor = g.cells[0];
      for (var i = 1; i < g.cells.length; i++) {
        var c = g.cells[i];
        if (c.row > anchor.row || (c.row === anchor.row && c.col < anchor.col)) anchor = c;
      }
      out.push({ col: anchor.col, row: anchor.row, n: n, color: g.color });
    });
    state.clusterDisplay = out;
  }

  /* ---------------------------------------------------------------
   * 兩側解鎖計數(A/E)工具
   * ------------------------------------------------------------- */
  function currentRemain(side) { return side.A === 0 ? side.remain1 : side.remain2; }
  function currentNeed(side) { return side.A === 0 ? side.need1 : side.need2; }
  function decrementRemain(side, n) {
    if (side.A === 0) side.remain1 -= n;
    else if (side.A === 1) side.remain2 -= n;
  }
  function advanceIfNeeded(side) {
    if (side.A < 2 && currentRemain(side) <= 0) {
      var overflow = -currentRemain(side);
      side.A++;
      if (side.A < 2) side.remain2 = side.need2 - overflow;
      return true;
    }
    return false;
  }
  function unlockedCols() { return (state.colMax - state.colMin + 1) - 6; }

  /* ---------------------------------------------------------------
   * 結算時序(方塊鎖定後): 見 spec.md「結算時序」1~9 步
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;

    // 第 1 步: 鎖定, 取樣滿級 flag 與分數倍率
    var flags = { left: state.left.A === 2, right: state.right.A === 2 };
    var multiplier = 1 + MULT_PER_COL * unlockedCols();

    var lockedCells = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow + c.y, color: c.color }; });
    lockedCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color }); });
    state.stats.totalPieces++;
    if (piece.hardDropUsed) state.stats.hardDropLocks++;
    state.piece = null;

    var survivors = lockedCells.map(function (c) { return { col: c.col, row: c.row }; });

    // 第 2 步: 掃描全盤, 取 >=4 團
    var groups = scanConnectedComponents().filter(function (g) { return g.cells.length >= 4; });

    var addScore = 0;
    var clearCells = [];
    var leftCount = 0, rightCount = 0, offCount = 0;

    groups.forEach(function (g) {
      var n = g.cells.length;
      addScore += BASE_PER_CELL * n + (n >= 5 ? N5_BONUS : 0);
      state.stats.teamSize[sizeBucket(n)] = (state.stats.teamSize[sizeBucket(n)] || 0) + 1;
      g.cells.forEach(function (cell) {
        var kind = 'none';
        var color = cell.color;
        if (color === state.left.target) {
          if (flags.left) { state.stats.cat5++; addScore += MAXED_PTS; }
          else if (cell.col <= 2) {
            kind = 'left'; addScore += QUALIFY_PTS; decrementRemain(state.left, 1);
            state.stats.cat1++; leftCount++;
            state.stats.leftEffNum++; state.stats.leftEffDen++;
          } else {
            kind = 'offside'; state.stats.cat3++; offCount++;
            state.stats.leftEffDen++;
          }
        } else if (color === state.right.target) {
          if (flags.right) { state.stats.cat5++; addScore += MAXED_PTS; }
          else if (cell.col >= 3) {
            kind = 'right'; addScore += QUALIFY_PTS; decrementRemain(state.right, 1);
            state.stats.cat2++; rightCount++;
            state.stats.rightEffNum++; state.stats.rightEffDen++;
          } else {
            kind = 'offside'; state.stats.cat4++; offCount++;
            state.stats.rightEffDen++;
          }
        } else {
          state.stats.cat5++;
        }
        clearCells.push({ col: cell.col, row: cell.row, color: color, kind: kind });
      });
    });

    state.score += Math.round(addScore * multiplier);
    state.stats.totalCleared += clearCells.length;

    // 第 3 步結束後的第 4 步: 一次性清除, 無沉降
    clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
    survivors = survivors.filter(function (s) { return !clearCells.some(function (c) { return c.col === s.col && c.row === s.row; }); });
    recomputeClusterDisplay();

    state.settlement = {
      flags: flags, multiplier: multiplier,
      survivors: survivors,
      clearCells: clearCells, leftCount: leftCount, rightCount: rightCount, offCount: offCount,
      clearTimer: clearCells.length ? CLEAR_DURATION : 0,
      clearDuration: clearCells.length ? CLEAR_DURATION : 0,
      stage: 'clear',
      expansionQueue: [],
      currentExpansion: null,
      currentPick: null,
      pickHoldTimer: 0
    };
    state.mode = 'settle';
  }

  function beginAdvancePhase() {
    var s = state.settlement;
    // 第 5 步: 階段推進(先左後右)
    advanceIfNeeded(state.left);
    advanceIfNeeded(state.right);
    // 第 6 步: 建立延展佇列(E<A, 先左後右)
    var queue = [];
    if (state.left.E < state.left.A) queue.push('left');
    if (state.right.E < state.right.A) queue.push('right');
    s.expansionQueue = queue;
    processNextExpansionOrEnd();
  }

  function processNextExpansionOrEnd() {
    var s = state.settlement;
    if (!s.expansionQueue.length) { finalizeSettlement(); return; }
    var sideKey = s.expansionQueue.shift();
    executeExpansion(sideKey);
  }

  function executeExpansion(sideKey) {
    var s = state.settlement;
    var side = state[sideKey];
    var order = state.left.E + state.right.E + 1;
    var k = K_SEQUENCE[order - 1];
    var newCol;
    if (sideKey === 'left') { state.colMin -= 1; newCol = state.colMin; }
    else { state.colMax += 1; newCol = state.colMax; }

    var colsRange = sideKey === 'left' ? range(state.colMin, 2) : range(3, state.colMax);
    var filledColsBefore = 0;
    var trimCols = [];
    var trimCells = [];
    var total = 0;
    colsRange.forEach(function (c) {
      var filled = columnFilledDesc(c);
      if (filled.length) filledColsBefore++;
      var toRemove = filled.slice(0, k);
      toRemove.forEach(function (r) {
        var cell = getCell(c, r);
        trimCells.push({ col: c, row: r, color: cell ? cell.color : 'A' });
        setCellNull(c, r);
      });
      total += toRemove.length;
      trimCols.push({ col: c, rows: toRemove });
      s.survivors = s.survivors.filter(function (sv) { return !(sv.col === c && toRemove.indexOf(sv.row) >= 0); });
    });
    state.stats.trimTotal += total;

    var isFullWidthBonus = (order === 4);
    if (isFullWidthBonus) state.score += FULLWIDTH_BONUS;

    side.E += 1;
    recomputeClusterDisplay();

    var logEntry = {
      order: order, side: sideKey, pieces: state.stats.totalPieces, seconds: state.time,
      width: state.colMax - state.colMin + 1,
      leftCols: 2 - state.colMin + 1, rightCols: state.colMax - 2,
      k: k, trimmed: total, filledCols: filledColsBefore,
      pick: null
    };
    state.stats.expansions.push(logEntry);

    s.currentExpansion = {
      side: sideKey, col: newCol, order: order, k: k, total: total, cols: trimCols,
      trimCells: trimCells, bonus: isFullWidthBonus,
      timer: EXPAND_DURATION, t: 0, logEntry: logEntry
    };
    s.stage = 'expand';
  }

  function afterExpansionDisplay() {
    var s = state.settlement;
    var sideKey = s.currentExpansion.side;
    var side = state[sideKey];
    if (side.A === 1) {
      beginPick(sideKey);
    } else {
      logExpansionLine(s.currentExpansion.logEntry);
      s.currentExpansion = null;
      processNextExpansionOrEnd();
    }
  }

  function beginPick(sideKey) {
    var s = state.settlement;
    var side = state[sideKey];
    var other = sideKey === 'left' ? state.right : state.left;
    var candidates = COLORS.filter(function (c) { return c !== other.target; });
    s.currentPick = {
      side: sideKey, candidates: candidates, current: side.target,
      selectedIndex: -1, phase: 'open', remain: PICK_DURATION
    };
    s.stage = 'pickWait';
  }

  function resolvePick(isTimeout) {
    var s = state.settlement;
    var p = s.currentPick;
    var idx = isTimeout ? Math.floor(Math.random() * 2) : p.selectedIndex;
    p.selectedIndex = idx;
    p.phase = isTimeout ? 'timeout' : 'picked';
    var side = state[p.side];
    var oldColor = side.target;
    var newColor = p.candidates[idx];
    side.target = newColor;
    side.justChangedTimer = NEW_BADGE_TIME;

    var logEntry = s.currentExpansion.logEntry;
    logEntry.pick = { changed: oldColor !== newColor, from: oldColor, to: newColor, method: isTimeout ? '逾時' : '玩家' };
    logExpansionLine(logEntry);

    s.pickHoldTimer = PICK_HOLD;
    s.stage = 'pickHold';
  }

  function afterPickResolved() {
    var s = state.settlement;
    s.currentExpansion = null;
    s.currentPick = null;
    processNextExpansionOrEnd();
  }

  function finalizeSettlement() {
    var s = state.settlement;
    var lockout = false;
    if (s.survivors.length > 0) {
      lockout = s.survivors.every(function (c) { return c.row >= SPAWN_ROW; });
    }
    var blockout = false;
    if (!lockout) {
      var spawnCells = computeSpawnCells(state.nextPiece, state.colMin, state.colMax);
      blockout = spawnCells.some(function (c) { return !!getCell(c.col, c.row); });
    }
    if (lockout || blockout) { endGame(lockout ? 'lockout' : 'blockout'); return; }

    state.settlement = null;
    state.mode = 'playing';
    if (state.pauseRequested) { state.pauseRequested = false; state.paused = true; }
    spawnNextAsCurrent();
  }

  function updateSettlement(dt) {
    var s = state.settlement;
    if (!s) return;
    switch (s.stage) {
      case 'clear':
        s.clearTimer -= dt;
        if (s.clearTimer <= 0) beginAdvancePhase();
        break;
      case 'expand':
        s.currentExpansion.timer -= dt;
        s.currentExpansion.t = Math.max(0, Math.min(1, 1 - s.currentExpansion.timer / EXPAND_DURATION));
        if (s.currentExpansion.timer <= 0) afterExpansionDisplay();
        break;
      case 'pickWait':
        s.currentPick.remain -= dt;
        if (s.currentPick.remain <= 0) resolvePick(true);
        break;
      case 'pickHold':
        s.pickHoldTimer -= dt;
        if (s.pickHoldTimer <= 0) afterPickResolved();
        break;
    }
  }

  function isPicking() {
    return state.mode === 'settle' && state.settlement &&
      (state.settlement.stage === 'pickWait' || state.settlement.stage === 'pickHold');
  }
  // t 凍結只在「等待玩家/逾時做決定」的 3.0 秒視窗內; 選定後的視覺停留(pickHold, 非規格數值)
  // 不屬於改選子階段本身, 不應額外偷走玩家的局長, 故 t 於 pickHold 期間照常推進。
  function isPickWaiting() {
    return state.mode === 'settle' && state.settlement && state.settlement.stage === 'pickWait';
  }

  function selectPick(idx) {
    var s = state.settlement;
    if (!s || s.stage !== 'pickWait') return;
    s.currentPick.selectedIndex = idx;
    resolvePick(false);
  }

  /* ---------------------------------------------------------------
   * console 輸出
   * ------------------------------------------------------------- */
  function logExpansionLine(e) {
    var pickText = e.pick ? ('是 ' + e.pick.from + '→' + e.pick.to + '(' + e.pick.method + ')') : '否';
    console.log('[延展] 第' + e.order + '次 側=' + (e.side === 'left' ? '左' : '右') +
      ' 塊數=' + e.pieces + ' 秒數=' + e.seconds.toFixed(1) +
      ' 寬度=' + e.width + ' 兩側欄數=' + e.leftCols + '|' + e.rightCols +
      ' K=' + e.k + ' 削除格數=' + e.trimmed + ' 有格位欄數=' + e.filledCols +
      ' 改選:' + pickText);
  }

  function finalHeights() {
    var out = {};
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      var top = 0;
      if (arr) { for (var i = arr.length - 1; i >= 0; i--) { if (arr[i]) { top = i + 1; break; } } }
      out[c] = top;
    }
    return out;
  }
  function finalClosedHoles() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      if (!arr) continue;
      var top = 0;
      for (var i = arr.length - 1; i >= 0; i--) { if (arr[i]) { top = i + 1; break; } }
      for (var r = 1; r < top; r++) { if (!arr[r - 1]) total++; }
    }
    return total;
  }

  function printSummary(reason) {
    var st = state.stats;
    var reasonText = reason === 'lockout' ? 'lock out' : reason === 'blockout' ? 'block out' : '玩家放棄';
    var expLines = [1, 2, 3, 4].map(function (i) {
      var e = st.expansions[i - 1];
      return e ? ('第' + i + '次(' + (e.side === 'left' ? '左' : '右') + '):第' + e.pieces + '塊/' + e.seconds.toFixed(1) + 's')
        : ('第' + i + '次:—');
    });
    var mergedNum = st.leftEffNum + st.rightEffNum;
    var mergedDen = st.leftEffDen + st.rightEffDen;

    console.log('===== 本局結束彙整 =====');
    console.log('結束原因:', reasonText, ' 總塊數:', st.totalPieces, ' 總秒數:', state.time.toFixed(1));
    console.log('硬降使用率:', st.totalPieces > 0 ? (st.hardDropLocks / st.totalPieces * 100).toFixed(1) + '%' : '—');
    console.log('四次延展:', expLines.join(' | '));
    console.log('已解鎖欄數:', unlockedCols(), '/4', ' 本局昂貴側:', state.left.expensive ? '左' : '右');
    console.log('消除總顆數:', st.totalCleared,
      ' 每塊期望消除顆數E:', st.totalPieces > 0 ? (st.totalCleared / st.totalPieces).toFixed(3) : '—');
    console.log('顆數五分類[①左合格 ②右合格 ③左目標落右半 ④右目標落左半 ⑤非目標色]:',
      st.cat1, st.cat2, st.cat3, st.cat4, st.cat5, ' 合計=', st.cat1 + st.cat2 + st.cat3 + st.cat4 + st.cat5);
    console.log('分邊效率 左:', fmtEff(st.leftEffNum, st.leftEffDen), ' 右:', fmtEff(st.rightEffNum, st.rightEffDen),
      ' 合併(主值):', fmtEff(mergedNum, mergedDen));
    console.log('左側最終: A=' + state.left.A + ' E=' + state.left.E + ' 當前階剩餘=' + (state.left.A < 2 ? currentRemain(state.left) : '—'));
    console.log('右側最終: A=' + state.right.A + ' E=' + state.right.E + ' 當前階剩餘=' + (state.right.A < 2 ? currentRemain(state.right) : '—'));
    console.log('消除團大小分佈[4/5/6/7+]:', JSON.stringify(st.teamSize));
    console.log('延展獎勵削除總格數:', st.trimTotal);
    console.log('各欄最終高度:', JSON.stringify(finalHeights()));
    console.log('最終封閉洞數:', finalClosedHoles());
    console.log('最終分數:', state.score);
    console.log('=========================');
  }

  /* ---------------------------------------------------------------
   * 遊戲結束 / 重開
   * ------------------------------------------------------------- */
  function endGame(reason) {
    if (state.mode === 'over') return;
    state.mode = 'over';
    state.paused = false;
    state.piece = null;
    state.settlement = null;
    state.pauseRequested = false;
    var isBest = reason !== 'abandon' && (state.best === null || state.score > state.best);
    if (isBest) state.best = state.score;
    state.gameOverInfo = {
      score: state.score, seconds: state.time, unlocked: unlockedCols(),
      reason: reason, isBest: isBest
    };
    printSummary(reason);
  }

  function makeSide(isExpensive, color) {
    var need = isExpensive ? EXPENSIVE_NEED : CHEAP_NEED;
    return {
      expensive: isExpensive, target: color, A: 0, E: 0,
      need1: need[0], need2: need[1], remain1: need[0], remain2: null,
      justChangedTimer: 0
    };
  }

  function freshStats() {
    return {
      totalPieces: 0, hardDropLocks: 0, totalCleared: 0,
      cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0,
      leftEffNum: 0, leftEffDen: 0, rightEffNum: 0, rightEffDen: 0,
      teamSize: {}, trimTotal: 0, expansions: []
    };
  }

  function initGame() {
    var prevBest = state ? state.best : null;
    state = {
      colorBag: [], shapeBag: [],
      colMin: 0, colMax: 5,
      grid: new Map(),
      time: 0, score: 0, best: prevBest,
      mode: 'playing', paused: false, pauseRequested: false, rKeyLocked: false,
      gameOverInfo: null,
      piece: null, nextPiece: null,
      settlement: null,
      clusterDisplay: [],
      stats: freshStats()
    };
    var expensiveLeft = Math.random() < 0.5;
    var colorsShuffled = shuffle(COLORS.slice());
    var leftColor = colorsShuffled[0];
    var rightColor = colorsShuffled[1];
    state.left = makeSide(expensiveLeft, leftColor);
    state.right = makeSide(!expensiveLeft, rightColor);

    state.nextPiece = makeNextPieceData();
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
    if (state.mode === 'playing' && !state.paused && state.piece) tryMove(dir);
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
    // 結算期間凍結 DAS/ARR 計時(不歸零、不重算), 解鎖時從原本進度繼續, 避免補償性暴衝
    if (state.mode !== 'playing') return;
    input.hDas -= dt;
    var guard = 0;
    while (input.hDas <= 0 && guard < 10) {
      guard++;
      if (state.piece) tryMove(input.hActiveDir);
      input.hPhase = 'repeat';
      input.hDas += ARR;
      if (!state.piece) break;
    }
  }

  function tickMouseChase(dt) {
    if (mouse.phase === 'idle' || mouse.targetCol === null) return;
    if (state.mode !== 'playing') return;
    mouse.dasTimer -= dt;
    var guard = 0;
    while (mouse.dasTimer <= 0 && guard < 10) {
      guard++;
      if (state.piece) {
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
   * 放棄長按(真實時間, 不受暫停/改選凍結影響)
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

    if (state.left.justChangedTimer > 0) state.left.justChangedTimer = Math.max(0, state.left.justChangedTimer - dt);
    if (state.right.justChangedTimer > 0) state.right.justChangedTimer = Math.max(0, state.right.justChangedTimer - dt);

    // t 全程推進, 唯一例外是改選子階段(等待玩家決定的 3.0 秒視窗)凍結
    if (!isPickWaiting()) state.time += dt;

    tickHorizontal(dt);
    tickMouseChase(dt);

    if (state.mode === 'playing') updatePlaying(dt);
    else if (state.mode === 'settle') updateSettlement(dt);
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
    if (state.mode === 'playing') { state.paused = true; return; }
    state.pauseRequested = !state.pauseRequested;
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
    if (e.repeat) return;
    var code = normalizeKey(e.key);
    if (!code) return;
    if (code === 'pause') { handlePauseKey(); return; }
    if (code === 'r') { handleRKeyDown(); return; }
    if (state.paused) return;
    if (state.mode === 'over') return;
    if (isPicking()) {
      if (code === 'left') selectPick(0);
      else if (code === 'right') selectPick(1);
      return;
    }
    switch (code) {
      case 'left': startHorizontal(-1); break;
      case 'right': startHorizontal(1); break;
      case 'cw': requestRotate('cw'); break;
      case 'ccw': requestRotate('ccw'); break;
      case '180': requestRotate('180'); break;
      case 'soft': if (state.mode === 'playing') input.softDown = true; break;
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
  function pointInRect(pt, r) { return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h; }

  function xToCol(x) { return Math.floor((x - Art.metrics.midX) / Art.metrics.cell) + 3; }

  function onMouseMove(e, canvas) {
    if (state.paused || state.mode === 'over' || state.mode !== 'playing') return;
    var pt = toCanvasPoint(e, canvas);
    var col = xToCol(pt.x);
    col = Math.max(state.colMin, Math.min(state.colMax, col));
    if (mouse.targetCol === null) mouse.targetCol = col;
    var atRest = (mouse.phase === 'idle');
    if (col !== mouse.targetCol) {
      mouse.targetCol = col;
      if (atRest) {
        mouse.dasTimer = DAS;
        mouse.phase = 'wait';
        if (state.piece) {
          var center = pieceCenterCol(state.piece);
          if (center !== col) tryMove(center < col ? 1 : -1);
        }
      }
    }
  }

  function onMouseDown(e, canvas) {
    var pt = toCanvasPoint(e, canvas);
    if (state.mode === 'over') {
      if (e.button === 0 && pointInRect(pt, Art.restartHitbox())) restartGame();
      return;
    }
    if (state.paused) return;
    if (isPicking()) {
      if (e.button === 0) {
        var boxes = Art.pickHitboxes(state.settlement.currentPick.side);
        if (pointInRect(pt, boxes[0])) selectPick(0);
        else if (pointInRect(pt, boxes[1])) selectPick(1);
      }
      return;
    }
    if (state.mode !== 'playing') return;
    if (e.button === 0) requestRotate('cw');
    else if (e.button === 1) requestRotate('180');
    else if (e.button === 2) requestHardDrop();
  }

  function onWheel(e) {
    if (state.paused || state.mode === 'over' || isPicking()) return;
    if (state.mode !== 'playing') return;
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
    if (state.mode === 'settle') return isPickWaiting() ? 'picking' : 'settle';
    return 'playing';
  }

  function render(ctx) {
    Art.drawBackground(ctx);
    Art.drawBoard(ctx, {
      minCol: state.colMin, maxCol: state.colMax,
      newCols: (state.settlement && state.settlement.stage === 'expand') ? [state.settlement.currentExpansion.col] : [],
      newColT: (state.settlement && state.settlement.stage === 'expand') ? state.settlement.currentExpansion.t : 0
    });

    // 已鎖定格位
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var row = 1; row <= arr.length; row++) {
        var cell = arr[row - 1];
        if (!cell) continue;
        Art.drawCell(ctx, { col: col, row: row, color: cell.color, mark: null, markT: 0 });
      }
    }
    // 消除中標記(獨立於 grid, grid 已即時清空)
    if (state.mode === 'settle' && state.settlement && state.settlement.stage === 'clear' && state.settlement.clearCells.length) {
      var cdur = state.settlement.clearDuration || CLEAR_DURATION;
      var ct = cdur > 0 ? Math.max(0, Math.min(1, 1 - state.settlement.clearTimer / cdur)) : 1;
      state.settlement.clearCells.forEach(function (c) {
        Art.drawCell(ctx, { col: c.col, row: c.row, color: c.color, mark: 'clear', markT: ct });
      });
    }
    // 獎勵削除中標記
    if (state.mode === 'settle' && state.settlement && state.settlement.stage === 'expand') {
      var ce = state.settlement.currentExpansion;
      ce.trimCells.forEach(function (c) {
        Art.drawCell(ctx, { col: c.col, row: c.row, color: c.color, mark: 'trim', markT: ce.t });
      });
    }

    if (!state.paused) {
      state.clusterDisplay.forEach(function (cd) { Art.drawClusterCount(ctx, cd); });
    }

    if (state.piece && !state.paused && state.mode === 'playing') {
      var ghostCells = computeGhost();
      if (ghostCells) Art.drawGhost(ctx, { cells: ghostCells });
      Art.drawPiece(ctx, {
        cells: state.piece.cells.map(function (c) { return { col: state.piece.anchorCol + c.x, row: state.piece.anchorRow + c.y, color: c.color }; }),
        phase: piecePhase(state.piece),
        lockT: state.piece.inLockDelay ? Math.max(0, Math.min(1, 1 - state.piece.lockTimer / LOCK_DELAY)) : 0
      });
    }

    Art.drawMidline(ctx, {});

    if (state.mode === 'settle' && state.settlement && state.settlement.stage === 'clear' && state.settlement.clearCells.length) {
      var s = state.settlement;
      var dur = s.clearDuration || CLEAR_DURATION;
      var t = dur > 0 ? Math.max(0, Math.min(1, 1 - s.clearTimer / dur)) : 1;
      Art.drawClearMark(ctx, { cells: s.clearCells, leftCount: s.leftCount, rightCount: s.rightCount, offCount: s.offCount, t: t });
    }
    if (state.mode === 'settle' && state.settlement && state.settlement.stage === 'expand') {
      var ce2 = state.settlement.currentExpansion;
      Art.drawExpandEvent(ctx, { side: ce2.side, col: ce2.col, order: ce2.order, t: ce2.t });
      Art.drawTrimEffect(ctx, { side: ce2.side, k: ce2.k, total: ce2.total, cols: ce2.cols, t: ce2.t });
      if (ce2.bonus) Art.drawFullWidthBonus(ctx, { t: ce2.t });
    }

    Art.drawHud(ctx, {
      score: state.score, best: state.best, time: state.time,
      multiplier: 1 + MULT_PER_COL * unlockedCols(), width: state.colMax - state.colMin + 1,
      status: hudStatus()
    });
    Art.drawNextPreview(ctx, { cells: state.nextPiece.cells, masked: state.paused });

    ['left', 'right'].forEach(function (sideKey) {
      var side = state[sideKey];
      Art.drawTargetColor(ctx, { side: sideKey, color: side.target, masked: state.paused, justChanged: side.justChangedTimer > 0 });
    });
    Art.drawExpensiveSide(ctx, { side: state.left.expensive ? 'left' : 'right' });
    ['left', 'right'].forEach(function (sideKey) {
      var side = state[sideKey];
      Art.drawUnlockProgress(ctx, {
        side: sideKey, A: side.A, E: side.E,
        remain: side.A < 2 ? currentRemain(side) : 0,
        need: side.A < 2 ? currentNeed(side) : 1,
        masked: state.paused
      });
    });
    ['left', 'right'].forEach(function (sideKey) {
      var side = state[sideKey];
      Art.drawPendingExpand(ctx, { side: sideKey, pending: side.E < side.A, t: state.time });
    });

    if (isPicking()) {
      var p = state.settlement.currentPick;
      Art.drawColorPick(ctx, {
        side: p.side, candidates: p.candidates, current: p.current,
        selectedIndex: p.selectedIndex, phase: p.phase, remain: Math.max(0, p.remain)
      });
    }

    if (input.abandonHolding && !input.abandonTriggered && state.mode !== 'over') {
      Art.drawAbandonGauge(ctx, { progress: abandonProgress() });
    }

    if (state.paused) Art.drawPauseOverlay(ctx, {});
    if (state.mode === 'over') {
      Art.drawGameOver(ctx, state.gameOverInfo);
    }
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

    input = {
      hActiveDir: 0, hPhase: 'idle', hDas: 0, leftDown: false, rightDown: false, softDown: false,
      abandonHolding: false, abandonStart: 0, abandonTriggered: false
    };
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
      if (rawDt > MAX_FRAME_DT) rawDt = MAX_FRAME_DT; // 切分頁回來不瞬移
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
