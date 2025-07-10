import fs from 'fs/promises';
import path from 'path';
import { Account, AccountsConfig, AccountError, AccountModuleConfig } from './types.js';
import { scopeRegistry } from '../tools/scope-registry.js';
import { TokenManager } from './token.js';
import { GoogleOAuthClient } from './oauth.js';
import logger from '../../utils/logger.js';

export class AccountManager {
  private readonly accountsPath: string;
  private accounts: Map<string, Account>;
  private tokenManager!: TokenManager;
  private oauthClient!: GoogleOAuthClient;
  private currentAuthEmail?: string;

  constructor(config?: AccountModuleConfig) {
    const defaultPath = process.env.ACCOUNTS_PATH ||
      (process.env.MCP_MODE
        ? path.resolve(process.env.HOME || '', '.mcp/google-workspace-mcp/accounts.json')
        : '/app/config/accounts.json');
    this.accountsPath = config?.accountsPath || defaultPath;
    this.accounts = new Map();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing AccountManager...');
    this.oauthClient = new GoogleOAuthClient();
    this.tokenManager = new TokenManager(this.oauthClient);
    await this.loadAccounts();
    logger.info('AccountManager initialized successfully');
  }

  async listAccounts(): Promise<Account[]> {
    logger.debug('Listing accounts with auth status');
    const accounts = Array.from(this.accounts.values());
    for (const account of accounts) {
      const renewalResult = await this.tokenManager.autoRenewToken(account.email);
      if (renewalResult.success) {
        account.auth_status = {
          valid: true,
          status: renewalResult.status,
        };
      } else {
        account.auth_status = {
          valid: false,
          status: renewalResult.status,
          reason: renewalResult.reason,
          authUrl: await this.generateAuthUrl(),
        };
      }
    }
    logger.debug(`Found ${accounts.length} accounts`);
    return accounts;
  }

