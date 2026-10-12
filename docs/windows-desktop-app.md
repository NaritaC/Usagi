# Windows 独立桌宠

用户于 2026-10-12 选择先复用现有透明逐帧动画制作可运行的独立 Windows App，Live2D 模型与完整动作工程后续补齐。

实现位于 [`apps/usagi-desktop/`](../apps/usagi-desktop/README.md)，与原 Codex 桌宠包分开运行。默认宽度 112 个界面像素，与本机 Codex 默认桌宠尺寸一致。

双击打包文件夹中的 `Usagi Desktop.exe` 启动，右键角色或双击托盘打开设置。程序支持点击反应、拖拽接地、透明区域点击穿透、鼠标注视、自主散步、暂停和设置保存。

源码、启动与打包方法、当前范围及后续素材缺口见 [App 使用说明](../apps/usagi-desktop/README.md)；实测证据见 [validation.json](../apps/usagi-desktop/validation.json)。既有 PRD 中 Live2D 完整版的验收标准仍用于后续阶段。
