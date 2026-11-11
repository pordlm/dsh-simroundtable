# visual_review3 — 三处脸/嘴缺陷修后逐项视觉复核（t6, verifier2 独立复跑）

生成：`preview/_evidence/t6/_v2_visual.py`；原始帧：`preview/_evidence/t6/_v2/`（本次运行现渲，均为 1:1 2048² RGBA 直接截图，6× 为最近邻裁图）；舞台图：`_v2_seats.py` 现拍，读 deployed 资产。

| 分图 | 覆盖 | 结论 |
|---|---|---|
| 01_qwen_face_6x.png | Qwen neutral / MouthOpenY=1 / stage_pose / AngleX ±6，头部+嘴部 6× | 嘴中线−镜像对称脸轴 **0.0 px**；嘴角 dy **0.0 px**；闭/开嘴错位 −13.5→**−0.5 px**；③ 水平分量 −25.5→**+0.5 px**、下眼睑线 −23.7→**+0.46 px**（字面欧氏仍 −7.75，本 art ①③ 互斥，见 README_t6 §4） |
| 02_dounai_mouth_6x.png | 豆包 idle / MouthOpenY 0.5 / 1.0，前后各 6× | 笑线上方深红 **533→0 px**；笑线暗核 32 px 与开口口腔 2126 px 前后**逐像素一致**（说话态零回归） |
| 03_minimax_mouth_6x.png | MiniMax neutral / AngleX ±6，前后各 6× | 净肤窗红点 **19/19/20→0/0/0 px**；整图差异仅 40/46/39 px（max 92/96/92），全部落在原点 3×5 足迹内；图集只差 **125 px**、alpha 0 |
| 04_seats_1x.png | 舞台 1× 两种名单（deployed 资产） | 三个 rig 在 8 席舞台上无破图/无接缝；座位几何不变 |
| 05_seats_fixed3_2x.png | 三个 rig 座位 2× | 座位尺寸观感复核（非验收判据，辅助） |

判据口径（本次独立实现）：渲染 2048² RGBA；Qwen 脸轴用镜像对称最优（嘴窗排除出投票）；豆包深色像素 (a>200)∧(r−g>80)∧(r<200)∧(g<110)，笑线上界 y<804；MiniMax 红点 (a>200)∧(r−g≥35)，净肤窗 (1024,600)-(1090,665)。

数字出处：`preview/_evidence/t6/verify_v2.json`、`_v2/audit_{qwen,dounai,minimax}/audit.json`、`preview/_evidence/t6/README_t6.md`。
