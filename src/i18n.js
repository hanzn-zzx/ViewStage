const i18n = {
    current_locale: 'zh-CN',
    messages: {},
    
    async init_start() {
        const saved_locale = await this.fetch_saved_locale();
        if (saved_locale) {
            this.current_locale = saved_locale;
        }
        await this.load_messages(this.current_locale);
        this.render_page_texts();
        return this;
    },
    
    async fetch_saved_locale() {
        if (window.__TAURI__) {
            try {
                const { invoke } = window.__TAURI__.core;
                const settings = await invoke('settings_fetch_all');
                return settings.language || null;
            } catch (e) {
                console.error('Failed to get saved locale:', e);
            }
        }
        return localStorage.getItem('language') || null;
    },
    
    async load_messages(locale) {
        try {
            const response = await fetch(`locales/${locale}.json`);
            if (!response.ok) {
                throw new Error(`Failed to load locale: ${locale}`);
            }
            this.messages = await response.json();
            this.current_locale = locale;
        } catch (e) {
            console.error('Failed to load messages:', e);
            if (locale !== 'zh-CN') {
                await this.load_messages('zh-CN');
            }
        }
    },
    
    format_translate(key, params = {}) {
        const keys_list = key.split('.');
        let value = this.messages;
        
        for (const key_item of keys_list) {
            if (value && typeof value === 'object' && key_item in value) {
                value = value[key_item];
            } else {
                console.warn(`Translation not found: ${key}`);
                return key;
            }
        }
        
        if (typeof value !== 'string') {
            return key;
        }
        
        return value.replace(/\{(\w+)\}/g, (match, param_key) => {
            return params[param_key] !== undefined ? params[param_key] : match;
        });
    },
    
    async update_locale(locale) {
        await this.load_messages(locale);
        this.render_page_texts();
        
        if (window.__TAURI__) {
            try {
                const { invoke } = window.__TAURI__.core;
                await invoke('settings_save_all', { settings: { language: locale } });
            } catch (e) {
                console.error('Failed to save locale:', e);
            }
        }
        localStorage.setItem('language', locale);
        
        document.documentElement.lang = locale;
    },
    
    render_page_texts() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            el.textContent = this.format_translate(key);
        });
        
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            el.placeholder = this.format_translate(key);
        });
        
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.format_translate(key);
        });
        
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria-label');
            el.setAttribute('aria-label', this.format_translate(key));
        });
    },
    
    fetch_locale() {
        return this.current_locale;
    },
    
    fetch_supported_locales() {
        return [
            { code: 'zh-CN', name: '简体中文' },
            { code: 'zh-TW', name: '繁體中文' },
            { code: 'en-US', name: 'English' }
        ];
    }
};

window.i18n = i18n;
