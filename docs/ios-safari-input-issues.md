# iOS Safari Input Issues

## Overview 概述

This document describes known issues with text input on iOS Safari and their current status.

本文档描述了 iOS Safari 上文本输入的已知问题及其当前状态。

## Fixed Issues 已修复的问题

### Chinese Punctuation Input 中文标点输入

**Status: FIXED ✅**

**Problem 问题:**
Chinese punctuation (，。！？：；""'') and spaces after Chinese characters were not being input on iOS Safari.

中文标点符号（，。！？：；""''）和中文后的空格在 iOS Safari 上无法输入。

**Root Cause 根本原因:**
xterm.js `_inputEvent()` method has a condition `(!ev.composed || !this._keyDownSeen)` that incorrectly drops input on iOS Safari because:
1. iOS Safari fires `keydown` (setting `_keyDownSeen=true`)
2. Then fires `input` event with `ev.composed=true`
3. But NO composition events are triggered for punctuation
4. The condition fails, input is dropped

xterm.js 的 `_inputEvent()` 方法有一个条件 `(!ev.composed || !this._keyDownSeen)`，在 iOS Safari 上错误地丢弃输入，因为：
1. iOS Safari 触发 `keydown`（设置 `_keyDownSeen=true`）
2. 然后触发 `input` 事件，`ev.composed=true`
3. 但标点符号不触发任何 composition 事件
4. 条件失败，输入被丢弃

**Solution 解决方案:**
Added a workaround patch in `scripts/entries/xterm.js` that:
1. Listens for input events in bubble phase (after xterm.js)
2. If xterm.js didn't handle the input (not defaultPrevented)
3. And we're not in composition mode
4. Manually send the input via `triggerDataEvent()`

在 `scripts/entries/xterm.js` 中添加了一个变通补丁：
1. 在冒泡阶段监听 input 事件（在 xterm.js 之后）
2. 如果 xterm.js 没有处理输入（没有 defaultPrevented）
3. 并且我们不在组合模式中
4. 通过 `triggerDataEvent()` 手动发送输入

**Related:**
- PR submitted to xterm.js: https://github.com/xtermjs/xterm.js/pull/5614
- Issues: https://github.com/xtermjs/xterm.js/issues/3070, https://github.com/xtermjs/xterm.js/issues/4486

---

## Known Issues 已知问题

### Emoji Input on iOS Safari - iOS Safari 上的 Emoji 输入

**Status: PARTIALLY FIXED / NEEDS INVESTIGATION ⚠️**

**Problem 问题:**
When inputting emoji on iOS Safari, the emoji appears incorrectly - possibly showing as 3 bytes or rendering incorrectly. It's unclear if this is a rendering issue or an input issue.

在 iOS Safari 上输入 emoji 时，emoji 显示不正确 - 可能显示为 3 个字节或渲染不正确。不清楚这是渲染问题还是输入问题。

**Current Behavior 当前行为:**
- Chinese characters: ✅ Working
- Chinese punctuation: ✅ Working
- Spaces after Chinese: ✅ Working
- Emoji: ⚠️ Shows incorrect bytes/characters

**Attempted Fixes 尝试过的修复:**

1. **Composition timing check**: Skip input events within 100ms of `compositionend`
   - Prevents simple duplication but doesn't fix byte encoding issue

2. **Internal `_isSendingComposition` check**: Tried accessing xterm.js internal state
   - Unreliable in minified bundle (property names are mangled)

3. **Using patched xterm.js from source**: Built xterm.js 6.0.0 with fix
   - Caused keyboard to not appear (API incompatibility with xterm 5.5.0)

**Possible Causes 可能的原因:**

1. **UTF-16 surrogate pair handling**: Emoji are often represented as surrogate pairs in JavaScript. The 3-byte issue suggests possible UTF-8/UTF-16 encoding mismatch.

2. **CompositionHelper data handling**: The CompositionHelper might be sending partial emoji data.

3. **Rendering issue**: The terminal renderer might not be correctly handling multi-codepoint emoji.

**Investigation Needed 需要调查:**

1. Capture the exact bytes being sent from frontend to backend when emoji is input
2. Compare with expected UTF-8 encoding for the emoji
3. Check if the issue is in:
   - Frontend input capture
   - WebSocket transmission
   - Backend processing
   - Terminal rendering

**Debug Steps 调试步骤:**

1. Enable debug mode in xterm.js patch:
   ```javascript
   const DEBUG = true; // in scripts/entries/xterm.js
   ```

2. Check browser console for `[xterm-ios-fix]` logs

3. Check backend debug output for received bytes

4. Compare emoji UTF-8 encoding:
   - 😀 should be: `F0 9F 98 80` (4 bytes)
   - If seeing 3 bytes, there's an encoding issue

**Workaround 临时解决方案:**

Until this issue is fully resolved, users on iOS Safari should:
- Use text-based emoticons instead of emoji
- Or copy/paste emoji from other sources

---

## Technical Details 技术细节

### Files Modified 修改的文件

| File | Purpose |
|------|---------|
| `scripts/entries/xterm.js` | iOS input fix wrapper for Terminal class |
| `resources/js/vendor/xterm.js` | Built vendor bundle with patch |

### Event Flow on iOS Safari - iOS Safari 上的事件流

**Chinese Punctuation (Fixed):**
```
keydown (key=229) → input (composed=true, data="，") → [xterm drops] → [our patch recovers]
```

**Emoji (Issue):**
```
compositionstart → compositionupdate → compositionend → input (composed=true)
                                                      ↓
                                            [timing issue causes problems]
```

### xterm.js PR Status

PR: https://github.com/xtermjs/xterm.js/pull/5614

The PR adds `isSendingComposition` getter to CompositionHelper and updates the `_inputEvent()` condition to check both `isComposing` and `isSendingComposition`.

Once merged, the workaround patch in this project can be removed.

---

## References 参考资料

- [xterm.js Issue #3070](https://github.com/xtermjs/xterm.js/issues/3070) - iOS Safari input issues
- [xterm.js Issue #4486](https://github.com/xtermjs/xterm.js/issues/4486) - Related composition issues
- [MDN: CompositionEvent](https://developer.mozilla.org/en-US/docs/Web/API/CompositionEvent)
- [Unicode Emoji Encoding](https://unicode.org/emoji/charts/full-emoji-list.html)
