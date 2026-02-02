let map, windLayer, isWindVisible = true;

let availableDataFiles = [];
let currentDataFile = null;
let currentWindData = null; // 存储当前风场数据用于导出

// 获取可用的JSON数据文件列表
async function loadAvailableDataFiles() {
    console.log('开始加载可用数据文件列表...');
    try {
        // 尝试读取目录中的文件列表
        const response = await fetch('../../data/output_json/');
        console.log('目录响应状态:', response.status);
        const text = await response.text();
        console.log('目录响应内容长度:', text.length);

        // 解析HTML目录列表，提取JSON文件
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = doc.querySelectorAll('a[href$=".json"]');
        console.log('找到的JSON文件数量:', links.length);

        availableDataFiles = Array.from(links).map(link => {
            const filename = link.getAttribute('href');
            return {
                filename: filename,
                displayName: filename.replace('.json', '').replace(/[_-]/g, ' ')
            };
        });

        updateDataFileSelector();

    } catch (error) {
        console.warn('无法自动获取文件列表，使用默认文件:', error);
        // 如果无法获取目录列表，使用默认文件
        availableDataFiles = [
            { filename: 'outputV2.json', displayName: 'outputV2' }
        ];
        updateDataFileSelector();
    }
}

// 更新数据文件选择器
function updateDataFileSelector() {
    const selector = document.getElementById('dataFileSelect');
    selector.innerHTML = '<option value="">选择数据文件...</option>';

    availableDataFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file.filename;
        option.textContent = file.displayName;
        selector.appendChild(option);
    });

    // 默认选择第一个文件
    if (availableDataFiles.length > 0) {
        selector.value = availableDataFiles[0].filename;
        currentDataFile = availableDataFiles[0].filename;
        loadWindData(currentDataFile);
    }
}

// 初始化地图
function initMap() {
    map = L.map('map', {
        center: [22.5, 115],
        zoom: 6,
        preferCanvas: true,
        renderer: L.canvas(),
        maxBoundsViscosity: 1.0,
        zoomAnimation: true,
        fadeAnimation: false,      // 禁用淡入动画以提高性能
        markerZoomAnimation: false, // 禁用标记缩放动画
        inertia: true,
        worldCopyJump: false,
        // 添加拖拽优化
        inertiaDeceleration: 3000,  // 增加惯性减速
        inertiaMaxSpeed: 1500,      // 限制最大惯性速度
        zoomSnap: 0.5,              // 缩放步长
        wheelPxPerZoomLevel: 120    // 鼠标滚轮灵敏度
    });

    // 高德卫星地图 - 优化缓存和预加载
    const tileLayer = L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
        subdomains: ['1', '2', '3', '4'],
        attribution: '© 高德地图',
        maxZoom: 18,
        keepBuffer: 4,        // 减少缓存瓦片数量
        updateWhenZooming: false, // 缩放时不更新
        updateWhenIdle: true,     // 空闲时更新
        crossOrigin: true
    }).addTo(map);

    // 添加性能监控
    let frameCount = 0;
    let lastTime = performance.now();

    function monitorPerformance() {
        frameCount++;
        const currentTime = performance.now();

        if (currentTime - lastTime >= 1000) {
            const fps = Math.round(frameCount * 1000 / (currentTime - lastTime));
            console.log(`实际FPS: ${fps}, 内存使用: ${(performance.memory?.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB`);
            frameCount = 0;
            lastTime = currentTime;
        }

        requestAnimationFrame(monitorPerformance);
    }

    // 监控地图事件 - 优化拖拽性能
    let isDragging = false;
    let isMoving = false;

    map.on('movestart', () => {
        console.log('开始移动');
        isMoving = true;
    });

    map.on('moveend', () => {
        console.log('移动结束');
        isMoving = false;
        isDragging = false;
    });

    map.on('zoomstart', () => {
        console.log('开始缩放');
    });

    map.on('zoomend', () => {
        console.log('缩放结束');
    });

    monitorPerformance();

    // 添加鼠标坐标显示
    const coordsControl = L.control({ position: 'bottomleft' });
    coordsControl.onAdd = function() {
        const div = L.DomUtil.create('div', 'coords-control');
        div.style.cssText = 'background: rgba(255,255,255,0.9); padding: 5px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 5px;';
        div.innerHTML = '经度: --, 纬度: --';
        return div;
    };
    coordsControl.addTo(map);

    map.on('mousemove', function(e) {
        const lat = e.latlng.lat.toFixed(4);
        const lng = e.latlng.lng.toFixed(4);
        document.querySelector('.coords-control').innerHTML = `经度: ${lng}°, 纬度: ${lat}°`;
    });
}

