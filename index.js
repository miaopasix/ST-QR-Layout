import { eventSource, event_types, saveSettingsDebounced } from '/script.js';
import { extension_settings } from '/scripts/extensions.js';

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
    foldGapY: 2,
    foldButtonScale: 100,
    foldButtonIcon: 'fa-mosaic fa-solid fa-house',
    foldButtonColor: '',
};

const LAYOUT_FIELDS = ['enabled', 'layoutMode', 'rows', 'buttonScale', 'marginY', 'marginX', 'buttonFontSize', 'barMaxHeight'];
const PRESET_EXTRA_FIELDS = ['buttonStyles', 'buttonOrder', 'foldedButtons', 'foldEnabled', 'foldGap', 'foldGapY', 'foldButtonScale', 'foldButtonIcon', 'foldButtonColor'];


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
    if (s.foldGapY === undefined) s.foldGapY = 2;
    if (s.foldButtonScale === undefined) s.foldButtonScale = 100;
    if (s.foldButtonIcon === undefined) s.foldButtonIcon = 'fa-mosaic fa-solid fa-house';
    if (s.foldButtonColor === undefined) s.foldButtonColor = '';
    return s;
}

function getLayoutSnapshot(s) {
    const out = {};
    for (const f of LAYOUT_FIELDS) out[f] = s[f];
    for (const f of PRESET_EXTRA_FIELDS) {
        out[f] = s[f] ? JSON.parse(JSON.stringify(s[f])) : s[f];
    }
    return out;
}

function applyLayoutToSettings(s, data) {
    for (const f of LAYOUT_FIELDS) {
        if (data[f] !== undefined) s[f] = data[f];
    }
    for (const f of PRESET_EXTRA_FIELDS) {
        if (data[f] !== undefined) {
            s[f] = JSON.parse(JSON.stringify(data[f]));
        } else {
            // 旧预设没有这些字段时，重置为默认值，确保隔离
            if (f === 'buttonStyles') s[f] = {};
            else if (f === 'buttonOrder') s[f] = [];
            else if (f === 'foldedButtons') s[f] = null;
        }
    }
}

function applySettings() {
    _isApplying = true;
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
    _isApplying = false;
}

let _qrObserver = null;
let _isApplying = false;

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
    
    collectNewButtons();
    
    if (_qrObserver) _qrObserver.disconnect();
    _qrObserver = new MutationObserver(() => {
        if (_isApplying) return;
        clearTimeout(_qrObserver._timer);
        _qrObserver._timer = setTimeout(() => {
            if (loadSettings().enabled) {
                collectNewButtons();
            }
        }, 300);
    });
    if (qrBar) _qrObserver.observe(qrBar, { childList: true, subtree: true });
    if (qrPopout) _qrObserver.observe(qrPopout, { childList: true, subtree: true });
}

function collectNewButtons() {
    const customContainer = document.getElementById('qrl-custom-buttons');
    if (!customContainer) return;
    
    _isApplying = true;
    let hasNew = false;
    const allButtons = document.querySelectorAll('#qr--bar .qr--button, #qr--popout .qr--button');
    allButtons.forEach(btn => {
        if (!btn.closest('#qrl-custom-buttons')) {
            customContainer.appendChild(btn);
            hasNew = true;
        }
    });
    
    ensureFoldButton();
    applyFoldState();
    if (hasNew) {
        applyButtonOrder();
        applyButtonStyles();
        applyGridCols();
    }
    _isApplying = false;
}

let _foldButton = null;
let _foldPopup = null;
let _foldDocHandler = null;

