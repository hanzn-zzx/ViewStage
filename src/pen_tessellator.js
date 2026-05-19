class PenTessellator {
    tessellator_build_stroke_from_stroke_data(stroke, options = {}) {
        if (!stroke || !stroke.points || stroke.points.length < 1) return null;

        const points = stroke.points;
        const base_width = stroke.lineWidth || 5;
        const color = stroke.color || '#3498db';
        const density = options.density || 1;
        const storedWidths = options.storedWidths || null;

        const segs = this._tessellator_build_segments(points, base_width, density, options.noStartTaper, storedWidths);
        if (!segs || segs.length < 1) return null;

        return { segments: segs, color };
    }

    _tessellator_build_segments(points, base_width, density = 1, noStartTaper = false, storedWidths = null) {
        if (points.length < 1) return null;

        // 当钢笔效果开启时，基础笔宽增加5px
        const penEffectActive = window.get_pen_effect_mode() !== 'off';
        if (penEffectActive) {
            base_width += 5;
        }

        const raw = [{ x: points[0].fromX, y: points[0].fromY }];
        for (let i = 0; i < points.length; i++) {
            raw.push({ x: points[i].toX, y: points[i].toY });
        }
        if (raw.length < 2) return null;

        const line_widths = [];

        if (storedWidths && storedWidths.length === raw.length - 1) {
            // 使用实时存储宽度，跳过速度重算
            for (let i = 0; i < storedWidths.length; i++) {
                line_widths.push(storedWidths[i]);
            }
        } else {
            // 无存储宽度：从速度重算（兼容模式，如子笔画）
            const speedScale = Math.max(0.4, Math.min(2.5, base_width / 4));
            const maxSpeed = 2.5 * speedScale;
            const minSpeed = 0.2 * speedScale;
            let last_line_width = base_width;

            for (let i = 1; i < raw.length; i++) {
                const prev = raw[i - 1];
                const curr = raw[i];

                const dx = curr.x - prev.x;
                const dy = curr.y - prev.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                const safeDist = Math.max(dist, 0.01);
                const speed = Math.min(safeDist * density, 15) / 8;
                const clamped = Math.max(0, Math.min(1, (speed - minSpeed) / (maxSpeed - minSpeed)));

                let line_width;
                if (clamped >= 1) {
                    line_width = base_width * 0.25;
                } else if (clamped <= 0) {
                    line_width = base_width;
                } else {
                    const eased = clamped * clamped * (3 - 2 * clamped);
                    line_width = base_width - eased * (base_width * 0.75);
                }

                const blend = Math.max(0.2, Math.min(0.8, 1 - dist / (base_width * 4)));
                line_width = line_width * (1 - blend) + last_line_width * blend;
                last_line_width = line_width;

                line_widths.push(line_width);
            }
        }

        const totalSegments = line_widths.length;
        const taperSegments = Math.min(
            Math.max(3, Math.round(4 * density)),
            Math.max(3, Math.floor(totalSegments * 0.25))
        );

        for (let i = 0; i < totalSegments; i++) {
            if (!noStartTaper && i < taperSegments) {
                // 存储宽度已包含实时计算的起笔渐变，此处不再叠加
                if (!storedWidths) {
                    const taperT = (i + 1) / taperSegments;
                    const eased = taperT * taperT * (3 - 2 * taperT);
                    const minStart = base_width * 0.2;
                    line_widths[i] = minStart + (line_widths[i] - minStart) * eased;
                }
            }
        }

        const segments = [];
        for (let i = 0; i < line_widths.length; i++) {
            const p1 = raw[i];
            const p2 = raw[i + 1];
            segments.push({
                x1: p1.x, y1: p1.y,
                x2: p2.x, y2: p2.y,
                line_width: Math.max(0.5, line_widths[i])
            });
        }

        return segments;
    }

    tessellator_render_stroke(ctx, tessellated_stroke) {
        if (!tessellated_stroke || !tessellated_stroke.segments) return;

        const { segments, color } = tessellated_stroke;

        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over';

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];

            if (i === 0) {
                ctx.lineWidth = seg.line_width;
                ctx.beginPath();
                ctx.moveTo(seg.x1, seg.y1);
                ctx.lineTo(seg.x2, seg.y2);
                ctx.stroke();
            } else {
                const prev = segments[i - 1];
                const last_x = (prev.x1 + prev.x2) / 2;
                const last_y = (prev.y1 + prev.y2) / 2;
                const mid_x = (seg.x1 + seg.x2) / 2;
                const mid_y = (seg.y1 + seg.y2) / 2;

                ctx.lineWidth = seg.line_width;
                ctx.beginPath();
                ctx.moveTo(last_x, last_y);
                ctx.quadraticCurveTo(seg.x1, seg.y1, mid_x, mid_y);
                ctx.stroke();
            }

            // 最后一个 segment：补上 mid → toX/Y 的尖部直线段
            // 与 batch-draw 中 batch_draw_handle_end 画 _lastMidX/Y → _lastToX/Y 对应
            if (i === segments.length - 1) {
                const mid_x = (seg.x1 + seg.x2) / 2;
                const mid_y = (seg.y1 + seg.y2) / 2;
                ctx.lineWidth = seg.line_width;
                ctx.beginPath();
                ctx.moveTo(mid_x, mid_y);
                ctx.lineTo(seg.x2, seg.y2);
                ctx.stroke();
            }
        }
    }
}

window.penTessellator = new PenTessellator();