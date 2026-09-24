# style.md — SlimeTetris Demo v11 美術規格

RD 只讀這一份。`art.js` 掛在 `window.Art`(非 ES module), 所有繪製函式簽章固定為 `(ctx, state)`, `drawBackground` 只有 `(ctx)`。每個函式自己 save/restore, 不留狀態污染。

## 1. 邏輯畫布尺寸

| 項目 | 值 |
| --- | --- |
| 畫布 | **960 × 640**(`Art.canvas`) |
| 格子邊長 | 26 |
| 可見盤面 | 列 1(底)~ 列 19(頂), 滿寬絕對欄 −2 ~ 7 |
| 中線螢幕 x | **480, 全局固定**(絕對欄 2 與 3 的接縫) |
| 列 1 底緣 y | 606 |
| 列 19 頂緣 y | 112 |
| 標題列 HEADER | x 24, y 8, w 912, h 70 |
| 左資訊欄 | x 24, y 112, w 306, h 494 |
| 右資訊欄 | x 630, y 112, w 306, h 494 |

**座標換算(請直接用, 不要自己算)**

- `Art.colX(absCol)` → 該絕對欄左緣 x。公式 `480 + (absCol − 3) × 26`。
- `Art.rowTop(row)` → 該列頂緣 y。公式 `606 − row × 26`。列號越大越上面。
- 其餘常數放在 `Art.metrics`(cell / rowsVisible / midX / boardTop / boardBottom / colMinAbs / colMaxAbs / panelLeft / panelRight / header)。

**盤面是以中線對齊、不是以盤面自身置中。** 延展時左右邊界各自往外長, 中線螢幕位置永遠不動 — 這是規格「中線全局不移動」的直接落地, 不可改成置中。

**畫布不隨寬度變**: 滿寬 10 欄 = x 350~610, 兩側各留 350px 資訊欄。

`index.html` 需宣告 `<meta charset="utf-8">`(本檔與 art.js 皆為 UTF-8, 內含中文字串)。

## 2. 色票表(`Art.palette`)

| 名稱 | 色碼 | 用途 |
| --- | --- | --- |
| bg | #0a0e15 | 畫面底色(上深下更深的漸層) |
| panel | #141c28 | 三塊資訊面板底板 |
| board | #161e2b | 盤面底板 |
| boardCell | #1d2736 | 空格位(空洞不分開放/封閉, 同一種畫法) |
| boardEdge | #33445e | 盤面外框、未解鎖欄的虛線 |
| colorA | #4ecb8b | 史萊姆 色A(符號 = 圓) |
| colorB | #ff6b5e | 史萊姆 色B(符號 = 三角) |
| colorC | #49a8ff | 史萊姆 色C(符號 = 方) |
| ball | #cba8ff | 重力球亮環 |
| ballCore | #2b1f52 | 重力球球體 |
| ballGlow | #8a5cf6 | 重力球光暈(盤面唯一會發光的物件) |
| midline | #ffffff | 中線主線(下墊 #05080d 暗底, 保證壓在任何顏色上都讀得到) |
| floating | #dbe6f2 | 懸空結構標示(輪廓 / 鍵結 / 徽章) |
| sideLeft | #6fd3ff | 左半盤語言: 左側面板、左半標籤、延伸指定側=左 |
| sideRight | #ffb968 | 右半盤語言: 右側面板、右半標籤、延伸指定側=右 |
| gravitySmall | #7fd4ff | 重力事件(小型, <10 格) |
| gravityLarge | #ffd166 | 重力事件(大型, ≥10 格) |
| gravityIdle | #94a3b5 | 重力事件(零位移 / 空轉)與「受影響但不動」的塊 |
| extraClear | #f78bff | 追加消除 |
| shave | #ffe9a8 | 削頂(削除標記、每欄削除數) |
| bonus | #ffd166 | 延展 / 延伸關卡 / 滿寬 1,500 分 / 倍率 |
| danger | #ff5f56 | 昂貴側、鎖定延遲、放棄、結束原因 |
| text / textDim | #e8eff7 / #8b9cb2 | 主要文字 / 次要文字 |

**視覺層級(由高到低, 決定誰蓋誰)**

1. 中線(白線 + 暗底 + 端帽 + 左右半標籤)
2. 落下方塊 / ghost
3. 事件指示(重力事件、消除結算、追加消除、延展、延伸獎勵)
4. 重力球
5. 懸空結構標示(冷灰白, 刻意壓在史萊姆顏色之下一階)
6. 同色團顆數(小圓籌碼)
7. 已鎖定格位 / 空格位 / 指定側染色

