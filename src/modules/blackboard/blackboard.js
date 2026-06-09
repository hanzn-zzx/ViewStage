/**
 * ViewStage 小黑板模块
 * 从顶部弹出的独立绘制面板，支持多页绘制
 * 使用 DrawingEngine 管理绘制管线
 */

import { BlackboardPageManager } from './blackboard-page.js';
import { DrawingEngine } from './drawing-engine.js';
import { history_state, history_validate_undo, history_reset_executing } from '../history.js';
import { is_palm_by_touch_count, get_palm_center } from '../palm-eraser/palm-eraser.js';

class BlackboardManager {
    constructor() {
        this.is_open = false;
        this.canvas = null;
        this.ctx = null;
        this.overlay_canvas = null;
        this.overlay_ctx = null;
        this.page_manager = new BlackboardPageManager();

        this.tile_renderer = null;
        this.bb_wrapper = null;

        this.bb_state = {
            canvas_x: 0,
            canvas_y: 0,
            scale: 1,
            move_bound: { min_x: 0, max_x: 0, min_y: 0, max_y: 0 },
            is_dragging: false,
            last_transform: { x: null, y: null, scale: null },
            start_drag_x: 0,
            start_drag_y: 0,
            start_scale: 1,
            start_scale_x: 0,
            start_scale_y: 0,
            start_canvas_x: 0,
            start_canvas_y: 0,
            is_scaling: false,
            start_distance_sq: 0,
            cached_inv_scale: 1,
            isPalmErasing: false,
            savedDrawMode: null,
            palmEraserSize: 60,
            _last_gesture_x: 0,
            _last_gesture_y: 0
        };
        this._cached_move_bound_scale = null;
        this._cached_visible_rect = null;
        this._cached_visible_rect_scale = null;
        this._cached_visible_rect_x = null;
        this._cached_visible_rect_y = null;
        this._animate_timer_id = null;

        // 触摸手势优化
        this._touch_raf_id = null;               // 捏合缩放 rAF 节流 ID
        this._touch_pending_data = null;          // 待处理的触摸数据 { t0, t1 }
        this._touch_start_center_x = 0;           // 捏合起始中心 X
        this._touch_start_center_y = 0;           // 捏合起始中心 Y
        this._smooth_transform_timeout_id = null; // will-change 延迟移除定时器

        this.draw_mode = 'comment';

        this.screen_w = 0;
        this.screen_h = 0;
        this._last_loaded_index = -1;

        /** @type {DrawingEngine|null} */
        this.drawing_engine = null;
    }

    _fetch_safe_scale() {
        return Math.max(0.001, this.bb_state.scale || 1);
    }


    _update_move_bound() {
        if (this._cached_move_bound_scale === this.bb_state.scale) return;
        this._cached_move_bound_scale = this.bb_state.scale;

        const screen_w = this.screen_w;
        const screen_h = this.screen_h;
        const canvas_w = window.DRAW_CONFIG.canvasW;
        const canvas_h = window.DRAW_CONFIG.canvasH;
        const scaled_w = canvas_w * this.bb_state.scale;
        const scaled_h = canvas_h * this.bb_state.scale;
        const mb = this.bb_state.move_bound;

        if (scaled_w >= screen_w) {
            mb.min_x = -(scaled_w - screen_w);
            mb.max_x = 0;
        } else {
            mb.min_x = (screen_w - scaled_w) / 2;
            mb.max_x = (screen_w - scaled_w) / 2;
        }

        if (scaled_h >= screen_h) {
            mb.min_y = -(scaled_h - screen_h);
            mb.max_y = 0;
        } else {
            mb.min_y = (screen_h - scaled_h) / 2;
            mb.max_y = (screen_h - scaled_h) / 2;
        }
    }

    _update_canvas_position() {
        const eps = 0.001;
        const mb = this.bb_state.move_bound;
        this.bb_state.canvas_x = Math.max(mb.min_x - eps, Math.min(mb.max_x + eps, this.bb_state.canvas_x));
        this.bb_state.canvas_y = Math.max(mb.min_y - eps, Math.min(mb.max_y + eps, this.bb_state.canvas_y));
    }

    _sync_bb_transform() {
        const s = this.bb_state;
        const lt = s.last_transform;
        if (lt.x === s.canvas_x && lt.y === s.canvas_y && lt.scale === s.scale) return;

        lt.x = s.canvas_x;
        lt.y = s.canvas_y;
        lt.scale = s.scale;

        this.bb_wrapper.style.transform = `translate3d(${s.canvas_x}px, ${s.canvas_y}px, 0) scale(${s.scale})`;

        if (this.tile_renderer) {
            this.tile_renderer.update_visible_tile_dpr(s.scale, false, true);
        }
    }

    _sync_bb_transform_smooth(target_x, target_y, target_scale, duration = 200) {
        if (this._animate_timer_id !== null) {
            clearTimeout(this._animate_timer_id);
            this._animate_timer_id = null;
        }

        const s = this.bb_state;
        s.canvas_x = target_x;
        s.canvas_y = target_y;
        s.scale = target_scale;

        this._update_move_bound();
        this._update_canvas_position();

        const lt = s.last_transform;
        lt.x = s.canvas_x;
        lt.y = s.canvas_y;
        lt.scale = s.scale;

        this.bb_wrapper.style.transitionDuration = duration + 'ms';
        this.bb_wrapper.classList.add('smooth-transform');
        this.bb_wrapper.style.transform = `translate3d(${s.canvas_x}px, ${s.canvas_y}px, 0) scale(${s.scale})`;

        if (this.tile_renderer) {
            this.tile_renderer.update_visible_tile_dpr(s.scale, false, true);
        }

        this._animate_timer_id = setTimeout(() => {
            this._animate_timer_id = null;
            this.bb_wrapper.classList.remove('smooth-transform');
            this.bb_wrapper.style.transitionDuration = '';
        }, duration);
    }

