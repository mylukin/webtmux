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
#   curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash -s -- --no-auth
#   curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash -s -- --password mypassword
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
AUTH_MODE=""          # "", "no-auth", or "password"
AUTH_PASSWORD=""
AUTH_USERNAME="admin"
LISTEN_ADDR="0.0.0.0"
LISTEN_PORT=8080
INTERACTIVE=true      # Enable interactive mode by default

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
        --no-auth)
            AUTH_MODE="no-auth"
            INTERACTIVE=false
            shift
            ;;
        --password)
            AUTH_MODE="password"
            AUTH_PASSWORD="$2"
            INTERACTIVE=false
            shift 2
            ;;
        --user)
            AUTH_USERNAME="$2"
            shift 2
            ;;
        --non-interactive)
            INTERACTIVE=false
            shift
            ;;
        --port)
            LISTEN_PORT="$2"
            shift 2
            ;;
        --help)
            echo "WebTmux Installer"
            echo ""
            echo "Usage: install.sh [options]"
            echo ""
            echo "Options:"
            echo "  --no-service       Don't install as a system service"
            echo "  --session NAME     Tmux session name (default: main)"
            echo "  --port PORT        Listen port (default: 8080)"
            echo "  --no-auth          Disable authentication (NOT RECOMMENDED)"
            echo "  --password PASS    Set authentication password"
            echo "  --user USERNAME    Set authentication username (default: admin)"
            echo "  --non-interactive  Skip interactive prompts (use defaults)"
            echo "  --help             Show this help message"
            echo ""
            echo "Examples:"
            echo "  # Interactive installation (will prompt for auth settings)"
            echo "  curl -fsSL https://...install.sh | bash"
            echo ""
            echo "  # Install with specific password"
            echo "  curl -fsSL https://...install.sh | bash -s -- --password mysecret"
            echo ""
            echo "  # Install without authentication (not recommended)"
            echo "  curl -fsSL https://...install.sh | bash -s -- --no-auth"
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

# Check if running in interactive mode (stdin is a terminal)
is_interactive_terminal() {
    [[ -t 0 ]]
}

# Prompt user for authentication choice
prompt_auth_choice() {
    if [[ "$INTERACTIVE" != true ]] || ! is_interactive_terminal; then
        return
    fi

    # Skip if auth mode already set via command line
    if [[ -n "$AUTH_MODE" ]]; then
        return
    fi

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       Authentication Setup             ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "WebTmux can require authentication to access the terminal."
    echo "This is HIGHLY RECOMMENDED for security."
    echo ""
    echo "Options:"
    echo "  1) Enable authentication (recommended)"
    echo "  2) Disable authentication (NOT recommended)"
    echo ""

    while true; do
        read -p "Choose an option [1/2] (default: 1): " choice </dev/tty
        case "${choice:-1}" in
            1)
                AUTH_MODE="password"
                prompt_password
                break
                ;;
            2)
                echo ""
                echo -e "${YELLOW}WARNING: Disabling authentication exposes your terminal to anyone!${NC}"
                read -p "Are you sure? (yes/no): " confirm </dev/tty
                if [[ "$confirm" == "yes" ]]; then
                    AUTH_MODE="no-auth"
                    log_warn "Authentication disabled"
                else
                    echo "Cancelled. Please choose again."
                fi
                break
                ;;
            *)
                echo "Invalid option. Please enter 1 or 2."
                ;;
        esac
    done
}

