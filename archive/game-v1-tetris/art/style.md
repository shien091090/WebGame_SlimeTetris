# Slime Tetris 美術規格(RD 對接用)

`game/art/art.js` 暴露單一全域 `window.Art`,非 ES module。所有函式簽章為 `draw*(ctx, state)`,`drawBackground` 只有 `ctx`。
每個函式自己 `save()/restore()`,不留狀態污染;呼叫順序由 RD 決定。函式不做任何邏輯判斷,傳什麼畫什麼。

---

## 1. 邏輯畫布尺寸

| 項目 | 值 |
| --- | --- |
| `Art.canvas.width` | 960 |
| `Art.canvas.height` | 640 |
| 格子邊長 | 32 |
| 盤面列數 | 16(緩衝列不畫,見下) |
| 盤面垂直範圍 | y = 104(第 16 列頂)~ 616(第 1 列底) |
| 盤面水平中心 | x = 480,寬度 w 欄時左緣 = 480 − w × 16 |
| 滿寬(10 欄)盤面 | x = 320 ~ 640 |

座標約定:**欄 `col` 自左起 1 ~ w;列 `row` 自底部起 1 ~ 16**,與 spec 的堆疊高度定義一致。緩衝列即 `row = 17、18`,所有盤面繪製都被裁切在 16 列範圍內,傳進來也不會畫出去(符合「緩衝列不可見」)。

### 版面分區(固定矩形)

| 區塊 | 矩形 | 內容 |
| --- | --- | --- |
| 左上資訊板 | 32, 24, 264 × 132 | 最佳紀錄 / 時間 / 落速 / 遊戲狀態 |
| 中上分數區 | 320, 24, 320 × 72 | 分數 |
| 右上資訊板 | 664, 24, 264 × 132 | 下一塊預覽 |
| 左側面板 | 32, 180, 264 × 236 | 左側目標色 + 左側解鎖進度(+ 昂貴側徽章) |
| 右側面板 | 664, 180, 264 × 236 | 右側目標色 + 右側解鎖進度(+ 昂貴側徽章) |
| 盤面 | 依當前寬度置中,y 104 ~ 616 | 格位 / 方塊 / ghost / 段標記 |
| 結算面板 | 260, 150, 440 × 340 | 結束資訊 |
| 重開按鈕 | 370, 412, 220 × 52 | `Art.layout.restartButton`,滑鼠點擊判定用 |

### `Art.layout`(幾何輔助,給輸入對應用,非繪製)

```
Art.layout.cell            // 32
Art.layout.rows            // 16
Art.layout.maxCols         // 10
Art.layout.boardTop        // 104
Art.layout.boardBottom     // 616
Art.layout.boardLeft(w)    // 該寬度下盤面左緣 x
Art.layout.cellX(col, w)   // 該格左上角 x
Art.layout.cellY(row)      // 該格左上角 y
Art.layout.columnAtX(px,w) // 滑鼠 x → 欄號(已夾在 1~w),供滑鼠跟隨用
Art.layout.restartButton   // {x,y,w,h}
Art.colorName('A')         // '紅' / '藍' / '黃',要顯示色名時用
```

---

## 2. 色票 `Art.palette`

| 名稱 | 色碼 | 用途 |
| --- | --- | --- |
| `bg` / `bgVignette` | `#10131f` / `#0a0c15` | 背景漸層上 / 下 |
| `plate` / `plateEdge` | `#171c2e` / `#262d47` | 資訊板底 / 邊框 |
| `boardBg` | `#141829` | 盤面可放置區底色 |
| `boardGrid` | `#232a44` | 盤面格線、滿寬虛線外框 |
| `boardFrame` | `#59668f` | 當前盤面邊界外框 |
| `boardLocked` | `#1b2038` | 尚未解鎖的欄(滿寬範圍內、當前寬度外) |
| `cellA` | `#ff5d73` | 顏色 A(紅) |
| `cellB` | `#3fa9ff` | 顏色 B(藍) |
| `cellC` | `#ffc63f` | 顏色 C(黃) |
| `cellInert` | `#6d7486` | 惰性格(無顏色) |
| `cellGloss` | `rgba(255,255,255,0.35)` | 史萊姆高光 |
| `cellGlyph` | `rgba(18,16,32,0.45)` | 格內辨色符號 |
| `ghost` | `rgba(232,236,248,0.55)` | 落點指示 fallback |
| `lockPulse` | `#ffffff` | 鎖定延遲脈衝 / 鎖定閃白 |
| `softTrail` | `rgba(160,200,255,0.30)` | 軟降拖尾 |
| `segmentMark` | `#ffffff` | 相鄰段結算外框 |
| `expensive` | `#ffcc57` | 昂貴側徽章、最佳紀錄、滿級 |
| `progressTrack` / `progressFill` / `progressMax` | `#232a44` / `#7de3a4` / `#ffcc57` | 進度條底 / 進行中 / 滿級 |
| `expandHint` | `#7de3a4` | 延展提示箭頭與標籤 |
| `rerollHint` | `#c9a7ff` | 目標色重抽提示 |
| `pauseMask` | `rgba(9,11,19,0.97)` | 暫停遮罩(幾乎不透明,全畫布) |
| `resultMask` | `rgba(9,11,19,0.82)` | 結算遮罩 |
| `danger` | `#ff6b6b` | 放棄計時、結束狀態 |
| `text` / `textMuted` / `textDark` | `#e8ecf8` / `#8b93ad` / `#141829` | 主文字 / 次文字 / 亮底上的深字 |

