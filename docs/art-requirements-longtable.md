# 长桌 & 椅子素材需求书（给 GPT 出图用）

> 用途：圆桌会议的「长桌模式」前端。8 位模型/角色正面朝屏坐成一排，桌子在角色身前，桌沿遮住角色下半身；椅子在角色身后，只露出椅背顶部。
> 现在的椭圆桌和单视角椅子是占位图，需要按下面的规格重画。

---

## 一、交付清单

| # | 文件 | 画布 | 说明 | 必需 |
|---|---|---|---|---|
| 1 | `table-long.png` | 1600 × 400 px | 长桌，RGBA 透明背景 | ✅ |
| 2 | `chair-long-back.png` | 600 × 900 px | 椅背「正后方视角」，RGBA | ✅ |
| 3 | `chair-long-side.png` | 600 × 900 px | 同一把椅子的 90° 侧视，备用 | 可选 |

- 格式：PNG，8-bit RGBA，sRGB，背景必须真透明（alpha=0），**不要**用白色/灰色底。
- 不要文字、水印、签名、边框；不要画角色、餐具、植物、地面。
- 参考图（形状/尺寸示意）：
  - `preview/guides/long-table-guide.png`
  - `preview/guides/chair-guide.png`
  把它们一起喂给 GPT，让它照着形状和比例画，而不是自由发挥。

---

## 二、长桌规格（table-long.png）

**画布**：1600 × 400，横向 4:1。桌面左右贴到画布边缘（x=0 与 x=1600），不额外留白。

**透视**：
- 正视、略微俯视（俯角约 20°），左右严格对称，不要斜角度、不要单点透视的「桌角朝向观众」。
- 前缘：整条贴画布底边上方约 30 px（y≈370），宽 1600。
- 后缘：y≈42，宽约 1440，左右各内收 80 px，形成轻微上窄下宽的梯形。
- 桌沿厚度约 18–22 px：前缘和左右两侧各有一条比桌面深 10–15% 的窄边；后缘看不到厚度。
- **不要桌腿、不要地面、不要桌下空间**——桌沿以下直接是透明。

**材质与颜色**：
- 深胡桃木 / 暖橡木，木纹沿长边水平走向，纹理细、密、顺，不要夸张年轮和结疤。
- 桌面整体明度中等偏暗，保证白色/米色议题文字压在上面能读清。
- 中央留一块干净区域（约 1000 × 190 px，居中）不要花纹、反光斑、裂纹——议题文字会叠在这里。

**光照与风格**：
- 左上柔光、右侧略暗的均匀打光；边缘有轻微环境光遮蔽即可。
- **不要**写实摄影高光、不要白色轮廓光、不要投影、不要景深。
- 风格是「日系动画背景 / semi-realistic anime background」，和亮色调 2D 角色同屏不突兀；不要照片级木纹。

**禁止项**：
- 透视歪斜、左右不对称、桌角翘起；
- 桌面放杯子/盘子/蜡烛/花；
- 画白边、灰底、阴影、文字。

---

## 三、椅子规格（chair-long-back.png）

**画布**：600 × 900，RGBA 透明。

**视角**：正后方平视（观众看到的是椅背外侧），左右严格对称。不要四分之三侧、不要俯视、不要带坐垫正面。

**结构**：
- 靠背主体：520 × 640 px，居中，顶部两角圆角 r≈48；外轮廓完整、边缘干净。
- 两侧立柱：各约 46 px 宽，从靠背底部向下延伸到 y≈860（只露 140 px，会被桌沿和角色挡住）。
- 底部横撑：宽约 428、高 36，位置 y≈780。
- 木质与长桌同一色系、同一光照方向；可选薄软包（米色/深棕），但不要碎花、绗缝、铆钉等细碎装饰。

**禁止项**：椅腿完整露出（不需要，会被挡）、阴影、地面、背景、文字。

**可选侧视**（chair-long-side.png）：同一把椅子转 90°，画布同为 600 × 900，供以后加侧位时用；本轮可以先不做。

---

## 四、与代码怎么对接（给你对齐用）

前端舞台固定 1400 × 920（等比缩放），当前桌面贴图放在 `left:40, top:600`，显示尺寸 `1320 × 330`——正好是 1600 × 400 的 0.825 倍，所以新图会等比缩放，不会变形。

- 角色脚底线在 y≈668，桌沿（y=600）以下被桌子遮住，桌面上方露出约 170–200 px 的角色上半身。
- 椅子以「椅背宽 ≈ 座位间距 × 1.45」放在角色身后（8 座时间距约 156 px，椅背宽约 226 px），只露顶部。
- 图层顺序：椅子 → 角色 → 桌子 → 名牌/气泡。所以桌子必须有透明背景，且边缘不能带白边，否则会切出硬边。

---

## 五、GPT 提示词模板

**长桌（中文）**

> 画一张横版长餐桌素材，正面略俯视，左右对称，不要桌腿、不要地面。画布 1600×400 透明背景 PNG。桌面是深胡桃木，木纹沿长边水平方向的细密顺纹，左上柔光、右侧略暗，桌沿厚度约 20px 且比桌面深一档。桌面中央保持干净，不要餐具、不要反光斑点。风格是日系动画背景、semi-realistic anime，不要照片级写实，不要投影和白色轮廓光。参考我给的尺寸示意图。

**长桌（English）**

> A long rectangular dining table seen from the front at a ~20° downward angle, perfectly symmetrical, no legs, no floor. Canvas 1600×400, transparent PNG. Dark walnut wood with fine horizontal grain; soft key light from upper-left, slightly darker on the right; ~20 px rim that is one shade darker than the top. Keep the centre clear (no plates, no props, no highlights). Japanese anime background style, semi-realistic, not photorealistic, no cast shadow, no white fringe.

**椅子（中文）**

> 画一把木椅的椅背，从正后方平视，左右严格对称，画布 600×900 透明背景。靠背 520×640、顶部圆角约 48，两侧立柱向下延伸，底部一根横撑。胡桃木，与长桌同一色系和光照，不要阴影、不要背景、不要文字。只需要椅背，不需要完整椅腿。

**椅子（English）**

> The back view of a wooden chair, straight-on and perfectly symmetrical, canvas 600×900 transparent PNG. Backrest 520×640 with rounded top corners (r≈48), two side posts, one lower cross rail. Walnut wood matching the long table, same lighting direction. No shadow, no background, no text. Backrest only; legs need not be fully visible.

**负面提示（通用）**

> 不要：透视歪斜、不对称、桌腿、地面、阴影、投影、白边、灰底、水印、文字、餐具、植物、写实摄影质感、强反光。

---

## 六、自检清单（出图后逐条看）

1. 尺寸对不对（1600×400 / 600×900），是不是真透明 PNG？
2. 放在深色背景上有没有白边 / 灰底残留？
3. 左右是否对称、前后缘是否水平、透视有没有歪？
4. 桌面中央是否干净（能压住白字）？
5. 风格是否偏写实照片（如果是，重出，要更"动画背景"）？
6. 椅子是否只露椅背、没有完整椅腿和阴影？

---

## 七、打包与命名

```
longtable/
  table-long.png
  chair-long-back.png
  chair-long-side.png   （可选）
  README.txt            （说明用了哪版提示词、是否透明）
```

放到 `assets/incoming/longtable/`，我拿到后会：按当前布局贴进 `preview/longtable.html` 重新截图核对（大小/透视/遮挡），确认没问题再写进插件前端。