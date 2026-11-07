# GLM(Q 版)的 Live2D 部件记录

> 2026-11-07 制作。走**管线 A**(单张母图切件,同 Gemini/Claude):中转站双参考图出母图 →
> BiRefNet 软 matte → `cut_glm.py` 切 22 件 → `glm_to_canvas.py` 贴 2048 画布 →
> `glm_build.py`(PSD2Live GUI+MCP)→ `assets/build/glm-v1`。
> 母图与表情图一次过,用户未要求返工。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/glm-parts/ref-sheet.png` | 1448×1086,用户提供 |
| 成年图 | `assets/incoming/glm-parts/ref-adult.png` | 1152×2048,用户提供 |
| **母图(定稿)** | `p0/Gothic-Lolita-Wolf-Girl-on-Green__…png` | 1024×1536 平涂 `#00FF00`,ink `(130,90)-(904,1416)` |
| 表情编辑 | `expressions/Chibi-Gothic-Catgirl-Contentment__…png` | 闭眼+张口一张全幅(整图重绘,diff 6.6 万 px,只当取件源) |
| matte | `assets/build/glm-parts/matte.png` | BiRefNet_HR,`--cpu --res 1024`(24s;模型加载 7 分钟) |

Prompt:`relay-kit/prompts/glm-p0-master.txt`(双参考图:设定图定设计+成年图定风格)、
`glm-p1-expressions.txt`。设计要点:黑狼耳+黑蕾丝眼罩(闭眼刺绣)+Z 方块发饰+铃铛流苏、
黑发蓝渐变、黑白哥特裙、狼尾白尖、双手交叠**不带书**(同 Gemini 的「无持物」铁律)。

## 2. 切件(`assets/_raw/cut_glm.py`)——本轮新踩的坑

- **皮肤太白**:`r-g>14` 这类暖判据漏掉大面积淡肤色(脸 1.4 万 px → 4.5 万 px 修复)。
  改 `mn>195 & r-b>=10 & r>=g & sat<0.32`:白布是冷白(b≥r),皮肤 r-b≥10。
- **虹膜紫过 hair/blue 类**:GLM 发色黑+蓝、虹膜蓝紫,`dark/blue` 全都能吃虹膜。
  刘海/头饰的排除区必须用**几何**(almond/虹膜外扩),纯色类 exclusion 一定漏:
  ① front_hair 叼走虹膜边角→闭眼露蓝斑;② **headwear 的 charm_zone(挂件区,
  y≤470)右下与右眼带重叠**,头饰叼走右虹膜左上角,闭眼时露蓝斑(排查耗时最久的一条,
  用逐 drawable 消隐法定位)。最终 `headwear &= ~grow(almonds|discs, 5)`。
- **闭眼外观烘进 face,不要独立闭眼件**:GLM/Qwen 弃用 `eye close` 层。
  眼洞补色直接用表情图的闭眼像素(`face_rgb[holes_eye]=expr[...]`,嘴洞照旧补肤),
  闭眼时 eyewhite/irides toggle 隐藏、face 露出自然闭眼(带眼睑阴影)。
  原因:PSD2Live 对 `eye close` 层生成 `_SeeThrough` 伴生件(opacity 0.5 常显),
  会把开眼件整个透出来;换中性层名(`pensive lid`)会被静默降级成普通 Layer 层
  ——两个方向都试过,烘 face 是唯一干净解。
- mouth dash 重画:`mouth_arc(520, 533, 13, 1.5)`(同 Claude/Gemini 处理)。

## 3. 画布与座位

- 画布映射:`scale=1.3846, dx=308.2, dy=-18.6`(INK=(130,90,904,1416),TARGET_H=1836)。
- 座位:与 Gemini 完全一致(用户拍板以 Claude 观感为准)——
  产品 `lib/client.js` `scale 1.7, dx 0, dy 120, dyCharH 182, cut true`;
  longtable `1.8/160/dyCharH 244`;stage-760 `1.70/120`。
  四席截图(Claude/Gemini/GLM/Qwen):头线齐平、腰线落桌沿 ✓。

## 4. 出模与验收

`glm_build.py`:make_layout_manifest_gemini.py(带 `--parts/--out/--name` 参数)→
PSD2Live MCP import → rig_generate → physics(EyeJelly off / HairBack 0.60-0.45-0.70-1.4 /
HairFront off)→ export。moc3 421KB,单页 4096,Groups 带 EyeBlink/LipSync。

- **build 脚本坑**:`make_layout_manifest_gemini.py` 不带参数时用 Gemini 默认值——
  glm_build 首跑把 Gemini manifest 导出成了 glm-v1(产物是 Gemini 模型!)。
  build 脚本必须显式传 `--parts/--out/--name`。
- probe 验收:开眼 ✓、`ParamEye[LR]Open=0` 双眼自然闭合无残留 ✓、
  `ParamMouthOpenY=1` 张口 ✓;品红底 holes≥40px = 0(开/闭/张口四态全查)。
- `npm test` 46/46;deployed 已同步 lib + glm-v1。
