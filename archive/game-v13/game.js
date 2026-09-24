/* 史萊姆擴張 - 遊戲邏輯 (spec.md v13 / guide.md v13)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理。
 * 座標約定: 絕對欄 col(全局不重編號), 列 row(1 = 最底列, 20、21 為緩衝列,
 * 22 以上無硬界)。盤面不做系統性重力沉降, 唯一位移來源是玩家消掉重力球
 * 觸發的重力事件(剛體整體下落)。v13 取消左右分邊, 全局只有一條任務軌。
 */
(function () {
  'use strict';

  /* 佔位圖形: 本作規格物件全部由 Art 涵蓋, 無需佔位幾何。保留空物件以符合專案慣例。 */
  var Placeholder = {};

  /* ---------------------------------------------------------------
   * 常數(數值參數表, spec.md v13)
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

  var EXPAND_ORDER = ['left', 'right', 'left', 'right'];
  var EXPAND_K = [1, 1, 2, 3];
  var EXPAND_REQ = [3, 6, 9, 12];
  var EXTEND_REQ_BASE = [5, 8, 12, 16, 20]; // 第 5~9 階
  var K_EXT = 2;

  var BASE_PER_CELL = 25;
  var N5_BONUS = 25;
  var QUALIFY_PTS = 12;
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

  var BALL_SUPPLY_SIZE = 4;

  var SPAWN_ROW = 20;
  var MAX_FALL_STEPS = 21;

  var FIXED_DT = 1 / 60;
  var MAX_FRAME_DT = 0.25;
  var MAX_SUB_STEPS = 15;

  var TOTAL_GUIDE_PAGES = 7;
  var BEST_KEY = 'slimeTetris_v13_best';

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
  function fmtRatio(num, den) { return den > 0 ? (num / den * 100).toFixed(1) + '%' : '—'; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function requirementFor(stageNum) {
    if (stageNum <= 4) return EXPAND_REQ[stageNum - 1];
    if (stageNum <= 9) return EXTEND_REQ_BASE[stageNum - 5];
    return 20 + 8 * (stageNum - 9);
  }
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
  function grantGravitySupply() {
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
   * 旋轉(簡化踢牆: 原地 -> 左1 -> 右1)。O 形套同一公式即可真實旋轉
   * 2x2 顏色矩陣(含球位置), 因為 O 的四格座標本身就是旋轉群的定義域。
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

  function computeGhost() {
    var piece = state.piece;
    if (!piece) return null;
    var row = piece.anchorRow;
    var guard = 0;
    while (!collideCells(piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row - 1 + c.y }; })) && guard < 400) { row -= 1; guard++; }
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
    var m = 1.0 + MULT_PER_COL * unlockedCols() + MULT_PER_EXT * (state.multCount || 0);
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
   * 削頂(延展獎勵 / 延伸關卡獎勵共用, v13: 全盤每一欄): 逐欄從最高
   * 已填格位往下削 K 個; 每欄皆回報(含 0 格), 供 UI 完整顯示。
   * ------------------------------------------------------------- */
  function shaveColumns(colsRange, k) {
    var perColumn = [], total = 0, trimCells = [];
    colsRange.forEach(function (c) {
      var filled = columnFilledDesc(c);
      var toRemove = filled.slice(0, k);
      perColumn.push({ col: c, count: toRemove.length });
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
   * 結算計分與計數歸屬(共用於 4a 主消除 與 4c 追加消除)
   * targetColor: 本次結算第 1 步取樣的目標色, 全程沿用。
   * ------------------------------------------------------------- */
  function scoreAndCategorizeGroups(groups, targetColor) {
    var addScore = 0, clearCells = [], targetCount = 0, cellCountNonBall = 0, ballCount = 0;
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
          ballCount++;
          state.stats.ballCleared++;
          clearCells.push({ col: cell.col, row: cell.row, color: 'ball', isTarget: false });
          return;
        }
        var isTarget = cell.color === targetColor;
        if (isTarget) {
          addScore += QUALIFY_PTS;
          targetCount++;
          state.task.remaining -= 1;
        }
        cellCountNonBall++;
        state.stats.totalCleared++;
        clearCells.push({ col: cell.col, row: cell.row, color: cell.color, isTarget: isTarget });
      });
    });
    state.stats.targetCleared += targetCount;
    state.stageStats.cleared += cellCountNonBall;
    state.stageStats.target += targetCount;
    return { addScore: addScore, clearCells: clearCells, targetCount: targetCount, ballCount: ballCount };
  }

  /* ---------------------------------------------------------------
   * 結算時序(方塊鎖定後): 見 spec.md「結算時序」1~8 步
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;

    // 第 1 步: 取樣目標色與分數倍率, 本次結算全程沿用
    var sampledColor = state.task.color;
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
    var scoreResult = scoreAndCategorizeGroups(groups, sampledColor);
    state.score += Math.round(scoreResult.addScore * multiplier);
    survivors = survivors.filter(function (s) {
      return !scoreResult.clearCells.some(function (c) { return c.col === s.col && c.row === s.row; });
    });

    var ballGroups = groups.filter(function (g) { return g.cells.some(function (c) { return c.color === 'ball'; }); });
    ballGroups.forEach(function (g) { g.anchor = anchorOf(g.cells); });
    ballGroups.sort(function (a, b) { if (a.anchor.row !== b.anchor.row) return b.anchor.row - a.anchor.row; return a.anchor.col - b.anchor.col; });

    state.settlement = {
      sampledColor: sampledColor, multiplier: multiplier,
      survivors: survivors,
      clearCells: scoreResult.clearCells,
      clearTimer: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      clearDuration: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      stage: 'clear',
      ballGroupQueue: ballGroups,
      ballGroupIndex: 0,
      gravityMovedAny: false,
      gravityDisplay: null,
      extraClear: null,
      currentExpansion: null,
      currentExtendReward: null,
      stageAchieved: null
    };

    // 4a: 一次性清除所有成立團格位(顯示用資料保留在 clearCells, grid 已清空)
    scoreResult.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
    recomputeClusterDisplay();
    recomputeFloating();

    state.mode = 'settle';

    // 若本次無成立團, clear 階段時長為 0, 立即往下推進(下一個 tick 即會推進, 這裡先讓時序啟動)
    if (state.settlement.clearDuration <= 0) afterClearStage();
  }

  function afterClearStage() {
    var s = state.settlement;
    if (!s) return;
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
        var res2 = scoreAndCategorizeGroups(groups2, s.sampledColor);
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
    state.settlement.extraClear = null;
    beginAdvancePhase();
  }

  // 第 5 步: 階段推進(A 的唯一發生點)
  function beginAdvancePhase() {
    var s = state.settlement;
    if (state.task.remaining <= 0) {
      var overflow = -state.task.remaining;
      var achievedStage = state.A + 1;
      var achievedColor = state.task.color;
      var achievedReq = state.task.required;
      var achievedStats = state.stageStats;
      state.A = achievedStage;
      if (achievedStage <= 4) state.stats.first4.push({ stage: achievedStage, cleared: achievedStats.cleared, target: achievedStats.target });
      var nextNum = achievedStage + 1;
      var req = requirementFor(nextNum);
      var newColor = pickColorExcluding(achievedColor);
      state.task.color = newColor;
      state.task.required = req;
      state.task.remaining = Math.max(1, req - overflow);
      state.stageStats = { cleared: 0, target: 0 };
      s.stageAchieved = { stage: achievedStage, color: achievedColor, required: achievedReq, overflow: overflow, stats: achievedStats, nextColor: newColor, nextRequired: req };
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
    else executeExtendReward(idx);
  }

  function executeExpansion(idx) {
    var s = state.settlement;
    var side = EXPAND_ORDER[idx - 1];
    var K = EXPAND_K[idx - 1];
    var newCol;
    if (side === 'left') { state.colMin -= 1; newCol = state.colMin; }
    else { state.colMax += 1; newCol = state.colMax; }

    var colsRange = range(state.colMin, state.colMax);
    var filledColsBefore = colsRange.filter(function (c) { return columnFilledDesc(c).length > 0; }).length;
    var shave = shaveColumns(colsRange, K);
    state.stats.expandTrimTotal += shave.total;
    state.stats.ballShaved += shave.trimCells.filter(function (c) { return c.color === 'ball'; }).length;
    s.survivors = s.survivors.filter(function (sv) { return !shave.trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; }); });

    var isFullWidth = (idx === 4);
    if (isFullWidth) {
      state.score += FULLWIDTH_BONUS;
      state.stats.extendEntered = true;
      state.stats.extendEnterPieces = state.stats.totalPieces;
      state.stats.extendEnterSeconds = state.time;
    }
    state.E += 1;
    recomputeClusterDisplay();
    recomputeFloating();

    state.stats.expandLog.push({ side: side, pieces: state.stats.totalPieces, seconds: state.time });

    var achieved = s.stageAchieved || { stage: idx, color: '—', required: 0, stats: { cleared: 0, target: 0 }, nextColor: state.task.color, nextRequired: state.task.required };
    console.log('[階段達成] 第' + achieved.stage + '階 目標色=' + achieved.color + ' 需求=' + achieved.required +
      ' 塊數=' + state.stats.totalPieces + ' 秒數=' + state.time.toFixed(1) +
      ' 本階消除顆數=' + achieved.stats.cleared + ' 本階目標色佔比=' + fmtRatio(achieved.stats.target, achieved.stats.cleared) +
      ' 獎勵=延展(側=' + (side === 'left' ? '左' : '右') + ' K=' + K + ' 削除=' + shave.total + ' 有格位欄數=' + filledColsBefore + (isFullWidth ? ' 滿寬+1500' : '') + ')' +
      ' 下一階目標色=' + achieved.nextColor + ' 落速=' + currentFallSpeed().toFixed(2) + ' 封閉洞數=' + finalClosedHoles());

    s.currentExpansion = {
      side: side, col: newCol, K: K, total: shave.total, perColumn: shave.perColumn, trimCells: shave.trimCells,
      bonus: isFullWidth, timer: EXPAND_DURATION, duration: EXPAND_DURATION, t: 0,
      nextColor: achieved.nextColor, nextRequired: achieved.nextRequired
    };
    s.stage = 'expand';
  }

  function executeExtendReward(idx) {
    var s = state.settlement;
    var m = (idx - 5) % 3;
    var kind = m === 0 ? 'multiplier' : (m === 1 ? 'supply' : 'shave');
    var trimData = null;
    if (kind === 'multiplier') {
      state.multCount += 1;
      state.multiplierFlash = 1;
      state.stats.extendRewardCounts.multiplier++;
    } else if (kind === 'supply') {
      grantGravitySupply();
      state.stats.extendRewardCounts.supply++;
    } else {
      trimData = shaveColumns(range(state.colMin, state.colMax), K_EXT);
      state.stats.extendTrimTotal += trimData.total;
      state.stats.ballShaved += trimData.trimCells.filter(function (c) { return c.color === 'ball'; }).length;
      s.survivors = s.survivors.filter(function (sv) { return !trimData.trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; }); });
      state.stats.extendRewardCounts.shave++;
    }
    state.E += 1;
    recomputeClusterDisplay();
    recomputeFloating();

    var achieved = s.stageAchieved || { stage: idx, color: '—', required: 0, stats: { cleared: 0, target: 0 }, nextColor: state.task.color, nextRequired: state.task.required };
    var rewardDesc = kind === 'multiplier' ? ('倍率 +0.25 → ×' + computeMultiplier().toFixed(2))
      : kind === 'supply' ? ('補給 ' + BALL_SUPPLY_SIZE + ' 塊')
      : ('削頂 K_ext=' + K_EXT + ' 共-' + trimData.total + ' 格');
    console.log('[階段達成] 第' + achieved.stage + '階 目標色=' + achieved.color + ' 需求=' + achieved.required +
      ' 塊數=' + state.stats.totalPieces + ' 秒數=' + state.time.toFixed(1) +
      ' 本階消除顆數=' + achieved.stats.cleared + ' 本階目標色佔比=' + fmtRatio(achieved.stats.target, achieved.stats.cleared) +
      ' 獎勵=延伸(' + rewardDesc + ')' +
      ' 下一階目標色=' + achieved.nextColor + ' 落速=' + currentFallSpeed().toFixed(2) + ' 封閉洞數=' + finalClosedHoles());

    s.currentExtendReward = {
      kind: kind,
      amount: kind === 'multiplier' ? 0.25 : (kind === 'supply' ? BALL_SUPPLY_SIZE : K_EXT),
      value: kind === 'multiplier' ? computeMultiplier() : undefined,
      trimCells: trimData ? trimData.trimCells : null,
      perColumn: trimData ? trimData.perColumn : null,
      total: trimData ? trimData.total : 0,
      timer: EXTEND_REWARD_DURATION, duration: EXTEND_REWARD_DURATION, t: 0,
      nextColor: achieved.nextColor, nextRequired: achieved.nextRequired
    };
    s.stage = 'extendReward';
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
        if (s.currentExpansion.timer <= 0) beginRewardOrFinalize();
        break;
      case 'extendReward':
        s.currentExtendReward.timer -= dt;
        s.currentExtendReward.t = clamp01(1 - s.currentExtendReward.timer / EXTEND_REWARD_DURATION);
        if (s.currentExtendReward.timer <= 0) beginRewardOrFinalize();
        break;
    }
  }

  /* ---------------------------------------------------------------
   * console 輸出(埋點與試玩觀察)
   * ------------------------------------------------------------- */
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
    var residual = finalBallResidual();
    var eNoBall = st.totalPieces > 0 ? ((st.totalCleared - st.ballGroupTrueCells - st.extraClearCells) / st.totalPieces) : 0;
    var extendPieces = st.extendEntered ? (st.totalPieces - st.extendEnterPieces) : 0;
    var extendSeconds = st.extendEntered ? (state.time - st.extendEnterSeconds) : 0;
    var first4Cleared = 0, first4Target = 0;
    st.first4.forEach(function (s) { first4Cleared += s.cleared; first4Target += s.target; });

    console.log('===== 本局結束彙整 =====');
    console.log('結束原因:', reasonText, ' 總塊數:', st.totalPieces, ' 總秒數:', state.time.toFixed(1));
    console.log('硬降使用率:', st.totalPieces > 0 ? (st.hardDropLocks / st.totalPieces * 100).toFixed(1) + '%' : '—');
    console.log('四次延展:', [1, 2, 3, 4].map(function (i) {
      var e = st.expandLog[i - 1];
      return e ? ('第' + i + '次(' + (e.side === 'left' ? '左' : '右') + '):第' + e.pieces + '塊/' + e.seconds.toFixed(1) + 's') : ('第' + i + '次:—');
    }).join(' | '));
    console.log('已解鎖欄數:', unlockedCols(), '/4  最終已達成階數 A=', state.A, ' 當前階剩餘=', state.task ? state.task.remaining : '—');
    console.log('消除總顆數(不含球):', st.totalCleared,
      ' 目標色顆數:', st.targetCleared,
      ' 目標色佔比(整局):', fmtRatio(st.targetCleared, st.totalCleared),
      ' 每塊期望消除顆數E:', st.totalPieces > 0 ? (st.totalCleared / st.totalPieces).toFixed(3) : '—',
      ' E_無球:', eNoBall.toFixed(3));
    console.log('第1~4階目標色佔比:', fmtRatio(first4Target, first4Cleared), '(單局樣本小, 僅供參考; 3局合併訊號線 0.45)');
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
    console.log('進入延伸關卡=', st.extendEntered ? '是' : '否',
      st.extendEntered ? (' 塊數=' + extendPieces + ' 秒數=' + extendSeconds.toFixed(1) + ' 佔比=' + (state.time > 0 ? (extendSeconds / state.time * 100).toFixed(1) + '%' : '—')) : '');
    console.log('已執行延伸獎勵次數 G=', Math.max(0, state.E - 4));
    console.log('各獎勵累計次數: 倍率=', st.extendRewardCounts.multiplier, ' 補給=', st.extendRewardCounts.supply, ' 削頂=', st.extendRewardCounts.shave);
    console.log('讀數參照(僅供對照, 非判定門檻): 完全被動期望0.35 / 單局追問線0.46 / 3局平均訊號線0.43(整局消除不足60顆不判讀)');
    console.log('=========================');
  }

  /* ---------------------------------------------------------------
   * 遊戲結束 / 開始 / 重開
   * ------------------------------------------------------------- */
  function endGame(reason) {
    if (state.mode === 'over') return;
    state.mode = 'over';
    state.piece = null;
    state.settlement = null;
    state.queuedInput = null;
    var isBest = reason !== 'abandon' && (state.best === null || state.score > state.best);
    if (isBest) { state.best = state.score; saveBest(state.best); }
    state.gameOverInfo = {
      score: state.score, seconds: state.time, columns: unlockedCols(),
      stage: state.A, reason: reason, newRecord: isBest
    };
    printSummary(reason);
  }

  function freshStats() {
    return {
      totalPieces: 0, hardDropLocks: 0, totalCleared: 0, targetCleared: 0,
      teamSize: {}, expandTrimTotal: 0, extendTrimTotal: 0, expandLog: [],
      ballSpawned: 0, ballCleared: 0, ballShaved: 0, ballGroupTrueCells: 0,
      gravityTriggerCount: 0, gravityMovedCount: 0, gravityIdleCount: 0,
      gravityDisplacedTotal: 0, gravityMaxDisplaced: 0, gravityMaxDrop: 0,
      largeGravityEvents: [],
      extraClearCount: 0, extraClearCells: 0,
      extendRewardCounts: { multiplier: 0, supply: 0, shave: 0 },
      extendEntered: false, extendEnterPieces: 0, extendEnterSeconds: 0,
      first4: []
    };
  }

  // 建立全新一局的骨架(不設定第 1 階任務、不生成方塊)
  function newGameSkeleton(keepBest) {
    var prevBest = keepBest && state ? state.best : loadBest();
    state = {
      colorBag: [], shapeBag: [],
      ballState: { mode: 'bag', bagQueue: [], bagPos: 0, groupPrevLastTrue: false, forcePendingTrue: false, pendingFromSupply: false, lastHadBall: false, supplyRemaining: 0 },
      colMin: 0, colMax: 5, grid: new Map(),
      time: 0, score: 0, best: prevBest,
      mode: 'playing', guideOpen: false, guidePage: 1, queuedInput: null, rKeyLocked: false,
      gameOverInfo: null,
      piece: null, nextPiece: null, settlement: null,
      clusterDisplay: [], floatingBlocks: [],
      A: 0, E: 0, task: null, multCount: 0, multiplierFlash: 0,
      stageStats: { cleared: 0, target: 0 },
      stats: freshStats()
    };
  }

  // 第 1 階任務設值 + 生成前兩塊(供「開始第一局」與「重開」共用)
  function beginFirstStageAndSpawn() {
    var req = requirementFor(1);
    state.task = { color: pickColorExcluding(null), required: req, remaining: req };
    state.stageStats = { cleared: 0, target: 0 };
    state.nextPiece = makeNextPieceData();
    spawnNextAsCurrent();
    recomputeClusterDisplay();
    recomputeFloating();
  }

  function resetInputState() {
    input.hActiveDir = 0; input.hPhase = 'idle'; input.hDas = 0;
    input.leftDown = false; input.rightDown = false; input.softDown = false;
    input.abandonHolding = false; input.abandonStart = 0; input.abandonTriggered = false;
  }

  function restartGame() {
    newGameSkeleton(true);
    beginFirstStageAndSpawn();
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
    if (state.mode === 'settle') { if (state.queuedInput !== 'guide') state.queuedInput = 'guide'; return; }
    if (state.mode === 'over') { state.guideOpen = true; return; }
    if (state.mode === 'playing') state.mode = 'paused';
    state.guideOpen = true; // playing->paused 或已是 paused, 皆顯示說明
  }
  function closeGuideOverlay() {
    state.guideOpen = false;
    if (state.mode === 'guideOpening') {
      beginFirstStageAndSpawn();
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
      } else if (s.stage === 'extendReward' && s.currentExtendReward && s.currentExtendReward.trimCells) {
        var rt = s.currentExtendReward.t || 0;
        s.currentExtendReward.trimCells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'shaving', t: rt }); });
      }
    }
    return { suppress: suppress, extra: extra };
  }

  function toArtCell(c) {
    return { x: c.col, y: c.row, kind: c.color === 'ball' ? 'ball' : 'color', color: c.color === 'ball' ? undefined : c.color, mark: c.mark || 'none', t: c.t || 0 };
  }

  function drawSettlementOverlay(ctx) {
    if (state.mode !== 'settle' || !state.settlement) return;
    var s = state.settlement;
    if (s.stage === 'clear' && s.clearCells.length) {
      var t = s.clearDuration > 0 ? clamp01(1 - s.clearTimer / s.clearDuration) : 1;
      var deducted = s.clearCells.filter(function (c) { return c.isTarget; }).length;
      var balls = s.clearCells.filter(function (c) { return c.color === 'ball'; }).length;
      Art.drawClearResult(ctx, {
        cells: s.clearCells.map(function (c) { return { x: c.col, y: c.row, isTarget: !!c.isTarget }; }),
        deducted: deducted, balls: balls, targetColor: s.sampledColor, t: t
      });
    } else if (s.stage === 'gravity' && s.gravityDisplay) {
      var g = s.gravityDisplay;
      var gt = clamp01(1 - g.timer / g.duration);
      var origin = anchorOf(g.originCells);
      Art.drawGravityEvent(ctx, { x: origin.col, y: origin.row, size: g.kind === 'idle' ? 'zero' : g.kind, t: gt });
      g.fallingBlocks.forEach(function (fb) { Art.drawFloatingEventBlock(ctx, { cells: fb.cells.map(function (c) { return { x: c.col, y: c.row }; }), role: 'fall', t: gt }); });
      g.staticBlocks.forEach(function (sb) { Art.drawFloatingEventBlock(ctx, { cells: sb.cells.map(function (c) { return { x: c.col, y: c.row }; }), role: 'stay', t: gt }); });
    } else if (s.stage === 'extraclear' && s.extraClear) {
      var et = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
      Art.drawExtraClear(ctx, { cells: s.extraClear.cells.map(function (c) { return { x: c.col, y: c.row }; }), t: et });
    } else if (s.stage === 'expand' && s.currentExpansion) {
      var ce = s.currentExpansion;
      Art.drawExpandEvent(ctx, { side: ce.side, col: ce.col, K: ce.K, t: ce.t, nextColor: ce.nextColor, nextRequired: ce.nextRequired });
      Art.drawShaveIndicator(ctx, { perCol: ce.perColumn.map(function (p) { return { x: p.col, count: p.count }; }), total: ce.total });
      if (ce.bonus) Art.drawFullWidthBonus(ctx, { t: ce.t });
    } else if (s.stage === 'extendReward' && s.currentExtendReward) {
      var er = s.currentExtendReward;
      Art.drawExtendReward(ctx, { kind: er.kind, amount: er.amount, value: er.value, t: er.t, nextColor: er.nextColor, nextRequired: er.nextRequired });
      if (er.trimCells) Art.drawShaveIndicator(ctx, { perCol: er.perColumn.map(function (p) { return { x: p.col, count: p.count }; }), total: er.total });
    }
  }

  function nextExpandSideState() {
    if (!state.task || state.E >= 4) return { side: null, col: null };
    var side = EXPAND_ORDER[state.E];
    var col = side === 'left' ? state.colMin - 1 : state.colMax + 1;
    return { side: side, col: col };
  }

  function targetColorState() {
    if (!state.task) return { color: null, announcing: false, t: 0 };
    var announcing = false, t = 0;
    if (state.mode === 'settle' && state.settlement) {
      var s = state.settlement;
      if (s.stage === 'expand' && s.currentExpansion) { t = s.currentExpansion.t; announcing = t >= 0.7; }
      else if (s.stage === 'extendReward' && s.currentExtendReward) { t = s.currentExtendReward.t; announcing = t >= 0.7; }
    }
    return { color: state.task.color, announcing: announcing, t: t };
  }

  function taskProgressState() {
    if (!state.task) return { stage: 1, remaining: 1, required: 1, phase: 'expand', color: 'A' };
    var stageNum = state.A + 1;
    return { stage: stageNum, remaining: state.task.remaining, required: state.task.required, phase: stageNum <= 4 ? 'expand' : 'extend', color: state.task.color };
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
    return { score: info.score || 0, seconds: info.seconds || 0, columns: info.columns || 0, stage: info.stage || 0, reason: info.reason || 'blockout', newRecord: !!info.newRecord, best: state.best };
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
    state.clusterDisplay.forEach(function (cd) { Art.drawClusterCount(ctx, { x: cd.col, y: cd.row, n: cd.count }); });

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

    Art.drawTargetColor(ctx, targetColorState());
    Art.drawTaskProgress(ctx, taskProgressState());
    Art.drawSupplyRemaining(ctx, { remaining: state.ballState.mode === 'supply' ? state.ballState.supplyRemaining : 0 });
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