    /** 触控交互时启用 GPU 合成层（will-change: transform 内联样式，不使用带 transition 的 class） */
    _touch_enable_gpu() {
        if (this._smooth_transform_timeout_id !== null) {
            clearTimeout(this._smooth_transform_timeout_id);
            this._smooth_transform_timeout_id = null;
        }
        if (this.bb_wrapper) {
            this.bb_wrapper.style.willChange = 'transform';
        }
    }

    /** 触控交互结束后延迟释放 GPU 合成层 */
    _touch_schedule_disable_gpu() {
        if (this._smooth_transform_timeout_id !== null) {
            clearTimeout(this._smooth_transform_timeout_id);
        }
        this._smooth_transform_timeout_id = setTimeout(() => {
            this._smooth_transform_timeout_id = null;
            if (this.bb_wrapper) {
                this.bb_wrapper.style.willChange = '';
            }
        }, 150);
    }

    _fetch_visible_rect() {
        const s = this.bb_state;
        if (this._cached_visible_rect_scale === s.scale &&
            this._cached_visible_rect_x === s.canvas_x &&
            this._cached_visible_rect_y === s.canvas_y &&
            this._cached_visible_rect) {
            return this._cached_visible_rect;
        }

        this._cached_visible_rect_scale = s.scale;
        this._cached_visible_rect_x = s.canvas_x;
        this._cached_visible_rect_y = s.canvas_y;

        const scale = s.scale || 1;
        const canvas_w = window.DRAW_CONFIG.canvasW;
        const canvas_h = window.DRAW_CONFIG.canvasH;

        let visible_x = Math.max(0, -s.canvas_x / scale);
        let visible_y = Math.max(0, -s.canvas_y / scale);
        let visible_w = Math.min(canvas_w - visible_x, this.screen_w / scale);
        let visible_h = Math.min(canvas_h - visible_y, this.screen_h / scale);

        const padding = 10;
        visible_x = Math.max(0, visible_x - padding);
        visible_y = Math.max(0, visible_y - padding);
        visible_w = Math.min(canvas_w - visible_x, visible_w + padding * 2);
        visible_h = Math.min(canvas_h - visible_y, visible_h + padding * 2);

        this._cached_visible_rect = {
            x: visible_x,
            y: visible_y,
            width: visible_w,
            height: visible_h
        };
        return this._cached_visible_rect;
    }

    init(container) {
        if (this.bb_wrapper) return; // 防止重复初始化
        const dom = window.dom;
        const panel = dom.blackboardPanel;
        if (!panel) return;

        this.screen_w = Math.max(1, container.clientWidth);
        this.screen_h = Math.max(1, container.clientHeight);

        const canvas_wrap = dom.blackboardCanvasWrap;

        // 创建分块包装器（CSS transform 目标）
        this.bb_wrapper = document.createElement('div');
        this.bb_wrapper.className = 'bb-canvas-wrapper';
        this.bb_wrapper.style.width = window.DRAW_CONFIG.canvasW + 'px';
        this.bb_wrapper.style.height = window.DRAW_CONFIG.canvasH + 'px';
        canvas_wrap.appendChild(this.bb_wrapper);

        // tile_renderer / overlay_canvas / DrawingEngine 子模块
        // 延迟到首次 open() 中初始化，减少应用启动时不必要的 canvas 创建
        this.tile_renderer = null;
        this.overlay_canvas = null;
        this.overlay_ctx = null;

        // 初始化状态位置：居中画布
        const init_x = -(window.DRAW_CONFIG.canvasW - this.screen_w) / 2;
        const init_y = -(window.DRAW_CONFIG.canvasH - this.screen_h) / 2;
        this.bb_state.canvas_x = init_x;
        this.bb_state.canvas_y = init_y;
        this.bb_state.scale = 1;
        this._update_move_bound();
        this._update_canvas_position();
        this._sync_bb_transform();

        // 初始化 DrawingEngine（仅构造函数，子模块延迟初始化）
        this.drawing_engine = new DrawingEngine({
            get_rect: () => this.bb_wrapper?.getBoundingClientRect() || null,
            get_scale: () => this.bb_state.scale,
            get_origin: () => ({ x: this.bb_state.canvas_x, y: this.bb_state.canvas_y }),
            set_origin: (x, y) => {
                this.bb_state.canvas_x = x;
                this.bb_state.canvas_y = y;
                this._update_canvas_position();
                this._sync_bb_transform();
            },
            get_stroke_history: () => this.page_manager.get_current_page()?.stroke_history || null,
            get_eraser_hint_rect: () => this.bb_wrapper?.parentElement?.getBoundingClientRect() || null,
            render_all_strokes: (bounds) => this._render_all_strokes(bounds),
            on_stroke_finalized: (stroke, bounds) => {
                if (this.tile_renderer) {
                    const page = this.page_manager.get_current_page();
                    if (page) {
                        this.tile_renderer._strokeHistoryRef = page.stroke_history;
                        this.tile_renderer.add_stroke?.(stroke);
                    }
                }
            }
        });

        this.page_manager.init();

        // 不再使用 #blackboardCanvas，隐藏之
        if (dom.blackboardCanvas) {
            dom.blackboardCanvas.style.display = 'none';
        }

        // 缓存主工具栏 DOM 引用，黑板打开时整体隐藏/恢复，不再单独控制各区域
        this._cached_main_toolbar = document.querySelector('.toolbar');
        this._cached_toolbar_display = null;

        // resize 时失效 container rect 缓存，避免下一次 _handle_wheel 读到过期 rect
        this._resize_handler = () => this._invalidate_cached_container_rect();
        window.addEventListener('resize', this._resize_handler, { passive: true });

        this._setup_events();
        this._setup_keyboard_events();
        this._sync_page_buttons();
        this._update_page_indicator();
        this._sync_hide_text();
    }

