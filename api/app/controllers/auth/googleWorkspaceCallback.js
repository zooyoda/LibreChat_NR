const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

const handleGoogleWorkspaceCallback = async (req, res) => {
  try {
    const { code, error, state } = req.query;
    
    logger.info('Google Workspace OAuth callback received:', { 
      hasCode: !!code, 
      error, 
      hasState: !!state,
      reqUserExists: !!req.user,
      userAgent: req.headers['user-agent']
    });
    
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">⚠️ Authorization Failed</div>
            <div>OAuth Error: ${error}</div>
            <div style="margin-top: 20px; color: #f0f0f0;">
              This error occurred during Google Workspace authorization.<br>
              Please try again or check your OAuth configuration.
            </div>
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

    // ✅ ИСПРАВЛЕНО: Получение userId из state параметра вместо req.user
    let userId;
    
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        userId = stateData.userId;
        logger.info('UserId extracted from state parameter:', userId);
      } catch (stateError) {
        logger.error('Failed to parse state parameter:', stateError);
      }
    }
    
    // Fallback на req.user если state не сработал
    if (!userId && req.user?.id) {
      userId = req.user.id;
      logger.info('UserId obtained from req.user:', userId);
    }
    
    if (!userId) {
      logger.error('Google Workspace OAuth: No user ID available from state or session');
      return res.status(401).send(`
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
          </style>
        </head>
        <body>
          <div class="container">
            <h2>❌ Session Lost</h2>
            <p>Your LibreChat session was lost during OAuth authorization.</p>
            <p><strong>Please:</strong></p>
            <ol style="text-align: left; display: inline-block;">
              <li>Return to LibreChat in your original tab</li>
              <li>Make sure you're logged in</li>
              <li>Try authorizing Google Workspace again</li>
            </ol>
            <p style="margin-top: 20px;">
              <a href="/" style="color: #4CAF50; text-decoration: none; font-weight: bold;">
                ← Return to LibreChat
              </a>
            </p>
          </div>
        </body>
        </html>
      `);
    }

    const redirectUri = 'https://nrlibre-neuralrunner.amvera.io/oauth/google/workspace/callback';
    
    // Получение credentials из БД пользователя
    let clientId, clientSecret;
    
    try {
      logger.info('Loading Google Workspace credentials from database for user:', userId);
      
      clientId = await getUserPluginAuthValue(userId, 'GOOGLE_CLIENT_ID');
      clientSecret = await getUserPluginAuthValue(userId, 'GOOGLE_CLIENT_SECRET');
      
      logger.info('Database credentials loaded:', {
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        clientIdLength: clientId ? clientId.length : 0
      });
      
    } catch (dbError) {
      logger.warn('Could not load credentials from database:', dbError.message);
      
      // Fallback на переменные окружения
      clientId = process.env.GOOGLE_CLIENT_ID;
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      
      logger.info('Using fallback environment credentials');
    }
    
    if (!clientId || !clientSecret) {
      logger.error('Google Workspace OAuth: Missing client credentials');
      return res.status(500).json({ 
        error: 'OAuth configuration error',
        details: 'Missing Google client credentials in database and environment variables' 
      });
    }

    // Проверка на placeholder значения
    if (clientId === 'user_provided' || clientSecret === 'user_provided') {
      logger.error('Google Workspace OAuth: Placeholder credentials detected');
      return res.status(500).json({ 
        error: 'OAuth configuration error',
        details: 'Placeholder credentials detected. Please configure real OAuth credentials.' 
      });
    }

    logger.info('Creating OAuth2 client with validated credentials');

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    logger.info('Exchanging authorization code for tokens...');
    
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('Failed to obtain access token from Google');
    }

    logger.info('Tokens received successfully, fetching user information...');

    // Получение информации о пользователе
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const userEmail = userInfo.data.email;
    const userName = userInfo.data.name;
    const userPicture = userInfo.data.picture;
    
    logger.info(`Google Workspace OAuth successful for LibreChat user ${userId}, Google user: ${userEmail}`);

    // Структурированные токены с пользовательскими метаданными
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
      google_user_id: userInfo.data.id,
      
      // Информация о LibreChat пользователе
      librechat_user_id: userId,
      
      // Метаданные
      created_at: new Date().toISOString(),
      domain: req.get('host'),
      user_agent: req.headers['user-agent'],
      auth_method: state ? 'state_parameter' : 'session_fallback'
    };

    // Создание директории для токенов
    const tokensDir = path.join(process.cwd(), 'workspace_tokens');
    try {
      await fs.mkdir(tokensDir, { recursive: true });
    } catch (error) {
      logger.warn('Could not create tokens directory:', error.message);
    }

    // Персонализированное сохранение токенов
    const mainTokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    const userTokenPath = path.join(tokensDir, `user_${userId}_${userEmail.replace('@', '_at_').replace(/[^a-zA-Z0-9_]/g, '_')}.json`);
    
    // Сохраняем основной файл токенов (для совместимости)
    await fs.writeFile(mainTokenPath, JSON.stringify(tokenData, null, 2));
    
    // Сохраняем персональный файл пользователя
    await fs.writeFile(userTokenPath, JSON.stringify(tokenData, null, 2));
    
    logger.info(`Google Workspace tokens saved for LibreChat user ${userId} (${userEmail})`);

    // Успешная страница с автозакрытием и переходом обратно в LibreChat
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
          .integration-info {
            background: rgba(76, 175, 80, 0.2);
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid rgba(76, 175, 80, 0.3);
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
          .action-buttons {
            margin: 20px 0;
          }
          .btn {
            display: inline-block;
            padding: 12px 24px;
            margin: 5px;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          }
          .btn-primary {
            background: linear-gradient(45deg, #4CAF50, #45a049);
            color: white;
          }
          .btn-secondary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅ Authorization Successful!</div>
          
          <div class="user-info">
            ${userPicture ? `<img src="${userPicture}" alt="User Avatar" class="user-avatar">` : ''}
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">${userName}</div>
            <div style="font-size: 16px; opacity: 0.8;">${userEmail}</div>
          </div>
          
          <div class="integration-info">
            <strong>🔗 Successfully Connected to LibreChat</strong><br>
            <small>State-based authentication completed successfully</small>
          </div>
          
          <div style="color: #f0f0f0; font-size: 18px; line-height: 1.8; margin: 20px 0;">
            Your Google Workspace account is now fully integrated with LibreChat!
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
          
          <div class="action-buttons">
            <a href="/" class="btn btn-primary">Return to LibreChat</a>
            <button class="btn btn-secondary" onclick="window.close()">Close Window</button>
          </div>
          
          <div class="countdown">
            Redirecting to LibreChat in <span id="countdown">5</span> seconds
          </div>
        </div>
        
        <script>
          let seconds = 5;
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error">❌ Authentication Failed</div>
          <div>There was an error during Google Workspace authorization.</div>
          <div style="margin-top: 20px; color: #f0f0f0;">
            Error: ${error.message}<br><br>
            Please return to LibreChat and try again.
          </div>
        </div>
      </body>
      </html>
    `);
  }
};

module.exports = { handleGoogleWorkspaceCallback };
