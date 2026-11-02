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