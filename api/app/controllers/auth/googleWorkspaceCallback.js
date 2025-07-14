const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

const handleGoogleWorkspaceCallback = async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    // ✅ РАСШИРЕННОЕ ЛОГИРОВАНИЕ
    logger.info('Google Workspace OAuth callback received:', { 
      hasCode: !!code, 
      codeLength: code ? code.length : 0,
      error, 
      hasState: !!state,
      reqUserExists: !!req.user,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      host: req.get('host'),
      originalUrl: req.originalUrl
    });
    
    // ✅ ОБРАБОТКА ОШИБОК ОТ GOOGLE
    if (error) {
      logger.error('Google Workspace OAuth error from Google:', error);
      return res.status(400).send(generateErrorPage(error, 'Google OAuth Error'));
    }

    if (!code) {
      logger.warn('Google Workspace OAuth: No authorization code provided');
      return res.status(400).send(generateErrorPage('No authorization code provided', 'Missing Authorization Code'));
    }

    // ✅ ИЗВЛЕЧЕНИЕ USERID ИЗ STATE ПАРАМЕТРА
    let userId;
    let stateInfo = {};
    
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        userId = stateData.userId;
        stateInfo = stateData;
        logger.info('UserId extracted from state parameter:', { 
          userId, 
          timestamp: stateData.timestamp, 
          source: stateData.source 
        });
      } catch (stateError) {
        logger.error('Failed to parse state parameter:', stateError);
        logger.warn('Raw state parameter:', state);
      }
    }
    
    // Fallback на req.user если state не сработал
    if (!userId && req.user?.id) {
      userId = req.user.id;
      logger.info('UserId obtained from req.user as fallback:', userId);
    }
    
    if (!userId) {
      logger.error('Google Workspace OAuth: No user ID available from state or session');
      return res.status(401).send(generateSessionLostPage());
    }

    const redirectUri = 'https://nrlibre-neuralrunner.amvera.io/oauth/google/workspace/callback';
    
    // ✅ ПОЛУЧЕНИЕ CREDENTIALS ИЗ БД ПОЛЬЗОВАТЕЛЯ
    let clientId, clientSecret;
    let credentialsSource = 'unknown';
    
    try {
      logger.info('Loading Google Workspace credentials from database for user:', userId);
      
      // Получаем ключи из БД через LibreChat API
      clientId = await getUserPluginAuthValue(userId, 'GOOGLE_CLIENT_ID');
      clientSecret = await getUserPluginAuthValue(userId, 'GOOGLE_CLIENT_SECRET');
      
      if (clientId && clientSecret) {
        credentialsSource = 'database';
        logger.info('Database credentials loaded successfully:', {
          hasClientId: !!clientId,
          hasClientSecret: !!clientSecret,
          clientIdLength: clientId.length,
          clientSecretLength: clientSecret.length,
          clientIdPreview: clientId.substring(0, 20) + '...'
        });
      } else {
        throw new Error('No credentials found in database');
      }
      
    } catch (dbError) {
      logger.warn('Could not load credentials from database:', dbError.message);
      
      // ✅ Fallback на переменные окружения
      clientId = process.env.GOOGLE_CLIENT_ID;
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      credentialsSource = 'environment';
      
      logger.info('Using fallback environment credentials:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      });
    }
    
    // ✅ ВАЛИДАЦИЯ CREDENTIALS
    if (!clientId || !clientSecret) {
      logger.error('Google Workspace OAuth: Missing client credentials');
      return res.status(500).send(generateErrorPage(
        'Missing Google client credentials in database and environment variables',
        'OAuth Configuration Error'
      ));
    }

    // Проверка на placeholder значения
    if (clientId === 'user_provided' || clientSecret === 'user_provided') {
      logger.error('Google Workspace OAuth: Placeholder credentials detected');
      return res.status(500).send(generateErrorPage(
        'Placeholder credentials detected. Please configure real OAuth credentials in plugin settings.',
        'Invalid Credentials'
      ));
    }

    // Проверка формата Google Client ID
    if (!clientId.includes('.apps.googleusercontent.com')) {
      logger.error('Google Workspace OAuth: Invalid Client ID format');
      return res.status(500).send(generateErrorPage(
        'Invalid Google Client ID format. Must end with .apps.googleusercontent.com',
        'Invalid Client ID'
      ));
    }

    logger.info('Creating OAuth2 client with validated credentials:', {
      clientIdStart: clientId.substring(0, 20) + '...',
      redirectUri,
      credentialsSource
    });

    // ✅ СОЗДАНИЕ OAUTH2 CLIENT
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    logger.info('Exchanging authorization code for tokens...');
    
    // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ И ОБРАБОТКА ЗАПРОСА К GOOGLE API
    try {
      const tokenStartTime = Date.now();
      
      // Логируем детали запроса перед отправкой
      logger.info('Token exchange request details:', {
        endpoint: 'https://oauth2.googleapis.com/token',
        codeLength: code.length,
        redirectUri,
        clientIdDomain: clientId.split('@')[0] || clientId.split('.')[0],
        timestamp: new Date().toISOString()
      });
      
      const { tokens } = await oauth2Client.getToken(code);
      
      const tokenEndTime = Date.now();
      const exchangeDuration = tokenEndTime - tokenStartTime;
      
      logger.info(`Token exchange completed successfully in ${exchangeDuration}ms`, {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiryDate: tokens.expiry_date
      });
      
      if (!tokens.access_token) {
        throw new Error('Failed to obtain access token from Google OAuth response');
      }

      logger.info('Tokens received successfully, fetching user information...');

      // ✅ ПОЛУЧЕНИЕ ИНФОРМАЦИИ О ПОЛЬЗОВАТЕЛЕ
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      
      const userInfoStartTime = Date.now();
      const userInfo = await oauth2.userinfo.get();
      const userInfoEndTime = Date.now();
      
      logger.info(`User info retrieved in ${userInfoEndTime - userInfoStartTime}ms`);
      
      const userEmail = userInfo.data.email;
      const userName = userInfo.data.name;
      const userPicture = userInfo.data.picture;
      const googleUserId = userInfo.data.id;
      
      logger.info(`Google Workspace OAuth successful for LibreChat user ${userId}, Google user: ${userEmail}`);

      // ✅ СТРУКТУРИРОВАННЫЕ ТОКЕНЫ С МЕТАДАННЫМИ
      const tokenData = {
        // OAuth токены
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        token_type: tokens.token_type,
        expiry_date: tokens.expiry_date,
        
        // Информация о Google пользователе
        google_user_email: userEmail,
        google_user_name: userName,
        google_user_picture: userPicture,
        google_user_id: googleUserId,
        
        // Информация о LibreChat пользователе
        librechat_user_id: userId,
        
        // Метаданные OAuth процесса
        created_at: new Date().toISOString(),
        domain: req.get('host'),
        user_agent: req.headers['user-agent'],
        credentials_source: credentialsSource,
        auth_method: state ? 'state_parameter' : 'session_fallback',
        exchange_duration_ms: exchangeDuration,
        
        // State информация
        oauth_state: stateInfo
      };

      // ✅ СОЗДАНИЕ ДИРЕКТОРИИ И СОХРАНЕНИЕ ТОКЕНОВ
      const tokensDir = path.join(process.cwd(), 'workspace_tokens');
      try {
        await fs.mkdir(tokensDir, { recursive: true });
        logger.info('Workspace tokens directory created/verified');
      } catch (dirError) {
        logger.warn('Could not create tokens directory:', dirError.message);
      }

      // Персонализированное сохранение токенов
      const sanitizedEmail = userEmail.replace('@', '_at_').replace(/[^a-zA-Z0-9_]/g, '_');
      const mainTokenPath = path.join(process.cwd(), 'workspace_tokens.json');
      const userTokenPath = path.join(tokensDir, `user_${userId}_${sanitizedEmail}.json`);
      
      // Сохраняем основной файл токенов (для совместимости)
      await fs.writeFile(mainTokenPath, JSON.stringify(tokenData, null, 2));
      
      // Сохраняем персональный файл пользователя
      await fs.writeFile(userTokenPath, JSON.stringify(tokenData, null, 2));
      
      logger.info(`Google Workspace tokens saved successfully:`, {
        mainTokenPath,
        userTokenPath,
        userEmail,
        librechatUserId: userId
      });

      // ✅ УСПЕШНАЯ СТРАНИЦА С АВТОМАТИЧЕСКИМ РЕДИРЕКТОМ
      return res.send(generateSuccessPage(userName, userEmail, userPicture, credentialsSource));
      
    } catch (tokenError) {
      // ✅ ДЕТАЛЬНАЯ ОБРАБОТКА ОШИБОК ЗАПРОСА К GOOGLE API
      logger.error('Token exchange failed with detailed error info:', {
        error: tokenError.message,
        name: tokenError.name,
        code: tokenError.code,
        status: tokenError.status || tokenError.response?.status,
        statusText: tokenError.statusText || tokenError.response?.statusText,
        responseData: tokenError.response?.data,
        stack: tokenError.stack?.split('\n').slice(0, 5), // Первые 5 строк стека
        config: tokenError.config ? {
          url: tokenError.config.url,
          method: tokenError.config.method,
          timeout: tokenError.config.timeout,
          headers: tokenError.config.headers ? Object.keys(tokenError.config.headers) : undefined
        } : undefined
      });
      
      // Специфические типы ошибок
      let userFriendlyError = tokenError.message;
      
      if (tokenError.message.includes('timeout') || tokenError.code === 'ETIMEDOUT') {
        userFriendlyError = 'Request to Google OAuth API timed out. This may be due to network connectivity issues on the server. Please try again.';
      } else if (tokenError.message.includes('ENOTFOUND') || tokenError.message.includes('ECONNRESET') || tokenError.message.includes('ECONNREFUSED')) {
        userFriendlyError = 'Network connection to Google OAuth API failed. This appears to be a server-side connectivity issue. Please try again later.';
      } else if (tokenError.code === 'invalid_grant' || tokenError.message.includes('invalid_grant')) {
        userFriendlyError = 'Authorization code expired or invalid. Please try authorizing again from the beginning.';
      } else if (tokenError.code === 'invalid_client' || tokenError.message.includes('invalid_client')) {
        userFriendlyError = 'Invalid OAuth client configuration. Please check your Google Cloud Console settings.';
      } else if (tokenError.message.includes('redirect_uri_mismatch')) {
        userFriendlyError = 'OAuth redirect URI mismatch. Please verify your Google Cloud Console configuration.';
      }
      
      throw new Error(userFriendlyError);
    }
    
  } catch (error) {
    // ✅ ОБЩАЯ ОБРАБОТКА ОШИБОК
    logger.error('Google Workspace OAuth callback error:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3),
      userId: req.user?.id || 'unknown'
    });
    
    return res.status(500).send(generateErrorPage(error.message, 'Authentication Failed'));
  }
};