    /** 延迟初始化 Canvas 层：tile_renderer、overlay、DrawingEngine 子模块 */
    _lazy_init_canvas() {
        if (this.tile_renderer) return; // 已初始化

        const canvas_wrap = window.dom.blackboardCanvasWrap;

        // 分块渲染器
        this.tile_renderer = new window.TileRenderer({
            strokeHistoryRef: null,
            getVisibleRect: () => this._fetch_visible_rect(),
            canvasW: window.DRAW_CONFIG.canvasW,
            canvasH: window.DRAW_CONFIG.canvasH,
            skipBaseCache: true
        });
        this.tile_renderer.init_tiles(this.bb_wrapper, 1);

        // 覆盖层（实时预览，独立于分块包装器之外）
        this.overlay_canvas = document.createElement('canvas');
        this.overlay_canvas.className = 'blackboard-overlay';
        this.overlay_canvas.width = Math.ceil(this.screen_w);
        this.overlay_canvas.height = Math.ceil(this.screen_h);
        this.overlay_canvas.style.width = this.screen_w + 'px';
        this.overlay_canvas.style.height = this.screen_h + 'px';
        canvas_wrap.appendChild(this.overlay_canvas);
        this.overlay_ctx = this.overlay_canvas.getContext('2d');
        this.overlay_ctx.imageSmoothingEnabled = false;

        // batch_draw 使用覆盖层
        this.drawing_engine.init_batch_draw(this.overlay_canvas, this.overlay_ctx);
        this.drawing_engine.batch_draw._tileRenderer = this.tile_renderer;

        // 橡皮擦提示
        this.drawing_engine.init_eraser_hint(canvas_wrap);

        // 历史管理器由 open() 中 push_history_isolate 负责初始化，此处不重复调用
    }

    _setup_keyboard_events() {
        document.addEventListener('keydown', (e) => {
            if (!this.is_open) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });
    }

    _update_button_status() {
        const can_undo = history_validate_undo();
        // 黑板自己的撤销按钮
        const bb_undo = document.getElementById('bbUndo');
        if (bb_undo) bb_undo.disabled = !can_undo;
        // 主工具栏撤销按钮（黑板开着时被隐藏，但保留状态同步）
        const dom = window.dom;
        if (dom.btnUndo) dom.btnUndo.disabled = !can_undo;
    }

    /** 从主工具栏同步文字显隐状态到黑板工具栏 */
    _sync_hide_text() {
        // 通过 span display 状态同步，而非 CSS 类
        const mainSpan = document.querySelector('.toolbar .toolbar-btn span:not(img)');
        const isHidden = mainSpan && mainSpan.style.display === 'none';
        document.querySelectorAll('.bb-toolbar .toolbar-btn span:not(img)').forEach(span => {
            span.style.display = isHidden ? 'none' : '';
        });
        // 同步按钮尺寸类
        const main = document.querySelector('.toolbar');
        const bb = document.getElementById('bbToolbar');
        if (main && bb) {
            bb.classList.toggle('hide-text', main.classList.contains('hide-text'));
        }
    }

    /** 同步黑板模式按钮激活态（复用主题 .active 类） */
    _update_mode_buttons(mode) {
        const btns = document.querySelectorAll('#bbToolbar .function-btn');
        for (const btn of btns) {
            btn.classList.toggle('active', btn.dataset.bbMode === mode);
        }
    }

    async open() {
        if (this.is_open) return;

        // 首次打开时延迟初始化 tile_renderer / overlay / DrawingEngine 子模块
        this._lazy_init_canvas();

        if (window.main_update_camera_state && window.state.isCameraOpen) {
            this._was_camera_open_before = true;
            await window.main_update_camera_state(false);
        } else {
            this._was_camera_open_before = false;
        }

        if (window.main_submit_stroke) {
            await window.main_submit_stroke();
        }
        if (window.batchDrawManager) {
            window.batchDrawManager.batch_draw_delete_all();
        }
        if (window.main_update_mode) {
            window.main_update_mode('move');
        }
        this._update_mode_buttons('move');

        // 使用 DrawingEngine 隔离历史
        this.drawing_engine.push_history_isolate(() => {
            this._update_button_status();
        });

        // 面板弹出过渡期间禁止绘制（修复 getBoundingClientRect 过渡中偏移 bug）
        this.drawing_engine.set_painting_allowed(false);

        this.is_open = true;

        const dom = window.dom;
        dom.blackboardPanel.classList.add('active');

        // 监听 CSS transition 实际结束，替代固定 400ms 等待
        const transition_promise = new Promise(resolve => {
            const panel = dom.blackboardPanel;
            let resolved = false;
            const on_end = (e) => {
                if (e.propertyName === 'transform') {
                    panel.removeEventListener('transitionend', on_end);
                    resolved = true;
                    resolve();
                }
            };
            panel.addEventListener('transitionend', on_end);
            // 安全兜底：防止 transitionend 因故未触发
            setTimeout(() => {
                if (!resolved) {
                    panel.removeEventListener('transitionend', on_end);
                    resolve();
                }
            }, 600);
        });

        this._switch_toolbar(true);
        this._sync_hide_text();

        if (window.main_update_mode) {
            await window.main_update_mode('comment');
        }
        this._update_mode_buttons('comment');

        // 等待面板过渡完成后再允许绘制
        await transition_promise;
        this.drawing_engine.set_painting_allowed(true);

        this._last_loaded_index = -1;
        await this._load_page_strokes(this.page_manager.current_index);
        this._update_page_indicator();
        this._update_button_status();
    }

