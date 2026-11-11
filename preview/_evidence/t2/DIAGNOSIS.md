# t2 — 三处脸/嘴缺陷：只读顾问诊断与修法

日期：2026-11-10。角色：advisor。**本任务仅检查资产/脚本和 t1 视觉证据；唯一新增文件为本文，不修改代码、贴图、manifest 或模型。本文是修复方案，不是修复验收通过。**

## 结论与路由

|问题|根因分类|优先修法|是否必须 Cubism 手改|
|---|---|---|---|
|Qwen 嘴/脸歪|闭嘴/开嘴切件位置不一致；残留底图口线风险；开闭口不透明度混合；动态形变待进一步定位|cut/画布定位统一嘴锚点；清干净 face 与 head_base 嘴底；PSD2Live 重出模，再检动态|静态不需要。仅在重出模后局部随动或中间嘴型仍不合格时，Cubism 5.3 GUI 调 deformer/keyform/opacity；现有外部参数 API 不能代做|
|豆包待机鼓嘴|face 与 head_base 烘焙半球；裁切/擦嘴覆盖不全；刻意不接闭嘴件；中间态嘴型不佳|修 cut 的嘴区补肤/单一闭口设计，重建底板；若独立闭嘴则生成非空 mouth_close 并重出模|待机不需要；平滑口型如自动生成仍失败才用 GUI|
|MiniMax 人中点|同色残点烘焙进 face、head_base；非 alpha 缝，非嘴件|cut 中人中局部 RGB 修补、保留 alpha/鼻高光；重建底板与 atlas 后导出|不需要；网格修改无法擦除贴图颜色|

**不推荐**靠运行时 MouthOpenY 偏置、关 idle、交换绘制顺序或改 atlas padding 掩盖三处问题。三 rig 待机嘴参数为 0，idle 无嘴曲线（t1 §5）；这些操作不能修掉烘焙像素或对齐错误。

## 已亲自检查的视觉证据

依赖报告：[t1 全量报告](../t1/README_t1.md)。本顾问已打开以下原生 2048×2048 渲染与 6× 最近邻裁图，**没有另造渲染，也不将宿主缩放预览误称为新 1:1 结果**。头部大裁图在工具显示时可能被缩小，局部 6× 图用于确认嘴/点形态。

### Qwen

[原生 1:1 全图](../t1/qwen_1x_full.png) · [6× 头部](../t1/qwen_6x_head.png)

![Qwen 6× 嘴与参考线](../t1/_crops/qwen_mouth_lines_6x.png)

视觉：闭嘴呈偏厚的浅棕弧，右侧另有一段粉色口线，不能只看主嘴 drawable 的 bbox 而忽略底板残线。左右眼造型本来不等高，口部又偏左，组合起来读成歪。

### 豆包

[原生 1:1 全图](../t1/dounai_1x_full.png) · [6× 头部](../t1/dounai_6x_head.png)

![豆包 6× 0/0.3/1 三态](../t1/_crops/dounai_mouth_3states_6x.png)

视觉：待机确为上方深红半圆与下方独立笑线；0.3 时只是下方淡影，1 时才出现大开口；不能用“把 open 关掉”解决待机。

### MiniMax

[原生 1:1 全图](../t1/minimax_1x_full.png) · [6× 头部](../t1/minimax_6x_head.png)

![MiniMax 点 6×](../t1/_crops/minimax_dot_6x.png)

视觉：鼻高光下方确有红色竖向小点，四周连续肤色；与更低处闭嘴上方的红短线是不同位置，不可把二者混作同一个缺陷。

## 1. 共同的底板机制：不修这里容易复发

