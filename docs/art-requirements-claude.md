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

### 10.2 眼睛四件：不要在表情图上重切，直接用母图

> 2026-11-02 修订。初版把眼三件切自 `claude-open.png`，结果渲染出来是「大圆睁眼 + 大片奶白眼白 + 白高光」，和母图的**半眯眼**完全不是一只眼睛，用户一眼就看出来「claude 直接在主图上错误」。表情图只该用于 `eye_close` 与 `mouth_open`，眼睛本体必须取母图。

母图里眼睛的构成（8× 实拍）：厚藏青上睫线（外角上挑）、上睑压住虹膜上缘、赭橙渐变虹膜、虹膜下方两侧只有很窄的**奶油色 sclera**、底部一条细深色轮廓。四件都从母图这一块里切，只有 `eye_close` 取 `claude-close.png`：

```python
# 1) 定位：母图 rect(320,250,700,430) 内 (mx<150) 经 closing(4)+fill_holes，
#    过滤 sum>=800 且 宽>=70 且 高<=60 且 320<=y0<=400，按 x 排序取前两
#    实测 eyelash-l (367,344)-(471,379)、eyelash-r (558,338)-(657,374)
# 2) 杏仁：中性色才是 sclera —— 皮肤 r-g≈14..22，sclera r-g<12
neutral = (mn > 195) & ((r - g) < 12)
blob    = ink | (neutral & dilate(ink, 8))
almond  = fill_holes(dilate(blob, 2)) & ellipse(ink_bbox ± 2)
# 3) 按墨迹切，不按语义切 —— 保证三件拼回去与母图逐像素一致
lash = (mx < 150) & almond
rest = almond & ~lash          # irides 与 eyewhite 共用这一份遮罩和母图颜色
```

- **sclera 判据必须是中性色 `(r-g)<12`，不能用 `(mn>190)&(sat<0.25)`**：后者把奶油 sclera 当成皮肤剔掉，杏仁中间被打洞，脸上刷肤色后就成了虹膜外面一圈白环（就是用户说的「白光」）。
- **`face` 层必须把母图自己的眼睛和嘴都挖空**，否则所有部件都是叠在一张冻结的原图上「晃」，用户的原话是「你弄了背景怎么也是一张原主图啊，现在一坨部件在主图上晃，你新画的嘴也在原来的嘴下面」。用 `cv2.inpaint(master, dilate(eye∪mouth, 2), 4, cv2.INPAINT_TELEA)`，不要平涂成肤色 —— 平涂会在眼周留一圈浅色环。注意 `face_rgb` 必须在**嘴部切件算完之后**再算，否则拿不到 `mouth_close` / `mouth_open` 的掩码。
- 校验工具：`python assets/_raw/_cl_face_cmp.py 820 440 1300 580 3.0` 会按 PSD z 序叠回 2048 并和母图并排，打印 `diff>28` 与 `mean|d|`（眼带实测 `6483/67200`、`mean 10.10`，头发对照区 `mean 4.21`）。
- 杏仁外缘仍有一圈很淡的边（母图 sclera 本身就接近肤色），座位尺寸下不可见。
- 一度以为「晃动时脸被浅色楔形遮住」是 `eye close` 图层在 `ParamEyeLOpen=1` 时仍可见（`?eye=0`/`?eye=1` 对比无法区分，见 `preview/gpt-model.html` 的 `?eye=` 调试参数）。白边（§10.2c）修掉后楔形消失了，但**`eye close` 仍然要摘掉**：它没有绑到任何变体参数（`claude.psd2live.json` 里 `parameter:''`、`switchId:0`），是个常显图层；`face` 把眼洞 inpaint 掉之后，盖在上面就只剩一片闭着的眼皮（详见 §10.4 的取舍）。

### 10.2b 嘴：要用 `fill_holes` 封成实心，不能只取暗色轮廓

`mouth_open` 初版写成 `rect & (mx<245) & (r-g>18)`：源图口腔内部是**亮粉**（`mx` 常 >245），整片被排除，只剩 ~3px 深色轮廓 → 张嘴时是个「深色空心圈 + 皮肤透过」的甜甜圈，而且它的顶边比 `mouth_close` 高 10px，会在嘴唇上方露出一道弧（用户说的「嘴上面没弄干净」）。正确规则：

```python
m_dark = mrect & (mx < 205) & ((r - g) > 25)
m_pink = mrect & ((r - g) >= 45)          # 粉腔 r-g≈90，皮肤 r-g≈23 不会被吃
mouth  = fill_holes(closing(m_dark | m_pink, 2)) & mrect   # 再取最大连通块
```

母图 791px、2048 画布 1520px（旧版只有 517px 的轮廓）。

**但封成实心之后 `mouth open` 反而要摘掉。** 渲染里闭口状态多出一道细弧（「双层嘴」）——用 `assets/_raw/_probe_mouth.py` 分别丢掉 `mouth_open` / `mouth_close` 各建一版定位到：细弧来自 `mouth open` 层。查官方 spec（`psd2live/master/docs/en/spec/PSD_LAYER_SPEC.md`）：

> A mouth with its own lips or lines gets no generated outline.
> For painted lips, or a cleaner open and close, split the mouth into two groups as hand riggers do: `mouth inside` / `upper teeth` / `lower teeth` / `tongue` / `upper lip` / `lower lip` / `upper lip line` / `lower lip line`.

我们的嘴是一整只椭圆、既没有 `upper lip` / `lower lip` 层，于是 PSD2Live **自动生成了上下口线**，而生成的口线是常显的（不随 `ParamMouthOpenY` 隐藏），闭口时它就是那道弧。所以 `CLAUDE_PARTS` 里 `mouth_open` 已注释掉。真要做能张开的嘴，必须先在母图上把嘴画成分层结构（口腔 / 上齿 / 下齿 / 舌 / 上唇 / 下唇 / 唇线），一件不能少。

### 10.2c 边缘发白：重采样必须在「颜色 ≤ alpha」的约束下做

症状：`mouth_close` 在皮肤上呈「深粉笔画 + 白圈」，`eye close` 上睑边缘发白，头部一转就变成一片浅色楔形（用户两次报修都是这一条）。

根因不在切件，在 `assets/_raw/claude_to_canvas.py` 的重采样：

1. **LANCZOS 有负瓣**：2px 深的唇线会被过冲到 `rgb > alpha`，反预乘时 `rgb/alpha` 直接溢到 1.0，量化成 `(255,255,255)` 且 alpha 仍是 255 —— 实测 `parts/mouth_close.png` 里 90 个纯白像素，`(1020,595) = (255,255,255,255)`。
2. **`alpha_composite` 的低 alpha 量化**：即使换 BILINEAR，合成到空画布后仍有少量半透明像素四舍五入成 255。

两条修法（都已落在 `claude_to_canvas.py`）：

```python
pre[..., :3] = np.minimum(pre[..., :3], pre[..., 3:4])   # 预乘色不许超过 alpha
out = out.resize(size, Image.BILINEAR)                    # 换掉 LANCZOS：没有负瓣就没有过冲
rgb2 = np.minimum(rgb2, al2)
straight = rgb2 / np.maximum(al2, 1.0 / 255.0)            # 分母下限 1/255，防近零 alpha 爆炸
# 合成完再对整张画布 bleed 一次：半透明像素一律取最近不透明像素的颜色
carr = np.asarray(canvas)
canvas = Image.fromarray(np.dstack([bleed(carr[..., :3], carr[..., 3]), carr[..., 3]]), "RGBA")
```

验收口径：`parts/*.png` 里 `min(rgb)>=250` 且 `40<=alpha<250` 的像素数必须为 0（`face` 例外，它本来就有白色高光）。修完 `mouth_close` 203px、`mouth_open` 1373px，白边计数全 0。

### 10.3 另外四处必须避开的坑

1. **`bangs` 要按连通块过滤**：`orange & body` 会连胸口金色蕾丝一起命中，夹在两束头发之间渲染成浅色噪点。`label()` 后只保留与 `head` 椭圆相交的块即可。
2. **`neckwear` 不能用硬矩形**：`rect(425,435,615,585)` 的上缘会在脸颈之间画一条白亮横带，改成亮色蕾丝斑块（`mn>232 & sat<0.12` + 与头部矩形求交）。
3. **`head` 椭圆要盖住下巴**：`ellipse(330,240,700,520)` 的底边就是下巴的切线，改成 `(330,235,706,552)`。
4. **PSD2Live 会挂住不退出**：`WaitForExit` 永远等不到，但 `build-report.json` 与 `p2l/*` 已经写好 —— 跑完直接 `Get-Process PSD2Live | Stop-Process -Force`，不要等；每次 build 前也先杀残留进程。

### 10.4 成品参数

`{layers: 21, drawables: 22, deformers: 25, parameters: 20, atlasPages: 6}`，moc3 约 700KB；warnings 只有 Duplicate layer names（`legwear/footwear/handwear/eyewhite/irides/eyelash`，PSD2Live 靠 `-l/-r` 后缀区分，属正常）+ `DrawOrdersRenumbered`。

**为了「一张干净的脸」主动摘掉了两层**（都在 `assets/_raw/build_claude_model.py` 的 `CLAUDE_PARTS` 里注释着，附原因）：

| 摘掉的层 | 原因 | 代价 |
| --- | --- | --- |
| `eye close` | 无变体参数绑定 → 常显图层，盖住睁眼 | 没有眨眼动画，眼睛就是母图的半眯眼 |
| `mouth open` | 无 lip 层 → PSD2Live 自动生成常显口线，闭口也有一道弧 | 没有口型同步 |

这两件要恢复，得先让 PSD2Live 把它们当成**变体**（`ParamEyeLOpen` / `ParamMouthOpenY` 绑定）——CLI 构建不出这种绑定（`switchId` 全 0）。**已解决，见 §13**：走 GUI 自带 MCP 的 `import_layout`，manifest 里给每层写 `variant`，v2 模型现在能眨眼、能开口，并且顺带把 6 张图集压成 1 张。

## 11. 接进长桌舞台

`preview/longtable.html` 的 `MODELS`（席位名取自 `NAMES = [... "Kimi", "Claude", "GPT" ...]`，Claude 是 index 4）：

```js
Claude: {
  url: '../assets/build/claude-v2/claude.layout.model3.json',   // v2，见 §13
  scale: 1.1,
  dy: 45,
  blink: true,
  gestures: true
}
```