// 加载风场数据（统一函数）
async function loadWindData(filename = 'outputV2.json', timeIndex = 0) {
    console.log('loadWindData 被调用, filename:', filename, 'timeIndex:', timeIndex);
    try {
        const dataUrl = `../../data/output_json/${filename}`;
        console.log('正在请求数据文件:', dataUrl);
        const response = await fetch(dataUrl);
        console.log('数据文件响应状态:', response.status);
        const rawData = await response.json();

        console.log('原始数据加载完成', rawData);
        console.log('加载时间点:', timeIndex);

        // 解析数据，支持指定时间索引
        const windData = parseRawData(rawData, timeIndex);
        const velocityData = convertToVelocityFormat(windData);

        // 保存当前风场数据用于导出
        currentWindData = windData;

        if (windLayer) map.removeLayer(windLayer);

        // 计算基于地理空间的粒子密度
        const calculateParticleDensity = () => {
            const zoom = map.getZoom();
            const bounds = map.getBounds();
            const viewArea = (bounds.getEast() - bounds.getWest()) * (bounds.getNorth() - bounds.getSouth());
            
            // 基础粒子密度：每平方度约100个粒子
            const baseParticlesPerSquareDegree = 100;
            const targetParticles = Math.max(500, Math.min(5000, viewArea * baseParticlesPerSquareDegree));
            
            // 转换为particleMultiplier（leaflet-velocity内部使用）
            const canvasArea = map.getSize().x * map.getSize().y;
            return targetParticles / canvasArea;
        };

        windLayer = L.velocityLayer({
            displayValues: true,
            displayOptions: {
                velocityType: 'Wind',
                position: 'bottomleft',
                emptyString: '无数据',
                showCardinal: true
            },
            data: velocityData,
            maxVelocity: windData.speedMax,
            velocityScale: 0.01,
            particleAge: 60,
            lineWidth: 1,
            particleMultiplier: calculateParticleDensity(),
            frameRate: 60,
            colorScale: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#fee08b', '#fdae61', '#f46d43', '#d53e4f'],
            minVelocity: 0,
            globalAlpha: 0.9,
            // 禁用插值，使用真实数据点
            interpolate: false
        }).addTo(map);

        // 监听地图缩放和移动事件，动态调整粒子密度
        const updateParticleDensity = () => {
            if (windLayer) {
                const newDensity = calculateParticleDensity();
                windLayer.setOptions({
                    particleMultiplier: newDensity
                });
                console.log(`缩放级别: ${map.getZoom()}, 粒子密度: ${newDensity.toFixed(6)}`);
            }
        };

        map.off('zoomend moveend');
        map.on('zoomend', updateParticleDensity);
        map.on('moveend', updateParticleDensity);

        // 设置地图边界和中心点
        const bounds = L.latLngBounds(
            [windData.latMin, windData.lonMin],
            [windData.latMax, windData.lonMax]
        );

        map.setMaxBounds(bounds);
        map.setMinZoom(7);
        map.setMaxZoom(15);

        // 动态计算并设置地图中心点
        const centerLat = (windData.latMin + windData.latMax) / 2;
        const centerLon = (windData.lonMin + windData.lonMax) / 2;
        map.setView([centerLat, centerLon], 6);

        // 监听缩放事件，只在缩小超出边界时限制
        let lastZoom = map.getZoom();
        map.on('zoom', function() {
            const currentZoom = map.getZoom();
            const currentBounds = map.getBounds();

            if (currentZoom < lastZoom && !bounds.contains(currentBounds)) {
                map.fitBounds(bounds);
            }
            lastZoom = currentZoom;
        });

        map.fitBounds(bounds, { padding: [10, 10] });

        // 更新信息显示
        updateDataInfo(windData, filename, timeIndex);

        // 更新时间选择器
        updateTimeSelector(rawData);

        console.log('风场数据加载完成');

    } catch (error) {
        console.error('加载数据失败:', error);
        alert(`加载风场数据失败: ${filename} 时间点 ${timeIndex + 1}，请检查数据文件是否存在`);
    }
}

