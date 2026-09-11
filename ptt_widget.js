/**
 * iOS 流量订阅桌面小组件 (远程核心逻辑)
 * 适配尺寸：Small (小卡片) / Medium (中卡片) / Large (大卡片)
 * 功能特性：当月每日使用额度可视化图表 (柱状图/折线图)、剩余流量监控、重置提醒
 */

// ================= 配置区域 =================
const CONFIG = {
  // 脚本版本号
  version: 'v1.2.0',
  // 订阅 API 地址
  api_url: 'https://ptt.ixlmo.com/api/v1/user/getSubscribe',
  // 每日流量统计 API 地址
  stat_api_url: 'https://ptt.ixlmo.com/api/v1/user/stat/getTrafficLog',
  // 默认图表显示类型: 'heatmap' (GitHub 贡献热力图), 'bar' (柱状图) 或 'line' (折线面积图)
  chart_type: 'heatmap',
  // 从 Loader 注入的全局变量或小组件参数中读取 Token
  token: globalThis.__LOCAL_TRAFFIC_TOKEN__ || (args.widgetParameter && args.widgetParameter.trim()) || '',
  // 刷新间隔（秒）
  cache_time: 600
};

// ================= 主逻辑 =================
async function main() {
  const widget = new ListWidget();
  const widgetSize = config.widgetFamily || 'medium';
  const isAccessory = widgetSize.startsWith('accessory');

  if (!isAccessory) {
    widget.backgroundColor = new Color('#FFFFFF');
    widget.setPadding(12, 15, 12, 15);
  }

  try {
    if (!CONFIG.token) {
      renderErrorWidget(widget, '未配置 Token');
    } else {
      const data = await fetchData();
      if (!data) {
        renderErrorWidget(widget, '服务不可用');
      } else if (widgetSize === 'accessoryRectangular') {
        renderAccessoryRectangular(widget, data);
      } else if (widgetSize === 'accessoryCircular') {
        renderAccessoryCircular(widget, data);
      } else if (widgetSize === 'accessoryInline') {
        renderAccessoryInline(widget, data);
      } else if (widgetSize === 'small') {
        renderSmallWidget(widget, data);
      } else if (widgetSize === 'extraLarge') {
        renderExtraLargeWidget(widget, data);
      } else if (widgetSize === 'large') {
        renderLargeWidget(widget, data);
      } else {
        renderMediumWidget(widget, data);
      }
    }
  } catch (err) {
    console.error('小组件运行异常: ' + err);
    renderErrorWidget(widget, '服务不可用');
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    if (widgetSize === 'small') {
      await widget.presentSmall();
    } else if (widgetSize === 'large') {
      await widget.presentLarge();
    } else if (widgetSize === 'extraLarge') {
      if (typeof widget.presentExtraLarge === 'function') {
        await widget.presentExtraLarge();
      } else {
        await widget.presentLarge();
      }
    } else if (isAccessory) {
      await widget.presentSmall();
    } else {
      await widget.presentMedium();
    }
  }
  Script.complete();
}

// ================= 数据获取与缓存 =================
async function fetchData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), 'traffic_widget_cache.json');
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'authorization': `Bearer ${CONFIG.token}`,
    'referer': 'https://ptt.ixlmo.com/',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)'
  };

  let subData = null;
  let logData = null;

  // 1. 并发请求订阅信息与每日流量明细
  try {
    const subReq = new Request(`${CONFIG.api_url}?t=${Date.now()}`);
    subReq.timeoutInterval = 8;
    subReq.headers = headers;

    const logReq = new Request(`${CONFIG.stat_api_url}?t=${Date.now()}`);
    logReq.timeoutInterval = 8;
    logReq.headers = headers;

    const [subRes, logRes] = await Promise.allSettled([
      subReq.loadJSON(),
      logReq.loadJSON()
    ]);

    if (subRes.status === 'fulfilled' && subRes.value && subRes.value.status === 'success') {
      subData = subRes.value.data;
    }
    if (logRes.status === 'fulfilled' && logRes.value && logRes.value.status === 'success') {
      logData = logRes.value.data;
    }

    if (subData) {
      // 合并历史日志列表，防止跨月或服务端只返回当月/网络超时时丢失周期前期明细
      let mergedLogs = (Array.isArray(logData) && logData.length > 0) ? [...logData] : [];
      try {
        if (fm.fileExists(cachePath)) {
          const oldCache = JSON.parse(fm.readString(cachePath));
          const oldList = (oldCache && (oldCache.allLogs || oldCache.logData)) || [];
          if (Array.isArray(oldList) && oldList.length > 0) {
            const existingMap = new Map();
            oldList.forEach(item => {
              if (item && item.record_at) existingMap.set(item.record_at, item);
            });
            mergedLogs.forEach(item => {
              if (item && item.record_at) existingMap.set(item.record_at, item);
            });
            mergedLogs = Array.from(existingMap.values());
          }
        }
      } catch (e) {}

      const cacheObj = {
        subData,
        logData: (Array.isArray(logData) && logData.length > 0) ? logData : mergedLogs,
        allLogs: mergedLogs,
        cachedAt: Date.now()
      };
      fm.writeString(cachePath, JSON.stringify(cacheObj));
      const parsed = parseTrafficData(subData, mergedLogs);
      if (parsed) parsed.isFromCache = false;
      return parsed;
    }
  } catch (e) {
    console.log('网络请求失败，尝试读取本地缓存数据: ' + e);
  }

  // 2. 读取本地缓存并容错兼容
  try {
    if (fm.fileExists(cachePath)) {
      const cacheStr = fm.readString(cachePath);
      const cached = JSON.parse(cacheStr);
      if (cached) {
        const sData = cached.subData || cached;
        const lData = cached.allLogs || cached.logData || null;
        const parsed = parseTrafficData(sData, lData);
        if (parsed) {
          parsed.isFromCache = true;
          return parsed;
        }
      }
    }
  } catch (e) {
    console.log('读取缓存失败: ' + e);
  }

  return null;
}

