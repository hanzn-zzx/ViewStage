class RealtimeBatchDrawManager {
    constructor() {
        this.ctx = null;
        this.pendingCommands = [];
        this.pendingCount = 0;
        this.drawRafId = null;
        this.drawInterval = 1000 / 60;
        this.lastDrawTime = 0;
        this.lastType = null;
        this.lastColor = null;
        this.lastLineWidth = null;
        
        this.currentFps = 60;
        this.minFps = 15;
        this.maxFps = 60;
        this.fpsStep = 5;
        
        this.drawTimes = [];
        this.drawTimesMax = 10;
        
        this.commandCounts = [];
        this.commandCountsMax = 5;
        
        this.frameRateMode = 'adaptive';
        this.lastAdjustTime = 0;
        this.adjustCooldown = 100;
        
        this.LOW_LOAD_FPS = 60;
        this.MEDIUM_LOAD_FPS = 45;
        this.HIGH_LOAD_FPS = 30;
        this.CRITICAL_LOAD_FPS = 20;
        
        this.LOW_LOAD_THRESHOLD = 10;
        this.MEDIUM_LOAD_THRESHOLD = 30;
        this.HIGH_LOAD_THRESHOLD = 50;

        this.lastBatchMoveTime = 0;

        this._strokeStart = true;
        this._totalSegments = 0;
        this._lastMidX = null;
        this._lastMidY = null;
        this._lastToX = null;
        this._lastToY = null;
        this._speedBuffer = [];
    }

    batch_draw_fetch_ctx() {
        if (!this.ctx) {
            this.ctx = window.dom?.drawCtx;
        }
        return this.ctx;
    }

    batch_draw_update_frame_rate(mode) {
        this.frameRateMode = mode;
        
        if (mode === 'low') {
            this.currentFps = 30;
            this.drawInterval = 1000 / 30;
        } else if (mode === 'high') {
            this.currentFps = 60;
            this.drawInterval = 1000 / 60;
        } else {
            this.currentFps = 60;
            this.drawInterval = 1000 / 60;
        }
    }

    get is_adaptive() {
        return this.frameRateMode === 'adaptive';
    }

    batch_draw_calc_target_fps(commandCount) {
        if (commandCount < this.LOW_LOAD_THRESHOLD) {
            return this.LOW_LOAD_FPS;
        } else if (commandCount < this.MEDIUM_LOAD_THRESHOLD) {
            return this.MEDIUM_LOAD_FPS;
        } else if (commandCount < this.HIGH_LOAD_THRESHOLD) {
            return this.HIGH_LOAD_FPS;
        } else {
            return this.CRITICAL_LOAD_FPS;
        }
    }

    batch_draw_calc_adjust_fps(drawTime, commandCount) {
        const now = performance.now();
        if (now - this.lastAdjustTime < this.adjustCooldown) {
            return;
        }
        this.lastAdjustTime = now;
        
        this.drawTimes.push(drawTime);
        if (this.drawTimes.length > this.drawTimesMax) {
            this.drawTimes.shift();
        }
        
        this.commandCounts.push(commandCount);
        if (this.commandCounts.length > this.commandCountsMax) {
            this.commandCounts.shift();
        }
        
        const avgDrawTime = this.drawTimes.reduce((a, b) => a + b, 0) / this.drawTimes.length;
        const avgCommandCount = this.commandCounts.reduce((a, b) => a + b, 0) / this.commandCounts.length;
        
        const targetFps = this.batch_draw_calc_target_fps(avgCommandCount);
        const currentFrameTime = 1000 / this.currentFps;
        
        if (avgDrawTime > currentFrameTime * 1.5) {
            const newFps = Math.max(this.minFps, this.currentFps - this.fpsStep);
            if (newFps !== this.currentFps) {
                this.currentFps = newFps;
                this.drawInterval = 1000 / this.currentFps;
            }
        } else if (this.currentFps < targetFps && avgDrawTime < currentFrameTime * 0.7) {
            const newFps = Math.min(targetFps, this.currentFps + this.fpsStep);
            if (newFps !== this.currentFps) {
                this.currentFps = newFps;
                this.drawInterval = 1000 / this.currentFps;
            }
        }
    }

    batch_draw_fetch_stats() {
        return {
            currentFps: this.currentFps,
            targetFps: this.batch_draw_calc_target_fps(this.pendingCount),
            pendingCount: this.pendingCount,
            avgDrawTime: this.drawTimes.length > 0 
                ? this.drawTimes.reduce((a, b) => a + b, 0) / this.drawTimes.length 
                : 0,
            frameRateMode: this.frameRateMode
        };
    }

    batch_draw_create_command(type, fromX, fromY, toX, toY, color, lineWidth) {
        const idx = this.pendingCount++;
        if (idx >= this.pendingCommands.length) {
            this.pendingCommands.push({ type, fromX, fromY, toX, toY, color, lineWidth });
        } else {
            const cmd = this.pendingCommands[idx];
            cmd.type = type;
            cmd.fromX = fromX;
            cmd.fromY = fromY;
            cmd.toX = toX;
            cmd.toY = toY;
            cmd.color = color;
            cmd.lineWidth = lineWidth;
        }

        if (this.is_adaptive && this.pendingCount === 1) {
            const targetFps = this.batch_draw_calc_target_fps(1);
            if (this.currentFps > targetFps) {
                this.currentFps = targetFps;
                this.drawInterval = 1000 / this.currentFps;
            }
        }

        this.batch_draw_setup_schedule();
    }

    batch_draw_setup_schedule() {
        if (this.drawRafId !== null) return;

        const now = performance.now();
        const timeSinceLastDraw = now - this.lastDrawTime;

        if (timeSinceLastDraw >= this.drawInterval) {
            this.batch_draw_handle_flush();
        } else {
            this.drawRafId = requestAnimationFrame(() => {
                this.drawRafId = null;
                this.batch_draw_handle_flush();
            });
        }
    }

    _calc_pen_line_width(speed, baseWidth, lastLineWidth, dist) {
        // 当钢笔效果开启时，基础笔宽增加5px
        const penEffectActive = window.get_pen_effect_mode() !== 'off';
        if (penEffectActive) {
            baseWidth += 5;
        }
        
        const speedScale = Math.max(0.4, Math.min(2.5, baseWidth / 4));
        const maxSpeed = 2.5 * speedScale;
        const minSpeed = 0.2 * speedScale;

        let lineWidth;
        if (speed >= maxSpeed) {
            lineWidth = baseWidth * 0.25;
        } else if (speed <= minSpeed) {
            lineWidth = baseWidth;
        } else {
            const ratio = (speed - minSpeed) / (maxSpeed - minSpeed);
            const eased = ratio * ratio * (3 - 2 * ratio);
            lineWidth = baseWidth - eased * (baseWidth * 0.75);
        }

        const blend = Math.max(0.3, Math.min(0.85, 1 - dist / (baseWidth * 3)));
        lineWidth = lineWidth * (1 - blend) + lastLineWidth * blend;

        const maxDelta = baseWidth * 0.12;
        lineWidth = Math.min(lastLineWidth + maxDelta, Math.max(lastLineWidth - maxDelta, lineWidth));

        return Math.max(0.5, lineWidth);
    }

    _apply_start_taper(lineWidth, baseWidth, segmentIndex, totalInBatch) {
        const globalIndex = this._totalSegments + segmentIndex;
        if (globalIndex < 4) {
            const taperT = (globalIndex + 1) / 4;
            const eased = taperT * taperT * (3 - 2 * taperT);
            const minStart = baseWidth * 0.2;
            return minStart + (lineWidth - minStart) * eased;
        }
        return lineWidth;
    }

    batch_draw_handle_flush() {
        const count = this.pendingCount;
        if (count === 0) return;
        this.pendingCount = 0;

        const ctx = this.batch_draw_fetch_ctx();
        if (!ctx) return;

        const drawStart = performance.now();

        const commands = this.pendingCommands;
        let currentType = this.lastType;
        let currentColor = this.lastColor;
        let currentLineWidth = this.lastLineWidth;

        const updateCtx = window.main_update_context_state;
        const getPenEffect = window.get_pen_effect_mode;
        const penEffectActive = getPenEffect ? getPenEffect() !== 'off' : false;

        let lastLineWidth = currentLineWidth || 5;
        let lastMoveTime = this.lastBatchMoveTime || performance.now() - 16;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 计算本次批处理的总时间跨度（从上一批结束到现在）
        // 所有命令共享该时间，除以命令数得到每条命令的近似时间
        // 限制最大时间为 8ms（对应 120Hz 指针事件率），保证笔锋可见
        const curTime = performance.now();
        const batchTimeSpan = Math.max(1, curTime - lastMoveTime);
        const perSegTime = Math.min(batchTimeSpan / count, 8);
        lastMoveTime = curTime;

        for (let i = 0; i < count; i++) {
            const cmd = commands[i];

            if (cmd.type === 'erase') {
                updateCtx(ctx, {
                    globalCompositeOperation: 'destination-out',
                    strokeStyle: 'rgba(0,0,0,1)',
                    lineWidth: cmd.lineWidth
                });

                ctx.beginPath();
                ctx.moveTo(cmd.fromX, cmd.fromY);
                ctx.lineTo(cmd.toX, cmd.toY);
                ctx.stroke();
                continue;
            }

            const dx = cmd.toX - cmd.fromX;
            const dy = cmd.toY - cmd.fromY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            let lineWidth = cmd.lineWidth;
            if (penEffectActive) {
                const rawSpeed = dist / perSegTime;
                this._speedBuffer.push(rawSpeed);
                if (this._speedBuffer.length > 3) {
                    this._speedBuffer.shift();
                }
                const speed = this._speedBuffer.reduce((a, b) => a + b, 0) / this._speedBuffer.length;
                lineWidth = this._calc_pen_line_width(speed, cmd.lineWidth, lastLineWidth, dist);

                if (this._strokeStart) {
                    lineWidth = this._apply_start_taper(lineWidth, cmd.lineWidth, i, count);
                }
            }
            if (penEffectActive && cmd.type === 'draw') {
                this._storedWidths.push(lineWidth);
            }
            lastLineWidth = lineWidth;

            if (cmd.type !== currentType || cmd.color !== currentColor) {
                currentType = cmd.type;
                currentColor = cmd.color;
                updateCtx(ctx, {
                    globalCompositeOperation: 'source-over',
                    strokeStyle: cmd.color || '#3498db'
                });
            }

            ctx.lineWidth = Math.max(0.5, lineWidth);

            const midX = (cmd.fromX + cmd.toX) / 2;
            const midY = (cmd.fromY + cmd.toY) / 2;

            if (i === 0 && (this._strokeStart || this._lastMidX === null)) {
                ctx.beginPath();
                ctx.moveTo(cmd.fromX, cmd.fromY);
                ctx.lineTo(midX, midY);
                ctx.stroke();
            } else {
                const startX = i === 0 ? this._lastMidX : ((commands[i - 1].fromX + commands[i - 1].toX) / 2);
                const startY = i === 0 ? this._lastMidY : ((commands[i - 1].fromY + commands[i - 1].toY) / 2);
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.quadraticCurveTo(cmd.fromX, cmd.fromY, midX, midY);
                ctx.stroke();
            }

            if (i === count - 1) {
                this._lastMidX = midX;
                this._lastMidY = midY;
                this._lastToX = cmd.toX;
                this._lastToY = cmd.toY;
            }
        }

        this._totalSegments += count;
        this._strokeStart = false;

        this.lastBatchMoveTime = curTime;

        const drawEnd = performance.now();
        const drawTime = drawEnd - drawStart;
        this.lastDrawTime = drawEnd;

        this.lastType = currentType;
        this.lastColor = currentColor;
        this.lastLineWidth = lastLineWidth;

        if (this.is_adaptive) {
            this.batch_draw_calc_adjust_fps(drawTime, count);
        }
    }

    reset_state() {
        this.pendingCount = 0;
        this.pendingCommands.length = 0;
        if (this.drawRafId !== null) {
            cancelAnimationFrame(this.drawRafId);
            this.drawRafId = null;
        }
        this.lastType = null;
        this.lastColor = null;
        this.lastLineWidth = null;
        this.lastBatchMoveTime = 0;
        this._strokeStart = true;
        this._totalSegments = 0;
        this._lastMidX = null;
        this._lastMidY = null;
        this._lastToX = null;
        this._lastToY = null;
        this._speedBuffer = [];
        this._storedWidths = [];
    }

    batch_draw_init_start() {
        this.pendingCount = 0;
        this.pendingCommands.length = 0;
        this.lastDrawTime = performance.now();
        this._strokeStart = true;
        this._totalSegments = 0;
        this._lastMidX = null;
        this._lastMidY = null;
        this._lastToX = null;
        this._lastToY = null;
        this._speedBuffer = [];
        this._storedWidths = [];

        if (this.is_adaptive) {
            this.currentFps = this.LOW_LOAD_FPS;
            this.drawInterval = 1000 / this.currentFps;
        }
        
        const ctx = this.batch_draw_fetch_ctx();
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            const updateCtx = window.main_update_context_state;
            if (updateCtx) {
                updateCtx(ctx, {
                    lineCap: 'round',
                    lineJoin: 'round'
                });
            } else {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            }
        }
    }

    batch_draw_handle_end() {
        if (this.drawRafId !== null) {
            cancelAnimationFrame(this.drawRafId);
            this.drawRafId = null;
        }

        this.batch_draw_handle_flush();

        const ctx = this.batch_draw_fetch_ctx();

        if (ctx && this._lastMidX !== null && this._lastToX !== null) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = (window.DRAW_CONFIG && window.DRAW_CONFIG.penColor) || '#3498db';
            ctx.beginPath();
            ctx.moveTo(this._lastMidX, this._lastMidY);
            ctx.lineTo(this._lastToX, this._lastToY);
            ctx.stroke();
        }

        if (this.is_adaptive) {
            this.drawTimes = [];
            this.commandCounts = [];
        }
    }

    batch_draw_delete_all() {
        this.reset_state();
    }
}

window.batchDrawManager = new RealtimeBatchDrawManager();