    async close() {
        if (!this.is_open) return;
        this.is_open = false;

        if (this._animate_timer_id !== null) {
            clearTimeout(this._animate_timer_id);
            this._animate_timer_id = null;
        }
        if (this.bb_wrapper) {
            this.bb_wrapper.classList.remove('smooth-transform');
            this.bb_wrapper.style.willChange = '';
        }
        // 清理触摸手势状态
        this._cleanup_touch_gesture();
        this.bb_state.is_scaling = false;
        this.bb_state.is_dragging = false;

        // 通过 DrawingEngine 提交未完成的笔画
        if (this.drawing_engine.is_drawing || this.drawing_engine.current_stroke) {
            await this.drawing_engine._submit_stroke();
        }
        this.drawing_engine._hide_eraser_hint();
        this.drawing_engine._hide_palm_eraser_hint();

        // 关闭前保存当前页的 undo/redo 和 tile 快照
        const cur_page = this.page_manager.get_current_page();
        if (cur_page) {
            cur_page.undo_list = [...history_state.undo_list];
            cur_page.redo_list = [...history_state.redo_list];
            if (this.tile_renderer) this._save_page_tile_snapshots(cur_page);
        }

        // DrawingEngine 恢复全局历史
        this.drawing_engine.pop_history_isolate();

        const dom = window.dom;
        dom.blackboardPanel.classList.remove('active');

        this._switch_toolbar(false);

        if (this._was_camera_open_before && window.main_update_camera_state) {
            this._was_camera_open_before = false;
            await window.main_update_camera_state(true);
        }
    }

    _switch_toolbar(bb_active) {
        // 隐藏/恢复主工具栏整体，不与各区域或阅读器工具栏耦合
        if (this._cached_main_toolbar) {
            if (bb_active) {
                this._cached_toolbar_display = this._cached_main_toolbar.style.display;
                this._cached_main_toolbar.style.display = 'none';
            } else {
                if (this._cached_toolbar_display !== undefined) {
                    this._cached_main_toolbar.style.display = this._cached_toolbar_display || '';
                }
                this._cached_toolbar_display = null;

                if (window.main_update_mode) {
                    window.main_update_mode('move');
                }
            }
        }
    }

    _setup_events() {
        const wrap = window.dom.blackboardCanvasWrap;
        if (!wrap) return;

        if (window.PointerEvent) {
            wrap.addEventListener('pointerdown', (e) => this._handle_pointer_down(e));
            wrap.addEventListener('pointermove', (e) => this._handle_pointer_move(e));
            wrap.addEventListener('pointerup', (e) => this._handle_pointer_up(e));
            wrap.addEventListener('pointerleave', (e) => this._handle_pointer_up(e));
            wrap.addEventListener('pointercancel', (e) => this._handle_pointer_up(e));
        } else {
            wrap.addEventListener('mousedown', (e) => this._handle_mouse_down(e));
            wrap.addEventListener('mousemove', (e) => this._handle_mouse_move(e));
            wrap.addEventListener('mouseup', (e) => this._handle_mouse_up(e));
            wrap.addEventListener('mouseleave', (e) => this._handle_mouse_up(e));
        }

        wrap.addEventListener('wheel', (e) => this._handle_wheel(e), { passive: false });

        wrap.addEventListener('touchstart', (e) => this._handle_touch_start(e), { passive: false });
        wrap.addEventListener('touchmove', (e) => this._handle_touch_move(e), { passive: false });
        wrap.addEventListener('touchend', (e) => this._handle_touch_end(e), { passive: false });
        wrap.addEventListener('touchcancel', (e) => this._handle_touch_end(e), { passive: false });
    }

    /** 窗口 resize 时失效 container rect 缓存 */
    _invalidate_cached_container_rect() {
        this._cached_container_rect = null;
    }

    _handle_wheel(e) {
        if (!this.is_open) return;
        if (this.drawing_engine?.is_drawing) return;
        if (this.tile_renderer) this.tile_renderer.cancel_idle_shrink();
        e.preventDefault();

        const s = this.bb_state;
        const max_scale = window.DRAW_CONFIG ? window.DRAW_CONFIG.maxScaleImage : 3;
        const min_scale = window.DRAW_CONFIG ? window.DRAW_CONFIG.minScale : 0.5;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const new_scale = Math.max(min_scale, Math.min(max_scale, s.scale + delta));

        if (new_scale !== s.scale) {
            // 缓存 container rect 避免每次滚轮触发 layout 回流
            if (!this._cached_container_rect) {
                this._cached_container_rect = window.dom.canvasContainer.getBoundingClientRect();
            }
            const container_rect = this._cached_container_rect;
            const mouse_x = e.clientX - container_rect.left;
            const mouse_y = e.clientY - container_rect.top;

            const old_scale = s.scale;
            const scale_ratio = new_scale / old_scale;
            const target_x = mouse_x - (mouse_x - s.canvas_x) * scale_ratio;
            const target_y = mouse_y - (mouse_y - s.canvas_y) * scale_ratio;

            s.scale = new_scale;
            s.canvas_x = target_x;
            s.canvas_y = target_y;

            this._update_move_bound();
            this._update_canvas_position();
            this._sync_bb_transform_smooth(s.canvas_x, s.canvas_y, s.scale, 200);

            // mark_all 与 update_visible_tile_dpr 在缩放时重复，移除冗余的全标记
            // _sync_bb_transform_smooth → update_visible_tile_dpr 已处理 DPR 变化
        }
    }