// ✅ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ГЕНЕРАЦИИ HTML СТРАНИЦ

function generateErrorPage(errorMessage, errorTitle = 'Authorization Error') {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Google Workspace ${errorTitle}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          text-align: center; 
          padding: 20px;
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          color: white;
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 600px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        .error { 
          color: #fff; 
          font-size: 32px; 
          margin-bottom: 20px;
          font-weight: bold;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        .error-message {
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
          font-size: 16px;
          line-height: 1.6;
          word-break: break-word;
        }
        .troubleshooting {
          text-align: left;
          background: rgba(255, 255, 255, 0.05);
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .troubleshooting h3 {
          margin-top: 0;
          color: #ffd93d;
        }
        .troubleshooting ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .action-buttons {
          margin-top: 30px;
        }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          margin: 5px;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          transition: all 0.3s;
          border: 1px solid rgba(255, 255, 255, 0.3);
          font-size: 16px;
          cursor: pointer;
        }
        .btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        .btn-primary {
          background: linear-gradient(45deg, #ff6b6b, #ee5a24);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error">❌ ${errorTitle}</div>
        
        <div class="error-message">
          ${errorMessage}
        </div>
        
        <div class="troubleshooting">
          <h3>🔧 Troubleshooting Steps:</h3>
          <ul>
            <li>Return to LibreChat and try again</li>
            <li>Ensure you're logged into LibreChat</li>
            <li>Check your Google Workspace plugin configuration</li>
            <li>Verify your OAuth credentials in Google Cloud Console</li>
            <li>Check network connectivity issues on the server</li>
          </ul>
        </div>
        
        <div class="action-buttons">
          <a href="/" class="btn btn-primary">Return to LibreChat</a>
          <button class="btn" onclick="window.close()">Close Window</button>
          <button class="btn" onclick="window.location.reload()">Try Again</button>
        </div>
      </div>
      
      <script>
        // Автоматическое закрытие через 30 секунд для popup окон
        if (window.opener) {
          setTimeout(() => window.close(), 30000);
        }
      </script>
    </body>
    </html>
  `;
}

function generateSessionLostPage() {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Session Lost - Google Workspace</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          text-align: center; 
          padding: 20px;
          background: linear-gradient(135deg, #ffa726 0%, #ff7043 100%);
          color: white;
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }
        .warning {
          font-size: 32px;
          margin-bottom: 20px;
          font-weight: bold;
        }
        .instructions {
          text-align: left;
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 10px;
          margin: 20px 0;
        }
        .instructions ol {
          margin: 0;
          padding-left: 20px;
        }
        .instructions li {
          margin: 10px 0;
          line-height: 1.4;
        }
        .btn {
          display: inline-block;
          padding: 15px 30px;
          margin: 10px;
          background: linear-gradient(45deg, #4CAF50, #45a049);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 18px;
          font-weight: bold;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="warning">⚠️ Session Lost</div>
        
        <p>Your LibreChat session was lost during OAuth authorization.</p>
        
        <div class="instructions">
          <strong>Please follow these steps:</strong>
          <ol>
            <li>Return to LibreChat in your original browser tab</li>
            <li>Make sure you're still logged in</li>
            <li>Go to Google Workspace plugin settings</li>
            <li>Try authorizing again</li>
          </ol>
        </div>
        
        <div style="margin-top: 30px;">
          <a href="/" class="btn">Return to LibreChat</a>
        </div>
      </div>
    </body>
    </html>
  `;
}

function generateSuccessPage(userName, userEmail, userPicture, credentialsSource) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Google Workspace Authorization Success</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          text-align: center; 
          padding: 20px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          background: rgba(255, 255, 255, 0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(15px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 700px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        .success { 
          color: #4CAF50; 
          font-size: 36px; 
          margin-bottom: 20px;
          font-weight: bold;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          animation: successPulse 2s ease-in-out;
        }
        @keyframes successPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        .user-info {
          background: rgba(255, 255, 255, 0.15);
          padding: 25px;
          border-radius: 15px;
          margin: 25px 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .user-avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          margin: 0 auto 15px;
          border: 3px solid rgba(255, 255, 255, 0.3);
          display: ${userPicture ? 'block' : 'none'};
        }
        .user-name {
          font-size: 26px;
          font-weight: bold;
          margin-bottom: 8px;
        }
        .user-email {
          font-size: 16px;
          opacity: 0.8;
        }
        .integration-status {
          background: rgba(76, 175, 80, 0.2);
          padding: 15px;
          border-radius: 10px;
          margin: 20px 0;
          border: 1px solid rgba(76, 175, 80, 0.3);
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin: 25px 0;
        }
        .feature-card {
          background: rgba(255, 255, 255, 0.1);
          padding: 20px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .feature-icon {
          font-size: 24px;
          margin-bottom: 10px;
        }
        .feature-title {
          font-weight: bold;
          margin-bottom: 5px;
        }
        .feature-desc {
          font-size: 14px;
          opacity: 0.8;
        }
        .action-buttons {
          margin: 30px 0;
        }
        .btn {
          display: inline-block;
          padding: 15px 30px;
          margin: 5px;
          border: none;
          border-radius: 8px;
          font-size: 18px;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          font-weight: bold;
        }
        .btn-primary {
          background: linear-gradient(45deg, #4CAF50, #45a049);
          color: white;
        }
        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
        }
        .countdown {
          font-size: 14px;
          opacity: 0.7;
          margin-top: 15px;
        }
        .tech-details {
          background: rgba(255, 255, 255, 0.05);
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 12px;
          opacity: 0.7;
        }
        @media (max-width: 600px) {
          .container { margin: 10px; padding: 30px 20px; }
          .success { font-size: 28px; }
          .features-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="success">✅ Authorization Successful!</div>
        
        <div class="user-info">
          ${userPicture ? `<img src="${userPicture}" alt="User Avatar" class="user-avatar">` : ''}
          <div class="user-name">${userName}</div>
          <div class="user-email">${userEmail}</div>
        </div>
        
        <div class="integration-status">
          <strong>🔗 Successfully Connected to LibreChat</strong><br>
          <small>Credentials source: ${credentialsSource === 'database' ? 'User database' : 'Environment variables'}</small>
        </div>
        
        <div style="color: #f0f0f0; font-size: 18px; line-height: 1.8; margin: 20px 0;">
          Your Google Workspace account is now fully integrated!
        </div>
        
        <div class="features-grid">
          <div class="feature-card">
            <div class="feature-icon">📧</div>
            <div class="feature-title">Gmail Integration</div>
            <div class="feature-desc">Search, send, and manage emails with attachments</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📁</div>
            <div class="feature-title">Google Drive</div>
            <div class="feature-desc">File management, upload/download, sharing</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📅</div>
            <div class="feature-title">Calendar</div>
            <div class="feature-desc">Event management, scheduling, invitations</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">👥</div>
            <div class="feature-title">Contacts</div>
            <div class="feature-desc">Contact retrieval and management</div>
          </div>
        </div>
        
        <div class="action-buttons">
          <a href="/" class="btn btn-primary">Return to LibreChat</a>
          <button class="btn btn-secondary" onclick="window.close()">Close Window</button>
        </div>
        
        <div class="countdown">
          Redirecting to LibreChat in <span id="countdown">8</span> seconds
        </div>
        
        <div class="tech-details">
          <strong>Technical Details:</strong><br>
          ✓ OAuth 2.0 flow completed successfully<br>
          ✓ Access tokens securely stored<br>
          ✓ Integration status: Active<br>
          ✓ Authentication method: ${credentialsSource === 'database' ? 'Database credentials' : 'Environment fallback'}
        </div>
      </div>
      
      <script>
        let seconds = 8;
        const countdownElement = document.getElementById('countdown');
        
        const timer = setInterval(() => {
          seconds--;
          countdownElement.textContent = seconds;
          
          if (seconds <= 0) {
            clearInterval(timer);
            window.location.href = '/';
          }
        }, 1000);
        
        // Закрытие окна при Escape
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            window.close();
          }
        });
        
        // Для popup окон - автозакрытие при клике на overlay
        if (window.opener) {
          document.addEventListener('click', (e) => {
            if (e.target === document.body) {
              window.close();
            }
          });
        }
      </script>
    </body>
    </html>
  `;
}

module.exports = { handleGoogleWorkspaceCallback };
