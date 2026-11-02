# 小 Claude 的 Live2D 部件需求（与 GPT 角色同一套管线）

> 目标：给长桌圆桌会议插件做第二个角色「小 Claude」（橙长卷发、黑/橙洋装、白靴、手持古籍的 Q 版少女）。
> 流程与 GPT 角色一致：**GPT 出部件 → 本地 BiRefNet 软 matte 抠图 → PSD2Live 打包 moc3 → 接进舞台**。
> 已经踩过的坑全部在 `art-requirements-gpt.md` 第 7、10 节，这份文档只写这个角色**不一样**的地方。

## 1. 先定三件画布上的事

| 项 | 取值 | 理由 |
|---|---|---|
| 画布 | **1024×1536**，平涂纯绿 `#00FF00` | GPT 出不了透明、也保证不了 2048²；绿底由我们键掉 |
| 构图 | **半身**：头顶到胯（裙子下摆直接切边） | 长桌只露上半身，腿和靴子做了也看不见，省 4 件 |
| 与 GPT 角色共用标定 | 头高 ≈ 756px（占画面 37%）、脸中心 x≈1135、眼中心 y≈792、嘴 y≈900 | 共用标定后，2048 映射常数、舞台 `faceDx/scale/dy` 都能直接复用 |

**必须和上一张母图同构图**：给 GPT 参考图时同时附上 `assets/incoming/gpt-parts/p0/P0-master.png`，
说明「只参考构图与占比，不参考画风」。

## 2. 姿势怎么定（拿书 / 不拿书）

Live2D 不换姿势，靠骨骼变形。抱书的手臂一旦画死，书就放不下来了。三个选项：

| 方案 | 做法 | 成本 | 适用 |
|---|---|---|---|
| **A（推荐）** | 母图画**空手**（双手自然交叠放在身前），书不做 | 0 额外件 | 会议角色，主要靠表情演出 |
| B | 母图直接画成**抱书**姿势，书烤进手/衣服里 | 省 1 件，但书摘不掉 | 只想要"捧书少女"的静态感 |
| C | A 的母图 + 另做一套「抱书手臂 + 书」替换组，用 PSD2Live 的 `switchId` 切换 | +3 件（书、左/右抱书手臂） | 想两个姿势都要 |

**建议先做 A**：座位尺寸下角色只有 244px 高，书大约 55px，演出价值低；
而"手交叠在身前"的手件最简单、最容易做摆动。真要抱书，二期按 C 加一套替换组即可，不用重画母图。

## 3. 母图提示词（P0，先出这张）

统一前置：

> Output ONE image, portrait **1024×1536**, flat **pure green #00FF00** background. No frame, border, text, watermark or cast shadow. Exactly one character, no second view, no colour swatches.

> Anime chibi girl, **orange long wavy hair** with a big **black bow** and an **orange daisy hair ornament** on the left side of her head, sleepy half-lidded **amber-orange eyes**, calm neutral expression, small mouth.
> She wears a **cream-white frilly dress** with a **black-and-orange corset waist**, orange ribbon bows, gold embroidery, a small white lace collar with an orange neck bow, and **puffy white sleeves**.
> **Both hands empty and folded lightly in front of her waist** — no book, no object in her hands.
> Pose: standing straight, facing the viewer almost front-on, head upright (≤5° tilt), shoulders level, **head fills the top 37% of the frame**, eyes on the horizontal line about 22% from the top, the bottom edge cuts her at the hip so the skirt hem runs off the frame.
> Flat cel shading, clean thin line art, soft warm palette, no shading on the green background.

### P0 验收清单

| # | 检查项 | 合格标准 |
|---|---|---|
| 1 | 尺寸 / 底 | 1024×1536，平涂 `#00FF00`，无边框/文字/水印/投影 |
| 2 | 主体数量 | 只有一个人物 |
| 3 | 出框 | 两侧头发**不出框**（左右各留 ≥20px 绿），头顶留 ~40px |
| 4 | 构图 | 半身，下沿在胯部直切；头占上半幅 37% 左右 |
| 5 | 可拆性 | 脸是一整块干净皮肤，**没有眉毛**（只要眼睑阴影）；眼睑闭合形状清楚；嘴形清楚 |
| 6 | 姿势 | 基本正立，双肩高度差 <15px，**双手空着且不与腰饰重叠** |
| 7 | 头发 | 胸前两条长发**不要压在脸上**，发梢尖而干净（便于抠图） |

## 4. 表情三件（在 P0 上做局部编辑，不要重画）

> Using the P0 master image, keep the exact same position/size/composition. Change ONLY the following, everything else pixel-identical.

| 件 | 编辑内容 |
|---|---|
| `gpt-open` 式的睁眼图 | 把半睁的睡眼**完全睁开**：虹膜完整、上睑线加粗上挑、保留原瞳色与高光 |
| 闭眼图 | 眼睛闭成一条向下弯的弧线，睫毛压在弧线上 |
| 张口图 | 嘴张成一个小的椭圆/蛋形（要有口腔和舌头），其余不动 |

## 5. 部件清单（PSD2Live tag）

| 优先级 | tag | 件数 | 这个角色的特殊之处 |
|---|---|---|---|
| P1 | `back hair` | 1 | 背后的长卷发，整块 |
| P1 | `front hair` | **2–3** | 刘海 1 + 两侧垂到胸前的长发各 1；发量太大，合成一件会挡住脸和手 |
| P1 | `headwear` | 1 | 黑色大蝴蝶结 + 橙色雏菊 + 白色发带，全归这里（PSD2Live 没有 horn / ornament 之分） |
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
| P2 | `bottomwear` | 1 | 裙子下摆（只到切边，不用画完） |
| P2 | `face detail` | 1 | 腮红/鼻尖高光（可选，母图里若有就切出来） |
| P3 | `objects` | 1 | 书（只在选方案 C 时做） |

合计 **21–24 件**（与 GPT 角色的 22 层相当）。

**不要做的**：`eyebrow`（这个角色画了眉毛就会像贴上去的灰条，见 gpt 文档 §10.2）、`legwear / footwear`
（半身切在胯部，看不到）、`ears`（被头发完全盖住）。

## 6. 交付方式

和上次一样，逐件出图、`1024×1536` 绿底、一次一张。文件名直接用 tag：

```
back_hair.png  front_hair.png  front_hair-l.png  front_hair-r.png
headwear.png   face.png
eyewhite-l.png eyewhite-r.png  irides-l.png  irides-r.png
eyelash-l.png  eyelash-r.png   eye_close-l.png  eye_close-r.png
mouth_close.png  mouth_open.png
neck.png  neckwear.png  topwear.png  handwear-l.png  handwear-r.png
bottomwear.png  face_detail.png
```

拿到后我这边跑：`assets\_raw\_chain.ps1`（默认 BiRefNet 软 matte，自动抠图 → ingest → clean → build），
再把 `preview/longtable.html` 的 `MODELS` 加一条即可上桌。

## 7. 需要用户先拍板的两件事

1. **姿势**：A（空手，推荐）/ B（抱书）/ C（两套切换）。
2. **构图**：沿用 GPT 角色的半身标定（推荐，参数可复用）/ 或者这次做全身（多 4–5 件，舞台上用不到）。