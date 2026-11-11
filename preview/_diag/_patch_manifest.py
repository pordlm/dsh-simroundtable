import pathlib
p = pathlib.Path("assets/_raw/make_layout_manifest_gemini.py")
s = p.read_text(encoding="utf-8")
s = s.replace(
'''    ap.add_argument("--grow", type=int, default=2,
                    help="outward alpha growth per part so neighbours overlap (0 = touching, the old behaviour)")''',
'''    ap.add_argument("--grow", type=int, default=2,
                    help="outward alpha growth per part so neighbours overlap (0 = touching, the old behaviour)")
    ap.add_argument("--grow-skip", default="front hair,headwear,ears,eyewhite,irides,mouth,eye close",
                    help="comma list of layer names that keep their exact silhouette (growing these "
                         "coarsens the outline); everything behind them still grows")''')
s = s.replace(
'''            im, pad = grow(im, args.grow)''',
'''            skip = {n.strip() for n in args.grow_skip.split(",") if n.strip()}
            im, pad = grow(im, 0 if nm.split("-")[0] in skip else args.grow)''')
p.write_text(s, encoding="utf-8")
print("grow_skip" in s)
