const express = require('express');
const path = require('path');
const app = express();

// Railway 会自动分配端口到 process.env.PORT
const port = process.env.PORT || 3000;

// 让服务器直接公开当前目录下的所有文件 (index.html, game.js, style.css 等)
app.use(express.static(__dirname));

// 处理所有请求，返回 index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Game server is running on port ${port}`);
});