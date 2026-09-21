// Variables used by Scriptable.
// These must be at the top of the file to be parsed by Scriptable.
// icon-color: blue; icon-glyph: chart-bar;

/**
 * iOS 流量小组件 - 中尺寸专属版本 (Medium Widget)
 * 特性：专为 2:1 宽屏尺寸打造，左右对称双卡片分栏仪表盘、去除易折行进度条、舒展居中热力图
 */

// ================= 全局配置 =================
function resolveActiveTokens() {
  if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.__LOCAL_TRAFFIC_TOKENS__) && globalThis.__LOCAL_TRAFFIC_TOKENS__.length > 0) {
    return globalThis.__LOCAL_TRAFFIC_TOKENS__;
  }
  if (typeof globalThis !== 'undefined' && globalThis.__LOCAL_TRAFFIC_TOKEN__) {
    return [globalThis.__LOCAL_TRAFFIC_TOKEN__];
  }
  const defaultTokens = [
    'f4XTTjtgVDFAUV79FgDp7i2hEF2w7sUvpGiNmeZkce4f55bb', // 账号 1
    'ltSOzTIW6LqUNtWGt2Tl89mCkRy53iMUUMvedXtY062087e9'  // 账号 2
  ];
  let param = '';
  try {
    if (typeof args !== 'undefined' && args.widgetParameter) {
      param = args.widgetParameter.trim();
    }
  } catch (e) {}

  if (param === '1' || param.toLowerCase() === 'acc1') {
    return [defaultTokens[0]];
  }
  if (param === '2' || param.toLowerCase() === 'acc2') {
    return defaultTokens.length > 1 ? [defaultTokens[1]] : [defaultTokens[0]];
  }
  if (param.includes(',')) {
    return param.split(',').map(s => s.trim()).filter(Boolean);
  }
  return defaultTokens;
}

const CONFIG = {
  api_url: 'https://ptt.ixlmo.com/api/v1/user/getSubscribe',
  stat_api_url: 'https://ptt.ixlmo.com/api/v1/user/getStat',
  chart_type: 'heatmap',
  tokens: resolveActiveTokens(),
  cache_time: 600,
  warning_daily_gb: 10.0,
  warning_today_ratio: 0.15
};

// ================= 主逻辑 =================
async function main() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#FFFFFF');
  widget.setPadding(12, 14, 12, 14);

  try {
    if (!CONFIG.tokens || CONFIG.tokens.length === 0) {
      renderErrorWidget(widget, '未配置 Token');
    } else {
      const data = await fetchData();
      if (!data || !data.accounts || data.accounts.length === 0) {
        renderErrorWidget(widget, '服务不可用');
      } else {
        await checkAndTriggerAlertNotification(data);

        const isDual = data.accounts.length > 1;
        if (isDual) {
          renderDualMediumWidget(widget, data.accounts, data.summary);
        } else {
          renderMediumWidget(widget, data.accounts[0]);
        }
      }
    }
  } catch (err) {
    console.error('小组件运行异常: ' + err);
    renderErrorWidget(widget, '服务不可用');
  }

  if (config.runsInWidget) {
    Script.setWidget(widget);
  } else {
    await widget.presentMedium();
  }
  Script.complete();
}

// ================= 数据获取与汇总 =================
async function fetchData() {
  const fm = FileManager.local();
  const tokens = CONFIG.tokens || [];
  if (tokens.length === 0) return null;

  const accountPromises = tokens.map((token, index) => fetchSingleAccount(fm, token, index));
  const settledResults = await Promise.allSettled(accountPromises);

  const accounts = [];
  for (let i = 0; i < settledResults.length; i++) {
    const res = settledResults[i];
    if (res.status === 'fulfilled' && res.value) {
      accounts.push(res.value);
    }
  }

  if (accounts.length === 0) return null;

  const summary = computeAccountsSummary(accounts);
  return {
    accounts,
    summary,
    isDual: accounts.length > 1,
    updateTime: formatCurrentTime()
  };
}

