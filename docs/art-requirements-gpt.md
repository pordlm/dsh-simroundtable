# GPT 角色 · Live2D 部件制作规范（v1）

目标：把设定图（`assets/incoming/gpt/gpt-sheet.png`，白龙娘三视图）做成一个 **2048×2048 半身 Live2D 模型**，走 PSD2Live 3.6.7 全自动绑定，最终放进 `preview/longtable.html` 的 GPT 席位。

- 定标图：`preview/gpt-guide-2048.png`（2048 画布上的部件框 + 关键点，**工程参考**）
- 构图样张：`assets/incoming/gpt/gpt-frame-sample.png`（同构图、无标注，**给 GPT 当参考图**）
- 参考成品：`assets/models/whale-girl/`（鲸鱼娘）、`assets/build/deepseek-p2l/`（DeepSeek 的 2048 半身，已跑通 PSD2Live）

---

## 1. 为什么是「半身 + 纯色底 + 逐件保留」

三条硬约束决定了工作流，先说明清楚，避免返工：

| 约束 | 含义 | 对策 |
| --- | --- | --- |
| 舞台只露头肩胸 | `preview/longtable.html` 8 人时角色仅 ~244px 高，`y>600` 被长桌挡住 | **只做半身**，不画腿脚；画布下沿的直切边被桌子遮住 |
| GPT 图像模型不能出透明 PNG | 只能出实底图 | 一律出**纯绿 `#00FF00` 底**，本地 key 成 alpha |
| GPT 图像模型不能出 2048×2048 | 常用 1024×1536 | 出 2:3 竖图，本地按固定缩放映射到 2048 画布 |

由此得出唯一可靠的拆件方式：**先出一张 master，再在 master 上"只保留 X、其余涂绿"**。
同源编辑能保证每一件的机位、比例、角度**完全相同**——这是五官不错位的前提（历史坑：逐件单独生成 / 逐件 trim 都会错位）。

---

## 2. 画布坐标（2048×2048，实测标定）

标定式（参考图正面视图 → 画布）：`x_c = 1024 + (x_ref − 400) × 3.6`，`y_c = 200 + (y_ref − 82) × 3.6`

| 关键点 | 画布坐标 | 说明 |
| --- | --- | --- |
| 呆毛尖 | (1006, 49) | 画布上沿留 40px 余量 |
| 发冠顶 | **(1024, 200)** | 定标原点，容忍 ±40 |
| 左角尖 / 右角尖 | (610, 110) / (1305, 78) | 角在发冠之上 |
| 云朵终端挂饰 | (887, 553)，框 772–1006 / 463–643 | 左侧发饰 |
| 螺旋玫瑰 + 流苏 | (1330, 589)，流苏垂到 y≈895 | 右侧发饰 |
| 眼中心 | **左 (875, 792) / 右 (1173, 792)** | 眼距 298，单眼 150×128 |
| 眉 | y≈700，宽 170 | 眼上 ~90 |
| 嘴中心 | **(1024, 900)** | 闭嘴 110×60，张口 110×90 |
| 下巴 | (1024, 955) | 脸高 ≈ 755 |
| 脖子 | x 964–1084，y 955–1040 | |
| 肩点 | 左 (664, 1093) / 右 (1384, 1100) | 肩宽 720 |
| 连衣裙领口 | y 1195–1321 | 荷叶边 |
| 腰带 | y ≈ 1471 | |
| 画布下沿 | ≈ 参考图 y 595 | 裙摆中段直切，藏进桌子 |

> 坐标是**目标值不是图纸**：允许 ±40px 平移，但**所有件之间必须一致**。真正不能错的是相对关系（眼距、嘴在眼下、下巴在嘴下）。
>
> ⚠️ 这张表是按**三视图设定图的正面视图**（s=3.6）算的。一旦 P0 master 定稿，**几何就以 master 为准**：`prep_parts_gpt.py` 只用 master 的墨迹 bbox 推一个统一变换，所有部件共用它，所以 master 换成"更大的头"也不会错位——只要 P1–P17 都在同一张 master 上编辑。

---

## 3. 交付清单（17 件，z 序从后到前）

| # | 文件名 | PSD 图层名 | 语义 tag | 必需 | 遮挡关系 |
| --- | --- | --- | --- | --- | --- |
| 1 | `back_hair` | `back hair` | BACK_HAIR | ✓ | 在脸/身体后面，画到画布下沿 |
| 2 | `topwear` | `topwear` | TOPWEAR | ✓ | 裙子 + 荷叶领，**不含手臂**，下沿直切到 2048 |
| 3 | `arm_left` | `handwear-l` | HANDWEAR | ✓ | 画面左（角色右）泡泡袖，含手 |
| 4 | `arm_right` | `handwear-r` | HANDWEAR | ✓ | 画面右（角色左）泡泡袖，含手 |
| 5 | `neck` | `neck` | NECK | ✓ | 脖子 + 锁骨，上端插到下巴后 15px |
| 6 | `face` | `face` | FACE | ✓ | **一整块脸皮**，含下巴/两颊/额头，轮廓清晰 |
| 7 | `ears` | `ears` | EARS | ✓ | 双耳画完整（远的那只可只露尖端），根部落到脸边缘里 |
| 8 | ~~`eyebrow`~~ | ~~`eyebrow`~~ | — | ✗ | **不再要这张**：母图的淡紫眉/眼睑阴影本来就烘在 `face` 里，单独建层只会得到一条盖在原图上的假眉（见 10.2） |
| 9 | `eyewhite` | `eyewhite` | EYEWHITE | ✓ | 双眼同一张，画大，边缘压在上睫毛下；本地切 `-l/-r` |
| 10 | `irides` | `irides` | IRIDES | ✓ | 双眼同一张，**画整圆**（被眼白 clip）；本地切 `-l/-r` |
| 11 | `eyelash` | `eyelash` | EYELASH | ✓ | 双眼同一张，上睫毛粗线 + 眼尾飞线；本地切 `-l/-r` |
| 12 | `mouth_close` | `mouth close` | MOUTH_CLOSE | ✓ | 闭嘴（一条弧线） |
| 13 | `mouth_open` | `mouth open` | MOUTH_OPEN | ✓ | **最大张口**，含口腔暗部；几何无法从闭嘴像素还原口腔 |
| 14 | `front_hair` | `front hair` | FRONT_HAIR | ✓ | 刘海 + 两侧垂发，盖住脸边缘 |
| 15 | `headwear` | `headwear` | HEADWEAR | ✓ | 双角 + 云朵终端挂饰 + 螺旋玫瑰（"角"没有独立 tag，归头饰） |
| 16 | `earwear` | `earwear` | EARWEAR | 可选 | 流苏耳坠（右侧） |
| 17 | `face_detail` | `face detail` | FACE_DETAIL | 可选 | 腮红 |

