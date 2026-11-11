# 稳定性修复独立验证（T11）

- 验证人：verifier（独立复跑，不采信成员自述）
- 仓库：`D:\dsh_simroundtable`，分支 `main`，HEAD `887a84d`（= origin/main）
- 环境：Windows，Node v22.20.0
- 审查来源：`C:\Users\pordl\Desktop\修复.txt`（770 行，P1/P2/P3 三批）
- 验证范围：全量测试、12 项清单逐条核对、`deployed/` 同步、提交前仓库卫生

## 1. 全量测试（独立复跑）

| 命令 | 退出码 | 结果 | 耗时 |
| --- | --- | --- | --- |
| `npm test` | 0 | tests 69 / pass 69 / fail 0 / cancelled 0 / skipped 0 | test-run 2338.551 ms，wall 约 3.53 s |
| `npm run check` | 0 | node --check passed for all 10 files under lib/ | wall 1691 ms |

`npm test` 由 `scripts/test.mjs` 自动收集 `test/*.test.mjs`，输出包含 `ok 6 - test\stage-math.test.mjs`，确认此前漏跑的 stage-math 已纳入。分文件用例数：apply 8、attachments 13、client 1（自定义断言文件）、core 18、meetings 24、stage 4、stage-math 1，合计 69。

### 非空洞对照（用 HEAD 版 lib 跑工作区新测试）

将 `git archive HEAD lib package.json` 解到临时目录，配上当前 `test/` 新用例后运行：

| 测试文件 | HEAD 结果 | 结论 |
| --- | --- | --- |
| `test/meetings.test.mjs` | 24 条中 11 pass / 13 fail | 持久化、超时、cancel 归属、语言、并发上限等新用例在旧实现上全部失败 |
| `test/apply.test.mjs` | 8 条中 4 pass / 4 fail | 4 条子 Agent 权限 fail-closed 用例在旧实现上全部失败 |
| `test/core.test.mjs` | 18 条中 16 pass / 2 fail | 注入围栏、数据边界两条在旧实现上失败 |
| `test/attachments.test.mjs` | 模块加载失败 | 旧 `lib/attachments.js` 不导出 `pruneUploads`（清洁用例无法加载） |
| `test/client.test.mjs` | 文件级断言失败 | 旧实现 `defaultWorkspace` 回退返回 `C:\\demo\\b` 而非 `ws-a`，竞态块不再执行 |

临时目录已删除，未进入工作区。

## 2. 审查清单 12 项逐条核对

