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
};

const LAYOUT_FIELDS = ['enabled', 'layoutMode', 'columns', 'buttonMinWidth', 'buttonMaxWidth', 'buttonHeight', 'gap', 'buttonFontSize', 'buttonPadding', 'barMaxHeight'];

function loadSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = structuredClone(defaultSettings);
    }
    const s = extension_settings[EXTENSION_NAME];
    if (!s.presets) s.presets = {};
    if (!s.currentPreset) s.currentPreset = '';
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
        <div class="qrl-desc">最小宽度：按钮不会小于此值<br>最大宽度：按钮不会大于此值<br>高度：按钮的固定高度<br>可填：<code>unset</code>（不限）、<code>50px</code>、<code>auto</code>（自动）、<code>100%</code>（撑满）</div>

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
    </div>`;
    document.body.appendChild(panel);
    makeDraggable(panel);
    bindPanelEvents();
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
    if (!confirm(`确定删除预设「${name}」？`)) return;
    const s = loadSettings();
    if (s.presets) delete s.presets[name];
    if (s.currentPreset === name) s.currentPreset = '';
    saveSettingsDebounced();
    populatePresetDropdown();
    document.getElementById('qrl-preset-name').value = '';
}

function addConfirmOverlay(panel) {
    const overlay = document.createElement('div');
    overlay.id = 'qrl-confirm-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
    <div id="qrl-confirm-dialog">
        <p><strong>确定重置所有设置？</strong></p>
        <p style="font-size:11px;opacity:0.7">已保存的预设不会丢失</p>
        <div class="qrl-cfm-btns">
            <button id="qrl-cfm-yes">确定重置</button>
            <button id="qrl-cfm-no">取消</button>
        </div>
    </div>`;
    panel.appendChild(overlay);
    overlay.querySelector('#qrl-cfm-yes')?.addEventListener('click', () => {
        overlay.style.display = 'none';
        doReset();
    });
    overlay.querySelector('#qrl-cfm-no')?.addEventListener('click', () => {
        overlay.style.display = 'none';
    });
}

function showResetConfirm() {
    const overlay = document.getElementById('qrl-confirm-overlay');
    if (overlay) overlay.style.display = 'flex';
}

function doReset() {
    const s = loadSettings();
    applyLayoutToSettings(s, defaultSettings);
    loadPanelValues();
    syncGridGroup();
    saveAndApply();
}

jQuery(async () => {
    loadSettings();
    renderSettings();
    createFloatingPanel();
    applySettings();
    eventSource.on(event_types.CHAT_CHANGED, () => setTimeout(applySettings, 300));
    eventSource.on(event_types.SETTINGS_UPDATED, () => setTimeout(applySettings, 300));
});