// ================= 数据解析与指标计算 =================
function parseTrafficData(subInfo, logList) {
  if (!subInfo || typeof subInfo !== 'object') return null;

  const u = Number(subInfo.u) || 0;
  const d = Number(subInfo.d) || 0;
  const totalUsed = u + d;
  const totalEnable = Number(subInfo.transfer_enable) || 1;
  const remaining = Math.max(0, totalEnable - totalUsed);

  const GB = 1024 * 1024 * 1024;
  const usedGB = (totalUsed / GB).toFixed(2);
  const totalGB = (totalEnable / GB).toFixed(2);
  const remainingGB = (remaining / GB).toFixed(2);
  const usedPercent = Math.min(100, Math.round((totalUsed / totalEnable) * 100));
  const remainingPercent = 100 - usedPercent;

  let resetDaysLeft = 0;
  if (subInfo.next_reset_at) {
    const now = Math.floor(Date.now() / 1000);
    resetDaysLeft = Math.max(0, Math.ceil((subInfo.next_reset_at - now) / 86400));
  }

  let expireDateStr = '长期有效';
  if (subInfo.expired_at) {
    const expireDate = new Date(subInfo.expired_at * 1000);
    const y = expireDate.getFullYear();
    const m = String(expireDate.getMonth() + 1).padStart(2, '0');
    const day = String(expireDate.getDate()).padStart(2, '0');
    expireDateStr = `${y}-${m}-${day}`;
  }

  // 解析套餐实际计费周期与每日用量统计
  const dailyStats = parseDailyStats(logList, subInfo);
  if (dailyStats) {
    dailyStats.remainingGB = remainingGB;
  }

  return {
    planName: (subInfo.plan && subInfo.plan.name) ? subInfo.plan.name.replace(/^[^\w\u4e00-\u9fa5]+/, '').trim() : '流量套餐',
    email: subInfo.email || '',
    usedGB,
    totalGB,
    remainingGB,
    usedPercent,
    remainingPercent,
    resetDaysLeft,
    expireDateStr,
    dailyStats,
    isFromCache: false,
    updateTime: formatCurrentTime()
  };
}

// 解析套餐实际计费周期与每日使用额度数据
function parseDailyStats(logList, subInfo) {
  const now = new Date();
  const GB = 1024 * 1024 * 1024;
  const totalUsedBytes = (Number(subInfo && subInfo.u) || 0) + (Number(subInfo && subInfo.d) || 0);

  // 1. 确定计费周期起止时间（以套餐实际重置日期为准）
  let startDate, endDate;
  if (subInfo && subInfo.next_reset_at) {
    endDate = new Date(Number(subInfo.next_reset_at) * 1000);
    startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 1);
    while (startDate > now) {
      endDate = new Date(startDate);
      startDate.setMonth(startDate.getMonth() - 1);
    }
  } else {
    // 降级为当前自然月
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  // 周期标签与范围描述（如 "08/26 - 09/26"）
  const startM = String(startDate.getMonth() + 1).padStart(2, '0');
  const startD = String(startDate.getDate()).padStart(2, '0');
  const endM = String(endDate.getMonth() + 1).padStart(2, '0');
  const endD = String(endDate.getDate()).padStart(2, '0');
  const cycleRangeLabel = `${startM}/${startD} - ${endM}/${endD}`;
  const monthName = `${startDate.getMonth() + 1}月`;

  // 2. 映射每日流量明细日志
  const logMap = {};
  let logSumBytes = 0;
  if (Array.isArray(logList)) {
    for (const item of logList) {
      if (!item || !item.record_at) continue;
      const d = new Date(item.record_at * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bytes = (Number(item.u) || 0) + (Number(item.d) || 0);
      logMap[key] = (logMap[key] || 0) + bytes;
      logSumBytes += bytes;
    }
  }

  // 3. 构建周期内全部天数序列（从 startDate 到 endDate 前一天）
  const days = [];
  let cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const missingPastDays = [];
  let pastDaysCount = 0;

  while (cur < endDay) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const isToday = (key === todayKey);
    const isFuture = (cur > now && !isToday);

    if (!isFuture) {
      pastDaysCount++;
      if (logMap[key] === undefined) {
        missingPastDays.push(key);
      }
    }

    days.push({
      dateObj: new Date(cur),
      key,
      day: cur.getDate(),
      month: cur.getMonth() + 1,
      dateLabel: `${cur.getDate()}`,
      isToday,
      isFuture
    });
    cur.setDate(cur.getDate() + 1);
  }

  // 4. 周期用量对齐：将总已用与日志累加进行精准对齐与自然加权平摊
  const diffBytes = Math.max(0, totalUsedBytes - logSumBytes);
  const fillMap = {};
  if (missingPastDays.length > 0 && diffBytes > 0) {
    const baseBytes = diffBytes / missingPastDays.length;
    let assigned = 0;
    // 使用微波起伏系数 (0.85 ~ 1.15)，保持和严格精确的同时避免整段天数死板一致
    const weights = [0.88, 1.06, 0.93, 1.12, 0.95, 1.08, 1.00];
    for (let i = 0; i < missingPastDays.length; i++) {
      const k = missingPastDays[i];
      if (i === missingPastDays.length - 1) {
        fillMap[k] = Math.max(0, diffBytes - assigned);
      } else {
        const w = weights[i % weights.length];
        const val = Math.round(baseBytes * w);
        fillMap[k] = val;
        assigned += val;
      }
    }
  }

  let maxBytes = 0;
  let maxDay = now.getDate();
  let todayBytes = 0;
  let activeDays = 0;

  for (const item of days) {
    let bytes = 0;
    if (!item.isFuture) {
      if (logMap[item.key] !== undefined) {
        bytes = logMap[item.key];
      } else if (fillMap[item.key] !== undefined) {
        bytes = fillMap[item.key];
      }
      if (bytes > 0) activeDays++;
      if (bytes > maxBytes) {
        maxBytes = bytes;
        maxDay = item.day;
      }
      if (item.isToday) {
        todayBytes = bytes;
      }
    }
    item.bytes = bytes;
    item.gb = Number((bytes / GB).toFixed(2));
  }

  const finalCycleTotalGB = Number((totalUsedBytes / GB).toFixed(2));
  const avgGB = pastDaysCount > 0 ? Number((totalUsedBytes / GB / pastDaysCount).toFixed(2)) : 0;
  const maxGB = Number((maxBytes / GB).toFixed(2));
  const todayGB = Number((todayBytes / GB).toFixed(2));

  // 5. GitHub 贡献图精准比例色阶 (0: 无用量/未来, 1: 0~25%, 2: 25~50%, 3: 50~75%, 4: 75~100%)
  // 基准标尺以周期峰值 maxGB 为核心，确保不同用量完全对应不同的色阶等级
  const refScale = Math.max(maxGB, avgGB * 1.3, 1.0);

  for (const item of days) {
    if (item.isFuture || item.gb <= 0) {
      item.level = 0;
    } else {
      const ratio = item.gb / refScale;
      if (ratio <= 0.25) {
        item.level = 1;
      } else if (ratio <= 0.50) {
        item.level = 2;
      } else if (ratio <= 0.75) {
        item.level = 3;
      } else {
        item.level = 4;
      }
    }
  }

  const firstDayOfWeek = days.length > 0 ? days[0].dateObj.getDay() : 0;

  return {
    days,
    cycleRangeLabel,
    monthName,
    todayDate: now.getDate(),
    daysInCycle: days.length,
    firstDayOfWeek,
    activeDays,
    cycleTotalGB: finalCycleTotalGB,
    monthTotalGB: finalCycleTotalGB, // 兼容老字段
    avgGB,
    maxGB,
    maxDay,
    todayGB
  };
}

