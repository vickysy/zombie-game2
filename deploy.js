const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('准备自动化部署，请稍候...');

// 我们需要用到 netlify-cli，先下载一个独立的二进制文件或者尝试通过 npx 运行
try {
  console.log('正在尝试使用 npx netlify-cli 部署...');
  // 直接使用 npx 运行 netlify，不需要全局安装 npm 包
  // --dir=. 表示部署当前目录，--prod 表示部署到生产环境
  const result = execSync('npx netlify-cli deploy --dir=. --prod', { encoding: 'utf8' });
  console.log('部署成功！');
  
  // 从输出中提取 URL
  const match = result.match(/Website URL:\s+(https:\/\/[^\s]+)/);
  if (match && match[1]) {
    console.log('\n======================================');
    console.log('恭喜！您的游戏已上线！');
    console.log(const https = require('https');
const   const fs = require('fs');
consogconst path = require('path==const { execSync } = require('"chon