// 解析原始数据格式（统一函数）
function parseRawData(rawData, timeIndex = 0) {
    const variables = rawData.variables;
    const lonData = variables.lon.data;
    const latData = variables.lat.data;

    // 检查时间索引是否有效
    if (timeIndex >= variables.U10.data.length || timeIndex < 0) {
        console.warn(`时间索引 ${timeIndex} 超出范围，使用默认时间点 0`);
        timeIndex = 0;
    }

    // U10和V10是三维数组[time, lat, lon]
    const u10_3d = variables.U10.data[timeIndex]; // 指定时间点 [lat, lon]
    const v10_3d = variables.V10.data[timeIndex]; // 指定时间点 [lat, lon]

    console.log('数据结构:', {
        lon: lonData.length,
        lat: latData.length,
        u10_rows: u10_3d.length,
        u10_cols: u10_3d[0].length,
        v10_rows: v10_3d.length,
        v10_cols: v10_3d[0].length,
        timeIndex: timeIndex
    });

    // 检测网格分布是否均匀
    const checkGridUniformity = (coords, name) => {
        if (coords.length < 2) return { isUniform: true, avgStep: 0 };
        
        const steps = [];
        for (let i = 0; i < coords.length - 1; i++) {
            steps.push(Math.abs(coords[i + 1] - coords[i]));
        }
        
        const avgStep = steps.reduce((a, b) => a + b) / steps.length;
        const variance = steps.reduce((sum, step) => sum + Math.pow(step - avgStep, 2), 0) / steps.length;
        const stdDev = Math.sqrt(variance);
        
        // 如果标准差小于平均步长的1%认为是均匀的
        const isUniform = stdDev < Math.abs(avgStep * 0.01);
        
        return { isUniform, avgStep, stdDev, steps };
    };
    
    const lonGridInfo = checkGridUniformity(lonData, 'longitude');
    const latGridInfo = checkGridUniformity(latData, 'latitude');
    
    if (!lonGridInfo.isUniform || !latGridInfo.isUniform) {
        console.warn('检测到非均匀网格分布:', {
            lon: { isUniform: lonGridInfo.isUniform, stdDev: lonGridInfo.stdDev },
            lat: { isUniform: latGridInfo.isUniform, stdDev: latGridInfo.stdDev }
        });
    }

    // 将二维网格数据展平为一维数组
    const u10Data = [];
    const v10Data = [];

    // 按照leaflet-velocity期望的顺序：从北到南，从西到东
    // 遍历顺序：纬度从大到小（北到南），经度从小到大（西到东）
    for (let latIdx = 0; latIdx < latData.length; latIdx++) {
        for (let lonIdx = 0; lonIdx < lonData.length; lonIdx++) {
            // 从北到南的顺序，所以纬度索引对应latData[latIdx]（从0到length-1是纬度从大到小）
            // 但如果我们数据中latData数组本身是从小到大排列的，我们需要调整
            const uValue = u10_3d[latIdx][lonIdx];
            const vValue = v10_3d[latIdx][lonIdx];
            u10Data.push(uValue);
            v10Data.push(vValue);
        }
    }

    // 计算统计值
    const uMin = Math.min(...u10Data);
    const uMax = Math.max(...u10Data);
    const vMin = Math.min(...v10Data);
    const vMax = Math.max(...v10Data);

    // 计算风速
    const speeds = u10Data.map((u, i) => Math.sqrt(u * u + v10Data[i] * v10Data[i]));
    const speedMin = Math.min(...speeds);
    const speedMax = Math.max(...speeds);

    console.log('统计值:', { uMin, uMax, vMin, vMax, speedMin, speedMax });

    return {
        width: lonData.length,
        height: latData.length,
        lonData: lonData,
        latData: latData,
        u10Data: u10Data,
        v10Data: v10Data,
        lonMin: Math.min(...lonData),
        lonMax: Math.max(...lonData),
        latMin: Math.min(...latData),
        latMax: Math.max(...latData),
        uMin: uMin,
        uMax: uMax,
        vMin: vMin,
        vMax: vMax,
        speedMin: speedMin,
        speedMax: speedMax,
        totalPoints: u10Data.length,
        // 添加网格分布信息
        lonGridInfo: lonGridInfo,
        latGridInfo: latGridInfo,
        timeIndex: timeIndex
    };
}