    setup_toolbar_events() {
        const dom = window.dom;

        // 关闭
        if (dom.bbClose) {
            dom.bbClose.addEventListener('click', () => this.close());
        }

        // 模式按钮 — 直接调用 main_show_pen_control_panel / main_update_mode，按钮取自黑板自身
        const handle_mode_click = (btn) => {
            const mode = btn.dataset.bbMode;
            if (this.draw_mode === mode) {
                // 已激活的按钮再次点击 → 唤出笔控制面板（move 无面板）
                if (mode === 'move') {
                    window.main_update_mode?.('move');
                    this._update_mode_buttons('move');
                    return;
                }
                if (mode === 'eraser' && window.DRAW_CONFIG?.eraserSpeedEnabled) return;
                window.main_show_pen_control_panel?.(btn, mode);
            } else {
                // 切换到新模式
                window.main_update_mode?.(mode);
                this._update_mode_buttons(mode);
            }
        };
        const mode_btns = document.querySelectorAll('#bbToolbar .function-btn');
        for (const btn of mode_btns) {
            btn.addEventListener('click', () => handle_mode_click(btn));
        }

        // 撤销
        const bb_undo = document.getElementById('bbUndo');
        if (bb_undo) {
            bb_undo.addEventListener('click', () => this.handle_undo());
        }
        
        // 翻页
        const prev_btn = document.getElementById('bbPagePrev');
        const next_btn = document.getElementById('bbPageNext');
        const add_btn = document.getElementById('bbPageAdd');

        if (prev_btn) {
            prev_btn.addEventListener('click', () => this.handle_page_nav_prev());
        }
        if (next_btn) {
            next_btn.addEventListener('click', () => this.handle_page_nav_next());
        }
        if (add_btn) {
            add_btn.addEventListener('click', () => this.handle_page_add());
        }
    }

    _get_canvas_rect() {
        return this.bb_wrapper ? this.bb_wrapper.getBoundingClientRect() : null;
    }

    // ====== 指针事件 (PointerEvent) ======

    _handle_pointer_down(e) {
        e.preventDefault();
        this.bb_state.cached_inv_scale = 1 / this._fetch_safe_scale();

        if (this.draw_mode === 'move') {
            this.bb_state.is_dragging = true;
            this.bb_state.start_drag_x = e.clientX - this.bb_state.canvas_x;
            this.bb_state.start_drag_y = e.clientY - this.bb_state.canvas_y;
        } else {
            this.drawing_engine.handle_pointer_down(e);
        }
    }

    _handle_pointer_move(e) {
        e.preventDefault();

        const s = this.bb_state;
        if (s.is_dragging) {
            s.canvas_x = e.clientX - s.start_drag_x;
            s.canvas_y = e.clientY - s.start_drag_y;
            this._update_canvas_position();
            this._sync_bb_transform();
            return;
        }

        if (this.draw_mode === 'eraser') {
            this.drawing_engine._update_eraser_hint_position(e.clientX, e.clientY);
        }

        if (this.drawing_engine._move_state) {
            this.drawing_engine.handle_pointer_move(e);
            return;
        }

        if (!this.drawing_engine.is_drawing) return;
        this.drawing_engine.handle_pointer_move(e);
    }

    async _handle_pointer_up(e) {
        if (this.bb_state.is_dragging) {
            this.bb_state.is_dragging = false;
            return;
        }
        if (this.drawing_engine.isPalmErasing) {
            await this.drawing_engine.handle_pointer_up(e);
            return;
        }
        if (!this.drawing_engine.is_drawing) return;
        this.drawing_engine.is_drawing = false;
        this.drawing_engine.draw_canvas_rect = null;
        await this.drawing_engine._submit_stroke();
    }

    // ====== 鼠标事件 (MouseEvent) — 无 PointerEvent 时的回退 ======

    _handle_mouse_down(e) {
        e.preventDefault();
        this.bb_state.cached_inv_scale = 1 / this._fetch_safe_scale();

        if (this.draw_mode === 'move') {
            this.bb_state.is_dragging = true;
            this.bb_state.start_drag_x = e.clientX - this.bb_state.canvas_x;
            this.bb_state.start_drag_y = e.clientY - this.bb_state.canvas_y;
        } else {
            this.drawing_engine.handle_mouse_down(e);
        }
    }

    _handle_mouse_move(e) {
        e.preventDefault();

        const s = this.bb_state;
        if (s.is_dragging) {
            s.canvas_x = e.clientX - s.start_drag_x;
            s.canvas_y = e.clientY - s.start_drag_y;
            this._update_canvas_position();
            this._sync_bb_transform();
            return;
        }

        if (this.draw_mode === 'eraser') {
            this.drawing_engine._update_eraser_hint_position(e.clientX, e.clientY);
        }

        if (!this.drawing_engine.is_drawing) return;
        this.drawing_engine.handle_mouse_move(e);
    }

    async _handle_mouse_up(e) {
        if (this.bb_state.is_dragging) {
            this.bb_state.is_dragging = false;
            return;
        }
        if (!this.drawing_engine.is_drawing) return;
        this.drawing_engine.is_drawing = false;
        this.drawing_engine.draw_canvas_rect = null;
        await this.drawing_engine._submit_stroke();
    }

    // ====== 触摸事件 (TouchEvent) ======

    _calc_touch_dist_sq(t1, t2) {
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        return dx * dx + dy * dy;
    }

