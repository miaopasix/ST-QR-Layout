import { eventSource, event_types, saveSettingsDebounced } from '../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXTENSION_NAME = 'qr-layout-customizer';

const defaultSettings = {
    enabled: true,
    layoutMode: 'flex',
    rows: 1,
    buttonScale: 100,
    marginY: 5,
    marginX: 5,
    buttonFontSize: 'inherit',
    barMaxHeight: 'none',
    buttonOrder: [],
    buttonStyles: {},
    buttonScriptMap: {},
    foldedButtons: null,
    foldEnabled: true,
    foldGap: 2,
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
    if (s.foldedButtons === undefined) s.foldedButtons = null;
    if (s.foldEnabled === undefined) s.foldEnabled = true;
    if (s.foldGap === undefined) s.foldGap = 2;
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
        
        syncCustomButtons();
        
        if (s.layoutMode === 'grid') {
        const buttons = document.querySelectorAll('#qrl-custom-buttons .qr--button:not(.qrl-fold-btn)');
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

let _qrObserver = null;

function syncCustomButtons() {
    const sendForm = document.getElementById('send_form');
    if (!sendForm) return;
    
    let customContainer = document.getElementById('qrl-custom-buttons');
    if (!customContainer) {
        customContainer = document.createElement('div');
        customContainer.id = 'qrl-custom-buttons';
        customContainer.className = 'qr--buttons';
        customContainer.dataset.qrlCustom = 'true';
        sendForm.appendChild(customContainer);
    }
    
    const qrBar = document.getElementById('qr--bar');
    const qrPopout = document.getElementById('qr--popout');
    if (qrBar) qrBar.style.display = 'none';
    if (qrPopout) qrPopout.style.display = 'none';
    
    collectNewButtons();
    
    if (_qrObserver) _qrObserver.disconnect();
    _qrObserver = new MutationObserver(() => {
        clearTimeout(_qrObserver._timer);
        _qrObserver._timer = setTimeout(() => {
            if (loadSettings().enabled) {
                collectNewButtons();
            }
        }, 200);
    });
    if (qrBar) _qrObserver.observe(qrBar, { childList: true, subtree: true });
    if (qrPopout) _qrObserver.observe(qrPopout, { childList: true, subtree: true });
}

function collectNewButtons() {
    const customContainer = document.getElementById('qrl-custom-buttons');
    if (!customContainer) return;
    
    const allButtons = document.querySelectorAll('#qr--bar .qr--button, #qr--popout .qr--button');
    allButtons.forEach(btn => {
        if (!btn.closest('#qrl-custom-buttons')) {
            customContainer.appendChild(btn);
        }
    });
    
    ensureFoldButton();
    applyFoldState();
    applyButtonOrder();
    applyButtonStyles();
    applyGridCols();
}

let _foldButton = null;
let _foldPopup = null;
let _foldDocHandler = null;

function ensureFoldButton() {
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    const s = loadSettings();
    
    if (!s.foldEnabled) {
        if (_foldButton) { _foldButton.remove(); _foldButton = null; }
        if (_foldPopup) { _foldPopup.remove(); _foldPopup = null; }
        return;
    }
    
    if (!_foldButton) {
        _foldButton = document.createElement('div');
        _foldButton.className = 'qr--button menu_button qrl-fold-btn';
        _foldButton.innerHTML = '<div class="qr--button-icon fa-mosaic fa-solid fa-house"></div>';
        _foldButton.title = '折叠按钮';
        _foldButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFoldPopup();
        });
    }
    
    if (!container.querySelector('.qrl-fold-btn')) {
        container.appendChild(_foldButton);
    }
    
    if (!_foldPopup) {
        _foldPopup = document.createElement('div');
        _foldPopup.id = 'qrl-fold-popup';
        _foldPopup.className = 'qrl-fold-popup';
        document.body.appendChild(_foldPopup);
        
        _foldDocHandler = null;
    }
}

function toggleFoldPopup() {
    if (!_foldPopup || !_foldButton) return;
    if (_foldPopup.classList.contains('qrl-fold-visible')) {
        closeFoldPopup();
    } else {
        openFoldPopup();
    }
}

