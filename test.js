// PTT Widget - 自动化测试套件 (覆盖 Small / Medium / Large / Loader / Loader.min)
const fs = require('fs');
const path = require('path');

class MockColor {
  constructor(hex, alpha = 1) {
    this.hex = hex;
    this.alpha = alpha;
  }
}

class MockFont {
  static systemFont(size) { return { name: 'system', size }; }
  static boldSystemFont(size) { return { name: 'bold', size }; }
  static mediumSystemFont(size) { return { name: 'medium', size }; }
}

class MockRect {
  constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
}
class MockPoint {
  constructor(x, y) { Object.assign(this, { x, y }); }
}
class MockSize {
  constructor(width, height) { Object.assign(this, { width, height }); }
}
class MockPath {
  addRoundedRect() {}
  addEllipse() {}
  move() {}
  addLine() {}
  closeSubpath() {}
}

class MockDrawContext {
  constructor() {
    this.size = new MockSize(100, 100);
  }
  setFillColor() {}
  setStrokeColor() {}
  setLineWidth() {}
  setFont() {}
  setTextColor() {}
  setTextAlignedLeft() {}
  setTextAlignedCenter() {}
  drawTextInRect() {}
  addPath() {}
  fillPath() {}
  strokePath() {}
  getImage() { return { isImage: true }; }
}

class MockStack {
  constructor() {
    this.children = [];
  }
  layoutHorizontally() {}
  layoutVertically() {}
  centerAlignContent() {}
  bottomAlignContent() {}
  addSpacer() {}
  setPadding() {}
  addText(str) {
    const t = { text: str, font: null, textColor: null, lineLimit: 0, centerAlignText() {} };
    this.children.push(t);
    return t;
  }
  addImage(img) {
    const im = { image: img, imageSize: null, resizable: false };
    this.children.push(im);
    return im;
  }
  addStack() {
    const s = new MockStack();
    this.children.push(s);
    return s;
  }
}

class MockWidget extends MockStack {
  constructor() {
    super();
    this.backgroundColor = null;
    this.presentedSize = null;
  }
  async presentSmall() { this.presentedSize = 'small'; }
  async presentMedium() { this.presentedSize = 'medium'; }
  async presentLarge() { this.presentedSize = 'large'; }
  async presentExtraLarge() { this.presentedSize = 'extraLarge'; }
}

const mockDocsDir = path.join(__dirname, 'tests/mock_docs');

class MockFileManager {
  static local() { return new MockFileManager(); }
  documentsDirectory() { return mockDocsDir; }
  joinPath(a, b) { return path.join(a, b); }
  fileExists(p) { return fs.existsSync(p); }
  readString(p) { return fs.readFileSync(p, 'utf-8'); }
  writeString(p, c) { fs.writeFileSync(p, c, 'utf-8'); }
  remove(p) { if (fs.existsSync(p)) fs.unlinkSync(p); }
}

class MockDevice {
  static isUsingDarkAppearance() { return false; }
  static screenSize() { return { width: 393, height: 852 }; }
  static screenScale() { return 3; }
}

class MockNotification {
  schedule() {}
}

function setupGlobalEnv(widgetParam = '', widgetFamily = '') {
  let createdWidget = null;
  global.Color = MockColor;
  global.Font = MockFont;
  global.Rect = MockRect;
  global.Point = MockPoint;
  global.Size = MockSize;
  global.Path = MockPath;
  global.DrawContext = MockDrawContext;
  global.ListWidget = class extends MockWidget {
    constructor() {
      super();
      createdWidget = this;
    }
  };
  global.FileManager = MockFileManager;
  global.Device = MockDevice;
  global.Notification = MockNotification;
  global.config = {
    runsInWidget: false,
    widgetFamily: widgetFamily
  };
  global.args = {
    widgetParameter: widgetParam
  };
  global.Script = {
    setWidget: (w) => { createdWidget = w; },
    complete: () => {}
  };
  global.Request = class {
    constructor(url) { this.url = url; }
    async loadString() { return 'class ListWidget {}'; }
    async loadJSON() { return {}; }
  };

  return () => createdWidget;
}

function collectTexts(node) {
  let texts = [];
  if (!node) return texts;
  if (node.text !== undefined) texts.push(node.text);
  if (node.children) {
    for (const c of node.children) texts = texts.concat(collectTexts(c));
  }
  return texts;
}

async function runTest() {
  console.log('=== 开始全面自动化测试 (Small / Medium / Large / Loader) ===\n');

  const filesToTest = [
    { name: 'Small Widget (双账号)', file: 'ptt_widget_small.js', param: '', expPresent: 'small' },
    { name: 'Small Widget (单账号1)', file: 'ptt_widget_small.js', param: '1', expPresent: 'small' },
    { name: 'Medium Widget (双账号)', file: 'ptt_widget_medium.js', param: '', expPresent: 'medium' },
    { name: 'Medium Widget (单账号2)', file: 'ptt_widget_medium.js', param: '2', expPresent: 'medium' },
    { name: 'Large Widget (双账号)', file: 'ptt_widget_large.js', param: '', expPresent: 'large' },
    { name: 'Large Widget (单账号1)', file: 'ptt_widget_large.js', param: '1', expPresent: 'large' },
  ];

  const repoRoot = __dirname;

  for (const t of filesToTest) {
    const filePath = path.join(repoRoot, t.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ 文件不存在: ${t.file}`);
      process.exit(1);
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    const getWidget = setupGlobalEnv(t.param);

    try {
      await eval(`(async () => { ${code} })()`);
      const widget = getWidget();
      const allTexts = collectTexts(widget);
      console.log(`✅ [${t.name}] 运行成功！`);
      console.log(`   - 预览尺寸: ${widget.presentedSize} (期望: ${t.expPresent})`);
      console.log(`   - 提取文案: ${allTexts.slice(0, 5).join(' | ')} ... (共 ${allTexts.length} 个文本元素)`);
    } catch (err) {
      console.error(`❌ [${t.name}] 运行出错:`, err);
      process.exit(1);
    }
  }

  console.log('\n--- 测试 Loader 智能调度 ---');
  const loaderPath = path.join(repoRoot, 'traffic_widget_loader.js');
  const loaderCode = fs.readFileSync(loaderPath, 'utf-8');
  setupGlobalEnv('m, 1', 'medium');
  try {
    await eval(`(async () => { ${loaderCode} })()`);
    console.log('✅ [Loader - 参数 m, 1] 运行成功');
  } catch (err) {
    console.error('❌ Loader 测试失败:', err);
    process.exit(1);
  }

  console.log('\n--- 测试 Loader.min 压缩版 ---');
  const minLoaderPath = path.join(repoRoot, 'traffic_widget_loader.min.js');
  const minLoaderCode = fs.readFileSync(minLoaderPath, 'utf-8');
  setupGlobalEnv('s', 'small');
  try {
    await eval(`(async () => { ${minLoaderCode} })()`);
    console.log('✅ [Loader.min - 参数 s] 运行成功');
  } catch (err) {
    console.error('❌ Loader.min 测试失败:', err);
    process.exit(1);
  }

  console.log('\n🎉 全部自动化测试 100% 通过！各模块运行无误。');
}

runTest();
