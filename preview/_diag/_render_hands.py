import base64, json, sys
sys.path.insert(0,"assets/_raw")
import psd2live_mcp as M
c=M.Client(); c.initialize()
lay=c.rpc("tools/call",{"name":"workspace_inspect","arguments":{"request":{"scope":"layers"}}})["structuredContent"]["data"]["items"]
ids={it["name"]:it["id"] for it in lay}
print(ids)
req={"viewport":{"mode":"canvas_rect","left":580,"top":1300,"width":520,"height":330},
     "include_layer_ids":[ids["handwear-l"],ids["handwear-r"]],
     "background":"transparent","target_long_edge":520,"max_bytes":4000000}
res=c.rpc("tools/call",{"name":"view_render_model","arguments":{"request":req}})
for blk in res.get("content",[]):
    if blk.get("type")=="image":
        open("preview/_diag/_dounai_hands_only.png","wb").write(base64.b64decode(blk["data"]))
        print("wrote", blk.get("mimeType"), len(blk["data"]))
    else:
        print("text", str(blk.get("text"))[:300])
print("isError", res.get("isError"))
