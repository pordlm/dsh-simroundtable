# Live2D 踩坑清单（pitfalls）

按「现象 → 原因 → 修法 → 证据」写。每条都对应项目里真实发生过的一次排查；
想复现就按证据列的文件名/命令跑。流程本身见 `docs/live2d-playbook.md`。

---

## 1. 切件 / 掩码

### 1.1 眼睛被切成「墨镜」——只剩一条横棒加翅膀

- **现象**：睁眼后虹膜不见了，脸上只有一条深色横线和两片飞出去的尖角。
- **原因**：眼睛的深色墨是**一整条包住虹膜的厚杏仁**，不是"上睫毛"。按上缘去截，
  虹膜整个被切掉，剩下的只是杏仁的上下两条边。
- **修法**：眼四件（`eyewhite` / `irides` / `eyelash` / `eye_close`）**共享同一条外轮廓**：
  先求 almond，再按颜色分工。眼珠要转就再单独切一个虹膜盘（`closing(5×5)+fill_holes & almond`）。
- **证据**：`assets/_raw/cut_claude.py` 的 `master_eye()`；`docs/art-requirements-claude.md` §10.2。

### 1.2 给虹膜补上缘 → 画出「护目镜」

- **现象**：眼睛上方多一圈圆弧，像戴了游泳镜，转头时糊到眼皮和脸颊上。
- **原因**：z 序是 `face → eyewhite → irides → eyelash`，虹膜在睫毛下面。把虹膜补成整圆，
  被睫毛盖不住的部分就画到皮肤上。
- **修法**：虹膜**不补上缘**，只沿杏仁内部连通；上缘交给 `eyelash`。
- **证据**：`docs/art-requirements-claude.md` §10.3。

### 1.3 半透明边缘在皮肤上留「苍白光环」

- **现象**：每个部件周围一圈发白的软边，远看像贴纸。
- **原因**：软 alpha 叠在肤色的平涂上，混合出比两侧都亮的过渡带。
- **修法**：alpha 硬切（`clip((a - 0.34) / 0.60)`），导入时再 `alpha >= 128` 二值化；
  需要柔和的地方只在**眼件内部**做 1 px `gaussian_filter`。
- **证据**：`claude_to_canvas.py` 的 `premult_resize()`；§10.4。

### 1.4 部件边缘一圈纯白（不是色溢没做，是重采样）

- **现象**：画布上的件边缘 `(255,255,255)` 且 alpha 也是 255，贴到皮肤上像白描边。
- **原因**：`LANCZOS` 的负瓣让 `rgb > alpha`，反预乘时溢出成纯白。
- **修法**：预乘色先 `np.minimum(rgb, alpha)`，重采样换 `Image.BILINEAR`，反预乘分母下限
  `1/255`，合成后整张画布再 `bleed()`。
- **验收**：`min(rgb) >= 250 且 40 <= alpha < 250` 的像素数必须为 0（`face` 例外）。
- **证据**：提交 `12a0a82`；§10.2b。

### 1.5 `fill_holes` 之后缺口还在

- **现象**：杏仁下缘有两个 V 形豁口，`binary_fill_holes` 报告"0 个洞"。
- **原因**：缺口向下与外部连通，拓扑上不是洞，`fill_holes` 看不见它。
- **修法**：要么 `convexHull` 抹掉凹口（`cv2.convexHull` 要 `pts[:, ::-1]`，否则镜像），
  要么在求 almond 之前先 `dilate` 把缺口糊住。
- **证据**：§16.10；`cut_claude.py` 的 `_hull()`。

### 1.6 逐件 trim 之后五官错位

- **现象**：每件单独看都对，叠起来眼睛偏左、嘴偏上。
- **原因**：每件各自 bbox 裁剪，丢了共同画布坐标。
- **修法**：所有件在**同一张 2048 画布**上按同一 transform 贴，只保存整幅图。

### 1.7 部件之间 1–2 px 的缝，露出底色