function ensureFoldButton() {
    const s = loadSettings();
    
    if (!s.foldEnabled) {
        if (_foldButton) { _foldButton.remove(); _foldButton = null; }
        if (_foldPopup) { _foldPopup.remove(); _foldPopup = null; }
        return;
    }
    
    if (!_foldButton) {
        _foldButton = document.createElement('div');
        _foldButton.className = 'qrl-fold-btn';
        _foldButton.title = '折叠按钮';
        _foldButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFoldPopup();
        });
    }
    
    _foldButton.innerHTML = `<i class="${s.foldButtonIcon}"></i>`;
    _foldButton.style.setProperty('font-size', `${s.foldButtonScale * 0.252}px`, 'important');
    if (s.foldButtonColor) _foldButton.style.setProperty('color', s.foldButtonColor, 'important');
    else _foldButton.style.removeProperty('color');
    
    const rightSendForm = document.getElementById('rightSendForm');
    const sendBut = document.getElementById('send_but');
    if (rightSendForm && !_foldButton.parentElement) {
        if (sendBut) {
            rightSendForm.insertBefore(_foldButton, sendBut);
        } else {
            rightSendForm.appendChild(_foldButton);
        }
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
            clone.style.removeProperty('transform');
            clone.style.removeProperty('font-size');
            clone.addEventListener('click', (e) => {
                e.stopPropagation();
                const oldName = getButtonName(btn);
                btn.click();
                const newName = getButtonName(btn);
                if (oldName !== newName) {
                    const idx = s.foldedButtons.indexOf(oldName);
                    if (idx !== -1) s.foldedButtons.splice(idx, 1);
                    if (!s.foldedButtons.includes(newName)) s.foldedButtons.push(newName);
                    saveSettingsDebounced();
                }
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
        const maxWidth = containerRect ? containerRect.width - 4 : window.innerWidth - 40;
        _foldPopup.style.width = 'max-content';
        _foldPopup.style.maxWidth = maxWidth + 'px';
        _foldPopup.style.minWidth = '0';
        const popupRect = _foldPopup.getBoundingClientRect();
        let left = containerRect ? containerRect.right - popupRect.width : rect.right - popupRect.width;
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
        _foldButton.style.setProperty('font-size', `${s.foldButtonScale * 0.252}px`, 'important');
        _foldButton.innerHTML = `<i class="${s.foldButtonIcon}"></i>`;
        if (s.foldButtonColor) _foldButton.style.setProperty('color', s.foldButtonColor, 'important');
        else _foldButton.style.removeProperty('color');
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
    
    const grid = document.createElement('div');
    grid.className = 'qrl-fold-grid';
    
    uniqueNames.forEach((name, i) => {
        const isFolded = s.foldedButtons && s.foldedButtons.includes(name);
        const label = document.createElement('label');
        label.className = 'checkbox_label qrl-fold-item';
        label.innerHTML = `<input type="checkbox" ${isFolded ? 'checked' : ''}> <span>${name}</span>`;
        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (!s.foldedButtons) s.foldedButtons = [];
            if (checkbox.checked && !s.foldedButtons.includes(name)) {
                s.foldedButtons.push(name);
                if (s.buttonStyles && s.buttonStyles[name]) {
                    const keepColor = s.buttonStyles[name].color || '';
                    const keepBold = s.buttonStyles[name].bold || false;
                    s.buttonStyles[name] = {};
                    if (keepColor) s.buttonStyles[name].color = keepColor;
                    if (keepBold) s.buttonStyles[name].bold = true;
                }
            } else if (!checkbox.checked) {
                s.foldedButtons = s.foldedButtons.filter(n => n !== name);
            }
            applyFoldState();
            applyButtonStyles();
            saveSettingsDebounced();
        });
        grid.appendChild(label);
    });
    
    listContainer.appendChild(grid);
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
    
    let needsReorder = false;
    for (let i = 0; i < allButtons.length; i++) {
        if (allButtons[i].nextElementSibling !== allButtons[i + 1] || 
            (i === allButtons.length - 1 && allButtons[i].nextElementSibling !== container.querySelector('.qrl-fold-btn'))) {
            needsReorder = true;
            break;
        }
    }
    if (!needsReorder) return;
    
    allButtons.forEach(btn => container.appendChild(btn));
    
    const foldBtn = container.querySelector('.qrl-fold-btn');
    if (foldBtn) container.insertBefore(foldBtn, container.firstChild);
}

