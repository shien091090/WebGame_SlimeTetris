# Art 規格 (spec v9)

RD 只讀這份。`window.Art` 為全域物件, 非 ES module。所有函式簽章固定為 `draw***(ctx, state)`(`drawBackground` 只有 `ctx`), 每個函式自行 save/restore, 不留狀態污染。

---

## 1. 邏輯畫布尺寸

| 項目 | 值 |
| --- | --- |
| 畫布 | **960 × 640**(`Art.canvas.width / height`) |
| 格子邊長 | 26 |
| 可見列 | 19(列 1 最底 ~ 列 19 最頂), 列 20 以上不畫 |
| 盤面下緣 y | 606(列 1 的下緣) |
| 盤面上緣 y | 112(列 19 的上緣) |
| 中線 x | **480**(絕對欄 2\|3 接縫, 固定不動) |
| 滿寬盤面 x 範圍 | 350 ~ 610(絕對欄 −2 左緣 ~ 絕對欄 7 右緣) |

座標換算(`Art` 已匯出, 請直接用, 不要自己再算一份):

```js
Art.colToX(absCol)      // 該絕對欄的左緣 x = 480 + (absCol - 3) * 26
Art.rowToY(row)         // 該列的上緣 y = 606 - row * 26
Art.cellRect(absCol,row)// { x, y, w:26, h:26 }
Art.slimeColor('A'|'B'|'C'|0|1|2)  // 取色碼
Art.metrics             // { cell, rowsVisible, boardTop, boardBottom, midX, fullLeft, fullRight }
```

**重要**: 中線恆在畫布正中(480), 盤面由中線往左右長。因此延展時既有格位的螢幕座標**完全不動**, 只有新欄出現在外側 — 與「絕對欄不重編號」一致, RD 不需要做任何鏡頭平移。

版面分區(面板底板由 `drawBackground` 畫好, 其餘函式只往裡填):

| 區塊 | 矩形 | 內容 |
| --- | --- | --- |
| 分數框 | (24,16,314,96) | `drawHud` 的分數 / 最佳 |
| 中央框 | (352,16,256,88) | `drawHud` 的時間 / 倍率 / 寬度 / 遊戲狀態 |
| NEXT 框 | (622,16,314,96) | `drawNextPreview` |
| 左情報板 | (24,130,314,186) | `drawTargetColor` / `drawExpensiveSide` / `drawUnlockProgress` / `drawPendingExpand`(side='left') |
| 右情報板 | (622,130,314,186) | 同上(side='right') |
| 左改選卡 | (24,332,314,180) | `drawColorPick`(side='left') |
| 右改選卡 | (622,332,314,180) | `drawColorPick`(side='right') |
| 重開按鈕 | (380,452,200,46) | `Art.restartHitbox()` |

改選卡與盤面(x 350~610)**完全不重疊**, 符合「改選期間盤面不遮蔽」。

命中測試用:
```js
Art.pickHitboxes('left'|'right') // [左候選rect, 右候選rect], index 0=左候選(←/A), 1=右候選(→/D)
Art.restartHitbox()              // 結束畫面的重開區域
```

---

## 2. 色票

| 名稱 | 色碼 | 用途 |
| --- | --- | --- |
| `bg` | `#0b111c` | 畫布底色(帶中央徑向微光) |
| `well` | `#070b13` | 盤面井底; 左半 `#0c1320` / 右半 `#090f1a` 有極輕微色差, 強化半盤歸屬 |
| `frame` | `#33456a` | 盤面左右牆與底 |
| `midline` | `#f2f7ff`(近白) | **中線**。刻意選中性色, 與三個史萊姆色皆不衝突 |
| `slimeA` | `#4ee39f` | 史萊姆色 A(綠) |
| `slimeB` | `#ffab2e` | 史萊姆色 B(橙) |
| `slimeC` | `#a78bff` | 史萊姆色 C(紫) |
| `ghost` | `#9fb4d8` | ghost 外框基準(實際每格用自己的顏色描邊) |
| `text` | `#e9f0ff` | 主文字 |
| `textDim` | `#8ba0c4` | 次要文字、標籤 |
| `accent` | `#ffd54a`(金) | 分數、解鎖達成、合格格標記、滿寬獎勵、改選框 |
| `expensive` | `#ff5f6d`(紅) | 昂貴側、放棄計時、結束原因 |
| `cheap` | `#5fd0ff` | 便宜側 |
| `expand` | `#7ee8ff`(青) | 延展事件、新欄、待延展 |
| `trim` | `#7ee8ff`(青) | 延展獎勵削除(與延展同色系, 因為它屬同一事件) |
| `mask` | `rgba(6,10,18,0.90)` | 暫停遮罩 |

