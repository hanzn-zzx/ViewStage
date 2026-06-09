/**
 * ViewStage 开发者选项
 * 通过关于页面图标点击5次打开
 */

async function developer_options_init() {
    // 从后端加载已保存的值（设置面板无 DRAW_CONFIG，必须读后端）
    const invoke = window.__TAURI__?.core?.invoke;
    let savedWidthRatio = 0.4;
    let savedMaxScale = 4;
    let savedPerfMonitor = false;
    let savedPerfInterval = 200;
    let savedDevMode = true;
    let savedFrameDelta = 60;

    if (invoke) {
        try {
            const result = await invoke('settings_fetch_all');
            const s = result?.settings || {};
            // 优先使用 DRAW_CONFIG（主窗口），否则用后端保存值，最后用硬编码默认
            savedWidthRatio = window.DRAW_CONFIG?.penMinWidthRatio
                ?? s.penMinWidthRatio
                ?? 0.4;
            savedMaxScale = window.DRAW_CONFIG?.maxScaleImage
                ?? s.maxScaleImage
                ?? 4;
            savedPerfMonitor = s.perfMonitorEnabled === true;
            savedPerfInterval = s.perfMonitorInterval ?? 200;
            savedDevMode = s.developerMode !== false;
            savedFrameDelta = window.DRAW_CONFIG?.gestureFrameDelta
                ?? s.gestureFrameDelta
                ?? 60;
        } catch (_) {
            savedWidthRatio = window.DRAW_CONFIG?.penMinWidthRatio ?? 0.4;
            savedMaxScale = window.DRAW_CONFIG?.maxScaleImage ?? 4;
        }
    } else {
        savedWidthRatio = window.DRAW_CONFIG?.penMinWidthRatio ?? 0.4;
        savedMaxScale = window.DRAW_CONFIG?.maxScaleImage ?? 4;
    }

    developer_options_show_main(savedWidthRatio, savedMaxScale, savedPerfMonitor, savedPerfInterval, savedDevMode, savedFrameDelta);
}

const PERF_INTERVAL_OPTIONS = [
    { value: '100', label: '快' },
    { value: '200', label: '正常' },
    { value: '500', label: '慢' },
];

function perf_interval_label(ms) {
    const opt = PERF_INTERVAL_OPTIONS.find(p => parseInt(p.value) === ms);
    return opt ? `${opt.label}（${ms}ms）` : `${ms}ms`;
}