延伸關卡的「指定側染色」畫在格位**底下**(alpha ≤ 0.16), 只染半盤底色, 絕不搶史萊姆顏色與中線。

## 3. 形狀語言

**扁平、圓角、無描邊風格; 靠「形狀 + 符號」先分辨, 顏色只是加速** — 史萊姆是圓角方塊 + 內嵌幾何符號(圓/三角/方), 重力球是會發光的正圓 + 四段缺口亮環(唯一的圓形、唯一發光), 標示類一律是線框(輪廓 + 虛線樣式), 文字一律放在膠囊籌碼裡。

## 4. 物件表

座標欄位一律用**絕對欄 col** 與**列號 row**(列 1 在底), 由 art.js 自行換算像素。`t` 一律是該事件的播放進度 0~1(RD 用 已過時間 ÷ 該事件時長 算), `time` 是本局經過秒數(給常駐脈動用, 可不給)。

| 物件(spec) | 函式 | state 欄位 | 各狀態的視覺差異 |
| --- | --- | --- | --- |
| 背景 | `drawBackground(ctx)` | 無 | 漸層底 + 45° 細斜紋 + 三塊面板底板。每幀最先畫 |
| 盤面邊界 / 空洞 / 不可見區 | `drawBoard(ctx, state)` | `minCol, maxCol`(絕對欄) | 畫外框 + 空格位; 未解鎖的欄以極淡虛線框保留位置(寬度 6→10 一眼可讀); 頂緣虛線 + 「列 20 以上不可見」標字; 空洞不分開放/封閉(規格指定不分) |
| 中線 | `drawCenterLine(ctx, state)` | `minCol, maxCol` | 8px 暗底 + 3px 白線 + 每 4 列刻痕 + 上下三角端帽 + 盤面上方的「左半 / 右半」籌碼。**全程畫, 滿寬後不淡出**; 建議畫在方塊與 ghost 之後 |
| 盤面格位(含已填/標記中) | `drawCell(ctx, state)` | `col, row, color:'A'\|'B'\|'C'\|'ball', mark, t, time`; 可用 `px, py, size` 覆寫像素位置(預覽用) | `mark` 五態互斥且彼此可區分: `'none'` 已鎖定(平塗圓角方 + 符號) / `'piece'` 隨方塊下落(白色亮邊 + 投影) / `'clearing'` 消除標記中(白閃 + 外擴白圈) / `'shaving'` 削除標記中(橫向切片 + 上緣亮條 + 整格淡出) / `'falling'` 隨重力事件下落(向上垂直拖尾 + 冷藍鑲邊) / `'ghost'` 落點指示(半透明 + 虛線框)。`color:'ball'` 時自動轉呼叫 `drawGravityBall` |
| 重力球格位 | `drawGravityBall(ctx, state)` | 同 `drawCell`(`color` 可省) | 深紫球體 + 紫色光暈 + 四段缺口亮環 + 白色星芒, **常駐脈動**。`'piece'` 白色外環 / `'clearing'` 觸發時大幅外擴震波 + 白閃 / `'falling'` 球形殘影 / `'shaving'` 灰色斜槓劃過(明示「被削掉不觸發下落」) / `'ghost'` 只剩虛線環 + 星芒 |
| 同色團顆數標示 | `drawClusterCount(ctx, state)` | `col, row, count:2\|3, color` | 錨點格中央的深色小圓籌碼, 邊框取該團顏色, 中央白色數字。n=1 不呼叫; 局面上不存在 n≥4 |
| 懸空結構標示(常駐) | `drawFloatingStructures(ctx, state)` | `blocks:[{ id, cells:[{col,row}] }], time` | 見下方 §4.1。一次把**所有**懸空塊傳進來, 一次畫完 |
| 重力事件指示 + 懸空結構(事件中) | `drawGravityEvent(ctx, state)` | `kind:'small'\|'large'\|'idle', t, origin:{col,row} 或 originCells:[...], fallingBlocks:[{cells}], staticBlocks:[{cells}], minCol, maxCol` | 見下方 §4.2。三種 kind 的顏色、外框造型與文字全部不同 |
| 追加消除指示 | `drawExtraClear(ctx, state)` | `cells:[{col,row}], t, minCol, maxCol` | 洋紅**雙層方框**(與消除結算的白色單框、白閃完全不同) + 盤面上方橫幅「追加消除(下落後才成立)」 |
| 消除結算標記 | `drawClearResult(ctx, state)` | `cells:[{col,row,tag}], summary:{left,right,stage,wrong,ball}, t, minCol, maxCol` | `tag`: `'left'`(左藍「左」) / `'right'`(右橘「右」) / `'stage'`(延伸關卡計入, 綠「階」) / `'wrong'`(灰「×」= 顏色對位置不對) / `'ball'`(紫「球」) / `'plain'`(只有白框)。上方摘要籌碼列出各類顆數 |
| 落下方塊 | `drawPiece(ctx, state)` | `cells:[{col,row,color}], phase:'falling'\|'soft'\|'lock', lockProgress:0~1, time` | `falling` 亮邊 + 投影 / `soft` 另加向上速度線 / `lock` 外圍閃爍虛線框 + 底緣紅色鎖定延遲進度條 |
| 落點指示(ghost) | `drawGhost(ctx, state)` | `cells:[{col,row,color}]` | 半透明填色 + 虛線框 + 色彩符號; 重力球格為虛線環 + 星芒; 另加一條極淡的垂直導軌, 幫助讀「落在中線哪一半」。**不含任何預測資訊** |
| 下一塊預覽 | `drawNextPreview(ctx, state)` | `cells:[{dx,dy,color}], hasBall, masked, time` | `dx/dy` 是塊內相對座標(dy 小者在上), 自動置中於右欄頂部方框; 含球時右上角掛「含重力球」紫籌碼, 且該格照常畫成發光球 → 形狀與籌碼雙重可讀; `masked:true` 改畫斜線遮罩 +「暫停中」 |
| 左/右側目標色 + 昂貴側 + 解鎖進度 + 延展待執行 | `drawSidePanel(ctx, state)` | `side:'left'\|'right', targetColor:'A'\|'B'\|'C'\|null, expensive:bool, stageIndex:1\|2, remain, status:'counting'\|'pendingExpand'\|'maxed', stageA, stageE, disabled:bool, time` | 一側一次呼叫。標頭寫「左半盤(絕對欄 ≤ 2)」/「右半盤(絕對欄 ≥ 3)」+ 側色條; 大色塊 + 色名; 昂貴側紅籌碼 / 便宜側灰籌碼; `counting` 顯示「第 N 階 · 剩 M 顆」, `pendingExpand` 顯示「已滿, 待延展」+ 閃爍籌碼(= 延展待執行指示), `maxed` 顯示「滿級(A=2)」; 右側兩顆指示燈 = A 階數, 已達成未延展者加金框; `disabled:true`(進延伸關卡)整塊降透明 + 「延伸關卡中 · 停用」 |
| 延伸關卡進度 + 目標色 + 指定側 | `drawExtendPanel(ctx, state)` | `active:bool, stage:S, color, side:'left'\|'right', remain, need, pending:bool, nextReward:string` | 佔左資訊欄(取代兩側目標色指示的位置)。`active:false` 只顯示「未進入」, **不顯示任何數值**; 進入後顯示階數 / 目標色大色塊 / **中線縮圖**(把選中的半盤染成側色, 中間一條白色中線, 標「左半」「右半」)+「本階算左半/右半」籌碼 / 剩餘顆數 + 進度條; `pending:true` 顯示「已達成, 待結算」 |
| 延伸關卡指定側指示(盤面上) | `drawExtendSideMarker(ctx, state)` | `active:bool, side, minCol, maxCol` | 指定側半盤淡染(側色, 貼著中線最濃、往外淡出) + 盤面上下兩道側色括號 + 底下「本階計入這半邊」籌碼。**必須畫在格位之前**(底層), 與中線一起讀 |
| 延伸關卡獎勵指示 | `drawExtendReward(ctx, state)` | `kind:'shave'\|'supply'\|'multiplier', value, stage, t, minCol, maxCol` | 盤面中央金框卡片, 三種圖示完全不同形狀: 削頂 = 上方被切掉的虛框 + 三根柱 + 下沉箭頭(「削 K 格」), 補給 = 三顆發光球(「接下來 N 塊必含重力球」), 倍率 = 金色 ×(「永久 +0.25」) |
| 重力球補給剩餘 | `drawBallSupply(ctx, state)` | `remain:number` | `remain>0`: 紫框「剩餘 N 塊」+ 最多 6 顆小球; `remain=0`: 灰字「重力球補給 · 無」 |
| 延展事件 + 削除指示 + 滿寬完成獎勵 | `drawExpandEvent(ctx, state)` | `side, newCol, k, shavedTotal, perColumn:[{col,count}], fullWidth:bool, t, minCol, maxCol` | 新欄整欄側色閃爍虛框 + 欄中央向外箭頭; 盤面上方橫幅「左/右側延展 +1 欄 · 削頂 K=n · 共削 m 格」; 盤面下方每欄一個「−N」籌碼(= 延展獎勵削除指示); `fullWidth:true` 另疊「滿寬 10 欄達成 / +1,500 分」金卡 |
| 目標色改選介面 | `drawRecolor(ctx, state)` | `open:bool, side, candidates:['X','Y'], remain(秒,0~3), chosen:0\|1\|null, byTimeout:bool` | **畫在該側的資訊欄, 絕不覆蓋盤面**(規格要求盤面不遮蔽)。兩個候選大色塊 + 「← / A」「→ / D」鍵提示 + 底部倒數條(剩 1 秒內轉紅); 選定後選中者加金框並顯示「已選定」/「逾時隨機」 |
| 分數 / 倍率 / 時間 / 最佳紀錄 / 遊戲狀態 | `drawHud(ctx, state)` | `score, multiplier, time(秒), best:number\|null, phase, minCol, maxCol` | 標題列: 分數(大字) / 分數倍率 ×N.NN / 經過時間 m:ss / 最佳紀錄(無紀錄顯示「尚無紀錄」) / 寬度籌碼「寬 8 欄 · 4\|4」/ 狀態籌碼。`phase`: `playing` 灰 / `resolving` 藍 / `gravity` 紫 / `recolor` 金 / `paused` 紅 / `over` 紅 |
| 暫停遮罩 | `drawPauseOverlay(ctx, state)` | 無(傳 `{}`) | 全畫面壓暗 + 盤面與三塊情報區各自蓋上不透明斜線板(盤面與所有情報一律不可讀) + 「暫停」 |
| 放棄計時指示 | `drawAbandonGauge(ctx, state)` | `active:bool, progress:0~1` | 左下角紅框卡片 + 進度條, 只在長按 R 期間呼叫 |
| 結束資訊 | `drawGameOver(ctx, state)` | `score, seconds, unlocked, stage:number\|null, multiplier, reason:string, isBest:bool` | 置中面板: 結束原因(紅) + 五行數值 + 破紀錄金籌碼 + 「R 或點此重開一局」。`stage:null` 顯示「未進入」 |