function applyButtonStyles() {
    const s = loadSettings();
    if (!s.enabled) return;
    
    const container = document.getElementById('qrl-custom-buttons');
    if (!container) return;
    
    const scale = s.buttonScale / 100;
    
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
        const tx = (st && st.marginX) ? st.marginX : 0;
        const ty = (st && st.marginY) ? st.marginY : 0;
        btn.style.setProperty('transform', `translate(${tx}px, ${ty}px) scale(${scale})`, 'important');
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
        _foldButton.style.setProperty('font-size', `${s.foldButtonScale * 0.252}px`, 'important');
        _foldButton.innerHTML = `<i class="${s.foldButtonIcon}"></i>`;
        if (s.foldButtonColor) _foldButton.style.setProperty('color', s.foldButtonColor, 'important');
        else _foldButton.style.removeProperty('color');
    }
}

function applySingleButtonStyle(name) {
    const s = loadSettings();
    if (!s.enabled) return;
    const st = s.buttonStyles ? s.buttonStyles[name] : null;
    const scale = s.buttonScale / 100;
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
            const tx = st.marginX || 0;
            const ty = st.marginY || 0;
        btn.style.setProperty('transform', `translate(${tx}px, ${ty}px) scale(${scale})`, 'important');
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
    s.foldGapY = 2;
    s.foldButtonScale = 100;
    s.foldButtonIcon = 'fa-mosaic fa-solid fa-house';
    s.foldButtonColor = '';
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

        <label>
            排列方式:
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

        <label>按钮尺寸:
            <input type="text" class="qrl-range-input" id="qrl-btn-scale-input" value="100" data-suffix="%" style="width:52px;">
            <input type="range" id="qrl-btn-scale" min="50" max="150" value="100" class="range_slider">
            <button class="qrl-slider-reset" data-target="qrl-btn-scale" data-default="100">重置</button>
        </label>
        <div class="qrl-desc">按钮等比缩放（50%-150%），不影响字号设置</div>

        <hr>

        <label>上下间距:
            <input type="text" class="qrl-range-input" id="qrl-margin-y-input" value="5" data-suffix="px" style="width:52px;">
            <input type="range" id="qrl-margin-y" min="-50" max="50" value="5" class="range_slider">
            <button class="qrl-slider-reset" data-target="qrl-margin-y" data-default="5">重置</button>
        </label>
        <div class="qrl-desc">按钮上下的间距，负值靠近，正值远离</div>
        <label>左右间距:
            <input type="text" class="qrl-range-input" id="qrl-margin-x-input" value="5" data-suffix="px" style="width:52px;">
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
                <span>折叠按钮</span>
                <span class="qrl-collapse-icon">▼</span>
            </div>
            <div class="qrl-collapsible-content" id="qrl-fold-content">
                <div class="qrl-desc">勾选的按钮将折叠到弹窗列表中，取消勾选放回QR栏</div>
                <label>大小:
                    <span class="qrl-range-val" id="qrl-fold-btn-scale-value">100</span>%
                    <input type="range" id="qrl-fold-btn-scale" min="50" max="200" value="100" class="range_slider">
                    <button class="qrl-slider-reset" data-target="qrl-fold-btn-scale" data-default="100">重置</button>
                </label>
                <label>图标:
                    <select id="qrl-fold-btn-icon" class="text_pole qrl-input-third">
                        <option value="fa-mosaic fa-solid fa-house">🏠 默认房屋</option>
                        <option value="fa-mosaic fa-solid fa-moon">🌙 月亮</option>
                        <option value="fa-mosaic fa-solid fa-star">⭐ 星星</option>
                        <option value="fa-pixel fa-regular fa-bolt">⚡ 闪电</option>
                        <option value="fa-pixel fa-regular fa-layer-group">📚 图层</option>
                        <option value="fa-pixel fa-regular fa-snowflake">❄ 雪花</option>
                        <option value="fa-pixel fa-regular fa-tree">🎄 树</option>
                    </select>
                    &nbsp;&nbsp;&nbsp;&nbsp;颜色:
                    <input type="color" id="qrl-fold-btn-color" value="" style="width:28px;height:22px;border:none;padding:0;cursor:pointer;vertical-align:middle;">
                    <button class="qrl-slider-reset" id="qrl-fold-btn-color-reset">默认</button>
                </label>
                <label>左右间距:
                    <span class="qrl-range-val" id="qrl-fold-gap-value">2</span>px
                    <input type="range" id="qrl-fold-gap" min="0" max="30" value="2" class="range_slider">
                    <button class="qrl-slider-reset" data-target="qrl-fold-gap" data-default="2">重置</button>
                </label>
                <label>上下间距:
                    <span class="qrl-range-val" id="qrl-fold-gap-y-value">2</span>px
                    <input type="range" id="qrl-fold-gap-y" min="0" max="30" value="2" class="range_slider">
                    <button class="qrl-slider-reset" data-target="qrl-fold-gap-y" data-default="2">重置</button>
                </label>
                <div class="qrl-desc">弹窗内按钮之间的间距</div>
                <button class="qrl-refresh-btn" id="qrl-fold-refresh">捕获并折叠全部按钮</button>
                <div id="qrl-fold-list"></div>
            </div>
        </div>

        <hr>

        <div class="qrl-collapsible">
            <div class="qrl-collapsible-header" id="qrl-color-toggle">
                <span>按钮颜色位置</span>
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
        const rect = panel.getBoundingClientRect();
        ox = e.clientX - rect.left;
        oy = e.clientY - rect.top;
        panel.style.left = rect.left + 'px';
        panel.style.top = rect.top + 'px';
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
        loadPanelValues();
        syncGridGroup();
        renderFoldList();
    } else {
        panel.classList.remove('qrl-visible');
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
    $('qrl-fold-btn-scale')?.addEventListener('input', function () {
        $('qrl-fold-btn-scale-value').textContent = this.value;
        loadSettings().foldButtonScale = Number(this.value);
        if (_foldButton) _foldButton.style.setProperty('font-size', `${this.value * 0.252}px`, 'important');
        saveSettingsDebounced();
    });
    $('qrl-fold-btn-icon')?.addEventListener('change', function () {
        loadSettings().foldButtonIcon = this.value;
        if (_foldButton) _foldButton.innerHTML = `<i class="${this.value}"></i>`;
        saveSettingsDebounced();
    });
    $('qrl-fold-btn-color')?.addEventListener('input', function () {
        loadSettings().foldButtonColor = this.value;
        if (_foldButton) _foldButton.style.setProperty('color', this.value, 'important');
        saveSettingsDebounced();
    });
    $('qrl-fold-btn-color-reset')?.addEventListener('click', function () {
        loadSettings().foldButtonColor = '';
        $('qrl-fold-btn-color').value = '';
        if (_foldButton) _foldButton.style.removeProperty('color');
        saveSettingsDebounced();
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

    function bindSliderInput(sliderId, inputId, settingKey, applyFn) {
        const slider = $(sliderId);
        const input = $(inputId);
        if (!slider || !input) return;
        slider.addEventListener('input', function () {
            input.value = this.value;
            loadSettings()[settingKey] = Number(this.value);
            applyFn();
            saveSettingsDebounced();
        });
        input.addEventListener('change', function () {
            let v = parseFloat(this.value);
            if (isNaN(v)) return;
            const min = parseFloat(slider.min), max = parseFloat(slider.max);
            v = Math.max(min, Math.min(max, v));
            this.value = String(Math.round(v * 10) / 10);
            slider.value = Math.round(v);
            loadSettings()[settingKey] = v;
            applyFn();
            saveSettingsDebounced();
        });
    }

    bindSliderInput('qrl-btn-scale', 'qrl-btn-scale-input', 'buttonScale', applySettings);
    bindSliderInput('qrl-margin-y', 'qrl-margin-y-input', 'marginY', applySettings);
    bindSliderInput('qrl-margin-x', 'qrl-margin-x-input', 'marginX', applySettings);

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
    $('qrl-fold-gap-y')?.addEventListener('input', function () {
        $('qrl-fold-gap-y-value').textContent = this.value;
        loadSettings().foldGapY = Number(this.value);
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
            const companion = document.getElementById(target + '-input');
            if (companion) companion.value = value;
        });
    });
}