- **现象**：耳朵与脸、缎带与裙子之间一条细缝，缩放后变成亮线或绿线。
- **原因**：切件时各件的轮廓来自不同的判据，边界不重合。
- **修法**：保存前非眼嘴件 `binary_dilation(2) & body`（1 px 修耳缝，2 px 才能闭合缎带锯齿）；
  眼、嘴、笑眼列进 `NO_GROW` 不能外扩。
- **证据**：§16.15/§16.16；`NO_GROW = ("eyewhite","irides","eyelash","eye_close","mouth","squint")`。

### 1.8 整块白缎带露出绿底

- **现象**：某段装饰在舞台上变成绿条。
- **原因**：没有任何件认领那块像素（切件判据把它排除了）。
- **修法**：`missing = body & ~cov`，对每块按 `dilate(blob,3)` 外圈的多数票找 owner 归并。
- **证据**：`assets/_raw/audit_coverage.py`；实测 `missing 8461 px`、`patched 6539`。

---

## 2. 颜色判据（单选任何一条都会错）

| 判据 | 会误伤 | 结论 |
| --- | --- | --- |
| 「琥珀色」 | 命中的是头发 12170 px | 先框定眼区再取色 |
| 「白色」 | 皮肤本身是 `(252,238,230)`，眼白 `(253,244,239)` | 用 `(mn>195)&((r-g)<12)` 且必须**按连通性**取整块 |
| `lum <= 175` | 把瞳孔算进睫毛 | 睫毛要按杏仁内、虹膜外的差集 |
| `(b-r) >= 10` | 淡蓝头发算进虹膜 | 加 `sat >= 0.18`（虹膜 0.2–0.4，头发 ≈0.1） |
| `lum < 249 或 sat > 7` 判墨迹 | AI 图的白是 `#f8f8fb`，整幅被判成墨迹 | 用**边框环中位色 + `abs(a-bg).max() > 6`** |
| `white = mn > 230` 加亮度上限 | 丢掉眼白，眼睛缩成虹膜 | 眼白必须整块连通取，不能只取最亮 |

**最稳的做法**：用「睁眼图 vs 闭眼图」的差异块定位眼睛（实测左 `(368,250)-(481,395)` 6718 px、
右 `(532,294)-(657,430)` 6246 px），再在这个框里按颜色分工。

---

## 3. rig / PSD2Live

### 3.1 CLI 吃不了 manifest

- **现象**：`PSD2Live.exe --input x.layout.json` 挂住且不产出。
- **修法**：CLI 只吃 PSD；要 layout/参数/物理控制走 GUI 的 MCP（`http://127.0.0.1:23871/mcp`），
  且**GUI 是服务宿主**，必须 `Start-Process` 起来并确认 23871 在听。

### 3.2 闭眼件常显，遮住睁眼；张口件带来第二条口线

- **现象**：`eye_close` 一直可见（眨眼参数无效），`mouth open` 让闭口也有一道弧（"双层嘴"）。
- **原因**：CLI 版 PSD2Live 不做变体绑定，导出后每层 `switchId: 0`、`parameter: ""`。
- **修法**：从部件表里摘掉这两件，牺牲眨眼/口型（座位尺度眼睛 ~10 px，本来也读不出）；
  要恢复就在 GUI 图层面板手绑变体，或进 Cubism 5.3 加工。
- **证据**：`build_claude_model.py` 的 `CLAUDE_PARTS` 注释；成品 `{layers:21, drawables:22}`。

### 3.3 toggle 语义搞反

- **现象**：睁眼时角色变成闭眼。
- **原因**：PSD2Live 的 toggle 是**参数为 1 时可见**。
- **修法**：闭眼件当普通层，睁眼件绑 `ParamEyeLOpen` / `ParamEyeROpen`；`mouth open` 绑
  `ParamMouthOpenY`（PSD2Live 会把它拆成上下唇 outline + 本体，口线随参数隐藏）。

### 3.4 「头发物理」是空转

- **现象**：`physics3.json` 里明明有 `PhysicsHairBack`，转头时头发却没有一点滞后。
- **原因**：它输出 `ParamHairBack`，而**没有任何变形器消费这个参数**。实测 `HairBack:1` 与
  `HairBack:-1` 的像素差只有 268 px，差异 bbox 落在左上角元信息文字上。