function developer_options_show_main(currentWidthRatio, currentMaxScale, perfMonitorEnabled, perfMonitorInterval, devModeEnabled, currentFrameDelta) {
    const page = document.getElementById('pageDevOptions');
    if (!page) return;
    const devModeOn = devModeEnabled !== false;

    const widthPresets = [
        { value: '0.05', label: '0.05' },
        { value: '0.1', label: '0.10' },
        { value: '0.15', label: '0.15' },
        { value: '0.2', label: '0.20' },
        { value: '0.25', label: '0.25' },
        { value: '0.3', label: '0.30' },
        { value: '0.4', label: '0.40（默认）' },
        { value: '0.5', label: '0.50' },
        { value: '0.75', label: '0.75' },
        { value: '1', label: '1.00' },
    ];
    const currentWidthLabel = widthPresets.find(p => parseFloat(p.value) === currentWidthRatio)?.label
        || currentWidthRatio.toFixed(2);

    const scalePresets = [
        { value: '2', label: '2x' },
        { value: '3', label: '3x' },
        { value: '4', label: '4x（默认）' },
        { value: '5', label: '5x' },
        { value: '6', label: '6x' },
        { value: '8', label: '8x' },
        { value: '10', label: '10x' },
    ];
    const currentScaleLabel = scalePresets.find(p => parseInt(p.value) === currentMaxScale)?.label
        || `${currentMaxScale}x`;

    const frameDeltaPresets = [
        { value: '10', label: '10px' },
        { value: '30', label: '30px' },
        { value: '60', label: '60px（默认）' },
        { value: '100', label: '100px' },
        { value: '200', label: '200px' },
        { value: '500', label: '500px' },
        { value: '1000', label: '1000px' },
    ];
    const currentFrameDeltaLabel = frameDeltaPresets.find(p => parseInt(p.value) === currentFrameDelta)?.label
        || `${currentFrameDelta}px`;

    page.innerHTML = `
        <h2 class="page-title">开发者选项</h2>
        <div class="setting-item" style="border-bottom-color:var(--color-hairline, rgba(255,255,255,0.08));">
            <span class="setting-label">开发者模式</span>
            <label class="toggle-switch">
                <input type="checkbox" id="devModeToggle"${devModeOn ? ' checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="setting-item">
            <span class="setting-label">文档加载检测</span>
            <span id="devGoDetection" style="cursor:pointer;font-size:18px;color:var(--color-muted, #888);padding:4px;">→</span>
        </div>
        <div class="setting-item">
            <span class="setting-label">性能监视器</span>
            <label class="toggle-switch">
                <input type="checkbox" id="devPerfMonitorToggle"${perfMonitorEnabled ? ' checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
        </div>
        <div class="setting-item">
            <span class="setting-label">监视器更新频率</span>
            <div class="custom-select" id="devPerfIntervalSelect">
                <div class="select-selected" id="devPerfIntervalSelected">${perf_interval_label(perfMonitorInterval)}</div>
                <div class="select-options" id="devPerfIntervalOptions">
                    ${PERF_INTERVAL_OPTIONS.map(p => `
                        <div class="select-option${parseInt(p.value) === perfMonitorInterval ? ' selected' : ''}" data-value="${p.value}">${p.label}（${p.value}ms）</div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">最快速度时宽度比例</span>
            <div class="custom-select" id="devWidthRatioSelect">
                <div class="select-selected" id="devWidthRatioSelected">${currentWidthLabel}</div>
                <div class="select-options" id="devWidthRatioOptions">
                    ${widthPresets.map(p => `
                        <div class="select-option${parseFloat(p.value) === currentWidthRatio ? ' selected' : ''}" data-value="${p.value}">${p.label}</div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">允许缩放的最大大小</span>
            <div class="custom-select" id="devMaxScaleSelect">
                <div class="select-selected" id="devMaxScaleSelected">${currentScaleLabel}</div>
                <div class="select-options" id="devMaxScaleOptions">
                    ${scalePresets.map(p => `
                        <div class="select-option${parseInt(p.value) === currentMaxScale ? ' selected' : ''}" data-value="${p.value}">${p.label}</div>
                    `).join('')}
                </div>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">单帧手势位移上限</span>
            <div class="custom-select" id="devFrameDeltaSelect">
                <div class="select-selected" id="devFrameDeltaSelected">${currentFrameDeltaLabel}</div>
                <div class="select-options" id="devFrameDeltaOptions">
                    ${frameDeltaPresets.map(p => `
                        <div class="select-option${parseInt(p.value) === currentFrameDelta ? ' selected' : ''}" data-value="${p.value}">${p.label}</div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    document.getElementById('devGoDetection')?.addEventListener('click', developer_options_show_detection);

    // 开发者模式开关
    (function setup_dev_mode_toggle() {
        const toggle = document.getElementById('devModeToggle');
        if (!toggle) return;
        toggle.addEventListener('change', () => {
            const enabled = toggle.checked;
            const invoke = window.__TAURI__?.core?.invoke;
            if (invoke) {
                invoke('settings_save_all', { settings: { developerMode: enabled } });
            }
            /* 同步隐藏/显示侧边栏按钮 */
            const devBtn = document.getElementById('btnDevOptions');
            if (devBtn) devBtn.style.display = enabled ? '' : 'none';
        });
    })();

    // 性能监视器开关
    (function setup_perf_monitor_toggle() {
        const toggle = document.getElementById('devPerfMonitorToggle');
        if (!toggle) return;
        toggle.addEventListener('change', () => {
            const enabled = toggle.checked;
            const invoke = window.__TAURI__?.core?.invoke;
            if (invoke) {
                invoke('settings_save_all', { settings: { perfMonitorEnabled: enabled, developerMode: true } });
            }
        });
    })();

    // 监视器更新频率选择器
    (function setup_perf_interval_select() {
        const select = document.getElementById('devPerfIntervalSelect');
        const selected = document.getElementById('devPerfIntervalSelected');
        const options = document.querySelectorAll('#devPerfIntervalOptions .select-option');

        if (!select || !selected) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            select.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = parseInt(opt.dataset.value);
                selected.textContent = perf_interval_label(v);
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                select.classList.remove('open');

                const invoke = window.__TAURI__?.core?.invoke;
                if (invoke) {
                    invoke('settings_save_all', { settings: { perfMonitorInterval: v, developerMode: true } });
                }
            });
        });
    })();

    // 宽度比例选择器
    (function setup_width_ratio_select() {
        const select = document.getElementById('devWidthRatioSelect');
        const selected = document.getElementById('devWidthRatioSelected');
        const options = document.querySelectorAll('#devWidthRatioOptions .select-option');

        if (!select || !selected) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            select.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = parseFloat(opt.dataset.value);
                selected.textContent = opt.textContent;
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                select.classList.remove('open');

                if (window.DRAW_CONFIG) {
                    window.DRAW_CONFIG.penMinWidthRatio = v;
                }
                const invoke = window.__TAURI__?.core?.invoke;
                if (invoke) {
                    invoke('settings_save_all', { settings: { penMinWidthRatio: v, developerMode: true } });
                }
            });
        });
    })();

    // 最大缩放选择器
    (function setup_max_scale_select() {
        const select = document.getElementById('devMaxScaleSelect');
        const selected = document.getElementById('devMaxScaleSelected');
        const options = document.querySelectorAll('#devMaxScaleOptions .select-option');

        if (!select || !selected) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            select.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = parseInt(opt.dataset.value);
                selected.textContent = opt.textContent;
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                select.classList.remove('open');

                if (window.DRAW_CONFIG) {
                    window.DRAW_CONFIG.maxScaleImage = v;
                }
                const invoke = window.__TAURI__?.core?.invoke;
                if (invoke) {
                    invoke('settings_save_all', { settings: { maxScaleImage: v, developerMode: true } });
                }
            });
        });
    })();

    // 单帧手势位移上限选择器
    (function setup_frame_delta_select() {
        const select = document.getElementById('devFrameDeltaSelect');
        const selected = document.getElementById('devFrameDeltaSelected');
        const options = document.querySelectorAll('#devFrameDeltaOptions .select-option');

        if (!select || !selected) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            select.classList.toggle('open');
        });

        options.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = parseInt(opt.dataset.value);
                selected.textContent = opt.textContent;
                options.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                select.classList.remove('open');

                if (window.DRAW_CONFIG) {
                    window.DRAW_CONFIG.gestureFrameDelta = v;
                }
                const invoke = window.__TAURI__?.core?.invoke;
                if (invoke) {
                    invoke('settings_save_all', { settings: { gestureFrameDelta: v, developerMode: true } });
                }
            });
        });
    })();

    // 点击外部关闭所有下拉菜单
    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
    });
}

