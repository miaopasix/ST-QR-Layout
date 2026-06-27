import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXTENSION_NAME = 'qr-layout-customizer';

const defaultSettings = {
    enabled: true,
    layoutMode: 'grid',
    rows: 1,
    buttonScale: 100,
    marginY: 5,
    marginX: 5,
    buttonFontSize: 'inherit',
    barMaxHeight: 'none',
    buttonOrder: [],
    buttonStyles: {},
    buttonScriptMap: {},
};

const LAYOUT_FIELDS = ['enabled', 'layoutMode', 'rows', 'buttonScale', 'marginY', 'marginX', 'buttonFontSize', 'barMaxHeight'];

let _confirmCallback = null;

function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = structuredClone(defaultSettings);
    }
    const s = extension_settings[EXTENSION_NAME];
    if (!s.presets) s.presets = {};
    if (!s.currentPreset) s.currentPreset = '';
    if (!s.buttonOrder) s.buttonOrder = [];
    if (!s.buttonStyles) s.buttonStyles = {};
    if (!s.buttonScriptMap) s.buttonScriptMap = {};
    return s;
}

function getLayoutSnapshot(s) {
    const out = {};
    for (const f of LAYOUT_FIELDS) out[f] = s[f];
    return out;
}

function applyLayoutToSettings(s, data) {
    for (const f of LAYOUT_FIELDS) {
        if (data[f] !== undefined) s[f] = data[f];
    }
}

function applySettings() {
    const s = loadSettings();
    const root = document.documentElement;
    if (s.enabled) {
        document.body.classList.add('qrl-active');
        document.body.classList.remove('qrl-grid', 'qrl-flex');
        document.body.classList.add('qrl-' + s.layoutMode);
        
        createCustomContainer();
        
        if (s.layoutMode === 'grid') {
            const buttons = document.querySelectorAll('#qrl-custom-buttons .qr--button');
            const totalButtons = buttons.length;
            if (totalButtons > 0) {
                const rows = Math.min(Math.max(1, s.rows), totalButtons);
                const cols = Math.ceil(totalButtons / rows);
                root.style.setProperty('--qrl-cols', String(cols));
            } else {
                root.style.setProperty('--qrl-cols', '1');
            }
        }
        
        root.style.setProperty('--qrl-rows', String(s.rows));
        root.style.setProperty('--qrl-btn-scale', (s.buttonScale / 100).toString());
        root.style.setProperty('--qrl-btn-font-size', s.buttonFontSize);
        root.style.setProperty('--qrl-margin-y', s.marginY + 'px');
        root.style.setProperty('--qrl-margin-x', s.marginX + 'px');
        root.style.setProperty('--qrl-bar-max-height', s.barMaxHeight);
        applyButtonOrder();
        applyButtonStyles();
    } else {
        document.body.classList.remove('qrl-active', 'qrl-grid', 'qrl-flex');
        root.style.removeProperty('--qrl-rows');
        root.style.removeProperty('--qrl-cols');
        root.style.removeProperty('--qrl-btn-scale');
        root.style.removeProperty('--qrl-btn-font-size');
        root.style.removeProperty('--qrl-margin-y');
        root.style.removeProperty('--qrl-margin-x');
        root.style.removeProperty('--qrl-bar-max-height');
        removeCustomContainer();
    }
}

function getQrRoot() {
    return document.getElementById('qr--popout') || document.getElementById('qr--bar');
}

function createCustomContainer() {
    const root = getQrRoot();
    if (!root) return;
    
    document.querySelectorAll('#qrl-custom-buttons').forEach(container => {
        if (!root.contains(container)) container.remove();
    });
    
    let customContainer = root.querySelector('#qrl-custom-buttons');
    const sourceButtons = Array.from(root.querySelectorAll('.qr--button'))
        .filter(btn => !btn.closest('#qrl-custom-buttons'));
    
    if (!customContainer && sourceButtons.length === 0) {
        return;
    }
    
    if (!customContainer) {
        customContainer = document.createElement('div');
        customContainer.id = 'qrl-custom-buttons';
        customContainer.className = 'qr--buttons';
        customContainer.dataset.qrlCustom = 'true';
        const firstContainer = root.querySelector('.qr--buttons');
        if (firstContainer) {
            firstContainer.insertAdjacentElement('beforebegin', customContainer);
        } else {
            root.appendChild(customContainer);
        }
    }
    
    if (sourceButtons.length > 0) {
        root.querySelectorAll('.qr--buttons:not(#qrl-custom-buttons)').forEach(container => {
            container.style.display = 'none';
        });
        
        sourceButtons.forEach(btn => {
            btn.style.removeProperty('display');
            customContainer.appendChild(btn);
        });
    }
}