- **修法**：别指望它。给 `ParamHairFront`（真的会动，`diff 50899 px`，但是**剪切式**不是平移）
  在动作里加滞后项，并把动作放慢：摇头 `±8°/4 个来回/900 ms` → `±6°/3 个来回/1150 ms`
  （4.4 Hz → 2.6 Hz），头发跟随后四分之一周期。
- **证据**：`lib/client.js` 的 `STAGE_GESTURES.shake`；`preview/_sk_pair.png` / `_sk_pair2.png`。

### 3.5 图集降不下来

- **现象**：传 `--atlas 1024` 输出还是 `p2l/gpt.4096/`、6 张 4096²、逐字节相同。
- **原因**：`--atlas` 只是**页大小上限**，引擎自己挑；内容放不进 2048 就跳 4096。
- **修法**：唯一杠杆是降画布。2048 → 1024 后页数减半（6 → 3 页 4096），再配 `--atlas 2048`
  才变成 6 页 2048（403 MB → 96 MB 显存）。画质 A/B `mean 1.25 / p99 26 / diff>24 1.1%`。

### 3.6 `WaitForExit` 永久挂住

- **现象**：脚本卡死，但产物已经写好。
- **修法**：不 `WaitForExit`，轮询产物文件；每次构建前 `Get-Process PSD2Live | Stop-Process -Force`。

### 3.7 想用 Cubism 外部 API 做二次加工（未走通）

- WebSocket 22033；开关状态在 `%APPDATA%\Live2D\ExternalApp_user.xml`，**只能由 GUI
  「设置 → 环境设置 → 外部应用程序集成」首次创建**（手写会破坏授权表）。
- UIA 驱动不了 Java 菜单：`SunAwtFrame` 只暴露 6 个元素，`jabswitch /enable` 也不生成注册表键。
- 结论：这条路要么人工点一次开关，要么放弃。

---

## 4. 舞台 / 渲染

### 4.1 `model.height` 读晚了，整座漂移

- **现象**：`faceDx` 生效后模型整体偏了一个身位。
- **原因**：`model.height` 会随 `scale.set()` 变化，先缩放再读高度，`k` 就错了。
- **修法**：`const modelH = model.height;` 必须在 `scale.set(...)` **之前**。

### 4.2 高分屏上舞台发糊

- **修法**：`APP.renderer.resolution = Math.min(3, Math.max(1, s * devicePixelRatio))`
  然后 `resize(STAGE_W, STAGE_H)`；`new PIXI.Application({ autoDensity: true, resolution })`。

### 4.3 每帧 `ReferenceError`，动作看起来"完全没执行"

- **现象**：加了眨眼/动作代码，截图永远不动。
- **原因**：`ticker` 里用了未声明的 `forceGest`，每帧抛错中断；页面照常渲染，所以肉眼无异常。
- **修法**：`window.__errs` 捕获 `error`/`unhandledrejection`，`?debug=1` overlay 每 0.5 s 刷新。

### 4.4 开关写在 `boot()` 里 → 模块级的 `frame()` 静默失效

- **现象**：A/B 只差 13 px（预期上千）。
- **原因**：`frame()` 在模块级，引用了 `boot()` 局部变量，每帧 `ReferenceError`。
- **修法**：这类调试开关一律声明在**模块级**（`const LOOK_OFF = ...`）。修好后 A/B = 1027 px。
- **证据**：`preview/stage-760.html:44` 注释；`docs/art-requirements-claude.md` §31.2。

### 4.5 `dx` 没乘缩放、符号还反了 → 座位空着

- **现象**：卡片在座位上，角色却站在两个座位中间的空档里。
- **原因**：`dx` 的定义是「脸相对画布中线的像素偏移」，必须换成舞台像素且方向相反。
- **修法**：`const faceDx = character.dx ? -character.dx * model.scale.x : 0;`

### 4.6 抱书层与主层共用一块遮罩 → 互相踩

