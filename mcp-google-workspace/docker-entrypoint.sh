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

# Debug information
log_debug "Starting Google Workspace MCP server"
log_debug "Current working directory: $(pwd)"
log_debug "GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:0:10}..."
log_debug "GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:0:10}..."
log_debug "WORKSPACE_BASE_PATH: $WORKSPACE_BASE_PATH"

# Trap signals for clean shutdown
trap 'log_info "Shutting down..."; exit 0' SIGTERM SIGINT

# Set environment variables
export MCP_MODE=true
export LOG_FILE="/app/logs/google-workspace-mcp.log"
export NODE_ENV=production

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

# Log successful startup
log_info "Starting Google Workspace MCP server from $(pwd)"
log_info "Executing: node build/index.js"

# Execute the main application
exec node build/index.js
