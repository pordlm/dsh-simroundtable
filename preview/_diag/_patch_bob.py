import pathlib
p = pathlib.Path("lib/client.js")
s = p.read_text(encoding="utf-8")
old = """          model.y = seatY + Math.sin(elapsed / wobble.bobPeriod + wobble.phase) * wobble.bobAmp;
          model.rotation = Math.sin(elapsed / (wobble.swayPeriod * 0.8) + wobble.phase) * 0.003;"""
new = """          // No body bob: the showcase page keeps the character planted and lets the
          // breath module move the torso. A 1-2 px vertical sine on top of that is
          // the difference between "alive" and "bouncing sprite".
          model.y = seatY;
          model.rotation = 0;"""
assert old in s
s = s.replace(old, new)
p.write_text(s, encoding="utf-8")
print("patched bob")
