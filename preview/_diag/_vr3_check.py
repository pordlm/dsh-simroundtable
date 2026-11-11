import sys
import numpy as np
from PIL import Image
from pathlib import Path

OUT = Path(r"D:\dsh_simroundtable\preview\_evidence\visual_review3")
for name in ("qwen", "dounai", "minimax"):
    p = OUT / f"{name}_AB_6x.png"
    im = Image.open(p).convert("RGB")
    a = np.asarray(im).astype(int)
    # 品红背景 (255,0,255)
    bg = (a[:, :, 0] > 235) & (a[:, :, 1] < 40) & (a[:, :, 2] > 235)
    solid = ~bg
    ys, xs = np.nonzero(solid)
    print(f"{name}: size={im.size} magenta={bg.mean()*100:.1f}%  solid bbox=({xs.min()},{ys.min()})-({xs.max()},{ys.max()})")
    # 左右两半的差异（旧 vs 新）
    w = im.width // 2
    left = a[:, :w - 20, :]
    right = a[:, w + 20:, :]
    h = min(left.shape[1], right.shape[1])
    d = np.abs(left[:, :h, :] - right[:, :h, :]).sum(axis=2) > 24
    if d.any():
        ys2, xs2 = np.nonzero(d)
        print(f"   diff px={int(d.sum())}  bbox=({xs2.min()},{ys2.min()})-({xs2.max()},{ys2.max()}) in {h}x{im.height}")
    else:
        print("   diff none")