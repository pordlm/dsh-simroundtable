import numpy as np
A=np.load(r"preview\_diag\_t7_plate.npy"); fill=np.load(r"preview\_diag\_t7_fill.npy")
fr=(839,510,1211,810)
m=np.zeros_like(fill); m[fr[1]:fr[3],fr[0]:fr[2]]=True
f=fill&m
print("fill in face rect",int(f.sum()))
rows=f.sum(1); cols=f.sum(0)
print("rows",[(int(y),int(rows[y])) for y in np.argsort(rows)[-8:][::-1]])
print("cols",[(int(x),int(cols[x])) for x in np.argsort(cols)[-8:][::-1]])
ys,xs=np.nonzero(f); print("bbox",xs.min(),ys.min(),xs.max(),ys.max())
