/* ============================================================
   TrainGun - UI 组件与视图渲染
   ============================================================ */

/**
 * 显示通知消息
 * @param {string} message - 消息内容
 * @param {'info'|'success'|'error'|'warning'} type - 消息类型
 * @param {number} duration - 持续时间(ms)
 */
export function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'notifSlideOut 0.3s ease-in forwards';
        setTimeout(() => notif.remove(), 300);
    }, duration);
}

/**
 * 渲染灵敏度设置视图内容（占位）
 */
export function renderSensitivityView() {
    const content = document.getElementById('sensitivity-content');
    content.innerHTML = `<p class="placeholder-text">灵敏度设置功能即将开放...</p>`;
}

/**
 * 渲染统计面板视图内容（占位）
 */
export function renderStatsView() {
    const content = document.getElementById('stats-content');
    content.innerHTML = `<p class="placeholder-text">训练统计功能即将开放...</p>`;
}

/**
 * 显示难度选择弹窗
 * @param {string} modeName - 模式中文名
 * @param {Function} onSelect - 选择难度后的回调 (difficulty) => void
 */
export function showDifficultyModal(modeName, onSelect) {
    const modal = document.getElementById('difficulty-modal');
    const modeNameEl = document.getElementById('modal-mode-name');
    modeNameEl.textContent = modeName;
    modal.classList.remove('hidden');

    // 绑定难度按钮事件
    const buttons = modal.querySelectorAll('.btn-difficulty');
    const handler = (e) => {
        const btn = e.currentTarget;
        const difficulty = btn.dataset.difficulty;
        modal.classList.add('hidden');
        // 移除所有事件
        buttons.forEach(b => b.removeEventListener('click', handler));
        onSelect(difficulty);
    };

    buttons.forEach(btn => {
        btn.removeEventListener('click', handler);
        btn.addEventListener('click', handler);
    });

    // 取消按钮
    const closeBtn = document.getElementById('btn-close-modal');
    closeBtn.onclick = () => {
        modal.classList.add('hidden');
        buttons.forEach(b => b.removeEventListener('click', handler));
    };
}

/**
 * 隐藏难度弹窗
 */
export function hideDifficultyModal() {
    document.getElementById('difficulty-modal').classList.add('hidden');
}

/**
 * 显示训练覆盖层
 * @param {string} title - 标题
 * @param {string} text - 描述文字
 * @param {boolean} showExitBtn - 是否显示退出按钮
 */
export function showTrainingOverlay(title, text, showExitBtn = true) {
    const overlay = document.getElementById('training-overlay');
    const titleEl = document.getElementById('overlay-title');
    const textEl = document.getElementById('overlay-text');
    const exitBtn = document.getElementById('btn-exit-training');

    titleEl.innerHTML = title;
    textEl.innerHTML = text;
    exitBtn.style.display = showExitBtn ? 'inline-flex' : 'none';
    overlay.classList.remove('hidden');
}

/**
 * 隐藏训练覆盖层
 */
export function hideTrainingOverlay() {
    document.getElementById('training-overlay').classList.add('hidden');
}

/**
 * 显示倒计时动画
 * @returns {Promise} 倒计时结束后 resolve
 */
export function showCountdown() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('training-overlay');
        const titleEl = document.getElementById('overlay-title');
        const textEl = document.getElementById('overlay-text');
        const exitBtn = document.getElementById('btn-exit-training');

        exitBtn.style.display = 'none';
        textEl.textContent = '';
        overlay.classList.remove('hidden');

        let count = 3;
        titleEl.innerHTML = `<span class="countdown-number">${count}</span>`;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                titleEl.innerHTML = `<span class="countdown-number">${count}</span>`;
            } else if (count === 0) {
                titleEl.innerHTML = `<span class="countdown-number" style="color: var(--success)">开始</span>`;
            } else {
                clearInterval(interval);
                overlay.classList.add('hidden');
                resolve();
            }
        }, 800);
    });
}

/**
 * 更新 HUD 数据
 * @param {Object} data - { score, timer, accuracy, combo }
 */