| # | 审查条目 | 对应改动文件 | 对应测试 | 独立复跑结果 |
| --- | --- | --- | --- | --- |
| 1 | P1 语言选择器未贯通（create 忽略 language、不持久化、提示词强制议题语言） | `lib/meetings.js`、`lib/prompts.js`、`lib/engine.js`、`lib/core.js`、`lib/api.js` | `test/meetings.test.mjs`：defaults auto / zh / en / 页面 API / 未知语言 400 / 旧记录回 auto（6 条） | 通过；HEAD 对照 6 条全失败 |
| 2 | P2 并发上限应按 workspace 而非全局 | `lib/meetings.js`（`activeIn` + `samePath`） | `test/meetings.test.mjs`：the concurrent-meeting cap is counted per workspace | 通过；HEAD 失败（全局上限） |
| 3 | P1 整场超时可能被记成 completed / 用降级答案收尾 | `lib/meetings.js`（settle/execute/emit）、`lib/engine.js`（6 个阶段边界 `throwIfRunAborted`）、`lib/index.js`（最终 timedOut 检查） | `test/meetings.test.mjs`：later-stage deadline fails、runDeliberation rejects after abort | 通过；HEAD 2 条全失败 |
| 4 | P1 子 Agent 工具权限 fail-open + 迟到激活竞态 | `lib/index.js`（`restrictChildTools`、`childPlans` revoked/迟到 handle）、`lib/engine.js`、`lib/copy.js` | `test/apply.test.mjs`：restriction throws / guard throws / 其他工具仍可见 / 迟到 child 无工具 | 通过；HEAD 4 条全失败 |
| 5 | P1 HANDOFF.md 公开泄露 + 历史密钥扫描 | `HANDOFF.md` 移出索引、`.gitignore`、`docs/live2d-playbook.md`、`README.md` | 静态审计（见 §4） | 索引已无 HANDOFF；本地文件被忽略。历史中 `preview/_diag/psd2live_mcp.token.txt`（57 字节）仅由 `887a84d` 引入且已公开推送，**必须轮换该 token** |
| 6 | P1 初始 record 写盘失败仍继续跑会议 | `lib/meetings.js`（`write` strict + `create` 先写后跑）、`lib/attachments.js`（`releaseAdoptedUploads`） | `test/meetings.test.mjs`：first record cannot be persisted、failed first write hands attachments back | 通过；HEAD 2 条全失败 |
| 7 | P2 `cancel` 未校验工作区归属 | `lib/meetings.js`（`samePath` → 404） | `test/meetings.test.mjs`：a live meeting cannot be cancelled through another workspace | 通过；HEAD 失败 |
| 8 | P2 工作区切换后旧列表/详情响应覆盖新状态 | `lib/client.js`（generation token + `isCurrentWorkspace`） | `test/client.test.mjs`：A's late list cannot overwrite B's、late detail 不置 error | 通过；HEAD 文件级对照失败（见 §1 说明） |
| 9 | P2 上传期间可启动会议、旧上传结果落进新工作区 | `lib/client.js`（`uploading` fail-closed、token、按钮 disabled） | `test/client.test.mjs`：上传期间 start 不发请求且按钮禁用、跨切换上传不落入新工作区、创建期间切换不打开详情 | 通过；同上 |
| 10 | P2 `adoptUploads` 后续移动失败无回滚 | `lib/attachments.js`（`rollbackAdoption`、事务式 `adoptUploads`） | `test/attachments.test.mjs`：adoptUploads returns every moved upload、releaseAdoptedUploads hands attachments back | 通过；HEAD 模块加载失败（缺导出） |
| 11 | P3 未启动会议的临时上传永久残留 | `lib/core.js`（`uploadTtlHours` 默认 24，0 表示保留）、`lib/attachments.js`（`pruneUploads`/节流）、`lib/api.js`、`lib/meetings.js` | `test/attachments.test.mjs`：pruneUploads expires abandoned uploads and keeps live ones | 通过；HEAD 模块加载失败 |
| 12 | P3 `npm run check` 只覆盖 7 个 lib 文件 | `scripts/check.mjs`（遍历 `lib/*.js`）、`scripts/test.mjs`、`package.json`、`README.md` | `npm run check`、`npm test` | 通过：check 10/10；test 自动发现含 stage-math |

## 3. 审查中的附加条目

| 条目 | 改动文件 | 对应测试/核对 | 结果 |
| --- | --- | --- | --- |
| P2 提示词注入加固（附件/他答=数据、随机 nonce 围栏、禁外发） | `lib/prompts.js`、`lib/attachments.js`、`README.md`、`CHANGELOG.md` | `test/core.test.mjs` 数据边界 + 注入逃逸；`test/attachments.test.mjs` 伪造围栏 | 通过；HEAD 的 core 两条失败 |
| 测试入口漏 `test/stage-math.test.mjs` | `scripts/test.mjs`、`package.json`、`README.md` | `npm test` 输出 `ok 6 - test\stage-math.test.mjs` | 通过 |
| 版本号 0.5.0 与 0.6.x 不一致 | `package.json` 0.6.0、`CHANGELOG.md` `## 0.6.0`、`README.md:9`、`NOTICE.md:7` | 四处置为 0.6.0 | 通过 |
| Live2D 角色分发边界未说明 | `README.md` §Live2D 角色模型分发边界、`NOTICE.md` §2.2 | 文档核对：公开仓库 9 套 rig + 鲸鱼娘；gpt/claude-book/3 prop 需本地构建；npm 只带鲸鱼娘 | 通过 |
| NOTICE 许可范围不清（preview/tools/relay-kit） | `NOTICE.md` §4 | 文档核对：preview 脚本/页面与 relay-kit 文档 GPL；截图/证据不单独 GPL；tools/ 不入库不授权；登录态不分发 | 通过 |
| `defaultWorkspace` 返回 path 而选择器用 id | `lib/api.js`、`lib/client.js` | `test/meetings.test.mjs` 页面 API、`test/client.test.mjs` id 默认值/旧 path 回退 | 通过 |

