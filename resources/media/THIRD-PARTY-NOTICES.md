# ToolDock 音视频引擎来源及许可

FFmpeg/ffprobe：BtbN LGPL 静态构建 `n8.1.3-34-ga35157abb9`，固定资产和 SHA-256 见 binaries.lock.json。发行包附 LICENSE.txt (LGPL 2.1)、对应完整 FFmpeg 源码归档 ffmpeg-source.tar.gz，以及固定 BtbN 构建脚本 build-scripts.tar.gz（含依赖来源与配置）。ToolDock 不修改 FFmpeg，不通过 DLL/静态库链接 FFmpeg；使用独立进程与文件交互。可用 `ffmpeg -version` 查看完整编译配置。

- 对应 FFmpeg 源代码：https://github.com/FFmpeg/FFmpeg/tree/a35157abb9
- 源码归档：https://github.com/FFmpeg/FFmpeg/archive/a35157abb9.tar.gz
- BtbN 构建脚本与依赖下载规则：https://github.com/BtbN/FFmpeg-Builds/tree/c63bb308a1de656b425c132a8102f8fd5389afc5
- 原始发行资产：https://github.com/BtbN/FFmpeg-Builds/releases/tag/autobuild-2026-11-05-12-48
- FFmpeg 法律信息与重新构建说明：https://ffmpeg.org/legal.html

whisper.cpp：MIT，固定 v1.8.3 / commit 2eeeba56e9edd762b4b38467bab96c2517163158，版权与许可见 whisper-LICENSE.txt。

- 对应源码及构建方式：https://github.com/ggml-org/whisper.cpp/tree/v1.8.3
- 官方 Windows CPU/CUDA 发行资产：https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.3
- 包内 SDL2：zlib 许可，见 SDL2-LICENSE.txt。

NVIDIA CUDA 引擎仅按用户要求下载官方 whisper.cpp CUDA 资产，CUDA Runtime/cuBLAS 组件遵循 NVIDIA CUDA Toolkit EULA：https://docs.nvidia.com/cuda/eula/index.html 。需要兼容的 NVIDIA 驱动；不下载/运行驱动安装器，不修改系统 CUDA 设置。

Whisper 模型来自 ggerganov/whisper.cpp Hugging Face 仓库；模型目录清单固定仓库 commit，LFS OID 作为 SHA-256。模型权重沿用 OpenAI Whisper MIT 许可：https://github.com/openai/whisper/blob/main/LICENSE 。模型不包含在 ToolDock 安装包内。
