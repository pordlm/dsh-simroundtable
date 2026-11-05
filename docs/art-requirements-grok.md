# Grok(Q 版)的 Live2D 部件记录

> 2026-11-05/06 制作。走**管线 B(逐件源图,GPT 路线)**——金发/金饰/肤色三色同域、
> 巨斧与全身交叉,管线 A 的几何切件不可行。气质要求(用户原话):媚态、直白大方,
> 姿势带成年图的大斧。

## 1. 素材

| 件 | 路径 |
| --- | --- |
| 设定图 / 成年图 | `assets/incoming/grok-parts/ref-sheet.png` / `ref-adult.jpg` |
| **母图(定稿)** | `p0/Chibi-Demon-Queen-with-Ornate-Battle-Axe__….png` 1024×1536 平涂 `#00FF00`,ink `(26,44)-(1006,1508)`(右缘留绿仅 17px,未切到) |
| 表情编辑 | `expressions/Smug-Closed-Eye-Demon-Lady-with-Ornate-Axe__….png` 闭眼+闭嘴一张全幅 |
| 逐件源图 | `src/<stem>.png`(master.png = 母图拷贝,prep 的变换基准) |
| matte | `assets/build/grok-parts/matte.png`(CPU res 1024;最终管线未用,绿键即可) |

Prompt:`relay-kit/prompts/grok-p0-master.txt`(双参考图+斧头姿势)、
`grok-p1-expressions.txt`、`grok-part-<stem>.txt` ×14。

**母图姿势设计**:斧扛右肩(画面左), shaft 落地,右手握杆,左手自然下垂——
斧= `objects` 件,握杆手= `handwear-r`(指缝间的杆像素留给 objects,z 序 objects < handwear)。
母图嘴天然是张口虎牙笑 → **直接当 `mouth_open`**,表情编辑只做「闭眼+闭嘴」。

## 2. 逐件出图(14 次 relay ask)

back_hair / front_hair / headwear / wings / face / neck / neckwear / topwear /
handwear-r(握斧臂)/ handwear-l / objects(斧)/ bottomwear / legwear(双腿一张,
prep 里按画布中线拆 l/r)/ footwear(同)。

实战坑(全部踩过):

- **消息被吞**:14 发里 3 条(headwear/face/topwear)被横幅 reload 吞掉,重发后
  face 又被吞一次、还复用了 objects 的会话——**每次发完必须 conv-json 核对,
  补发时确认进了新会话**。
- 发送速率 ~8 分钟/条(站点卡),14 条约 1.5h;图在服务端并行生成,发送完统一收割。

## 3. 本地管线

```
prep_parts_grok.py   # 绿键+despill+硬alpha,变换:ink 高 1466→1836(s=1.2524),
                     # dx=377.1, dy=52.1(TOP=106,同 Claude/Gemini 惯例)
cut_eyes_grok.py     # 眼/嘴本地件 + head_base(见下)+ front_hair 挖眼窝
fix_parts_grok.py    # (被 head_base 方案取代,留档)
```

- **face 件不用 relay 的**:重绘 face 与重绘 front_hair 各漂 2-3px,发际线/下颌露黑底。
  face = **母图头部区域**(绿键 ∩ 头部椭圆 (385,175)-(725,665)),与眼件同源对齐;
  眼窝+嘴用「almond ∪ |expr-master| diff ∪ 嘴件」外扩 5px 做洞,最近邻填肤+双高斯混合。
- **`|expr-master| diff` 是切闭眼弧的唯一可靠方法**:颜色法会把蝙蝠翼发饰当成弧
  (表达式图重绘,未动区域自动 diff≈0 被排除)。
- **虹膜左右边界**:band 的 x0 一度把虹膜左半(x 617-640)切在外面 → 眨眼残留蓝色竖条。
  band 必须完整罩住虹膜(MASTER_BAND r x0=610)。
- **闭嘴线 band 下沿**不要碰到领口描线(y≥630),否则 biggest blob 选中的是领线。
- **重绘刘海压眼**:front_hair 重绘的刘海比母图低,座位尺度直接盖住眼睛 →
  从 front_hair 件里减掉「母图眼位外扩 8px」的区域(cut_eyes_grok.py 末尾)。
- 眼件照旧:eyewhite=almond(母图艺术),irides=蓝虹膜圆盘,均绑 ParamEye[LR]Open toggle。

## 4. 出模与座位

`grok_build.py`(manifest 24 层 → PSD2Live MCP;首次 import 报 "lists 1..4096 layers"
为暂时性失败,重试即过)。moc3 630KB,单页 4096,Groups 带 EyeBlink/LipSync。

座位:与 Claude/Gemini 完全一致 —— 产品 `scale 1.7, dx 0, dy 120, dyCharH 182, cut`;
longtable `1.8/160/dyCharH 244`;stage-760 `1.70/120`(该页无 dyCharH 缩放,n=8 是近似)。
三方 n=3 截图:Grok/Claude/Gemini 头线齐平、腰线落桌沿 ✓。
注:stage-760 的 8 席 NAMES 里没有 Grok(仍是 Doubao),验证时临时替换。

## 5. 验收(2026-11-06)

- probe:基础态 ✓;`ParamEye[LR]Open=0` 双眼闭合无残留(品红底无破洞)✓;
  `ParamMouthOpenY=1` 张口虎牙 ✓;静止态为闭口媚笑(mouth_close)、说话时切张口虎牙。
- 合成校验(canvas 空间):发际线/下颌无黑楔,眼件与 face 同源对齐。
- `npm test` 46/46;deployed 副本已同步 lib + grok-v1。