function openFoldPopup() {
    if (!_foldPopup) return;
    while (_foldPopup.firstChild) {
        _foldPopup.removeChild(_foldPopup.firstChild);
    }
    const s = loadSettings();
    const container = document.getElementById('qrl-custom-buttons');
    if (container) {
        const foldedBtns = Array.from(container.querySelectorAll('.qr--button:not(.qrl-fold-btn)'))
            .filter(btn => s.foldedButtons && s.foldedButtons.includes(getButtonName(btn)));
        foldedBtns.forEach(btn => {
            const clone = btn.cloneNode(true);
            clone.style.display = '';
            clone.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.click();
                closeFoldPopup();
            });
            _foldPopup.appendChild(clone);
        });
    }
    
    _foldPopup.classList.add('qrl-fold-visible');
    applyFoldGap();
    requestAnimationFrame(() => {
        const rect = _foldButton.getBoundingClientRect();
        const container = document.getElementById('qrl-custom-buttons');
        const containerRect = container ? container.getBoundingClientRect() : null;
        const width = containerRect ? containerRect.width - 4 : window.innerWidth - 40;
        _foldPopup.style.width = width + 'px';
        _foldPopup.style.maxWidth = width + 'px';
        _foldPopup.style.minWidth = '80px';
        const popupRect = _foldPopup.getBoundingClientRect();
        let left = containerRect ? containerRect.right - width : rect.right - width;
        let top = rect.top - popupRect.height - 4;
        if (top < 0) top = rect.bottom + 4;
        _foldPopup.style.left = left + 'px';
        _foldPopup.style.top = top + 'px';
    });
}

function closeFoldPopup() {
    if (!_foldPopup) return;
    _foldPopup.classList.remove('qrl-fold-visible');
    setTimeout(() => {
        while (_foldPopup && _foldPopup.firstChild) {
            _foldPopup.removeChild(_foldPopup.firstChild);
        }
    }, 150);
}

function applyFoldState() {
    const s = loadSettings();
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    
    if (s.foldedButtons === null) {
        const allBtns = Array.from(container.querySelectorAll('.qr--button:not(.qrl-fold-btn)'));
        s.foldedButtons = allBtns.map(getButtonName).filter(n => n);
    }
    
    container.querySelectorAll('.qr--button:not(.qrl-fold-btn)').forEach(btn => {
        const name = getButtonName(btn);
        const shouldBeFolded = s.foldEnabled && s.foldedButtons && s.foldedButtons.includes(name);
        btn.style.display = shouldBeFolded ? 'none' : '';
    });
    
    if (_foldButton && s.foldEnabled) {
        _foldButton.style.setProperty('transform', `scale(${s.buttonScale / 100 * 1.3})`, 'important');
        _foldButton.style.setProperty('font-size', s.buttonFontSize, 'important');
    }
}

function renderFoldList() {
    const s = loadSettings();
    const listContainer = document.getElementById('qrl-fold-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    const allButtons = Array.from(document.querySelectorAll('#qrl-custom-buttons .qr--button:not(.qrl-fold-btn)'));
    const allNames = allButtons.map(getButtonName).filter(n => n);
    const uniqueNames = [...new Set(allNames)];
    
    if (uniqueNames.length === 0) {
        listContainer.innerHTML = '<div class="qrl-desc">未检测到按钮，请先启用自定义布局</div>';
        return;
    }
    
    uniqueNames.forEach(name => {
        const isFolded = s.foldedButtons && s.foldedButtons.includes(name);
        const label = document.createElement('label');
        label.className = 'checkbox_label qrl-fold-item';
        label.innerHTML = `<input type="checkbox" ${isFolded ? 'checked' : ''}> <span>${name}</span>`;
        const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', () => {
            if (!s.foldedButtons) s.foldedButtons = [];
            if (checkbox.checked && !s.foldedButtons.includes(name)) {
                s.foldedButtons.push(name);
            } else if (!checkbox.checked) {
                s.foldedButtons = s.foldedButtons.filter(n => n !== name);
            }
            applyFoldState();
            applyButtonStyles();
            saveSettingsDebounced();
        });
        listContainer.appendChild(label);
    });
}

function applyGridCols() {
    const s = loadSettings();
    if (s.enabled && s.layoutMode === 'grid') {
        const buttons = document.querySelectorAll('#qrl-custom-buttons .qr--button');
        const totalButtons = buttons.length;
        if (totalButtons > 0) {
            const rows = Math.min(Math.max(1, s.rows), totalButtons);
            const cols = Math.ceil(totalButtons / rows);
            document.documentElement.style.setProperty('--qrl-cols', String(cols));
        }
    }
}