async function fetchSingleAccount(fm, token, index) {
  const tokenHash = token.length >= 10 ? token.slice(0, 10) : token;
  const cachePath = fm.joinPath(fm.documentsDirectory(), `traffic_widget_cache_${tokenHash}.json`);
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'authorization': `Bearer ${token}`,
    'referer': 'https://ptt.ixlmo.com/',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)'
  };

  let subData = null;
  let logData = null;

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
      const parsed = parseTrafficData(subData, mergedLogs, index);
      if (parsed) parsed.isFromCache = false;
      return parsed;
    }
  } catch (e) {
    console.log(`账号 [${index + 1}] 网络请求失败，尝试读取本地缓存: ` + e);
  }

  try {
    if (fm.fileExists(cachePath)) {
      const cacheStr = fm.readString(cachePath);
      const cached = JSON.parse(cacheStr);
      if (cached) {
        const sData = cached.subData || cached;
        const lData = cached.allLogs || cached.logData || null;
        const parsed = parseTrafficData(sData, lData, index);
        if (parsed) {
          parsed.isFromCache = true;
          return parsed;
        }
      }
    }
  } catch (e) {}

  return null;
}

function computeAccountsSummary(accounts) {
  const GB = 1024 * 1024 * 1024;
  let totalEnableBytes = 0;
  let totalUsedBytes = 0;
  let minResetDays = 9999;
  let isAnyWarning = false;

  for (const acc of accounts) {
    totalEnableBytes += (acc.enableBytes || 0);
    totalUsedBytes += (acc.usedBytes || 0);
    if (acc.resetDaysLeft !== undefined && acc.resetDaysLeft < minResetDays) {
      minResetDays = acc.resetDaysLeft;
    }
    if (acc.remainingGB < 5 || acc.usedPercent > 90 || (acc.dailyStats && acc.dailyStats.isTodayWarning)) {
      isAnyWarning = true;
    }
  }

  const totalRemainingBytes = Math.max(0, totalEnableBytes - totalUsedBytes);
  const totalGB = (totalEnableBytes / GB).toFixed(1);
  const usedGB = (totalUsedBytes / GB).toFixed(2);
  const totalRemainingGB = (totalRemainingBytes / GB).toFixed(2);
  const overallUsedPercent = totalEnableBytes > 0 ? Math.min(100, Math.round((totalUsedBytes / totalEnableBytes) * 100)) : 0;

  return {
    totalGB,
    usedGB,
    totalRemainingGB,
    overallUsedPercent,
    minResetDays: minResetDays === 9999 ? 0 : minResetDays,
    isAnyWarning,
    count: accounts.length
  };
}

