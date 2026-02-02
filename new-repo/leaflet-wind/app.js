let map, windLayer, isWindVisible = true;

// 初始化地图
function initMap() {
    map = L.map('map', {
        center: [22.5, 115],
        zoom: 6,
        preferCanvas: true,
        renderer: L.canvas(),
        maxBoundsViscosity: 1.0 // 设置边界粘性，防止超出边界
    });

    // 高德卫星地图
    L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
        subdomains: ['1', '2', '3', '4'],
        attribution: '© 高德地图',
        maxZoom: 18
    }).addTo(map);

    // 添加地图事件监听，在交互时暂停风场动画
    let interactionTimeout;

    map.on('movestart zoomstart', function() {
        if (windLayer && isWindVisible) {
            windLayer.setOptions({ frameRate: 30 }); // 降低帧率
        }
    });

    map.on('moveend zoomend', function() {
        clearTimeout(interactionTimeout);
        interactionTimeout = setTimeout(() => {
            if (windLayer && isWindVisible) {
                windLayer.setOptions({ frameRate: 60 }); // 恢复帧率
            }
        }, 300);
    });

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

// 加载可用时间列表
async function loadTimeList() {
    const timeFiles = [
        '2025062701', '2025062703', '2025062704', '2025062706', '2025062707'
    ];

    const select = document.getElementById('timeSelect');
    timeFiles.forEach(time => {
        const option = document.createElement('option');
        option.value = time;
        option.textContent = `${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6,8)} ${time.slice(8,10)}:00`;
        select.appendChild(option);
    });

    // 默认选择第一个
    select.value = timeFiles[0];
    loadWindData(timeFiles[0]);
}

// 加载风场数据
async function loadWindData(timeCode) {
    console.log('加载风场图')
    try {
        const jsonPath = `../../data/wind_data/wrf_data/${timeCode}.json`;
        const pngPath = `../../data/wind_data/wrf_data/${timeCode}.png`;

        const response = await fetch(jsonPath);
        const metadata = await response.json();

        const windData = await loadPngData(pngPath, metadata);
        const velocityData = convertToVelocityFormat(metadata, windData);

        if (windLayer) map.removeLayer(windLayer);

        windLayer = L.velocityLayer({
            displayValues: true,
            displayOptions: {
                velocityType: 'Wind',
                position: 'bottomleft',
                emptyString: '无数据',
                displayEmptyString: '无风',
                showCardinal: true
            },
            data: velocityData,
            maxVelocity: metadata.speedMax,
            velocityScale: 0.005,
            particleAge: 60,
            lineWidth: 1,
            particleMultiplier: 3000/500/1000,
            frameRate: 60,
            colorScale: ['#3288bd',
                '#66c2a5',
                '#abdda4',
                '#e6f598',
                '#fee08b',
                '#fdae61',
                '#f46d43',
                '#d53e4f']
        }).addTo(map);

        // 根据数据动态设置严格边界限制
        const dataBounds = L.latLngBounds(
            [metadata.latitude[0], metadata.longitude[0]], // 西南角
            [metadata.latitude[1], metadata.longitude[1]]  // 东北角
        );

        // 计算数据中心点
        const centerLat = (metadata.latitude[0] + metadata.latitude[1]) / 2;
        const centerLon = (metadata.longitude[0] + metadata.longitude[1]) / 2;
        map.setView([centerLat, centerLon], 6);

        console.log('数据边界:', JSON.stringify(dataBounds))
        // 设置严格边界，不允许超出数据范围
        map.setMaxBounds(dataBounds);

        // 设置合适的缩放级别限制
        map.setMinZoom(5);
        map.setMaxZoom(10);

        // 监听缩放事件，只在缩小超出边界时限制
        map.off('zoomend');
        let lastZoom = map.getZoom();
        map.on('zoomend', function() {
            const currentZoom = map.getZoom();
            const currentBounds = map.getBounds();
            console.log('当前边界:', JSON.stringify(currentZoom))
            console.log('数据边界:', JSON.stringify(currentBounds))

            // 只在缩小且超出边界时才调整
            if (currentZoom < lastZoom && !dataBounds.contains(currentBounds)) {
                map.fitBounds(dataBounds);
            }
            lastZoom = currentZoom;
        });

        // 调整视图到数据边界
        map.fitBounds(dataBounds);

        // 更新数据信息显示
        updateDataInfo(metadata);

        console.log('风场数据加载完成');

    } catch (error) {
        console.error('加载数据失败:', error);
        alert('加载风场数据失败，请检查数据文件是否存在');
    }
}