源码依据：[HEAD_PARTS](../../../assets/_raw/make_layout_manifest_gemini.py#L91-L92)、[head_base() 合成](../../../assets/_raw/make_layout_manifest_gemini.py#L187-L207)、[生成底板并插入 manifest](../../../assets/_raw/make_layout_manifest_gemini.py#L578-L588)。

`HEAD_PARTS = ("neck", "face", "eye close", "eyewhite", "irides", "mouth close", "mouth open", "ears", "front hair", "headwear")`，`for l in stack: ... plate.alpha_composite(im, pos)`。

这会把静态头件、**开口与闭口图**一起烘到底板，而底板属于持续可见的 face 预设。两个后果：

1. face 本身的小点/半球会复制到 head_base：t1 的双 plate 像素归属与源码一致。
2. 只移动/隐藏动态嘴件，底板仍可能留旧嘴。Qwen 右侧粉色短线必须通过隔离 face/head_base 实测归属，不能直接宣布是 mouth_close 自身。

优先局部方案：以清理后的肤色 face 构建嘴区 backing，嘴/口腔/唇线只在动态嘴件中出现；保留现有底板的头发/脸颊补洞功能。**不要未经回归就全局移除所有 HEAD_PARTS 或改变所有角色的底板**。可以角色/嘴区显式豁免；否则会重开此前解决的脸颊/发际线接缝。以旧底板做 `--colour-ref` 时必须防止把旧残点/旧嘴带回来。

## 2. Qwen：先修素材对齐，再判断是否需要改 rig

### 确定结论

- t1 neutral 闭嘴 alpha 中线 x=1042.42，face bbox 中心 x=1047.0，差 −4.58 px；张嘴 x=1053.51，相对闭嘴右偏 +11.09 px。嘴角同高 710.5/710.5，**不是左右嘴角 y 不一致**。
- [cut_qwen.py:383–404](../../../assets/_raw/cut_qwen.py#L383-L404) 闭嘴由 `mouth_arc(526.0, 534.0, 14.0, 2.5, arc_col, stroke=2.2)` 人工画弧；[259–271](../../../assets/_raw/cut_qwen.py#L259-L271) 开嘴来自另一张 expression 的 diff 最大连通块，天然没有统一锚点约束。
- [qwen_to_canvas.py:57–73](../../../assets/_raw/qwen_to_canvas.py#L57-L73) 所有件共用 s=1836/1393≈1.31802；所以不是对某一个嘴件的不同全局缩放。闭嘴移动 +4.58 px 约等于源画布 +3.47 px；开嘴移动 −6.51 px 约等于源画布 −4.94 px，**仅作为首轮 x=1047 对齐估算，不是最终美术坐标**。
- t1 不透明度 `close=1−x, open=x`，中间态叠加两种不同位置/形状；仅对齐位置也可能留下两层唇线，仍需观察。
- 右眼上沿比左高 23 px，下沿同为 673；该差异可能来自原画透视/不对称，不能简单整眼平移 11.17 px 或强行镜像来满足数字。

### 需要纠正的因果强度

t1 AngleX ±6 的嘴−face bbox 差摆动 10.1 px 是**已复现现象**，但“嘴网格权重没跟上”不是唯一原因。face bbox 是贴图轮廓，不是嘴所在位置的局部皮肤地标；正常透视也允许嘴相对整体 bbox 移动。

[qwen.layout.psd2live.json:10–12](../../../assets/build/qwen-v1/qwen.layout.psd2live.json#L10-L12) 显示生成器为 `perspective-parallelogram-nine-pose-v2`，`initialAngleZ=-2.5379808`，存在自动姿态校正。必须在相同参数状态比较鼻尖/鼻高光、下巴中心、嘴中心与对应变形器/keyform；目前不能据这一个 bbox 指标证明必须手建网格。

### 具体实施建议

1. 建立 neutral 嘴锚点：综合鼻高光与下巴/脸轮廓，不只靠双眼 alpha 质心（虹膜/睫毛不对称会偏）。首轮可取 x≈1047，检查视觉后固定。
2. 在 cut 或到画布阶段一次性对齐 close/open 的**实际墨迹/唇线锚点**；调整源弧 cx 与开嘴 patch 平移；manifest rect 与图像坐标必须同步，不能靠改 JSON rect 造成下一轮 cut 重置。
3. 清掉 face 和 head_base 旧口线/口腔烘焙；隔离两 plate 的嘴区验证后再重出。检查闭嘴弧是否需要减细，避免虽居中仍像贴上去的胶囊；不改变角色表情方向。
4. `cut_qwen.py → qwen_to_canvas.py → qwen_build.py` 重走导入/rig/atlas/export。build 默认 endpoint 在旧端口；实施时显式使用当前 24871 endpoint 与已知 token 文件，**不在报告/日志回显 token**。
5. 自动口型如在 0.1–0.5 仍双线：先确认工具 schema 是否能编辑嘴形/透明度 key；不能假设 manifest 的 toggle 可覆盖 mouth preset 内部生成逻辑。必要时 Cubism GUI 设置一致的闭合/小开/全开 keyform、遮挡与 opacity，而不是简单全程线性淡入两张无关嘴图。
6. 动态对齐仍失败才在 Cubism 5.3 中让 face/close/open 共用正确头部层级，修局部变形器关键形状；不一定需要重新建网格，先改 keyform/parenting。仅当三角拓扑导致折叠/无法保唇边时才重建嘴网格。外部 API 22033 只能读写参数，不能宣称完成这些编辑。

风险：头姿自动估计可能随眼睛位置变化而变化；改全眼会牵动闭眼底图、睫毛、眉、头发遮挡，因此本轮不建议对眼高做大范围对称化。修改底板不能破坏发际线/脸颊旧修复。

### 建议数值门槛（修后验收使用，并非已通过）

- neutral close/open 唇线锚点横差 ≤1 px，嘴与选定面部中心线差 ≤1.5 px，左右嘴角高差 ≤1 px；同时视觉居中、不呆板。
- MouthOpenY={0,.05,.1,.3,.5,.75,1} 每态仅一套可读唇线，不得分叉/残线/忽隐忽现；开度连续，不能只在 1 张开。
- AngleX={−6,0,+6}、AngleY={−4,0,+4}（再查实际 runtime 最大范围）测嘴对局部面部地标随动，不能用 face bbox 绝对不动作为目标；对称 pose 不应突跳，回 neutral 可复原。
- MouthForm={−1,0,+1} 若本轮修其绑定则闭口应可见、有序且不离中线；若不修，明确记录次要既有缺口，不以为三处主诉已包含该项。

## 3. 豆包：明确是资产/切件链，不是 idle 和绘制顺序

### 根因证据与可执行修法

t1：半球 (1020,789)–(1080,801)，60×12，538 px，RGB≈(167,50,28)；下笑线 (975,805)–(1130,830)，5 px 空隙；半球底边 y=801 恰等于开嘴 rect top。face/head_base 均有半球，待机唯一 mouth drawable opacity=0。

[cut_dounai.py:184–205](../../../assets/_raw/cut_dounai.py#L184-L205) 只用 `rect(468,618,582,698) & (c["mx"] < 215)` 当 mouth_zone，容易漏掉较亮橙唇与上方深红成分；之后 [276–299](../../../assets/_raw/cut_dounai.py#L276-L299) sweeper 继续认领未清像素，且明确写了“微笑保留在 face，mouth_close 留空”。这是当前表现的直接管线依据；“源 PSD 矩形裁切”仍应作为高可信推断，未读取源 PSD 不应写成已证实来源。

注意 t1 说 parts 下有非空闭嘴图，但**当前 cut 会输出空 mouth_close**。该非空文件可能为历史产物；不能只把旧图强接 manifest 就认定内容正确。manifest [513–516](../../../assets/_raw/make_layout_manifest_gemini.py#L513-L516) 会跳过透明件。

推荐分两级：

- **最小待机修复**：局部补掉深红半球，保留完整下笑线与自然唇下阴影；清 face 与 head_base 后重出。无需添加 close drawable 即可修本次待机主诉，但开口时底图笑线不跟随的风险必须验。
- **更可靠的可说话结构（优先）**：从源图提取/重绘一条自然闭合笑线为非空 mouth_close，face 嘴区全补肤；开嘴与闭嘴共锚点；head_base 嘴区纯肤色；让 manifest 自动纳入 closed piece 后 PSD2Live 重出。由于自动 rig 对小幅开口欠佳，必须检查 0.3 的真实开度，失败再由 Cubism GUI 调 keyforms，不得把淡影算作开口。

补肤应使用局部二维渐变/邻域纹理，不是把整块黄皮涂成常数色；保留鼻尖、肤色高光与下巴；需在 sweeper 完成后仍验证原嘴像素未重新归到 face/back_hair。不要以 alpha 挖洞来“擦嘴”，会露底/黑缝。

风险：黄肤 3D 渲染渐变明显，平涂会变成贴片；既保留静态笑线又添加 close 会变双嘴；只擦 face 仍会从 head_base 露出半球。改共享 manifest 应角色限定，避免其他模型受影响。

验收建议：待机原半球 ROI 不再有孤立深红分量；下笑线如果保留只应有一条连续自然笑线；鼻区像素不动、嘴区 alpha 连续。开嘴 0/.1/.3/.5/.75/1 连续开度、无双嘴/平切半圆，1:1 读作闭嘴而不是“鼓嘴”，6× 无残块或补肤硬边。不能只要求红色总像素=0，因为合法唇线也可能红。

## 4. MiniMax：局部 RGB 修补即可，不要动网格

t1 点核心 (1053,629)–(1056,634)，12 饱和像素，峰值 (239,144,133)，背景约 (252.9,229.8,219.5)；face/head_base 均有 11 px 同色残点，嘴件 0 px。四周 alpha>200 且无边缘，远高于嘴件顶沿 58 px，故纹理污点而非切缝/嘴网格。

[cut_minimax.py:222–241](../../../assets/_raw/cut_minimax.py#L222-L241) 擦嘴仅限 y=488..540 的源坐标区域且 mx<215；该人中点可落在正常肤色种子/表情回填范围内。应在 face_rgb 最终写图前加**限定人中 ROI 的去点**，根据到画布映射逆变换定位源坐标，不可直接把 2048 的点坐标塞给 1024×1536 源图。

方式：局部插值/小半径 inpaint 替换 RGB，alpha 原封不动；只涵盖红色核心与反走样晕圈，保护上方鼻高光及正常肤色梯度。然后重跑 to_canvas、manifest/head_base、atlas/export。若选择紧急直接 patch 产物，face、head_base、最终 atlas 都要一致且留下可复现脚本；不建议只改 atlas 而源链不改。

不需要改 manifest rect、不透明度、draw order 或 mesh。原始美术上该点也可能是鼻底着色，不代表技术裂缝；用户要求去除即可针对性去色，不扩展重画鼻子。MiniMax 另有更低处短红线与闭嘴偏移，t1 标为次要，未经队长明确范围不顺手改脸。

验收建议：在原点 ROI 及 1–2 px 晕圈，`alpha>200 & r−g>55 & r>120` 的异常红点分量为 0；鼻高光边界不变。face 与 head_base 单件检查均通过；最终 neutral、AngleX±6、AngleY±4 及开/闭嘴 1:1+6× 都没有红点、透明孔、色块。补丁外像素（不含 atlas 重新打包位置差异）应保持一致。

## 5. 交付/回归顺序与边界

1. 保留 t1 基线；实施在独立输出目录，先清图再统一锚点再生成底板；最后 PSD2Live rig/atlas/export。导出要成套更新 moc3/model3/atlas 及相关引用，别混旧 atlas 与新 moc。
2. 共享 MCP 的 project_import_layout 包含 discard_unsaved；只允许队长串行安排多个 build，禁止并行争抢 24871 的同一工作区；报告/终端不打印 bearer token。
3. 角色 build 内部会重建 manifest；不能仅手改生成的 manifest 后又运行覆盖它。Dounai/MiniMax 默认 grow=2，而 Qwen build 显式默认 grow=0，重出必须保持参数，避免无关轮廓变粗。
4. 先做源码/PNG 归属检查，再做运行时参数矩阵；每个主结论须保留 2048 原生渲染和同 ROI 最近邻 6× 修前/修后，注明参数、实际载入版本、atlas/moc 来源。浏览器热缓存必须去掉或换新 URL。
5. 静态对齐可通过 cut/manifest/重出模解决，不要提前把三题全升级成手工 Cubism；但自动生成失败后也不要用运行时参数偏置掩盖形变缺陷。

**本任务完成状态：诊断与建议完成；未实施任何修复，修后数值与视觉验收仍待实施/验证任务执行。**