function removeCustomContainer() {
    document.querySelectorAll('#qrl-custom-buttons').forEach(customContainer => {
        const root = customContainer.closest('#qr--popout, #qr--bar');
        const buttons = Array.from(customContainer.querySelectorAll('.qr--button'));
        buttons.forEach(btn => {
            btn.style.removeProperty('color');
            btn.style.removeProperty('font-size');
            btn.style.removeProperty('font-weight');
            btn.style.removeProperty('transform');
        });
        
        if (root) {
            const originalContainers = root.querySelectorAll('.qr--buttons:not(#qrl-custom-buttons)');
            originalContainers.forEach(c => {
                c.style.removeProperty('display');
            });
        }
        
        customContainer.remove();
    });
}

function saveAndApply() {
    applySettings();
    saveSettingsDebounced();
}

function getButtonName(btn) {
    return btn.title?.trim() || btn.textContent.trim() || '';
}

function applyButtonOrder() {
    const s = loadSettings();
    if (!s.enabled) return;
    if (!s.buttonOrder || s.buttonOrder.length < 2) return;
    
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    
    const allButtons = Array.from(container.querySelectorAll('.qr--button'));
    if (allButtons.length < 2) return;
    
    allButtons.sort((a, b) => {
        const aIdx = s.buttonOrder.indexOf(getButtonName(a));
        const bIdx = s.buttonOrder.indexOf(getButtonName(b));
        if (aIdx === -1 && bIdx === -1) return 0;
        if (aIdx === -1) return 1;
        if (bIdx === -1) return -1;
        return aIdx - bIdx;
    });
    allButtons.forEach(btn => container.appendChild(btn));
}

function applyButtonStyles() {
    const s = loadSettings();
    if (!s.enabled) return;
    if (!s.buttonStyles) return;
    
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    
    container.querySelectorAll('.qr--button').forEach(btn => {
        const name = getButtonName(btn);
        const st = s.buttonStyles[name];
        if (st) {
            if (st.color) btn.style.setProperty('color', st.color, 'important');
            else btn.style.removeProperty('color');
            if (st.fontSize && st.fontSize > 0) {
                btn.style.setProperty('font-size', `${st.fontSize}px`, 'important');
            } else {
                btn.style.removeProperty('font-size');
            }
            if (st.bold) btn.style.setProperty('font-weight', 'bold', 'important');
            else btn.style.removeProperty('font-weight');
        } else {
            btn.style.removeProperty('color');
            btn.style.removeProperty('font-size');
            btn.style.removeProperty('font-weight');
        }
    });
}

function applyButtonCustomizations() {
    applyButtonOrder();
    applyButtonStyles();
}

function resetButtonStyles() {
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    container.querySelectorAll('.qr--button').forEach(btn => {
        btn.style.removeProperty('color');
        btn.style.removeProperty('font-size');
        btn.style.removeProperty('font-weight');
        btn.style.removeProperty('transform');
    });
}

function fullReset() {
    const s = loadSettings();
    applyLayoutToSettings(s, defaultSettings);
    s.enabled = defaultSettings.enabled;
    s.buttonOrder = [];
    s.buttonStyles = {};
    s.buttonScriptMap = {};
    applySettings();
    loadPanelValues();
    syncGridGroup();
    saveSettingsDebounced();
    renderButtonList();
}

function renderSettings() {
    const container = document.querySelector('#extensions_settings2');
    if (!container) return;
    const frag = document.createRange().createContextualFragment(`
    <div id="qrl-container" class="extension_container">
        <div id="qrl-settings" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>QR 布局</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div style="padding:8px 8px 4px">
                    <button id="qrl-open-panel" class="menu_button">打开设置面板</button>
                </div>
                <div style="padding:0 8px 8px">
                    <button id="qrl-reset-panel-pos" class="menu_button">悬浮窗找不到了？点我！</button>
                </div>
            </div>
        </div>
    </div>`);
    container.appendChild(frag);
    document.getElementById('qrl-open-panel')?.addEventListener('click', () => togglePanel(true));
    document.getElementById('qrl-reset-panel-pos')?.addEventListener('click', resetPanelPosition);
}

