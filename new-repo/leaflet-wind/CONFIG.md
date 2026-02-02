# Leaflet-Velocity 配置项说明

## 核心配置参数

### 数据相关
- **`data`**: 风场数据数组，包含U和V分量
- **`maxVelocity`**: 最大风速值，用于颜色映射和粒子速度计算

### 显示配置
- **`displayValues`**: 是否显示风速数值 (true/false)
- **`displayOptions`**: 显示选项对象
  - `velocityType`: 显示类型名称 (如 'Wind')
  - `position`: 显示位置 ('bottomleft', 'topright' 等)
  - `emptyString`: 无数据时显示的文本

### 粒子系统
- **`particleMultiplier`**: 粒子密度倍数 (0.001-0.01)
  - 值越大粒子越多，性能消耗越大
  - 推荐范围: 0.001-0.005

- **`particleAge`**: 粒子生命周期 (帧数)
  - 值越大轨迹越长
  - 推荐范围: 30-90

- **`lineWidth`**: 粒子轨迹线宽 (像素)
  - 推荐值: 1-2

### 动画性能
- **`frameRate`**: 动画帧率 (fps)
  - 值越高动画越流畅，但性能消耗越大
  - 推荐范围: 10-30

- **`velocityScale`**: 速度缩放因子
  - 控制粒子移动速度
  - 推荐范围: 0.001-0.01

### 颜色配置
- **`colorScale`**: 颜色渐变数组
  - 从低风速到高风速的颜色映射
  - 支持十六进制颜色值

## 地图配置

### 边界限制
- **`maxBounds`**: 地图最大边界
- **`maxBoundsViscosity`**: 边界粘性 (0-1)
  - 1.0 = 完全不能超出边界
  - 0.0 = 可以自由拖拽

### 缩放控制
- **`minZoom`**: 最小缩放级别
- **`maxZoom`**: 最大缩放级别

### 渲染优化
- **`preferCanvas`**: 优先使用Canvas渲染
- **`renderer`**: 指定渲染器 (L.canvas())

## 性能优化建议

### 低性能设备
```javascript
{
    particleMultiplier: 0.001,
    particleAge: 30,
    frameRate: 10,
    velocityScale: 0.003
}
```

### 高性能设备
```javascript
{
    particleMultiplier: 0.005,
    particleAge: 90,
    frameRate: 30,
    velocityScale: 0.008
}
```

### 交互优化
- 拖拽/缩放时降低帧率到5fps
- 交互结束后恢复正常帧率
- 使用Canvas渲染器提升性能

## 数据格式要求

### JSON元数据
```javascript
{
    width: 221,           // 网格宽度
    height: 171,          // 网格高度
    uMin: -6.13,         // U分量最小值
    uMax: 10.28,         // U分量最大值
    vMin: -3.17,         // V分量最小值
    vMax: 8.98,          // V分量最大值
    speedMin: 0.02,      // 最小风速
    speedMax: 11.08,     // 最大风速
    longitude: [104, 126], // 经度范围
    latitude: [14, 31],    // 纬度范围
    source: "WRF Model",   // 数据源
    date: "2025-06-27T01:00Z" // 时间戳
}
```

### Velocity数据格式
```javascript
[
    {
        header: {
            parameterCategory: 2,
            parameterNumber: 2,    // U分量
            dx: lonStep,          // 经度步长
            dy: latStep,          // 纬度步长
            la1: maxLat,          // 北边界
            la2: minLat,          // 南边界
            lo1: minLon,          // 西边界
            lo2: maxLon,          // 东边界
            nx: width,            // 网格宽度
            ny: height            // 网格高度
        },
        data: uData              // U分量数据数组
    },
    {
        header: { /* V分量头信息 */ },
        data: vData              // V分量数据数组
    }
]
```