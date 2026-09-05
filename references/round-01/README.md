# 第一轮动作参考

打开 `index.html` 可离线查看全部 10 个候选；05 号视频需要点击播放。

仅用于本轮聊天中的动作与画风筛选；不是产品需求文档，也没有实现桌宠功能。10 个源媒体按下载时的原始字节保存，未裁剪或去除水印。另从 05 号视频的 1.8 秒处提取一张封面供页面预览。

| 编号 | 动作 | 类型 | 来源 |
|---|---|---|---|
| 01 | [跑动 → 脸着地 → 弹起](media/01-bounce-and-run.webp) | 重点动作 | [原网页](https://usagi-project.vercel.app/) |
| 02 | [背身拍屁屁](media/02-butt-pat.gif) | 重点动作 | [原网页](https://tenor.com/view/usagi-dance-chiikawa-tease-hehe-gif-7163663705603193535) |
| 03 | [挥动黄色长棍](media/03-staff-action.gif) | 近似参考 | [原网页](https://gifdb.com/gif/chiikawa-usagi-fireworks-stick-7pv55smwxd2ulwra.html) |
| 04 | [叉腰张嘴](media/04-hands-on-hips.gif) | 无声参考 | [原网页](https://gifdb.com/gif/angry-chiikawa-usagi-reaction-xhw7mm5sd835kv5w.html) |
| 05 | [叉腰片段 · 有声待试听](media/05-voice-candidate.mp4) | 声音候选 | [原网页](https://imgur.com/gallery/hachiware-usagi-ha-aLfPhkO) |
| 06 | [迎面跑来](media/06-run-toward-camera.gif) | 跑步参考 | [原网页](https://usagi-project.vercel.app/) |
| 07 | [转身跑远](media/07-turn-and-run.webp) | 过渡参考 | [原网页](https://usagi-project.vercel.app/) |
| 08 | [原地转圈](media/08-spin.webp) | 嬉戏参考 | [原网页](https://usagi-project.vercel.app/) |
| 09 | [甩水抖动](media/09-shake-water.webp) | 形变参考 | [原网页](https://usagi-project.vercel.app/) |
| 10 | [左右摇头](media/10-head-shake.gif) | 表情参考 | [原网页](https://usagi-project.vercel.app/) |

01 已逐帧检查脸着地、弹起和继续跑的过程。03 是挥棒，不是拿棒跑。04 为无声 GIF。05 有非静音音轨，但具体发音未听辨确认，需要用户试听。

来源为用户上传/第三方合集，官方原片出处尚未逐一核验。`sources.json` 记录原网页、下载地址、尺寸、帧数、时长和文件 SHA-256。

验证：9 个动图全部逐帧解码成功且含多个不同帧；1 个视频完整解码成功，存在音轨。本地链接与页面显示另见 `validation.json`。