export function updateHUD(data) {
    if (data.score !== undefined) {
        document.getElementById('hud-score').textContent = data.score;
    }
    if (data.timer !== undefined) {
        document.getElementById('hud-timer').textContent = data.timer;
    }
    if (data.accuracy !== undefined) {
        document.getElementById('hud-accuracy').textContent = data.accuracy + '%';
    }
    if (data.combo !== undefined) {
        document.getElementById('hud-combo').textContent = data.combo + 'x';
    }
    if (data.ammo !== undefined) {
        document.getElementById('hud-ammo').textContent = data.ammo;
    }
    if (data.weapon !== undefined) {
        document.getElementById('hud-weapon').textContent = data.weapon;
    }
}

/**
 * 显示训练结果页面
 * @param {Object} result - 训练结果数据
 * @param {boolean} isNewRecord - 是否是新纪录
 * @param {Function} onRetry - 重试回调
 * @param {Function} onMenu - 返回菜单回调
 */
export function showResult(result, isNewRecord, onRetry, onMenu) {
    const overlay = document.getElementById('training-overlay');
    const content = overlay.querySelector('.overlay-content');

    overlay.classList.remove('hidden');

    content.innerHTML = `
        <div class="result-container">
            ${isNewRecord ? '<div class="new-record">🏆 新纪录！</div>' : ''}
            <div class="result-score" id="result-score-value">0</div>
            <div class="result-label">最终得分</div>
            <div class="result-stats">
                <div class="result-stat">
                    <div class="result-stat-label">命中率</div>
                    <div class="result-stat-value">${result.accuracy}%</div>
                </div>
                <div class="result-stat">
                    <div class="result-stat-label">命中次数</div>
                    <div class="result-stat-value">${result.hits}</div>
                </div>
                <div class="result-stat">
                    <div class="result-stat-label">平均反应</div>
                    <div class="result-stat-value">${result.avgReactionTime || '--'}ms</div>
                </div>
                <div class="result-stat">
                    <div class="result-stat-label">训练时长</div>
                    <div class="result-stat-value">${result.duration}s</div>
                </div>
        </div>
            <div class="result-heatmap-container" style="display: flex; gap: 1rem; justify-content: center; margin: 1rem 0;">
                <div style="text-align: center;">
                    <div style="font-family: Orbitron; font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.5rem; letter-spacing: 0.1em;">射击散布</div>
                    <canvas id="result-heatmap" width="300" height="200" style="background: rgba(10,10,26,0.8); border: 1px solid rgba(0,255,240,0.2); border-radius: 4px; box-shadow: 0 0 15px rgba(0,0,0,0.5);"></canvas>
                </div>
                <div style="text-align: center;">
                    <div style="font-family: Orbitron; font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.5rem; letter-spacing: 0.1em;">象限偏差</div>
                    <canvas id="result-quadrant" width="200" height="200" style="background: rgba(10,10,26,0.8); border: 1px solid rgba(255,0,255,0.2); border-radius: 4px; box-shadow: 0 0 15px rgba(0,0,0,0.5);"></canvas>
                </div>
            </div>
            
            <div class="result-actions">
                <button class="btn" id="btn-retry">🔄 再来一次</button>
                <button class="btn btn-back" id="btn-result-menu">← 返回菜单</button>
            </div>
        </div>
    `;

    // 绘制热力图 (原有) & 象限分析 (新增)
    requestAnimationFrame(() => {
        const hCanvas = document.getElementById('result-heatmap');
        const qCanvas = document.getElementById('result-quadrant');

        if (hCanvas && result.shotHistory) {
            drawHeatmap(hCanvas, result.shotHistory);
        }
        if (qCanvas && result.shotHistory) {
            drawQuadrantAnalysis(qCanvas, result.shotHistory);
        }
    });

    // ... (rest of function)
}

function drawHeatmap(canvas, history) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // ... (existing heatmap code) ...
    // Note: I need to rewrite the existing code here since I'm replacing the whole block.
    // Or I can extract it to helper function which I am doing now.

    // 网格
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 25) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 25) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // 绘制点
    history.forEach(shot => {
        const x = shot.x * w;
        const y = shot.y * h;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 6);
        if (shot.hit) {
            grad.addColorStop(0, 'rgba(0, 255, 160, 0.8)');
            grad.addColorStop(1, 'rgba(0, 255, 160, 0)');
        } else {
            grad.addColorStop(0, 'rgba(255, 50, 80, 0.8)');
            grad.addColorStop(1, 'rgba(255, 50, 80, 0)');
        }
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    });
}