配色统一从设定图取：发色 `#e6ebfb`/阴影 `#c9d4f2`，瞳色 `#a9bfe8`，肤色 `#fdeee7`，裙子 `#fdfdff`，装饰蓝 `#8fb3ea`，角 `#dfe6f6`。

---

## 4. 提示词（可直接粘贴）

统一前置（每条都带）：

> Output ONE image, portrait **1024×1536**, flat **pure green #00FF00** background. Do not add a frame, border, text, watermark or shadow on the background. Keep the character at exactly the same position, scale and pose as the reference image — do not re-compose.

### P0 · master（先出这张，后面全部以它为底图）

> Anime character reference: silver-white long wavy hair, pale blue eyes, two pale blue dragon horns, one small white spiral-rose hair ornament with a tassel on her right side, one blue cloud-shaped hair clip with a `>_` terminal symbol on her left side, pointed elf ears, white off-shoulder frilly dress with a blue waist ribbon.
> Draw her as a **bust portrait (head to waist)**, facing the viewer almost straight on, slight smile, calm half-lidded eyes, flat cel shading, clean thin line art, soft pastel palette, no cast shadow on the background.

#### P0 验收清单（我和 GPT 都用这张表判，不合格就别做 P1–P17）

| # | 检查项 | 合格标准 |
|---|---|---|
| 1 | 尺寸 / 底 | 1024×1536，底是**平涂 #00FF00**，无边框/文字/水印/投影 |
| 2 | 主体数量 | **只有一个人物**，没有第二视图、没有色板条、没有参考小图 |
| 3 | 构图完整 | 两侧头发/袖子**没有出框**（左右各留 ≥20px 绿边）；头顶到画框顶 ~40px |
| 4 | 半身切法 | 下沿在**腰/大腿处直切**（不是渐隐、不是画到脚） |
| 5 | 可拆性 | 脸是**一整块**干净皮肤、眼睛闭合状态清晰、上下睫毛分得开、嘴能看出形状 |
| 6 | 姿势 | 基本正立、头几乎不歪（≤5°），双肩高度差 <15px |

> **母图已定稿**：`assets/incoming/gpt-parts/p0/P0-master.png`（1024×1536 平涂 #00FF00，单人物，半身，两侧留 24px 绿边，下沿直切）。**P1–P17 全部都在这张文件上做"只保留某件"的编辑**，不要再回到三视图设定图——那才是帧对齐的唯一保证。
> Framing: the tip of her ahoge (single hair strand) is about 40px below the top edge; the bottom edge cuts her at mid-thigh; her head fills the upper 60% of the frame.
> Output ONE image, portrait 1024×1536, flat pure green #00FF00 background.

出图后先目视检查：呆毛、双角、两个发饰、精灵耳、荷叶领都在；头占上半幅。**这张不合格就别做后面的**——所有件都是它的编辑。

### P1 · back_hair

> Using the P0 master image, keep ONLY the long back hair that falls behind her body: the whole wavy hair mass behind the head and shoulders, down to the bottom edge. Remove the face, the front bangs, the horns, the ornaments, the dress and the arms — fill those areas with flat pure green #00FF00.
> Keep the hair at exactly the same position and size. Same 1024×1536, pure green #00FF00 background. No green fringe on the hair edge, no outline glow.

### P2 · topwear

> Using the P0 master image, keep ONLY the white off-shoulder dress: the frilly neckline, the bodice, the blue waist ribbon, the skirt down to the bottom edge, and the small pocket with pens. Remove the head, hair, neck, arms and horns — fill with flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P3 / P4 · arm_left / arm_right

> Using the P0 master image, keep ONLY the **left** puffy sleeve and the hand/forearm coming out of it (the arm on the **left side of the picture**). Everything else — head, hair, dress body, the other arm — becomes flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

（`arm_right` 把 left 换成 right，并强调 `right side of the picture`。两侧要分两次出，不能一张两臂——分左右才能做手臂摆动。）

### P5 · neck

> Using the P0 master image, keep ONLY the neck and the collarbone/upper chest skin between the jaw and the dress neckline. Everything else becomes flat pure green #00FF00. The top of the neck must extend a little under the chin (it will be hidden by the face layer).
> Same position and size. 1024×1536, pure green #00FF00 background.

### P6 · face

> Using the P0 master image, keep ONLY the bare face skin as ONE solid piece: forehead, cheeks, jaw, chin — the complete face shape with a clear silhouette (soft round jaw, pointed small chin). Remove eyes, eyebrows, mouth, nose, hair, ears and ornaments, and fill those areas with the same flat skin colour (no holes). Everything outside the face becomes flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.
> Flat skin colour #fdeee7 with only a very soft cheek shading, no blush, no eyes, no mouth.

