#!/bin/sh

# Function to log error messages
log_error() {
    echo "[ERROR] $1" >&2
}

# Function to log info messages  
log_info() {
    echo "[INFO] $1" >&2
}

# Function to log debug messages
log_debug() {
    echo "[DEBUG] $1" >&2
}

# Function to detect Amvera domain
detect_amvera_domain() {
    # Проверяем переменные окружения Amvera
    if [ -n "$AMVERA_DOMAIN" ]; then
        echo "$AMVERA_DOMAIN"
        return
    fi
    
    # Пытаемся определить по заголовкам или другим переменным
    if [ -n "$VERCEL_URL" ]; then
        echo "https://$VERCEL_URL"
        return
    fi
    
    # Для Amvera пытаемся определить по переменным окружения
    if [ -n "$HOSTNAME" ] && echo "$HOSTNAME" | grep -q "amvera"; then
        # Извлекаем домен из hostname
        DOMAIN=$(echo "$HOSTNAME" | sed 's/.*\.\(.*\.amvera\.io\)$/\1/')
        if [ -n "$DOMAIN" ]; then
            echo "https://$DOMAIN"
            return
        fi
    fi
    
    # Последняя попытка - через переменные окружения LibreChat
    if [ -n "$DOMAIN_CLIENT" ]; then
        echo "https://$DOMAIN_CLIENT"
        return
    fi
    
    # Если ничего не найдено, возвращаем заглушку
    echo "https://your-project-name.amvera.io"
}

# Validate required environment variables
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    log_error "GOOGLE_CLIENT_ID environment variable is required"
    exit 1
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    log_error "GOOGLE_CLIENT_SECRET environment variable is required"
    exit 1
fi

# Set default workspace path if not provided
if [ -z "$WORKSPACE_BASE_PATH" ]; then
    export WORKSPACE_BASE_PATH="/app/workspace"
fi

# Determine the correct domain for OAuth callback
DETECTED_DOMAIN=$(detect_amvera_domain)
export OAUTH_CALLBACK_DOMAIN="${OAUTH_CALLBACK_DOMAIN:-$DETECTED_DOMAIN}"

# ВАЖНО: Используем порт 8081 вместо 8080 для избежания конфликта
export OAUTH_SERVER_PORT="8081"

# Set OAuth callback URL variants for compatibility
export OAUTH_CALLBACK_URL="${OAUTH_CALLBACK_DOMAIN}:${OAUTH_SERVER_PORT}/oauth2callback"
export OAUTH_REDIRECT_URI="${OAUTH_CALLBACK_DOMAIN}:${OAUTH_SERVER_PORT}/oauth2callback"
export GOOGLE_OAUTH_REDIRECT_URI="${OAUTH_CALLBACK_DOMAIN}:${OAUTH_SERVER_PORT}/oauth2callback"

# Alternative callback paths for different implementations
export OAUTH_CALLBACK_URL_ALT1="${OAUTH_CALLBACK_DOMAIN}:${OAUTH_SERVER_PORT}/auth/google/callback"
export OAUTH_CALLBACK_URL_ALT2="${OAUTH_CALLBACK_DOMAIN}:${OAUTH_SERVER_PORT}/api/auth/google/callback"

# Переменные для Google Workspace MCP
export WORKSPACE_MCP_BASE_URI="${OAUTH_CALLBACK_DOMAIN}"
export WORKSPACE_MCP_PORT="${OAUTH_SERVER_PORT}"
export GOOGLE_OAUTH_CALLBACK_URI="${OAUTH_CALLBACK_URL}"
# Дополнительные переменные для совместимости
export GOOGLE_OAUTH_REDIRECT_URI="${OAUTH_CALLBACK_URL}"
export OAUTH_REDIRECT_URI="${OAUTH_CALLBACK_URL}"


# Debug information
log_debug "Starting Google Workspace MCP server"
log_debug "Current working directory: $(pwd)"
log_debug "GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:10}..."
log_debug "GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:10}..."
log_debug "WORKSPACE_BASE_PATH: $WORKSPACE_BASE_PATH"
log_debug "OAUTH_CALLBACK_DOMAIN: $OAUTH_CALLBACK_DOMAIN"
log_debug "OAUTH_CALLBACK_URL: $OAUTH_CALLBACK_URL"
log_debug "OAUTH_SERVER_PORT: $OAUTH_SERVER_PORT"

# Trap signals for clean shutdown
trap 'log_info "Shutting down..."; exit 0' SIGTERM SIGINT

# Set environment variables for the application
export MCP_MODE=true
export LOG_FILE="/app/logs/google-workspace-mcp.log"
export NODE_ENV=production

# OAuth server configuration
export OAUTH_SERVER_HOST="0.0.0.0"

# Ensure workspace directory exists
if [ ! -d "$WORKSPACE_BASE_PATH" ]; then
    log_info "Creating workspace directory: $WORKSPACE_BASE_PATH"
    mkdir -p "$WORKSPACE_BASE_PATH"
fi

# Ensure logs directory exists
if [ ! -d "/app/logs" ]; then
    log_info "Creating logs directory: /app/logs"
    mkdir -p "/app/logs"
fi

# Ensure /app/config directory exists
if [ ! -d "/app/config" ]; then
    log_info "Creating config directory: /app/config"
    mkdir -p "/app/config"
fi

# Ensure /app/config/accounts.json exists
if [ ! -f "/app/config/accounts.json" ]; then
    if [ -f "/app/config/accounts.example.json" ]; then
        log_info "accounts.json not found, copying from accounts.example.json"
        cp /app/config/accounts.example.json /app/config/accounts.json
    else
        log_info "accounts.json and accounts.example.json not found, creating minimal accounts.json"
        echo '{ "accounts": [] }' > /app/config/accounts.json
    fi
fi

# Create OAuth configuration file for the application
cat > /app/config/oauth-config.json << EOF
{
  "client_id": "$GOOGLE_CLIENT_ID",
  "client_secret": "$GOOGLE_CLIENT_SECRET",
  "redirect_uri": "$OAUTH_CALLBACK_URL",
  "callback_domain": "$OAUTH_CALLBACK_DOMAIN",
  "callback_port": "$OAUTH_SERVER_PORT",
  "alternative_redirect_uris": [
    "$OAUTH_CALLBACK_URL_ALT1",
    "$OAUTH_CALLBACK_URL_ALT2"
  ]
}
EOF

# Change to the correct working directory
cd /app/mcp-google-workspace

# Verify the build directory and index.js exist
if [ ! -d "build" ]; then
    log_error "Build directory not found in $(pwd)"
    log_error "Available directories: $(ls -la)"
    exit 1
fi

if [ ! -f "build/index.js" ]; then
    log_error "build/index.js not found in $(pwd)"
    log_error "Build directory contents: $(ls -la build/ 2>/dev/null || echo 'Cannot list build directory')"
    exit 1
fi

# Verify Node.js can access the file
if ! node -e "require.resolve('./build/index.js')" 2>/dev/null; then
    log_error "Node.js cannot resolve build/index.js"
    exit 1
fi

# Log successful startup with OAuth configuration
log_info "Starting Google Workspace MCP server from $(pwd)"
log_info "OAuth Callback Domain: $OAUTH_CALLBACK_DOMAIN"
log_info "OAuth Callback URL: $OAUTH_CALLBACK_URL"
log_info "OAuth Server Port: $OAUTH_SERVER_PORT"
log_info "Executing: node build/index.js"

# Execute the main application
exec node build/index.js
