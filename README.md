# webtmux

A web-based terminal with tmux-specific features. Access your tmux sessions from any browser with a visual pane layout, touch-friendly controls, and automatic scroll-to-copy-mode.

## Features

### Core Features
- **Visual Pane Layout**: Sidebar minimap shows your tmux pane arrangement - click to switch panes
- **Window Tabs**: Quick window switching via clickable tabs
- **Touch-Friendly**: Mobile controls for split, new window, and pane switching
- **Scroll-to-Copy-Mode**: Scroll up automatically enters tmux copy mode
- **Secure by Default**: HTTP Basic Auth with auto-generated credentials
- **Single Binary**: All assets embedded - just download and run
- **Real-time Updates**: Layout changes sync automatically

### WebTransport Support
- **QUIC/WebTransport**: Lower latency transport using HTTP/3 over UDP
- **Automatic Fallback**: Falls back to WebSocket for Safari and older browsers
- **Single Port**: WebSocket (TCP) and WebTransport (UDP) share the same port
- **Better Performance**: Faster recovery from packet loss on poor networks

### Customizable Keyboard Shortcuts
- **Shortcuts Bar**: Customizable keyboard shortcuts bar for quick actions
- **Improved Touch Targets**: Better tablet support (iPad Mini landscape optimized)
- **Close Pane Button**: Easy pane management from mobile controls

## Installation

### One-Line Install

```bash
# Install and set up as a system service (will prompt for password)
curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash
```

### Download from Releases