### 4.1 懸空結構標示(本版重點, `drawFloatingStructures`)

輸入 `blocks` 是**已鎖定格位**算出的所有懸空連通塊(ghost 與下落中方塊一律不得進來)。每塊要給 `id`(用連通塊的穩定序號即可, 決定它拿到哪一套樣式; 同一塊跨幀請沿用同一個 id, 換算後 `id % 6` 決定樣式)。

一塊畫四件事, 目的全部是「讀出**同一塊**」:

1. **同塊網點**: 塊內所有格位鋪同角度的細斜紋(角度依 id 輪替 45° / −45° / 0° / 90° / 22° / −22°)。不用追輪廓也看得出誰跟誰同組。
2. **鍵結短桿**: 相鄰同塊格位之間畫一根白色短桿。這是「整塊是剛體、會一起同步位移」的直接視覺語言, 專門擋掉「逐格壓實」的錯誤心智模型。
3. **整塊外輪廓**: 只描該塊的**外緣**(塊內邊界不描), 暗底 + 白線雙層, 虛線樣式依 id 輪替(實線 / 長虛 / 短點 / 長短交替 / 中虛 / 點長交替), 並有緩慢流動的 dash offset。
4. **塊徽章**: 掛在外框右上角的小圓, 內含依 id 輪替的六種形狀(菱 / 圓 / 三角 / 方 / 十字 / 六角)。兩塊靠很近時, 徽章是最後一道區分。

