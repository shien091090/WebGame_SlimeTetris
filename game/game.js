/* 史萊姆擴張 - 遊戲邏輯 (spec.md v26 / guide.md v26)
 * 純 vanilla JS, 無模組、無依賴。繪製一律委由 window.Art 處理, 聲音一律委由
 * window.Sound 處理。載入順序 art/art.js -> audio/sound.js -> game.js。
 * 座標約定: 絕對欄 col(全局不重編號), 列 row(1 = 最底列, 20、21 為緩衝列,
 * 22 以上無硬界)。盤面不做系統性重力沉降, 唯一位移來源是玩家消掉重力球
 * 觸發的重力事件(剛體整體下落, 逐塊演出)。
 *
 * 本檔基於 v25 build 調整至 v26, 相對 v25 的核心改動:
 * - 新增音效: 依 audio/sound.md 事件表在各時序點呼叫 Sound.play /
 *   Sound.playMusic / Sound.stopMusic; 開場說明第一個按鍵呼叫 Sound.init()
 * - 新增靜音鍵 M: 任何畫面皆可按, 立即生效、不排隊、重開不重設(狀態存於
 *   Sound 模組本身, 不放進會被 restart 整個重建的 state); 畫面上呼叫
 *   Art.drawMuteIndicator(靜音時常駐) 與 Art.drawMuteToast(切換後停留 1 秒)
 * - 第 8 個任務(大團第 2 輪)需求 4 -> 2(spec-review v26)
 * - 埋點新增: 逐局開局時的靜音狀態 / 是否在任何時點切成靜音 / 第一次切換靜音
 *   的塊序與星數 / 整局切換次數; 逐過場按鍵分類加「M」; 逐大團任務加「以為
 *   做到」次數(一次結算合計消掉 >=5 顆但沒有任何一團 n>=5 的次數)
 * - 修正實作缺失(spec-review v26 讀第 10 輪紀錄發現): 重力球彙整的「被消除
 *   數」與逐顆明細對不上 — 追加消除(4c)清掉的殘存重力球(不觸發重力事件)
 *   先前沒有回填 ballPieces 的結局, 局終被誤記為「殘存」; 現在 4c 與同團含
 *   兩顆以上重力球時都會逐顆回填結局
 *
 * 佔位圖形: 無。本作規格物件全部由 Art 涵蓋。
 */
