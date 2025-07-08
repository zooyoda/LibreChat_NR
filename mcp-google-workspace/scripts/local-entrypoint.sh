#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Function to log error messages
log_error() {
    echo "[ERROR] $1" >&2
}

# Function to log info messages
log_info() {
    echo "[INFO] $1" >&2
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
    export WORKSPACE_BASE_PATH="$HOME/Documents/workspace-mcp-files"
fi

# Create necessary directories
mkdir -p "$HOME/.mcp/google-workspace-mcp"
mkdir -p "$WORKSPACE_BASE_PATH"

# Link config to expected location (symlink approach)
mkdir -p /tmp/app/config
ln -sf "$HOME/.mcp/google-workspace-mcp/accounts.json" /tmp/app/config/accounts.json 2>/dev/null || true

# If accounts.json doesn't exist, create it
if [ ! -f "$HOME/.mcp/google-workspace-mcp/accounts.json" ]; then
    log_info "Creating accounts.json"
    echo '{}' > "$HOME/.mcp/google-workspace-mcp/accounts.json"
fi

# Trap signals for clean shutdown
trap 'log_info "Shutting down..."; exit 0' SIGTERM SIGINT

# Execute the main application
exec node build/index.js "$@"