# Prompt user for password with confirmation
prompt_password() {
    echo ""
    echo "Please set a password for authentication."
    echo "Username will be: ${AUTH_USERNAME}"
    echo ""

    while true; do
        # Read password (hidden input)
        read -s -p "Enter password: " password1 </dev/tty
        echo ""

        if [[ -z "$password1" ]]; then
            echo -e "${RED}Password cannot be empty. Please try again.${NC}"
            continue
        fi

        if [[ ${#password1} -lt 6 ]]; then
            echo -e "${RED}Password must be at least 6 characters. Please try again.${NC}"
            continue
        fi

        read -s -p "Confirm password: " password2 </dev/tty
        echo ""

        if [[ "$password1" != "$password2" ]]; then
            echo -e "${RED}Passwords do not match. Please try again.${NC}"
            continue
        fi

        AUTH_PASSWORD="$password1"
        log_success "Password set successfully"
        break
    done
}

# Build authentication flags for webtmux command
build_auth_flags() {
    local flags=""
    if [[ "$AUTH_MODE" == "no-auth" ]]; then
        flags="--no-auth"
    elif [[ "$AUTH_MODE" == "password" ]] && [[ -n "$AUTH_PASSWORD" ]]; then
        flags="-c ${AUTH_USERNAME}:${AUTH_PASSWORD}"
    fi
    echo "$flags"
}

# Check if a port is available
check_port_available() {
    local port=$1
    if command -v lsof &> /dev/null; then
        ! lsof -i ":${port}" &> /dev/null
    elif command -v ss &> /dev/null; then
        ! ss -tuln | grep -q ":${port} "
    elif command -v netstat &> /dev/null; then
        ! netstat -tuln | grep -q ":${port} "
    else
        # If no tool available, assume port is available
        return 0
    fi
}

# Find next available port starting from given port
find_available_port() {
    local port=$1
    local max_tries=100
    local try=0

    while [[ $try -lt $max_tries ]]; do
        if check_port_available "$port"; then
            echo "$port"
            return 0
        fi
        ((port++))
        ((try++))
    done

    echo "$1"  # Return original if no available port found
    return 1
}

# Prompt user for port selection
prompt_port() {
    if [[ "$INTERACTIVE" != true ]] || ! is_interactive_terminal; then
        return
    fi

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       Port Configuration               ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo "Listen address: ${LISTEN_ADDR}"
    echo "Default port: ${LISTEN_PORT}"
    echo ""

    # Check if default port is available
    if ! check_port_available "$LISTEN_PORT"; then
        local suggested_port=$(find_available_port "$LISTEN_PORT")
        echo -e "${YELLOW}Port ${LISTEN_PORT} is already in use.${NC}"
        echo -e "Suggested available port: ${GREEN}${suggested_port}${NC}"
        LISTEN_PORT="$suggested_port"
    else
        echo -e "Port ${LISTEN_PORT} is ${GREEN}available${NC}."
    fi

    echo ""
    while true; do
        read -p "Enter port [${LISTEN_PORT}]: " input_port </dev/tty
        input_port="${input_port:-$LISTEN_PORT}"

        # Validate port number
        if ! [[ "$input_port" =~ ^[0-9]+$ ]]; then
            echo -e "${RED}Invalid port number. Please enter a number.${NC}"
            continue
        fi

        if [[ "$input_port" -lt 1 || "$input_port" -gt 65535 ]]; then
            echo -e "${RED}Port must be between 1 and 65535.${NC}"
            continue
        fi

        if [[ "$input_port" -lt 1024 ]] && [[ $(id -u) -ne 0 ]]; then
            echo -e "${YELLOW}Warning: Ports below 1024 require root privileges.${NC}"
        fi

        # Check if the chosen port is available
        if ! check_port_available "$input_port"; then
            echo -e "${RED}Port ${input_port} is already in use.${NC}"
            local next_port=$(find_available_port "$input_port")
            echo -e "Try port ${GREEN}${next_port}${NC}?"
            continue
        fi

        LISTEN_PORT="$input_port"
        log_success "Port set to ${LISTEN_PORT}"
        break
    done
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
    local auth_flags=$(build_auth_flags)

    log_info "Creating systemd service..."

    # Build ExecStart command with all flags
    local exec_cmd="${INSTALL_DIR}/${BINARY_NAME}"
    exec_cmd="${exec_cmd} -a ${LISTEN_ADDR} -p ${LISTEN_PORT}"
    if [[ -n "$auth_flags" ]]; then
        exec_cmd="${exec_cmd} ${auth_flags}"
    fi
    exec_cmd="${exec_cmd} -w tmux new-session -A -s ${TMUX_SESSION}"

    sudo tee "${service_file}" > /dev/null << EOF
[Unit]
Description=WebTmux - Web-based terminal with tmux support
After=network.target

[Service]
Type=simple
User=${user}
ExecStart=${exec_cmd}
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

    # Build auth arguments for plist
    local auth_args=""
    if [[ "$AUTH_MODE" == "no-auth" ]]; then
        auth_args="        <string>--no-auth</string>"
    elif [[ "$AUTH_MODE" == "password" ]] && [[ -n "$AUTH_PASSWORD" ]]; then
        auth_args="        <string>-c</string>
        <string>${AUTH_USERNAME}:${AUTH_PASSWORD}</string>"
    fi

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
        <string>-a</string>
        <string>${LISTEN_ADDR}</string>
        <string>-p</string>
        <string>${LISTEN_PORT}</string>
${auth_args:+$auth_args
}        <string>-w</string>
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

    # Prompt for authentication settings (interactive mode only)
    prompt_auth_choice

    # Prompt for port configuration (interactive mode only)
    prompt_port

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

    # Display configuration
    echo "Configuration:"
    echo "  Listen: ${LISTEN_ADDR}:${LISTEN_PORT}"

    if [[ "$AUTH_MODE" == "no-auth" ]]; then
        echo -e "  Auth: ${YELLOW}DISABLED (not recommended)${NC}"
    elif [[ "$AUTH_MODE" == "password" ]] && [[ -n "$AUTH_PASSWORD" ]]; then
        echo -e "  Auth: ${GREEN}ENABLED${NC} (${AUTH_USERNAME}:****)"
    else
        echo -e "  Auth: ${BLUE}Default (random password at runtime)${NC}"
    fi
    echo ""

    # Build quick start command
    local auth_flags=$(build_auth_flags)
    local quick_cmd="${INSTALL_DIR}/${BINARY_NAME} -a ${LISTEN_ADDR} -p ${LISTEN_PORT}"
    if [[ -n "$auth_flags" ]]; then
        quick_cmd="${quick_cmd} ${auth_flags}"
    fi
    quick_cmd="${quick_cmd} -w tmux new-session -A -s main"

    echo "Quick start:"
    echo "  ${quick_cmd}"
    echo ""
    echo "Then open: http://localhost:${LISTEN_PORT}"
    echo ""
}

main "$@"
