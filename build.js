#!/usr/bin/env node

/**
 * PTT Widget - 自动化打包构建脚本
 * 功能：将 traffic_widget_loader.js 编译压缩为 traffic_widget_loader.min.js 并自动剥离所有 Header 注释。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcFile = path.join(__dirname, 'traffic_widget_loader.js');
const distFile = path.join(__dirname, 'traffic_widget_loader.min.js');

if (!fs.existsSync(srcFile)) {
  console.error(`❌ 源文件不存在: ${srcFile}`);
  process.exit(1);
}

console.log('🚀 开始打包构建 traffic_widget_loader.min.js ...');
const startTime = Date.now();

try {
  // 使用 terser 剥离所有注释并进行 AST 压缩
  execSync(`npx --yes terser "${srcFile}" --module -c -m --comments false -o "${distFile}"`, {
    stdio: 'inherit'
  });

  const srcStat = fs.statSync(srcFile);
  const distStat = fs.statSync(distFile);
  const duration = Date.now() - startTime;
  const ratio = ((1 - distStat.size / srcStat.size) * 100).toFixed(1);

  console.log(`\n✨ 打包成功！耗时: ${duration}ms`);
  console.log(`📄 源文件:   traffic_widget_loader.js     (${srcStat.size} 字节)`);
  console.log(`📦 压缩输出: traffic_widget_loader.min.js (${distStat.size} 字节)`);
  console.log(`📉 体积缩减: ${ratio}% (已完全移除 Header 注释与多余空白)`);
} catch (err) {
  console.error('❌ 打包过程出现异常:', err.message);
  process.exit(1);
}
