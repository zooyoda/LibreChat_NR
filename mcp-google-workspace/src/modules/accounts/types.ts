import { OAuth2Client } from 'google-auth-library';

export interface Account {
  email: string;
  category: string;
  description: string;
  auth_status?: {
    valid: boolean;
    status?: TokenStatusType;
    token?: any;  // Internal use only - not exposed to AI
    reason?: string;
    authUrl?: string;
    requiredScopes?: string[];
  };
}

export interface AccountsConfig {
  accounts: Account[];
}

export type TokenStatusType = 
  | 'NO_TOKEN'
  | 'VALID'
  | 'INVALID'
  | 'REFRESHED'
  | 'REFRESH_FAILED'
  | 'EXPIRED'
  | 'ERROR';

export interface TokenRenewalResult {
  success: boolean;
  status: TokenStatusType;
  reason?: string;
  token?: any;
  canRetry?: boolean;  // Indicates if a failed refresh can be retried later
}

export interface TokenStatus {
  valid: boolean;
  status: TokenStatusType;
  token?: any;
  reason?: string;
  authUrl?: string;
  requiredScopes?: string[];
}

export interface AuthenticationError extends AccountError {
  authUrl: string;
  requiredScopes: string[];
}

export interface AccountModuleConfig {
  accountsPath?: string;
  oauth2Client?: OAuth2Client;
}

export class AccountError extends Error {
  constructor(
    message: string,
    public code: string,
    public resolution: string
  ) {
    super(message);
    this.name = 'AccountError';
  }
}
