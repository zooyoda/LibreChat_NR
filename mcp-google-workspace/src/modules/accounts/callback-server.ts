import express from 'express';
import { createServer, Server } from 'http';
import logger from '../../utils/logger.js';

export class OAuthCallbackServer {
  private static instance: OAuthCallbackServer;
  private server: Server | null = null;
  private app: express.Application;
  private pendingPromises = new Map<string, { resolve: (code: string) => void; reject: (error: Error) => void }>();

  private constructor() {
    this.app = express();
    this.setupRoutes();
  }

  static getInstance(): OAuthCallbackServer {
    if (!OAuthCallbackServer.instance) {
      OAuthCallbackServer.instance = new OAuthCallbackServer();
    }
    return OAuthCallbackServer.instance;
  }

  // ИСПРАВЛЕНИЕ: Динамическое определение callback URL
  getCallbackUrl(): string {
    // Приоритет переменных окружения для внешних доменов
    const externalCallbackUrl = process.env.OAUTH_CALLBACK_URL || 
                               process.env.GOOGLE_OAUTH_CALLBACK_URI ||
                               process.env.OAUTH_REDIRECT_URI;
    
    if (externalCallbackUrl) {
      logger.info(`Using external callback URL: ${externalCallbackUrl}`);
      return externalCallbackUrl;
    }

    // Fallback на localhost для локальной разработки
    const port = this.getPort();
    const localCallbackUrl = `http://localhost:${port}/oauth2callback`;
    
    logger.info(`Using local callback URL: ${localCallbackUrl}`);
    return localCallbackUrl;
  }

  // НОВЫЙ МЕТОД: Определение порта из переменных окружения
  private getPort(): number {
    const port = process.env.OAUTH_SERVER_PORT || 
                process.env.WORKSPACE_MCP_PORT || 
                process.env.OAUTH_CALLBACK_PORT || 
                '8080';
    return parseInt(port, 10);
  }

  // НОВЫЙ МЕТОД: Определение хоста
  private getHost(): string {
    return process.env.OAUTH_SERVER_HOST || '0.0.0.0';
  }

  // НОВЫЙ МЕТОД: Проверка, используется ли внешний callback
  private isUsingExternalCallback(): boolean {
    const externalCallbackUrl = process.env.OAUTH_CALLBACK_URL || 
                               process.env.GOOGLE_OAUTH_CALLBACK_URI ||
                               process.env.OAUTH_REDIRECT_URI;
    return !!externalCallbackUrl;
  }

  async ensureServerRunning(): Promise<void> {
    if (this.server) {
      logger.info('OAuth callback server already running');
      return;
    }

    // ИСПРАВЛЕНИЕ: Проверяем, нужен ли локальный сервер
    if (this.isUsingExternalCallback()) {
      logger.info('Using external callback URL, skipping local server startup');
      return;
    }

    const port = this.getPort();
    const host = this.getHost();

    logger.info(`Starting OAuth callback server on ${host}:${port}`);

    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);
      
