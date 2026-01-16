// Mobile controls component
import { LitElement, html, css } from 'lit';
import { getShortcuts } from '../services/shortcuts-service.js';

class WebtmuxMobileControls extends LitElement {
  static properties = {
    showPaneSelector: { type: Boolean },
    showSessionSelector: { type: Boolean },
    layout: { type: Object },
    activePane: { type: String },
    collapsed: { type: Boolean },
    announcement: { type: String },
    shortcuts: { type: Array },
  };

  static styles = css`
    :host {
      display: block;
      position: fixed;
      bottom: var(--keyboard-offset, 0px);
      left: 0;
      right: 0;
      background: #16213e;
      border-top: 1px solid #0f3460;
      padding: 6px;
      padding-bottom: calc(6px + env(safe-area-inset-bottom));
      z-index: 1000;
      transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1),
                  bottom 150ms ease-out;
      will-change: bottom;
    }

    /* Drag handle for collapse/expand - modern drawer style */
    .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 10px 0 6px;
      margin: 0;
      background: transparent;
      border: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: pan-y;
      position: relative;
    }

    .drag-handle::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.1) 80%, transparent);
    }

    .drag-handle-bar {
      width: 40px;
      height: 4px;
      background: rgba(255, 255, 255, 0.25);
      border-radius: 2px;
      transition: all 0.2s ease;
    }

    .drag-handle:hover .drag-handle-bar {
      background: rgba(233, 69, 96, 0.8);
      width: 50px;
    }

    .drag-handle:active .drag-handle-bar {
      background: #e94560;
      width: 60px;
      transform: scaleY(1.2);
    }

    .drag-handle:focus-visible {
      outline: none;
    }

    .drag-handle:focus-visible .drag-handle-bar {
      background: #4a9eff;
      box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.3);
    }

    /* Chevron indicator (SVG) */
    .expand-indicator {
      position: absolute;
      right: 16px;
      stroke: rgba(255, 255, 255, 0.35);
      transition: all 0.25s ease;
    }

    .drag-handle:hover .expand-indicator {
      stroke: rgba(255, 255, 255, 0.7);
    }

    .drag-handle:active .expand-indicator {
      stroke: #e94560;
    }

    /* Collapsible content */
    .collapsible-content {
      max-height: 200px;
      overflow: hidden;
      transition: max-height 250ms cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 200ms ease-in-out;
      opacity: 1;
    }

    :host(.collapsed) .collapsible-content {
      max-height: 0;
      opacity: 0;
      pointer-events: none;
    }

    /* Essential controls (visible when collapsed) */
    .essential-controls {
      display: flex;
      justify-content: center;
      gap: 6px;
      padding: 6px 12px 10px;
      opacity: 1;
      transform: translateY(0);
      transition: all 0.2s ease;
      flex-wrap: wrap;
    }

    :host(:not(.collapsed)) .essential-controls {
      display: none;
      opacity: 0;
      transform: translateY(-10px);
    }

    .essential-btn {
      background: rgba(26, 26, 46, 0.8);
      border: 1px solid rgba(15, 52, 96, 0.8);
      border-radius: 6px;
      color: #a0a0a0;
      padding: 8px 12px;
      font-size: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-weight: 500;
      cursor: pointer;
      min-width: 44px;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
      transition: all 0.15s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .essential-btn:hover {
      background: rgba(15, 52, 96, 0.9);
      border-color: rgba(74, 158, 255, 0.5);
      color: #fff;
    }

    .essential-btn:active {
      background: #0f3460;
      border-color: #e94560;
      color: #fff;
      transform: scale(0.95);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    /* Screen reader only */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .controls {
      display: flex;
      justify-content: space-around;
      gap: 8px;
    }

    .control-btn {
      flex: 1;
      max-width: 60px;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 6px;
      color: #888;
      padding: 8px 4px;
      font-size: 9px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      -webkit-tap-highlight-color: transparent;
    }

    .control-btn:active {
      background: #0f3460;
      border-color: #e94560;
      color: #fff;
      transform: scale(0.95);
    }

    .control-btn svg {
      width: 16px;
      height: 16px;
    }

    .control-btn.prefix {
      background: #e94560;
      border-color: #e94560;
      color: #fff;
    }

    /* Shortcuts bar in expanded state */
    .shortcuts-bar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      align-items: center;
      padding: 4px 0 8px;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .shortcuts-bar::-webkit-scrollbar {
      display: none;
    }

    .shortcut-btn {
      flex-shrink: 0;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 6px;
      color: #888;
      padding: 8px 12px;
      font-size: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      cursor: pointer;
      transition: all 0.15s;
      min-width: 44px;
      min-height: 40px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      -webkit-tap-highlight-color: transparent;
    }

    .shortcut-btn:active {
      background: #0f3460;
      border-color: #e94560;
      color: #fff;
      transform: scale(0.95);
    }

    .settings-btn {
      flex-shrink: 0;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 6px;
      color: #888;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
      min-width: 44px;
      min-height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: auto;
    }

    .settings-btn:hover {
      border-color: #e94560;
      color: #fff;
    }

    .settings-btn:active {
      background: #0f3460;
      border-color: #e94560;
      color: #fff;
      transform: scale(0.95);
    }

    .window-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
      -webkit-overflow-scrolling: touch;
    }

    .window-tab {
      flex-shrink: 0;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 4px;
      color: #888;
      padding: 6px 12px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
    }

    .window-tab:active, .window-tab.active {
      background: #e94560;
      border-color: #e94560;
      color: #fff;
    }

    .pane-selector {
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      background: #16213e;
      border-top: 1px solid #0f3460;
      padding: 12px;
      display: none;
    }

    .pane-selector.open {
      display: block;
    }

    .pane-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .pane-btn {
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 4px;
      color: #888;
      padding: 12px;
      font-size: 12px;
      cursor: pointer;
    }

    .pane-btn.active {
      border-color: #e94560;
      color: #e94560;
    }

    .arrow-pad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 2px;
      width: 90px;
      height: 90px;
    }

    .arrow-btn {
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 4px;
      color: #888;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
    }

    .arrow-btn:active {
      background: #0f3460;
      border-color: #e94560;
    }

    .arrow-btn.empty {
      visibility: hidden;
    }

    .session-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .session-overlay.open {
      display: flex;
    }

    .session-modal {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 12px;
      padding: 20px;
      min-width: 280px;
      max-width: 90%;
      max-height: 70vh;
      overflow-y: auto;
    }

    .session-modal h3 {
      color: #4a9eff;
      font-size: 14px;
      margin: 0 0 16px 0;
      text-align: center;
    }

    .session-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .session-item {
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 12px 16px;
      color: #888;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .session-item:active {
      background: #0f3460;
      border-color: #4a9eff;
    }

    .session-item.active {
      border-color: #4a9eff;
      color: #fff;
      background: #1a3a5c;
    }

    .session-item .session-name {
      font-weight: 500;
    }

    .session-item .session-meta {
      font-size: 12px;
      opacity: 0.7;
    }

    .close-overlay {
      position: absolute;
      top: 20px;
      right: 20px;
      background: transparent;
      border: none;
      color: #888;
      font-size: 24px;
      cursor: pointer;
    }

    .session-btn {
      background: #4a9eff;
      border-color: #4a9eff;
      color: #fff;
    }
  `;