色相選擇理由: 三個史萊姆色為 綠 / 橙 / 紫, 三向色相分離, 明度也錯開; 所有**系統色**(金 / 青 / 紅 / 近白)刻意不落在史萊姆色相上, 因此「這是史萊姆」與「這是回饋」永遠分得開。

---

## 3. 形狀語言

**扁平圓角、無粗外框、系統資訊一律用色環與細線**: 史萊姆是 26px 內縮 1.5px 的圓角方塊(R7), 帶單一左上高光與底部暗面; 所有回饋(消除、削除、延展、合格)都以**外框 / 環 / 箭頭 / 橫線**表達, 絕不改變史萊姆本體的顏色, 讓顏色永遠是最可信的讀數。

---

## 4. 物件表

呼叫順序(由後往前疊, 照這個順序畫):

```
drawBackground → drawBoard → drawCell(每個已鎖定格位) → drawClusterCount(每團)
→ drawGhost → drawPiece → drawMidline
→ drawClearMark / drawExpandEvent / drawTrimEffect / drawFullWidthBonus(當下有才畫)
→ drawHud → drawNextPreview → drawTargetColor×2 → drawExpensiveSide → drawUnlockProgress×2 → drawPendingExpand×2
→ drawColorPick(改選中) → drawAbandonGauge(長按中) → drawPauseOverlay / drawGameOver
```

**`drawMidline` 必須畫在格位與方塊之上**, 這是「中線全程可見」的實作要求。線寬 2px 走在格位間的縫隙上, 不會蓋掉任何顏色。

