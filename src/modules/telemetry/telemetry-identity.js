/**
 * 设备身份管理：UUID 生成/读取、device_type 判定
 */

import { STORAGE_KEY_INSTALL_ID } from './telemetry-config.js';

/**
 * 读取或生成安装 UUID，持久化到 localStorage
 */
export function getInstallUUID() {
    try {
        let id = localStorage.getItem(STORAGE_KEY_INSTALL_ID);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(STORAGE_KEY_INSTALL_ID, id);
        }
        return id;
    } catch (e) {
        // localStorage 不可用时，返回临时 UUID
        console.warn('[telemetry] localStorage unavailable, using temp UUID');
        return crypto.randomUUID();
    }
}

/**
 * 根据 navigator.platform 返回 device_type 枚举值
 */
export function getDeviceType() {
    const platform = navigator.platform || '';
    if (platform.includes('Win')) {
        return 'windows-desktop';
    }
    if (platform.includes('Linux')) {
        return 'linux-desktop';
    }
    if (platform.includes('Mac')) {
        return 'macos-desktop';
    }
    return 'unknown-desktop';
}