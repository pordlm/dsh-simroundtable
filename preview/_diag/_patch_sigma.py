import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace('''    sigma = (7, 7, 0)
    num = ndimage.gaussian_filter(premul, sigma)
    den = ndimage.gaussian_filter(alpha, sigma)''',
'''    num = ndimage.gaussian_filter(premul, (7, 7, 0))
    den = ndimage.gaussian_filter(alpha, (7, 7))''')
p.write_text(s, encoding="utf-8")
import ast; ast.parse(s); print("ok")