    async _handle_touch_start(e) {
        e.preventDefault();
        const touches = e.touches;
        this.bb_state.cached_inv_scale = 1 / this._fetch_safe_scale();
        this.drawing_engine.draw_canvas_rect = this._get_canvas_rect();
        if (!this.drawing_engine.draw_canvas_rect) return;

        const s = this.bb_state;

        // 手掌擦除检测
        if ((window.DRAW_CONFIG?.palmEraserEnabled !== false) && touches.length >= 4) {
            if (is_palm_by_touch_count(touches)) {
                if (this.drawing_engine.is_drawing) {
                    this.drawing_engine.is_drawing = false;
                    if (this.drawing_engine.current_stroke) {
                        await this.drawing_engine._submit_stroke();
                    }
                }
                const center = get_palm_center(touches);
                this.drawing_engine._start_palm_erase(center.x, center.y, window.DRAW_CONFIG?.palmEraserSize || 60);
                return;
            }
        }

        if (window.PointerEvent) {
            if (touches.length === 1) return;
        } else {
            if (touches.length === 1 && this.drawing_engine.is_drawing) return;
        }

        if (touches.length === 1) {
            const touch = touches[0];
            if (this.draw_mode === 'move') {
                s.is_dragging = true;
                s.start_drag_x = touch.clientX - s.canvas_x;
                s.start_drag_y = touch.clientY - s.canvas_y;
                this._touch_enable_gpu();
            } else if (this.draw_mode === 'comment' || this.draw_mode === 'eraser') {
                this.drawing_engine.is_drawing = true;
                const inv = s.cached_inv_scale;
                this.drawing_engine.last_x = (touch.clientX - this.drawing_engine.draw_canvas_rect.left) * inv;
                this.drawing_engine.last_y = (touch.clientY - this.drawing_engine.draw_canvas_rect.top) * inv;
                this.drawing_engine._start_stroke(this.draw_mode === 'comment' ? 'draw' : 'erase');
            }
        } else if (touches.length === 2) {
            if (this.drawing_engine.is_drawing) {
                this.drawing_engine.is_drawing = false;
                if (this.drawing_engine.current_stroke) {
                    await this.drawing_engine._submit_stroke();
                }
                if (this.drawing_engine.batch_draw) {
                    this.drawing_engine.batch_draw.batch_draw_delete_all();
                }
            }
            s.is_scaling = true;
            s.is_dragging = false;
            s.start_distance_sq = this._calc_touch_dist_sq(touches[0], touches[1]);
            s.start_scale = s.scale;
            s.start_scale_x = (touches[0].clientX + touches[1].clientX) / 2;
            s.start_scale_y = (touches[0].clientY + touches[1].clientY) / 2;
            s.start_canvas_x = s.canvas_x;
            s.start_canvas_y = s.canvas_y;
            this._touch_start_center_x = s.start_scale_x;
            this._touch_start_center_y = s.start_scale_y;
            s._last_gesture_x = s.canvas_x;
            s._last_gesture_y = s.canvas_y;
            this._touch_enable_gpu();
        }
    }

    _handle_touch_move(e) {
        e.preventDefault();
        const touches = e.touches;

        if (this.drawing_engine.isPalmErasing) {
            const center = get_palm_center(touches);
            this.drawing_engine._update_palm_erase(center.x, center.y);
            return;
        }

        if (this.draw_mode === 'eraser' && touches.length > 0) {
            this.drawing_engine._update_eraser_hint_position(touches[0].clientX, touches[0].clientY);
        }

        const s = this.bb_state;

        if (window.PointerEvent && touches.length === 1) return;

        if (touches.length === 1 && s.is_dragging) {
            const touch = touches[0];
            s.canvas_x = touch.clientX - s.start_drag_x;
            s.canvas_y = touch.clientY - s.start_drag_y;
            this._update_canvas_position();
            this._sync_bb_transform();
            return;
        }

        if (touches.length === 1 && this.drawing_engine.is_drawing) {
            this.drawing_engine._handle_single_touch_draw(touches[0]);
            return;
        }

        if (touches.length === 2 && s.is_scaling) {
            // 缓存触摸数据，由 rAF 节流处理（保证 60fps 平滑输出）
            this._touch_pending_data = {
                t0: { clientX: touches[0].clientX, clientY: touches[0].clientY },
                t1: { clientX: touches[1].clientX, clientY: touches[1].clientY }
            };

            if (this._touch_raf_id !== null) return;
            this._touch_raf_id = requestAnimationFrame(() => {
                this._touch_raf_id = null;
                const data = this._touch_pending_data;
                if (!data || !s.is_scaling) return;
                this._touch_pending_data = null;

                const current_dist_sq = this._calc_touch_dist_sq(data.t0, data.t1);
                const scale_ratio = Math.sqrt(current_dist_sq / s.start_distance_sq);
                let new_scale = s.start_scale * scale_ratio;
                const max_scale = window.DRAW_CONFIG ? window.DRAW_CONFIG.maxScaleImage : 3;
                new_scale = Math.max(window.DRAW_CONFIG ? window.DRAW_CONFIG.minScale : 0.5, Math.min(max_scale, new_scale));

                const center_x = (data.t0.clientX + data.t1.clientX) / 2;
                const center_y = (data.t0.clientY + data.t1.clientY) / 2;

                if (new_scale !== s.scale) {
                    const final_ratio = new_scale / s.start_scale;
                    const pan_dx = center_x - this._touch_start_center_x;
                    const pan_dy = center_y - this._touch_start_center_y;
                    s.canvas_x = s.start_scale_x - (s.start_scale_x - s.start_canvas_x) * final_ratio + pan_dx;
                    s.canvas_y = s.start_scale_y - (s.start_scale_y - s.start_canvas_y) * final_ratio + pan_dy;
                    s.scale = new_scale;
                } else {
                    // 缩放未变化时仅为纯平移
                    const pan_dx = center_x - this._touch_start_center_x;
                    const pan_dy = center_y - this._touch_start_center_y;
                    if (Math.abs(pan_dx) > 0.5 || Math.abs(pan_dy) > 0.5) {
                        s.canvas_x = s.start_canvas_x + pan_dx;
                        s.canvas_y = s.start_canvas_y + pan_dy;
                    }
                }

                // 限制单帧位移，防止误触/bug 导致画面瞬移
                const MAX_FRAME_DELTA = window.DRAW_CONFIG?.gestureFrameDelta ?? 60;
                const dx = s.canvas_x - s._last_gesture_x;
                const dy = s.canvas_y - s._last_gesture_y;
                if (Math.abs(dx) > MAX_FRAME_DELTA) s.canvas_x = s._last_gesture_x + Math.sign(dx) * MAX_FRAME_DELTA;
                if (Math.abs(dy) > MAX_FRAME_DELTA) s.canvas_y = s._last_gesture_y + Math.sign(dy) * MAX_FRAME_DELTA;

                this._update_move_bound();
                this._update_canvas_position();
                s._last_gesture_x = s.canvas_x;
                s._last_gesture_y = s.canvas_y;
                this._sync_bb_transform();
            });
        }
    }

