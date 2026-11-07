# t7 — 去掉 t4 引入的下颚/左颊白亮光晕（保持黑框不复发）

日期：2026-11-08 01:27（build 时间戳 `2026/11/8 1:27:34`）

## 1. 结论

t4 的白亮光晕 **不是 gain / 羽化半径的问题，而是取色源和区域形状两个错误叠加**：

1. **取色源错**：t4 在洞内用「母图色 × gain(≈0.78)」。母图（`assets/build/gemini-parts/matte.png`）是成品整图，
   在下颚/颈带处它的亮度与成品不一致（t3 实测 0.55–0.78 倍），于是一整条浅色带被写进底板。
2. **区域形状错**：填充区被 `face rect` 直接决定，边界就是矩形的四条直边，因此出现「硬边矩形平涂」。

t7 的处理：

* 颜色只在**没有半透明前景（front hair）覆盖**的地方取母图（下颚/颈处母图是深藏青描边与发色，正好是应该有的暗部），
  其余位置继续用底板自身的模糊/最近不透明色——母图**不再**被当作整体颜色源。
* 填充区由「真实 alpha 缺口」决定，face rect 只作为**上界**（`forced &= character`，限制在角色剪影内），
  颜色不再随矩形走；洞内用 2 px 渐入把填充与脸切件自身的边缘色接起来，避免任何硬边。
* **face 切件自身的软边**（下颚 1 px 灰点虚线）改在切件上修：对 `face` 的 alpha 做 1–2 px 形态学闭运算，
  `α≥24` 的 fringe 硬化成 255、闭合出来的空位清零 —— 不再靠底板去盖（captain 要求）。

## 2. 改动（均在 in-scope 路径内）

`assets/_raw/make_layout_manifest_gemini.py`

* `head_base()`：删除母图 × gain 的整体填充；新增
  `exposed = holes & (ref.α>128) & (front_hair.α<20)`，在该区域按 `clip((d_hole-1)/2,0,1)` 渐入用母图色，
  其余洞仍走 `blur → nearest-opaque → 24 轮 5×5 高斯 Jacobi 松弛 → 2 px face 边缘色`。
* `main()`：`face` 切件 alpha 去虚线（见上），只影响 face 一个部件。

重出模命令（PSD2Live 24871）：

```powershell
$env:PSD2LIVE_MCP_ENDPOINT="http://127.0.0.1:24871/mcp"
$env:PSD2LIVE_MCP_TOKEN="<from registry / team note>"
python assets\_raw\gemini_build.py            # grow 0, atlas padding 8, page 4096
Copy-Item assets\build\gemini-layout\gemini.layout.json assets\build\gemini-v1\ -Force
Copy-Item assets\build\gemini-layout\parts\*.png assets\build\gemini-v1\parts\ -Force
Copy-Item assets\build\gemini-v1\* deployed\dsh-roundtable\assets\build\gemini-v1 -Recurse -Force
```

## 3. 验收（captain/verifier 四项）

| 项 | 口径 | 结果 |
|---|---|---|
| 母图真值 face 区缺陷 | <60 / <200 / <600 / <200 | neutral **56**、stage_pose **136**、AngleX−10 **187**、+6/+4 **94** ✅（t4 基线 55/988/2922/1544） |
| 白底/洋红底同姿差分（皮肤区 alpha=0） | =0 | neutral/stage_pose/m10/p6p4 全部 **0** ✅ |
| 竖边 ΔL*（新填 vs 相邻像素，face rect 内） | <3 | 左 med **1.35**、右 med **1.86**（t4：左 64.5 / 右 3.5）✅（个别行 max 52.7/88.5，落在与眼/暗发相接处） |
| 填充区内部 L* std vs 外围 8 px 环 | 同量级 | **16.6 vs 23.9**（t4：11.7 vs 30.4，差 2.6 倍）✅ |
| 6× 下颚灰点虚线 | 无 | 基本消除，残留数枚 1 px 级暗点（1× 不可见） |
| 矩形平涂 | 无 | 6× 图上无直边、无直角、无浅色块 ✅ |

图像证据：

* `preview/_evidence/t4/face_new_neutral_k0379_6x.png`（1:1 渲染 → 真舞台倍率 k=0.379 → 6×）
* `preview/_evidence/t4/face_new_stage_pose_k0379_6x.png`
* `preview/_evidence/t7/stage_dpr3_head_3x.png`（`stage-760.html` DPR3 实拍；该测试台布局与真实舞台不同，仅作参照）

## 4. 交付信息

* build：`assets/build/gemini-v1`，最后写入 **2026-11-08 01:27:34**
* MD5（workspace 与 deployed 完全一致，各 41 文件）：
  * `parts/head_base.png` `cdcb04b7699182313131a123cc780adf`
  * `gemini.layout.4096/texture_00.png` `0d4c0404ad2c7b58015f5a07219fb534`
  * `gemini.layout.moc3` `4a571d63d0314f2771ec126dfa6025fd`（440512 B）
* deployed 已由我同步：`deployed/dsh-roundtable/assets/build/gemini-v1`
* 备份：`assets/build/gemini-v1.bak`（t4 之前的原始构建）、`assets/build/gemini-v1.bak.2026-11-07T2242`

## 5. 已知残留（如实记录）

* 下颚轮廓仍有数枚 1 px 级暗点（face 软边 + 母图深描边被 `clean_rim` 清掉的既有取舍），1× 舞台不可见。
* face 区以外的 head 区统计量（背发-肩、耳-发接缝）随每次重出模 rig 重算而波动，不在本任务口径内。