### P7 · eyewhite

> Using the P0 master image, keep ONLY the **eye whites**: two flat white almond shapes, drawn slightly larger than the visible eye so their edges tuck under the upper lashes. Remove the iris, pupil, highlights, lashes, eyebrows and everything else → flat pure green #00FF00.
> **Draw both eyes FULLY OPEN** (the master is half-lidded) — this image is the open-eye state used for blinking. Same position, same tilt. 1024×1536, pure green #00FF00 background.

### P8 · irides

> Using the P0 master image, keep ONLY the **irises**: two round pale-blue irises (`#a9bfe8` with a darker rim and a small white highlight), each drawn as a FULL CIRCLE (the part hidden under the eyelid is fine to complete). Remove the eye whites, lashes, skin and everything else → flat pure green #00FF00.
> **Draw both eyes FULLY OPEN** so each iris is a complete circle and nothing is hidden behind the lid. Same position. 1024×1536, pure green #00FF00 background.

### P9 · eyelash

> Using the P0 master image, keep ONLY the **upper eyelashes**: two thick dark-grey lash lines following the top lid, with a small outward flick at the outer corner. Remove eyes, iris, brows, skin and everything else → flat pure green #00FF00.
> **Draw at the FULLY OPEN eye shape** (upper lid raised) so the lash line sits where the open lid is — this is the state the blink animation closes from. Same position, same tilt. 1024×1536, pure green #00FF00 background.

### P10 · eyebrow

> Using the P0 master image, keep ONLY the two **eyebrows**: thin soft grey-blue arcs. Remove everything else → flat pure green #00FF00.
> Same position, size and tilt. 1024×1536, pure green #00FF00 background.

### P11 · mouth_close

> Using the P0 master image, keep ONLY the **closed mouth**: one small soft curved line, slightly darker pink than the skin. Remove everything else → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P12 · mouth_open

> Using the P0 master image, show the **same mouth wide open** (maximum opening for speaking): a small rounded open mouth with a dark red-brown interior, a thin upper lip, and optionally a hint of upper teeth. It must be centred on the same spot as the closed mouth and no wider than the closed mouth plus 10%.
> Keep everything else identical to the reference, then remove it → flat pure green #00FF00. 1024×1536, pure green #00FF00 background.

（张口必须与闭嘴**同中心、同大小量级**，否则 PSD2Live 交叉淡化时会跳。）

### P13 · front_hair

> Using the P0 master image, keep ONLY the **front hair**: the bangs across the forehead plus both long side locks framing the face. Remove the back hair, face, horns, ornaments, dress → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

> 侧发（`side` 语义）如果想让它单独摆动，可另出一张 `side_hair`（图层名 `front hair 2`），否则并入 front_hair。

### P14 · ears

> Using the P0 master image, keep ONLY the **pointed elf ears** (both, the far one may be only its tip), plus a tiny bit of skin at the root so they can be tucked under the hair. Remove everything else → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P15 · headwear

> Using the P0 master image, keep ONLY the head accessories: the two pale blue dragon **horns**, the **blue cloud-shaped clip with the `>_` terminal symbol**, and the **white spiral-rose ornament with its hanging tassel**. Remove the hair, face and body → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P16 · earwear（可选）

> Using the P0 master image, keep ONLY the **tassel earring** hanging on the right side of the picture. Everything else → flat pure green #00FF00. Same 1024×1536.

### P17 · face_detail（可选）

> Using the P0 master image, keep ONLY the soft **blush** on both cheeks (very light pink, no lines). Everything else → flat pure green #00FF00. Same 1024×1536.

---

## 5. 交接方式

1. 把每张结果**原样保存**成 `assets/incoming/gpt-parts/src/<stem>.png`（不改尺寸、不裁剪、不抠图，文件名就用上表 stem）。
2. 顺序建议：先 P0 确认构图 → P6 face + P14 ears + P5 neck（脸相关一次做完，便于对位）→ P7/P8/P9/P10 + P11/P12（五官）→ P1/P13/P15/P16（发/饰）→ P2/P3/P4（身体）。
3. 只需 15 件（必需）就能出模型；缺件脚本会报错并说明缺哪件。

---

## 6. 本地接入（我这边负责）

```powershell
# 1) 绿底抠图 + 硬 alpha 清理 + 统一映射到 2048 画布 + 对齐校验
& "C:\dev\python 3.12.0\python.exe" assets\_raw\prep_parts_gpt.py --src assets/incoming/gpt-parts/src --out assets/build/gpt-p2l/parts

# 2) 合成 PSD 并跑 PSD2Live
& "C:\dev\python 3.12.0\python.exe" assets\_raw\build_gpt_model.py --parts assets/build/gpt-p2l/parts --out assets/build/gpt-p2l
```

`prep_parts_gpt.py` 做的事：

- **绿键**：以 `#00FF00` 为参考做逐像素距离 + 去溢色（对边缘做 desaturate，避免绿边）
- **硬 alpha**：`alpha = 距离阈值化的结果`，再把 alpha<200 的清零、去孤立小点、闭运算补洞（DeepSeek 那批的"半透明白雾"就是这一步没做）
- **映射**：整幅按固定 `scale/offset` 放到 2048 画布（默认按 master 的墨迹 bbox 定标：发冠→y=200、脸中心→x=1024），所有件共用同一变换 → 天然对齐
- **校验**：把 15 件按 z 序合成为一张，和 master 的抠图版做逐像素差异，输出 `parts-composite.png` + 每件的 bbox/覆盖率报告；差异超过阈值即报警（通常是某件漏画或被 GPT 挪了位置）

