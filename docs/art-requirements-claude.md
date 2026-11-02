# 小 Claude 的 Live2D 部件需求（全身版，与 GPT 角色同一套管线）

> 目标：给长桌圆桌会议插件做第二个角色「小 Claude」（橙长卷发、黑/橙洋装、白靴、抱一本古籍的 Q 版少女）。
> 流程与 GPT 角色一致：**GPT 出部件 → 本地 BiRefNet 软 matte 抠图 → PSD2Live 打包 moc3 → 接进舞台**。
> 已经踩过的坑全部在 `art-requirements-gpt.md` 第 7、10 节，这份文档只写这个角色**不一样**的地方。

## 1. 画布与构图

| 项 | 取值 | 理由 |
|---|---|---|
| 画布 | **1024×1536**，平涂纯绿 `#00FF00` | GPT 出不了透明、也保证不了 2048²；绿底由我们键掉 |
| 构图 | **全身**：头顶到靴底，头顶留 ~40px、靴底留 ~40px 绿边 | 一份资产两用：上桌时放大裁切露半身，另存立绘/大图也能用 |
| 头身比 | Q 版 **3 头身**：头高约占全高 30%（≈460px） | 脸再小就抠不出眼睛细节了；3 头身也是这种萌系的标准比例 |
| 朝向 | 正对镜头，肩线水平，头倾 ≤5°，双腿并拢直立 | 正面才能做 Live2D 的左右转头/视差 |

**必须和上一张母图同风格**：给 GPT 参考图时同时附上 `assets/incoming/gpt-parts/p0/P0-master.png`，
说明「只参考线宽、上色方式与眼型，不参考构图」。

## 2. 姿势怎么定（拿书 / 不拿书）

Live2D 不换姿势，靠骨骼变形。抱书的手臂一旦画死，书就放不下来了。三个选项：

| 方案 | 做法 | 成本 | 适用 |
|---|---|---|---|
| **A（推荐）** | 母图画**空手**（双手自然交叠放在身前），书不做 | 0 额外件 | 会议角色，主要靠表情演出 |
| B | 母图直接画成**抱书**姿势，书烤进手/衣服里 | 省 1 件，但书摘不掉 | 只想要"捧书少女"的静态感 |
| C | A 的母图 + 另做一套「抱书手臂 + 书」替换组，用 PSD2Live 的 `switchId` 切换 | +3 件（书、左/右抱书手臂） | 想两个姿势都要 |

**建议先做 A**：舞台上角色只有 244px 高，书大约 55px，演出价值低；
而"手交叠在身前"的手件最简单、最容易做摆动。真要抱书，二期按 C 加一套替换组即可，不用重画母图。

## 3. 母图提示词（P0，先出这张）

统一前置：

> Output ONE image, portrait **1024×1536**, flat **pure green #00FF00** background. No frame, border, text, watermark or cast shadow. Exactly one character, no second view, no colour swatches.

> Anime chibi girl, **about 3 heads tall**, full body from the top of her hair to the soles of her boots, standing straight and facing the viewer.
> **Orange long wavy hair**, a big **black bow** and an **orange daisy hair ornament** on the left side of her head, sleepy half-lidded **amber-orange eyes**, calm neutral expression, small mouth.
> She wears a **cream-white frilly dress** with a **black-and-orange corset waist**, orange ribbon bows, gold embroidery, a small white lace collar with an orange neck bow, **puffy white sleeves**, a **short layered skirt**, **white stockings** and **white ankle boots with orange laces**.
> **Both hands empty and folded lightly in front of her waist** — no book, no object in her hands.
> Framing: 40px of clear green above the top of her hair and 40px under her boot soles, 40px of clear green on each side; the **head occupies the top ~30% of her total height**, eyes about 22% down from the top.
> Flat cel shading, clean thin line art, soft warm palette, no shading on the green background.

### P0 验收清单

