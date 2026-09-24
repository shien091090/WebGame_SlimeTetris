/* SlimeTetris Demo - 遊戲邏輯 (spec.md v11)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理。
 * 座標約定: 絕對欄 col(全局不重編號, 中線固定在絕對欄2|3接縫), 列 row(1 = 最底列,
 * 20、21 為緩衝列, 22 以上無硬界)。盤面不做系統性重力沉降, 唯一位移來源是玩家
 * 消掉重力球觸發的重力事件(剛體整體下落)。
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
  var EXTEND_NEED_BASE = [3, 5, 8, 11, 14];
  var EXTEND_KEXT_FIRST = 2, EXTEND_KEXT_REST = 3;

  var BASE_PER_CELL = 25;
  var N5_BONUS = 25;
  var QUALIFY_PTS = 12;
  var MAXED_PTS = 5;
  var EXTEND_PTS = 12;
  var FULLWIDTH_BONUS = 1500;
  var MULT_PER_COL = 0.15;
  var MULT_PER_EXT = 0.25;
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
  var GRAV_SMALL_DUR = 0.3, GRAV_LARGE_DUR = 0.5, GRAV_IDLE_DUR = 0.2;
  var GRAV_LARGE_THRESHOLD = 10;
  var EXTRA_CLEAR_DURATION = 0.4;
  var EXPAND_DURATION = 1.2;
  var EXTEND_REWARD_DURATION = 1.2;
  var PICK_DURATION = 3.0;

  var BALL_SUPPLY_SIZE = 4;

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
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function extendNeedFor(stageIdx) {
    if (stageIdx <= 5) return EXTEND_NEED_BASE[stageIdx - 1];
    return 14 + (stageIdx - 5) * 6;
  }

  /* ---------------------------------------------------------------
   * 全域狀態
   * ------------------------------------------------------------- */
  var state = null;
  var input = null;
  var mouse = null;

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
  function refillShapeBag() { state.shapeBag = shuffle(SHAPE_KEYS.slice()); }
  function drawShape() {
    if (!state.shapeBag.length) refillShapeBag();
    return state.shapeBag.pop();
  }

  // 重力球 bag: 每 8 塊一組, 恰 1 塊含球; 保證不連續(跨組相鄰時重洗); 延伸關卡補給
  // 期間繞過 bag(但仍保證出入口至少隔 1 塊); 補給疊加時剩餘塊數相加。
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
    var result, fromSupply = false;
    if (b.forcePendingTrue) {
      result = true;
      fromSupply = b.pendingFromSupply;
      b.forcePendingTrue = false;
      b.pendingFromSupply = false;
    } else {
      var candidate;
      var candidateFromSupply = false;
      if (b.mode === 'supply' && b.supplyRemaining > 0) { candidate = true; candidateFromSupply = true; }
      else {
        if (b.bagPos >= b.bagQueue.length) refillBallBag();
        candidate = b.bagQueue[b.bagPos++];
      }
      if (candidate && b.lastHadBall) {
        // 兩球相鄰: 本塊改為不含球, 把這次的 true 遞延到下一塊(入口/出口保證至少隔 1 塊)
        result = false;
        b.forcePendingTrue = true;
        b.pendingFromSupply = candidateFromSupply;
      } else {
        result = candidate;
        fromSupply = candidateFromSupply;
      }
    }
    if (result && fromSupply) {
      b.supplyRemaining--;
      if (b.supplyRemaining <= 0) b.mode = 'bag';
    }
    b.lastHadBall = result;
    return result;
  }
  function grantBallSupply() {
    state.ballState.supplyRemaining += BALL_SUPPLY_SIZE;
    state.ballState.mode = 'supply';
  }

  function makeNextPieceData() {
    var shapeKey = drawShape();
    var shape = SHAPES[shapeKey];
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y, color: null, ball: false }; });
    // 填入順序寫死: y 小者在前, y 同則 x 小者在前
    var order = localCells.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    var hasBall = decideNextBall();
    if (hasBall) {
      var idx = Math.floor(Math.random() * 4);
      order[idx].ball = true;
    }
    order.forEach(function (c) { if (!c.ball) c.color = drawColor(); });
    return { shapeKey: shapeKey, cells: localCells, hasBall: hasBall };
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
      cells: data.cells.map(function (c) { return { x: c.x, y: c.y, color: c.color, ball: c.ball }; }),
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
   * 盤面格位存取(絕對欄 -> Map, 全局不重編號; 延展只改變 colMin/colMax,
   * 不搬動任何既有格位, 因為索引鍵本身就是絕對欄, 不會跑位)
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
   * O 形重複用同一個公式即可真實旋轉 2x2 顏色矩陣(含球位置), 因為
   * O 的四格座標本身就是旋轉群的定義域, 套公式恰好只是重新分配顏色。
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
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row + c.y, color: c.ball ? 'ball' : c.color }; });
  }

  function currentFallSpeed() {
    var g = Math.min(state.G, FALL_G_CAP);
    var base = FALL_BASE * Math.pow(2, state.time / FALL_DOUBLE_T) + FALL_G_STEP * g;
    var cap = FALL_CAP_BASE + FALL_G_STEP * g;
    return Math.min(base, cap);
  }

  function unlockedCols() { return (state.colMax - state.colMin + 1) - 6; }
  function computeMultiplier() {
    var m = 1.0 + MULT_PER_COL * unlockedCols() + MULT_PER_EXT * (state.extendMultCount || 0);
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
    if (piece.inLockDelay) return 'lock';
    if (input.softDown) return 'soft';
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
   * 同色團顆數顯示(n=2/3, 每色獨立以「該色+球」連通; 球不計入顯示值)
   * ------------------------------------------------------------- */
  function recomputeClusterDisplay() {
    var out = [];
    COLORS.forEach(function (col0) {
      var comps = scanComponentsByPredicate(function (c, r) {
        var cell = getCell(c, r);
        if (!cell) return false;
        return cell.color === col0 || cell.color === 'ball';
      });
      comps.forEach(function (comp) {
        var trueCount = comp.filter(function (x) { return x.color === col0; }).length;
        if (trueCount !== 2 && trueCount !== 3) return;
        var a = anchorOf(comp);
        out.push({ col: a.col, row: a.row, count: trueCount, color: col0 });
      });
    });
    state.clusterDisplay = out;
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
   * -> 剛體整體下落到底
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

  function dropBlock(cells) {
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
    return { delta: delta, newCells: newCells };
  }

  function updateSurvivorsAfterDrop(origCells, delta) {
    if (delta <= 0) return;
    var set = Object.create(null);
    origCells.forEach(function (c) { set[c.col + '_' + c.row] = true; });
    state.settlement.survivors.forEach(function (s) {
      if (set[s.col + '_' + s.row]) s.row -= delta;
    });
  }

  // 執行一次重力事件(以剛被清除的團之原座標為基準), 回傳受影響結構與位移統計
  function runGravityEvent(origCells) {
    var seeds = computeSeeds(origCells);
    var seedKeySet = Object.create(null);
    seeds.forEach(function (s) { seedKeySet[s.col + '_' + s.row] = true; });
    var allComps = connectedAllComponents();
    var affected = allComps.filter(function (comp) {
      return comp.some(function (c) { return seedKeySet[c.col + '_' + c.row]; });
    });
    var falling = [], staticBlocks = [];
    affected.forEach(function (comp) { if (isFloatingBlock(comp)) falling.push(comp); else staticBlocks.push(comp); });
    falling.sort(function (a, b) {
      var la = Math.min.apply(null, a.map(function (c) { return c.row; }));
      var lb = Math.min.apply(null, b.map(function (c) { return c.row; }));
      if (la !== lb) return la - lb;
      var xa = Math.min.apply(null, a.map(function (c) { return c.col; }));
      var xb = Math.min.apply(null, b.map(function (c) { return c.col; }));
      return xa - xb;
    });
    var totalDisplaced = 0, maxDrop = 0, fallingResultCells = [];
    falling.forEach(function (comp) {
      var drop = dropBlock(comp);
      if (drop.delta > 0) { totalDisplaced += comp.length; maxDrop = Math.max(maxDrop, drop.delta); }
      fallingResultCells.push({ cells: drop.newCells.map(function (c) { return { col: c.col, row: c.row }; }) });
      updateSurvivorsAfterDrop(comp, drop.delta);
    });
    var staticResultCells = staticBlocks.map(function (comp) { return { cells: comp.map(function (c) { return { col: c.col, row: c.row }; }) }; });
    return { fallingBlocks: fallingResultCells, staticBlocks: staticResultCells, displaced: totalDisplaced, maxDrop: maxDrop };
  }

  /* ---------------------------------------------------------------
   * 削頂(延展獎勵 / 延伸關卡獎勵共用): 逐欄從最高已填格位往下削 K 個
   * ------------------------------------------------------------- */
  function shaveColumns(colsRange, k) {
    var perColumn = [], total = 0, trimCells = [];
    colsRange.forEach(function (c) {
      var filled = columnFilledDesc(c);
      var toRemove = filled.slice(0, k);
      if (toRemove.length) perColumn.push({ col: c, count: toRemove.length });
      toRemove.forEach(function (r) {
        var cell = getCell(c, r);
        trimCells.push({ col: c, row: r, color: cell ? cell.color : 'A' });
        setCellNull(c, r);
      });
      total += toRemove.length;
    });
    return { perColumn: perColumn, total: total, trimCells: trimCells };
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

  /* ---------------------------------------------------------------
   * 結算計分與計數歸屬(共用於 4a 主消除 與 4c 追加消除)
   * ------------------------------------------------------------- */
  function scoreAndCategorizeGroups(groups, flags) {
    var addScore = 0;
    var clearCells = [];
    var counts = { left: 0, right: 0, stage: 0, wrong: 0, ball: 0 };
    groups.forEach(function (g) {
      var n = g.cells.length;
      addScore += BASE_PER_CELL * n + (n >= 5 ? N5_BONUS : 0);
      state.stats.teamSize[sizeBucket(n)] = (state.stats.teamSize[sizeBucket(n)] || 0) + 1;
      var hasBall = g.cells.some(function (c) { return c.color === 'ball'; });
      if (hasBall) {
        var trueCells = g.cells.filter(function (c) { return c.color !== 'ball'; }).length;
        state.stats.ballGroupTrueCells += trueCells;
      }
      g.cells.forEach(function (cell) {
        if (cell.color === 'ball') {
          counts.ball++;
          state.stats.ballCleared++;
          clearCells.push({ col: cell.col, row: cell.row, color: 'ball', tag: 'ball' });
          return;
        }
        var tag = 'plain';
        var color = cell.color;
        if (color === state.left.target) {
          if (flags.left) { addScore += MAXED_PTS; state.stats.cat5++; }
          else if (cell.col <= 2) { tag = 'left'; addScore += QUALIFY_PTS; decrementRemain(state.left, 1); state.stats.cat1++; counts.left++; state.stats.leftEffNum++; state.stats.leftEffDen++; }
          else { tag = 'wrong'; state.stats.cat3++; counts.wrong++; state.stats.leftEffDen++; }
        } else if (color === state.right.target) {
          if (flags.right) { addScore += MAXED_PTS; state.stats.cat5++; }
          else if (cell.col >= 3) { tag = 'right'; addScore += QUALIFY_PTS; decrementRemain(state.right, 1); state.stats.cat2++; counts.right++; state.stats.rightEffNum++; state.stats.rightEffDen++; }
          else { tag = 'wrong'; state.stats.cat4++; counts.wrong++; state.stats.rightEffDen++; }
        } else {
          state.stats.cat5++;
        }
        if (state.extendActive && color === state.extendColor) {
          addScore += EXTEND_PTS;
          var inSide = state.extendSide === 'left' ? cell.col <= 2 : cell.col >= 3;
          if (inSide) {
            if (tag === 'plain') tag = 'stage';
            counts.stage++;
            state.extendRemain -= 1;
            state.extendAccumSide++;
          } else {
            state.extendAccumOther++;
          }
        }
        state.stats.totalCleared++;
        clearCells.push({ col: cell.col, row: cell.row, color: color, tag: tag });
      });
    });
    return { addScore: addScore, clearCells: clearCells, counts: counts };
  }

  /* ---------------------------------------------------------------
   * 結算時序(方塊鎖定後): 見 spec.md「結算時序」1~9 步
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;

    // 第 1 步
    var flags = { left: state.left.A === 2, right: state.right.A === 2 };
    var multiplier = computeMultiplier();
    var lockedCells = piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: piece.anchorRow + c.y, color: c.ball ? 'ball' : c.color }; });
    lockedCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color }); });
    state.stats.totalPieces++;
    if (piece.hardDropUsed) state.stats.hardDropLocks++;
    if (piece.cells.some(function (c) { return c.ball; })) state.stats.ballSpawned++;
    state.piece = null;

    var survivors = lockedCells.map(function (c) { return { col: c.col, row: c.row }; });

    // 第 2 步
    var groups = scanClearGroups();

    // 第 3 步
    var scoreResult = scoreAndCategorizeGroups(groups, flags);
    state.score += Math.round(scoreResult.addScore * multiplier);
    survivors = survivors.filter(function (s) {
      return !scoreResult.clearCells.some(function (c) { return c.col === s.col && c.row === s.row; });
    });

    var ballGroups = groups.filter(function (g) { return g.cells.some(function (c) { return c.color === 'ball'; }); });
    ballGroups.forEach(function (g) { g.anchor = anchorOf(g.cells); });
    ballGroups.sort(function (a, b) { if (a.anchor.row !== b.anchor.row) return b.anchor.row - a.anchor.row; return a.anchor.col - b.anchor.col; });

    state.settlement = {
      flags: flags, multiplier: multiplier,
      survivors: survivors,
      clearCells: scoreResult.clearCells,
      clearSummary: scoreResult.counts,
      clearTimer: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      clearDuration: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      stage: 'clear',
      ballGroupQueue: ballGroups,
      ballGroupIndex: 0,
      gravityMovedAny: false,
      gravityDisplay: null,
      extraClear: null,
      expansionQueue: [],
      currentExpansion: null,
      currentPick: null,
      extendReward: null
    };

    // 4a: 一次性清除所有成立團格位(顯示用資料保留在 clearCells, grid 已清空)
    scoreResult.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
    recomputeClusterDisplay();
    recomputeFloating();

    state.mode = 'settle';
  }

  function afterClearStage() {
    var s = state.settlement;
    if (s.ballGroupIndex < s.ballGroupQueue.length) beginNextGravityEvent();
    else afterAllGravityEvents();
  }

  function beginNextGravityEvent() {
    var s = state.settlement;
    var group = s.ballGroupQueue[s.ballGroupIndex++];
    var origCells = group.cells.map(function (c) { return { col: c.col, row: c.row }; });
    var result = runGravityEvent(origCells);
    state.stats.gravityTriggerCount++;
    var kind;
    if (result.displaced <= 0) { kind = 'idle'; state.stats.gravityIdleCount++; }
    else if (result.displaced < GRAV_LARGE_THRESHOLD) { kind = 'small'; }
    else { kind = 'large'; }
    if (result.displaced > 0) {
      s.gravityMovedAny = true;
      state.stats.gravityMovedCount++;
      state.stats.gravityDisplacedTotal += result.displaced;
      state.stats.gravityMaxDisplaced = Math.max(state.stats.gravityMaxDisplaced, result.displaced);
      state.stats.gravityMaxDrop = Math.max(state.stats.gravityMaxDrop, result.maxDrop);
      if (result.displaced >= GRAV_LARGE_THRESHOLD) {
        var trueColor = group.color;
        var trueN = group.cells.filter(function (c) { return c.color !== 'ball'; }).length;
        state.stats.largeGravityEvents.push({
          pieces: state.stats.totalPieces, groupSize: trueN, groupColor: trueColor,
          affectedBlocks: result.fallingBlocks.length + result.staticBlocks.length,
          displaced: result.displaced, maxDrop: result.maxDrop, causedAppend: false
        });
      }
    }
    recomputeClusterDisplay();
    recomputeFloating();
    var dur = kind === 'large' ? GRAV_LARGE_DUR : (kind === 'idle' ? GRAV_IDLE_DUR : GRAV_SMALL_DUR);
    s.gravityDisplay = { kind: kind, originCells: origCells, fallingBlocks: result.fallingBlocks, staticBlocks: result.staticBlocks, timer: dur, duration: dur };
    s.stage = 'gravity';
  }

  function afterAllGravityEvents() {
    var s = state.settlement;
    s.gravityDisplay = null;
    if (s.gravityMovedAny) {
      var groups2 = scanClearGroups();
      if (groups2.length) {
        var res2 = scoreAndCategorizeGroups(groups2, s.flags);
        state.score += Math.round(res2.addScore * s.multiplier);
        res2.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
        s.survivors = s.survivors.filter(function (sv) { return !res2.clearCells.some(function (c) { return c.col === sv.col && c.row === sv.row; }); });
        state.stats.extraClearCount++;
        state.stats.extraClearCells += res2.clearCells.filter(function (c) { return c.color !== 'ball'; }).length;
        if (state.stats.largeGravityEvents.length) state.stats.largeGravityEvents[state.stats.largeGravityEvents.length - 1].causedAppend = true;
        recomputeClusterDisplay();
        recomputeFloating();
        s.extraClear = { cells: res2.clearCells, timer: EXTRA_CLEAR_DURATION, duration: EXTRA_CLEAR_DURATION };
        s.stage = 'extraclear';
        return;
      }
    }
    afterExtraClearOrSkip();
  }

  function afterExtraClearOrSkip() {
    var s = state.settlement;
    s.extraClear = null;
    beginAdvancePhase();
  }

  function beginAdvancePhase() {
    var s = state.settlement;
    // 第 5 步: 先左後右
    advanceIfNeeded(state.left);
    advanceIfNeeded(state.right);

    if (state.extendActive && state.extendRemain <= 0) {
      var overflow = -state.extendRemain;
      var achievedStage = state.S + 1;
      var achievedColor = state.extendColor;
      var achievedSide = state.extendSide;
      var achievedNeed = state.extendNeed;
      state.S = achievedStage;
      state.extendPendingLog = {
        stage: achievedStage, color: achievedColor, side: achievedSide, need: achievedNeed,
        sideCount: state.extendAccumSide, otherCount: state.extendAccumOther,
        pieces: state.stats.totalPieces, seconds: state.time,
        fallSpeed: currentFallSpeed(), closedHoles: finalClosedHoles()
      };
      state.extendAccumSide = 0; state.extendAccumOther = 0;
      var nextIdx = achievedStage + 1;
      var cands = COLORS.filter(function (c) { return c !== achievedColor; });
      state.extendColor = cands[Math.floor(Math.random() * cands.length)];
      state.extendSide = achievedSide === 'left' ? 'right' : 'left';
      state.extendNeed = extendNeedFor(nextIdx);
      state.extendRemain = state.extendNeed - overflow;
    }

    var queue = [];
    if (state.left.E < state.left.A) queue.push('left');
    if (state.right.E < state.right.A) queue.push('right');
    s.expansionQueue = queue;
    processNextExpansionOrEnd();
  }

  function processNextExpansionOrEnd() {
    var s = state.settlement;
    if (s.expansionQueue.length) {
      var sideKey = s.expansionQueue.shift();
      executeExpansion(sideKey);
      return;
    }
    // 6-2 進入延伸關卡
    if (!state.extendActive && state.left.A === 2 && state.left.E === state.left.A && state.right.A === 2 && state.right.E === state.right.A) {
      enterExtendStage1();
    }
    beginExtendRewardOrFinalize();
  }

  function enterExtendStage1() {
    state.extendActive = true;
    state.extendColor = state.left.target;
    state.extendSide = 'left';
    state.extendNeed = extendNeedFor(1);
    state.extendRemain = state.extendNeed;
    state.stats.extendEnterPieces = state.stats.totalPieces;
    state.stats.extendEnterSeconds = state.time;
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
    var filledColsBefore = colsRange.filter(function (c) { return columnFilledDesc(c).length > 0; }).length;
    var shave = shaveColumns(colsRange, k);
    state.stats.expandTrimTotal += shave.total;
    state.stats.ballShaved += shave.trimCells.filter(function (c) { return c.color === 'ball'; }).length;
    s.survivors = s.survivors.filter(function (sv) {
      return !shave.trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; });
    });

    var isFullWidthBonus = (order === 4);
    if (isFullWidthBonus) state.score += FULLWIDTH_BONUS;

    side.E += 1;
    recomputeClusterDisplay();
    recomputeFloating();

    var logEntry = {
      order: order, side: sideKey, pieces: state.stats.totalPieces, seconds: state.time,
      width: state.colMax - state.colMin + 1,
      leftCols: 2 - state.colMin + 1, rightCols: state.colMax - 2,
      k: k, trimmed: shave.total, filledCols: filledColsBefore,
      pick: null
    };
    state.stats.expansions.push(logEntry);

    s.currentExpansion = {
      side: sideKey, col: newCol, order: order, k: k, total: shave.total,
      perColumn: shave.perColumn, trimCells: shave.trimCells, bonus: isFullWidthBonus,
      timer: EXPAND_DURATION, duration: EXPAND_DURATION, t: 0, logEntry: logEntry
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
      selectedIndex: -1, phase: 'open', remain: PICK_DURATION,
      blockLeft: input.leftDown, blockRight: input.rightDown
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

    var logEntry = s.currentExpansion.logEntry;
    logEntry.pick = { changed: oldColor !== newColor, from: oldColor, to: newColor, method: isTimeout ? '逾時' : '玩家' };
    logExpansionLine(logEntry);

    s.currentExpansion = null;
    s.currentPick = null;
    processNextExpansionOrEnd();
  }

  function isPicking() {
    return state.mode === 'settle' && state.settlement && state.settlement.stage === 'pickWait';
  }
  function isPickWaiting() { return isPicking(); }

  function selectPick(idx) {
    var s = state.settlement;
    if (!s || s.stage !== 'pickWait') return;
    s.currentPick.selectedIndex = idx;
    resolvePick(false);
  }

  function beginExtendRewardOrFinalize() {
    if (state.G < state.S) executeExtendReward();
    else finalizeSettlement();
  }

  function executeExtendReward() {
    var s = state.settlement;
    var m = state.G % 3;
    var achievedStage = state.G + 1;
    var kind = m === 0 ? 'shave' : (m === 1 ? 'supply' : 'multiplier');
    var value, trimCells = null;
    if (kind === 'shave') {
      var kext = achievedStage === 1 ? EXTEND_KEXT_FIRST : EXTEND_KEXT_REST;
      value = kext;
      var shave = shaveColumns(range(state.colMin, state.colMax), kext);
      state.stats.extendTrimTotal += shave.total;
      state.stats.ballShaved += shave.trimCells.filter(function (c) { return c.color === 'ball'; }).length;
      s.survivors = s.survivors.filter(function (sv) {
        return !shave.trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; });
      });
      trimCells = shave.trimCells;
      state.stats.extendRewardCounts.shave++;
    } else if (kind === 'supply') {
      value = BALL_SUPPLY_SIZE;
      grantBallSupply();
      state.stats.extendRewardCounts.supply++;
    } else {
      value = MULT_PER_EXT;
      state.extendMultCount = (state.extendMultCount || 0) + 1;
      state.stats.extendRewardCounts.multiplier++;
    }
    state.G += 1;

    if (state.extendPendingLog && state.extendPendingLog.stage === achievedStage) {
      logExtendStageLine(state.extendPendingLog, { kind: kind, value: value });
      state.extendPendingLog = null;
    }

    recomputeClusterDisplay();
    recomputeFloating();
    s.extendReward = { kind: kind, value: value, stage: achievedStage, trimCells: trimCells, timer: EXTEND_REWARD_DURATION, duration: EXTEND_REWARD_DURATION, t: 0 };
    s.stage = 'extendReward';
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
        if (s.clearTimer <= 0) afterClearStage();
        break;
      case 'gravity':
        s.gravityDisplay.timer -= dt;
        if (s.gravityDisplay.timer <= 0) {
          if (s.ballGroupIndex < s.ballGroupQueue.length) beginNextGravityEvent();
          else afterAllGravityEvents();
        }
        break;
      case 'extraclear':
        s.extraClear.timer -= dt;
        if (s.extraClear.timer <= 0) afterExtraClearOrSkip();
        break;
      case 'expand':
        s.currentExpansion.timer -= dt;
        s.currentExpansion.t = clamp01(1 - s.currentExpansion.timer / EXPAND_DURATION);
        if (s.currentExpansion.timer <= 0) afterExpansionDisplay();
        break;
      case 'pickWait':
        s.currentPick.remain -= dt;
        if (s.currentPick.remain <= 0) resolvePick(true);
        break;
      case 'extendReward':
        s.extendReward.timer -= dt;
        s.extendReward.t = clamp01(1 - s.extendReward.timer / EXTEND_REWARD_DURATION);
        if (s.extendReward.timer <= 0) finalizeSettlement();
        break;
    }
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
  function logExtendStageLine(a, reward) {
    var rewardDesc = reward.kind === 'shave' ? ('削頂 K_ext=' + reward.value)
      : reward.kind === 'supply' ? ('補給 ' + reward.value + ' 塊')
      : ('倍率 +' + reward.value.toFixed(2));
    console.log('[延伸關卡] 第' + a.stage + '階 目標色=' + a.color + ' 指定側=' + (a.side === 'left' ? '左' : '右') +
      ' 需求=' + a.need + ' 側內顆數=' + a.sideCount + ' 另半顆數=' + a.otherCount +
      ' 塊數=' + a.pieces + ' 秒數=' + a.seconds.toFixed(1) +
      ' 獎勵=' + rewardDesc + ' 達成落速=' + a.fallSpeed.toFixed(2) + ' 封閉洞數=' + a.closedHoles);
  }
  function logLargeGravityLine(e) {
    console.log('[大型重力事件] 塊數=' + e.pieces + ' 觸發團顆數=' + e.groupSize + ' 顏色=' + e.groupColor +
      ' 受影響連通塊數=' + e.affectedBlocks + ' 位移格位總數=' + e.displaced + ' 最大下落格數=' + e.maxDrop +
      ' 引發追加消除=' + (e.causedAppend ? '是' : '否'));
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
  function finalBallResidual() {
    var total = 0;
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      if (!arr) continue;
      for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].color === 'ball') total++; }
    }
    return total;
  }

  function printSummary(reason) {
    state.stats.largeGravityEvents.forEach(logLargeGravityLine);

    var st = state.stats;
    var reasonText = reason === 'lockout' ? 'lock out' : reason === 'blockout' ? 'block out' : '玩家放棄';
    var expLines = [1, 2, 3, 4].map(function (i) {
      var e = st.expansions[i - 1];
      return e ? ('第' + i + '次(' + (e.side === 'left' ? '左' : '右') + '):第' + e.pieces + '塊/' + e.seconds.toFixed(1) + 's')
        : ('第' + i + '次:—');
    });
    var mergedNum = st.leftEffNum + st.rightEffNum;
    var mergedDen = st.leftEffDen + st.rightEffDen;
    var residual = finalBallResidual();
    var eNoBall = st.totalPieces > 0 ? ((st.totalCleared - st.ballGroupTrueCells - st.extraClearCells) / st.totalPieces) : 0;
    var extendPieces = state.extendActive ? (st.totalPieces - st.extendEnterPieces) : 0;
    var extendSeconds = state.extendActive ? (state.time - st.extendEnterSeconds) : 0;

    console.log('===== 本局結束彙整 =====');
    console.log('結束原因:', reasonText, ' 總塊數:', st.totalPieces, ' 總秒數:', state.time.toFixed(1));
    console.log('硬降使用率:', st.totalPieces > 0 ? (st.hardDropLocks / st.totalPieces * 100).toFixed(1) + '%' : '—');
    console.log('四次延展:', expLines.join(' | '));
    console.log('已解鎖欄數:', unlockedCols(), '/4', ' 本局昂貴側:', state.left.expensive ? '左' : '右');
    console.log('消除總顆數(不含球):', st.totalCleared,
      ' 每塊期望消除顆數E:', st.totalPieces > 0 ? (st.totalCleared / st.totalPieces).toFixed(3) : '—',
      ' E_無球:', eNoBall.toFixed(3));
    console.log('顆數五分類[①左合格 ②右合格 ③左目標落右半 ④右目標落左半 ⑤非目標色]:',
      st.cat1, st.cat2, st.cat3, st.cat4, st.cat5, ' 合計=', st.cat1 + st.cat2 + st.cat3 + st.cat4 + st.cat5);
    console.log('分邊效率 左:', fmtEff(st.leftEffNum, st.leftEffDen), ' 右:', fmtEff(st.rightEffNum, st.rightEffDen),
      ' 合併(主值):', fmtEff(mergedNum, mergedDen));
    console.log('左側最終: A=' + state.left.A + ' E=' + state.left.E + ' 當前階剩餘=' + (state.left.A < 2 ? currentRemain(state.left) : '—'));
    console.log('右側最終: A=' + state.right.A + ' E=' + state.right.E + ' 當前階剩餘=' + (state.right.A < 2 ? currentRemain(state.right) : '—'));
    console.log('消除團大小分佈[4/5/6/7+]:', JSON.stringify(st.teamSize));
    console.log('削頂削除總格數: 延展獎勵=', st.expandTrimTotal, ' 延伸關卡獎勵=', st.extendTrimTotal);
    console.log('各欄最終高度:', JSON.stringify(finalHeights()));
    console.log('最終封閉洞數:', finalClosedHoles());
    console.log('最終分數:', state.score, ' 最終分數倍率: ×' + computeMultiplier().toFixed(2));
    console.log('----- 重力球彙整 -----');
    console.log('出現總數=', st.ballSpawned, ' 被消除數=', st.ballCleared, ' 被削頂削除數=', st.ballShaved,
      ' 局終殘存數=', residual, ' 自我校驗(應相等):', st.ballSpawned, '=', st.ballCleared + st.ballShaved + residual);
    console.log('重力事件觸發次數=', st.gravityTriggerCount, ' 實際位移事件數=', st.gravityMovedCount,
      ' 下落格位總數=', st.gravityDisplacedTotal, ' 單次最大位移格數=', st.gravityMaxDisplaced, ' 單次最大下落格數=', st.gravityMaxDrop);
    console.log('追加消除發生次數=', st.extraClearCount, ' 追加消除顆數=', st.extraClearCells);
    console.log('空轉事件次數=', st.gravityIdleCount, ' 空轉率=', st.gravityTriggerCount > 0 ? (st.gravityIdleCount / st.gravityTriggerCount).toFixed(3) : '—');
    console.log('含球團真顏色顆數合計=', st.ballGroupTrueCells);
    console.log('----- 延伸關卡彙整 -----');
    console.log('進入延伸關卡=', state.extendActive ? '是' : '否',
      state.extendActive ? (' 塊數=' + extendPieces + ' 秒數=' + extendSeconds.toFixed(1) + ' 佔比=' + (state.time > 0 ? (extendSeconds / state.time * 100).toFixed(1) + '%' : '—')) : '');
    console.log('最終 S=', state.S, ' G=', state.G, ' 當前延伸階剩餘=', state.extendActive ? state.extendRemain : '—');
    console.log('各獎勵累計次數: 削頂=', st.extendRewardCounts.shave, ' 補給=', st.extendRewardCounts.supply, ' 倍率=', st.extendRewardCounts.multiplier);
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
    var finalMultiplier = computeMultiplier();
    var isBest = reason !== 'abandon' && (state.best === null || state.score > state.best);
    if (isBest) state.best = state.score;
    state.gameOverInfo = {
      score: state.score, seconds: state.time, unlocked: unlockedCols(),
      reason: reason, isBest: isBest, multiplier: finalMultiplier
    };
    printSummary(reason);
  }

  function makeSide(isExpensive, color) {
    var need = isExpensive ? EXPENSIVE_NEED : CHEAP_NEED;
    return {
      expensive: isExpensive, target: color, A: 0, E: 0,
      need1: need[0], need2: need[1], remain1: need[0], remain2: null
    };
  }

  function freshStats() {
    return {
      totalPieces: 0, hardDropLocks: 0, totalCleared: 0,
      cat1: 0, cat2: 0, cat3: 0, cat4: 0, cat5: 0,
      leftEffNum: 0, leftEffDen: 0, rightEffNum: 0, rightEffDen: 0,
      teamSize: {}, expandTrimTotal: 0, extendTrimTotal: 0, expansions: [],
      ballSpawned: 0, ballCleared: 0, ballShaved: 0, ballGroupTrueCells: 0,
      gravityTriggerCount: 0, gravityMovedCount: 0, gravityIdleCount: 0,
      gravityDisplacedTotal: 0, gravityMaxDisplaced: 0, gravityMaxDrop: 0,
      largeGravityEvents: [],
      extraClearCount: 0, extraClearCells: 0,
      extendRewardCounts: { shave: 0, supply: 0, multiplier: 0 },
      extendEnterPieces: 0, extendEnterSeconds: 0
    };
  }

  function initGame() {
    var prevBest = state ? state.best : null;
    state = {
      colorBag: [], shapeBag: [],
      ballState: { mode: 'bag', bagQueue: [], bagPos: 0, groupPrevLastTrue: false, forcePendingTrue: false, pendingFromSupply: false, lastHadBall: false, supplyRemaining: 0 },
      colMin: 0, colMax: 5,
      grid: new Map(),
      time: 0, score: 0, best: prevBest,
      mode: 'playing', paused: false, pauseRequested: false, rKeyLocked: false,
      gameOverInfo: null,
      piece: null, nextPiece: null,
      settlement: null,
      clusterDisplay: [], floatingBlocks: [],
      extendActive: false, S: 0, G: 0,
      extendColor: null, extendSide: null, extendNeed: null, extendRemain: null,
      extendMultCount: 0, extendPendingLog: null, extendAccumSide: 0, extendAccumOther: 0,
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
    recomputeClusterDisplay();
    recomputeFloating();

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
    // 結算(含改選)期間凍結 DAS/ARR 計時(不歸零、不重算), 解鎖時從原本進度繼續
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
    return clamp01(elapsed / ABANDON_HOLD);
  }

  /* ---------------------------------------------------------------
   * 主更新
   * ------------------------------------------------------------- */
  function tick(dt) {
    updateAbandon();
    if (state.mode === 'over') return;
    if (state.paused) return;

    // t 全程推進, 唯一例外是目標色改選子階段(等待玩家決定的 3.0 秒視窗)凍結
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
      var p = state.settlement.currentPick;
      if (code === 'left') { if (!p.blockLeft) selectPick(0); }
      else if (code === 'right') { if (!p.blockRight) selectPick(1); }
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
    if (isPicking()) {
      var p = state.settlement.currentPick;
      if (code === 'left') p.blockLeft = false;
      else if (code === 'right') p.blockRight = false;
    }
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

  // 改選候選色塊 hitbox: 幾何常數對齊 art.js 的 drawRecolor(僅供點擊判定使用)
  function pickCandidateHitboxes(side) {
    var base = side === 'left' ? Art.metrics.panelLeft : Art.metrics.panelRight;
    var box = { x: base.x + 16, y: base.y + 330, w: base.w - 32, h: 160 };
    var sw = 58, gap = 26, totalW = sw * 2 + gap;
    var ox = box.x + (box.w - totalW) / 2, oy = box.y + 40;
    return [
      { x: ox, y: oy, w: sw, h: sw + 28 },
      { x: ox + sw + gap, y: oy, w: sw, h: sw + 28 }
    ];
  }
  function restartHitbox() {
    var w = 380, h = 300, x = Art.canvas.width / 2 - w / 2, y = Art.canvas.height / 2 - h / 2;
    return { x: x, y: y + h - 40, w: w, h: 32 };
  }

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
      if (e.button === 0 && pointInRect(pt, restartHitbox())) restartGame();
      return;
    }
    if (state.paused) return;
    if (isPicking()) {
      if (e.button === 0) {
        var boxes = pickCandidateHitboxes(state.settlement.currentPick.side);
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
  function hudPhase() {
    if (state.mode === 'over') return 'over';
    if (state.paused) return 'paused';
    if (state.mode === 'settle') {
      if (isPickWaiting()) return 'recolor';
      if (state.settlement && state.settlement.stage === 'gravity') return 'gravity';
      return 'resolving';
    }
    return 'playing';
  }

  function getInFlightCells() {
    var suppress = Object.create(null);
    var extra = [];
    if (state.mode === 'settle' && state.settlement) {
      var s = state.settlement;
      if (s.stage === 'clear' && s.clearCells.length) {
        var ct = s.clearDuration > 0 ? clamp01(1 - s.clearTimer / s.clearDuration) : 1;
        s.clearCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'clearing', t: ct }); });
      } else if (s.stage === 'gravity' && s.gravityDisplay) {
        var gt = clamp01(1 - s.gravityDisplay.timer / s.gravityDisplay.duration);
        s.gravityDisplay.fallingBlocks.forEach(function (fb) {
          fb.cells.forEach(function (c) {
            suppress[c.col + '_' + c.row] = true;
            var gc = getCell(c.col, c.row);
            extra.push({ col: c.col, row: c.row, color: gc ? gc.color : 'A', mark: 'falling', t: gt });
          });
        });
      } else if (s.stage === 'extraclear' && s.extraClear) {
        var et = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
        s.extraClear.cells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'clearing', t: et }); });
      } else if (s.stage === 'expand' && s.currentExpansion) {
        var xt = s.currentExpansion.t;
        s.currentExpansion.trimCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'shaving', t: xt }); });
      } else if (s.stage === 'extendReward' && s.extendReward && s.extendReward.trimCells) {
        var rt = s.extendReward.t || 0;
        s.extendReward.trimCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'shaving', t: rt }); });
      }
    }
    return { suppress: suppress, extra: extra };
  }

  function drawCurrentEventIndicator(ctx) {
    if (state.mode !== 'settle' || !state.settlement) return;
    var s = state.settlement;
    var minCol = state.colMin, maxCol = state.colMax;
    if (s.stage === 'clear' && s.clearCells.length) {
      var t = s.clearDuration > 0 ? clamp01(1 - s.clearTimer / s.clearDuration) : 1;
      Art.drawClearResult(ctx, { cells: s.clearCells, summary: s.clearSummary, t: t, minCol: minCol, maxCol: maxCol });
    } else if (s.stage === 'gravity' && s.gravityDisplay) {
      var g = s.gravityDisplay;
      var t2 = clamp01(1 - g.timer / g.duration);
      Art.drawGravityEvent(ctx, { kind: g.kind, t: t2, originCells: g.originCells, fallingBlocks: g.fallingBlocks, staticBlocks: g.staticBlocks, minCol: minCol, maxCol: maxCol });
    } else if (s.stage === 'extraclear' && s.extraClear) {
      var t3 = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
      Art.drawExtraClear(ctx, { cells: s.extraClear.cells.map(function (c) { return { col: c.col, row: c.row }; }), t: t3, minCol: minCol, maxCol: maxCol });
    } else if (s.stage === 'expand' && s.currentExpansion) {
      var ce = s.currentExpansion;
      Art.drawExpandEvent(ctx, { side: ce.side, newCol: ce.col, k: ce.k, shavedTotal: ce.total, perColumn: ce.perColumn, fullWidth: ce.bonus, t: ce.t, minCol: minCol, maxCol: maxCol });
    } else if (s.stage === 'extendReward' && s.extendReward) {
      var er = s.extendReward;
      Art.drawExtendReward(ctx, { kind: er.kind, value: er.value, stage: er.stage, t: er.t, minCol: minCol, maxCol: maxCol });
    }
  }

  function sidePanelState(sideKey) {
    var side = state[sideKey];
    var status = side.A === 2 ? 'maxed' : (side.E < side.A ? 'pendingExpand' : 'counting');
    return {
      side: sideKey, targetColor: side.target, expensive: side.expensive,
      stageIndex: Math.min(side.A + 1, 2), remain: side.A < 2 ? currentRemain(side) : 0,
      status: status, stageA: side.A, stageE: side.E, disabled: false, time: state.time
    };
  }
  function extendPanelState() {
    if (!state.extendActive) return { active: false };
    var rewardNames = ['削頂', '重力球補給', '分數倍率'];
    var nextM = state.G % 3;
    return {
      active: true, stage: state.S + 1, color: state.extendColor, side: state.extendSide,
      remain: Math.max(0, state.extendRemain), need: state.extendNeed, pending: state.extendRemain <= 0,
      nextReward: rewardNames[nextM]
    };
  }
  function buildGameOverState() {
    var info = state.gameOverInfo;
    var reasonMap = { lockout: 'Lock out', blockout: 'Block out', abandon: '玩家放棄' };
    return {
      score: info.score, seconds: info.seconds, unlocked: info.unlocked,
      stage: state.extendActive ? state.S : null, multiplier: info.multiplier,
      reason: reasonMap[info.reason] || info.reason, isBest: info.isBest
    };
  }

  function render(ctx) {
    Art.drawBackground(ctx);
    Art.drawBoard(ctx, { minCol: state.colMin, maxCol: state.colMax });
    Art.drawExtendSideMarker(ctx, { active: state.extendActive, side: state.extendSide, minCol: state.colMin, maxCol: state.colMax });

    var flight = getInFlightCells();
    for (var col = state.colMin; col <= state.colMax; col++) {
      var arr = state.grid.get(col);
      if (!arr) continue;
      for (var row = 1; row <= arr.length; row++) {
        var cell = arr[row - 1];
        if (!cell) continue;
        if (flight.suppress[col + '_' + row]) continue;
        Art.drawCell(ctx, { col: col, row: row, color: cell.color, mark: 'none', time: state.time });
      }
    }
    flight.extra.forEach(function (c) {
      Art.drawCell(ctx, { col: c.col, row: c.row, color: c.color, mark: c.mark, t: c.t, time: state.time });
    });

    if (!state.paused) {
      Art.drawFloatingStructures(ctx, { blocks: state.floatingBlocks, time: state.time });
      state.clusterDisplay.forEach(function (cd) { Art.drawClusterCount(ctx, cd); });
    }

    if (state.piece && !state.paused && state.mode === 'playing') {
      var ghostCells = computeGhost();
      if (ghostCells) Art.drawGhost(ctx, { cells: ghostCells });
      Art.drawPiece(ctx, {
        cells: state.piece.cells.map(function (c) { return { col: state.piece.anchorCol + c.x, row: state.piece.anchorRow + c.y, color: c.ball ? 'ball' : c.color }; }),
        phase: piecePhase(state.piece),
        lockProgress: state.piece.inLockDelay ? clamp01(1 - state.piece.lockTimer / LOCK_DELAY) : 0,
        time: state.time
      });
    }

    Art.drawCenterLine(ctx, { minCol: state.colMin, maxCol: state.colMax });

    drawCurrentEventIndicator(ctx);

    Art.drawHud(ctx, { score: state.score, multiplier: computeMultiplier(), time: state.time, best: state.best, phase: hudPhase(), minCol: state.colMin, maxCol: state.colMax });

    if (state.extendActive) {
      Art.drawExtendPanel(ctx, extendPanelState());
    } else {
      Art.drawSidePanel(ctx, sidePanelState('left'));
      Art.drawSidePanel(ctx, sidePanelState('right'));
    }
    Art.drawNextPreview(ctx, {
      cells: state.nextPiece.cells.map(function (c) { return { dx: c.x, dy: c.y, color: c.ball ? 'ball' : c.color }; }),
      hasBall: state.nextPiece.hasBall, masked: state.paused, time: state.time
    });
    Art.drawBallSupply(ctx, { remain: state.ballState.mode === 'supply' ? state.ballState.supplyRemaining : 0 });

    if (isPicking()) {
      var p = state.settlement.currentPick;
      Art.drawRecolor(ctx, {
        open: true, side: p.side, candidates: p.candidates, remain: Math.max(0, p.remain),
        chosen: p.selectedIndex >= 0 ? p.selectedIndex : null, byTimeout: p.phase === 'timeout'
      });
    }

    if (input.abandonHolding && !input.abandonTriggered && state.mode !== 'over') {
      Art.drawAbandonGauge(ctx, { active: true, progress: abandonProgress() });
    }

    if (state.paused) Art.drawPauseOverlay(ctx, {});
    if (state.mode === 'over') Art.drawGameOver(ctx, buildGameOverState());
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
