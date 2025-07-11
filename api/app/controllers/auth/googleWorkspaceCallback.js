const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const handleGoogleWorkspaceCallback = async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.DOMAIN_CLIENT}/api/oauth/google/workspace/callback`
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens
    const tokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
    
    // Return success page
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
          You can now close this window and start using Google Workspace tools.
        </div>
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