function removeCustomContainer() {
    if (_qrObserver) {
        _qrObserver.disconnect();
        _qrObserver = null;
    }
    
    const customContainer = document.getElementById('qrl-custom-buttons');
    if (customContainer) {
        customContainer.querySelectorAll('.qr--button').forEach(btn => {
            btn.style.removeProperty('display');
        });
        customContainer.remove();
    }
    
    if (_foldButton) { _foldButton.remove(); _foldButton = null; }
    if (_foldPopup) { _foldPopup.remove(); _foldPopup = null; }
    
    const qrBar = document.getElementById('qr--bar');
    if (qrBar) qrBar.style.removeProperty('display');
    const qrPopout = document.getElementById('qr--popout');
    if (qrPopout) qrPopout.style.removeProperty('display');
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
    
    const allButtons = Array.from(container.querySelectorAll('.qr--button:not(.qrl-fold-btn)'));
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
    
    const foldBtn = container.querySelector('.qrl-fold-btn');
    if (foldBtn) container.insertBefore(foldBtn, container.firstChild);
}

function applyButtonStyles() {
    const s = loadSettings();
    if (!s.enabled) return;
    
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    
    container.querySelectorAll('.qr--button').forEach(btn => {
        if (btn.classList.contains('qrl-fold-btn')) return;
        const name = getButtonName(btn);
        const st = s.buttonStyles ? s.buttonStyles[name] : null;
        if (st && st.fontSize && st.fontSize > 0) {
            btn.style.setProperty('font-size', `${st.fontSize}px`, 'important');
        } else if (s.buttonFontSize && s.buttonFontSize !== 'inherit') {
            btn.style.setProperty('font-size', s.buttonFontSize, 'important');
        } else {
            btn.style.removeProperty('font-size');
        }
        if (st) {
            if (st.color) btn.style.setProperty('color', st.color, 'important');
            else btn.style.removeProperty('color');
            if (st.bold) btn.style.setProperty('font-weight', 'bold', 'important');
            else btn.style.removeProperty('font-weight');
        } else {
            btn.style.removeProperty('color');
            btn.style.removeProperty('font-weight');
        }
    });
    
    if (_foldButton && s.foldEnabled) {
        _foldButton.style.setProperty('transform', `scale(${s.buttonScale / 100 * 1.3})`, 'important');
        _foldButton.style.setProperty('font-size', s.buttonFontSize, 'important');
    }
}

function applySingleButtonStyle(name) {
    const s = loadSettings();
    if (!s.enabled) return;
    const st = s.buttonStyles ? s.buttonStyles[name] : null;
    const allBtns = document.querySelectorAll('#qrl-custom-buttons .qr--button');
    allBtns.forEach(btn => {
        if (getButtonName(btn) !== name) return;
        if (st) {
            if (st.color) btn.style.setProperty('color', st.color, 'important');
            else btn.style.removeProperty('color');
            if (st.fontSize && st.fontSize > 0) {
                btn.style.setProperty('font-size', `${st.fontSize}px`, 'important');
            } else if (s.buttonFontSize && s.buttonFontSize !== 'inherit') {
                btn.style.setProperty('font-size', s.buttonFontSize, 'important');
            } else {
                btn.style.removeProperty('font-size');
            }
            if (st.bold) btn.style.setProperty('font-weight', 'bold', 'important');
            else btn.style.removeProperty('font-weight');
        }
    });
    refreshFoldPopupClones();
}