| # | 检查项 | 合格标准 |
|---|---|---|
| 1 | 尺寸 / 底 | 1024×1536，平涂 `#00FF00`，无边框/文字/水印/投影 |
| 2 | 主体数量 | 只有一个人物，**完整的全身**（不能切掉脚） |
| 3 | 出框 | 四周各留 ≥40px 绿边，头发和靴子都不碰边 |
| 4 | 构图 | 头顶到靴底，3 头身，头高约 460px |
| 5 | 可拆性 | 脸是一整块干净皮肤，**没有眉毛**（只要眼睑阴影）；眼睑闭合形状清楚；嘴形清楚 |
| 6 | 姿势 | 正立，双肩高度差 <15px，双腿并拢，**双手空着且不与腰饰重叠** |
| 7 | 分层前提 | 裙摆**不压住靴子**（留出可见的腿/袜），胸前两条长发**不压在脸上** |

## 4. 表情三件（在 P0 上做局部编辑，不要重画）

> Using the P0 master image, keep the exact same position/size/composition. Change ONLY the following, everything else pixel-identical.

| 件 | 编辑内容 |
|---|---|
| 睁眼图 | 把半睁的睡眼**完全睁开**：虹膜完整、上睑线加粗上挑、保留原瞳色与高光 |
| 闭眼图 | 眼睛闭成一条向下弯的弧线，睫毛压在弧线上 |
| 张口图 | 嘴张成一个小的蛋形（要有口腔和舌头），其余不动 |

## 5. 部件清单（PSD2Live tag）

| 优先级 | tag | 件数 | 这个角色的特殊之处 |
|---|---|---|---|
| P1 | `back hair` | 1 | 背后的大卷发，整块，垂到腰下 |
| P1 | `front hair` | **2–3** | 刘海 1 + 两侧垂到胸前的长发各 1；发量太大，合成一件会挡住脸和手 |
| P1 | `headwear` | 1 | 黑色大蝴蝶结 + 橙色雏菊 + 白色发带，全归这里（PSD2Live 没有 ornament 之分） |
| P1 | `face` | 1 | 一整块皮肤，含眼睑阴影，**不含眉毛** |
| P1 | `eyewhite-l/-r` | 2 | 淡色杏仁，要比可见眼大一圈 |
| P1 | `irides-l/-r` | 2 | 琥珀橙虹膜 + 深色瞳孔 + 高光 |
| P1 | `eyelash-l/-r` | 2 | 深棕色上睑线，内尖外挑 |
| P1 | `eye close-l/-r` | 2 | 闭眼弧线（从闭眼图切） |
| P1 | `mouth close` | 1 | 很小的嘴，静止时几乎看不见（和 GPT 角色同样的坑） |
| P1 | `mouth open` | 1 | 要**画全开**，≥40×40px，否则舞台上张不开嘴 |
| P1 | `neck` | 1 | 脖子 + 锁骨，顶端压到下巴下面 |
| P1 | `neckwear` | 1 | 白蕾丝领 + 橙色领结 |
| P1 | `topwear` | 1 | 白裙上身 + 黑/橙束腰 + 金色刺绣 + 橙缎带 |
| P1 | `handwear-l/-r` | 2 | 泡泡袖 + 手（交叠在身前，两只分开出） |
| P1 | **`bottomwear` ×2** | 2 | **裙子前片 / 裙子后片要分开**：后片在腿后面，前片在腿前面，否则腿一动就穿帮 |
| P1 | `legwear-l/-r` | 2 | 白袜 + 露出的膝盖，从裙摆下沿到靴口 |
| P1 | `footwear-l/-r` | 2 | 白短靴 + 橙鞋带 |
| P2 | `face detail` | 1 | 腮红/鼻尖高光（可选，母图里若有就切出来） |
| P3 | `objects` | 1 | 书（只在选方案 C 时做） |

合计 **25–28 件**（比 GPT 角色的 22 层多 4–6 件，多出来的就是下半身）。