// 转换为leaflet-velocity格式（禁用插值版本）
function convertToVelocityFormat(windData) {
    // 使用真实的网格坐标而不是均匀插值
    const lonStep = windData.lonGridInfo.isUniform ? windData.lonGridInfo.avgStep : 
                   (windData.lonMax - windData.lonMin) / (windData.width - 1);
    const latStep = windData.latGridInfo.isUniform ? windData.latGridInfo.avgStep : 
                   (windData.latMax - windData.latMin) / (windData.height - 1);

    return [
        {
            header: {
                parameterCategory: 2,
                parameterNumber: 2,
                dx: lonStep,
                dy: latStep,
                la1: windData.latMax,
                la2: windData.latMin,
                lo1: windData.lonMin,
                lo2: windData.lonMax,
                nx: windData.width,
                ny: windData.height,
                // 标记为非均匀网格，禁用插值
                nonUniformGrid: !windData.lonGridInfo.isUniform || !windData.latGridInfo.isUniform
            },
            data: windData.u10Data,
            // 保留实际坐标信息用于精确定位
            lonCoords: windData.lonData,
            latCoords: windData.latData
        },
        {
            header: {
                parameterCategory: 2,
                parameterNumber: 3,
                dx: lonStep,
                dy: latStep,
                la1: windData.latMax,
                la2: windData.latMin,
                lo1: windData.lonMin,
                lo2: windData.lonMax,
                nx: windData.width,
                ny: windData.height,
                nonUniformGrid: !windData.lonGridInfo.isUniform || !windData.latGridInfo.isUniform
            },
            data: windData.v10Data,
            lonCoords: windData.lonData,
            latCoords: windData.latData
        }
    ];
}

// 更新数据信息显示
function updateDataInfo(windData, filename, timeIndex = 0) {
    document.getElementById('dataInfo').innerHTML = `
        <div><strong>📊 数据源:</strong> ${filename || 'NetCDF 原始数据'}</div>
        <div><strong>📅 当前时间:</strong> 时间点 ${timeIndex + 1}</div>
        <div><strong>💨 风速范围:</strong> ${windData.speedMin.toFixed(2)} - ${windData.speedMax.toFixed(2)} m/s</div>
        <div><strong>🌍 经纬度:</strong> ${windData.lonMin.toFixed(1)}°-${windData.lonMax.toFixed(1)}°E, ${windData.latMin.toFixed(1)}°-${windData.latMax.toFixed(1)}°N</div>
        <div><strong>📏 网格尺寸:</strong> ${windData.width} × ${windData.height}</div>
        <div><strong>🔢 数据点数:</strong> ${windData.totalPoints.toLocaleString()}</div>
        <div><strong>📏 网格均匀性:</strong> 经度: ${windData.lonGridInfo.isUniform ? '是' : '否'}, 纬度: ${windData.latGridInfo.isUniform ? '是' : '否'}</div>
        <div><strong>🎯 插值状态:</strong> <span style="color: #d53e4f;">已禁用</span> (使用真实数据点)</div>
        <div><strong>🔵 粒子分布:</strong> <span style="color: #4CAF50;">基于地理空间</span></div>
    `;
}

// 更新时间选择器
function updateTimeSelector(rawData) {
    const select = document.getElementById('timeSelect');
    select.innerHTML = '<option value="0" selected>时间点 1</option>';

    // 如果有多个时间点，可以在这里添加
    const timeCount = rawData.variables.U10.data.length;
    for (let i = 1; i < timeCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `时间点 ${i + 1}`;
        select.appendChild(option);
    }
}