## 4. 仓库卫生与 deployed 同步

**提交内容审计（`git status --porcelain`）**

- 20 个已修改文件：`.gitignore`、`CHANGELOG.md`、`NOTICE.md`、`README.md`、`docs/live2d-playbook.md`、`lib/` 9 个、`package.json`、`test/` 5 个。
- 2 个已暂存删除：`HANDOFF.md`、`preview/_diag/psd2live_mcp.token.txt`（`D ` 状态）。
- 1 个未跟踪目录：`scripts/`（新增，待提交）。
- 无其他异常条目。`git ls-files` 无 HANDOFF / `*.token.txt` / `_read_token.py` / `.tmp-*` / `*.npy`；`*.npy` 只存在于被忽略的 `.tmp/`。
- `HANDOFF.md` 与 `preview/_diag/psd2live_mcp.token.txt` 仍留在本机磁盘，但分别由 `.gitignore:5`、`.gitignore:8` 忽略且已暂存删除，正常 `git add` 不会带回；**不要使用 `git add -f`**。
- `_read_token.py` 已不存在；`.tmp-apply-CoUau6/` 已删除；`.tmp-*/`、`preview/_diag/_read_token.py` 已加入 `.gitignore`。
- 当前索引与 HEAD 树的通用密钥模式扫描（`sk-…`/`ghp_…`/`AKIA…`/`xox…`）0 命中（排除 test）。

**deployed 同步（`deployed/dsh-roundtable/lib/`）**

- 同步前 9/10 不一致（`stage.js` 已一致）；已将 `api.js`、`attachments.js`、`client.js`、`copy.js`、`core.js`、`engine.js`、`index.js`、`meetings.js`、`prompts.js` 复制过去。
- 同步后 **10/10 sha256 完全一致**（逐文件比对）：api 8675766…5b91e、attachments 3eb8c68…664b0、client c4897ad…92e17、copy 3d38293…d86ac、core 9936b52…79769、engine 6804f9a…b5ffc、index d8778f7…501a06、meetings 17b148d…692c84、prompts 768a400…e0ab5、stage f96aaa1…574e65e。
- `deployed/` 被 `.gitignore:17` 忽略，同步不改变 git 状态。注意 `deployed/dsh-roundtable/package.json` 仍为 0.5.0（本次仅按 captain 要求同步 `lib/`）。

## 5. 遗留与待 captain 决策

1. **token 轮换**：`preview/_diag/psd2live_mcp.token.txt` 的真实 token（57 字节）已随 `887a84d` 进入公开历史；本次只停止跟踪，未重写历史，必须尽快轮换。
2. 本文档 `preview/_evidence/stability/README.md` 未被 `.gitignore` 忽略，写入后会成为未跟踪文件；是否随本次提交入库由 captain 决定。
3. 残余文档问题（非 12 项清单，未阻塞）：`docs/art-requirements-*.md`、`docs/live2d-playbook.md` 仍含 `D:\dsh_simroundtable` 本机路径；`relay-kit/README.md:23` 仍描述未入库的 `tools/` 脚本。
4. `deployed/dsh-roundtable/package.json` 版本仍为 0.5.0（未在本次同步范围）。