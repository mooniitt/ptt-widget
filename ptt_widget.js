/**
 * iOS 流量订阅桌面小组件 (远程核心逻辑)
 * 适配尺寸：Small (小卡片) / Medium (中卡片)
 */

// ================= 配置区域 =================
const CONFIG = {
  // 订阅 API 地址
  api_url: 'https://ptt.ixlmo.com/api/v1/user/getSubscribe',
  // 从 Loader 注入的全局变量或小组件参数中读取 Token（不在远程写死）
  token: globalThis.__LOCAL_TRAFFIC_TOKEN__ || (args.widgetParameter && args.widgetParameter.trim()) || '',
  // 刷新间隔（秒）
  cache_time: 600
};

// ================= 主逻辑 =================
async function main() {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#FFFFFF');
  widget.setPadding(14, 16, 14, 16);

  const widgetSize = config.widgetFamily || 'medium';

  try {
    if (!CONFIG.token) {
      renderErrorWidget(widget, '未配置 Token');
    } else {
      const data = await fetchData();
      if (!data) {
        renderErrorWidget(widget, '服务不可用');
      } else if (widgetSize === 'small') {
        renderSmallWidget(widget, data);
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
  
  try {
    const req = new Request(`${CONFIG.api_url}?t=${Date.now()}`);
    req.timeoutInterval = 10;
    req.headers = {
      'accept': 'application/json, text/plain, */*',
      'authorization': `Bearer ${CONFIG.token}`,
      'referer': 'https://ptt.ixlmo.com/',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)'
    };
    
    const res = await req.loadJSON();
    if (res && res.status === 'success' && res.data) {
      fm.writeString(cachePath, JSON.stringify(res.data));
      const parsed = parseTraffic(res.data);
      if (parsed) {
        parsed.isFromCache = false;
      }
      return parsed;
    }
  } catch (e) {
    console.log('网络请求失败，尝试读取本地缓存数据: ' + e);
  }

  // 读取缓存
  try {
    if (fm.fileExists(cachePath)) {
      const cacheStr = fm.readString(cachePath);
      const cachedData = JSON.parse(cacheStr);
      if (cachedData) {
        const parsed = parseTraffic(cachedData);
        if (parsed) {
          parsed.isFromCache = true;
        }
        return parsed;
      }
    }
  } catch (e) {
    console.log('读取缓存失败: ' + e);
  }

  return null;
}

// 解析与单位换算 (Byte -> GB)
function parseTraffic(info) {
  if (!info || typeof info !== 'object') return null;

  const u = Number(info.u) || 0;
  const d = Number(info.d) || 0;
  const totalUsed = u + d;
  const totalEnable = Number(info.transfer_enable) || 1;
  const remaining = Math.max(0, totalEnable - totalUsed);

  const GB = 1024 * 1024 * 1024;
  const usedGB = (totalUsed / GB).toFixed(2);
  const totalGB = (totalEnable / GB).toFixed(2);
  const remainingGB = (remaining / GB).toFixed(2);
  const usedPercent = Math.min(100, Math.round((totalUsed / totalEnable) * 100));
  const remainingPercent = 100 - usedPercent;

  let resetDaysLeft = 0;
  if (info.next_reset_at) {
    const now = Math.floor(Date.now() / 1000);
    resetDaysLeft = Math.max(0, Math.ceil((info.next_reset_at - now) / 86400));
  }

  let expireDateStr = '长期有效';
  if (info.expired_at) {
    const expireDate = new Date(info.expired_at * 1000);
    const y = expireDate.getFullYear();
    const m = String(expireDate.getMonth() + 1).padStart(2, '0');
    const d = String(expireDate.getDate()).padStart(2, '0');
    expireDateStr = `${y}-${m}-${d}`;
  }

  return {
    planName: (info.plan && info.plan.name) ? info.plan.name.replace(/^[^\w\u4e00-\u9fa5]+/, '').trim() : '流量套餐',
    email: info.email || '',
    usedGB,
    totalGB,
    remainingGB,
    usedPercent,
    remainingPercent,
    resetDaysLeft,
    expireDateStr,
    isFromCache: false,
    updateTime: formatCurrentTime()
  };
}

// 格式化当前时间 (HH:mm)
function formatCurrentTime() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
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

// 中号小组件
function renderMediumWidget(widget, data) {
  const headerStack = widget.addStack();
  headerStack.layoutHorizontally();
  headerStack.centerAlignContent();

  const titleText = headerStack.addText(data.planName);
  titleText.font = Font.boldSystemFont(14);
  titleText.textColor = new Color('#1C1C1E');

  headerStack.addSpacer();

  const resetStack = headerStack.addStack();
  resetStack.backgroundColor = new Color('#F2F4F7');
  resetStack.cornerRadius = 6;
  resetStack.setPadding(3, 8, 3, 8);
  
  const resetText = resetStack.addText(`${data.resetDaysLeft} 天后重置`);
  resetText.font = Font.systemFont(11);
  resetText.textColor = new Color('#007AFF');

  widget.addSpacer(10);

  const bodyStack = widget.addStack();
  bodyStack.layoutHorizontally();
  bodyStack.bottomAlignContent();

  const leftStack = bodyStack.addStack();
  leftStack.layoutVertically();

  const remLabel = leftStack.addText('剩余流量');
  remLabel.font = Font.systemFont(11);
  remLabel.textColor = new Color('#8E8E93');

  leftStack.addSpacer(2);

  const valStack = leftStack.addStack();
  valStack.layoutHorizontally();
  valStack.bottomAlignContent();

  const remVal = valStack.addText(data.remainingGB);
  remVal.font = Font.boldSystemFont(32);
  remVal.textColor = new Color('#10B981');

  valStack.addSpacer(4);

  const unitStack = valStack.addStack();
  unitStack.layoutVertically();
  const unitText = unitStack.addText('GB');
  unitText.font = Font.boldSystemFont(14);
  unitText.textColor = new Color('#10B981');
  unitStack.addSpacer(4);

  bodyStack.addSpacer();

  const rightStack = bodyStack.addStack();
  rightStack.layoutVertically();

  const detailText = rightStack.addText(`已用 ${data.usedGB} / ${data.totalGB} GB`);
  detailText.font = Font.mediumSystemFont(12);
  detailText.textColor = new Color('#1C1C1E');

  rightStack.addSpacer(2);

  const percentText = rightStack.addText(`已使用 ${data.usedPercent}%`);
  percentText.font = Font.systemFont(11);
  percentText.textColor = new Color('#8E8E93');
  rightStack.addSpacer(10);

  widget.addSpacer(12);

  const progressImg = drawProgressBar(data.usedPercent, 400, 10);
  const progressWidgetImg = widget.addImage(progressImg);
  progressWidgetImg.resizable = true;

  widget.addSpacer(10);

  const footerStack = widget.addStack();
  footerStack.layoutHorizontally();
  footerStack.centerAlignContent();

  const expireText = footerStack.addText(`到期时间: ${data.expireDateStr}`);
  expireText.font = Font.systemFont(10);
  expireText.textColor = new Color('#8E8E93');

  footerStack.addSpacer();

  renderStatusBadge(footerStack, data, false);
}

// 小号小组件
function renderSmallWidget(widget, data) {
  const titleText = widget.addText(data.planName);
  titleText.font = Font.boldSystemFont(12);
  titleText.textColor = new Color('#1C1C1E');
  titleText.lineLimit = 1;

  widget.addSpacer(6);

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

  widget.addSpacer(8);

  const progressImg = drawProgressBar(data.usedPercent, 200, 8);
  const progressWidgetImg = widget.addImage(progressImg);
  progressWidgetImg.resizable = true;

  widget.addSpacer(6);

  const subText = widget.addText(`共 ${data.totalGB} GB · ${data.resetDaysLeft}天后重置`);
  subText.font = Font.systemFont(10);
  subText.textColor = new Color('#8E8E93');

  widget.addSpacer(2);

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