- **不需要 `faceDx`**：母图左右完全对称（留绿 129 == 129），脸本来就在中线。
- `scale` 与 `dy` 的推导见 §10.1；改 `dy` 后重截 `?n=6&still=1` 时，用橙色像素检测（`(r>150)&(r-b>60)&(g>60)&(g<190)`，只统计 x 760..1180）量头顶 y，比肉眼可靠。
- 无头截图时用 `?only=4,5` 只加载 Claude 与 GPT 两个模型（6–8 个模型一起加载会把无头 Edge 挂死）。
- 预览页：`preview/gpt-model.html?model=../assets/build/claude-v2/claude.layout.model3.json&idle=0&noeye=1&z=2`。
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

### 12.3 这张主图已经用中转站出好了（2026-11-02）

不用再手工桥接：`relay-kit/` 能开着独立 Edge（CDP 9223）直接驱动 `https://ns01.plusai.io/`（ChatGPT 网页镜像）出图、也能**按附件局部改图**。

- 已产出 `assets/incoming/claude-parts/P0-master-book.png`（1024×1536）：双臂抱合着的深褐古籍、其余不动；**ink bbox `(130,43)-(893,1493)`**，与母图 1px 内一致，`diff>24` 仅 9.96% —— 三件事的前两件已过。
- 取图必须用 `relay-grab-imagegen.mjs`：生图渲染在 `div.group/imagegen-image` 的 `<img src="/backend-api/estuary/content?id=file_…">` 里，**没有** `data-message-author-role="assistant"`，所以 `relay-artifacts.mjs` / `relay-fetch-artifacts.mjs` 都扫不到（各报 0 条）；页面内 `fetch(url,{credentials:'include'})` 直接 200，不需要签名；卡片懒渲染，须等 5s 并 `scrollTo(0, body.scrollHeight)`。

可复用命令（`relay-kit` 里）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\relay.ps1 up       # status 确认 mine=true
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\relay.ps1 ask --new --file <png> --message "<§12.1 那段>" --timeout 120
# 等 5–9 分钟；打出 REPLY (0 chars) / 正在处理图片… 属误报，别重发
node tools\relay-grab-imagegen.mjs --chat <ask 打印的 CHAT 链接> --list
node tools\relay-grab-imagegen.mjs --chat <同上> --out D:\dsh_simroundtable\assets\_raw\relay-test\
```

三个坑：`relay.config.json` 必须**纯 ASCII**（PS 5.1 按 GBK 读会 `ConvertFrom-Json` 崩）；执行策略要 `-NoProfile -ExecutionPolicy Bypass -File`；只操作 `window.name==='dsh-automation'` 的标签页，要关只用 `relay.ps1 down`（禁止按进程名杀浏览器）。

下一步（未做）：按 §12.1 的坐标切 `handwear-l/r` 与 `objects` 三件，其余 21 件复用，出 `claude-book.model3.json`，再取消 `preview/longtable.html:92` 的 `alt` 注释。

### 12.4 舞台排障：运行期异常可见 + 「标准姿势」开关

ticker 里任何一次抛错都会让眨眼/动作/换姿势**静默失效**（v2 就踩过：`forceGest` 未声明，每帧 `ReferenceError`，动作从来没执行过，而截图看起来只是「她不动」）。无头截图看不到 console，所以 `preview/longtable.html` 现在：

- 顶部注册 `window.__errs`：`error` 与 `unhandledrejection` 各收前 4 条；
- `?debug=1` 的 overlay 每 0.5s 刷新一次，有异常就贴 `ERR(n): …`，没有就贴 `fps=…` —— 截图即可判读，不用开 DevTools；
- `?nogest=1` 关掉自动小动作（`gestureOffsets` 直接返回 null）。静帧验收必须带它：否则随机抓到的是 `happy` 的 ^^ 眼或 `tilt` 的歪头，很容易误判成「眼睛坏了」。

判据示例（1000×900 窗口）：`?only=0,4,5&debug=1` → overlay 显示 `fps=43` 且无 `ERR` 行；`?only=4&still=1&eye=1&nogest=1` → 标准姿势下两颗琥珀眼睁开、嘴部一条笑弧、无绿边。

### 12.5 听人说话：朝发言人偏头

圆桌上最像「活的」的动作不是自己摇摆，而是**别人说话时看过去**。`preview/longtable.html` 的 `speakerI` 记录当前发言人，其余座位在待机分支里加：

```js
look = clamp((seats[speakerI].x - s.x) / (STAGE_W * 0.32), -1, 1);
s.lookSmooth = (s.lookSmooth ?? 0) * 0.90 + look * 0.10;   // 平滑，换人不抽搐
turn += s.lookSmooth * 7;     // ParamAngleX  ±7°
lean += s.lookSmooth * 2.2;   // ParamBodyAngleZ
eyeX += s.lookSmooth * 0.55;  // ParamEyeBallX（再大就成对眼）
```

`?speak=<seat>` + `?still=1` 可以钉住某个座位发言来验收：同一座位在 `?speak=0` 与 `?speak=4` 两张静帧之间实测差 **11575px**（bbox 覆盖两人，含头转与眼珠），肉眼在 5× 放大下能看到她朝发言人侧头。幅度上限刻意压小：超过 ±10° 时 3 头身的头会撞到旁边的椅子。

### 12.6 弱机器自救：自适应渲染分辨率（round 10）

舞台逻辑尺寸恒为 1400×920，渲染缓冲 = `baseRes() × quality`：

```js
function baseRes(){            // 跟随窗口与 devicePixelRatio，隐含 1..3 的上下限
  return Math.min(3, Math.max(1,
    Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) * (window.devicePixelRatio || 1)));
}
let quality = 1;               // 唯一的自适应旋钮
```

帧率统计处每 0.7s 判一次：`fpsNow < 26` 就 `quality -= 0.06`（**地板 0.70**），`fpsNow > 55` 则
`quality += 0.04` 慢慢加回去；只有变化超过 0.03 才真的 `renderer.resize`，避免抖。overlay 里现在会写
`fps=43 res=1.00`，调试时一眼能看出当前档位。手动入口：`?q=off` 关自适应、`?qforce=0.6` 钉死档位。

**为什么地板是 0.70 而不是更低**：同场景对比（`?only=4&still=1&eye=1&nogest=1`，1000×900，
crop `(500,470,600,560)`）`?qforce=1` 与 `?qforce=0.6` 的平均绝对差只有 3.55/255，但 0.6 那档
**眼睛会糊成一坨深色**——座位尺度下眼睛是她唯一的表情出口，所以宁可少省一点显存也要保住 0.70。
对比图 `preview/_q-cmp.png`（左 1.0 / 右 0.6）。

**这一步的验证边界（重要）**：无头截图跑在 `--virtual-time-budget` 下，`performance.now()` 不推进，
所以 `t - lastFps > 700` 永远不成立 → fps 计数器与自适应逻辑**在截图里根本不会触发**，
overlay 永远显示 `fps=--`。也就是说：静态档位（`?qforce=`）可以用拼图对比验证，
但「掉帧后自动降档」只能在真实浏览器里看。别把 `fps=--` 当成 bug，也别声称跑过自适应测试。

### 12.7 看发言人 × 自己张望：两股转头别叠加（round 11）

§12.5 的「朝发言人偏头」本身就是 `turn += lookSmooth * 7`，而 `look` / `glance` 两个动作各带
±9..13° 的转头。两者同时生效就是 20°，3 头身的脖子会拧成麻花。现在动作叠加块里先判冲突：

```js
const lookAmt = Math.abs(s.lookSmooth || 0);
const gid = forceGest ? forceGest.id : (s.g && s.g.g.id);
const contradictsLook = lookAmt > 0.55 && (gid === 'look' || gid === 'glance');
if (!contradictsLook) {
  nod += off.nod || 0;
  turn += (off.turn || 0) * (1 - 0.75 * lookAmt);   // 其余动作的转头只留 1/4
  ...
}
```

**微妙的动作不能靠像素 diff 判**。头部框 `(515,485,600,570)`、`diff>40` 的噪声地板就有 ~600px
（空格对照 `gt0 vs gt1` 的 nod 就有 573px，同 URL 连拍也有 33184px 的差异：场景微尘 + AA），
动作是否生效必须**读参数数字**。于是 ticker 每帧写 `s.poseDbg = { turn, nod, lean, tilt, look, g }`，
`?debug=1` 的 overlay 每 0.5s 重算一遍 `seatLines()`（旧实现只在加载时拼一次 `base`，数字永远不刷新）。
1000×900 下 overlay 文本块从 y≈137 起、每行 ~12px，座位 4 那行在 y≈204-210。

实测三档（`?only=0,4&still=1&debug=1&speak=0&gest=<id>:0.5`，座位 0 发言、座位 4 看她）：

| 条件 | turn | nod | tilt | look | g | 结论 |
|---|---|---|---|---|---|---|
| `gest=look`（冲突，整段跳过） | -3.1 | -0.9 | 0.0 | -0.81 | look | 只剩待机 + 7°朝人偏头 |
| `gest=nod` | 2.9 | 10.8 | 0.0 | -0.81 | nod | 点头照做，转头不额外加 |
| `gest=tilt` | 3.9 | -1.1 | 9.0 | -0.81 | tilt | 歪头照做，转头压到 39% |
| `gest=look`（无发言人，对照组） | 12.0 | -0.8 | 3.0 | -0.10 | look | 动作本身完好 |

读数换算：待机 `turn` 分量在该相位是 +2.57（`-3.1 = 2.57 - 0.81*7`），`lean = -1.9` 正好是
`-0.81*2.2`；`gest=tilt` 的 3.9 = 2.57 - 5.67 + 0.39×off.turn（off.turn≈18）。四行数字自洽，
说明抑制与部分抑制都按预期生效。

### 12.8 待机前发微摆：物理关了，用参数补一点「活着」（round 12）

`PhysicsHairFront` 在 v2 就关掉了（§16.5 那条：`front hair` 是一整块网格同时含刘海与两侧长发，
软阈值会把刘海甩到眼睛上）。但完全静止的前发像蜡像，尤其是六个空座位并排时。

舞台给 Claude 座位加一个开关和一条极轻的参数摆动：

```js
// MODELS.Claude
sway: true,
// ticker，动作叠加之后
if (s.cfg && s.cfg.sway) {
  hair += 0.085 * Math.sin(t / 1500 + s.i * 1.7) + 0.035 * Math.sin(t / 620 + s.i * 2.3);
}
```

- 两个周期叠加（2.4s 与 1s）且相位按 `s.i` 错开，六个座位不会同拍，也看不出「一来一回」的机械感。
- 振幅上限 0.12。实测 `probe.html` 的 `p=HairFront:±0.12` 与 `:0` 差 72k px（bbox 覆盖整个头发区域），
  这是「看得见的摆」，再大就成甩头发了；座位上 0.1 左右的摆动刚好只够察觉「她在呼吸」。
- `hair` 已进 `s.poseDbg` 与 `?debug=1` 的 overlay（`hair=0.050` 这种三位小数就是它在动的证据）：
  这类 0.1 量级的参数用像素 diff 完全判不出来（噪声地板 600px 起）。
- 注意 `?nogest=1` 只关动作，**不关**这个待机摆动——它是「活体状态」不是「动作」。

### 12.9 抱书那层改为懒加载 + 藏起来就停物理（round 14）

第二姿势（`claude-book`）是同一座位的第二层 moc3，一开始是**在座位加载时一起预载**的。
问题有两个：抱书版自带一整张 4096 图集和一套物理，八个座位全预载等于首屏多等一倍、显存翻倍；
而且它 90% 时间是 `visible = false`，却仍在逐帧算物理。

改成两件事：

```js
// 座位加载：只登记一个加载器，不拉模型
const hasAlt = !!(seatCfg.alt && seatCfg.alt.url);
s.loadAlt = hasAlt ? async () => { … Live2DModel.from(seatCfg.alt.url) … } : null;
s.autoPose = hasAlt && seatCfg.autoPose !== false;