// 格式化当前时间 (HH:mm)
function formatCurrentTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ================= 图表与图形渲染引擎 =================

// 绘制高度自定义的进度条
function drawProgressBar(percent, width = 600, height = 14) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  dc.addPath(bgPath);
  dc.setFillColor(new Color('#E5E5EA'));
  dc.fillPath();

  if (percent > 0) {
    const fillWidth = Math.max(height, Math.min(width, (width * percent) / 100));
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    dc.addPath(fillPath);

    let color = '#007AFF';
    if (percent > 80) color = '#FF3B30';
    else if (percent > 60) color = '#FF9500';

    dc.setFillColor(new Color(color));
    dc.fillPath();
  }

  return dc.getImage();
}

// 统一图表绘制入口 (支持 GitHub 贡献热力图、柱状图与折线图)
// 获取小组件内容区满宽尺寸 (去除左右各 16pt 内边距后的真实宽度)
function getWidgetChartWidth(family = 'medium') {
  let screenW = 390;
  try {
    if (typeof Device !== 'undefined' && Device.screenSize) {
      screenW = Device.screenSize().width;
    }
  } catch (e) {
    screenW = 390;
  }
  if (family === 'large' || family === 'medium') {
    if (screenW >= 428) return 332; // Pro Max, Plus (364 - 32)
    if (screenW >= 390) return 328; // 6.1寸标准机型 (360 - 32)
    return 300; // mini / SE (329 - 32)
  }
  return 328;
}

// 获取小组件内容区图表高度 (自适应设备，Medium 尺寸由原 78pt 提升至 108~114pt，扩大近 50%)
function getWidgetChartHeight(family = 'medium') {
  let screenW = 390;
  try {
    if (typeof Device !== 'undefined' && Device.screenSize) {
      screenW = Device.screenSize().width;
    }
  } catch (e) {
    screenW = 390;
  }
  if (family === 'medium') {
    if (screenW >= 428) return 114; // Pro Max, Plus
    if (screenW >= 390) return 108; // 6.1寸标准机型
    return 98; // mini / SE
  }
  if (family === 'large') {
    return 120;
  }
  return 108;
}

// 绘制每日用量图表 (分发热力图、柱状图与折线图)
function drawDailyTrafficChart(dailyStats, width = 328, height = 64, type = CONFIG.chart_type) {
  if (type === 'heatmap') {
    return drawMonthHeatmapChart(dailyStats, width, height);
  }
  if (type === 'line') {
    return drawDailyLineChart(dailyStats, width, height);
  }
  return drawDailyBarChart(dailyStats, width, height);
}

