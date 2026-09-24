# 美術規格 (art.js 使用說明)

RD 只需讀這份。`window.Art` 為全域物件, 不是 ES module; 以 `<script src="game/art/art.js"></script>` 於 `game.js` 之前載入。
所有函式簽章固定為 `(ctx, state)`(`drawBackground` 只有 `ctx`), 每個函式自行 save/restore, 不留狀態污染。

---

## 1. 邏輯畫布尺寸

| 項目 | 值 |
| --- | --- |
| 畫布 | **960 × 640**(`Art.canvas.width / height`) |
| 格子邊長 | **28**(`Art.cellSize`) |
| 盤面可見列 | 16 列(列 1 = 最底列, 列 16 = 頂列); 列 17 以上不繪製 |
| 盤面上緣 y | **148**(`Art.board.top`) = 列 16 的上緣 |
| 盤面下緣 y | **596**(`Art.board.bottom`) = 列 1 的下緣 |
| 中線 x | **480**(`Art.board.midX`) = 絕對欄 2 與 3 的接縫, 畫面正中, 永不移動 |
| 滿寬盤面 x 範圍 | **340 ~ 620**(絕對欄 −2 ~ 7) |

**座標換算(art.js 已提供, 請直接用, 不要在 game.js 另外算)**

| 函式 | 說明 |
| --- | --- |
| `Art.colToX(col)` | 絕對欄 → 該欄左緣 x。`colToX(c) = 480 + (c − 3) × 28` |
| `Art.rowToY(row)` | 列號 → 該列上緣 y。`rowToY(r) = 596 − r × 28` |
| `Art.xToCol(px)` | 畫面 x → 絕對欄(滑鼠跟隨用)。x=479 → 欄 2, x=481 → 欄 3 |
| `Art.board` | `{ top:148, bottom:596, midX:480, rows:16, colMin:-2, colMax:7, x0:340, x1:620 }` |

所有盤面類函式(`drawCell` / `drawPiece` / `drawGhost` / `drawClearMarks` / `drawExpansionEvent` 的新欄高亮)**內部已對盤面矩形做 clip**, RD 可以把列 17 以上的格位照傳, 不會畫出盤面外。

---

## 2. 色票表 (`Art.palette`)

| 名稱 | 色碼 | 用途 |
| --- | --- | --- |
| `bg` / `bgDeep` | `#0E1220` / `#070A12` | 背景漸層(上→下) |
| `panel` | `#19202F` | 左右側欄、預覽框、彈窗底板 |
| `panelEdge` | `#2B3750` | 面板描邊、分隔線 |
| `panelHeadLeft` / `panelHeadRight` | `#2A3350` / `#20304A` | 左 / 右側欄標頭(左略暖、右略冷, 與盤面半邊同調) |
| `boardLeft` | `#1B2333` | **左半**空格底色(略亮) |
| `boardRight` | `#141A28` | **右半**空格底色(略暗) — 與中線一起構成「這格在哪一半」的雙重線索 |
| `gridLine` | `#28324A` | 盤面格線 |
| `boardEdge` | `#48587A` | 盤面外框與底座 |
| `locked` / `lockedStripe` | `#0C1019` / `#1A2132` | 尚未解鎖欄位的底色與斜線影線 |
| `danger` | `#FF5A5A` | 頂端 3 列的危險淡染(alpha 0.13→0) |
| `midline` | `#FFFFFF` | 中線主線 |
| `midlineGlow` | `#63D6FF` | 中線外暈與逐列刻度點 |
| `slimeA` | `#FFD24A` | 色 A 史萊姆(琥珀黃, 符號 = 實心圓點) |
| `slimeB` | `#3FC8F0` | 色 B 史萊姆(湖水藍, 符號 = 雙橫條) |
| `slimeC` | `#FF6FA8` | 色 C 史萊姆(莓果粉, 符號 = 交叉) |
| `clearFlash` | `#FFFFFF` | 消除標記中的白閃 |
| `ghost` | `#FFFFFF` | 落點基準線 |
| `text` / `textDim` / `textFaint` | `#E9EFFC` / `#8C9AB8` / `#5B6884` | 主要 / 次要 / 輔助文字 |
| `expensive` | `#FF8A5C` | 昂貴側徽章、放棄計時、結束原因 |
| `cheap` | `#7BE8A6` | 便宜側徽章 |
| `progressBar` | `#63D6FF` | 解鎖進度條(計數中) |
| `pending` | `#FFD24A` | 已滿待延展(進度條、待執行徽章) |
| `maxed` | `#7E8CA8` | 滿級(灰化) |
| `chain` | `#C9B6FF` | 連鎖段指示、重抽提示 |
| `expansion` | `#7BE8A6` | 延展事件、合格格標記、新欄高亮 |
| `bonus` | `#FFD24A` | 滿寬完成獎勵、新紀錄 |
| `offside` | `#7E8CA8` | 「顏色對但位置不對」標記 |
| `mask` / `overlay` | `rgba(8,11,18,0.94)` / `rgba(8,11,18,0.78)` | 暫停遮罩 / 結束畫面底 |