  async withTokenRenewal<T>(email: string, operation: () => Promise<T>): Promise<T> {
    try {
      const renewalResult = await this.tokenManager.autoRenewToken(email);
      if (!renewalResult.success) {
        if (renewalResult.canRetry) {
          logger.warn('Token renewal failed but may be temporary - proceeding with operation');
        } else {
          throw new AccountError(
            'Token renewal failed',
            'TOKEN_RENEWAL_FAILED',
            renewalResult.reason || 'Please re-authenticate your account'
          );
        }
      }
      return await operation();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === '401') {
        logger.warn('Received 401 during operation, attempting final token renewal');
        const finalRenewal = await this.tokenManager.autoRenewToken(email);
        if (finalRenewal.success) {
          return await operation();
        }
        if (!finalRenewal.canRetry) {
          throw new AccountError(
            'Authentication failed',
            'AUTH_REQUIRED',
            finalRenewal.reason || 'Please re-authenticate your account'
          );
        } else {
          throw new AccountError(
            'Token refresh failed temporarily',
            'TEMPORARY_AUTH_ERROR',
            'Please try again later'
          );
        }
      }
      throw error;
    }
  }

  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async loadAccounts(): Promise<void> {
    try {
      logger.debug(`Loading accounts from ${this.accountsPath}`);
      await fs.mkdir(path.dirname(this.accountsPath), { recursive: true });
      let data: string;
      try {
        data = await fs.readFile(this.accountsPath, 'utf-8');
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          logger.info('Creating new accounts file');
          data = JSON.stringify({ accounts: [] });
          await fs.writeFile(this.accountsPath, data);
        } else {
          throw new AccountError(
            'Failed to read accounts configuration',
            'ACCOUNTS_READ_ERROR',
            'Please ensure the accounts file is readable'
          );
        }
      }
      try {
        const config = JSON.parse(data) as AccountsConfig;
        this.accounts.clear();
        for (const account of config.accounts) {
          this.accounts.set(account.email, account);
        }
      } catch (error) {
        throw new AccountError(
          'Failed to parse accounts configuration',
          'ACCOUNTS_PARSE_ERROR',
          'Please ensure the accounts file contains valid JSON'
        );
      }
    } catch (error) {
      if (error instanceof AccountError) {
        throw error;
      }
      throw new AccountError(
        'Failed to load accounts configuration',
        'ACCOUNTS_LOAD_ERROR',
        'Please ensure accounts.json exists and is valid'
      );
    }
  }

  private async saveAccounts(): Promise<void> {
    try {
      const config: AccountsConfig = {
        accounts: Array.from(this.accounts.values()),
      };
      await fs.writeFile(this.accountsPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new AccountError(
        'Failed to save accounts configuration',
        'ACCOUNTS_SAVE_ERROR',
        'Please ensure accounts.json is writable'
      );
    }
  }

  async addAccount(email: string, category: string, description: string): Promise<Account> {
    logger.info(`Adding new account: ${email}`);
    if (!this.validateEmail(email)) {
      logger.error(`Invalid email format: ${email}`);
      throw new AccountError(
        'Invalid email format',
        'INVALID_EMAIL',
        'Please provide a valid email address'
      );
    }
    if (this.accounts.has(email)) {
      throw new AccountError(
        'Account already exists',
        'DUPLICATE_ACCOUNT',
        'Use updateAccount to modify existing accounts'
      );
    }
    const account: Account = {
      email,
      category,
      description,
    };
    this.accounts.set(email, account);
    await this.saveAccounts();
    return account;
  }

  async updateAccount(email: string, updates: Partial<Omit<Account, 'email'>>): Promise<Account> {
    const account = this.accounts.get(email);
    if (!account) {
      throw new AccountError(
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        'Please ensure the account exists before updating'
      );
    }
    const updatedAccount: Account = {
      ...account,
      ...updates,
    };
    this.accounts.set(email, updatedAccount);
    await this.saveAccounts();
    return updatedAccount;
  }

  async removeAccount(email: string): Promise<void> {
    logger.info(`Removing account: ${email}`);
    if (!this.accounts.has(email)) {
      logger.error(`Account not found: ${email}`);
      throw new AccountError(
        'Account not found',
        'ACCOUNT_NOT_FOUND',
        'Cannot remove non-existent account'
      );
    }
    await this.tokenManager.deleteToken(email);
    this.accounts.delete(email);
    await this.saveAccounts();
    logger.info(`Successfully removed account: ${email}`);
  }

  async getAccount(email: string): Promise<Account | null> {
    return this.accounts.get(email) || null;
  }

  async validateAccount(
    email: string,
    category?: string,
    description?: string
  ): Promise<Account> {
    logger.debug(`Validating account: ${email}`);
    let account = await this.getAccount(email);
    const isNewAccount: boolean = Boolean(!account && category && description);
    try {
      if (isNewAccount && category && description) {
        logger.info('Creating new account during validation');
        account = await this.addAccount(email, category, description);
      } else if (!account) {
        throw new AccountError(
          'Account not found',
          'ACCOUNT_NOT_FOUND',
          'Please provide category and description for new accounts'
        );
      }
      const tokenStatus = await this.tokenManager.validateToken(email, isNewAccount);
      switch (tokenStatus.status) {
        case 'NO_TOKEN':
          account.auth_status = {
            valid: false,
            status: tokenStatus.status,
            reason: isNewAccount ? 'New account requires authentication' : 'No token found',
            authUrl: await this.generateAuthUrl(),
          };
          break;
        case 'VALID':
        case 'REFRESHED':
          account.auth_status = {
            valid: true,
            status: tokenStatus.status,
          };
          break;
        case 'INVALID':
        case 'REFRESH_FAILED':
        case 'EXPIRED':
          account.auth_status = {
            valid: false,
            status: tokenStatus.status,
            reason: tokenStatus.reason,
            authUrl: await this.generateAuthUrl(),
          };
          break;
        case 'ERROR':
          account.auth_status = {
            valid: false,
            status: tokenStatus.status,
            reason: 'Authentication error occurred',
            authUrl: await this.generateAuthUrl(),
          };
          break;
      }
      logger.debug(`Account validation complete for ${email}. Status: ${tokenStatus.status}`);
      return account;
    } catch (error) {
      logger.error('Account validation failed', error as Error);
      if (error instanceof AccountError) {
        throw error;
      }
      throw new AccountError(
        'Account validation failed',
        'VALIDATION_ERROR',
        'An unexpected error occurred during account validation'
      );
    }
  }

  async generateAuthUrl(): Promise<string> {
    const allScopes = scopeRegistry.getAllScopes();
    return this.oauthClient.generateAuthUrl(allScopes);
  }

  async startAuthentication(email: string): Promise<string> {
    this.currentAuthEmail = email;
    logger.info(`Starting authentication for ${email}`);
    return this.generateAuthUrl();
  }

  async waitForAuthorizationCode(): Promise<string> {
    return this.oauthClient.waitForAuthorizationCode();
  }

  async getTokenFromCode(code: string): Promise<any> {
    const token = await this.oauthClient.getTokenFromCode(code);
    return token;
  }

  async refreshToken(refreshToken: string): Promise<any> {
    return this.oauthClient.refreshToken(refreshToken);
  }

  async getAuthClient() {
    return this.oauthClient.getAuthClient();
  }

  async validateToken(email: string, skipValidationForNew: boolean = false) {
    return this.tokenManager.validateToken(email, skipValidationForNew);
  }

  async saveToken(email: string, tokenData: any) {
    return this.tokenManager.saveToken(email, tokenData);
  }

  isUsingExternalCallback(): boolean {
    return this.oauthClient.isUsingExternalCallback();
  }

  getCurrentCallbackUrl(): string {
    return this.oauthClient.getCurrentCallbackUrl();
  }

  async completeCurrentAuthentication(): Promise<{ success: boolean; message: string }> {
    if (!this.currentAuthEmail) {
      return {
        success: false,
        message: 'No authentication in progress',
      };
    }
    try {
      const code = await this.waitForAuthorizationCode();
      const tokenData = await this.getTokenFromCode(code);
      await this.saveToken(this.currentAuthEmail, tokenData);
      const email = this.currentAuthEmail;
      this.currentAuthEmail = undefined;
      return {
        success: true,
        message: `Authentication completed successfully for ${email}`,
      };
    } catch (error) {
      const email = this.currentAuthEmail;
      this.currentAuthEmail = undefined;
      return {
        success: false,
        message: `Authentication failed for ${email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  getCurrentAuthEmail(): string | undefined {
    return this.currentAuthEmail;
  }

  clearCurrentAuthentication(): void {
    this.currentAuthEmail = undefined;
  }
}
