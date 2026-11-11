# NOTICE —— 许可分层与署名 / License layering & attribution

本仓库的**代码**以 **GNU GPL v3（或更高版本）** 发布；仓库里同时带有**美术素材**和**第三方运行时**，它们各自另有条款。这就是这份 NOTICE 存在的原因：放在 `LICENSE` 之外，既让 GitHub 正确识别 GPL，也不把别人的作品误标成 GPL。

`LICENSE` (**GPL-3.0-or-later**) covers **the code of this repository only**. The artwork and third-party runtimes shipped alongside it keep their own terms — see below.

**当前版本 / Current release: `0.6.0`**（与 `package.json`、`CHANGELOG.md` 一致 / aligned with `package.json` and `CHANGELOG.md`）。

---

## 1. 代码 / Code

- **范围 / Scope**：`lib/`、`test/`、`cordis.patch.yml`、`package.json`、`README.md`、`CHANGELOG.md`、`NOTICE.md`
- **许可 / License**：**GNU GPL v3 或更高版本**（`GPL-3.0-or-later`），Copyright © 2026 **dsh-simroundtable contributors**
- **历史 / History**：`0.1.0`–`0.3.0` 曾以 MIT 发布；自 `0.4.0` 起改为 GPL-3.0-or-later。已经按旧版 MIT 获得的副本，其授权不因本次变更而撤回。
- 完整条款见 [`LICENSE`](LICENSE)；源码随仓库与 npm 包提供。
- `preview/` 中的脚本/页面与 `relay-kit/` 中的文档/提示词也按 **GPL-3.0-or-later** 提供；图像、截图、本地工具与浏览器登录态不在此列，详见 §4。

---

## 2. 美术素材与角色 rig / Artwork & character rigs

### 2.1 鲸鱼娘 / whale-girl

- **范围 / Scope**：`assets/models/whale-girl/**`（`c_0120.moc3`、`c_0120.2048/*.png`、`motions/*.motion3.json`、`expressions/*.exp3.json`、`physics3.json`、`cdi3.json`、`model3.json`）
- **许可 / License**：**[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)**（署名 — **非商业性使用** — 相同方式共享）
- **版权 / Copyright**：**上善无形 / ZipZipPipe / 氵六青** 三位所有
- **来源 / Provenance**：角色形象「溟月」（上善无形）→ 女仆鲸鱼娘二次设计（ZipZipPipe）→ Live2D 模型（氵六青）。原模型包《使用须知》写明：**允许**商用直播、自印物料；**禁止**盗用与出售。
- **修改说明 / Changes**：本仓库仅做**复制与目录重命名**，未修改模型内容。
- **非商业 / NonCommercial**：本仓库整体免费、非商业（不收费、不带货、不接广告、不卖周边）；请勿把该素材用于售卖、付费产品或商业再分发。

> 为什么模型不进 GPL：它不是本仓库作者的原创作品，三位权利人的条款（NC/SA）与 GPL 不兼容；把它作为**独立作品**随附（GPL 第 5 条所称 aggregate），而不是并入 GPL 程序，是唯一既尊重原作者、又能合法分发的做法。

### 2.2 角色 rig / character rigs

- **范围 / Scope**：`assets/build/**` 中随仓库发布的构建产物。`gpt-half-atlas2048`、`claude-book-model`、`kimi/mimo/minimax-prop-v1` 等本地构建目录**不在公开仓库**，详见 README「Live2D 角色模型分发边界」。
- **许可 / License**：**CC BY-NC-SA 4.0**（署名 — 非商业性使用 — 相同方式共享），与鲸鱼娘采用同一套非商业条件。它们是与代码分离的美术素材，不并入 GPL 程序。
- **权利 / Rights**：rig 由本项目作者构建；角色形象、名称与商标权利仍归对应模型/平台权利人。如与来源方的品牌条款冲突，以更严格者为准。
- **分发 / Distribution**：git 仓库按 `.gitignore` 白名单发布部分基础 rig；**npm 包不包含 `assets/build/**`**，从 npm 安装时舞台回退到鲸鱼娘。

---

## 3. 第三方运行时 / Third-party runtime

| 组件 / Component | 许可 / License | 版权 / Copyright |
| --- | --- | --- |
| PIXI.js 6.5.10（`assets/vendor/pixi.min.js`） | MIT | PIXI.js contributors |
| pixi-live2d-display 0.4.0（`assets/vendor/cubism4.min.js`） | MIT | pixi-live2d-display contributors |
| Live2D Cubism Core（`assets/vendor/live2dcubismcore.min.js`） | Live2D 专有许可（Redistributable Code） | Live2D Inc. |

这些文件按各自许可原样随附，不受本仓库 GPL 影响；其中 Live2D Cubism Core 的使用还需遵守 Live2D 的 SDK 条款。

---

## 4. 开发预览、工具与中转站 / Development preview, tools & relay-kit

这些目录是开发过程的产物，**不属于运行时依赖**，也不会随 npm 包发布。它们的授权边界如下：

| 路径 / Path | 入库与分发 / Tracked & packaged | 授权 / License |
| --- | --- | --- |
| `preview/**` 的脚本与页面（`.py`、`.html`、`.js`、`.cjs`、`.ps1`） | 入库；npm 包不含 | **GPL-3.0-or-later**（与 §1 同） |
| `preview/**` 的截图、证据、参考图、日志（`.png`、`.jpg`、`.json`、`.txt`、`.pyc` 等） | 入库；npm 包不含 | **不单独授予 GPL**；属开发过程产物，可能含 Live2D 模型/第三方素材的派生内容，仅作非商业参考，不得单独再分发或商用 |
| `tools/**`（PSD2Live、Cubism 工具链等本机工具） | **不入库**（被 `.gitignore` 的 `tools/` 规则排除）；npm 包不含 | 本仓库不授予任何许可；第三方工具按各自 EULA/商业条款 |
| `relay-kit/**` 的文档与提示词（`.md`、`.txt`） | 入库；npm 包不含 | **GPL-3.0-or-later**（与 §1 同） |
| `relay-kit/tools/**`（脚本、`relay.config.json`、浏览器登录态） | **不入库**（被 `tools/` 规则排除）；npm 包不含 | 本仓库不授予许可；登录态与配置含个人信息，不得分发 |

> 说明：`preview/` 里的截图与 `relay-kit/` 里的提示词可能引用第三方模型名称、站点界面或角色形象；这些第三方内容的权利仍归各自权利人，本仓库只按现状保存开发记录。

---

## 5. 分发时请保留 / Keep this notice when redistributing

再分发本仓库（无论是否修改）时，请保留 `LICENSE`、本 `NOTICE.md` 与 `assets/models/whale-girl/LICENSE-ASSETS.md`，并保留三位美术作者的署名；`assets/build/**` 的角色 rig 也请保留 §2.2 的来源与授权说明。GPL 只覆盖代码；素材的 NC/SA 条件不会因为代码采用 GPL 而消失。

---

## 6. 权利主张 / Takedown

如认为本仓库素材侵犯了你的权利，请开 issue 说明**文件名**与**依据**，核实后会立即替换或移除。