- **修法**：两个 `Live2DModel` 各自建一块 `PIXI.Graphics` 矩形遮罩（`drawRect(-4000,-4000,8000,4000+baseY)`），
  图形本身必须 `addChild` 才会生效。

### 4.7 排了 8 个座位，舞台却是黑的

- **原因**：用 `?only=4,5` 之类跳过前面的座位会改变布局（骨架按 `names` 长度摆位）。
- **修法**：调试参数要连带占位：`?only=0,4,5`。

### 4.8 非抱书座位每 1.5 s 抛 `TypeError: seatCfg.alt is undefined`

- **修法**：`hasAlt = !!(seatCfg.alt && seatCfg.alt.url)` 三态判断，`alt` 一律懒加载，
  `altModel.autoUpdate = visible && !freeze`。

### 4.9 点一下动作按钮就"鬼畜抖动"

- **现象**：点头/摇头/鞠躬像触电一样高频抖动，一帧一个姿势。
- **原因**：动作曲线都按 `u ∈ 0..1` 写（`Math.sin(Math.PI*u)`），但 `preview/claude-showcase.html`
  的 ticker 传进去的是**已过去的毫秒数**：`const off = fx.g.f(t - fx.start)`。
  在毫秒尺度上 `sin(π·u)` 的周期只有 2 ms，于是每帧都是随机相位。
  更坏的是 `?gest=id:0.5` 这种定格也跟着失真 —— 冻结在哪个相位全凭运气，
  所以"截图看起来没问题"完全不能证明时序是对的。
- **修法**：`fx.g.f((t - fx.start) / fx.g.dur)`。`lib/client.js:2197` 与
  `preview/longtable.html:390` 一直是对的，只有 showcase 这一页漏了 `/dur`。
- **验证**：按 60 fps 采样，逐帧最大增量 `nod 0.71° / bow 0.74° / shake 0.84° / tilt 0.52°`
  （脚本 `assets/_raw/_smooth.py`）；定格相位也变得可预测 ——
  `?gest=shake:0.25` 必然是 `turn = 8·sin(0.5π)·sin(0.25π) ≈ 5.7°`，`?gest=bow:0.5` 必然是 `nod = -24°`。
- **教训**：凡是"时间 → 相位"的映射，函数签名里就该写清 `u` 是归一化相位；
  一个页面传毫秒、另一个传比例，是这类 bug 的标准形态。

### 4.10 动作"不明显"：幅度对半砍，而且只有旋转没有低头

`ParamAngleY` 的像素响应（900²、`scale=0.5`、`bg=#ffffff`）：`-11°` 就有 `diff>24 = 39991 px`，
`-18°` 才 `52247 px` —— 也就是说 **-11 已经是"动了"，只是不够"像点头"**，而 -17/-18 仍然远未失真。
一次到位的调法：

- 别按直觉一点点加，直接量像素（-11 → -17 是 1.5 倍，观感差别很大）；
- 只转 `AngleX/AngleY` 读起来像"整个人被转了一下"；点头补 `lean: 1.5`、鞠躬补 `lean: 5`
  才有"身子跟着动"的重量感（`lean` → `ParamBodyAngleY`/`ParamBodyLean`）；
- 摇头的来回次数比幅度更影响观感：`±8°` 两摆 / 1000 ms（≈2 Hz）比 `±6°` 三摆 / 1150 ms
  （≈2.6 Hz）更容易读清，且座位尺寸下不会把侧发甩成两层（§4.8）。

### 4.11 `?gest=id:u` 定格别靠挪 `fx.start`

第一版写 `fx.start = performance.now() - u * fx.g.dur`：无头截图里 `t` 可能被 `?tpin`/`?noidle`
钉成常数、或早就跑过一轮，`t - fx.start` 一减就是随机相位，同一 URL 两次截图能差一整轮动作。
现在用显式的 `fx.frozen = u`，帧循环里 `fx.g.f(fx.frozen != null ? fx.frozen : (t - fx.start) / fx.g.dur)`，
并且 `fx.frozen != null` 时跳过"到点自动清空"，定格才是真的定格。

---

## 5. 验收与测量（最容易被数字骗的地方）

