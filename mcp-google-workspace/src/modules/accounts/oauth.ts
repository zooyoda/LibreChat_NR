import { OAuth2Client } from 'google-auth-library';
import { AccountError } from './types.js';
import { OAuthCallbackServer } from './callback-server.js';
import logger from '../../utils/logger.js';

export class GoogleOAuthClient {
  private oauth2Client: OAuth2Client;
  private callbackServer: OAuthCallbackServer;
  private lastAuthEmail?: string;

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new AccountError(
        'Missing OAuth credentials',
        'AUTH_CONFIG_ERROR',
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided'
      );
    }

    this.callbackServer = OAuthCallbackServer.getInstance();
    logger.info('Initializing OAuth client...');

    const callbackUrl = this.getCallbackUrl();

    this.oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      callbackUrl
    );

    logger.info(`OAuth client initialized with callback: ${callbackUrl}`);

    this.callbackServer.ensureServerRunning().catch(error => {
      logger.error('Failed to start OAuth callback server:', error);
    });
  }

  private getCallbackUrl(): string {
    const externalCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
      process.env.GOOGLE_OAUTH_CALLBACK_URI ||
      process.env.OAUTH_REDIRECT_URI;

    if (externalCallbackUrl) {
      logger.info(`Using external callback URL: ${externalCallbackUrl}`);
      return externalCallbackUrl;
    }

    const port = process.env.OAUTH_SERVER_PORT || process.env.WORKSPACE_MCP_PORT || '8080';
    const localCallbackUrl = `http://localhost:${port}/oauth2callback`;

    logger.info(`Using local callback URL: ${localCallbackUrl}`);
    return localCallbackUrl;
  }

  // Ключевой метод: email передается через login_hint
  async generateAuthUrl(scopes: string[], email?: string): Promise<string> {
    logger.info('Generating OAuth authorization URL');
    this.lastAuthEmail = email;
    const opts: any = {
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: Math.random().toString(36).substring(7)
    };
    if (email) {
      opts.login_hint = email;
    }
    const url = this.oauth2Client.generateAuthUrl(opts);
    logger.debug('Authorization URL generated successfully');
    return url;
  }

  async waitForAuthorizationCode(): Promise<string> {
    logger.info('Starting OAuth callback server and waiting for authorization...');
    return await this.callbackServer.waitForAuthorizationCode();
  }

  async getTokenFromCode(code: string): Promise<any> {
    logger.info('Exchanging authorization code for tokens');
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      logger.info('Successfully obtained tokens from auth code');
      return tokens;
    } catch (error) {
      logger.error('Failed to exchange authorization code for tokens:', error);
      throw new AccountError(
        'Failed to exchange authorization code for tokens',
        'AUTH_CODE_ERROR',
        'Please ensure the authorization code is valid and not expired'
      );
    }
  }

  async refreshToken(refreshToken: string): Promise<any> {
    logger.info('Refreshing access token');
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken
      });
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      logger.info('Successfully refreshed access token');
      return credentials;
    } catch (error) {
      logger.error('Failed to refresh token:', error);
      throw new AccountError(
        'Failed to refresh token',
        'TOKEN_REFRESH_ERROR',
        'Please re-authenticate the account'
      );
    }
  }

  getAuthClient(): OAuth2Client {
    return this.oauth2Client;
  }

  getCurrentCallbackUrl(): string {
    return this.getCallbackUrl();
  }

  isUsingExternalCallback(): boolean {
    const externalCallbackUrl = process.env.OAUTH_CALLBACK_URL ||
      process.env.GOOGLE_OAUTH_CALLBACK_URI ||
      process.env.OAUTH_REDIRECT_URI;
    return !!externalCallbackUrl;
  }
}
