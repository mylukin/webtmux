import { Terminal } from '@xterm/xterm';

// Patch Terminal to fix iOS Safari Chinese punctuation and emoji input
// 修复 iOS Safari 中文标点和 emoji 输入问题
//
// Bug: xterm.js drops input when ev.composed=true && _keyDownSeen=true
// This affects Chinese punctuation (，。), spaces on iOS Safari
//
// Emoji issue: compositionend fires, then input event fires while
// _isSendingComposition is still true, causing duplication
//
// Solution: Track composition timing ourselves, skip input events
// that come within 50ms of compositionend
//
// PR submitted to xterm.js: https://github.com/xtermjs/xterm.js/pull/5614

const OriginalTerminal = Terminal;

// Debug mode for troubleshooting (set to true to see logs)
const DEBUG = false;
const log = (msg, data) => {
  if (DEBUG) console.log(`[xterm-ios-fix] ${msg}`, data || '');
};

// Detect actual iOS/Android touch devices (exclude desktop Mac with trackpad)
const isTouchMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  return isIOS || isAndroid;
};

// Create a patched Terminal class
class PatchedTerminal extends OriginalTerminal {
  constructor(options) {
    super(options);

    if (isTouchMobileDevice()) {
      this._applyIOSInputFix();
    }
  }

  _applyIOSInputFix() {
    const self = this;

    const originalOpen = this.open.bind(this);
    this.open = function(parent) {
      originalOpen(parent);

      setTimeout(() => {
        const textarea = parent.querySelector('.xterm-helper-textarea');
        if (!textarea) return;

        let isInComposition = false;
        let compositionEndTime = 0;
        let lastKeyDownTime = 0;

        textarea.addEventListener('compositionstart', () => {
          isInComposition = true;
          log('compositionstart');
        }, true);

        textarea.addEventListener('compositionend', () => {
          isInComposition = false;
          compositionEndTime = Date.now();
          log('compositionend');
        }, true);

        // Track keydown to avoid re-sending keyboard input
        // xterm.js handles normal keyboard via keydown, we should NOT re-send it
        textarea.addEventListener('keydown', (ev) => {
          // Only track printable keys (not modifiers, arrows, etc.)
          if (ev.key.length === 1 || ev.key === 'Enter' || ev.key === 'Tab') {
            lastKeyDownTime = Date.now();
            log('keydown:', ev.key);
          }
        }, true);

        textarea.addEventListener('input', (ev) => {
          if (ev.inputType !== 'insertText' || !ev.data) {
            return;
          }

          if (ev.defaultPrevented) {
            log('Handled by xterm.js (defaultPrevented)');
            return;
          }

          if (isInComposition) {
            log('Skipping (in composition)');
            return;
          }

          const timeSinceCompositionEnd = Date.now() - compositionEndTime;
          if (timeSinceCompositionEnd < 100) {
            log(`Skipping (compositionend was ${timeSinceCompositionEnd}ms ago)`);
            return;
          }

          // Skip if a keydown just fired (within 50ms)
          // This means xterm.js already handled it via keyboard input path
          // 如果 keydown 刚触发（50ms 内），跳过
          // 这意味着 xterm.js 已经通过键盘输入路径处理了它
          const timeSinceKeyDown = Date.now() - lastKeyDownTime;
          if (timeSinceKeyDown < 50) {
            log(`Skipping (keydown was ${timeSinceKeyDown}ms ago)`);
            return;
          }

          // At this point, input was NOT from keyboard (no recent keydown)
          // This is likely Chinese punctuation that xterm.js dropped
          log('Recovering dropped input:', ev.data);

          if (self._core && self._core.coreService) {
            self._core.coreService.triggerDataEvent(ev.data, true);
          }
        }, false);

      }, 0);
    };
  }
}

export { PatchedTerminal as Terminal };
