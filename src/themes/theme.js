const ThemeManager = {
  currentTheme: null,
  currentThemeModule: null,
  userThemePath: null,
  isSettingsPage: false,

  async init(themeName = null) {
    this.isSettingsPage = window.location.pathname.includes('settings.html');
    
    if (!themeName) {
      themeName = await this.theme_fetch_saved();
    }
    
    await this.theme_update_active(themeName);
  },

  async theme_fetch_saved() {
    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core;
        const             settings = await invoke('settings_fetch_all');
        return settings?.theme || 'simplify';
      } catch (e) {
        console.warn('无法获取保存的主题设置:', e);
      }
    }
    return 'simplify';
  },

  async theme_update_active(themeName) {
    try {
      let themeModule = null;
      
      if (window.__TAURI__ && !this.theme_validate_builtin(themeName)) {
        if (!this.userThemePath) {
          const { invoke } = window.__TAURI__.core;
          try {
            this.userThemePath = await invoke('dir_fetch_theme');
          } catch (e) {
            console.warn('无法获取用户主题目录:', e);
          }
        }
        
        if (this.userThemePath) {
          const userThemeDir = `${this.userThemePath}/${themeName}`;
          const hasUserTheme = await this.theme_validate_user(userThemeDir);
          
          if (hasUserTheme) {
            themeModule = await this.theme_load_user(userThemeDir, themeName);
          }
        }
      }
      
      if (!themeModule) {
        const module = await import(`./${themeName}/theme.js`);
        themeModule = module.default;
      }
      
      this.currentThemeModule = themeModule;
      this.currentTheme = themeName;
      
      if (this.currentThemeModule.load_theme) {
        await this.currentThemeModule.load_theme(this.isSettingsPage);
      }
      this.theme_update_toolbar_text_visibility();
      this.theme_load_icons();
    } catch (error) {
      console.error(`Failed to load theme: ${themeName}`, error);
    }
  },

  theme_validate_builtin(themeName) {
    const builtInThemes = ['dark', 'simplify'];
    return builtInThemes.includes(themeName);
  },

  async theme_validate_user(themeDir) {
    if (!window.__TAURI__) return false;
    
    const { fs } = window.__TAURI__;
    try {
      const configPath = `${themeDir}/theme.json`;
      const content = await fs.readTextFile(configPath);
      return !!content;
    } catch {
      return false;
    }
  },

  async theme_load_user(themeDir, themeName) {
    const { fs, convertFileSrc } = window.__TAURI__;
    
    const configPath = `${themeDir}/theme.json`;
    const configContent = await fs.readTextFile(configPath);
    const config = JSON.parse(configContent);
    
    return {
      name: themeName,
      config: config,
      themeDir: themeDir,
      
      async load_theme() {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = convertFileSrc(`${this.themeDir}/theme.css`);
        document.head.appendChild(link);
      },
      
      fetch_icon_path(iconName) {
        const actualName = this.config?.icons?.[iconName] || iconName;
        return convertFileSrc(`${this.themeDir}/icons/${actualName}.svg`);
      },
      
      fetch_toolbar_text() {
        return this.config?.showToolbarText !== false;
      },
      
      fetch_canvas_bg_color() {
        return this.config?.canvasBgColor || '#2a2a2a';
      },
      
      fetch_aurora_effect() {
        return this.config?.showAuroraEffect !== false;
      }
    };
  },

  theme_fetch_current() {
    return this.currentTheme;
  },

  theme_fetch_toolbar_text() {
    if (this.currentThemeModule && this.currentThemeModule.fetch_toolbar_text) {
      return this.currentThemeModule.fetch_toolbar_text();
    }
    return true;
  },

  theme_fetch_canvas_bg_color() {
    if (this.currentThemeModule && this.currentThemeModule.fetch_canvas_bg_color) {
      return this.currentThemeModule.fetch_canvas_bg_color();
    }
    return '#2a2a2a';
  },

  theme_fetch_no_camera_style() {
    if (this.currentThemeModule && this.currentThemeModule.fetch_no_camera_style) {
      return this.currentThemeModule.fetch_no_camera_style();
    }
    return {
      textColor: '#ffffff',
      secondaryTextColor: 'rgba(255,255,255,0.8)',
      tertiaryTextColor: 'rgba(255,255,255,0.5)',
      textShadow: '0 1px 3px rgba(0,0,0,0.5)'
    };
  },

  theme_fetch_aurora_effect() {
    if (this.currentThemeModule && this.currentThemeModule.fetch_aurora_effect) {
      return this.currentThemeModule.fetch_aurora_effect();
    }
    return true;
  },

  theme_update_toolbar_text_visibility() {
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      if (this.theme_fetch_toolbar_text()) {
        toolbar.classList.remove('hide-text');
      } else {
        toolbar.classList.add('hide-text');
      }
    }
  },

  theme_fetch_icon_path(iconName) {
    if (this.currentThemeModule && this.currentThemeModule.fetch_icon_path) {
      return this.currentThemeModule.fetch_icon_path(iconName);
    }
    return `themes/${this.currentTheme}/icons/${iconName}.svg`;
  },

  theme_fetch_icon(iconName, options = {}) {
    const { width = 16, height = 16, alt = '', style = '' } = options;
    const src = this.theme_fetch_icon_path(iconName);
    return `<img src="${src}" width="${width}" height="${height}" alt="${alt}" style="${style}">`;
  },

  theme_load_icons() {
    const icons = document.querySelectorAll('[data-icon]');
    icons.forEach(img => {
      const iconName = img.getAttribute('data-icon');
      img.src = this.theme_fetch_icon_path(iconName);
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ThemeManager.init());
} else {
  ThemeManager.init();
}

export default ThemeManager;
