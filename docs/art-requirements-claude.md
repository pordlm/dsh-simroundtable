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