`build_gpt_model.py` 做的事：写 PSD（`create_pixel_layer`，图层名按第 3 节）→ 调 `PSD2Live.exe --input ... --output ... --atlas 4096 --mesh-spacing 64` → 校验产出 `gpt.moc3 / model3.json / cdi3.json / physics3.json`。

---

## 7. 已知限制（照抄 deepseek 的经验，别再踩）

- PSD2Live **不会自动生成手臂参数**；手臂能不能摆取决于生成后 `cdi3.json` 里有没有对应参数，必要时在 Cubism 里手补。
- **成对的双眼/双眉不会被自动拆左右**（实测 3.6.7：`eyewhite`/`irides`/`eyelash`/`eyebrow` 单层 `side='NONE'`，一个 mesh 罩住两只眼，眼桥会被一起压变形）。所以 GPT 仍然只画一张"两眼的图"（对它最省事、也最不易错位），**由 `prep_parts_gpt.py` 在中线 x=1024 精确切成 `eyewhite-l/-r` 等 8 个图层**。约定：`-l` = 角色的左眼 = **画面右侧**（x>1024）。
- 独立眼层会被**重新排序**：眼白/虹膜/睫毛三层的 z 必须正确（眼白 < 虹膜 < 睫毛），否则虹膜跑到眼白后面去。
- 图层名是写进 PSD 的 **MacRoman** 字符集，**只能用 ASCII**；中文名会在 `psd_tools` 里抛 `UnicodeEncodeError`。
- 半透明会毁掉 mesh 边界：alpha 一律硬边。
- 画布下沿有一条直切边（裙摆中段），舞台里被长桌遮住；若日后要做全身，必须重画下半身而不是拉伸。
- 角没有独立 tag → 归 `headwear`；角随头动是够用的，不单独做物理。
---

## 8. R2 返工清单（第一轮 16 件实跑后的结论）

第一轮 16 件确实能拼成完整半身（合成差 `uncovered 0.41% / extra 0.84%`，轮廓级对齐很好），
`PSD2Live` 一次跑通、`gpt.moc3` 在运行时里能加载、20 个参数里 `ParamEyeLOpen/ROpen` 与
`ParamMouthOpenY` **都真的驱动几何**。问题不在位置，而在**内部比例被重画掉了**——
GPT 是在"照着画"而不是"抠出来"。所以 R2 只需要重出下面 5 件，其余 11 件保留。

仍然遵守同一条流程：**在 P0 母图上编辑，只保留该部件，其余全部涂平纯绿 `#00FF00`，不要重新构图、不要改画布尺寸（1024×1536）。**

| # | 部件 | 实测问题 | R2 要求 |
|---|---|---|---|
| R2-1 | `irides` | 画成几乎占满整只眼睛的大圆，两只眼看起来像护目镜 | 虹膜直径 ≈ 眼高的 **55%**（画布上约 80px 直径），**居中**放在眼睛中心 (875 / 1173, 792)；允许画完整圆，但直径要小，让眼白在四周留出边 |
| R2-2 | `eyewhite` | 边缘溢到眼睛轮廓外、压住睫毛 | 眼白比虹膜大一圈但**小于眼框**（≈150×128），外轮廓藏在上睫毛下面 |
| R2-3 | `eyebrow` | 与睫毛/眼球重叠，几乎看不见 | 眉在眼睛上方 y≈700、宽 170、粗 12–16px、深灰蓝，**明显可见**，且不与睫毛相连 |
| R2-4 | `mouth_open` | 宽 123px，是 `mouth_close` 的 3 倍；张口变成一个大红圆 | 与 `mouth_close` **同中心 (1024, 900)**，宽 ≤ 闭嘴宽 +10%（≈40px）、高 ≈90px；画成**深红口腔 + 上排牙齿**的横向椭圆，不要圆形 |
| R2-5 | `mouth_close` | 只有 35×11 一小段，且位置偏低（y≈1008） | 嘴中心 (1024,900)，宽 110、高 60；一条平的上唇线 + 一层下唇，别做成一个点 |

已由管线修掉、**不需要改图**的部分：颈部/发侧残留的绿色楔形（`fill_holes` 把透出的背景
一起填成不透明导致的，已改成 `hard &= d > lo`，背景色像素永不进入 alpha）。

验证方式：把 R2 的 5 张按 `src/<stem>.png` 覆盖进去，重跑

```powershell
python assets\_raw\prep_parts_gpt.py --src assets\incoming\gpt-parts\src --out assets\build\gpt-p2l\parts
python assets\_raw\build_gpt_model.py --parts assets\build\gpt-p2l\parts --out assets\build\gpt-p2l
```

然后打开 `preview/gpt-model.html`（`?p=EyeLOpen:0,MouthOpenY:1` 可以无头截图验证绑定）。
---

## 9. 手工套索清单（GPT 只出图不抠图，剩下的自己套）

> **坐标以 P0 母图为准，不要用第 2 节那张参考图换算表。** 母图是 GPT 重画的半身像，
> 脸并不在画布正中：实测脸 bbox 为 `[897,676]–[1374,1105]`（477×429），**脸中心 x≈1135**，
> 比画布中线 1024 偏右 111px。下面所有数字都是从 `lasso-base.png` 上量出来的。

套索底图（已生成，透明底 2048×2048，位置与最终 PSD 完全一致，套完直接可用）：

| 文件 | 用途 |
|---|---|
| `assets/incoming/gpt-parts/lasso/lasso-base.png` | 1:1 底图，在上面套索 |
| `assets/incoming/gpt-parts/lasso/lasso-base-eyes.png` | 眼带 3× 放大（`[880,790]–[1400,945]`），套睫毛/虹膜用 |
| `assets/incoming/gpt-parts/lasso/lasso-base-face.png` | 脸 2× 放大（`[860,640]–[1420,1120]`） |

### 实测几何（2048 画布）