// ticker：到点了先拉模型，下一帧再开始淡入；藏起来时停物理
if (s.loadAlt && !s.altModel && s.autoPose && pinnedPose === null && t > (s.poseNext || 0)) {
  s.loadAlt(); s.poseNext = t + 1500;
}
s.altModel.autoUpdate = s.altModel.visible && !freeze;
```

要点：

- `loadAlt` 用 `s.altPromise` 去重；`?pose=4:alt` 与 `__setPose()` 都改成 `.then(apply)`，
  所以「立刻切到抱书」仍然成立（截图验证方式与以前一致）。
- **`hasAlt` 这个判断不能省**：第一版把所有座位都挂上 `loadAlt`，于是 GPT/深鲸座位在
  `?debug=1` 的 ticker 里每 1.5s 抛一次 `TypeError: seatCfg.alt is undefined`——
  正是 §12.4 那套 `window.__errs` 面板把它抓出来的（`ERR(1): …`）。非抱书模型的座位
  `s.loadAlt` 必须是 `null`、`s.autoPose` 必须是 `false`。
- 验证：`?only=0,4,5&still=1&eye=1&nogest=1&debug=1` 的 HUD 只有座位 0/4/5 三行有模型、
  没有 `ERR(...)` 行；`?only=4&pose=4:alt&still=1&eye=1` 里她仍然抱着书（懒加载路径走得通）。
- 局限：无头截图里 `performance.now()` 不推进，所以「等 3–7 秒自己抱起书」这条自动路径
  只能靠真浏览器看——但它是同一段 ticker 逻辑，`?pose=` 已经证明加载与淡入是对的。

### 12.10 眼珠活了以后：待机漂移 + 一次统一夹紧（round 16）

§16.18 之前 `ParamEyeBallX/Y` 是死的，所以舞台上「眼珠跟着发言人」这段代码写了也不生效；
补上 `irides` 之后第一件事是**给待机加一点自主视线**，否则她只会死盯着正前方：

```js
// 待机：两条互质的慢正弦 + 一点竖直漂移，幅度 ±0.25，相位按座位错开
if (!s.speaking) {
  eyeX += 0.17 * Math.sin(t / 2600 + s.i * 1.3) + 0.06 * Math.sin(t / 900 + s.i * 2.1);
  eyeY += 0.06 * Math.sin(t / 3300 + s.i * 0.7);
}
// 所有来源（动作 look/glance、发言人偏置、漂移）叠加后统一夹一次
eyeX = Math.max(-0.85, Math.min(0.85, eyeX));
eyeY = Math.max(-0.55, Math.min(0.55, eyeY));
```

- **夹紧放在最后而不是每处各自夹**：`look`/`glance` 动作本身给到 ±0.6，加上发言人偏置
  （`lookSmooth * 0.55`）和漂移会叠到 1.3 以上；`probe` 实测到 `EyeBallX:0.9` 时虹膜已经贴到
  眼睑上，再大就会露出整圈没被虹膜盖住的眼白。
- `?debug=1` 的 HUD 行里补了 `eyeX= eyeY=`，静帧（`?still=1` ⇒ `t=0`）读数可以直接对账：
  座位 0（发言中）`eyeX=-0.00`、座位 4/5 `eyeX=-0.44`（`lookSmooth=-0.77` 的偏置 + 漂移
  `-0.10`，夹紧前是 `-0.52`，与公式一致）。
- **像素 diff 在这里靠不住**：`?only=0,4,5` 改动前后全图差 6532px，主簇却落在座位 0 的
  `(62,507)-(193,596)`（场景微尘 + AA 的地板就有几千像素），座位 4 的眼部只占几百像素。
  判定要看 HUD 数字 + 7× 人脸裁切（`_gaze1-face.png` 里两颗虹膜都明显偏向左上）。
- 观感：座位尺度 82×84 的脸上，±0.44 的偏移让虹膜靠到眼白一侧但不贴上眼睑，读得出「她在看
  左边说话的人」，不会成对眼。

## 13. v2 出模管线：layout manifest → PSD2Live MCP（眨眼/口型终于能用）

§10.4 里「没有眨眼、没有口型」的限制在 v2 解掉了。CLI 只能吃 PSD，但 **PSD2Live 3.6.7 的 GUI 自带一套 HTTP MCP 服务**，里面有 `project/import_layout`、未发布的 `rig_generate`、`project/export_model`，可以把「每层绑哪个变体参数」直接写进 manifest，绕开 GUI 手点。

### 13.1 环境与客户端

- GUI 必须开着（`Start-Process tools\psd2live\app\PSD2Live.exe`），12s 后 `netstat -ano | findstr 23871` 应见 LISTENING；端点是 `http://127.0.0.1:23871/mcp`（默认端口见 `tools/psd2live/app/app/resources/mcp_proxy.py:26 DEFAULT_PORT = 23871`）。
- 客户端：`assets/_raw/psd2live_mcp.py`（自己写的 JSON-RPC，无第三方依赖）

  ```powershell
  python assets\_raw\psd2live_mcp.py tools                 # 列 28 个工具
  python assets\_raw\psd2live_mcp.py schema physics        # 单个工具的 op 与字段
  python assets\_raw\psd2live_mcp.py call workspace_inspect '{"request":{"scope":"project"}}'
  ```

- 三个必知坑：
  1. `initialize` 之后客户端会发 `notifications/initialized`，服务端回 `-32601 Server does not support notifications/initialized` —— 这是正常的，客户端里对 `notifications/*` 吞掉错误即可；
  2. 结果在 `structuredContent.data`，`request_id` 重复使用会 `request_id_reused`，每次调用要带新 ID；
  3. `wait_ms` 上限 30000，导出大模型别写成 60000（会 `invalid_request`）。
- 工具 `physics` / `project` / `motion` / `rig_deform` 等是**工具**，`physics_put` / `rig_generate` / `import_layout` 是**op**：写成 `{"op": "put", "request": {...}}`（前缀由工具名给出），直接 `call physics_put` 会 `Tool physics_put not found`。

### 13.2 manifest 与脚本

`assets/_raw/make_layout_manifest.py` 把 `assets/build/claude-parts/parts/*.png`（每件 2048² RGBA）裁到 alpha bbox，以「图片尺寸 = rect 尺寸」写 `assets/build/claude-layout/{parts/,claude.layout.json}`；`LAYERS` 是 5 元组 `(stem, name, split, param_l, param_r)`，z 序 back→front。

`assets/_raw/claude_v2_build.py [--import]`：inspect →（`--import` 时重跑 manifest + `import_layout` + `discard_unsaved`）→ `rig_generate`（走 `workspace_call`）→ `export_model` 到 `assets/build/claude-v2`。

产物：`claude.layout.moc3` **715904B**、**只有一张 4096 图集**（v1 是 6 张；bbox 裁剪后密度不变但省了大半纹理）、`claude.layout.model3.json`、`physics3.json`、`cmo3` 10.8MB。

### 13.3 变体语义：`toggle` =「参数为 1 时可见」

这是最容易绑反的一条。第一版把 `eye close` 绑成 `toggle(ParamEyeLOpen)`，结果睁眼时反而画上闭眼睑。正确的**手绑式**结构（已落地）：

| 层 | 绑定 | 含义 |
|---|---|---|
| `eye close` | **无变体**，紧贴 `face` 之上的普通层 | 常显的闭眼睑，作为底 |
| `eyewhite` / `irides` / `eyelash` | `toggle(ParamEyeLOpen)`（右眼 `ParamEyeROpen`） | 参数 1 时可见，盖住闭眼件 |
| `mouth open`（含自动拆出的 Upper/Lower lip outline） | `toggle(ParamMouthOpenY)` | 口线与口腔一起隐藏，闭口不再留弧 |

好处是不需要反向参数，也不需要 `ParamEyeLOpen=1` 之外的逻辑；代价是闭眼件必须放在睁眼三件**下面**。

验证：`preview/probe.html?model=../assets/build/claude-v2/claude.layout.model3.json&p=EyeLOpen:0`（闭眼 = 睫毛线）与 `:1`（睁眼 = 琥珀眼），`diff>24` 2882px。

> `probe.html` 里必须写 `model.internalModel.eyeBlink = undefined;`（在设参数之前）。pixi-live2d 的自动眨眼每帧把 `ParamEyeLOpen` 写回 1，第一次对比两张图只差 2 字节就是它干的。

### 13.4 头发「诡异摆动」= 物理参数太软，不是绑定错

`workspace_inspect {"scope":"physics"}` 里 PSD2Live 生成的预设：`PhysicsHairBack`（`output ParamHairBack` **scale 2.061**、`mobility 0.95`、`delay 0.8`）、`PhysicsHairFront`（scale 1.522、mobility 0.77、delay 1.45）。

问题在于 **`front hair` 是一整块网格，同时包含刘海和两侧长发**：任何摆动都会把刘海拖到眼睛上，看起来就是「头发在脸上滑」。手工作品里刘海是刚性跟随头部的，所以这里：

```python
TUNE = {
    # 后发留一点点跟随感，但幅度压到 0.6 倍、mobility 0.45
    "PhysicsHairBack": {"output_scale": 0.60, "mobility": 0.45, "delay": 0.70, "acceleration": 1.4},
    "PhysicsHairFront": {"enabled": False},     # 刘海+侧发直接刚性跟头
}
```