**不要做的**：`eyebrow`（这个角色画了眉毛就会像贴上去的灰条，见 gpt 文档 §10.2）、`ears`（被头发完全盖住）。
**腿不要单独出**：腿的皮肤属于 `legwear`（白袜直接覆盖），不需要 `leg` 这种 tag。

## 6. 交付方式

和上次一样，逐件出图、`1024×1536` 绿底、一次一张。文件名直接用 tag：

```
back_hair.png  front_hair.png  front_hair-l.png  front_hair-r.png
headwear.png   face.png
eyewhite-l.png eyewhite-r.png  irides-l.png  irides-r.png
eyelash-l.png  eyelash-r.png   eye_close-l.png  eye_close-r.png
mouth_close.png  mouth_open.png
neck.png  neckwear.png  topwear.png  handwear-l.png  handwear-r.png
bottomwear-back.png  bottomwear-front.png
legwear-l.png  legwear-r.png  footwear-l.png  footwear-r.png
face_detail.png
```

拿到后我这边跑：`assets\_raw\_chain.ps1`（默认 BiRefNet 软 matte，自动抠图 → ingest → clean → build），
再把 `preview/longtable.html` 的 `MODELS` 加一条即可上桌。

## 7. 全身版的三个代价（先知道，别到时候怪渲染）

1. **臂展不变、头变小**：既然整个人塞进座位高度，头只有 GPT 角色的约一半（139px → ~73px）。
   舞台上我会给 Claude 单独配放大裁切（`scale` + `dy`），只露上半身，头就回到 139px；腿藏在桌子下面。
   换句话说：**舞台上看到的还是半身，全身只在素材页/立绘里能看到**。
2. **脸部像素减半**：脸从 956px 高降到 ~460px，眼宽从 150px 降到 ~80px。软 matte 还能抠，
   但眼睫毛的细节会少一档——如果觉得不够，可以把画布改成 `1024×2048`（约 2:3 → 3:4 的更高比例），
   脸能多 30% 像素，代价是 GPT 出图成功率下降。
3. **管线要改一处**：现在 `prep_parts_gpt.py` 是按 **ink 宽度** 映射到 2048（`TARGET_INK_W=1836`），
   全身竖长图按宽度映射会**高度溢出画布**。所以要加一条：ink 高宽比 > 1.6 时改为按 **ink 高度** 映射到 ~1900。
   这一处我来改，不影响 GPT 出图。

## 8. 待拍板

1. **姿势**：A（空手，推荐）/ B（抱书）/ C（两套切换）。
2. **画布高度**：`1024×1536`（3 头身，脸 ~460px，稳妥）/ `1024×2048`（脸 ~640px，更精细但更考验出图）。

## 9. P0 实测记录（2026-11-02，已收）

`assets/incoming/claude-parts/P0-master.png`（1024×1536，全身空手版）：

| 项 | 实测 | 判定 |
|---|---|---|
| 背景 | 边框环中位色 `[2,249,2]`，环内 std ≈ 1 | 干净，可直接键 |
| ink bbox | `(129,42)-(894,1494)`，`766×1453` | — |
| 四边留绿 | 左 129 / 右 129 / 上 42 / 下 41 | 合格（≥40） |
| 主体占比 | 44.1% | 合格 |
| 高宽比 | 1453/766 = **1.90** | **>1.6，`prep` 必须改按高度映射**（否则溢出 2048 画布） |
| 头身比 | 头 ~484px / 全高 1453 ≈ 3.0 头身 | 合格 |
| 左右居中 | 129 == 129 | 完美对称 |

同时留档了半身备选 `assets/incoming/claude-parts/p0-halfbody.png`（同一角色、切在胯部）。

## 10. 从「一张母图 + 三张表情」切 24 件的流水线（2026-11-02 落地）

鲸鱼娘和 GPT 都是「每件一张图」，小 Claude 只有母图，所以全部部件都得从同一张图上切出来。脚本链（`assets/_raw/`）：