| 部件 | 实测 bbox | 尺寸 | 中心 |
|---|---|---|---|
| 脸 | `[897,676]–[1374,1105]` | 477×429 | (1135, 890) |
| 上睫毛（画面左 / 角色右） | `[889,819]–[1061,908]` | 173×90 | (975, 863) |
| 上睫毛（画面右 / 角色左） | `[1223,821]–[1390,869]` | 168×49 | (1306, 845) |
| 虹膜（画面左 / 角色右） | `[947,849]–[1050,914]` | 104×66 | (998, 881) |
| 虹膜（画面右 / 角色左） | `[1241,830]–[1338,892]` | 98×63 | (1289, 861) |
| 嘴 | `[1133,1010]–[1161,1019]` | 29×10 | (1147, 1014) |
| 眉 | **母图上没有画眉毛**（只有眼周柔和阴影） | — | — |

### 要交的件（4 张，其中 2 张是"画"不是"套"）

> **现状：这 4 张已经不用你套了。** 睫毛、虹膜由 `assets/_raw/auto_face_parts.py` 直接从母图抠出
> （暗墨迹框 + 玫蓝掩码 + 1.5px 柔边，无需人工套索），眼白、张口、闭眼由脚本生成。
> 本节留下的是坐标表和"该长什么样"的标准——母图要是重画，这张表就是重新标定的起点。

| # | 文件名 | 做法 | 要求 |
|---|---|---|---|
| 1 | `eyelash.png` | **套索** | 两条上睫毛线（含外眼角往下的飞线）。范围 `[880,795]–[1400,915]`。左右两张一张图即可，我按中线切；注意母图里睫毛与两侧头发相接，套的时候**不要带头发** |
| 2 | `irides.png` | **套索** | 两块蓝色虹膜，**只保留母图上看得见的形状**。顶部被睫毛压住的那一段**绝对不要补成完整圆**：虹膜层压在脸和睫毛之上，补出来的上半圆会直接画到眼皮和脸颊上，实测就是一副"护目镜"（这个坑踩过一次，别再让 GPT 补圆） |
| 3 | `eyewhite.png` | **画** | 母图的眼白只剩眼角一丝白，全部套下来不够用。请画两个椭圆垫在虹膜下面，比虹膜大一圈（≈150×110，同中心），颜色接近母图的眼白/眼尾过渡色 |
| 4 | `mouth_open.png` | **画** | 中心 (1147,1014)，宽 110、高 90 的**横向**张口：深红口腔 + 上排牙。母图是闭嘴，这块没有像素可套 |

不用动的：`eyebrow`（母图本来没眉，硬套只会带出一圈眼周阴影；想要眉可以自己补两笔淡灰蓝，不用交也没关系）、
`mouth_close`（GPT 那版就是母图那条 29×10 的线，位置对）、以及其余 11 件（合成差只有 0.8%，位置是准的，不用重套）。

### 导出规范

- PNG，**2048×2048**，透明底，PNG-24 + alpha；不要 PS 的"保留颜色配置文件"以外的额外信息
- **不要羽化/不要投影**：边缘 1px 半透明没关系（我会二值化），但不要画柔和阴影
- 叠放顺序（PSD 里）：`face` → `eyewhite` → `irides` → `eyelash` → `front_hair`（睫毛压在眼白和虹膜**上方**）
- 存到 `assets/incoming/gpt-parts/lasso/`，命名同上；一眼一张就 `eyewhite-l.png`/`eyewhite-r.png`（`-l` = 角色左 = **画面右**），两个眼一张就 `eyewhite.png`

### 接进来

```powershell
python assets\_raw\ingest_lasso.py --check     # 先看有没有读对：报 bbox/像素数/是否贴到画布边
python assets\_raw\ingest_lasso.py            # 写进 parts 目录（硬 alpha + 全画布校验）
python assets\_raw\build_gpt_model.py --parts assets\build\gpt-p2l\parts --out assets\build\gpt-p2l
```

然后刷新 `preview/gpt-model.html`（`?p=EyeLOpen:0,MouthOpenY:1` 可验证眼/嘴绑定）。
### 9.1 自动抠图 + 闭眼层（当前实况）

```powershell
python assets\_raw\make_lasso_base.py     # 母图按 manifest transform 落到 2048 透明底
python assets\_raw\auto_face_parts.py     # 抠 eyelash / irides，生成 eyewhite / mouth_open / eye_close
python assets\_raw\ingest_lasso.py        # 硬 alpha + 按连通块分左右，写进 parts/
python assets\_raw\build_gpt_model.py --parts assets\build\gpt-p2l\parts --out assets\build\gpt-p2l
```

抠图三个必须记住的坑：

1. **提取睫毛时不要加"蓝色排除"**。睫毛压在虹膜上的那一段像素本身偏蓝（b−r≥22），
   加了蓝色过滤会把内侧半条睫毛整段切掉（实测只剩 `892..956`）。眼球框里比 `lum≤150`
   暗的就是睫毛，头发是白的，不用再过滤。
2. **必须按每只虹膜的 bbox 扩边分别抠**。全画布一次性抠会被额头一根深色发丝把两条睫毛
   焊成一个 463px 连通块，之后分左右就全乱了。
3. **左右按连通块分，不按 x=1024 硬切**。脸中心在 1135，硬切会把内侧睫毛/虹膜切成两半。

闭眼层 `eye_close`（tag 是 `eye close`，会被 PSD2Live 认成 `eye_close`）：

- 为什么需要：PSD2Live 给这套层生成的 rig **没有眼皮**，`ParamEyeLOpen=0` 只会把眼白/虹膜
  压扁；母图的眼白几乎不可见，压扁之后瞳孔还留在脸上 → 模型根本不会眨眼。
