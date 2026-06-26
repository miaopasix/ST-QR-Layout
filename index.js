import { eventSource, event_types, saveSettingsDebounced } from '../../../script.js';
import { extension_settings } from '../../extensions.js';

const EXTENSION_NAME = 'qr-layout-customizer';

const defaultSettings = {
    enabled: true,
    layoutMode: 'grid',
    columns: 4,
    buttonMinWidth: 'unset',
    buttonMaxWidth: 'unset',
    buttonHeight: 'auto',
    gap: 5,
    buttonFontSize: 'inherit',
    buttonPadding: '3px 5px',
    barMaxHeight: 'none',
    buttonOrder: [],
    buttonStyles: {},
};

const LAYOUT_FIELDS = ['enabled', 'layoutMode', 'columns', 'buttonMinWidth', 'buttonMaxWidth', 'buttonHeight', 'gap', 'buttonFontSize', 'buttonPadding', 'barMaxHeight'];

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
        root.style.setProperty('--qrl-columns', String(s.columns));
        root.style.setProperty('--qrl-btn-min-width', s.buttonMinWidth);
        root.style.setProperty('--qrl-btn-max-width', s.buttonMaxWidth);
        root.style.setProperty('--qrl-btn-height', s.buttonHeight);
        root.style.setProperty('--qrl-btn-font-size', s.buttonFontSize);
        root.style.setProperty('--qrl-btn-padding', s.buttonPadding);
        root.style.setProperty('--qrl-gap', s.gap + 'px');
        root.style.setProperty('--qrl-bar-max-height', s.barMaxHeight);
    } else {
        document.body.classList.remove('qrl-active', 'qrl-grid', 'qrl-flex');
    }
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
    if (!s.buttonOrder || s.buttonOrder.length < 2) return;
    const containers = new Map();
    document.querySelectorAll('#qr--bar .qr--button').forEach(btn => {
        const parent = btn.parentElement;
        if (!containers.has(parent)) containers.set(parent, []);
        containers.get(parent).push(btn);
    });
    containers.forEach((buttons, container) => {
        if (buttons.length < 2) return;
        buttons.sort((a, b) => {
            const aIdx = s.buttonOrder.indexOf(getButtonName(a));
            const bIdx = s.buttonOrder.indexOf(getButtonName(b));
            if (aIdx === -1 && bIdx === -1) return 0;
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });
        buttons.forEach(btn => container.appendChild(btn));
    });
}

function applyButtonStyles() {
    const s = loadSettings();
    if (!s.buttonStyles) return;
    document.querySelectorAll('#qr--bar .qr--button').forEach(btn => {
        const name = getButtonName(btn);
        const st = s.buttonStyles[name];
        if (st) {
            if (st.color) btn.style.setProperty('color', st.color, 'important');
            else btn.style.removeProperty('color');
            if (st.strokeWidth > 0 && st.strokeColor) {
                btn.style.setProperty('-webkit-text-stroke', `${st.strokeWidth}px ${st.strokeColor}`, 'important');
            } else {
                btn.style.removeProperty('-webkit-text-stroke');
            }
            if (st.bold) btn.style.setProperty('font-weight', 'bold', 'important');
            else btn.style.removeProperty('font-weight');
        } else {
            btn.style.removeProperty('color');
            btn.style.removeProperty('-webkit-text-stroke');
            btn.style.removeProperty('font-weight');
        }
    });
}

function applyButtonCustomizations() {
    applyButtonOrder();
    applyButtonStyles();
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
                <option value="grid">CSS 网格</option>
                <option value="flex">弹性换行</option>
            </select>
        </label>
        <div class="qrl-desc">网格：按钮按列整齐排列<br>弹性：按钮按自身宽度自然换行</div>
        <div id="qrl-columns-group">
            <label>列数:
                <span class="qrl-range-val" id="qrl-columns-value">4</span>
                <input type="range" id="qrl-columns" min="1" max="8" class="range_slider">
            </label>
            <div class="qrl-desc">仅网格模式生效，每行按钮数（1-8列）</div>
        </div>

        <hr>

        <div class="qrl-section-label">按钮尺寸</div>
        <label>最小宽度: <input type="text" id="qrl-btn-min-width" class="text_pole" placeholder="例: unset"></label>
        <label>最大宽度: <input type="text" id="qrl-btn-max-width" class="text_pole" placeholder="例: unset"></label>
        <label>高度: <input type="text" id="qrl-btn-height" class="text_pole" placeholder="例: auto"></label>
        <div class="qrl-desc">可填：<code>unset</code>（不限）、<code>50px</code>、<code>auto</code>（自动）、<code>100%</code>（撑满）</div>

        <hr>

        <div class="qrl-section-label">边距</div>
        <label>内边距: <input type="text" id="qrl-btn-padding" class="text_pole" placeholder="例: 3px 5px"></label>
        <div class="qrl-desc">按钮内部留白<br>如 <code>3px 5px</code> 表示上下3px左右5px<br>如 <code>4px</code> 表示四边统一</div>
        <label>间距:
            <span class="qrl-range-val" id="qrl-gap-value">5</span>px
            <input type="range" id="qrl-gap" min="0" max="30" class="range_slider">
        </label>
        <div class="qrl-desc">按钮之间的间距，数值越大间隔越远</div>

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
                <div class="qrl-desc">长按拖动按钮可互换位置<br>修改颜色/描边/加粗后即时生效</div>
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
        loadSettings().columns = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });
    $('qrl-gap')?.addEventListener('input', function () {
        $('qrl-gap-value').textContent = this.value;
        loadSettings().gap = Number(this.value);
        applySettings();
        saveSettingsDebounced();
    });

    const fieldMap = {
        'qrl-btn-min-width': 'buttonMinWidth',
        'qrl-btn-max-width': 'buttonMaxWidth',
        'qrl-btn-height': 'buttonHeight',
        'qrl-btn-padding': 'buttonPadding',
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
    const buttons = Array.from(document.querySelectorAll('#qr--bar .qr--button'));
    const names = buttons.map(getButtonName).filter(n => n);
    const unique = [...new Set(names)];
    if (!s.buttonOrder || s.buttonOrder.length === 0) {
        s.buttonOrder = unique.slice();
    }
    unique.forEach(n => {
        if (!s.buttonOrder.includes(n)) s.buttonOrder.push(n);
    });
    s.buttonOrder = s.buttonOrder.filter(n => unique.includes(n));
    if (!s.buttonStyles) s.buttonStyles = {};
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
        const item = createButtonItem(name, s.buttonStyles[name] || {});
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
    const btn = Array.from(document.querySelectorAll('#qr--bar .qr--button'))
        .find(b => getButtonName(b) === name);
    if (btn) {
        const c = getComputedStyle(btn).color;
        return rgbToHex(c);
    }
    return '#ffffff';
}

