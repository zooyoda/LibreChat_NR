const { google } = require('googleapis');
const https = require('https');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

// ✅ Настройка HTTP Agent с увеличенными timeout'ами для Amvera
const httpsAgent = new https.Agent({
  timeout: 60000, // 60 секунд вместо стандартных 5
  keepAlive: true,
  maxSockets: 50,
  rejectUnauthorized: false // Для обхода SSL проблем на Amvera
});

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
        logger.info('UserId extracted from state parameter:', { userId, timestamp: stateData.timestamp, source: stateData.source });
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

    // ✅ СОЗДАНИЕ OAUTH2 CLIENT С TIMEOUT НАСТРОЙКАМИ
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    // ✅ Настройка HTTP клиента для увеличенных timeout'ов
    oauth2Client._requestOptions = {
      timeout: 60000,
      agent: httpsAgent
    };

    logger.info('Exchanging authorization code for tokens...');

    // ✅ ОБМЕН С RETRY ЛОГИКОЙ ДЛЯ ОБХОДА TIMEOUT'ОВ
    let tokens;
    let attempt = 1;
    const maxAttempts = 3;

    while (attempt <= maxAttempts) {
      try {
        logger.info(`Token exchange attempt ${attempt}/${maxAttempts}`);
        
        const tokenStartTime = Date.now();
        
        // Добавляем дополнительные опции для запроса
        const result = await Promise.race([
          oauth2Client.getToken(code),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 50 seconds')), 50000)
          )
        ]);
        
        tokens = result.tokens;
        
        const duration = Date.now() - tokenStartTime;
        logger.info(`Token exchange successful on attempt ${attempt} in ${duration}ms`);
        break;
        
      } catch (attemptError) {
        logger.warn(`Token exchange attempt ${attempt} failed:`, attemptError.message);
        
        if (attempt === maxAttempts) {
          // Если все попытки неудачны, возвращаем специальную страницу
          if (attemptError.message.includes('timeout') || attemptError.code === 'ETIMEDOUT') {
            return res.send(generateTimeoutInstructionsPage(req.get('host')));
          }
          throw attemptError;
        }
        
        // Пауза перед повторной попыткой (2, 4, 6 секунд)
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        attempt++;
      }
    }

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

  } catch (error) {
    // ✅ ОБЩАЯ ОБРАБОТКА ОШИБОК
    logger.error('Google Workspace OAuth callback error:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3),
      userId: req.user?.id || 'unknown'
    });

    // Специфические типы ошибок
    let userFriendlyError = error.message;
    if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      userFriendlyError = 'Request to Google OAuth API timed out. This may be due to network connectivity issues on the server. Please try again.';
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNRESET') || error.message.includes('ECONNREFUSED')) {
      userFriendlyError = 'Network connection to Google OAuth API failed. This appears to be a server-side connectivity issue. Please try again later.';
    }

    return res.status(500).send(generateErrorPage(userFriendlyError, 'Authentication Failed'));
  }
};

// ✅ СПЕЦИАЛЬНАЯ СТРАНИЦА ДЛЯ TIMEOUT ПРОБЛЕМ
function generateTimeoutInstructionsPage(hostname) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Network Timeout - Google Workspace</title>
      <meta charset="utf-8">
      <style>
        body { 
          font-family: Arial, sans-serif; 
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
          max-width: 600px;
        }
        .title { font-size: 28px; margin-bottom: 20px; font-weight: bold; }
        .section { 
          background: rgba(255, 255, 255, 0.1); 
          padding: 20px; 
          border-radius: 10px; 
          margin: 20px 0; 
          text-align: left;
        }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          margin: 10px;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">⏱️ Сетевые ограничения обнаружены</div>
        
        <div class="section">
          <h3>🔍 Проблема:</h3>
          <p>Запросы к Google OAuth API превышают лимит времени на сервере Amvera.</p>
        </div>
        
        <div class="section">
          <h3>🛠️ Решения:</h3>
          <ol>
            <li><strong>Попробуйте еще раз</strong> - иногда проблема временная</li>
            <li><strong>Используйте VPN</strong> при настройке (может помочь)</li>
            <li><strong>Обратитесь к администратору</strong> для настройки сетевых параметров</li>
          </ol>
        </div>
        
        <div class="section">
          <h3>📋 Диагностика:</h3>
          <p>Проверьте сетевое соединение: <a href="https://${hostname}/api/debug/network-test" style="color: #ffd93d;">Тест сети</a></p>
        </div>
        
        <a href="/" class="btn">Вернуться в LibreChat</a>
        <button class="btn" onclick="window.location.reload()">Попробовать снова</button>
      </div>
    </body>
    </html>
  `;
}

// ✅ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ГЕНЕРАЦИИ HTML СТРАНИЦ
function generateErrorPage(errorMessage, errorTitle = 'Authorization Error') {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${errorTitle}</title>
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
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-width: 500px;
        }
        .error { color: #fff; font-size: 28px; margin-bottom: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="error">${errorTitle}</div>
        <div>OAuth Error: ${errorMessage}</div>
        <div style="margin-top: 20px; color: #f0f0f0;">
          This error occurred during Google Workspace authorization.<br>
          Please try again or check your OAuth configuration.
        </div>
      </div>
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
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px;
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
          border-radius: 15px;
          backdrop-filter: blur(10px);
          max-width: 500px;
        }
        .title { font-size: 28px; margin-bottom: 20px; font-weight: bold; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          margin: 10px;
          background: #4CAF50;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="title">🔐 Session Lost</div>
        <p>Your LibreChat session was lost during OAuth authorization.</p>
        <p>Please log in to LibreChat again and retry Google Workspace authorization.</p>
        <a href="/" class="btn">Return to LibreChat</a>
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
      <style>
        body { 
          font-family: Arial, sans-serif; 
          text-align: center; 
          padding: 50px;
          background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
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
        .success { color: #fff; font-size: 28px; margin-bottom: 20px; font-weight: bold; }
        .user-info { margin: 20px 0; }
        .avatar { border-radius: 50%; width: 80px; height: 80px; margin: 10px; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          margin: 10px;
          background: #2196F3;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
        }
      </style>
      <script>
        setTimeout(() => {
          window.close();
        }, 5000);
      </script>
    </head>
    <body>
      <div class="container">
        <div class="success">✓ Authorization Successful!</div>
        <div class="user-info">
          ${userPicture ? `<img src="${userPicture}" alt="User Avatar" class="avatar">` : ''}
          <div><strong>${userName}</strong></div>
          <div>${userEmail}</div>
          <div style="font-size: 12px; margin-top: 10px;">
            Credentials loaded from: ${credentialsSource}
          </div>
        </div>
        <div style="color: #f0f0f0; margin: 20px 0;">
          Your Google Workspace account has been connected to LibreChat.<br>
          You can now close this window and start using Google Workspace tools.
        </div>
        <a href="/" class="btn">Return to LibreChat</a>
        <div style="font-size: 12px; margin-top: 15px;">
          This window will close automatically in 5 seconds.
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = { handleGoogleWorkspaceCallback };