Download the latest release from [GitHub Releases](https://github.com/mylukin/webtmux/releases):

| Platform | Architecture | File |
|----------|-------------|------|
| Linux | x64 | `webtmux-linux-amd64.tar.gz` |
| Linux | ARM64 | `webtmux-linux-arm64.tar.gz` |
| Linux | ARM | `webtmux-linux-arm.tar.gz` |
| macOS | Intel | `webtmux-darwin-amd64.tar.gz` |
| macOS | Apple Silicon | `webtmux-darwin-arm64.tar.gz` |
| FreeBSD | x64 | `webtmux-freebsd-amd64.tar.gz` |

```bash
# Example: Download and install on Linux x64
curl -fsSL https://github.com/mylukin/webtmux/releases/latest/download/webtmux-linux-amd64.tar.gz | tar -xz
sudo mv webtmux-linux-amd64 /usr/local/bin/webtmux
```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/mylukin/webtmux.git
cd webtmux

# Install frontend dependencies
npm install

# Build for current platform
make build

# Or cross-compile for all platforms
make cross-compile
```

## Usage

### Basic Usage

```bash
# Start with tmux (auto-generates credentials)
webtmux -w tmux new-session -A -s main

# Output:
# ========================================
#   Authentication Required (default)
#   Username: admin
#   Password: <random-32-char-password>
# ========================================
```

### Custom Credentials

```bash
webtmux -w -c user:password tmux new-session -A -s main
```

### Enable WebTransport (requires TLS)

```bash
# With auto-generated TLS certificate
webtmux -w --tls --webtransport tmux new-session -A -s main

# With custom TLS certificates
webtmux -w --tls --tls-crt server.crt --tls-key server.key --webtransport tmux new-session -A -s main
```

### Disable Authentication (not recommended)

```bash
webtmux -w --no-auth tmux new-session -A -s main
```

### Common Options

| Flag | Description |
|------|-------------|
| `-w, --permit-write` | Allow input to the terminal (required for interactive use) |
| `-p, --port PORT` | Port to listen on (default: 8080) |
| `-a, --address ADDR` | Address to bind to (default: 0.0.0.0) |
| `-c, --credential USER:PASS` | Set custom credentials for HTTP Basic Auth |
| `--no-auth` | Disable authentication (NOT RECOMMENDED) |
| `--auth-ip-binding` | Bind auth tokens to client IP (set false behind proxies) |
| `-t, --tls` | Enable TLS/SSL |
| `--tls-crt FILE` | TLS certificate file |
| `--tls-key FILE` | TLS key file |
| `--webtransport` | Enable WebTransport (requires TLS) |
| `--ws-origin REGEX` | Regex for allowed WebSocket origins |
| `-r, --random-url` | Add random string to URL path |
| `--reconnect` | Enable automatic reconnection |
| `--once` | Accept only one client, then exit |

Run `webtmux --help` for all available options.

## Browser Compatibility

| Browser | WebTransport | WebSocket |
|---------|-------------|-----------|
| Chrome 97+ | ✅ | ✅ |
| Edge 98+ | ✅ | ✅ |
| Firefox 115+ | ✅ | ✅ |
| Safari | ❌ (auto-fallback) | ✅ |
| iOS Safari | ❌ (auto-fallback) | ✅ |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser                    Server (Go)              Backend    │
│  ┌──────────┐              ┌──────────────┐        ┌─────────┐ │
│  │ xterm.js │              │ handlers.go  │        │ PTY     │ │
│  │ Lit.js   │              │              │        │ Slave   │ │
│  │ Sidebar  │              │ Transport    │        │         │ │
│  │          │              │ (io.ReadWriter)       │         │ │
│  │ Transport│              │   │          │        │  tmux   │ │
│  │ Factory  │              │   ├─ WS ─────│──TCP───│         │ │
│  │          │              │   └─ WT ─────│──UDP───│         │ │
│  └──────────┘              └──────────────┘        └─────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Extended WebSocket/WebTransport Protocol

WebTmux extends the gotty protocol with tmux-specific message types:

**Client -> Server:**
- `5` TmuxSelectPane - Switch to pane by ID
- `6` TmuxSelectWindow - Switch to window by ID
- `7` TmuxSplitPane - Split current pane (h/v)
- `8` TmuxClosePane - Close pane by ID
- `9` TmuxCopyMode - Enter/exit copy mode
- `A` TmuxSendCommand - Raw tmux command
- `B` TmuxScrollUp - Scroll up in copy mode
- `C` TmuxScrollDown - Scroll down in copy mode
- `D` TmuxNewWindow - Create new window
- `E` TmuxSwitchSession - Switch session by name

**Server -> Client:**
- `7` TmuxLayoutUpdate - Full layout JSON
- `8` TmuxPaneOutput - Tmux pane-specific output
- `9` TmuxModeUpdate - Copy mode state
- `A` TmuxSessionInfo - Tmux session info
- `B` TmuxError - Tmux error

## Development

### Project Structure

```
webtmux/
├── main.go                 # CLI entry point
├── package.json            # Frontend build dependencies (Tailwind, esbuild)
├── tailwind.config.js      # Tailwind CSS configuration
├── server/                 # HTTP server & WebSocket/WebTransport handlers
│   ├── transport.go        # Transport interface abstraction
│   ├── ws_wrapper.go       # WebSocket transport
│   ├── wt_wrapper.go       # WebTransport wrapper
│   └── wt_server.go        # WebTransport server (QUIC/HTTP3)
├── webtty/                 # WebTTY protocol implementation
├── pkg/tmux/               # Tmux controller
├── backend/localcommand/   # PTY backend
├── scripts/                # Build scripts
│   ├── build-vendor.mjs    # esbuild script for vendor bundles
│   └── entries/            # ESM entry points for bundling
├── bindata/static/         # Embedded web assets (copied from resources/)
│   ├── css/
│   │   ├── tailwind.css    # Compiled Tailwind CSS
│   │   ├── xterm.css       # xterm.js styles
│   │   └── index.css       # Additional styles
│   ├── js/
│   │   ├── gotty.js        # Transport layer (WebSocket/WebTransport)
│   │   ├── webtmux.js      # Main frontend logic
│   │   ├── vendor/         # Bundled npm packages (lit, xterm)
│   │   ├── components/     # Lit.js web components
│   │   └── services/       # Frontend services
│   ├── index.html
│   ├── manifest.json       # PWA manifest
│   └── favicon.ico         # Favicon
├── js/                     # TypeScript source for gotty.js
│   ├── src/                # TypeScript source
│   │   ├── main.ts         # Entry point
│   │   ├── transport.ts    # Transport interface
│   │   ├── websocket.ts    # WebSocket implementation
│   │   └── webtransport.ts # WebTransport implementation
│   └── webpack.config.js   # Webpack config
└── resources/              # Source static assets
    ├── css/
    │   ├── tailwind.css    # Tailwind directives (source)
    │   └── tailwind-out.css # Compiled Tailwind output
    ├── js/
    │   ├── webtmux.js      # Main frontend logic
    │   ├── vendor/         # Generated vendor bundles
    │   ├── components/     # Lit.js components
    │   └── services/       # Frontend services (shortcuts, etc.)
    ├── index.html          # HTML template
    ├── manifest.json       # PWA manifest
    └── icon.svg            # App icon
```

### Building

```bash
# Install frontend dependencies (first time only)
npm install

# Production build (builds CSS, vendor bundles, and Go binary)
make build

# Development build (copies fresh assets)
make dev

# Cross-compile all platforms
make cross-compile

# Create release archives
make release

# Run tests
make test
```

### Tech Stack

- **Backend**: Go, gorilla/websocket, quic-go/webtransport-go
- **Frontend**: xterm.js, Lit.js, Tailwind CSS
- **Build Tools**: esbuild (vendor bundling), Tailwind CLI
- **Embedded Assets**: Go 1.16+ embed directive
- **Transport**: WebSocket (TCP), WebTransport (UDP/QUIC)

## Credits

WebTmux is a fork of [gotty](https://github.com/yudai/gotty) by Iwasaki Yudai.

## License

MIT License - See [LICENSE](LICENSE) file for details.