// 导出风场数据为JSON格式
function exportWindData() {
    if (!currentWindData) {
        alert('请先加载风场数据');
        return;
    }

    // 创建包含风速、风向、坐标和UV分量的二维数组
    const windFieldData = [];
    const { width, height, lonData, latData, u10Data, v10Data } = currentWindData;

    for (let row = 0; row < height; row++) {
        const rowData = [];
        for (let col = 0; col < width; col++) {
            const index = row * width + col;
            const u = u10Data[index];
            const v = v10Data[index];
            const speed = Math.sqrt(u * u + v * v);
            // 计算风向（度数，从正北方向顺时针测量）- 使用气象学标准公式
            // 气象学中风向是指风的来向，0度是北风，90度是东风
            // 使用atan2(u, v)而不是atan2(v, u)，这是气象学标准
            let direction = (180 + Math.atan2(u, v) * 180 / Math.PI) % 360;
            if (direction < 0) {
                direction += 360;
            }
            
            rowData.push({
                lon: lonData[col],
                lat: latData[row],
                u: u,
                v: v,
                speed: speed,
                direction: direction
            });
        }
        windFieldData.push(rowData);
    }

    // 创建导出数据对象
    const exportData = {
        metadata: {
            width: width,
            height: height,
            totalPoints: width * height,
            timeIndex: currentWindData.timeIndex,
            bounds: {
                minLon: currentWindData.lonMin,
                maxLon: currentWindData.lonMax,
                minLat: currentWindData.latMin,
                maxLat: currentWindData.latMax
            }
        },
        windData: windFieldData
    };

    // 将数据转换为JSON字符串
    const jsonData = JSON.stringify(exportData, null, 2);

    // 创建下载链接
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wind_field_data_time_${currentWindData.timeIndex}.json`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async function() {
    initMap();
    await loadAvailableDataFiles();

    // 自动加载第一个可用的数据文件
    if (availableDataFiles.length > 0) {
        const defaultFile = availableDataFiles[0].filename;
        document.getElementById('dataFileSelect').value = defaultFile;
        currentDataFile = defaultFile;
        loadWindData(defaultFile);
    }

    // 添加控制面板事件监听器
    document.getElementById('dataFileSelect').addEventListener('change', function() {
        if (this.value) {
            currentDataFile = this.value;
            loadWindData(this.value);
        }
    });

    document.getElementById('timeSelect').addEventListener('change', function() {
        if (currentDataFile) {
            loadWindData(currentDataFile, parseInt(this.value));
        }
    });

    document.getElementById('particleSlider').addEventListener('input', function() {
        document.getElementById('particleCount').textContent = this.value;
        if (windLayer) {
            // 使用新的基于地理空间的粒子密度计算
            const zoom = map.getZoom();
            const bounds = map.getBounds();
            const viewArea = (bounds.getEast() - bounds.getWest()) * (bounds.getNorth() - bounds.getSouth());
            const baseParticlesPerSquareDegree = parseInt(this.value) / 20; // 根据滑块值调整基础密度
            const targetParticles = Math.max(500, Math.min(5000, viewArea * baseParticlesPerSquareDegree));
            const canvasArea = map.getSize().x * map.getSize().y;
            const particleMultiplier = targetParticles / canvasArea;
            
            windLayer.setOptions({
                particleMultiplier: particleMultiplier
            });
        }
    });

    document.getElementById('speedSlider').addEventListener('input', function() {
        document.getElementById('speedFactor').textContent = this.value;
        if (windLayer) {
            windLayer.setOptions({
                velocityScale: parseFloat(this.value) * 0.01
            });
        }
    });

    document.getElementById('toggleWind').addEventListener('click', function() {
        if (windLayer) {
            if (isWindVisible) {
                map.removeLayer(windLayer);
                this.textContent = '🙈 显示风场';
                isWindVisible = false;
            } else {
                windLayer.addTo(map);
                this.textContent = '🙈 隐藏风场';
                isWindVisible = true;
            }
        }
    });

    // 添加导出风场数据按钮的事件监听器
    document.getElementById('downloadData').addEventListener('click', exportWindData);

    // 控制面板折叠功能
    document.getElementById('controlToggle').addEventListener('click', function() {
        const panel = document.getElementById('controlPanel');
        panel.classList.toggle('collapsed');
        this.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    });
});