function bindCollapsibleEvents() {
    const toggle = document.getElementById('qrl-color-toggle');
    const content = document.getElementById('qrl-color-content');
    if (!toggle || !content) return;
    toggle.addEventListener('click', () => {
        const isHidden = !content.classList.contains('qrl-expanded');
        if (isHidden) {
            refreshButtonList();
            setTimeout(() => {
                const h = content.scrollHeight + 20;
                content.style.setProperty('--qrl-expand-h', h + 'px');
                requestAnimationFrame(() => {
                    content.classList.add('qrl-expanded');
                    toggle.querySelector('.qrl-collapse-icon').textContent = '▲';
                });
            }, 50);
        } else {
            content.classList.remove('qrl-expanded');
            toggle.querySelector('.qrl-collapse-icon').textContent = '▼';
        }
    });
    const foldToggle = document.getElementById('qrl-fold-toggle');
    const foldContent = document.getElementById('qrl-fold-content');
    if (foldToggle && foldContent) {
        foldToggle.addEventListener('click', () => {
            const isHidden = !foldContent.classList.contains('qrl-expanded');
            if (isHidden) {
                renderFoldList();
                requestAnimationFrame(() => {
                    const h = foldContent.scrollHeight + 20;
                    foldContent.style.setProperty('--qrl-expand-h', h + 'px');
                    requestAnimationFrame(() => {
                        foldContent.classList.add('qrl-expanded');
                        foldToggle.querySelector('.qrl-collapse-icon').textContent = '▲';
                    });
                });
            } else {
                foldContent.classList.remove('qrl-expanded');
                foldToggle.querySelector('.qrl-collapse-icon').textContent = '▼';
            }
        });
    }
}

