# 第 2 轮黑框/黑缝交付（t5）

审计口径沿用 `preview/_diag/_audit/`（t1），全部数字来自
`preview/_diag/_audit/out/audit.json`（2026-11-09 08:09:44，`--chars all --poses neutral,stage_pose`）。
每个角色都先备份到 `assets/build/<name>-v1.bak`（旧坏基线），再改脚本重跑 cut → to_canvas → manifest →
PSD2Live 出模 → 审计。

## 1. 根因与修法（为什么不是「在 Cubism 里糊一下」就完）

| 根因 | 证据 | 修法 | 落在哪一层 |
|---|---|---|---|
| 各部件**单独重采样**后无法互相让位，脸/发、发/头饰交界留 1–2 px 透明线；深色舞台上就是黑虚线环 | t3 静态合成复现 GLM 1422 px/78 域 ≈ 渲染 1619 px；我在 layout 合成的中性帧同样复现 | 每件 alpha 十字膨胀 2 px 并沿用最近不透明色（`canvas_overlap.overlap`） | 映射层（`*_to_canvas.py`） |
| 切件 sweeper 的 rect 右边界（GLM 760/780、Qwen 820）比母图 ink 右缘（904/926）窄 → 右侧被切成一条全高直线 | matte↔union 残差 right −172/−141 px；`_probe_layout_seams.py` 显示母图右缘仍有 7 万+ 实心像素未被任何件认领 | 扩分区到 ink 右缘 + 逐件「最近件归属」最终覆盖扫描，断言 `0 body px unclaimed` | 切件层（`cut_glm.py` / `cut_qwen.py`） |
| layout 缩放用了 Gemini 的 ink（`--ink` 漏传）→ 头板色参考错位 | 母图比成品宽 172/141 px | `glm_build.py` / `qwen_build.py` 显式传本角色 `--ink` | 出模层 |
| face 的 closing 新增像素 `alpha=0`（`soft=m2&~hard` 后写 0），闭运算等于白补 | t3 指出的 `make_layout_manifest_gemini.py:365-372` | 新增像素用最近不透明 RGB 填充并把 alpha 置 255 | manifest 层 |
| 豆包双手整块缺失 | `cut_dounai.py:304` 产出 `handwear-l/-r`，而 LAYERS 只读 `handwear.png` | LAYERS 改 split=True，并加「-l/-r 都缺则回退单件」（兼容单件角色） | manifest 层 |

**一个反直觉的结论**：`atlas_set_budget(padding=8)` 只治纹理采样，**治不了部件之间的几何缝**。
GLM 用 padding 8 + grow 0 重建后右侧裁切线消失、matte 残差回到 ±1，但 truth 仍 1416/60、holes 1259/27；
真正的开关是部件重叠（overlap 2 px）：同样资产 holes 一次降到 17、truth 20。

## 2. before / after（neutral / stage_pose，1:1，px）

| rig | truth neutral | holes neutral | truth stage | holes stage | 判定 |
|---|---|---|---|---|---|
| glm | n/a（残差 −172） → **20** | 1619/79 → **17** | 8481 → **75** | 102 → **35** | **PASS** |
| qwen | n/a（残差 −141） → **0** | 1078/55 → **0** | 4585 → **0** | 58 → **0** | **PASS** |
| dounai | 165 → **23** | 66 → **13** | 6326 → 4974 | 290 → **75** | neutral PASS；stage 见 §3 |
| kimi | 110 → **35** | 1419 → 1150（真实 0） | 158 → **71** | — → 67 | 见 §3 |
| mimo | 98 → **5** | 2585 → 2137（真实 0） | 3425 → 458 | — → 2558（真实 0） | 见 §3 |
| minimax | 266 → **27** | 389 → **98** | 693 → 828 | — → 240（真实 0） | neutral PASS；stage 见 §3 |
| kimi-prop | 85 → **16** | 1356 → 1121（真实 0） | — → **50** | — → 42 | 见 §3 |
| mimo-prop | — → **0** | 2313 → 1884（真实 0） | — → 317 | — → 2143（真实 0） | 见 §3 |
| minimax-prop | 256 → **27** | 380 → **94** | — → 750 | — → 190（真实 0） | 见 §3 |