      this.server.listen(port, host, () => {
        logger.info(`OAuth callback server listening on http://${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is already in use, trying alternative approach`);
          
          // Если порт занят, проверяем альтернативные порты
          const alternativePort = port + 1;
          logger.info(`Trying alternative port: ${alternativePort}`);
          
          this.server?.close();
          this.server = createServer(this.app);
          
          this.server.listen(alternativePort, host, () => {
            logger.info(`OAuth callback server listening on http://${host}:${alternativePort}`);
            
            // Обновляем переменные окружения для альтернативного порта
            process.env.OAUTH_SERVER_PORT = alternativePort.toString();
            
            resolve();
          });
        } else {
          logger.error('Failed to start OAuth callback server:', error);
          reject(error);
        }
      });
    });
  }

  private setupRoutes(): void {
    // Middleware для логирования
    this.app.use((req, res, next) => {
      logger.debug(`OAuth callback request: ${req.method} ${req.url}`);
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // OAuth callback endpoint
    this.app.get('/oauth2callback', (req, res) => {
      const { code, error, state } = req.query;

      logger.info(`OAuth callback received: code=${!!code}, error=${error}, state=${state}`);

      if (error) {
        logger.error(`OAuth error: ${error}`);
        
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>OAuth Error</title></head>
            <body>
              <h1>OAuth Error</h1>
              <p>Error: ${error}</p>
              <p>Please close this window and try again.</p>
              <script>
                setTimeout(() => window.close(), 3000);
              </script>
            </body>
          </html>
        `);
        
        const pending = this.pendingPromises.get(state as string);
        if (pending) {
          pending.reject(new Error(`OAuth error: ${error}`));
          this.pendingPromises.delete(state as string);
        }
        return;
      }

      if (code) {
        logger.info('OAuth authorization code received successfully');
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>Authentication Successful</title></head>
            <body>
              <h1>Authentication Successful!</h1>
              <p>Please wait while we complete the authentication process...</p>
              <p>If automatic authentication fails, you can manually copy this code:</p>
              <code style="background: #f0f0f0; padding: 10px; display: block; margin: 10px 0;">${code}</code>
              <script>
                setTimeout(() => {
                  try {
                    window.close();
                  } catch (e) {
                    document.body.innerHTML += '<p>You can now close this window.</p>';
                  }
                }, 2000);
              </script>
            </body>
          </html>
        `);

        // Resolve any pending promises
        if (this.pendingPromises.size > 0) {
          const [firstKey, firstPromise] = this.pendingPromises.entries().next().value;
          firstPromise.resolve(code as string);
          this.pendingPromises.delete(firstKey);
        }
        
        // Also try to resolve by state
        const pending = this.pendingPromises.get(state as string);
        if (pending) {
          pending.resolve(code as string);
          this.pendingPromises.delete(state as string);
        }
      } else {
        logger.warn('OAuth callback received without code or error');
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>OAuth Error</title></head>
            <body>
              <h1>OAuth Error</h1>
              <p>No authorization code received.</p>
              <p>Please close this window and try again.</p>
            </body>
          </html>
        `);
      }
    });

    // Alternative callback endpoints for compatibility
    this.app.get('/auth/google/callback', (req, res) => {
      req.url = '/oauth2callback';
      this.app.handle(req, res);
    });

    this.app.get('/api/auth/google/callback', (req, res) => {
      req.url = '/oauth2callback';
      this.app.handle(req, res);
    });

    // Error handling middleware
    this.app.use((err: any, req: any, res: any, next: any) => {
      logger.error('OAuth callback server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  async waitForAuthorizationCode(): Promise<string> {
    logger.info('Waiting for OAuth authorization code...');
    
    return new Promise((resolve, reject) => {
      const state = Math.random().toString(36).substring(7);
      this.pendingPromises.set(state, { resolve, reject });

      // Timeout after 5 minutes
      const timeout = setTimeout(() => {
        if (this.pendingPromises.has(state)) {
          this.pendingPromises.delete(state);
          reject(new Error('OAuth authentication timeout (5 minutes)'));
        }
      }, 300000);

      // Clear timeout when promise resolves
      const originalResolve = resolve;
      const originalReject = reject;
      
      const wrappedResolve = (code: string) => {
        clearTimeout(timeout);
        originalResolve(code);
      };
      
      const wrappedReject = (error: Error) => {
        clearTimeout(timeout);
        originalReject(error);
      };

      this.pendingPromises.set(state, { 
        resolve: wrappedResolve, 
        reject: wrappedReject 
      });
    });
  }

  // НОВЫЙ МЕТОД: Получение статуса сервера
  getServerStatus(): { running: boolean; port?: number; host?: string; external: boolean } {
    const external = this.isUsingExternalCallback();
    
    if (external) {
      return { running: true, external: true };
    }
    
    return {
      running: !!this.server,
      port: this.getPort(),
      host: this.getHost(),
      external: false
    };
  }

  // НОВЫЙ МЕТОД: Остановка сервера
  async stopServer(): Promise<void> {
    if (this.server) {
      logger.info('Stopping OAuth callback server...');
      
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('OAuth callback server stopped');
          this.server = null;
          resolve();
        });
      });
    }
  }

  // НОВЫЙ МЕТОД: Очистка ожидающих промисов
  clearPendingPromises(): void {
    for (const [state, promise] of this.pendingPromises.entries()) {
      promise.reject(new Error('OAuth callback server shutting down'));
    }
    this.pendingPromises.clear();
  }
}