**三色辨識不只靠色相**:每格另印一個深色符號 — A = 圓點、B = 橫槓、C = 菱形,色弱與縮圖下仍可分辨。惰性格沒有符號、沒有高光、直角、帶斜線影線,與任何彩色格一眼分得開。

---

## 3. 形狀語言

一句話:**彩色格是圓角無框的果凍(帶高光與底部暗邊),非玩法物件是平面圓角板,惰性格是直角灰色影線塊 — 「圓 = 可用顏色,直角灰 = 死肉」。**

---

## 4. 物件表

`side` 欄位一律是字串 `'left'` / `'right'`;`color` 一律是 `'A'` / `'B'` / `'C'`。state 傳 `undefined` 或缺欄位時函式安全跳過(不丟例外)。

| spec 物件 | 函式 | state 欄位 | 各狀態視覺差異 |
| --- | --- | --- | --- |
| (背景) | `drawBackground(ctx)` | 無 | 背景漸層 + 四塊資訊板底 + 滿寬 10 欄虛線外框(暗示可延展範圍)。每幀最先呼叫一次 |
| 盤面格位 | `drawCell(ctx, state)` | `{ col, row, boardWidth, kind:'empty'\|'filled'\|'inert', color, alpha? }` | `empty` 不畫(格線由邊界函式負責);`filled` 畫該色果凍 + 符號;`inert` 灰色直角影線塊。`alpha` 可給消行閃動用 |
| 盤面邊界 | `drawBoardFrame(ctx, state)` | `{ width }`(6~10) | 依寬度置中畫底色 + 格線 + 亮色外框,外框上方標「N 欄」;滿寬範圍內尚未解鎖的欄塗 `boardLocked` 深色,視覺上是「還沒拿到的地」 |
| 緩衝列 | — | — | **不需獨立函式**:spec 定義為不可見。所有盤面繪製都裁切於 16 列內,`row ≥ 17` 自動看不到 |
| 落下方塊 | `drawFallingPiece(ctx, state)` | `{ cells:[{col,row,color}], boardWidth, phase:'falling'\|'softdrop'\|'locking'\|'locked', lockProgress? }` | `falling` 一般果凍;`softdrop` 格子上方加淺藍拖尾;`locking` 白色外框脈衝,閃爍節奏由 `lockProgress`(0~1,鎖定延遲進度)驅動,越接近鎖定越急;`locked` 疊半透明白閃一幀 |
| 落點指示 | `drawGhost(ctx, state)` | `{ cells:[{col,row,color}], boardWidth }` | 虛線外框 + 14% 同色薄填,只標位置,不含任何點數預測 |
| 下一塊預覽 | `drawNextPreview(ctx, state)` | `{ cells:[{col,row,color}], hidden? }` | `col/row` 是形狀局部座標(任意整數,函式自動抓 bounding box 置中),格 24px,每格畫各自顏色;`hidden: true`(暫停)改畫深色板 +「遮蔽中」 |
| 左側目標色指示 | `drawLeftTargetColor(ctx, state)` | `{ color, hidden?, frozen? }` | 56px 大果凍色票 + 色名文字;`frozen`(該側滿級)加「已凍結」標;`hidden` 改為「?」深板 |
| 右側目標色指示 | `drawRightTargetColor(ctx, state)` | 同上 | 同上,畫在右側面板 |
| 昂貴側指示 | `drawExpensiveSideMark(ctx, state)` | `{ side }` | 只畫在昂貴側面板右上角的金色徽章「昂貴側」。便宜側不畫任何徽章,對比即資訊 |
| 左側解鎖進度 | `drawLeftUnlockProgress(ctx, state)` | `{ stage:1\|2\|'max', points, need, unlockedCols:0\|1\|2, overflow? }` | 階段文字「第 1/2 階」+「點數 / 需求」+ 綠色進度條;`stage:'max'` 改金色滿條、文字「滿級 80 分/點」、不顯示分母;`overflow` 有值時在下方標「承接溢出 +N」;下方兩顆方塊 pip 表示該側已延展欄數 |
| 右側解鎖進度 | `drawRightUnlockProgress(ctx, state)` | 同上 | 同上,畫在右側面板 |
| 相鄰段結算標記 | `drawSegmentMarks(ctx, state)` | `{ boardWidth, alpha, marks:[{ row, col, length, side, color, points }] }` | 每段畫白色膠囊外框 + 同色薄填,並在段的「歸屬側方向」外緣貼「+N」色標。`alpha` 由 RD 做淡出(建議出現後約 0.6 秒淡掉)。`col` 是段最左欄 |
| 延展提示 | `drawExpandHint(ctx, state)` | `{ side, boardWidth, alpha }` | 盤面該側邊界外三個向外遞減的綠色箭頭 + 標籤「左/右側延展 +1 欄」。`alpha` 由 RD 控制生滅 |
| 目標色重抽提示 | `drawRerollHint(ctx, state)` | `{ side, color, alpha }` | 該側面板上方紫色長條「目標色重抽 → [新色果凍]」,`alpha` 由 RD 控制生滅 |
| 暫停遮罩 | `drawPauseOverlay(ctx, state)` | `{ pauseCount? }` | **覆蓋整個 960×640**(盤面、預覽、目標色、進度全遮),中央暫停圖示 +「已暫停」+ 操作提示。RD 只要在暫停時最後呼叫這個,就滿足 spec「暫停不可看盤」 |
| 放棄計時指示 | `drawAbandonTimer(ctx, state)` | `{ progress:0~1, remain? }` | 盤面下方圓環進度 +「放棄」+ 剩餘秒數;`progress` 為長按進度。不呼叫即消失 |
| 分數 / 最佳紀錄 / 經過時間 / 遊戲狀態 | `drawHud(ctx, state)` | `{ score, best(null = 尚無紀錄), seconds, fallSpeed?, status:'playing'\|'paused'\|'over' }` | 分數大字置中上方;最佳紀錄金色(`null` 顯示「尚無紀錄」);時間一位小數;狀態以彩色藥丸標示(綠=進行中 / 金=暫停 / 紅=結束) |
| 結算資訊 | `drawResultPanel(ctx, state)` | `{ visible?, score, seconds, unlockedCols, reason:'blockout'\|'lockout'\|'abandon', isNewRecord, best }` | 半透明遮罩 + 面板:結束原因、分數、存活秒數、已解鎖欄數 N/4、最佳紀錄;`isNewRecord` 顯示「★ 新紀錄 ★」,`reason:'abandon'` 改顯示「放棄局不更新最佳紀錄」;底部重開按鈕(點擊範圍 = `Art.layout.restartButton`) |