function refreshFoldPopupClones() {
    if (!_foldPopup || !_foldPopup.classList.contains('qrl-fold-visible')) return;
    const s = loadSettings();
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    const foldedBtns = Array.from(container.querySelectorAll('.qr--button:not(.qrl-fold-btn)'))
        .filter(btn => s.foldedButtons && s.foldedButtons.includes(getButtonName(btn)));
    Array.from(_foldPopup.children).forEach(child => {
        const name = child.textContent || child.title || '';
        const original = foldedBtns.find(b => getButtonName(b) === name);
        if (!original) return;
        const st = s.buttonStyles ? s.buttonStyles[name] : null;
        if (st) {
            if (st.color) child.style.color = st.color;
            else child.style.color = '';
            if (st.fontSize && st.fontSize > 0) child.style.fontSize = `${st.fontSize}px`;
            else if (s.buttonFontSize && s.buttonFontSize !== 'inherit') child.style.fontSize = s.buttonFontSize;
            else child.style.fontSize = '';
            child.style.fontWeight = st.bold ? 'bold' : '';
        } else {
            child.style.color = '';
            child.style.fontSize = '';
            child.style.fontWeight = '';
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
    s.foldedButtons = [];
    s.foldEnabled = true;
    s.foldGap = 2;
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
            <select id="qrl-presets" class="qrl-input-quarter"><option value="">— 选择 —</option></select>
            <button class="qrl-hdr-btn" id="qrl-preset-save">保存</button>
            <div class="qrl-spacer"></div>
            <button class="qrl-hdr-btn qrl-close-btn" id="qrl-panel-close">✕</button>
        </div>
        <div class="qrl-hdr-row">
            <span class="qrl-label">预设名称:</span>
            <input type="text" id="qrl-preset-name" class="text_pole qrl-input-quarter" placeholder="输入名称">
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
        <div class="qrl-warn">⚠ 取消勾选/关闭脚本按钮时，需要刷新网页才生效</div>

        <hr>

        <div class="qrl-section-label">排列方式</div>
        <label>
            布局模式:
            <select id="qrl-layout-mode" class="text_pole qrl-input-third">
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

        <label>整体文字大小: <input type="text" id="qrl-btn-font-size" class="text_pole qrl-input-sm" placeholder="例: inherit"></label>
        <div class="qrl-desc">如 <code>inherit</code>（跟随主题）、<code>12px</code>、<code>0.9em</code>（主题的90%）</div>

        <hr>

        <label>QR栏高度: <input type="text" id="qrl-bar-max-height" class="text_pole qrl-input-sm" placeholder="例: none"></label>
        <div class="qrl-desc">超出时滚动，填 <code>none</code>（不限）或 <code>200px</code></div>

        <hr>

        <label class="checkbox_label">
            <input type="checkbox" id="qrl-fold-enabled" checked>
            <span>启用折叠按钮</span>
        </label>
        <div class="qrl-collapsible">
            <div class="qrl-collapsible-header" id="qrl-fold-toggle">
                <span>折叠按钮设置</span>
                <span class="qrl-collapse-icon">▼</span>
            </div>
            <div class="qrl-collapsible-content" id="qrl-fold-content">
                <div class="qrl-desc">勾选的按钮将折叠到弹窗列表中，取消勾选放回QR栏</div>
                <label>折叠按钮间距:
                    <span class="qrl-range-val" id="qrl-fold-gap-value">2</span>px
                    <input type="range" id="qrl-fold-gap" min="0" max="20" value="2" class="range_slider">
                    <button class="qrl-slider-reset" data-target="qrl-fold-gap" data-default="2">重置</button>
                </label>
                <div class="qrl-desc">弹窗内按钮之间的间距</div>
                <button class="qrl-refresh-btn" id="qrl-fold-refresh">捕获并折叠全部按钮</button>
                <div id="qrl-fold-list"></div>
            </div>
        </div>

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
    let dragging = false, ox, oy, pendingFrame = null;
    header.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
        e.preventDefault();
        dragging = true;
        ox = e.clientX - panel.offsetLeft;
        oy = e.clientY - panel.offsetTop;
        panel.style.right = 'auto';
        panel.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        if (pendingFrame) return;
        const x = e.clientX - ox;
        const y = e.clientY - oy;
        pendingFrame = requestAnimationFrame(() => {
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
            pendingFrame = null;
        });
    });
    document.addEventListener('mouseup', () => {
        dragging = false;
        panel.style.userSelect = '';
    });
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
        renderFoldList();
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
    $('qrl-fold-enabled')?.addEventListener('change', function () {
        loadSettings().foldEnabled = this.checked;
        if (!this.checked) {
            loadSettings().foldedButtons = [];
        }
        saveAndApply();
        renderFoldList();
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
    $('qrl-fold-gap')?.addEventListener('input', function () {
        $('qrl-fold-gap-value').textContent = this.value;
        loadSettings().foldGap = Number(this.value);
        applyFoldGap();
        saveSettingsDebounced();
    });
    $('qrl-fold-refresh')?.addEventListener('click', () => {
        const s = loadSettings();
        s.foldedButtons = Array.from(document.querySelectorAll('#qrl-custom-buttons .qr--button:not(.qrl-fold-btn)'))
            .map(getButtonName).filter(n => n);
        applyFoldState();
        renderFoldList();
        saveSettingsDebounced();
    });
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
    const foldToggle = document.getElementById('qrl-fold-toggle');
    const foldContent = document.getElementById('qrl-fold-content');
    if (foldToggle && foldContent) {
        foldToggle.addEventListener('click', () => {
            const isHidden = foldContent.style.display === 'none' || !foldContent.style.display;
            foldContent.style.display = isHidden ? 'block' : 'none';
            foldToggle.querySelector('.qrl-collapse-icon').textContent = isHidden ? '▲' : '▼';
            if (isHidden) renderFoldList();
        });
    }
}

function applyFoldGap() {
    const s = loadSettings();
    const popup = document.getElementById('qrl-fold-popup');
    if (popup) {
        popup.style.gap = s.foldGap + 'px';
    }
}

function refreshButtonList() {
    const s = loadSettings();
    const buttons = Array.from(document.querySelectorAll('#qrl-custom-buttons .qr--button, #qr--bar .qr--button, #qr--popout .qr--button'));
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
    
    const foldedNames = (s.foldEnabled && s.foldedButtons) ? s.foldedButtons : [];
    const unfolded = [];
    const folded = [];
    s.buttonOrder.forEach(name => {
        if (foldedNames.includes(name)) {
            folded.push(name);
        } else {
            unfolded.push(name);
        }
    });
    
    if (unfolded.length > 0) {
        const header = document.createElement('div');
        header.className = 'qrl-group-header';
        header.textContent = '未折叠（QR栏显示）';
        container.appendChild(header);
        unfolded.forEach(name => {
            const scriptName = s.buttonScriptMap ? s.buttonScriptMap[name] || 'unknown' : 'unknown';
            const item = createButtonItem(name, s.buttonStyles[name] || {}, scriptName);
            container.appendChild(item);
        });
    }
    
    if (folded.length > 0) {
        const header = document.createElement('div');
        header.className = 'qrl-group-header qrl-group-folded';
        header.textContent = '已折叠（弹窗显示）';
        container.appendChild(header);
        folded.forEach(name => {
            const scriptName = s.buttonScriptMap ? s.buttonScriptMap[name] || 'unknown' : 'unknown';
            const item = createButtonItem(name, s.buttonStyles[name] || {}, scriptName);
            container.appendChild(item);
        });
    }
    
    setupDragAndDrop(container);
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    const m = rgb.match(/(\d+)/g);
    if (!m || m.length < 3) return '#ffffff';
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function getButtonDefaultColor(name) {
    const btn = Array.from(document.querySelectorAll('#qrl-custom-buttons .qr--button, #qr--bar .qr--button, #qr--popout .qr--button'))
        .find(b => getButtonName(b) === name);
    if (btn) {
        const c = getComputedStyle(btn).color;
        return rgbToHex(c);
    }
    return '#ffffff';
}

function getButtonDefaultFontSize(name) {
    const btn = Array.from(document.querySelectorAll('#qrl-custom-buttons .qr--button, #qr--bar .qr--button, #qr--popout .qr--button'))
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
        applySingleButtonStyle(name);
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
        const allBtns = document.querySelectorAll('#qrl-custom-buttons .qr--button');
        allBtns.forEach(btn => {
            if (getButtonName(btn) !== name) return;
            btn.style.removeProperty('color');
            btn.style.removeProperty('font-size');
            btn.style.removeProperty('font-weight');
        });
        saveSettingsDebounced();
    });

    return div;
}

function setupDragAndDrop(container) {
    const items = Array.from(container.querySelectorAll('.qrl-btn-item'));
    let dragSrc = null;
    let pressTimer = null;
    
    const getGroup = (item) => {
        let el = item;
        while (el) {
            if (el.classList && el.classList.contains('qrl-group-header')) {
                return el.textContent;
            }
            el = el.previousElementSibling;
        }
        return '';
    };

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
            if (!dragSrc || dragSrc === item) return;
            if (getGroup(dragSrc) !== getGroup(item)) return;
            e.preventDefault();
            const rect = item.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            item.classList.remove('qrl-drag-before', 'qrl-drag-after');
            if (e.clientY < midpoint) {
                item.classList.add('qrl-drag-before');
            } else {
                item.classList.add('qrl-drag-after');
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
            if (dragSrc && dragSrc !== item && getGroup(dragSrc) === getGroup(item)) {
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
    $('qrl-fold-enabled').checked = s.foldEnabled !== false;
    $('qrl-fold-gap').value = s.foldGap;
    $('qrl-fold-gap-value').textContent = s.foldGap;
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
