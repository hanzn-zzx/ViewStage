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
        let currentPath = null;

        for (let i = 0; i < count; i++) {
            const cmd = commands[i];
            
            if (cmd.type !== currentType ||
                (cmd.type !== 'erase' && cmd.color !== currentColor) ||
                cmd.lineWidth !== currentLineWidth) {

                if (currentPath) {
                    ctx.stroke(currentPath);
                    currentPath = null;
                }

                currentType = cmd.type;
                currentColor = cmd.color;
                currentLineWidth = cmd.lineWidth;

                const scale = window.main_fetch_safe_scale ? window.main_fetch_safe_scale() : 1;
                
                if (cmd.type === 'erase') {
                    ctx.globalCompositeOperation = 'destination-out';
                    ctx.strokeStyle = 'rgba(0,0,0,1)';
                    ctx.lineWidth = cmd.lineWidth / scale;
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = cmd.color || '#3498db';
                    ctx.lineWidth = cmd.lineWidth / scale;
                }
            }

            if (!currentPath) {
                currentPath = new Path2D();
            }
            currentPath.moveTo(cmd.fromX, cmd.fromY);
            currentPath.lineTo(cmd.toX, cmd.toY);
        }

        if (currentPath) {
            ctx.stroke(currentPath);
        }

        const drawEnd = performance.now();
        const drawTime = drawEnd - drawStart;
        this.lastDrawTime = drawEnd;

        this.lastType = currentType;
        this.lastColor = currentColor;
        this.lastLineWidth = currentLineWidth;

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
    }

    batch_draw_init_start() {
        this.pendingCount = 0;
        this.pendingCommands.length = 0;
        this.lastDrawTime = performance.now();
        
        if (this.is_adaptive) {
            this.currentFps = this.LOW_LOAD_FPS;
            this.drawInterval = 1000 / this.currentFps;
        }
        
        const ctx = this.batch_draw_fetch_ctx();
        if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
        }
    }

    batch_draw_handle_end() {
        if (this.drawRafId !== null) {
            cancelAnimationFrame(this.drawRafId);
            this.drawRafId = null;
        }

        this.batch_draw_handle_flush();
        
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
