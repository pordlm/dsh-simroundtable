# NOTICE —— 许可分层与署名 / License layering & attribution

本仓库的**代码**以 **GNU GPL v3（或更高版本）** 发布；仓库里同时带有**美术素材**和**第三方运行时**，它们各自另有条款。这就是这份 NOTICE 存在的原因：放在 `LICENSE` 之外，既让 GitHub 正确识别 GPL，也不把别人的作品误标成 GPL。

`LICENSE` (**GPL-3.0-or-later**) covers **the code of this repository only**. The artwork and third-party runtimes shipped alongside it keep their own terms — see below.

---

## 1. 代码 / Code

- **范围 / Scope**：`lib/`、`test/`、`cordis.patch.yml`、`package.json`、`README.md`、`CHANGELOG.md`、`NOTICE.md`
- **许可 / License**：**GNU GPL v3 或更高版本**（`GPL-3.0-or-later`），Copyright © 2026 **dsh-simroundtable contributors**
- **历史 / History**：`0.1.0`–`0.3.0` 曾以 MIT 发布；自 `0.4.0` 起改为 GPL-3.0-or-later。已经按旧版 MIT 获得的副本，其授权不因本次变更而撤回。
- 完整条款见 [`LICENSE`](LICENSE)；源码随仓库与 npm 包提供。

---

## 2. 美术素材 / Artwork

- **范围 / Scope**：`assets/models/whale-girl/**`（`c_0120.moc3`、`c_0120.2048/*.png`、`motions/*.motion3.json`、`expressions/*.exp3.json`、`physics3.json`、`cdi3.json`、`model3.json`）
- **许可 / License**：**[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)**（署名 — **非商业性使用** — 相同方式共享）
- **版权 / Copyright**：**上善无形 / ZipZipPipe / 氵六青** 三位所有
- **来源 / Provenance**：角色形象「溟月」（上善无形）→ 女仆鲸鱼娘二次设计（ZipZipPipe）→ Live2D 模型（氵六青）。原模型包《使用须知》写明：**允许**商用直播、自印物料；**禁止**盗用与出售。
- **修改说明 / Changes**：本仓库仅做**复制与目录重命名**，未修改模型内容。
- **非商业 / NonCommercial**：本仓库整体免费、非商业（不收费、不带货、不接广告、不卖周边）；请勿把该素材用于售卖、付费产品或商业再分发。

> 为什么模型不进 GPL：它不是本仓库作者的原创作品，三位权利人的条款（NC/SA）与 GPL 不兼容；把它作为**独立作品**随附（GPL 第 5 条所称 aggregate），而不是并入 GPL 程序，是唯一既尊重原作者、又能合法分发的做法。

---

## 3. 第三方运行时 / Third-party runtime

| 组件 / Component | 许可 / License | 版权 / Copyright |
| --- | --- | --- |
| PIXI.js 6.5.10（`assets/vendor/pixi.min.js`） | MIT | PIXI.js contributors |
| pixi-live2d-display 0.4.0（`assets/vendor/cubism4.min.js`） | MIT | pixi-live2d-display contributors |
| Live2D Cubism Core（`assets/vendor/live2dcubismcore.min.js`） | Live2D 专有许可（Redistributable Code） | Live2D Inc. |

这些文件按各自许可原样随附，不受本仓库 GPL 影响；其中 Live2D Cubism Core 的使用还需遵守 Live2D 的 SDK 条款。

---

## 4. 分发时请保留 / Keep this notice when redistributing

再分发本仓库（无论是否修改）时，请保留 `LICENSE`、本 `NOTICE.md` 与 `assets/models/whale-girl/LICENSE-ASSETS.md`，并保留三位美术作者的署名。GPL 只覆盖代码；素材的 NC/SA 条件不会因为代码采用 GPL 而消失。

---

## 5. 权利主张 / Takedown

如认为本仓库素材侵犯了你的权利，请开 issue 说明**文件名**与**依据**，核实后会立即替换或移除。