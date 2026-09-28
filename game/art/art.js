/* 史萊姆擴張 v25 — 美術繪製層
 * 全域物件 window.Art, 不用 ES module。
 * 只負責「給狀態, 畫出來」; 不做任何判定。
 * 盤面座標: x = 絕對欄(-2~7), y = 列(1 = 最底列, 19 = 頂列, 20 以上不可見; 可帶小數供下落動畫)。
 * 沿用 v22 美術的色票、形狀語言、物件畫法與版面骨架; v25 只改規格變動牽涉到的物件:
 * - 任務面板: 三欄各自一張底卡(老闆第 9 輪「要更清楚讓玩家知道有 3 塊」), 函式名與 state 不變
 * - 說明頁 7 頁 → 6 頁(guide v23 刪「要湊哪一團?」頁); 第 3 頁照 guide v25 重畫(只放任務面板與星數);
 *   第 4 頁右側「還能繼續」那格的超出格移到出生欄以外(guide v25)
 */
(function () {
  'use strict';

  // ================= 常數 =================
  const W = 960, H = 640;
  const CELL = 26;
  const FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif';

  const PAL = {
    bg: '#12141c',
    panel: '#1a1d29',
    panelEdge: '#2c3146',
    // v25: 任務面板三欄各自一張底卡(比面板底亮一階, 無填色以外的裝飾)
    panelCell: '#222637',
    panelCellEdge: '#353b55',
    boardBg: '#1c2030',
    grid: '#262b3d',
    slot: '#14161e',
    slotHatch: '#232736',
    boundary: '#c9d1e6',
    topLine: '#ff8a3d',
    text: '#e8ecf5',
    textDim: '#8a93ab',
    slimeA: '#f25a4a',
    slimeB: '#2657c8',
    slimeC: '#f5cc2a',
    ballBase: '#353b52',
    ballOrb: '#e6e9f2',
    ballArrow: '#262b3a',
    clear: '#ffffff',
    gravity: '#4fe0ff',
    gravityStay: '#9aa3b8',
    shave: '#b58cff',
    expand: '#5fe39a',
    danger: '#ff8a3d',
    // v20: 洋紅 = 清色球 / 全盤清除(球的外框與核心、全盤清除的衝擊波、「清色球」字樣)
    wipe: '#ff5fd0',
    clearBallBase: '#3a1f42',
    outline: '#0b0d13',
    silhouette: '#dfe4ef', // 新外型解鎖展示用的中性格(只示形狀, 不帶顏色)
    player: '#ffffff', // 操作中方塊的外框(契約保留名)
    // v22: 星數。五角星是星數專屬的形狀; 金 = 第 1~5 星, 白金 = 第 6~10 星(白金多一圈外框 = 可數的疊加元素)
    starGold: '#ffb81c',
    starGoldDark: '#d98a0a',
    starGoldRim: '#ffe28a',
    starPlat: '#eef2ff',
    starPlatDark: '#aab4d0',
    starPlatRing: '#c9d6ff',
    starEmpty: '#141722',
    starEmptyEdge: '#3d4460',
  };

  // v15: 拿掉形狀符號, 只留顏色(老闆第 5 輪回饋); 三色明度仍拉開三檔(藍暗 / 紅中 / 黃亮)
  const SLIME = {
    A: { fill: PAL.slimeA, dark: '#c23a2e', rim: '#ff9488', name: '紅', text: '#ff7a6c' },
    B: { fill: PAL.slimeB, dark: '#183d96', rim: '#7aa0ff', name: '藍', text: '#8fb0ff' },
    C: { fill: PAL.slimeC, dark: '#c99c0e', rim: '#fff3a8', name: '黃', text: '#f5cc2a' },
  };

  // 新外型(v15): 框內座標 (bx, by), by 向上; 只供解鎖事件展示形狀
  const NEW_SHAPES = {
    V: { name: '角形', cells: [[0, 0], [1, 0], [0, 1]] },
    U: { name: '杯形', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] },
    X: { name: '十字形', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  };

  // 任務種類(玩家語言; 不出現規格內部名稱)
  // v18: 刪「雙消」, 新增「用新形狀方塊」(newShape)
  const TASK = {
    dig: { unit: '顆' },
    big: { unit: '團', what: '一次消掉 5 顆以上的一團' },
    newShape: { unit: '團', what: '放下新形狀的方塊, 當場消掉一團' },
    gravity: { unit: '次', what: '用重力球讓懸空的史萊姆掉下來' },
  };
  const NEW_PIECE_WORD = '新形狀方塊'; // v18 玩家用詞, 面板 / 過場 / 說明共用
  const CLEAR_BALL_WORD = '清色球'; // v20 玩家用詞(v21 起只寫名稱, 不解釋效果)
  const STAR_WORD = '升一星'; // v22: 過場第 2 段與說明頁共用

  // 固定版位(P11: 常駐資訊位置固定)
  // v22: 分數(y260)+ 倍率(y350)兩塊合併為星數顯示(y260~398); 最佳紀錄、時間位置不動
  const BOX = {
    task: { x: 24, y: 110, w: 302, h: 236 },
    abandon: { x: 24, y: 548, w: 302, h: 56 },
    preview: { x: 634, y: 110, w: 302, h: 140 },
    stars: { x: 634, y: 260, w: 302, h: 138 },
    best: { x: 634, y: 408, w: 302, h: 48 },
    time: { x: 634, y: 466, w: 302, h: 48 },
    banner: { x: 330, y: 18, w: 300, h: 54 },
  };

  // ================= 盤面版位 =================
  // 預設: 滿寬 10 欄的外框固定不動(絕對欄 -2~7), 未開的欄畫成「預留槽」
  const DEFAULT_LAY = { left: 350, bottom: 604, col0: -2, frameMin: -2, frameMax: 7, rows: 19, showTop: true };
  let LAY = DEFAULT_LAY;
  function withLay(lay, fn) {
    const prev = LAY;
    LAY = Object.assign({}, DEFAULT_LAY, lay);
    try { fn(); } finally { LAY = prev; }
  }
  function cx(col) { return LAY.left + (col - LAY.col0) * CELL; }
  function cy(row) { return LAY.bottom - row * CELL; } // 該列格子的上緣
  function boardRect() {
    const x = cx(LAY.frameMin);
    const w = (LAY.frameMax - LAY.frameMin + 1) * CELL;
    const h = LAY.rows * CELL;
    return { x: x, y: LAY.bottom - h, w: w, h: h };
  }
  function clipBoard(ctx) {
    const b = boardRect();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
  }

  // ================= 基礎工具 =================
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function font(size, weight) { return (weight || 'bold') + ' ' + size + 'px ' + FONT; }
  // 文字; outline 給色則加描邊(P10)
  function txt(ctx, s, x, y, size, color, align, outline, weight) {
    ctx.font = font(size, weight);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = outline;
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }
  // 多色文字: parts = [[文字, 顏色], ...]; 超過 maxW 時整段縮字
  function parts(ctx, list, x, y, size, maxW, align) {
    ctx.font = font(size);
    let total = 0;
    list.forEach(function (p) { total += ctx.measureText(p[0]).width; });
    if (maxW && total > maxW) {
      size = Math.max(10, Math.floor(size * maxW / total));
      ctx.font = font(size);
      total = 0;
      list.forEach(function (p) { total += ctx.measureText(p[0]).width; });
    }
    let px = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    list.forEach(function (p) {
      txt(ctx, p[0], px, y, size, p[1], 'left');
      px += ctx.measureText(p[0]).width;
    });
    return total;
  }
  function fmt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }
  function panel(ctx, b, title, edge) {
    rr(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = PAL.panel;
    ctx.fill();
    ctx.lineWidth = edge ? 2 : 1;
    ctx.strokeStyle = edge || PAL.panelEdge;
    ctx.stroke();
    if (title) txt(ctx, title, b.x + 14, b.y + 16, 13, PAL.textDim, 'left');
  }
  function arrow(ctx, x1, y1, x2, y2, color, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const hl = 6 + lw * 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - Math.cos(a) * hl * 0.6, y2 - Math.sin(a) * hl * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.5) * hl, y2 - Math.sin(a - 0.5) * hl);
    ctx.lineTo(x2 - Math.cos(a + 0.5) * hl, y2 - Math.sin(a + 0.5) * hl);
    ctx.closePath();
    ctx.fill();
  }
  function hatch(ctx, x, y, w, h, color, gap, lw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath();
    for (let d = -h; d < w + h; d += gap) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  // 優先在「, 」後斷行(任務句子是兩個短句), 斷不下才逐字
  function wrapPhrase(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return [text];
    const i = text.indexOf(', ');
    if (i > 0) {
      const a = text.slice(0, i + 1), b = text.slice(i + 2);
      if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) return [a, b];
    }
    return wrap(ctx, text, maxW);
  }
  function wrap(ctx, text, maxW) {
    const out = [];
    let line = '';
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) out.push(line);
    return out;
  }

  // ================= 格位畫家(全畫面共用一本字典, P3) =================
  // v15: 史萊姆只有顏色, 沒有中央記號
  function paintSlime(ctx, px, py, size, color) {
    const c = SLIME[color] || SLIME.A;
    const i = size * 0.06;
    const x = px + i, y = py + i, s = size - 2 * i;
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = c.dark;
    ctx.fillRect(x, y + s * 0.74, s, s * 0.3);
    ctx.restore();
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = c.rim;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.ellipse(x + s * 0.3, y + s * 0.22, s * 0.15, s * 0.08, -0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  // 新外型展示用的中性格: 同一個史萊姆輪廓, 不帶顏色(形狀才是重點)
  function paintSilhouette(ctx, px, py, size) {
    const i = size * 0.06;
    const x = px + i, y = py + i, s = size - 2 * i;
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.fillStyle = PAL.silhouette;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#aab2c6';
    ctx.fillRect(x, y + s * 0.74, s, s * 0.3);
    ctx.restore();
    rr(ctx, x, y, s, s, s * 0.3);
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  function ballArrowPath(ctx, mx, my, s) {
    ctx.beginPath();
    ctx.moveTo(mx, my - s * 0.2);
    ctx.lineTo(mx, my + s * 0.08);
    ctx.moveTo(mx - s * 0.13, my - s * 0.02);
    ctx.lineTo(mx, my + s * 0.15);
    ctx.lineTo(mx + s * 0.13, my - s * 0.02);
  }
  function paintBall(ctx, px, py, size) {
    const i = size * 0.06;
    rr(ctx, px + i, py + i, size - 2 * i, size - 2 * i, size * 0.2);
    ctx.fillStyle = PAL.ballBase;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.strokeStyle = '#5d6582';
    ctx.stroke();
    const mx = px + size / 2, my = py + size / 2, r = size * 0.36;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = PAL.ballOrb;
    ctx.fill();
    // 三色環 = 萬用色
    const cols = [PAL.slimeA, PAL.slimeB, PAL.slimeC];
    ctx.lineWidth = size * 0.1;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(mx, my, r, -Math.PI / 2 + k * (Math.PI * 2 / 3) + 0.12, -Math.PI / 2 + (k + 1) * (Math.PI * 2 / 3) - 0.12);
      ctx.strokeStyle = cols[k];
      ctx.stroke();
    }
    // 向下箭頭 = 重力
    ballArrowPath(ctx, mx, my, size);
    ctx.strokeStyle = PAL.ballArrow;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  // 四角星(閃光)路徑: 清色球的專屬符號
  function sparklePath(ctx, mx, my, R, r) {
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 4;
      const rad = k % 2 ? r : R;
      const x = mx + Math.cos(a) * rad, y = my + Math.sin(a) * rad;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  // 清色球(v20): 與重力球同屬萬用格 → 共用「三色環 = 萬用色」;
  // 差異走三條通道: 底色(紫黑 + 洋紅外框 vs 灰藍)、核心(洋紅圓 vs 銀白圓)、符號(白色四角星 vs 向下箭頭)
  function paintClearBall(ctx, px, py, size) {
    const i = size * 0.06;
    rr(ctx, px + i, py + i, size - 2 * i, size - 2 * i, size * 0.2);
    ctx.fillStyle = PAL.clearBallBase;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, size * 0.07);
    ctx.strokeStyle = PAL.wipe;
    ctx.stroke();
    const mx = px + size / 2, my = py + size / 2, r = size * 0.34;
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fillStyle = PAL.wipe;
    ctx.fill();
    const cols = [PAL.slimeA, PAL.slimeB, PAL.slimeC];
    ctx.lineWidth = size * 0.09;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(mx, my, r, -Math.PI / 2 + k * (Math.PI * 2 / 3) + 0.12, -Math.PI / 2 + (k + 1) * (Math.PI * 2 / 3) - 0.12);
      ctx.strokeStyle = cols[k];
      ctx.stroke();
    }
    sparklePath(ctx, mx, my, size * 0.25, size * 0.075);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  function paintBody(ctx, px, py, size, kind, color) {
    if (kind === 'ball') paintBall(ctx, px, py, size);
    else if (kind === 'clearBall') paintClearBall(ctx, px, py, size);
    else paintSlime(ctx, px, py, size, color);
  }
  function paintGhost(ctx, px, py, size, kind, color) {
    if (kind === 'clearBall') {
      // 清色球落點: 洋紅圓框 + 四角星線稿(與重力球的銀框 + 箭頭分開)
      const mx = px + size / 2, my = py + size / 2;
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,95,208,0.16)';
      ctx.fill();
      ctx.strokeStyle = PAL.wipe;
      ctx.lineWidth = 2;
      ctx.stroke();
      sparklePath(ctx, mx, my, size * 0.25, size * 0.08);
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.stroke();
      return;
    }
    if (kind === 'ball') {
      const mx = px + size / 2, my = py + size / 2;
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(230,233,242,0.14)';
      ctx.fill();
      ctx.strokeStyle = PAL.ballOrb;
      ctx.lineWidth = 2;
      ctx.stroke();
      ballArrowPath(ctx, mx, my, size);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      return;
    }
    const c = SLIME[color] || SLIME.A;
    const i = size * 0.1;
    rr(ctx, px + i, py + i, size - 2 * i, size - 2 * i, size * 0.26);
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.fill;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // ================= 星數(v22) =================
  // 全畫面只有一個星數畫家: HUD、升星卡片、結束 / 通關畫面、任務面板的「通關」、說明頁共用(P3)
  function starPath(ctx, mx, my, R) {
    const r = R * 0.46;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5;
      const rad = k % 2 ? r : R;
      const x = mx + Math.cos(a) * rad, y = my + Math.sin(a) * rad;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  // kind: 'empty' | 'gold' | 'plat'
  // 金 vs 白金走兩條通道: 明度(金中高 / 白金最亮) + 疊加元素(白金多一圈外框星); 空星位 = 暗底 + 暗邊, 不填色
  function paintStar(ctx, mx, my, R, kind) {
    ctx.save();
    ctx.lineJoin = 'round';
    if (kind === 'empty') {
      starPath(ctx, mx, my, R);
      ctx.fillStyle = PAL.starEmpty;
      ctx.fill();
      ctx.strokeStyle = PAL.starEmptyEdge;
      ctx.lineWidth = Math.max(1.5, R * 0.08);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const plat = kind === 'plat';
    if (plat) {
      // 外圈第二道星框(白金專屬)
      starPath(ctx, mx, my, R * 1.22);
      ctx.strokeStyle = PAL.starPlatRing;
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.stroke();
    }
    starPath(ctx, mx, my, R);
    ctx.fillStyle = plat ? PAL.starPlat : PAL.starGold;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = plat ? PAL.starPlatDark : PAL.starGoldDark;
    ctx.fillRect(mx - R, my + R * 0.18, R * 2, R);
    ctx.restore();
    starPath(ctx, mx, my, R);
    ctx.strokeStyle = plat ? '#ffffff' : PAL.starGoldRim;
    ctx.lineWidth = Math.max(1.2, R * 0.08);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(mx - R * 0.16, my - R * 0.3, R * 0.14, R * 0.08, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 星數 n(0~10) → 5 個星位的狀態
  function starKinds(n) {
    n = Math.max(0, Math.min(10, Math.floor(n || 0)));
    const out = [];
    for (let i = 0; i < 5; i++) out.push(n >= 6 + i ? 'plat' : n >= i + 1 ? 'gold' : 'empty');
    return out;
  }
  // 升到第 n 星時變化的星位: 1~5 = 空 → 金; 6~10 = 金 → 白金
  function changedSlot(n) {
    if (n < 1) return -1;
    return n <= 5 ? n - 1 : n - 6;
  }
  // 5 星位一排。(mx, my) = 整排中心; R = 單顆外徑; gap = 顆距(中心到中心)
  // gain(0~1)給值時演出「升到 n 星」: 變化的那一格先保持舊狀態 → 鼓起換成新狀態 + 光環 → 回穩
  function paintStarRow(ctx, mx, my, R, gap, n, gain, final) {
    const kinds = starKinds(n);
    const prev = starKinds(n - 1);
    const slot = gain != null ? changedSlot(n) : -1;
    const g = gain != null ? clamp01(gain) : 1;
    for (let i = 0; i < 5; i++) {
      const x = mx + (i - 2) * gap;
      if (i !== slot) {
        let k = 1;
        if (final && gain != null && g > 0.5) k = 1 + 0.12 * Math.sin(clamp01((g - 0.5 - i * 0.05) / 0.3) * Math.PI);
        paintStar(ctx, x, my, R * k, kinds[i]);
        continue;
      }
      // 變化的那一格: 0~0.2 舊狀態, 0.2~0.45 鼓起並換成新狀態, 之後回穩; 光環與放射線 0.25~0.8
      if (g < 0.2) { paintStar(ctx, x, my, R, prev[i]); continue; }
      const p = clamp01((g - 0.2) / 0.25);
      const k = p < 1 ? 1 + 0.45 * Math.sin(p * Math.PI) : 1;
      const burst = clamp01((g - 0.25) / 0.55);
      if (burst > 0 && burst < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - burst;
        ctx.strokeStyle = kinds[i] === 'plat' ? '#ffffff' : PAL.starGoldRim;
        ctx.lineWidth = Math.max(2, R * 0.12);
        ctx.beginPath();
        ctx.arc(x, my, R * (1 + 1.1 * burst), 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let q = 0; q < 8; q++) {
          const a = q * Math.PI / 4 + 0.2;
          const r1 = R * (1.1 + 0.9 * burst), r2 = r1 + R * 0.5;
          ctx.moveTo(x + Math.cos(a) * r1, my + Math.sin(a) * r1);
          ctx.lineTo(x + Math.cos(a) * r2, my + Math.sin(a) * r2);
        }
        ctx.stroke();
        ctx.restore();
      }
      paintStar(ctx, x, my, R * k, kinds[i]);
    }
    if (final && gain != null && g > 0.5) {
      // 第 10 星: 5 顆全部轉白金後, 一道白光由左往右掃過整排(份量比平常重)
      const sweep = clamp01((g - 0.5) / 0.4);
      if (sweep < 1) {
        ctx.save();
        const sx = mx - 2.6 * gap + 5.2 * gap * sweep;
        const grd = ctx.createLinearGradient(sx - R, 0, sx + R, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(0.5, 'rgba(255,255,255,0.55)');
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(sx - R, my - R * 1.4, R * 2, R * 2.8);
        ctx.restore();
      }
    }
  }

  // 任務種類圖示: 任務面板、算數標籤、下一個任務公告共用(P3)
  function taskIcon(ctx, kind, color, x, y, s) {
    if (kind === 'gravity') { paintBall(ctx, x, y, s); return; }
    if (kind === 'dig') {
      if (SLIME[color]) paintSlime(ctx, x, y, s, color);
      else { rr(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.25); ctx.strokeStyle = PAL.textDim; ctx.lineWidth = 1.5; ctx.stroke(); }
      return;
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    if (kind === 'big') {
      rr(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.3);
      ctx.stroke();
      txt(ctx, '5+', x + s / 2, y + s * 0.53, Math.max(9, Math.round(s * 0.42)), '#ffffff', 'center');
    } else if (kind === 'newShape') {
      // 用新形狀方塊(v18): 一個「不是四格方塊」的輪廓(三格缺角) + 向下箭頭 = 放下它。
      // 白線稿, 與獎勵的綠色「?」分開(白 = 玩家的消除 / 任務, 綠 = 獎勵)
      const q = s * 0.33;
      const ox = x + s * 0.04, oy = y + s * 0.2;
      [[0, 0], [0, 1], [1, 1]].forEach(function (p) {
        rr(ctx, ox + p[0] * q, oy + p[1] * q, q, q, q * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fill();
        ctx.stroke();
      });
      const ax = x + s * 0.86;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, y + s * 0.1);
      ctx.lineTo(ax, y + s * 0.62);
      ctx.moveTo(ax - s * 0.12, y + s * 0.48);
      ctx.lineTo(ax, y + s * 0.64);
      ctx.lineTo(ax + s * 0.12, y + s * 0.48);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + s * 0.74, y + s * 0.84, s * 0.24, Math.max(1.5, s * 0.06));
    }
  }
  // 「做什麼」的文字(多色 parts)
  function whatParts(kind, color) {
    if (kind === 'dig') {
      const c = SLIME[color];
      // v22: 字更短(老闆第 8 輪「用字越少越好」); 目標色由左邊的史萊姆圖示與色字表達
      return [['消掉 ', PAL.text], [(c ? c.name : '目標') + '色', c ? c.text : PAL.text]];
    }
    return [[(TASK[kind] || TASK.big).what, PAL.text]];
  }
  function unitOf(kind) { return (TASK[kind] || TASK.dig).unit; }
  // 獎勵圖示(「得到什麼」)
  function rewardIcon(ctx, reward, side, x, y, s) {
    if (reward === 'newPiece') {
      rr(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.25);
      ctx.fillStyle = 'rgba(95,227,154,0.18)';
      ctx.fill();
      ctx.strokeStyle = PAL.expand;
      ctx.lineWidth = 2;
      ctx.stroke();
      txt(ctx, '?', x + s / 2, y + s * 0.53, Math.round(s * 0.6), PAL.expand, 'center');
    } else if (reward === 'clearBall') {
      // v20: 清色球獎勵的圖示就是清色球本身(與盤面 / 預覽 / 獎勵事件同一個長相)
      paintClearBall(ctx, x, y, s);
    } else if (reward === 'shave') {
      // 削頂(v18: 倍率到上限後第偶數個任務只剩削頂): 紫色台階削線 + 斜紋, 與盤面上的削頂指示同一長相
      hatch(ctx, x + 2, y + s * 0.45, s - 4, s * 0.45, PAL.shave, 4, 1.5);
      ctx.strokeStyle = PAL.shave;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + s * 0.5);
      ctx.lineTo(x + s * 0.4, y + s * 0.5);
      ctx.lineTo(x + s * 0.4, y + s * 0.3);
      ctx.lineTo(x + s * 0.7, y + s * 0.3);
      ctx.lineTo(x + s * 0.7, y + s * 0.45);
      ctx.lineTo(x + s - 2, y + s * 0.45);
      ctx.stroke();
    } else if (reward === 'clear') {
      // v22: 第 10 個任務的回報 = 通關 → 白金星(與星數顯示同一顆)
      paintStar(ctx, x + s / 2, y + s / 2, s * 0.4, 'plat');
    } else if (reward === 'none') {
      ctx.strokeStyle = PAL.textDim;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y + s / 2);
      ctx.lineTo(x + s * 0.8, y + s / 2);
      ctx.stroke();
    } else {
      const my = y + s / 2;
      if (side === 'left') arrow(ctx, x + s - 2, my, x + 2, my, PAL.expand, 3);
      else arrow(ctx, x + 2, my, x + s - 2, my, PAL.expand, 3);
    }
  }

  // 全盤清除中的一格(v20): lt = 該格自己的進度 0~1
  //   0~0.35 鼓起 + 轉白(先讓玩家看到「就是這個顏色」) → 0.35~0.7 爆開: 本體縮沒、碎片往外噴 → 0.7~1 原位留下洋紅殘影框淡出
  function paintWipeCell(ctx, px, py, kind, color, lt, glow) {
    lt = clamp01(lt);
    const mx = px + CELL / 2, my = py + CELL / 2;
    const c = SLIME[color] || SLIME.A;
    if (lt < 0.7) {
      let k;
      if (lt < 0.35) k = 1 + 0.22 * (lt / 0.35);
      else k = 1.22 * (1 - (lt - 0.35) / 0.35);
      if (k > 0.02) {
        const s = CELL * k, o = (CELL - s) / 2;
        paintBody(ctx, px + o, py + o, s, kind, color);
        ctx.globalAlpha = Math.min(0.9, lt / 0.35 * 0.85);
        rr(ctx, px + o, py + o, s, s, s * 0.3);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = PAL.wipe;
        ctx.lineWidth = 2.5;
        rr(ctx, px + o, py + o, s, s, s * 0.3);
        ctx.stroke();
      }
    }
    if (lt >= 0.4) {
      // 碎片: 八道, 該色與白交錯, 從格緣往外噴
      const e = clamp01((lt - 0.4) / 0.6);
      ctx.globalAlpha = 1 - e;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4 + 0.3;
        const d = 12 + 22 * e;
        const r = (k % 2 ? 2.2 : 3.2) * (1 - 0.5 * e);
        ctx.beginPath();
        ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, r, 0, Math.PI * 2);
        ctx.fillStyle = k % 2 ? '#ffffff' : c.fill;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (lt >= 0.55) {
      // 殘影框: 讓玩家事後看得出「哪些位置被清掉了」(不寫格數); glow 給值時由呼叫端控制淡出(全盤清除: 撐到段尾一起淡)
      ctx.globalAlpha = glow != null ? glow : 0.7 * (1 - clamp01((lt - 0.55) / 0.45));
      ctx.strokeStyle = PAL.wipe;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
      ctx.globalAlpha = 1;
    }
  }

  // 一格含標記的完整畫法
  function paintMarkedCell(ctx, px, py, kind, color, mark, t) {
    t = clamp01(t);
    if (mark === 'clearing') {
      // 消除: 白色單框 + 縮小閃白(「我造成的」)
      const s = CELL * (1 - 0.35 * t);
      const o = (CELL - s) / 2;
      paintBody(ctx, px + o, py + o, s, kind, color);
      ctx.globalAlpha = 0.75 * (1 - t) + 0.1;
      rr(ctx, px + o, py + o, s, s, s * 0.3);
      ctx.fillStyle = PAL.clear;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = PAL.clear;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
      if (kind === 'ball') {
        // 觸發: 青色外擴環
        ctx.beginPath();
        ctx.arc(px + CELL / 2, py + CELL / 2, CELL * 0.45 + 10 * t, 0, Math.PI * 2);
        ctx.strokeStyle = PAL.gravity;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (kind === 'clearBall') {
        // 觸發全盤清除(v20): 洋紅四角星往外放大 + 洋紅外擴環(與重力球的單一青環分開)
        const mx = px + CELL / 2, my = py + CELL / 2;
        ctx.globalAlpha = 1 - 0.5 * t;
        sparklePath(ctx, mx, my, CELL * 0.5 + 16 * t, CELL * 0.12 + 3 * t);
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.strokeStyle = PAL.wipe;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, CELL * 0.45 + 12 * t, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    } else if (mark === 'wiping') {
      // 全盤清除中(v20): 單格版本(整段演出由 drawBoardWipe 依距離錯開, 見該函式)
      paintWipeCell(ctx, px, py, kind, color, t);
    } else if (mark === 'shaving') {
      // 削頂: 紫色斜紋 + 紫框, 淡出(「系統給的」)
      ctx.globalAlpha = 1 - 0.6 * t;
      paintBody(ctx, px, py, CELL, kind, color);
      ctx.globalAlpha = 1;
      hatch(ctx, px + 1, py + 1, CELL - 2, CELL - 2, PAL.shave, 5, 2);
      ctx.strokeStyle = PAL.shave;
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
    } else if (mark === 'falling') {
      // 下落中: 青色拖尾(上方三道)
      paintBody(ctx, px, py, CELL, kind, color);
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      [6, 13, 20].forEach(function (dx, k) {
        ctx.moveTo(px + dx, py - 2);
        ctx.lineTo(px + dx, py - 8 - (k === 1 ? 5 : 0));
      });
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      paintBody(ctx, px, py, CELL, kind, color);
    }
  }

  // 格位集合外框(可含小數 y, 同一組需有相同小數); inset 為負 = 往外擴
  function cellSet(cells) {
    const set = new Set();
    cells.forEach(function (c) { set.add(c.x + ',' + Math.round(c.y * 100)); });
    return function has(x, y) { return set.has(x + ',' + Math.round(y * 100)); };
  }
  function contourPath(ctx, cells, inset) {
    const has = cellSet(cells);
    const i = inset;
    ctx.beginPath();
    cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      const L = has(c.x - 1, c.y), R = has(c.x + 1, c.y), U = has(c.x, c.y + 1), D = has(c.x, c.y - 1);
      if (!U) { ctx.moveTo(L ? px : px + i, py + i); ctx.lineTo(R ? px + CELL : px + CELL - i, py + i); }
      if (!D) { ctx.moveTo(L ? px : px + i, py + CELL - i); ctx.lineTo(R ? px + CELL : px + CELL - i, py + CELL - i); }
      if (!L) { ctx.moveTo(px + i, U ? py : py + i); ctx.lineTo(px + i, D ? py + CELL : py + CELL - i); }
      if (!R) { ctx.moveTo(px + CELL - i, U ? py : py + i); ctx.lineTo(px + CELL - i, D ? py + CELL : py + CELL - i); }
    });
    return has;
  }
  // 「這次算數了」標籤: 任務圖示 + −N, 白框(白 = 玩家造成的消除)
  function creditChip(ctx, kind, color, text, centerX, topY, t) {
    const b = boardRect();
    ctx.font = font(13);
    const w = 6 + 16 + 5 + ctx.measureText(text).width + 8;
    const lx = Math.max(b.x + w / 2 + 2, Math.min(b.x + b.w - w / 2 - 2, centerX));
    const ly = Math.max(b.y + 12, topY - 12 - 8 * t);
    ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.6 : 1;
    rr(ctx, lx - w / 2, ly - 11, w, 22, 6);
    ctx.fillStyle = 'rgba(10,12,20,0.88)';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    taskIcon(ctx, kind, color, lx - w / 2 + 6, ly - 8, 16);
    txt(ctx, text, lx - w / 2 + 27, ly, 13, '#ffffff', 'left');
    ctx.globalAlpha = 1;
  }
  function spanOf(list) {
    let top = -Infinity, sumX = 0;
    list.forEach(function (c) { if (c.y > top) top = c.y; sumX += cx(c.x) + CELL / 2; });
    return { top: top, midX: list.length ? sumX / list.length : 0 };
  }
  function targetCorner(ctx, c) {
    // 目標色格: 左下角白色倒三角(= 扣 1)
    const px = cx(c.x), py = cy(c.y);
    ctx.beginPath();
    ctx.moveTo(px + 2, py + CELL - 11);
    ctx.lineTo(px + 12, py + CELL - 11);
    ctx.lineTo(px + 7, py + CELL - 3);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = PAL.outline;
    ctx.stroke();
  }

  // ================= 背景 / 盤面 =================
  function drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // state: { minCol, maxCol }  目前已開的絕對欄範圍
  function drawBoard(ctx, s) {
    s = s || {};
    const minCol = s.minCol != null ? s.minCol : 0;
    const maxCol = s.maxCol != null ? s.maxCol : 5;
    ctx.save();
    const b = boardRect();
    for (let c = LAY.frameMin; c <= LAY.frameMax; c++) {
      const x = cx(c);
      if (c >= minCol && c <= maxCol) {
        ctx.fillStyle = PAL.boardBg;
        ctx.fillRect(x, b.y, CELL, b.h);
      } else {
        ctx.fillStyle = PAL.slot;
        ctx.fillRect(x, b.y, CELL, b.h);
        hatch(ctx, x, b.y, CELL, b.h, PAL.slotHatch, 8, 1.5);
      }
    }
    // 格線
    const ox = cx(minCol), ow = (maxCol - minCol + 1) * CELL;
    ctx.strokeStyle = PAL.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = minCol + 1; c <= maxCol; c++) {
      ctx.moveTo(cx(c) + 0.5, b.y);
      ctx.lineTo(cx(c) + 0.5, b.y + b.h);
    }
    for (let r = 1; r < LAY.rows; r++) {
      ctx.moveTo(ox, cy(r) + 0.5);
      ctx.lineTo(ox + ow, cy(r) + 0.5);
    }
    ctx.stroke();
    // 邊界(目前可放置範圍)
    ctx.strokeStyle = PAL.boundary;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox - 1, b.y, ow + 2, b.h + 1);
    ctx.fillStyle = PAL.boundary;
    ctx.fillRect(ox - 2, b.y + b.h, ow + 4, 3);
    // 頂線
    if (LAY.showTop) {
      ctx.strokeStyle = PAL.topLine;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(ox - 4, b.y + 1);
      ctx.lineTo(ox + ow + 4, b.y + 1);
      ctx.stroke();
      ctx.setLineDash([]);
      txt(ctx, '頂線', b.x + b.w + 3, b.y + 2, 11, PAL.topLine, 'left');
    }
    ctx.restore();
  }

  // state: { x, y, kind: 'empty'|'color'|'ball'|'clearBall', color: 'A'|'B'|'C', mark: 'none'|'clearing'|'shaving'|'falling'|'wiping', t }
  function drawCell(ctx, s) {
    if (!s || s.kind === 'empty') return; // 空格(含開放 / 封閉空洞)由盤面底色呈現
    ctx.save();
    clipBoard(ctx);
    paintMarkedCell(ctx, cx(s.x), cy(s.y), s.kind, s.color, s.mark, s.t);
    ctx.restore();
  }

  // state: { x, y, mark, t }  與 drawCell(kind:'ball') 等價
  function drawGravityBall(ctx, s) {
    drawCell(ctx, Object.assign({}, s, { kind: 'ball' }));
  }

  // state: { x, y, mark, t }  與 drawCell(kind:'clearBall') 等價(v20)
  // mark: 'none'(留在盤面上) / 'clearing'(成團消除中 = 觸發全盤清除) / 'falling'(隨重力事件下落) / 'shaving'(被削頂, 不觸發)
  function drawClearBall(ctx, s) {
    drawCell(ctx, Object.assign({}, s, { kind: 'clearBall' }));
  }

  // state: { cells: [{x,y}], group }  一個懸空連通塊一次呼叫; group = 塊序號(0,1,2...)
  function drawFloatingMark(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    ctx.save();
    clipBoard(ctx);
    const cells = s.cells;
    ctx.fillStyle = 'rgba(79,224,255,0.10)';
    cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
    const has = contourPath(ctx, cells, 1.5);
    ctx.strokeStyle = PAL.gravity;
    ctx.lineWidth = 2;
    ctx.setLineDash((s.group || 0) % 2 ? [4, 3] : [9, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 連接桿: 同塊相鄰格之間畫短桿, 表達「整塊一起動」
    ctx.fillStyle = PAL.gravity;
    cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      if (has(c.x + 1, c.y)) ctx.fillRect(px + CELL - 4, py + CELL / 2 - 2, 8, 4);
      if (has(c.x, c.y + 1)) ctx.fillRect(px + CELL / 2 - 2, py - 4, 4, 8);
    });
    ctx.restore();
  }

  // state: { cells: [{x,y}], role: 'fall'|'falling'|'landed'|'stay', t }  重力事件期間的受影響連通塊
  function drawFloatingEventBlock(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const cells = s.cells;
    if (s.role === 'fall') {
      // 將下落(排隊中): 青色實線粗輪廓 + 每欄最低格下方向下 V
      ctx.fillStyle = 'rgba(79,224,255,0.18)';
      cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      const has = contourPath(ctx, cells, 1.5);
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      cells.forEach(function (c) {
        if (has(c.x, c.y - 1)) return;
        const mx = cx(c.x) + CELL / 2, my = cy(c.y) + CELL + 4 + 4 * t;
        ctx.beginPath();
        ctx.moveTo(mx - 6, my);
        ctx.lineTo(mx, my + 5);
        ctx.lineTo(mx + 6, my);
        ctx.stroke();
      });
    } else if (s.role === 'falling') {
      // 下落中: 整塊一條青色粗實線輪廓(剛體), 不畫 V; 格位本體由 drawCell(mark:'falling') 畫
      ctx.fillStyle = 'rgba(79,224,255,0.22)';
      cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      contourPath(ctx, cells, 1);
      ctx.strokeStyle = PAL.outline;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (s.role === 'landed') {
      // 已落定: 淡青細實線, 表示「這塊已經處理完」
      contourPath(ctx, cells, 1.5);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = PAL.gravity;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // 受影響但不懸空(不動): 灰色點線 + ⊥ 錨
      const has = contourPath(ctx, cells, 1.5);
      ctx.strokeStyle = PAL.gravityStay;
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2.5;
      cells.forEach(function (c) {
        if (has(c.x, c.y - 1)) return;
        const mx = cx(c.x) + CELL / 2, by = cy(c.y) + CELL - 3;
        ctx.beginPath();
        ctx.moveTo(mx, by - 7);
        ctx.lineTo(mx, by);
        ctx.moveTo(mx - 7, by);
        ctx.lineTo(mx + 7, by);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // state: { cells: [{x,y}], t }  落地回饋: 一塊落定時(落地停頓 0.12 秒)呼叫, cells = 落定後座標
  function drawLandingImpact(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const has = cellSet(s.cells);
    let minX = Infinity, maxX = -Infinity, lowY = Infinity;
    s.cells.forEach(function (c) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < lowY) lowY = c.y;
    });
    // 每個底面格: 底緣白 → 青的撞擊線, 往兩側擴
    ctx.lineCap = 'round';
    s.cells.forEach(function (c) {
      if (has(c.x, c.y - 1)) return;
      const px = cx(c.x), by = cy(c.y) + CELL - 1;
      const grow = 4 * t;
      ctx.globalAlpha = 1 - 0.7 * t;
      ctx.strokeStyle = t < 0.35 ? '#ffffff' : PAL.gravity;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 2 - grow, by);
      ctx.lineTo(px + CELL - 2 + grow, by);
      ctx.stroke();
    });
    // 最低處兩側的撞擊塵: 三道短斜線往外噴
    const by = cy(lowY) + CELL - 2;
    const lx = cx(minX), rx = cx(maxX) + CELL;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = PAL.gravity;
    ctx.lineWidth = 2;
    ctx.beginPath();
    [-0.5, -0.9, -1.3].forEach(function (a) {
      const r1 = 3 + 6 * t, r2 = r1 + 6;
      ctx.moveTo(lx - Math.cos(a) * r1, by + Math.sin(a) * r1);
      ctx.lineTo(lx - Math.cos(a) * r2, by + Math.sin(a) * r2);
      ctx.moveTo(rx + Math.cos(a) * r1, by + Math.sin(a) * r1);
      ctx.lineTo(rx + Math.cos(a) * r2, by + Math.sin(a) * r2);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // state: { x, y, size: 'small'|'large'|'zero', counted, t }  (x,y) = 觸發團錨點或重力球原位
  function drawGravityEvent(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const mx = cx(s.x) + CELL / 2, my = cy(s.y) + CELL / 2;
    if (s.size === 'zero') {
      // 空轉: 灰青虛線環往內收 + 橫槓, 與有效版本形狀相反
      ctx.strokeStyle = '#8fb8c4';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(mx, my, 28 - 14 * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - 11, my);
      ctx.lineTo(mx + 11, my);
      ctx.stroke();
      txt(ctx, '無下落', mx, my - 36, 13, '#cfe6ec', 'center', PAL.outline);
    } else {
      if (s.size === 'large') {
        ctx.globalAlpha = 1 - 0.7 * t;
        ctx.strokeStyle = PAL.gravity;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(mx, my, 12 + 44 * t, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx, my, 8 + 26 * t, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          const r1 = 16 + 30 * t, r2 = r1 + 10;
          ctx.moveTo(mx + Math.cos(a) * r1, my + Math.sin(a) * r1);
          ctx.lineTo(mx + Math.cos(a) * r2, my + Math.sin(a) * r2);
        }
        ctx.stroke();
      } else {
        ctx.globalAlpha = 1 - 0.7 * t;
        ctx.strokeStyle = PAL.gravity;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(mx, my, 8 + 22 * t, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 當前任務為「重力下落」且本事件算數: 標在觸發點上方
      if (s.counted) creditChip(ctx, 'gravity', null, '−1 次', mx, cy(s.y) - 22, t);
    }
    ctx.restore();
  }

  // state: { cells: [{x,y,isTarget}], deducted, targetColor, t }  追加消除: 青色雙框 + 「下落後消除」
  // 開地任務期間追加消除照常推進: isTarget 格加倒三角, deducted > 0 時多一個算數標籤; 不出現大團 / 用新形狀方塊的算數回饋
  function drawExtraClear(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    ctx.globalAlpha = 1 - 0.4 * t;
    ctx.strokeStyle = PAL.gravity;
    s.cells.forEach(function (c) {
      const px = cx(c.x), py = cy(c.y);
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 6, py + 6, CELL - 12, CELL - 12);
    });
    ctx.globalAlpha = 1;
    s.cells.forEach(function (c) { if (c.isTarget) targetCorner(ctx, c); });
    const sp = spanOf(s.cells);
    const b = boardRect();
    const lx = Math.max(b.x + 50, Math.min(b.x + b.w - 50, sp.midX));
    const ly = Math.max(b.y + 12, cy(Math.min(sp.top, LAY.rows)) - 12);
    rr(ctx, lx - 46, ly - 10, 92, 20, 6);
    ctx.fillStyle = 'rgba(10,12,20,0.82)';
    ctx.fill();
    txt(ctx, '↓ 下落後消除', lx, ly, 12, PAL.gravity, 'center');
    if (s.deducted > 0) creditChip(ctx, 'dig', s.targetColor, '−' + s.deducted, lx, ly - 14, t);
    ctx.restore();
  }

  // state: { task: 'dig'|'big'|'newShape'|null, cells: [{x,y,isTarget}], groups: [{cells:[{x,y}], counted}], deducted, targetColor, t }
  // 消除結算標記(事後回饋): 標出本次消除中哪些推進了當前任務; v15 不標示團內重力球數
  function drawClearResult(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    clipBoard(ctx);
    const task = s.task || 'dig';
    const deducted = s.deducted || 0;
    let credited = [];
    if (task === 'dig') {
      (s.cells || []).forEach(function (c) { if (c.isTarget) { targetCorner(ctx, c); credited.push(c); } });
    } else if (task === 'big' || task === 'newShape') {
      // 算數的團: 整團白色外擴輪廓(大團 = n≥5 的團; 用新形狀方塊 = 含本塊格位的各團)
      (s.groups || []).forEach(function (g) {
        if (!g.counted || !g.cells || !g.cells.length) return;
        contourPath(ctx, g.cells, -1);
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth = 5.5;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        credited = credited.concat(g.cells);
      });
    }
    if (deducted > 0 && credited.length) {
      const sp = spanOf(credited);
      const unit = task === 'dig' ? '' : ' ' + unitOf(task);
      creditChip(ctx, task, s.targetColor, '−' + deducted + unit, sp.midX, cy(Math.min(sp.top, LAY.rows)), t);
    }
    ctx.restore();
  }

  // ================= 操作中方塊 / 落點 / 預覽 =================
  // state: { cells: [{x,y,kind,color}], mode: 'falling'|'softDrop'|'lockDelay'|'locked', lockT }
  function drawPiece(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    ctx.save();
    clipBoard(ctx);
    s.cells.forEach(function (c) { paintBody(ctx, cx(c.x), cy(c.y), CELL, c.kind, c.color); });
    const lockT = clamp01(s.lockT);
    const has = contourPath(ctx, s.cells, 0.5);
    ctx.strokeStyle = PAL.player;
    if (s.mode === 'lockDelay') {
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 3]);
      ctx.globalAlpha = 0.6 + 0.4 * lockT;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.25 * lockT;
      ctx.fillStyle = '#ffffff';
      s.cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      ctx.globalAlpha = 1;
    } else {
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (s.mode === 'softDrop') {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      s.cells.forEach(function (c) {
        if (has(c.x, c.y + 1)) return;
        const px = cx(c.x), py = cy(c.y);
        ctx.moveTo(px + 8, py - 3); ctx.lineTo(px + 8, py - 14);
        ctx.moveTo(px + 18, py - 3); ctx.lineTo(px + 18, py - 14);
      });
      ctx.stroke();
    }
    if (s.mode === 'locked') {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#ffffff';
      s.cells.forEach(function (c) { ctx.fillRect(cx(c.x), cy(c.y), CELL, CELL); });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // state: { cells: [{x,y,kind,color}] }
  function drawGhost(ctx, s) {
    if (!s || !s.cells) return;
    ctx.save();
    clipBoard(ctx);
    s.cells.forEach(function (c) { paintGhost(ctx, cx(c.x), cy(c.y), CELL, c.kind, c.color); });
    ctx.restore();
  }

  // state: { cells: [{dx,dy,kind,color}], masked, newShapeMark }  dx/dy 為相對格, dy 向上為正; 3~5 格、最大 3×3
  // v15: 拿掉「含重力球」文字, 球格本身就是辨識(老闆第 5 輪回饋)
  function drawNextPreview(ctx, s) {
    s = s || {};
    ctx.save();
    const b = BOX.preview;
    panel(ctx, b, '下一塊');
    if (s.masked || !s.cells || !s.cells.length) {
      txt(ctx, '—', b.x + b.w / 2, b.y + b.h / 2 + 6, 24, PAL.textDim, 'center');
      ctx.restore();
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    s.cells.forEach(function (c) {
      minX = Math.min(minX, c.dx); maxX = Math.max(maxX, c.dx);
      minY = Math.min(minY, c.dy); maxY = Math.max(maxY, c.dy);
    });
    const w = (maxX - minX + 1) * CELL, h = (maxY - minY + 1) * CELL;
    const ox = b.x + (b.w - w) / 2, oy = b.y + 26 + (b.h - 34 - h) / 2 + h;
    s.cells.forEach(function (c) {
      paintBody(ctx, ox + (c.dx - minX) * CELL, oy - (c.dy - minY + 1) * CELL, CELL, c.kind, c.color);
    });
    if (s.newShapeMark) {
      // v20(規格 v19): 「用新形狀方塊」為當前任務且這塊是新外型時才給。
      // 與任務面板的新形狀小圖同一類標示 = 淺灰白(新外型展示色): 右上角小標籤 + 整塊外緣淺色描線; 不表示放哪裡會算數
      ctx.strokeStyle = PAL.silhouette;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      rr(ctx, ox - 5, oy - h - 5, w + 10, h + 10, 8);
      ctx.stroke();
      ctx.setLineDash([]);
      const label = NEW_PIECE_WORD;
      ctx.font = font(12);
      const lw = ctx.measureText(label).width + 30;
      const lx = b.x + b.w - 12 - lw, ly = b.y + 7;
      rr(ctx, lx, ly, lw, 20, 10);
      ctx.fillStyle = PAL.silhouette;
      ctx.fill();
      miniShape(ctx, 'V', lx + 7, ly + 4, 6, '#1a1d29');
      txt(ctx, label, lx + 24, ly + 10, 12, '#1a1d29', 'left');
    }
    ctx.restore();
  }

  // 新外型的小圖(v20): 任務面板「做什麼」旁、預覽記號共用。fill 給色則畫實心小方格(不用史萊姆質感, 小尺寸下只看輪廓)
  function miniShape(ctx, key, x, y, q, fill) {
    const sh = NEW_SHAPES[key];
    if (!sh) return;
    let maxY = 0;
    sh.cells.forEach(function (p) { if (p[1] > maxY) maxY = p[1]; });
    sh.cells.forEach(function (p) {
      rr(ctx, x + p[0] * q + 0.5, y + (maxY - p[1]) * q + 0.5, q - 1, q - 1, Math.max(1, q * 0.25));
      ctx.fillStyle = fill || PAL.silhouette;
      ctx.fill();
    });
  }

  // ================= 側欄常駐資訊 =================
  // 任務面板第二欄(獎勵 / 解鎖)的內容整理: 面板本體與說明頁的「另一種標籤」小框共用(P3)
  // reward: 'expand' | 'newPiece' | 'clearBall' | 'shave' | 'clear'
  function rewardInfo(s, kind) {
    let reward = s.reward || (kind === 'dig' ? 'expand' : 'newPiece');
    if (reward === 'none') reward = s.shave ? 'shave' : 'clear'; // 舊值相容: v22 沒有「沒有獎勵」的任務
    const shave = !!(reward !== 'shave' && (s.shave || (reward === 'expand' && s.fullWidthBonus)));
    const extraBall = !!(s.clearBall && reward !== 'clearBall');
    const label = reward === 'newPiece' ? '解鎖' : '獎勵';
    let main;
    if (reward === 'expand') main = [['向' + (s.side === 'left' ? '左' : '右') + '長一欄', PAL.expand]];
    else if (reward === 'newPiece') main = [[NEW_PIECE_WORD, PAL.expand]];
    else if (reward === 'clearBall') main = [[CLEAR_BALL_WORD, PAL.wipe]];
    else if (reward === 'shave') main = [['削頂', PAL.shave]];
    else main = [['通關', PAL.starPlat]];
    // 多個回報依過場第 1 段的演出順序: 長一欄 → 新形狀方塊 → 削頂; 清色球不在第 1 段演出, 寫在最後
    const tail = [];
    if (shave) tail.push(['+ 削頂', PAL.shave]);
    if (extraBall) tail.push([(tail.length ? ' ' : '') + '+ ' + CLEAR_BALL_WORD, PAL.wipe]);
    return { reward: reward, label: label, main: main, tail: tail };
  }
  // 第二欄一段(標籤 + 圖示 + 文字)。(x, y) = 該段左上(標籤列中心 y + 0), w = 可用寬
  function paintRewardRow(ctx, x, y, w, info, side) {
    txt(ctx, info.label, x + 14, y, 12, PAL.textDim, 'left');
    rewardIcon(ctx, info.reward, side, x + 16, y + 14, 24);
    const rx = x + 50, rw = w - 64;
    if (info.tail.length) {
      parts(ctx, info.main, rx, y + 18, 16, rw);
      parts(ctx, info.tail, rx, y + 40, 15, rw);
    } else {
      parts(ctx, info.main, rx, y + 26, 16, rw);
    }
  }

  // state: { kind: 'dig'|'big'|'newShape'|'gravity', color, remaining, required,
  //          reward: 'expand'|'newPiece'|'clearBall'|'shave'|'clear', shave, clearBall, side: 'left'|'right',
  //          newShapes: ['V','U','X'] (kind 為 'newShape' 時: 目前已解鎖的新外型), reveal (0~1, 過場第 3 段), credit }
  // v22: 標籤改「目標 / 獎勵(或解鎖) / 剩餘」; 第 5、6、7 個任務(reward:'newPiece')標籤自動寫「解鎖」;
  //      剩餘 ≤ 0 寫「已達成」; 沒有「新任務」標籤與橫幅 — 下一個任務只靠面板本身的變化(reveal)揭示
  // v25: 三欄各自一張底卡(老闆第 9 輪: 面板要一眼看得出有 3 塊)。說明頁共用同一組卡位
  const TASK_CARDS = [
    { top: 28, h: 68 }, // 目標
    { top: 100, h: 62 }, // 獎勵 / 解鎖
    { top: 166, h: 64 }, // 剩餘
  ];
  function taskCardRect(i) {
    const b = BOX.task, c = TASK_CARDS[i];
    return { x: b.x + 8, y: b.y + c.top, w: b.w - 16, h: c.h };
  }
  function drawTaskProgress(ctx, s) { paintTaskPanel(ctx, s, null); }
  // opt.rewardLabels: 說明頁用 — 第二欄只放「獎勵」「解鎖」兩種標籤, 不填回報(guide v24/v25)
  function paintTaskPanel(ctx, s, opt) {
    s = s || {};
    opt = opt || {};
    ctx.save();
    const b = BOX.task;
    const kind = TASK[s.kind] ? s.kind : 'dig';
    const rv = s.reveal != null ? clamp01(s.reveal) : null;
    // 揭示(過場第 3 段, 1.6 秒): 0~0.1 三欄清空 → 目標(0.1)→ 獎勵 / 解鎖(0.32)→ 剩餘(0.54)依序滑入,
    // 每欄滑入時底下亮一條綠色底帶, 之後慢慢退掉; 面板框在揭示期間是綠色(綠 = 開欄 / 獎勵 / 新任務)
    const SEC = [0.1, 0.32, 0.54];
    function secAlpha(i) { return rv == null ? 1 : clamp01((rv - SEC[i]) / 0.14); }
    panel(ctx, b, '任務', rv != null && rv < 1 ? PAL.expand : null);
    // 三張底卡: 揭示中內容清空時卡片照畫, 看得出「三個空位依序填上」
    for (let i = 0; i < 3; i++) {
      const r = taskCardRect(i);
      rr(ctx, r.x, r.y, r.w, r.h, 6);
      ctx.fillStyle = PAL.panelCell;
      ctx.fill();
      ctx.strokeStyle = PAL.panelCellEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    function section(i, top, h, fn) {
      const a = secAlpha(i);
      if (a <= 0) return;
      if (rv != null) {
        const glow = clamp01(1 - (rv - SEC[i]) / 0.5);
        if (glow > 0) {
          const r = taskCardRect(i);
          rr(ctx, r.x, r.y, r.w, r.h, 6);
          ctx.fillStyle = 'rgba(95,227,154,' + (0.2 * glow) + ')';
          ctx.fill();
        }
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(14 * (1 - a), 0);
      fn();
      ctx.restore();
    }
    // --- 目標 ---
    txt(ctx, '目標', b.x + 14, b.y + 40, 12, PAL.textDim, 'left');
    section(0, 30, 64, function () {
      if (kind === 'newShape' && s.newShapes && s.newShapes.length) {
        // 已解鎖新外型的小圖, 只在本任務期間畫; 未解鎖的不畫(不預先揭曉); 出現 / 移除跟著過場第 3 段(v22)
        const q = 6;
        let x = b.x + b.w - 14;
        const list = s.newShapes.filter(function (k) { return NEW_SHAPES[k]; }).slice(0, 3);
        for (let i = list.length - 1; i >= 0; i--) {
          const bx = shapeBox(list[i]);
          x -= bx.w * q;
          miniShape(ctx, list[i], x, b.y + 40 - bx.h * q / 2, q);
          x -= 8;
        }
        txt(ctx, NEW_PIECE_WORD + ':', x, b.y + 40, 11, PAL.silhouette, 'right');
      }
      taskIcon(ctx, kind, s.color, b.x + 14, b.y + 52, 36);
      const tx = b.x + 60, tw = b.w - 74;
      if (kind === 'dig') {
        parts(ctx, whatParts(kind, s.color), tx, b.y + 70, 20, tw);
      } else {
        ctx.font = font(16);
        const lines = wrapPhrase(ctx, TASK[kind].what, tw);
        const y0 = lines.length > 1 ? b.y + 60 : b.y + 70;
        lines.slice(0, 2).forEach(function (ln, i) { txt(ctx, ln, tx, y0 + i * 21, 16, PAL.text, 'left'); });
      }
    });
    // --- 獎勵 / 解鎖 ---(標籤隨內容一起揭示: 標籤本身也會變)
    const info = rewardInfo(s, kind);
    section(1, 100, 62, function () {
      if (opt.rewardLabels) {
        // 說明頁: 同一塊的兩種標籤並列, 下方留空(不寫延展側、不寫獎勵名稱、不畫新外型)
        // 標籤本身就是這一塊要教的內容, 字放大到 16px 主文字色(位置與遊戲內標籤相同)
        ctx.font = font(16);
        const w1 = ctx.measureText('獎勵').width;
        txt(ctx, '獎勵', b.x + 14, b.y + 114, 16, PAL.text, 'left');
        txt(ctx, '或', b.x + 24 + w1, b.y + 114, 13, PAL.textDim, 'left');
        txt(ctx, '解鎖', b.x + 44 + w1, b.y + 114, 16, PAL.text, 'left');
      } else {
        paintRewardRow(ctx, b.x, b.y + 110, b.w, info, s.side);
      }
    });
    // --- 剩餘 ---
    txt(ctx, '剩餘', b.x + 14, b.y + 178, 12, PAL.textDim, 'left');
    const req = Math.max(1, s.required || 1);
    const rem = s.remaining != null ? s.remaining : req;
    const done = rem <= 0;
    section(2, 168, 62, function () {
      if (done) {
        txt(ctx, '已達成', b.x + 14, b.y + 210, 22, PAL.expand, 'left');
      } else {
        ctx.font = font(36);
        const nw = ctx.measureText(String(rem)).width;
        txt(ctx, String(rem), b.x + 14, b.y + 208, 36, PAL.text, 'left');
        txt(ctx, unitOf(kind), b.x + 20 + nw, b.y + 214, 15, PAL.textDim, 'left');
      }
      // 進度條: 圖形給趨勢(v22 拿掉「已完成 / 需求」數字, 數字只留剩餘一個)
      const got = Math.min(req, req - Math.max(0, rem));
      const bx = b.x + 166, by = b.y + 205, bw = b.w - 166 - 16, bh = 10;
      rr(ctx, bx, by, bw, bh, 5);
      ctx.fillStyle = '#10131b';
      ctx.fill();
      if (got > 0) {
        rr(ctx, bx, by, Math.max(bh, bw * got / req), bh, 5);
        const c = kind === 'dig' ? SLIME[s.color] : null;
        ctx.fillStyle = done ? PAL.expand : (c ? c.fill : PAL.text);
        ctx.fill();
      }
      rr(ctx, bx, by, bw, bh, 5);
      ctx.strokeStyle = PAL.panelEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    const cr = clamp01(s.credit);
    if (cr > 0) {
      // 這次算數了: 數字區閃白框
      rr(ctx, b.x + 6, b.y + 188, 150, 42, 8);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * cr) + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  // state: { side: 'left'|'right'|null, col }  col = 下一次會開的絕對欄
  function drawNextExpandSide(ctx, s) {
    if (!s || !s.side || s.col == null) return;
    ctx.save();
    const b = boardRect();
    const x = cx(s.col);
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 2, b.y + 2, CELL - 4, b.h - 4);
    ctx.setLineDash([]);
    const ay = b.y + b.h + 16;
    const mid = x + CELL / 2;
    if (s.side === 'left') {
      arrow(ctx, mid + 10, ay, mid - 10, ay, PAL.expand, 3);
      txt(ctx, '下次開這側', mid + 16, ay, 12, PAL.expand, 'left');
    } else {
      arrow(ctx, mid - 10, ay, mid + 10, ay, PAL.expand, 3);
      txt(ctx, '下次開這側', mid - 16, ay, 12, PAL.expand, 'right');
    }
    ctx.restore();
  }

  // state: { progress: 0~1 }  長按 R 期間
  function drawAbandonTimer(ctx, s) {
    if (!s) return;
    const p = clamp01(s.progress);
    ctx.save();
    const b = BOX.abandon;
    panel(ctx, b, null, PAL.danger);
    txt(ctx, '放棄本局: 按住 R 不放', b.x + 14, b.y + 17, 14, PAL.text, 'left');
    txt(ctx, (1 - p).toFixed(1) + ' 秒', b.x + b.w - 14, b.y + 17, 14, PAL.danger, 'right');
    const bx = b.x + 14, by = b.y + 34, bw = b.w - 28, bh = 10;
    rr(ctx, bx, by, bw, bh, 5);
    ctx.fillStyle = '#10131b';
    ctx.fill();
    if (p > 0) {
      rr(ctx, bx, by, Math.max(bh, bw * p), bh, 5);
      ctx.fillStyle = PAL.danger;
      ctx.fill();
    }
    ctx.restore();
  }

  // state: { stars (0~10), starGain (0~1, 過場第 2 段的進度; 平時省略), best (0~10, null = 尚無紀錄), time (秒) }
  // v22: 分數 / 倍率 → 星數顯示(5 星位, 局中不附數字); 最佳紀錄改星數(小 5 星位, 同一個畫家)
  function drawHud(ctx, s) {
    s = s || {};
    ctx.save();
    let b = BOX.stars;
    const gaining = s.starGain != null;
    const g = gaining ? clamp01(s.starGain) : 0;
    const hot = gaining && g > 0.15 && g < 0.95;
    panel(ctx, b, '星數', hot ? PAL.starGold : null);
    paintStarRow(ctx, b.x + b.w / 2, b.y + 78, 22, 54, s.stars || 0, gaining ? g : null, (s.stars || 0) >= 10);

    b = BOX.best;
    panel(ctx, b);
    txt(ctx, '最佳紀錄', b.x + 14, b.y + b.h / 2, 13, PAL.textDim, 'left');
    if (s.best == null) txt(ctx, '尚無紀錄', b.x + b.w - 16, b.y + b.h / 2, 16, PAL.textDim, 'right');
    else paintStarRow(ctx, b.x + b.w - 16 - 2 * 24 - 10, b.y + b.h / 2, 9, 24, s.best, null, false);

    b = BOX.time;
    panel(ctx, b);
    txt(ctx, '時間', b.x + 14, b.y + b.h / 2, 13, PAL.textDim, 'left');
    txt(ctx, fmtTime(s.time), b.x + b.w - 16, b.y + b.h / 2, 20, PAL.text, 'right');

    txt(ctx, 'Esc 暫停　H 說明　長按 R 放棄', BOX.time.x + BOX.time.w, 600, 12, PAL.textDim, 'right');
    ctx.restore();
  }

  // ================= 任務過場(v22) =================
  // 四段依序、不疊合; 每段只給一件事(老闆第 8 輪: v20 三塊資訊同時冒出, 什麼都沒看到)
  //   第 1 段 獎勵: drawExpandEvent(1.0 秒)→ drawUnlockEvent(1.2 秒)→ drawShaveEvent(0.8 秒), 依序、一項演完才演下一項
  //   第 2 段 星數 +1: drawStarGain(1.0 秒; 第 10 星 2.0 秒), 同時 drawHud 帶 starGain = 同一個 t
  //   第 3 段 任務揭示: drawTaskProgress 帶 reveal(1.6 秒); 不另畫橫幅
  //   第 4 段 落速提升: drawSpeedUp(1.0 秒)
  //   段間停頓 0.2 秒: 不呼叫任何過場函式
  // 橫幅只在第 1 段用, 用字與任務面板第二欄完全相同(「獎勵: 向左長一欄」「解鎖: 新形狀方塊」「獎勵: 削頂」)
  function eventBanner(ctx, accent, icon, title, sub) {
    const b = BOX.banner;
    rr(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fillStyle = 'rgba(14,17,26,0.96)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (icon) icon(b.x + 12, b.y + 13);
    const tx = icon ? b.x + 50 : b.x + 14;
    // title / sub 可為字串或多色 parts([[文字, 顏色], ...]); 沒有 sub 時標題置中
    if (Array.isArray(title)) parts(ctx, title, tx, sub ? b.y + 19 : b.y + b.h / 2, 18, b.x + b.w - 12 - tx);
    else txt(ctx, title, tx, sub ? b.y + 19 : b.y + b.h / 2, 18, accent, 'left');
    if (Array.isArray(sub)) parts(ctx, sub, tx, b.y + 40, 13, b.x + b.w - 12 - tx);
    else if (sub) txt(ctx, sub, tx, b.y + 40, 13, PAL.text, 'left');
  }
  // 過場各段的規格時長(秒, spec 企劃初始值; 判定與計時由 RD 依 spec, 這裡只供換算 t)
  const PHASE = { expand: 1.0, newShape: 1.2, shave: 0.8, star: 1.0, starFinal: 2.0, reveal: 1.6, speed: 1.0, gap: 0.2 };

  function colFlash(ctx, col, side, t) {
    ctx.save();
    clipBoard(ctx);
    const b = boardRect();
    const x = cx(col);
    ctx.globalAlpha = 0.12 + 0.4 * (1 - clamp01(t));
    ctx.fillStyle = PAL.expand;
    ctx.fillRect(x, b.y, CELL, b.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 1.5, b.y + 1.5, CELL - 3, b.h - 3);
    const my = b.y + b.h / 2;
    if (side === 'left') arrow(ctx, x + CELL - 4, my, x + 4, my, PAL.expand, 3);
    else arrow(ctx, x + 4, my, x + CELL - 4, my, PAL.expand, 3);
    ctx.restore();
  }

  // state: { side: 'left'|'right', col, t (0~1, 1.0 秒) }  過場第 1 段: 延展
  // v22: 只演延展本身; 第 4 次的削頂改為接在後面的獨立一項(drawShaveEvent), 不再有尾端公告
  function drawExpandEvent(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    if (s.col != null) colFlash(ctx, s.col, s.side, t);
    eventBanner(ctx, PAL.expand, function (x, y) { rewardIcon(ctx, 'expand', s.side, x, y + 1, 26); },
      [['獎勵: ', PAL.textDim], ['向' + (s.side === 'left' ? '左' : '右') + '長一欄', PAL.expand]], null);
    ctx.restore();
  }

  // state: { cells: [{x,y}], t }  cells = 本次被削的格(每欄至多 1 格); t = 削線掃過的進度 0~1
  // 沿盤面輪廓畫一條紫色削線, 由左往右掃過: 讓玩家看出「削的是最上面那一層皮」; 不顯示格數
  function drawShaveIndicator(ctx, s) {
    if (!s || !s.cells || !s.cells.length) return;
    const t = s.t == null ? 1 : clamp01(s.t);
    const list = s.cells.slice().sort(function (a, b) { return a.x - b.x; });
    ctx.save();
    clipBoard(ctx);
    const b = boardRect();
    const n = list.length;
    const reveal = t * n; // 已掃過的格數(可帶小數)
    function path() {
      ctx.beginPath();
      let prev = null, headX = null, headY = null;
      for (let i = 0; i < n; i++) {
        const c = list[i];
        if (i >= reveal) break;
        const frac = Math.min(1, reveal - i);
        const x0 = cx(c.x), y0 = Math.max(b.y + 2, cy(c.y));
        const x1 = x0 + CELL * frac;
        if (prev && prev.x === c.x - 1) ctx.lineTo(x0, y0); // 相鄰欄: 沿輪廓接上(台階)
        else ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        prev = c;
        headX = x1; headY = y0;
      }
      return { x: headX, y: headY };
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    path();
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 6;
    ctx.stroke();
    const head = path();
    ctx.strokeStyle = PAL.shave;
    ctx.lineWidth = 3;
    ctx.stroke();
    if (head.x != null && t < 1) {
      // 削線前端的刀光
      ctx.beginPath();
      ctx.arc(head.x, head.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }

  // state: { cells: [{x,y}], t (0~1, 0.8 秒) }  過場第 1 段: 削頂(第 4、6、8 個任務; 排在延展或新形狀方塊展示之後)
  // v22 新增: 紫框橫幅「獎勵: 削頂」+ 削線(內部呼叫 drawShaveIndicator)。前 0.15 只有橫幅, 削線 0.15~0.85 掃過
  // cells 為空(盤面沒有已填格)時照樣演出橫幅, 只是沒有削線。被削格請 RD 用 drawCell(mark:'shaving', t 同削線進度)
  function drawShaveEvent(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    ctx.save();
    eventBanner(ctx, PAL.shave, function (x, y) { rewardIcon(ctx, 'shave', null, x, y, 26); },
      [['獎勵: ', PAL.textDim], ['削頂', PAL.shave]], null);
    if (s.cells && s.cells.length) drawShaveIndicator(ctx, { cells: s.cells, t: clamp01((t - 0.15) / 0.7) });
    ctx.restore();
  }
  // 削頂時被削格的 t(給 drawCell(mark:'shaving') 用)
  function shaveCellT(t) { return clamp01((clamp01(t) - 0.15) / 0.7); }

  function paintShape(ctx, key, x, y, size) {
    // (x, y) = 形狀外框左上角; by 向上
    const sh = NEW_SHAPES[key];
    if (!sh) return;
    let maxY = 0;
    sh.cells.forEach(function (p) { if (p[1] > maxY) maxY = p[1]; });
    sh.cells.forEach(function (p) { paintSilhouette(ctx, x + p[0] * size, y + (maxY - p[1]) * size, size); });
  }
  function shapeBox(key) {
    const sh = NEW_SHAPES[key];
    let w = 0, h = 0;
    sh.cells.forEach(function (p) { w = Math.max(w, p[0] + 1); h = Math.max(h, p[1] + 1); });
    return { w: w, h: h };
  }

  // state: { shape: 'V'|'U'|'X', t (0~1, 1.2 秒) }  過場第 1 段: 新形狀方塊展示(第 5、6、7 個任務)
  // v22: 只展示形狀本身; 不寫操作說明、不寫外型名; 清色球與削頂都不在這裡(清色球不演出, 削頂是下一項 drawShaveEvent)
  function drawUnlockEvent(ctx, s) {
    if (!s || !NEW_SHAPES[s.shape]) return;
    const t = clamp01(s.t);
    ctx.save();
    eventBanner(ctx, PAL.expand, function (x, y) {
      const bx = shapeBox(s.shape);
      const q = 9;
      paintShape(ctx, s.shape, x + (28 - bx.w * q) / 2, y + (28 - bx.h * q) / 2, q);
    }, [['解鎖: ', PAL.textDim], [NEW_PIECE_WORD, PAL.expand]], null);
    // 盤面中央卡片: 用與盤面同尺寸的格子展示形狀, 讓玩家第一次拿到前就認得; 末段淡出
    const b = boardRect();
    const mx = b.x + b.w / 2, my = b.y + b.h * 0.42;
    const k = t < 0.1 ? 0.7 + 0.3 * (t / 0.1) : 1;
    ctx.globalAlpha = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
    ctx.translate(mx, my);
    ctx.scale(k, k);
    rr(ctx, -90, -74, 180, 148, 14);
    ctx.fillStyle = 'rgba(14,17,26,0.94)';
    ctx.fill();
    ctx.strokeStyle = PAL.expand;
    ctx.lineWidth = 3;
    ctx.stroke();
    txt(ctx, NEW_PIECE_WORD, 0, -54, 15, PAL.expand, 'center');
    const bx = shapeBox(s.shape);
    paintShape(ctx, s.shape, -bx.w * CELL / 2, 8 - bx.h * CELL / 2, CELL);
    ctx.restore();
  }

  // 盤面中央的過場卡片底(升星 / 落速共用的外框; accent = 該段的語意色)
  function transitionCard(ctx, w, h, accent, lt) {
    const b = boardRect();
    const mx = b.x + b.w / 2, my = b.y + b.h * 0.42;
    const k = lt < 0.1 ? 0.75 + 0.25 * (lt / 0.1) : 1;
    ctx.translate(mx, my);
    ctx.scale(k, k);
    rr(ctx, -w / 2, -h / 2, w, h, 14);
    ctx.fillStyle = 'rgba(14,17,26,0.95)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // state: { stars (升起後的星數 1~10), t (0~1; 1.0 秒, 第 10 星 2.0 秒) }  過場第 2 段: 星數 +1(v22 新增)
  // 盤面中央卡片放大演出「多了一顆、現在是幾顆」: 變化的那一格(空 → 金 / 金 → 白金)鼓起 + 光環; 第 10 星多一道白光掃過 5 顆白金
  // 同一段內 drawHud 帶 starGain = 同一個 t, HUD 的星位同步變化(卡片末段淡出, 視線回到常駐的那一排)
  function drawStarGain(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    const n = Math.max(1, Math.min(10, s.stars || 1));
    const final = n >= 10;
    ctx.save();
    ctx.globalAlpha = t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1;
    transitionCard(ctx, 250, 118, final ? PAL.starPlat : PAL.starGold, t);
    txt(ctx, STAR_WORD, 0, -36, 17, final ? PAL.starPlat : PAL.starGold, 'center');
    paintStarRow(ctx, 0, 14, 19, 44, n, t, final);
    ctx.restore();
  }

  // state: { t (0~1, 1.0 秒) }  過場第 4 段: 落速提升(v22 新增)
  // 只表達「接下來掉得比剛才快」, 不顯示速度數字: 盤面上一陣由慢變快往下刷的速度線 + 中央卡片三個向下箭頭由上往下依序亮, 越跑越快
  // 橘 = 危險 / 壓力上升(與頂線、放棄、結束畫面同一色族)
  function drawSpeedUp(ctx, s) {
    const t = clamp01(s && s.t);
    ctx.save();
    const b = boardRect();
    // 速度線: 在盤面內往下刷, 速度隨 t 加快, 長度隨 t 拉長
    ctx.save();
    clipBoard(ctx);
    ctx.globalAlpha = t < 0.85 ? 0.55 : 0.55 * (1 - (t - 0.85) / 0.15);
    ctx.strokeStyle = 'rgba(255,138,61,0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const travel = (t * 1.2 + t * t * 3.2) * b.h; // 加速
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const x = b.x + 9 + ((i * 53) % (b.w - 18));
      const len = 18 + 60 * t;
      const y = b.y + (((i * 137) + travel) % (b.h + len)) - len;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
    }
    ctx.stroke();
    ctx.restore();
    // 中央卡片
    ctx.globalAlpha = t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1;
    transitionCard(ctx, 200, 124, PAL.danger, t);
    txt(ctx, '落下變快', 0, -40, 17, PAL.danger, 'center');
    // 三個向下箭頭依序亮起, 週期越來越短(= 變快)
    const phase = t * 2 + t * t * 4;
    for (let i = 0; i < 3; i++) {
      const y = -12 + i * 16;
      const lit = Math.max(0, 1 - Math.abs(((phase * 3) % 3) - i));
      ctx.strokeStyle = lit > 0.2 ? PAL.danger : '#5a4030';
      ctx.globalAlpha = (t > 0.86 ? 1 - (t - 0.86) / 0.14 : 1) * (0.45 + 0.55 * lit);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.lineTo(0, y + 12);
      ctx.lineTo(20, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function clearBallIcon(ctx) { return function (x, y) { paintClearBall(ctx, x, y, 28); }; }

  // ---------- 全盤清除(v20, 結算 4d, 1.0 秒; v22 拿掉 +500) ----------
  // 分段(t = 本段進度 0~1):
  //   0~0.1   同色全亮: 全盤所有要被清的格同時閃白框 + 盤面整片染上該色一閃(先說清楚「是這個顏色」)
  //   0.04~0.55 洋紅衝擊波從清色球原位往外擴, 掃過哪一格哪一格就爆開(每格 0.3 的爆開動畫, 見 paintWipeCell)
  //   0.32~1  盤面中上方彈出被清顏色的放大史萊姆(v22 拿掉 +500), 末段淡出; 被清的位置留洋紅殘影框
  // 盤面震動是選用的: Art.wipeShake(t) 回傳 {dx, dy}, RD 只套在盤面層(背景以上、側欄以下), 側欄與常駐面板不震(P11)
  function wipeShake(t) {
    t = clamp01(t);
    if (t >= 0.25) return { dx: 0, dy: 0 };
    const a = 5 * (1 - t / 0.25);
    return { dx: a * Math.sin(t * 95), dy: a * Math.cos(t * 71) * 0.7 };
  }
  // state: { colors: ['A'|'B'|'C', ...](本次清除色, 同色一次), cells: [{x,y,color}](本次被清的全部格, 含 y>19 亦可),
  //          origins: [{x,y}](觸發的清色球消除前的位置; 可省略, 省略時從被清格的重心起跑), t }
  // 本段期間這些格由本函式畫(本體 + 爆開), RD 不要再用 drawCell 畫它們; 其餘格照常 drawCell
  function drawBoardWipe(ctx, s) {
    if (!s) return;
    const t = clamp01(s.t);
    const list = s.cells || [];
    const colors = (s.colors && s.colors.length ? s.colors : uniqColors(list)).filter(function (c) { return SLIME[c]; });
    ctx.save();
    const b = boardRect();
    // 起點(像素)
    let origins = (s.origins || []).map(function (o) { return { x: cx(o.x) + CELL / 2, y: cy(Math.min(o.y, LAY.rows)) + CELL / 2 }; });
    if (!origins.length) {
      let sx = 0, sy = 0, n = 0;
      list.forEach(function (c) { if (c.y <= LAY.rows) { sx += cx(c.x) + CELL / 2; sy += cy(c.y) + CELL / 2; n++; } });
      origins = [n ? { x: sx / n, y: sy / n } : { x: b.x + b.w / 2, y: b.y + b.h / 2 }];
    }
    function nearest(px, py) {
      let d = Infinity;
      origins.forEach(function (o) { d = Math.min(d, Math.hypot(px - o.x, py - o.y)); });
      return d;
    }
    let maxD = 1;
    list.forEach(function (c) { maxD = Math.max(maxD, nearest(cx(c.x) + CELL / 2, cy(c.y) + CELL / 2)); });
    const W0 = 0.04, WSPAN = 0.45, POP = 0.3;

    ctx.save();
    clipBoard(ctx);
    // 1. 盤面整片染色一閃
    if (t < 0.16) {
      const f = 1 - t / 0.16;
      ctx.globalAlpha = 0.16 * f;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      colors.forEach(function (c) {
        ctx.globalAlpha = 0.1 * f / colors.length;
        ctx.fillStyle = SLIME[c].fill;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      });
      ctx.globalAlpha = 1;
    }
    // 2. 衝擊波(洋紅粗環 + 該色內環)與起點放射線
    const wp = clamp01((t - W0) / (WSPAN + 0.08));
    if (wp > 0 && wp < 1) {
      const e = 1 - Math.pow(1 - wp, 2);
      const r = 8 + (maxD + 30) * e;
      origins.forEach(function (o) {
        ctx.globalAlpha = 1 - wp * wp;
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth = 11 - 6 * wp;
        ctx.stroke();
        ctx.strokeStyle = PAL.wipe;
        ctx.lineWidth = 7 - 4 * wp;
        ctx.stroke();
        colors.forEach(function (c, i) {
          ctx.beginPath();
          ctx.arc(o.x, o.y, Math.max(1, r - 8 - i * 5), 0, Math.PI * 2);
          ctx.strokeStyle = SLIME[c].rim;
          ctx.lineWidth = 3;
          ctx.stroke();
        });
      });
      ctx.globalAlpha = 1;
    }
    if (t < 0.3) {
      const rp = t / 0.3;
      ctx.globalAlpha = 1 - rp;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      origins.forEach(function (o) {
        ctx.beginPath();
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6 + 0.26;
          const r1 = 10 + 50 * rp, r2 = r1 + (k % 2 ? 12 : 22);
          ctx.moveTo(o.x + Math.cos(a) * r1, o.y + Math.sin(a) * r1);
          ctx.lineTo(o.x + Math.cos(a) * r2, o.y + Math.sin(a) * r2);
        }
        ctx.stroke();
        sparklePath(ctx, o.x, o.y, 18 + 30 * rp, 5 + 6 * rp);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    // 3. 被清的格: 波到之前 = 本體 + 同色全亮的白框(脈動); 波到之後 = 爆開
    list.forEach(function (c) {
      if (c.y > LAY.rows + 1) return;
      const px = cx(c.x), py = cy(c.y);
      const start = W0 + WSPAN * (nearest(px + CELL / 2, py + CELL / 2) / maxD);
      const lt = (t - start) / POP;
      if (lt <= 0) {
        paintBody(ctx, px, py, CELL, 'color', c.color);
        ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 60);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3);
        ctx.globalAlpha = 1;
      } else {
        paintWipeCell(ctx, px, py, 'color', c.color, lt, 0.6 * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2));
      }
    });
    ctx.restore();

    // 4. v22: 分數已刪, +500 拿掉; 盤面中上方改彈出「被清的那個顏色」的放大史萊姆(多色並排), 不寫任何數字
    if (t >= 0.32 && colors.length) {
      const pt = (t - 0.32) / 0.12;
      const k = pt < 1 ? 0.4 + 0.9 * pt : 1.3 - 0.3 * clamp01((t - 0.44) / 0.1);
      const alpha = t > 0.88 ? 1 - (t - 0.88) / 0.12 * 0.7 : 1;
      const mx = b.x + b.w / 2, my = b.y + b.h * 0.34;
      const colW = 64;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(mx, my);
      ctx.scale(k, k);
      const left = -(colors.length - 1) * colW / 2;
      colors.forEach(function (c, i) {
        const x = left + i * colW;
        const g = ctx.createRadialGradient(x, 0, 6, x, 0, 50);
        g.addColorStop(0, "rgba(255,95,208,0.45)");
        g.addColorStop(1, "rgba(255,95,208,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 50, -50, 100, 100);
        paintSlime(ctx, x - 22, -22, 44, c);
        rr(ctx, x - 24, -24, 48, 48, 14);
        ctx.strokeStyle = PAL.wipe;
        ctx.lineWidth = 3;
        ctx.stroke();
      });
      ctx.restore();
    }
    // 5. 橫幅: 「[紅色] 全盤一起消失」(玩家語言; 不寫「全盤清除」這個內部名詞、不寫格數)
    const title = [];
    colors.forEach(function (c, i) {
      if (i) title.push(['、', PAL.text]);
      title.push([SLIME[c].name + '色', SLIME[c].text]);
    });
    title.push([' 全盤一起消失', PAL.wipe]);
    eventBanner(ctx, PAL.wipe, clearBallIcon(ctx), title, [[CLEAR_BALL_WORD + '生效', PAL.text]]);
    ctx.restore();
  }
  function uniqColors(list) {
    const seen = {};
    const out = [];
    list.forEach(function (c) { if (c.color && !seen[c.color]) { seen[c.color] = 1; out.push(c.color); } });
    return out;
  }

  // ================= 全畫面介面 =================
  function drawPauseMask(ctx) {
    ctx.save();
    ctx.fillStyle = '#0d0f15';
    ctx.fillRect(0, 0, W, H);
    txt(ctx, '暫停', W / 2, 250, 48, PAL.text, 'center');
    txt(ctx, 'Esc 繼續', W / 2, 320, 20, PAL.text, 'center');
    txt(ctx, 'H 看說明', W / 2, 354, 20, PAL.text, 'center');
    txt(ctx, '長按 R 1 秒 放棄這局', W / 2, 388, 20, PAL.danger, 'center');
    ctx.restore();
  }

  // v22: lock out 與 block out 對玩家都寫「放不下」
  const REASON = { blockout: '放不下', lockout: '放不下', abandon: '放棄' };
  function recordBadge(ctx, x, y) {
    rr(ctx, x, y - 11, 76, 22, 11);
    ctx.fillStyle = PAL.expand;
    ctx.fill();
    txt(ctx, '新紀錄!', x + 38, y, 13, '#0d1a12', 'center');
  }
  const GO_W = 380, GO_H = 360;
  function gameOverPanel(ctx, x, y, s) {
    const w = GO_W, h = GO_H;
    rr(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(20,23,34,0.97)';
    ctx.fill();
    ctx.strokeStyle = PAL.danger;
    ctx.lineWidth = 2;
    ctx.stroke();
    txt(ctx, '本局結束', x + w / 2, y + 34, 28, PAL.text, 'center');
    txt(ctx, REASON[s.reason] || '', x + w / 2, y + 64, 15, PAL.danger, 'center');
    // 本局星數: 同一套 5 星位 + 「N 星」(結算時一眼確定, 不必數顏色)
    const n = Math.max(0, Math.min(10, s.stars || 0));
    paintStarRow(ctx, x + w / 2, y + 110, 20, 50, n, null, false);
    ctx.font = font(30);
    const nt = n + ' 星';
    const nw = ctx.measureText(nt).width;
    txt(ctx, nt, x + w / 2, y + 160, 30, '#ffffff', 'center');
    if (s.newRecord) recordBadge(ctx, x + w / 2 + nw / 2 + 12, y + 160);
    // 最佳紀錄
    txt(ctx, '最佳紀錄', x + 30, y + 202, 14, PAL.textDim, 'left');
    if (s.best == null) {
      txt(ctx, '尚無紀錄', x + w - 30, y + 202, 15, PAL.textDim, 'right');
    } else {
      const bt = s.best + ' 星';
      txt(ctx, bt, x + w - 30, y + 202, 16, PAL.text, 'right');
      ctx.font = font(16);
      paintStarRow(ctx, x + w - 30 - ctx.measureText(bt).width - 14 - 2 * 20 - 10, y + 202, 8, 20, s.best, null, false);
    }
    ctx.fillStyle = PAL.panelEdge;
    ctx.fillRect(x + 24, y + 226, w - 48, 1);
    // 停在哪個任務(= 已升星數 + 1); 第 2 段後判死改寫「剛完成第 k 個任務」
    if (s.justCompleted) {
      txt(ctx, '剛完成第 ' + s.justCompleted + ' 個任務', x + w / 2, y + 256, 16, PAL.expand, 'center');
    } else {
      const task = s.task;
      txt(ctx, '停在的任務', x + 30, y + 246, 14, PAL.textDim, 'left');
      if (task && task.kind) {
        const rem = task.remaining;
        const kind = TASK[task.kind] ? task.kind : 'dig';
        txt(ctx, rem != null && rem <= 0 ? '已達成' : '剩餘 ' + (rem != null ? rem : '—') + ' ' + unitOf(kind), x + w - 30, y + 246, 15, rem != null && rem <= 0 ? PAL.expand : PAL.text, 'right');
        taskIcon(ctx, kind, task.color, x + 30, y + 262, 20);
        if (kind === 'dig') parts(ctx, whatParts(kind, task.color), x + 58, y + 272, 15, w - 88);
        else parts(ctx, [[TASK[kind].what, PAL.text]], x + 58, y + 272, 14, w - 88);
      } else {
        txt(ctx, '—', x + w - 30, y + 246, 14, PAL.textDim, 'right');
      }
    }
    if (s.reason === 'abandon') txt(ctx, '放棄局不更新紀錄', x + w / 2, y + h - 42, 12, PAL.textDim, 'center');
    txt(ctx, 'R 重開　H 說明', x + w / 2, y + h - 18, 14, PAL.text, 'center');
  }

  // state: { stars (0~9), best (0~10, 含本局更新後; null = 尚無紀錄), newRecord, reason: 'blockout'|'lockout'|'abandon',
  //          task: {kind, color, remaining}(停在的任務 = 已升星數 + 1), justCompleted (k: 第 2 段後判死時給, 此時不給 task) }
  function drawGameOver(ctx, s) {
    s = s || {};
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(0, 0, W, H);
    gameOverPanel(ctx, (W - GO_W) / 2, 140, s);
    ctx.restore();
  }

  // 通關畫面(v22 新增): 10 星(5 顆白金星)+「通關」; 第一次 10 星標新紀錄; 不呈現秒數或其他數字
  const VC_W = 420, VC_H = 330;
  function victoryPanel(ctx, x, y, s) {
    const w = VC_W, h = VC_H;
    rr(ctx, x, y, w, h, 14);
    ctx.fillStyle = 'rgba(20,23,34,0.97)';
    ctx.fill();
    ctx.strokeStyle = PAL.starPlat;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    rr(ctx, x + 5, y + 5, w - 10, h - 10, 11);
    ctx.strokeStyle = PAL.starPlatRing;
    ctx.lineWidth = 1;
    ctx.stroke();
    txt(ctx, '通關', x + w / 2, y + 56, 46, PAL.starPlat, 'center', PAL.outline);
    paintStarRow(ctx, x + w / 2, y + 140, 26, 64, 10, null, false);
    ctx.font = font(28);
    const nw = ctx.measureText('10 星').width;
    txt(ctx, '10 星', x + w / 2, y + 208, 28, '#ffffff', 'center');
    if (s.newRecord) recordBadge(ctx, x + w / 2 + nw / 2 + 12, y + 208);
    txt(ctx, 'R 重開　H 說明', x + w / 2, y + h - 22, 14, PAL.text, 'center');
  }
  // state: { newRecord (本局是第一次 10 星) }
  function drawVictory(ctx, s) {
    s = s || {};
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,16,0.6)';
    ctx.fillRect(0, 0, W, H);
    victoryPanel(ctx, (W - VC_W) / 2, 150, s);
    ctx.restore();
  }

  // ================= 說明頁 =================
  // v25: 每頁文字照 guide.md v25 逐字(標題 + 一句), 共 6 頁(v23 刪「要湊哪一團?」); 示意圖裡的遊戲物件一律呼叫遊戲內畫家(P3)
  // 規則細節交給圖, 圖說只留圖畫不出來的東西(P7)
  const GUIDE = [
    { title: '同色連 4 顆就消掉', lines: ['同色上下左右連成 4 顆, 整團消失。'] },
    { title: '消掉的地方會留下洞', lines: ['消掉後留下空洞, 上面不會掉。'] },
    { title: '任務: 解完就升一顆星', lines: ['解完任務有獎勵, 星數 +1。'] },
    { title: '目標與結束: 升到 10 星', lines: ['10 星通關, 放不下就結束。'] },
    { title: '操作: 方塊', lines: ['按住左右鍵可以連續移動。'] },
    { title: '操作: 暫停、說明、放棄、重開', lines: ['放棄要按住 R 一秒。'] },
  ];

  // 字串盤面: 第一行 = 最上列; R/B/Y = 色 A/B/C, o = 重力球, . = 空
  function grid(lines, col0) {
    const out = [];
    const n = lines.length;
    col0 = col0 || 0;
    lines.forEach(function (ln, i) {
      for (let k = 0; k < ln.length; k++) {
        const ch = ln[k];
        if (ch === '.') continue;
        const cell = { x: col0 + k, y: n - i };
        if (ch === 'o') cell.kind = 'ball';
        else { cell.kind = 'color'; cell.color = { R: 'A', B: 'B', Y: 'C' }[ch]; }
        out.push(cell);
      }
    });
    return out;
  }
  function mini(ctx, left, bottom, frameMin, frameMax, rows, minCol, maxCol, fn) {
    withLay({ left: left, bottom: bottom, col0: frameMin, frameMin: frameMin, frameMax: frameMax, rows: rows, showTop: false }, function () {
      drawBoard(ctx, { minCol: minCol, maxCol: maxCol });
      if (fn) fn();
    });
  }
  function cells(ctx, list, mark, t) {
    list.forEach(function (c) { drawCell(ctx, Object.assign({}, c, { mark: mark || 'none', t: t || 0 })); });
  }
  function keyOf(c) { return c.x + ',' + c.y; }
  // 把固定版位的元件搬到指定位置縮放畫
  function placeAt(ctx, src, dx, dy, k, fn) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.scale(k, k);
    ctx.translate(-src.x, -src.y);
    fn();
    ctx.restore();
  }
  function keycap(ctx, x, y, label, w) {
    w = w || 40;
    rr(ctx, x, y, w, 36, 7);
    ctx.fillStyle = '#2a2f42';
    ctx.fill();
    ctx.strokeStyle = '#6a7290';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#20243a';
    ctx.fillRect(x + 3, y + 30, w - 6, 3);
    txt(ctx, label, x + w / 2, y + 17, label.length > 2 ? 14 : 17, PAL.text, 'center');
    return x + w;
  }
  function slash(ctx, x, y) { txt(ctx, '/', x, y, 16, PAL.textDim, 'center'); }
  function checkMark(ctx, x, y, ok) {
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.fillStyle = ok ? PAL.expand : '#5a6178';
    ctx.fill();
    ctx.strokeStyle = ok ? '#0d1a12' : '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (ok) { ctx.moveTo(x - 7, y); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x + 8, y - 6); }
    else { ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); }
    ctx.stroke();
  }
  function caption(ctx, s, x, y, color, align, size) {
    txt(ctx, s, x, y, size || 15, color || PAL.text, align || 'center');
  }
  function miniPiece(ctx, x, y, s) {
    // 小 T 形示意(用遊戲內史萊姆畫法)
    const shape = [[0, 1], [1, 1], [2, 1], [1, 0]];
    const cols = ['A', 'B', 'C', 'A'];
    shape.forEach(function (p, i) { paintSlime(ctx, x + p[0] * s, y + p[1] * s, s, cols[i]); });
  }
  function rotIcon(ctx, x, y, dir, half) {
    // 旋轉箭頭: dir 1 = 順時針, -1 = 逆時針
    ctx.strokeStyle = PAL.text;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const r = 12;
    const a0 = -Math.PI * 0.8, a1 = half ? a0 + Math.PI * 1.6 : a0 + Math.PI * 1.1;
    ctx.beginPath();
    if (dir > 0) ctx.arc(x, y, r, a0, a1, false);
    else ctx.arc(x, y, r, -a0 - Math.PI, -a1 - Math.PI, true);
    ctx.stroke();
    const ea = dir > 0 ? a1 : -a1 - Math.PI;
    const ex = x + Math.cos(ea) * r, ey = y + Math.sin(ea) * r;
    const ta = ea + dir * Math.PI / 2;
    arrow(ctx, ex - Math.cos(ta) * 4, ey - Math.sin(ta) * 4, ex + Math.cos(ta) * 3, ey + Math.sin(ta) * 3, PAL.text, 2.5);
  }
  // 說明頁縮圖用的遊戲中盤面(色 = (x + 2y) mod 3, 上下左右必不同色; 全部著地)
  function stackDemo() {
    const heights = [3, 5, 6, 4, 7, 5, 4, 2];
    const out = [];
    heights.forEach(function (h, i) {
      const x = i - 1;
      for (let y = 1; y <= h; y++) out.push({ x: x, y: y, kind: 'color', color: ['A', 'B', 'C'][((x + 3) + 2 * y) % 3] });
    });
    return out;
  }

  const FIG = {};

  FIG[1] = function (ctx) {
    // 已驗算: 左 = 4 顆四方向相連 → 成團; 右 = (2,3) 只與 (1,2) 斜碰, 其餘 3 顆成一團 → 不消
    // guide v18: 「斜的不算」由這組對照講, 不寫字
    const ok = grid(['....', 'R...', 'R...', 'RR..']);
    checkMark(ctx, 242, 216, true);
    mini(ctx, 190, 380, 0, 3, 4, 0, 3, function () { cells(ctx, ok, 'clearing', 0.35); });
    const ng = grid(['....', '..R.', '.R..', '.RR.']);
    checkMark(ctx, 712, 216, false);
    mini(ctx, 660, 380, 0, 3, 4, 0, 3, function () {
      cells(ctx, ng);
      // 斜碰處: 白色虛線圈出兩格的接點
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx(2), cy(2), 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  };

  FIG[2] = function (ctx) {
    // 已驗算: 第 3 列 4 紅成團; 下兩列棋盤格無同色相鄰; 消後 (1,4)(2,4) 成一個懸空塊
    const before = grid(['.....', '.BY..', 'RRRR.', 'BYBYB', 'YBYBY']);
    const after = grid(['.....', '.BY..', '.....', 'BYBYB', 'YBYBY']);
    caption(ctx, '消除前', 265, 200, PAL.textDim);
    caption(ctx, '消除後', 695, 200, PAL.textDim);
    mini(ctx, 200, 360, 0, 4, 5, 0, 4, function () {
      cells(ctx, before.filter(function (c) { return c.y !== 3; }));
      cells(ctx, before.filter(function (c) { return c.y === 3; }), 'clearing', 0.3);
    });
    arrow(ctx, 360, 295, 600, 295, PAL.text, 3);
    mini(ctx, 630, 360, 0, 4, 5, 0, 4, function () {
      cells(ctx, after);
      drawFloatingMark(ctx, { cells: [{ x: 1, y: 4 }, { x: 2, y: 4 }], group: 0 });
    });
    // v20: 「變成空洞 / 停在原處」由前後對照與頁面那一句講, 圖說只留遊戲內青色框的圖例
    // v22: 重力球頁已刪(guide v21), 青色框仍是遊戲內全程常駐的標示, 圖例留著讓玩家認得它; 不講它之後會怎樣
    caption(ctx, '青色框 = 懸空', 695, 400, PAL.gravity, 'center', 13);
  };

  // 說明頁用: 遊戲內的星數顯示(HUD 星數那一塊)搬到指定位置縮放畫; 只裁出星數框, 最佳紀錄與時間不畫
  function starsBox(ctx, dx, dy, k, n, gain) {
    const b = BOX.stars;
    placeAt(ctx, b, dx, dy, k, function () {
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      ctx.clip();
      drawHud(ctx, { stars: n, starGain: gain, best: null, time: 0 });
      ctx.restore();
    });
  }
  // 第 1 個任務的面板狀態(guide v25 第 3 頁: 目標照遊戲內寫法「消掉[目標色]」, 第二欄只放標籤)
  const GUIDE_TASK1 = { kind: 'dig', color: 'A', required: 6, reward: 'expand', side: 'left' };

  FIG[3] = function (ctx) {
    // guide v25 第 3 頁: 只放任務面板與星數顯示, 照遊戲畫面的相對位置(面板在左上、星數在右側偏下)
    // 讓玩家看出: 有任務 / 目標看面板 / 解完會拿到東西(獎勵或解鎖) / 星數 +1
    // 不畫盤面、不畫任何獎勵的效果、不寫延展側、不列有哪些任務(老闆第 9 輪)
    const k = 0.9;
    const Y = 236; // 兩個面板的上緣
    const P1 = 40, P2 = 348, SX = 656;
    const pw = BOX.task.w * k;
    // 面板 1: 進行中(剩餘一個數字)
    placeAt(ctx, BOX.task, P1, Y, k, function () {
      paintTaskPanel(ctx, Object.assign({ remaining: 6 }, GUIDE_TASK1), { rewardLabels: true });
      // 「目標看這裡」: 白色虛線直接圈在目標那一塊上(老闆第 9 輪: 指示要貼著面板上的字)
      const r = taskCardRect(0);
      rr(ctx, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // 指示字緊貼在圈的正上方, 短箭頭直接指進圈裡
    const ringTop = Y + (TASK_CARDS[0].top - 3) * k;
    txt(ctx, '目標看這裡', P1 + 4, Y - 26, 16, PAL.text, 'left', PAL.outline);
    arrow(ctx, P1 + 104, Y - 26, P1 + 128, ringTop - 1, PAL.text, 2.5);

    // 箭頭 → 面板 2: 已達成
    const midY = Y + 208 * k; // 剩餘那一塊的中線
    arrow(ctx, P1 + pw + 6, midY, P2 - 6, midY, PAL.expand, 3);
    txt(ctx, '解完', (P1 + pw + P2) / 2, midY - 16, 13, PAL.textDim, 'center');
    placeAt(ctx, BOX.task, P2, Y, k, function () {
      paintTaskPanel(ctx, Object.assign({ remaining: 0 }, GUIDE_TASK1), { rewardLabels: true });
    });

    // 箭頭 → 星數顯示: 第 1 顆星亮起(遊戲內升星演出的中段)
    // 星數框在遊戲裡比任務面板低 150, 這裡照同一個比例往下擺
    const sy = Y + (BOX.stars.y - BOX.task.y) * k;
    arrow(ctx, P2 + pw + 6, midY, SX - 6, midY, PAL.expand, 3);
    starsBox(ctx, SX, sy, k, 1, 0.55);
  };

  FIG[4] = function (ctx) {
    // guide v25 第 4 頁
    // 左(目標): 遊戲內的星數顯示三格 — 0 星(全空)→ 5 星(5 金)→ 10 星(5 白金)標「通關」; 金轉白金交給圖, 不寫規則字
    const k = 0.62;
    const rows = [{ n: 0, y: 160 }, { n: 5, y: 282 }, { n: 10, y: 404 }];
    rows.forEach(function (r, i) {
      txt(ctx, r.n + ' 星', 98, r.y + 48, 15, PAL.textDim, 'right');
      starsBox(ctx, 110, r.y, k, r.n, null);
      if (i < rows.length - 1) arrow(ctx, 204, r.y + 92, 204, r.y + 118, PAL.text, 2.5);
    });
    txt(ctx, '通關', 312, 447, 22, PAL.starPlat, 'left', PAL.outline);
    // 分隔
    ctx.fillStyle = PAL.panelEdge;
    ctx.fillRect(478, 160, 1, 350);
    // 右(結束): 兩個剛放下的方塊 — 整塊在頂線上 → 結束; 只有一格超出 → 還能繼續
    //   (P21: 「碰到頂線就死」的誤解會在右邊那格分岔; 不畫頂線以上的出生位置, 不把頂線畫成警戒線)
    // v25: 盤面改畫滿寬 10 欄(相對欄 0~9), 「還能繼續」那一格超出的格在相對欄 0 — 不在下一塊出生的相對欄 3~6
    //      (否則下一塊出生就重疊, 照樣結束; spec-review v25 製作人補)
    // 已驗算(可見 4 列; 盤面色 = (x + 2y) mod 3 → 上下左右必不同色, 無 ≥4 團, 全部著地; 出生欄 3~6 的堆高都 ≤ 4)
    //   結束: T 形 (3,5)紅 (4,5)藍 (5,5)黃 (4,6)紅, 全在頂線上 → 整塊卡在頂線上; 下方 (3,4)黃 (4,4)紅 (5,4)藍 都不同色
    //   繼續: L 形 (0,3)紅 (1,3)藍 (0,4)黃 (0,5)紅, 只有 (0,5) 超出; 鄰格 (0,2)藍 (1,2)黃 (2,3)黃 → 四格各自不與同色相鄰
    const f = function (x, y) { return ['A', 'B', 'C'][(x + 2 * y) % 3]; };
    function stackOf(heights) {
      const out = [];
      heights.forEach(function (h, x) { for (let y = 1; y <= h; y++) out.push({ x: x, y: y, kind: 'color', color: f(x, y) }); });
      return out;
    }
    const heights = [2, 2, 3, 4, 4, 4, 3, 2, 3, 2];
    const sk = 0.78; // 10 欄 × 26 × 0.78 ≈ 203 寬
    const cases = [
      { left: 506, piece: [[3, 5, 'A'], [4, 5, 'B'], [5, 5, 'C'], [4, 6, 'A']], ok: false, cap: '結束', color: PAL.danger },
      { left: 728, piece: [[0, 3, 'A'], [1, 3, 'B'], [0, 4, 'C'], [0, 5, 'A']], ok: true, cap: '還能繼續', color: PAL.expand },
    ];
    const top = 318; // 盤面頂線(縮放後)的畫布 y
    cases.forEach(function (o) {
      const bw = 10 * CELL * sk;
      ctx.save();
      ctx.translate(o.left, top);
      ctx.scale(sk, sk);
      withLay({ left: 0, bottom: 4 * CELL, col0: 0, frameMin: 0, frameMax: 9, rows: 4, showTop: true }, function () {
        drawBoard(ctx, { minCol: 0, maxCol: 9 });
        cells(ctx, stackOf(heights));
        // 剛放下的方塊: 頂線以上的格也畫出來(示意用; 遊戲內那一區看不見), 白色細外框 = 本塊
        const pc = o.piece.map(function (p) { return { x: p[0], y: p[1], kind: 'color', color: p[2] }; });
        pc.forEach(function (c) { paintBody(ctx, cx(c.x), cy(c.y), CELL, c.kind, c.color); });
        contourPath(ctx, pc, 0.5);
        ctx.strokeStyle = PAL.player;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      ctx.restore();
      checkMark(ctx, o.left + bw / 2, top - 82, o.ok);
      caption(ctx, o.cap, o.left + bw / 2, top + 4 * CELL * sk + 26, o.color, 'center', 15);
    });
  };

  FIG[5] = function (ctx) {
    const rows = [
      { keys: [['←', '→'], ['A', 'D']], icon: 'move', label: '左右移動(按住連續移動)' },
      { keys: [['↑'], ['W']], icon: 'cw', label: '順轉' },
      { keys: [['Z']], icon: 'ccw', label: '逆轉' },
      { keys: [['X']], icon: 'half', label: '轉半圈' },
      { keys: [['↓'], ['S']], icon: 'soft', label: '加速下落(按住持續)' },
      { keys: [['空白鍵']], icon: 'hard', label: '直接落下', wide: true },
    ];
    rows.forEach(function (r, i) {
      const y = 150 + i * 60;
      let x = 50;
      r.keys.forEach(function (grp, gi) {
        if (gi > 0) { slash(ctx, x + 5, y + 18); x += 16; }
        grp.forEach(function (kk) { x = keycap(ctx, x, y, kk, r.wide ? 96 : 40) + 6; });
      });
      const ix = 300, iy = y + 18;
      miniPiece(ctx, ix - 15, iy - 10, 10);
      if (r.icon === 'move') {
        arrow(ctx, ix - 20, iy, ix - 36, iy, PAL.text, 2.5);
        arrow(ctx, ix + 20, iy, ix + 36, iy, PAL.text, 2.5);
      } else if (r.icon === 'cw') rotIcon(ctx, ix + 42, iy, 1, false);
      else if (r.icon === 'ccw') rotIcon(ctx, ix + 42, iy, -1, false);
      else if (r.icon === 'half') rotIcon(ctx, ix + 42, iy, 1, true);
      else if (r.icon === 'soft') { arrow(ctx, ix + 34, iy - 12, ix + 34, iy + 4, PAL.text, 2.5); arrow(ctx, ix + 44, iy - 12, ix + 44, iy + 4, PAL.text, 2.5); }
      else { arrow(ctx, ix + 40, iy - 14, ix + 40, iy + 14, PAL.text, 3); ctx.fillStyle = PAL.text; ctx.fillRect(ix + 30, iy + 15, 20, 3); }
      txt(ctx, r.label, 370, iy, 16, PAL.text, 'left');
    });
    // 右: 落點指示
    const stack = grid(['......', '......', 'Y...B.', 'BRYBRY', 'RYBRYB']);
    mini(ctx, 660, 556, 0, 5, 12, 0, 5, function () {
      cells(ctx, stack);
      const piece = [{ x: 1, y: 12, kind: 'color', color: 'B' }, { x: 2, y: 12, kind: 'color', color: 'C' }, { x: 3, y: 12, kind: 'color', color: 'A' }, { x: 2, y: 11, kind: 'ball' }];
      const ghost = piece.map(function (c) { return Object.assign({}, c, { y: c.y - 8 }); });
      drawGhost(ctx, { cells: ghost });
      drawPiece(ctx, { cells: piece, mode: 'falling' });
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cx(2) + CELL / 2, cy(11) + CELL + 2);
      ctx.lineTo(cx(2) + CELL / 2, cy(4) - 2);
      ctx.stroke();
      ctx.restore();
    });
    txt(ctx, '空白鍵', 830, 430, 16, PAL.text, 'left');
    txt(ctx, '→ 直接落到', 830, 454, 14, PAL.text, 'left');
    txt(ctx, '　這個框的位置', 830, 476, 14, PAL.text, 'left');
    arrow(ctx, 826, 465, 772, 465, PAL.text, 2);
  };

  // 左右各半的縮圖: 左半畫 left(), 右半畫 right(), 各自水平置中在自己那一半(遊戲畫面座標, 已縮放)
  function splitThumb(ctx, left, right) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W / 2, H);
    ctx.clip();
    ctx.translate(-W / 4, 0);
    left();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2, 0, W / 2, H);
    ctx.clip();
    ctx.translate(W / 4, 0);
    right();
    ctx.restore();
    ctx.fillStyle = PAL.panelEdge;
    ctx.fillRect(W / 2 - 4, 0, 8, H);
  }

  FIG[6] = function (ctx) {
    const items = [
      { key: 'Esc', cap: '暫停畫面', sub: '再按一次繼續' },
      { key: 'H', cap: '說明畫面', sub: '← → 翻頁　Enter / H 關閉' },
      { key: 'R', cap: '按住: 放棄倒數', hold: true },
      { key: 'R', cap: '按下: 重開', sub: '在結束或通關畫面上' },
    ];
    // 縮圖裡的遊戲中盤面(v22: HUD 是星數, 不是分數)
    function playing() {
      drawBackground(ctx);
      drawBoard(ctx, { minCol: -1, maxCol: 6 });
      stackDemo().forEach(function (c) { drawCell(ctx, c); });
      drawTaskProgress(ctx, { kind: 'dig', color: 'B', remaining: 4, required: 8, reward: 'expand', side: 'right' });
      drawHud(ctx, { stars: 1, best: 3, time: 96 });
    }
    items.forEach(function (it, i) {
      const x = 50 + i * 220, y = 150;
      rr(ctx, x, y, 200, 400, 12);
      ctx.fillStyle = PAL.panel;
      ctx.fill();
      ctx.strokeStyle = it.hold ? PAL.danger : PAL.panelEdge;
      ctx.lineWidth = it.hold ? 2 : 1;
      ctx.stroke();
      const kw = it.key.length > 1 ? 60 : 44;
      keycap(ctx, x + 100 - kw / 2, y + 16, it.key, kw);
      if (it.hold) {
        // 按住: 外圈進度環
        ctx.beginPath();
        ctx.arc(x + 100, y + 34, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.7);
        ctx.strokeStyle = PAL.danger;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      txt(ctx, it.cap, x + 100, y + 86, 14, it.hold ? PAL.danger : PAL.text, 'center');
      const sx = x + 4, sy = y + 110, sw = 192, sh = 128;
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx, sy, sw, sh);
      ctx.clip();
      ctx.translate(sx, sy);
      ctx.scale(0.2, 0.2);
      if (i === 0) drawPauseMask(ctx);
      else if (i === 1) drawGuidePage(ctx, { page: 1, mode: 'ingame' });
      else if (i === 2) {
        // 背景 = 遊戲中(左半) / 暫停畫面(右半), 兩處都能長按 R(說明畫面中無效)
        // 遊戲中那半往上移 200, 讓盤面上的史萊姆不被下方的放棄計時條蓋住
        splitThumb(ctx, function () { ctx.translate(0, -200); playing(); }, function () { drawPauseMask(ctx); });
      } else {
        // v22(guide v21): 結束畫面(左半) / 通關畫面(右半), 兩處按 R 都是重開
        splitThumb(ctx, function () {
          drawBackground(ctx);
          drawGameOver(ctx, { stars: 3, best: 5, reason: 'blockout', task: { kind: 'dig', color: 'C', remaining: 4 } });
        }, function () {
          drawBackground(ctx);
          drawVictory(ctx, {});
        });
      }
      ctx.restore();
      if (i === 2) {
        placeAt(ctx, BOX.abandon, sx + 2, sy + 86, 188 / 302, function () { drawAbandonTimer(ctx, { progress: 0.7 }); });
        txt(ctx, '遊戲中', sx + sw / 4, sy + 12, 11, PAL.text, 'center', PAL.outline);
        txt(ctx, '暫停中', sx + sw * 3 / 4, sy + 12, 11, PAL.text, 'center', PAL.outline);
      } else if (i === 3) {
        txt(ctx, '結束', sx + sw / 4, sy + 12, 11, PAL.text, 'center', PAL.outline);
        txt(ctx, '通關', sx + sw * 3 / 4, sy + 12, 11, PAL.text, 'center', PAL.outline);
      }
      ctx.strokeStyle = PAL.panelEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
      if (it.hold) {
        // 時間軸: 要按住, 不是點一下
        const tx = x + 20, ty = y + 280, tw = 160;
        txt(ctx, '按下', tx, ty - 14, 12, PAL.textDim, 'left');
        txt(ctx, '1 秒', tx + tw, ty - 14, 12, PAL.textDim, 'right');
        rr(ctx, tx, ty, tw, 10, 5);
        ctx.fillStyle = '#10131b';
        ctx.fill();
        rr(ctx, tx, ty, tw * 0.7, 10, 5);
        ctx.fillStyle = PAL.danger;
        ctx.fill();
        txt(ctx, '按滿 1 秒才放棄', x + 100, ty + 32, 12, PAL.text, 'center');
        txt(ctx, '放開就取消', x + 100, ty + 54, 12, PAL.textDim, 'center');
        txt(ctx, '看說明時要先關掉', x + 100, ty + 76, 12, PAL.textDim, 'center');
      } else {
        txt(ctx, it.sub, x + 100, y + 300, 12, PAL.textDim, 'center');
      }
    });
  };

  // state: { page (1~6), mode: 'opening'|'ingame'|'gameover'|'victory' }
  function drawGuidePage(ctx, s) {
    s = s || {};
    const total = GUIDE.length;
    const page = Math.max(1, Math.min(total, s.page || 1));
    const g = GUIDE[page - 1];
    ctx.save();
    ctx.fillStyle = PAL.bg;
    ctx.fillRect(0, 0, W, H);
    txt(ctx, '玩家說明', 50, 22, 13, PAL.textDim, 'left');
    txt(ctx, page + ' / ' + total, W - 50, 22, 13, PAL.textDim, 'right');
    txt(ctx, g.title, 50, 54, 28, PAL.text, 'left');
    let y = 96;
    g.lines.forEach(function (ln) {
      ctx.font = font(18, 'normal');
      wrap(ctx, ln, W - 100).forEach(function (l) {
        txt(ctx, l, 50, y, 18, PAL.text, 'left', null, 'normal');
        y += 26;
      });
    });
    ctx.save();
    if (FIG[page]) FIG[page](ctx);
    ctx.restore();
    // 頁尾: 翻頁與關閉(每頁固定)
    ctx.fillStyle = '#0e1017';
    ctx.fillRect(0, 598, W, 42);
    for (let i = 1; i <= total; i++) {
      ctx.beginPath();
      ctx.arc(W / 2 - (total - 1) * 7 + (i - 1) * 14, 606, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === page ? PAL.text : '#3a4058';
      ctx.fill();
    }
    txt(ctx, '← / A 上一頁', 50, 624, 15, page > 1 ? PAL.text : '#474e66', 'left');
    txt(ctx, '→ / D 下一頁', W - 50, 624, 15, page < total ? PAL.text : '#474e66', 'right');
    txt(ctx, 'Enter / H 關閉' + (s.mode === 'opening' ? '(開始遊戲)' : ''), W / 2, 624, 15, PAL.expand, 'center');
    ctx.restore();
  }

  // ================= 匯出 =================
  window.Art = {
    canvas: { width: W, height: H },
    palette: PAL,
    slimeColors: SLIME,
    newShapes: NEW_SHAPES,
    cellSize: CELL,
    guidePages: GUIDE.length,
    eventPhases: PHASE, // v22: 任務過場各段的規格時長(秒), 供 RD 換算各函式的 t(見 style.md 第 7 節)
    shaveCellT: shaveCellT, // v22: 削頂段內被削格的 t(drawCell(mark:'shaving') 用), 輸入 = drawShaveEvent 的 t
    // RD 用: 盤面座標 → 畫布像素(預設版位)
    cellRect: function (x, y) { return { x: cx(x), y: cy(y), w: CELL, h: CELL }; },
    board: { left: 350, right: 610, top: 110, bottom: 604, minAbsCol: -2, maxAbsCol: 7, rows: 19 },
    drawBackground: drawBackground,
    drawPlayer: drawPiece, // 契約保留名, 等同 drawPiece
    drawBoard: drawBoard,
    drawCell: drawCell,
    drawGravityBall: drawGravityBall,
    drawFloatingMark: drawFloatingMark,
    drawFloatingEventBlock: drawFloatingEventBlock,
    drawLandingImpact: drawLandingImpact,
    drawGravityEvent: drawGravityEvent,
    drawExtraClear: drawExtraClear,
    drawClearResult: drawClearResult,
    drawPiece: drawPiece,
    drawGhost: drawGhost,
    drawNextPreview: drawNextPreview,
    drawTaskProgress: drawTaskProgress,
    drawNextExpandSide: drawNextExpandSide,
    drawAbandonTimer: drawAbandonTimer,
    drawExpandEvent: drawExpandEvent,
    drawShaveIndicator: drawShaveIndicator,
    drawUnlockEvent: drawUnlockEvent,
    drawClearBall: drawClearBall, // v20
    drawShaveEvent: drawShaveEvent, // v22: 過場第 1 段 削頂
    drawStarGain: drawStarGain, // v22: 過場第 2 段 星數 +1
    drawSpeedUp: drawSpeedUp, // v22: 過場第 4 段 落速提升
    drawBoardWipe: drawBoardWipe, // v20
    wipeShake: wipeShake, // v20, 選用: 全盤清除時盤面層的震動位移
    drawPauseMask: drawPauseMask,
    drawGameOver: drawGameOver,
    drawVictory: drawVictory, // v22: 通關畫面
    drawGuidePage: drawGuidePage,
    drawHud: drawHud,
  };
})();