另外在**沒有下方鄰居**的格位底緣畫一條點線(= 這格底下沒有支撐)。

**禁止**: 不畫任何箭頭數量、距離、落點預覽、數字 — 標示只回答「哪些格位浮著、誰跟誰同一塊」, 不回答「會掉幾格」「這次事件會不會牽動它」。

### 4.2 重力事件指示(`drawGravityEvent`)

三種 `kind` 必須讓玩家當場分辨, 所以顏色 / 外框造型 / 文字三者全部不同:

| kind | 用時 | 觸發點 | 塊的處理 | 橫幅 |
| --- | --- | --- | --- | --- |
| `'small'` | <10 格, 0.3 秒 | 紫色外擴圈 + 原團座標虛框 | 將下落的塊: 冷藍填色 + 粗輪廓 + 「落」籌碼 + 底緣雙箭頭(固定兩個, 不代表格數) | 方角橫幅「重力事件」(冷藍) |
| `'large'` | ≥10 格, 0.5 秒 | 同上 | 同上, 改金色, 讓「掉的是哪幾塊」看得更久更清楚 | 方角橫幅「重力事件 · 大型」(金) |
| `'idle'` | 零位移, 0.2 秒 | **灰色外擴圈 + 粗灰色 ✕** | 不畫任何塊 | **六角形**橫幅「重力事件 · 空轉(無相連懸空結構)」(灰) |

