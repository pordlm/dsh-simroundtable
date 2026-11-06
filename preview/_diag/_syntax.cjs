const fs = require("fs");
const vm = require("vm");
for (const f of ["preview/stage-760.html", "preview/longtable.html", "preview/claude-showcase.html"]) {
  const html = fs.readFileSync(f, "utf8");
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, n = 0, bad = 0;
  while ((m = re.exec(html))) {
    n++;
    try { new vm.Script(m[1], { filename: f + "#" + n }); }
    catch (e) { bad++; console.log("FAIL", f, "#" + n, e.message); }
  }
  console.log(f + ": " + n + " inline scripts, " + bad + " failures");
}
