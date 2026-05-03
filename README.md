<div align="center">
   <img src="https://github.com/ospneam/ViewStage/blob/main/src-tauri/icons/Square1024x1024Logo.png" width=15%>
   <h1>ViewStage</h1>
   <p>一个基于 Tauri 构建的摄像头及PDF展台应用，采用原生 HTML、CSS 和 JavaScript 开发，提供简洁高效的课堂及其他用途的全屏展台。</p>
</div>

## 技术栈

- **前端**：Vanilla HTML 5 + CSS 3 + JavaScript
- **后端**：Rust + Tauri
- **构建工具**：Cargo

> \[!IMPORTANT]
> 这个应用部分使用了Trae编写与进行性能优化、检测代码问题
>
> > 若您介意或排斥，请无视次项目，感谢(❁´◡\`❁)

## 功能特点

### 核心功能
- � **摄像头展台**：实时采集摄像头画面，支持拍照保存
- 📄 **文档展示**：支持 PDF、Word 文档打开与展示
- 🖊 **批注功能**：在画面上自由绘制批注，支持撤销与清空

### 画笔工具
- 🎨 **多色画笔**：15种预设颜色，支持自定义增删
- � **无级调节**：画笔 1-20px，橡皮擦 1-50px

### 其他特性
- 🚀 **轻量高效**：基于 Tauri，体积小、启动快
- � **高度可配置**：摄像头选择、文件关联等设置
- 🌐 **多语言支持**：简体中文、繁体中文、English

## 运行条件

### 系统要求

- **操作系统**：Windows 10 或更高版本
- **运行时**：WebView2 运行时（[下载地址](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section)）

### 硬件要求

- **摄像头**：支持视频采集的摄像头设备（用于展台功能）
- **内存**：建议 4GB 以上
- **存储**：约 50MB 可用空间

### 可选依赖

- **Microsoft Office** 或 **WPS Office**：用于打开 Word 文档（.doc/.docx）

## 开发环境要求

- Node.js（推荐 20.x）
- Rust（稳定版）
- Tauri CLI

## **许可证**

本项目采用开源许可证，详见 [LICENSE](https://github.com/ospneam/ViewStage/blob/main/LICENSE) 文件。

## 致谢

本项目使用了以下开源项目，感谢这些项目的开发者们：

### 核心框架

- [Tauri](https://tauri.app/) - 构建更小、更快、更安全的桌面应用框架
- [Tokio](https://tokio.rs/) - Rust异步运行时

### 前端库

- [PDF.js](https://mozilla.github.io/pdf.js/) - Mozilla开发的PDF渲染库，用于在浏览器中显示PDF文档
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - 将Word文档(.docx)转换为HTML的库
- [html2canvas](https://html2canvas.hertzen.com/) - 将HTML元素渲染为Canvas的库

### Rust库

- [image](https://github.com/image-rs/image) - Rust图像处理库
- [imageproc](https://github.com/image-rs/imageproc) - Rust图像处理算法库
- [serde](https://serde.rs/) - Rust序列化框架
- [rayon](https://github.com/rayon-rs/rayon) - Rust数据并行库
- [chrono](https://github.com/chronotope/chrono) - Rust日期时间库
- [ort](https://github.com/pykeio/ort) - ONNX Runtime的Rust绑定，用于AI模型推理

### Tauri插件

- [tauri-plugin-opener](https://github.com/tauri-apps/plugins-workspace) - 文件打开插件
- [tauri-plugin-fs](https://github.com/tauri-apps/plugins-workspace) - 文件系统插件
- [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) - 对话框插件
- [tauri-plugin-single-instance](https://github.com/tauri-apps/plugins-workspace) - 单实例控制插件

感谢所有开源社区的贡献者们！
