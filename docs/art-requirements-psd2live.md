# 圆桌会议 · 分层素材需求 v4（PSD2Live 全自动路线）

> 结论先说：**可以全自动**。用 [PSD2Live](https://github.com/tsunehimatoi/psd2live)（开源，GPL-3.0）就不需要 Cubism Editor 了——它自己就能从分层素材自动网格、绑变形器、生成参数/动作/物理，并直接导出 `.moc3` + `.model3.json`（Cubism 3.0–5.3）。
> 你那边**不用买 Pro，也不用 42 天试用**；试用版只留着“导出的 .cmo3 想人工看一眼”时用。
> 本文档取代 [art-requirements-live2d.md](art-requirements-live2d.md)（那份是“手动 Cubism”路线）。

---

## 0. 为什么能自动化

PSD2Live 读两种东西：

1. 分层 PSD；
2. **Layout 清单**（一个 JSON + 一堆 PNG，不需要 PSD、不需要 Photoshop）。

我这边用脚本把 GPT 出的部件图拼成 Layout 清单，再调 PSD2Live 的 **命令行** 或 **MCP 服务**（`http://127.0.0.1:23871/mcp`）导入、生成、导出。全流程无人工。

所以你只需要：**按下面的清单，每个部件出一张透明 PNG**。

---

## 1. 交付规格（每张图都一样）

| 项 | 要求 |
|---|---|
| 格式 | PNG，RGBA，8 位，**非预乘 alpha** |
| 画布 | **所有部件同一尺寸**，建议 **2048×2048** |
| 位置 | 角色在画布中的位置、比例、朝向完全一致，叠起来就是完整立绘 |
| 背景 | 全透明；不要白底/绿幕/渐变 |
| 光照 | 统一左上；**不要烘焙阴影** |
| 边线 | 干净 alpha，无白边/描边 |
| 文字 | 无文字、水印、边框 |
| 姿态 | **身体基本正立**（PSD2Live 的自动骨架依赖这个） |

> 画布 2048 够用；PSD2Live 允许单张图片比画布更密（纹理密度），后面需要更清晰时再单独放大。

---

## 2. 部件清单（按 z 序，后 → 前）

文件名用下面第一列；我按 `tags` 打标签（同名也行，标签优先）。

| 文件名 | PSD2Live tags | 必需 | 画什么 |
|---|---|---|---|
| `back_hair.png` | `hair, back` | ✅ | 后发，画到脸后被遮住的部分，留重叠 |
| `tail.png` | `tail` | 可选 | 尾巴 |
| `body.png` | `top` | ✅ | 躯干 + 衣服，**不含双臂**；肩/腋下被手臂挡住处补画 |
| `bottom.png` | `bottom` | 可选 | 下装（只做半身可不出） |
| `arm_left.png` | `arm, left` | ✅ | 整条左臂含手；肩部向身体内侧多画 5~10% |
| `arm_right.png` | `arm, right` | ✅ | 同上，右臂 |
| `neck.png` | `neck` | ✅ | 脖子；下巴下的部分补画 |
| `face.png` | `face` | ✅ | 整张脸皮（含下巴、下颌、额角轮廓），**不含五官** |
| `nose.png` | `nose` | 可选 | 鼻子（简单点/短线即可） |
| `mouth_close.png` | `mouth, closed` | ✅ | 闭嘴（嘴唇闭合状态） |
| `mouth_open.png` | `mouth, open` | ✅ | **最大张口**（口腔整块填色，边缘到唇线内侧） |
| `tooth_upper.png` | `teeth, upper` | 可选 | 上牙（一排真实牙列，画得比开口大） |
| `tooth_lower.png` | `teeth, lower` | 可选 | 下牙 |
| `tongue.png` | `tongue` | 可选 | 舌头（画得比开口大） |
| `eyewhite_left.png` | `eye, white, left` | ✅ | 左眼白（画大，边缘被睫毛盖） |
| `eyewhite_right.png` | `eye, white, right` | ✅ | 右眼白 |
| `iris_left.png` | `eye, iris, left` | ✅ | 左虹膜+瞳孔+高光（画满整圆，靠眼白裁） |
| `iris_right.png` | `eye, iris, right` | ✅ | 右虹膜 |
| `eyelash_left.png` | `eye, lash, left` | ✅ | 左睫毛（上睫毛线；眼尾翼可单出） |
| `eyelash_right.png` | `eye, lash, right` | ✅ | 右睫毛 |
| `brow_left.png` | `brow, left` | ✅ | 左眉 |
| `brow_right.png` | `brow, right` | ✅ | 右眉 |
| `front_hair.png` | `hair, front` | ✅ | 刘海 |
| `side_hair.png` | `hair, front` + 用户标签 `side` | 可选 | 两侧鬓发（和刘海分开更好动） |
| `headwear.png` | `headwear` | 可选 | 女仆头饰/猫耳等 |

> 左右是**角色自身**的左右（角色左手在画面右边）。文件名带 `left/right` 我会映射成 tags；你直接出图即可。

**最小可跑集**：`back_hair / body / arm_left / arm_right / neck / face / mouth_close / mouth_open / eyewhite×2 / iris×2 / eyelash×2 / brow×2 / front_hair`，共 17 张。

---

## 3. 画法硬要求（这是自动绑定成败的关键）

1. **遮挡补画**：手臂抬起后露出的衣服、头发后面的脸、下巴下的脖子、眼白被眼皮遮住的部分——都要画全，不能是透明洞。
2. **重叠余量**：前发/后发、手臂/身体、睫毛/眼白之间多画 5~15 px 重叠，变形时才不会露缝。
3. **五官分层**：不要画成一张脸。眼白、虹膜、睫毛、眉毛、嘴各自独立。
4. **嘴要两张**：闭嘴 + **最大张口**。PSD2Live 明确说“闭口原图无法靠变形恢复口腔”，所以必须给张嘴素材。
5. **脸型要清楚**：下巴、两颊、下颌角轮廓要明确（转头靠这些特征点）。
6. **身体正立**，头可以轻微倾斜，但不要歪太多。
7. **不要**烘焙阴影、地面、环境光晕、描边。

---

## 4. 给 GPT 的提示词

**通用前缀（每张都带）**

> 参考图：附上该角色完整立绘。
> 输出：**只画「{部件}」这一个部件**，其余区域完全透明；画布 2048×2048；角色位置、比例、朝向、光照与参考图完全一致；不要阴影、不要背景、不要文字、不要边框；身体正立。

**逐部件补充**

| 部件 | 补充 |
|---|---|
| back_hair | 后发（头顶到发尾），不含脸和刘海；被脸挡住的部分也画出来 |
| body | 躯干和衣服，**不含双臂**；把肩膀、腋下被手臂挡住的衣服补完整 |
| arm_left / right | 整条手臂和手，肩到指尖；肩部向身体内侧多画一点 |
| neck | 脖子，下巴下方到锁骨，被下巴挡住的部分补画 |
| face | 整张脸皮（下巴、脸颊、下颌角、额角轮廓清楚），不含眼睛、眉毛、嘴、刘海 |
| mouth_close | 只有嘴，闭合 |
| mouth_open | 只有嘴，**最大张口**，口腔整块填色 |
| eyewhite_l/r | 只有眼白，画大一点 |
| iris_l/r | 只有虹膜+瞳孔+高光，画满整圆 |
| eyelash_l/r | 只有上睫毛 |
| brow_l/r | 只有眉毛 |
| front_hair | 刘海 |
| side_hair | 两侧鬓发 |
| headwear | 头饰/猫耳 |

> 嘴、眼这类小部件，可以只画在画布中对应的位置，**不要为了“方便看”把整张脸重画一遍**。

---

## 5. 验收（我跑脚本 + PSD2Live 生成后检查）

1. 所有 PNG 同尺寸；叠加后与原立绘差异 < 2%（边缘除外）。
2. PSD2Live 导入后图层表里每个部件识别正确（部位 + 左右）。
3. 生成后：眨眼、张嘴、点头不穿帮；手臂抬起不露洞。
4. 无白边、无灰底、无阴影。

---

## 6. 自动化管线（我这边，你不用管）

```
GPT 出部件 PNG
   ↓  build_psd2live_psd.py：拼成分层 PSD（图层名用 PSD2Live 的英文标签词汇）
   ↓  PSD2Live CLI：psd2live --input model.psd --output out/  （无界面，直接跑完）
   ↓  导出：.moc3 + .model3.json + 纹理 + physics3.json + motion3.json + .cmo3
   ↓  Cubism SDK for Web（或 PSD2Live 自带 p2lrt 播放器）接进预览页
   ↓  驱动：待机（呼吸+摇摆）、说话口型、点头/摇头、表情
```

**已用合成素材跑通**（2026-10-31）：17 张 PNG → 分层 PSD → PSD2Live 3.6.7 → `demo.moc3` + `demo.model3.json` + 物理 + 待机/眨眼/点头/摇头动作 + 4 个表情，22 个 drawable、20 个参数，全程无界面、无 Cubism。

注意两点：

1. **图层名必须是 ASCII 标签**（`back hair`、`eyewhite-l`、`mouth open`…）。PSD 的图层名是 MacRoman 编码，中文名写不进去；脚本里已经做了映射，你按文件名给图就行。
2. 自动绑定生成的是**眼/嘴/头/身体**参数（`ParamAngleX/Y/Z`、`ParamMouthOpenY`、`ParamEyeOpen`、`ParamBreath`…），**没有自动生成手臂参数**。所以“发言抬手”不能只靠自动绑定：
   - 现在能自动做的是：口型 + 轻微前倾 + 点头 + 表情（已经能读成“在说话”）；
   - 要真正抬手，需要手臂变形器/参数，我后面用 PSD2Live 的 MCP 或 Cubism 试用版补一次（一次性，之后可复用）。

- 导出目标是 Cubism **5.0**（`runtimeTarget: Cubism50`，moc3 v5），和 SDK for Web 5 对齐。
- 想人工检查时，用你的 Cubism 试用版打开导出的 `.cmo3` 即可；不做也行。

---

## 7. 下一步

1. 你按上面清单出 DeepSeek 正面一套（最小 17 张）。
2. 我生成 Layout 清单 → 跑 PSD2Live → 导出 → 接预览页，给你看待机/发言/口型。
3. 效果 OK 后，其它模型重复；每个模型只要一套同规格 PNG。

> 先只做正面：侧/背要另出一套（成本 ×5），等正面跑通再决定。