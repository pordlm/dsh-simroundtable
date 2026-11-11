import pathlib
p = pathlib.Path("preview/stage-760.html")
s = p.read_text(encoding="utf-8")
old = """    else{nod=1.4*Math.sin(t/w.bobPeriod+w.phase*.7);lean=w.swayAmp*Math.sin(t/w.swayPeriod+w.phase);
      turn=w.turnAmp*Math.sin(t/w.turnPeriod+w.phase*1.7);breath=.5+.5*Math.sin(t/w.bobPeriod+w.phase);"""
new = """    else{/* showcase parity: the rig's breath/physics own the idle drift, so no extra sine here */
      nod=0;lean=0;turn=0;breath=.5+.5*Math.sin(t/w.bobPeriod+w.phase);"""
assert old in s, "stage-760 pattern missing"
s = s.replace(old, new)
p.write_text(s, encoding="utf-8")
print("stage-760 patched")