function resetPanelPosition() {
    const panel = document.getElementById('qrl-panel');
    if (!panel) return;
    togglePanel(true);
    requestAnimationFrame(() => {
        const w = panel.offsetWidth;
        const h = panel.offsetHeight;
        panel.style.left = Math.max(0, (window.innerWidth - w) / 2) + 'px';
        panel.style.top = Math.max(0, (window.innerHeight - h) / 2) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });
}

function createFloatingPanel() {
    const panel = document.createElement('div');
    panel.id = 'qrl-panel';
    panel.innerHTML = `
    <div id="qrl-panel-header">
        <div class="qrl-hdr-row">
            <span class="qrl-label">当前预设:</span>
            <select id="qrl-presets"><option value="">— 选择 —</option></select>
            <button class="qrl-hdr-btn" id="qrl-preset-save">保存</button>
            <div class="qrl-spacer"></div>
            <button class="qrl-hdr-btn qrl-close-btn" id="qrl-panel-close">✕</button>
        </div>
        <div class="qrl-hdr-row">
            <span class="qrl-label">预设名称:</span>
            <input type="text" id="qrl-preset-name" class="text_pole" placeholder="输入名称">
            <button class="qrl-hdr-btn" id="qrl-preset-del">删除</button>
            <div class="qrl-spacer"></div>
            <button class="qrl-hdr-btn" id="qrl-reset-btn">重置</button>
        </div>
    </div>
    <div id="qrl-panel-body">
        <label class="checkbox_label">
            <input type="checkbox" id="qrl-enabled">
            <span>启用布局自定义</span>
        </label>
        <div class="qrl-desc">勾选后以下设置生效，取消则恢复默认样式</div>

        <hr>

        <div class="qrl-section-label">排列方式</div>
        <label>
            布局模式:
            <select id="qrl-layout-mode" class="text_pole">
                <option value="grid">行数</option>
                <option value="flex">弹性换行</option>
            </select>
        </label>
        <div class="qrl-desc">行数：按指定行数自动分配按钮<br>弹性：按钮按自身宽度自然换行</div>
        <div id="qrl-columns-group">
            <label>行数:
                <span class="qrl-range-val" id="qrl-columns-value">1</span>
                <input type="range" id="qrl-columns" min="1" max="5" class="range_slider">
                <button class="qrl-slider-reset" data-target="qrl-columns" data-default="1">重置</button>
            </label>
            <div class="qrl-desc">按钮自动分配到指定行数（1-5行）</div>
        </div>

        <hr>

        <div class="qrl-section-label">按钮尺寸</div>
        <label>大小:
            <span class="qrl-range-val" id="qrl-btn-scale-value">100</span>%
            <input type="range" id="qrl-btn-scale" min="50" max="150" value="100" class="range_slider">
            <button class="qrl-slider-reset" data-target="qrl-btn-scale" data-default="100">重置</button>
        </label>
        <div class="qrl-desc">按钮等比缩放（50%-150%），不影响字号设置</div>

        <hr>

        <div class="qrl-section-label">边距</div>
        <label>按钮上下间距:
            <span class="qrl-range-val" id="qrl-margin-y-value">5</span>px
            <input type="range" id="qrl-margin-y" min="-50" max="50" value="5" class="range_slider">
            <button class="qrl-slider-reset" data-target="qrl-margin-y" data-default="5">重置</button>
        </label>
        <div class="qrl-desc">按钮上下的间距，负值靠近，正值远离</div>
        <label>按钮左右间距:
            <span class="qrl-range-val" id="qrl-margin-x-value">5</span>px
            <input type="range" id="qrl-margin-x" min="-50" max="50" value="5" class="range_slider">
            <button class="qrl-slider-reset" data-target="qrl-margin-x" data-default="5">重置</button>
        </label>
        <div class="qrl-desc">按钮左右的间距，负值靠近，正值远离</div>

        <hr>

        <div class="qrl-section-label">文字</div>
        <label>字体大小: <input type="text" id="qrl-btn-font-size" class="text_pole" placeholder="例: inherit"></label>
        <div class="qrl-desc">如 <code>inherit</code>（跟随主题）、<code>12px</code>、<code>0.9em</code>（主题的90%）</div>

        <hr>

        <div class="qrl-section-label">容器</div>
        <label>栏最大高度: <input type="text" id="qrl-bar-max-height" class="text_pole" placeholder="例: none"></label>
        <div class="qrl-desc">快捷回复栏最大高度，超出时滚动<br>填 <code>none</code>（不限）或 <code>200px</code></div>

        <hr>

        <div class="qrl-collapsible">
            <div class="qrl-collapsible-header" id="qrl-color-toggle">
                <span>颜色位置修改</span>
                <span class="qrl-collapse-icon">▼</span>
            </div>
            <div class="qrl-collapsible-content" id="qrl-color-content">
                <div class="qrl-desc">长按拖动按钮可互换位置<br>修改颜色/字号/加粗后即时生效</div>
                <button class="qrl-refresh-btn" id="qrl-refresh-buttons">刷新按钮列表</button>
                <div id="qrl-button-list"></div>
            </div>
        </div>
    </div>`;
    document.body.appendChild(panel);
    makeDraggable(panel);
    bindPanelEvents();
    bindCollapsibleEvents();
    populatePresetDropdown();
    syncGridGroup();
    loadPanelValues();
    addConfirmOverlay(panel);
}

