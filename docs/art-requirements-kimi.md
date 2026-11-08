# Kimi(Q 版)的 Live2D 部件记录

> 2026-11-08 制作。管线 A(同 Gemini/GLM/Qwen):双参考图母图 → 软 matte → `cut_kimi.py`
> 切 19 件 → `kimi_to_canvas.py` 贴 2048 画布 → `kimi_build.py`(PSD2Live 无头 MCP)→
> `assets/build/kimi-v1`。母图与表情图一次过。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/kimi-parts/ref-sheet.png` | 1448×1086,用户提供 |
| 成年图 | `assets/incoming/kimi-parts/ref-adult.png` | 1152×2048,用户提供 |
| **母图(定稿)** | `p0/Celestial-Kimi-in-Gothic-Lolita-Attire__….png` | 1024×1536 平涂 `#00FF00`,ink `(69,52)-(954,1494)` |
| 表情编辑 | `expressions/Closed-Eye-Chibi-Maid-Idol__….png` | 闭眼+张口一张全幅 |
| matte | `assets/build/kimi-parts/matte.png` | `--cpu --res 1024` |

Prompt:`relay-kit/prompts/kimi-p0-master.txt`(双参考图)、`kimi-p1-expressions.txt`。
设计要点:白色褶边女仆头带 + 月棱镜发饰(月牙+黑三角棱镜+彩虹)+ 藏青 K 蝴蝶结
(发侧与胸口各一,带音符号坠)、薰衣草灰长卷发(及膝)、紫蓝眼、藏青哥特萝莉塔裙
(星月音符印花 cape + 束腰 + 链带 K 挂坠)、白裤袜藏青鞋;**空手交叠无长笛**(无持物铁律)。

## 2. 切件(`assets/_raw/cut_kimi.py`)——本轮新踩的坑

- **张口烘进 face 的 bug**:眼洞用「表情图 diff 区域」回填时,diff 同时含嘴部的
  张口蛋;`grow(mouth_zone,5)` 盖不住(diff 嘴区比 mouth_zone 大),结果张口被烘进
  face 常显。修法:显式 `mzone_diff = rect(425,435,565,525)`(按 diff bbox 实测)
  整块排除。**任何用 diff 回填的角色都要做这一步**。
- 薰衣草发(b-r 30..75)与蓝紫虹膜(b-r 70..100)同域(同 GLM 的紫虹膜问题):
  虹膜只在眼带内取,其余层用 almond 外扩的几何 eye_guard。
- 肤白、发白高光、白蕾丝同色:肤色判据只做种子,脸用 `fill(skin_seed)&face_ell`
  的几何闭合;眉毛(mx<205 细线)显式并入 face。
- headwear 三个件(头带/月棱镜/K 蝴蝶结)颜色跨白|藏青|彩虹,靠 zone 兜 +
  `nearwhite(mn>200,sat<0.22)` 过渡带;不放宽就有一圈绿边。

## 3. 画布与座位

- 画布映射:`scale=1.2732, dx=372.7, dy=39.8`(INK=(69,52,954,1494),TARGET_H=1836)。
- 虹膜画布位 **535**(Gemini 641)——含膝长发把脸占比压小,照抄 Gemini 的 dy 眼线会高
  ~23 舞台px。**底部锚定下加大 scale 只会把眼睛推得更高**(实测 1.9 反向恶化),
  只能用 dy 补:`dy = 160 + 106.5×1.8×244/2048 ≈ 183`。
  - 产品 `lib/client.js`:`scale 1.7, dx 0, dy 136, dyCharH 182, cut true`;
  - longtable `1.8/183/244`;stage-760 `1.70/136`。

## 4. 出模与验收

`kimi_build.py`:make_layout_manifest_gemini.py(**必须带 `--parts/--out/--name/--ink`**,
--ink 驱动 head_base 补色参考的映射,见 pitfalls)→ PSD2Live 无头 MCP
(`PSD2Live.exe mcp --port 24871 --token … --profile full`;GUI 的 23871 被
Windows 保留段 23809–23908 占用,bind 静默失败)→ export。moc3 454KB,单页 4096,
Groups 带 EyeBlink/LipSync。

probe 1:1 品红底:开眼 ✓、`ParamEye[LR]Open=0` 闭眼自然(烘 face 弧线+睑影)✓、
`ParamMouthOpenY=1` 张口 ✓;三态 enclosed holes≥40px 全 0;绿残留 3px。
Cubism 5.3 打开 cmo3:部件树 Head/Extra/Body、AngleX ±45° 变形无破面。
`npm test` 46/46;deployed 已同步。

## 5. 持物变体（2026-11-08 第二轮）

一轮编辑出「双手持银长笛（斜持腰前，按键朝左下）」的 prop 母图（`relay-kit/prompts/kimi-p2-prop.txt`，
diff 校验确认改动集中在手部区）；`cut_prop_variant.py --char kimi` 复用基础件，
只新增 **objects 层**（diff 闭合区 = 手+银长笛（斜持腰前，按键朝左下），prop 母图色）并把 handwear 减去
objects（袖子保留）。objects 区贴绿底的过渡像素整块剔除（否则变体镶绿边）。
`kimi_prop_to_canvas.py`（同 INK）→ `kimi_prop_build.py`（`--name kimi-prop`，
manifest 文件名是 `<ch>-prop.layout.json`）→ `assets/build/kimi-prop-v1`。

- **objects 必须在 manifest LAYERS 里**（同 earwear 教训），z 在 handwear 之后。
- **headless MCP 的 request_id 有账本**：失败尝试也会占用 id，重跑前改 id 或重启服务。
- probe 品红底三态 0 透洞；Cubism/pause 均正常。
- 注册：`lib/stage.js` `kimiProp/mimoProp/minimaxProp`；`lib/client.js` 三个座位的
  `book:` 指向变体（复用 claude-book 机制：静听 9s 交叉淡入、开口淡出、applyPose
  复制到手部动作）；longtable 同款 `alt:`。deployed 已同步。