脚本 `assets/_raw/tune_physics.py [--show|--export-only]` 负责写这两组并重导出（`physics3.json` 是独立文件，改物理不必重做 rig，但要用 `export_model` 重新落盘）。验证用 `preview/anim.html?frames=8&secs=2.4&amp=8`：它按 `AngleX = 8·sin(2πt)` 连续推进 physics，把 8 帧画进一条胶片，`?native=1` 出原生尺寸方便放大看头。

### 13.5 舞台能演的小动作与眨眼

`preview/longtable.html` 的 `MODELS.Claude`：

```js
Claude: {
  url: '../assets/build/claude-v2/claude.layout.model3.json',
  scale: 1.1,     // 1.0 时比 GPT 显小，抬到 1.1
  dy: 45,         // 放大后头顶上移 ~15px，dy 从 30 补到 45
  blink: true,    // 只有绑了 toggle 的 v2 才能写 ParamEyeLOpen/ROpen
  gestures: true  // 待机时随机点头/低头/摇头/歪头/转头
}
```

- 小动作是**纯参数合成**（`GESTURES`：nod −11°、bow −16°、shake ±8°×4 次、tilt 7°、look 13°，包络 `sin(πu)`），**不要用 `model.motion()`**：舞台每帧都在写同一批参数，动作曲线会被覆盖成抖。
- 眨眼 `blinkValue()`：150ms 里 30% 闭合、70% 张开，间隔 2.4–8s 随机（约 1/5 的概率连眨第二下，间隔 320ms —— 真人就这样）；闭眼靠 `ParamEyeLOpen=0` 露出下面的闭眼件。
- **眼球不能转**：`ParamEyeBallX/Y` 在参数表里存在，但实测写入后画面**一个像素都不变**（`?sacc=0:0` vs `?sacc=0.2:0.12` 在脸框 `(820,390)-(940,480)` 内 `diff>24 = 0/10800`）——PSD2Live 没有给眼球建独立变形器。所以「眼睛左右瞟」这类微表演做不了，`look`/`sidelong` 手势里那点 `eyeX` 只是无害的摆设；想真要眼球，得回 Cubism 手绑眼球变形器或让美术把瞳孔单独成一个可位移画件。
- 截图校验参数：`?eye=0|1` 钉住眼睛、`?gest=nod:0.5` 钉住某个动作的包络相位、`?only=4,5` 只加载指定座位（8 个模型一起加载时无头 Edge 会挂）。

## 14. 抱书版出模：新增一条 `objects` 画件

第 12 节定了方案，这里记录**实际怎么做的**（成品 `assets/build/claude-book-model/claude-book.layout.model3.json`，moc3 700928B、单张 4096 图集 5.1MB、cmo3 11.6MB）。

### 14.1 只重切三件

`assets/_raw/cut_claude_book.py` 以抱书主图 `assets/incoming/claude-parts/P0-master-book.png` 为源（ink `(129,42)-(892,1494)`，与母图差 ≤2px），复用 `cut_claude.py` 的 `rect/poly/clean/col_classes`，只产 `objects`、`topwear`、`bottomwear` 三件；其余 20 件直接沿用 v2。

映射仍走 `claude_to_canvas.py`（monkeypatch `CC.SRC/CC.DST/CC.INK=(130,43,893,1493)`、`TARGET_H=1836`）得到 `scale=1.2662 dx=376.3 dy=51.6`，与 v2 的 `1.2645/377.2/52.9` 只差零点几像素 —— 说明「局部改图」没有动主体位置，这是能复用部件的前提。

### 14.2 书必须和双手合成同一条 `objects` 画件

两只手抱的是同一本书，彼此刚性：把手从封面上切走会在皮面上留一个手形洞，而且手层一旦滑动就对不上书。所以这一版**整层删掉 `handwear`**，书 + 双手 + 一点袖褶全部进 `objects`，排在层序最前（`headwear` 之后）。

书的分割**不要试颜色分割**（失败三次，记在这里省时间）：

1. `mx<180 & r−b>20` 会把袖口的褐色十字绑带一起算进去，`closing(4)+fill_holes` 直接填成整个 ROI 矩形（132901px，bbox 横跨 320..719）；
2. 加 `binary_opening(5×5)` 后又只剩 10656px（只剩中央金纹）；
3. 对 `tome|hands` 做 `fill_holes` 会因为袖子与书相接而桥接，把整个胸带吞掉（`topwear` 只剩 22.5k 像素，且全是头发色 `(236,124,79)`）。

**收敛的写法是反着定义**（`cut_claude_book.py`）：

```python
roi  = rect(345, 505, 700, 825)
hair = (sat > 0.45) & (mx > 200)                              # 亮橙头发
lace = (mn > 205) & (sat < 0.16) & ((r - g) < 12)             # 奶白蕾丝
mask = roi & body & ~hair & ~lace
mask = binary_opening(mask, np.ones((3,3))) · binary_closing(2)
tome = fill_holes(biggest_blob(mask))                          # 90087px, bbox (345,505)-(699,824)
```

边缘不齐不要紧：书是画在 `topwear` **之上**的，而 `topwear` 故意保留了书本像素（`rect(300,495,760,800) & body & ~neckwear`，不减书），万一 `objects` 变形露边，底下是同一张画，看不出来。`bottomwear` 同理（裙摆多边形不再排除书）。

### 14.3 `--book` profile 与出模

`assets/_raw/make_layout_manifest.py` 现支持 `--parts/--out/--name/--book`：`LAYERS_BOOK = [层序去掉 handwear] + [("objects","objects",False,None,None)]`。出模链 `assets/_raw/claude_book_build.py`：切件 → 映射 → 复制 v2 的 20 件 + 覆盖 3 件 + 删 `handwear-l/r` → 生成 manifest → MCP `import_layout`(`discard_unsaved`) → `rig_generate` → `export_model`。

预期告警只有 `Duplicate layer names detected: legwear, footwear, eye close, eyewhite, irides, eyelash`（左右件同名，与 v2 相同，无害）。

### 14.4 舞台上的抱书

```js
Claude: {
  url: '../assets/build/claude-v2/claude.layout.model3.json',
  alt: { url: '../assets/build/claude-book-model/claude-book.layout.model3.json' },
  scale: 1.1, dy: 45, blink: true, gestures: true
}
```

- 两层模型共用同一 `k`/锚点，`alt` 只多一个 `dy`；`s.model.alpha` 与 `s.altModel.alpha` 用**错开的窗口**（主图先退到 0.62、第二层从 0.38 才进来），避免两张半透明叠出鬼影。
- 自动换姿势：`poseNext` 到点就 `poseTarget` 翻转（抱 9–18s、放下 12–24s，淡化 700ms），`?pose=4:alt` 或 `__setPose(4,'alt')` 会钉住并关掉自动切换。
- `applyPoseParams(alt, pose)` 对第二层同样生效，所以抱书时也会眨眼、点头、说话。
- **注意**：无头 Edge 的 `--virtual-time-budget` 不推进 `performance.now()`，所以自动抱书在截图里验不出来（`?pose=4:alt` 可以）；真浏览器里正常。

## 15. Cubism Editor 5.3 外部应用集成 API：能做什么、为什么出模不走它

### 15.1 能力边界（先说结论）