function makeDraggable(panel) {
    const header = document.getElementById('qrl-panel-header');
    let dragging = false, ox, oy;
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        dragging = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
        panel.style.right = 'auto';
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = (e.clientX - ox) + 'px';
        panel.style.top = (e.clientY - oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
}

function togglePanel(forceShow) {
    const panel = document.getElementById('qrl-panel');
    if (!panel) return;
    const show = forceShow !== undefined ? forceShow : !panel.classList.contains('qrl-visible');
    if (show) {
        panel.classList.add('qrl-visible');
        panel.style.display = 'block';
        loadPanelValues();
        syncGridGroup();
    } else {
        panel.classList.remove('qrl-visible');
        panel.style.display = 'none';
    }
}

function syncGridGroup() {
    const g = document.getElementById('qrl-columns-group');
    const mode = document.getElementById('qrl-layout-mode');
    if (g && mode) g.style.display = mode.value === 'grid' ? '' : 'none';
}

function bindPanelEvents() {
    const $ = (id) => document.getElementById(id);

    $('qrl-panel-close')?.addEventListener('click', () => togglePanel(false));
    $('qrl-enabled')?.addEventListener('change', function () {
        loadSettings().enabled = this.checked;
        saveAndApply();
    });
    $('qrl-layout-mode')?.addEventListener('change', function () {
        loadSettings().layoutMode = this.value;
        syncGridGroup();
        saveAndApply();
    });
    $('qrl-columns')?.addEventListener('input', function () {
        $('qrl-columns-value').textContent = this.value;
        loadSettings().rows = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });
    $('qrl-margin-y')?.addEventListener('input', function () {
        $('qrl-margin-y-value').textContent = this.value;
        loadSettings().marginY = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });
    $('qrl-margin-x')?.addEventListener('input', function () {
        $('qrl-margin-x-value').textContent = this.value;
        loadSettings().marginX = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });
    $('qrl-btn-scale')?.addEventListener('input', function () {
        $('qrl-btn-scale-value').textContent = this.value;
        loadSettings().buttonScale = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });

    const fieldMap = {
        'qrl-btn-font-size': 'buttonFontSize',
        'qrl-bar-max-height': 'barMaxHeight',
    };
    for (const [id, field] of Object.entries(fieldMap)) {
        $(id)?.addEventListener('change', function () {
            loadSettings()[field] = this.value;
            saveAndApply();
        });
    }

    $('qrl-preset-save')?.addEventListener('click', savePreset);
    $('qrl-preset-del')?.addEventListener('click', deletePreset);
    $('qrl-presets')?.addEventListener('change', function () {
        if (!this.value) return;
        loadPreset(this.value);
    });
    $('qrl-reset-btn')?.addEventListener('click', showResetConfirm);
    $('qrl-refresh-buttons')?.addEventListener('click', () => { refreshButtonList(); applyButtonCustomizations(); });
    document.querySelectorAll('.qrl-slider-reset').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            const value = btn.dataset.default;
            const input = document.getElementById(target);
            if (!input) return;
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    });
}

