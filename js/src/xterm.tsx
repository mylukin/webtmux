import { IDisposable, Terminal } from "xterm";
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { WebglAddon } from 'xterm-addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { ZModemAddon } from "./zmodem";

// Default font family with comprehensive CJK and emoji support
// 默认字体族，包含完整的 CJK 和 Emoji 支持
const DEFAULT_FONT_FAMILY = [
    '"Cascadia Mono"', '"JetBrains Mono"', '"Fira Code"', '"SF Mono"',
    'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"DejaVu Sans Mono"',
    '"Noto Sans Mono"',
    '"Noto Sans Mono CJK SC"', '"Noto Sans Mono CJK JP"', '"Noto Sans Mono CJK KR"',
    '"Source Han Mono SC"', '"Source Han Mono TC"', '"Source Han Mono JP"', '"Source Han Mono KR"',
    '"Apple Color Emoji"', '"Segoe UI Emoji"', '"Noto Color Emoji"', '"Twemoji Mozilla"',
    'monospace'
].join(', ');

export class OurXterm {
    // The HTMLElement that contains our terminal
    elem: HTMLElement;

    // The xtermjs.XTerm
    term: Terminal;

    resizeListener: () => void;

    message: HTMLElement;
    messageTimeout: number;
    messageTimer: NodeJS.Timeout;

    onResizeHandler: IDisposable;
    onDataHandler: IDisposable;

    fitAddOn: FitAddon;
    zmodemAddon: ZModemAddon;
    unicode11Addon: Unicode11Addon;
    webglAddon?: WebglAddon;
    toServer: (data: string | Uint8Array) => void;
    encoder: TextEncoder

    constructor(elem: HTMLElement) {
        this.elem = elem;
        this.term = new Terminal({
            fontFamily: this.resolveFontFamily()
        });
        this.fitAddOn = new FitAddon();
        this.zmodemAddon = new ZModemAddon({
            toTerminal: (x: Uint8Array) => this.term.write(x),
            toServer: (x: Uint8Array) => this.sendInput(x)
        });

        // Load Unicode11 addon for correct CJK character width calculation
        // 加载 Unicode11 插件以正确计算 CJK 字符宽度
        this.unicode11Addon = new Unicode11Addon();
        this.term.loadAddon(this.unicode11Addon);
        this.term.unicode.activeVersion = "11";

        this.term.loadAddon(new WebLinksAddon());
        this.term.loadAddon(this.fitAddOn);
        this.term.loadAddon(this.zmodemAddon);

        this.message = elem.ownerDocument.createElement("div");
        this.message.className = "xterm-overlay";
        this.messageTimeout = 2000;

        this.resizeListener = () => {
            this.fitAddOn.fit();
            this.term.scrollToBottom();
            this.showMessage(String(this.term.cols) + "x" + String(this.term.rows), this.messageTimeout);
        };

        this.term.open(elem);
        this.term.focus();
        this.resizeListener();

        window.addEventListener("resize", this.resizeListener);
    };

    // Resolve font family from CSS computed style or use default
    // 从 CSS 计算样式解析字体族，或使用默认值
    private resolveFontFamily(): string {
        const computed = window.getComputedStyle(this.elem).fontFamily;
        if (computed && computed !== "monospace") {
            return computed;
        }
        return DEFAULT_FONT_FAMILY;
    }

    // Enable WebGL renderer with context loss fallback
    // 启用 WebGL 渲染器，带上下文丢失回退
    private enableWebgl(): void {
        if (this.webglAddon) {
            return;
        }
        try {
            this.webglAddon = new WebglAddon();
            this.webglAddon.onContextLoss(() => {
                console.warn("WebGL context lost, falling back to canvas renderer.");
                this.webglAddon?.dispose();
                this.webglAddon = undefined;
            });
            this.term.loadAddon(this.webglAddon);
        } catch (error) {
            console.warn("Failed to initialize WebGL renderer, using canvas.", error);
            this.webglAddon?.dispose();
            this.webglAddon = undefined;
        }
    }

    // Disable WebGL renderer
    // 禁用 WebGL 渲染器
    private disableWebgl(): void {
        if (!this.webglAddon) {
            return;
        }
        this.webglAddon.dispose();
        this.webglAddon = undefined;
    }

    info(): { columns: number, rows: number } {
        return { columns: this.term.cols, rows: this.term.rows };
    };

    // This gets called from the Websocket's onReceive handler
    output(data: Uint8Array) {
        this.zmodemAddon.consume(data);
    };

    getMessage(): HTMLElement {
        return this.message;
    }

    showMessage(message: string, timeout: number) {
        this.message.innerHTML = message;
        this.showMessageElem(timeout);
    }

    showMessageElem(timeout: number) {
        this.elem.appendChild(this.message);

        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
        }
        if (timeout > 0) {
            this.messageTimer = setTimeout(() => {
                try {
                    this.elem.removeChild(this.message);
                } catch (error) {
                    console.error(error);
                }
            }, timeout);
        }
    };

    removeMessage(): void {
        if (this.message.parentNode == this.elem) {
            this.elem.removeChild(this.message);
        }
    }

    setWindowTitle(title: string) {
        document.title = title;
    };

    setPreferences(value: object) {
        Object.keys(value).forEach((key) => {
            if (key == "EnableWebGL") {
                if (value[key]) {
                    this.enableWebgl();
                } else {
                    this.disableWebgl();
                }
            } else if (key == "font-size") {
                this.term.options.fontSize = Number(value[key]);
                this.fitAddOn.fit();
            } else if (key == "font-family") {
                const nextFont = value[key] ? String(value[key]) : DEFAULT_FONT_FAMILY;
                this.term.options.fontFamily = nextFont;
                if (this.term.rows > 0) {
                    this.term.refresh(0, this.term.rows - 1);
                }
            }
        });
    };

    sendInput(data: Uint8Array) {
        return this.toServer(data)
    }

    onInput(callback: (input: string) => void) {
        this.encoder = new TextEncoder()
        this.toServer = callback;

        // I *think* we're ok like this, but if not, we can dispose
        // of the previous handler and put the new one in place.
        if (this.onDataHandler !== undefined) {
            return
        }

        this.onDataHandler = this.term.onData((input) => {
            this.toServer(this.encoder.encode(input));
        });
    };

    onResize(callback: (colmuns: number, rows: number) => void) {
        this.onResizeHandler = this.term.onResize(() => {
            callback(this.term.cols, this.term.rows);
        });
    };

    deactivate(): void {
        if (this.onDataHandler) {
            this.onDataHandler.dispose();
        }
        if (this.onResizeHandler) {
            this.onResizeHandler.dispose();
        }
        this.term.blur();
    }

    reset(): void {
        this.removeMessage();
        this.term.clear();
    }

    close(): void {
        window.removeEventListener("resize", this.resizeListener);
        this.term.dispose();
    }

    disableStdin(): void {
        this.term.options.disableStdin = true;
    }

    enableStdin(): void {
        this.term.options.disableStdin = false;
    }

    focus(): void {
        this.term.focus();
    }
}
