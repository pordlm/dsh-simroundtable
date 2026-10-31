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
| 8 | `eyebrow` | `eyebrow` | EYEBROW | ✓ | 双眉同一张，**本地按中线切成 `eyebrow-l/-r`** |
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
> Framing: the tip of her ahoge (single hair strand) is about 40px below the top edge; the bottom edge cuts her at mid-thigh; her head fills the upper 60% of the frame.
> Output ONE image, portrait 1024×1536, flat pure green #00FF00 background.

出图后先目视检查：呆毛、双角、两个发饰、精灵耳、荷叶领都在；头占上半幅。**这张不合格就别做后面的**——所有件都是它的编辑。

### P1 · back_hair

> Using the reference image, keep ONLY the long back hair that falls behind her body: the whole wavy hair mass behind the head and shoulders, down to the bottom edge. Remove the face, the front bangs, the horns, the ornaments, the dress and the arms — fill those areas with flat pure green #00FF00.
> Keep the hair at exactly the same position and size. Same 1024×1536, pure green #00FF00 background. No green fringe on the hair edge, no outline glow.

### P2 · topwear

> Using the reference image, keep ONLY the white off-shoulder dress: the frilly neckline, the bodice, the blue waist ribbon, the skirt down to the bottom edge, and the small pocket with pens. Remove the head, hair, neck, arms and horns — fill with flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P3 / P4 · arm_left / arm_right

> Using the reference image, keep ONLY the **left** puffy sleeve and the hand/forearm coming out of it (the arm on the **left side of the picture**). Everything else — head, hair, dress body, the other arm — becomes flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

（`arm_right` 把 left 换成 right，并强调 `right side of the picture`。两侧要分两次出，不能一张两臂——分左右才能做手臂摆动。）

### P5 · neck

> Using the reference image, keep ONLY the neck and the collarbone/upper chest skin between the jaw and the dress neckline. Everything else becomes flat pure green #00FF00. The top of the neck must extend a little under the chin (it will be hidden by the face layer).
> Same position and size. 1024×1536, pure green #00FF00 background.

### P6 · face

> Using the reference image, keep ONLY the bare face skin as ONE solid piece: forehead, cheeks, jaw, chin — the complete face shape with a clear silhouette (soft round jaw, pointed small chin). Remove eyes, eyebrows, mouth, nose, hair, ears and ornaments, and fill those areas with the same flat skin colour (no holes). Everything outside the face becomes flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.
> Flat skin colour #fdeee7 with only a very soft cheek shading, no blush, no eyes, no mouth.

### P7 · eyewhite

> Using the reference image, keep ONLY the **eye whites**: two flat white almond shapes, drawn slightly larger than the visible eye so their edges tuck under the upper lashes. Remove the iris, pupil, highlights, lashes, eyebrows and everything else → flat pure green #00FF00.
> Same position and size, same eye shapes and tilt. 1024×1536, pure green #00FF00 background.

### P8 · irides

> Using the reference image, keep ONLY the **irises**: two round pale-blue irises (`#a9bfe8` with a darker rim and a small white highlight), each drawn as a FULL CIRCLE (the part hidden under the eyelid is fine to complete). Remove the eye whites, lashes, skin and everything else → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P9 · eyelash

> Using the reference image, keep ONLY the **upper eyelashes**: two thick dark-grey lash lines following the top lid, with a small outward flick at the outer corner. Remove eyes, iris, brows, skin and everything else → flat pure green #00FF00.
> Same position, size and tilt. 1024×1536, pure green #00FF00 background.

### P10 · eyebrow

> Using the reference image, keep ONLY the two **eyebrows**: thin soft grey-blue arcs. Remove everything else → flat pure green #00FF00.
> Same position, size and tilt. 1024×1536, pure green #00FF00 background.

### P11 · mouth_close

> Using the reference image, keep ONLY the **closed mouth**: one small soft curved line, slightly darker pink than the skin. Remove everything else → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P12 · mouth_open

> Using the reference image, show the **same mouth wide open** (maximum opening for speaking): a small rounded open mouth with a dark red-brown interior, a thin upper lip, and optionally a hint of upper teeth. It must be centred on the same spot as the closed mouth and no wider than the closed mouth plus 10%.
> Keep everything else identical to the reference, then remove it → flat pure green #00FF00. 1024×1536, pure green #00FF00 background.

（张口必须与闭嘴**同中心、同大小量级**，否则 PSD2Live 交叉淡化时会跳。）

### P13 · front_hair

> Using the reference image, keep ONLY the **front hair**: the bangs across the forehead plus both long side locks framing the face. Remove the back hair, face, horns, ornaments, dress → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

> 侧发（`side` 语义）如果想让它单独摆动，可另出一张 `side_hair`（图层名 `front hair 2`），否则并入 front_hair。

### P14 · ears

> Using the reference image, keep ONLY the **pointed elf ears** (both, the far one may be only its tip), plus a tiny bit of skin at the root so they can be tucked under the hair. Remove everything else → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P15 · headwear

> Using the reference image, keep ONLY the head accessories: the two pale blue dragon **horns**, the **blue cloud-shaped clip with the `>_` terminal symbol**, and the **white spiral-rose ornament with its hanging tassel**. Remove the hair, face and body → flat pure green #00FF00.
> Same position and size. 1024×1536, pure green #00FF00 background.

### P16 · earwear（可选）

> Using the reference image, keep ONLY the **tassel earring** hanging on the right side of the picture. Everything else → flat pure green #00FF00. Same 1024×1536.

### P17 · face_detail（可选）

> Using the reference image, keep ONLY the soft **blush** on both cheeks (very light pink, no lines). Everything else → flat pure green #00FF00. Same 1024×1536.

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