function drawQuadrantAnalysis(canvas, history) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;

    // 坐标系
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
    ctx.moveTo(0, cy); ctx.lineTo(w, cy);
    ctx.stroke();

    // 统计象限错误 (仅统计 Miss)
    const misses = history.filter(s => !s.hit && s.tx !== undefined);
    const quadrants = [0, 0, 0, 0]; // UL, UR, LL, LR

    misses.forEach(s => {
        const dx = s.x - s.tx; // 偏移量 X
        const dy = s.y - s.ty; // 偏移量 Y
        // 注意：Y轴向下为正
        if (dx < 0 && dy < 0) quadrants[0]++; // 左上 (UL)
        else if (dx >= 0 && dy < 0) quadrants[1]++; // 右上 (UR)
        else if (dx < 0 && dy >= 0) quadrants[2]++; // 左下 (LL)
        else quadrants[3]++; // 右下 (LR)
    });

    const total = misses.length || 1;

    // 绘制象限文字
    ctx.font = '700 16px Orbitron';
    ctx.textAlign = 'center';

    const drawQ = (idx, x, y, name) => {
        const pct = Math.round(quadrants[idx] / total * 100);
        const color = pct > 40 ? '#ff3366' : (pct > 25 ? '#ffaa00' : '#00fff0');
        ctx.fillStyle = color;
        ctx.fillText(`${pct}%`, x, y);
        ctx.font = '10px Rajdhani';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(name, x, y + 15);
        ctx.font = '700 16px Orbitron'; // reset
    };

    drawQ(0, cx - 40, cy - 40, '偏早/偏高');
    drawQ(1, cx + 40, cy - 40, '偏晚/偏高');
    drawQ(2, cx - 40, cy + 40, '偏早/偏低');
    drawQ(3, cx + 40, cy + 40, '偏晚/偏低');

    // 绘制所有射击点 (归一化到中心)
    ctx.globalCompositeOperation = 'lighter';
    history.forEach(s => {
        if (s.tx === undefined) return;
        const dx = (s.x - s.tx) * w * 2; // 放大显示偏移
        const dy = (s.y - s.ty) * h * 2;

        ctx.fillStyle = s.hit ? 'rgba(0,255,160,0.3)' : 'rgba(255,50,80,0.3)';
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';


    // 得分滚动动画
    animateScore(result.score);

    // 绑定按钮事件
    document.getElementById('btn-retry').addEventListener('click', () => {
        restoreOverlayContent();
        onRetry();
    });
    document.getElementById('btn-result-menu').addEventListener('click', () => {
        restoreOverlayContent();
        onMenu();
    });
}

/**
 * 恢复训练覆盖层到默认结构
 */
function restoreOverlayContent() {
    const overlay = document.getElementById('training-overlay');
    const content = overlay.querySelector('.overlay-content');
    content.innerHTML = `
        <h2 class="overlay-title" id="overlay-title">准备开始</h2>
        <p class="overlay-text" id="overlay-text">点击画面开始训练</p>
        <button class="btn btn-back" data-target="menu" id="btn-exit-training">退出训练</button>
    `;
    // 重新绑定退出按钮
    document.getElementById('btn-exit-training').addEventListener('click', () => {
        window.app?.showView('menu');
    });
}

/**
 * 得分数字滚动动画
 * @param {number} targetScore - 目标分数
 */
function animateScore(targetScore) {
    const scoreEl = document.getElementById('result-score-value');
    if (!scoreEl) return;

    let current = 0;
    const duration = 1500;
    const startTime = performance.now();

    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        current = Math.round(eased * targetScore);
        scoreEl.textContent = current;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

/**
 * 模式名称映射（英文 -> 中文）
 */
export const MODE_NAMES = {
    tracking: '追踪训练',
    flicking: '点击训练',
    switching: '切换训练',
    reflex: '闪现训练',
    sixtarget: '六目标模式',
    humanoid: '小人模式'
};
