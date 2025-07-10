const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// === IPC/STDIN взаимодействие с MCP ===

// Функция отправки authorization code в MCP через stdio
function sendAuthCodeToMCP(code, state) {
  // Формируем сообщение для MCP в формате JSON по протоколу stdio
  const message = JSON.stringify({
    type: 'oauth_callback',
    code,
    state,
    timestamp: Date.now()
  }) + '\n';

  // Отправляем в stdout процесса MCP (предполагается, что MCP слушает stdin)
  try {
    if (process.send) {
      // Если запущено как дочерний процесс через fork (cluster/child_process)
      process.send({ mcp_oauth_callback: { code, state } });
      logger.info('Authorization code sent to MCP via process.send');
    } else if (process.stdin && process.stdin.writable) {
      process.stdin.write(message);
      logger.info('Authorization code sent to MCP via stdin');
    } else {
      logger.error('Unable to send code to MCP: no IPC channel or writable stdin');
      return false;
    }
    return true;
  } catch (err) {
    logger.error('Failed to send authorization code to MCP:', err);
    return false;
  }
}

// OAuth callback handler для Google Workspace MCP
router.get('/oauth2callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('OAuth error:', error);
      return res.status(400).json({
        error: 'OAuth authorization failed',
        details: error
      });
    }

    if (!code) {
      return res.status(400).json({
        error: 'Missing authorization code'
      });
    }

    // === IPC: Автоматически передаем code в MCP ===
    const sent = sendAuthCodeToMCP(code, state);

    if (sent) {
      // Показываем пользователю страницу успешной авторизации
      res.send(`
        <html>
          <head>
            <title>Google OAuth Success</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .container { max-width: 600px; margin: 0 auto; }
              .success { color: #28a745; }
              .instructions { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="success">✅ Google OAuth Authorization Successful!</h1>
              <p>Your Google account has been successfully authorized. You may now return to LibreChat.</p>
              <div class="instructions">
                <p>If this window does not close automatically, you can close it manually.</p>
              </div>
              <script>
                setTimeout(() => window.close(), 1500);
              </script>
            </div>
          </body>
        </html>
      `);
      logger.info('OAuth callback processed and code sent to MCP');
    } else {
      // Fallback: показываем код для ручного завершения
      res.send(`
        <html>
          <head>
            <title>Google OAuth Success (Manual Action Required)</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 40px; }
              .container { max-width: 600px; margin: 0 auto; }
              .warning { color: #d9534f; }
              .code { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; }
              .instructions { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 class="warning">⚠️ Authorization Code Not Delivered Automatically</h1>
              <p>Copy the authorization code below and paste it into LibreChat using the <b>authenticate_workspace_account</b> tool.</p>
              <div class="instructions">
                <h3>Authorization Code:</h3>
                <div class="code">${code}</div>
                <p><small>State: ${state}</small></p>
              </div>
            </div>
          </body>
        </html>
      `);
      logger.warn('Authorization code could not be sent to MCP automatically; manual action required');
    }
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'Internal server error during OAuth callback',
      details: error.message
    });
  }
});

module.exports = router;