function bindCollapsibleEvents() {
    const toggle = document.getElementById('qrl-color-toggle');
    const content = document.getElementById('qrl-color-content');
    if (!toggle || !content) return;
    toggle.addEventListener('click', () => {
        const isHidden = content.style.display === 'none' || !content.style.display;
        content.style.display = isHidden ? 'block' : 'none';
        toggle.querySelector('.qrl-collapse-icon').textContent = isHidden ? '▲' : '▼';
        if (isHidden) refreshButtonList();
    });
}

function refreshButtonList() {
    const s = loadSettings();
    const customContainer = document.getElementById('qrl-custom-buttons');
    const buttons = customContainer 
        ? Array.from(customContainer.querySelectorAll('.qr--button'))
        : Array.from(document.querySelectorAll('#qr--bar .qr--button'));
    const buttonScriptMap = new Map();
    const containerMap = new Map();
    let scriptIndex = 0;
    
    buttons.forEach(btn => {
        const name = getButtonName(btn);
        if (!name) return;
        const parent = btn.parentElement;
        if (!containerMap.has(parent)) {
            containerMap.set(parent, `脚本${++scriptIndex}`);
        }
        const scriptName = containerMap.get(parent);
        buttonScriptMap.set(name, scriptName);
    });
    
    const names = Array.from(buttonScriptMap.keys());
    const unique = [...new Set(names)];
    if (!s.buttonOrder || s.buttonOrder.length === 0) {
        s.buttonOrder = unique.slice();
    }
    unique.forEach(n => {
        if (!s.buttonOrder.includes(n)) s.buttonOrder.push(n);
    });
    s.buttonOrder = s.buttonOrder.filter(n => unique.includes(n));
    if (!s.buttonStyles) s.buttonStyles = {};
    if (!s.buttonScriptMap) s.buttonScriptMap = {};
    buttonScriptMap.forEach((scriptName, btnName) => {
        s.buttonScriptMap[btnName] = scriptName;
    });
    renderButtonList();
}