```
cut_claude.py        # 母图 + 睁眼/闭眼/张口 → assets/build/claude-parts/src/*.png（24 件，1024×1536 坐标系）
claude_to_canvas.py  # 映射到 2048² 画布 → assets/build/claude-parts/parts/*.png
build_claude_model.py# 组 PSD + 调 PSD2Live → assets/build/claude-parts/p2l/
claude_check.py      # 可选：把 parts 按 z 序叠回，与母图并排对比（--box/--zoom）
```

### 10.1 坐标与比例

| 项 | 值 |
|---|---|
| 母图 ink bbox | `(129,42)-(894,1494)`，`766×1453` |
| 2048 画布映射 | `scale = 1836/1453 = 1.2645`、`dx = 377.2`、`dy = 52.9`、`TOP = 106` |
| 头发顶 / 眼睛 / 下巴 | canvas y ≈ 106 / 495 / 751 |
| 舞台上 `scale` | `1.0`（头 645×0.1191 = 76.8px ≈ GPT 76.6px） |
| 舞台上 `dy` | `30`（全身像脚底比半身像低 44px，以**眼线**对齐邻居；`dy=0` 时眼线高 36px） |

高宽比 1.90 > 1.6，所以按**高度**映射（`TARGET_H=1836`），不能沿用 GPT 的按宽度映射 —— 否则竖长图会溢出画布。

### 10.2 眼睛四件：用 open/close 差异找位置，用「最大 amber 连通块椭圆」定虹膜

颜色判据单独用是不行的，实测三连坑：

- `amber = (r-b>55)&(r>150)&(sat>0.45)` 在眼框里命中 12170px —— **头发是同一种橙色**，凸包直接等于整个眼睛矩形；
- `white = (mn>225)&(sat<0.22)` 命中 1328px —— **眼白是暖奶油色，和皮肤几乎同色**（sclera `[253,244,239]` vs 皮肤 `[252,238,230]`）；
- `dark = mx<130` 命中 1927px —— 包含**上睫毛弧 + 瞳孔 + 虹膜外圈深棕**。

可靠做法：用睁眼图与闭眼图做差，`diff_regions()` 得到的连通块**就是眼睛本身**（左 `(368,250)-(481,395)` 6718px、右 `(532,294)-(657,430)` 6246px），再在块内：

```python
opening = fill_holes(closing(comp, 2))
amb = amber & opening; 取最大连通块          # 头发散点会把 bbox 撑到全眼，必须只留最大块
iris  = ellipse(该块外接椭圆, rx*1.5+2, ry*1.35+2) & opening
lash  = dark & opening & ~iris
sclera= opening & ~iris & ~lash
```

再补两条：`eyewhite` 只给虹膜做背衬（`dilate(iris,1) & almond & ~lash`），`eye_close` 用 `dilate(almond,4)` 限定范围以免眨眼时露背景。**每个件的 RGB 要按语义取源图**：眼三件取睁眼图、`eye_close` 取闭眼图、其余取母图 —— 都取母图会把闭眼姿态的皮肤色填进虹膜。

### 10.3 另外四处必须避开的坑

1. **`bangs` 要按连通块过滤**：`orange & body` 会连胸口金色蕾丝一起命中，夹在两束头发之间渲染成浅色噪点。`label()` 后只保留与 `head` 椭圆相交的块即可。
2. **`neckwear` 不能用硬矩形**：`rect(425,435,615,585)` 的上缘会在脸颈之间画一条白亮横带，改成亮色蕾丝斑块（`mn>232 & sat<0.12` + 与头部矩形求交）。
3. **`head` 椭圆要盖住下巴**：`ellipse(330,240,700,520)` 的底边就是下巴的切线，改成 `(330,235,706,552)`。
4. **PSD2Live 会挂住不退出**：`WaitForExit` 永远等不到，但 `build-report.json` 与 `p2l/*` 已经写好 —— 跑完直接 `Get-Process PSD2Live | Stop-Process -Force`，不要等；每次 build 前也先杀残留进程。

