        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = 1280;
        canvas.height = 720;
        
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const gravity = 0.7;
        let gameEnded = false;
        
        // 背景类（简易版）
        class Background {
            draw() {
                ctx.fillStyle = '#2c3e50';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // 地板
                ctx.fillStyle = '#1a252f';
                ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
                // 装饰线
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(0, canvas.height - 50, canvas.width, 3);
            }
        }
        
        const background = new Background();
        
        // 飞行物（火炮）类
        class Projectile {
            constructor({ position, velocity, color, facingRight }) {
                this.position = position;
                this.velocity = velocity;
                this.width = 30;
                this.height = 10;
                this.color = color;
                this.markedForDeletion = false;
                this.facingRight = facingRight;
            }
        
            draw() {
                ctx.fillStyle = this.color;
                ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
                // 加点特效
                ctx.fillStyle = 'white';
                ctx.fillRect(this.facingRight ? this.position.x + 20 : this.position.x, this.position.y + 2, 10, 6);
            }
        
            update() {
                this.draw();
                this.position.x += this.velocity.x;
                if (this.position.x > canvas.width || this.position.x + this.width < 0) {
                    this.markedForDeletion = true;
                }
            }
        }
        
        class Fighter {
            constructor({ position, velocity, color, isPlayer1 }) {
                this.position = position;
                this.velocity = velocity;
                this.width = 80;
                this.height = 200;
                this.color = color;
                this.isPlayer1 = isPlayer1;
                this.health = 10;
                this.maxHealth = 10;
                
                this.attackBox = {
                    position: { x: this.position.x, y: this.position.y },
                    width: 150,
                    height: 60
                };
                
                this.isAttacking = false;
                this.attackType = ''; // 'sword' | 'dash'
                this.facingRight = isPlayer1;
                
                // 呼吸动画属性
                this.idleTime = 0;
                
                // 冲刺属性
                this.isDashing = false;
                this.dashFrames = 0;
                
                // 投掷物
                this.projectiles = [];
        
                // 加载图片
                this.image = new Image();
                if (isPlayer1) {
                    this.image.src = 'optimus.png'; // 请放入擎天柱图片
                } else {
                    this.image.src = 'scourge.png'; // 请放入天灾图片
                }
            }
        
            draw() {
                // 待机呼吸动画 (小幅度上下移动/形变)
                let renderY = this.position.y;
                let renderHeight = this.height;
                
                if (this.velocity.x === 0 && this.velocity.y === 0 && !this.isDashing && !this.isAttacking) {
                    this.idleTime += 0.1;
                    const breath = Math.sin(this.idleTime) * 3; // 呼吸幅度
                    renderHeight = this.height + breath;
                    renderY = this.position.y - breath;
                } else {
                    this.idleTime = 0;
                }
        
                // 如果有图片，则绘制图片；否则绘制方块作为替补
                if (this.image && this.image.complete) {
                    ctx.save();
                    if (!this.facingRight) {
                        // 如果朝左，翻转图片
                        ctx.translate(this.position.x + this.width, renderY);
                        ctx.scale(-1, 1);
                        ctx.drawImage(this.image, 0, 0, this.width, renderHeight);
                    } else {
                        ctx.drawImage(this.image, this.position.x, renderY, this.width, renderHeight);
                    }
                    ctx.restore();
                } else {
                    // 画身体替补
                    ctx.fillStyle = this.color;
                    ctx.fillRect(this.position.x, renderY, this.width, renderHeight);
        
                    // 画眼睛(区分正反面)
                    ctx.fillStyle = 'yellow';
                    if (this.facingRight) {
                        ctx.fillRect(this.position.x + 55, renderY + 25, 15, 15);
                    } else {
                        ctx.fillRect(this.position.x + 10, renderY + 25, 15, 15);
                    }
                }
        
                // 画攻击判定框 (测试用，半透明，实际游戏可隐藏)
                // if (this.isAttacking) {
                //     ctx.fillStyle = this.attackType === 'dash' ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 255, 0, 0.5)';
                //     ctx.fillRect(
                //         this.attackBox.position.x, 
                //         this.attackBox.position.y, 
                //         this.attackBox.width, 
                //         this.attackBox.height
                //     );
                // }
        
                // 画飞行物
                this.projectiles.forEach(p => p.draw());
            }
        
            update() {
                this.draw();
                
                // 更新飞行物
                this.projectiles.forEach(p => p.update());
                this.projectiles = this.projectiles.filter(p => !p.markedForDeletion);
        
                // 更新攻击框位置
                if (this.facingRight) {
                    this.attackBox.position.x = this.position.x + this.width;
                } else {
                    this.attackBox.position.x = this.position.x - this.attackBox.width;
                }
                // 剑刺偏上，冲刺拳偏中
                this.attackBox.position.y = this.attackType === 'dash' ? this.position.y + 50 : this.position.y + 30;
        
                // 处理冲刺逻辑
                if (this.isDashing) {
                    this.dashFrames--;
                    this.velocity.x = this.facingRight ? 25 : -25;
                    this.velocity.y = 0; // 冲刺时不受重力影响
                    
                    if (this.dashFrames <= 0) {
                        this.isDashing = false;
                        // 冲刺结束时触发重拳判定
                        this.executeAttack('dash');
                    }
                }
        
                this.position.x += this.velocity.x;
                this.position.y += this.velocity.y;
        
                // 边界限制
                if (this.position.x < 0) this.position.x = 0;
                if (this.position.x + this.width > canvas.width) this.position.x = canvas.width - this.width;
        
                // 重力与地面碰撞
                if (this.position.y + this.height + this.velocity.y >= canvas.height - 50) {
                    this.velocity.y = 0;
                    this.position.y = canvas.height - 50 - this.height;
                } else if (!this.isDashing) {
                    this.velocity.y += gravity;
                }
            }
        
            startAttack(type) {
                if (this.isAttacking || this.isDashing || gameEnded) return;
        
                if (type === 'cannon') {
                    // 发射火炮
                    this.projectiles.push(new Projectile({
                        position: { 
                            x: this.facingRight ? this.position.x + this.width : this.position.x - 30,
                            y: this.position.y + 40
                        },
                        velocity: {
                            x: this.facingRight ? 15 : -15,
                            y: 0
                        },
                        color: '#ffaa00',
                        facingRight: this.facingRight
                    }));
                    return;
                }
        
                if (type === 'startDash') {
                    // 开始冲刺
                    this.isDashing = true;
                    this.dashFrames = 10; // 冲刺持续帧数
                    return;
                }
        
                // 剑刺攻击
                this.executeAttack('sword');
            }
        
            executeAttack(type) {
                this.isAttacking = true;
                this.attackType = type;
                
                // 设置判定框大小
                if (type === 'sword') {
                    this.attackBox.width = 120;
                    this.attackBox.height = 30;
                } else if (type === 'dash') {
                    this.attackBox.width = 80;
                    this.attackBox.height = 60;
                }
        
                // 攻击持续时间
                setTimeout(() => {
                    this.isAttacking = false;
                }, 150);
            }
        
            takeHit(damage) {
                this.health -= damage;
                if (this.health < 0) this.health = 0;
        
                // 更新UI血条
                const healthBarId = this.isPlayer1 ? 'player1-health' : 'player2-health';
                const healthTextId = this.isPlayer1 ? 'player1-health-container' : 'player2-health-container';
                
                const healthBar = document.getElementById(healthBarId);
                const percentage = (this.health / this.maxHealth) * 100;
                healthBar.style.width = percentage + '%';
                
                // 更新文字
                const nameText = this.isPlayer1 ? `擎天柱 (${this.health} HP)` : `天灾 (${this.health} HP)`;
                document.querySelector(`#${healthTextId} .player-name`).innerText = nameText;
        
                if (this.health <= 0) {
                    determineWinner();
                }
            }
        }
        
        // 实例化玩家和敌人
        const player = new Fighter({
            position: { x: 150, y: 0 },
            velocity: { x: 0, y: 0 },
            color: '#4facfe', // 擎天柱蓝
            isPlayer1: true
        });
        
        const enemy = new Fighter({
            position: { x: 800, y: 0 },
            velocity: { x: 0, y: 0 },
            color: '#b14df9', // 天灾紫
            isPlayer1: false
        });
        
        const keys = {
            ArrowLeft: { pressed: false },
            ArrowRight: { pressed: false },
            a: { pressed: false },
            d: { pressed: false }
        }
        
        // 矩形碰撞检测
        function rectangularCollision({ rectangle1, rectangle2 }) {
            return (
                rectangle1.attackBox.position.x + rectangle1.attackBox.width >= rectangle2.position.x &&
                rectangle1.attackBox.position.x <= rectangle2.position.x + rectangle2.width &&
                rectangle1.attackBox.position.y + rectangle1.attackBox.height >= rectangle2.position.y &&
                rectangle1.attackBox.position.y <= rectangle2.position.y + rectangle2.height
            )
        }
        
        function projectileCollision(projectile, fighter) {
            return (
                projectile.position.x + projectile.width >= fighter.position.x &&
                projectile.position.x <= fighter.position.x + fighter.width &&
                projectile.position.y + projectile.height >= fighter.position.y &&
                projectile.position.y <= fighter.position.y + fighter.height
            )
        }
        
        function determineWinner() {
            clearTimeout(timerId);
            gameEnded = true;
            const result = document.getElementById('result-display');
            result.style.display = 'block';
            
            if (player.health === enemy.health) {
                result.innerHTML = '平局！<br><span style="font-size:30px">时间到</span>';
                result.style.color = 'white';
            } else if (player.health > enemy.health) {
                result.innerHTML = '天灾 失败！<br><span style="font-size:30px">擎天柱 胜出</span>';
                result.style.color = '#4facfe';
            } else {
                result.innerHTML = '擎天柱 失败！<br><span style="font-size:30px">天灾 胜出</span>';
                result.style.color = '#b14df9';
            }
        }
        
        let timer = 60;
        let timerId;
        function decreaseTimer() {
            if (timer > 0 && !gameEnded) {
                timerId = setTimeout(decreaseTimer, 1000);
                timer--;
                document.getElementById('timer').innerHTML = timer;
            }
            if (timer === 0) {
                determineWinner();
            }
        }
        decreaseTimer();
        
        // 游戏主循环
        function animate() {
            window.requestAnimationFrame(animate);
            background.draw();
        
            player.update();
            enemy.update();
        
            // 擎天柱移动逻辑
            player.velocity.x = 0;
            if (!player.isDashing && !gameEnded) {
                if (keys.ArrowLeft.pressed) {
                    player.velocity.x = -6;
                    player.facingRight = false;
                } else if (keys.ArrowRight.pressed) {
                    player.velocity.x = 6;
                    player.facingRight = true;
                }
            }
        
            // 敌人移动逻辑
            enemy.velocity.x = 0;
            if (!enemy.isDashing && !gameEnded) {
                if (keys.a.pressed) {
                    enemy.velocity.x = -6;
                    enemy.facingRight = false;
                } else if (keys.d.pressed) {
                    enemy.velocity.x = 6;
                    enemy.facingRight = true;
                }
            }
        
            // 检测近战碰撞
            if (player.isAttacking && rectangularCollision({ rectangle1: player, rectangle2: enemy })) {
                player.isAttacking = false; // 确保一次攻击只造成一次伤害
                const damage = player.attackType === 'dash' ? 5 : 2; // 冲刺拳5滴血，剑刺2滴血
                enemy.takeHit(damage);
            }
        
            if (enemy.isAttacking && rectangularCollision({ rectangle1: enemy, rectangle2: player })) {
                enemy.isAttacking = false;
                player.takeHit(2); // 敌人默认攻击伤害
            }
        
            // 检测火炮碰撞
            player.projectiles.forEach(p => {
                if (!p.markedForDeletion && projectileCollision(p, enemy)) {
                    p.markedForDeletion = true;
                    enemy.takeHit(1); // 火炮1滴血
                }
            });
        
            enemy.projectiles.forEach(p => {
                if (!p.markedForDeletion && projectileCollision(p, player)) {
                    p.markedForDeletion = true;
                    player.takeHit(1);
                }
            });
        }
        
        animate();
        
        // 键盘事件监听
        window.addEventListener('keydown', (event) => {
            if (gameEnded) return;
        
            switch (event.key) {
                // 玩家1 (擎天柱)
                case 'ArrowRight':
                    keys.ArrowRight.pressed = true;
                    break;
                case 'ArrowLeft':
                    keys.ArrowLeft.pressed = true;
                    break;
                case 'ArrowUp':
                    if (player.velocity.y === 0) player.velocity.y = -16; // 跳跃
                    break;
                case ' ': // 空格键，剑刺
                    player.startAttack('sword');
                    break;
                case '1': // 数字1，火炮
                    player.startAttack('cannon');
                    break;
                case 'x':
                case 'X': // x键，冲刺拳
                    player.startAttack('startDash');
                    break;
        
                // 玩家2 (敌人)
                case 'd':
                    keys.d.pressed = true;
                    break;
                case 'a':
                    keys.a.pressed = true;
                    break;
                case 'w':
                    if (enemy.velocity.y === 0) enemy.velocity.y = -16;
                    break;
                case 'f': // 敌人攻击
                    enemy.startAttack('sword');
                    break;
            }
        });
        
        window.addEventListener('keyup', (event) => {
            switch (event.key) {
                case 'ArrowRight':
                    keys.ArrowRight.pressed = false;
                    break;
                case 'ArrowLeft':
                    keys.ArrowLeft.pressed = false;
                    break;
                case 'd':
                    keys.d.pressed = false;
                    break;
                case 'a':
                    keys.a.pressed = false;
                    break;
            }
        });