function renderButtonList() {
    const s = loadSettings();
    const container = document.getElementById('qrl-button-list');
    if (!container) return;
    container.innerHTML = '';
    if (!s.buttonOrder || s.buttonOrder.length === 0) {
        container.innerHTML = '<div class="qrl-desc">未检测到快捷回复按钮，请先添加按钮后点击刷新</div>';
        return;
    }
    s.buttonOrder.forEach(name => {
        const scriptName = s.buttonScriptMap ? s.buttonScriptMap[name] || 'unknown' : 'unknown';
        const item = createButtonItem(name, s.buttonStyles[name] || {}, scriptName);
        container.appendChild(item);
    });
    setupDragAndDrop(container);
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    const m = rgb.match(/(\d+)/g);
    if (!m || m.length < 3) return '#ffffff';
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function getButtonDefaultColor(name) {
    const customContainer = document.getElementById('qrl-custom-buttons');
    const selector = customContainer ? '#qrl-custom-buttons .qr--button' : '#qr--bar .qr--button';
    const btn = Array.from(document.querySelectorAll(selector))
        .find(b => getButtonName(b) === name);
    if (btn) {
        const c = getComputedStyle(btn).color;
        return rgbToHex(c);
    }
    return '#ffffff';
}

function getButtonDefaultFontSize(name) {
    const customContainer = document.getElementById('qrl-custom-buttons');
    const selector = customContainer ? '#qrl-custom-buttons .qr--button' : '#qr--bar .qr--button';
    const btn = Array.from(document.querySelectorAll(selector))
        .find(b => getButtonName(b) === name);
    if (btn) {
        const size = getComputedStyle(btn).fontSize;
        return parseInt(size) || 12;
    }
    return 12;
}

function createButtonItem(name, style, scriptName = 'unknown') {
    const s = loadSettings();
    const div = document.createElement('div');
    div.className = 'qrl-btn-item';
    div.dataset.name = name;
    div.dataset.script = scriptName;
    const defaultColor = getButtonDefaultColor(name);
    const defaultFontSize = getButtonDefaultFontSize(name);
    const currentColor = style.color || defaultColor;
    const currentFontSize = (style.fontSize !== undefined && style.fontSize > 0) ? style.fontSize : defaultFontSize;
    div.innerHTML = `
        <span class="qrl-drag-handle">☰</span>
        <span class="qrl-btn-name" title="${name}">${name}</span>
        <span class="qrl-script-tag">[${scriptName}]</span>
        <div class="qrl-btn-controls">
            <span>字色</span><input type="color" class="qrl-clr-font" value="${currentColor}">
            <span>字号</span><input type="number" class="qrl-font-size" min="8" max="32" value="${currentFontSize}">px
            <label><input type="checkbox" class="qrl-bold" ${style.bold ? 'checked' : ''}>粗</label>
        </div>
        <button class="qrl-reset-btn">重置</button>
    `;

    const fontInput = div.querySelector('.qrl-clr-font');
    const fontSizeInput = div.querySelector('.qrl-font-size');
    const boldInput = div.querySelector('.qrl-bold');
    const resetBtn = div.querySelector('.qrl-reset-btn');

    const updateStyle = () => {
        if (!s.enabled) return;
        if (!s.buttonStyles) s.buttonStyles = {};
        s.buttonStyles[name] = {
            color: fontInput.value,
            fontSize: Number(fontSizeInput.value),
            bold: boldInput.checked
        };
        applyButtonStyles();
        saveSettingsDebounced();
    };

    fontInput.addEventListener('change', updateStyle);
    fontSizeInput.addEventListener('change', updateStyle);
    boldInput.addEventListener('change', updateStyle);

    resetBtn.addEventListener('click', () => {
        if (s.buttonStyles) delete s.buttonStyles[name];
        fontInput.value = defaultColor;
        fontSizeInput.value = defaultFontSize;
        boldInput.checked = false;
        if (s.enabled) {
            applyButtonStyles();
        } else {
            resetButtonStyles();
        }
        saveSettingsDebounced();
    });

    return div;
}

function setupDragAndDrop(container) {
    const items = Array.from(container.querySelectorAll('.qrl-btn-item'));
    let dragSrc = null;
    let pressTimer = null;

    items.forEach(item => {
        item.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
            item.draggable = false;
            pressTimer = setTimeout(() => {
                item.draggable = true;
            }, 400);
        });

        item.addEventListener('mouseup', () => {
            clearTimeout(pressTimer);
            setTimeout(() => { item.draggable = false; }, 50);
        });

        item.addEventListener('mouseleave', () => {
            clearTimeout(pressTimer);
        });

        item.addEventListener('dragstart', (e) => {
            dragSrc = item;
            item.classList.add('qrl-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.name);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('qrl-dragging');
            item.draggable = false;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dragSrc && dragSrc !== item) {
                const rect = item.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                item.classList.remove('qrl-drag-before', 'qrl-drag-after');
                if (e.clientY < midpoint) {
                    item.classList.add('qrl-drag-before');
                } else {
                    item.classList.add('qrl-drag-after');
                }
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('qrl-drag-before', 'qrl-drag-after');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const insertBefore = e.clientY < midpoint;
            item.classList.remove('qrl-drag-before', 'qrl-drag-after');
            if (dragSrc && dragSrc !== item) {
                insertItem(dragSrc, item, insertBefore);
            }
            dragSrc = null;
        });
    });
}

function insertItem(srcItem, targetItem, insertBefore) {
    const s = loadSettings();
    const srcName = srcItem.dataset.name;
    const targetName = targetItem.dataset.name;
    const srcIdx = s.buttonOrder.indexOf(srcName);
    const targetIdx = s.buttonOrder.indexOf(targetName);
    if (srcIdx < 0 || targetIdx < 0) return;
    
    s.buttonOrder.splice(srcIdx, 1);
    const newTargetIdx = s.buttonOrder.indexOf(targetName);
    const insertIdx = insertBefore ? newTargetIdx : newTargetIdx + 1;
    s.buttonOrder.splice(insertIdx, 0, srcName);
    
    renderButtonList();
    applyButtonOrder();
    saveSettingsDebounced();
}