function applyFoldGap() {
    const s = loadSettings();
    const popup = document.getElementById('qrl-fold-popup');
    if (popup) {
        popup.style.columnGap = s.foldGap + 'px';
        popup.style.rowGap = (s.foldGapY ?? 2) + 'px';
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
    const currentMarginY = style.marginY || 0;
    const currentMarginX = style.marginX || 0;
    div.innerHTML = `
        <div class="qrl-item-row1">
            <span class="qrl-drag-handle">☰</span>
            <span class="qrl-btn-name" title="${name}">${name}</span>
            <button class="qrl-reset-btn">重置</button>
        </div>
        <div class="qrl-item-row2">
            <label class="qrl-field"><span>字色</span><input type="color" class="qrl-clr-font" value="${currentColor}"></label>
            <label class="qrl-field"><span>字号</span><input type="number" class="qrl-font-size" min="8" max="32" value="${currentFontSize}"></label>
            <label class="qrl-field qrl-field-check"><input type="checkbox" class="qrl-bold" ${style.bold ? 'checked' : ''}><span>粗</span></label>
        </div>
        <div class="qrl-item-row3">
            <label class="qrl-field"><span>上下移动</span><input type="number" class="qrl-offset-y" value="${currentMarginY}" step="1"></label>
            <label class="qrl-field"><span>左右移动</span><input type="number" class="qrl-offset-x" value="${currentMarginX}" step="1"></label>
        </div>
    `;

    const fontInput = div.querySelector('.qrl-clr-font');
    const fontSizeInput = div.querySelector('.qrl-font-size');
    const boldInput = div.querySelector('.qrl-bold');
    const offsetYInput = div.querySelector('.qrl-offset-y');
    const offsetXInput = div.querySelector('.qrl-offset-x');
    const resetBtn = div.querySelector('.qrl-reset-btn');

    const updateStyle = () => {
        if (!s.enabled) return;
        if (!s.buttonStyles) s.buttonStyles = {};
        s.buttonStyles[name] = {
            color: fontInput.value,
            fontSize: Number(fontSizeInput.value),
            bold: boldInput.checked,
            marginY: Number(offsetYInput.value) || 0,
            marginX: Number(offsetXInput.value) || 0,
        };
        applySingleButtonStyle(name);
        saveSettingsDebounced();
    };

    fontInput.addEventListener('change', updateStyle);
    fontSizeInput.addEventListener('change', updateStyle);
    boldInput.addEventListener('change', updateStyle);
    offsetYInput.addEventListener('change', updateStyle);
    offsetXInput.addEventListener('change', updateStyle);

    resetBtn.addEventListener('click', () => {
        if (s.buttonStyles) delete s.buttonStyles[name];
        fontInput.value = defaultColor;
        fontSizeInput.value = defaultFontSize;
        boldInput.checked = false;
        offsetYInput.value = 0;
        offsetXInput.value = 0;
        const allBtns = document.querySelectorAll('#qrl-custom-buttons .qr--button');
        const scale = s.buttonScale / 100;
        allBtns.forEach(btn => {
            if (getButtonName(btn) !== name) return;
            btn.style.removeProperty('color');
            btn.style.removeProperty('font-size');
            btn.style.removeProperty('font-weight');
            btn.style.setProperty('transform', `scale(${scale})`, 'important');
        });
        saveSettingsDebounced();
    });

    const isFolded = s.foldedButtons && s.foldedButtons.includes(name);
    if (isFolded) {
        [fontSizeInput, offsetYInput, offsetXInput].forEach(el => {
            el.disabled = true;
            el.style.opacity = '0.4';
            el.style.cursor = 'not-allowed';
        });
    }

    return div;
}

function setupDragAndDrop(container) {
    const items = Array.from(container.querySelectorAll('.qrl-btn-item'));
    let dragSrc = null;
    let pressTimer = null;
    let dragging = false;
    let ghost = null;
    let overItem = null;
    let autoScrollRaf = null;
    let autoScrollSpeed = 0;
    let autoScrollTarget = null;
    let autoScrollBounds = null;
    const BASE_SPEED = 3;
    const MAX_EXTRA = 3;
    const EDGE_ZONE = 30;

    const stopAutoScroll = () => {
        autoScrollSpeed = 0;
        autoScrollTarget = null;
        autoScrollBounds = null;
        if (autoScrollRaf) { cancelAnimationFrame(autoScrollRaf); autoScrollRaf = null; }
    };

    const getScrollPos = (el, ctn) => {
        return el.getBoundingClientRect().top - ctn.getBoundingClientRect().top + ctn.scrollTop;
    };

    const getHeaderHeight = (ctn) => {
        const header = ctn.querySelector('#qrl-panel-header');
        return header ? header.offsetHeight : 0;
    };

    const tickAutoScroll = () => {
        if (!autoScrollTarget || autoScrollSpeed === 0) { autoScrollRaf = null; return; }
        if (!autoScrollBounds) { autoScrollRaf = null; return; }
        const headerH = getHeaderHeight(autoScrollTarget);
        const sTop = getScrollPos(autoScrollBounds.start, autoScrollTarget) - headerH;
        const eBottom = getScrollPos(autoScrollBounds.end, autoScrollTarget) + autoScrollBounds.end.offsetHeight;
        const minScroll = Math.max(0, sTop);
        const maxScroll = eBottom - autoScrollTarget.clientHeight;
        const newScroll = autoScrollTarget.scrollTop + autoScrollSpeed;
        const clamped = Math.max(0, Math.max(minScroll, Math.min(maxScroll, newScroll)));
        if (clamped === autoScrollTarget.scrollTop) { stopAutoScroll(); return; }
        autoScrollTarget.scrollTop = clamped;
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
    };

    const startAutoScroll = (target, bounds, speed) => {
        autoScrollTarget = target;
        autoScrollBounds = bounds;
        autoScrollSpeed = speed;
        if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(tickAutoScroll);
    };

    const getGroupBounds = (item) => {
        let el = item;
        while (el && el.parentElement !== container) el = el.parentElement;
        let start = el, end = el;
        while (start.previousElementSibling && !start.previousElementSibling.classList.contains('qrl-group-header')) {
            start = start.previousElementSibling;
        }
        while (end.nextElementSibling && !end.nextElementSibling.classList.contains('qrl-group-header')) {
            end = end.nextElementSibling;
        }
        return { start, end };
    };

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

    const clearOverClasses = () => {
        container.querySelectorAll('.qrl-drag-before, .qrl-drag-after').forEach(el => {
            el.classList.remove('qrl-drag-before', 'qrl-drag-after');
        });
    };

    const findItemAt = (x, y) => {
        const els = document.elementsFromPoint(x, y);
        for (const el of els) {
            const item = el.closest('.qrl-btn-item');
            if (item && item !== dragSrc && container.contains(item)) return item;
        }
        return null;
    };

    const endDrag = () => {
        if (!dragging) return;
        dragging = false;
        clearTimeout(pressTimer);
        if (dragSrc) dragSrc.classList.remove('qrl-dragging');
        if (ghost) { ghost.remove(); ghost = null; }
        clearOverClasses();
        stopAutoScroll();
        if (overItem && dragSrc && getGroup(dragSrc) === getGroup(overItem)) {
            const rect = overItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const lastPointerY = ghost ? parseFloat(ghost.dataset.py || '0') : 0;
            const insertBefore = lastPointerY < midpoint;
            insertItem(dragSrc, overItem, insertBefore);
        }
        dragSrc = null;
        overItem = null;
    };

    items.forEach(item => {
        item.addEventListener('pointerdown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'LABEL') return;
            if (e.button !== 0) return;
            pressTimer = setTimeout(() => {
                dragging = true;
                dragSrc = item;
                item.classList.add('qrl-dragging');
                ghost = document.createElement('div');
                ghost.className = 'qrl-drag-ghost';
                ghost.textContent = item.dataset.name || '?';
                ghost.dataset.py = e.clientY;
                ghost.style.left = e.clientX + 10 + 'px';
                ghost.style.top = e.clientY - 10 + 'px';
                document.body.appendChild(ghost);
            }, 400);
        });

        item.addEventListener('pointerup', () => {
            clearTimeout(pressTimer);
        });

        item.addEventListener('pointerleave', () => {
            clearTimeout(pressTimer);
        });
    });

    document.addEventListener('pointermove', (e) => {
        if (!dragging || !dragSrc) return;
        if (ghost) {
            ghost.style.left = e.clientX + 10 + 'px';
            ghost.style.top = e.clientY - 10 + 'px';
            ghost.dataset.py = e.clientY;
        }
        clearOverClasses();
        overItem = findItemAt(e.clientX, e.clientY);
        if (overItem && getGroup(dragSrc) === getGroup(overItem)) {
            const rect = overItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (e.clientY < midpoint) {
                overItem.classList.add('qrl-drag-before');
            } else {
                overItem.classList.add('qrl-drag-after');
            }
        }
        const panel = document.getElementById('qrl-panel');
        if (panel) {
            const bounds = dragSrc ? getGroupBounds(dragSrc) : null;
            const panelRect = panel.getBoundingClientRect();
            let speed = 0;
            if (bounds) {
                const headerH = getHeaderHeight(panel);
                const groupTop = getScrollPos(bounds.start, panel) - headerH;
                const groupBottom = getScrollPos(bounds.end, panel) + bounds.end.offsetHeight;
                if (e.clientY > panelRect.bottom - EDGE_ZONE) {
                    if (panel.scrollTop + panel.clientHeight >= groupBottom - 1) { stopAutoScroll(); }
                    else {
                        const over = Math.min(e.clientY - (panelRect.bottom - EDGE_ZONE), EDGE_ZONE);
                        speed = BASE_SPEED + (over / EDGE_ZONE) * MAX_EXTRA;
                    }
                } else if (e.clientY < panelRect.top + EDGE_ZONE) {
                    if (panel.scrollTop <= Math.max(0, groupTop) + 1) { stopAutoScroll(); }
                    else {
                        const over2 = Math.min((panelRect.top + EDGE_ZONE) - e.clientY, EDGE_ZONE);
                        speed = -(BASE_SPEED + (over2 / EDGE_ZONE) * MAX_EXTRA);
                    }
                }
            }
            if (speed !== 0) startAutoScroll(panel, bounds, speed);
            else stopAutoScroll();
        }
    });

    document.addEventListener('pointerup', () => {
        endDrag();
    });

    document.addEventListener('wheel', (e) => {
        if (!dragging) return;
        const panel = document.getElementById('qrl-panel');
        if (!panel) return;
        e.preventDefault();
        panel.scrollTop += e.deltaY;
    }, { passive: false });
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
    $('qrl-btn-scale').value = Math.round(s.buttonScale);
    $('qrl-btn-scale-input').value = s.buttonScale;
    $('qrl-margin-y').value = Math.round(s.marginY);
    $('qrl-margin-y-input').value = s.marginY;
    $('qrl-margin-x').value = Math.round(s.marginX);
    $('qrl-margin-x-input').value = s.marginX;
    $('qrl-btn-font-size').value = s.buttonFontSize;
    $('qrl-bar-max-height').value = s.barMaxHeight;
    $('qrl-preset-name').value = s.currentPreset || '';
    $('qrl-fold-enabled').checked = s.foldEnabled !== false;
    $('qrl-fold-btn-scale').value = s.foldButtonScale;
    $('qrl-fold-btn-scale-value').textContent = s.foldButtonScale;
    $('qrl-fold-btn-icon').value = s.foldButtonIcon;
    $('qrl-fold-btn-color').value = s.foldButtonColor || '#ffffff';
    $('qrl-fold-gap').value = s.foldGap;
    $('qrl-fold-gap-value').textContent = s.foldGap;
    $('qrl-fold-gap-y').value = s.foldGapY ?? 2;
    $('qrl-fold-gap-y-value').textContent = s.foldGapY ?? 2;
    $('qrl-fold-gap-y').value = s.foldGapY ?? 2;
    $('qrl-fold-gap-y-value').textContent = s.foldGapY ?? 2;
    $('qrl-fold-gap-y').value = s.foldGapY ?? 2;
    $('qrl-fold-gap-y-value').textContent = s.foldGapY ?? 2;
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

function positionOverlay(el) {
    const panel = document.getElementById('qrl-panel');
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    el.style.top = r.top + 'px';
    el.style.left = r.left + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
}

function showSaveToast(text, success) {
    let toast = document.getElementById('qrl-save-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'qrl-save-toast';
        document.body.appendChild(toast);
    }
    const panel = document.getElementById('qrl-panel');
    if (panel) {
        const r = panel.getBoundingClientRect();
        toast.style.top = (r.top + r.height / 2) + 'px';
        toast.style.left = (r.left + r.width / 2) + 'px';
    }
    toast.textContent = text;
    toast.className = 'qrl-toast ' + (success ? 'qrl-toast-ok' : 'qrl-toast-fail');
    toast.classList.remove('qrl-toast-hide');
    toast.classList.add('qrl-toast-show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('qrl-toast-show');
        toast.classList.add('qrl-toast-hide');
    }, 1000);
}

