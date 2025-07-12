const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('@librechat/data-schemas');

const handleGoogleWorkspaceCallback = async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    // ✅ ДОБАВЛЕНО: Расширенное логирование для отладки
    logger.info('Google Workspace OAuth callback received:', { 
      hasCode: !!code, 
      error, 
      state,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer
    });
    
    // ✅ УЛУЧШЕНО: Детальная обработка OAuth ошибок
    if (error) {
      logger.error('Google Workspace OAuth error from Google:', error);
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Workspace Authorization Error</title>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              text-align: center; 
              padding: 50px; 
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
              border-radius: 15px;
              backdrop-filter: blur(10px);
              border: 1px solid rgba(255, 255, 255, 0.2);
              max-width: 500px;
            }
            .error { 
              color: #fff; 
              font-size: 28px; 
              margin-bottom: 20px;
              font-weight: bold;
            }
            .details { 
              color: #f0f0f0; 
              font-size: 16px; 
              margin-top: 20px;
              line-height: 1.6;
            }
            .retry-btn {
              background: #fff;
              color: #ee5a24;
              border: none;
              padding: 12px 24px;
              border-radius: 6px;
              font-size: 16px;
              cursor: pointer;
              margin-top: 20px;
              transition: all 0.3s;
            }
            .retry-btn:hover {
              background: #f0f0f0;
              transform: translateY(-2px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">⚠️ Authorization Failed</div>
            <div>OAuth Error: ${error}</div>
            <div class="details">
              This error occurred during Google Workspace authorization.<br>
              Please try again or check your OAuth configuration.
            </div>
            <button class="retry-btn" onclick="window.close()">Close Window</button>
          </div>
        </body>
        </html>
      `);
    }

    if (!code) {
      logger.warn('Google Workspace OAuth: No authorization code provided');
      return res.status(400).json({ 
        error: 'No authorization code provided',
        details: 'OAuth flow was interrupted or cancelled' 
      });
    }

    // ✅ ИСПРАВЛЕНО: Статический redirect URI для избежания ошибки invalid_client
    const redirectUri = 'https://nrlibre-neuralrunner.amvera.io/oauth/google/workspace/callback';
    
    // ✅ УЛУЧШЕНО: Получение credentials с fallback на переменные окружения
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      logger.error('Google Workspace OAuth: Missing client credentials');
      return res.status(500).json({ 
        error: 'OAuth configuration error',
        details: 'Missing Google client credentials in environment variables' 
      });
    }

    // ✅ ДОБАВЛЕНО: Проверка валидности credentials
    if (clientId === 'user_provided' || clientSecret === 'user_provided') {
      logger.error('Google Workspace OAuth: Invalid placeholder credentials');
      return res.status(500).json({ 
        error: 'OAuth configuration error',
        details: 'Placeholder credentials detected. Please configure real OAuth credentials.' 
      });
    }

    logger.info('Creating OAuth2 client with:', {
      clientId: clientId.substring(0, 20) + '...',
      redirectUri,
      hasClientSecret: !!clientSecret
    });

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    logger.info('Exchanging authorization code for tokens...');
    
    // ✅ УЛУЧШЕНО: Обмен кода на токены с обработкой ошибок
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('Failed to obtain access token from Google');
    }

    logger.info('Tokens received successfully, fetching user information...');

    // ✅ ДОБАВЛЕНО: Получение информации о пользователе
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const userEmail = userInfo.data.email;
    const userName = userInfo.data.name;
    const userPicture = userInfo.data.picture;
    
    logger.info(`Google Workspace OAuth successful for user: ${userEmail}`);

    // ✅ УЛУЧШЕНО: Создание структурированных токенов с метаданными
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: tokens.expiry_date,
      // Пользовательские данные
      user_email: userEmail,
      user_name: userName,
      user_picture: userPicture,
      user_id: userInfo.data.id,
      // Метаданные
      created_at: new Date().toISOString(),
      domain: req.get('host'),
      user_agent: req.headers['user-agent']
    };

    // ✅ ДОБАВЛЕНО: Создание директории для токенов
    const tokensDir = path.join(process.cwd(), 'workspace_tokens');
    try {
      await fs.mkdir(tokensDir, { recursive: true });
      logger.info('Workspace tokens directory created/verified');
    } catch (error) {
      logger.warn('Could not create tokens directory:', error.message);
    }

    // ✅ УЛУЧШЕНО: Сохранение токенов с персонализацией
    const mainTokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    const userTokenPath = path.join(tokensDir, `${userEmail.replace('@', '_at_').replace(/[^a-zA-Z0-9_]/g, '_')}.json`);
    
    // Сохраняем основной файл токенов (для совместимости)
    await fs.writeFile(mainTokenPath, JSON.stringify(tokenData, null, 2));
    
    // Сохраняем персональный файл пользователя
    await fs.writeFile(userTokenPath, JSON.stringify(tokenData, null, 2));
    
    logger.info(`Google Workspace tokens saved for ${userEmail} in both main and user-specific files`);

    // ✅ УЛУЧШЕНО: Красивая страница успеха с информацией о пользователе
    res.send(`
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
            max-width: 600px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
          }
          .success { 
            color: #4CAF50; 
            font-size: 32px; 
            margin-bottom: 20px;
            font-weight: bold;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
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
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .user-email {
            font-size: 16px;
            opacity: 0.8;
          }
          .info { 
            color: #f0f0f0; 
            font-size: 18px; 
            line-height: 1.8;
            margin: 20px 0;
          }
          .features {
            text-align: left;
            display: inline-block;
            margin: 20px 0;
          }
          .feature-item {
            display: flex;
            align-items: center;
            margin: 10px 0;
            font-size: 16px;
          }
          .feature-icon {
            margin-right: 10px;
            font-size: 20px;
          }
          .close-btn {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            margin-top: 25px;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
          }
          .close-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(76, 175, 80, 0.4);
          }
          .countdown {
            font-size: 14px;
            opacity: 0.7;
            margin-top: 15px;
          }
          @media (max-width: 600px) {
            .container { margin: 10px; padding: 30px 20px; }
            .success { font-size: 28px; }
            .info { font-size: 16px; }
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
          
          <div class="info">
            Your Google Workspace account has been successfully connected to LibreChat.<br>
            You can now use all Google Workspace tools!
          </div>
          
          <div class="features">
            <div class="feature-item">
              <span class="feature-icon">📧</span>
              <span>Gmail integration (search, send, manage emails)</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📁</span>
              <span>Google Drive access (files, folders, sharing)</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">📅</span>
              <span>Calendar management (events, meetings)</span>
            </div>
            <div class="feature-item">
              <span class="feature-icon">👥</span>
              <span>Contacts synchronization</span>
            </div>
          </div>
          
          <button class="close-btn" onclick="window.close()">Close Window</button>
          
          <div class="countdown">
            This window will close automatically in <span id="countdown">10</span> seconds
          </div>
        </div>
        
        <script>
          let seconds = 10;
          const countdownElement = document.getElementById('countdown');
          
          const timer = setInterval(() => {
            seconds--;
            countdownElement.textContent = seconds;
            
            if (seconds <= 0) {
              clearInterval(timer);
              window.close();
            }
          }, 1000);
          
          // Также закрываем окно при нажатии Escape
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.close();
            }
          });
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    logger.error('Google Workspace OAuth callback error:', {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // ✅ УЛУЧШЕНО: Детальная страница ошибки
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Workspace Authorization Error</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
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
            border-radius: 15px;
            backdrop-filter: blur(10px);
            max-width: 500px;
          }
          .error { 
            color: #fff; 
            font-size: 28px; 
            margin-bottom: 20px;
            font-weight: bold;
          }
          .details { 
            color: #f0f0f0; 
            font-size: 16px; 
            margin-top: 20px;
            line-height: 1.6;
          }
          .error-code {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            margin: 15px 0;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">❌ Authentication Failed</div>
          <div>There was an error during Google Workspace authorization.</div>
          <div class="error-code">${error.message}</div>
          <div class="details">
            Please try again or contact support if the problem persists.<br>
            Make sure your OAuth credentials are properly configured.
          </div>
        </div>
      </body>
      </html>
    `);
  }
};

module.exports = { handleGoogleWorkspaceCallback };
