# 参考项目研究与 Codex 格式依据

核查日期：2026-09-06。用途：支持[两阶段产品需求](PRD.md)。

两份参考仓库均按固定提交只读检查文件、配置和素材，没有安装依赖、执行项目脚本、运行应用或运行它们的测试。下面区分文件事实、静态判断和本项目建议；不能据此声称参考程序实际运行质量已经验证。

## 1. sherly-li/usagi-pet：第一阶段的直接参考

审阅提交：`c168cedad3ded6726ca996967bad8681c5e9b2f3`。

仓库只有 README、pet.json 和 spritesheet.webp，是 Codex 自定义宠物包。清单仅有 id、displayName、description、spritesheetPath；动画触发和播放由宿主承担。这个体量很适合第一阶段先交付可用的乌萨奇。[项目说明](https://github.com/sherly-li/usagi-pet/blob/c168cedad3ded6726ca996967bad8681c5e9b2f3/README.md#L5) · [清单](https://github.com/sherly-li/usagi-pet/blob/c168cedad3ded6726ca996967bad8681c5e9b2f3/pet.json#L1)

本地图片解码测得：图集是 1536 × 1872 的静态 RGBA WebP，以 8 列、9 行排列。按 alpha > 10 检查，九行非空格数为 6、8、8、4、5、8、6、6、6，共 57 个姿态格。它不是含时间轴的动画 WebP，也不是 57 种动作。[原图集](https://github.com/sherly-li/usagi-pet/blob/c168cedad3ded6726ca996967bad8681c5e9b2f3/spritesheet.webp)

可借鉴透明图集、统一格子和简洁安装包。要改进的是角色画风、姿态一致性、步态与循环，以及九行内容对宿主状态的准确表达。不能仅凭 README 的动作名称，推断某组动画具备声音或自定义交互。

当前提交没有眼头分层源文件、鼠标处理、底栏接地或独立应用代码，因此第二阶段需要新的运行系统和可控素材。仓库未包含 LICENSE；README 描述为粉丝制作、个人使用、非官方。研究记录不把该包的美术直接认定为可无条件再分发的成品。[项目声明](https://github.com/sherly-li/usagi-pet/blob/c168cedad3ded6726ca996967bad8681c5e9b2f3/README.md#L52)

## 2. WayneYe912/OhMyChiikawa：第二阶段的交互参考

审阅提交：`f1eddc6a9dc4a39aa7e30d71116108957be16c85`；项目版本 0.0.5。

| 观察项 | 源码能证明的能力 | 对本项目的启示 |
|---|---|---|
| 独立桌面应用 | Electron 透明无框窗口、置顶、拖拽，配置 Windows 和 macOS 打包 | 借鉴窗口与交互分离；平台实测仍须自己完成 |
| 鼠标响应 | 坐标平滑后让整身小幅倾斜和移动；眼部创建的是眼皮 | 眼神方向与整身倾斜分别设计，不能视作已有独立视线控制 |
| 点击 | 耳、脸、手和身体分区；耳朵做了变换后的透明度命中 | 借鉴分区，但全身命中也要跟随当前动画与姿态 |
| 自动散步 | 间歇水平移动，保持当前高度，以显示器边界限制 | 增加任务栏地面、接触点、落地和恢复逻辑 |
| 动画 | 分层 PNG 加连续变换；跑步 6 张图按 9fps 播放；转手序列 11 个位置但只有 5 张不同图 | 混合方式可借鉴；画稿节奏、移动同步和动作转场需另行完善 |
| “哈/呀哈” | 写入文字气泡；资源与源码未见音频播放 | 声音必须另备音频并同步，文字不能替代 |
| Codex 导出 | 另有固定 8 × 9 图集导出，部分状态重采样已有动作 | 可参考导出组织，不能把重复填格当作状态动画已完整 |

证据：[窗口](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/main.js#L88)、[鼠标响应](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/renderer.js#L461)、[自主移动](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/main.js#L444)、[乌萨奇动作配置](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/pets/usagi.js#L18)、[播放实现](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/renderer.js#L190)、[文字气泡](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/renderer.js#L373)、[Codex 导出](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/codex_pet/tools/build_pets.py#L307)。

静态阅读还提示三个应避免的耦合：关闭跟随会停止兼管穿透检测的轮询；全身命中主要使用待机遮罩，可能与动态姿态错位；自主移动与动作播放分别决定状态，可能造成角色移动时仍播放另一种动作。这些是源码推导的风险，尚未运行复现。[交互与命中代码](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/renderer.js#L283) · [主进程开关与轮询](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/src/main.js#L382)

现有测试主要覆盖其他角色的资源和耳部命中，本次未运行。不能代替我们的乌萨奇连贯动作、视线、任务栏与 Windows 集成验收。代码采用 MIT；项目同时对角色形象作单独声明，代码许可不作为图像逐项来源记录的替代。[测试示例](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/tests/ear-animation.test.js#L135) · [代码许可](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/LICENSE) · [美术声明](https://github.com/WayneYe912/OhMyChiikawa/blob/f1eddc6a9dc4a39aa7e30d71116108957be16c85/README.md#L184)

## 3. Codex 第一阶段的格式依据

优先检查了本机随技能库缓存的 `hatch-pet/references/codex-pet-contract.md` 和 `animation-rows.md`，并核对 OpenAI 公开仓库的对应文档。这些是格式依据；没有修改或安装该技能，也没有由此推断当前宿主全部交互已经实测。

源文档：[图集和清单](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md) · [动画状态](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md) · [美术检查要求](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/qa-rubric.md)。核查日期为 2026-09-06；正式制作与安装时须复核宿主兼容性。

加载包为宠物目录中的 `pet.json` 与透明图集，目录位于 `CODEX_HOME` 对应的 `pets/` 下，未设置时使用用户目录的 `.codex/pets/`。清单提供 id、displayName、description、spritesheetPath 四项。具体安装位置在安装时解析，不能假定所有用户的路径相同。

图集为透明 PNG 或 WebP，1536 × 1872；8 列、9 行；每格 192 × 208。禁止额外边框、标签、格线、间隔或超出格子的绘制；未使用格完全透明。[OpenAI 格式文档](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/codex-pet-contract.md)

下表记录本机 `animation-rows.md` 的播放时长，列号从 0 开始。它用于匹配宿主动画节奏，不是本项目可以通过清单任意修改的参数。

| 行号 | 状态 | 使用列 | 单格时长 |
|---:|---|---|---|
| 0 | idle | 0–5 | 280、110、110、140、140、320 ms |
| 1 | running-right | 0–7 | 前 7 格各 120 ms，末格 220 ms |
| 2 | running-left | 0–7 | 前 7 格各 120 ms，末格 220 ms |
| 3 | waving | 0–3 | 前 3 格各 140 ms，末格 280 ms |
| 4 | jumping | 0–4 | 前 4 格各 140 ms，末格 280 ms |
| 5 | failed | 0–7 | 前 7 格各 140 ms，末格 240 ms |
| 6 | waiting | 0–5 | 前 5 格各 150 ms，末格 260 ms |
| 7 | running | 0–5 | 前 5 格各 120 ms，末格 220 ms |
| 8 | review | 0–5 | 前 5 格各 150 ms，末格 280 ms |

`running` 是任务执行中的专注状态，不能与向左、向右移动混淆；`waiting` 表达等待用户输入，`review` 表达审阅。素材设计应遵循状态含义，实际触发需在宿主测试中记录。[OpenAI 状态说明](https://github.com/openai/skills/blob/main/skills/.curated/hatch-pet/references/animation-rows.md)

## 4. “比参考项目更好”的可验收含义

第一阶段衡量：更准确的角色形象、九组状态设计、透明边缘、连续姿态和实际 Codex 可用性。第二阶段衡量：真实的视线控制、贴着底栏的运动、动作链和中断恢复、音效与形态变化，以及对应的运行测试。未实测前不宣称性能或整体体验已经超越参考项目。