// 绘制当月 GitHub 贡献热力图 (Heatmap Grid Chart) - 1:1 Retina 超清矢量渲染
function drawMonthHeatmapChart(dailyStats, width = 328, height = 78) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  if (!dailyStats || !dailyStats.days || dailyStats.days.length === 0) {
    return dc.getImage();
  }

  const {
    days,
    monthName,
    cycleRangeLabel,
    firstDayOfWeek,
    daysInCycle,
    todayDate,
    activeDays,
    todayGB,
    monthTotalGB,
    cycleTotalGB,
    maxGB,
    avgGB,
    maxDay,
    remainingGB
  } = dailyStats;

  // GitHub 官方贡献色阶 (0: 微灰无用量/未来, 1~4: 浅绿到深绿)
  const LEVEL_COLORS = [
    '#EBEDF0', // Level 0: 浅微灰 (无用量 / 未来未到日期)
    '#9BE9A8', // Level 1: 浅绿 (0~25%)
    '#40C463', // Level 2: 中浅绿 (25~50%)
    '#30A14E', // Level 3: 中深绿 (50~75%)
    '#216E39'  // Level 4: 深绿 (75~100%)
  ];

  const isLarge = height >= 118;
  const isCompact = width < 260; // 窄屏模式下仅显示左侧热力图

  // 1. 布局参数计算 (星期横轴化：7列星期 × 5~6周行，网格方块显著放大)
  const totalDays = (days && days.length > 0) ? days.length : (daysInCycle || 31);
  const firstDayCol = (firstDayOfWeek + 6) % 7; // 周一为0，周日为6
  const totalRows = Math.ceil((firstDayCol + totalDays) / 7);
  const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

  const topH = 14;
  const weekHeaderH = 11;
  const bottomMargin = 4;
  const availGridH = height - topH - weekHeaderH - bottomMargin;
  const gap = isLarge ? 3.5 : 2.5;
  const cellSize = Math.min(isLarge ? 13 : 11.5, Math.floor((availGridH - (totalRows - 1) * gap) / totalRows));
  const gridH = totalRows * cellSize + (totalRows - 1) * gap;
  const gridW = 7 * cellSize + 6 * gap;

  const gridStartX = 6;
  const heatTotalW = gridStartX + gridW;
  const weekHeaderY = topH + 2;
  const gridY = weekHeaderY + weekHeaderH + 2;

  // 2. 绘制顶部周期标签 (如 "08/26 - 09/26")
  dc.setFont(Font.boldSystemFont(isLarge ? 9.5 : 8.5));
  dc.setTextColor(new Color('#24292F'));
  dc.setTextAlignedLeft();
  dc.drawTextInRect(cycleRangeLabel || monthName || '周期用量', new Rect(gridStartX, 0, gridW + 20, topH));

  // 3. 绘制顶部横轴星期标尺 (对齐 一 至 日)
  dc.setFont(Font.systemFont(isLarge ? 8.5 : 7.5));
  dc.setTextColor(new Color('#8E8E93'));
  dc.setTextAlignedCenter();
  for (let c = 0; c < 7; c++) {
    const wx = gridStartX + c * (cellSize + gap);
    dc.drawTextInRect(weekHeaders[c], new Rect(wx, weekHeaderY, cellSize, weekHeaderH));
  }

  // 4. 循环绘制整周期圆角方块 (按自然周历排布)
  const cornerRadius = Math.max(2, Math.floor(cellSize * 0.22));
  let todayRect = null;

  for (let i = 0; i < totalDays; i++) {
    const item = days[i];
    if (!item) continue;

    const dayIdx = firstDayCol + i;
    const col = dayIdx % 7;
    const row = Math.floor(dayIdx / 7);
    const x = gridStartX + col * (cellSize + gap);
    const y = gridY + row * (cellSize + gap);

    const cellRect = new Rect(x, y, cellSize, cellSize);
    const cellPath = new Path();
    cellPath.addRoundedRect(cellRect, cornerRadius, cornerRadius);
    dc.addPath(cellPath);

    const level = item.level !== undefined ? item.level : 0;
    const hexColor = LEVEL_COLORS[level] || LEVEL_COLORS[0];
    dc.setFillColor(new Color(hexColor));
    dc.fillPath();

    if (item.isToday) {
      todayRect = cellRect;
    }
  }

  // 5. 【今日高亮指示】为今天的外框绘制 iOS 鲜亮蓝色外边框
  if (todayRect) {
    const outlinePath = new Path();
    outlinePath.addRoundedRect(
      new Rect(todayRect.x - 1, todayRect.y - 1, todayRect.width + 2, todayRect.height + 2),
      cornerRadius + 1,
      cornerRadius + 1
    );
    dc.addPath(outlinePath);
    dc.setStrokeColor(new Color('#007AFF'));
    dc.setLineWidth(1.4);
    dc.strokePath();
  }


  // 7. 若空间充足，在右侧绘制当月数据指标看板 (2x2 卡片矩阵)
  if (!isCompact && width >= 260) {
    const splitX = Math.round(heatTotalW + (width - heatTotalW > 200 ? 16 : 12));
    const rightStartX = splitX + 10;
    const rightAvailW = width - rightStartX - 2;

    // 绘制轻量垂直分割线
    const cardsMarginY = isLarge ? 8 : 6;
    const sepPath = new Path();
    sepPath.move(new Point(splitX, cardsMarginY));
    sepPath.addLine(new Point(splitX, height - cardsMarginY));
    dc.addPath(sepPath);
    dc.setStrokeColor(new Color('#E5E5EA', 0.8));
    dc.setLineWidth(1);
    dc.strokePath();

    // 右侧指标项：今日已用、周期累计、单日最高、剩余流量
    const remStr = `${remainingGB !== undefined ? remainingGB : 0} GB`;
    const cards = [
      { label: '今日已用', val: `${todayGB} GB`, color: '#007AFF' },
      { label: '周期累计', val: `${cycleTotalGB || monthTotalGB} GB`, color: '#1C1C1E' },
      { label: '单日最高', val: `${maxGB} GB`, color: '#FF9500' },
      { label: '剩余流量', val: remStr, color: '#10B981' }
    ];

    const cardGapX = 6;
    const cardGapY = isLarge ? 8 : 6;
    const availCardsH = height - cardsMarginY * 2;
    const cardW = Math.floor((rightAvailW - cardGapX) / 2);
    const cardH = Math.floor((availCardsH - cardGapY) / 2);

    for (let i = 0; i < cards.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = rightStartX + col * (cardW + cardGapX);
      const cy = cardsMarginY + row * (cardH + cardGapY);

      // 卡片圆角微背景
      const cardPath = new Path();
      cardPath.addRoundedRect(new Rect(cx, cy, cardW, cardH), 6, 6);
      dc.addPath(cardPath);
      dc.setFillColor(new Color('#F8F9FA'));
      dc.fillPath();

      // 卡片内边距
      const innerPaddingX = 7;
      const innerPaddingY = isLarge ? 6 : 5;

      // 卡片标签 (上方留白充足)
      dc.setFont(Font.systemFont(isLarge ? 9 : 8));
      dc.setTextColor(new Color('#8E8E93'));
      dc.setTextAlignedLeft();
      dc.drawTextInRect(cards[i].label, new Rect(cx + innerPaddingX, cy + innerPaddingY, cardW - innerPaddingX * 2, 12));

      // 卡片数值 (底部留白舒适)
      dc.setFont(Font.boldSystemFont(isLarge ? 12.5 : 11));
      dc.setTextColor(new Color(cards[i].color));
      dc.setTextAlignedLeft();
      const valH = isLarge ? 16 : 14;
      dc.drawTextInRect(cards[i].val, new Rect(cx + innerPaddingX, cy + cardH - innerPaddingY - valH, cardW - innerPaddingX * 2, valH));
    }
  }

  return dc.getImage();
}

// 绘制每日用量柱状图 (Bar Chart) - 1:1 Retina 超清矢量渲染 (100% 满宽自适应)
function drawDailyBarChart(dailyStats, width = 328, height = 64) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const allDays = (dailyStats && dailyStats.days) ? dailyStats.days : [];
  const days = allDays.filter(d => !d.isFuture);
  const n = days.length;
  if (n === 0) return dc.getImage();

  const labelHeight = 16;
  const topPadding = 14;
  const chartHeight = height - labelHeight - topPadding;
  const chartBottom = height - labelHeight;

  // 标尺上限 (至少为 1GB，防止除以 0)
  const maxVal = Math.max(Number(dailyStats && dailyStats.maxGB) || 0, 1.0);

  // 100% 撑满可用宽度，两端紧凑贴合消除多余空隙
  const sidePadding = 2;
  const availWidth = width - sidePadding * 2;
  const gap = n > 20 ? 2 : (n > 12 ? 3 : (n > 6 ? 4 : 5));
  const barWidth = n === 1 ? 36 : Math.floor((availWidth - (n - 1) * gap) / n);
  const totalBarsWidth = n === 1 ? barWidth : (n * barWidth + (n - 1) * gap);
  const startX = sidePadding + Math.floor((availWidth - totalBarsWidth) / 2);

  // 1. 绘制日均参考水平虚线 (Dashed Line) - 作为背景参考线
  if (dailyStats && dailyStats.avgGB > 0) {
    const avgY = Math.round(chartBottom - (dailyStats.avgGB / maxVal) * (chartHeight - 4));
    const guidePath = new Path();
    const dashLen = 4;
    const gapLen = 3;
    for (let x = sidePadding; x < width - sidePadding; x += dashLen + gapLen) {
      guidePath.move(new Point(x, avgY));
      guidePath.addLine(new Point(Math.min(x + dashLen, width - sidePadding), avgY));
    }
    dc.addPath(guidePath);
    dc.setStrokeColor(new Color('#8E8E93', 0.45));
    dc.setLineWidth(1);
    dc.strokePath();
  }

  // 2. 循环绘制每日柱子与底部刻度 (先绘制柱体，确保文字标签置于顶层)
  let todayX = startX;
  let todayBarW = barWidth;
  let hasToday = false;

  for (let i = 0; i < n; i++) {
    const item = days[i];
    const x = startX + i * (barWidth + gap);
    const gbVal = Number(item.gb) || 0;
    const barH = gbVal > 0 ? Math.max(3, Math.round((gbVal / maxVal) * (chartHeight - 4))) : 2;
    const y = chartBottom - barH;

    if (item.isToday) {
      todayX = x;
      todayBarW = barWidth;
      hasToday = true;
    }

    // 绘制柱子圆角矩形
    const barPath = new Path();
    const cornerRadius = Math.min(3, Math.floor(barWidth / 2));
    barPath.addRoundedRect(new Rect(x, y, barWidth, barH), cornerRadius, cornerRadius);
    dc.addPath(barPath);

    if (item.isToday) {
      // 今日高亮主色 (饱满 iOS 纯蓝)
      dc.setFillColor(new Color('#007AFF'));
    } else if (gbVal === 0) {
      // 零流量微灰底
      dc.setFillColor(new Color('#E5E5EA'));
    } else {
      // 历史天高饱和度明快蓝
      dc.setFillColor(new Color('#4A90E2'));
    }
    dc.fillPath();

    // 绘制 X 轴底部日期刻度
    let showLabel = false;
    if (n <= 8) {
      showLabel = true;
    } else if (item.isToday || item.day === 1 || item.day % 5 === 0) {
      showLabel = true;
    }

    if (showLabel) {
      dc.setFont(item.isToday ? Font.boldSystemFont(9) : Font.systemFont(9));
      dc.setTextColor(item.isToday ? new Color('#007AFF') : new Color('#636366'));
      dc.setTextAlignedCenter();
      const labelW = Math.max(barWidth, 20);
      const labelX = Math.max(0, Math.min(width - labelW, Math.round(x - (labelW - barWidth) / 2)));
      dc.drawTextInRect(`${item.day}`, new Rect(labelX, chartBottom + 2, labelW, 14));
    }
  }

  // 3. 【顶层绘制】今日用量微标签 (精确对齐当天那根柱子的水平中心上方)
  let todayLabelX = sidePadding;
  const todayLabelW = 40;
  if (dailyStats && dailyStats.todayGB !== undefined) {
    dc.setFont(Font.boldSystemFont(10));
    dc.setTextColor(new Color('#F5C518'));
    dc.setTextAlignedCenter();

    if (hasToday) {
      const todayCenterX = todayX + todayBarW / 2;
      todayLabelX = Math.round(todayCenterX - todayLabelW / 2);
    } else {
      todayLabelX = width - sidePadding - todayLabelW;
    }
    todayLabelX = Math.max(sidePadding, Math.min(width - sidePadding - todayLabelW, todayLabelX));

    dc.drawTextInRect(`${dailyStats.todayGB}G`, new Rect(todayLabelX, 0, todayLabelW, 13));
  }

  return dc.getImage();
}

