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
#
# Uninstall:
#   curl -fsSL https://raw.githubusercontent.com/mylukin/webtmux/main/install.sh | bash -s -- --uninstall
#

# Strict mode for better error handling
set -Eeo pipefail
shopt -s inherit_errexit 2>/dev/null || true

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
UNINSTALL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        --no-service)
            INSTALL_SERVICE=false
            shift
            ;;
        --session)
            # Validate session name (alphanumeric, underscore, hyphen only)
            if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                echo -e "${RED}Invalid session name: contains forbidden characters${NC}"
                exit 1
            fi
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
            # Validate username (alphanumeric, underscore, hyphen only)
            if ! [[ "$2" =~ ^[a-zA-Z0-9_-]+$ ]]; then
                echo -e "${RED}Invalid username: contains forbidden characters${NC}"
                exit 1
            fi
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
            echo "  --uninstall        Uninstall webtmux and remove service"
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

# Get user home directory safely without using eval
get_user_home() {
    local username="$1"

    # Validate username format (security: prevent injection)
    if ! [[ "$username" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        log_error "Invalid username format: $username"
        return 1
    fi

    # Try getent first (Linux)
    if command -v getent &>/dev/null; then
        getent passwd "$username" | cut -d: -f6
        return
    fi

    # Try dscl (macOS)
    if command -v dscl &>/dev/null; then
        dscl . -read "/Users/$username" NFSHomeDirectory 2>/dev/null | awk '{print $2}'
        return
    fi

    # Fallback: use ~ expansion in a subshell (safer than eval)
    bash -c "echo ~$username"
}

# Validate input against allowed pattern
validate_input() {
    local value="$1"
    local pattern="$2"
    local name="$3"

    if ! [[ "$value" =~ $pattern ]]; then
        log_error "Invalid $name: contains forbidden characters"
        return 1
    fi
    return 0
}

# Check if running in interactive mode (stdin is a terminal)
is_interactive_terminal() {
    [[ -e /dev/tty ]]
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

        if [[ ${#password1} -lt 8 ]]; then
            echo -e "${RED}Password must be at least 8 characters. Please try again.${NC}"
            continue
        fi

        # Check for at least one letter and one number
        if ! [[ "$password1" =~ [A-Za-z] ]] || ! [[ "$password1" =~ [0-9] ]]; then
            echo -e "${RED}Password must contain both letters and numbers. Please try again.${NC}"
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

# Kill process using a specific port
kill_port_process() {
    local port=$1
    
    # First, try to unload existing webtmux launchd service (macOS)
    local plist_file="${HOME}/Library/LaunchAgents/com.webtmux.plist"
    if [[ -f "$plist_file" ]]; then
        launchctl bootout gui/$(id -u) "$plist_file" 2>/dev/null || true
        sleep 1
    fi
    
    # Then kill any remaining processes on the port
    if command -v lsof &> /dev/null; then
        local pids=$(lsof -ti ":${port}" 2>/dev/null)
        if [[ -n "$pids" ]]; then
            echo "$pids" | xargs kill -9 2>/dev/null
            sleep 1
        fi
    fi
    
    # Verify port is free
    if check_port_available "$port"; then
        return 0
    fi
    return 1
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
            echo -e "${YELLOW}Port ${input_port} is already in use.${NC}"
            read -p "Kill the process and use this port anyway? (yes/no) [no]: " force_use </dev/tty
            if [[ "$force_use" == "yes" ]]; then
                if kill_port_process "$input_port"; then
                    log_success "Killed process on port ${input_port}"
                    if check_port_available "$input_port"; then
                        LISTEN_PORT="$input_port"
                        log_success "Port set to ${LISTEN_PORT}"
                        break
                    else
                        echo -e "${RED}Failed to free port ${input_port}. Please try another port.${NC}"
                        continue
                    fi
                else
                    echo -e "${RED}Failed to kill process on port ${input_port}.${NC}"
                    continue
                fi
            else
                local next_port=$(find_available_port "$input_port")
                echo -e "Suggested available port: ${GREEN}${next_port}${NC}"
                continue
            fi
        fi

        LISTEN_PORT="$input_port"
        log_success "Port set to ${LISTEN_PORT}"
        break
    done
}

# Prompt user to restart tmux server
prompt_tmux_restart() {
    if [[ "$INTERACTIVE" != true ]] || ! is_interactive_terminal; then
        return
    fi

    # Check if tmux is running
    if ! command -v tmux &>/dev/null; then
        return
    fi

    local session_count
    session_count=$(tmux list-sessions 2>/dev/null | wc -l | tr -d ' ')

    if [[ "$session_count" -eq 0 ]]; then
        return
    fi

    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║       Tmux Session Management          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "Found ${YELLOW}${session_count}${NC} existing tmux session(s):"
    tmux list-sessions 2>/dev/null | while read -r line; do
        echo "  - $line"
    done
    echo ""
    echo "WebTmux will create a new tmux session for the web terminal."
    echo -e "${YELLOW}To avoid conflicts, you may want to restart the tmux server.${NC}"
    echo ""
    echo "Options:"
    echo "  1) Keep existing sessions (recommended)"
    echo "  2) Kill all sessions and restart tmux server"
    echo ""

    while true; do
        read -p "Choose an option [1/2] (default: 1): " choice </dev/tty
        case "${choice:-1}" in
            1)
                log_info "Keeping existing tmux sessions"
                break
                ;;
            2)
                echo ""
                echo -e "${YELLOW}WARNING: This will terminate ALL tmux sessions!${NC}"
                read -p "Are you sure? (yes/no): " confirm </dev/tty
                if [[ "$confirm" == "yes" ]]; then
                    log_info "Killing all tmux sessions..."
                    tmux kill-server 2>/dev/null || true
                    sleep 1
                    log_success "Tmux server restarted"
                else
                    log_info "Keeping existing tmux sessions"
                fi
                break
                ;;
            *)
                echo "Invalid option. Please enter 1 or 2."
                ;;
        esac
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

# Verify checksum of downloaded file
verify_checksum() {
    local file="$1"
    local checksum_file="$2"
    local filename
    filename=$(basename "$file")

    # Get expected checksum
    local expected
    expected=$(grep "$filename" "$checksum_file" 2>/dev/null | awk '{print $1}')

    if [[ -z "$expected" ]]; then
        log_warn "No checksum found for $filename, skipping verification"
        return 0
    fi

    # Calculate actual checksum
    local actual
    if command -v sha256sum &>/dev/null; then
        actual=$(sha256sum "$file" | awk '{print $1}')
    elif command -v shasum &>/dev/null; then
        actual=$(shasum -a 256 "$file" | awk '{print $1}')
    else
        log_warn "No checksum utility found, skipping verification"
        return 0
    fi

    if [[ "$actual" == "$expected" ]]; then
        log_success "Checksum verified"
        return 0
    else
        log_error "Checksum verification failed!"
        log_error "Expected: $expected"
        log_error "Actual:   $actual"
        return 1
    fi
}

# Download and install binary
install_binary() {
    local os=$1
    local arch=$2
    local version=$3

    local filename="${BINARY_NAME}-${os}-${arch}.tar.gz"
    local download_url="https://github.com/${REPO}/releases/download/${version}/${filename}"
    local checksum_url="https://github.com/${REPO}/releases/download/${version}/SHA256SUMS"

    log_info "Downloading ${filename}..."

    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap "rm -rf '$tmp_dir'" EXIT

    if ! curl -fsSL "${download_url}" -o "${tmp_dir}/${filename}"; then
        log_error "Failed to download ${download_url}"
        exit 1
    fi

    # Download and verify checksum
    log_info "Verifying checksum..."
    if curl -fsSL "${checksum_url}" -o "${tmp_dir}/SHA256SUMS" 2>/dev/null; then
        if ! verify_checksum "${tmp_dir}/${filename}" "${tmp_dir}/SHA256SUMS"; then
            log_error "Binary verification failed, aborting installation"
            exit 1
        fi
    else
        log_warn "Could not download checksum file, skipping verification"
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
    # Detect actual user (handle sudo case)
    local user="${SUDO_USER:-$(whoami)}"
    local user_home
    user_home=$(get_user_home "$user")
    local service_file="/etc/systemd/system/${SERVICE_NAME}.service"
    local config_dir="/etc/webtmux"
    local env_file="${config_dir}/env"

    log_info "Creating systemd service for user: ${user}"

    # Create config directory
    sudo mkdir -p "${config_dir}"
    sudo chmod 755 "${config_dir}"

    # Build environment file with credentials (restricted permissions)
    local env_content="# WebTmux environment configuration\n"
    env_content+="WEBTMUX_LISTEN_ADDR=${LISTEN_ADDR}\n"
    env_content+="WEBTMUX_PORT=${LISTEN_PORT}\n"
    if [[ "$AUTH_MODE" == "no-auth" ]]; then
        env_content+="WEBTMUX_NO_AUTH=1\n"
    elif [[ "$AUTH_MODE" == "password" ]] && [[ -n "$AUTH_PASSWORD" ]]; then
        env_content+="WEBTMUX_CREDENTIAL=${AUTH_USERNAME}:${AUTH_PASSWORD}\n"
    fi
    echo -e "$env_content" | sudo tee "${env_file}" > /dev/null
    sudo chmod 600 "${env_file}"
    sudo chown root:root "${env_file}"
    log_info "Credentials stored in ${env_file} (mode 600)"

    # Build ExecStart command using environment variables
    local exec_cmd="${INSTALL_DIR}/${BINARY_NAME}"
    exec_cmd="${exec_cmd} -a \${WEBTMUX_LISTEN_ADDR} -p \${WEBTMUX_PORT}"
    # Auth flags will be added via environment
    local auth_condition=""
    if [[ "$AUTH_MODE" == "no-auth" ]]; then
        exec_cmd="${exec_cmd} --no-auth"
    elif [[ "$AUTH_MODE" == "password" ]] && [[ -n "$AUTH_PASSWORD" ]]; then
        exec_cmd="${exec_cmd} -c \${WEBTMUX_CREDENTIAL}"
    fi
    exec_cmd="${exec_cmd} -w tmux new-session -A -s ${TMUX_SESSION}"

    sudo tee "${service_file}" > /dev/null << EOF
[Unit]
Description=WebTmux - Web-based terminal with tmux support
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${user_home}
Environment=HOME=${user_home}
Environment=USER=${user}
EnvironmentFile=${env_file}
ExecStart=${exec_cmd}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Grant capability for privileged ports (< 1024)
    if [[ "$LISTEN_PORT" -lt 1024 ]]; then
        log_info "Granting capability for privileged port ${LISTEN_PORT}..."
        sudo setcap 'cap_net_bind_service=+ep' "${INSTALL_DIR}/${BINARY_NAME}"
        log_success "Capability granted for binding to port ${LISTEN_PORT}"
    fi

    sudo systemctl daemon-reload
    sudo systemctl enable ${SERVICE_NAME}
    sudo systemctl restart ${SERVICE_NAME}

    log_success "Systemd service installed and started"
    log_info "View logs: sudo journalctl -u ${SERVICE_NAME} -f"
}

# Install launchd service (macOS)
install_launchd_service() {
    # Detect actual user (handle sudo case)
    local user="${SUDO_USER:-$(whoami)}"
    local user_home
    user_home=$(get_user_home "$user")
    local plist_file="${user_home}/Library/LaunchAgents/com.webtmux.plist"

    log_info "Creating launchd service for user: ${user}"

    mkdir -p "${user_home}/Library/LaunchAgents"

    # Find tmux and get its directory for PATH
    local tmux_path=$(which tmux 2>/dev/null || echo "")
    local tmux_dir=""
    if [[ -z "$tmux_path" ]]; then
        # Try common locations
        for path in /opt/homebrew/bin/tmux /usr/local/bin/tmux /usr/bin/tmux; do
            if [[ -x "$path" ]]; then
                tmux_path="$path"
                break
            fi
        done
    fi
    if [[ -n "$tmux_path" ]]; then
        tmux_dir=$(dirname "$tmux_path")
        log_info "Found tmux at: ${tmux_path}"
    else
        log_warn "tmux not found, service may not start correctly"
    fi

    # Use current user's PATH, ensure tmux directory is included
    local service_path="${PATH}"
    if [[ -n "$tmux_dir" ]] && [[ "$service_path" != *"$tmux_dir"* ]]; then
        service_path="${tmux_dir}:${service_path}"
    fi

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
    <key>WorkingDirectory</key>
    <string>${user_home}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${user_home}</string>
        <key>USER</key>
        <string>${user}</string>
        <key>PATH</key>
        <string>${service_path}</string>
        <key>LANG</key>
        <string>en_US.UTF-8</string>
        <key>LC_ALL</key>
        <string>en_US.UTF-8</string>
    </dict>
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

    # Fix ownership and set restricted permissions (contains credentials)
    if [[ -n "$SUDO_USER" ]]; then
        chown "${user}" "${plist_file}"
    fi
    chmod 600 "${plist_file}"
    log_info "Plist file permissions set to 600"

    # Kill any existing webtmux process
    pkill -f "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || true
    sleep 1

    # Unload and load the service
    local uid=$(id -u "${user}")
    launchctl bootout "gui/${uid}/com.webtmux" 2>/dev/null || true
    launchctl bootstrap "gui/${uid}" "${plist_file}" 2>/dev/null || {
        # Fallback for older macOS
        launchctl unload "${plist_file}" 2>/dev/null || true
        launchctl load "${plist_file}"
    }

    log_success "Launchd service installed and started"
    log_info "View logs: tail -f /tmp/webtmux.log"
}

# Uninstall webtmux
uninstall() {
    echo ""
    echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}║       WebTmux Uninstaller              ║${NC}"
    echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
    echo ""

    local os
    os=$(detect_os)

    # Detect user
    local user="${SUDO_USER:-$(whoami)}"
    local user_home
    user_home=$(get_user_home "$user")

    # Stop and remove service
    case "$os" in
        linux)
            if command -v systemctl &>/dev/null; then
                log_info "Stopping systemd service..."
                sudo systemctl stop ${SERVICE_NAME} 2>/dev/null || true
                sudo systemctl disable ${SERVICE_NAME} 2>/dev/null || true
                if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
                    sudo rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
                    sudo systemctl daemon-reload
                    log_success "Systemd service removed"
                fi
                # Remove config directory
                if [[ -d "/etc/webtmux" ]]; then
                    sudo rm -rf "/etc/webtmux"
                    log_success "Config directory removed"
                fi
            fi
            ;;
        darwin)
            log_info "Stopping launchd service..."
            local plist_file="${user_home}/Library/LaunchAgents/com.webtmux.plist"
            local uid
            uid=$(id -u "${user}")
            launchctl bootout "gui/${uid}/com.webtmux" 2>/dev/null || true
            launchctl unload "${plist_file}" 2>/dev/null || true
            if [[ -f "${plist_file}" ]]; then
                rm -f "${plist_file}"
                log_success "Launchd service removed"
            fi
            # Clean up logs
            rm -f /tmp/webtmux.log /tmp/webtmux.error.log 2>/dev/null || true
            ;;
    esac

    # Kill any running process
    pkill -f "${INSTALL_DIR}/${BINARY_NAME}" 2>/dev/null || true

    # Remove binary
    if [[ -f "${INSTALL_DIR}/${BINARY_NAME}" ]]; then
        log_info "Removing binary..."
        sudo rm -f "${INSTALL_DIR}/${BINARY_NAME}"
        log_success "Binary removed"
    else
        log_warn "Binary not found at ${INSTALL_DIR}/${BINARY_NAME}"
    fi

    echo ""
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Uninstallation complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════${NC}"
    echo ""
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

    # Prompt for tmux session management (interactive mode only)
    prompt_tmux_restart

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

# Run uninstall or main installation
if [[ "$UNINSTALL" == true ]]; then
    uninstall
else
    main "$@"
fi