另有 `Art.drawPlayer(ctx, state)`,是 `drawFallingPiece` 的別名(本作沒有獨立玩家角色,玩家操作的就是落下方塊),兩者可互換呼叫。

### 建議繪製順序

```
drawBackground
drawBoardFrame
drawCell × 全盤(已填 / 惰性)
drawGhost
drawFallingPiece
drawSegmentMarks   (結算回饋期間)
drawExpandHint / drawRerollHint (事件期間)
drawLeftTargetColor / drawRightTargetColor
drawLeftUnlockProgress / drawRightUnlockProgress
drawExpensiveSideMark
drawNextPreview
drawHud
drawAbandonTimer   (長按 R 期間)
drawResultPanel    (結束時)
drawPauseOverlay   (暫停時,一定放最後)
```

---

## 5. 尺寸表

| 物件 | 尺寸 |
| --- | --- |
| 盤面格位 | 32 × 32,果凍本體內縮 2px(實繪 28 × 28),圓角 ≈ 8.4,底部暗邊 3px |
| 格內辨色符號 | 圓點 r ≈ 4.2 / 橫槓 12.3 × 3.4 / 菱形對角 10 |
| 惰性格 | 28 × 28 直角,影線間距 9、線寬 3,內框線寬 2 |
| 盤面(寬度 w) | w × 32 寬 × 512 高;6 欄 = 192、10 欄 = 320 |
| 盤面外框 | 線寬 3,外擴 1.5px |
| 滿寬虛線外框 | 332 × 524,虛線 4/6,圓角 10 |
| 落點指示 | 每格 26 × 26 虛線框(虛線 5/4),圓角 8 |
| 鎖定脈衝外框 | 每格 28 × 28,線寬 2 |
| 軟降拖尾 | 每格 2 道,4 × 22 與 4 × 14 |
| 下一塊預覽格 | 24 × 24,置中於 228 × 76 的預覽區 |
| 目標色色票 | 56 × 56(外圈襯底 64 × 64,圓角 16) |
| 昂貴側徽章 | 92 × 26,圓角 13,內含 r=7 金幣點 |
| 解鎖進度條 | 228 × 20,圓角 10,線寬 2 |
| 已延展 pip | 18 × 18,圓角 5,間距 8,每側 2 顆 |
| 相鄰段標記 | 高 28,寬 = 段長 × 32 − 4,圓角 12,外框線寬 3;「+N」色標 46 × 22 |
| 延展箭頭 | 每支 12 寬 × 28 高,3 支間距 16;標籤 132 × 28 |
| 重抽提示條 | 200 × 44,圓角 12,內嵌 32px 色票 |
| 放棄計時圓環 | r = 34,線寬 8,底盤 r = 44 |
| 結算面板 | 440 × 340,圓角 12;列高 30、列距 38 |
| 重開按鈕 | 220 × 52,圓角 14 |
| 字級 | 分數 34 / 主數值 17~20 / 標題 26 / 一般 13~15 / 標籤 12 |
| 字體 | `"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif`(系統字,不外連) |