`staticBlocks`(受影響但不懸空)一律灰色虛線輪廓 + 「不動」籌碼 — 與 `fallingBlocks` 的實心彩色輪廓 + 「落」形成對照, 玩家看得出哪一塊要掉、哪一塊不動。

零位移那一格**必須呼叫**(顏色、形狀、文字三重差異就是為了「分得出我算錯了 vs 機制沒生效」), 不得無聲跳過。

## 5. 尺寸表

| 物件 | 像素尺寸 |
| --- | --- |
| 格位 / 史萊姆 | 26 × 26(本體內縮 7%, 圓角 7.8) |
| 史萊姆辨識符號 | 直徑約 10, 置於格位中下 |
| 重力球 | 球體半徑 10.4(直徑 20.8), 亮環線寬 2.3, 外環半徑 13.5, 光暈半徑至 20 |
| 同色團顆數籌碼 | 半徑 8.5 的圓, 數字 12px |
| 懸空輪廓 | 白線 2.5px(暗底 5px), 內縮 2; 鍵結短桿 3.5px; 塊徽章圓半徑 8 |
| 重力事件輪廓 | 將下落 3px(暗底 6px); 不動 2px 虛線 |
| 事件橫幅 | 高 24, 置於盤面內上緣 y=128; 文字 13px |
| 消除結算標記 | 格框 2px + 右上角半徑 7.5 標籤圓; 摘要籌碼高 22 |
| 追加消除 | 外框 2px + 內框 1.5px 雙層 |
| 盤面 | 滿寬 260 × 494(x 350~610, y 112~606); 外框外擴 6 |
| 中線 | 主線 3px, 暗底 8px, 總高 502(y 104~614), 端帽 12 × 9 |
| 下一塊預覽框 | 306−32 = 274 × 118(右欄頂部), 預覽格 24 |
| 側面板卡片 | 274 × 176(左欄 y 128, 右欄 y 262), 目標色大色塊 46 |
| 延伸關卡面板 | 274 × 292(左欄 y 128), 中線縮圖 246 × 34 |
| 延伸獎勵卡 | 260 × 118(盤面中央 y 262) |
| 重力球補給卡 | 274 × 66(右欄 y 454) |
| 改選介面 | 274 × 160(該側欄 y 442), 候選色塊 58 |
| 滿寬完成獎勵卡 | 240 × 56 |
| 結束面板 | 380 × 300(畫面置中) |
| 放棄計時卡 | 220 × 46(左下 y 586) |

## 6. 建議繪製順序(每幀)

1. `drawBackground`
2. `drawBoard`
3. `drawExtendSideMarker`(指定側染色, 必須在格位之下)
4. 已鎖定格位: 逐格 `drawCell`(重力球格會自動轉 `drawGravityBall`)
5. `drawFloatingStructures`
6. 逐團 `drawClusterCount`
7. `drawGhost` → `drawPiece`
8. `drawCenterLine`(壓在盤面所有內容之上)
9. 當下的事件指示(擇一, 規格要求各事件不得併在同一個回饋裡): `drawClearResult` / `drawGravityEvent` / `drawExtraClear` / `drawExpandEvent` / `drawExtendReward`
10. `drawHud`、`drawSidePanel`(×2)或 `drawExtendPanel`、`drawNextPreview`、`drawBallSupply`
11. `drawRecolor`、`drawAbandonGauge`
12. `drawPauseOverlay` / `drawGameOver`
