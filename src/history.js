/**
 * 撤销/重做系统 - 命令模式实现
 * 
 * 架构：
 * - Command: 命令基类，定义execute/undo/redo接口
 * - DrawCommand: 绘制命令
 * - EraseCommand: 橡皮擦命令
 * - ClearCommand: 清空命令
 * - SnapshotCommand: 快照命令（用于压缩）
 * - HistoryManager: 历史管理器，管理undo/redo栈
 */

export const MAX_HISTORY_STEPS = 50;

let history_state = {
    undo_list: [],
    redo_list: [],
    is_executing: false,
    on_state_change: null
};

export function history_init_manager(options = {}) {
    history_state.undo_list = [];
    history_state.redo_list = [];
    history_state.is_executing = false;
    history_state.on_state_change = options.on_state_change || null;
}

class Command {
    constructor(type) {
        this.type = type;
        this.timestamp = Date.now();
    }

    execute() {
        throw new Error('Command.execute() must be implemented');
    }

    undo() {
        throw new Error('Command.undo() must be implemented');
    }

    redo() {
        return this.execute();
    }

    can_compact() {
        return true;
    }
}

export class DrawCommand extends Command {
    constructor(options) {
        super('draw');
        this.stroke = options.stroke;
        this.strokeHistoryRef = options.strokeHistoryRef;
        this.redrawFn = options.redrawFn;
    }

    async execute(needRedraw = true) {
        if (!this.strokeHistoryRef.includes(this.stroke)) {
            this.strokeHistoryRef.push(this.stroke);
        }
        if (needRedraw && this.redrawFn) await this.redrawFn();
    }

    async undo() {
        const index = this.strokeHistoryRef.indexOf(this.stroke);
        if (index > -1) {
            this.strokeHistoryRef.splice(index, 1);
        }
        if (this.redrawFn) await this.redrawFn();
    }

    async redo() {
        await this.execute(true);
    }

    can_compact() {
        return true;
    }
}

export class EraseCommand extends Command {
    constructor(options) {
        super('erase');
        this.stroke = options.stroke;
        this.strokeHistoryRef = options.strokeHistoryRef;
        this.redrawFn = options.redrawFn;
    }

    async execute(needRedraw = true) {
        if (!this.strokeHistoryRef.includes(this.stroke)) {
            this.strokeHistoryRef.push(this.stroke);
        }
        if (needRedraw && this.redrawFn) await this.redrawFn();
    }

    async undo() {
        const index = this.strokeHistoryRef.indexOf(this.stroke);
        if (index > -1) {
            this.strokeHistoryRef.splice(index, 1);
        }
        if (this.redrawFn) await this.redrawFn();
    }

    async redo() {
        await this.execute();
    }

    can_compact() {
        return false;
    }
}

export class ClearCommand extends Command {
    constructor(options) {
        super('clear');
        this.savedStrokeHistory = options.savedStrokeHistory || [];
        this.savedBaseImageURL = options.savedBaseImageURL || null;
        this.strokeHistoryRef = options.strokeHistoryRef;
        this.baseImageURLRef = options.baseImageURLRef;
        this.baseImageObjRef = options.baseImageObjRef;
        this.redrawFn = options.redrawFn;
        this.loadBaseImageFn = options.loadBaseImageFn;
    }

    async execute() {
        this.strokeHistoryRef.length = 0;
        this.baseImageURLRef.value = null;
        this.baseImageObjRef.value = null;
        if (this.redrawFn) await this.redrawFn();
    }

    async undo() {
        this.strokeHistoryRef.length = 0;
        this.savedStrokeHistory.forEach(s => this.strokeHistoryRef.push(s));
        
        this.baseImageURLRef.value = this.savedBaseImageURL;
        this.baseImageObjRef.value = null;
        
        if (this.savedBaseImageURL && this.loadBaseImageFn) {
            await this.loadBaseImageFn(this.savedBaseImageURL);
        } else if (this.redrawFn) {
            await this.redrawFn();
        }
    }

    async redo() {
        await this.execute();
    }

    can_compact() {
        return false;
    }
}

export class SnapshotCommand extends Command {
    constructor(options) {
        super('snapshot');
        this.beforeImageURL = options.beforeImageURL;
        this.afterImageURL = options.afterImageURL;
        this.beforeStrokes = options.beforeStrokes || [];
        this.afterStrokes = options.afterStrokes || [];
        this.strokeHistoryRef = options.strokeHistoryRef;
        this.baseImageURLRef = options.baseImageURLRef;
        this.baseImageObjRef = options.baseImageObjRef;
        this.redrawFn = options.redrawFn;
        this.loadBaseImageFn = options.loadBaseImageFn;
    }

