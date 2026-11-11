"""从母图（matte）裁嘴部窗口，看清原始美术到底画了什么。"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, r"preview/_diag/_audit")
import common  # noqa: E402


def font(sz):
    return ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", sz)


def crop_matte(name, win, out, scale=6):
    m = common.load_matte(name)          # 返回 (Image, mapping) 或按项目实现
    print(name, "matte api:", type(m))


for n in ("dounai", "minimax"):
    print(n, [f for f in dir(common) if "matte" in f.lower()])