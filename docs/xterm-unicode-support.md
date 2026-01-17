# xterm.js Unicode Multi-Language Support

## Overview 概述

This document describes the implementation of full Unicode and multi-language support for xterm.js in the WebTmux project.

本文档描述了 WebTmux 项目中 xterm.js 完整 Unicode 和多语言支持的实现。

## Problem 问题

The original xterm.js configuration had poor Chinese character support due to:

原始 xterm.js 配置的中文字符支持不佳，原因如下：

1. **Missing Unicode11 Addon** - xterm.js defaults to Unicode 6 wcwidth implementation, which incorrectly calculates CJK character widths
   > 缺少 Unicode11 插件 - xterm.js 默认使用 Unicode 6 的 wcwidth 实现，无法正确计算 CJK 字符宽度

2. **Inadequate Font Stack** - The font-family only included Latin monospace fonts without CJK support
   > 字体栈不足 - font-family 只包含拉丁文等宽字体，不支持 CJK

3. **No IME Support** - Input Method Editor elements were not styled consistently
   > 无 IME 支持 - 输入法编辑器元素样式不一致

## Solution 解决方案

### 1. Unicode11 Addon Integration

Added `@xterm/addon-unicode11` to enable Unicode 11 character width calculation:

```javascript
import { Unicode11Addon } from '@xterm/addon-unicode11';

const unicode11Addon = new Unicode11Addon();
terminal.loadAddon(unicode11Addon);
terminal.unicode.activeVersion = '11';
```

### 2. Multi-Language Font Stack

Implemented a comprehensive font-family that covers:

| Category 分类 | Fonts 字体 |
|--------------|-----------|
| Modern Monospace | Cascadia Mono, JetBrains Mono, Fira Code, SF Mono |
| Classic Monospace | Menlo, Monaco, Consolas, DejaVu Sans Mono |
| CJK Simplified Chinese | Noto Sans Mono CJK SC, Source Han Mono SC |
| CJK Traditional Chinese | Source Han Mono TC |
| CJK Japanese | Noto Sans Mono CJK JP, Source Han Mono JP |
| CJK Korean | Noto Sans Mono CJK KR, Source Han Mono KR |
| Emoji | Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji |

### 3. CSS Variable for Font Consistency

```css
:root {
    --xterm-font-family: "Cascadia Mono", "JetBrains Mono", ...;
}

.terminal,
.xterm .xterm-helper-textarea,
.xterm .composition-view,
.xterm-overlay {
    font-family: var(--xterm-font-family);
    font-variant-ligatures: none;
}
```

### 4. WebGL Context Loss Handling

Added error handling for WebGL renderer:

```javascript
try {
    const webglAddon = new WebglAddon();
    webglAddon.onContextLoss(() => {
        console.warn('WebGL context lost, falling back to canvas renderer.');
        webglAddon.dispose();
    });
    terminal.loadAddon(webglAddon);
} catch (e) {
    console.warn('WebGL addon not supported:', e);
}
```

## Files Modified 修改的文件

| File | Description |
|------|-------------|
| `package.json` | Added @xterm/addon-unicode11 dependency |
| `js/package.json` | Added @xterm/addon-unicode11 dependency |
| `js/src/xterm.tsx` | Unicode11 addon + font handling + WebGL fallback |
| `resources/js/webtmux.js` | Unicode11 addon + font handling + WebGL fallback |
| `resources/xterm_customize.css` | CSS variables + multi-language font stack |
| `resources/index.html` | Added unicode11 to importmap |
| `scripts/build-vendor.mjs` | Build unicode11 vendor bundle |
| `scripts/entries/xterm-addon-unicode11.js` | Entry file for esbuild |

## Language Coverage 语言覆盖

This implementation supports:

- **Latin scripts**: English, French, German, Spanish, etc.
- **CJK**: Chinese (Simplified & Traditional), Japanese, Korean
- **Emoji**: Full emoji support via system emoji fonts
- **Other scripts**: Arabic, Cyrillic, etc. (via system fonts)

## Dependencies 依赖

```json
{
  "@xterm/addon-unicode11": "^0.8.0",
  "@xterm/xterm": "^5.5.0",
  "@xterm/addon-fit": "^0.10.0",
  "@xterm/addon-webgl": "^0.18.0"
}
```

## References 参考资料

- [xterm.js Unicode handling](https://github.com/xtermjs/xterm.js/issues/1709)
- [xterm.js Chinese character issues](https://github.com/xtermjs/xterm.js/issues/2592)
- [xterm.js encoding guide](https://xtermjs.org/docs/guides/encoding/)