    async _handle_touch_end(e) {
        e.preventDefault();
        if (this.drawing_engine.isPalmErasing) {
            if (e.touches.length < 4) {
                await this.drawing_engine._end_palm_erase();
            }
            return;
        }

        if (window.PointerEvent) {
            // PointerEvent 设备上 touch 只处理双指缩放，结束时需清理 rAF 和 GPU
            this._cleanup_touch_gesture();
            return;
        }
        const s = this.bb_state;
        if (s.is_scaling && e.touches.length < 2) {
            s.is_scaling = false;
            this._cleanup_touch_gesture();
        }
        if (s.is_dragging && e.touches.length === 0) {
            s.is_dragging = false;
            this._touch_schedule_disable_gpu();
        }
        if (e.touches.length === 0) {
            if (this.drawing_engine.is_drawing) {
                this.drawing_engine.is_drawing = false;
                this.drawing_engine.draw_canvas_rect = null;
                await this.drawing_engine._submit_stroke();
            }
        }
    }

    /** 清理触摸手势的 rAF 节流和 GPU 合成层 */
    _cleanup_touch_gesture() {
        if (this._touch_raf_id !== null) {
            cancelAnimationFrame(this._touch_raf_id);
            this._touch_raf_id = null;
        }
        this._touch_pending_data = null;
        this._touch_schedule_disable_gpu();
    }

    // ====== 快照 ======

    _save_tile_snapshots() {
        const tr = this.tile_renderer;
        if (!tr) return null;
        return tr.tileInfos.map(info => {
            const w = info.canvas.width;
            const h = info.canvas.height;
            return info.ctx.getImageData(0, 0, w, h);
        });
    }

    _restore_tile_snapshots(snapshots) {
        const tr = this.tile_renderer;
        if (!tr || !snapshots) return false;
        for (let i = 0; i < tr.tileInfos.length; i++) {
            const info = tr.tileInfos[i];
            const snap = snapshots[i];
            if (snap && info.canvas && snap.width === info.canvas.width && snap.height === info.canvas.height) {
                info.ctx.putImageData(snap, 0, 0);
            }
        }
        return true;
    }

    // ====== 渲染 — 使用主渲染管线 ======

    async _render_all_strokes(bounds) {
        const page = this.page_manager.get_current_page();
        if (!page) return;

        if (this.tile_renderer) {
            const orig_scale = window.state.scale;
            window.state.scale = this.bb_state.scale;

            window.main_reset_context_state();
            this.tile_renderer._strokeHistoryRef = page.stroke_history;
            this.tile_renderer.mark_strokes_changed();

            if (bounds && isFinite(bounds.minX) && isFinite(bounds.minY) &&
                          isFinite(bounds.maxX) && isFinite(bounds.maxY)) {
                const infos = this.tile_renderer.infos_for_segment(
                    bounds.minX, bounds.minY,
                    bounds.maxX, bounds.maxY
                );
                for (const info of infos) {
                    this.tile_renderer.dirty.add(info.key);
                }
            } else {
                this.tile_renderer.mark_all();
            }

            try {
                this.tile_renderer.rebuild_all();
            } finally {
                window.state.scale = orig_scale;
            }
        }
        page.snapshot_dirty = true;
    }

    _save_page_tile_snapshots(page) {
        const snapshots = this._save_tile_snapshots();
        if (snapshots) {
            page.tile_snapshots = snapshots;
            page.snapshot_dirty = false;
        }
    }

    _restore_page_tile_snapshots(page) {
        return this._restore_tile_snapshots(page.tile_snapshots);
    }

    async _rebuild_from_history(page) {
        if (!this.tile_renderer) return;

        const orig_scale = window.state.scale;
        window.state.scale = this.bb_state.scale;

        window.main_reset_context_state();
        this.tile_renderer._strokeHistoryRef = page.stroke_history;
        this.tile_renderer.mark_strokes_changed();
        this.tile_renderer.mark_all();

        try {
            this.tile_renderer.rebuild_all();
        } finally {
            window.state.scale = orig_scale;
        }
    }

    async _load_page_strokes(index) {
        // 保存当前页的 undo/redo 和历史和 tile 快照
        if (this._last_loaded_index >= 0 && this._last_loaded_index < this.page_manager.pages_list.length) {
            const prev_page = this.page_manager.pages_list[this._last_loaded_index];
            prev_page.undo_list = history_state.undo_list;
            prev_page.redo_list = history_state.redo_list;
            this._save_page_tile_snapshots(prev_page);
        }
        this._last_loaded_index = index;

        const page = this.page_manager.pages_list[index];
        if (!page) return;

        // 恢复目标页的 undo/redo 历史
        history_state.undo_list = page.undo_list || [];
        history_state.redo_list = page.redo_list || [];
        history_reset_executing();

        // 优先从 tile 快照恢复（像素级精确，保留 batch draw 的擦除效果）
        // 没有快照或标记脏时从 stroke_history 重建
        if (page.snapshot_dirty || !page.tile_snapshots) {
            await this._rebuild_from_history(page);
            this._save_page_tile_snapshots(page);
        } else {
            this._restore_page_tile_snapshots(page);
        }
        this._update_button_status();
    }