function createButtonItem(name, style) {
    const s = loadSettings();
    const div = document.createElement('div');
    div.className = 'qrl-btn-item';
    div.dataset.name = name;
    const defaultColor = style.color || getButtonDefaultColor(name);
    div.innerHTML = `
        <span class="qrl-drag-handle">☰</span>
        <span class="qrl-btn-name" title="${name}">${name}</span>
        <div class="qrl-btn-controls">
            <span>字色</span><input type="color" class="qrl-clr-font" value="${defaultColor}">
            <span>描边</span><input type="color" class="qrl-clr-stroke" value="${style.strokeColor || '#000000'}">
            <span>宽</span><input type="number" class="qrl-stroke-w" min="0" max="5" value="${style.strokeWidth || 0}">px
            <label><input type="checkbox" class="qrl-bold" ${style.bold ? 'checked' : ''}>粗</label>
        </div>
        <button class="qrl-clear-btn">清除</button>
    `;

    const fontInput = div.querySelector('.qrl-clr-font');
    const strokeInput = div.querySelector('.qrl-clr-stroke');
    const widthInput = div.querySelector('.qrl-stroke-w');
    const boldInput = div.querySelector('.qrl-bold');
    const clearBtn = div.querySelector('.qrl-clear-btn');

    const updateStyle = () => {
        if (!s.buttonStyles) s.buttonStyles = {};
        s.buttonStyles[name] = {
            color: fontInput.value,
            strokeColor: strokeInput.value,
            strokeWidth: Number(widthInput.value),
            bold: boldInput.checked
        };
        applyButtonStyles();
        saveSettingsDebounced();
    };

    fontInput.addEventListener('change', updateStyle);
    strokeInput.addEventListener('change', updateStyle);
    widthInput.addEventListener('change', updateStyle);
    boldInput.addEventListener('change', updateStyle);

    clearBtn.addEventListener('click', () => {
        if (s.buttonStyles) delete s.buttonStyles[name];
        applyButtonStyles();
        saveSettingsDebounced();
        renderButtonList();
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
                item.classList.add('qrl-drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('qrl-drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('qrl-drag-over');
            if (dragSrc && dragSrc !== item) {
                swapListItems(dragSrc, item);
            }
            dragSrc = null;
        });
    });
}

function swapListItems(itemA, itemB) {
    const s = loadSettings();
    const nameA = itemA.dataset.name;
    const nameB = itemB.dataset.name;
    const idxA = s.buttonOrder.indexOf(nameA);
    const idxB = s.buttonOrder.indexOf(nameB);
    if (idxA >= 0 && idxB >= 0) {
        [s.buttonOrder[idxA], s.buttonOrder[idxB]] = [s.buttonOrder[idxB], s.buttonOrder[idxA]];
    }
    renderButtonList();
    applyButtonOrder();
    saveSettingsDebounced();
}

function loadPanelValues() {
    const s = loadSettings();
    const $ = (id) => document.getElementById(id);
    $('qrl-enabled').checked = s.enabled;
    $('qrl-layout-mode').value = s.layoutMode;
    $('qrl-columns').value = s.columns;
    $('qrl-columns-value').textContent = s.columns;
    $('qrl-btn-min-width').value = s.buttonMinWidth;
    $('qrl-btn-max-width').value = s.buttonMaxWidth;
    $('qrl-btn-height').value = s.buttonHeight;
    $('qrl-gap').value = s.gap;
    $('qrl-gap-value').textContent = s.gap;
    $('qrl-btn-font-size').value = s.buttonFontSize;
    $('qrl-btn-padding').value = s.buttonPadding;
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
    const s = loadSettings();
    applyLayoutToSettings(s, defaultSettings);
    s.buttonOrder = [];
    s.buttonStyles = {};
    loadPanelValues();
    syncGridGroup();
    applyButtonCustomizations();
    saveAndApply();
    renderButtonList();
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