**顏色參數寫法**: 所有帶 `color` 的 state 欄位都接受 `0 / 1 / 2` 或 `'A' / 'B' / 'C'`(大小寫皆可), art 內部自行轉換。

---

## 3. 形狀語言

**扁平幾何、圓角無外框**: 史萊姆為圓角方塊(圓角半徑 = 邊長 0.30)+ 底部暗邊 + 左上橢圓高光 + 一個色專屬的幾何符號(色盲輔助); 情報一律裝在圓角面板/藥丸形膠囊裡, 只有中線與延展事件用發光與箭頭強調。狀態差異靠 **填滿 vs 虛線外框 vs 灰化** 三段區分, 不靠色相微差。

---

## 4. 物件表

`side` 欄位一律為 `'left' | 'right'`; 盤面座標一律用 **絕對欄 col(−2~7)** 與 **列 row(1 = 最底列)**。

| spec 物件 | 函式 | state 欄位 | 各狀態視覺差異 |
| --- | --- | --- | --- |
| 盤面邊界(含空格位) | `drawBoard(ctx, state)` | `{ minCol, maxCol }` 絕對欄, 開局 `0,5`, 滿寬 `-2,7` | 可放置區依半邊上底色(左亮右暗)+ 格線; 寬度外、滿寬內的欄位畫成深色斜線影線並標「未解鎖」, 讓玩家看得到還能開幾欄; 頂端 3 列有紅色危險淡染; 盤面上緣左側標「盤面 N 欄」 |
| 中線 | `drawMidline(ctx, state)` | 不讀任何欄位(傳 `{}` 即可) | 恆畫在 x=480: 青色外暈(呼吸)+ 黑色描邊 + 2px 白線 + 每一列中央一個刻度點, 上下各一個端帽三角; 盤面上緣外側標「左半 / 右半」。畫在格位之上, 永遠壓得住史萊姆 |
| 盤面格位 | `drawCell(ctx, state)` | `{ col, row, color, clearing?, clearProgress? }` | **已填**: 實心史萊姆。**消除標記中**(`clearing:true`): 疊白閃 + 白色外框, `clearProgress` 0~1 控制強度(不給則自行呼吸)。**空**: 不需呼叫, 由 `drawBoard` 畫 |
| 同色團 | 無獨立函式 | — | 未達門檻(1~3 顆)與一般已填格外觀相同(規則上不存在 ≥4 未消的持續狀態); 成立消除的瞬間由 `drawCell` 的 `clearing` 呈現 |
| 不可見區 | 無獨立函式 | — | 列 17 以上依規格「一律不可見」, 所有盤面函式已 clip 掉 |
| 落下方塊 | `drawPiece(ctx, state)`(別名 `drawPlayer`) | `{ cells:[{col,row,color}], phase:'falling'\|'softdrop'\|'lockdelay'\|'locked' }` | **下落中 / 已鎖定**: 實心史萊姆。**軟降中**: 每格下方多一道同色殘影。**鎖定延遲中**: 外加白色虛線呼吸外框 |
| 落點指示(ghost) | `drawGhost(ctx, state)` | `{ cells:[{col,row,color}] }` | 每格 22% 同色填底 + 同色虛線外框 + 該色符號(**逐格顯示顏色**), 底部一條白色落地基準線; 不含任何成團或歸屬預測 |
| 下一塊預覽 | `drawNextPreview(ctx, state)` | `{ cells:[{x,y,color}], hidden? }`(x/y 為形狀局部座標, y 大者在上) | **顯示中**: 20px 史萊姆置中排列。**遮蔽中**(`hidden:true`): 只留框與「— 遮蔽中 —」 |
| 左 / 右側目標色指示 | `drawTargetColor(ctx, state)` | `{ side, color, frozen? }` | 側欄標頭寫「左半 (絕對欄 ≤2)」/「右半 (絕對欄 ≥3)」; 52px 色票 + 「色 A/B/C」。`frozen:true`(滿級凍結)時加註「已凍結 · 不再重抽」 |
| 昂貴側指示 | `drawExpensiveSide(ctx, state)` | `{ side, expensive:boolean }` | 側欄徽章: 昂貴側橘色「昂貴側 7 / 19 顆 (共 26)」, 便宜側綠色「便宜側 2 / 14 顆 (共 16)」。**兩側都要呼叫一次** |
| 左 / 右側解鎖進度 | `drawUnlockProgress(ctx, state)` | `{ side, stage:1\|2, remaining, need, status:'counting'\|'pending'\|'maxed', unlockedCols }` | **計數中**: 「第 N 階 · 剩 X 顆」+ 青色進度條 +「done / need」。**已滿待延展**(`pending`): 黃色滿格條 +「已滿 · 待延展」(`remaining` 為負時請傳此狀態, art 不顯示負數)。**滿級**: 灰色滿格條 +「滿級」。右上兩個階段 pip 顯示已完成 / 進行中 |
| 延展待執行指示 | `drawExpansionPending(ctx, state)` | `{ side, visible }` | 側欄底部黃色虛線膠囊, 呼吸閃爍, 左側加「◀」右側加「▶」 |
| 連鎖段指示 | `drawChainIndicator(ctx, state)` | `{ visible, segment, multiplier }` | 盤面頂部紫色藥丸「連鎖 第 k 段 / ×1.57」(倍率請傳查表值) |
| 消除結算標記 | `drawClearMarks(ctx, state)` | `{ marks:[{col,row,kind:'left'\|'right'\|'offside'\|'plain'}], leftCount, rightCount, alpha? }` | 逐格: `left/right` 綠色箭頭指向所屬半邊(= 合格格), `offside` 灰色斜槓(顏色對位置不對), `plain` 灰點(非目標色); 兩側面板下方另出「−N 顆」小結。`alpha` 可做淡出 |
| 延展事件指示 | `drawExpansionEvent(ctx, state)` | `{ visible, side, newCol, progress? }` | 新解鎖欄整欄綠色呼吸高亮 + 綠框; 盤面中段綠色橫幅「左側 / 右側延展 +1 欄」與向外的三角箭頭。兩側同時延展 → 依先左後右各呼叫一次, **不同時顯示**, 也不與 `drawClearMarks` 同時呼叫 |
| 目標色重抽提示 | `drawRerollHint(ctx, state)` | `{ visible, side, color }` | 延展橫幅下方紫框膠囊「左側目標色重抽 →」+ 新色 26px 色票 |
| 滿寬完成獎勵指示 | `drawFullWidthBonus(ctx, state)` | `{ visible, bonus }`(預設 1500) | 再下方金色橫幅「滿寬 10 欄達成 / +1,500」, 呼吸強調 |
| 分數 / 最佳紀錄 / 經過時間 / 遊戲狀態 | `drawHud(ctx, state)` | `{ score, best, time, status:'playing'\|'settling'\|'paused'\|'over' }` | 左上分數(千分位)+ 最佳紀錄(`best` 為 `null`/`undefined`/負數 → 「尚無紀錄」); 右上經過時間(0.1 秒)+ 狀態字(結算中紫 / 已結束橘 / 其餘灰) |
| 暫停遮罩 | `drawPauseMask(ctx, state)` | `{ visible }` | 整張畫布 94% 不透明覆蓋(盤面、預覽、目標色、解鎖進度全部不可讀)+「暫 停」與操作提示 |
| 放棄計時指示 | `drawAbandonTimer(ctx, state)` | `{ visible, progress:0~1, remaining? }` | 畫布底部橘色進度條 +「放棄本局 0.4 s」; `visible:false` 即消失 |
| 結束資訊 | `drawGameOver(ctx, state)` | `{ visible, score, seconds, unlockedCols, reason:'blockout'\|'lockout'\|'abandon', best, isNewBest }` | 半透明壓暗 + 中央面板: 結束原因(橘)、分數、存活秒數、已解鎖欄數 / 4、最佳紀錄; `isNewBest` 時加金色「★ 新紀錄」; 底部「R 或點此重開一局」(點擊區 = 面板矩形 x 270~690, y 170~470) |

