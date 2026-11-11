# 第 2 轮最终审计表（t9）

数据：`preview/_diag/_audit/out/audit.json`（2026-11-10 00:35:37）　取图：1:1 `renderer.extract` 带 alpha，2048²，**没有用缩放截图**。

## 判据

| 项 | 判据 | 实现 |
|---|---|---|
| neutral 封闭洞（豁免后） | < 200 px² | `metrics.holes(..., ref_a=母图 alpha, exempt_below=128)` |
| neutral 母图真值缺口 | < 60 px² | `metrics.truth_defect` |
| stage_pose 残差 | < 中性帧 × 1.10（且 ≥200） | `metrics.aligned_truth`（±16 px 最优平移后计数） |
| 竖边 ΔL* | < 3 | `metrics.fill_boundary_edges`（新板 vs 修复前板） |

## 表

| rig | neutral 封闭洞（豁免后） | neutral raw（同 build，未豁免） | t2 pass-1 raw（旧 build） | stage_pose 残差 | ΔL* | 结论 |
|---|---|---|---|---|---|---|
| `gemini` | 39 px | 39 px | 56 | 136 / 200 | 0.94 | **PASS** |
| `dounai` | 5 px（13） | 13 px | 66 | 91 / 200 | n/a（无参考板） | **PASS** |
| `glm` | 17 px | 17 px | 1619 | 75 / 200 | n/a（无参考板） | **PASS** |
| `qwen` | 0 px | 0 px | 1078 | 0 / 200 | n/a（无参考板） | **PASS** |
| `kimi` | 69 px（1150） | 1150 px | 1419 | 2 / 200 | n/a（无参考板） | **PASS** |
| `kimi-prop` | 69 px（1121） | 1121 px | 1356 | 2 / 200 | n/a（无参考板） | **PASS** |
| `mimo` | 4 px（2137） | 2137 px | 2585 | 45 / 200 | n/a（无参考板） | **PASS** |
| `mimo-prop` | 0 px（1884） | 1884 px | 2313 | 1 / 200 | n/a（无参考板） | **PASS** |
| `minimax` | 5 px（98） | 98 px | 389 | 13 / 200 | n/a（无参考板） | **PASS** |
| `minimax-prop` | 5 px（94） | 94 px | 380 | 19 / 200 | n/a（无参考板） | **PASS** |

## 口径变更（相对 t1/t2 首轮）

1. **封闭洞打开母图豁免**：`alpha < 128/255` 的像素（母图本来就透明的发丝↔身体负空间）不计入洞；域内豁免后 <4 px 的整块剔除。`ref_a` 是 0..1，阈值必须写 `128/255` —— 写成 `128` 会豁免掉全部像素，`_holes_exempt.py` 早先打印的「kimi 0 / mimo 0」就是踩了这个单位坑；本轮在 `metrics.holes` 里做了归一化（>1 视为 0..255），两种写法等价。
2. **stage_pose 改为对齐残差**：母图是中性姿态的美术，Q 版头在 AngleX−6 下会平移十几像素，直接比会把整条轮廓算成缺陷；现在搜最优刚性平移（±16 px，粗 4 px 再 1 px），报残差，阈值 = 中性帧 ×1.10。
3. **被改写的数字**（`raw` = 首轮口径/同一 build，`豁免后` = 本轮）：
   - `dounai`：raw 13 → 豁免后 **5** px（差额是母图本透明的发丝负空间）
   - `kimi`：raw 1150 → 豁免后 **69** px（差额是母图本透明的发丝负空间）
   - `kimi-prop`：raw 1121 → 豁免后 **69** px（差额是母图本透明的发丝负空间）
   - `mimo`：raw 2137 → 豁免后 **4** px（差额是母图本透明的发丝负空间）
   - `mimo-prop`：raw 1884 → 豁免后 **0** px（差额是母图本透明的发丝负空间）
   - `minimax`：raw 98 → 豁免后 **5** px（差额是母图本透明的发丝负空间）
   - `minimax-prop`：raw 94 → 豁免后 **5** px（差额是母图本透明的发丝负空间）
4. **重建导致的数字变化**：kimi/mimo/minimax 的 build 在 2026-11-09 07:52–07:56 被重建（脸缘缝修复），所以「首轮 raw」与「本轮 raw」不是同一版 build；两者都保留在表里，不要把差额全部归给口径。

## 结论

- PASS：gemini, dounai, glm, qwen, kimi, kimi-prop, mimo, mimo-prop, minimax, minimax-prop
- FAIL：无
- 备注：`gemini` 的竖边 ΔL* 已从首轮的 8.15 降到本轮 0.94（<3），neutral 母图真值缺口 56 px（<60），但 t4 仍在收尾、build 可能继续变化 —— 请 verifier 在 t4 完成后用同一脚本复测这一行，不要把本快照当最终验收。
- 备注：9 个新 rig 的 ΔL* 一律 n/a，因为判据是「新填色 vs 修复前板」，这批 rig 没有修复前版本（`reference_plate()` 返回 no backup build with a plate）；这是能力边界，不是通过。