    async execute() {
        this.strokeHistoryRef.length = 0;
        this.afterStrokes.forEach(s => this.strokeHistoryRef.push(s));
        this.baseImageURLRef.value = this.afterImageURL;
        this.baseImageObjRef.value = null;
        if (this.afterImageURL && this.loadBaseImageFn) {
            await this.loadBaseImageFn(this.afterImageURL);
        }
        if (this.redrawFn) await this.redrawFn();
    }

    async undo() {
        this.strokeHistoryRef.length = 0;
        this.beforeStrokes.forEach(s => this.strokeHistoryRef.push(s));
        this.baseImageURLRef.value = this.beforeImageURL;
        this.baseImageObjRef.value = null;
        if (this.beforeImageURL && this.loadBaseImageFn) {
            await this.loadBaseImageFn(this.beforeImageURL);
        }
        if (this.redrawFn) await this.redrawFn();
    }

    async redo() {
        await this.execute();
    }

    can_compact() {
        return false;
    }
}

export async function history_execute_command(command, needRedraw = true) {
    if (history_state.is_executing) return;
    
    history_state.is_executing = true;
    try {
        await command.execute(needRedraw);
        history_state.undo_list.push(command);
        history_state.redo_list = [];
        
        const HARD_LIMIT = MAX_HISTORY_STEPS * 2;
        if (history_state.undo_list.length > HARD_LIMIT) {
            console.warn(`undoStack 超过硬性上限(${HARD_LIMIT}), 强制裁剪`);
            const excessCount = history_state.undo_list.length - MAX_HISTORY_STEPS;
            history_state.undo_list.splice(0, excessCount);
        }
    } finally {
        history_state.is_executing = false;
    }
    
    history_handle_state_change();
}

export function history_validate_undo() {
    return history_state.undo_list.length > 0;
}

export function history_validate_redo() {
    return history_state.redo_list.length > 0;
}

export async function history_handle_undo() {
    if (history_state.is_executing || history_state.undo_list.length === 0) return null;
    
    history_state.is_executing = true;
    let command;
    try {
        command = history_state.undo_list.pop();
        await command.undo();
        history_state.redo_list.push(command);
    } finally {
        history_state.is_executing = false;
    }
    
    history_handle_state_change();
    return command;
}

export async function history_handle_redo() {
    if (history_state.is_executing || history_state.redo_list.length === 0) return null;
    
    history_state.is_executing = true;
    let command;
    try {
        command = history_state.redo_list.pop();
        await command.redo();
        history_state.undo_list.push(command);
    } finally {
        history_state.is_executing = false;
    }
    
    history_handle_state_change();
    return command;
}

export function history_delete_all() {
    history_state.undo_list = [];
    history_state.redo_list = [];
    history_handle_state_change();
}

export function history_delete_redo_stack() {
    history_state.redo_list = [];
    history_handle_state_change();
}

export function history_fetch_undo_length() {
    return history_state.undo_list.length;
}

export function history_fetch_redo_length() {
    return history_state.redo_list.length;
}

export function history_fetch_undo_stack() {
    return history_state.undo_list;
}

export function history_fetch_redo_stack() {
    return history_state.redo_list;
}

function history_handle_state_change() {
    if (history_state.on_state_change) {
        history_state.on_state_change({
            can_undo: history_validate_undo(),
            can_redo: history_validate_redo(),
            undoCount: history_state.undo_list.length,
            redoCount: history_state.redo_list.length
        });
    }
}

export function history_validate_compact() {
    return history_state.undo_list.length > MAX_HISTORY_STEPS;
}

export function history_fetch_commands_to_compact() {
    if (history_state.undo_list.length <= MAX_HISTORY_STEPS) {
        return [];
    }
    
    const compactCount = history_state.undo_list.length - MAX_HISTORY_STEPS;
    return history_state.undo_list.slice(0, compactCount);
}

export function history_format_compact(snapshotCommand) {
    const compactCount = history_state.undo_list.length - MAX_HISTORY_STEPS;
    if (compactCount <= 0) return false;
    
    history_state.undo_list = [
        snapshotCommand,
        ...history_state.undo_list.slice(compactCount)
    ];
    
    history_handle_state_change();
    return true;
}

export { history_state };