- 做法：按虹膜 bbox 扩 10/20/10/8 画一个椭圆，颜色取"睫毛上方肤色 → 眼下方颊色"的竖向渐变，
  边缘 6px 羽化（硬边会露出一圈亮环）；再把抠出来的睫毛原样盖上去当闭合眼线。
- 实测：静止（`EyeLOpen=1`）时整层被 rig 隐藏，画面和之前一致；`EyeLOpen=0` 时瞳孔消失、
  只剩一条弧线，肉眼读作闭眼。
- 当前 build：`{layers: 20, drawables: 25, deformers: 22, parameters: 20, atlasPages: 5}`，psd2live exit=0 / ~9s。

眉毛与张口（母图都没有现成像素，都是脚本画的）：

- `eyebrow-l/-r`：位置由睫毛实测 bbox 推——`base_y = lash_top − 26`，拱高 `0.16 × 眉长`，
  朝向由"眼睛在内侧还是外侧"决定（`sign = -1 if eye_cx < face_cx else 1`，`face_cx = 1135`），
  颜色 = 睫毛色 ×0.55 + 肤色 ×0.45、alpha ×0.86、0.6px 高斯。一次画成灰横条（太直太粗）、
  一次把内外侧画反、一次淡到看不见（0.40 混合 + 0.72 alpha），都返工过。
- `mouth_close`：**不是画的，是从母图直接键出来的**。母图的嘴是一团柔化的玫瑰色晕染（约 29×9），
  没有线稿；GPT 画的 `mouth_close` 带一圈色键残留的淡绿边，贴上去像一条金属片。键法：
  区域内 `alpha = clip(((r−g) − 6) / 13)`（肤色 r−g≈10、唇色 r−g≈44）再 0.8px 高斯；
  过完 ingest 的硬 alpha 剩 31×10 / 225px。
- `mouth_open`：中心 (1147,1018)、画布 30×34 的蛋形（过完硬 alpha 实际 26×30），配色是同族玫瑰
  （唇环 196,140,148 / 口腔 172,112,120 / 舌 210,158,166 + 1.5px 深玫瑰上缘 160,102,112）。**别用深红/酒红**——
  这个角色整体近白，暗色张口读作"伤口"（第一版 40×54 的酒红蛋形就是这样被推翻的）；也**别做大**。

## 10. 眼睛：用 GPT 局部重绘的睁眼图，按颜色切成三件

母图（`P0-master.png`）的眼睛是**半闭的**，舞台上百来像素高就只剩一条缝，读作"眯眼"。
先试过按母图配色解析重画（`assets/_raw/open_eyes3.py`：眼白椭圆 + 64 段渐变虹膜 +
多边形睫毛带 + 采样肤色的闭眼睑），几何和眨眼都能跑通，但风格评审被否（"这眼睛也太奇怪了"），
于是改成**让 GPT 在 P0 母图上局部编辑出三张同构图的辅助图**，回来只做提取，不再自己画。

| 交付件 | 用途 | 提取成 |
| --- | --- | --- |
| `p0/gpt-open.png` | 睁眼（厚藏青上睑 + 淡紫蓝虹膜 + 深瞳 + 白高光） | `eyewhite` / `irides` / `eyelash` |
| `p0/gpt-close.png` | 闭眼（睫毛压在下眼睑上） | `eye close` |
| `p0/gpt-mouthopen.png` | 张口 | `mouth open` |

三张都要求：1024×1536、纯绿 `#00FF00`、**构图与母图逐像素对齐**（实测 ink bbox 与母图差 ≤4px）。
`assets/_raw/take_gpt_eyes.py` 一条命令出全部件：
`key_green` → `align`（`Image.AFFINE` 逆映射，把 ink bbox 对到母图 ink bbox）→
`to_2048(scale, dx, dy)` → `eye_masks()` → `save_layer()`。

- **三件必须共享同一只眼的外轮廓**：GPT 画的深色墨是**一整条包裹虹膜的厚杏仁**，
  若按"上睫毛"去截，只剩一根横棒加两端翅膀，读作墨镜。所以顺序是：
  ① `lash = rect & (lum<=150) & ~skin`（整圈深墨）；
  ② `seed = rect & (sat>=0.18) & (lum<=240) & ~skin` → 闭运算 → 最大连通块 = 虹膜盘；
  ③ `pupil = lash & erosion(disc,6)`，`iris = disc | pupil`，`lash &= ~pupil`；
  ④ `bluetone = rect & ((b−r)>=14) & (lum>=190)`（下眼睑的淡蓝眼白）再与 `dilate(iris,26)` 取交，
  ⑤ `almond = closing(lash|iris|bluetone,12) & rect & dilate(iris,26)` → `fill_holes` → 最大块；
  ⑥ `sclera = almond & ~iris & ~lash`，去掉 <40px 碎点。
- **`eyewhite` 的 alpha 必须是整只眼的实心杏仁**（`eye_full = fill_holes(lash|iris|sclera)`），
  颜色 `pale where iris else rgb`（`pale = median(rgb[iris & lum>200])`）。只把 `sclera` 当 alpha 的话，
  虹膜正下方没有淡色底，眼球参数一动就露出脸皮。
- **`almond` 必须限制在虹膜附近**：`bluetone` 在外眼角会命中侧发/刘海，不限制时画面左那只眼
  会长到 182×143 并把头发吞进来（闭眼睑椭圆也跟着涨到 192×151）；加 `dilate(iris,26)` 后
  两侧收敛到 103×107 / 124×127。
- **闭眼件**：对每个 ≥800px 连通块画外接椭圆（`rx=半宽+12, ry=半高+10`），
  `clip((1−d)*4)` 再 `gaussian(3.0)` 羽化，颜色取 `gpt-close.png` 的原始像素——
  所以闭眼时看到的是 GPT 画的真正闭眼，不是"用肤色盖住"。
