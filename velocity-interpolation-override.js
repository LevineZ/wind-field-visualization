// 覆盖leaflet-velocity的插值行为，强制使用真实数据点
(function() {
    'use strict';
    
    // 等待leaflet-velocity加载完成
    if (typeof L === 'undefined' || !L.VelocityLayer) {
        setTimeout(function checkLeafletVelocity() {
            if (typeof L === 'undefined' || !L.VelocityLayer) {
                setTimeout(checkLeafletVelocity, 100);
            } else {
                // 继续执行初始化代码
                initializeOverride();
            }
        }, 100);
        return;
    }
    
    // 直接执行初始化
    initializeOverride();
    
    function initializeOverride() {
        // 保存原始的插值函数
        const originalInterpolatePoint = L.VelocityLayer.prototype._interpolatePoint;
        
        // 覆盖插值函数，使其返回最近邻数据点而不是插值结果
        L.VelocityLayer.prototype._interpolatePoint = function(x, y, g00, g10, g01, g11) {
            // 如果设置了禁用插值选项，使用最近邻方法
            if (this.options.interpolate === false) {
                // 计算到四个网格点的距离
                const dx = x - Math.floor(x);
                const dy = y - Math.floor(y);
                
                // 选择最近的网格点
                if (dx < 0.5 && dy < 0.5) return g00;
                if (dx >= 0.5 && dy < 0.5) return g10;
                if (dx < 0.5 && dy >= 0.5) return g01;
                return g11;
            }
            
            // 否则使用原始插值方法
            return originalInterpolatePoint.call(this, x, y, g00, g10, g01, g11);
        };
        
        // 覆盖数据获取函数，支持非均匀网格
        const originalGetValueAtPoint = L.VelocityLayer.prototype._getValueAtPoint;
        
        L.VelocityLayer.prototype._getValueAtPoint = function(x, y, data) {
            // 如果数据包含实际坐标信息，使用精确查找
            if (data.lonCoords && data.latCoords) {
                return this._getValueAtPointExact(x, y, data);
            }
            
            // 否则使用原始方法
            return originalGetValueAtPoint.call(this, x, y, data);
        };
        
        // 新增精确查找方法
        L.VelocityLayer.prototype._getValueAtPointExact = function(lon, lat, data) {
            const lonCoords = data.lonCoords;
            const latCoords = data.latCoords;
            const values = data.data;
            const nx = data.header.nx;
            const ny = data.header.ny;
            
            // 找到最近的经度索引
            let lonIdx = 0;
            let minLonDist = Math.abs(lonCoords[0] - lon);
            for (let i = 1; i < lonCoords.length; i++) {
                const dist = Math.abs(lonCoords[i] - lon);
                if (dist < minLonDist) {
                    minLonDist = dist;
                    lonIdx = i;
                }
            }
            
            // 找到最近的纬度索引
            let latIdx = 0;
            let minLatDist = Math.abs(latCoords[0] - lat);
            for (let i = 1; i < latCoords.length; i++) {
                const dist = Math.abs(latCoords[i] - lat);
                if (dist < minLatDist) {
                    minLatDist = dist;
                    latIdx = i;
                }
            }
            
            // 计算数组索引并返回值
            const index = latIdx * nx + lonIdx;
            return values[index];
        };
        
        console.log('Velocity interpolation override loaded - 插值已禁用，使用真实数据点');
    }
})();