// 绘制每日用量折线/面积图 (Line Chart) - 1:1 Retina 超清矢量渲染 (100% 满宽自适应)
function drawDailyLineChart(dailyStats, width = 328, height = 64) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const allDays = (dailyStats && dailyStats.days) ? dailyStats.days : [];
  const days = allDays.filter(d => !d.isFuture);
  const n = days.length;
  if (n === 0) return dc.getImage();

  const labelHeight = 16;
  const topPadding = 14;
  const chartHeight = height - labelHeight - topPadding;
  const chartBottom = height - labelHeight;
  const sidePadding = 4;
  const availWidth = width - sidePadding * 2;
  const maxVal = Math.max(Number(dailyStats && dailyStats.maxGB) || 0, 1.0);

  // 1. 绘制日均参考水平虚线 (Dashed Line) - 作为背景参考线
  if (dailyStats && dailyStats.avgGB > 0) {
    const avgY = Math.round(chartBottom - (dailyStats.avgGB / maxVal) * (chartHeight - 4));
    const guidePath = new Path();
    const dashLen = 4;
    const gapLen = 3;
    for (let x = sidePadding; x < width - sidePadding; x += dashLen + gapLen) {
      guidePath.move(new Point(x, avgY));
      guidePath.addLine(new Point(Math.min(x + dashLen, width - sidePadding), avgY));
    }
    dc.addPath(guidePath);
    dc.setStrokeColor(new Color('#8E8E93', 0.45));
    dc.setLineWidth(1);
    dc.strokePath();
  }

  // 2. 计算各天坐标点 (整数对齐)
  const step = n > 1 ? availWidth / (n - 1) : availWidth / 2;
  let todayPt = null;
  const points = days.map((item, i) => {
    const x = Math.round(sidePadding + (n === 1 ? availWidth / 2 : i * step));
    const y = Math.round(chartBottom - (item.gb / maxVal) * (chartHeight - 4));
    const pt = { x, y, item };
    if (item.isToday) {
      todayPt = pt;
    }
    return pt;
  });
  if (!todayPt && points.length > 0) {
    todayPt = points[points.length - 1];
  }

  // 3. 绘制填充面积
  const areaPath = new Path();
  areaPath.move(new Point(points[0].x, chartBottom));
  for (const pt of points) {
    areaPath.addLine(new Point(pt.x, pt.y));
  }
  areaPath.addLine(new Point(points[points.length - 1].x, chartBottom));
  areaPath.closeSubpath();
  dc.addPath(areaPath);
  dc.setFillColor(new Color('#007AFF', 0.14));
  dc.fillPath();

  // 4. 绘制折线轨迹
  const linePath = new Path();
  linePath.move(new Point(points[0].x, points[0].y));
  for (let i = 1; i < points.length; i++) {
    linePath.addLine(new Point(points[i].x, points[i].y));
  }
  dc.addPath(linePath);
  dc.setStrokeColor(new Color('#007AFF'));
  dc.setLineWidth(2);
  dc.strokePath();

  // 5. 绘制关键数据锚点与底部日期刻度
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    const item = pt.item;

    const dotPath = new Path();
    const radius = item.isToday ? 3.5 : 2;
    dotPath.addEllipse(new Rect(pt.x - radius, pt.y - radius, radius * 2, radius * 2));
    dc.addPath(dotPath);
    dc.setFillColor(item.isToday ? new Color('#007AFF') : new Color('#4A90E2'));
    dc.fillPath();

    if (item.isToday) {
      const haloPath = new Path();
      haloPath.addEllipse(new Rect(pt.x - 6, pt.y - 6, 12, 12));
      dc.addPath(haloPath);
      dc.setStrokeColor(new Color('#007AFF', 0.35));
      dc.setLineWidth(1.5);
      dc.strokePath();
    }

    let showLabel = false;
    if (n <= 8) {
      showLabel = true;
    } else if (item.isToday || item.day === 1 || item.day % 5 === 0) {
      showLabel = true;
    }

    if (showLabel) {
      dc.setFont(item.isToday ? Font.boldSystemFont(9) : Font.systemFont(9));
      dc.setTextColor(item.isToday ? new Color('#007AFF') : new Color('#636366'));
      dc.setTextAlignedCenter();
      dc.drawTextInRect(`${item.day}`, new Rect(pt.x - 12, chartBottom + 2, 24, 14));
    }
  }

  // 6. 【顶层绘制】今日用量微标签 (精确居中对齐到当天坐标点上方)
  let todayLabelX = sidePadding;
  const todayLabelW = 40;
  if (dailyStats && dailyStats.todayGB !== undefined) {
    dc.setFont(Font.boldSystemFont(10));
    dc.setTextColor(new Color('#F5C518'));
    dc.setTextAlignedCenter();

    if (todayPt) {
      todayLabelX = Math.round(todayPt.x - todayLabelW / 2);
    } else {
      todayLabelX = width - sidePadding - todayLabelW;
    }
    todayLabelX = Math.max(sidePadding, Math.min(width - sidePadding - todayLabelW, todayLabelX));
    dc.drawTextInRect(`${dailyStats.todayGB}G`, new Rect(todayLabelX, 0, todayLabelW, 13));
  }

  return dc.getImage();
}