function savePreset() {
    const s = loadSettings();
    const sel = document.getElementById('qrl-presets');
    const nameInput = document.getElementById('qrl-preset-name');
    const name = (nameInput?.value || '').trim();
    if (!name) return;
    try {
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
        showSaveToast('保存成功', true);
    } catch (e) {
        showSaveToast('保存失败', false);
    }
}

function loadPreset(name) {
    const s = loadSettings();
    if (!s.presets || !s.presets[name]) return;
    resetButtonStyles();
    applyLayoutToSettings(s, s.presets[name]);
    s.currentPreset = name;
    loadPanelValues();
    syncGridGroup();
    saveAndApply();
    renderButtonList();
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
    document.body.appendChild(overlay);
    overlay.querySelector('#qrl-cfm-yes')?.addEventListener('click', () => {
        overlay.classList.remove('qrl-cfm-visible');
        setTimeout(() => { overlay.style.display = 'none'; }, 200);
        if (_confirmCallback) { _confirmCallback(); _confirmCallback = null; }
    });
    overlay.querySelector('#qrl-cfm-no')?.addEventListener('click', () => {
        overlay.classList.remove('qrl-cfm-visible');
        setTimeout(() => { overlay.style.display = 'none'; }, 200);
        _confirmCallback = null;
    });
}

function showConfirm(title, subtitle, onYes, yesText) {
    const overlay = document.getElementById('qrl-confirm-overlay');
    if (!overlay) return;
    positionOverlay(overlay);
    document.getElementById('qrl-cfm-title').textContent = title;
    document.getElementById('qrl-cfm-sub').textContent = subtitle;
    document.getElementById('qrl-cfm-yes').textContent = yesText || '确定';
    _confirmCallback = onYes;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
        overlay.classList.add('qrl-cfm-visible');
    });
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
