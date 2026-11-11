import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace('default="front hair,headwear,ears,eyewhite,irides,mouth,eye close"',
              'default="front hair,headwear,ears,back hair,topwear,bottomwear,legwear,footwear,handwear,tail"')
p.write_text(s, encoding="utf-8"); print("skip flipped")
