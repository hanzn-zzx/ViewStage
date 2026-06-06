/**
 * ViewStage 右上角性能监视器
 * 显示实时 FPS、批绘制引擎状态等指标
 * 仅在开发者模式下通过开关启用
 */

let perf_raf_id = null;
let perf_container = null;
let perf_fps_value = 0;
let perf_frame_count = 0;
let perf_last_time = 0;
let perf_enabled = false;
let perf_update_timer = null;

/** 创建监视器 DOM 并启动 RAF 循环 */
function perf_monitor_init() {
    if (perf_container) return;

    perf_container = document.createElement('div');
    perf_container.id = 'perf-monitor';
    perf_container.style.cssText = `
        position: fixed;
        top: 8px;
        right: 8px;
        z-index: 2147483647;
        background: rgba(0,0,0,0.7);
        color: #0f0;
        font-family: 'Consolas','Courier New',monospace;
        font-size: 12px;
        line-height: 1.5;
        padding: 6px 10px;
        border-radius: 6px;
        pointer-events: none;
        user-select: none;
        white-space: pre;
        display: ${perf_enabled ? 'block' : 'none'};
    `;
    document.body.appendChild(perf_container);

    perf_enabled = true;
    perf_last_time = performance.now();
    perf_frame_count = 0;
    perf_raf_id = requestAnimationFrame(perf_monitor_raf_loop);
}

/** RAF 回调：累计帧数，每秒提取一次 stats */
function perf_monitor_raf_loop(timestamp) {
    if (!perf_enabled) return;

    perf_raf_id = requestAnimationFrame(perf_monitor_raf_loop);
    perf_frame_count++;

    const elapsed = timestamp - perf_last_time;
    if (elapsed >= 1000) {
        perf_fps_value = Math.round(perf_frame_count * 1000 / elapsed);
        perf_frame_count = 0;
        perf_last_time = timestamp;
        perf_monitor_refresh_display();
    }
}

/** 采集各模块 stats 并更新显示 */
function perf_monitor_refresh_display() {
    if (!perf_container) return;

    const lines = [];

    // 行 1：全局 FPS
    lines.push(`FPS  ${perf_fps_value}`);

    // 行 2：batch_draw 引擎指标
    if (window.batchDrawManager?.batch_draw_fetch_stats) {
        const s = window.batchDrawManager.batch_draw_fetch_stats();
        lines.push(`Bat  ${s.currentFps}/${s.targetFps}`);
        lines.push(`Pend ${s.pendingCount}`);
        lines.push(`Draw ${s.avgDrawTime.toFixed(1)}ms`);
        lines.push(`Mode ${s.frameRateMode}`);
    } else {
        lines.push('Bat  --');
    }

    perf_container.textContent = lines.join('\n');
}

/**
 * 开关监视器
 * @param {boolean} enabled - true 显示，false 隐藏
 */
function perf_monitor_set_enabled(enabled) {
    perf_enabled = enabled;

    if (enabled) {
        if (!perf_container) {
            perf_monitor_init();
        } else {
            perf_container.style.display = 'block';
            perf_last_time = performance.now();
            perf_frame_count = 0;
            perf_raf_id = requestAnimationFrame(perf_monitor_raf_loop);
        }
    } else {
        if (perf_raf_id) {
            cancelAnimationFrame(perf_raf_id);
            perf_raf_id = null;
        }
        if (perf_container) {
            perf_container.style.display = 'none';
        }
    }
}

export { perf_monitor_init, perf_monitor_set_enabled };