| spec 物件 | 函式 | state 欄位 | 狀態視覺差異 |
| --- | --- | --- | --- |
| 盤面邊界 / 空洞 / 不可見區 | `drawBoard(ctx, state)` | `{ minCol, maxCol, newCols:[absCol…], newColT:0~1 }` | 只畫當前寬度的井與格線; **空格位 = 井底本色**, 因此任何洞(開放或封閉)都是一眼可見的暗格, 且**兩者不做區分**(依 spec)。背景另有 4 個未解鎖欄的虛線槽位, 玩家看得到「還能開多少」。`newCols` 的欄以青色底 + 青框標示, `newColT` 0→1 由亮轉常態。盤頂有 34px 漸層淡出, 表示列 20 以上無硬界 |
| 中線 | `drawMidline(ctx, state)` | `{ emphasis?:0~1 }` | 近白虛線 + 黑描邊(任何底色上都讀得到), 上下端菱形端點, 盤頂內側標「左半 / 右半」。`emphasis` 只加亮度, 可不給 |
| 盤面格位 | `drawCell(ctx, state)` | `{ col, row, color:'A'\|'B'\|'C', mark:null\|'clear'\|'trim', markT:0~1 }` | **空**: 不呼叫(井底即空)。**已填**: 該色圓角史萊姆。**消除標記中**(`'clear'`): 保留原色 + 白閃 + **向外擴張的白環**(我消掉的, 往外炸)。**獎勵削除標記中**(`'trim'`): 去彩度 + **青色虛框 + 向下箭頭**(延展送的, 往下沉)。兩者方向感相反, 一眼分得出 |
| 同色團顆數標示 | `drawClusterCount(ctx, state)` | `{ col, row, n:2\|3, color }` | 錨格左上角的 16px 深色圓底, **只佔格位左上 1/4 不到, 不蓋住顏色**。`n=2`: 該團顏色細環 + 同色數字。`n=3`: **白色實環 + 白色數字 + 外暈**(差一顆就消, 明顯更亮)。n=1 請勿呼叫 |
| 落點指示(ghost) | `drawGhost(ctx, state)` | `{ cells:[{col,row,color}] }` | 每格 18% 該色填底 + 該色虛線框 + **底邊實心色條**(停駐列一眼可讀), 顏色逐格呈現。無任何預測資訊 |
| 落下方塊 | `drawPiece(ctx, state)` | `{ cells:[{col,row,color}], phase:'fall'\|'soft'\|'lock', lockT:0~1 }` | `fall`: 實心史萊姆。`soft`: 每格上方加該色向上拖尾。`lock`(鎖定延遲中): 白色脈動外框, `lockT` 0→1 為延遲進度(脈動頻率固定, 不依賴 t)。`已鎖定`狀態請改用 `drawCell` 畫。列 20 以上的格位自動被裁掉 |
| 下一塊預覽 | `drawNextPreview(ctx, state)` | `{ cells:[{x,y,color}], masked:bool }` | `cells` 用**外框內的局部座標**: x 向右 0~3, **y 向上** 0~1(與盤面列號同向)。22px 格繪製, 形狀與每格顏色都讀得出。`masked:true`(暫停)→ 蓋成「?」 |
| 左 / 右側目標色指示 | `drawTargetColor(ctx, state)` | `{ side:'left'\|'right', color, masked:bool, justChanged:bool }` | 兩側共用一個函式, 以 `side` 區分(呼叫兩次)。96×40 色塊 + 「消在左/右半才算」的方向箭頭。`justChanged`(改選剛生效)→ 金框 + `NEW` 標。`masked` → 「?」 |
| 昂貴側指示 | `drawExpensiveSide(ctx, state)` | `{ side:'left'\|'right' }`(= 昂貴側在哪) | **一次呼叫畫兩側**: 指定側紅底「昂貴側 5/16」, 另一側藍底「便宜側 2/11」, 常駐在情報板右上角 |
| 左 / 右側解鎖進度 | `drawUnlockProgress(ctx, state)` | `{ side, A:0\|1\|2, E:0\|1\|2, remain:number, need:number, masked:bool }` | 兩側共用(呼叫兩次)。上方 2 顆階段 pip(已達成階亮金)。**一般**: 「第 (A+1) 階 還要 N 顆」+ 進度條(`(need−remain)/need`)。**E<A**: 整條轉青 + 「已滿, 待延展」。**A=2 且 E=A**: 整條轉金 + 「滿級」。`remain` 為負時**自動顯示成「已滿, 待延展」, 不會印負數**(RD 可直接把負值丟進來)。右上角小字恆顯示 `A x / E y` 供除錯。`masked` → 「?」 |
| 延展待執行指示 | `drawPendingExpand(ctx, state)` | `{ side, pending:bool, t:秒(任意遞增) }` | `pending:false` 時直接 return。`true` → 情報板下緣青色脈動膠囊「延展待執行 ▸」+ 盤面該側外緣的脈動箭頭。`t` 只用來算脈動相位 |
| 消除結算標記 | `drawClearMark(ctx, state)` | `{ cells:[{col,row,kind:'left'\|'right'\|'offside'\|'none'}], leftCount, rightCount, offCount, t:0~1 }` | 事後回饋, `t` 為 0.4 秒呈現的進度。`left`/`right`(合格格): 金框 + **指向該半邊的箭頭**。`offside`(顏色對位置不對): 灰色 ×。`none`(非目標色): 細白框。盤底中線兩側另有 chip「左 −3 顆」「右 −1 顆」「位置不符 ×2」, 數量為 0 者不畫 |
| 延展事件指示 | `drawExpandEvent(ctx, state)` | `{ side, col:新欄絕對欄, order:1~4, t:0~1 }` | 1.2 秒事件, `t` 為進度(內建進場 pop 與退場 fade)。新欄畫成青色光柱 + 青框; 該側**盤外**(不蓋盤面)橫幅「左/右側延展 +1 欄 / 第 N 次延展」。兩側同時延展時由 RD 依序呼叫(先左後右), 本函式不處理排序 |
| 延展獎勵削除指示 | `drawTrimEffect(ctx, state)` | `{ side, k:1\|2\|3\|5, total:削除總格數, cols:[{col, rows:[被削列…]}], t:0~1 }` | **這一版要爭取的爽感來源**。逐欄畫: 被削包絡的青色半透明帶、**舊頂面虛線**、**新頂面實線(粗)**、隨 `t` 往下走的下沉箭頭、欄頂「−n」。另外橫跨該側畫兩條線(舊頂虛線 / 新頂實線), 把「整個半盤矮了一截」畫成一條可比較的落差。盤外 chip:「每欄削頂 −K 格 / 共 N 格, 整側下沉」。無格位的欄傳 `rows:[]` 即自動跳過 |
| 滿寬完成獎勵指示 | `drawFullWidthBonus(ctx, state)` | `{ t:0~1 }` | 盤面上緣(y136, 通常是空列)的金框橫幅「滿寬 10 欄達成 / +1,500」。與 `drawTrimEffect`、`drawExpandEvent` 同時畫即構成同一個事件 |
| 目標色改選介面 | `drawColorPick(ctx, state)` | `{ side, candidates:[c1,c2], current:本側原色, selectedIndex:-1\|0\|1, phase:'open'\|'picked'\|'timeout', remain:剩餘秒 }` | 畫在該側情報板下方的卡, **不覆蓋盤面**。兩個大色塊, index 0 = 左候選(標「← / A」), index 1 = 右候選(標「→ / D」); `candidates` 請依固定顏色順序 A→B→C 傳入, 本函式**不重排**。原色格加小標「原色」(只是標示, 位置仍由 RD 依固定順序決定)。頂部 3.0 秒倒數條, 剩 1/3 以下轉紅。`picked` → 選中格金框 + 「已選定」; `timeout` → 紅框 + 「逾時, 隨機選定」。`phase:'closed'` 時請不要呼叫 |
| 暫停遮罩 | `drawPauseOverlay(ctx, state)` | `{}`(保留欄位) | 全畫布 90% 暗幕 + 「暫停」+ 操作提示。因為是全畫布, 盤面、預覽、目標色、解鎖進度、顆數標示一律不可讀, 符合 spec |
| 放棄計時指示 | `drawAbandonGauge(ctx, state)` | `{ progress:0~1 }` | 畫面下方紅框條「放棄本局…」+ 進度條。`progress` 由 RD 以真實時間算 |
| 分數 / 最佳紀錄 / 經過時間 / 遊戲狀態 | `drawHud(ctx, state)` | `{ score, best:number\|null, time:秒, multiplier, width, status:'playing'\|'settle'\|'picking'\|'paused'\|'over' }` | 左框: 分數(金, 32px)/ 最佳(`null` → 「尚無紀錄」)。中框: 時間(1 位小數)、「倍率 ×1.30 ・ 寬 8 欄」、狀態列。狀態色分別為 灰 / 青 / **金「目標色改選中 ・ 時間凍結」** / 灰 / 紅 |
| 結束資訊 | `drawGameOver(ctx, state)` | `{ score, seconds, unlocked, reason:'blockout'\|'lockout'\|'abandon', isBest:bool }` | 全畫布暗幕 + 面板: 結束原因、分數、`isBest` 時加「新紀錄!」、存活秒數、已解鎖欄數, 以及「按 R 重開一局」按鈕(命中框 = `Art.restartHitbox()`) |

