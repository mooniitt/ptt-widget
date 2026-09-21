// Variables used by Scriptable.
// These must be at the top of the file to be parsed by Scriptable.
// icon-color: green; icon-glyph: chart-pie;

/**
 * iOS 流量小组件 - 小尺寸专属版本 (Small Widget)
 * 特性：专为 1:1 小方块尺寸打造，极致克制、上下双卡片堆叠、大字核心指标速览
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
  tokens: resolveActiveTokens(),
  cache_time: 600,
  warning_daily_gb: 10.0,
  warning_today_ratio: 0.15
};

// ================= 主逻辑 =================
async function main() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#FFFFFF');
  widget.setPadding(12, 12, 12, 12);

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
          renderDualSmallWidget(widget, data.accounts, data.summary);
        } else {
          renderSmallWidget(widget, data.accounts[0]);
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
    await widget.presentSmall();
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
  let todayRecord = null;
  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth();
  const currentD = now.getDate();

  for (const item of logData) {
    if (!item.record_at) continue;
    const rDate = new Date(item.record_at * 1000);
    if (rDate.getFullYear() === currentY && rDate.getMonth() === currentM && rDate.getDate() === currentD) {
      todayRecord = item;
      break;
    }
  }

  const todayBytes = todayRecord ? ((todayRecord.u || 0) + (todayRecord.d || 0)) : 0;
  const todayGB = (todayBytes / GB).toFixed(2);
  const isTodayWarning = Number(todayGB) >= CONFIG.warning_daily_gb;

  return {
    todayGB,
    todayBytes,
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

function drawProgressBar(percent, width = 200, height = 8, customColor = null, bgColor = '#E5E7EB') {
  const dc = new DrawContext();
  dc.size = new Size(width, height);
  dc.opaque = false;
  dc.respectScreenScale = true;

  const bgPath = new Path();
  bgPath.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  dc.addPath(bgPath);
  dc.setFillColor(new Color(bgColor));
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

// 单账号 - 小号小组件 (Small 经典大字看板)
function renderSmallWidget(widget, data) {
  const isLow = data.remainingGB < 5 || data.usedPercent > 90;
  const numColor = isLow ? '#FF3B30' : (data.remainingGB < 20 ? '#FF9500' : '#10B981');

  // 顶部行：套餐名称 + 重置倒计时
  const topRow = widget.addStack();
  topRow.layoutHorizontally();
  topRow.centerAlignContent();

  const titleText = topRow.addText(data.shortPlanName || data.planName);
  titleText.font = Font.boldSystemFont(11.5);
  titleText.textColor = new Color('#1C1C1E');
  titleText.lineLimit = 1;

  topRow.addSpacer();

  const resetBadge = topRow.addStack();
  resetBadge.backgroundColor = new Color('#F2F4F7');
  resetBadge.cornerRadius = 4;
  resetBadge.setPadding(1.5, 5, 1.5, 5);
  const resetText = resetBadge.addText(`${data.resetDaysLeft}d`);
  resetText.font = Font.mediumSystemFont(9);
  resetText.textColor = new Color('#007AFF');

  widget.addSpacer(8);

  // 核心剩余流量
  const remLabel = widget.addText('剩余流量');
  remLabel.font = Font.systemFont(9.5);
  remLabel.textColor = new Color('#8E8E93');

  widget.addSpacer(2);

  const valStack = widget.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(data.remainingGB);
  remVal.font = Font.boldSystemFont(27);
  remVal.textColor = new Color(numColor);

  valStack.addSpacer(2);

  const unitText = valStack.addText('GB');
  unitText.font = Font.boldSystemFont(11);
  unitText.textColor = new Color(numColor);

  widget.addSpacer(6);

  // 进度条
  const progressImg = drawProgressBar(data.usedPercent, 130, 4.5, isLow ? '#FF3B30' : null);
  const progressWidgetImg = widget.addImage(progressImg);
  progressWidgetImg.imageSize = new Size(130, 4.5);
  progressWidgetImg.resizable = true;

  widget.addSpacer(7);

  // 底部用量
  const footRow = widget.addStack();
  footRow.layoutHorizontally();
  footRow.centerAlignContent();

  const subText = footRow.addText(`用 ${data.usedGB} / ${data.totalGB}G`);
  subText.font = Font.systemFont(9);
  subText.textColor = new Color('#8E8E93');

  footRow.addSpacer();

  const pctText = footRow.addText(`${data.usedPercent}%`);
  pctText.font = Font.systemFont(9);
  pctText.textColor = new Color('#8E8E93');
}

// 双账号 - 小号小组件 (Small 上下双卡片堆叠设计)
function renderDualSmallWidget(widget, accounts, summary) {
  for (let i = 0; i < 2; i++) {
    const acc = accounts[i];
    if (!acc) continue;

    const isLow = acc.remainingGB < 5 || acc.usedPercent > 90;
    const numColor = isLow ? '#FF3B30' : (acc.remainingGB < 20 ? '#FF9500' : '#10B981');

    // 账号专属轻量圆角卡片
    const card = widget.addStack();
    card.layoutVertically();
    card.backgroundColor = new Color('#F6F7F9');
    card.cornerRadius = 8;
    card.setPadding(7, 8, 7, 8);

    // 行 1: 标签 + 剩余量 + 重置天数
    const r1 = card.addStack();
    r1.layoutHorizontally();
    r1.centerAlignContent();

    const tag = r1.addStack();
    tag.backgroundColor = new Color('#E5E7EB');
    tag.cornerRadius = 3;
    tag.setPadding(1, 4, 1, 4);
    const tagT = tag.addText(`A${i + 1}`);
    tagT.font = Font.boldSystemFont(8.5);
    tagT.textColor = new Color('#374151');

    r1.addSpacer(4);

    const remT = r1.addText(`余${acc.remainingGB}G`);
    remT.font = Font.boldSystemFont(11);
    remT.textColor = new Color(numColor);

    r1.addSpacer();

    const rstT = r1.addText(`${acc.resetDaysLeft}d`);
    rstT.font = Font.systemFont(8.5);
    rstT.textColor = new Color('#8E8E93');

    card.addSpacer(4);

    // 行 2: 细进度条 + 百分比
    const r2 = card.addStack();
    r2.layoutHorizontally();
    r2.centerAlignContent();
    r2.spacing = 4;

    const pbW = 90;
    const pb = drawProgressBar(acc.usedPercent, pbW, 3.5, isLow ? '#FF3B30' : null);
    const pbImg = r2.addImage(pb);
    pbImg.imageSize = new Size(pbW, 3.5);
    pbImg.resizable = true;

    r2.addSpacer();

    const pct = r2.addText(`${acc.usedPercent}%`);
    pct.font = Font.systemFont(8);
    pct.textColor = new Color('#8E8E93');

    card.addSpacer(3);

    // 行 3: 配额一览
    const r3 = card.addStack();
    r3.layoutHorizontally();
    r3.centerAlignContent();

    const usedT = r3.addText(`用 ${acc.usedGB} / ${acc.totalGB}G`);
    usedT.font = Font.systemFont(8);
    usedT.textColor = new Color('#8E8E93');

    if (i === 0) {
      widget.addSpacer(6);
    }
  }
}

function renderErrorWidget(widget, message = '服务不可用') {
  widget.addSpacer();
  const centerStack = widget.addStack();
  centerStack.layoutVertically();
  centerStack.centerAlignContent();

  const titleText = centerStack.addText(message);
  titleText.font = Font.boldSystemFont(13);
  titleText.textColor = new Color('#FF3B30');
  if (typeof titleText.centerAlignText === 'function') titleText.centerAlignText();

  centerStack.addSpacer(3);

  const descText = centerStack.addText('请检查网络或配置');
  descText.font = Font.systemFont(9.5);
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
