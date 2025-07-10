const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// Простое временное in-memory хранилище для state→email
const stateEmailMap = new Map();
// Для очистки устаревших state (через 10 минут)
const STATE_TTL_MS = 10 * 60 * 1000;

function setStateEmail(state, email) {
  stateEmailMap.set(state, { email, created: Date.now() });
  // Очистка устаревших записей
  for (const [key, value] of stateEmailMap.entries()) {
    if (Date.now() - value.created > STATE_TTL_MS) {
      stateEmailMap.delete(key);
    }
  }
}

function getEmailByState(state) {
  const entry = stateEmailMap.get(state);
  if (!entry) return null;
  // Автоматическая очистка по TTL
  if (Date.now() - entry.created > STATE_TTL_MS) {
    stateEmailMap.delete(state);
    return null;
  }
  return entry.email;
}

// API для сохранения state→email (вызывать из backend до генерации OAuth ссылки)
router.post('/api/oauth/save-state', (req, res) => {
  const { state, email } = req.body;
  if (!state || !email) {
    return res.status(400).json({ error: 'Missing state or email' });
  }
  setStateEmail(state, email);
  res.json({ success: true });
});

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

    // Получаем email по state из памяти (если был сохранен)
    const email = state ? getEmailByState(state) : null;

    // Успешная страница с кодом для пользователя
    res.send(`
      <html>
        <head>
          <title>Google OAuth Success</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .container { max-width: 600px; margin: 0 auto; }
            .success { color: #28a745; }
            .code { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; }
            .instructions { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1 class="success">✅ Google OAuth Authorization Successful!</h1>
            <p>Your Google account has been successfully authorized.</p>
            <div class="instructions">
              <h3>Next Steps:</h3>
              <ol>
                <li>Copy the authorization code below</li>
                <li>Return to LibreChat</li>
                <li>Use the tool <strong>authenticate_workspace_account</strong> with the parameter <strong>auth_code</strong>${email ? ` and <strong>email</strong> (${email})` : ''}</li>
              </ol>
            </div>
            <h3>Authorization Code:</h3>
            <div class="code">${code}</div>
            ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
            <p><small>State: ${state}</small></p>
            <script>
              // Автоматически выделяем код для копирования
              document.addEventListener('DOMContentLoaded', function() {
                const codeElement = document.querySelector('.code');
                if (codeElement) {
                  codeElement.addEventListener('click', function() {
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(codeElement);
                    selection.removeAllRanges();
                    selection.addRange(range);
                  });
                }
              });
            </script>
          </div>
        </body>
      </html>
    `);

    logger.info('OAuth callback processed successfully for Google Workspace MCP');

  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).json({
      error: 'Internal server error during OAuth callback',
      details: error.message
    });
  }
});

module.exports = router;