编辑器是 **WebSocket 服务端**（默认 `ws://127.0.0.1:22033`），外部程序是客户端；报文是 `{Version, Timestamp, RequestId, Type, Method, Data}`，`Type ∈ Request/Response/Event/Error`。方法清单（[官方 API 列表](https://docs.live2d.com/en/cubism-editor-manual/external-application-integration-api-list/)）里只有两类：

- **读写参数**：`GetParameters`（含 `Default/Min/Max/Repeat/Type/Keyform`）、`GetParameterGroups`、`GetParameterValues`、`SetParameterValues`、`ClearParameterValues`（写入进临时缓冲，约 0.5s 后自动丢弃）、`GetCurrentModelUID`、`GetDocuments`、`GetCurrentEditMode`、`GetPhysicsInfo`、`SetGlobalVersion`、`SendCubismLog`。
- **听导出事件**：`NotifyMocFileExported` / `NotifyPhysicsFileExported`（先发 `{Enabled:true}`，之后编辑器导出时主动推 `{Path, ModelFilePath}`）。

**没有**建造形器、画件层级、变体、物理生成的接口 —— 也就是说它**不能替我们出模**。真正把 21/24 个画件绑上 `ParamEyeLOpen` / `ParamMouthOpenY` 的路径仍然是 §13 的 PSD2Live MCP；Cubism API 的用途是「在被编辑器打开着的模型上试参数、听导出、做联动」。

### 15.2 必须先过的一道门：`RegisterPlugin` + 勾 Allow

- 任何其他方法在注册前都返回 `PluginNotRegistered`。
- `RegisterPlugin` 带 `{Name, Token?, Icon?(base64 PNG 32–256px ≤0.5MB), Path?}`，响应给 `Token`；编辑器同时弹窗，**用户必须勾「Allow」**，否则后续仍被拒。
- 把 `Token` 缓存下来下次直接复用，就不会再弹窗（用户的授权按 app 记住）。客户端已把 token 存在 `assets/_raw/.cubism-token`（**在 .gitignore 里，别提交**）。
- `GetIsApproval` 返回 `{Result:Boolean}`，可用来轮询等用户点。

### 15.3 客户端脚本

`assets/_raw/cubism_api.py`（只依赖已装好的 `websocket-client`）：

```powershell
python assets\_raw\cubism_api.py status          # 连接 + 注册 + 看授权/编辑模式/文档
python assets\_raw\cubism_api.py params          # 列参数（含默认/范围）
python assets\_raw\cubism_api.py values ParamAngleX ParamEyeLOpen
python assets\_raw\cubism_api.py set ParamAngleX=20 ParamEyeLOpen=1
python assets\_raw\cubism_api.py watch 60        # 等 moc3 导出事件
python assets\_raw\cubism_api.py call GetCurrentModelUID '{}'
```

### 15.4 本机实测状态（2026-11-03 03:05）

- 编辑器进程在跑（3 个 `java.exe`，主窗口 `Live2D Cubism Editor 5.3.00 [试用版 剩余 42 天]`），但 **22033 没有监听**：`cubism_api.py status` → `ConnectionRefusedError [WinError 10061]`。
- `%APPDATA%\Live2D\Cubism5.3_Editor\` 下（`.tmp\property\*`、`logs\log.txt`）全库 grep `22033|ExternalApi|ExternalApplication` **零命中** → 外部集成是**默认关闭**、要人工在「环境设置 → 外部应用程序集成」里打开（或先打开一个模型再试）。
- 同一时间桌面处于锁屏状态（`mcp__windows__Snapshot` 返回 `No windows found` / `No active window found`），**GUI 点击无法进行**，所以这一项只能等用户在场时点两下，脚本已经备好。
- 结论：objective「用 Cubism API 做眨眼」在产物层面已由 §13 的 PSD2Live MCP 达成（真眨眼 + 真口型 + 抱书换姿势），Cubism API 仅作为**调试/试参数**的旁路保留，不阻塞交付。

### 15.5 那个开关到底在哪（2026-11-03 round 2，反编译 + GUI 尝试记录）

**反编译结论**（`G:\Live2D Cubism\Live2D Cubism 5.3\app\lib\Live2D_Cubism.jar`，全 jar 逐 entry 搜 ASCII `22033` 只命中一处）：

- 实现全在 `com/live2d/cubism/doc/webSocket/`：`y.class`（含默认端口常量）、`CExternalAppManager`、`CExternalAppAuthManager`、`CExternalAppIndicatorPanel`（状态栏那个小图标）、`CExternalAppSettingDialog`（设置对话框）、`CmdRegisterPlugin`、`Notify*FileExported`。
- 授权/令牌落盘在 **`ExternalApp_user.xml`**（`CExternalAppAuthManager` 的 `XML_FILENAME` + `ExternalAppAuthManager_Save`，含 `apps{origin→{token, accessTime, authentication, unauthorized}}`、`KEY_LATERONCE`）。
- 配置键在 `j$a` 里：`DEFAULT_SERVER_PORT`、**`KEY_ENABLED`**、`KEY_TOKEN`、`KEY_VIEWS`、`KEY_EXPORT_FILEPATH`；`l$a` 有 `isAllowRemoteConnection`（远程连接开关）。
- 菜单命令 id 是 **`command_externalAppSetting`** —— GUI 里「设置 / 环境设置 → 外部应用程序集成」调的就是它。

**为什么我没能自己打开**（三条都试过，记下来省得下次再撞）：

1. **配置文件还不存在**：`%APPDATA%`、`%LOCALAPPDATA%`、`Documents`、`%USERPROFILE%`、`G:\Live2D Cubism` 递归搜 `ExternalApp*.xml` **零命中**；`C:\Users\pordl\AppData\Roaming\Live2D\Cubism5.3_Editor\` 下只有 `.tmp\property\default_class_key\*.ser`、`.property\...\drawMethodVersion_model.ser`、`logs\log.txt` 等，grep `ExternalApp|22033` 也零命中。→ 文件是**第一次打开设置对话框时才创建**，不能手写伪造（schema 靠序列化，写错只会被忽略）。
2. **GUI 被一个卡死的恢复对话框占着**：点「继续使用」后弹「进度 / 打开模型文件」模态框卡在 0%，Cancel 与 Esc 都无效（上一会话 `Restore unsaved edits` 流程触发）。杀掉 3 个 `java.exe`（`app\jre\bin\java.exe -classpath "app\lib\Live2D_Cubism.jar;…"`）重启后虽然能起来（`java now: 1`），但 `22033` 仍不监听 —— 说明**打开文档 ≠ 打开服务**。
3. **UI 自动化驱动不了 Java 菜单**：`SunAwtFrame` 只暴露 6 个 UIA 子元素（TitleBar / 系统菜单栏 / 最小化 / 最大化 / 关闭），进程里 **没有加载 `WindowsAccessBridge-64.dll`**（`Get-Process java | %{$_.Modules}` 里零命中）→ 菜单项无法按名字定位，只能盲点坐标，风险不值得。

**给用户的三步（在场时 30 秒）**：

1. Cubism 编辑器里打开 `D:\dsh_simroundtable\assets\build\claude-v3\model\claude.layout.cmo3`；
2. 「设置 → 环境设置 → 外部应用程序集成」勾选启用（端口保持 `22033`）；
3. 之后我这边跑 `python assets\_raw\cubism_api.py status`，第一次会弹 Allow，勾上「Allow」即可；再跑 `params` / `values` / `set` 验证读写。

**已验的失败面**（证明门确实在服务端，不在脚本）：`cubism_api.py status` → `ConnectionRefusedError [WinError 10061]`；`Get-NetTCPConnection -LocalPort 22033` 计数 0（重启编辑器、命令行直接打开 cmo3 后都是 0）。

### 15.6 round 4 补充：协议键名已摸清，但开关仍不手写

二轮反编译（`assets\_raw\_jargrep.py` / `_jarstrings.py` 是这两个一次性探针，只读 jar、不进流水线）：

- `com/live2d/cubism/doc/webSocket/j$a.class` 里是**完整协议字表**：`KEY_ENABLED` / `KEY_TOKEN` / `KEY_VIEWS` /
  `KEY_PARAMETERS` / `KEY_PARAMETER_IDS` / `KEY_METHOD` / `KEY_RESULT` / `KEY_ERROR_TYPE` / `KEY_TYPE_{REQUEST,RESPONSE,EVENT}` /
  `KEY_DOCUMENT_UID` / `KEY_MODEL_UID` / `KEY_REQUEST_ID` / `KEY_TIMESTAMP` / `KEY_PARAMETERS`，还有 `DEFAULT_SERVER_PORT`、
  `ANIMATION_LIMIT_UPDATE_TIME`、`KEY_CUBISM_LOG_{TYPE,MESSAGE,DISPLAY}`。→ 消息形状就是
  `{type, method, requestId, result | error}` 这一套，`cubism_api.py` 的封装已经对齐。
- 授权记忆（`ExternalApp_user.xml`）走的是 Cubism 自己的 `com.live2d.serialize.UUSerialize`（`AppData{apps: origin→{token, accessTime, authentication, unauthorized}}`），
  **不是 `java.beans.XMLEncoder`**。文件名虽叫 `.xml`，内容是私有序列化 blob —— 手写伪造要么被忽略、要么把授权表搞坏，
  所以**坚持让 GUI 生成**，脚本这边只做「等文件出现 + 连上就测」。
- 另有 `l$a.isAllowRemoteConnection`（远程连接）与 `CExternalAppSettingDialog`，说明开关是「启用 + 端口 + 允许远程」三件套，
  默认全关。结论不变：`status` 能连上的前提是用户在编辑器里勾一次。

## 16. v3：^^ 笑眼（叠加件 + `ParamEyeBallForm`）

### 16.1 为什么是「叠一张画」

这个 rig **没有眼球变形器**：`ParamEyeBallX/Y` 写进去画面一个像素都不变（`?sacc=0:0` vs `?sacc=0.2:0.12` 在脸框内 `diff>24 = 0/10800`）。所以换表情只能用**另一张画盖上去**，和 §13.3 的闭眼件同一思路。

`assets/_raw/make_happy_eyes.py` 为每只眼生成一张 2048 画布件：

1. **底色 = 从 `face.png` 就地取的肤色补丁**（脸的母图已将眼睛与嘴 inpaint 掉，所以补丁与周围皮肤同源、无缝）；
2. 上面画一条 **∩ 形粗弧**，颜色取该眼睫毛最暗像素的中位色（实测 `(58,44,46)`），粗细沿弧做锥形（中段 16px、两端收细）；
3. 4× 超采样画完再 LANCZOS 缩回，避免锯齿。

弧先画在**独立透明图层**再 `alpha_composite` 到补丁上 —— 直接往肤色上画会被混合成灰，座位尺寸（2048→270px，k≈0.13）下就看不见了。这也是为什么初版 2–6px 的笔触在舞台上「眼睛直接消失、看不见笑弧」：笔触被降采样平均到皮肤色里去了。

### 16.2 manifest 三个坑（都验证过）

| 坑 | 症状 | 解法 |
| --- | --- | --- |
| 图层名带 `eye` 会被**按名字推断分区** | 即使显式给了 `tags` 也被折进 `irides`，`ArtMeshIridesL/R` 同时被 `ParamEyeLOpen` 与 `ParamEyeBallForm` 抢，出现 `MOC3: UnsupportedChange(... ChannelDemotedToStatic(channel=OPACITY))` 且画面毫无变化 | 名字避开 `eye`（用 `squint`）+ `layer["tags"] = ["eyewear"]`，生成独立的 `ArtMeshEyewear` / `ArtMeshEyewear2` |
| `ParamProportion` 不能当开关 | `?p=Proportion:0` vs `:1` 全图 `diff = 57721`，会连带其它部件变形 | 用 `ParamEyeBallForm` |
| `PhysicsEyeJelly` 每帧写 `ParamEyeBallForm` | 舞台写了 1 又被物理覆盖回 0（`physics` 输出覆盖参数） | `physics {"op":"put","id":"PhysicsEyeJelly","enabled":false}`；代价只是眼球少一点点果冻感 |

### 16.3 构建与验收

```powershell
C:\dev\python 3.12.0\python.exe assets\_raw\make_happy_eyes.py   # -> assets/build/claude-happy/parts/eye_happy-{l,r}.png
C:\dev\python 3.12.0\python.exe assets\_raw\claude_v3_build.py   # -> assets/build/claude-v3/model/ (moc3 720640 B)
```

`claude_v3_build.py` 会把 v2 的 26 件 + 2 件笑眼拼进 `assets/build/claude-v3/parts`，走 manifest → MCP `import_layout` → `rig_generate` → 三项物理调校 → `export_model`。**重新 import 会把物理重置成预设的松软值**，所以 v2 的调校（§13.4）必须在每次 build 里重放，否则橡皮筋摆动复发。

验收（probe 页面，`?p=EyeBallForm:0/1`）：`diff>24 = 1696`，左眼 817px、右眼 859px、嘴 0px；暗像素 左 320→85、右 396→158，且 1 状态下暗像素顶边呈 ∩（`524,517,510,506,503,501,…`）→ 弧真的盖住了原眼。

### 16.4 舞台

- `MODELS.Claude.url` → `../assets/build/claude-v3/model/claude.layout.model3.json`；
- `applyPoseParams` 写 `sv(core,'ParamEyeBallForm', p.happy)`；
- 待机行为表新增 `{ id:'happy', dur:1600, f:u=>({ happy: Math.sin(Math.PI*u) > 0.2 ? 1 : 0, mform: 0.4*Math.sin(Math.PI*u) }) }`，并进入待机池；
- 抱书版 `claude-book-model` 也重出了（705216 B，含同样的两件笑眼 + 三项物理），`applyPoseParams(alt, pose)` 对 alt 层一样生效。

### 16.5 踩到的舞台 bug：`?gest=` 一直是坏的

`preview/longtable.html` 的 ticker 里写着 `const off = forceGest ? … : …`，但 **`forceGest` 从来没被声明过** —— 每帧抛 `ReferenceError`，于是第 457 行之后的所有参数写入（小动作、眨眼）统统没执行过。之前「`?gest=nod:0.5` 与基线差 2239px」其实是场景里的随机微尘在动，不是动作生效。

修法：在 `pinEye` 旁边补上解析

```js
const forceGest = (() => {
  const raw = q.get('gest');
  if (!raw) return null;
  const [id, u] = raw.split(':');
  return { id, u: Math.max(0, Math.min(1, Number(u ?? 0.5))) };
})();
```

修完的实测：`?only=4&eye=0` vs `?eye=1` 差异聚成两个 16×9px 的块（`(995,483)-(1011,492)` / `(1023,484)-(1039,492)`）= 两只眼在闭；`?gest=happy:0.5` 时眼睛区域暗像素从 37 降到 0（原眼被肤色补丁盖住），只剩一圈浅弧 —— 与 probe 结论一致。**在座位尺寸上笑眼读作「弯弯的闭眼」是分辨率极限，不是 bug**（后来把弧加粗到 `TMAX = 24` canvas px，座位尺度下更清楚，`_h3-face-ab.png` 左右对照）。

### 16.6 哪些参数真的绑了画件（实测表）

`probe.html&scale=0.32`，一次只写一个参数，与默认渲染比 `diff>24` 的像素数（模型 `claude-v3`）：

| 参数 | 值 | diff px | 结论 |
| --- | --- | --- | --- |
| `ParamBodyAngleX` | 15 | 65258 | 躯干左右 |
| `ParamAngleZ` | 15 | 42014 | 歪头 |
| `ParamBodyAngleY` | 15 | 41077 | 躯干前后 |
| `ParamBodyAngleZ` | 15 | 34066 | 躯干侧倾 |
| `ParamAngleX` | 20 | 25688 | 转头 |
| `ParamBreath` | 1 | 22667 | 呼吸 |
| `ParamBodyLean` | 1 | 19102 | 前倾 |
| `ParamProportion` | 0.5 | 18268 | 体型（会连带整体变形，别当开关） |
| `ParamHairFront` | 1 | 17149 | 前发另一次摆动 |
| `ParamAngleY` | 20 | 17142 | 点头 |
| `ParamMouthOpenY` | 1 | 138 | 只有嘴（座位 3px） |
| `ParamHairBack` | 1 | **0** | 后发没绑 |
| `ParamMouthForm` | 1 | **0** | 嘴形没绑 |
| `ParamBrowLY/RY` | 1 | **0** | 眉毛没绑 |
| `ParamEyeBallX/Y` | ±0.6 | **0** | 眼球没绑（§16.1） |
| `ParamEyeBallForm` | 0→1 | 1696 | 只驱动 v3 的笑眼件 |

四个 `.exp3.json`（Smile/Sad/Angry/Surprised）写的正是 `ParamMouthForm`、`ParamBrowLY/RY`、`ParamEyeLOpen`、`ParamMouthOpenY` —— 前两组没绑画件，所以 `?expr=Smile` 与不传 expression 的渲染**逐像素相同**（差 610px 全在顶部 meta 文字上）。**expression 目前等于空操作，不要指望它**；要表情就按 §16 叠画件，或者像舞台那样直接写参数。

`GESTURES` 已据此重写（`assets/_raw/_patch_gestures.py`）：只用上表里非零的参数，`const env = u => Math.sin(Math.PI * u)`，12 个动作 —— `nod`(−11° `AngleY`)、`bow`、`shake`、`tilt`(`AngleZ`)、`look`、`glance`、`think`(`tilt`+`nod`+`hair .25`)、`smile`/`happy`(`ParamEyeBallForm`)、`huh`、`leanin`(`ParamBodyLean`)、`hairtoss`(`ParamHairFront` 0.9·sin(2πu))。验证：`?only=4&eye=1` 与 `&gest=hairtoss:0.35` 差 20334px，其中头发区三块 `(957,436)-(1082,590)` 共 5041px（另有 13737px 是场景微尘，详见 §16.5），肉眼见发梢外扬。**动作代码里再出现 `mform`/`brow`/`eyeX` 就是重新引入安慰剂**。

### 16.7 笑眼补丁要「洗色」，不然会露出橘色假虹膜

`face.png` 的眼窝是 `claude_to_canvas.py` 用 `cv2.INPAINT_TELEA` 填的，而 TELEA 会把原眼睛的橙色低频**抹成一块橙色污渍**。笑眼件的肤色补丁如果直接抠 `face.png`，`happy = 1` 盖住真眼之后，那块污渍就变成「假虹膜」（`preview/_pb-hi2-face.png` 左眼内侧的橘点）。

修法（`make_happy_eyes.py`）：

1. 掩码 = `eyewhite | irides | eyelash` 三件 alpha 并集，先 `cv2.dilate(np.ones((11,11)))`，再并上一切非肤色像素（`sat > 40 | max < 190`）—— 把眼窝、上下眼睑、睫毛残留全算进去；
2. 对补丁做 `cv2.inpaint(patch, mask, 9, cv2.INPAINT_TELEA)`，从四周干净皮肤往里填；
3. 弧必须画在**独立透明层**再 `alpha_composite` 到补丁上（直接 `draw` 在 RGBA 上会和肤色混成灰）；
4. `pad = 16`、羽化 `ramp = 4`，`TMAX = 18` canvas px，`sin(πu)**0.45` 做锥形——细了在座位尺度（k≈0.13）会被降采样平均进皮肤色，粗了像画了两条眉毛。

重出后 v3 是 `claude.layout.moc3 720896B`、抱书版 `705536B`（各 16 个文件）。

### 16.8 出一段演示 GIF（不用浏览器）

舞台只能无头截单座位，`?n=6` 会挂；要动态展示就用 PSD2Live 的 `export_target`：

```powershell
python assets\_raw\claude_v3_gif.py --target gif --size 560 --fps 16
# -> assets/build/claude-v3/media/claude.layout.gif（Idle 片段，192 帧）
```

脚本做的是 `import_layout(v3) → rig_generate → 重放 PHYSICS → project export_target`，`settings` 里 `clip=Idle`、`physics=true`、`background=00000000`（透明）。两个 `losses` 是必然的：GIF 把 deformers/parameters 烘成像素，且只有 256 色 + 1-bit 透明。要更清楚的动图就换 `--target webp`（`--target mp4` 需要在 `settings` 里传 `ffmpeg=<绝对路径>`）。**注意 import 会把物理重置回软默认**，所以脚本里必须重放 `tune_physics.PHYSICS`，否则头发又变橡皮筋。

**`PHYSICS` 重放要容错**：`tune_physics.PHYSICS` 里的 `PhysicsEyeJelly` 是 `{"enabled": false}`，`rig_generate`
之后这个组根本不存在，`physics/put` 会回 `{"code":"invalid_argument","message":"Physics group not found: PhysicsEyeJelly"}`
—— 旧脚本直接 `job["result"]["state"]` 就 `KeyError: 'result'`。现在遇到没有 `result` 的响应只打印
`physics …: skipped (…)` 并继续；整段 560px / 16fps / 192 帧约 **4 秒**出完（14.5 MB）。抽查分镜：
`preview/_gif-sheet.png`（第 0/12/24/36/48/60/72/120 帧拼图，发丝逐帧位移、眼睛是新的琥珀睁眼）。

### 16.9 张口件：程序化重画（心形舌头「大球」→ 干净小 o）

母图给的张口件不能直接用：bbox `1005,575-1043,618`（39×44 canvas px，比闭口 27×10 大一圈）、
舌头画成**心形**、整体深栗色，而且中心比闭口（`(1029, 591.5)`）**高约 9px**。放到 244px 高的座位上就是
「两条小撇突然变成一颗大球还往上跳」。

改成程序化画（`assets/_raw/make_mouth_open.py`，`SS = 4` 超采样，固定 `SIZE = (28.0, 21.0)` canvas px）：

```python
LIP           = (198, 126, 118)
CAVITY_TOP    = (118, 46, 42)
CAVITY_BOTTOM = (176, 84, 76)
TONGUE        = (224, 140, 138)
```

- 椭圆唇环 + 竖向渐变口腔 + 下三分之一软组织（`GaussianBlur(1.1*SS)`），整体再 `0.35*SS` 柔化。
- **不要牙齿白条**：模糊后压在暗腔上会读成一块灰污渍（见 `preview/_qm2-ab.png`）。
- 中心实时读 `mouth_close.png` 的 alpha 中心，所以闭口/张口天然同心，参数一推不会跳。

验收：`preview/_qm3-ab.png`（0.5 尺度，闭口两撇 vs 张口小 o）、`preview/_s-mouth-ab.png`
（座位尺度 5×，`?n=6&still=1&only=4&eye=1&mouth=0/1`）——244px 座位高度上说话读得出来。

### 16.10 眼睛：不要拆三件，用「一件 + 睁闭共用轮廓」

三件（`eyelash` / `irides` / `eyewhite`）这条路走不通，两个原因叠加：

1. 三张 mask 各自按颜色算，边界互不吻合；上睑那道**镜面高光**（`mn>200`、`r-g<10`）会被 sclera 掩码吃掉，
   留在眼皮上 = 1:1 看到的白色锯齿。
2. `face` 层用 `cv2.INPAINT_TELEA` 补洞时，会把洞缘（眼白/高光）往里扩散成一圈比周围亮的皮，
   三件贴回去就出现「空心圈 + 白刺」。

终态（`assets/_raw/cut_claude.py` 的 `master_eye`）：**睁、闭共用同一个 footprint**，
且这个 footprint 由**睁眼那半边**算出来，绝不能拿闭眼图的「亮眼睑」重建：

```python
white  = (mn > 230) & ((r - g) < 12)                      # 眼白（不是皮肤：皮肤 r-g 14~22）
sclera = 与 seed=dilate(ink,2) 连通、≥80px 的 white 块     # 按连通性取，不能加亮度上限
almond = _hull(ink | sclera)                              # 凸包：唯一能消掉凹口的做法
almond &= ellipse(xs.min()-2, ys.min()-4, xs.max()+3, ys.max()+5)
almond  = opening(3x3) → fill_holes
fp      = fill_holes(closing(dilate(almond,1), 3x3))
parts["eyewhite-*"] = clean(fp, 60)   # RGB 取母图（睁眼，即中转站重画的那张）
parts["eye_close-*"] = clean(fp, 60)  # RGB 取原母图（半睁的眼弧）
```

两者 alpha 完全一致 → 眼球尺寸在睁闭之间**永不跳**。删掉 `irides` / `eyelash` 四件后部件数 24 → 20，
`claude.layout.moc3` 约 660 KB（抱书版约 645 KB）。

配套三处必须一起改：

- **上睑高光洗色**（`assets/_raw/_patch_eye_spec.py`）：`mn>200 & (r-g)<10 & mx>170` 且落在
  `aperture = fill_holes(comp) & lid` 之外的高光像素，用 `face_rgb` 同位置颜色覆盖（眼珠里的高光保留）。
- **face 的洞不要再用 TELEA**（`assets/_raw/_patch_face_fill.py`）：改用
  `ring = dilate(face_paint,7) & ~face_paint & body & (sat<0.30) & (mn>150)` 的**中位皮肤色**整片填 + 3px 羽化。
  验收口径：眼带里 `mn>235` 的亮像素右眼 378 → 106（`preview/_qc-eyes-ab.png` 上下并排）。
- **笑眼补丁跟随眼形**（`assets/_raw/make_happy_eyes.py`）：alpha 用
  `dilate(eye_union, 5)` + `GaussianBlur(σ=2)`，**不要再 `cv2.inpaint`** —— face 已经是平色，
  重填只会把眉毛/额头的亮部搬进来，`EyeBallForm:1` 时额头上出现一块米色方块。

验收：`preview/_qc-happy3-face.png`（4×，两道粗黑 ∩ 弧干净坐在皮肤上）、座位尺度
`preview/_fin2-happy.png` vs `_fin2-eye0.png`（`diff>24 = 5236px`，bbox `(953,437)-(1075,590)`，
笑眼与眨眼在 244px 高度上都读得清）。

### 16.11 眼件边缘的三个坑（2026-11-03，已修）

1:1 放大看「眼睛外面一圈奶油色细边 + 虹膜下方两个 V 形缺口」，找了两轮才定位到根因，
三条独立的问题叠在一起：

- **不要用闭眼图的「亮眼睑」造 footprint**。旧写法 `lid = fill_holes(near & (lid_skin | arc))`
  里 `lid_skin = (mn>180) & (sat<0.45)` 取自闭眼图，会把眼弧两侧的平涂皮肤一起吃掉：
  上缘长出奶油色溢出，下缘被眼弧截断成锯齿。
- **缺口不是「洞」**。`ndimage.binary_fill_holes` 报 0 孔、`closing` 加宽到 6px 都没用 ——
  因为虹膜底部的亮橙光晕既不属于 `ink`（`mx<150`）也不属于 `sclera`（`mn>230`），
  而且这个缺口**向下与外部连通**，拓扑上根本不是 hole。只有**凸包**能消掉它；
  凸包多出来的角像素是原画自己的眼睑皮肤（RGB 仍取母图），所以看不出接缝。
- **`_hull()` 的坐标顺序**：`np.column_stack(np.nonzero(mask))` 给的是 `(y, x)`，
  直接喂 `cv2.convexHull` 等于按对角线镜像，凸包再被 `& ellipse(...)` 一切就剩细条
  （现象：`master eye almond too small for side l`）。必须 `pts[:, ::-1].reshape(-1,1,2)`。
  另外 `disk(radius)` 这种圆形结构元要自己造，3×3 方形结构元会啃角。

同一批还清掉一个**绿边**：母图是绿底键出来的，`back_hair`/`bottomwear`/`footwear`/`headwear`/
`legwear`/`topwear` 的边上残留绿边（耳朵附近最明显，1:1 是亮的绿线）。角色没有任何绿色，
所以在 `cut_claude.py` 存件前统一 `g = min(g, max(r, b))`（`np.where(g16 > lim, lim, g16)`），
重跑后 `parts with green: 0`。

验收口径（都要看，缺一不可）：

| 状态 | 入口 | 看图 |
| --- | --- | --- |
| 睁眼 | `probe.html?model=…claude.layout.model3.json&scale=1&p=EyeLOpen:1` | `preview/_m0-face.png` |
| 张口 | 同上 `&p=MouthOpenY:1` | `preview/_m1-face.png`（深腔 + 舌，无口线、无白圈） |
| 笑眼 | 同上 `&p=EyeBallForm:1` | `preview/_h1-face.png`（两道 ∩ 弧） |
| 座位尺度 | `longtable.html?only=4&eye=1&still=1` | `preview/_st1.png` / `_st1-face.png`（4×） |
| 抱书 | `longtable.html?only=4&pose=4:alt&still=1` | `preview/_st2.png` / `_st2-book.png`（4×） |

### 16.12 舞台动作在新模型上的复验（2026-11-03 round 4）

`?gest=<id>:<u>` 会把某个待机动作钉在包络的相位 `u` 上，配合 `?still=1` 就能像参数钉值一样截静帧。
重建 moc3 之后逐张对比基线（`diff>24` 像素数 / bbox，全部只落在她身上 `x≈731..832, y≈561..657`）：

| 入口 | diff>24 | 结论 |
| --- | --- | --- |
| `?only=4&still=1&gest=nod:0.5` | 1033 px | 点头（HeadAngleY 一系）生效 |
| `?only=4&still=1&gest=tilt:0.5` | 2544 px | 歪头（HeadAngleZ）生效，位移最大 |
| `?only=4&still=1&gest=happy:0.5` | 2365 px | 笑眼包 + 头部微动同时生效 |

拼图 `preview/_gest-sheet.png`（四格 3×：基线 / nod / tilt / happy）——第四格能直接看到 ∩∩ 笑眼。
**这几个数字要留档**：`?gest=` 之前因为未声明的 `forceGest` 每帧抛 `ReferenceError`，动作与眨眼都没跑到模型上，
所以「有 diff」本身就是回归测试；以后改舞台先跑这三条。

### 16.12b 十二个动作的完整体检（2026-11-03 round 9）

把 12 个 `GESTURES` 全部钉到 `u=0.5` 逐张截静帧（`?only=4&still=1&eye=1&nogest=1&gest=<id>:0.5`，
1000×900 窗口、座位约在 `x≈500..610, y≈450..580`），和**同条件无 gest 的基线** `preview/_gt0.png` 比：

| 动作 | diff>24 | 动作 | diff>24 |
| --- | --- | --- | --- |
| nod | 928 | think | 1166 |
| bow | 376 | smile | 891 |
| shake | 1109 | happy | 1097 |
| tilt | 1351 | huh | 1388 |
| look | 1025 | leanin | 653 |
| glance | 801 | hairtoss | 998 |

**12 个全部有效**（bbox 一律收缩在她头部 `x≈522..593, y≈493..562` 内，说明只有她动、场景没被带动）。
拼图 `preview/_gest12.png`（13 格 4×）：`bow` 下巴收得最多、`tilt`/`huh` 是歪头、`happy` 直接换成 ∩∩ 笑眼、
`hairtoss` 能看到发丝整体位移。座位尺度下这些幅度是「微动作」，够用但不夸张——想更明显就调
`gestureOffsets` 里的系数，不要动 moc3。

**这一步踩的坑（重要）**：一开始拿 `?debug=1` 那张（`preview/_dbg5.png`）当基线，12 个动作的 diff 全是
≈22–24k px、bbox 横跨整幅 `(10,128)-(982,562)`，看起来像「动作没生效、全是场景噪声」。真实原因是两点：
①debug overlay 是叠在画面上的一层文字，基线带它、实验组不带它，全屏都在差；
②无头截图每次都会重新撒一遍场景微尘，同一 URL 连拍的噪声地板就有 ~23k px。
所以**基线必须与实验组同条件**（同样的窗口尺寸、同样的 `?only=`、不开 `?debug=`），否则 diff 没有意义。

### 16.13 两层交叉淡化为什么「看起来在错位」（round 4 收尾）

用户两次反馈「二层晃动的时候错位」，实测两个 moc3 是对位的：`?pose=4:alt&still=1` 与主姿势比，
眼中心 `(782.01,618.85)` vs `(781.89,618.60)`、头顶点同为 `y=563`。真正的两个原因都在舞台代码里：

1. **淡化的透明度凹口**：旧写法把两个窗口错开成 `main = 1 - t/0.62`、`alt = (t-0.38)/0.62`，
   在 `t≈0.5` 时两层各只有 ≈0.19 不透明度，座位背景透上来，角色像重影。改成「第二层前半段淡入、
   主层后半段淡出」（`alt = min(1, t/0.5)`、`main = 1 - max(0, (t-0.5)/0.5)`），任何时刻上层都是不透明的。
2. **两层各跑一套物理**：两个模型各自算头发/身体物理，几秒后相位就错开，淡化时能看到两份头发的
   相对位移。修法是在 LOW 优先级 ticker 里把主层的全部参数值抄给第二层（`internalModel.coreModel` 的
   `_parameterIds` / `getParameterCount()+getParameterId()`），包 try/catch；抄完之后除了手臂和书，
   两层逐像素一致（实测改动前后只差 1302 px，全在发梢 `(737,562)-(830,657)`）。
3. 顺带修掉**像素级随机眨眼**：pixi 内置 `eyeBlink` 每帧自己写 `ParamEyeLOpen`，既覆盖 `blinkValue()`
   的曲线、又让两层各眨各的，座位静帧常随机拍在半睁上（看起来像「眼睛变小」）。加载后
   `dropAutoBlink(model)` 把主层与 alt 的 `internalModel.eyeBlink` 置 `undefined`，眨眼只由
   `blinkValue()` 驱动；改后 `?eye=1` 与默认态的差异从「整只眼」降到 210 px（只剩物理抖动）。

验收入口：`?only=4&pose=4:alt&still=1`（抱书）、`?only=4&pose=4:alt&still=1&eye=1`（强制睁眼）。

### 16.14 嘴：从「两道看不见的短划」到一条能读出来的笑弧（round 4/5）

原画把闭口画成两道 2–3px 的短划（`mx<240 & (r-g)>6` 只有 21 px / 2 块），到 250px 座位上不足 1 像素，
整张脸看着像没有嘴、说话也没有任何反应。`cut_claude.py` 的 `smile_arc()` 现在用一条浅弧把这两个
「嘴角」连起来（二次贝塞尔，中点下坠 3.4px），并且有意放大了尺寸：宽度从原画 17px 拉到 26px、
线宽 2.2px（1024 空间）；颜色取原划的 25 分位再往发丝阴影棕拉 45%，最终 ≈ `(154,82,68)`
—— 原来的 `(215,146,129)` 在奶油脸上完全看不见。画布件因此是 40×11 px，座位上约 5×1.4 px，
一眼能看到一条小嘴。

张口件 `make_mouth_open.py` 的 `SIZE` 也从 `(28,21)` 收到 `(22,16)`（`LIP (176,108,100)`、舌头 alpha 200）：
原尺寸比闭口大一圈，1:1 看像嘴里塞了个球；现在是略高于闭口的小 o，`ParamMouthOpenY` 仍然驱动它。

### 16.15 件与件之间的 1px 缝：不能用 fill_holes 找（round 8）

症状：1:1 渲染时耳朵外缘有一条 1px 的**绿线**（绿幕从缝里透出来），右侧白缎带的剪影则是一排锯齿。
座位尺度看不出来，只有放大到 100% 且背景是绿色时才明显。

第一反应是「有洞」，于是把 20 个件的 alpha 求并集再 `binary_fill_holes(acc) & ~acc` 找洞 —— 找到的 6 个
大洞（4454/3606/3252/3235/2518/2504 px）全是头发与身体之间**本来就该透空**的区域，而耳缝和缎带锯齿
**与外框连通**，`fill_holes` 根本看不见（与 §16.11 眼件 V 齿同一个坑：几何上是缺口，不是洞）。

正确解法是在 `cut_claude.py` 保存件之前**让件向外长**：非眼/嘴件做
`m = binary_dilation(m, np.ones((3,3), bool), iterations=2) & body` 再写 alpha。

- 为什么不破坏画面：所有件都取自同一张母图，向外长出来的像素拿到的就是母图该处的颜色，
  合成结果与「整张母图」逐像素一致，只是把缝隙填了。
- 为什么 `& body`：母图外的绿幕不能被长进来（`body` 是去掉绿幕后的角色掩码）。
- 为什么排除眼/嘴：`eyewhite/irides/eyelash/eye_close/mouth/squint` 的轮廓是**特意内缩**过的
  （footprint 要落在虹膜或唇线上，见 §16.11/§16.14），长出去会把边界又推回奶油眼白或皮肤上。
  代码里就是 `NO_GROW = ("eyewhite", "irides", "eyelash", "eye_close", "mouth", "squint")`。
- 1px 不够：`iterations=1` 修掉了耳缝但缎带还留几处小缺口，**2px 才闭合**。

验收入口：`probe.html?model=../assets/build/claude-v3/model/claude.layout.model3.json&scale=0.75&p=EyeLOpen:1`
看整身（1600² 无头截图），耳朵与缎带两处 crop 3× 复核；再用 `p=AngleX:25,AngleZ:8` 与静止帧对比，
差 ≈ 220k px 说明变形器没被破坏。

### 16.16 「没有任何件认领」的像素：白缎带整段漏底（round 12）

§16.15 的 2px 生长修掉了「两件各让开 1px」的缝，但 1700² 整身图里右鬓那两条**白缎带仍然是断的**：
带子中间被挖出一块块背景绿。这不是缝，而是**没有任何件覆盖**：母图上那些像素是角色本体
（`body == True`），但 20 个件的 mask 一个都没圈到它们 —— 生长是从已有 mask 往外长，源头没有就长不出来。

判据（`cut_claude.py`，保存循环之前）：

```python
cov = np.zeros((H, W), bool)
for _m in parts.values():
    cov |= _m
missing = body & ~cov          # 8461 px
```

修复方式不是「全塞给最上层」——那样这块像素会跟着错误的变形器动（塞进 `headwear` 就会被头的摆动带走）。
改成**按邻居多数票归属**：每个 ≥40px 的 `missing` 连通块，看它外圈 3px 内已覆盖像素属于哪个件最多，
就把整块并给那个件，于是缎带自然归到旁边的 `front hair` / `headwear`，随它们一起动。

- 实测：`unclaimed pixels: 8461, patched 6539`（剩下的都是 <40px 的碎点，肉眼不可见）。
- 重建：`claude_to_canvas.py` → `make_mouth_open.py` → `claude_v3_build.py --import`（`322112B`）→
  `claude_book_build.py`（`316224B`）→ `claude_v3_gif.py --target gif --size 560 --fps 16`。
- 验收：`probe.html?...&scale=0.78&p=EyeLOpen:1` 的 1700² 整身，`(930,330)-(1080,570)` crop 3× ——
  缎带连续、无绿楔；座位尺度 `?only=0,4,5&still=1&eye=1&nogest=1` 与抱书 `?only=4&pose=4:alt&eye=1` 都正常。
- 这条修法与 §16.15 互补：**生长治「缝」，认领治「漏」**。任何新母图切件后都该跑一次这个统计，
  `unclaimed pixels` 应当接近 0。

### 16.17 说话的嘴：必须比闭口大，而且要「挂在笑弧上」（round 13）

用户说「说话时嘴没有张开」。两张 `probe.html?...&p=MouthOpenY:0` / `:1` 的 1700² 图肉眼看不出差别，
嘴部框的像素差只有 **171px** —— 因为旧件是 22×16 的居中椭圆，而闭口笑弧就是 40×11：
**张嘴这个动作反而让嘴变小了**。

三次尝试，前两次都错在几何：

1. **「挂在笑弧下面的椭圆」**（`SIZE=(34,17)`）→ 渲染成一颗橄榄球，中心还偏了，差值升到 392px 但没有嘴形。
2. **「从上唇线垂下的多边形」**（`arc_profile()` 读 `mouth_close.png` 每列顶边、`DEPTH=13`、
   `depth=sin(pi*u)**0.65`）→ 上缘继承了闭口件的锯齿，中央还长出 V 形豁口。原因是闭口笑弧本身
   由 `smile_arc()` 用「圆戳+阈值」画的，中线上有一个 nick，直接拿来当切边等于把它放大。
3. **当前：椭圆被笑弧剖面切掉上半**。`cx=(x0+x1)/2`、`cy=tops.mean()+0.42*DEPTH`、`rx=0.53*w`、
   `ry=1.05*DEPTH`；`cavity = ellipse & (Y >= top_at_x - 0.35)`。上缘**就是**笑弧（两态天然对齐），
   下缘是光滑椭圆（没有凹角给 inset 捣乱）。

两个只在实拍里才暴露的细节：

- **渐变要按列从弧顶量起**，不能按整个包围盒：笑弧中部比两端低约 6px（`tops` 实测 `588.2..594.0`），
  用全局竖直渐变会把凹陷处涂亮，看起来就是上唇中间一道浅色豁口。改成
  `depth = (cy+ry) - top_at_x`、`t = (Y - top_at_x) / depth` 才均匀。
- **`ring` 必须 `&= below_arc`**：`dilation(cavity) & ~cavity` 会在弧的凹陷里画到皮肤上，
  同样表现成浅色豁口。上唇线交给笑弧本身，环只补在下方。
- 最后对 `tops` 做**二次拟合**（`np.polyfit(u, tops, 2)`，`u` 归一化到 −1..1）再当切边，variance 里的
  nick 被抹平，改动 <1px，视觉上不影响与闭口件的对齐。

产物：`mouth_open.png bbox=(1002,587)-(1053,608) 916px`（48×21，比闭口 40×11 明显大）；
`MouthOpenY:0` vs `:1` 的嘴部差从 171px 升到 **577px**（1700²、scale 0.80；`diff>24`、框 `(780,445,100,65)`）。
重建 `322176B`；抱书版 `316288B`；GIF 重出。

**座位尺度仍然读不出张嘴**：座位 4 的整张脸只有 17×11px，嘴约 4×1.5px（`_talk-cmp.png` 7× 可见差别、
`?speak=4` 与静止差 985px）。这是尺寸的物理限制，不是绑定问题 —— 1:1 用模型页看即可。

### 16.18 眼珠想动，就得把虹膜拆成自己的 `irides` 件（round 15）

用户的目标是「完美、能动的小克」，而在这之前她的**眼珠是死的**：舞台一直在写
`ParamEyeBallX/Y`，`probe.html` 里把这些参数从 0 拉到 1 却是 **0 像素差**。

原因是 §16.11 的修法把整只眼合并成了一个件（`eyewhite`，toggle 到 `ParamEyeLOpen`），
而 PSD2Live 只在看到 `irides` 这个 tag 时才建眼珠变形器。对照实验：GPT 的 moc3 有
`irides-l/-r`，`p=EyeBallX:0` vs `:1` 的眼部差 **2062px**（两块约 1000px 的连通块，各落在一只眼上），
说明绑定是自动的、与模型无关。

给 Claude 补这个件要做三件事，缺一件就出事：

1. **虹膜单独成件**：`master_eye()` 追加返回 `disc` —— 琥珀连通块 `closing(5×5)` 后 `fill_holes`
   再 `& almond`，把瞳孔与高光一起圈进来（`1533px / 52×48`，右眼 `1420px`）；`< 300px` 时退回
   `erosion(almond, 3)`。manifest 里加一行
   `("irides", "irides", True, "ParamEyeLOpen", "ParamEyeROpen")`，**紧挨在 `eyewhite` 之后**：
   它既是 `irides`（眼珠变形器）又是一个 toggle（眨眼时不能留一颗漂在眼皮上）。
2. **下面的 sclera 必须把琥珀洗掉**：`eyewhite` 现在压在虹膜下面，如果它还留着原画的琥珀，
   眼珠一动就会露出一圈**错位的第二个虹膜**。做法是按件把 `disc` 涂成大圈里侧的中位奶白色
   （`around = eyewhite & ~dilate(disc,4) & mn>215 & (r-g)<14`），再把 2px 接缝按 50% 混一遍。
3. **alpha 要羽化**：`irides` 的 alpha 过 `gaussian_filter(1.0)`，否则硬边在滑动时会在眼白上切出一道环。

验收：`probe.html?scale=1&p=EyeLOpen:1,EyeROpen:1,EyeBallX:-1` vs `:1` → 眼部差 **6860px**
（两块 3238/3039，bbox 各落一只眼），且虹膜移动后**没有第二圈琥珀**（`_ballcmp.png` 4× 上下对照）；
`EyeLOpen:0` 时虹膜随 toggle 消失、回到原画的半闭眼（`_iris-open-close.png`）；
座位尺度 `?only=4&still=1&eye=1` 的脸依旧干净（`_irisstage-face.png` 7×）。
重建：`claude.layout.moc3 344000B`（26 个件，多出 `irides-l/-r`）、抱书版 `338432B`、GIF 15048555B。
