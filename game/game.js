/* 史萊姆擴張 - 遊戲邏輯 (spec.md v15 / guide.md v15)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理。
 * 座標約定: 絕對欄 col(全局不重編號), 列 row(1 = 最底列, 20、21 為緩衝列,
 * 22 以上無硬界)。盤面不做系統性重力沉降, 唯一位移來源是玩家消掉重力球
 * 觸發的重力事件(剛體整體下落, 逐塊演出)。v15: 單一任務軌(開地 x4 →
 * 多樣化任務不設上限), 新外型 3 種, 重力下落動畫依落距演出。
 */
(function () {
  'use strict';

  /* 佔位圖形: 本作規格物件全部由 Art 涵蓋, 無需佔位幾何。 */
  var Placeholder = {};

  /* ---------------------------------------------------------------
   * 常數(數值參數表, spec.md v15)
   * ------------------------------------------------------------- */
  var COLORS = ['A', 'B', 'C'];

  var SHAPES = {
    I: { N: 4, width: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
    O: { N: 2, width: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    T: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] },
    J: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }] },
    L: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] },
    S: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }] },
    Z: { N: 3, width: 3, cells: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }] },
    V: { N: 2, width: 2, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
    U: { N: 3, width: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }] },
    X: { N: 3, width: 3, cells: [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }] }
  };
  var BASE_SHAPE_KEYS = ['I', 'O', 'T', 'J', 'L', 'S', 'Z'];
  var NEW_SHAPE_ORDER = ['V', 'U', 'X']; // 對應 大團 -> 雙消 -> 重力下落
  var NEW_SHAPE_NAME = { V: '角形', U: '杯形', X: '十字形' };

  var I_WIDTH_FIX = 4; // I 形 spawn 實際佔格寬(bounding box), width 欄位另外覆蓋供 spawn 計算
  SHAPES.I.width = I_WIDTH_FIX;

  var EXPAND_ORDER = ['left', 'right', 'left', 'right'];
  var DIG_REQ = [3, 5, 7, 9]; // v15 定案, 合計 24

  var BASE_PER_CELL = 25;
  var N5_BONUS = 25;
  var QUALIFY_PTS = 12;
  var FULLWIDTH_BONUS = 1500;
  var MULT_PER_COL = 0.15;
  var MULT_PER_UNLOCK = 0.25;
  var MULT_CAP = 2.5;

  var FALL_BASE = 4.0;
  var FALL_DOUBLE_T = 290;
  var FALL_CAP_BASE = 6.0;
  var FALL_G_STEP = 0.5;
  var FALL_G_CAP = 2;
  var SOFT_SPEED = 12;

  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 1;

  var DAS = 0.1;
  var ARR = 0.033;

  var ABANDON_HOLD = 1.0;

  var CLEAR_DURATION = 0.4;
  var EXTRA_CLEAR_DURATION = 0.4;
  var EXPAND_DURATION = 1.2;
  var REWARD_DURATION = 1.2;

  var GRAV_PER_CELL = 0.06;
  var GRAV_MIN_BLOCK = 0.15;
  var GRAV_LAND_PAUSE = 0.12;
  var GRAV_EVENT_CAP = 1.5;
  var GRAV_ZERO_DUR = 0.2;
  var GRAV_LARGE_THRESHOLD = 10;

  var SPAWN_ROW = 20;
  var MAX_FALL_STEPS = 21;

  var FIXED_DT = 1 / 60;
  var MAX_FRAME_DT = 0.25;
  var MAX_SUB_STEPS = 15;

  var TOTAL_GUIDE_PAGES = 8;
  var BEST_KEY = 'slimeTetris_v15_best';
  var GAME_NAME = 'WebGame_SlimeTetris';

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
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function pickColorExcluding(prev) {
    var choices = COLORS.filter(function (c) { return c !== prev; });
    return choices[Math.floor(Math.random() * choices.length)];
  }
  function loadBest() {
    try { var v = localStorage.getItem(BEST_KEY); return v ? Number(v) : null; } catch (e) { return null; }
  }
  function saveBest(v) {
    try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ }
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function timestampName() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }

  /* ---------------------------------------------------------------
   * 任務序列(寫死於 spec「任務軌」): k = 任務序號(1 起)
   * ------------------------------------------------------------- */
  function taskKindFor(k) {
    if (k <= 4) return 'dig';
    var idx = (k - 5) % 3;
    return idx === 0 ? 'big' : (idx === 1 ? 'double' : 'gravity');
  }
  function taskRequiredFor(k) {
    if (k <= 4) return DIG_REQ[k - 1];
    var kind = taskKindFor(k);
    if (kind === 'gravity') return 1;
    var c = Math.floor((k - 5) / 3) + 1;
    return c;
  }

  /* ---------------------------------------------------------------
   * 全域狀態
   * ------------------------------------------------------------- */
  var state = null;
  var input = null;

  /* ---------------------------------------------------------------
   * 顏色 / 形狀 / 重力球 bag
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

  // 形狀 bag: 原 7 種各 1 張 + 每種已解鎖新外型各 2 張; 解鎖從下一個 bag 起生效;
  // 首發保證: 解鎖後第一個 bag, 新外型各取 1 張排在最前面(依解鎖順序)。
  function refillShapeBag() {
    var arr = BASE_SHAPE_KEYS.slice();
    state.unlockedShapes.forEach(function (k) { arr.push(k); arr.push(k); });
    var guarantee = state.shapeBagGuaranteePending.slice();
    state.shapeBagGuaranteePending = [];
    guarantee.forEach(function (k) {
      var idx = arr.indexOf(k);
      if (idx >= 0) arr.splice(idx, 1);
    });
    shuffle(arr);
    // 前面插入保證張(依解鎖順序), 其餘照常洗牌後接續
    state.shapeBag = arr.concat(); // 之後用 pop() 取牌, 故保證張要放在陣列尾端(pop 先出)
    // guarantee 依解鎖順序應第 1、2 張被抽到 -> 陣列尾端由後往前放
    for (var i = 0; i < guarantee.length; i++) state.shapeBag.push(guarantee[guarantee.length - 1 - i]);
  }
  function drawShape() {
    if (!state.shapeBag.length) refillShapeBag();
    return state.shapeBag.pop();
  }

  // 重力球 bag: 每 8 塊一組, 洗牌決定組內哪一塊含球; 保證不連續(跨組相鄰則重洗)。
  function refillBallBag() {
    var idx;
    do { idx = Math.floor(Math.random() * 8); } while (state.ballState.groupPrevLastTrue && idx === 0);
    var q = new Array(8);
    for (var i = 0; i < 8; i++) q[i] = (i === idx);
    state.ballState.bagQueue = q;
    state.ballState.bagPos = 0;
    state.ballState.groupPrevLastTrue = (idx === 7);
  }
  function decideNextBall() {
    var b = state.ballState;
    if (b.bagPos >= b.bagQueue.length) refillBallBag();
    return b.bagQueue[b.bagPos++];
  }

  function makeNextPieceData() {
    var shapeKey = drawShape();
    var shape = SHAPES[shapeKey];
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y, color: null, ball: false }; });
    // 填入順序寫死: y 小者在前, y 同則 x 小者在前
    var order = localCells.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    var hasBall = decideNextBall();
    if (hasBall) {
      var idx = Math.floor(Math.random() * order.length);
      order[idx].ball = true;
    }
    order.forEach(function (c) { if (!c.ball) c.color = drawColor(); });
    if (isNewShape(shapeKey)) {
      state.stats.shapeDealCount[shapeKey] = (state.stats.shapeDealCount[shapeKey] || 0) + 1;
    }
    return { shapeKey: shapeKey, cells: localCells, hasBall: hasBall };
  }
  function isNewShape(key) { return key === 'V' || key === 'U' || key === 'X'; }

  function spawnAnchorCol(shapeKey, colMin, colMax) {
    var shape = SHAPES[shapeKey];
    var w = colMax - colMin + 1;
    return colMin + Math.floor((w - shape.width) / 2);
  }

  function instantiatePiece(data) {
    var anchorCol = spawnAnchorCol(data.shapeKey, state.colMin, state.colMax);
    return {
      shapeKey: data.shapeKey, N: SHAPES[data.shapeKey].N,
      cells: data.cells.map(function (c) { return { x: c.x, y: c.y, color: c.color, ball: c.ball }; }),
      anchorCol: anchorCol, anchorRow: SPAWN_ROW,
      fallProgress: 0, inLockDelay: false, lockTimer: 0, resetsUsed: 0,
      hardDropUsed: false, spawnT: state.time
    };
  }

  function computeSpawnCells(data, colMin, colMax) {
    var anchorCol = spawnAnchorCol(data.shapeKey, colMin, colMax);
    return data.cells.map(function (c) { return { col: anchorCol + c.x, row: SPAWN_ROW + c.y }; });
  }

  function spawnNextAsCurrent() {
    state.piece = instantiatePiece(state.nextPiece);
    state.stats.totalPiecesSpawned++;
    state.log.pieceSpawn.push({ index: state.stats.totalPiecesSpawned, shape: state.piece.shapeKey, cellCount: state.piece.cells.length, hasBall: state.piece.cells.some(function (c) { return c.ball; }) });
    state.nextPiece = makeNextPieceData();
  }

  /* ---------------------------------------------------------------
   * 盤面格位存取(絕對欄 -> Map, 全局不重編號; 延展只改變 colMin/colMax,
   * 不搬動任何既有格位)
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
  function columnTop(col) {
    var arr = state.grid.get(col);
    if (!arr) return 0;
    for (var i = arr.length - 1; i >= 0; i--) { if (arr[i]) return i + 1; }
    return 0;
  }
  function sumColHeights() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) total += columnTop(c);
    return total;
  }
  function filledCount() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) if (arr[i]) total++;
    }
    return total;
  }
  function closedHolesCount() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) {
      var top = columnTop(c);
      var arr = state.grid.get(c);
      for (var r = 1; r < top; r++) { if (!arr || !arr[r - 1]) total++; }
    }
    return total;
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
   * 旋轉(繞框中心旋轉, 通用於原 7 種與新 3 種; O 形 / 十字形的顏色矩陣
   * 因此自動真實旋轉, 不需特例判斷)。簡化踢牆: 原地 -> 左1 -> 右1。
   * ------------------------------------------------------------- */
  function rotateCellsList(cells, N, dir) {
    return cells.map(function (c) {
      var nx, ny;
      if (dir === 'cw') { nx = c.y; ny = N - 1 - c.x; }
      else if (dir === 'ccw') { nx = N - 1 - c.y; ny = c.x; }
      else { nx = N - 1 - c.x; ny = N - 1 - c.y; } // 180
      return { x: nx, y: ny, color: c.color, ball: c.ball };
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

  function computeGhostRow(piece) {
    var row = piece.anchorRow;
    var guard = 0;
    while (!collideCells(piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row - 1 + c.y }; })) && guard < 400) { row -= 1; guard++; }
    return row;
  }
  function computeGhost() {
    var piece = state.piece;
    if (!piece) return null;
    var row = computeGhostRow(piece);
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row + c.y, ball: c.ball, color: c.color }; });
  }

  function currentFallSpeed() {
    var g = Math.min(Math.max(0, state.E - 4), FALL_G_CAP);
    var base = FALL_BASE * Math.pow(2, state.time / FALL_DOUBLE_T) + FALL_G_STEP * g;
    var cap = FALL_CAP_BASE + FALL_G_STEP * g;
    return Math.min(base, cap);
  }

  function unlockedCols() { return (state.colMax - state.colMin + 1) - 6; }
  function computeMultiplier() {
    var m = 1.0 + MULT_PER_COL * unlockedCols() + MULT_PER_UNLOCK * (state.multCount || 0);
    return Math.min(m, MULT_CAP);
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
    if (!state.piece) return;
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
    if (!piece) return 'falling';
    if (piece.inLockDelay) return 'lockDelay';
    if (input.softDown) return 'softDrop';
    return 'falling';
  }

  /* ---------------------------------------------------------------
   * 連通塊掃描(共用 BFS 核心, 依 isNode(col,row) 決定成員資格)
   * ------------------------------------------------------------- */
  function scanComponentsByPredicate(isNode) {
    var visited = Object.create(null);
    var comps = [];
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var row = 1; row <= arr.length; row++) {
        var key = col + '_' + row;
        if (visited[key]) continue;
        if (!isNode(col, row)) continue;
        var stack = [[col, row]];
        visited[key] = true;
        var cells = [];
        while (stack.length) {
          var cur = stack.pop(); var c = cur[0], r = cur[1];
          var cell = getCell(c, r);
          cells.push({ col: c, row: r, color: cell.color });
          var nbs = [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]];
          for (var i = 0; i < 4; i++) {
            var nc = nbs[i][0], nr = nbs[i][1];
            if (nc < state.colMin || nc > state.colMax || nr < 1) continue;
            var nk = nc + '_' + nr;
            if (visited[nk]) continue;
            if (!isNode(nc, nr)) continue;
            visited[nk] = true;
            stack.push([nc, nr]);
          }
        }
        comps.push(cells);
      }
    }
    return comps;
  }
  function connectedAllComponents() {
    return scanComponentsByPredicate(function (c, r) { return !!getCell(c, r); });
  }

  function anchorOf(cells) {
    var best = cells[0];
    for (var i = 1; i < cells.length; i++) {
      var c = cells[i];
      if (c.row > best.row || (c.row === best.row && c.col < best.col)) best = c;
    }
    return best;
  }

  /* ---------------------------------------------------------------
   * 成團掃描程序(寫死): 每輪對每個顏色做「該色 + 未認領的球」連通,
   * 取候選團, 依仲裁順位選 1 個認領, 反覆直到無候選團。
   * ------------------------------------------------------------- */
  function scanClearGroups() {
    var claimed = Object.create(null);
    var results = [];
    while (true) {
      var candidates = [];
      COLORS.forEach(function (col0) {
        var comps = scanComponentsByPredicate(function (c, r) {
          var key = c + '_' + r;
          if (claimed[key]) return false;
          var cell = getCell(c, r);
          if (!cell) return false;
          return cell.color === col0 || cell.color === 'ball';
        });
        comps.forEach(function (comp) {
          var trueCount = comp.filter(function (x) { return x.color === col0; }).length;
          if (comp.length >= 4 && trueCount >= 1) candidates.push({ color: col0, cells: comp, trueCount: trueCount, size: comp.length });
        });
      });
      if (!candidates.length) break;
      var winner = candidates[0];
      for (var i = 1; i < candidates.length; i++) { if (isBetterCandidate(candidates[i], winner)) winner = candidates[i]; }
      winner.cells.forEach(function (c) { claimed[c.col + '_' + c.row] = true; });
      results.push(winner);
    }
    return results;
  }
  function isBetterCandidate(a, b) {
    if (a.trueCount !== b.trueCount) return a.trueCount > b.trueCount;
    if (a.size !== b.size) return a.size > b.size;
    var aa = anchorOf(a.cells), bb = anchorOf(b.cells);
    if (aa.row !== bb.row) return aa.row > bb.row;
    return aa.col < bb.col;
  }

  /* ---------------------------------------------------------------
   * 懸空結構(常駐標示 與 重力事件 共用同一條定義)
   * ------------------------------------------------------------- */
  function isFloatingBlock(cells) {
    var set = Object.create(null);
    cells.forEach(function (c) { set[c.col + '_' + c.row] = true; });
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var nr = c.row - 1;
      if (nr < 1) return false;
      var k = c.col + '_' + nr;
      if (set[k]) continue;
      if (getCell(c.col, nr)) return false;
    }
    return true;
  }
  function recomputeFloating() {
    var comps = connectedAllComponents();
    var out = [];
    comps.forEach(function (comp) { if (isFloatingBlock(comp)) out.push(comp); });
    state.floatingBlocks = out.map(function (comp) {
      var a = anchorOf(comp);
      var id = Math.abs(a.col * 131 + a.row * 677);
      return { id: id, cells: comp.map(function (c) { return { col: c.col, row: c.row }; }) };
    });
  }

  /* ---------------------------------------------------------------
   * 重力事件: 種子 -> 受影響連通塊(全部已填格位, 不分色) -> 懸空判定
   * -> 剛體整體下落到底(逐塊, 依規則順序), 回傳可供逐塊動畫演出的計畫。
   * ------------------------------------------------------------- */
  function computeSeeds(origCells) {
    var seedKeys = Object.create(null);
    var seeds = [];
    function add(c, r) {
      var k = c + '_' + r;
      if (seedKeys[k]) return;
      seedKeys[k] = true;
      seeds.push({ col: c, row: r });
    }
    origCells.forEach(function (oc) {
      if (getCell(oc.col, oc.row)) add(oc.col, oc.row); // 已被同結算較早事件填入者亦納入
      var nbs = [[oc.col - 1, oc.row], [oc.col + 1, oc.row], [oc.col, oc.row - 1], [oc.col, oc.row + 1]];
      nbs.forEach(function (n) {
        var nc = n[0], nr = n[1];
        if (nc < state.colMin || nc > state.colMax || nr < 1) return;
        if (!getCell(nc, nr)) return;
        add(nc, nr);
      });
    });
    return seeds;
  }

  // 實際把一個剛體塊落到底(mutate grid), 回傳落距與最終座標(供繼續計算下一塊)
  function dropBlockToBottom(cells) {
    var saved = cells.map(function (c) { return { col: c.col, row: c.row, color: getCell(c.col, c.row).color }; });
    saved.forEach(function (c) { setCellNull(c.col, c.row); });
    var delta = 0, guard = 0;
    while (guard < 200) {
      var can = saved.every(function (c) {
        var nr = c.row - 1 - delta;
        if (nr < 1) return false;
        return !getCell(c.col, nr);
      });
      if (!can) break;
      delta++; guard++;
    }
    var newCells = saved.map(function (c) { return { col: c.col, row: c.row - delta, color: c.color }; });
    newCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color }); });
    return { delta: delta, origCells: saved.map(function (c) { return { col: c.col, row: c.row, color: c.color }; }), finalCells: newCells.map(function (c) { return { col: c.col, row: c.row, color: c.color }; }) };
  }

  function updateSurvivorsAfterDrop(origCells, delta) {
    if (delta <= 0) return;
    var set = Object.create(null);
    origCells.forEach(function (c) { set[c.col + '_' + c.row] = true; });
    state.settlement.survivors.forEach(function (s) {
      if (set[s.col + '_' + s.row]) s.row -= delta;
    });
  }

  // 執行一次重力事件的完整判定(不含動畫): 以剛被清除的團之原座標為基準,
  // 依序把受影響且懸空的塊落到底(mutate grid, 判定先於動畫)。
  function runGravityEventJudgment(origCells) {
    var seeds = computeSeeds(origCells);
    var seedKeySet = Object.create(null);
    seeds.forEach(function (s) { seedKeySet[s.col + '_' + s.row] = true; });
    var allComps = connectedAllComponents();
    var affected = allComps.filter(function (comp) {
      return comp.some(function (c) { return seedKeySet[c.col + '_' + c.row]; });
    });
    var fallingComps = [], staticComps = [];
    affected.forEach(function (comp) { if (isFloatingBlock(comp)) fallingComps.push(comp); else staticComps.push(comp); });
    fallingComps.sort(function (a, b) {
      var la = Math.min.apply(null, a.map(function (c) { return c.row; }));
      var lb = Math.min.apply(null, b.map(function (c) { return c.row; }));
      if (la !== lb) return la - lb;
      var xa = Math.min.apply(null, a.map(function (c) { return c.col; }));
      var xb = Math.min.apply(null, b.map(function (c) { return c.col; }));
      return xa - xb;
    });
    var blocks = [], totalDisplaced = 0, maxDrop = 0;
    fallingComps.forEach(function (comp) {
      var drop = dropBlockToBottom(comp);
      if (drop.delta > 0) {
        totalDisplaced += comp.length;
        maxDrop = Math.max(maxDrop, drop.delta);
        updateSurvivorsAfterDrop(drop.origCells, drop.delta);
        blocks.push(drop);
      }
    });
    var staticBlocks = staticComps.map(function (comp) { return comp.map(function (c) { return { col: c.col, row: c.row }; }); });
    return { blocks: blocks, staticBlocks: staticBlocks, displaced: totalDisplaced, maxDrop: maxDrop };
  }

  /* ---------------------------------------------------------------
   * 削頂(延展獎勵, v15: 逐欄各削最上面 1 格, 4 次一律相同)
   * ------------------------------------------------------------- */
  function shaveColumnsOnce(colsRange) {
    var trimCells = [];
    colsRange.forEach(function (c) {
      var top = columnTop(c);
      if (!top) return;
      var cell = getCell(c, top);
      trimCells.push({ col: c, row: top, color: cell.color });
      setCellNull(c, top);
    });
    return trimCells;
  }

  /* ---------------------------------------------------------------
   * 結算計分與計數歸屬(共用於 4a 主消除 與 4c 追加消除)
   * task/targetColor: 本次結算第 1 步取樣的當前任務與目標色, 全程沿用。
   * isExtra: 是否為追加消除段(不推進大團 / 雙消)。
   * ------------------------------------------------------------- */
  function scoreAndCategorizeGroups(groups, task, targetColor, isExtra) {
    var addScore = 0, clearCells = [], targetCount = 0, cellCountNonBall = 0;
    var digDelta = 0, bigCount = 0, doubleTriggered = false;
    var groupLog = [];
    groups.forEach(function (g) {
      var n = g.cells.length;
      addScore += BASE_PER_CELL * n + (n >= 5 ? N5_BONUS : 0);
      state.stats.teamSize[sizeBucket(n)] = (state.stats.teamSize[sizeBucket(n)] || 0) + 1;
      var ballCount = g.cells.filter(function (c) { return c.color === 'ball'; }).length;
      if (ballCount > 0) {
        var trueCells = n - ballCount;
        state.stats.ballGroupTrueCells += trueCells;
      }
      if (n >= 5) bigCount++;
      groupLog.push({ size: n, color: g.color, ballCount: ballCount, isTargetColorGroup: task === 'dig' && g.color === targetColor });
      g.cells.forEach(function (cell) {
        if (cell.color === 'ball') {
          state.stats.ballCleared++;
          clearCells.push({ col: cell.col, row: cell.row, color: 'ball', isTarget: false });
          return;
        }
        var isTarget = task === 'dig' && cell.color === targetColor;
        if (isTarget) {
          addScore += QUALIFY_PTS;
          targetCount++;
          digDelta++;
        }
        cellCountNonBall++;
        state.stats.totalCleared++;
        clearCells.push({ col: cell.col, row: cell.row, color: cell.color, isTarget: isTarget });
      });
    });
    if (groups.length >= 2) doubleTriggered = true;
    state.stats.targetCleared += targetCount;
    if (task === 'dig') { state.stats.digPhase.cleared += cellCountNonBall; state.stats.digPhase.target += targetCount; }
    if (isExtra) { state.stats.extraClearCount++; state.stats.extraClearCells += cellCountNonBall; }
    return {
      addScore: addScore, clearCells: clearCells, targetCount: targetCount, cellCountNonBall: cellCountNonBall,
      digDelta: digDelta, bigCount: bigCount, doubleTriggered: doubleTriggered, groupLog: groupLog
    };
  }

  /* ---------------------------------------------------------------
   * 結算時序(方塊鎖定後): 見 spec.md「結算時序」1~8 步
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;

    // 第 1 步: 取樣當前任務、目標色與分數倍率, 本次結算全程沿用
    var sampledTaskKind = state.task.kind;
    var sampledColor = state.task.color;
    var multiplier = computeMultiplier();
    var widthAtLock = state.colMax - state.colMin + 1;
    var taskIndexAtLock = state.A + 1;
    var dropDistance = SPAWN_ROW - piece.anchorRow;
    var lockedCells = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow + c.y, color: c.ball ? 'ball' : c.color }; });
    lockedCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color }); });
    var heightBefore = { sumColHeight: sumColHeights(), closedHoles: closedHolesCount() };
    state.stats.totalPieces++;
    if (piece.hardDropUsed) state.stats.hardDropLocks++;
    if (piece.cells.some(function (c) { return c.ball; })) state.stats.ballSpawned++;
    var pieceIndex = state.stats.totalPiecesSpawned;
    state.log.pieceLock.push({
      index: pieceIndex, dropDistance: dropDistance, fallSpeed: Number(currentFallSpeed().toFixed(3)),
      hardDrop: piece.hardDropUsed, widthAtLock: widthAtLock, taskIndexAtLock: taskIndexAtLock, taskKindAtLock: sampledTaskKind
    });
    var pieceTiming = { index: pieceIndex, spawnT: Number(piece.spawnT.toFixed(2)), lockT: Number(state.time.toFixed(2)), settleEndT: null };
    state.log.pieceTiming.push(pieceTiming);
    state.piece = null;

    var survivors = lockedCells.map(function (c) { return { col: c.col, row: c.row }; });

    // 第 2 步
    var groups = scanClearGroups();

    // 第 3 步
    var scoreResult = scoreAndCategorizeGroups(groups, sampledTaskKind, sampledColor, false);
    state.score += Math.round(scoreResult.addScore * multiplier);
    survivors = survivors.filter(function (s) {
      return !scoreResult.clearCells.some(function (c) { return c.col === s.col && c.row === s.row; });
    });
    if (sampledTaskKind === 'dig') state.task.remaining -= scoreResult.digDelta;
    else if (sampledTaskKind === 'big') { if (scoreResult.bigCount > 0) state.task.remaining -= 1; }
    else if (sampledTaskKind === 'double') { if (scoreResult.doubleTriggered) state.task.remaining -= 1; }

    // 開地階段的多樣化被動基準(埋點): 依當前寬度分桶記錄
    if (sampledTaskKind === 'dig') {
      var wk = String(widthAtLock);
      var bucket = state.stats.diverseBaseline[wk] || (state.stats.diverseBaseline[wk] = { pieces: 0, bigCount: 0, doubleCount: 0 });
      bucket.pieces++;
      if (scoreResult.bigCount > 0) bucket.bigCount++;
      if (scoreResult.doubleTriggered) bucket.doubleCount++;
    }

    var ballGroups = groups.filter(function (g) { return g.cells.some(function (c) { return c.color === 'ball'; }); });
    ballGroups.forEach(function (g) { g.anchor = anchorOf(g.cells); });
    ballGroups.sort(function (a, b) { if (a.anchor.row !== b.anchor.row) return b.anchor.row - a.anchor.row; return a.anchor.col - b.anchor.col; });

    state.settlement = {
      pieceIndex: pieceIndex, pieceShape: piece.shapeKey, pieceTiming: pieceTiming, heightBefore: heightBefore,
      sampledTask: sampledTaskKind, sampledColor: sampledColor, multiplier: multiplier,
      survivors: survivors,
      clearCells: scoreResult.clearCells,
      clearDeducted: scoreResult.digDelta,
      // 本次結算(第一段)是否推進了當前任務進度, 供任務面板「這次算數了」閃爍使用(不限開地任務)
      taskCreditedThisSegment: sampledTaskKind === 'dig' ? scoreResult.digDelta > 0 : (sampledTaskKind === 'big' ? scoreResult.bigCount > 0 : (sampledTaskKind === 'double' ? scoreResult.doubleTriggered : false)),
      clearGroupsForDisplay: groups.map(function (g, gi) { return { cells: g.cells.map(function (c) { return { x: c.col, y: c.row }; }), counted: (sampledTaskKind === 'big' && g.cells.length >= 5) || (sampledTaskKind === 'double' && groups.length >= 2) }; }),
      clearTimer: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      clearDuration: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      stage: 'clear',
      ballGroupQueue: ballGroups,
      ballGroupIndex: 0,
      gravityMovedAny: false,
      gravityEvent: null,
      extraClear: null,
      currentExpansion: null,
      currentUnlock: null,
      currentMultiplier: null,
      taskAdvanced: null,
      firstSegmentGroups: scoreResult.groupLog,
      extraSegmentGroups: [],
      creditFlash: 0
    };

    // 4a: 一次性清除所有成立團格位
    scoreResult.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
    recomputeFloating();

    state.mode = 'settle';
    if (state.settlement.clearDuration <= 0) afterClearStage();
  }

  function afterClearStage() {
    var s = state.settlement;
    if (!s) return;
    if (s.ballGroupIndex < s.ballGroupQueue.length) beginNextGravityEvent();
    else afterAllGravityEvents();
  }

  // 建立一個重力事件的逐塊動畫計畫(判定先於動畫: judgment 已於本函式內完成)
  function beginNextGravityEvent() {
    var s = state.settlement;
    var group = s.ballGroupQueue[s.ballGroupIndex++];
    var origCells = group.cells.map(function (c) { return { col: c.col, row: c.row }; });
    var origin = group.anchor;
    var result = runGravityEventJudgment(origCells);
    state.stats.gravityTriggerCount++;

    var blocks = result.blocks.map(function (b) {
      var fallDur = Math.max(GRAV_MIN_BLOCK, b.delta * GRAV_PER_CELL);
      return { origCells: b.origCells, finalCells: b.finalCells, delta: b.delta, fallDur: fallDur, landDur: GRAV_LAND_PAUSE };
    });
    var totalDur = 0;
    blocks.forEach(function (b) { totalDur += b.fallDur + b.landDur; });
    var capped = false;
    if (totalDur > GRAV_EVENT_CAP && totalDur > 0) {
      var scale = GRAV_EVENT_CAP / totalDur;
      blocks.forEach(function (b) { b.fallDur *= scale; b.landDur *= scale; });
      capped = true;
    }

    var displaced = result.displaced;
    var kind = displaced <= 0 ? 'zero' : (displaced >= GRAV_LARGE_THRESHOLD ? 'large' : 'small');
    var countedForTask = false;
    if (displaced > 0) {
      s.gravityMovedAny = true;
      state.stats.gravityMovedCount++;
      state.stats.gravityDisplacedTotal += displaced;
      state.stats.gravityMaxDisplaced = Math.max(state.stats.gravityMaxDisplaced, displaced);
      state.stats.gravityMaxDrop = Math.max(state.stats.gravityMaxDrop, result.maxDrop);
      if (s.sampledTask === 'gravity') { state.task.remaining -= 1; countedForTask = true; }
      if (displaced >= GRAV_LARGE_THRESHOLD) {
        state.log.largeGravityEvents.push({
          pieceIndex: s.pieceIndex, groupSize: group.cells.filter(function (c) { return c.color !== 'ball'; }).length,
          groupColor: group.color, affectedBlocks: blocks.length + result.staticBlocks.length,
          displaced: displaced, maxDrop: result.maxDrop, causedAppend: false
        });
      }
    } else {
      state.stats.gravityIdleCount++;
    }
    state.log.gravityEventCalib.push({
      pieceIndex: s.pieceIndex, displaced: displaced, blockCount: blocks.length,
      perBlockDrop: blocks.map(function (b) { return b.delta; }), animSeconds: Number(Math.min(totalDur, GRAV_EVENT_CAP).toFixed(3)), capped: capped
    });

    recomputeFloating();

    s.gravityEvent = {
      origin: { col: origin.col, row: origin.row }, kind: kind, counted: countedForTask,
      blocks: blocks, staticBlocks: result.staticBlocks,
      blockIndex: 0, phase: blocks.length ? 'falling' : null, timer: 0,
      zeroTimer: kind === 'zero' ? GRAV_ZERO_DUR : 0,
      creditShown: countedForTask
    };
    s.stage = 'gravity';
  }

  function advanceGravityBlock() {
    var s = state.settlement;
    var g = s.gravityEvent;
    g.blockIndex++;
    if (g.blockIndex < g.blocks.length) { g.phase = 'falling'; g.timer = 0; }
    else {
      if (s.ballGroupIndex < s.ballGroupQueue.length) beginNextGravityEvent();
      else afterAllGravityEvents();
    }
  }

  function afterAllGravityEvents() {
    var s = state.settlement;
    s.gravityEvent = null;
    if (s.gravityMovedAny) {
      var groups2 = scanClearGroups();
      if (groups2.length) {
        var res2 = scoreAndCategorizeGroups(groups2, s.sampledTask, s.sampledColor, true);
        state.score += Math.round(res2.addScore * s.multiplier);
        res2.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
        s.survivors = s.survivors.filter(function (sv) { return !res2.clearCells.some(function (c) { return c.col === sv.col && c.row === sv.row; }); });
        if (s.sampledTask === 'dig') state.task.remaining -= res2.digDelta;
        s.extraSegmentGroups = res2.groupLog;
        // 只標記本次結算(同一 pieceIndex)推入的大型事件, 避免誤標到前一個結算留下的舊紀錄
        var lastLarge = state.log.largeGravityEvents.length ? state.log.largeGravityEvents[state.log.largeGravityEvents.length - 1] : null;
        if (lastLarge && lastLarge.pieceIndex === s.pieceIndex) lastLarge.causedAppend = true;
        recomputeFloating();
        s.extraClear = { cells: res2.clearCells, deducted: res2.digDelta, timer: EXTRA_CLEAR_DURATION, duration: EXTRA_CLEAR_DURATION };
        s.stage = 'extraclear';
        return;
      }
    }
    afterExtraClearOrSkip();
  }

  function afterExtraClearOrSkip() {
    state.settlement.extraClear = null;
    beginAdvancePhase();
  }

  // 第 5 步: 任務推進(A 的唯一發生點)
  function beginAdvancePhase() {
    var s = state.settlement;
    if (state.task.remaining <= 0) {
      var overflow = -state.task.remaining;
      var achievedIndex = state.A + 1;
      var achievedKind = state.task.kind;
      var achievedColor = state.task.color;
      var achievedReq = state.task.required;
      var achievedEnteredPieces = state.task.enteredPieces;
      var achievedEnteredSeconds = state.task.enteredSeconds;
      state.A = achievedIndex;
      var nextIndex = achievedIndex + 1;
      var nextKind = taskKindFor(nextIndex);
      var nextReq = taskRequiredFor(nextIndex);
      var nextColor = null, nextRemaining = nextReq;
      if (nextKind === 'dig') {
        if (achievedKind === 'dig') nextRemaining = Math.max(1, nextReq - overflow);
        nextColor = pickColorExcluding(achievedColor);
      }
      state.task = { kind: nextKind, color: nextColor, required: nextReq, remaining: nextRemaining, enteredPieces: state.stats.totalPieces, enteredSeconds: state.time };
      state.log.taskLog.push({
        index: achievedIndex, kind: achievedKind, color: achievedColor, required: achievedReq,
        enteredPieces: achievedEnteredPieces, enteredSeconds: Number(achievedEnteredSeconds.toFixed(2)),
        achievedPieces: state.stats.totalPieces, achievedSeconds: Number(state.time.toFixed(2)),
        reward: null
      });
      s.taskAdvanced = { achievedIndex: achievedIndex, nextIndex: nextIndex, nextKind: nextKind, nextColor: nextColor, nextRequired: nextReq };
    }
    beginRewardOrFinalize();
  }

  // 第 6 步: 獎勵事件(E 的唯一發生點)
  function beginRewardOrFinalize() {
    if (state.E < state.A) executeReward();
    else finalizeSettlement();
  }
  function executeReward() {
    var idx = state.E + 1;
    if (idx <= 4) executeExpansion(idx);
    else executeVarietyReward(idx);
  }

  function lastTaskLogEntry() { return state.log.taskLog.length ? state.log.taskLog[state.log.taskLog.length - 1] : null; }

  function executeExpansion(idx) {
    var s = state.settlement;
    var side = EXPAND_ORDER[idx - 1];
    var newCol;
    if (side === 'left') { state.colMin -= 1; newCol = state.colMin; }
    else { state.colMax += 1; newCol = state.colMax; }

    var colsRange = range(state.colMin, state.colMax);
    var sumBefore = sumColHeights();
    var holesBefore = closedHolesCount();
    var trimCells = shaveColumnsOnce(colsRange);
    state.stats.shaveTotalCells += trimCells.length;
    state.stats.ballShaved += trimCells.filter(function (c) { return c.color === 'ball'; }).length;
    s.survivors = s.survivors.filter(function (sv) { return !trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; }); });

    var isFullWidth = (idx === 4);
    if (isFullWidth) state.score += FULLWIDTH_BONUS;
    state.E += 1;
    recomputeFloating();

    var log = lastTaskLogEntry();
    if (log && log.index === idx) log.reward = { type: 'expand', side: side };

    state.log.expandCalib.push({ index: idx, shavedCells: trimCells.length, sumHeightBefore: sumBefore, sumHeightAfter: sumColHeights(), closedHolesOpened: Math.max(0, holesBefore - closedHolesCount()) });
    state.log.expandTimeline[idx - 1] = { pieces: state.stats.totalPieces, seconds: Number(state.time.toFixed(2)) };
    if (isFullWidth) { state.stats.fullWidthPieces = state.stats.totalPieces; state.stats.fullWidthSeconds = state.time; }

    var adv = s.taskAdvanced;
    s.currentExpansion = {
      side: side, col: newCol, trimCells: trimCells, bonus: isFullWidth,
      timer: EXPAND_DURATION, duration: EXPAND_DURATION, t: 0,
      next: adv ? { kind: adv.nextKind, color: adv.nextColor, required: adv.nextRequired } : null
    };
    s.stage = 'expand';
  }

  function executeVarietyReward(idx) {
    var s = state.settlement;
    var d = idx - 4;
    var log = lastTaskLogEntry();
    if (d <= 3) {
      var shapeKey = NEW_SHAPE_ORDER[d - 1];
      state.unlockedShapes.push(shapeKey);
      state.shapeBagGuaranteePending.push(shapeKey);
      state.stats.shapeUnlockInfo[shapeKey] = { unlockedPieces: state.stats.totalPieces, unlockedSeconds: state.time };
      if (log && log.index === idx) log.reward = { type: 'unlockShape', shape: shapeKey };
      state.E += 1;
      recomputeFloating();
      var adv1 = s.taskAdvanced;
      s.currentUnlock = { shape: shapeKey, timer: REWARD_DURATION, duration: REWARD_DURATION, t: 0, next: adv1 ? { kind: adv1.nextKind, color: adv1.nextColor, required: adv1.nextRequired } : null };
      s.stage = 'unlock';
    } else {
      var before = computeMultiplier();
      var capped = before >= MULT_CAP;
      if (!capped) state.multCount = (state.multCount || 0) + 1;
      state.multiplierFlash = 1;
      var after = computeMultiplier();
      if (log && log.index === idx) log.reward = { type: 'multiplier', capped: capped, value: after };
      state.E += 1;
      recomputeFloating();
      var adv2 = s.taskAdvanced;
      s.currentMultiplier = { amount: MULT_PER_UNLOCK, value: after, capped: capped, timer: REWARD_DURATION, duration: REWARD_DURATION, t: 0, next: adv2 ? { kind: adv2.nextKind, color: adv2.nextColor, required: adv2.nextRequired } : null };
      s.stage = 'multiplier';
    }
  }

  function finalizeSettlement() {
    var s = state.settlement;
    var lockout = false;
    if (s.survivors.length > 0) lockout = s.survivors.every(function (c) { return c.row >= SPAWN_ROW; });
    var blockout = false;
    if (!lockout) {
      var spawnCells = computeSpawnCells(state.nextPiece, state.colMin, state.colMax);
      blockout = spawnCells.some(function (c) { return !!getCell(c.col, c.row); });
    }

    // 校正推算用: 逐塊定版後盤面狀態
    var sumH = sumColHeights(), fc = filledCount(), ch = closedHolesCount();
    var maxColH = 0;
    for (var c = state.colMin; c <= state.colMax; c++) maxColH = Math.max(maxColH, columnTop(c));
    state.log.pieceBoardState.push({
      index: s.pieceIndex, sumColHeight: sumH, filledCount: fc, closedHoles: ch, maxColHeight: maxColH,
      closedHolesDelta: ch - s.heightBefore.closedHoles
    });
    // 滑動 20 塊回收量(最佳解讀: 每塊定版後封閉洞減少量, 負值視為 0, 20 塊滑動平均, 取最大值; 詳見回報)
    var recovered = Math.max(0, s.heightBefore.closedHoles - ch);
    state.stats.recoverWindow.push(recovered);
    if (state.stats.recoverWindow.length > 20) state.stats.recoverWindow.shift();
    if (state.stats.recoverWindow.length === 20) {
      var sum20 = state.stats.recoverWindow.reduce(function (a, b) { return a + b; }, 0);
      state.stats.maxRecoverAvg20 = Math.max(state.stats.maxRecoverAvg20, sum20 / 20);
    }
    // 逐塊: 放下後第一段消除與追加消除分開
    state.log.pieceClearGroups.push({ index: s.pieceIndex, firstSegment: s.firstSegmentGroups, extraSegment: s.extraSegmentGroups });
    // 逐塊: 新外型的每次放下清除顆數
    if (isNewShape(s.pieceShape)) {
      var total = s.firstSegmentGroups.reduce(function (a, g) { return a + (g.size - g.ballCount); }, 0) +
        s.extraSegmentGroups.reduce(function (a, g) { return a + (g.size - g.ballCount); }, 0);
      var arr = state.stats.shapeClearsPerDeal[s.pieceShape] || (state.stats.shapeClearsPerDeal[s.pieceShape] = []);
      arr.push(total);
    }
    s.pieceTiming.settleEndT = Number(state.time.toFixed(2));

    if (lockout || blockout) { endGame(lockout ? 'lockout' : 'blockout'); return; }

    state.settlement = null;
    state.mode = 'playing';
    spawnNextAsCurrent();
    applyQueuedInput();
  }

  function applyQueuedInput() {
    if (state.queuedInput === 'guide') {
      state.mode = 'paused';
      state.guideOpen = true;
    } else if (state.queuedInput === 'pause') {
      state.mode = 'paused';
    }
    state.queuedInput = null;
  }

  function updateSettlement(dt) {
    var s = state.settlement;
    if (!s) return;
    switch (s.stage) {
      case 'clear':
        s.clearTimer -= dt;
        if (s.clearTimer <= 0) afterClearStage();
        break;
      case 'gravity':
        var g = s.gravityEvent;
        if (g.blocks.length === 0) {
          g.zeroTimer -= dt;
          if (g.zeroTimer <= 0) advanceGravityBlock();
        } else {
          var b = g.blocks[g.blockIndex];
          var dur = g.phase === 'falling' ? b.fallDur : b.landDur;
          g.timer += dt;
          if (g.timer >= dur) {
            if (g.phase === 'falling') { g.phase = 'landing'; g.timer = 0; }
            else advanceGravityBlock();
          }
        }
        break;
      case 'extraclear':
        s.extraClear.timer -= dt;
        if (s.extraClear.timer <= 0) afterExtraClearOrSkip();
        break;
      case 'expand':
        s.currentExpansion.timer -= dt;
        s.currentExpansion.t = clamp01(1 - s.currentExpansion.timer / EXPAND_DURATION);
        if (s.currentExpansion.timer <= 0) beginRewardOrFinalize();
        break;
      case 'unlock':
        s.currentUnlock.timer -= dt;
        s.currentUnlock.t = clamp01(1 - s.currentUnlock.timer / REWARD_DURATION);
        if (s.currentUnlock.timer <= 0) beginRewardOrFinalize();
        break;
      case 'multiplier':
        s.currentMultiplier.timer -= dt;
        s.currentMultiplier.t = clamp01(1 - s.currentMultiplier.timer / REWARD_DURATION);
        if (s.currentMultiplier.timer <= 0) beginRewardOrFinalize();
        break;
    }
  }

  /* ---------------------------------------------------------------
   * 遊戲結束 / 開始 / 重開
   * ------------------------------------------------------------- */
  function finalHeights() {
    var out = {};
    for (var c = state.colMin; c <= state.colMax; c++) out[c] = columnTop(c);
    return out;
  }
  function finalBallResidual() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].color === 'ball') total++; }
    }
    return total;
  }

  function buildLogPayload(reason) {
    var st = state.stats;
    var residual = finalBallResidual();
    var eNoBall = st.totalPieces > 0 ? ((st.totalCleared - st.ballGroupTrueCells - st.extraClearCells) / st.totalPieces) : 0;
    var digRatio = st.digPhase.cleared > 0 ? (st.digPhase.target / st.digPhase.cleared) : null;

    var perNewShapeLog = [];
    NEW_SHAPE_ORDER.forEach(function (k) {
      var info = st.shapeUnlockInfo[k];
      if (!info) return;
      perNewShapeLog.push({
        shape: k, name: NEW_SHAPE_NAME[k], unlockedPieces: info.unlockedPieces, unlockedSeconds: Number(info.unlockedSeconds.toFixed(2)),
        dealCount: st.shapeDealCount[k] || 0, clearsPerDeal: st.shapeClearsPerDeal[k] || []
      });
    });

    var endTask = { index: state.A + 1, kind: state.task.kind, color: state.task.color, remaining: state.task.remaining };

    var expandTimelineOut = [0, 1, 2, 3].map(function (i) {
      return state.log.expandTimeline[i] ? state.log.expandTimeline[i] : '—';
    });

    return {
      meta: {
        game: GAME_NAME, endedAt: new Date().toISOString(), reason: reason,
        totalPieces: st.totalPieces, totalSeconds: Number(state.time.toFixed(2)), finalScore: state.score, finalMultiplier: Number(computeMultiplier().toFixed(2))
      },
      validation: {
        digPhaseTargetColorRatio: digRatio,
        digPhaseTargetColorRatioReference: { passiveExpected: 0.35, threeGameSignalLine: 0.45, note: '單局樣本小, 僅供對照, 非判定門檻' },
        perTask: state.log.taskLog,
        endTask: endTask,
        perNewShape: perNewShapeLog
      },
      diverseTaskPassiveBaseline: {
        byWidth: st.diverseBaseline,
        note: '以 9 欄段發生率 p 推算被動期望等待 1/p 塊, 與實際等待塊數比較(見 perTask); 參照線: 實際/期望 ≤0.6 有在做, ≥0.85 等同被動(3 局合併), 非判定門檻'
      },
      perGameSummary: {
        totalPieces: st.totalPieces, totalSeconds: Number(state.time.toFixed(2)),
        hardDropRate: st.totalPieces > 0 ? (st.hardDropLocks / st.totalPieces) : 0,
        expandTimeline: expandTimelineOut,
        unlockedColumns: unlockedCols(),
        totalCleared: st.totalCleared, targetCleared: st.targetCleared,
        clearedPerPiece: st.totalPieces > 0 ? (st.totalCleared / st.totalPieces) : 0,
        teamSizeDistribution: st.teamSize,
        shaveTotalCells: st.shaveTotalCells,
        finalColumnHeights: finalHeights(),
        finalClosedHoles: closedHolesCount(),
        endReason: reason, finalScore: state.score, finalMultiplier: Number(computeMultiplier().toFixed(2)),
        unlockedShapes: state.unlockedShapes.slice(),
        gravityBall: {
          spawned: st.ballSpawned, cleared: st.ballCleared, shavedOff: st.ballShaved, residual: residual,
          selfCheck: st.ballSpawned === (st.ballCleared + st.ballShaved + residual),
          triggerCount: st.gravityTriggerCount, movedCount: st.gravityMovedCount,
          displacedTotal: st.gravityDisplacedTotal, maxDisplacedSingleEvent: st.gravityMaxDisplaced, maxDropSingleEvent: st.gravityMaxDrop,
          extraClearCount: st.extraClearCount, extraClearCells: st.extraClearCells,
          idleCount: st.gravityIdleCount, idleRate: st.gravityTriggerCount > 0 ? (st.gravityIdleCount / st.gravityTriggerCount) : null,
          ballGroupTrueCells: st.ballGroupTrueCells, eNoBall: eNoBall
        },
        largeGravityEvents: state.log.largeGravityEvents
      },
      calibration: {
        perPieceSpawn: state.log.pieceSpawn,
        perPieceTiming: state.log.pieceTiming,
        perPieceLock: state.log.pieceLock,
        perPieceClearGroups: state.log.pieceClearGroups,
        perPieceBoardState: state.log.pieceBoardState,
        perGravityEvent: state.log.gravityEventCalib,
        perExpand: state.log.expandCalib,
        perNewShape: perNewShapeLog.map(function (r) { return { shape: r.shape, unlockedPieces: r.unlockedPieces, firstDealtPieces: null }; }),
        perTask: state.log.taskLog.map(function (t) { return { index: t.index, piecesTaken: t.achievedPieces - t.enteredPieces }; }),
        perGame: {
          presentationDurationsSeconds: state.stats.presentDur,
          deathSumHeightOverWidth: (state.colMax - state.colMin + 1) > 0 ? sumColHeights() / (state.colMax - state.colMin + 1) : 0,
          spawnColumnHeightAtDeath: null,
          finalWidth: state.colMax - state.colMin + 1,
          deathPieces: st.totalPieces, deathPhase: endTask.kind,
          slidingMaxRecoverAvg20: state.stats.maxRecoverAvg20
        }
      }
    };
  }

  function downloadLog(payload) {
    try {
      var name = 'gamelog-' + GAME_NAME + '-' + timestampName() + '.json';
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { /* 下載失敗不影響遊戲本體 */ }
  }

  function endGame(reason) {
    if (state.mode === 'over') return;
    state.mode = 'over';
    state.piece = null;
    state.settlement = null;
    state.queuedInput = null;
    var isBest = reason !== 'abandon' && (state.best === null || state.score > state.best);
    if (isBest) { state.best = state.score; saveBest(state.best); }
    state.gameOverInfo = {
      score: state.score, seconds: state.time, columns: unlockedCols(), shapes: state.unlockedShapes.length,
      task: { kind: state.task.kind, color: state.task.color, remaining: state.task.remaining },
      reason: reason, newRecord: isBest
    };
    var payload = buildLogPayload(reason);
    downloadLog(payload);
  }

  function freshStats() {
    return {
      totalPieces: 0, totalPiecesSpawned: 0, hardDropLocks: 0, totalCleared: 0, targetCleared: 0,
      teamSize: {}, shaveTotalCells: 0,
      ballSpawned: 0, ballCleared: 0, ballShaved: 0, ballGroupTrueCells: 0,
      gravityTriggerCount: 0, gravityMovedCount: 0, gravityIdleCount: 0,
      gravityDisplacedTotal: 0, gravityMaxDisplaced: 0, gravityMaxDrop: 0,
      extraClearCount: 0, extraClearCells: 0,
      digPhase: { cleared: 0, target: 0 },
      diverseBaseline: {},
      shapeDealCount: {}, shapeUnlockInfo: {}, shapeClearsPerDeal: {},
      fullWidthPieces: null, fullWidthSeconds: null,
      recoverWindow: [], maxRecoverAvg20: 0,
      presentDur: { clear: 0, gravity: 0, extraClear: 0, reward: 0 }
    };
  }

  // 建立全新一局的骨架(不設定第 1 個任務、不生成方塊)
  function newGameSkeleton(keepBest) {
    var prevBest = keepBest && state ? state.best : loadBest();
    state = {
      colorBag: [], shapeBag: [], unlockedShapes: [], shapeBagGuaranteePending: [],
      ballState: { bagQueue: [], bagPos: 0, groupPrevLastTrue: false },
      colMin: 0, colMax: 5, grid: new Map(),
      time: 0, score: 0, best: prevBest,
      mode: 'playing', guideOpen: false, guidePage: 1, queuedInput: null, rKeyLocked: false,
      gameOverInfo: null,
      piece: null, nextPiece: null, settlement: null,
      floatingBlocks: [],
      A: 0, E: 0, task: null, multCount: 0, multiplierFlash: 0,
      stats: freshStats(),
      log: { pieceSpawn: [], pieceTiming: [], pieceLock: [], pieceClearGroups: [], pieceBoardState: [], gravityEventCalib: [], expandCalib: [], expandTimeline: [null, null, null, null], taskLog: [], largeGravityEvents: [] }
    };
  }

  // 第 1 個任務設值 + 生成前兩塊(供「開始第一局」與「重開」共用)
  function beginFirstTaskAndSpawn() {
    var req = taskRequiredFor(1);
    state.task = { kind: 'dig', color: pickColorExcluding(null), required: req, remaining: req, enteredPieces: 0, enteredSeconds: 0 };
    state.nextPiece = makeNextPieceData();
    spawnNextAsCurrent();
    recomputeFloating();
  }

  function resetInputState() {
    input.hActiveDir = 0; input.hPhase = 'idle'; input.hDas = 0;
    input.leftDown = false; input.rightDown = false; input.softDown = false;
    input.abandonHolding = false; input.abandonStart = 0; input.abandonTriggered = false;
  }

  function restartGame() {
    newGameSkeleton(true);
    beginFirstTaskAndSpawn();
    resetInputState();
  }

  function bootGame() {
    newGameSkeleton(false);
    state.mode = 'guideOpening';
    state.guideOpen = true;
    state.guidePage = 1;
    resetInputState();
  }

  /* ---------------------------------------------------------------
   * 輸入: 鍵盤 DAS/ARR(唯一輸入來源, 只用鍵盤, 守則 R1)
   * ------------------------------------------------------------- */
  function startHorizontal(dir) {
    if (dir === -1) input.leftDown = true; else input.rightDown = true;
    input.hActiveDir = dir;
    input.hDas = DAS;
    input.hPhase = 'wait';
    if (state.mode === 'playing' && state.piece) tryMove(dir);
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
    // 結算(含暫停)期間凍結 DAS/ARR 計時(不歸零、不重算), 解鎖時從原本進度繼續
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

  /* ---------------------------------------------------------------
   * 放棄長按(真實時間, 不受暫停/結算凍結影響; 說明畫面中不受理)
   * ------------------------------------------------------------- */
  function updateAbandon() {
    if (!input.abandonHolding || input.abandonTriggered) return;
    if (state.guideOpen || state.mode === 'over') { input.abandonHolding = false; return; }
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
    return clamp01(elapsed / ABANDON_HOLD);
  }

  /* ---------------------------------------------------------------
   * 主更新
   * ------------------------------------------------------------- */
  function tick(dt) {
    updateAbandon();
    if (state.multiplierFlash > 0) state.multiplierFlash = Math.max(0, state.multiplierFlash - dt);

    if (state.mode === 'guideOpening') return;
    if (state.mode === 'over') return;
    if (state.guideOpen) return; // 局中/結束叫出說明: 視同暫停, t 凍結
    if (state.mode === 'paused') return;

    // t 全程推進(playing 與 settle, 含重力事件與追加消除)
    state.time += dt;

    tickHorizontal(dt);

    if (state.mode === 'playing') updatePlaying(dt);
    else if (state.mode === 'settle') updateSettlement(dt);
  }

  /* ---------------------------------------------------------------
   * 輸入事件綁定(操作章節: 只用鍵盤)
   * ------------------------------------------------------------- */
  var PREVENT_CODES = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Space: 1 };

  function normalizeCode(e) {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'ArrowUp': case 'KeyW': return 'cw';
      case 'KeyZ': return 'ccw';
      case 'KeyX': return '180';
      case 'ArrowDown': case 'KeyS': return 'soft';
      case 'Space': return 'hard';
      case 'Escape': return 'esc';
      case 'KeyH': return 'h';
      case 'Enter': case 'NumpadEnter': return 'enter';
      case 'KeyR': return 'r';
      default: return null;
    }
  }

  function requestGuide() {
    input.abandonHolding = false; // 說明畫面不受理放棄長按, 開啟當下取消任何進行中的長按
    if (state.mode === 'settle') { state.queuedInput = 'guide'; return; }
    if (state.mode === 'over') { state.guideOpen = true; return; }
    if (state.mode === 'playing') state.mode = 'paused';
    state.guideOpen = true; // playing->paused 或已是 paused, 皆顯示說明
  }
  function closeGuideOverlay() {
    state.guideOpen = false;
    if (state.mode === 'guideOpening') {
      beginFirstTaskAndSpawn();
      state.mode = 'playing';
    }
    // 其餘情況(paused / over): 停留原地, paused 需再按 Esc 才恢復
  }
  function requestPause() {
    if (state.mode === 'playing') { state.mode = 'paused'; return; }
    if (state.mode === 'paused') { state.mode = 'playing'; return; }
    if (state.mode === 'settle') { if (state.queuedInput !== 'guide') state.queuedInput = 'pause'; return; }
    // over: 無作用
  }
  function requestRDown() {
    if (state.rKeyLocked) return;
    if (state.mode === 'over') { restartGame(); return; }
    if (state.mode === 'playing' || state.mode === 'settle' || state.mode === 'paused') {
      input.abandonHolding = true;
      input.abandonStart = performance.now();
      input.abandonTriggered = false;
    }
  }

  function onKeyDown(e) {
    if (PREVENT_CODES[e.code]) e.preventDefault();
    if (e.repeat) return;
    var code = normalizeCode(e);
    if (!code) return;

    if (state.guideOpen) {
      // 說明畫面中只受理翻頁與關閉, 其餘一律無效; 只認 key-down 邊緣, 不循環
      if (code === 'left') { if (state.guidePage > 1) state.guidePage--; }
      else if (code === 'right') { if (state.guidePage < TOTAL_GUIDE_PAGES) state.guidePage++; }
      else if (code === 'h' || code === 'enter') { closeGuideOverlay(); }
      return;
    }

    if (code === 'h') { requestGuide(); return; }
    if (code === 'esc') { requestPause(); return; }
    if (code === 'r') { requestRDown(); return; }

    // 左右/軟降屬「持續按住」類, 追蹤不受 mode 限制;
    // DAS/ARR 的實際推進在 tickHorizontal 內受 mode 檢查凍結(結算/暫停期間不歸零、不重算)。
    if (code === 'left') { startHorizontal(-1); return; }
    if (code === 'right') { startHorizontal(1); return; }
    if (code === 'soft') { input.softDown = true; return; }

    // 其餘為離散動作: 僅 playing 時受理, 結算/暫停期間一律丟棄不緩衝
    if (state.mode !== 'playing') return;
    if (code === 'cw') tryRotate('cw');
    else if (code === 'ccw') tryRotate('ccw');
    else if (code === '180') tryRotate('180');
    else if (code === 'hard') hardDrop();
  }

  function onKeyUp(e) {
    var code = normalizeCode(e);
    if (!code) return;
    switch (code) {
      case 'left': endHorizontal(-1); break;
      case 'right': endHorizontal(1); break;
      case 'soft': input.softDown = false; break;
      case 'r':
        if (state.rKeyLocked) state.rKeyLocked = false;
        input.abandonHolding = false;
        input.abandonTriggered = false;
        break;
    }
  }

  /* ---------------------------------------------------------------
   * 繪製狀態轉換(內部欄位 col/row -> Art 要求的 x/y)
   * ------------------------------------------------------------- */
  function toArtCell(c) {
    return { x: c.col, y: c.row, kind: c.color === 'ball' ? 'ball' : 'color', color: c.color === 'ball' ? undefined : c.color, mark: c.mark || 'none', t: c.t || 0 };
  }

  // 依結算階段, 回傳「需要從一般格位繪製中抑制」的座標集合, 與需要額外畫的格位
  function getInFlightCells() {
    var suppress = Object.create(null);
    var extra = [];
    var s = state.settlement;
    if (state.mode === 'settle' && s) {
      if (s.stage === 'clear' && s.clearCells.length) {
        var ct = s.clearDuration > 0 ? clamp01(1 - s.clearTimer / s.clearDuration) : 1;
        s.clearCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'clearing', t: ct }); });
      } else if (s.stage === 'gravity' && s.gravityEvent) {
        var g = s.gravityEvent;
        g.blocks.forEach(function (b, i) {
          if (i < g.blockIndex) return; // 已完成: 交給一般格位繪製(grid 已是終位)
          b.origCells.concat(b.finalCells).forEach(function (c) { suppress[c.col + '_' + c.row] = true; });
        });
      } else if (s.stage === 'extraclear' && s.extraClear) {
        var et = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
        s.extraClear.cells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'clearing', t: et }); });
      } else if (s.stage === 'expand' && s.currentExpansion) {
        // 削頂不從 t=0 起跑(第 5 輪回饋: 會被讀成跟消除結算同一批), 與 drawShaveIndicator 用同一個 0.3~0.7 縮放後的 t
        var xt = clamp01((s.currentExpansion.t - 0.3) / 0.4);
        s.currentExpansion.trimCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'shaving', t: xt }); });
      }
    }
    return { suppress: suppress, extra: extra };
  }

  function drawGravityBlocksOverlay(ctx) {
    var s = state.settlement;
    var g = s.gravityEvent;
    if (!g) return;
    g.blocks.forEach(function (b, i) {
      if (i < g.blockIndex) return;
      if (i === g.blockIndex) {
        if (g.phase === 'falling') {
          var t = clamp01(b.fallDur > 0 ? g.timer / b.fallDur : 1);
          var interp = b.origCells.map(function (oc, ci) {
            var fc = b.finalCells[ci];
            return { x: oc.col, y: oc.row - b.delta * t, color: fc.color };
          });
          interp.forEach(function (c) { Art.drawCell(ctx, { x: c.x, y: c.y, kind: c.color === 'ball' ? 'ball' : 'color', color: c.color === 'ball' ? undefined : c.color, mark: 'falling', t: t }); });
          Art.drawFloatingEventBlock(ctx, { cells: interp.map(function (c) { return { x: c.x, y: c.y }; }), role: 'falling', t: t });
        } else if (g.phase === 'landing') {
          var lt = clamp01(b.landDur > 0 ? g.timer / b.landDur : 1);
          b.finalCells.forEach(function (c) { Art.drawCell(ctx, { x: c.col, y: c.row, kind: c.color === 'ball' ? 'ball' : 'color', color: c.color === 'ball' ? undefined : c.color, mark: 'none', t: 0 }); });
          Art.drawFloatingEventBlock(ctx, { cells: b.finalCells.map(function (c) { return { x: c.col, y: c.row }; }), role: 'landed', t: lt });
          Art.drawLandingImpact(ctx, { cells: b.finalCells.map(function (c) { return { x: c.col, y: c.row }; }), t: lt });
        }
      } else {
        // 排隊中: 尚未開始下落, 顯示於原位
        b.origCells.forEach(function (oc, ci) {
          var fc = b.finalCells[ci];
          Art.drawCell(ctx, { x: oc.col, y: oc.row, kind: fc.color === 'ball' ? 'ball' : 'color', color: fc.color === 'ball' ? undefined : fc.color, mark: 'none', t: 0 });
        });
        Art.drawFloatingEventBlock(ctx, { cells: b.origCells.map(function (c) { return { x: c.col, y: c.row }; }), role: 'fall', t: 0 });
      }
    });
    g.staticBlocks.forEach(function (sb) {
      Art.drawFloatingEventBlock(ctx, { cells: sb.map(function (c) { return { x: c.col, y: c.row }; }), role: 'stay', t: 0 });
    });
  }

  function drawSettlementOverlay(ctx) {
    if (state.mode !== 'settle' || !state.settlement) return;
    var s = state.settlement;
    if (s.stage === 'clear' && s.clearCells.length) {
      var t = s.clearDuration > 0 ? clamp01(1 - s.clearTimer / s.clearDuration) : 1;
      // 重力下落期間 task 給 null(art.js 契約): 該任務不在 4a 這段給算數回饋, 回饋畫在稍後的重力事件上
      var payload = { task: s.sampledTask === 'gravity' ? null : s.sampledTask, t: t, deducted: s.clearDeducted, targetColor: s.sampledColor };
      if (s.sampledTask === 'dig') payload.cells = s.clearCells.map(function (c) { return { x: c.col, y: c.row, isTarget: c.isTarget }; });
      else if (s.sampledTask === 'big' || s.sampledTask === 'double') payload.groups = s.clearGroupsForDisplay;
      Art.drawClearResult(ctx, payload);
    } else if (s.stage === 'gravity' && s.gravityEvent) {
      var g = s.gravityEvent;
      var gt;
      if (g.blocks.length === 0) gt = clamp01(1 - g.zeroTimer / GRAV_ZERO_DUR);
      else {
        var b = g.blocks[g.blockIndex];
        var dur = g.phase === 'falling' ? b.fallDur : b.landDur;
        gt = clamp01(dur > 0 ? g.timer / dur : 1);
      }
      Art.drawGravityEvent(ctx, { x: g.origin.col, y: g.origin.row, size: g.kind, counted: g.creditShown, t: gt });
      drawGravityBlocksOverlay(ctx);
    } else if (s.stage === 'extraclear' && s.extraClear) {
      var et = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
      Art.drawExtraClear(ctx, {
        cells: s.extraClear.cells.filter(function (c) { return c.color !== 'ball'; }).map(function (c) { return { x: c.col, y: c.row, isTarget: c.isTarget }; }),
        deducted: s.sampledTask === 'dig' ? s.extraClear.deducted : 0, targetColor: s.sampledColor, t: et
      });
    } else if (s.stage === 'expand' && s.currentExpansion) {
      var ce = s.currentExpansion;
      Art.drawExpandEvent(ctx, { side: ce.side, col: ce.col, t: ce.t, next: ce.next });
      Art.drawShaveIndicator(ctx, { cells: ce.trimCells.map(function (c) { return { x: c.col, y: c.row }; }), t: clamp01((ce.t - 0.3) / 0.4) });
      if (ce.bonus) Art.drawFullWidthBonus(ctx, { t: ce.t });
    } else if (s.stage === 'unlock' && s.currentUnlock) {
      Art.drawUnlockEvent(ctx, { shape: s.currentUnlock.shape, t: s.currentUnlock.t, next: s.currentUnlock.next });
    } else if (s.stage === 'multiplier' && s.currentMultiplier) {
      var cm = s.currentMultiplier;
      Art.drawMultiplierEvent(ctx, { amount: cm.amount, value: cm.value, capped: cm.capped, t: cm.t, next: cm.next });
    }
  }

  function nextExpandSideState() {
    if (state.E >= 4) return { side: null, col: null };
    var side = EXPAND_ORDER[state.E];
    var col = side === 'left' ? state.colMin - 1 : state.colMax + 1;
    return { side: side, col: col };
  }

  function taskProgressState() {
    var t = state.task;
    if (!t) return { kind: 'dig', color: 'A', remaining: 1, required: 1, reward: 'expand', side: 'left', announcing: false, t: 0, credit: 0 };
    var announcing = false, at = 0;
    var s = state.settlement;
    if (state.mode === 'settle' && s) {
      if (s.stage === 'expand' && s.currentExpansion) { at = s.currentExpansion.t; announcing = at >= 0.7; }
      else if (s.stage === 'unlock' && s.currentUnlock) { at = s.currentUnlock.t; announcing = at >= 0.7; }
      else if (s.stage === 'multiplier' && s.currentMultiplier) { at = s.currentMultiplier.t; announcing = at >= 0.7; }
    }
    var reward, side;
    if (t.kind === 'dig') {
      reward = 'expand'; side = EXPAND_ORDER[state.A];
    } else {
      var unlockedAll = state.unlockedShapes.length >= 3;
      if (!unlockedAll) reward = 'newPiece';
      else reward = computeMultiplier() >= MULT_CAP ? 'multiplierMax' : 'multiplier';
    }
    var credit = 0;
    if (state.mode === 'settle' && s) {
      if (s.stage === 'clear' && s.taskCreditedThisSegment) {
        credit = clamp01(1 - s.clearTimer / s.clearDuration);
      } else if (s.stage === 'gravity' && s.gravityEvent && s.gravityEvent.creditShown) {
        var g2 = s.gravityEvent;
        if (g2.blocks.length === 0) credit = clamp01(1 - g2.zeroTimer / GRAV_ZERO_DUR);
        else {
          var b2 = g2.blocks[g2.blockIndex];
          var dur2 = g2.phase === 'falling' ? b2.fallDur : b2.landDur;
          credit = clamp01(1 - (dur2 > 0 ? g2.timer / dur2 : 1));
        }
      }
    }
    return {
      kind: t.kind, color: t.color, remaining: t.remaining, required: t.required,
      reward: reward, side: side, fullWidthBonus: (t.kind === 'dig' && (state.A + 1) === 4),
      announcing: announcing, t: at, credit: credit
    };
  }

  function nextPreviewState() {
    if (!state.nextPiece) return { cells: [], masked: true };
    var masked = state.mode !== 'playing' && state.mode !== 'settle';
    return {
      cells: state.nextPiece.cells.map(function (c) { return { dx: c.x, dy: c.y, kind: c.ball ? 'ball' : 'color', color: c.ball ? undefined : c.color }; }),
      masked: masked
    };
  }

  function hudState() {
    return { score: state.score, multiplier: computeMultiplier(), multiplierFlash: state.multiplierFlash, best: state.best, time: state.time };
  }

  function gameOverState() {
    var info = state.gameOverInfo || {};
    return {
      score: info.score || 0, seconds: info.seconds || 0, columns: info.columns || 0, shapes: info.shapes || 0,
      task: info.task || null, reason: info.reason || 'blockout', newRecord: !!info.newRecord, best: state.best
    };
  }

  function guideModeFor() {
    if (state.mode === 'guideOpening') return 'opening';
    if (state.mode === 'over') return 'gameover';
    return 'ingame';
  }

  function render(ctx) {
    Art.drawBackground(ctx);
    Art.drawBoard(ctx, { minCol: state.colMin, maxCol: state.colMax });
    Art.drawNextExpandSide(ctx, nextExpandSideState());

    var flight = getInFlightCells();
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var row = 1; row <= arr.length; row++) {
        var cell = arr[row - 1];
        if (!cell) continue;
        if (flight.suppress[col + '_' + row]) continue;
        Art.drawCell(ctx, toArtCell({ col: col, row: row, color: cell.color }));
      }
    }
    flight.extra.forEach(function (c) { Art.drawCell(ctx, toArtCell(c)); });

    state.floatingBlocks.forEach(function (fb) {
      Art.drawFloatingMark(ctx, { cells: fb.cells.map(function (c) { return { x: c.col, y: c.row }; }), group: fb.id % 6 });
    });

    if (state.piece && state.mode === 'playing') {
      var ghostCells = computeGhost();
      if (ghostCells) {
        Art.drawGhost(ctx, { cells: ghostCells.map(function (c) { return { x: c.col, y: c.row, kind: c.ball ? 'ball' : 'color', color: c.ball ? undefined : c.color }; }) });
      }
      Art.drawPiece(ctx, {
        cells: state.piece.cells.map(function (c) { return { x: state.piece.anchorCol + c.x, y: state.piece.anchorRow + c.y, kind: c.ball ? 'ball' : 'color', color: c.ball ? undefined : c.color }; }),
        mode: piecePhase(state.piece),
        lockT: state.piece.inLockDelay ? clamp01(1 - state.piece.lockTimer / LOCK_DELAY) : 0
      });
    }

    drawSettlementOverlay(ctx);

    Art.drawTaskProgress(ctx, taskProgressState());
    Art.drawNextPreview(ctx, nextPreviewState());
    Art.drawHud(ctx, hudState());

    if (input.abandonHolding && !input.abandonTriggered && state.mode !== 'over' && !state.guideOpen) {
      Art.drawAbandonTimer(ctx, { progress: abandonProgress() });
    }

    if (state.mode === 'paused' && !state.guideOpen) Art.drawPauseMask(ctx);
    if (state.mode === 'over') Art.drawGameOver(ctx, gameOverState());
    if (state.guideOpen) Art.drawGuidePage(ctx, { page: state.guidePage, mode: guideModeFor() });
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

    bootGame();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    var lastTime = null;
    var acc = 0;
    function frame(ts) {
      if (lastTime === null) lastTime = ts;
      var rawDt = (ts - lastTime) / 1000;
      lastTime = ts;
      if (rawDt > MAX_FRAME_DT) rawDt = MAX_FRAME_DT; // 切分頁回來不瞬移/不追趕
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