function parseTrafficData(data, logData = null, accountIndex = 0) {
  if (!data) return null;

  const GB = 1024 * 1024 * 1024;
  const u = data.u || 0;
  const d = data.d || 0;
  const transferEnable = data.transfer_enable || 0;
  const used = u + d;
  const remaining = Math.max(0, transferEnable - used);

  const totalGB = (transferEnable / GB).toFixed(1);
  const usedGB = (used / GB).toFixed(2);
  const remainingGB = (remaining / GB).toFixed(2);
  const usedPercent = transferEnable > 0 ? Math.min(100, Math.round((used / transferEnable) * 100)) : 0;

  let resetDaysLeft = 0;
  let expireDateStr = '无期限';
  if (data.reset_day) {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    let nextResetDate = new Date(currentYear, currentMonth, data.reset_day);
    if (nextResetDate <= today) {
      nextResetDate = new Date(currentYear, currentMonth + 1, data.reset_day);
    }
    resetDaysLeft = Math.ceil((nextResetDate - today) / (1000 * 60 * 60 * 24));
  }
  if (data.expired_at) {
    const exp = new Date(data.expired_at * 1000);
    expireDateStr = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`;
  }

  const rawPlanName = data.plan && data.plan.name ? data.plan.name : `账号 ${accountIndex + 1}`;
  let shortPlanName = rawPlanName;
  if (shortPlanName.length > 9) {
    shortPlanName = shortPlanName.slice(0, 8) + '…';
  }

  let shortEmail = '';
  if (data.email) {
    const parts = data.email.split('@');
    shortEmail = parts[0].length > 4 ? `${parts[0].slice(0, 4)}…@${parts[1] || ''}` : data.email;
  }

  const dailyStats = logData ? computeDailyStats(logData, data) : null;

  return {
    planName: rawPlanName,
    shortPlanName,
    shortEmail,
    email: data.email || '',
    accountIndex,
    totalGB,
    usedGB,
    remainingGB,
    usedPercent,
    resetDaysLeft,
    expireDateStr,
    enableBytes: transferEnable,
    usedBytes: used,
    dailyStats
  };
}

function computeDailyStats(logData, subData = null) {
  if (!logData || !Array.isArray(logData) || logData.length === 0) {
    return null;
  }

  const GB = 1024 * 1024 * 1024;
  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth();
  const currentD = now.getDate();

  let cycleStart = null;
  let cycleEnd = null;

  if (subData && subData.reset_day) {
    const resetDay = subData.reset_day;
    if (currentD >= resetDay) {
      cycleStart = new Date(currentY, currentM, resetDay, 0, 0, 0);
      cycleEnd = new Date(currentY, currentM + 1, resetDay - 1, 23, 59, 59);
    } else {
      cycleStart = new Date(currentY, currentM - 1, resetDay, 0, 0, 0);
      cycleEnd = new Date(currentY, currentM, resetDay - 1, 23, 59, 59);
    }
  } else {
    cycleStart = new Date(currentY, currentM, 1, 0, 0, 0);
    cycleEnd = new Date(currentY, currentM + 1, 0, 23, 59, 59);
  }

  const daysInCycle = Math.round((cycleEnd - cycleStart) / (1000 * 60 * 60 * 24)) + 1;
  const dailyMap = {};
  for (let i = 0; i < daysInCycle; i++) {
    const d = new Date(cycleStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dailyMap[key] = {
      date: key,
      day: d.getDate(),
      month: d.getMonth() + 1,
      bytes: 0,
      isFuture: d > now,
      isToday: d.getFullYear() === currentY && d.getMonth() === currentM && d.getDate() === currentD
    };
  }

  for (const item of logData) {
    if (!item.record_at) continue;
    const rDate = new Date(item.record_at * 1000);
    const key = `${rDate.getFullYear()}-${String(rDate.getMonth() + 1).padStart(2, '0')}-${String(rDate.getDate()).padStart(2, '0')}`;
    if (dailyMap[key]) {
      dailyMap[key].bytes += (item.u || 0) + (item.d || 0);
    }
  }

  const days = Object.values(dailyMap);
  let cycleTotalBytes = 0;
  let maxBytes = 0;
  let activeDays = 0;
  let todayBytes = 0;

  for (const day of days) {
    cycleTotalBytes += day.bytes;
    if (day.bytes > maxBytes) maxBytes = day.bytes;
    if (day.bytes > 0) activeDays++;
    if (day.isToday) todayBytes = day.bytes;
  }

  const cycleTotalGB = (cycleTotalBytes / GB).toFixed(2);
  const todayGB = (todayBytes / GB).toFixed(2);
  const maxGB = (maxBytes / GB).toFixed(2);
  const avgGB = activeDays > 0 ? (cycleTotalBytes / activeDays / GB).toFixed(2) : '0.00';
  const isTodayWarning = Number(todayGB) >= CONFIG.warning_daily_gb;

  for (const day of days) {
    day.gb = (day.bytes / GB).toFixed(2);
    day.isWarning = Number(day.gb) >= CONFIG.warning_daily_gb;
    if (day.bytes === 0) day.level = 0;
    else if (maxBytes === 0) day.level = 1;
    else {
      const ratio = day.bytes / maxBytes;
      if (ratio > 0.75) day.level = 4;
      else if (ratio > 0.5) day.level = 3;
      else if (ratio > 0.25) day.level = 2;
      else day.level = 1;
    }
  }

  const sMonth = String(cycleStart.getMonth() + 1).padStart(2, '0');
  const sDay = String(cycleStart.getDate()).padStart(2, '0');
  const eMonth = String(cycleEnd.getMonth() + 1).padStart(2, '0');
  const eDay = String(cycleEnd.getDate()).padStart(2, '0');

  return {
    days,
    daysInCycle,
    firstDayOfWeek: cycleStart.getDay(),
    cycleRangeLabel: `${sMonth}/${sDay} - ${eMonth}/${eDay}`,
    todayGB,
    todayBytes,
    cycleTotalGB,
    maxGB,
    avgGB,
    isTodayWarning
  };
}

async function checkAndTriggerAlertNotification(data) {
  if (!data || !data.accounts) return;
  const fm = FileManager.local();
  const alertCachePath = fm.joinPath(fm.documentsDirectory(), 'traffic_alert_record.json');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const threshold = CONFIG.warning_daily_gb;

  let alertRecord = {};
  if (fm.fileExists(alertCachePath)) {
    try {
      alertRecord = JSON.parse(fm.readString(alertCachePath)) || {};
    } catch (e) {}
  }

  for (const acc of data.accounts) {
    const daily = acc && acc.dailyStats;
    if (!daily || !daily.isTodayWarning) continue;

    const accName = acc.shortEmail || acc.planName || `账号${acc.accountIndex || 1}`;
    const alertKey = `${todayStr}_${accName}_${threshold}`;
    if (alertRecord[alertKey]) continue;

    try {
      const notif = new Notification();
      notif.title = '⚠️ 流量消耗超量预警';
      notif.body = `账号 [${accName}] 今日已消耗 ${daily.todayGB} GB，超过预警阈值 (${threshold} GB)！`;
      notif.sound = 'default';
      await notif.schedule();
      alertRecord[alertKey] = Date.now();
    } catch (err) {}
  }

  try {
    fm.writeString(alertCachePath, JSON.stringify(alertRecord));
  } catch (e) {}
}

// ================= 图形与布局渲染 =================

function getMediumChartWidth() {
  let screenW = 390;
  try {
    if (typeof Device !== 'undefined' && Device.screenSize) {
      screenW = Device.screenSize().width;
    }
  } catch (e) {}
  if (screenW >= 428) return 332;
  if (screenW >= 390) return 328;
  return 300;
}

function drawMonthHeatmapChart(dailyStats, width = 328, height = 80) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  if (!dailyStats || !dailyStats.days || dailyStats.days.length === 0) {
    return dc.getImage();
  }

  const { days, cycleRangeLabel, firstDayOfWeek, daysInCycle } = dailyStats;
  const LEVEL_COLORS = ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'];

  const totalDays = (days && days.length > 0) ? days.length : (daysInCycle || 31);
  const firstDayCol = (firstDayOfWeek + 6) % 7;
  const totalRows = Math.ceil((firstDayCol + totalDays) / 7);
  const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

  const topH = 13;
  const weekHeaderH = 10;
  const bottomMargin = 2;
  const availGridH = height - topH - weekHeaderH - bottomMargin;
  const gap = 2.5;
  const cellSize = Math.min(12, Math.floor((availGridH - (totalRows - 1) * gap) / totalRows));
  const gridW = 7 * cellSize + 6 * gap;

  // 居中计算
  const gridStartX = Math.max(2, Math.floor((width - gridW) / 2));
  const weekHeaderY = topH + 2;
  const gridY = weekHeaderY + weekHeaderH + 2;

  // 1. 周期标题
  dc.setFont(Font.boldSystemFont(8.5));
  dc.setTextColor(new Color('#24292F'));
  dc.setTextAlignedLeft();
  dc.drawTextInRect(cycleRangeLabel || '周期用量', new Rect(gridStartX, 0, gridW + 20, topH));

  // 2. 星期横轴标尺
  dc.setFont(Font.systemFont(7.5));
  dc.setTextColor(new Color('#8E8E93'));
  dc.setTextAlignedCenter();
  for (let c = 0; c < 7; c++) {
    const wx = gridStartX + c * (cellSize + gap);
    dc.drawTextInRect(weekHeaders[c], new Rect(wx, weekHeaderY, cellSize, weekHeaderH));
  }

  // 3. 矩阵圆角方块
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

    let hexColor;
    if (item.isWarning) {
      hexColor = '#FF4D4F';
    } else {
      const level = item.level !== undefined ? item.level : 0;
      hexColor = LEVEL_COLORS[level] || LEVEL_COLORS[0];
    }
    dc.setFillColor(new Color(hexColor));
    dc.fillPath();

    if (item.isToday) {
      todayRect = cellRect;
    }
  }

  // 4. 今日高亮指示外框
  if (todayRect) {
    const outlinePath = new Path();
    outlinePath.addRoundedRect(
      new Rect(todayRect.x - 1, todayRect.y - 1, todayRect.width + 2, todayRect.height + 2),
      cornerRadius + 1,
      cornerRadius + 1
    );
    dc.addPath(outlinePath);
    dc.setStrokeColor(new Color('#007AFF'));
    dc.setLineWidth(1.5);
    dc.strokePath();
  }

  return dc.getImage();
}

function drawProgressBar(percent, width = 140, height = 5, customColor = null) {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  dc.addPath(bgPath);
  dc.setFillColor(new Color('#E5E7EB'));
  dc.fillPath();

  if (percent > 0) {
    const fillWidth = Math.max(height, Math.min(width, (width * percent) / 100));
    const fillPath = new Path();
    fillPath.addRoundedRect(new Rect(0, 0, fillWidth, height), height / 2, height / 2);
    dc.addPath(fillPath);

    let color = customColor;
    if (!color) {
      if (percent > 85) color = '#FF3B30';
      else if (percent > 65) color = '#FF9500';
      else color = '#10B981';
    }
    dc.setFillColor(new Color(color));
    dc.fillPath();
  }

  return dc.getImage();
}

// 单账号 - 中号小组件 (Medium 经典单账号看板)
function renderMediumWidget(widget, data) {
  const isLow = data.remainingGB < 5 || data.usedPercent > 90;
  const numColor = isLow ? '#FF3B30' : (data.remainingGB < 20 ? '#FF9500' : '#10B981');

  // 顶部行：套餐名 + 重置天数
  const topRow = widget.addStack();
  topRow.layoutHorizontally();
  topRow.centerAlignContent();

  const titleText = topRow.addText(data.planName);
  titleText.font = Font.boldSystemFont(13.5);
  titleText.textColor = new Color('#1C1C1E');

  topRow.addSpacer();

  const resetBadge = topRow.addStack();
  resetBadge.backgroundColor = new Color('#F2F4F7');
  resetBadge.cornerRadius = 5;
  resetBadge.setPadding(2, 6, 2, 6);
  const resetText = resetBadge.addText(`${data.resetDaysLeft}天后重置`);
  resetText.font = Font.mediumSystemFont(9.5);
  resetText.textColor = new Color('#007AFF');

  widget.addSpacer(6);

  // 主体行：左侧关键指标 + 右侧每日热力图
  const bodyRow = widget.addStack();
  bodyRow.layoutHorizontally();
  bodyRow.centerAlignContent();
  bodyRow.spacing = 10;

  // 左侧卡片
  const leftCard = bodyRow.addStack();
  leftCard.layoutVertically();
  leftCard.backgroundColor = new Color('#F6F7F9');
  leftCard.cornerRadius = 10;
  leftCard.setPadding(9, 10, 9, 10);
  leftCard.size = new Size(115, 86);

  const remLbl = leftCard.addText('剩余流量');
  remLbl.font = Font.systemFont(9);
  remLbl.textColor = new Color('#8E8E93');

  leftCard.addSpacer(2);

  const valStack = leftCard.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(`${data.remainingGB}`);
  remVal.font = Font.boldSystemFont(19);
  remVal.textColor = new Color(numColor);

  valStack.addSpacer(2);
  const unit = valStack.addText('GB');
  unit.font = Font.boldSystemFont(9.5);
  unit.textColor = new Color(numColor);

  leftCard.addSpacer(4);

  const pbImg = drawProgressBar(data.usedPercent, 95, 4, isLow ? '#FF3B30' : null);
  const pbWidget = leftCard.addImage(pbImg);
  pbWidget.imageSize = new Size(95, 4);
  pbWidget.resizable = true;

  leftCard.addSpacer(4);

  const usedT = leftCard.addText(`已用 ${data.usedPercent}%`);
  usedT.font = Font.systemFont(8.5);
  usedT.textColor = new Color('#8E8E93');

  // 右侧热力图
  const rightStack = bodyRow.addStack();
  rightStack.layoutVertically();

  const chartW = getMediumChartWidth() - 125;
  const chartH = 86;
  if (data.dailyStats && data.dailyStats.days && data.dailyStats.days.length > 0) {
    const heatImg = drawMonthHeatmapChart(data.dailyStats, chartW, chartH);
    const heatWidget = rightStack.addImage(heatImg);
    heatWidget.imageSize = new Size(chartW, chartH);
    heatWidget.resizable = true;
  }
}

// 双账号 - 中号小组件 (Medium 左右双卡片分栏仪表盘，去除非必要进度条)
function renderDualMediumWidget(widget, accounts, summary) {
  const fullW = getMediumChartWidth();
  const cardsSpacing = 8;
  const cardW = Math.floor((fullW - cardsSpacing) / 2);
  const cardInnerW = cardW - 16;
  const chartH = 86;

  // 左右双卡片水平容器
  const cardsContainer = widget.addStack();
  cardsContainer.layoutHorizontally();
  cardsContainer.spacing = cardsSpacing;

  for (let i = 0; i < 2; i++) {
    const acc = accounts[i];
    if (!acc) continue;

    const isLow = acc.remainingGB < 5 || acc.usedPercent > 90;
    const numColor = isLow ? '#FF3B30' : (acc.remainingGB < 20 ? '#FF9500' : '#10B981');

    // 账号专属圆角卡片
    const card = cardsContainer.addStack();
    card.layoutVertically();
    card.backgroundColor = new Color('#F6F7F9');
    card.cornerRadius = 10;
    card.setPadding(8, 8, 8, 8);

    // 1. 卡片顶部：账号标识 + 剩余流量 + 重置天数
    const cardHeader = card.addStack();
    cardHeader.layoutHorizontally();
    cardHeader.centerAlignContent();

    const tagStack = cardHeader.addStack();
    tagStack.backgroundColor = new Color('#E5E7EB');
    tagStack.cornerRadius = 3.5;
    tagStack.setPadding(1, 4, 1, 4);
    const tagText = tagStack.addText(`A${i + 1}`);
    tagText.font = Font.boldSystemFont(8.5);
    tagText.textColor = new Color('#374151');

    cardHeader.addSpacer(4);

    const remVal = cardHeader.addText(`余${acc.remainingGB}G`);
    remVal.font = Font.boldSystemFont(11.5);
    remVal.textColor = new Color(numColor);

    cardHeader.addSpacer();

    const resetLbl = cardHeader.addText(`${acc.resetDaysLeft}天重置`);
    resetLbl.font = Font.systemFont(8.5);
    resetLbl.textColor = new Color('#8E8E93');

    card.addSpacer(5);

    // 2. 专属每日用量热力图 (居中舒展，无进度条折行干扰)
    if (acc.dailyStats && acc.dailyStats.days && acc.dailyStats.days.length > 0) {
      const chartImg = drawMonthHeatmapChart(acc.dailyStats, cardInnerW, chartH);
      const chartWidgetImg = card.addImage(chartImg);
      chartWidgetImg.imageSize = new Size(cardInnerW, chartH);
      chartWidgetImg.resizable = true;
    } else {
      const pbImg = drawProgressBar(acc.usedPercent || 0, cardInnerW, 8);
      const pbWidgetImg = card.addImage(pbImg);
      pbWidgetImg.imageSize = new Size(cardInnerW, 8);
      pbWidgetImg.resizable = true;
    }
  }
}

function renderErrorWidget(widget, message = '服务不可用') {
  widget.addSpacer();
  const centerStack = widget.addStack();
  centerStack.layoutVertically();
  centerStack.centerAlignContent();

  const titleText = centerStack.addText(message);
  titleText.font = Font.boldSystemFont(14);
  titleText.textColor = new Color('#FF3B30');
  if (typeof titleText.centerAlignText === 'function') titleText.centerAlignText();

  centerStack.addSpacer(3);

  const descText = centerStack.addText('请检查网络或配置');
  descText.font = Font.systemFont(10);
  descText.textColor = new Color('#8E8E93');
  if (typeof descText.centerAlignText === 'function') descText.centerAlignText();
  widget.addSpacer();
}

function formatCurrentTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 执行渲染
await main();