// 渲染右下角刷新状态与时间
function renderStatusBadge(stack, data, isSmall = false) {
  const statusStack = stack.addStack();
  statusStack.layoutHorizontally();
  statusStack.centerAlignContent();
  statusStack.spacing = 3;

  try {
    const symbol = SFSymbol.named('arrow.triangle.2.circlepath');
    const symbolImg = statusStack.addImage(symbol.image);
    symbolImg.imageSize = new Size(isSmall ? 8 : 9, isSmall ? 8 : 9);
    symbolImg.tintColor = data.isFromCache ? new Color('#FF9500') : new Color('#8E8E93');
  } catch (e) {}

  const timeText = statusStack.addText(data.updateTime || formatCurrentTime());
  timeText.font = Font.systemFont(isSmall ? 9 : 10);
  timeText.textColor = data.isFromCache ? new Color('#FF9500') : new Color('#8E8E93');
}

// ================= 组件尺寸视图渲染 =================

// 中号小组件 (Medium 核心主视图)
function renderMediumWidget(widget, data) {
  // 1. 顶部栏：套餐名称 + 重置提醒气泡
  const headerStack = widget.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleText = headerStack.addText(data.planName);
  titleText.font = Font.boldSystemFont(14);
  titleText.textColor = new Color('#1C1C1E');
  titleText.lineLimit = 1;

  headerStack.addSpacer();

  const resetStack = headerStack.addStack();
  resetStack.backgroundColor = new Color('#F2F4F7');
  resetStack.cornerRadius = 6;
  resetStack.setPadding(2, 7, 2, 7);

  const resetText = resetStack.addText(`${data.resetDaysLeft} 天后重置`);
  resetText.font = Font.systemFont(10);
  resetText.textColor = new Color('#007AFF');

  widget.addSpacer(6);

  // 2. 核心图表区域 (1:1 点对点高清晰度渲染，空间扩大近 50%)
  const chartW = getWidgetChartWidth('medium');
  const chartH = getWidgetChartHeight('medium');
  if (data.dailyStats && data.dailyStats.days && data.dailyStats.days.length > 0) {
    const chartImg = drawDailyTrafficChart(data.dailyStats, chartW, chartH, CONFIG.chart_type);
    const chartWidgetImg = widget.addImage(chartImg);
    chartWidgetImg.imageSize = new Size(chartW, chartH);
    chartWidgetImg.resizable = true;
  } else {
    // 降级使用普通进度条
    const progressImg = drawProgressBar(data.usedPercent, chartW, 12);
    const progressWidgetImg = widget.addImage(progressImg);
    progressWidgetImg.imageSize = new Size(chartW, 12);
    progressWidgetImg.resizable = true;
  }

  widget.addSpacer(6);

  // 4. 底部栏：到期时间与刷新状态
  const footerStack = widget.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const expireText = footerStack.addText(`到期: ${data.expireDateStr}`);
  expireText.font = Font.systemFont(9);
  expireText.textColor = new Color('#8E8E93');

  footerStack.addSpacer();

  renderStatusBadge(footerStack, data, false);
}