- 验收：`assets/_raw/_recompose2.py` 把三件按 z 序叠回去与源图比，多次 `mismatch=0 mean=0.0`，
  证明切分无损；`_eyes-equal-scale.png`（源图 vs 渲染同尺度）看整体观感。

### 10.1 眨眼调试的坑（重要）

`preview/gpt-model.html?p=EyeLOpen:0` 一开始**完全看不到闭眼**，一度误判成"PSD2Live 没绑"。
真正原因是 **pixi 的自动眨眼每帧把 `ParamEyeLOpen` 写回 1**，把 URL 注入的值盖掉了。
控制实验：`?p=AngleX:-30` 与 `:30` 的像素差 148353，说明注入本身没问题；
给页面加 `?noeye=1`（`model.internalModel.eyeBlink = null`）后 `?p=EyeLOpen:0&idle=0&noeye=1`
立刻正常闭眼（像素差 99341）。**以后验参数前先想清楚哪个子系统每帧会写回它。**

### 10.2 眉毛：不要画，让它是脸的一部分

结论先说：**不要有 `eyebrow` 层**。母图那两道淡紫弧线是给眼睛用的柔光/眼睑阴影，本来就烘在 `face` 图层里；
再用脚本补一根眉，等于在艺术图上压一条等宽灰棒——它的硬底边就是用户说的「眉毛截断」。

中间踩过的两轮（留档，别再走）：
1. 先按"被前发挡住"定位：按列找 `front_hair` alpha>0.5 的最低 y，eye-R 中位 768/p75 798、eye-L 中位 784/p75 817，
   y=770 的可见皮肤带只剩 88px 宽、y=800 才 126px → 唯一安全区 **y≈785..806**。
2. 于是在这条缝里 `draw_eyebrow`：`base_y = lash_top − 30`、`arch = 0.10 × 眉长`、半厚 `3.4×sin^0.5+0.5`、
   色 `睫毛×0.62 + 肤色×0.38`、alpha 0.95、`gaussian 0.5` → `eyebrow-l [1218,794,1376,816] 159×23`。
   位置上没错，但**质感错了**：母图的眉是模糊渐隐的，脚本画的是等宽硬边。
3. 现在的做法：`prep_parts_gpt.py` 的 `PARTS` 里把 `eyebrow` 整行注释掉，`auto_face_parts.draw_eyebrow` 停用。
   重建后层数 24 → **22**（drawables 29 → 25），眉随脸一起动（头转/身体摆动时跟着走，只是不单独抬）。

### 10.3 嘴：张口件要够大，参数要真的写进去

闭嘴件是**从母图按 `r−g` 键出来的玫瑰晕染**（`a = clip(((r−g) − 6)/13)`，母图皮肤 r−g≈10、唇色≈44），
31×10、225px，静止时几乎隐形；张口件画成 38×46 的同族玫瑰蛋形（34×38、1000px）。
理由：舞台 `seatH≈155` 时闭嘴只有 ~0.8px 高，张口件小于这个尺寸就"说话看不出嘴动"。

**验证口型时的坑**：`preview/longtable.html?freeze=1` 会在 ticker 第一行 `if (freeze) return;`，
参数压根不会被写进模型 —— 拿 `?mouth=0` vs `?mouth=1` 配 `freeze=1` 对比会得到"像素差 0"的假结论
（我就这么误判过一次，以为 `ParamMouthOpenY` 没绑）。
正确做法是用 `?still=1`：时钟钉在 0、但 ticker 照常跑，两帧只差一个参数。
实测 `?still=1&solo=5&mouth=0` vs `&mouth=1` 差 11576px，画面里能明确看到张嘴。

### 10.4 绿边：despill 之外还要做色溢填充

- **症状**：模型接进舞台后，头发和脸的外轮廓有一圈绿边。量化口径 `g − (r+b)/2 > 15`，
  3080×3640 的渲染里有 71938 px。
- **两个根因**：① `prep_parts_gpt.key_background` 的 despill 只把背景主通道夹到
  `max(另两个通道) + 8`，边缘仍留 8 级绿偏；② 更关键的是**透明像素的 RGB 还是绿色背景色**，
  PSD2Live 打图集后线性插值会把这份绿拉到不透明边缘上（图集彩边）。
- **修法**：`assets/_raw/clean_parts.py` 对 `parts/` 里每张 PNG 做两件事——
  ① `g = min(g, max(r,b)+2)`，只改 alpha>0 的像素；② 用
  `ndimage.distance_transform_edt(~solid, return_indices=True)` 取最近的不透明像素索引，
  把它的 RGB 灌满整个透明区（colour bleed），**alpha 一点不动**。
  重跑 build 后同一口径的绿溢出降到 22132（且截图分辨率更小），肉眼边缘干净。
- **通用教训**：任何"纯色底抠图"管线，导出前都要把透明区的 RGB 填成最近的不透明颜色，
  否则一旦缩放或进图集，必出彩边。

### 10.5 看细节先放大画布

`preview/gpt-model.html` 的画布固定 760×900，模型 scale 只有 0.34，眼睛在截图上**只有 41px**，
放大十几倍看只会得到"发虚"的错觉（一度误判成掩码问题）。
现在 viewer 支持 `?z=N`（画布 `760N × 900N`、模型 scale 同乘 N），
`?z=3` 即 2280×2700、眼睛约 123px，1:1 截图才判得了细节。

### 10.6 眼白消失 / 睫毛断线 / 嘴的硬切边（R3 返工，三条判据）

用户原话：「眼白都没了，而且眉毛和嘴有截断」。逐段对比源图与渲染后，三个根因互不相干：