function developer_options_show_detection() {
    const page = document.getElementById('pageDevOptions');
    if (!page) return;

    page.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
            <span id="devBackToMain" style="cursor:pointer;font-size:18px;color:var(--color-muted, #888);padding:4px;">←</span>
            <h2 class="page-title" style="margin:0;">文档加载检测</h2>
        </div>
        <div class="setting-item">
            <span class="setting-label">Microsoft Office（COM）</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span id="devWordStatus" style="font-size:13px;color:var(--color-muted, #888);">未检测</span>
                <button class="btn-action" data-check="word">检测</button>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">WPS Office（COM）</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span id="devWpsStatus" style="font-size:13px;color:var(--color-muted, #888);">未检测</span>
                <button class="btn-action" data-check="wps">检测</button>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">LibreOffice（CLI）</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span id="devLibreStatus" style="font-size:13px;color:var(--color-muted, #888);">未检测</span>
                <button class="btn-action" data-check="libreoffice">检测</button>
            </div>
        </div>
        <div class="setting-item">
            <span class="setting-label">Mem Reduct</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span id="devMemreductStatus" style="font-size:13px;color:var(--color-muted, #888);">未检测</span>
                <button class="btn-action" data-check="memreduct">检测</button>
            </div>
        </div>
        <div class="setting-item" style="border-bottom:none;justify-content:center;padding-top:20px;">
            <button class="btn-action" id="devCleanMemory" style="color:var(--color-error, #ef4444);border-color:rgba(239,68,68,0.2);">清理内存</button>
        </div>
    `;

    document.getElementById('devBackToMain')?.addEventListener('click', developer_options_init);

    const cleanBtn = document.getElementById('devCleanMemory');
    if (cleanBtn) {
        cleanBtn.addEventListener('click', () => {
            const invoke = window.__TAURI__?.core?.invoke;
            if (invoke) {
                invoke('memreduct_clean_now');
            }
        });
    }

    const statusIds = { word: 'devWordStatus', wps: 'devWpsStatus', libreoffice: 'devLibreStatus', memreduct: 'devMemreductStatus' };
    const invoke = window.__TAURI__?.core?.invoke;
    if (!invoke) return;

    document.querySelectorAll('[data-check]').forEach(btn => {
        btn.addEventListener('click', () => {
            const check = btn.dataset.check;
            const statusEl = document.getElementById(statusIds[check]);
            if (!statusEl) return;

            statusEl.textContent = '检测中...';
            statusEl.style.color = 'var(--color-muted, #888)';
            statusEl.style.fontSize = '13px';
            statusEl.style.fontWeight = 'normal';

            let promise;
            if (check === 'memreduct') {
                promise = invoke('memreduct_check_installed');
            } else {
                promise = invoke('office_check_runtime').then(r => r[check]);
            }

            promise
                .then(ok => {
                    statusEl.textContent = ok ? '✓' : '✗';
                    statusEl.style.color = ok ? '#2ecc71' : '#e74c3c';
                    statusEl.style.fontSize = '20px';
                    statusEl.style.fontWeight = 'bold';
                })
                .catch(() => {
                    statusEl.textContent = '✗';
                    statusEl.style.color = '#e74c3c';
                    statusEl.style.fontSize = '20px';
                    statusEl.style.fontWeight = 'bold';
                });
        });
    });
}