    // ====== 撤销与清空 — 委托 DrawingEngine ======

    async handle_undo() {
        await this.drawing_engine.handle_undo();
        this._update_button_status();
    }

    async handle_clear() {
        const page = this.page_manager.get_current_page();
        await this.drawing_engine.handle_clear(page?.stroke_history);
        this._update_button_status();
    }

    // ====== 多页导航 ======

    async handle_page_nav_prev() {
        if (this.drawing_engine.is_drawing) return;
        if (this.drawing_engine.current_stroke) {
            await this.drawing_engine._submit_stroke();
        }
        const moved = this.page_manager.nav_prev();
        if (moved) {
            await this._load_page_strokes(this.page_manager.current_index);
            this._update_page_indicator();
            this._sync_page_buttons();
            this._update_button_status();
        }
    }

    async handle_page_nav_next() {
        if (this.drawing_engine.is_drawing) return;
        if (this.drawing_engine.current_stroke) {
            await this.drawing_engine._submit_stroke();
        }
        const moved = this.page_manager.nav_next();
        if (moved) {
            await this._load_page_strokes(this.page_manager.current_index);
            this._update_page_indicator();
            this._sync_page_buttons();
            this._update_button_status();
        }
    }

    async handle_page_add() {
        if (this.drawing_engine.is_drawing) return;
        if (this.drawing_engine.current_stroke) {
            await this.drawing_engine._submit_stroke();
        }
        this.page_manager.add_page();
        const new_idx = this.page_manager.current_index;
        await this._load_page_strokes(new_idx);
        this._update_page_indicator();
        this._sync_page_buttons();
        this._update_page_indicator();
        this._update_button_status();
    }


    _update_page_indicator() {
        const el = document.getElementById('bbPageIndicator');
        if (el) {
            el.textContent = `${this.page_manager.current_index + 1} / ${this.page_manager.get_page_count()}`;
        }
    }

    _sync_page_buttons() {
        const prev_btn = document.getElementById('bbPagePrev');
        const next_btn = document.getElementById('bbPageNext');
        if (prev_btn) prev_btn.disabled = this.page_manager.current_index <= 0;
        if (next_btn) next_btn.disabled = this.page_manager.current_index >= this.page_manager.get_page_count() - 1;

        const add_btn = document.getElementById('bbPageAdd');
        if (add_btn) add_btn.disabled = false;
    }

    resize(screen_w, screen_h) {
        this.screen_w = screen_w;
        this.screen_h = screen_h;

        // overlay 在首次 open() 前为 null，首次 open 时才会创建
        if (this.overlay_canvas) {
            this.overlay_canvas.width = Math.ceil(screen_w);
            this.overlay_canvas.height = Math.ceil(screen_h);
            this.overlay_canvas.style.width = screen_w + 'px';
            this.overlay_canvas.style.height = screen_h + 'px';
            this.overlay_ctx.imageSmoothingEnabled = false;
        }

        // 重新居中画布
        const init_x = -(window.DRAW_CONFIG.canvasW - screen_w) / 2;
        const init_y = -(window.DRAW_CONFIG.canvasH - screen_h) / 2;
        this.bb_state.canvas_x = init_x;
        this.bb_state.canvas_y = init_y;
        this._cached_move_bound_scale = null;
        this._cached_visible_rect = null;
        this._cached_visible_rect_scale = null;
        this._cached_visible_rect_x = null;
        this._cached_visible_rect_y = null;
        this._update_move_bound();
        this._update_canvas_position();
        this._sync_bb_transform();

        if (this.tile_renderer) {
            const page = this.page_manager.get_current_page();
            const orig_scale = window.state.scale;
            window.state.scale = this.bb_state.scale;

            window.main_reset_context_state();
            if (page) this.tile_renderer._strokeHistoryRef = page.stroke_history;
            this.tile_renderer.mark_all();

            try {
                this.tile_renderer.rebuild_all();
            } finally {
                window.state.scale = orig_scale;
            }
        }
    }

    async destroy() {
        if (this._resize_handler) {
            window.removeEventListener('resize', this._resize_handler);
            this._resize_handler = null;
        }
        this._cached_container_rect = null;
        this._cached_main_toolbar = null;

        if (this.drawing_engine) {
            if (this.drawing_engine.is_drawing || this.drawing_engine.current_stroke) {
                await this.drawing_engine._submit_stroke();
            }
            this.drawing_engine.destroy();
        }
        window.__HISTORY_ISOLATED = false;
        this._last_loaded_index = -1;
        this.page_manager.destroy();

        if (this.tile_renderer) {
            this.tile_renderer.destroy();
            this.tile_renderer = null;
        }

        if (this.bb_wrapper && this.bb_wrapper.parentNode) {
            this.bb_wrapper.parentNode.removeChild(this.bb_wrapper);
            this.bb_wrapper = null;
        }

        if (this.overlay_canvas && this.overlay_canvas.parentNode) {
            this.overlay_canvas.parentNode.removeChild(this.overlay_canvas);
        }

        this.overlay_canvas = null;
        this.overlay_ctx = null;
        this.drawing_engine = null;
        this.is_open = false;
    }
}

const blackboardManager = new BlackboardManager();
window.blackboardManager = blackboardManager;
export default blackboardManager;