| 症状 | 根因 | 修法（`assets/_raw/take_gpt_eyes.py`） |
|---|---|---|
| 眼白消失 | `disc = fill_holes(best_mask)` 把整只杏仁（含淡色眼白）一起填成虹膜，虹膜层把自己那块白盖掉 | `iris = binary_fill_holes(best_mask \| pupil)`；`disc` 只保留作「瞳孔腐蚀 + almond 膨胀」的几何参考，不再当虹膜 |
| 睫毛只剩 1px 断线 | 皮肤判据 `skin = (r − g) ≥ 14` 把藏青上睑线（111,94,131，r−g=17、lum=103）也当成皮肤挖掉 | `skin = ((r − g) ≥ SKIN_RG) & (lum ≥ 200)` —— 加亮度下限，深色线一律不算皮肤 |
| 睫毛边界糊到眉上 | 同色系的眼皮阴影被卷进睫毛掩码 | `lash &= binary_dilation(disc, 12)`，把睫毛限制在眼球附近 |
| 嘴有硬切边 | `scale_mouth.py` 把母图嘴放大 1.7×：采样窗边缘 alpha 没归零 + LANCZOS 振铃，放大后成一条直切边 | 放弃放大，`restore_mouth.py` 还原母图原像素（`a = clip(((r−g) − 6)/13)`、`gaussian 0.8`），`mouth_close 31×10 / 645px` |

改动后：`lash 4221px / iris 17740px / sclera 9843px`，渲染里厚藏青上睑、淡色眼白环、虹膜渐变与高光同时成立；
`solid` 区与源图逐像素一致（`|d| > 24` 的点数为 0），剩下的差异只在边缘 1–2px，是 rig 网格与硬 alpha 的固有代价。

**一条通用判据**：`fill_holes` 只对"要成为实心的那件"用，不要拿它去补一整只眼——
眼白、虹膜、睫毛三件的外轮廓必须来自同一次分割，各自 `fill_holes` 会互相吞掉对方。

## 11. 接进长桌舞台

`preview/longtable.html` 里加了一张按名字查的模型表：

```js
const MODELS = {
  GPT: {
    url: '../assets/build/gpt-p2l/p2l/gpt.model3.json',
    faceDx: 111,   // 母图脸中心 x=1135，比画布中线偏右 111
    scale: 0.85,   // 半身像比全身像的头大得多，要缩一档
    dy: -25        // 缩完下巴会掉到桌沿以下，整体上提
  }
};
```

- `faceDx`：按 `-111 × seatH / 2048` 反向补偿。**坑**：`model.height` 在 `scale.set()` 之后
  读到的已经是缩放后的值，所以必须先 `const modelH = model.height;` 再算 `k = seatH / modelH`，
  否则补偿量会被算成整整 111px（实测脸直接偏掉一个座位）。
- `scale: 0.85`：头占画布 57%（鲸鱼娘全身像只有 ~31%）。n=8 时 `charH=182`，`seatH≈155`，
  `下巴屏幕 y = baseY − 96.8 × 0.85 ≈ 561`，桌沿 ≈585 → 还留 24px 给下巴和嘴；
  再小就整张脸埋到桌子后面（`scale` 0.58 实测只剩眼睛以上）。
- `dy: -25`：缩小后下巴会正好压在桌沿上，整体上提 25px 补回来。
- 另外加了 `app.stage.sortableChildren = true`：模型是 `Promise.all` 并发加载的，
  不开排序 `zIndex` 无效，相邻座位的尾巴会盖到别人脸上。
- 调试参数：`?solo=<座位号>` 只加载一个模型（8 个 4096 atlas 一起加载会把无头截图拖到超时）、
  `?debug=1` 在左上角打出每个座位的 `x / mx / baseY / bounds`、
  `?speak=<座位号>` 让指定座位一直处于发言态（截口型用）、
  `?still=1` 时钟钉在 0 但参数照常写入（**截图对比参数的唯一可靠姿势**，见 10.3）。
- 口型节律：发言时不再用 `Math.abs(Math.sin(t / 140))` 这种整齐节拍器，改成两条不同周期正弦叠加、
  每个座位相位不同 —— `s.mouth = 0.10 + 0.90 * |sin(sp*5.5)*0.72 + sin(sp*8.9)*0.28|`。
  鲸鱼娘没绑嘴参数，改节奏不影响它们。
- 舞台其余逻辑（呼吸/点头/发言）不用改：GPT 模型的 `ParamAngleX/Y/Z`、`ParamBodyAngleZ`、
  `ParamMouthOpenY` 都真绑定了几何，比鲸鱼娘（嘴参数无效）反而更完整。

### 11.1 舞台渲染分辨率（五官在大屏上糊掉的根因）

舞台是固定 `1400×920` 的逻辑画布，再用 `transform: scale(s)` 贴合窗口。以前只缩放了
**位图**：在 2560×1440 的窗口上 `s≈1.57`，等于把 1400×920 的渲染结果放大 1.57 倍，
五官全是糊的（嘴本来就只有 3px，一放大直接消失）。

现在按「CSS 缩放 × 设备像素比」提高渲染表面：

```js
resolution: Math.min(3, Math.max(1, s * (window.devicePixelRatio || 1)))
// resize 时同步 app.renderer.resolution = r; app.renderer.resize(STAGE_W, STAGE_H)
```

逻辑坐标一点没变（`charH`、座位、`faceDx` 全部照旧），只是实际渲染像素变多：
2560×1440 下画布是 2191×1440，嘴从「3px 的糊块」变成清晰的 7px。

**注意**：提高分辨率只让边缘更锐，**不改变五官占角色高度的比例**——
嘴占座位高度的 1.4% 这个事实仍然成立，所以母图里只有 30×14 的嘴依然要靠
`assets/_raw/scale_mouth.py` 放大到 46×15（原图像素整体缩放 1.7×，不重画）才读得出来。