matte↔union 残差：glm −3/−3/−1/−1、qwen −1/−4/+2/+1、dounai −4/−3/+5/+2、kimi −2/−4/+1/+3、
mimo −4/−5/+5/+3、minimax +0/−4/+1/+4 —— 全部 ≤8 px，truth 判据因此重新可用（此前 glm/qwen 是 n/a）。
`seam`（舞台暗像素）全部 0–6 px / 最大域 ≤2，远低于 20/10 的闸门。
9 张 6× 裁图：`preview/_evidence/audit/<name>_zoom6x.png`（08:11 重新生成）。

## 3. 三个必须说清的边界（不是「已通过」）

1. **stage_pose 的 truth 是位移假阳性。** stage_pose = AngleX −6 / AngleY −3 / BodyAngleX −2.3 /
   HairFront −0.118 / Breath 1。母图是中性姿态的静物，大头 Q 版被推走十几像素后，旧轮廓整圈都会「母图不透明、
   渲染透明」。用 `preview/_diag/_shift_test.py` 对母图做 ±48 px 平移搜索证明：
   dounai 4974 → **101**（dx −12, dy −12，去掉 98%）、minimax 828 → **19**（−8/−12，98%）、
   mimo 458 → **62**（−8/−8，86%）、kimi 71 → **2**；而中性姿态下最优点就是 (0,0)（dounai/minimax 去掉 0%）。
   即：这些数字测的是姿态位移，不是部件缝。
2. **hair 之间的负空间不是洞。** kimi/mimo 的 1100–2100 px「封闭洞」几乎全落在母图本就透明的位置
   （发丝交叉的空气）。`preview/_diag/_holes_exempt.py` 用 metrics.holes 自带的 `ref_a/exempt_below=128`
   重算：**kimi/mimo/kimi-prop/mimo-prop/minimax/minimax-prop 的真实洞全部为 0 px**。
   `run_audit.py:101` 调的是 `M.holes(rgba, win)`，没把母图 alpha 传进去，所以表里的 raw 数字偏大 ——
   建议 t1 把 `M.holes(rgba, win, ref_a=ref, exempt_below=128)` 打开（判定会更严而不是更松：母图不透明的缝照算）。
   按 captain 的「MiMo 两域严禁填」，我没有去填这些负空间。
3. 豆包的双手现在在 layout / 图集 / 渲染里都存在（`handwear-l` 613,1324 181×275；`handwear-r` 1252,1324 185×275，
   `view_render_model` 单层渲染确认）；neutral truth 165 → 23。

## 4. 复跑方式

```powershell
$py = "C:\dev\python 3.12.0\python.exe"
$env:PSD2LIVE_MCP_ENDPOINT = "http://127.0.0.1:24871/mcp"   # 默认 23871 是错的
$env:PSD2LIVE_MCP_TOKEN    = (Get-Content assets\_raw\.psd2live-mcp-token -Raw).Trim()

& $py assets\_raw\cut_glm.py                       # 切件（只有 glm/qwen 改了）
& $py assets\_raw\glm_to_canvas.py --overlap 2     # 映射 + 2 px 重叠
& $py assets\_raw\glm_build.py                     # manifest + 出模（脚本内已带 --ink / padding 8）
Copy-Item -Recurse -Force assets\build\glm-layout\parts assets\build\glm-v1\parts
Copy-Item -Force assets\build\glm-layout\glm.layout.json assets\build\glm-v1\

& $py preview\_diag\_audit\run_audit.py --chars glm --poses neutral,stage_pose
& $py preview\_diag\_holes_exempt.py --chars glm          # 带母图豁免的洞数
& $py preview\_diag\_shift_test.py --chars glm            # 位移假阳性检验
```

## 5. 改了哪些文件

脚本（`assets/_raw/`）：`canvas_overlap.py`（新）、`glm_to_canvas.py`、`qwen_to_canvas.py`、`dounai_to_canvas.py`、
`kimi_to_canvas.py`、`mimo_to_canvas.py`、`minimax_to_canvas.py`、`kimi_prop_to_canvas.py`、`mimo_prop_to_canvas.py`、
`minimax_prop_to_canvas.py`、`cut_glm.py`、`cut_qwen.py`、`make_layout_manifest_gemini.py`、`glm_build.py`、`qwen_build.py`。

资产：`assets/build/{glm,qwen,kimi,mimo,minimax,dounai,kimi-prop,mimo-prop,minimax-prop}-v1` 全部重出
（含 `parts/` 与 `<name>.layout.json`，供审计找 head base），旧件留在同名 `.bak`。