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

// Check if we're on a mobile/touch device
const isMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    navigator.maxTouchPoints > 1;
};

// Create a patched Terminal class
class PatchedTerminal extends OriginalTerminal {
  constructor(options) {
    super(options);

    // Only apply patch on mobile devices
    if (isMobile()) {
      this._applyIOSInputFix();
    }
  }

  _applyIOSInputFix() {
    const self = this;

    // Wait for the terminal to be opened and have a textarea
    const originalOpen = this.open.bind(this);
    this.open = function(parent) {
      originalOpen(parent);

      // After opening, patch the input handling
      setTimeout(() => {
        const textarea = parent.querySelector('.xterm-helper-textarea');
        if (!textarea) return;

        // Track composition state ourselves (more reliable than internal properties)
        let isInComposition = false;
        let compositionEndTime = 0;

        // Listen for composition events to track state
        textarea.addEventListener('compositionstart', () => {
          isInComposition = true;
          log('compositionstart');
        }, true);

        textarea.addEventListener('compositionend', () => {
          isInComposition = false;
          compositionEndTime = Date.now();
          log('compositionend');
        }, true);

        // Listen for input events and recover dropped characters
        // xterm.js uses capture phase, we use bubble phase (runs after)
        textarea.addEventListener('input', (ev) => {
          // Only handle insertText events with data
          if (ev.inputType !== 'insertText' || !ev.data) {
            return;
          }

          // If xterm.js handled it, the textarea value should be cleared
          // and the event may be default prevented
          if (ev.defaultPrevented) {
            log('Handled by xterm.js (defaultPrevented)');
            return;
          }

          // Skip if we're in an active composition
          // CompositionHelper will handle it
          if (isInComposition) {
            log('Skipping (in composition)');
            return;
          }

          // Skip if compositionend just fired (within 100ms)
          // This prevents emoji duplication - CompositionHelper sends via setTimeout(0)
          // 如果 compositionend 刚触发（100ms 内），跳过
          // 这防止了 emoji 重复 - CompositionHelper 通过 setTimeout(0) 发送
          const timeSinceCompositionEnd = Date.now() - compositionEndTime;
          if (timeSinceCompositionEnd < 100) {
            log(`Skipping (compositionend was ${timeSinceCompositionEnd}ms ago)`);
            return;
          }

          // At this point, xterm.js dropped the input due to:
          // ev.composed=true && _keyDownSeen=true (the bug)
          // We need to send it ourselves
          log('Recovering dropped input:', ev.data);

          if (self._core && self._core.coreService) {
            self._core.coreService.triggerDataEvent(ev.data, true);
          }
        }, false); // bubble phase

      }, 0);
    };
  }
}

export { PatchedTerminal as Terminal };
