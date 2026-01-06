let map, windLayer, isWindVisible = true;

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
        // 使用节流函数平滑调整参数
        if (windLayer && !isDragging) {
            isDragging = true;
            requestAnimationFrame(() => {
                if (windLayer) {
                    windLayer.setOptions({
                        frameRate: 60,
                        particleMultiplier: 0.006,
                        globalAlpha: 0.9
                    });
                }
            });
        }
    });

    map.on('moveend', () => {
        console.log('移动结束');
        isMoving = false;
        isDragging = false;
        // 使用节流函数平滑恢复
        requestAnimationFrame(() => {
            if (windLayer && !isMoving) {
                windLayer.setOptions({
                    frameRate: 60,
                    particleMultiplier: 0.006,
                    globalAlpha: 0.9
                });
            }
        });
    });

    map.on('zoomstart', () => {
        console.log('开始缩放');
        if (windLayer) {
            windLayer.setOptions({
                frameRate: 24,
                particleMultiplier: 0.001
            });
        }
    });

    map.on('zoomend', () => {
        console.log('缩放结束');
        setTimeout(() => {
            if (windLayer) {
                windLayer.setOptions({
                    frameRate: 60,
                    particleMultiplier: 0.006
                });
            }
        }, 300);
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

// 加载原始JSON数据
async function loadWindData() {
    try {
        const response = await fetch('data/output_json/outputV2.json');
        const rawData = await response.json();

        console.log('原始数据加载完成', rawData);

        // 解析数据
        const windData = parseRawData(rawData);
        const velocityData = convertToVelocityFormat(windData);

        if (windLayer) map.removeLayer(windLayer);

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
            particleMultiplier: 3000/500/1000,
            frameRate: 60,
            colorScale: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#fee08b', '#fdae61', '#f46d43', '#d53e4f'],
            minVelocity: 0,
            maxVelocity: windData.speedMax,
            globalAlpha: 0.9
        }).addTo(map);

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
        map.off('zoomend');
        let lastZoom = map.getZoom();
        map.on('zoomend', function() {
            const currentZoom = map.getZoom();
            const currentBounds = map.getBounds();

            if (currentZoom < lastZoom && !bounds.contains(currentBounds)) {
                map.fitBounds(bounds);
            }
            lastZoom = currentZoom;
        });

        map.fitBounds(bounds, { padding: [10, 10] });

        // 更新信息显示
        updateDataInfo(windData);

        // 更新时间选择器
        updateTimeSelector(rawData);

        console.log('风场数据加载完成');

    } catch (error) {
        console.error('加载数据失败:', error);
        alert('加载风场数据失败，请检查数据文件是否存在');
    }
}

// 解析原始数据格式
function parseRawData(rawData) {
    const variables = rawData.variables;
    const lonData = variables.lon.data;
    const latData = variables.lat.data;

    // U10和V10是三维数组[time, lat, lon]
    const u10_3d = variables.U10.data[0]; // 第一个时间点 [lat, lon]
    const v10_3d = variables.V10.data[0]; // 第一个时间点 [lat, lon]

    console.log('数据结构:', {
        lon: lonData.length,
        lat: latData.length,
        u10_rows: u10_3d.length,
        u10_cols: u10_3d[0].length,
        v10_rows: v10_3d.length,
        v10_cols: v10_3d[0].length
    });

    // 将二维网格数据展平为一维数组
    const u10Data = [];
    const v10Data = [];

    for (let lat = 0; lat < latData.length; lat++) {
        for (let lon = 0; lon < lonData.length; lon++) {
            u10Data.push(u10_3d[lat][lon]);
            v10Data.push(v10_3d[lat][lon]);
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
        totalPoints: u10Data.length
    };
}

// 转换为leaflet-velocity格式
function convertToVelocityFormat(windData) {
    const lonStep = (windData.lonMax - windData.lonMin) / (windData.width - 1);
    const latStep = (windData.latMax - windData.latMin) / (windData.height - 1);

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
                ny: windData.height
            },
            data: windData.u10Data
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
                ny: windData.height
            },
            data: windData.v10Data
        }
    ];
}

// 更新数据信息显示
function updateDataInfo(windData) {
    document.getElementById('dataInfo').innerHTML = `
        <div><strong>📊 数据源:</strong> NetCDF 原始数据</div>
        <div><strong>📅 当前时间:</strong> 2025-06-27 01:00 UTC</div>
        <div><strong>💨 风速范围:</strong> ${windData.speedMin.toFixed(2)} - ${windData.speedMax.toFixed(2)} m/s</div>
        <div><strong>🌍 经纬度:</strong> ${windData.lonMin.toFixed(1)}°-${windData.lonMax.toFixed(1)}°E, ${windData.latMin.toFixed(1)}°-${windData.latMax.toFixed(1)}°N</div>
        <div><strong>📏 网格尺寸:</strong> ${windData.width} × ${windData.height}</div>
        <div><strong>🔢 数据点数:</strong> ${windData.totalPoints.toLocaleString()}</div>
    `;
}

// 更新时间选择器
function updateTimeSelector(rawData) {
    const select = document.getElementById('timeSelect');
    select.innerHTML = '<option value="0" selected>2025-06-27 01:00 UTC</option>';

    // 如果有多个时间点，可以在这里添加
    const timeCount = rawData.variables.U10.data.length;
    for (let i = 1; i < timeCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `时间点 ${i + 1}`;
        select.appendChild(option);
    }
}

// 设置控制面板
function setupControls() {
    // 控制面板切换
    document.getElementById('controlToggle').addEventListener('click', function() {
        const panel = document.getElementById('controlPanel');
        panel.classList.toggle('collapsed');
        this.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    });

    // 时间选择
    document.getElementById('timeSelect').addEventListener('change', function() {
        // 这里可以实现切换不同时间点的逻辑
        console.log('选择时间点:', this.value);
    });

    // 粒子数量
    document.getElementById('particleSlider').addEventListener('input', function() {
        const value = this.value;
        document.getElementById('particleCount').textContent = value;
        if (windLayer) {
            // 根据滑块值计算粒子倍数
            const multiplier = value / 1000000; // 2000 -> 0.002
            windLayer.setOptions({ particleMultiplier: multiplier });
        }
    });

    // 速度倍数
    document.getElementById('speedSlider').addEventListener('input', function() {
        const value = parseFloat(this.value);
        document.getElementById('speedFactor').textContent = value.toFixed(1);
        if (windLayer) {
            windLayer.setOptions({ velocityScale: 0.01 * value });
        }
    });

    // 风场显示/隐藏
    document.getElementById('toggleWind').addEventListener('click', function() {
        if (windLayer) {
            if (isWindVisible) {
                map.removeLayer(windLayer);
                this.textContent = '👀 显示风场';
                isWindVisible = false;
            } else {
                map.addLayer(windLayer);
                this.textContent = '🙈 隐藏风场';
                isWindVisible = true;
            }
        }
    });
}

// 初始化应用
function init() {
    initMap();
    setupControls();
    loadWindData();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
