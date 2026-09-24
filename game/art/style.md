# 史萊姆擴張 v15 美術規格

RD 只讀這份。對應 `spec.md` v15 / `guide.md` v15。函式全掛在 `window.Art`, 參數固定 `(ctx, state)`, 各自 save / restore。沿用 v13 美術的色票、形狀語言與版面骨架; 本版只改規格變動牽涉到的物件(異動清單見第 9 節)。

**index.html 必須宣告 `<meta charset="utf-8">`**(art.js 內含中文字串; 沒宣告在 file:// 下會亂碼)。字型只用系統字(微軟正黑體 → PingFang TC → Noto Sans TC → sans-serif), 不載外部資源。

## 1. 邏輯畫布尺寸

**960 × 640**(`Art.canvas`)。格子邊長 **26**(`Art.cellSize`)。

## 2. 座標約定(盤面類函式共用)

- `x` = **絕對欄**(-2 ~ 7, 開局 0~5), `y` = **列**(1 = 最底列, 19 = 頂列, 20 以上 = 不可見區)。與 spec 的座標系相同, RD 不需換算
- `y` 可帶小數(重力下落、方塊下落的插值), 同一組格位要有相同的小數部分
- **盤面外框固定為滿寬 10 欄**: 絕對欄 -2 的左緣永遠在 x=350, 右緣 x=610; 列 1 底緣 y=604, 列 19 上緣 y=110。延展時盤面不位移, 未開的欄畫成「預留槽」(斜紋暗格)
- 所有盤面類函式會把內容裁切在列 1~19 內, **y > 19 的格位傳進來也不會畫出來**(不可見區), RD 不必自己過濾
- `Art.cellRect(x, y)` 回傳該格像素矩形, `Art.board` 給盤面邊界常數; `Art.newShapes` 給三種新外型的名稱與框內佔格(僅供參考, 美術用它畫解鎖展示); `Art.guidePages` = 說明頁總頁數(8)
- 各事件函式的 `t` 一律為該呈現時段的進度 0~1(RD 依 spec 的呈現時長換算)

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
| ballBase / ballOrb / ballArrow | #353b52 / #e6e9f2 / #262b3a | 重力球: 暗底 + 銀白圓球 + 三色環 + 向下箭頭 |
| clear | #ffffff | **白 = 玩家造成的消除**: 消除標記、消除結算標記、「這次算數了」標籤 |
| gravity | #4fe0ff | **青 = 重力相關**: 懸空標示、重力事件、下落輪廓與拖尾、落地回饋、追加消除 |
| gravityStay | #9aa3b8 | 重力事件中「受影響但不動」的塊 |
| shave | #b58cff | **紫 = 削頂**: 削除標記、削線、任務面板「每欄最上面削掉一格」 |
| expand | #5fe39a | **綠 = 開欄 / 獎勵 / 新任務**: 下次開欄側、延展事件、新方塊解鎖、倍率獎勵、滿寬完成、新任務公告 |
| silhouette | #dfe4ef | 新外型解鎖展示用的中性格(只示形狀, 不帶顏色) |
| text / textDim | #e8ecf5 / #8a93ab | 主文字 / 次要文字 |
| outline | #0b0d13 | 盤面上文字與線條的描邊 |
| player | #ffffff | 操作中方塊的外框(契約保留名) |

`Art.slimeColors` 給 A/B/C 的中文名(紅 / 藍 / 黃)與文字用色。

## 4. 形狀語言

圓角方塊的扁平史萊姆(頂部高光、底部暗帶), **v15 起只有顏色、沒有中央記號**; 系統標示一律是「線」(框、輪廓、連接桿、箭頭、斜紋、削線), 不用填滿色塊, 以免和史萊姆本體混淆。

## 5. 理念落實

- **P0 辨識度先於好看**: 三色明度拉開三檔(黃亮 / 紅中 / 藍暗), 灰階下仍分得開; 重力球是唯一的圓形本體(其餘都是圓角方), 不放任何裝飾性背景
- **P1 視覺權重跟著決策迫切度走**: 最亮的是操作中方塊(白框)與落點; 事件橫幅固定在盤面上方的專屬帶(y 18~72), 任務面板的三段資訊有獨立矩形, 任何事件都不疊在它們上面
- **P2 規則上存在的東西, 畫面上就必須存在**: 懸空塊用共同輪廓 + 連接桿表達「整塊一起動」; 零位移重力事件有獨立的「內收虛線環 + 橫槓 + 無下落」; 下一次延展側、削頂、做到會得到什麼全部寫在常駐的任務面板裡; 削頂用一條沿輪廓的削線畫出「削的是最上面一層皮」
- **P3 一個意義一種長相**: 白 = 消除與算數、青 = 重力、紫 = 削頂、綠 = 開欄與獎勵、橘 = 結束; 任務種類圖示(目標色史萊姆 / 5+ / 兩團 / 重力球)在任務面板、算數標籤、新任務公告、結束畫面共用; 說明頁示意圖全部直接呼叫遊戲內的畫家
- **P4 關鍵區分至少兩條通道**(v15 縮邊界, 見第 10 節): 三色 = 色相 + 明度(不再加符號); 消除 / 削除 / 下落三種標記 = 顏色(白 / 紫 / 青) + 形狀(縮小單框 / 斜紋 / 上方拖尾); 一般消除 vs 追加消除 = 顏色(白 / 青) + 形狀(單框 / 雙框加「↓ 下落後消除」); 重力事件中的塊 = 顏色 + 線型(將落: 青實線 + V / 下落中: 青粗實線加暗描邊 / 已落定: 淡青細線 / 不動: 灰點線 + ⊥)
- **P7 每個元素都要掙得它的版面**: 拿掉史萊姆符號、同色團顆數、消除標記上的重力球數、預覽的「含重力球」字樣、削頂格數 — 本體已經一眼可讀的資訊不再重述
- **P18 重要資訊不能只存在一瞬間**: 做到會得到什麼常駐在任務面板「得到什麼」; 倍率變動留在 HUD 倍率欄; 解鎖的新外型之後在下一塊預覽中出現, 局終在結束畫面列出已解鎖新方塊數

## 6. 物件表

未列 state 欄位的預設: 省略即視為「沒有 / 0」。

| spec 物件 | 函式 | state 欄位 | 各狀態視覺 |
| --- | --- | --- | --- |
| 背景 | `drawBackground(ctx)` | — | 全畫面底色。每幀最先畫 |
| 盤面邊界 / 不可見區 | `drawBoard(ctx, s)` | `minCol`, `maxCol`(目前已開的絕對欄範圍, 開局 0 / 5) | 已開範圍: 深底 + 格線 + 淺色邊界框; 未開的欄: 斜紋預留槽; 頂線: 橘色虛線 +「頂線」小字。寬度 6~10 由 minCol/maxCol 決定 |
| 盤面格位 | `drawCell(ctx, s)` | `x`, `y`, `kind`: `'empty'`/`'color'`/`'ball'`, `color`: `'A'`/`'B'`/`'C'`, `mark`: `'none'`/`'clearing'`/`'shaving'`/`'falling'`, `t` | 空: 不畫(盤面底色即空格, 開放 / 封閉空洞不區分); 已填色: 純色史萊姆(無記號); 已填球: 重力球; **消除標記中**: 白色單框 + 本體隨 t 縮小閃白; **削除標記中**: 紫色斜紋 + 紫框, 本體淡出; **下落中**: 本體 + 上方三道青色拖尾(`y` 給插值座標) |
| 重力球格位 | `drawGravityBall(ctx, s)` | `x`, `y`, `mark`, `t`(同 drawCell) | 等同 `drawCell` 的 `kind:'ball'`。已鎖定: 暗底銀球 + 三色環 + 向下箭頭; **成團消除中(觸發)** = `'clearing'`, 另多一圈青色外擴環; 隨重力事件下落 = `'falling'`; **被削頂 = `'shaving'`, 沒有青色環**(削頂不觸發); 隨方塊下落 → 由 `drawPiece` 畫 |
| 懸空結構標示(常駐) | `drawFloatingMark(ctx, s)` | `cells: [{x,y}]`(一個懸空連通塊), `group`(塊序號 0,1,2…) | 一塊呼叫一次。淡青底 + 沿整塊外緣的青色虛線輪廓 + 塊內相鄰格之間的青色連接桿; group 偶數長虛線、奇數短虛線, 斜角相碰的兩塊也分得開。不懸空的塊不呼叫。**不表達下落格數** |
| 懸空結構(事件中) | `drawFloatingEventBlock(ctx, s)` | `cells: [{x,y}]`(該塊**當下**座標, 下落中給插值 y), `role`: `'fall'`/`'falling'`/`'landed'`/`'stay'`, `t` | 重力事件期間受影響的每一塊呼叫一次(取代該塊的 drawFloatingMark): **將下落(排隊中)** `'fall'` = 青色粗實線輪廓 + 每欄最低格下方向下 V; **下落中** `'falling'` = 青色粗實線 + 暗描邊輪廓(剛體外框), 格位本體用 `drawCell(mark:'falling')`; **已落定** `'landed'` = 淡青細實線; **受影響但不懸空** `'stay'` = 灰色點線 + ⊥ 錨; **不受影響** = 不呼叫(照常用 drawFloatingMark) |
| 落地回饋 | `drawLandingImpact(ctx, s)` | `cells: [{x,y}]`(剛落定那一塊的落定座標), `t`(落地停頓 0.12 秒的進度) | 塊底面每格底緣一道白 → 青的撞擊線往兩側擴, 塊最低處左右各噴三道青色短斜線; 每塊落定時各出現一次, t=1 後不呼叫 |
| 重力事件指示 | `drawGravityEvent(ctx, s)` | `x`, `y`(觸發點: 含球團的錨點或球原位), `size`: `'small'`/`'large'`/`'zero'`, `counted`(當前任務為重力下落且本事件算數), `t` | 小型(<10 格): 單圈青環外擴; 大型(≥10 格): 雙圈 + 八道放射線; **零位移**: 灰青虛線環「往內收」+ 中央橫槓 + 上方「無下落」字樣(零位移永遠不算數); **counted**: 觸發點上方多一個算數標籤「[重力球] −1 次」。消失 = 不呼叫。多事件依序各呼叫, 不合併 |
| 追加消除指示 | `drawExtraClear(ctx, s)` | `cells: [{x,y,isTarget}]`, `deducted`(開地任務期間本段扣了幾顆), `targetColor`, `t` | 每格青色雙框 + 團上方「↓ 下落後消除」標籤; 開地任務期間 isTarget 格加左下白色倒三角, deducted > 0 時標籤上方多一個算數標籤「[目標色] −N」。**大團 / 雙消期間不給 deducted**(追加消除不推進這兩種)。格位本體照樣用 `drawCell(mark:'clearing')` 畫, 本函式疊在上面 |
| 消除結算標記 | `drawClearResult(ctx, s)` | `task`: `'dig'`/`'big'`/`'double'`/`null`(第 1 步取樣的當前任務; 重力下落期間給 null), `cells: [{x,y,isTarget}]`(開地用), `groups: [{cells:[{x,y}], counted}]`(大團 / 雙消用), `deducted`(本次推進量), `targetColor`, `t` | **開地**: 目標色格左下角白色倒三角(= 扣 1) + 算數標籤「[目標色史萊姆] −N」; **大團**: n≥5 的團(`counted:true`)整團白色外擴粗輪廓 + 標籤「[5+] −N 團」; **雙消**: 這次同時消掉的各團都 `counted:true`, 各自白色外擴輪廓 + 標籤「[兩團] −1 次」; deducted 為 0 = 只有消除標記, 沒有任何算數回饋。**不標示團內重力球數**。標籤隨 t 上浮, 末段淡出 |
| 落下方塊 | `drawPiece(ctx, s)`(`drawPlayer` 為同一函式) | `cells: [{x,y,kind,color}]`(3~5 格, 含新外型), `mode`: `'falling'`/`'softDrop'`/`'lockDelay'`/`'locked'`, `lockT`(鎖定延遲進度 0~1) | 下落中: 本體 + 整塊白色細外框; 軟降中: 另加頂部白色速度線; 鎖定延遲中: 白色粗虛線框 + 隨 lockT 變亮的白色罩; 已鎖定: 一幀白閃(之後改由 drawCell 畫)。y>19 的格自動看不見 |
| 新外型 | (見右欄) | — | 盤面上 / 預覽中 / 落點都跟一般方塊同一套畫法(`drawPiece` / `drawNextPreview` / `drawGhost` 本來就吃任意格數); 解鎖當下的展示見 `drawUnlockEvent`。「未解鎖 / 已解鎖 / 已加入發牌」是發牌狀態, 沒有對應畫面 |
| 落點指示(ghost) | `drawGhost(ctx, s)` | `cells: [{x,y,kind,color}]` | 每格: 該色細框 + 淡填; 球格: 銀色圓框 + 向下箭頭線稿。不含任何預測 |
| 下一塊預覽 | `drawNextPreview(ctx, s)` | `cells: [{dx,dy,kind,color}]`(相對格, dy 向上為正; 最大 3×3), `masked` | 右上面板置中畫整塊(格子 26, 與盤面同尺寸); 球格本身就是辨識, **不另寫「含重力球」**; 遮蔽中: 面板只顯示「—」 |
| 任務面板(含目標色指示、下一次延展側的文字) | `drawTaskProgress(ctx, s)` | `kind`: `'dig'`/`'big'`/`'double'`/`'gravity'`, `color`(開地任務的目標色; 其他種類不給), `remaining`, `required`, `reward`: `'expand'`/`'newPiece'`/`'multiplier'`/`'multiplierMax'`, `side`: `'left'`/`'right'`(reward 為 expand 時), `fullWidthBonus`(第 4 個開地任務 = true), `announcing`, `t`, `credit`(本次結算推進了進度時 1 → 0 遞減, 建議 0.4 秒) | 左欄常駐面板, 由上而下三段: **做什麼** = 任務圖示 + 一句話(開地「消掉 [紅色] 史萊姆」, 色名用該色; 大團「消掉一團 5 顆以上的史萊姆」; 雙消「一塊放下, 同時消掉兩團」; 重力下落「用重力球讓懸空的史萊姆掉下來」); **得到什麼** = expand「盤面向左/右長一欄(+ 1,500 分)」綠字 + 「每欄最上面削掉一格」紫字 / newPiece「? 一種新方塊・之後會混在方塊裡出現」(不透露外型) / multiplier「分數倍率 +0.25」 / multiplierMax「分數倍率(已達上限)」灰字; **還差多少** = 大字數字 + 單位(顆 / 團 / 次)+ 進度條(開地用目標色填, 其他用白)+「已完成 / 需求」; **remaining ≤ 0**: 綠字「已達成, 待結算」, 進度條全滿變綠, 不顯示負數; **announcing(下一個任務公告中)**: 面板框變綠並脈動, 右上角綠色「新任務」標籤; **credit > 0**: 數字區閃白框。不顯示任務序號、不出現規格內部名稱 |
| 下一次延展側指示(盤面上) | `drawNextExpandSide(ctx, s)` | `side`: `'left'`/`'right'`/`null`, `col`(下一次會開的絕對欄: 左 = minCol−1, 右 = maxCol+1) | 在那一格預留槽畫綠色虛線框, 盤面下方畫朝外的綠箭頭 +「下次開這側」。`side` 為 null(已滿寬) = 不畫。與任務面板「得到什麼」的文字同時存在 |
| 延展事件指示 | `drawExpandEvent(ctx, s)` | `side`, `col`(本次新開的絕對欄), `t`, `next: {kind, color, required}`(下一個任務) | 新欄整條綠色閃光 + 朝外箭頭; 上方橫幅「◀ 盤面向左長一欄 / 同時削頂: 每欄最上面削掉一格」; **t ≥ 0.7 起橫幅換成尾端公告**「[新任務] 還差 N 單位 / [圖示] 做什麼」。需同時呼叫 `drawTaskProgress(announcing:true)` 並把面板換成新任務 |
| 削頂指示 | `drawShaveIndicator(ctx, s)` | `cells: [{x,y}]`(本次被削的格, 每欄至多 1 格), `t`(削線掃過進度 0~1) | 沿被削格的上緣畫一條連貫的紫色削線(相鄰欄以台階接上 = 沿盤面輪廓), 由左往右掃過, 前端帶白色刀光; **不顯示任何格數**。被削格本體用 `drawCell(mark:'shaving')` |
| 滿寬完成獎勵指示 | `drawFullWidthBonus(ctx, s)` | `t` | 盤面中上方綠框黑底卡片「滿寬完成 +1,500」, 開頭 0.12 內彈出。只在第 4 次延展事件內呼叫 |
| 新外型解鎖事件指示 | `drawUnlockEvent(ctx, s)` | `shape`: `'V'`/`'U'`/`'X'`, `t`, `next: {kind, color, required}` | 上方橫幅「[小形狀] 解鎖新方塊: 角形 / 之後會混在方塊裡出現」; 盤面中央綠框卡片「新方塊」+ 用盤面同尺寸(26)中性格畫出的形狀 + 形狀名(角形 / 杯形 / 十字形), 開頭 0.12 內彈出; **t ≥ 0.7 起橫幅換成下一個任務公告**, 卡片保留到事件結束 |
| 倍率獎勵事件指示 | `drawMultiplierEvent(ctx, s)` | `amount`(預設 0.25), `value`(獎勵後倍率), `capped`(已達上限), `t`, `next` | 橫幅, 左側綠「×」: 一般「獎勵: 分數倍率 +0.25 / 倍率變為 ×1.85」; 已達上限「獎勵: 分數倍率(已達上限) / 維持 ×2.50」。t ≥ 0.7 起換成下一個任務公告。建議同時讓 `drawHud` 的 `multiplierFlash` 從 1 起跳 |
| 暫停遮罩 | `drawPauseMask(ctx, s)` | — | 全畫面不透明遮蓋(盤面、懸空標示、任務面板、預覽都不可讀), 中央「暫停」與三行操作提示 |
| 說明畫面 | `drawGuidePage(ctx, s)` | `page`(1~8), `mode`: `'opening'`/`'ingame'`/`'gameover'` | 全畫面, 自帶標題、文字、示意圖、頁尾。頁尾固定「← / A 上一頁 ・ Enter / H 關閉 ・ → / D 下一頁」, 第 1 頁的上一頁與第 8 頁的下一頁灰掉; opening 時關閉後綴「(開始遊戲)」。局中叫出時整張蓋在暫停遮罩之上 |
| 放棄計時指示 | `drawAbandonTimer(ctx, s)` | `progress`(已按住秒數 / 1 秒, 0~1) | 左下橘框面板「放棄本局: 按住 R 不放」+ 剩餘秒數 + 橘色進度條。消失 = 不呼叫。暫停中也要畫, 畫在暫停遮罩之後 |
| 分數 / 分數倍率 / 最佳紀錄 / 經過時間 | `drawHud(ctx, s)` | `score`, `multiplier`, `multiplierFlash`(倍率剛變動時 1 → 0 遞減, 建議 1 秒), `best`(null = 尚無紀錄), `time`(本局經過秒數) | 右欄四塊固定面板; 倍率變動期間該面板框與數字變綠; 右下角常駐「Esc 暫停 H 說明 長按 R 放棄」 |
| 結束資訊 | `drawGameOver(ctx, s)` | `score`, `seconds`, `columns`(已解鎖欄數 0~4), `shapes`(已解鎖新外型數 0~3), `task: {kind, color, remaining}`(局終停在的任務), `reason`: `'blockout'`/`'lockout'`/`'abandon'`, `newRecord`, `best` | 全畫面半透明壓暗(凍結的盤面仍可見)+ 中央橘框面板: 標題、結束原因(新方塊沒有位置了 / 放下的方塊整塊卡在頂線上 / 玩家放棄)、分數大字、破紀錄時綠色「新紀錄!」、存活 / 已解鎖欄數 / 已解鎖新方塊 / 最佳紀錄、「停在的任務」(圖示 + 做什麼 + 還差 N)、放棄局加註「放棄局不更新紀錄」、底部「R 重開 H 說明」 |

### 不需獨立函式的 spec 物件

| spec 物件 | 由誰呈現 | 理由 |
| --- | --- | --- |
| 同色團 | `drawCell` + `drawCell(mark:'clearing')` | 團本身就是一群格位; v15 不顯示顆數, 未達門檻就是盤面本身, 成立消除由消除標記表達 |
| 目標色指示 | `drawTaskProgress`「做什麼」段 | spec 明定它屬任務面板「做什麼」的內容; 拆成獨立面板會讓同一件事出現兩次。多樣化任務期間不給 color 即不顯示 |
| 新外型 | `drawPiece` / `drawNextPreview` / `drawGhost` + `drawUnlockEvent` | 它就是格數不同的方塊, 畫法與一般方塊相同; 唯一的專屬畫面是解鎖展示 |
| 空洞 | `drawBoard`(空格 = 盤面底色) | spec 明定開放 / 封閉不做區分呈現 |
| 不可見區 | `drawBoard` 的頂線 + 所有盤面函式的裁切 | 規格上就是不可見 |
| 遊戲狀態 | RD 依狀態決定呼叫哪些函式 | 狀態機本身不是畫面物件 |
| 試玩紀錄 | 無 | 不上畫面 |

## 7. 每幀繪製層級(由下往上)

1. `drawBackground`
2. `drawBoard`
3. `drawNextExpandSide`(畫在格位之下, 虛線框只落在空的預留槽)
4. `drawCell`(所有已鎖定格位, 含 mark)
5. `drawFloatingMark`(每個懸空塊一次)/ 重力事件期間受影響的塊改 `drawFloatingEventBlock`
6. `drawGhost` → `drawPiece`
7. 結算標記(依結算時序, 同一時間只出現其中一段): `drawClearResult`(4a) → `drawGravityEvent` + `drawLandingImpact`(4b, 逐塊) → `drawExtraClear`(4c)
8. 獎勵事件(第 6 步, 三選一): `drawExpandEvent` + `drawShaveIndicator` + `drawFullWidthBonus`(第 4 次) / `drawUnlockEvent` / `drawMultiplierEvent`
9. 側欄: `drawTaskProgress`, `drawNextPreview`, `drawHud`
10. 暫停時: `drawPauseMask`(蓋住以上全部); 說明畫面: `drawGuidePage`(蓋住全部)
11. 結束時: `drawGameOver`
12. 最上層: `drawAbandonTimer`(長按 R 期間, 暫停中也畫)

### 事件內的建議分段(同一個 1.2 秒事件內, 讓玩家分得出三件事)

- 延展事件: t 0~0.3 新欄閃光(開欄); **t 0.3~0.7 削頂**: `drawShaveIndicator` 的 t = (事件 t − 0.3) / 0.4, 被削格 `drawCell(mark:'shaving', t 同值)`; t 0.7~1 下一個任務公告。削頂不要從 t=0 起跑, 否則會和剛結束的消除結算讀成同一批(第 5 輪回饋「以為只有削頂」)
- 重力事件: 每塊依 spec 時長演出 → 落定當下 `drawLandingImpact`(0.12 秒), 該塊 role 改 `'landed'`, 下一塊才從 `'fall'` 改 `'falling'`
- 消除結算 0.4 秒期間, 懸空標示用 4a **清除後重算**的結果(spec 4a 的順序), 說明頁第 4 頁照這個時點畫

## 8. 尺寸表

| 物件 | 像素 |
| --- | --- |
| 畫布 | 960 × 640 |
| 格位 | 26 × 26(史萊姆本體內縮約 1.5, 圓角約 7) |
| 盤面外框(滿寬 10 欄) | x 350~610, y 110~604(260 × 494); 開局 6 欄 = 絕對欄 0~5 = x 402~558 |
| 頂線 | y 110, 線寬 2.5 虛線 |
| 懸空輪廓 / 連接桿 | 線寬 2, 內縮 1.5 / 桿 8 × 4 |
| 下落中輪廓 | 青 3 + 暗描邊 5 |
| 落地撞擊線 | 線寬 3, 每側外擴 4 |
| 削線 | 紫 3 + 暗描邊 6, 刀光半徑 4 |
| 算數標籤 | 高 22, 圖示 16, 字 13px |
| 大團 / 雙消算數輪廓 | 白 3 + 暗描邊 5.5, 外擴 1 |
| 重力事件環 | 小型最大半徑 30; 大型 56; 零位移 28 → 14 內收 |
| 事件橫幅 | x 330, y 18, 300 × 54 |
| 盤面中央卡片 | 滿寬完成 240 × 60; 新外型解鎖 200 × 176; 中心 (480, 317) |
| 左欄: 任務面板 / 放棄 | x 24, 寬 302; 任務 y 110(h 236: 做什麼 y 110~206、得到什麼 y 206~274、還差多少 y 274~346)/ 放棄 y 548(h 56) |
| 右欄: 預覽 / 分數 / 倍率 / 最佳 / 時間 | x 634, 寬 302; y 110(h140)/ 260(h80)/ 350(h48)/ 408(h48)/ 466(h48) |
| 下次開欄標籤 | 盤面底下 y 620 |
| 結束面板 | 380 × 360, 置中於 x 290, y 140 |
| 說明頁 | 全畫面; 標題 28px y 54; 內文 16px 自 y 92 起行距 24; 頁尾帶 y 598~640 |
| 字級 | 盤面標示最小 11px; 側欄標題 12~13px; 關鍵數字 34~40px |

## 9. 相對 v13 的函式異動

| 類別 | 函式 |
| --- | --- |
| 保留(畫法不變) | `drawBackground`, `drawBoard`, `drawGravityBall`, `drawFloatingMark`, `drawPiece` / `drawPlayer`, `drawNextExpandSide`, `drawFullWidthBonus`, `drawAbandonTimer`, `drawHud`, `drawPauseMask` |
| 修改 | `drawCell`(史萊姆拿掉記號), `drawGhost`(拿掉記號線稿), `drawNextPreview`(拿掉「含重力球」字樣, 支援 3×3), `drawFloatingEventBlock`(新增 role `'falling'` / `'landed'`), `drawGravityEvent`(新增 `counted`), `drawExtraClear`(開地算數回饋), `drawClearResult`(state 改: 拿掉 `balls`, 新增 `task` / `groups`), `drawTaskProgress`(state 全改: 做什麼 / 得到什麼 / 還差多少), `drawExpandEvent`(state 改: 拿掉 `K` / `nextColor` / `nextRequired`, 改 `next`), `drawShaveIndicator`(state 改: `perCol` / `total` → `cells` / `t`, 不再顯示格數), `drawGameOver`(state 改: `stage` → `shapes` + `task`), `drawGuidePage`(8 頁) |
| 新增(RD 要接) | `drawLandingImpact`, `drawUnlockEvent`, `drawMultiplierEvent` |
| 刪除 | `drawClusterCount`(spec 刪顆數), `drawSupplyRemaining`(spec 刪重力球補給), `drawExtendReward`(spec 刪延伸關卡獎勵, 改由 drawUnlockEvent / drawMultiplierEvent), `drawTargetColor`(併入 drawTaskProgress「做什麼」) |

## 10. 本作對經驗文件的偏離(老闆回饋)

- **方塊只留顏色、拿掉形狀符號**: 老闆回饋(史萊姆擴張 第 5 輪)「這個只是 prototype 而已, 不需要考慮色盲的情況, 只需留顏色就好」。與成立理念 P4 的無障礙經驗直接衝突, 依降格規則**先縮 P4 的邊界**(prototype 階段、老闆明言不考慮色覺異常時, 顏色編碼不另加符號通道), P4 其餘適用範圍不變。本作的補償: 三色明度仍拉開三檔, 灰階下可分
