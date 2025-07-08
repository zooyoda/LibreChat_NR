import { scopeRegistry } from '../tools/scope-registry.js';

// Define Gmail scopes as constants for reuse and testing
// Reference: https://developers.google.com/gmail/api/auth/scopes
export const GMAIL_SCOPES = {
  // Core functionality scopes (read, write, modify permissions)
  READONLY: 'https://www.googleapis.com/auth/gmail.readonly',
  SEND: 'https://www.googleapis.com/auth/gmail.send',
  MODIFY: 'https://www.googleapis.com/auth/gmail.modify',
  
  // Label management scope
  LABELS: 'https://www.googleapis.com/auth/gmail.labels',
  
  // Settings management scopes
  SETTINGS_BASIC: 'https://www.googleapis.com/auth/gmail.settings.basic',
  SETTINGS_SHARING: 'https://www.googleapis.com/auth/gmail.settings.sharing'
};

/**
 * Register Gmail OAuth scopes at startup.
 * Auth issues will be handled via 401 responses rather than pre-validation.
 * 
 * IMPORTANT: The order of scope registration matters for auth URL generation.
 * Core functionality scopes (readonly, send, modify) should be registered first,
 * followed by feature-specific scopes (labels, settings).
 */
export function registerGmailScopes() {
  // Register core functionality scopes first
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.READONLY);
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.SEND);
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.MODIFY);
  
  // Register feature-specific scopes
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.LABELS);
  
  // Register settings scopes last (order matters for auth URL generation)
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.SETTINGS_BASIC);
  scopeRegistry.registerScope('gmail', GMAIL_SCOPES.SETTINGS_SHARING);
  
  // Verify all scopes are registered
  const registeredScopes = scopeRegistry.getAllScopes();
  const requiredScopes = Object.values(GMAIL_SCOPES);
  
  const missingScopes = requiredScopes.filter(scope => !registeredScopes.includes(scope));
  if (missingScopes.length > 0) {
    throw new Error(`Failed to register Gmail scopes: ${missingScopes.join(', ')}`);
  }
}