// 加载PNG数据
function loadPngData(pngPath, metadata) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = metadata.width;
            canvas.height = metadata.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, metadata.width, metadata.height);
            const uData = [], vData = [];

            for (let i = 0; i < imageData.data.length; i += 4) {
                const r = imageData.data[i];
                const g = imageData.data[i + 1];

                const u = r / 255 * (metadata.uMax - metadata.uMin) + metadata.uMin;
                const v = g / 255 * (metadata.vMax - metadata.vMin) + metadata.vMin;

                uData.push(u);
                vData.push(v);
            }

            resolve({ u: uData, v: vData });
        };
        img.onerror = reject;
        img.src = pngPath;
    });
}

// 转换为leaflet-velocity格式
function convertToVelocityFormat(metadata, windData) {
    const { width, height, longitude, latitude } = metadata;
    const lonStep = (longitude[1] - longitude[0]) / (width - 1);
    const latStep = (latitude[1] - latitude[0]) / (height - 1);

    return [
        {
            header: {
                parameterCategory: 2, parameterNumber: 2,
                dx: lonStep, dy: latStep,
                la1: latitude[1], la2: latitude[0],
                lo1: longitude[0], lo2: longitude[1],
                nx: width, ny: height
            },
            data: windData.u
        },
        {
            header: {
                parameterCategory: 2, parameterNumber: 3,
                dx: lonStep, dy: latStep,
                la1: latitude[1], la2: latitude[0],
                lo1: longitude[0], lo2: longitude[1],
                nx: width, ny: height
            },
            data: windData.v
        }
    ];
}

// 更新数据信息显示
function updateDataInfo(metadata) {
    const dateStr = metadata.date.replace('T', ' ').replace('Z', ' UTC');
    document.getElementById('dataInfo').innerHTML = `
        <div><strong>📊 数据源:</strong> ${metadata.source}</div>
        <div><strong>📅 当前时间:</strong> ${dateStr}</div>
        <div><strong>💨 风速范围:</strong> ${metadata.speedMin.toFixed(2)} - ${metadata.speedMax.toFixed(2)} m/s</div>
        <div><strong>🌍 经纬度:</strong> ${metadata.longitude[0]}°-${metadata.longitude[1]}°E, ${metadata.latitude[0]}°-${metadata.latitude[1]}°N</div>
    `;
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
        if (this.value) loadWindData(this.value);
    });

    // 粒子数量
    document.getElementById('particleSlider').addEventListener('input', function() {
        document.getElementById('particleCount').textContent = this.value;
        if (windLayer) {
            const multiplier = this.value / 500 / 1000; // 调整系数
            windLayer.setOptions({ particleMultiplier: multiplier });
        }
    });

    // 速度倍数
    document.getElementById('speedSlider').addEventListener('input', function() {
        document.getElementById('speedFactor').textContent = this.value;
        if (windLayer) {
            windLayer.setOptions({ velocityScale: parseFloat(this.value) * 0.005 });
        }
    });

    // 切换显示
    document.getElementById('toggleWind').addEventListener('click', function() {
        if (windLayer) {
            if (isWindVisible) {
                map.removeLayer(windLayer);
                this.textContent = '🙉 显示风场';
                isWindVisible = false;
            } else {
                windLayer.addTo(map);
                this.textContent = '🙈 隐藏风场';
                isWindVisible = true;
            }
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    setupControls();
    loadTimeList();
});