| 现象 | 真相 | 正确做法 |
| --- | --- | --- |
| `?noeye=1` 后眼睛看起来半睁 | 关掉 `eyeBlink` 后没人再写 `ParamEyeLOpen`，参数停在默认值 | ticker 里 `setParameterValueById('ParamEyeLOpen', 1)` 钉住 |
| `?freeze=1` 下像素差恒为 0 | `freeze` 让 ticker 首行 `return`，参数一个都没写 | 用 `?still=1`（冻结时间但照常写参数） |
| 同 URL 连拍两张差 33184 px | 场景有随机微尘/气泡/随机动作 | 无头截图**不能**做像素级 A/B，微妙改动读 HUD 数字 |
| 姿态审计全绿 | 没喂图时脚本打印 `0/0` | 必须把渲染图当参数传 |
| 姿态审计全红（green 2660–7391） | probe 默认绿底，半透明件与绿混合造出假绿 | `&bg=%23ffffff` 重渲，实测 `green=0` |
| `?raw=1` 下按画布坐标找不到嘴 | 渲染视口与画布坐标不是一回事（嘴真在 `(1005,575)-(1050,617)`） | `np.abs(b-a).max(axis=2)>18` + `ndimage.label` 取最大连通块 |
| 测 `look` 动作只有 3 px | 目标座位恰好是 `activeIndex`，走了发言支 | 换座位测，或 `?speak=<seat>` 让它自己发言（1394 px） |
| 摇头在 `u=0.5` 几乎没位移 | 正弦正好过零（114 px） | 采样别的相位（`u=0.15` → 841 px） |
| `--virtual-time-budget` 跑不出长时行为 | 它不推进 `performance.now()` | 把函数 slice 出来，喂合成时钟步进（`assets/_raw/_blinktest.mjs`） |
| `?n=6` / `?n=8` 截图必挂 | 多模型 + 大图集把无头拖过工具超时 | `?only=0,4,5` / `?names=` |
| `--dump-dom` 产出 0 字节 | 同步阻塞把工具挂住 | `cmd /c start /b "" msedge.exe ... > out.html` 分离启动，下次调用轮询大小 |

---

## 6. 工具本身（PowerShell / Python / 截图）

1. **`pwsh` 工具不可用**：沙箱 ACL 失败（`SetNamedSecurityInfoW ... Win32 5`）→ 全部走
   `mcp__windows__PowerShell`。
2. **`[IO.File]::WriteAllText` 改 HTML 静默不生效**：exit=0、`Select-String` 还是旧文本。
   改文件一律用 `edit` 工具。
3. **`python -c @"…"@` 里嵌三引号脚本静默不执行**：exit=0、无输出、文件没变。
   写成 `assets/_raw/*.py` 再 `python 文件`；或 `@'...'@ | Set-Content -Encoding UTF8`。
4. **`python - <<'PY'` 在 PowerShell 报"重定向运算符后缺少文件规范"**。
5. **`np.int16` 求 `lum = r*299 + g*587 + b*114` 溢出变负**（76245 > 32767）→ 用 `int32`。
6. **本地脚本别命名 `inspect.py`**（遮蔽标准库，import 自己）。
7. **PSD 图层名用中文会 `UnicodeEncodeError`**（MacRoman 编码）→ 图层名一律英文。
8. **`shot.ps1` 常工具超时但文件已写出**：先 `Test-Path`/`Length` 再决定是否重跑；
   挂死时按 `CommandLine -like '*edge-gpt*'` 杀 msedge 再删 `%TEMP%\edge-gpt`。
9. **`Start-Process -RedirectStandardOutput` 会把 pwsh 挂住**：用 `cmd /c start /b`。
10. **一次 PowerShell 调用只跑一个截图**（工具硬超时 170–200 s），`Start-Job` 拿不到文件。

### 3.8 覆盖件叫 `mouth xxx` 会被「说话嘴」系统收走

症状：加了一件平嘴覆盖件、manifest 里写了 `variant: {type:"toggle", parameter:"ParamMouthForm"}`，
但 probe 里 `ParamMouthForm:0` 与 `:1` 只差 21 px（且 bbox 在左上角元信息文字上）。

