# Mimo(Q 版)的 Live2D 部件记录

> 2026-11-08 制作。管线 A(同 Kimi):双参考图母图 → 软 matte → `cut_mimo.py`
> 切 20 件 → `mimo_to_canvas.py` → `mimo_build.py` → `assets/build/mimo-v1`。
> 母图与表情图一次过。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/mimo-parts/ref-sheet.png` | 1448×1086 |
| 成年图 | `assets/incoming/mimo-parts/ref-adult.png` | 1536×1024(横图,同样能用) |
| **母图(定稿)** | `p0/Chibi-Mimo-in-Bunny-Techwear__….png` | 1024×1536 平涂 `#00FF00`,ink `(84,75)-(938,1467)` |
| 表情编辑 | `expressions/Chibi-Character-with-Closed-Eyes-and-O-Mouth__….png` | 闭眼+张口一张全幅 |
| matte | `assets/build/mimo-parts/matte.png` | `--cpu --res 1024` |

Prompt:`relay-kit/prompts/mimo-p0-master.txt`、`mimo-p1-expressions.txt`。
设计要点:白色兜帽 + 橙白兔耳(Mi 吊牌)、灰白双马尾橙渐变 + 橙黑发带蝴蝶结 +
橙色 X 发夹、橙眼、橙白机能外套(黑扣带)、黑百褶裙、异色长袜(白 Mi / 黑 MIMO)、
橙白球鞋;**空手交叠无兔子玩偶**(无持物铁律)。兔耳独立 `ears` 层(可跟随耳参数)。

## 2. 切件(`assets/_raw/cut_mimo.py`)

- **网格目测读数全盘偏移**:第一版按截图网格定的眼带/嘴区/裙线全部偏差 40–100px
  (Kimi 同款问题)。教训:**几何分区一律用程序化 blob 测量**(`_measure_*.py`:
  skin/orange/dark/white 聚类 bbox),目测网格只做粗定位。
- 灰白发(暖灰 r-b 5..24)与肤(暖 r-b 45..80)与兜帽白(r-b<5)三域相邻:
  发用 `hairgrey(mn>140 & r-b>=5 & r-g<=40)`,脸内亮部与发同色 → 脸 =
  `fill(skin_seed(r-b>=45))&face_ell` 几何闭合 + 松判据补内区。
- 裙(黑)先被 topwear/handwear 抢走:topwear 排除裙区、hands 矩形收窄到
  实测手部 blob(380,988,642,1038),bottomwear 在前认领。
- face_ell 底边盖住脖子会让 neck=0(脸把脖子吃掉):椭圆底边收到下巴(548),
  脖子单独 `fill(skin_strict & rect)`。
- 嘴实测 art y≈503-508(不是目测的 545):`mouth_arc(512,506,13,1.5)`。

## 3. 画布与座位

- 画布映射:`scale=1.3190, dx=350.0, dy=7.1`(INK=(84,75,938,1467))。
- 虹膜画布位 **619.5**(Gemini 641)→ dy 按眼线公式:longtable `1.8/165/244`,
  产品 `1.7/123/182`,stage-760 `1.70/123`。cut true。

## 4. 出模与验收

`mimo_build.py`(同 kimi_build,--parts/--out/--name/--ink 全带)。moc3 394KB,
单页 4096,EyeBlink/LipSync ✓。probe 品红底三态 holes≥40px = 0;闭眼弧线自然,
张口蛋形 ✓。合成校验 0.48%(全部 ≤82px 碎簇)。`npm test` 46/46;deployed 已同步。

## 5. 持物变体（2026-11-08 第二轮）

一轮编辑出「双手持白兔玩偶（双臂抱胸，橙耳 Mi logo）」的 prop 母图（`relay-kit/prompts/mimo-p2-prop.txt`，
diff 校验确认改动集中在手部区）；`cut_prop_variant.py --char mimo` 复用基础件，
只新增 **objects 层**（diff 闭合区 = 手+白兔玩偶（双臂抱胸，橙耳 Mi logo），prop 母图色）并把 handwear 减去
objects（袖子保留）。objects 区贴绿底的过渡像素整块剔除（否则变体镶绿边）。
`mimo_prop_to_canvas.py`（同 INK）→ `mimo_prop_build.py`（`--name mimo-prop`，
manifest 文件名是 `<ch>-prop.layout.json`）→ `assets/build/mimo-prop-v1`。

- **objects 必须在 manifest LAYERS 里**（同 earwear 教训），z 在 handwear 之后。
- **headless MCP 的 request_id 有账本**：失败尝试也会占用 id，重跑前改 id 或重启服务。
- probe 品红底三态 0 透洞；Cubism/pause 均正常。
- 注册：`lib/stage.js` `kimiProp/mimoProp/minimaxProp`；`lib/client.js` 三个座位的
  `book:` 指向变体（复用 claude-book 机制：静听 9s 交叉淡入、开口淡出、applyPose
  复制到手部动作）；longtable 同款 `alt:`。deployed 已同步。