  constructor() {
    super();
    this.showPaneSelector = false;
    this.showSessionSelector = false;
    this.layout = null;
    this.activePane = '';
    this.collapsed = localStorage.getItem('webtmux-mobile-collapsed') !== 'false';
    this.announcement = '';
    this.shortcuts = getShortcuts();

    // Touch gesture state
    this._touchStartY = 0;
    this._touchStartTime = 0;
    this._isDragging = false;

    // Track if we auto-expanded due to landscape orientation
    this._autoExpandedForLandscape = false;

    window.addEventListener('tmux-layout-update', (e) => {
      this.layout = e.detail;
      this.activePane = e.detail.activePaneId;
    });

    // Set up orientation listener for auto-expand in landscape
    this._setupOrientationListener();
  }

  _setupOrientationListener() {
    const landscapeQuery = window.matchMedia("(orientation: landscape)");

    const handleOrientationChange = (e) => {
      const isLandscape = e.matches;

      if (isLandscape) {
        // Use viewport height to distinguish phone vs tablet in landscape
        // iPhone landscape: ~375-428px height (phone-like)
        // iPad mini landscape: ~768px height (tablet-like)
        const viewportHeight = window.innerHeight;
        const isPhoneLandscape = viewportHeight < 500;

        // Only auto-expand on tablet landscape, not phone landscape
        if (!isPhoneLandscape && this.collapsed) {
          this._autoExpandedForLandscape = true;
          this.collapsed = false;
          // Don't save to localStorage - this is temporary
          // Dispatch event for layout adjustment
          this.dispatchEvent(new CustomEvent('collapse-change', {
            bubbles: true,
            composed: true,
            detail: { collapsed: false }
          }));
        }
      } else {
        // Portrait mode - restore user's preference if we auto-expanded
        if (this._autoExpandedForLandscape) {
          this._autoExpandedForLandscape = false;
          const userPreference = localStorage.getItem('webtmux-mobile-collapsed') !== 'false';
          this.collapsed = userPreference;
          // Dispatch event for layout adjustment
          this.dispatchEvent(new CustomEvent('collapse-change', {
            bubbles: true,
            composed: true,
            detail: { collapsed: userPreference }
          }));
        }
      }
    };

    landscapeQuery.addEventListener("change", handleOrientationChange);
    // Check initial state on load
    handleOrientationChange(landscapeQuery);
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    if (changedProperties.has('collapsed')) {
      // Update host class for CSS styling
      if (this.collapsed) {
        this.classList.add('collapsed');
      } else {
        this.classList.remove('collapsed');
      }
      // Dispatch event for other components to react
      this.dispatchEvent(new CustomEvent('collapse-change', {
        bubbles: true,
        composed: true,
        detail: { collapsed: this.collapsed }
      }));
    }
  }

