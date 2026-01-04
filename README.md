# WebGL Wind Field Visualization

一个基于WebGL和Leaflet的风场数据可视化系统，支持NC格式气象数据的实时渲染和交互式分析。

## 项目功能

- 🌪️ **实时风场渲染**: 支持百万级风粒子60fps流畅渲染
- 🗺️ **多种地图支持**: 集成Leaflet地图框架，支持多种地图瓦片服务
- 📊 **数据格式支持**: 原生支持NetCDF (NC) 格式气象数据
- 🗜️ **高效数据压缩**: PNG编码实现数据压缩，减小传输和存储开销
- 🔄 **交互式分析**: 支持地图缩放、拖拽，风场粒子实时响应
- 📱 **响应式设计**: 适配桌面端和移动端设备

## 演示页面

项目包含两个主要演示页面，展示不同的数据处理和渲染策略：

### 1. 原始JSON渲染 (leaflet-wind-v2)
- **访问地址**: http://localhost:8080/src/leaflet-wind-v2/
- **数据格式**: 原始JSON格式风场数据
- **特点**: 
  - 数据精度高，完整保留原始气象数据
  - 适合高精度分析和科学研究
  - 文件体积相对较大

### 2. 压缩JSON渲染 (leaflet-wind)
- **访问地址**: http://localhost:8080/src/leaflet-wind/
- **数据格式**: PNG压缩 + JSON元数据
- **特点**:
  - 数据经过压缩优化，传输效率高
  - 适合生产环境部署
  - 支持实时数据更新和传输

## 快速开始

### 环境要求
- Node.js (推荐 v16+)
- Python 3.7+ (用于NC数据处理)
- 现代浏览器 (支持WebGL)

### 安装和运行

```bash
# 克隆项目
git clone <repository-url>
cd webgl-wind

# 安装依赖
npm install

# 启动开发服务器
npm run dev
# 或者使用内置HTTP服务器
npx http-server -p 8080 -o src/leaflet-wind-v2/index.html

# 访问演示页面
# 原始数据渲染: http://localhost:8080/src/leaflet-wind-v2/
# 压缩数据渲染: http://localhost:8080/src/leaflet-wind/
```

## 数据处理流程

### NC文件到JSON转换

1. **数据提取**: 从NetCDF文件中提取风场变量 (U/V分量)
2. **坐标处理**: 处理地理坐标系统和时间维度
3. **数据标准化**: 归一化风速、风向数据
4. **格式转换**: 转换为WebGL可用的数组格式

```bash
# NC到JSON转换
python convert_nc_to_webgl.py input.nc output.json
```

### 数据压缩优化

```bash
# 生成压缩数据
python optimize_data_size.py --target-size 500KB --input original.json
```

## 项目结构

```
webgl-wind/
├── src/
│   ├── leaflet-wind-v2/          # 原始数据渲染版本
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── velocity-override.css
│   │   └── README.md
│   └── leaflet-wind/             # 压缩数据渲染版本
│       ├── index.html
│       ├── app.js
│       ├── velocity-override.css
│       ├── CONFIG.md
│       └── README.md
├── data/
│   ├── nc_files/                 # 原始NC文件
│   ├── output_json/              # 转换后的JSON文件
│   └── wind_data/                # 处理后的风场数据
├── demo/                         # 演示页面
├── convert_nc_to_webgl.py        # NC转换脚本
├── optimize_data_size.py         # 数据优化脚本
└── README.md                     # 项目说明
```

## 技术栈

- **前端框架**: Vanilla JavaScript + Leaflet.js
- **图形渲染**: WebGL + Canvas 2D
- **地图服务**: 高德地图API
- **数据格式**: NetCDF, JSON, PNG
- **构建工具**: http-server, npm
- **数据处理**: Python + netCDF4, PIL

## 致谢

本项目灵感来源于:

- [Cameron Beccario](https://twitter.com/cambecc) - [Earth项目](https://earth.nullschool.net/)
- [Fernanda Viégas和Martin Wattenberg](http://hint.fm/) - [US Wind Map项目](http://hint.fm/projects/wind/)
- [Chris Wellons](http://nullprogram.com) - WebGL粒子物理教程
- [WebGL Fundamentals](http://webglfundamentals.org/) - WebGL基础教程

## 许可证

MIT License
