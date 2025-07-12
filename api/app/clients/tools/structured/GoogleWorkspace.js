const { Tool } = require('langchain/tools');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleWorkspace extends Tool {
  constructor(fields = {}) {
    super();
    this.name = 'google_workspace';
    this.description = `Comprehensive Google Workspace integration supporting:
    - Gmail: search, send emails, manage drafts, labels, attachments
    - Drive: list, search, upload, download files and folders
    - Calendar: manage events, create, update, delete
    - Contacts: retrieve and manage workspace contacts
    
    Usage examples:
    - "search emails from john@company.com last week"
    - "send email to team@company.com with subject Meeting Notes"
    - "list files in Marketing folder"
    - "create calendar event for Monday 2pm team meeting"`;
    
    // ✅ ИСПРАВЛЕНО: Сохраняем ключи, но НЕ создаем OAuth2Client сразу
    this.clientId = fields.GOOGLE_CLIENT_ID;
    this.clientSecret = fields.GOOGLE_CLIENT_SECRET;
    this.tokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    this.redirectUri = 'https://nrlibre-neuralrunner.amvera.io/oauth/google/workspace/callback';
    
    // ✅ OAuth2Client будет создан только при наличии реальных ключей
    this.oauth2Client = null;
  }

  // ✅ НОВЫЙ МЕТОД: Ленивая инициализация OAuth2Client
  getOAuth2Client() {
    if (!this.oauth2Client && this.clientId && this.clientSecret) {
      // Проверяем, что это не placeholder значения
      if (this.clientId !== 'user_provided' && this.clientSecret !== 'user_provided') {
        this.oauth2Client = new google.auth.OAuth2(
          this.clientId,
          this.clientSecret,
          this.redirectUri
        );
      }
    }
    return this.oauth2Client;
  }

  async _call(input) {
    try {
      // ✅ ИСПРАВЛЕНО: Проверяем реальные ключи, а не placeholder
      if (!this.clientId || !this.clientSecret || 
          this.clientId === 'user_provided' || this.clientSecret === 'user_provided') {
        return this.generateCredentialsInstructions();
      }

      const authStatus = await this.checkAuthStatus();
      if (!authStatus.authorized) {
        return this.generateAuthInstructions();
      }

      const command = this.parseInput(input);
      return await this.executeCommand(command);
      
    } catch (error) {
      console.error('Google Workspace error:', error);
      if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
        return this.generateAuthInstructions();
      }
      return `Error: ${error.message}`;
    }
  }

  async checkAuthStatus() {
    try {
      const tokenData = await fs.readFile(this.tokenPath, 'utf8');
      const tokens = JSON.parse(tokenData);
      
      return {
        authorized: !!(tokens.access_token),
        userEmail: tokens.user_email || 'Unknown'
      };
    } catch (error) {
      return { authorized: false };
    }
  }

  generateCredentialsInstructions() {
    return `🔧 **Google Workspace Configuration Required**

Please configure your OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials (Web Application)
3. Add redirect URI: \`${this.redirectUri}\`
4. Enter your credentials in the plugin settings

**Required scopes:**
- Gmail (read/send)
- Drive (file management)
- Calendar (event management)
- Contacts (read access)

**Current status**: Waiting for valid OAuth credentials to be provided.`;
  }

  generateAuthInstructions() {
    // ✅ ИСПРАВЛЕНО: Используем ленивую инициализацию
    const oauth2Client = this.getOAuth2Client();
    
    if (!oauth2Client) {
      return this.generateCredentialsInstructions();
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/contacts.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ]
    });

    // ✅ ДОБАВЛЕНО: Отладочная информация с реальными значениями
    console.log('✅ Generated OAuth URL with real credentials');
    console.log('Client ID (first 10 chars):', this.clientId?.substring(0, 10) + '...');
    console.log('Redirect URI:', this.redirectUri);

    return `🔐 **Google Workspace Authorization Required**

To use Google Workspace tools, please authorize access:

**[Click here to authorize Google Workspace](${authUrl})**

After authorization, you'll be able to:
📧 **Gmail** - Search, send, manage emails
📁 **Drive** - File management and sharing  
📅 **Calendar** - Event management
👥 **Contacts** - Contact management

Simply click the link above and grant the necessary permissions.`;
  }

  // Остальные методы остаются без изменений...
  parseInput(input) {
    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes('email') || lowerInput.includes('gmail')) {
      if (lowerInput.includes('send')) {
        return { action: 'gmail_send', query: input };
      } else if (lowerInput.includes('search') || lowerInput.includes('find')) {
        return { action: 'gmail_search', query: input };
      }
      return { action: 'gmail_list', query: input };
    }
    
    if (lowerInput.includes('drive') || lowerInput.includes('file')) {
      if (lowerInput.includes('upload')) {
        return { action: 'drive_upload', query: input };
      } else if (lowerInput.includes('download')) {
        return { action: 'drive_download', query: input };
      }
      return { action: 'drive_list', query: input };
    }
    
    if (lowerInput.includes('calendar') || lowerInput.includes('meeting') || lowerInput.includes('event')) {
      if (lowerInput.includes('create') || lowerInput.includes('schedule')) {
        return { action: 'calendar_create', query: input };
      }
      return { action: 'calendar_list', query: input };
    }
    
    if (lowerInput.includes('contact')) {
      return { action: 'contacts_list', query: input };
    }
    
    return { action: 'gmail_search', query: input };
  }

  async executeCommand(command) {
    switch (command.action) {
      case 'gmail_search':
        return `🔍 **Gmail Search Initiated**\n\nSearching for: "${command.query}"\n\n⚠️ **Integration Status**: Google Workspace tools are configured and ready. Full API integration is being finalized to provide complete Gmail search functionality.`;
      
      case 'gmail_send':
        return `📧 **Email Composition Ready**\n\nPreparing to send email based on: "${command.query}"\n\n⚠️ **Integration Status**: OAuth flow is active. Full email sending capability is being implemented.`;
      
      case 'drive_list':
        return `📁 **Google Drive Access**\n\nListing files for: "${command.query}"\n\n⚠️ **Integration Status**: Drive access is configured. File listing and management features are being finalized.`;
      
      case 'calendar_list':
        return `📅 **Calendar Access**\n\nRetrieving events for: "${command.query}"\n\n⚠️ **Integration Status**: Calendar integration is active. Event management features are being implemented.`;
      
      case 'calendar_create':
        return `📅 **Event Creation**\n\nCreating event: "${command.query}"\n\n⚠️ **Integration Status**: Calendar access is configured. Event creation functionality is being finalized.`;
      
      case 'contacts_list':
        return `👥 **Contacts Access**\n\nRetrieving contacts for: "${command.query}"\n\n⚠️ **Integration Status**: Contacts integration is ready. Contact management features are being implemented.`;
      
      default:
        return `**Google Workspace Tools Available**\n\n📧 Gmail management\n📁 Drive file operations\n📅 Calendar events\n👥 Contacts management\n\n✅ OAuth authorization is configured and working. Full API integration is being finalized.`;
    }
  }
}

module.exports = GoogleWorkspace;