### 10.4 成品参数

`{layers: 26, drawables: 29, deformers: 25, parameters: 20, atlasPages: 7}`，moc3 736000B；warnings 只有 Duplicate layer names（`legwear/footwear/handwear/eyewhite/irides/eyelash`，PSD2Live 靠 `-l/-r` 后缀区分，属正常）+ `DrawOrdersRenumbered`。

## 11. 接进长桌舞台

`preview/longtable.html` 的 `MODELS`（席位名取自 `NAMES = [... "Kimi", "Claude", "GPT" ...]`，Claude 是 index 4）：

```js
Claude: {
  url: '../assets/build/claude-parts/p2l/claude.model3.json',
  scale: 1.0,
  dy: 30
}
```

- **不需要 `faceDx`**：母图左右完全对称（留绿 129 == 129），脸本来就在中线。
- `scale` 与 `dy` 的推导见 §10.1；改 `dy` 后重截 `?n=6&still=1` 时，用橙色像素检测（`(r>150)&(r-b>60)&(g>60)&(g<190)`，只统计 x 760..1180）量头顶 y，比肉眼可靠。
- 预览页：`preview/gpt-model.html?model=../assets/build/claude-parts/p2l/claude.model3.json&idle=0&noeye=1&z=2`。
## 12. 抱书姿势变体（两个 moc3 + 舞台交叉淡化）

PSD2Live 没有"姿势切换"的作者接口（`psd2live.json` 里 26 层 `switchId` 全为 0），所以抱书版做成**第二个 moc3**，和空手版共用同一套部件，只换手臂和书：

| 项 | 内容 |
|---|---|
| 额外主图 | 1 张局部编辑：只改双臂 + 加一本合着的古籍，其余像素不动，画布/绿底/ink bbox 与 `P0-master.png` 一致 |
| 新切件 | `handwear-l`、`handwear-r`、`objects`（书） |
| 复用件 | 其余 21 件，同一份 PNG 直接拷过去 |
| 出模 | `claude-book.model3.json`（同 `build_claude_model.py`，只换 parts 目录） |
| 过渡 | 舞台同座位叠两层，`__setPose()` 做 240ms 交叉淡化 |

### 12.1 主图提示词（在 P0-master.png 上做局部编辑）

```
Same character, same canvas (1024x1536), same flat green #00FF00 background as the input image.
Change ONLY the arms and add one book. Everything else must stay pixel-identical:
head, face, eyes, expression, hair, black bow, orange daisy, collar, bodice, gold trim,
skirt, legs, boots, and the outer silhouette (hair top y=42, boot soles y=1494,
left edge x=129, right edge x=894) must not move or change colour.

New pose: both arms raised so the forearms cross in front of the chest; both hands hold a
closed antique book flat against the chest. Elbows tucked in at the waist. Sleeves keep the
same cream fabric, same cuffs, same line weight and shading style as the rest of the dress.

The book: closed, thick, dark umber-brown leather cover with two small brass corner caps
(top-right and bottom-right), gilt page edges visible along the right side, spine facing her
left. Tilted only slightly (about 10 degrees). No text, no ornament pattern on the cover.
Size: about 300px wide in this 1024-wide canvas, centred on the chest, its top edge just
below the collar so it does not cover the neckwear or the chin.

Both hands must stay fully visible in front of / beside the book (do not hide them behind
it, do not merge fingers into the cover) - they will be cut out separately.
Do not add any other prop, shadow, or background element.
```

### 12.2 收图后先验三件事

1. `ink bbox` 仍是 `(129,42)-(894,1494)` —— 变了就说明它顺手重画了别处，坐标映射会整体漂移；
2. 手臂与头发/裙摆**不重叠**（重叠处切出来的手会在淡化时露馅）；
3. 书和手**颜色可分**（书是深褐色、手是肤色），否则只能把"双臂+书"并成一件 `objects` 一起换。