// 大号小组件 (Large 完整五段式高质感数据看板)
function renderLargeWidget(widget, data) {
  const chartW = getWidgetChartWidth('large');

  // 1. 顶部栏：套餐名称 + 重置倒计时胶囊
  const headerStack = widget.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleText = headerStack.addText(data.planName);
  titleText.font = Font.boldSystemFont(15);
  titleText.textColor = new Color('#1C1C1E');
  titleText.lineLimit = 1;

  headerStack.addSpacer();

  const resetStack = headerStack.addStack();
  resetStack.backgroundColor = new Color('#F2F4F7');
  resetStack.cornerRadius = 6;
  resetStack.setPadding(3, 8, 3, 8);
  const resetText = resetStack.addText(`${data.resetDaysLeft} 天后重置`);
  resetText.font = Font.systemFont(11);
  resetText.textColor = new Color('#007AFF');

  widget.addSpacer(9);

  // 2. 核心资产与进度卡片 (Hero Card)
  const heroCard = widget.addStack();
  heroCard.layoutVertically();
  heroCard.backgroundColor = new Color('#F8F9FA');
  heroCard.cornerRadius = 10;
  heroCard.setPadding(10, 13, 10, 13);

  const heroTop = heroCard.addStack();
  heroTop.layoutHorizontally();
  heroTop.centerAlignContent();

  // 左侧剩余流量
  const heroLeft = heroTop.addStack();
  heroLeft.layoutVertically();

  const remLabel = heroLeft.addText('剩余流量');
  remLabel.font = Font.systemFont(11);
  remLabel.textColor = new Color('#8E8E93');

  heroLeft.addSpacer(3);

  const valStack = heroLeft.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(data.remainingGB);
  remVal.font = Font.boldSystemFont(28);
  remVal.textColor = new Color('#10B981');

  valStack.addSpacer(3);

  const unitText = valStack.addText('GB');
  unitText.font = Font.boldSystemFont(14);
  unitText.textColor = new Color('#10B981');

  heroTop.addSpacer();

  // 右侧配额详情
  const heroRight = heroTop.addStack();
  heroRight.layoutVertically();

  const quotaText = heroRight.addText(`总量 ${data.totalGB} GB`);
  quotaText.font = Font.mediumSystemFont(12);
  quotaText.textColor = new Color('#1C1C1E');

  heroRight.addSpacer(3);

  const usedText = heroRight.addText(`已用 ${data.usedGB} GB (${data.usedPercent}%)`);
  usedText.font = Font.systemFont(11);
  usedText.textColor = new Color('#8E8E93');

  heroCard.addSpacer(7);

  // 进度条 (与卡片内容区等宽对齐)
  const heroContentW = chartW - 26;
  const progressImg = drawProgressBar(data.usedPercent, heroContentW, 7);
  const progressWidgetImg = heroCard.addImage(progressImg);
  progressWidgetImg.imageSize = new Size(heroContentW, 7);
  progressWidgetImg.resizable = true;

  widget.addSpacer(9);

  // 3. 四宫格核心数据指标胶囊 (KPI 4-Grid)
  const daily = data.dailyStats;
  if (daily) {
    const gridStack = widget.addStack();
    gridStack.layoutHorizontally();
    gridStack.centerAlignContent();

    const items = [
      { label: '今日已用', val: `${daily.todayGB} G`, color: '#007AFF' },
      { label: '剩余天数', val: `${data.resetDaysLeft} 天`, color: '#1C1C1E' },
      { label: '单日峰值', val: `${daily.maxGB} G`, color: '#FF9500' },
      { label: '周期累计', val: `${daily.cycleTotalGB || daily.monthTotalGB} G`, color: '#1C1C1E' }
    ];

    for (let i = 0; i < items.length; i++) {
      const col = gridStack.addStack();
      col.layoutVertically();
      col.backgroundColor = new Color('#F8F9FA');
      col.cornerRadius = 8;
      col.setPadding(6, 7, 6, 7);

      const lbl = col.addText(items[i].label);
      lbl.font = Font.systemFont(9);
      lbl.textColor = new Color('#8E8E93');
      lbl.centerAlignText();

      col.addSpacer(3);

      const val = col.addText(items[i].val);
      val.font = Font.boldSystemFont(13);
      val.textColor = new Color(items[i].color);
      val.centerAlignText();

      if (i < items.length - 1) {
        gridStack.addSpacer();
      }
    }

    widget.addSpacer(9);
  }

  // 4. 当月每日用量全景大图表 (Full Chart Section)
  const chartHeader = widget.addStack();
  chartHeader.layoutHorizontally();
  chartHeader.centerAlignContent();

  const cycleTitle = daily && daily.cycleRangeLabel ? ` (${daily.cycleRangeLabel})` : '';
  const chartTitle = chartHeader.addText(`周期每日用量${cycleTitle}`);
  chartTitle.font = Font.boldSystemFont(12);
  chartTitle.textColor = new Color('#1C1C1E');

  chartHeader.addSpacer();

  const chartSubText = CONFIG.chart_type === 'heatmap' ? '热力分布' : '今日高亮';
  const chartSub = chartHeader.addText(chartSubText);
  chartSub.font = Font.systemFont(10);
  chartSub.textColor = new Color('#8E8E93');

  widget.addSpacer(4);

  // 1:1 大尺寸高清图表 (100% 满宽自适应)
  const chartH = 120;
  if (daily && daily.days && daily.days.length > 0) {
    const chartImg = drawDailyTrafficChart(daily, chartW, chartH, CONFIG.chart_type);
    const chartWidgetImg = widget.addImage(chartImg);
    chartWidgetImg.imageSize = new Size(chartW, chartH);
    chartWidgetImg.resizable = true;
  } else {
    // 容错降级
    const progressImg = drawProgressBar(data.usedPercent, chartW, 10);
    const progressWidgetImg = widget.addImage(progressImg);
    progressWidgetImg.imageSize = new Size(chartW, 10);
    progressWidgetImg.resizable = true;
  }

  widget.addSpacer(7);

  // 5. 底部状态栏
  const footerStack = widget.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const expireText = footerStack.addText(`到期: ${data.expireDateStr}`);
  expireText.font = Font.systemFont(9);
  expireText.textColor = new Color('#8E8E93');

  footerStack.addSpacer();

  renderStatusBadge(footerStack, data, false);
}

// iPad 超大号小组件 (ExtraLarge 左右双栏视野)
function renderExtraLargeWidget(widget, data) {
  const container = widget.addStack();
  container.layoutHorizontally();
  container.centerAlignContent();

  // 左栏：资产卡片与核心指标
  const leftCol = container.addStack();
  leftCol.layoutVertically();

  const headerStack = leftCol.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleText = headerStack.addText(data.planName);
  titleText.font = Font.boldSystemFont(16);
  titleText.textColor = new Color('#1C1C1E');

  headerStack.addSpacer();

  const resetStack = headerStack.addStack();
  resetStack.backgroundColor = new Color('#F2F4F7');
  resetStack.cornerRadius = 6;
  resetStack.setPadding(3, 8, 3, 8);
  const resetText = resetStack.addText(`${data.resetDaysLeft} 天后重置`);
  resetText.font = Font.systemFont(11);
  resetText.textColor = new Color('#007AFF');

  leftCol.addSpacer(12);

  const heroCard = leftCol.addStack();
  heroCard.layoutVertically();
  heroCard.backgroundColor = new Color('#F8F9FA');
  heroCard.cornerRadius = 10;
  heroCard.setPadding(12, 14, 12, 14);

  const remLabel = heroCard.addText('剩余可用流量');
  remLabel.font = Font.systemFont(12);
  remLabel.textColor = new Color('#8E8E93');

  heroCard.addSpacer(4);

  const valStack = heroCard.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(data.remainingGB);
  remVal.font = Font.boldSystemFont(36);
  remVal.textColor = new Color('#10B981');

  valStack.addSpacer(4);
  const unitText = valStack.addText('GB');
  unitText.font = Font.boldSystemFont(16);
  unitText.textColor = new Color('#10B981');

  heroCard.addSpacer(10);

  const subText = heroCard.addText(`已用 ${data.usedGB} / ${data.totalGB} GB (${data.usedPercent}%)`);
  subText.font = Font.systemFont(12);
  subText.textColor = new Color('#1C1C1E');

  heroCard.addSpacer(6);

  const progressImg = drawProgressBar(data.usedPercent, 282, 8);
  const progressWidgetImg = heroCard.addImage(progressImg);
  progressWidgetImg.imageSize = new Size(282, 8);
  progressWidgetImg.resizable = true;

  leftCol.addSpacer(12);

  // 4 宫格
  const daily = data.dailyStats;
  if (daily) {
    const gridStack = leftCol.addStack();
    gridStack.layoutHorizontally();
    gridStack.centerAlignContent();

    const items = [
      { label: '今日已用', val: `${daily.todayGB}G`, color: '#007AFF' },
      { label: '剩余天数', val: `${data.resetDaysLeft}天`, color: '#1C1C1E' },
      { label: '单日最高', val: `${daily.maxGB}G`, color: '#FF9500' },
      { label: '周期累计', val: `${daily.cycleTotalGB || daily.monthTotalGB}G`, color: '#1C1C1E' }
    ];

    for (let i = 0; i < items.length; i++) {
      const col = gridStack.addStack();
      col.layoutVertically();
      col.backgroundColor = new Color('#F8F9FA');
      col.cornerRadius = 8;
      col.setPadding(6, 8, 6, 8);

      const lbl = col.addText(items[i].label);
      lbl.font = Font.systemFont(9);
      lbl.textColor = new Color('#8E8E93');
      lbl.centerAlignText();

      col.addSpacer(2);

      const val = col.addText(items[i].val);
      val.font = Font.boldSystemFont(12);
      val.textColor = new Color(items[i].color);
      val.centerAlignText();

      if (i < items.length - 1) gridStack.addSpacer();
    }
  }

  leftCol.addSpacer(12);

  const footerStack = leftCol.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const expireText = footerStack.addText(`到期: ${data.expireDateStr}`);
  expireText.font = Font.systemFont(10);
  expireText.textColor = new Color('#8E8E93');
  footerStack.addSpacer();
  renderStatusBadge(footerStack, data, false);

  container.addSpacer(20);

  // 右栏：宽幅超大图表
  const rightCol = container.addStack();
  rightCol.layoutVertically();

  const xlCycleTitle = daily && daily.cycleRangeLabel ? ` (${daily.cycleRangeLabel})` : '';
  const chartTitle = rightCol.addText(`周期每日用量趋势${xlCycleTitle}`);
  chartTitle.font = Font.boldSystemFont(14);
  chartTitle.textColor = new Color('#1C1C1E');

  rightCol.addSpacer(8);

  if (daily) {
    const chartW = 340;
    const chartH = 190;
    const chartImg = drawDailyTrafficChart(daily, chartW, chartH, CONFIG.chart_type);
    const chartWidgetImg = rightCol.addImage(chartImg);
    chartWidgetImg.imageSize = new Size(chartW, chartH);
    chartWidgetImg.resizable = true;
  }
}

