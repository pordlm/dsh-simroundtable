# Qwen(Q 版)的 Live2D 部件记录

> 2026-11-07 制作。管线 A(同 Gemini/GLM):双参考图母图 → 软 matte → `cut_qwen.py`
> 切 20 件 → `qwen_to_canvas.py` 贴 2048 画布 → `qwen_build.py` → `assets/build/qwen-v1`。

## 1. 素材

| 件 | 路径 | 说明 |
| --- | --- | --- |
| 设定图 | `assets/incoming/qwen-parts/ref-sheet.png` | 1448×1086 |
| 成年图 | `assets/incoming/qwen-parts/ref-adult.jpg` | 3072×5504 |
| **母图(定稿)** | `p0/Chibi-Blue-and-Gold-Royal-Attire__…png` | 1024×1536 平涂 `#00FF00`,ink `(98,74)-(926,1467)` |
| 表情编辑 | `expressions/Closed-Eye-Chibi-Princess-Smile__…png` | 闭眼+张口一张全幅 |
| matte | `assets/build/qwen-parts/matte.png` | `--cpu --res 1024` |

Prompt:`relay-kit/prompts/qwen-p0-master.txt`(双参考图)、`qwen-p1-expressions.txt`。
设计要点:白贝雷帽(白绒边+蓝白徽章)+白色缎带垂饰、浅蓝紫长卷发(头顶编发+肩前长辫)、
金耳环、蓝白汉服式长裙(藏青披帛、金纹、流苏)、白手套交叠(无扇无包)、蓝鞋。

**relay 坑(三次)**:① 首发被「网络传输中断」横幅 reload 吞掉(母图);② 表情编辑首发又吞,
且第二次 `ask --new` 复用了上一条的会话(GLM 表情那条被发了两遍);③ 第三发才落进新会话。
每次发完必须 `relay-conv-json.mjs` 核对 user 消息与附件,补发后确认会话 id 变了。
另外:自动化标签页丢失后 `relay-add-tabs.mjs` 挂的是 `dsh-automation:1`(lane 1),
而 `relay-grab-imagegen.mjs` 只认精确的 `dsh-automation` —— 用完把 window.name 改回
标准名,或统一用 `RELAY_TAB_INDEX`。

## 2. 切件(`assets/_raw/cut_qwen.py`)

20 件:back_hair / front_hair(含头顶编发+肩前长辫+两侧发帘) / headwear(贝雷+缎带+徽章,
耳环不单独设区——耳环区会罩住眼睛,随 sweeper 归 back_hair) / neck / neckwear(立领+盘扣+
宝石扣) / topwear(白衫+上身) / handwear(白手套,**按区收**——手套在阴影里偏灰,white 类
抓不全) / bottomwear(披帛下摆+三层裙,披帛整体归裙子组,静态无独立摆动) /
legwear-l,r(腿是冷调肤色 r-b<0,颜色抓不到,纯按区) / footwear-l,r / face /
eyewhite-l,r / irides-l,r / mouth_close(mouth_arc(526,534,14,2.5) 重画) / mouth_open。

与 GLM/Gemini 的差异:

- **三层蓝同域**:浅蓝紫发(亮,`b-r>45 & b-g>35 & b>175`)、藏青贝雷/披帛/鞋
  (`b-r>28 & b>=100 & r<165`)、亮蓝蝴蝶结(r≥165 排除出 navy)。色类只能粗分,
  叠加几何分区;发帘暗部 (95,95,160) 掉出 hair 类没关系,sweeper 按区兜底。
- **腿是冷调肤色**(216,208,228,r-b=-12):legwear 不能用肤色判据,纯 rect 分区。
- **耳环**:不进 headwear(设区必罩住眼睛);落 sweeper → back_hair(与头发同摆动组,视觉正确)。
- **闭眼烘 face**(同 GLM §2):眼洞用表情图像素回填,无独立闭眼件。
- **虹膜紫=hair 类**:bangs 的 eye_ball 排除区必须含「带内全部紫色块」,
  且 **locks 侧发盒也要排除**——肩前长辫盒(y268-830)整段罩住左虹膜,
  漏排就把虹膜整个叼进 front_hair(闭眼露紫斑的根因)。

## 3. 画布与座位

- 画布映射:`scale=1.3180, dx=349.2, dy=8.5`(INK=(98,74,926,1467),TARGET_H=1836)。
- 座位:与 Gemini/GLM 完全一致(产品 1.7/0/120/182/cut;longtable 1.8/160/244;
  stage-760 1.70/120)。四席截图头线齐平、腰线落桌沿 ✓。

## 4. 出模与验收

`qwen_build.py`(同 glm_build 的传参修复)。moc3 409KB,单页 4096。
probe:开眼 ✓、闭眼自然(弧线+眼睑阴影,无残影)✓、张口 ✓;品红底 holes≥40px=0。
`npm test` 46/46;deployed 已同步 lib + qwen-v1。