**不需要獨立函式者**: 同色團(外觀等同已填格位, ≥4 顆只有消除瞬間, 走 `drawCell` 的 `clearing`)、不可見區(依規格不可見, 已由 clip 處理)、盤面「空」格位(屬 `drawBoard` 的底色與格線)。

---

## 5. 尺寸表

| 物件 | 尺寸 / 位置(邏輯像素) |
| --- | --- |
| 畫布 | 960 × 640 |
| 格位 / 史萊姆 | 28 × 28(實際繪製內縮 6%, 圓角 8.4) |
| 色辨識符號 | 邊長 ×0.46 ≈ 13, 置於格中偏下 |
| 盤面(滿寬) | 280 × 448, x 340~620, y 148~596 |
| 盤面(開局 6 欄) | 168 × 448, x 396~564 |
| 中線 | x=480, y 136~604; 主線寬 2, 黑描邊 5, 外暈 8; 逐列刻度點 5 × 3 |
| 左側欄 | 286 × 300, x 30~316, y 162~462 |
| 右側欄 | 286 × 300, x 644~930, y 162~462 |
| └ 側欄標頭 | 高 34 |
| └ 目標色色票 | 52 × 52, 位於側欄 x+16, y+52 |
| └ 昂貴 / 便宜徽章 | 254 × 26, 側欄 y+118 |
| └ 解鎖進度條 | 254 × 12, 側欄 y+202; 階段 pip 20 × 14 |
| └ 延展待執行膠囊 | 254 × 30, 側欄 y+250 |
| 下一塊預覽框 | 156 × 96, x 402~558, y 16~112; 預覽格 20 × 20 |
| HUD 分數 | x 30, 數字 32px; 最佳紀錄 14px @ y 112 |
| HUD 時間 | 右對齊 x 930, 數字 28px; 狀態字 14px @ y 112 |
| 連鎖段藥丸 | 186 × 36, 置中 x 480, y 158 |
| 消除「−N 顆」小結 | 100 × 28, 兩側欄正下方 y 476 |
| 延展事件橫幅 | 250 × 46, 置中 x 480, y 244(新欄高亮為整欄 28 × 448) |
| 目標色重抽膠囊 | 230 × 38, 置中 x 480, y 298 |
| 滿寬完成獎勵橫幅 | 270 × 52, 置中 x 480, y 348 |
| 放棄計時條 | 260 × 14, 置中 x 480, y 612 |
| 結束面板 | 420 × 300, x 270~690, y 170~470 |

---

## 6. 建議繪製順序(每幀)

```
drawBackground
drawBoard              // 含空格位、未解鎖區、危險染色
drawCell × N           // 已固定的格位 (含 clearing)
drawGhost              // 落點指示
drawPiece              // 落下方塊 (別名 drawPlayer)
drawMidline            // 一定要在格位與方塊之後, 確保全程可讀
drawClearMarks         // 結算回饋 (與延展事件互斥, 不同時出現)
drawChainIndicator
drawExpansionEvent → drawRerollHint → drawFullWidthBonus   // 同一個延展事件內
drawNextPreview
drawTargetColor / drawExpensiveSide / drawUnlockProgress / drawExpansionPending  // 左右各一次
drawHud
drawAbandonTimer
drawGameOver
drawPauseMask          // 最後畫, 蓋住一切
```
