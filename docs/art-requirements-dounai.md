# Dounai(豆奶/豆包吉祥物)的 Live2D 部件记录

> 2026-11-08 制作。管线 A 最简结构:单张三视图设定图(无成年图)→ 母图 → 表情编辑 →
> matte → `cut_dounai.py` 切 16 件 → `dounai_to_canvas.py` → `dounai_build.py` →
> `assets/build/dounai-v1`。母图与表情图一次过。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/dounai-parts/ref-sheet.png` | 1448×1086,正面/右侧面/背面三视图,3D 玩具质感 |
| **母图(定稿)** | `p0/Glossy-Chibi-Dounai-Mascot-Render__….png` | 1024×1536 平涂 `#00FF00`,ink `(186,51)-(836,1478)` |
| 表情编辑 | `expressions/Peaceful-Singing-Chibi-Character__….png` | 闭眼+张口一张全幅 |
| matte | `assets/build/dounai-parts/matte.png` | `--cpu --res 1024` |

Prompt:`relay-kit/prompts/dounai-p0-master.txt`(单参考图,要求保留参考图的柔和
玩具质感)、`dounai-p1-expressions.txt`。设计要点:栗棕波波头、金黄皮肤、大圆深棕眼、
腮红、奶白肚兜印、深灰棕连指手套手与靴脚、无服装无持物。**没有成年参考图**——
单张设定图同时定设计与质感。

## 2. 切件(`assets/_raw/cut_dounai.py`)——本轮坑

- **橄榄棕手**:手是 (115,105,57),r-g 只有 10,常规 `r-g>18` 的棕类接不住 →
  棕类改 `r-b>25 & r>=g`(头发/手/脚同域,zone 拆)。
- **head_base 额头黑点的第三种形态**:豆奶刘海低垂,head_base 的缝隙补色从 matte
  取到深发色,在刘海下的额头漏出黑点串。修法(通用):**face 认领刘海下的整条
  额带**(`face_final |= body & rect(额带) & ~eye_guard`,face 在 front_hair 之下,
  安全);配合「额带内 face 剔除深色孤立碎屑」。
- **母图微笑画得完整时不要重画弧**:豆奶的唇形+唇色完好,保留在 face 里,
  mouth_close 留空(manifest 自动跳过该层),张口由 mouth_open toggle。
- **`_comp_generic.py` 的合成清单要含 handwear-l/r**(分件角色的 handwear 是
  分左右的两张 png,清单里只有合并名会漏掉整层,差点误判「手没切出来」)。

## 3. 画布与座位

- 画布映射:`scale=1.2866, dx=366.5, dy=40.4`(INK=(186,51,836,1478))。
- 虹膜画布位 **644**(≈Gemini 641.5)→ 眼线 dy≈160。**但这张设定图是「大头娃娃」
  占比**(头宽≈体宽 97%),scale 1.8 时头比邻居大一倍。先试 1.2(头宽对齐)但用户
  反馈「像小孩」,定稿 **scale 1.45**(头略大于邻居,吉祥物体格感)。眼线公式
  (已验证两个数据点):`dy(s) = 52 + 167.2×(s-1.2)` → s=1.45 时 dy=94。
  longtable `1.45/94`,产品 `1.45/83`(dyCharH 182),stage-760 `1.45/83`。
  **底锚定下 scale 变小 → 眼睛相对下沉 → dy 变小**(dy 260 那次把她整个沉到
  桌后——别再把符号搞反)。

## 4. 出模与验收

`dounai_build.py`(同款全参数显式)。moc3 298KB,单页 4096,EyeBlink/LipSync ✓。
probe 品红底三态 enclosed holes≥40px = 0;闭眼自然(烘 face)、张口 ✓。
眉上残留十几粒 ≤11px 的碎点(表情图睫毛点缀风格,舞台尺度不可见),接受。
`npm test` 46/46;deployed 已同步。眼线公式微调记录:dy 260(反号)→ 60(公式)
→ 52(目测 -8)。
