/**
 * 遥测模块入口
 */

import { reportOnline } from './telemetry-api.js';

/**
 * 初始化遥测模块，延迟 3 秒触发在线上报
 */
export function telemetryInit() {
    setTimeout(() => {
        reportOnline();
    }, 3000);
}

export { reportOnline };