原因：PSD2Live 的 `RigBuilder` **先按层名归类**，名字含 `mouth` 就进说话嘴系统，
被拆成 `xxx / Upper lip outline` / `Lower lip outline`，并绑到 `ParamMouthOpenY`
而不是你写的 `variant`。`tags: ["objects"]` 也救不了（tags 在归类之后）。

修法：改**显示名**（`"pensive line"`），文件名可保留 `mouth_flat`。修完
`workspace_overview` 的 `layers` 从 29 降到 27（少两个唇轮廓），`ParamMouthForm`
0/1 差 337 px 且 bbox 落在嘴部。见 `docs/art-requirements-claude.md` §36.3。

### 3.9 形态类描线别用「两端收细的多边形」

症状：4× 放大下，一条平嘴线的右端裂成两股细尾巴。

原因：多边形在两端把厚度收到 1 px 以下，`SS=4` 超采样再 LANCZOS 缩回时半透明边缘
被振铃撕开。加大补丁 alpha 的 `dilate` 没用 —— 分叉是线自己。

修法：`draw.line(width=w*SS, joint="curve")` + 两端 `draw.ellipse(r=w*SS/2)` 圆头，
宽度恒定；要「中间厚两端薄」的观感就整体调 `w`，不要逐点算宽度。见 §36.2。

### 3.10 出图只取件，别换整张：重画会挪动所有线

让模型「只改一个部位」时，它往往整张重画一遍：同一个人、同一个姿势，`diff>24`
仍然有 5 万多像素（`assets/incoming/claude-parts/mouthgen2/` 那次是 53859 px，
线稿整体位移 1–2 px）。所以：

- **不要**把出图结果当新母图用（除非你要的就是重画）；
- **要**从出图里只裁需要的那一件，再按画布坐标贴回原母图的切件体系；
- 判断「取件源够不够清楚」看它比成品大多少倍：源图里那只嘴只有 30 px 宽，成品要
  42 px，先用 8× 放大再降采样才不糊；如果有更清楚的特写（嘴占 300 px）当然更好。
- 出图常在唇线外留一圈 1 px 奶白发光，按肤色差抠图会保下来 → 在源分辨率上
  `grey_erosion(alpha,(2,2))` 削掉 1 px。

### 3.11 第三个 `mouth_*` 件会被静默丢掉

`parts/` 里同时放 `mouth_close.png`、`mouth_mid.png`、`mouth_open.png`，PSD2Live 不会报错，
但 `psd2live.json` 里只有 `mouth close`（preset）与 `mouth open`（toggle，
`ParamMouthOpenY`，`switchId 0`）两条 —— **`mouth_mid` 整层消失**，参数还是二值。
判断方法：构建前后数 `psd2live.json` 里 `tag` 以 `mouth` 开头的条目数，或直接看
`ParamMouthOpenY` 在 probe 里的 0/0.35/0.7/1 是否只有两种画面。
要三态只能上 Cubism 手加开关；在 PSD2Live 里就把中间态交给两件的交叉淡化。见 §38.3。


### 4.12 座位偏移 dy 写死舞台像素：换席位数全身像沉进桌子

- **现象**：长桌台 8 席时 Claude 只剩头露在桌沿上，待机点头/转头全打在一颗头上，
  读作「鬼畜抖动」；6 席与展示台一切正常。
- **原因**：`preview/longtable.html` 的 `MODELS.Claude.dy=160` 是在 **6 席
  （charH≈244）** 下调好的舞台像素偏移；座位数变 → charH 变 → 模型可见高度线性缩放，
  固定 dy 不缩。8 席 charH≈193，模型整体下沉 33px，腰线掉到桌沿下 34px。
  `names` 参数在这个页面根本不存在（NAMES 写死，`?n=3` 取前三个全是鲸鱼娘），
  所以「n=3 正常」的对照其实从未加载过 Claude。
