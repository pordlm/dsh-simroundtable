# Gemini(Q 版)的 Live2D 部件记录

> 2026-11-05/06 制作。走**管线 A**(单张母图切件,同小 Claude):中转站出母图 →
> BiRefNet 软 matte → `cut_gemini.py` 切 23 件 → `gemini_to_canvas.py` 贴 2048 画布 →
> `gemini_build.py`(PSD2Live GUI+MCP)→ `assets/build/gemini-v1`。
> 母图 v2 是按用户要求**同时附设定图 + 成年图**重出的(成年图定风格,设定图定设计)。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/gemini-parts/ref-sheet.png` | 1448×1086,用户提供 |
| 成年图 | `assets/incoming/gemini-parts/ref-adult.jpg` | 3072×5504,用户上传 |
| 母图 v1(弃) | `p0/Gemini-Chibi-Starcat-Idol__…png` | 风格偏硬,用户否 |
| **母图 v2(定稿)** | `p0-v2/Chibi-Gemini-Star-Idol__…png` | 1024×1536 平涂 `#00FF00`,ink `(91,30)-(932,1487)` |
| 表情编辑 | `expressions-v2/Closed-Eye-Starry-Cat-Girl__…png` | 闭眼+张口**一张全幅编辑**同时拿(两处互不重叠) |
| matte | `assets/build/gemini-parts/matte.png` | BiRefNet_HR,**CPU** `--res 1024`(见 §5) |

出图 prompt 存 `relay-kit/prompts/gemini-p0-master.txt`、`gemini-p1-expressions.txt`。
用户铁律补充:**出图必须同时附 adult 原图 + 设定图**,只给设定图风格会跑偏。

## 2. 切件(`assets/_raw/cut_gemini.py`)

23 件:back_hair / tail / legwear-l,r / footwear-l,r / bottomwear / neck / topwear /
handwear(单件,双臂+交叠手) / face / eye_close-l,r / eyewhite-l,r / irides-l,r /
mouth_close / mouth_open / neckwear / ears / front_hair / headwear。

要点(与 Claude 切件的差异):

- **配色类**:`hair = (b-g>35 & b>150 & mx>130) | (r-g>55 & b>150 & r>180)`;
  `skin` 用 `r-b>22` 挡掉白色护腿(r-b≈12)。
- **星星饰件不进 headwear**:大星星压在头发/耳朵上,色类拆不干净 → 归 `front_hair`
  (跟头动,行为正确);headwear 只留白色花饰/金链(white|gold ∩ 小框)。
- **挂坠+金链**归 `front_hair` 的 locks 框(它们从发髻垂下,与侧发同摇摆组)。
- **tail 与 bottomwear 互斥坑**:tail_raw 用 `fill()` 会把整块海军蓝缎带当「洞」吞掉,
  再和 bottomwear 互相 `~` 排除 → 缎带区全裸露。修法:tail_raw 只 `closing(3)` 不 fill,
  bottomwear 的 `~tail_raw` 保留,tail 最后 `~bottomwear`。
- **清扫器(sweeper)**:全部部件算完后,把 `body & ~green & ~claimed` 的剩余艺术像素
  按区域兜底分给 back_hair(头区)/ topwear(躯干)/ bottomwear+legwear(裙/腿)/
  tail(右下),`clean(min_px=8)`。管线 A 的散碎漏片(眼影紫、裙子阴影)一次清零。
- **face 封洞**:`fill_holes` 封不住眼洞(洞从刘海跨出椭圆边界是**开放洞**),眨眼时
  eyewhite 一隐藏就透出页面白底。必须 `face_final |= (holes & face_ell)` 强制封。
- **face 修补不能用 INPAINT_TELEA**:Gemini 眼睛的高光很大,TELEA 把白色抹满眼眶,
  闭眼时露出白斑。改**最近邻肤色填充 + σ3/σ9 双高斯混合**(只糊洞内)。
- **mouth_close** 是重画的弧(`mouth_arc`,中线 x=515, y=509, half=16):母图原 dash
  30×4px,座位尺寸下不可见,同 Claude smile_arc 的处理。

## 3. 画布与座位

- 画布映射:`scale=1.2601, dx=379.4, dy=68.2`(INK=(91,30,932,1487), TARGET_H=1836,
  同 Claude 按高度映射)。
- **座位 dy 与 Claude 不同**:Gemini 三头身的裙腰在画布上比 Claude 低 ~266px
  (Claude 腰上距 1056,Gemini 只有 790)。`dy = 790k − 39`:
  - 产品 `lib/client.js`:`scale 1.7, dx 0, dy 80, dyCharH 182, cut true`;
  - `preview/longtable.html`:`scale 1.8, dy 160, dyCharH 244`(Claude 数值起步,
    8 席截图已验证;charH 变化时按 dyCharH 等比缩放);
  - `preview/stage-760.html`:`scale 1.70, dy 80`(该页 dy 不随席位缩放,n=3 是产品几何)。

## 4. 出模

`gemini_build.py`:make_layout_manifest_gemini.py → PSD2Live MCP import → rig_generate →
physics(EyeJelly off / HairBack 0.60-0.45-0.70-1.4 / HairFront off,同 Claude v3)→
export `assets/build/gemini-v1`。moc3 441KB,单页 4096 纹理,Groups 带 EyeBlink/LipSync。
`warn: Duplicate layer names` 是 l/r 层对的正常提示。

## 5. 环境坑(本轮新踩)

- **`.venv-matte` 的 CUDA OOM 是假的**:nvidia-smi 报 7-9GB free,`deform_conv2d` 分配
  144MB 都失败(WDDM 显存承诺被浏览器等占着)。`CUDA_VISIBLE_DEVICES=''` 在这台
  torch 上不生效(照走 CUDA),CPU 2048 会段错误 → `make_matte.py` 加了 `--cpu` 开关,
  **`--cpu --res 1024` 是当前可靠组合**(19s,质量足够)。
- **改过 matte 之后重跑必须 `--force`**:缓存按 mtime 判断,`--out` 比源新就跳过。
- 覆盖件/联图坑同 pitfalls §3.8-§3.11,本次没有新增 mouth 件类问题。

## 6. 验收记录(2026-11-06)

- probe 1:1:默认态整身正确;`ParamEyeLOpen/R=0` 闭眼(封洞+弧线)✓;
  `ParamMouthOpenY=1` 张口 ✓;品红底无透洞。
- 合成校验 `_gem_check.py`:diff>28 = 1.08%(含刻意替换的嘴),清扫器后无成片漏片。
- stage-760 n=3(产品几何)与 longtable 8 席截图:腰线落桌沿,头宽与鲸鱼娘/Claude 相称。
- `npm test` 46/46。
