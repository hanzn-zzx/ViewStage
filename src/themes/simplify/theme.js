const SimplifyTheme = {
  name: 'simplify',
  config: null,
  
  fetch_base_path() {
    const parts = window.location.pathname.split('/').filter(p => p);
    const depth = Math.max(0, parts.length - 1);
    return '../'.repeat(depth);
  },
  
  async load_theme(isSettingsPage = false) {
    const base = this.fetch_base_path();
    const response = await fetch(`${base}themes/simplify/theme.json`);
    this.config = await response.json();
    
    if (isSettingsPage) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${base}themes/simplify/settings.css`;
      document.head.appendChild(link);
    } else {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `${base}themes/simplify/theme.css`;
      document.head.appendChild(link);
    }
  },
  
  fetch_icon_path(iconName) {
    const actualName = this.config?.icons?.[iconName] || iconName;
    const base = this.fetch_base_path();
    return `${base}themes/simplify/icons/${actualName}.svg`;
  },
  
  fetch_toolbar_text() {
    return this.config?.showToolbarText !== false;
  },
  
  fetch_canvas_bg_color() {
    return this.config?.canvasBgColor || '#ffffff';
  },
  
  fetch_no_camera_style() {
    return this.config?.noCameraMessage || {
      textColor: '#1a1a1a',
      secondaryTextColor: 'rgba(0,0,0,0.6)',
      tertiaryTextColor: 'rgba(0,0,0,0.4)',
      textShadow: '0 1px 3px rgba(255,255,255,0.5)'
    };
  },

  fetch_aurora_effect() {
    return this.config?.showAuroraEffect !== false;
  }
};

export default SimplifyTheme;
