# MiniMax(Q 版)的 Live2D 部件记录

> 2026-11-08 制作。管线 A(同 Kimi/Mimo):双参考图母图 → 软 matte → `cut_minimax.py`
> 切 20 件(含 **earwear**)→ `minimax_to_canvas.py` → `minimax_build.py` →
> `assets/build/minimax-v1`。母图与表情图一次过。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/minimax-parts/ref-sheet.png` | 1448×1086 |
| 成年图 | `assets/incoming/minimax-parts/ref-adult.jpg` | 3072×5504 |
| **母图(定稿)** | `p0/Cheerful-Chibi-Idol-on-Green-Screen__….png` | 1024×1536 平涂 `#00FF00`,ink `(183,42)-(828,1490)` |
| 表情编辑 | `expressions/Serene-Singing-Chibi-Girl__….png` | 闭眼+张口一张全幅 |
| matte | `assets/build/minimax-parts/matte.png` | `--cpu --res 1024` |

Prompt:`relay-kit/prompts/minimax-p0-master.txt`、`minimax-p1-expressions.txt`。
设计要点:白贝雷帽(格纹帽檐 + 粉蝴蝶结 + 波浪 logo)、桃橙短卷发粉发梢、
**海螺耳环(独立 earwear 层)**、珊瑚红大眼、白短外套粉滚边、白衬衫、粉挂绳 +
白工牌、米色格纹裙、白袜粉条纹、白粉球鞋;**空手交叠,无海螺/挎包/录音机**。

## 2. 切件(`assets/_raw/cut_minimax.py`)——本轮最贵的一课

- **色域直觉会骗人**:珊瑚红虹膜与上睫毛同域(228,84,84 vs 252,108,108,靠
  mx<235/mx>=160 分);第一版眼带定错(把腮红当虹膜、把眼睛当眉毛),靠
  `_measure_*.py` 聚类 + 精细网格裁剪才钉死:眼睛 y365-460、腮红 y502-645、
  嘴 y500-525、工牌 y727-777(此前把挂绳暗扣当嘴、读高 ~135px)。
- **earwear 必须进 LAYERS,区必须贴件**:`make_layout_manifest_gemini.py` 的
  LAYERS 表原本没有 earwear → 件被静默丢弃,而耳环区矩形(405-482×610-805)
  又抓进了白衬衫 → 躯干一出大矩形洞(图集完整、网格在,只有该层没建)。
  修法:①LAYERS 加 `("earwear","ear accessory",False,None,None)`;
  ②耳环区收到实测 bbox(418,618,484,795)/(645,608,710,790),色类排除纯白。
- head_base 补色参考**原来硬编码 Gemini 的 matte + Gemini 映射**——所有角色
  的头部底版都吃 Gemini 颜色(Kimi 刘海上的蓝紫碎片、MiniMax 脸颊蓝斑都是
  Gemini 的头发)。已参数化:`--ink x0,y0,x1,y1` → matte 取 `<parts>/../matte.png`,
  k/dx/dy 按 TARGET_H=1836 公式现算。**build 脚本必须传 --ink**。
- 粉色系(蝴蝶结/挂绳/袜条纹/腮红/发梢)全是 `pink` 类,全靠 zone 互斥。

## 3. 画布与座位

- 画布映射:`scale=1.2680, dx=383.0, dy=52.7`(INK=(183,42,828,1490))。
- 虹膜画布位 **586**(Gemini 641)→ 眼线公式:longtable `1.8/172/244`,
  产品 `1.7/128/182`,stage-760 `1.70/128`。cut true。

## 4. 出模与验收

`minimax_build.py`(全参数显式)。moc3 372KB,单页 4096,EyeBlink/LipSync ✓。
probe 品红底三态 holes≥40px = 0;闭眼微笑自然、张口 ✓。合成校验 0.42%。
`npm test` 46/46;deployed 已同步。

## 5. 持物变体（2026-11-08 第二轮）

一轮编辑出「双手持奶油橙海螺（双手捧腰前，尖朝右上）」的 prop 母图（`relay-kit/prompts/minimax-p2-prop.txt`，
diff 校验确认改动集中在手部区）；`cut_prop_variant.py --char minimax` 复用基础件，
只新增 **objects 层**（diff 闭合区 = 手+奶油橙海螺（双手捧腰前，尖朝右上），prop 母图色）并把 handwear 减去
objects（袖子保留）。objects 区贴绿底的过渡像素整块剔除（否则变体镶绿边）。
`minimax_prop_to_canvas.py`（同 INK）→ `minimax_prop_build.py`（`--name minimax-prop`，
manifest 文件名是 `<ch>-prop.layout.json`）→ `assets/build/minimax-prop-v1`。

- **objects 必须在 manifest LAYERS 里**（同 earwear 教训），z 在 handwear 之后。
- **headless MCP 的 request_id 有账本**：失败尝试也会占用 id，重跑前改 id 或重启服务。
- probe 品红底三态 0 透洞；Cubism/pause 均正常。
- 注册：`lib/stage.js` `kimiProp/mimoProp/minimaxProp`；`lib/client.js` 三个座位的
  `book:` 指向变体（复用 claude-book 机制：静听 9s 交叉淡入、开口淡出、applyPose
  复制到手部动作）；longtable 同款 `alt:`。deployed 已同步。