  // Touch gesture handlers for swipe collapse/expand
  handleTouchStart(e) {
    this._touchStartY = e.touches[0].clientY;
    this._touchStartTime = Date.now();
    this._isDragging = true;
  }

  handleTouchMove(e) {
    if (!this._isDragging) return;
    // Prevent default to avoid scrolling while dragging
    e.preventDefault();
  }

  handleTouchEnd(e) {
    if (!this._isDragging) return;
    this._isDragging = false;

    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = this._touchStartY - touchEndY;
    const deltaTime = Date.now() - this._touchStartTime;
    const velocity = Math.abs(deltaY) / deltaTime;

    // Thresholds for swipe detection
    const SWIPE_THRESHOLD = 50; // minimum distance in pixels
    const VELOCITY_THRESHOLD = 0.3; // minimum velocity (px/ms)

    if (Math.abs(deltaY) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      if (deltaY > 0) {
        // Swipe up - expand
        this.setCollapsed(false);
      } else {
        // Swipe down - collapse
        this.setCollapsed(true);
      }
    }
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed);
  }

  setCollapsed(value) {
    this.collapsed = value;
    localStorage.setItem('webtmux-mobile-collapsed', String(value));

    // User manually changed state, so clear the auto-expand flag
    this._autoExpandedForLandscape = false;

    // Announce state change for screen readers
    this.announcement = value
      ? 'Mobile controls collapsed. Tap to expand.'
      : 'Mobile controls expanded.';

    // Clear announcement after screen reader has time to read it
    setTimeout(() => { this.announcement = ''; }, 1000);
  }

  // Send essential shortcuts
  sendEsc() {
    window.webtmux?.terminal?.input('\x1b');
    window.webtmux?.terminal?.focus();
  }

  sendCtrlC() {
    window.webtmux?.terminal?.input('\x03');
    window.webtmux?.terminal?.focus();
  }

  sendTab() {
    window.webtmux?.terminal?.input('\x09');
    window.webtmux?.terminal?.focus();
  }

  sendShiftTab() {
    // Shift+Tab escape sequence: ESC [ Z
    window.webtmux?.terminal?.input('\x1b[Z');
    window.webtmux?.terminal?.focus();
  }

  sendPipe() {
    window.webtmux?.terminal?.input('|');
    window.webtmux?.terminal?.focus();
  }

  sendSlash() {
    window.webtmux?.terminal?.input('/');
    window.webtmux?.terminal?.focus();
  }

  sendShortcut(shortcut) {
    const bytes = new Uint8Array(shortcut.keys);
    const binary = String.fromCharCode(...bytes);
    if (window.webtmux?.sendKeys) {
      window.webtmux.sendKeys(shortcut.keys);
    } else {
      // Fallback: send directly
      window.webtmux?.sendMessage?.('1', btoa(binary));
    }
    // Re-focus terminal after clicking button
    window.webtmux?.terminal?.focus();
  }

  openShortcutsSettings() {
    // Dispatch event to open settings modal in shortcuts component
    window.dispatchEvent(new CustomEvent('open-shortcuts-settings'));
  }

  render() {
    const sessions = this.layout?.sessions || [];
    const showSessionBtn = sessions.length > 1;

    return html`
      <!-- Screen reader announcements -->
      <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
        ${this.announcement}
      </div>

      <!-- Session overlay -->
      <div class="session-overlay ${this.showSessionSelector ? 'open' : ''}" @click=${this.closeSessionSelector}>
        <button class="close-overlay" @click=${this.closeSessionSelector}>×</button>
        <div class="session-modal" @click=${(e) => e.stopPropagation()}>
          <h3>Switch Session</h3>
          <div class="session-list">
            ${sessions.map(sess => html`
              <button
                class="session-item ${sess.active ? 'active' : ''}"
                @click=${() => this.switchSession(sess.name)}
              >
                <span class="session-name">${sess.name}</span>
                <span class="session-meta">${sess.windows} window${sess.windows !== 1 ? 's' : ''}</span>
              </button>
            `)}
          </div>
        </div>
      </div>

      <div class="pane-selector ${this.showPaneSelector ? 'open' : ''}">
        <div class="pane-grid">
          ${this.layout?.windows?.find(w => w.active)?.panes?.map(pane => html`
            <button
              class="pane-btn ${pane.active ? 'active' : ''}"
              @click=${() => this.selectPane(pane.id)}
            >
              Pane ${pane.index}
            </button>
          `)}
        </div>
      </div>

      <!-- Drag handle for collapse/expand - at the very top -->
      <button
        class="drag-handle"
        @click=${this.toggleCollapsed}
        @touchstart=${this.handleTouchStart}
        @touchmove=${this.handleTouchMove}
        @touchend=${this.handleTouchEnd}
        aria-expanded="${!this.collapsed}"
        aria-controls="mobile-controls-content"
        aria-label="${this.collapsed ? 'Expand mobile controls' : 'Collapse mobile controls'}"
      >
        <div class="drag-handle-bar" aria-hidden="true"></div>
        <svg class="expand-indicator" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${this.collapsed
            ? html`<polyline points="18 15 12 9 6 15"></polyline>`
            : html`<polyline points="6 9 12 15 18 9"></polyline>`
          }
        </svg>
      </button>

      <!-- Essential controls (visible when collapsed) -->
      <div class="essential-controls" role="toolbar" aria-label="Essential shortcuts">
        <button class="essential-btn" @click=${this.sendEsc} title="ESC">ESC</button>
        <button class="essential-btn" @click=${this.sendTab} title="Tab">Tab</button>
        <button class="essential-btn" @click=${this.sendShiftTab} title="Shift+Tab">⇧Tab</button>
        <button class="essential-btn" @click=${this.sendCtrlC} title="Ctrl+C">^C</button>
        <button class="essential-btn" @click=${this.sendPipe} title="Pipe">|</button>
        <button class="essential-btn" @click=${this.sendSlash} title="Slash">/</button>
      </div>

      <!-- Collapsible content -->
      <div
        id="mobile-controls-content"
        class="collapsible-content"
        aria-hidden="${this.collapsed}"
      >
        <!-- Shortcuts bar (only in expanded state) -->
        <div class="shortcuts-bar" role="toolbar" aria-label="Keyboard shortcuts">
          ${this.shortcuts.filter(s => s.enabled).sort((a, b) => a.order - b.order).map(shortcut => html`
            <button
              class="shortcut-btn"
              @click=${() => this.sendShortcut(shortcut)}
              title="${shortcut.label}"
            >
              ${shortcut.label}
            </button>
          `)}
          <button class="settings-btn" @click=${this.openShortcutsSettings} title="Configure shortcuts">
            \u2699
          </button>
        </div>

        ${this.layout?.windows?.length > 0 ? html`
          <div class="window-tabs" role="tablist" aria-label="Window tabs">
            ${this.layout.windows.map(win => html`
              <button
                role="tab"
                class="window-tab ${win.active ? 'active' : ''}"
                aria-selected="${win.active}"
                @click=${() => this.selectWindow(win.id)}
              >
                ${win.index}: ${win.name || 'bash'}
              </button>
            `)}
            <button class="window-tab" @click=${this.newWindow} aria-label="New window">+</button>
          </div>
        ` : ''}

        <div class="controls" role="toolbar" aria-label="Tmux controls">
          ${showSessionBtn ? html`
            <button class="control-btn session-btn" @click=${this.toggleSessionSelector}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2"/>
                <line x1="8" y1="21" x2="16" y2="21"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              Sess
            </button>
          ` : ''}

          <button class="control-btn prefix" @click=${this.sendPrefix}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <text x="12" y="16" font-size="10" fill="currentColor" text-anchor="middle">^B</text>
            </svg>
            Prefix
          </button>

          <button class="control-btn" @click=${() => this.splitPane(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="3" x2="12" y2="21"/>
            </svg>
            Split H
          </button>

          <button class="control-btn" @click=${() => this.splitPane(false)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
            </svg>
            Split V
          </button>

          <button class="control-btn" @click=${this.togglePaneSelector}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
            </svg>
            Panes
          </button>

          <button class="control-btn" @click=${this.newWindow}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            New
          </button>

          <button class="control-btn" @click=${this.closePane}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>
      </div>
    `;
  }

  sendPrefix() {
    // Send Ctrl+B (tmux prefix)
    // ASCII code for Ctrl+B is 0x02
    window.webtmux?.terminal?.input('\x02');
  }

  splitPane(horizontal) {
    window.webtmux?.splitPane(horizontal);
  }

  togglePaneSelector() {
    this.showPaneSelector = !this.showPaneSelector;
  }

  selectPane(paneId) {
    window.webtmux?.selectPane(paneId);
    this.showPaneSelector = false;
  }

  selectWindow(windowId) {
    window.webtmux?.selectWindow(windowId);
  }

  newWindow() {
    window.webtmux?.newWindow();
  }

  toggleSessionSelector() {
    this.showSessionSelector = !this.showSessionSelector;
  }

  closeSessionSelector() {
    this.showSessionSelector = false;
  }

  switchSession(sessionName) {
    window.webtmux?.switchSession(sessionName);
    this.showSessionSelector = false;
  }

  closePane() {
    window.webtmux?.closePane(this.activePane);
  }
}

customElements.define('webtmux-mobile-controls', WebtmuxMobileControls);