function loadPanelValues() {
    const s = loadSettings();
    const $ = (id) => document.getElementById(id);
    $('qrl-enabled').checked = s.enabled;
    $('qrl-layout-mode').value = s.layoutMode;
    $('qrl-columns').value = s.rows;
    $('qrl-columns-value').textContent = s.rows;
    $('qrl-btn-scale').value = s.buttonScale;
    $('qrl-btn-scale-value').textContent = s.buttonScale;
    $('qrl-margin-y').value = s.marginY;
    $('qrl-margin-y-value').textContent = s.marginY;
    $('qrl-margin-x').value = s.marginX;
    $('qrl-margin-x-value').textContent = s.marginX;
    $('qrl-btn-font-size').value = s.buttonFontSize;
    $('qrl-bar-max-height').value = s.barMaxHeight;
    $('qrl-preset-name').value = s.currentPreset || '';
}

function populatePresetDropdown() {
    const sel = document.getElementById('qrl-presets');
    if (!sel) return;
    const s = loadSettings();
    sel.innerHTML = '<option value="">— 选择 —</option>';
    for (const name of Object.keys(s.presets || {}).sort()) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    }
    if (s.currentPreset && s.presets[s.currentPreset]) sel.value = s.currentPreset;
}

function savePreset() {
    const s = loadSettings();
    const sel = document.getElementById('qrl-presets');
    const nameInput = document.getElementById('qrl-preset-name');
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    if (!s.presets) s.presets = {};
    const selectedName = sel?.value || '';
    if (selectedName && selectedName !== name) {
        delete s.presets[selectedName];
    }
    s.presets[name] = getLayoutSnapshot(s);
    s.currentPreset = name;
    saveSettingsDebounced();
    populatePresetDropdown();
    if (sel) sel.value = name;
}

function loadPreset(name) {
    const s = loadSettings();
    if (!s.presets || !s.presets[name]) return;
    applyLayoutToSettings(s, s.presets[name]);
    s.currentPreset = name;
    loadPanelValues();
    syncGridGroup();
    saveAndApply();
}

function deletePreset() {
    const sel = document.getElementById('qrl-presets');
    if (!sel || !sel.value) return;
    const name = sel.value;
    showConfirm(`确定删除预设「${name}」？`, '该操作不可撤销', () => {
        const s = loadSettings();
        if (s.presets) delete s.presets[name];
        if (s.currentPreset === name) s.currentPreset = '';
        saveSettingsDebounced();
        populatePresetDropdown();
        document.getElementById('qrl-preset-name').value = '';
    }, '确定删除');
}

function addConfirmOverlay(panel) {
    const overlay = document.createElement('div');
    overlay.id = 'qrl-confirm-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
    <div id="qrl-confirm-dialog">
        <p><strong id="qrl-cfm-title">确定重置所有设置？</strong></p>
        <p id="qrl-cfm-sub" style="font-size:11px;opacity:0.7">已保存的预设不会丢失</p>
        <div class="qrl-cfm-btns">
            <button id="qrl-cfm-yes">确定</button>
            <button id="qrl-cfm-no">取消</button>
        </div>
    </div>`;
    panel.appendChild(overlay);
    overlay.querySelector('#qrl-cfm-yes')?.addEventListener('click', () => {
        overlay.style.display = 'none';
        if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
    });
    overlay.querySelector('#qrl-cfm-no')?.addEventListener('click', () => {
        overlay.style.display = 'none';
        _confirmCallback = null;
    });
}

function showConfirm(title, subtitle, onYes, yesText) {
    const overlay = document.getElementById('qrl-confirm-overlay');
    if (!overlay) return;
    document.getElementById('qrl-cfm-title').textContent = title;
    document.getElementById('qrl-cfm-sub').textContent = subtitle;
    document.getElementById('qrl-cfm-yes').textContent = yesText || '确定';
    _confirmCallback = onYes;
    overlay.style.display = 'flex';
}

function showResetConfirm() {
    showConfirm('确定重置所有设置？', '已保存的预设不会丢失', () => {
        doReset();
    }, '确定重置');
}

function doReset() {
    fullReset();
}

jQuery(async () => {
    loadSettings();
    renderSettings();
    createFloatingPanel();
    applySettings();
    applyButtonCustomizations();
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            applySettings();
            applyButtonCustomizations();
        }, 300);
    });
    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        setTimeout(() => {
            applySettings();
            applyButtonCustomizations();
        }, 300);
    });
});
