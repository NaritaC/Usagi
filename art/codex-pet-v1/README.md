# Codex 乌萨奇透明素材 v1

以用户已认可的三组 v3 形象为基准，制作九组 Codex 动画。成品在 [`pets/usagi-codex/`](../../pets/usagi-codex/)，操作说明在[切换指南](../../docs/codex-usagi-setup.md)。

- `references/canonical-base.png`：从已认可正面画稿第一姿态做原像素裁切，作为形象基准；没有重新设计角色。
- `decoded/`：八组由内置 imagegen 生成的蓝底横排动画，以及逐帧镜像得到的向左跑；原始输出路径、每次修正和检查备注记录在 `imagegen-jobs.json`。
- `prompts/`、`pet_request.json`：生成要求、布局和身份约束。
- `frames-extracted/`：hatch-pet 的 stable-slots 提取结果，保留同一行共享比例和跳跃位移。
- `frames/`：清理底色边缘并统一角色大小与落脚点后的 57 个透明姿态。姿态来自生成图，不以程序绘制新动作。
- `final/`：1536 × 1872、8 列 × 9 行的 PNG / 无损 WebP 图集及格式报告。
- `qa/`：姿态总览、九份动画、文件与控制器测试、视觉审查、安装测试和本机验收范围。

固定外观：短圆饱满的身体、独立的嘴下短弧线、侧面白色圆毛球尾巴、棕色轮廓与原画五官。正面不强行增加可见尾巴。已修复工作状态末帧误转侧面的缺陷。

制作使用本机官方 `hatch-pet` 脚本：prepare → imagegen 横排 → 镜像向左跑 → extract（stable-slots）→ 本仓库 `scripts/finish-pet-frames.py` → inspect → compose → validate → contact sheet / previews。脚本目录为 `C:/Users/Narita/.codex/vendor_imports/skills/skills/.curated/hatch-pet/scripts/`。

`finish-pet-frames.py` 只处理已有像素：蓝色底边缘去溢色、微小分离杂点清理、每行固定缩放、共同脚底锚点；跳跃保留原画姿态与位移次序，缩小垂直移动幅度以适应 208 像素画格。原始文件和提取结果均保留。再次运行不会累积缩小。

动画预览 GIF 采用逐行基础时长；离线 HTML 另有“Codex 节奏”模式，按本机当前实现把待机时长乘以 6、其他动作播放三次后进入慢速待机。九行成品是本机仍支持的格式版本 1；没有冒称提供版本 2 的额外视线姿态。

测试入口：`node scripts/test-pet-preview.cjs`。它验证实际预览控制器的计时和按钮处理，使用 DOM 替身，明确不等同于真实浏览器或 Codex 的视觉运行测试。文件检查、逐帧视觉检查已通过；本机最终选择、唤醒和互动待用户试用确认。

用户认可记录仅针对原有 v3 形象；本次新动作已经自动和静态视觉检查，但不把它们记录为用户已认可。没有创建或导出 Live2D 模型。为后续重绘和追踪保留生成源图，而不是只留下缩小后的运行图集。
