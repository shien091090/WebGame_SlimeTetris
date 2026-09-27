# 史萊姆擴張 v20 美術規格

RD 只讀這份。對應 `spec.md` v20 / `guide.md` v20。函式全掛在 `window.Art`, 參數固定 `(ctx, state)`(`drawBackground` 只有 `ctx`), 各自 save / restore。沿用 v18 美術的色票、形狀語言與版面骨架; 本版只改規格變動牽涉到的物件(異動清單見第 9 節)。

**index.html 必須宣告 `<meta charset="utf-8">`**(art.js 內含中文字串; 沒宣告在 file:// 下會亂碼)。字型只用系統字(微軟正黑體 → PingFang TC → Noto Sans TC → sans-serif), 不載外部資源。

## 1. 邏輯畫布尺寸

**960 × 640**(`Art.canvas`)。格子邊長 **26**(`Art.cellSize`)。

## 2. 座標約定(盤面類函式共用)

- `x` = **絕對欄**(-2 ~ 7, 開局 0~5), `y` = **列**(1 = 最底列, 19 = 頂列, 20 以上 = 不可見區)。與 spec 的座標系相同, RD 不需換算
- `y` 可帶小數(重力下落、方塊下落的插值), 同一組格位要有相同的小數部分
- **盤面外框固定為滿寬 10 欄**: 絕對欄 -2 的左緣永遠在 x=350, 右緣 x=610; 列 1 底緣 y=604, 列 19 上緣 y=110。延展時盤面不位移, 未開的欄畫成「預留槽」(斜紋暗格)
- 所有盤面類函式會把內容裁切在列 1~19 內, **y > 19 的格位傳進來也不會畫出來**(不可見區), RD 不必自己過濾
- `Art.cellRect(x, y)` 回傳該格像素矩形, `Art.board` 給盤面邊界常數; `Art.newShapes` 給三種新外型的名稱與框內佔格; `Art.guidePages` = 說明頁總頁數(8); `Art.eventPhases` = 獎勵事件內分段的建議值(見第 7 節)
- 各事件函式的 `t` 一律為該呈現時段的進度 0~1(RD 依 spec 的呈現時長換算)
- **格位種類 `kind`**: `'empty'` / `'color'` / `'ball'`(重力球) / `'clearBall'`(清色球, v20)。方塊、ghost、預覽的 `cells[].kind` 同一套

## 3. 色票表(`Art.palette`)

| 名稱 | 色碼 | 用途 |
| --- | --- | --- |
| bg | #12141c | 全畫面底色 |
| panel / panelEdge | #1a1d29 / #2c3146 | 側欄面板底與框、面板內分隔線 |
| boardBg / grid | #1c2030 / #262b3d | 已開盤面底色 / 格線 |
| slot / slotHatch | #14161e / #232736 | 未開的預留欄 |
| boundary | #c9d1e6 | 盤面邊界(目前可放置範圍) |
| topLine / danger | #ff8a3d | **橘 = 結束 / 危險**: 盤面頂線、放棄計時、結束畫面框 |
| slimeA | #f25a4a | 色 A 紅(灰階中明度) |
| slimeB | #2657c8 | 色 B 藍(灰階最暗) |
| slimeC | #f5cc2a | 色 C 黃(灰階最亮) |
| ballBase / ballOrb / ballArrow | #353b52 / #e6e9f2 / #262b3a | 重力球: 灰藍底 + 銀白圓球 + 三色環 + 向下箭頭 |
| **wipe**(v20) | **#ff5fd0** | **洋紅 = 清色球 / 全盤清除**: 清色球外框與核心、清色球落點框、全盤清除的衝擊波與殘影框、「清色球」字樣、+500 的描邊、清色球卡片與橫幅的框 |
| **clearBallBase**(v20) | **#3a1f42** | 清色球的紫黑底 |
| clear | #ffffff | **白 = 玩家造成的消除 / 任務**: 消除標記、消除結算標記、「這次算數了」標籤、任務種類圖示、「任務完成」打勾 |
| gravity | #4fe0ff | **青 = 重力相關**: 懸空標示、重力事件、下落輪廓與拖尾、落地回饋、追加消除 |
| gravityStay | #9aa3b8 | 重力事件中「受影響但不動」的塊 |
| shave | #b58cff | **紫 = 削頂**: 削除標記、削線、任務面板與事件橫幅的「削頂」字樣與削頂圖示 |
| expand | #5fe39a | **綠 = 開欄 / 獎勵 / 新任務**: 下次開欄側、延展事件、新形狀方塊解鎖、滿寬完成、新任務公告、「已達成, 待結算」 |
| silhouette | #dfe4ef | **淺灰白 = 新外型的形狀**: 解鎖展示的中性格、v20「用新形狀方塊」面板小圖與預覽記號 |
| text / textDim | #e8ecf5 / #8a93ab | 主文字 / 次要文字(「沒有獎勵」也用 textDim) |
| outline | #0b0d13 | 盤面上文字與線條的描邊 |
| player | #ffffff | 操作中方塊的外框(契約保留名) |

`Art.slimeColors` 給 A/B/C 的中文名(紅 / 藍 / 黃)與文字用色。

## 4. 形狀語言

圓角方塊的扁平史萊姆(頂部高光、底部暗帶), 只有顏色、沒有中央記號; 萬用格是「暗底 + 三色環的圓」(重力球 = 銀球 + 向下箭頭, 清色球 = 洋紅球 + 白色四角星); 系統標示一律是「線」(框、輪廓、連接桿、箭頭、斜紋、削線、衝擊波環), 不用填滿色塊, 以免和史萊姆本體混淆。

## 5. 理念落實

- **P0 辨識度先於好看**: 三色明度拉開三檔(黃亮 / 紅中 / 藍暗), 灰階下仍分得開; 萬用格是唯一的「圓」本體(其餘都是圓角方); 清色球與重力球差三條通道(底色、核心色、符號), 盤面 / 預覽 / ghost 三處都是同一組差異
- **P1 視覺權重跟著決策迫切度走**: 最亮的是操作中方塊(白框)與落點; 事件橫幅固定在盤面上方的專屬帶(y 18~72), 任務面板三段資訊有獨立矩形, 任何事件都不疊在它們上面; 全盤清除的大演出只在結算中(輸入鎖定、沒有決策)播, +500 與衝擊波都限在盤面內, 不碰側欄
- **P2 規則上存在的東西, 畫面上就必須存在**: 懸空塊用共同輪廓 + 連接桿表達「整塊一起動」; 零位移重力事件有獨立的「內收虛線環 + 橫槓 + 無下落」; 留在盤面上的清色球一直是清色球的樣子(不淡化、不過期), 被削頂時走紫色削除、沒有洋紅觸發演出; 沒有獎勵的任務完成明寫「任務完成 / 沒有獎勵」
- **P3 一個意義一種長相**: 白 = 消除與任務、青 = 重力、紫 = 削頂、綠 = 開欄與獎勵、洋紅 = 清色球 / 全盤清除、淺灰白 = 新外型形狀、橘 = 結束; 清色球在盤面、預覽、ghost、面板圖示、獎勵卡片、全盤清除橫幅都是同一個畫家; 「三色環」只出現在萬用格上 = 萬用色; 新外型的面板小圖、預覽記號、解鎖卡片共用淺灰白; 說明頁示意圖全部直接呼叫遊戲內的畫家, 面板用遊戲內真實字樣(「已達成, 待結算」「新形狀方塊 + 清色球」)
- **P4 關鍵區分至少兩條通道**(v15 已縮邊界): 三色 = 色相 + 明度(不加符號); 重力球 vs 清色球 = 底色(灰藍 / 紫黑洋紅框) + 核心(銀 / 洋紅) + 符號(箭頭 / 四角星); 消除 / 削除 / 下落 / 全盤清除四種標記 = 顏色(白 / 紫 / 青 / 洋紅) + 形狀(縮小單框 / 斜紋 / 上方拖尾 / 鼓起爆開加碎片); 一般消除 vs 追加消除 = 顏色 + 單框 / 雙框; 觸發重力 vs 觸發全盤清除 = 青單環 / 洋紅四角星加環
- **P7 每個元素都要掙得它的版面**: 不畫史萊姆符號、同色團顆數、消除標記上的萬用格數、預覽的「含重力球 / 清色球」字樣、削頂格數、全盤清除格數; 說明頁 v20 把「做到就變寬」「整塊 / 碰到東西 / 不相連不動」「一格超出不算」的說明字拿掉, 交給圖
- **P21 示意圖要選對錯理解會分岔的例子**(v20 升為成立): 第 1 頁斜碰打叉對照; 第 4 頁相連塊停在半空的柱上(下方留洞)、不相連的懸空塊原地不動; 第 6 頁並排「整塊在頂線上 → 結束」與「只有一格超出 → 還能繼續」, 兩格只差超出的格數
- **P18 重要資訊不能只存在一瞬間**: 做到會得到什麼常駐在任務面板「得到什麼」(含「+ 清色球」); 全盤清除的 +500 同時進 HUD 分數; 解鎖的新外型之後在預覽中出現, 局終在結束畫面列出。清色球效果那一句只在獎勵事件出現, 見第 11 節

## 6. 物件表

未列 state 欄位的預設: 省略即視為「沒有 / 0 / false」。任務種類 `kind` 一律為 `'dig'`(開地)/ `'big'`(大團)/ `'newShape'`(用新形狀方塊)/ `'gravity'`(重力下落)。

| spec 物件 | 函式 | state 欄位 | 各狀態視覺 |
| --- | --- | --- | --- |
| 背景 | `drawBackground(ctx)` | — | 全畫面底色。每幀最先畫 |
| 盤面邊界 / 不可見區 | `drawBoard(ctx, s)` | `minCol`, `maxCol`(目前已開的絕對欄範圍, 開局 0 / 5) | 已開範圍: 深底 + 格線 + 淺色邊界框; 未開的欄: 斜紋預留槽; 頂線: 橘色虛線 +「頂線」小字 |
| 盤面格位 | `drawCell(ctx, s)` | `x`, `y`, `kind`: `'empty'`/`'color'`/`'ball'`/`'clearBall'`, `color`: `'A'`/`'B'`/`'C'`, `mark`: `'none'`/`'clearing'`/`'shaving'`/`'falling'`/`'wiping'`, `t` | 空: 不畫; 已填色: 純色史萊姆; 已填重力球 / 清色球: 見下兩列; **消除標記中** `'clearing'`: 白色單框 + 本體隨 t 縮小閃白; **削除標記中** `'shaving'`: 紫色斜紋 + 紫框, 本體淡出; **下落中** `'falling'`: 本體 + 上方三道青色拖尾; **全盤清除中** `'wiping'`(v20): 鼓起轉白 + 洋紅框 → 縮沒 + 八道碎片 → 洋紅殘影框(單格版; 全盤清除那一段請改用 `drawBoardWipe`, 見下)。鎖定後不區分來自哪一種方塊 |
| 重力球格位 | `drawGravityBall(ctx, s)` | `x`, `y`, `mark`, `t`(同 drawCell) | 等同 `drawCell(kind:'ball')`。已鎖定: 灰藍底銀球 + 三色環 + 向下箭頭; 成團消除中(觸發) `'clearing'` 另多一圈青色外擴環; 隨重力事件下落 `'falling'`; 被削頂 `'shaving'`(沒有青環); 隨方塊下落 → `drawPiece`。不被全盤清除移除(照常 drawCell) |
| **清色球格位(v20)** | `drawClearBall(ctx, s)` | `x`, `y`, `mark`, `t`(同 drawCell) | 等同 `drawCell(kind:'clearBall')`。**已鎖定(未成團, 一直留著)** `'none'`: 紫黑底 + 洋紅外框 + 洋紅球 + 三色環 + 白色四角星; **成團消除中(觸發全盤清除)** `'clearing'`: 白框縮小 + 洋紅四角星往外放大 + 洋紅外擴環; **隨重力事件下落** `'falling'`; **被削頂** `'shaving'`: 紫色削除, 沒有任何洋紅演出(不觸發); 在預覽中 / 隨方塊下落 / 落點 → `drawNextPreview` / `drawPiece` / `drawGhost`, 同一個畫法。**待發、作廢沒有畫面**(spec 不做倒數或待發提示) |
| 同色團 | (不需獨立函式, 見下表) | — | 成立消除且含清色球 = 團內一般格 `drawCell(mark:'clearing')` + 清色球 `drawClearBall(mark:'clearing')` |
| 懸空結構標示(常駐) | `drawFloatingMark(ctx, s)` | `cells: [{x,y}]`(一個懸空連通塊), `group`(塊序號 0,1,2…) | 一塊呼叫一次。淡青底 + 沿整塊外緣的青色虛線輪廓 + 塊內相鄰格之間的青色連接桿; group 偶數長虛線、奇數短虛線。不懸空的塊不呼叫; 全盤清除完畢後照新盤面重算 |
| 懸空結構(事件中) | `drawFloatingEventBlock(ctx, s)` | `cells: [{x,y}]`, `role`: `'fall'`/`'falling'`/`'landed'`/`'stay'`, `t` | 將下落: 青粗實線 + 向下 V; 下落中: 青粗實線 + 暗描邊(格位用 `drawCell(mark:'falling')`); 已落定: 淡青細線; 受影響但不懸空: 灰點線 + ⊥; 不受影響 = 不呼叫 |
| 落地回饋 | `drawLandingImpact(ctx, s)` | `cells: [{x,y}]`(落定座標), `t`(落地停頓 0.12 秒的進度) | 塊底面白 → 青撞擊線往兩側擴 + 兩側青色短斜線; t=1 後不呼叫 |
| 重力事件指示 | `drawGravityEvent(ctx, s)` | `x`, `y`(觸發點), `size`: `'small'`/`'large'`/`'zero'`, `counted`, `t` | 小型: 單圈青環外擴; 大型(≥10 格): 雙圈 + 八道放射線; 零位移: 灰青虛線環往內收 + 橫槓 +「無下落」; counted: 上方「[重力球] −1 次」 |
| 追加消除指示 | `drawExtraClear(ctx, s)` | `cells: [{x,y,isTarget}]`, `deducted`, `targetColor`, `t` | 每格青色雙框 + 「↓ 下落後消除」; 開地期間 isTarget 格加白色倒三角, deducted > 0 多算數標籤。格位本體照樣 `drawCell(mark:'clearing')`(其中的清色球用 `drawClearBall(mark:'clearing')`) |
| **全盤清除指示(v20)** | `drawBoardWipe(ctx, s)` | `colors: ['A'\|'B'\|'C', …]`(本次清除色, 同色一次), `cells: [{x,y,color}]`(本次被清的全部真顏色格, y>19 可一起給, 會被裁掉), `origins: [{x,y}]`(觸發的清色球在消除前的位置; 可省略, 省略時從被清格重心起跑), `t`(1.0 秒的進度) | **本段期間 `cells` 由本函式畫, RD 不要再對它們呼叫 drawCell**; 其餘格(含萬用格)照常 drawCell。演出: t 0~0.16 盤面白 + 該色一閃, 所有要被清的格同時亮白框(先說清楚「是這個顏色」); t 0.04 起洋紅粗環(內圈該色)從起點往外擴, 起點放射白線 + 四角星; **掃到哪一格哪一格爆開**(鼓起轉白 → 縮沒 + 碎片), 最遠的格約 t 0.79 爆完; 被清的位置留洋紅殘影框到 t 0.8 後淡出; t 0.32 起盤面中上方彈出「[該色史萊姆] +500」(**每種清除色一行**, 描洋紅邊), 末段淡到 30%; 橫幅「[紅色] 全盤一起消失 / 清色球生效」。**不寫格數**, 不出現任務算數回饋 |
| 全盤清除的盤面震動(選用) | `Art.wipeShake(t)` | `t`(同 drawBoardWipe) | 回傳 `{dx, dy}`(前 0.25 內衰減, 最大 5px)。要用的話只 `translate` 盤面層(`drawBoard` 到 `drawBoardWipe`), **側欄、任務面板、HUD、橫幅不震**(P11)。不接也不影響辨識 |
| 盤面邊界 | `drawBoard` | 同上 | 寬度 6~10 由 minCol/maxCol 決定 |
| 落下方塊 | `drawPiece(ctx, s)`(`drawPlayer` 為同一函式) | `cells: [{x,y,kind,color}]`(3~5 格, kind 可為 `'clearBall'`), `mode`: `'falling'`/`'softDrop'`/`'lockDelay'`/`'locked'`, `lockT` | 下落中: 本體 + 整塊白色細外框; 軟降中: 頂部白色速度線; 鎖定延遲中: 白色粗虛線框 + 隨 lockT 變亮的白罩; 已鎖定: 一幀白閃 |
| 新外型 | (見右欄) | — | 盤面 / 預覽 / 落點同一般方塊畫法; 解鎖展示見 `drawUnlockEvent`; 「用新形狀方塊」期間的面板小圖與預覽記號見任務面板與預覽兩列 |
| 落點指示(ghost) | `drawGhost(ctx, s)` | `cells: [{x,y,kind,color}]` | 每格該色細框 + 淡填; 重力球格: 銀色圓框 + 向下箭頭線稿; **清色球格(v20): 洋紅圓框 + 四角星線稿**。不含任何預測(不標會清掉哪些格) |
| 下一塊預覽 | `drawNextPreview(ctx, s)` | `cells: [{dx,dy,kind,color}]`(dy 向上為正; 最大 3×3), `masked`, **`newShapeMark`(v20)** | 右上面板置中畫整塊(格子 26); 萬用格本身就是辨識, 不另寫字(清色球 = 與獎勵事件卡片裡同一顆); **newShapeMark**: 整塊外圍淺灰白虛線框 + 右上角淺灰白標籤「[小角形] 新形狀方塊」, **只在當前任務是「用新形狀方塊」且這塊是新外型時給 true**; 遮蔽中: 只顯示「—」 |
| 任務面板(含目標色、下一次延展側) | `drawTaskProgress(ctx, s)` | `kind`, `color`(開地才給), `remaining`, `required`, `reward`: `'expand'`/`'newPiece'`/`'clearBall'`/`'shave'`/`'none'`, `shave`, **`clearBall`(v20: 主獎勵之後另附清色球)**, `side`, `fullWidthBonus`, **`newShapes: ['V','U','X']`(v20: kind 為 `'newShape'` 時的已解鎖外型)**, `announcing`, `t`, `credit` | 由上而下三段: **做什麼** = 任務圖示 + 一句話; **kind 為 newShape 且給了 newShapes**: 「做什麼」標題列右側畫「新形狀方塊: [小圖][小圖]…」(淺灰白, 只畫給的, 任務結束不給就消失); **得到什麼** = 見下表; **還差多少** = 大字數字 + 單位 + 進度條 +「已完成 / 需求」; remaining ≤ 0: 綠字「已達成, 待結算」; announcing: 面板框綠色脈動 +「新任務」標籤; credit > 0: 數字區閃白框 |
| 目標色指示 | (併入 `drawTaskProgress`) | `color` | 見下表「不需獨立函式」 |
| 下一次延展側指示(盤面上) | `drawNextExpandSide(ctx, s)` | `side`: `'left'`/`'right'`/`null`, `col` | 預留槽綠色虛線框 + 盤面下方朝外綠箭頭 +「下次開這側」; null = 不畫 |
| 消除結算標記 | `drawClearResult(ctx, s)` | `task`: `'dig'`/`'big'`/`'newShape'`/`null`, `cells: [{x,y,isTarget}]`, `groups: [{cells:[{x,y}], counted}]`, `deducted`, `targetColor`, `t` | 開地: 目標色格白色倒三角 +「[目標色] −N」; 大團 / 用新形狀方塊: 算數的團白色外擴粗輪廓 + 標籤; deducted 0 = 沒有算數回饋。不標萬用格數 |
| 延展事件指示 | `drawExpandEvent(ctx, s)` | `side`, `col`, `shave`(僅第 4 次), `t`, `next: {kind, color, required}` | 新欄綠色閃光 + 橫幅「◀ 盤面向左長一欄」; shave 時紫字「接著削頂」; t ≥ 0.7 起尾端公告 |
| 削頂指示 | `drawShaveIndicator(ctx, s)` | `cells: [{x,y}]`, `t` | 沿被削格上緣的紫色削線由左往右掃, 前端白色刀光; 不顯示格數。被削格用 `drawCell(mark:'shaving')`(清色球 / 重力球同) |
| 滿寬完成獎勵指示 | `drawFullWidthBonus(ctx, s)` | `t` | 盤面中上方綠框卡片「滿寬完成 +1,500」 |
| 新外型解鎖事件指示 | `drawUnlockEvent(ctx, s)` | `shape`: `'V'`/`'U'`/`'X'`, `shave`(d = 2), **`clearBall`(v20: d = 1)**, `t`, `next` | 橫幅「[小形狀] 解鎖新形狀方塊: 角形 / 之後會混在方塊裡出現」+ 盤面中央綠框卡片(26 格畫形狀 + 名稱)。**只有解鎖**(d = 3): 卡片保留到事件結束; **解鎖 + 削頂**(d = 2): t 0.4 起卡片淡出、副標紫字「接著削頂」; **解鎖 + 清色球**(d = 1, v20): t 0.3 起解鎖卡片上移保留、下方彈出洋紅框**清色球卡片**, 橫幅換成洋紅「[清色球] 獎勵: 清色球 / 之後會出現在方塊裡」, 兩張卡片保留到事件結束; t ≥ 0.7 起橫幅換成下一個任務公告。**d = 1 只呼叫本函式, 不另呼叫 drawClearBallEvent** |
| **清色球獎勵事件指示(v20)** | `drawClearBallEvent(ctx, s)` | `t`(1.5 秒的進度), `next` | **只用在 d = 5**(d = 1 見上)。洋紅橫幅「[清色球] 獎勵: 清色球 / 之後會出現在方塊裡」+ 盤面中央洋紅框卡片: 「清色球」+ 放大的清色球(42px, 盤面同一畫法)+ 兩行字「能當任何顏色, / 消掉它全盤同色一起消失。」(spec 定案文字); 卡片保留到事件結束, t ≥ 0.7 起橫幅換成下一個任務公告 |
| **只削頂 / 沒有獎勵的任務完成事件指示(v20)** | `drawTaskDoneEvent(ctx, s)` | `shave`(d = 4、6、8… true; d ≥ 7 奇數 false), `t`, `next` | **只削頂**: 紫框橫幅「[削頂圖示] 獎勵: 削頂」, t 0.4~0.7 由 RD 同時呼叫 `drawShaveIndicator`; **沒有獎勵**: 灰框橫幅「[白色打勾] 任務完成 / 沒有獎勵」。兩者 t ≥ 0.7 起換成下一個任務公告 |
| 暫停遮罩 | `drawPauseMask(ctx, s)` | — | 全畫面不透明遮蓋, 中央「暫停」與三行操作提示 |
| 說明畫面 | `drawGuidePage(ctx, s)` | `page`(1~8), `mode`: `'opening'`/`'ingame'`/`'gameover'` | 全畫面, 自帶標題、文字(照 guide.md v20 逐字)、示意圖、頁尾「← / A 上一頁 ・ Enter / H 關閉 ・ → / D 下一頁」, 第 1 頁上一頁與第 8 頁下一頁灰掉; opening 時關閉後綴「(開始遊戲)」 |
| 放棄計時指示 | `drawAbandonTimer(ctx, s)` | `progress`(0~1) | 左下橘框「放棄本局: 按住 R 不放」+ 剩餘秒數 + 橘色進度條; 暫停中也要畫 |
| 分數 / 分數倍率 / 最佳紀錄 / 經過時間 | `drawHud(ctx, s)` | `score`, `multiplier`, `multiplierFlash`(倍率剛變動時 1 → 0, 建議 1 秒; v20 只有延展會觸發), `best`, `time` | 右欄四塊固定面板; 倍率變動期間該面板框與數字變綠; 右下角常駐「Esc 暫停 H 說明 長按 R 放棄」 |
| 結束資訊 | `drawGameOver(ctx, s)` | `score`, `seconds`, `columns`, `shapes`, `task: {kind, color, remaining}`, `reason`: `'blockout'`/`'lockout'`/`'abandon'`, `newRecord`, `best` | 全畫面壓暗 + 中央橘框面板(不變) |

### 任務面板「得到什麼」對照(RD 照 spec 的任務序號換成這組 state)

令 d = 第幾個多樣化任務。面板字的順序 = 事件內演出順序(新形狀方塊 → 清色球 → 削頂)。

| 任務 | reward | 其他 | 面板顯示 |
| --- | --- | --- | --- |
| 第 1~3 個開地 | `'expand'` | `side` | 綠箭頭 +「盤面向左 / 右長一欄」(不寫削頂) |
| 第 4 個開地 | `'expand'` | `side:'right'`, `fullWidthBonus:true` | 「盤面向右長一欄」/「+ 削頂 + 1,500 分」 |
| d = 1 | `'newPiece'` | `clearBall:true` | 綠 ? 圖示 +「新形狀方塊」/ 洋紅「+ 清色球」 |
| d = 2 | `'newPiece'` | `shave:true` | 「新形狀方塊」/ 紫「+ 削頂」 |
| d = 3 | `'newPiece'` | — | 「新形狀方塊」 |
| d = 4、6、d ≥ 8 偶數 | `'shave'` | — | 紫色削頂圖示 + 紫「削頂」 |
| d = 5 | `'clearBall'` | — | 清色球圖示 + 洋紅「清色球」 |
| d ≥ 7 奇數 | `'none'` | — | 灰色橫槓 + 灰「沒有獎勵」 |

(舊寫法 `reward:'none', shave:true` 仍等同 `'shave'`; `'multiplier'` / `'multiplierMax'` 已刪, 傳進來視同 `'none'`。)

### 獎勵事件 → 呼叫哪個函式

| 事件 | 函式 |
| --- | --- |
| 第 1~4 個任務(延展) | `drawExpandEvent`(第 4 次 + `drawShaveIndicator` + `drawFullWidthBonus`) |
| d = 1 | `drawUnlockEvent({shape:'V', clearBall:true})` |
| d = 2 | `drawUnlockEvent({shape:'U', shave:true})` + `drawShaveIndicator`(t 0.4~0.7) |
| d = 3 | `drawUnlockEvent({shape:'X'})` |
| d = 5 | `drawClearBallEvent` |
| d = 4、6、d ≥ 8 偶數 | `drawTaskDoneEvent({shave:true})` + `drawShaveIndicator`(t 0.4~0.7) |
| d ≥ 7 奇數 | `drawTaskDoneEvent({shave:false})` |

### 不需獨立函式的 spec 物件

| spec 物件 | 由誰呈現 | 理由 |
| --- | --- | --- |
| 同色團(含「成立消除且含清色球」) | `drawCell` / `drawCell(mark:'clearing')` / `drawClearBall(mark:'clearing')` | 團本身就是一群格位; 不顯示顆數; 含清色球的團由那顆球的洋紅觸發演出表達 |
| 目標色指示 | `drawTaskProgress`「做什麼」段 | spec 明定屬任務面板; 多樣化任務期間不給 color 即不顯示 |
| 下一次延展側指示(面板內) | `drawTaskProgress`「得到什麼」段 + 盤面上的 `drawNextExpandSide` | spec 明定屬「得到什麼」 |
| 新外型 | `drawPiece` / `drawNextPreview` / `drawGhost` + `drawUnlockEvent` | 格數不同的方塊, 畫法相同 |
| 清色球的「待發」「作廢」狀態 | 無 | spec 明定不做倒數或待發提示(預測性提示); 作廢不上畫面 |
| 空洞 | `drawBoard`(空格 = 盤面底色) | spec 明定開放 / 封閉不區分 |
| 不可見區 | `drawBoard` 的頂線 + 所有盤面函式的裁切 | 規格上就是不可見 |
| 遊戲狀態 | RD 依狀態決定呼叫哪些函式 | 狀態機不是畫面物件 |
| 試玩紀錄 | 無 | 不上畫面 |

## 7. 每幀繪製層級(由下往上)

1. `drawBackground`
2. `drawBoard`
3. `drawNextExpandSide`(畫在格位之下)
4. `drawCell` / `drawGravityBall` / `drawClearBall`(所有已鎖定格位, 含 mark; **4d 期間被清的格不畫, 交給 drawBoardWipe**)
5. `drawFloatingMark`(每個懸空塊一次)/ 重力事件期間受影響的塊改 `drawFloatingEventBlock`
6. `drawGhost` → `drawPiece`
7. 結算標記(依結算時序, 同一時間只出現其中一段): `drawClearResult`(4a) → `drawGravityEvent` + `drawLandingImpact`(4b, 逐塊) → `drawExtraClear`(4c) → **`drawBoardWipe`(4d, v20)**
8. 獎勵事件(第 6 步): 見上表「獎勵事件 → 呼叫哪個函式」
9. 側欄: `drawTaskProgress`, `drawNextPreview`, `drawHud`
10. 暫停時: `drawPauseMask`; 說明畫面: `drawGuidePage`(蓋住全部)
11. 結束時: `drawGameOver`
12. 最上層: `drawAbandonTimer`(長按 R 期間, 暫停中也畫)

(選用的 `Art.wipeShake` 只包第 2~7 層。)

### 事件內的建議分段(`Art.eventPhases`)

- **延展事件(1.2 秒)**: t 0~0.3 開欄; 僅第 4 次: t 0.3~0.7 削頂(`drawShaveIndicator` 的 t = (事件 t − 0.3) / 0.4, 被削格同值); t 0.7~1 下一個任務公告
- **多樣化任務獎勵事件(1.5 秒)**: t 0~0.4 主獎勵; 僅 shave: t 0.4~0.7 削頂(t = (事件 t − 0.4) / 0.3); t 0.7~1 下一個任務公告
- **d = 1(v20)**: t 0~0.3 解鎖(角形卡片); t 0.3~0.7 清色球(`unlockClearBall`: 解鎖卡片上移、清色球卡片彈出、橫幅換洋紅); t 0.7~1 公告。兩張卡片保留到結束。RD 只要把事件 t 傳給 `drawUnlockEvent`
- **d = 5(v20)**: 整段清色球卡片; t 0.7 起橫幅換成公告
- **只削頂 / 沒有獎勵(v20)**: t 0~0.4 橫幅; 只削頂時 t 0.4~0.7 削頂; t 0.7~1 公告
- **全盤清除(4d, 1.0 秒, v20)**: 分段在 `drawBoardWipe` 內部(見物件表), RD 只給 t。多色時同一段一起演、+500 每色一行
- 削頂一律不從事件第一幀起跑
- 重力事件: 每塊依 spec 時長演出 → 落定當下 `drawLandingImpact`(0.12 秒), 該塊 role 改 `'landed'`, 下一塊才從 `'fall'` 改 `'falling'`
- 消除結算 0.4 秒期間, 懸空標示用 4a 清除後重算的結果; 全盤清除 1.0 秒期間的懸空標示用 **4d 之前**的結果, 4d 結束後才換成重算結果(清除後冒出的大量懸空塊在演出結束後一次出現)

## 8. 尺寸表

| 物件 | 像素 |
| --- | --- |
| 畫布 | 960 × 640 |
| 格位 | 26 × 26(史萊姆本體內縮約 1.5, 圓角約 7) |
| 重力球 / 清色球 | 格內圓半徑 0.36 / 0.34 × 格; 三色環線寬 0.1 / 0.09 × 格; 清色球外框 0.07 × 格、四角星外徑 0.25 × 格 |
| 盤面外框(滿寬 10 欄) | x 350~610, y 110~604(260 × 494); 開局 6 欄 = x 402~558 |
| 頂線 | y 110, 線寬 2.5 虛線 |
| 懸空輪廓 / 連接桿 | 線寬 2, 內縮 1.5 / 桿 8 × 4 |
| 下落中輪廓 | 青 3 + 暗描邊 5 |
| 落地撞擊線 | 線寬 3, 每側外擴 4 |
| 削線 | 紫 3 + 暗描邊 6, 刀光半徑 4 |
| 全盤清除衝擊波 | 洋紅 7 → 3 + 暗描邊 11 → 5, 內圈該色 3; 最大半徑 = 起點到最遠被清格 + 30 |
| 全盤清除 +500 | 40px 粗體, 白字 + 洋紅描邊 5 + 暗描邊 9; 旁邊該色史萊姆 30; 中心 (480, 278), 每色一行間距 48; 彈出最大 1.3 倍 |
| 全盤清除爆開碎片 | 8 顆, 半徑 2.2~3.2, 從格中心 12 → 34 |
| 算數標籤 | 高 22, 圖示 16, 字 13px |
| 重力事件環 | 小型最大半徑 30; 大型 56; 零位移 28 → 14 內收 |
| 事件橫幅 | x 330, y 18, 300 × 54 |
| 盤面中央卡片 | 滿寬完成 240 × 60; 新外型解鎖 200 × 176(中心 (480, 317); d = 1 時上移到 (480, 227)); **清色球 240 × 150(d = 5 中心 (480, 317); d = 1 中心 (480, 428))**, 卡片內清色球 42 |
| 左欄: 任務面板 / 放棄 | x 24, 寬 302; 任務 y 110(h 236)/ 放棄 y 548(h 56) |
| 任務面板圖示 | 做什麼 36; 得到什麼 24; **新形狀小圖每格 6(v20), 畫在做什麼標題列右側, y 中心 150** |
| 右欄: 預覽 / 分數 / 倍率 / 最佳 / 時間 | x 634, 寬 302; y 110(h140)/ 260(h80)/ 350(h48)/ 408(h48)/ 466(h48) |
| **預覽的新形狀記號(v20)** | 整塊外 5px 淺灰白虛線圓角框; 右上角標籤高 20(內含 6px 小角形 + 12px 字) |
| 下次開欄標籤 | 盤面底下 y 620 |
| 結束面板 | 380 × 360, 置中於 x 290, y 140 |
| 說明頁 | 全畫面; 標題 28px y 54; 內文 18px y 96; 示意圖 y 140~560; 頁尾帶 y 598~640 |
| 字級 | 盤面標示最小 11px; 側欄標題 12~13px; 得到什麼 15~16px; 關鍵數字 34~40px |

## 9. 相對 v18 的函式異動

| 類別 | 函式 |
| --- | --- |
| 保留(畫法不變) | `drawBackground`, `drawBoard`, `drawGravityBall`, `drawFloatingMark`, `drawFloatingEventBlock`, `drawLandingImpact`, `drawGravityEvent`, `drawExtraClear`, `drawClearResult`, `drawNextExpandSide`, `drawExpandEvent`, `drawShaveIndicator`, `drawFullWidthBonus`, `drawAbandonTimer`, `drawHud`, `drawPauseMask`, `drawGameOver` |
| 修改 | `drawCell`(新增 kind `'clearBall'`、mark `'wiping'`), `drawPiece` / `drawPlayer` / `drawGhost` / `drawNextPreview`(吃 kind `'clearBall'`; 預覽新增 `newShapeMark`), `drawTaskProgress`(reward 新增 `'clearBall'` / `'shave'`, 刪 `'multiplier'`; 新增 `clearBall`、`newShapes`), `drawUnlockEvent`(新增 `clearBall`: d = 1 接著演清色球), `drawGuidePage`(8 頁文字照 guide.md v20; 第 2、3、4 頁拿掉說明字; 第 5 頁面板改「新形狀方塊 + 清色球」; 第 6 頁新增「整塊在頂線上 / 一格超出」對照; 第 8 頁放棄那格背景改遊戲中 / 暫停各半) |
| **新增(RD 要接)** | **`drawClearBall`**(清色球格位), **`drawBoardWipe`**(全盤清除, 4d), **`drawClearBallEvent`**(d = 5 的清色球獎勵事件), **`drawTaskDoneEvent`**(只削頂 / 沒有獎勵), 選用 `Art.wipeShake(t)`; 常數 `Art.eventPhases` 新增 `unlockClearBall` |
| **刪除** | **`drawMultiplierEvent`**(倍率獎勵 v19 已刪; 改接 `drawTaskDoneEvent`) |

## 10. 本作對經驗文件的偏離(老闆回饋)

- **方塊只留顏色、拿掉形狀符號**(v15 起): 老闆回饋(史萊姆擴張 第 5 輪)「這個只是 prototype 而已, 不需要考慮色盲的情況, 只需留顏色就好」。已縮 P4 的邊界。本作的補償: 三色明度仍拉開三檔, 灰階下可分。重力球與清色球的區分不屬於「為色弱加的通道」, 照 P4 走三條通道

## 11. 與規格的張力(回報製作人, 美術不自行處理)

- **清色球的效果只在獎勵事件講一次(P18)**: 那一句只出現在獎勵事件的 1.5 秒內(d = 1 更只佔 0.3~1 的 0.6 秒加公告段); 第 1 顆要到 15 塊後才出現, 之後預覽、盤面、面板都只有球本身, 沒有地方能再查到「它會做什麼」, 說明頁依 guide 也不講。美術照 spec 做, 讓球在各處長得一模一樣來承擔「認得出」; 若試玩出現「那顆粉紅的是什麼」, 可考慮在任務面板或預覽旁留一行效果字
- **削頂一詞沒有解釋**(v18 起沿用): 玩家第一次讀到「削頂」是第 4 個開地任務, 此前沒有地方解釋; 讀法交給削線演出
- **全盤清除後的懸空標示時點**: spec 寫 4d 完畢後重算。美術建議 4d 演出期間維持 4d 前的標示、結束才換(見第 7 節), 否則大量新懸空框會在爆開途中冒出來, 與演出搶注意力; 若 RD 照「清除完畢」理解本來就是這樣, 此條無需處理
