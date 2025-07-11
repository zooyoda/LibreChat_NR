const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const handleGoogleWorkspaceCallback = async (req, res) => {
  try {
    const { code, error } = req.query;
    
    // Обработка ошибки OAuth
    if (error) {
      console.error('Google Workspace OAuth error:', error);
      return res.status(400).json({ 
        error: 'OAuth authorization failed', 
        details: error 
      });
    }
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.DOMAIN_CLIENT || req.protocol + '://' + req.get('host')}/oauth/google/workspace/callback`
    );
    
    // Exchange code for tokens
    console.log('Exchanging OAuth code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens
    const tokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
    
    console.log('Google Workspace OAuth successful, tokens saved');
    
    // Return success page with auto-close
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Workspace Authorization Success</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .success { color: #4CAF50; font-size: 24px; margin-bottom: 20px; }
          .info { color: #666; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="success">✓ Authorization Successful!</div>
        <div class="info">
          Your Google Workspace account has been connected to LibreChat.<br>
          You can now close this window and start using Google Workspace tools.<br><br>
          <small>This window will close automatically in 5 seconds.</small>
        </div>
        <script>
          setTimeout(() => window.close(), 5000);
        </script>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('Google Workspace OAuth error:', error);
    res.status(500).json({ 
      error: 'Authentication failed', 
      details: error.message 
    });
  }
};

module.exports = { handleGoogleWorkspaceCallback };