### spec 物件清單中未獨立成函式者

| 物件 | 歸屬 | 理由 |
| --- | --- | --- |
| 同色團 | `drawCell` + `drawClusterCount` | 團不是畫得出來的實體, 它是「一群格位 + 一個數字」。另外 spec 明言局面上不存在 ≥4 顆的持續狀態, 「成立消除」只會以 `mark:'clear'` 出現 |
| 空洞(開放 / 封閉) | `drawBoard`(井底本色) | spec 寫死「本輪兩者在盤面上不做區分呈現」。空格位就是井底, 不畫任何東西反而最清楚 |
| 不可見區(列 20+) | `drawBoard`(盤頂漸層) + 全域裁切 | 依定義不可見。所有盤面座標系函式都裁切在 y≥112, RD 可以放心把列 20 以上的格位一起丟進來, 不會畫出界 |
| 遊戲狀態 | `drawHud` 的 `status` 欄位 | 是一行狀態文字, 不值得獨立一個函式 |
| 左/右側目標色指示、左/右側解鎖進度 | 各自一個函式, 以 `side` 區分, 呼叫兩次 | 左右完全對稱, 拆兩個函式只會讓改動要改兩遍 |
| 昂貴側指示 | `drawExpensiveSide` 單次呼叫畫兩側 | 「昂貴在左」必然等於「便宜在右」, 一次畫完才不會出現兩邊都標昂貴的錯誤狀態 |

---

## 5. 尺寸表

| 物件 | 尺寸 |
| --- | --- |
| 格位 / 史萊姆 | 26 × 26, 本體內縮 1.5px(23 × 23), 圓角 R7 |
| 盤面(滿寬) | 260 × 494, x 350~610, y 112~606 |
| 盤面(開局 6 欄) | 156 × 494, x 402~558 |
| 中線 | 寬 2px(下墊 5px 黑), y 98~616(上下各出頭), 端點菱形 8×10 |
| 顆數標示 | 圓徑 16(半徑 8), 圓心在格位左上 (+9,+9), 數字 bold 12px |
| ghost 底邊條 | 18 × 3 |
| 預覽格 | 22 × 22 |
| 目標色塊 | 96 × 40 |
| 昂貴 / 便宜徽章 | 76 × 20 |
| 解鎖進度條 | 282 × 10; 階段 pip 16 × 8 ×2 |
| 待延展膠囊 | 150 × 22; 盤外箭頭 16 × 20 |
| 消除 chip | 高 20, 寬隨字 |
| 延展橫幅 | 178 × 40(盤外, y200) |
| 削除摘要 chip | 178 × 34(盤外, y246) |
| 滿寬獎勵橫幅 | 300 × 62(y136) |
| 改選候選色塊 | 132 × 96 ×2, 間距 18 |
| 放棄計時條 | 260 × 44(y544) |
| 結束面板 | 420 × 330(y150), 重開按鈕 200 × 46 |