(function () {
  'use strict';

  var Placeholder = {}; // 本作無需佔位幾何, 保留空物件供回報核對

  /* ---------------------------------------------------------------
   * 常數(數值參數表, spec.md v22)
   * ------------------------------------------------------------- */
  var COLORS = ['A', 'B', 'C'];

  var SHAPES = {
    I: { N: 4, width: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }] },
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
  var NEW_SHAPE_ORDER = ['V', 'U', 'X']; // 對應 大團 -> 用新形狀方塊 -> 重力下落 的解鎖順序
  var NEW_SHAPE_NAME = { V: '角形', U: '杯形', X: '十字形' };

  var EXPAND_ORDER = ['left', 'right', 'left', 'right'];
  var DIG_REQ = [6, 8, 9, 10]; // v22 定案
  var VARIETY_REQ = [2, 1, 2, 2, 4, 2]; // k=5..10, v22 定案(第 10 個 v25 改 3 -> 2; 第 8 個 spec-review v26 改 4 -> 2)
  var OVERFLOW_CAP = 2; // v25: 開地任務溢出最多扣抵 2 顆, 刪除「新任務剩餘最少留 1」
  var BUILD_VERSION = 'v26';
  var MUTE_TOAST_DURATION = 1.0; // v26: 靜音切換提示停留 1.0 秒

  // 任務面板第二欄對照(v22 定案表, style.md「任務面板第二欄對照」)
  var REWARD_PLAN = {
    1: { reward: 'expand', side: 'left' },
    2: { reward: 'expand', side: 'right' },
    3: { reward: 'expand', side: 'left' },
    4: { reward: 'expand', side: 'right', shave: true },
    5: { reward: 'newPiece', shape: 'V', clearBall: true },
    6: { reward: 'newPiece', shape: 'U', shave: true },
    7: { reward: 'newPiece', shape: 'X' },
    8: { reward: 'shave' },
    9: { reward: 'clearBall' },
    10: { reward: 'clear' }
  };

  var FALL_SPEED = [2.4, 3.0, 3.6, 4.3, 4.8, 5.1, 5.4, 5.8, 6.1, 6.5]; // 星 0~9(v23 改前 3 檔, v25 沿用)
  var SOFT_SPEED = 12;

  var LOCK_DELAY = 0.5;
  var MAX_LOCK_RESETS = 1;

  var DAS = 0.170;
  var ARR = 0.050;

  var ABANDON_HOLD = 1.0;

  var CLEAR_DURATION = 0.4;
  var EXTRA_CLEAR_DURATION = 0.4;
  var WIPE_DURATION = 1.0;

  var GRAV_PER_CELL = 0.06;
  var GRAV_MIN_BLOCK = 0.15;
  var GRAV_LAND_PAUSE = 0.12;
  var GRAV_EVENT_CAP = 1.5;
  var GRAV_ZERO_DUR = 0.2;
  var GRAV_VISUAL_LARGE_THRESHOLD = 10; // Art.drawGravityEvent 的 size:'large' 門檻(style.md 未改, 維持 >=10)
  var GRAV_LOG_LARGE_THRESHOLD = 20; // v25: 埋點「大型重力事件」判讀紅線門檻由 >=10 改 >=20 格(不是遊戲參數, 不影響畫面)

  var SPAWN_ROW = 20;
  var MAX_FALL_STEPS = 21;

  var FIXED_DT = 1 / 60;
  var MAX_FRAME_DT = 0.25;
  var MAX_SUB_STEPS = 15;

  var BEST_KEY = 'slimeTetris_v26_best';
  var TOTAL_GAMES_KEY = 'slimeTetris_v26_totalGames';
  var GAME_NAME = 'WebGame_SlimeTetris';

  var SHAVE_FOLLOWUP_WINDOW = 10;
  var WIPE_FOLLOWUP_WINDOW = 10;

  var CLEAR_BALL_CAP = 2; // 每局上限(以獲得數計)
  var CLEAR_BALL_OFFSET = 2; // v22: 兩顆一律「獲得後第 2 塊」

  var TOTAL_GUIDE_PAGES = (window.Art && Art.guidePages) || 6; // v25: guide.md 共 6 頁
  var PH = (window.Art && Art.eventPhases) || { expand: 1.0, newShape: 1.2, shave: 0.8, star: 1.0, starFinal: 2.0, reveal: 1.6, speed: 1.0, gap: 0.2 };

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
  function bumpTotalGames() {
    try {
      var v = Number(localStorage.getItem(TOTAL_GAMES_KEY) || '0') + 1;
      localStorage.setItem(TOTAL_GAMES_KEY, String(v));
      return v;
    } catch (e) { return null; }
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function timestampName() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
      pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
  }
  function keysOf(arr) {
    var o = Object.create(null);
    arr.forEach(function (c) { o[c.col + '_' + c.row] = true; });
    return o;
  }
  function isNewShape(key) { return key === 'V' || key === 'U' || key === 'X'; }
  function pieceCellKind(c) { return c.ball ? 'ball' : (c.clearBall ? 'clearBall' : 'color'); }
  function gridColorKind(color) { return color === 'ball' ? 'ball' : (color === 'clearBall' ? 'clearBall' : 'color'); }

  /* ---------------------------------------------------------------
   * 任務序列(寫死於 spec「任務軌」): k = 任務序號(1 起, 全局固定 10 個)
   * ------------------------------------------------------------- */
  function taskKindFor(k) {
    if (k <= 4) return 'dig';
    var idx = (k - 5) % 3;
    return idx === 0 ? 'big' : (idx === 1 ? 'newShape' : 'gravity');
  }
  function taskRequiredFor(k) {
    if (k <= 4) return DIG_REQ[k - 1];
    return VARIETY_REQ[k - 5];
  }
  function rewardPlanFor(k) { return REWARD_PLAN[k] || REWARD_PLAN[1]; }
  // 過場第 1 段的項目序列(依演出順序): 延展 -> 新形狀方塊展示 -> 削頂
  function stage1ItemsFor(k) {
    var plan = rewardPlanFor(k);
    var items = [];
    if (plan.reward === 'expand') items.push({ type: 'expand', side: plan.side });
    else if (plan.reward === 'newPiece') items.push({ type: 'unlock', shape: plan.shape });
    // 第 8 個任務的削頂是「唯一的回報」, reward 本身就是 'shave'(不是附加的 plan.shave
    // 旗標), 兩種寫法都要觸發削頂, 否則第 8 個任務不會削頂(第 9 輪紀錄證實的缺失)
    if (plan.shave || plan.reward === 'shave') items.push({ type: 'shave' });
    return items;
  }
  function makeTaskShell(kind, color, required, remaining, k) {
    return {
      k: k, kind: kind, color: color, required: required, remaining: remaining,
      enteredPieces: state.stats.totalPieces, enteredSeconds: state.time,
      newShapeDealt: { V: 0, U: 0, X: 0 }, newShapeHits: [],
      advanceCount: 0, lastAdvanceDelta: 0, advanceDeltas: [], // v25: 每一次有推進的結算的推進量清單
      bigMistakenCount: 0 // v26 埋點: 大團任務「以為做到」次數(合計 >=5 顆但沒有任何一團 n>=5)
    };
  }

  /* ---------------------------------------------------------------
   * 全域狀態
   * ------------------------------------------------------------- */
  var state = null;
  var input = null;
  // v26: 靜音/聲音啟用狀態不放進 state(state 在 restartGame 時整個重建, 但
  // 「重開不重設」且「聲音啟用後本次開啟遊戲期間不再回到未啟用」— 兩者都要
  // 跨局存活, 所以留在 module 層級, 由 window.Sound 本身保存實際靜音值)。
  var soundInited = false;
  var muteToastShownAt = null; // 非 null 時表示靜音切換提示正在停留(performance.now() 時間戳)

  function toggleMute() {
    var next = !Sound.isMuted();
    Sound.setMuted(next);
    muteToastShownAt = performance.now();
    if (!state || !state.stats) return;
    state.stats.muteToggleCount = (state.stats.muteToggleCount || 0) + 1;
    if (next) state.stats.everMutedTrue = true;
    if (state.stats.firstMuteToggle == null) {
      state.stats.firstMuteToggle = {
        pieceIndex: state.piece ? state.piece.pieceIndex : state.stats.totalPiecesSpawned,
        star: state.E
      };
    }
  }

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

  function refillShapeBag() {
    var arr = BASE_SHAPE_KEYS.map(function (k) { return { key: k, guaranteed: false }; });
    state.unlockedShapes.forEach(function (k) {
      arr.push({ key: k, guaranteed: false });
      arr.push({ key: k, guaranteed: false });
    });
    var guarantee = state.shapeBagGuaranteePending.slice();
    state.shapeBagGuaranteePending = [];
    guarantee.forEach(function (k) {
      var idx = -1;
      for (var i = 0; i < arr.length; i++) { if (arr[i].key === k && !arr[i].guaranteed) { idx = i; break; } }
      if (idx >= 0) arr.splice(idx, 1);
    });
    shuffle(arr);
    state.shapeBag = arr.concat();
    for (var i = 0; i < guarantee.length; i++) {
      state.shapeBag.push({ key: guarantee[guarantee.length - 1 - i], guaranteed: true });
    }
  }
  function drawShape() {
    var wasEmpty = !state.shapeBag.length;
    if (wasEmpty) refillShapeBag();
    var entry = state.shapeBag.pop();
    return { key: entry.key, guaranteed: entry.guaranteed, isBagFirst: wasEmpty };
  }

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

  /* ---------------------------------------------------------------
   * 清色球: 待發清單的入口判定(每次抽出新的一塊作為下一塊預覽時執行)
   * ------------------------------------------------------------- */
  function countClearBallsOnBoard() {
    var total = 0;
    state.grid.forEach(function (arr) {
      arr.forEach(function (cell) { if (cell && cell.color === 'clearBall') total++; });
    });
    return total;
  }
  function countRealColors() {
    var counts = { A: 0, B: 0, C: 0 };
    state.grid.forEach(function (arr) {
      arr.forEach(function (cell) { if (cell && counts.hasOwnProperty(cell.color)) counts[cell.color]++; });
    });
    return counts;
  }
  function sumFloatingCells() {
    var total = 0;
    state.floatingBlocks.forEach(function (fb) { total += fb.cells.length; });
    return total;
  }

  function grantClearBall(sourceK, pieceIndexAtEvent) {
    if (state.clearBall.obtainedCount >= CLEAR_BALL_CAP) {
      state.stats.clearBall.blockedCount++;
      return null;
    }
    state.clearBall.obtainedCount++;
    state.stats.clearBall.obtainedCount++;
    var id = state.clearBall.nextId++;
    var entry = {
      id: id, source: sourceK, obtainedPieces: state.stats.totalPieces, obtainedSeconds: Number(state.time.toFixed(2)),
      earliestIndex: pieceIndexAtEvent + CLEAR_BALL_OFFSET,
      dispensedIndex: null, deferredByBall: false, deferredByFirstShape: false,
      gapPiecesToTrigger: '—', stage: null, triggeredPieces: null, triggeredSeconds: null,
      groupColor: null, groupSize: null, groupHasBall: null, concurrentClearBallCount: null,
      colorCountsBeforeWipe: null, isMaxColor: null, topColumnsOfColor: null,
      wipeCellCount: null, merged: false,
      before: null, after: null, followup10: null, outcome: null, firstWipeOfGame: null
    };
    state.clearBall.queue.push(entry);
    state.clearBall.byId[id] = entry;
    state.log.clearBallList.push(entry);
    return entry;
  }

  function assignPendingClearBall(order, hasBallThisPiece, isGuaranteedFirst) {
    var q = state.clearBall.queue;
    if (!q.length) return false;
    var entry = q[0];
    var predictedSeq = state.stats.totalPiecesSpawned + 1;
    if (predictedSeq < entry.earliestIndex) return false;
    if (hasBallThisPiece) { entry.deferredByBall = true; return false; }
    if (isGuaranteedFirst) { entry.deferredByFirstShape = true; return false; }
    var curHasClearBall = state.piece && state.piece.cells.some(function (c) { return c.clearBall; });
    if (curHasClearBall) return false;
    q.shift();
    var idx = Math.floor(Math.random() * order.length);
    order[idx].clearBall = true;
    order[idx].clearBallId = entry.id;
    entry.dispensedIndex = predictedSeq;
    state.stats.clearBall.dispensedCount++;
    return true;
  }

  function makeNextPieceData() {
    var drawn = drawShape();
    var shapeKey = drawn.key;
    var shape = SHAPES[shapeKey];
    var localCells = shape.cells.map(function (c) { return { x: c.x, y: c.y, color: null, ball: false, clearBall: false, clearBallId: null }; });
    var order = localCells.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    var hasBall = decideNextBall();
    if (hasBall) {
      var idx = Math.floor(Math.random() * order.length);
      order[idx].ball = true;
    }
    var hasClearBall = assignPendingClearBall(order, hasBall, drawn.guaranteed);
    order.forEach(function (c) { if (!c.ball && !c.clearBall) c.color = drawColor(); });
    return { shapeKey: shapeKey, cells: localCells, hasBall: hasBall, hasClearBall: hasClearBall, guaranteed: drawn.guaranteed, isBagFirst: drawn.isBagFirst };
  }

  function spawnAnchorCol(shapeKey, colMin, colMax) {
    var shape = SHAPES[shapeKey];
    var w = colMax - colMin + 1;
    return colMin + Math.floor((w - shape.width) / 2);
  }

  function instantiatePiece(data, pieceIndex) {
    var anchorCol = spawnAnchorCol(data.shapeKey, state.colMin, state.colMax);
    return {
      shapeKey: data.shapeKey, N: SHAPES[data.shapeKey].N, pieceIndex: pieceIndex,
      cells: data.cells.map(function (c) { return { x: c.x, y: c.y, color: c.color, ball: c.ball, clearBall: c.clearBall, clearBallId: c.clearBallId }; }),
      anchorCol: anchorCol, anchorRow: SPAWN_ROW,
      fallProgress: 0, inLockDelay: false, lockTimer: 0, resetsUsed: 0,
      hardDropUsed: false, spawnT: state.time, guaranteed: !!data.guaranteed,
      softDropCellCount: 0, softDropSeconds: 0, lockDelayElapsed: 0,
      lastActionT: null, firstSoftDropT: null // v25 埋點: 生成到最後一次橫移/旋轉、到第一次軟降的秒數
    };
  }

  function computeSpawnCells(data, colMin, colMax) {
    var anchorCol = spawnAnchorCol(data.shapeKey, colMin, colMax);
    return data.cells.map(function (c) { return { col: anchorCol + c.x, row: SPAWN_ROW + c.y }; });
  }

  function spawnFootprintMaxHeight(shapeKey) {
    var anchorCol = spawnAnchorCol(shapeKey, state.colMin, state.colMax);
    var w = SHAPES[shapeKey].width;
    var m = 0;
    for (var c = anchorCol; c < anchorCol + w; c++) m = Math.max(m, columnTop(c));
    return m;
  }

  function recordPieceSpawn(data, isBlockoutProbe) {
    var anchorCol = spawnAnchorCol(data.shapeKey, state.colMin, state.colMax);
    var w = SHAPES[data.shapeKey].width;
    var maxColH = 0;
    for (var c = anchorCol; c < anchorCol + w; c++) maxColH = Math.max(maxColH, columnTop(c));
    var hasBall = data.cells.some(function (c) { return c.ball; });
    var hasClearBall = data.cells.some(function (c) { return c.clearBall; });
    state.stats.totalPiecesSpawned++;
    if (state.stats.firstAnyPieceSpawnedIndex == null) state.stats.firstAnyPieceSpawnedIndex = state.stats.totalPiecesSpawned;
    if (isNewShape(data.shapeKey)) {
      state.stats.shapeDealCount[data.shapeKey] = (state.stats.shapeDealCount[data.shapeKey] || 0) + 1;
      if (state.stats.shapeFirstDealt[data.shapeKey] == null) state.stats.shapeFirstDealt[data.shapeKey] = state.stats.totalPiecesSpawned;
      if (state.task && state.task.kind === 'newShape') {
        state.task.newShapeDealt[data.shapeKey] = (state.task.newShapeDealt[data.shapeKey] || 0) + 1;
      }
    }
    state.log.pieceSpawn.push({
      index: state.stats.totalPiecesSpawned, shape: data.shapeKey, cellCount: data.cells.length,
      hasBall: hasBall, hasClearBall: hasClearBall, spawnColMaxHeight: maxColH, firstDealt: !!data.guaranteed,
      starAtSpawn: state.E
    });
    // v26 修正: block out 試算生成的那一塊(isBlockoutProbe)從未真正落下、也
    // 從未 setCell 進盤面, 它的球不存在任何一種結局(消除/零位移/削頂/殘存)
    // 都套不上 — 局終沒有 outcome 的清理邏輯會把它也計成「殘存」, 但盤面實際
    // 掃描(finalBallResidual)數不到它, 導致彙整 residual 與逐顆明細的
    // outcome==='residual' 筆數對不上(spec-review v26「彙整與明細交叉核對」)。
    // spec 埋點原文「生成到局終剩幾塊」本身也註明「排除來不及用的球」, 這塊
    // 從未進盤面就是最極端的「來不及用」, 不開一筆
    if (hasBall && !isBlockoutProbe) {
      // v25 埋點: 逐含球塊 — 球的結局(消除且有位移/零位移/被削頂削除/局終殘存)與生成到局終剩幾塊
      state.log.ballPieces.push({
        pieceIndex: state.stats.totalPiecesSpawned, starAtSpawn: state.E,
        outcome: null, outcomeStar: null, outcomePieceIndex: null, piecesRemainingAtEnd: null
      });
    }
    return state.stats.totalPiecesSpawned;
  }

  function spawnNextAsCurrent() {
    var data = state.nextPiece;
    var idx = recordPieceSpawn(data);
    state.piece = instantiatePiece(data, idx);
    state.nextPiece = makeNextPieceData();
  }

  /* ---------------------------------------------------------------
   * 盤面格位存取(絕對欄 -> Map, 全局不重編號)
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
  function closedHoleCellsList(colsRange) {
    var out = [];
    colsRange.forEach(function (c) {
      var top = columnTop(c);
      var arr = state.grid.get(c);
      for (var r = 1; r < top; r++) { if (!arr || !arr[r - 1]) out.push({ col: c, row: r }); }
    });
    return out;
  }
  function removeColorFromBoard(color) {
    var removed = [];
    for (var c = state.colMin; c <= state.colMax; c++) {
      var arr = state.grid.get(c);
      if (!arr) continue;
      for (var r = 1; r <= arr.length; r++) {
        var cell = arr[r - 1];
        if (cell && cell.color === color) { removed.push({ col: c, row: r }); arr[r - 1] = null; }
      }
    }
    return removed;
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
   * 旋轉(繞框中心旋轉, 通用於原 7 種與新 3 種)。簡化踢牆: 原地 -> 左1 -> 右1。
   * ------------------------------------------------------------- */
  function rotateCellsList(cells, N, dir) {
    return cells.map(function (c) {
      var nx, ny;
      if (dir === 'cw') { nx = c.y; ny = N - 1 - c.x; }
      else if (dir === 'ccw') { nx = N - 1 - c.y; ny = c.x; }
      else { nx = N - 1 - c.x; ny = N - 1 - c.y; }
      return { x: nx, y: ny, color: c.color, ball: c.ball, clearBall: c.clearBall, clearBallId: c.clearBallId };
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
        Sound.play('rotate'); // v26: 三個旋轉鍵按下且旋轉成立時(含踢牆後成立); 失敗不出聲
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
    if (!piece) return;
    piece.lastActionT = state.time; // v25 埋點: 生成到最後一次橫移/旋轉的秒數
    if (!piece.inLockDelay) return;
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
    return piece.cells.map(function (c) { return { col: piece.anchorCol + c.x, row: row + c.y, ball: c.ball, clearBall: c.clearBall, color: c.color }; });
  }

  function currentFallSpeed() { return FALL_SPEED[Math.max(0, Math.min(9, state.E))]; }
  function unlockedCols() { return (state.colMax - state.colMin + 1) - 6; }

  /* ---------------------------------------------------------------
   * 下落中方塊每步更新(playing 狀態)
   * ------------------------------------------------------------- */
  function updatePlaying(dt) {
    var piece = state.piece;
    if (!piece) return;
    if (input.softDown) {
      piece.softDropSeconds += dt;
      if (piece.firstSoftDropT == null) piece.firstSoftDropT = state.time; // v25 埋點
    }
    var speed = input.softDown ? SOFT_SPEED : currentFallSpeed();
    piece.fallProgress += speed * dt;
    var moved = 0;
    while (piece.fallProgress >= 1 && moved < MAX_FALL_STEPS) {
      if (collideCells(pieceBelowCells(piece, -1))) { piece.fallProgress = 0; break; }
      piece.anchorRow -= 1;
      piece.fallProgress -= 1;
      moved++;
      if (input.softDown) piece.softDropCellCount++;
    }
    if (!state.piece) return;
    var grounded = collideCells(pieceBelowCells(piece, -1));
    if (grounded) {
      if (!piece.inLockDelay) { piece.inLockDelay = true; piece.lockTimer = LOCK_DELAY; piece.resetsUsed = 0; }
      else {
        piece.lockTimer -= dt;
        piece.lockDelayElapsed += dt;
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
   * 連通塊掃描
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
          cells.push({ col: c, row: r, color: cell.color, fromNewShape: !!cell.fromNewShape, clearBallId: cell.clearBallId || null, ballSourcePieceIndex: cell.ballSourcePieceIndex || null });
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
   * 成團掃描程序(寫死)
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
          return cell.color === col0 || cell.color === 'ball' || cell.color === 'clearBall';
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
   * 重力事件
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
      if (getCell(oc.col, oc.row)) add(oc.col, oc.row);
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

  function dropBlockToBottom(cells) {
    var saved = cells.map(function (c) {
      var cell = getCell(c.col, c.row);
      // v26 修正: 補上 ballSourcePieceIndex — 先前這裡漏了這個欄位, 一顆重力
      // 球只要被「別的」重力事件當成受影響結構的一部分帶著移動過一次(它自己
      // 不是那次事件的觸發球), 座標更新後就永久失去這個欄位, 之後不論用哪個
      // 路徑清掉都對不回 ballPieces 埋點, 局終被誤記為「殘存」(彙整與明細對
      // 不上, spec-review v26 讀第 10 輪紀錄發現的同一類問題)
      return { col: c.col, row: c.row, color: cell.color, fromNewShape: !!cell.fromNewShape, clearBallId: cell.clearBallId || null, ballSourcePieceIndex: cell.ballSourcePieceIndex || null };
    });
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
    var newCells = saved.map(function (c) { return { col: c.col, row: c.row - delta, color: c.color, fromNewShape: c.fromNewShape, clearBallId: c.clearBallId, ballSourcePieceIndex: c.ballSourcePieceIndex }; });
    newCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color, fromNewShape: c.fromNewShape, clearBallId: c.clearBallId, ballSourcePieceIndex: c.ballSourcePieceIndex }); });
    return {
      delta: delta,
      origCells: saved.map(function (c) { return { col: c.col, row: c.row, color: c.color }; }),
      finalCells: newCells.map(function (c) { return { col: c.col, row: c.row, color: c.color }; })
    };
  }

  function updateSurvivorsAfterDrop(origCells, delta) {
    if (delta <= 0) return;
    var set = Object.create(null);
    origCells.forEach(function (c) { set[c.col + '_' + c.row] = true; });
    state.settlement.survivors.forEach(function (s) {
      if (set[s.col + '_' + s.row]) s.row -= delta;
    });
  }

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
   * 削頂
   * ------------------------------------------------------------- */
  function shaveColumnsOnce(colsRange) {
    var trimCells = [];
    colsRange.forEach(function (c) {
      var top = columnTop(c);
      if (!top) return;
      var cell = getCell(c, top);
      trimCells.push({ col: c, row: top, color: cell.color, clearBallId: cell.clearBallId || null, ballSourcePieceIndex: cell.ballSourcePieceIndex || null });
      setCellNull(c, top);
    });
    return trimCells;
  }
  function applyShaveBookkeeping(trimCells) {
    state.stats.shaveTotalCells += trimCells.length;
    var shavedBalls = trimCells.filter(function (c) { return c.color === 'ball'; });
    state.stats.ballShaved += shavedBalls.length;
    shavedBalls.forEach(function (c) {
      var bp = state.log.ballPieces.filter(function (b) { return b.pieceIndex === c.ballSourcePieceIndex; })[0];
      if (bp && bp.outcome == null) {
        bp.outcome = 'shaved';
        bp.outcomeStar = state.E;
        bp.outcomePieceIndex = state.settlement ? state.settlement.pieceIndex : null;
      }
    });
    var shavedClearBalls = trimCells.filter(function (c) { return c.color === 'clearBall'; });
    state.stats.clearBall.shavedCount += shavedClearBalls.length;
    shavedClearBalls.forEach(function (c) {
      var entry = state.clearBall.byId[c.clearBallId];
      if (entry && !entry.outcome) entry.outcome = 'shaved';
    });
    if (state.settlement) {
      state.settlement.survivors = state.settlement.survivors.filter(function (sv) {
        return !trimCells.some(function (t) { return t.col === sv.col && t.row === sv.row; });
      });
    }
  }
  function performShave(colsRange, source) {
    var sumBefore = sumColHeights();
    var holesBeforeList = closedHoleCellsList(colsRange);
    var trimCells = shaveColumnsOnce(colsRange);
    applyShaveBookkeeping(trimCells);
    recomputeFloating();
    var sumAfter = sumColHeights();
    var holesAfterList = closedHoleCellsList(colsRange);
    var afterKeySet = Object.create(null);
    holesAfterList.forEach(function (h) { afterKeySet[h.col + '_' + h.row] = true; });
    var openedCells = holesBeforeList.filter(function (h) { return !afterKeySet[h.col + '_' + h.row]; });
    var entry = {
      source: source, pieceIndex: state.settlement.pieceIndex, seconds: Number(state.time.toFixed(2)),
      shavedCells: trimCells.length, shavedBallCells: trimCells.filter(function (c) { return c.color === 'ball'; }).length,
      shavedClearBallCells: trimCells.filter(function (c) { return c.color === 'clearBall'; }).length,
      sumHeightBefore: sumBefore, sumHeightAfter: sumAfter,
      closedHolesOpened: openedCells.length,
      refillWithin10: null, refillWindowPieces: 0
    };
    state.log.shaveCalib.push(entry);
    state.pendingShaveFollowups.push({ cells: openedCells, remaining: SHAVE_FOLLOWUP_WINDOW, filled: 0, entry: entry });
    return trimCells;
  }
  function processShaveFollowups() {
    var remaining = [];
    state.pendingShaveFollowups.forEach(function (f) {
      f.cells = f.cells.filter(function (c) {
        if (getCell(c.col, c.row)) { f.filled++; return false; }
        return true;
      });
      f.remaining--;
      f.entry.refillWindowPieces++;
      if (f.remaining <= 0 || f.cells.length === 0) f.entry.refillWithin10 = f.filled;
      else remaining.push(f);
    });
    state.pendingShaveFollowups = remaining;
  }

  /* ---------------------------------------------------------------
   * 清色球: 全盤清除後 10 塊內的追蹤
   * ------------------------------------------------------------- */
  function tallyGravityEventForWipeFollowups(displaced) {
    state.pendingWipeFollowups.forEach(function (f) {
      if (f.piecesElapsed < WIPE_FOLLOWUP_WINDOW) { f.gravityEvents++; f.displaced += displaced; }
    });
  }
  function finalizeWipeFollowup(f) {
    var refilled = f.originalCells.filter(function (c) { return !!getCell(c.col, c.row); }).length;
    var result = {
      gravityEvents: f.gravityEvents, displacedCells: f.displaced,
      sumHeightAt5: f.sumHeightAt5, sumHeightAt10: f.sumHeightAt10,
      refilled: refilled, piecesObserved: f.piecesElapsed
    };
    f.entries.forEach(function (e) { e.followup10 = result; });
  }
  function processWipeFollowups(sumH) {
    var remaining = [];
    state.pendingWipeFollowups.forEach(function (f) {
      f.piecesElapsed++;
      if (f.piecesElapsed === 5) f.sumHeightAt5 = sumH;
      if (f.piecesElapsed === 10) f.sumHeightAt10 = sumH;
      if (f.piecesElapsed >= WIPE_FOLLOWUP_WINDOW) finalizeWipeFollowup(f);
      else remaining.push(f);
    });
    state.pendingWipeFollowups = remaining;
  }

  /* ---------------------------------------------------------------
   * 放棄長按的鎖定窗(v25 改起點, spec-review v25): 方塊鎖定時先依第 2~5 步規
   * 則完整算出本次結算的結果, 若會使當前任務剩餘 ≤0, 自本次結算開始(不是等
   * 到剩餘實際被寫入 ≤0 那一刻, 也不是等某段演出播完)到本次任務過場結束一
   * 律不受理放棄。對開地/大團/用新形狀方塊(delta 在鎖定當下已同步算出)這一
   * 刻就等於「結算開始」; 對重力下落任務, delta 要等真正的重力事件依序執行
   * 才會寫進 state.task.remaining(演出需要, 不能提前寫), 所以另外在鎖定當下
   * 對 ballGroupQueue 做一次不影響真實盤面的「乾跑」(dry run), 預先算出這次
   * 結算最終會有幾個事件真的位移, 藉此提前判斷並鎖住放棄 —
   * 不提前真的推進 state.task.remaining, 只提前鎖放棄。
   * ------------------------------------------------------------- */
  function engageAbandonBlock() {
    if (state.abandonBlocked) return;
    state.abandonBlocked = true;
    input.abandonHolding = false;
    input.abandonTriggered = false;
    if (input.rDown) input.abandonNeedsRelease = true;
  }
  function checkAbandonLockTrigger() {
    if (state.task.remaining > 0) return;
    engageAbandonBlock();
  }
  function clearAbandonBlock() { state.abandonBlocked = false; }

  function applyTaskDelta(delta) {
    if (!delta) return;
    state.task.remaining -= delta;
    state.settlement.taskDeltaAccum = (state.settlement.taskDeltaAccum || 0) + delta;
    checkAbandonLockTrigger();
  }

  // 對盤面做一次淺拷貝快照, 供「乾跑」重力事件判定用, 不影響真實盤面
  function cloneGridSnapshot() {
    var m = new Map();
    state.grid.forEach(function (arr, col) { m.set(col, arr.slice()); });
    return m;
  }
  // 在盤面的暫時複本上依序跑完整條 ballGroupQueue 的重力事件判定(與真正執行時
  // 完全相同的演算法與順序, 只是操作對象換成複本), 算出「這次結算最終會有幾個
  // 事件實際發生位移」, 用來預先判斷重力下落任務這一結算會不會完成。全程不觸
  // 碰真正的 state.grid / state.settlement.survivors / 任何埋點或畫面狀態。
  // clearCells: 本次結算 4a 會清掉的格位(含本塊格位); 4b 是在「4a 清除之後」
  // 的盤面上判定的, 複本一樣要先把這些格位清空, 否則種子判定會把還沒清掉的
  // 本團格位誤判成鄰格已填, 算出錯誤的受影響範圍。
  function countGravityCompletionsDryRun(ballGroups, clearCells) {
    if (!ballGroups.length) return 0;
    var realGrid = state.grid;
    var realSettlement = state.settlement;
    state.grid = cloneGridSnapshot();
    state.settlement = { survivors: [] }; // 一次性替身, 避免 dropBlockToBottom 內部的
    // updateSurvivorsAfterDrop 寫到真正的 settlement.survivors
    var completed = 0;
    try {
      (clearCells || []).forEach(function (c) { setCellNull(c.col, c.row); });
      ballGroups.forEach(function (group) {
        var origCells = group.cells.map(function (c) { return { col: c.col, row: c.row }; });
        var result = runGravityEventJudgment(origCells);
        if (result.displaced > 0) completed++;
      });
    } finally {
      state.grid = realGrid;
      state.settlement = realSettlement;
    }
    return completed;
  }

  /* ---------------------------------------------------------------
   * 結算計分歸屬(共用於 4a 主消除 與 4c 追加消除); 本作 v22 無分數。
   * ------------------------------------------------------------- */
  function scoreAndCategorizeGroups(groups, task, targetColor, isExtra, pieceCellKeySet, isNewShapePiece, clearBallTriggersOut, pieceIndexForLog) {
    var clearCells = [], targetCount = 0, cellCountNonBall = 0;
    var digDelta = 0, bigCount = 0, newShapeGroupCount = 0, fromNewShapeCleared = 0;
    var groupLog = [];
    groups.forEach(function (g) {
      var n = g.cells.length;
      state.stats.teamSize[sizeBucket(n)] = (state.stats.teamSize[sizeBucket(n)] || 0) + 1;
      var ballCount = g.cells.filter(function (c) { return c.color === 'ball'; }).length;
      var clearBallCells = g.cells.filter(function (c) { return c.color === 'clearBall'; });
      if (ballCount > 0) {
        var trueCells = n - ballCount - clearBallCells.length;
        state.stats.ballGroupTrueCells += trueCells;
      }
      if (n >= 5) bigCount++;
      var hasPieceCell = !!(pieceCellKeySet && g.cells.some(function (c) { return pieceCellKeySet[c.col + '_' + c.row]; }));
      var countsForNewShape = (!isExtra) && isNewShapePiece && hasPieceCell;
      if (countsForNewShape) newShapeGroupCount++;
      groupLog.push({ size: n, color: g.color, ballCount: ballCount, clearBallCount: clearBallCells.length, isTargetColorGroup: task === 'dig' && g.color === targetColor, hasPieceCell: hasPieceCell });
      if (clearBallTriggersOut && clearBallCells.length) {
        clearBallCells.forEach(function (cb) {
          clearBallTriggersOut.push({ id: cb.clearBallId, color: g.color, size: n, hasBall: ballCount > 0, stage: isExtra ? '4c' : '4a', origin: { col: cb.col, row: cb.row } });
        });
      }
      g.cells.forEach(function (cell) {
        if (cell.color === 'ball') {
          state.stats.ballCleared++;
          // v26 修正: 帶上 ballSourcePieceIndex, 供呼叫端(追加消除 4c 的路徑)
          // 回填 ballPieces 埋點的結局 — 4c 清掉的重力球不觸發重力事件, 不會
          // 經過 beginNextGravityEvent, 先前沒有這個欄位就無法回填, 局終被誤
          // 記為「殘存」(彙整與明細對不上, spec-review v26 讀第 10 輪紀錄發現)
          clearCells.push({ col: cell.col, row: cell.row, color: 'ball', isTarget: false, ballSourcePieceIndex: cell.ballSourcePieceIndex || null });
          return;
        }
        if (cell.color === 'clearBall') {
          clearCells.push({ col: cell.col, row: cell.row, color: 'clearBall', isTarget: false });
          return;
        }
        if (cell.fromNewShape) fromNewShapeCleared++;
        var isTarget = task === 'dig' && cell.color === targetColor;
        if (isTarget) { targetCount++; digDelta++; }
        cellCountNonBall++;
        state.stats.totalCleared++;
        if (state.stats.firstAnyClearPieceIndex == null) state.stats.firstAnyClearPieceIndex = pieceIndexForLog;
        if (isTarget && state.stats.firstTargetClearPieceIndex == null) state.stats.firstTargetClearPieceIndex = pieceIndexForLog;
        clearCells.push({ col: cell.col, row: cell.row, color: cell.color, isTarget: isTarget });
      });
    });
    state.stats.targetCleared += targetCount;
    if (task === 'dig') { state.stats.digPhase.cleared += cellCountNonBall; state.stats.digPhase.target += targetCount; }
    if (isExtra) { state.stats.extraClearCount++; state.stats.extraClearCells += cellCountNonBall; }
    return {
      clearCells: clearCells, targetCount: targetCount, cellCountNonBall: cellCountNonBall,
      digDelta: digDelta, bigCount: bigCount, newShapeGroupCount: newShapeGroupCount, fromNewShapeCleared: fromNewShapeCleared,
      groupLog: groupLog
    };
  }

  /* ---------------------------------------------------------------
   * 全盤清除(結算 4d)
   * ------------------------------------------------------------- */
  function executeWipe() {
    var s = state.settlement;
    var triggers = s.clearBallTriggers;
    var colorSet = [];
    triggers.forEach(function (tr) { if (colorSet.indexOf(tr.color) === -1) colorSet.push(tr.color); });

    recomputeFloating();
    var before = {
      sumColHeight: sumColHeights(), floatingBlocks: state.floatingBlocks.length, floatingCells: sumFloatingCells(),
      filledCount: filledCount(), closedHoles: closedHolesCount(),
      spawnRegionColHeight: spawnFootprintMaxHeight(state.nextPiece.shapeKey)
    };
    var colorCountsBefore = countRealColors();
    var maxCount = Math.max(colorCountsBefore.A, colorCountsBefore.B, colorCountsBefore.C);
    var perColorMeta = {};
    colorSet.forEach(function (color) {
      var topCols = 0;
      for (var c = state.colMin; c <= state.colMax; c++) {
        var top = columnTop(c);
        if (top > 0) { var cell = getCell(c, top); if (cell && cell.color === color) topCols++; }
      }
      perColorMeta[color] = { isMax: colorCountsBefore[color] >= maxCount, topCols: topCols };
    });

    var perColorRemoved = {};
    var isFirstWipeOfGame = !state.stats.anyWipeHappened;
    state.stats.anyWipeHappened = true;
    colorSet.forEach(function (color) {
      perColorRemoved[color] = removeColorFromBoard(color);
      state.stats.clearBall.wipeCount++;
    });

    var removedKeySet = Object.create(null);
    colorSet.forEach(function (color) { perColorRemoved[color].forEach(function (c) { removedKeySet[c.col + '_' + c.row] = true; }); });
    s.survivors = s.survivors.filter(function (sv) { return !removedKeySet[sv.col + '_' + sv.row]; });

    recomputeFloating();
    var after = {
      sumColHeight: sumColHeights(), floatingBlocks: state.floatingBlocks.length, floatingCells: sumFloatingCells(),
      filledCount: filledCount(), closedHoles: closedHolesCount(),
      spawnRegionColHeight: spawnFootprintMaxHeight(state.nextPiece.shapeKey)
    };

    var trackers = {};
    colorSet.forEach(function (color) {
      trackers[color] = { color: color, originalCells: perColorRemoved[color].slice(), piecesElapsed: 0, gravityEvents: 0, displaced: 0, sumHeightAt5: null, sumHeightAt10: null, entries: [] };
    });
    var assignedColor = {};
    triggers.forEach(function (tr) {
      var entry = state.clearBall.byId[tr.id];
      if (!entry) return;
      entry.stage = tr.stage;
      entry.triggeredPieces = s.pieceIndex;
      entry.triggeredSeconds = Number(state.time.toFixed(2));
      entry.groupColor = tr.color; entry.groupSize = tr.size; entry.groupHasBall = tr.hasBall;
      entry.gapPiecesToTrigger = entry.dispensedIndex != null ? (s.pieceIndex - entry.dispensedIndex) : '—';
      entry.concurrentClearBallCount = s.concurrentClearBallCountAtLock;
      entry.colorCountsBeforeWipe = colorCountsBefore;
      entry.isMaxColor = perColorMeta[tr.color].isMax;
      entry.topColumnsOfColor = perColorMeta[tr.color].topCols;
      entry.before = before;
      entry.after = after;
      entry.outcome = 'cleared';
      entry.firstWipeOfGame = isFirstWipeOfGame;
      state.stats.clearBall.clearedCount++;
      trackers[tr.color].entries.push(entry);
      if (!assignedColor[tr.color]) {
        assignedColor[tr.color] = true;
        entry.wipeCellCount = perColorRemoved[tr.color].length;
        entry.merged = false;
      } else {
        entry.wipeCellCount = 0; entry.merged = true;
      }
    });
    colorSet.forEach(function (color) { state.pendingWipeFollowups.push(trackers[color]); });
    state.stats.lastWipePieceIndex = s.pieceIndex;

    var wipeCellsForArt = [];
    colorSet.forEach(function (color) { perColorRemoved[color].forEach(function (c) { wipeCellsForArt.push({ col: c.col, row: c.row, color: color }); }); });
    var origins = triggers.map(function (tr) { return { col: tr.origin.col, row: tr.origin.row }; });

    state.stats.presentDur.wipe += WIPE_DURATION;
    s.currentWipe = { colors: colorSet, cells: wipeCellsForArt, origins: origins, timer: WIPE_DURATION, duration: WIPE_DURATION, t: 0 };
    s.stage = 'wipe';
    Sound.play('colorClear'); // v26: 4d, 與全盤清除演出開始同時
  }

  /* ---------------------------------------------------------------
   * 結算時序(方塊鎖定後): 見 spec.md「結算時序」1~8 步
   * ------------------------------------------------------------- */
  function performLock() {
    var piece = state.piece;
    if (!piece) return;

    // v26: 硬降落地與一般鎖定互斥, 這一塊只出其中一種聲音
    if (piece.hardDropUsed) Sound.play('hardDrop');
    else Sound.play('lock');

    var sampledTaskKind = state.task.kind;
    var sampledColor = state.task.color;
    var widthAtLock = state.colMax - state.colMin + 1;
    var taskIndexAtLock = state.A + 1;
    var dropDistance = SPAWN_ROW - piece.anchorRow;
    var pieceIsNewShape = isNewShape(piece.shapeKey);
    var floatingBlocksBeforeLock = state.floatingBlocks.length;
    var closedHolesBeforeLock = closedHolesCount();

    var lockedCells = piece.cells.map(function (c) {
      var colorVal = c.ball ? 'ball' : (c.clearBall ? 'clearBall' : c.color);
      return { col: piece.anchorCol + c.x, row: piece.anchorRow + c.y, color: colorVal, clearBallId: c.clearBallId || null, ballSourcePieceIndex: c.ball ? piece.pieceIndex : null };
    });
    lockedCells.forEach(function (c) { setCell(c.col, c.row, { color: c.color, fromNewShape: pieceIsNewShape, clearBallId: c.clearBallId, ballSourcePieceIndex: c.ballSourcePieceIndex }); });
    processShaveFollowups();
    var concurrentClearBallCount = countClearBallsOnBoard();
    var heightBefore = { sumColHeight: sumColHeights(), closedHoles: closedHolesCount() };
    state.stats.totalPieces++;
    if (piece.hardDropUsed) state.stats.hardDropLocks++;
    if (piece.cells.some(function (c) { return c.ball; })) state.stats.ballSpawned++;
    if (sampledTaskKind === 'gravity') {
      var gravBucket = taskIndexAtLock === 10 ? 'k10' : 'k7';
      state.stats.gravityTaskByK[gravBucket].pieces++;
      if (piece.cells.some(function (c) { return c.ball; })) state.stats.gravityTaskByK[gravBucket].ballPieces++;
    }
    var pieceIndex = state.stats.totalPiecesSpawned;
    var secondsToLastAction = piece.lastActionT != null ? Number((piece.lastActionT - piece.spawnT).toFixed(2)) : 0;
    var secondsToFirstSoftDrop = piece.firstSoftDropT != null ? Number((piece.firstSoftDropT - piece.spawnT).toFixed(2)) : '—';
    state.log.pieceLock.push({
      index: pieceIndex, dropDistance: dropDistance, fallSpeed: Number(currentFallSpeed().toFixed(3)),
      hardDrop: piece.hardDropUsed, widthAtLock: widthAtLock, taskIndexAtLock: taskIndexAtLock, taskKindAtLock: sampledTaskKind,
      starAtLock: state.E, floatingBlocksBeforeLock: floatingBlocksBeforeLock,
      softDropCells: piece.softDropCellCount, softDropSeconds: Number(piece.softDropSeconds.toFixed(2)),
      lockDelaySeconds: Number(piece.lockDelayElapsed.toFixed(2)),
      secondsToLastMoveOrRotate: secondsToLastAction, secondsToFirstSoftDrop: secondsToFirstSoftDrop // v24 埋點
    });
    // v25: 鎖定截斷任何仍在進行中的左右按下紀錄(逐次左右按下)
    if (input.leftPressLog) finalizeHorizontalPressLog(-1, 'lockCut');
    if (input.rightPressLog) finalizeHorizontalPressLog(1, 'lockCut');
    var pieceTiming = { index: pieceIndex, spawnT: Number(piece.spawnT.toFixed(2)), lockT: Number(state.time.toFixed(2)), settleEndT: null };
    state.log.pieceTiming.push(pieceTiming);
    state.piece = null;

    var survivors = lockedCells.map(function (c) { return { col: c.col, row: c.row }; });

    var groups = scanClearGroups();

    var pieceCellKeySet = keysOf(survivors);
    var clearBallTriggers = [];
    var scoreResult = scoreAndCategorizeGroups(groups, sampledTaskKind, sampledColor, false, pieceCellKeySet, pieceIsNewShape, clearBallTriggers, pieceIndex);
    survivors = survivors.filter(function (s2) {
      return !scoreResult.clearCells.some(function (c) { return c.col === s2.col && c.row === s2.row; });
    });

    state.settlement = {
      pieceIndex: pieceIndex, pieceShape: piece.shapeKey, pieceIsNewShape: pieceIsNewShape, pieceTiming: pieceTiming,
      heightBefore: heightBefore, closedHolesBeforeLock: closedHolesBeforeLock, widthAtLock: widthAtLock,
      sampledTask: sampledTaskKind, sampledColor: sampledColor, taskIndexAtLock: taskIndexAtLock,
      survivors: survivors,
      clearCells: scoreResult.clearCells,
      clearDeducted: 0,
      newShapeProgressCount: scoreResult.newShapeGroupCount,
      fromNewShapeClearedFirst: scoreResult.fromNewShapeCleared,
      fromNewShapeClearedExtra: 0,
      concurrentClearBallCountAtLock: concurrentClearBallCount,
      clearBallTriggers: clearBallTriggers,
      taskCreditedThisSegment: false,
      taskDeltaAccum: 0,
      clearGroupsForDisplay: groups.map(function (g, gi) {
        var counted = (sampledTaskKind === 'big' && g.cells.length >= 5) || (sampledTaskKind === 'newShape' && pieceIsNewShape && scoreResult.groupLog[gi].hasPieceCell);
        return { cells: g.cells.map(function (c) { return { x: c.col, y: c.row }; }), counted: counted };
      }),
      clearTimer: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      clearDuration: scoreResult.clearCells.length ? CLEAR_DURATION : 0,
      stage: 'clear',
      ballGroupQueue: null,
      ballGroupIndex: 0,
      gravityMovedAny: false,
      gravityMoveCountForPiece: 0,
      gravityEvent: null,
      extraClear: null,
      tr: null, trQueue: null, trK: null, trHadStage1: false,
      firstSegmentGroups: scoreResult.groupLog,
      extraSegmentGroups: [],
      creditFlash: 0
    };

    // 開地 / 大團 / 用新形狀方塊: 第 3 步推進當前任務(本步不做達成判定)
    if (sampledTaskKind === 'dig' && scoreResult.digDelta > 0) applyTaskDelta(scoreResult.digDelta);
    else if (sampledTaskKind === 'big' && scoreResult.bigCount > 0) applyTaskDelta(scoreResult.bigCount);
    else if (sampledTaskKind === 'newShape' && scoreResult.newShapeGroupCount > 0) applyTaskDelta(scoreResult.newShapeGroupCount);
    // v26 埋點: 大團是當前任務時, 本次結算(第一段消除)合計消掉 >=5 顆但沒有
    // 任何一團 n>=5, 量「一次消掉 5 顆以上」被讀成合計的誤會
    if (sampledTaskKind === 'big' && scoreResult.bigCount === 0 && scoreResult.cellCountNonBall >= 5) {
      state.task.bigMistakenCount = (state.task.bigMistakenCount || 0) + 1;
    }
    state.settlement.taskCreditedThisSegment = sampledTaskKind === 'dig' ? scoreResult.digDelta > 0 :
      (sampledTaskKind === 'big' ? scoreResult.bigCount > 0 : (sampledTaskKind === 'newShape' ? scoreResult.newShapeGroupCount > 0 : false));
    state.settlement.clearDeducted = sampledTaskKind === 'dig' ? scoreResult.digDelta :
      (sampledTaskKind === 'big' ? (scoreResult.bigCount > 0 ? scoreResult.bigCount : 0) : (sampledTaskKind === 'newShape' ? scoreResult.newShapeGroupCount : 0));

    // v26: 結算 4a 有成立團時出「一般消除」聲, 一次結算只呼叫一次不論幾團;
    // 有推進當前任務(開地/大團/用新形狀方塊)時同時出「算到了」(sound.js 內部
    // 自動延後 0.09 秒, 不與 clear 疊在一起)。重力下落的 progress 在算數的
    // 那一次重力事件另外呼叫(見 beginNextGravityEvent), 這裡不重複。
    if (scoreResult.clearCells.length) {
      Sound.play('clear');
      if (state.settlement.taskCreditedThisSegment) Sound.play('progress');
    }

    // 多樣化任務被動基準(v17/v18)
    if (widthAtLock === 10 && sampledTaskKind !== 'big') {
      var pb = state.stats.postFullBaseline.big;
      pb.pieces++; if (scoreResult.bigCount > 0) pb.hits++;
    }
    if (pieceIsNewShape) {
      var bucket = state.stats.newShapeBaseline[piece.shapeKey][piece.guaranteed ? 'first' : 'nonFirst'][sampledTaskKind === 'newShape' ? 'current' : 'nonCurrent'];
      bucket.pieces++;
      if (scoreResult.groupLog.length > 0) bucket.hits++;
    }
    if (sampledTaskKind === 'newShape' && pieceIsNewShape && scoreResult.newShapeGroupCount > 0) {
      state.task.newShapeHits.push({ shape: piece.shapeKey, groupCount: scoreResult.newShapeGroupCount, guaranteed: piece.guaranteed, pieceIndex: pieceIndex });
    }
    // (v25: 逐重力下落任務第 7、第 10 個分開記, 已於本函式較早處以 taskIndexAtLock 分桶記錄)
    var ballGroups = groups.filter(function (g) { return g.cells.some(function (c) { return c.color === 'ball'; }); });
    ballGroups.forEach(function (g) { g.anchor = anchorOf(g.cells); });
    ballGroups.sort(function (a, b) { if (a.anchor.row !== b.anchor.row) return b.anchor.row - a.anchor.row; return a.anchor.col - b.anchor.col; });
    state.settlement.ballGroupQueue = ballGroups;

    // v25: 放棄受理關閉的起點提前到「結算開始」— 重力下落任務的 delta 要等真
    // 正的重力事件依序播完才會寫進 state.task.remaining(演出需要), 所以這裡
    // 先乾跑一次算出最終會有幾個事件真的位移, 若已足以讓剩餘 ≤0 就立刻鎖住放
    // 棄, 不等演出播到那一步。開地/大團/用新形狀方塊的 delta 在上面已經同步
    // 算完並呼叫過 applyTaskDelta -> checkAbandonLockTrigger, 這裡不重複處理。
    if (sampledTaskKind === 'gravity' && ballGroups.length) {
      var predictedGravityCompletions = countGravityCompletionsDryRun(ballGroups, scoreResult.clearCells);
      if (state.task.remaining - predictedGravityCompletions <= 0) engageAbandonBlock();
    }

    if (scoreResult.clearCells.length) state.stats.presentDur.clear += CLEAR_DURATION;

    scoreResult.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
    recomputeFloating();

    state.mode = 'settle';
    // 軟降是「按下事件」類的離散輸入, 結算期間一律丟棄、不補發(即使按住不放,
    // 也要在恢復後偵測到一次全新的按下才會再軟降); 只有左右鍵的 DAS/ARR 狀態
    // 例外沿用, 見 tickHorizontal。
    input.softDown = false;
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
    tallyGravityEventForWipeFollowups(displaced);
    var kind = displaced <= 0 ? 'zero' : (displaced >= GRAV_VISUAL_LARGE_THRESHOLD ? 'large' : 'small');
    var countedForTask = false;
    // v25 埋點: 逐含球塊的球結局(消除且有位移/零位移), 以觸發本次事件的球所屬
    // 塊序回填。v26 修正: 一個團理論上可能含 2 顆以上重力球(規格「團內萬用
    // 格數上限不設上限」), 先前只取第 1 顆會讓其餘顆的結局漏填, 逐顆回填
    var ballCellsInGroup = group.cells.filter(function (c) { return c.color === 'ball'; });
    ballCellsInGroup.forEach(function (ballCellInGroup) {
      if (ballCellInGroup.ballSourcePieceIndex == null) return;
      var bpEntry = state.log.ballPieces.filter(function (b) { return b.pieceIndex === ballCellInGroup.ballSourcePieceIndex; })[0];
      if (bpEntry && bpEntry.outcome == null) {
        bpEntry.outcome = displaced > 0 ? 'clearedMoved' : 'clearedZero';
        bpEntry.outcomeStar = state.E;
        bpEntry.outcomePieceIndex = s.pieceIndex;
      }
    });
    if (displaced > 0) {
      s.gravityMovedAny = true;
      s.gravityMoveCountForPiece++;
      state.stats.gravityMovedCount++;
      state.stats.gravityDisplacedTotal += displaced;
      state.stats.gravityMaxDisplaced = Math.max(state.stats.gravityMaxDisplaced, displaced);
      state.stats.gravityMaxDrop = Math.max(state.stats.gravityMaxDrop, result.maxDrop);
      if (s.sampledTask === 'gravity') { applyTaskDelta(1); countedForTask = true; }
      if (displaced >= GRAV_LOG_LARGE_THRESHOLD) {
        state.log.largeGravityEvents.push({
          pieceIndex: s.pieceIndex, groupSize: group.cells.filter(function (c) { return c.color !== 'ball'; }).length,
          groupColor: group.color, affectedBlocks: blocks.length + result.staticBlocks.length,
          displaced: displaced, maxDrop: result.maxDrop, causedAppend: false
        });
      }
    } else {
      state.stats.gravityIdleCount++;
      if (s.sampledTask === 'gravity') {
        var gravIdleBucket = s.taskIndexAtLock === 10 ? 'k10' : 'k7';
        state.stats.gravityTaskByK[gravIdleBucket].idle++;
      }
    }
    var animSeconds = blocks.length ? Math.min(totalDur, GRAV_EVENT_CAP) : GRAV_ZERO_DUR;
    state.log.gravityEventCalib.push({
      pieceIndex: s.pieceIndex, displaced: displaced, blockCount: blocks.length,
      perBlockDrop: blocks.map(function (b) { return b.delta; }), animSeconds: Number(animSeconds.toFixed(3)), capped: capped,
      piecesSinceLastWipe: state.stats.lastWipePieceIndex == null ? '—' : (s.pieceIndex - state.stats.lastWipePieceIndex)
    });
    state.stats.presentDur.gravity += animSeconds;

    recomputeFloating();

    s.gravityEvent = {
      origin: { col: origin.col, row: origin.row }, kind: kind, counted: countedForTask,
      blocks: blocks, staticBlocks: result.staticBlocks,
      blockIndex: 0, phase: blocks.length ? 'falling' : null, timer: 0,
      zeroTimer: kind === 'zero' ? GRAV_ZERO_DUR : 0,
      creditShown: countedForTask, progressPlayed: false
    };
    s.stage = 'gravity';
    // v26: 零位移的重力事件與零位移回饋同步出聲, 不得無聲跳過; 有位移的事件
    // 逐塊出聲, 於各塊落定的那一刻呼叫(見 updateSettlement 的 landing 轉場)
    if (kind === 'zero') Sound.play('gravityNone');
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
    if (s.widthAtLock === 10 && s.sampledTask !== 'gravity') {
      var pg = state.stats.postFullBaseline.gravity;
      pg.pieces++; if (s.gravityMoveCountForPiece > 0) pg.hits++;
    }
    if (s.gravityMovedAny) {
      var groups2 = scanClearGroups();
      if (groups2.length) {
        var res2 = scoreAndCategorizeGroups(groups2, s.sampledTask, s.sampledColor, true, keysOf(s.survivors), s.pieceIsNewShape, s.clearBallTriggers, s.pieceIndex);
        // v26 修正: 追加消除(4c)清掉的重力球「不觸發任何重力事件」(規格寫
        // 死), 因此不會經過 beginNextGravityEvent 回填結局; 先前這裡沒有補
        // 這一步, 這種球(通常是盤面上原本殘存、被本次重力事件牽動而重新成團
        // 的球)的 ballPieces 結局永遠是 null, 局終被誤記為「殘存」, 導致彙整
        // 的 cleared 數與逐顆明細對不上(spec-review v26 讀第 10 輪紀錄發現)
        res2.clearCells.forEach(function (c) {
          if (c.color !== 'ball' || c.ballSourcePieceIndex == null) return;
          var bp4c = state.log.ballPieces.filter(function (b) { return b.pieceIndex === c.ballSourcePieceIndex; })[0];
          if (bp4c && bp4c.outcome == null) {
            bp4c.outcome = 'clearedZero';
            bp4c.outcomeStar = state.E;
            bp4c.outcomePieceIndex = s.pieceIndex;
          }
        });
        res2.clearCells.forEach(function (c) { setCellNull(c.col, c.row); });
        s.survivors = s.survivors.filter(function (sv) { return !res2.clearCells.some(function (c) { return c.col === sv.col && c.row === sv.row; }); });
        if (s.sampledTask === 'dig' && res2.digDelta > 0) applyTaskDelta(res2.digDelta);
        s.extraSegmentGroups = res2.groupLog;
        s.fromNewShapeClearedExtra = res2.fromNewShapeCleared;
        var lastLarge = state.log.largeGravityEvents.length ? state.log.largeGravityEvents[state.log.largeGravityEvents.length - 1] : null;
        if (lastLarge && lastLarge.pieceIndex === s.pieceIndex) lastLarge.causedAppend = true;
        recomputeFloating();
        s.extraClear = { cells: res2.clearCells, deducted: s.sampledTask === 'dig' ? res2.digDelta : 0, timer: EXTRA_CLEAR_DURATION, duration: EXTRA_CLEAR_DURATION };
        state.stats.presentDur.extraClear += EXTRA_CLEAR_DURATION;
        s.stage = 'extraclear';
        // v26: 4c 有成立團時(所有下落演完之後)出「追加消除」聲; 開地任務在 4c
        // 有推進時同一刻出「算到了」
        Sound.play('followupClear');
        if (s.sampledTask === 'dig' && res2.digDelta > 0) Sound.play('progress');
        return;
      }
    }
    afterExtraClearOrSkip();
  }

  function afterExtraClearOrSkip() {
    var s = state.settlement;
    s.extraClear = null;
    proceedAfterClearSegments();
  }

  function proceedAfterClearSegments() {
    var s = state.settlement;
    if (s.clearBallTriggers && s.clearBallTriggers.length) executeWipe();
    else recordMisattributedAndAdvance();
  }

  function recordMisattributedAndAdvance() {
    var s = state.settlement;
    if (s.sampledTask === 'newShape' && s.newShapeProgressCount === 0 && (s.fromNewShapeClearedFirst > 0 || s.fromNewShapeClearedExtra > 0)) {
      var reason = (s.fromNewShapeClearedFirst > 0 && s.fromNewShapeClearedExtra > 0) ? 'both' :
        (s.fromNewShapeClearedFirst > 0 ? 'firstSegmentOriginalShape' : 'extraClear');
      state.log.misattributedNewShape.push({
        pieceIndex: s.pieceIndex, reason: reason,
        newShapeCellsCleared: s.fromNewShapeClearedFirst + s.fromNewShapeClearedExtra
      });
    }
    beginAdvancePhase();
  }

  /* ---------------------------------------------------------------
   * 第 5 步: 任務推進(A 的唯一發生點)
   * ------------------------------------------------------------- */
  function beginAdvancePhase() {
    var s = state.settlement;
    if (s.taskDeltaAccum > 0) {
      state.task.advanceCount = (state.task.advanceCount || 0) + 1;
      state.task.lastAdvanceDelta = s.taskDeltaAccum;
      state.task.advanceDeltas.push(s.taskDeltaAccum); // v25: 每一次有推進的結算的推進量清單
    }
    if (state.task.remaining <= 0) {
      var overflow = -state.task.remaining;
      var achievedIndex = state.A + 1;
      var achievedTask = state.task;
      state.A = achievedIndex;
      var nextIndex = achievedIndex + 1;
      var nextKind = nextIndex <= 10 ? taskKindFor(nextIndex) : null;
      var nextReq = nextIndex <= 10 ? taskRequiredFor(nextIndex) : null;
      var nextColor = null, nextRemaining = nextReq, overflowClamped = 0;
      if (nextKind === 'dig') {
        if (achievedTask.kind === 'dig') {
          // v25: 開地任務溢出最多扣抵 2 顆(刪除「新任務剩餘最少留 1」)
          var deduct = Math.min(overflow, OVERFLOW_CAP);
          nextRemaining = nextReq - deduct;
          overflowClamped = Math.max(0, overflow - OVERFLOW_CAP); // 被扣抵上限截掉的量(v25 改名)
        }
        nextColor = pickColorExcluding(achievedTask.color);
      }
      // 回報欄位直接由固定的 REWARD_PLAN 表產生(不必等 stage1 真的執行才知道):
      // side / 是否附削頂 / 解鎖了哪一種外型 / 是否給清色球 / 第 10 個記「通關」
      var achievedPlan = rewardPlanFor(achievedIndex);
      var rewardOut = { type: achievedPlan.reward };
      if (achievedPlan.side) rewardOut.side = achievedPlan.side;
      if (achievedPlan.shape) rewardOut.shape = achievedPlan.shape;
      if (achievedPlan.shave) rewardOut.shave = true;
      if (achievedPlan.reward === 'clearBall' || achievedPlan.clearBall) rewardOut.clearBall = true;
      var taskLogEntry = {
        index: achievedIndex, kind: achievedTask.kind, color: achievedTask.color, required: achievedTask.required,
        enteredPieces: achievedTask.enteredPieces, enteredSeconds: Number(achievedTask.enteredSeconds.toFixed(2)),
        achievedPieces: state.stats.totalPieces, achievedSeconds: Number(state.time.toFixed(2)),
        advanceCount: achievedTask.advanceCount || 0, oneShot: (achievedTask.advanceCount || 0) === 1,
        lastAdvanceDelta: achievedTask.lastAdvanceDelta || 0,
        advanceDeltas: (achievedTask.advanceDeltas || []).slice(), // v25 新增
        overflowRaw: achievedTask.kind === 'dig' ? overflow : null,
        overflowCappedAmount: (achievedTask.kind === 'dig' && nextKind === 'dig') ? overflowClamped : null, // v25 改名(原「被最少留1截掉的量」)
        reward: rewardOut
      };
      if (achievedTask.kind === 'newShape') taskLogEntry.newShapeDetail = { dealt: achievedTask.newShapeDealt, hits: achievedTask.newShapeHits };
      if (achievedTask.kind === 'big') taskLogEntry.mistakenAsSumCount = achievedTask.bigMistakenCount || 0; // v26 埋點
      state.log.taskLog.push(taskLogEntry);
      state.settlement.achievedTaskLogEntry = taskLogEntry;
      if (nextIndex <= 10) {
        state.task = makeTaskShell(nextKind, nextColor, nextReq, nextRemaining, nextIndex);
        state.task.overflowClamped = overflowClamped;
      }
      // 面板顯示凍結在剛達成的任務(「已達成」), 直到過場第 3 段才切到新任務
      state.displayTask = achievedTask;
    }
    beginRewardOrFinalize();
  }

  /* ---------------------------------------------------------------
   * 第 6 步: 任務過場(E 的唯一發生點) — 四段依序演出
   * ------------------------------------------------------------- */
  function applyQueuedInput() {
    if (state.queuedInput === 'guide') {
      state.mode = 'paused';
      state.guideOpen = true;
      Sound.playMusic('gameDucked'); // v26: 結算/過場期間排隊的說明在第 8 步生效時才真的進入暫停
    } else if (state.queuedInput === 'pause') {
      state.mode = 'paused';
      Sound.playMusic('gameDucked'); // v26: 結算/過場期間排隊的暫停在第 8 步生效時才真的進入暫停
    }
    state.queuedInput = null;
  }

  function beginRewardOrFinalize() {
    if (state.E < state.A) beginTransition(state.A);
    else {
      var reason = finalizeBoardAndCheckEnd();
      if (reason) { endGame(reason, null); return; }
      state.settlement = null;
      resumeOperationalState(); // v25: 回到操作狀態時點⑤ 一般結算解鎖
      state.mode = 'playing';
      spawnNextAsCurrent();
      applyQueuedInput();
    }
  }

  function beginTransition(k) {
    var s = state.settlement;
    s.trK = k;
    s.trQueue = stage1ItemsFor(k);
    s.trHadStage1 = s.trQueue.length > 0;
    s.trLog = {
      taskIndex: k, starsReached: null, startPieceIndex: s.pieceIndex, startRealSec: Number((performance.now() / 1000).toFixed(2)),
      phaseDurations: { expand: 0, newShape: 0, shave: 0, star: 0, reveal: 0, speed: 0, gapTotal: 0 },
      keyPresses: { piece: 0, escH: 0, r: 0, m: 0 }, // v26: 加一類 M, 不讀成「想跳過」
      pressLog: [], // v25: 每次按鍵落在第幾段、距過場結束幾毫秒(結束時才算出)
      endPieceIndex: null, endRealSec: null
    };
    state.curTransitionLog = s.trLog;
    if (k === 5 || k === 9) {
      var cbEntry = grantClearBall(k, s.pieceIndex);
      var logE0 = s.achievedTaskLogEntry;
      if (logE0 && logE0.reward) logE0.reward.clearBallBlocked = !cbEntry;
    }
    startNextStage1Item();
  }

  function startStage1Timer(type, extra, duration) {
    var s = state.settlement;
    var data = Object.assign({ type: type, timer: duration, duration: duration, t: 0 }, extra || {});
    s.tr = data;
    s.stage = 'transition';
  }

  function startNextStage1Item() {
    var s = state.settlement;
    if (s.trQueue.length) {
      var item = s.trQueue.shift();
      if (item.type === 'expand') {
        var side = item.side;
        var newCol;
        if (side === 'left') { state.colMin -= 1; newCol = state.colMin; } else { state.colMax += 1; newCol = state.colMax; }
        recomputeFloating();
        state.log.expandTimeline[state.A - 1] = { pieces: state.stats.totalPieces, seconds: Number(state.time.toFixed(2)) };
        if (state.A === 4) { state.stats.fullWidthPieces = state.stats.totalPieces; state.stats.fullWidthSeconds = state.time; }
        startStage1Timer('expand', { side: side, col: newCol }, PH.expand);
        Sound.play('expand'); // v26: 過場第 1 段延展那一項開始時
      } else if (item.type === 'unlock') {
        var shape = item.shape;
        var boundaryDeferred = !!(state.nextPiece && state.nextPiece.isBagFirst);
        state.unlockedShapes.push(shape);
        state.shapeBagGuaranteePending.push(shape);
        state.stats.shapeUnlockInfo[shape] = { unlockedPieces: state.stats.totalPieces, unlockedSeconds: state.time, boundaryDeferred: boundaryDeferred };
        startStage1Timer('unlock', { shape: shape }, PH.newShape);
        Sound.play('newShape'); // v26: 過場第 1 段新形狀方塊展示那一項開始時
      } else if (item.type === 'shave') {
        var trimCells = performShave(range(state.colMin, state.colMax), 'task' + state.settlement.trK);
        startStage1Timer('shave', { cells: trimCells }, PH.shave);
        Sound.play('trimTop'); // v26: 過場第 1 段削頂那一項開始時(盤面全空也照呼叫)
      }
      return;
    }
    if (state.settlement.trHadStage1) beginGapThen(beginStarStage); else beginStarStage();
  }

  function beginGapThen(next) {
    var s = state.settlement;
    s.tr = { type: 'gap', timer: PH.gap, duration: PH.gap, next: next };
    s.stage = 'transition';
  }

  function recordStarSnapshot() {
    var n = state.E;
    if (!state.log.starTimeline) state.log.starTimeline = [];
    state.log.starTimeline.push({
      star: n, pieces: state.stats.totalPieces, seconds: Number(state.time.toFixed(2)),
      sumColHeight: sumColHeights(), closedHoles: closedHolesCount(),
      maxColHeight: (function () { var m = 0; for (var c = state.colMin; c <= state.colMax; c++) m = Math.max(m, columnTop(c)); return m; })()
    });
  }

  function beginStarStage() {
    var s = state.settlement;
    state.E += 1;
    var isFinal = state.E >= 10;
    var dur = isFinal ? PH.starFinal : PH.star;
    recordStarSnapshot();
    startStage1Timer('star', { stars: state.E, isFinal: isFinal }, dur);
    Sound.play(isFinal ? 'starMax' : 'starUp'); // v26: 過場第 2 段開始時
  }

  function afterStarStage() {
    var s = state.settlement;
    if (s.trLog) s.trLog.starsReached = state.E;
    if (state.E >= 10) { recordFinalBoardCalibration(); completeVictory(); return; }
    var reason = finalizeBoardAndCheckEnd();
    if (reason) { endGame(reason, state.E); return; }
    beginGapThen(beginRevealStage);
  }

  function beginRevealStage() {
    state.displayTask = state.task;
    startStage1Timer('reveal', {}, PH.reveal);
    Sound.play('taskReveal'); // v26: 過場第 3 段開始時
  }

  function beginSpeedStage() {
    startStage1Timer('speed', {}, PH.speed);
    Sound.play('speedUp'); // v26: 過場第 4 段開始時
  }

  function finishTransitionAndContinue() {
    var s = state.settlement;
    if (s.trLog) finalizeTransitionLogEntry(s.trLog, s.pieceIndex);
    state.curTransitionLog = null;
    clearAbandonBlock();
    state.settlement = null;
    resumeOperationalState(); // v25: 回到操作狀態時點③ 任務過場結束
    state.mode = 'playing';
    spawnNextAsCurrent();
    applyQueuedInput();
  }

  function updateTransition(dt) {
    var s = state.settlement;
    var tr = s.tr;
    state.stats.presentDur.transition += dt; // v25: 逐局呈現時長合計補上「任務過場」
    tr.timer -= dt;
    tr.t = clamp01(1 - tr.timer / tr.duration);
    if (s.trLog) {
      var bucket = tr.type === 'expand' ? 'expand' : tr.type === 'unlock' ? 'newShape' : tr.type === 'shave' ? 'shave' :
        tr.type === 'star' ? 'star' : tr.type === 'reveal' ? 'reveal' : tr.type === 'speed' ? 'speed' : tr.type === 'gap' ? 'gapTotal' : null;
      if (bucket) s.trLog.phaseDurations[bucket] += dt;
    }
    if (tr.timer > 0) return;
    if (tr.type === 'gap') { var next = tr.next; tr.next = null; next(); return; }
    if (tr.type === 'expand' || tr.type === 'unlock' || tr.type === 'shave') { startNextStage1Item(); return; }
    if (tr.type === 'star') { afterStarStage(); return; }
    if (tr.type === 'reveal') { beginGapThen(beginSpeedStage); return; }
    if (tr.type === 'speed') { finishTransitionAndContinue(); return; }
  }

  /* ---------------------------------------------------------------
   * 結束判定(定版盤面計算 + block/lock out) — 同時完成校正紀錄
   * ------------------------------------------------------------- */
  // 校正紀錄(無副作用): 通關與一般結束都要記, 因此與 block/lock out 判定分開
  function recordFinalBoardCalibration() {
    var s = state.settlement;
    var sumH = sumColHeights(), fc = filledCount(), ch = closedHolesCount();
    var maxColH = 0;
    for (var c = state.colMin; c <= state.colMax; c++) maxColH = Math.max(maxColH, columnTop(c));
    state.log.pieceBoardState.push({
      index: s.pieceIndex, sumColHeight: sumH, filledCount: fc, closedHoles: ch, maxColHeight: maxColH,
      closedHolesDelta: s.heightBefore.closedHoles - s.closedHolesBeforeLock
    });
    state.stats.sumHeightHistory.push(sumH);
    var hist = state.stats.sumHeightHistory;
    var nTotal = hist.length - 1;
    if (nTotal >= 20) {
      var delta20 = hist[nTotal] - hist[nTotal - 20];
      state.stats.min20WindowDelta = (state.stats.min20WindowDelta === null) ? delta20 : Math.min(state.stats.min20WindowDelta, delta20);
    }
    processWipeFollowups(sumH);
    state.log.pieceClearGroups.push({ index: s.pieceIndex, firstSegment: s.firstSegmentGroups, extraSegment: s.extraSegmentGroups });
    if (isNewShape(s.pieceShape)) {
      var firstCount = s.firstSegmentGroups.reduce(function (a, g) { return a + (g.size - g.ballCount - (g.clearBallCount || 0)); }, 0);
      var extraCount = s.extraSegmentGroups.reduce(function (a, g) { return a + (g.size - g.ballCount - (g.clearBallCount || 0)); }, 0);
      var arr = state.stats.shapeClearsPerDeal[s.pieceShape] || (state.stats.shapeClearsPerDeal[s.pieceShape] = []);
      arr.push({ first: firstCount, extra: extraCount });
    }
    s.pieceTiming.settleEndT = Number(state.time.toFixed(2));
  }

  // block/lock out 判定(有副作用: blockout 時把試算生成的那一塊記入埋點)。
  // 只在非通關的路徑呼叫 — 通關優先於結束判定, 且不試算下一塊生成。
  function finalizeBoardAndCheckEnd() {
    var s = state.settlement;
    var lockout = false;
    if (s.survivors.length > 0) lockout = s.survivors.every(function (c) { return c.row >= SPAWN_ROW; });
    var blockout = false;
    if (!lockout) {
      var spawnCells = computeSpawnCells(state.nextPiece, state.colMin, state.colMax);
      blockout = spawnCells.some(function (c) { return !!getCell(c.col, c.row); });
      if (blockout) recordPieceSpawn(state.nextPiece, true);
    }
    recordFinalBoardCalibration();
    if (lockout) return 'lockout';
    if (blockout) return 'blockout';
    return null;
  }

  /* ---------------------------------------------------------------
   * 遊戲結束 / 通關 / 重開
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

  function finalizePendingTrackers() {
    state.pendingShaveFollowups.forEach(function (f) { f.entry.refillWithin10 = f.filled; });
    state.pendingShaveFollowups = [];
    state.pendingWipeFollowups.forEach(function (f) { finalizeWipeFollowup(f); });
    state.pendingWipeFollowups = [];
    state.clearBall.queue.forEach(function (e) { e.outcome = 'undispensed'; });
    state.clearBall.queue = [];
    state.log.clearBallList.forEach(function (e) { if (!e.outcome) e.outcome = 'residual'; });
    if (state.settlement && state.settlement.trLog && state.curTransitionLog) {
      finalizeTransitionLogEntry(state.settlement.trLog, state.settlement.pieceIndex);
      state.curTransitionLog = null;
    }
    // v25 埋點: 局終仍未觸發的重力球一律記為「局終殘存」; 已用出的球補記剩幾塊
    state.log.ballPieces.forEach(function (b) {
      if (b.outcome == null) b.outcome = 'residual';
      if (b.outcome === 'clearedMoved' || b.outcome === 'clearedZero') {
        b.piecesRemainingAtEnd = state.stats.totalPiecesSpawned - b.pieceIndex;
      }
    });
    // v25 埋點: 局終截斷任何仍在進行中的左右按下紀錄
    if (input.leftPressLog) finalizeHorizontalPressLog(-1, 'gameEndCut');
    if (input.rightPressLog) finalizeHorizontalPressLog(1, 'gameEndCut');
  }

  // v25 埋點: 過場每次按鍵分段(落在第幾段)與距過場結束幾毫秒, 於過場真正結束時一次算出
  function finalizeTransitionLogEntry(trLog, pieceIndexAtEnd) {
    trLog.endPieceIndex = pieceIndexAtEnd;
    var endMs = performance.now();
    trLog.endRealSec = Number((endMs / 1000).toFixed(2));
    trLog.pressLog = (trLog.pressLog || []).map(function (p) {
      return { code: p.code, segment: p.segment, msToEnd: Math.round(endMs - p.atMs) };
    });
    state.log.transitionLog.push(trLog);
  }

  function buildStarSummary() {
    var out = [];
    var prevPieces = 0, prevSeconds = 0;
    for (var i = 1; i <= 10; i++) {
      var row = state.log.starTimeline && state.log.starTimeline[i - 1];
      if (row && row.star === i) {
        out.push({
          star: i, pieces: row.pieces, seconds: row.seconds,
          durationPieces: row.pieces - prevPieces, durationSeconds: Number((row.seconds - prevSeconds).toFixed(2)),
          // spec 埋點: 取得當下(過場第 2 段)的 Σ欄高 / 封閉洞數 / 最高欄高(v22 已記在
          // starTimeline, 先前漏了轉存到輸出, 這裡補上)
          sumColHeight: row.sumColHeight, closedHoles: row.closedHoles, maxColHeight: row.maxColHeight
        });
        prevPieces = row.pieces; prevSeconds = row.seconds;
      } else {
        out.push({ star: i, pieces: '—', seconds: '—', durationPieces: '—', durationSeconds: '—', sumColHeight: '—', closedHoles: '—', maxColHeight: '—' });
      }
    }
    return out;
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
      var dealCount = st.shapeDealCount[k] || 0;
      var spawnLogCount = state.log.pieceSpawn.filter(function (p) { return p.shape === k; }).length;
      perNewShapeLog.push({
        shape: k, name: NEW_SHAPE_NAME[k], unlockedPieces: info.unlockedPieces, unlockedSeconds: Number(info.unlockedSeconds.toFixed(2)),
        boundaryDeferred: !!info.boundaryDeferred,
        dealCount: dealCount, dealCountSelfCheck: dealCount === spawnLogCount,
        firstDealtPieces: st.shapeFirstDealt[k] != null ? st.shapeFirstDealt[k] : null,
        clearsPerDeal: st.shapeClearsPerDeal[k] || []
      });
    });

    // v22 item#8: 首發那張是否當場命中, 首發之後到第一次非首發命中的塊數(依 newShape 任務逐筆計算)
    var newShapeTaskExtra = state.log.taskLog.filter(function (t) { return t.kind === 'newShape'; }).map(function (t) {
      var hits = (t.newShapeDetail && t.newShapeDetail.hits) || [];
      var guaranteedHit = hits.find(function (h) { return h.guaranteed; });
      var firstNonGuaranteed = hits.find(function (h) { return !h.guaranteed; });
      var guaranteedPieceIndex = guaranteedHit ? guaranteedHit.pieceIndex : null;
      return {
        taskIndex: t.index,
        guaranteedHit: !!guaranteedHit,
        piecesFromGuaranteedToFirstNonGuaranteedHit: (guaranteedPieceIndex != null && firstNonGuaranteed) ? (firstNonGuaranteed.pieceIndex - guaranteedPieceIndex) : '—'
      };
    });

    var endTask = state.A < 10 ? {
      index: state.A + 1, kind: state.task.kind, color: state.task.color, remaining: state.task.remaining,
      mistakenAsSumCount: state.task.kind === 'big' ? (state.task.bigMistakenCount || 0) : undefined // v26 埋點
    } : { index: 10, kind: null, color: null, remaining: '—' };

    var expandTimelineOut = [0, 1, 2, 3].map(function (i) {
      return state.log.expandTimeline[i] ? state.log.expandTimeline[i] : '—';
    });

    var cb = st.clearBall;
    var clearBallList = state.log.clearBallList;
    var residualCount = clearBallList.filter(function (e) { return e.outcome === 'residual'; }).length;
    var undispensedCount = clearBallList.filter(function (e) { return e.outcome === 'undispensed'; }).length;

    // v22 item#5: 逐星數檔彙整(以 pieceLock 的 starAtLock 分桶)
    var starBuckets = {};
    for (var si = 0; si <= 9; si++) starBuckets[si] = { pieces: 0, dropSum: 0, clearedSum: 0, heightDeltaSum: 0, secondsSum: 0 };
    var lockByIndex = {}; state.log.pieceLock.forEach(function (p) { lockByIndex[p.index] = p; });
    var timingByIndex = {}; state.log.pieceTiming.forEach(function (p) { timingByIndex[p.index] = p; });
    var boardByIndex = {}; state.log.pieceBoardState.forEach(function (p) { boardByIndex[p.index] = p; });
    var clearGroupsByIndex = {}; state.log.pieceClearGroups.forEach(function (p) { clearGroupsByIndex[p.index] = p; });
    var prevSumHeight = 0;
    state.log.pieceLock.forEach(function (p) {
      var b = starBuckets[Math.max(0, Math.min(9, p.starAtLock))];
      b.pieces++;
      b.dropSum += p.dropDistance || 0;
      var cg = clearGroupsByIndex[p.index];
      var cleared = 0;
      if (cg) {
        cg.firstSegment.concat(cg.extraSegment).forEach(function (g) { cleared += Math.max(0, g.size - g.ballCount - (g.clearBallCount || 0)); });
      }
      b.clearedSum += cleared;
      var timing = timingByIndex[p.index];
      if (timing && timing.settleEndT != null) b.secondsSum += Math.max(0, timing.settleEndT - timing.spawnT);
      var board = boardByIndex[p.index];
      if (board) { b.heightDeltaSum += (board.sumColHeight - prevSumHeight); prevSumHeight = board.sumColHeight; }
    });
    var perStarTier = [];
    for (var sj = 0; sj <= 9; sj++) {
      var bb = starBuckets[sj];
      perStarTier.push({
        star: sj, pieces: bb.pieces,
        avgSecondsPerPiece: bb.pieces ? Number((bb.secondsSum / bb.pieces).toFixed(2)) : null,
        avgDropDistance: bb.pieces ? Number((bb.dropSum / bb.pieces).toFixed(2)) : null,
        avgClearedPerPiece: bb.pieces ? Number((bb.clearedSum / bb.pieces).toFixed(2)) : null,
        avgHeightDeltaPerPiece: bb.pieces ? Number((bb.heightDeltaSum / bb.pieces).toFixed(2)) : null
      });
    }

    // v22 item#6: 逐欄寬 6~10 彙整
    var widthBuckets = {};
    for (var w = 6; w <= 10; w++) widthBuckets[w] = { pieces: 0, targetSum: 0, heightDeltaSum: 0 };
    var prevSumHeight2 = 0;
    state.log.pieceLock.forEach(function (p) {
      var wb = widthBuckets[Math.max(6, Math.min(10, p.widthAtLock))];
      wb.pieces++;
      var cg = clearGroupsByIndex[p.index];
      if (cg && p.taskKindAtLock === 'dig') {
        // spec 要的是每塊目標色「顆數」, 不是團數: 一個目標色團的真顏色顆數 =
        // 團總格數 - 團內重力球數 - 團內清色球數(團內非萬用格皆為同一目標色)
        cg.firstSegment.concat(cg.extraSegment).forEach(function (g) {
          if (g.isTargetColorGroup) wb.targetSum += Math.max(0, g.size - g.ballCount - (g.clearBallCount || 0));
        });
      }
      var board = boardByIndex[p.index];
      if (board) { wb.heightDeltaSum += (board.sumColHeight - prevSumHeight2); prevSumHeight2 = board.sumColHeight; }
    });
    var perWidth = [];
    for (var w2 = 6; w2 <= 10; w2++) {
      var wbb = widthBuckets[w2];
      perWidth.push({ width: w2, pieces: wbb.pieces, avgTargetPerPiece: wbb.pieces ? Number((wbb.targetSum / wbb.pieces).toFixed(3)) : null, avgHeightDeltaPerPiece: wbb.pieces ? Number((wbb.heightDeltaSum / wbb.pieces).toFixed(3)) : null });
    }

    var perTransitionLog = state.log.transitionLog.map(function (t) {
      return {
        taskIndex: t.taskIndex, starsReached: t.starsReached,
        startPieceIndex: t.startPieceIndex, endPieceIndex: t.endPieceIndex,
        startRealSec: t.startRealSec, endRealSec: t.endRealSec,
        phaseDurationsSeconds: {
          expand: Number(t.phaseDurations.expand.toFixed(2)), newShape: Number(t.phaseDurations.newShape.toFixed(2)),
          shave: Number(t.phaseDurations.shave.toFixed(2)), star: Number(t.phaseDurations.star.toFixed(2)),
          reveal: Number(t.phaseDurations.reveal.toFixed(2)), speed: Number(t.phaseDurations.speed.toFixed(2)),
          gapTotal: Number(t.phaseDurations.gapTotal.toFixed(2))
        },
        keyPresses: t.keyPresses,
        pressLog: t.pressLog || [] // v25: 每次按鍵落在第幾段、距過場結束幾毫秒
      };
    });

    // v25 埋點: 削頂次數自我校驗 = 已完成的第 4、6、8 個任務數
    var shaveTasksCompleted = state.log.taskLog.filter(function (t) { return t.index === 4 || t.index === 6 || t.index === 8; }).length;
    var shaveSelfCheck = {
      shaveEventCount: state.log.shaveCalib.length, completedShaveTasks: shaveTasksCompleted,
      matches: state.log.shaveCalib.length === shaveTasksCompleted
    };

    // v25 埋點: 逐次左右按下自我校驗(一般按下且按住 < 170 毫秒者實際移動 <= 1 欄)
    var horizontalPressSelfCheck = state.log.horizontalPresses.every(function (p) {
      return !(p.source === 'normal' && typeof p.holdMs === 'number' && p.holdMs < 170) || p.movedCols <= 1;
    });

    return {
      meta: {
        game: GAME_NAME, version: BUILD_VERSION, endedAt: new Date().toISOString(), reason: reason,
        totalPieces: st.totalPieces, totalSeconds: Number(state.time.toFixed(2)),
        localGameSeq: st.localGameSeq,
        // v25 埋點: build 版本與參數快照, 沒有這欄紀錄對不上參數
        paramsSnapshot: {
          fallSpeedByStar: FALL_SPEED.slice(), dasMs: Math.round(DAS * 1000), arrMs: Math.round(ARR * 1000),
          digRequirements: DIG_REQ.slice(), varietyRequirements: VARIETY_REQ.slice(), overflowCap: OVERFLOW_CAP
        },
        // v26 埋點: 開局時的靜音狀態、是否在任何時點切成靜音、第一次切換靜音的
        // 塊序與當下星數、整局切換次數(讀法: 老闆若很早就關掉聲音, 代表音量
        // 或頻率有問題)
        sound: {
          mutedAtStart: st.mutedAtStart, everMuted: st.everMutedTrue,
          firstMuteToggle: st.firstMuteToggle, muteToggleCount: st.muteToggleCount
        }
      },
      stars: {
        finalStars: state.E, isVictory: reason === 'victory',
        perStar: buildStarSummary(),
        bestBeforeThisGame: st.bestBeforeGame, newRecord: !!state.newRecordThisGame,
        endReason: reason
      },
      validation: {
        digPhaseTargetColorRatio: digRatio,
        digPhaseTargetColorRatioReference: { passiveExpected: 0.35, threeGameSignalLine: 0.45, note: '單局樣本小, 僅供對照, 非判定門檻' },
        firstAnyClearPieceIndex: st.firstAnyClearPieceIndex == null ? '—' : st.firstAnyClearPieceIndex,
        firstTargetClearPieceIndex: st.firstTargetClearPieceIndex == null ? '—' : st.firstTargetClearPieceIndex,
        perTask: state.log.taskLog,
        endTask: endTask,
        perNewShape: perNewShapeLog,
        newShapeTaskExtra: newShapeTaskExtra,
        misattributedNewShape: state.log.misattributedNewShape
      },
      multiTaskPassiveBaseline: {
        big: st.postFullBaseline.big,
        gravity: st.postFullBaseline.gravity,
        note: '滿寬後、該任務不是當前任務時的每塊發生率 p; 被動期望等待 = 需求/p, 與實際等待塊數比較(見 perTask); 參照線: 實際/期望 ≤0.6 有在做, ≥0.85 等同被動(3 局合併), 非判定門檻'
      },
      newShapePassiveBaseline: {
        byShape: st.newShapeBaseline,
        note: '命中率依外型 x 首發/非首發 x 是否為當前任務分開記; 第 1 輪需求 1, 多半由首發完成, 讀數主要看第 2 輪'
      },
      gravityTaskDetail: {
        // v25: 第 7、第 10 個重力下落任務分開記
        k7: { piecesWhileCurrent: st.gravityTaskByK.k7.pieces, piecesWithBallWhileCurrent: st.gravityTaskByK.k7.ballPieces, idleEventsWhileCurrent: st.gravityTaskByK.k7.idle },
        k10: { piecesWhileCurrent: st.gravityTaskByK.k10.pieces, piecesWithBallWhileCurrent: st.gravityTaskByK.k10.ballPieces, idleEventsWhileCurrent: st.gravityTaskByK.k10.idle }
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
        endReason: reason, finalStars: state.E,
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
        shaveSelfCheck: shaveSelfCheck, // v25 新增
        largeGravityEvents: state.log.largeGravityEvents,
        clearBallSummary: {
          obtainedCount: cb.obtainedCount, dispensedCount: cb.dispensedCount, clearedCount: cb.clearedCount,
          shavedCount: cb.shavedCount, residualCount: residualCount, undispensedCount: undispensedCount,
          blockedCount: cb.blockedCount, wipeCount: cb.wipeCount,
          selfCheckObtained: cb.obtainedCount === (cb.dispensedCount + undispensedCount),
          selfCheckDispensed: cb.dispensedCount === (cb.clearedCount + cb.shavedCount + residualCount)
        }
      },
      clearBall: { perBall: clearBallList },
      transitions: perTransitionLog,
      calibration: {
        perPieceSpawn: state.log.pieceSpawn,
        perPieceTiming: state.log.pieceTiming,
        perPieceLock: state.log.pieceLock,
        perPieceClearGroups: state.log.pieceClearGroups,
        perPieceBoardState: state.log.pieceBoardState,
        perGravityEvent: state.log.gravityEventCalib,
        perGravityBallPiece: state.log.ballPieces, // v25 新增: 逐含球塊
        perHorizontalPress: state.log.horizontalPresses, // v24/v25 新增: 逐次左右按下
        horizontalPressSelfCheck: horizontalPressSelfCheck,
        perExpand: state.log.expandTimeline,
        perShaveEvent: state.log.shaveCalib,
        perNewShape: perNewShapeLog.map(function (r) { return { shape: r.shape, unlockedPieces: r.unlockedPieces, firstDealtPieces: r.firstDealtPieces }; }),
        perTask: state.log.taskLog.map(function (t) { return { index: t.index, piecesTaken: t.achievedPieces - t.enteredPieces }; }),
        perStarTier: perStarTier,
        perWidth: perWidth,
        perGame: {
          presentationDurationsSeconds: state.stats.presentDur,
          deathSumHeightOverWidth: (state.colMax - state.colMin + 1) > 0 ? sumColHeights() / (state.colMax - state.colMin + 1) : 0,
          spawnColumnHeightAtDeath: state.stats.deathSpawnColHeight,
          finalWidth: state.colMax - state.colMin + 1,
          deathPieces: st.totalPieces, deathTaskIndex: endTask.index,
          min20PieceSumHeightDelta: state.stats.min20WindowDelta,
          abandonAtSumHeight: state.stats.abandonSumHeight, abandonAtWidth: state.stats.abandonWidth
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

  function endGame(reason, justCompleted) {
    if (state.mode === 'over' || state.mode === 'victory') return;
    state.mode = 'over';
    clearAbandonBlock();
    // v26: 進入結束畫面前先停音樂; 放棄生效出「放棄」聲(不再另外出「放不下」
    // 聲), 其餘結束原因(lockout / blockout, 含過場第 2 段後判死)出「結束」聲
    Sound.stopMusic();
    if (reason === 'abandon') Sound.play('forfeit'); else Sound.play('gameOver');

    var deathSpawnColHeight = null;
    if (reason === 'lockout' && state.settlement) {
      var pIdx = state.settlement.pieceIndex;
      for (var i = state.log.pieceSpawn.length - 1; i >= 0; i--) {
        if (state.log.pieceSpawn[i].index === pIdx) { deathSpawnColHeight = state.log.pieceSpawn[i].spawnColMaxHeight; break; }
      }
    } else if ((reason === 'blockout' || reason === 'abandon') && state.nextPiece) {
      deathSpawnColHeight = spawnFootprintMaxHeight(state.nextPiece.shapeKey);
    }
    state.stats.deathSpawnColHeight = deathSpawnColHeight;
    if (reason === 'abandon') { state.stats.abandonSumHeight = sumColHeights(); state.stats.abandonWidth = state.colMax - state.colMin + 1; }

    finalizePendingTrackers();

    state.piece = null;
    state.settlement = null;
    state.queuedInput = null;
    var isBest = reason !== 'abandon' && (state.best === null || state.E > state.best);
    if (isBest) { state.best = state.E; saveBest(state.best); }
    state.newRecordThisGame = isBest;
    state.gameOverInfo = {
      stars: state.E, best: state.best,
      task: justCompleted ? null : { kind: state.task.kind, color: state.task.color, remaining: state.task.remaining },
      justCompleted: justCompleted || null,
      reason: reason, newRecord: isBest
    };
    if (input.rDown) state.rKeyLocked = true;
    var payload = buildLogPayload(reason);
    downloadLog(payload);
  }

  function completeVictory() {
    if (state.mode === 'over' || state.mode === 'victory') return;
    state.mode = 'victory';
    clearAbandonBlock();
    Sound.stopMusic(); // v26: 第 10 星那段演完、進入通關畫面時, 先停音樂再出「通關」聲
    Sound.play('win');
    finalizePendingTrackers();
    state.piece = null;
    state.settlement = null;
    state.queuedInput = null;
    var isFirstTen = state.best !== 10;
    if (state.best === null || 10 > state.best) { state.best = 10; saveBest(10); }
    state.newRecordThisGame = isFirstTen;
    state.victoryInfo = { newRecord: isFirstTen };
    if (input.rDown) state.rKeyLocked = true;
    var payload = buildLogPayload('victory');
    downloadLog(payload);
  }

  function buildNewShapeBaselineInit() {
    var out = {};
    NEW_SHAPE_ORDER.forEach(function (k) {
      out[k] = {
        first: { current: { pieces: 0, hits: 0 }, nonCurrent: { pieces: 0, hits: 0 } },
        nonFirst: { current: { pieces: 0, hits: 0 }, nonCurrent: { pieces: 0, hits: 0 } }
      };
    });
    return out;
  }

  function freshStats(localGameSeq, bestBeforeGame) {
    return {
      totalPieces: 0, totalPiecesSpawned: 0, hardDropLocks: 0, totalCleared: 0, targetCleared: 0,
      teamSize: {}, shaveTotalCells: 0,
      ballSpawned: 0, ballCleared: 0, ballShaved: 0, ballGroupTrueCells: 0,
      gravityTriggerCount: 0, gravityMovedCount: 0, gravityIdleCount: 0,
      gravityDisplacedTotal: 0, gravityMaxDisplaced: 0, gravityMaxDrop: 0,
      // v25: 逐重力下落任務第 7、第 10 個分開記
      gravityTaskByK: { k7: { pieces: 0, ballPieces: 0, idle: 0 }, k10: { pieces: 0, ballPieces: 0, idle: 0 } },
      extraClearCount: 0, extraClearCells: 0,
      digPhase: { cleared: 0, target: 0 },
      postFullBaseline: { big: { pieces: 0, hits: 0 }, gravity: { pieces: 0, hits: 0 } },
      newShapeBaseline: buildNewShapeBaselineInit(),
      shapeDealCount: {}, shapeFirstDealt: {}, shapeUnlockInfo: {}, shapeClearsPerDeal: {},
      fullWidthPieces: null, fullWidthSeconds: null,
      sumHeightHistory: [0], min20WindowDelta: null,
      deathSpawnColHeight: null, abandonSumHeight: null, abandonWidth: null,
      presentDur: { clear: 0, gravity: 0, extraClear: 0, wipe: 0, transition: 0 }, // v25 補「任務過場」
      lastWipePieceIndex: null, anyWipeHappened: false,
      firstAnyPieceSpawnedIndex: null, firstAnyClearPieceIndex: null, firstTargetClearPieceIndex: null,
      localGameSeq: localGameSeq, bestBeforeGame: bestBeforeGame,
      clearBall: { obtainedCount: 0, dispensedCount: 0, clearedCount: 0, shavedCount: 0, blockedCount: 0, wipeCount: 0 },
      // v26 埋點: 開局時的靜音狀態、是否在任何時點切成靜音、第一次切換的塊序
      // 與星數、整局切換次數
      mutedAtStart: Sound.isMuted(), everMutedTrue: Sound.isMuted(), muteToggleCount: 0, firstMuteToggle: null
    };
  }

  function newGameSkeleton(keepBest) {
    var prevBest = keepBest && state ? state.best : loadBest();
    var localSeq = bumpTotalGames();
    state = {
      colorBag: [], shapeBag: [], unlockedShapes: [], shapeBagGuaranteePending: [],
      ballState: { bagQueue: [], bagPos: 0, groupPrevLastTrue: false },
      clearBall: { queue: [], obtainedCount: 0, nextId: 1, byId: {} },
      colMin: 0, colMax: 5, grid: new Map(),
      time: 0, best: prevBest, newRecordThisGame: false,
      mode: 'playing', guideOpen: false, guidePage: 1, queuedInput: null, rKeyLocked: false,
      gameOverInfo: null, victoryInfo: null,
      piece: null, nextPiece: null, settlement: null,
      floatingBlocks: [], pendingShaveFollowups: [], pendingWipeFollowups: [],
      A: 0, E: 0, task: null, displayTask: null,
      abandonBlocked: false, curTransitionLog: null,
      stats: freshStats(localSeq, prevBest),
      log: {
        pieceSpawn: [], pieceTiming: [], pieceLock: [], pieceClearGroups: [], pieceBoardState: [],
        gravityEventCalib: [], expandTimeline: [null, null, null, null], shaveCalib: [],
        taskLog: [], largeGravityEvents: [], misattributedNewShape: [], clearBallList: [],
        transitionLog: [], starTimeline: [],
        ballPieces: [], horizontalPresses: [] // v25 新增
      }
    };
  }

  function beginFirstTaskAndSpawn() {
    var req = taskRequiredFor(1);
    state.task = makeTaskShell('dig', pickColorExcluding(null), req, req, 1);
    state.displayTask = state.task;
    state.nextPiece = makeNextPieceData();
    spawnNextAsCurrent();
    recomputeFloating();
  }

  function resetInputState() {
    input.hActiveDir = 0; input.hPhase = 'idle'; input.hDas = 0;
    input.leftDown = false; input.rightDown = false; input.softDown = false;
    input.leftPressLog = null; input.rightPressLog = null;
    input.leftBoundaryBlockedPending = false; input.rightBoundaryBlockedPending = false;
    input.leftBoundaryBlockStartT = 0; input.rightBoundaryBlockStartT = 0;
    input.abandonHolding = false; input.abandonStart = 0; input.abandonTriggered = false;
    input.rDown = false; input.abandonNeedsRelease = false;
  }

  // v25: 回到操作狀態的 5 個時點(開場說明關閉開始第一局 / 結束或通關畫面按 R
  // 重開 / 任務過場結束 / 暫停恢復 / 一般結算解鎖)共用同一條規則 — 回到操作狀
  // 態那一刻仍被按住的方塊操作鍵一律先放開再按下才受理, 沒有例外。左右鍵的
  // DAS 狀態在此一律歸零(不延續已累積的 hDas), 若鍵仍physically按著, 標記
  // 為「回到操作狀態時仍按住被擋下」, 等玩家真的放開後才能重新按下生效。
  // 旋轉/硬降/軟降三類鍵不需要另外處理: 它們的動作只在 keydown 邊緣觸發且已
  // 由各自的 `state.mode !== 'playing'` 判斷擋下, 持續按住不會產生新的
  // keydown(瀏覽器的自動連發已被 `e.repeat` 過濾), 因此天然符合「先放開再按
  // 下才受理」。
  function resumeOperationalState() {
    input.hActiveDir = 0; input.hPhase = 'idle'; input.hDas = 0;
    input.softDown = false;
    if (input.leftDown && !input.leftBoundaryBlockedPending) {
      input.leftBoundaryBlockedPending = true; input.leftBoundaryBlockStartT = state.time;
    }
    if (input.rightDown && !input.rightBoundaryBlockedPending) {
      input.rightBoundaryBlockedPending = true; input.rightBoundaryBlockStartT = state.time;
    }
    input.leftPressLog = null; input.rightPressLog = null;
  }

  function restartGame() {
    newGameSkeleton(true);
    beginFirstTaskAndSpawn();
    resetInputState();
    Sound.stopMusic(); Sound.playMusic('game'); // v26: 重開一局, 音樂從開頭開始
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
  // v25 埋點: 逐次左右按下(塊序、方向、按下時距本塊生成、按住時長、實際移動
  // 欄數、被擋次數、來源、結束方式)。只記操作中(有當前方塊、非結算、非過場、
  // 非暫停) — 也就是只在真正「武裝」DAS 狀態時才開一筆紀錄。
  function beginHorizontalPressLog(dir) {
    var rec = {
      pieceIndex: state.piece ? state.piece.pieceIndex : null,
      dir: dir === -1 ? 'left' : 'right',
      msSinceSpawn: state.piece ? Math.round((state.time - state.piece.spawnT) * 1000) : '—',
      startT: state.time, holdMs: 0, movedCols: 0, blockedCount: 0, source: 'normal', endedBy: null
    };
    if (dir === -1) input.leftPressLog = rec; else input.rightPressLog = rec;
    return rec;
  }
  function finalizeHorizontalPressLog(dir, endedBy) {
    var rec = dir === -1 ? input.leftPressLog : input.rightPressLog;
    if (!rec) return;
    rec.holdMs = Math.round((state.time - rec.startT) * 1000);
    rec.endedBy = endedBy;
    delete rec.startT;
    state.log.horizontalPresses.push(rec);
    if (dir === -1) input.leftPressLog = null; else input.rightPressLog = null;
  }
  // 只有 mode === 'playing' 時才真的「武裝」DAS(移動 + 開始計時); 非 playing
  // 時按下只記錄 physically-down(見 onKeyDown), 不武裝, 這樣任何跨越「回到操
  // 作狀態」邊界的持續按住都天然需要放開再按下才會再度武裝(v25 規則)。
  function armHorizontal(dir) {
    input.hActiveDir = dir;
    input.hDas = DAS;
    input.hPhase = 'wait';
    var moved = state.piece ? tryMove(dir) : false;
    var rec = dir === -1 ? input.leftPressLog : input.rightPressLog;
    if (!rec) rec = beginHorizontalPressLog(dir);
    if (moved) rec.movedCols++; else if (state.piece) rec.blockedCount++;
  }
  function endHorizontal(dir) {
    if (dir === -1) input.leftDown = false; else input.rightDown = false;
    if (input.hActiveDir === dir) {
      if (dir === -1 && input.rightDown && state.mode === 'playing') armHorizontal(1);
      else if (dir === 1 && input.leftDown && state.mode === 'playing') armHorizontal(-1);
      else { input.hActiveDir = 0; input.hPhase = 'idle'; }
    }
  }
  function tickHorizontal(dt) {
    if (input.hPhase === 'idle') return;
    if (state.mode !== 'playing') return;
    input.hDas -= dt;
    var guard = 0;
    while (input.hDas <= 0 && guard < 10) {
      guard++;
      var moved = false;
      if (state.piece) moved = tryMove(input.hActiveDir);
      var rec = input.hActiveDir === -1 ? input.leftPressLog : input.rightPressLog;
      if (rec) { if (moved) rec.movedCols++; else if (state.piece) rec.blockedCount++; }
      input.hPhase = 'repeat';
      input.hDas += ARR;
      if (!state.piece) break;
    }
  }

  /* ---------------------------------------------------------------
   * 放棄長按(真實時間, 不受暫停/結算凍結影響; 說明畫面中不受理;
   * v22: 當前任務剩餘扣到 ≤0 起到過場結束不受理)
   * ------------------------------------------------------------- */
  function updateAbandon() {
    if (!input.abandonHolding || input.abandonTriggered) return;
    if (state.guideOpen || state.mode === 'over' || state.mode === 'victory' || state.abandonBlocked) { input.abandonHolding = false; return; }
    var elapsed = (performance.now() - input.abandonStart) / 1000;
    if (elapsed >= ABANDON_HOLD) {
      input.abandonTriggered = true;
      state.rKeyLocked = true;
      endGame('abandon', null);
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

    if (state.mode === 'guideOpening') return;
    if (state.mode === 'over' || state.mode === 'victory') return;
    if (state.guideOpen) return;
    if (state.mode === 'paused') return;

    var inTransition = state.mode === 'settle' && state.settlement && state.settlement.stage === 'transition';
    if (!inTransition) state.time += dt;

    tickHorizontal(dt);

    if (state.mode === 'playing') updatePlaying(dt);
    else if (state.mode === 'settle') {
      if (inTransition) updateTransition(dt);
      else updateSettlement(dt);
    }
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
            if (g.phase === 'falling') {
              g.phase = 'landing'; g.timer = 0;
              // v26: 每一塊落定時各呼叫一次 gravityLand, 與畫面落地回饋同步;
              // 算數的那一次重力事件, 第一塊落定時 progress 與它一起呼叫
              Sound.play('gravityLand', { index: g.blockIndex });
              if (g.creditShown && !g.progressPlayed) { Sound.play('progress'); g.progressPlayed = true; }
            }
            else advanceGravityBlock();
          }
        }
        break;
      case 'extraclear':
        s.extraClear.timer -= dt;
        if (s.extraClear.timer <= 0) afterExtraClearOrSkip();
        break;
      case 'wipe':
        s.currentWipe.timer -= dt;
        s.currentWipe.t = clamp01(1 - s.currentWipe.timer / s.currentWipe.duration);
        if (s.currentWipe.timer <= 0) recordMisattributedAndAdvance();
        break;
    }
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
      case 'KeyM': return 'mute';
      default: return null;
    }
  }
  var PIECE_ACTION_CODES = { left: 1, right: 1, cw: 1, ccw: 1, '180': 1, soft: 1, hard: 1 };

  // v25 埋點: 過場期間按鍵落在第幾段(1~4 或 gap), 供「距過場結束幾毫秒」使用
  function currentTransitionSegmentLabel() {
    var s = state.settlement;
    if (!s || !s.tr) return '—';
    switch (s.tr.type) {
      case 'expand': case 'unlock': case 'shave': return '1';
      case 'star': return '2';
      case 'reveal': return '3';
      case 'speed': return '4';
      case 'gap': return 'gap';
      default: return '—';
    }
  }

  function requestGuide() {
    input.abandonHolding = false;
    if (state.mode === 'settle') { state.queuedInput = 'guide'; return; }
    if (state.mode === 'over' || state.mode === 'victory') { state.guideOpen = true; return; }
    if (state.mode === 'playing') {
      state.mode = 'paused'; input.softDown = false;
      if (input.leftPressLog) finalizeHorizontalPressLog(-1, 'pauseCut');
      if (input.rightPressLog) finalizeHorizontalPressLog(1, 'pauseCut');
      Sound.playMusic('gameDucked'); // v26: 局中叫出說明畫面 = 進入暫停, 同一首壓低音量繼續
    }
    state.guideOpen = true;
  }
  function closeGuideOverlay() {
    state.guideOpen = false;
    if (state.mode === 'guideOpening') {
      resumeOperationalState(); // v25: 回到操作狀態時點① 開場說明關閉開始第一局
      beginFirstTaskAndSpawn();
      state.mode = 'playing';
      Sound.playMusic('game'); // v26: 開局(進入進行中)
    }
  }
  function requestPause() {
    if (state.mode === 'playing') {
      state.mode = 'paused'; input.softDown = false;
      if (input.leftPressLog) finalizeHorizontalPressLog(-1, 'pauseCut');
      if (input.rightPressLog) finalizeHorizontalPressLog(1, 'pauseCut');
      Sound.playMusic('gameDucked'); // v26: 進入暫停, 同一首壓低音量繼續
      return;
    }
    if (state.mode === 'paused') {
      resumeOperationalState(); // v25: 回到操作狀態時點④ 暫停恢復
      state.mode = 'playing';
      Sound.playMusic('game'); // v26: 從暫停回到進行中, 音量回到正常(不重頭)
      return;
    }
    if (state.mode === 'settle') { if (state.queuedInput !== 'guide') state.queuedInput = 'pause'; return; }
  }
  function requestRDown() {
    if (state.rKeyLocked) return;
    if (state.mode === 'over' || state.mode === 'victory') { restartGame(); return; }
    if (state.abandonBlocked || input.abandonNeedsRelease) return;
    if (state.mode === 'playing' || state.mode === 'settle' || state.mode === 'paused') {
      input.abandonHolding = true;
      input.abandonStart = performance.now();
      input.abandonTriggered = false;
    }
  }

  function onKeyDown(e) {
    if (PREVENT_CODES[e.code]) e.preventDefault();
    if (e.repeat) return;

    // v26: 開場說明畫面的第一個按鍵(不論哪一鍵)啟用聲音, 在處理這一鍵的其他
    // 動作之前呼叫; 一旦啟用, 本次開啟遊戲期間不再回到未啟用
    if (!soundInited && state.mode === 'guideOpening') {
      soundInited = true;
      Sound.init();
    }

    var code = normalizeCode(e);
    if (!code) return;

    if (code === 'r') input.rDown = true;

    // 過場期間的按鍵次數記入埋點(量「不耐煩想跳過」), R 也算; v25 起每次按鍵
    // 另記落在第幾段, 距過場結束的毫秒數於過場結束時一次算出(finalizeTransitionLogEntry)
    if (state.mode === 'settle' && state.settlement && state.settlement.stage === 'transition' && state.curTransitionLog) {
      var segLabel = currentTransitionSegmentLabel();
      var pressEntry = { code: code, segment: segLabel, atMs: performance.now() };
      if (PIECE_ACTION_CODES[code]) { state.curTransitionLog.keyPresses.piece++; state.curTransitionLog.pressLog.push(pressEntry); }
      else if (code === 'esc' || code === 'h') { state.curTransitionLog.keyPresses.escH++; state.curTransitionLog.pressLog.push(pressEntry); }
      else if (code === 'r') { state.curTransitionLog.keyPresses.r++; state.curTransitionLog.pressLog.push(pressEntry); }
      else if (code === 'mute') { state.curTransitionLog.keyPresses.m++; state.curTransitionLog.pressLog.push(pressEntry); } // v26
    }

    // v26 靜音切換: 開場說明、進行中、結算中(含任務過場)、暫停、說明畫面、
    // 結束畫面、通關畫面皆可按, 立即生效、不排隊, 不受下面任何狀態分支影響
    if (code === 'mute') { toggleMute(); return; }

    if (state.guideOpen) {
      if (code === 'left') { if (state.guidePage > 1) { state.guidePage--; Sound.play('pageFlip'); } }
      else if (code === 'right') { if (state.guidePage < TOTAL_GUIDE_PAGES) { state.guidePage++; Sound.play('pageFlip'); } }
      else if (code === 'h' || code === 'enter') { closeGuideOverlay(); }
      return;
    }

    if (code === 'h') { requestGuide(); return; }
    if (code === 'esc') { requestPause(); return; }
    if (code === 'r') { requestRDown(); return; }

    // 左右鍵: 一律先記錄 physically-down; 只有 mode === 'playing' 時才真的武裝
    // DAS(v25「按住的鍵回到操作狀態」規則的另一半 — 見 resumeOperationalState)
    if (code === 'left') { input.leftDown = true; if (state.mode === 'playing') armHorizontal(-1); return; }
    if (code === 'right') { input.rightDown = true; if (state.mode === 'playing') armHorizontal(1); return; }
    // 軟降的按下事件是離散輸入: 只有在 playing 狀態才生效, 結算/暫停期間一律
    // 丟棄且不補發(即使鍵一直按著, 恢復後仍要偵測到新的按下才會再軟降)
    if (code === 'soft') { if (state.mode === 'playing') input.softDown = true; return; }

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
      case 'left':
        if (input.leftBoundaryBlockedPending) {
          state.log.horizontalPresses.push({
            pieceIndex: state.piece ? state.piece.pieceIndex : state.stats.totalPiecesSpawned,
            dir: 'left', msSinceSpawn: '—',
            holdMs: Math.round((state.time - input.leftBoundaryBlockStartT) * 1000),
            movedCols: 0, blockedCount: 0, source: 'boundaryBlocked', endedBy: 'released'
          });
          input.leftBoundaryBlockedPending = false;
        } else {
          finalizeHorizontalPressLog(-1, 'released');
        }
        endHorizontal(-1);
        break;
      case 'right':
        if (input.rightBoundaryBlockedPending) {
          state.log.horizontalPresses.push({
            pieceIndex: state.piece ? state.piece.pieceIndex : state.stats.totalPiecesSpawned,
            dir: 'right', msSinceSpawn: '—',
            holdMs: Math.round((state.time - input.rightBoundaryBlockStartT) * 1000),
            movedCols: 0, blockedCount: 0, source: 'boundaryBlocked', endedBy: 'released'
          });
          input.rightBoundaryBlockedPending = false;
        } else {
          finalizeHorizontalPressLog(1, 'released');
        }
        endHorizontal(1);
        break;
      case 'soft': input.softDown = false; break;
      case 'r':
        input.rDown = false;
        input.abandonNeedsRelease = false;
        if (state.rKeyLocked) state.rKeyLocked = false;
        input.abandonHolding = false;
        input.abandonTriggered = false;
        break;
    }
  }

  /* ---------------------------------------------------------------
   * 繪製狀態轉換
   * ------------------------------------------------------------- */
  function toArtCell(c) {
    var kind = gridColorKind(c.color);
    return { x: c.col, y: c.row, kind: kind, color: kind === 'color' ? c.color : undefined, mark: c.mark || 'none', t: c.t || 0 };
  }

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
          if (i < g.blockIndex) return;
          b.origCells.concat(b.finalCells).forEach(function (c) { suppress[c.col + '_' + c.row] = true; });
        });
      } else if (s.stage === 'extraclear' && s.extraClear) {
        var et = clamp01(1 - s.extraClear.timer / s.extraClear.duration);
        s.extraClear.cells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'clearing', t: et }); });
      } else if (s.stage === 'wipe' && s.currentWipe) {
        s.currentWipe.cells.forEach(function (c) { suppress[c.col + '_' + c.row] = true; });
      } else if (s.stage === 'transition' && s.tr && s.tr.type === 'shave' && s.tr.cells) {
        var shT = Art.shaveCellT(s.tr.t);
        s.tr.cells.forEach(function (c) { extra.push({ col: c.col, row: c.row, color: c.color, mark: 'shaving', t: shT }); });
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
          interp.forEach(function (c) { Art.drawCell(ctx, { x: c.x, y: c.y, kind: gridColorKind(c.color), color: gridColorKind(c.color) === 'color' ? c.color : undefined, mark: 'falling', t: t }); });
          Art.drawFloatingEventBlock(ctx, { cells: interp.map(function (c) { return { x: c.x, y: c.y }; }), role: 'falling', t: t });
        } else if (g.phase === 'landing') {
          var lt = clamp01(b.landDur > 0 ? g.timer / b.landDur : 1);
          b.finalCells.forEach(function (c) { Art.drawCell(ctx, { x: c.col, y: c.row, kind: gridColorKind(c.color), color: gridColorKind(c.color) === 'color' ? c.color : undefined, mark: 'none', t: 0 }); });
          Art.drawFloatingEventBlock(ctx, { cells: b.finalCells.map(function (c) { return { x: c.col, y: c.row }; }), role: 'landed', t: lt });
          Art.drawLandingImpact(ctx, { cells: b.finalCells.map(function (c) { return { x: c.col, y: c.row }; }), t: lt });
        }
      } else {
        b.origCells.forEach(function (oc, ci) {
          var fc = b.finalCells[ci];
          Art.drawCell(ctx, { x: oc.col, y: oc.row, kind: gridColorKind(fc.color), color: gridColorKind(fc.color) === 'color' ? fc.color : undefined, mark: 'none', t: 0 });
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
      var payload = { task: s.sampledTask === 'gravity' ? null : s.sampledTask, t: t, deducted: s.clearDeducted, targetColor: s.sampledColor };
      if (s.sampledTask === 'dig') payload.cells = s.clearCells.map(function (c) { return { x: c.col, y: c.row, isTarget: c.isTarget }; });
      else if (s.sampledTask === 'big' || s.sampledTask === 'newShape') payload.groups = s.clearGroupsForDisplay;
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
        cells: s.extraClear.cells.filter(function (c) { return c.color !== 'ball' && c.color !== 'clearBall'; }).map(function (c) { return { x: c.col, y: c.row, isTarget: c.isTarget }; }),
        deducted: s.sampledTask === 'dig' ? s.extraClear.deducted : 0, targetColor: s.sampledColor, t: et
      });
    } else if (s.stage === 'wipe' && s.currentWipe) {
      var w = s.currentWipe;
      Art.drawBoardWipe(ctx, {
        colors: w.colors,
        cells: w.cells.map(function (c) { return { x: c.col, y: c.row, color: c.color }; }),
        origins: w.origins && w.origins.length ? w.origins.map(function (o) { return { x: o.col, y: o.row }; }) : undefined,
        t: w.t
      });
    } else if (s.stage === 'transition' && s.tr) {
      var tr = s.tr;
      if (tr.type === 'expand') Art.drawExpandEvent(ctx, { side: tr.side, col: tr.col, t: tr.t });
      else if (tr.type === 'shave') Art.drawShaveEvent(ctx, { cells: tr.cells.map(function (c) { return { x: c.col, y: c.row }; }), t: tr.t });
      else if (tr.type === 'unlock') Art.drawUnlockEvent(ctx, { shape: tr.shape, t: tr.t });
      else if (tr.type === 'star') Art.drawStarGain(ctx, { stars: tr.stars, t: tr.t });
      else if (tr.type === 'speed') Art.drawSpeedUp(ctx, { t: tr.t });
      // 'gap' 與 'reveal': 不額外呼叫(reveal 由常駐的 drawTaskProgress 處理, 見 taskProgressState)
    }
  }

  function nextExpandSideState() {
    if (state.E >= 4) return { side: null, col: null };
    var side = EXPAND_ORDER[state.E];
    var col = side === 'left' ? state.colMin - 1 : state.colMax + 1;
    return { side: side, col: col };
  }

  function taskProgressState() {
    var t = state.displayTask;
    if (!t) return { kind: 'dig', color: 'A', remaining: 1, required: 1, reward: 'expand', side: 'left' };
    var plan = rewardPlanFor(t.k);
    var s = state.settlement;
    var reveal = null;
    if (state.mode === 'settle' && s && s.stage === 'transition' && s.tr && s.tr.type === 'reveal') reveal = s.tr.t;
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
      reward: plan.reward, shave: !!plan.shave, clearBall: !!plan.clearBall, side: plan.side,
      newShapes: t.kind === 'newShape' ? state.unlockedShapes.slice() : undefined,
      reveal: reveal, credit: credit
    };
  }

  function nextPreviewState() {
    if (!state.nextPiece) return { cells: [], masked: true };
    var masked = state.mode !== 'playing' && state.mode !== 'settle';
    var mark = !!(state.displayTask && state.displayTask.kind === 'newShape' && isNewShape(state.nextPiece.shapeKey));
    return {
      cells: state.nextPiece.cells.map(function (c) { return { dx: c.x, dy: c.y, kind: pieceCellKind(c), color: (c.ball || c.clearBall) ? undefined : c.color }; }),
      masked: masked,
      newShapeMark: mark
    };
  }

  function hudState() {
    var starGain;
    var s = state.settlement;
    if (state.mode === 'settle' && s && s.stage === 'transition' && s.tr && s.tr.type === 'star') starGain = s.tr.t;
    return { stars: state.E, starGain: starGain, best: state.best, time: state.time };
  }

  function gameOverState() {
    var info = state.gameOverInfo || {};
    return {
      stars: info.stars || 0, best: info.best, task: info.task || null,
      justCompleted: info.justCompleted || null, reason: info.reason || 'blockout', newRecord: !!info.newRecord
    };
  }
  function victoryState() {
    var info = state.victoryInfo || {};
    return { newRecord: !!info.newRecord };
  }

  function guideModeFor() {
    if (state.mode === 'guideOpening') return 'opening';
    if (state.mode === 'over') return 'gameover';
    if (state.mode === 'victory') return 'victory';
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
        Art.drawGhost(ctx, { cells: ghostCells.map(function (c) { return { x: c.col, y: c.row, kind: pieceCellKind(c), color: (c.ball || c.clearBall) ? undefined : c.color }; }) });
      }
      Art.drawPiece(ctx, {
        cells: state.piece.cells.map(function (c) { return { x: state.piece.anchorCol + c.x, y: state.piece.anchorRow + c.y, kind: pieceCellKind(c), color: (c.ball || c.clearBall) ? undefined : c.color }; }),
        mode: piecePhase(state.piece),
        lockT: state.piece.inLockDelay ? clamp01(1 - state.piece.lockTimer / LOCK_DELAY) : 0
      });
    }

    drawSettlementOverlay(ctx);

    Art.drawTaskProgress(ctx, taskProgressState());
    Art.drawNextPreview(ctx, nextPreviewState());
    Art.drawHud(ctx, hudState());

    if (input.abandonHolding && !input.abandonTriggered && state.mode !== 'over' && state.mode !== 'victory' && !state.guideOpen) {
      Art.drawAbandonTimer(ctx, { progress: abandonProgress() });
    }

    if (state.mode === 'paused' && !state.guideOpen) Art.drawPauseMask(ctx);
    if (state.mode === 'over') Art.drawGameOver(ctx, gameOverState());
    if (state.mode === 'victory') Art.drawVictory(ctx, victoryState());
    if (state.guideOpen) Art.drawGuidePage(ctx, { page: state.guidePage, mode: guideModeFor() });

    // v26: 最上層, 任何畫面都畫(含說明頁、暫停、結束、通關), 不算過場的一段
    if (muteToastShownAt !== null) {
      var mtT = (performance.now() - muteToastShownAt) / 1000;
      if (mtT < 1.0) Art.drawMuteToast(ctx, { muted: Sound.isMuted(), t: clamp01(mtT) });
      else muteToastShownAt = null;
    }
    if (Sound.isMuted()) Art.drawMuteIndicator(ctx, { muted: true });
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
      leftPressLog: null, rightPressLog: null,
      leftBoundaryBlockedPending: false, rightBoundaryBlockedPending: false,
      leftBoundaryBlockStartT: 0, rightBoundaryBlockStartT: 0,
      abandonHolding: false, abandonStart: 0, abandonTriggered: false, rDown: false, abandonNeedsRelease: false
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
      if (rawDt > MAX_FRAME_DT) rawDt = MAX_FRAME_DT;
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