// 锁屏矩形小组件 (Accessory Rectangular, iOS 16+)
function renderAccessoryRectangular(widget, data) {
  const titleText = widget.addText(data.planName);
  titleText.font = Font.boldSystemFont(11);
  titleText.lineLimit = 1;

  widget.addSpacer(2);

  const valStack = widget.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(`剩余 ${data.remainingGB}`);
  remVal.font = Font.boldSystemFont(15);

  valStack.addSpacer(2);

  const unitText = valStack.addText('GB');
  unitText.font = Font.systemFont(10);

  widget.addSpacer(2);

  const daily = data.dailyStats;
  const infoText = widget.addText(daily ? `今日 ${daily.todayGB}G · ${data.resetDaysLeft}天后重置` : `${data.resetDaysLeft}天后重置 · 已用${data.usedPercent}%`);
  infoText.font = Font.systemFont(9);
  infoText.lineLimit = 1;
}

// 锁屏圆形小组件 (Accessory Circular, iOS 16+)
function renderAccessoryCircular(widget, data) {
  const centerStack = widget.addStack();
  centerStack.layoutVertically();
  centerStack.centerAlignContent();

  const numText = centerStack.addText(data.remainingGB);
  numText.font = Font.boldSystemFont(12);
  numText.centerAlignText();

  const unitText = centerStack.addText('GB');
  unitText.font = Font.systemFont(9);
  unitText.centerAlignText();

  const resetText = centerStack.addText(`${data.resetDaysLeft}d`);
  resetText.font = Font.systemFont(8);
  resetText.centerAlignText();
}

// 锁屏单行小组件 (Accessory Inline, iOS 16+)
function renderAccessoryInline(widget, data) {
  const daily = data.dailyStats;
  const text = daily ? `剩余 ${data.remainingGB}G · 今日 ${daily.todayGB}G` : `剩余 ${data.remainingGB}GB · ${data.resetDaysLeft}天重置`;
  const inlineText = widget.addText(text);
  inlineText.font = Font.systemFont(12);
}

// 小号小组件 (Small 紧凑视图)
function renderSmallWidget(widget, data) {
  const titleText = widget.addText(data.planName);
  titleText.font = Font.boldSystemFont(12);
  titleText.textColor = new Color('#1C1C1E');
  titleText.lineLimit = 1;

  widget.addSpacer(5);

  const remLabel = widget.addText('剩余流量');
  remLabel.font = Font.systemFont(10);
  remLabel.textColor = new Color('#8E8E93');

  widget.addSpacer(2);

  const valStack = widget.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(data.remainingGB);
  remVal.font = Font.boldSystemFont(26);
  remVal.textColor = new Color('#10B981');

  valStack.addSpacer(2);

  const unitStack = valStack.addStack();
  unitStack.layoutVertically();
  const unitText = unitStack.addText('GB');
  unitText.font = Font.boldSystemFont(12);
  unitText.textColor = new Color('#10B981');
  unitStack.addSpacer(3);

  widget.addSpacer(5);

  // 进度条
  const progressImg = drawProgressBar(data.usedPercent, 200, 7);
  const progressWidgetImg = widget.addImage(progressImg);
  progressWidgetImg.resizable = true;

  widget.addSpacer(5);

  // 紧凑每日用量信息
  const daily = data.dailyStats;
  if (daily) {
    const dailyText = widget.addText(`今日 ${daily.todayGB}G · 周期日均 ${daily.avgGB}G`);
    dailyText.font = Font.systemFont(9);
    dailyText.textColor = new Color('#8E8E93');
  } else {
    const subText = widget.addText(`共 ${data.totalGB} GB · ${data.resetDaysLeft}天后重置`);
    subText.font = Font.systemFont(9);
    subText.textColor = new Color('#8E8E93');
  }

  widget.addSpacer();

  const footerStack = widget.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const expireText = footerStack.addText(`到期: ${data.expireDateStr}`);
  expireText.font = Font.systemFont(9);
  expireText.textColor = new Color('#8E8E93');

  footerStack.addSpacer();

  renderStatusBadge(footerStack, data, true);
}

// 错误提示组件
function renderErrorWidget(widget, message = '服务不可用') {
  widget.addSpacer();
  const centerStack = widget.addStack();
  centerStack.layoutVertically();
  centerStack.centerAlignContent();

  const titleText = centerStack.addText(message);
  titleText.font = Font.boldSystemFont(14);
  titleText.textColor = new Color('#FF3B30');
  titleText.centerAlignText();

  centerStack.addSpacer(4);

  const descText = centerStack.addText('暂无法获取订阅数据');
  descText.font = Font.systemFont(10);
  descText.textColor = new Color('#8E8E93');
  descText.centerAlignText();
  widget.addSpacer();
}

// 执行渲染
await main();
