#!/bin/bash
#
# WebTmux Installer
# Automatically detects OS/architecture and installs webtmux with systemd/launchd service
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash
#
# Or with custom options:
#   curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash -s -- --no-service
#

set -e

REPO="mylukin/webtmux"
INSTALL_DIR="/usr/local/bin"
BINARY_NAME="webtmux"
SERVICE_NAME="webtmux"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
INSTALL_SERVICE=true
TMUX_SESSION="main"

while [[ $# -gt 0 ]]; do
    case $1 in
        --no-service)
            INSTALL_SERVICE=false
            shift
            ;;
        --session)
            TMUX_SESSION="$2"
            shift 2
            ;;
        --help)
            echo "WebTmux Installer"
            echo ""
            echo "Usage: install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --no-service    Don't install as a system service"
            echo "  --session NAME  Tmux session name (default: main)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect OS
detect_os() {
    case "$(uname -s)" in
        Linux*)  echo "linux" ;;
        Darwin*) echo "darwin" ;;
        FreeBSD*) echo "freebsd" ;;
        *)       echo "unknown" ;;
    esac
}

# Detect architecture
detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "amd64" ;;
        aarch64|arm64) echo "arm64" ;;
        armv7l|armv6l) echo "arm" ;;
        *)            echo "unknown" ;;
    esac
}

# Get latest release version
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | \
        grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/'
}

# Download and install binary
install_binary() {
    local os=$1
    local arch=$2
    local version=$3

    local filename="${BINARY_NAME}-${os}-${arch}.tar.gz"
    local download_url="https://github.com/${REPO}/releases/download/${version}/${filename}"

    log_info "Downloading ${filename}..."

    local tmp_dir=$(mktemp -d)
    trap "rm -rf ${tmp_dir}" EXIT

    if ! curl -fsSL "${download_url}" -o "${tmp_dir}/${filename}"; then
        log_error "Failed to download ${download_url}"
        exit 1
    fi

    log_info "Extracting..."
    tar -xzf "${tmp_dir}/${filename}" -C "${tmp_dir}"

    log_info "Installing to ${INSTALL_DIR}/${BINARY_NAME}..."
    sudo mv "${tmp_dir}/${BINARY_NAME}-${os}-${arch}" "${INSTALL_DIR}/${BINARY_NAME}"
    sudo chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

    log_success "Binary installed successfully"
}

# Install systemd service (Linux)
install_systemd_service() {
    local user=$(whoami)
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"

    log_info "Creating systemd service..."

    sudo tee "${service_file}" > /dev/null << EOF
[Unit]
Description=WebTmux - Web-based terminal with tmux support
After=network.target

[Service]
Type=simple
User=${user}
ExecStart=${INSTALL_DIR}/${BINARY_NAME} -w tmux new-session -A -s ${TMUX_SESSION}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}

    log_success "Systemd service installed"
    log_info "Start with: sudo systemctl start ${SERVICE_NAME}"
    log_info "View logs: sudo journalctl -u ${SERVICE_NAME} -f"
}

# Install launchd service (macOS)
install_launchd_service() {
    local user=$(whoami)
    local plist_file="${HOME}/Library/LaunchAgents/com.webtmux.plist"

    log_info "Creating launchd service..."

    mkdir -p "${HOME}/Library/LaunchAgents"

    cat > "${plist_file}" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.webtmux</string>
    <key>ProgramArguments</key>
    <array>
        <string>${INSTALL_DIR}/${BINARY_NAME}</string>
        <string>-w</string>
        <string>tmux</string>
        <string>new-session</string>
        <string>-A</string>
        <string>-s</string>
        <string>${TMUX_SESSION}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/webtmux.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/webtmux.error.log</string>
</dict>
</plist>
EOF

    launchctl unload "${plist_file}" 2>/dev/null || true
    launchctl load "${plist_file}"

    log_success "Launchd service installed"
    log_info "Start with: launchctl start com.webtmux"
    log_info "Stop with: launchctl stop com.webtmux"
    log_info "View logs: tail -f /tmp/webtmux.log"
}

# Main installation
main() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║       WebTmux Installer                ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
    echo ""

    # Check for required tools
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi

    if ! command -v tmux &> /dev/null; then
        log_warn "tmux is not installed. WebTmux requires tmux to run."
    fi

    # Detect platform
    local os=$(detect_os)
    local arch=$(detect_arch)

    if [[ "$os" == "unknown" ]]; then
        log_error "Unsupported operating system: $(uname -s)"
        exit 1
    fi

    if [[ "$arch" == "unknown" ]]; then
        log_error "Unsupported architecture: $(uname -m)"
        exit 1
    fi

    log_info "Detected platform: ${os}/${arch}"

    # Get latest version
    local version=$(get_latest_version)
    if [[ -z "$version" ]]; then
        log_error "Failed to get latest version"
        exit 1
    fi

    log_info "Latest version: ${version}"

    # Install binary
    install_binary "$os" "$arch" "$version"

    # Verify installation
    if ${INSTALL_DIR}/${BINARY_NAME} --version &> /dev/null; then
        log_success "Verified: $(${INSTALL_DIR}/${BINARY_NAME} --version 2>&1 || echo 'webtmux installed')"
    fi

    # Install service if requested
    if [[ "$INSTALL_SERVICE" == true ]]; then
        case "$os" in
            linux)
                if command -v systemctl &> /dev/null; then
                    install_systemd_service
                else
                    log_warn "systemctl not found, skipping service installation"
                fi
                ;;
            darwin)
                install_launchd_service
                ;;
            *)
                log_warn "Service installation not supported for ${os}"
                ;;
        esac
    fi

    echo ""
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
    echo "Quick start:"
    echo "  ${INSTALL_DIR}/${BINARY_NAME} -w tmux new-session -A -s main"
    echo ""
    echo "Then open: http://localhost:8080"
    echo ""
}

main "$@"