- **修法**：每个模型记一个 `dyCharH`（调参时的 charH），落位时
  `baseY = BASE_Y + dy * (charH / dyCharH)`。Claude 244、GPT 182（§11 在 8 席调的 -25）。
  调参档位行为逐字节不变。抱书 alt 用 `s.baseY`，自动跟随。
- **教训**：所有「按眼距/腰线对齐调出来的像素偏移」都是 k 的线性函数——k 变，
  偏移必须等比变。产品页 `lib/client.js` 的 `dy = 1056k − 39` 是运行时算的，没这个坑；
  只有 longtable.html 把结果写死了。

### 3.12 relay 逐件出图：消息会被「横幅 reload」吞掉，且 `--new` 会复用旧会话

症状：`ask --new` 返回了 CHAT 地址，但该会话里根本没有这条 user 消息
（Grok 14 件里被吞 3 条；face 补发一次又被吞、还复用了 objects 的会话）。

修法：**每发一条立刻 `relay-conv-json.mjs` 核对**（消息字数/关键词 + imagegen 是否
已开跑）；补发后再核对一次，不在新会话就再补。核对要读它落盘的
`.tmp/conv-*.json` 全文——摘要输出只有 `str(字数)`，grep 不到正文关键词。
批量发送按 ~8 分钟/条估时（站点卡时），图在服务端并行生成，发送完统一收割。
（详见 `docs/art-requirements-grok.md` §2）

### 3.13 relay 重绘的 face/front_hair 与邻件漂 2–3px：接缝露黑底

症状：管线 B 合成后发际线、下颌出现黑色楔形（透明洞），眨眼时眼睛周围也露底。

原因：每件都是整图重画，位置/比例各漂一点点；逐件 PNG 之间没有互相重叠兜底。

修法：**face 件不用 relay 的**——用母图头部区域（绿键 ∩ 头部椭圆）做底版
（`cut_eyes_grok.py` 的 head_base），与母图切的眼件同源对齐；洞用
「almond ∪ |expr-master| diff ∪ 嘴件」外扩 5px，最近邻填肤 + σ3/σ9 双高斯混合。
重绘的刘海若压住眼睛（座位尺度脸读不出来），把母图眼位外扩 8px 从
front_hair 的 alpha 里减掉。

### 3.14 闭眼弧用 |expr−master| diff 切，不要按颜色切

症状：按「深色像素」切表达式图的闭眼弧，biggest blob 选中了蝙蝠翼发饰/领口描线。

原因：表达式图整张重绘（diff 全图几万像素），但**未改动的区域 diff≈0**——
发饰、衣领在两张图里逐像素一致，diff 法天然排除它们；颜色法则分不开
（发饰、睫毛、领线都是深色）。

修法：`dif = |master−expr| > 40` ∩ 眼部宽 band → biggest 即闭眼弧。
**band 必须完整罩住虹膜+弧线**：Grok 的 band x0 曾把虹膜左半切在外面，
眨眼时残留一条蓝色竖条；band 下沿碰到领口线则会选中领线（闭嘴线同理）。

### 6.4 这台机器的 CUDA OOM 是假的（WDDM 显存承诺）

症状：`nvidia-smi`/torch 报 7–9 GB free，BiRefNet 分配 144–878 MB 仍
`OutOfMemoryError`；`CUDA_VISIBLE_DEVICES=''` 在这台 torch 上不生效
（照走 CUDA）；CPU 跑 res 2048 段错误。

修法：`make_matte.py` 加了 `--cpu` 开关，**`--cpu --res 1024` 是可靠组合**
（19s，质量足够）；改过源图后重跑记得 `--force`（缓存按 mtime）。

### 4.13 「按腰线落桌沿」公式算出的 dy 不如直接对齐已验收角色

症状：Gemini 初版按 `dy = waistAboveBoot·k − 39` 算出 80，台上胸口露出量比
Claude 少，读作坐姿不对（用户："坐太高了，下移一点和 claude 一样"——实际是
露出量少了显得不对劲）。

教训：同一画布规格（2048、ink 高 1836）的全身 Q 版，**座位数值直接抄已验收
角色的**（Claude/Gemini/Grok 统一 `1.7/120/dyCharH 182`）；公式只用于首版粗估。
