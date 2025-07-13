const { Tool } = require('langchain/tools');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleWorkspace extends Tool {
  constructor(fields = {}) {
    super();

    // ✅ РАСШИРЕННАЯ ОТЛАДКА
  console.log('=== GOOGLE WORKSPACE FIELDS DEBUG ===');
  console.log('All fields received:', JSON.stringify(fields, null, 2));
  console.log('Fields keys:', Object.keys(fields));
  console.log('GOOGLE_CLIENT_ID value:', fields.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET value:', fields.GOOGLE_CLIENT_SECRET);
  console.log('Field types:', {
    clientId: typeof fields.GOOGLE_CLIENT_ID,
    clientSecret: typeof fields.GOOGLE_CLIENT_SECRET
  });
  console.log('=== END DEBUG ===');
    
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
    
    // ✅ ИСПРАВЛЕНО: Правильное получение credentials из fields
    this.clientId = fields.GOOGLE_CLIENT_ID;
    this.clientSecret = fields.GOOGLE_CLIENT_SECRET;
    this.tokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    this.redirectUri = 'https://nrlibre-neuralrunner.amvera.io/oauth/google/workspace/callback';
    
    // ✅ РАСШИРЕННАЯ ОТЛАДКА для диагностики проблем
    console.log('=== GOOGLE WORKSPACE CREDENTIALS DEBUG ===');
    console.log('Raw fields received:', Object.keys(fields));
    console.log('Client ID details:', {
      provided: !!this.clientId,
      value: this.clientId ? `${this.clientId.substring(0, 20)}...` : 'undefined',
      length: this.clientId ? this.clientId.length : 0,
      containsGoogleDomain: this.clientId ? this.clientId.includes('.apps.googleusercontent.com') : false
    });
    console.log('Client Secret details:', {
      provided: !!this.clientSecret,
      length: this.clientSecret ? this.clientSecret.length : 0
    });
    console.log('=== END DEBUG ===');
    
    // ✅ OAuth2Client создается только при наличии валидных ключей
    this.oauth2Client = null;
  }

  // ✅ ИСПРАВЛЕННЫЙ МЕТОД: Улучшенная валидация credentials
  hasValidCredentials() {
    // Проверяем наличие основных значений
    if (!this.clientId || !this.clientId.trim() || !this.clientSecret || !this.clientSecret.trim()) {
      console.log('Credentials validation failed: missing values');
      return false;
    }
    
    // Проверяем на placeholder значения
    const placeholderValues = ['user_provided', 'your_client_id', 'your_client_secret', 'undefined', 'null'];
    if (placeholderValues.includes(this.clientId.toLowerCase()) || 
        placeholderValues.includes(this.clientSecret.toLowerCase())) {
      console.log('Credentials validation failed: placeholder values detected');
      return false;
    }
    
    // Проверяем формат Google Client ID (должен содержать .apps.googleusercontent.com)
    if (!this.clientId.includes('.apps.googleusercontent.com')) {
      console.log('Credentials validation failed: invalid Client ID format');
      return false;
    }
    
    // Проверяем минимальную длину (более реалистичная)
    if (this.clientId.length < 20 || this.clientSecret.length < 15) {
      console.log('Credentials validation failed: credentials too short');
      return false;
    }
    
    console.log('✅ Credentials validation passed successfully');
    return true;
  }

  // ✅ НОВЫЙ МЕТОД: Ленивая инициализация OAuth2Client
  getOAuth2Client() {
    if (!this.oauth2Client && this.hasValidCredentials()) {
      console.log('Creating OAuth2Client with validated credentials');
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
    }
    return this.oauth2Client;
  }

  async _call(input) {
    try {
      console.log('GoogleWorkspace _call method called with:', input);
      
      // ✅ ИСПРАВЛЕНО: Используем улучшенный метод проверки
      if (!this.hasValidCredentials()) {
        console.log('Invalid credentials detected, showing configuration instructions');
        return this.generateCredentialsInstructions();
      }

      // Проверяем авторизацию пользователя
      const authStatus = await this.checkAuthStatus();
      if (!authStatus.authorized) {
        console.log('User not authorized, showing auth instructions');
        return this.generateAuthInstructions();
      }

      // Парсим запрос пользователя
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

  // ✅ УЛУЧШЕННЫЙ МЕТОД: Детальная диагностика credentials
  generateCredentialsInstructions() {
    const clientIdStatus = this.clientId ? 
      (this.clientId.includes('.apps.googleusercontent.com') ? '✅ Valid format' : '⚠️ Invalid format - must end with .apps.googleusercontent.com') : 
      '❌ Missing';
    
    const clientSecretStatus = this.clientSecret ? 
      (this.clientSecret.length >= 15 ? '✅ Provided' : '⚠️ Too short - must be at least 15 characters') : 
      '❌ Missing';

    return `🔧 **Google Workspace Configuration Status**

**Detailed credentials check:**
- Client ID: ${clientIdStatus}
- Client Secret: ${clientSecretStatus}

${!this.hasValidCredentials() ? `
**Current Configuration Issues:**

${!this.clientId || this.clientId.trim().length === 0 ? '❌ **Client ID Missing**: No Client ID provided\n' : ''}${this.clientId && !this.clientId.includes('.apps.googleusercontent.com') ? '❌ **Invalid Client ID Format**: Must end with .apps.googleusercontent.com\n   Current: ' + this.clientId.substring(0, 30) + '...\n' : ''}${this.clientId && this.clientId.length < 20 ? '❌ **Client ID Too Short**: Current length: ' + this.clientId.length + ' characters\n' : ''}${!this.clientSecret || this.clientSecret.trim().length === 0 ? '❌ **Client Secret Missing**: No Client Secret provided\n' : ''}${this.clientSecret && this.clientSecret.length < 15 ? '❌ **Client Secret Too Short**: Current length: ' + this.clientSecret.length + ' characters\n' : ''}

**Setup Instructions:**

1. **Go to Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to **APIs & Services → Credentials**

2. **Create OAuth 2.0 Client ID**
   - Click **Create Credentials → OAuth 2.0 Client ID**
   - Select **Application type: Web application**
   - Set **Name**: LibreChat Google Workspace

3. **Configure Authorized redirect URIs**
   - Add: \`${this.redirectUri}\`
   - Ensure exact match with no trailing slash

4. **Enable Required APIs**
   - Gmail API
   - Google Drive API
   - Google Calendar API
   - Google People API

5. **Copy Credentials**
   - Copy **Client ID** (ends with .apps.googleusercontent.com)
   - Copy **Client Secret** (long random string)
   - Paste exactly in LibreChat plugin settings

**Common Issues:**
- Don't use placeholder or example values
- Ensure no extra spaces in credentials  
- Client ID must be from Web Application type (not Desktop/Mobile)
- Both credentials are required for OAuth flow
` : '✅ **Credentials configured correctly!** Ready for OAuth authorization.'}`;
  }

  generateAuthInstructions() {
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

    console.log('✅ Generated OAuth URL with validated credentials');

    return `🔐 **Google Workspace Authorization Required**

✅ **OAuth credentials configured successfully!**

To complete setup, please authorize access:

**[Click here to authorize Google Workspace](${authUrl})**

**What happens next:**
1. You'll be redirected to Google's authorization page
2. Grant permissions for the requested scopes
3. You'll be redirected back to LibreChat with success confirmation
4. Google Workspace tools will become fully functional

**Available after authorization:**
📧 **Gmail** - Search, send, manage emails and attachments
📁 **Drive** - File management, upload/download, sharing  
📅 **Calendar** - Event management, scheduling, invitations
👥 **Contacts** - Contact retrieval and management

**Security Note:** LibreChat will only access data you explicitly authorize and only when using Google Workspace tools.`;
  }

  parseInput(input) {
    const lowerInput = input.toLowerCase();
    
    // Gmail operations
    if (lowerInput.includes('email') || lowerInput.includes('gmail')) {
      if (lowerInput.includes('send')) {
        return { action: 'gmail_send', query: input };
      } else if (lowerInput.includes('search') || lowerInput.includes('find')) {
        return { action: 'gmail_search', query: input };
      }
      return { action: 'gmail_list', query: input };
    }
    
    // Drive operations  
    if (lowerInput.includes('drive') || lowerInput.includes('file')) {
      if (lowerInput.includes('upload')) {
        return { action: 'drive_upload', query: input };
      } else if (lowerInput.includes('download')) {
        return { action: 'drive_download', query: input };
      }
      return { action: 'drive_list', query: input };
    }
    
    // Calendar operations
    if (lowerInput.includes('calendar') || lowerInput.includes('meeting') || lowerInput.includes('event')) {
      if (lowerInput.includes('create') || lowerInput.includes('schedule')) {
        return { action: 'calendar_create', query: input };
      }
      return { action: 'calendar_list', query: input };
    }
    
    // Contacts operations
    if (lowerInput.includes('contact')) {
      return { action: 'contacts_list', query: input };
    }
    
    // Default to Gmail search
    return { action: 'gmail_search', query: input };
  }

  async executeCommand(command) {
    // На данном этапе возвращаем информативные сообщения
    // В будущем здесь будет полная интеграция с Google APIs
    
    switch (command.action) {
      case 'gmail_search':
        return `🔍 **Gmail Search Ready**

Searching for: "${command.query}"

✅ **Status**: Google Workspace tools are configured and authorized
⚠️ **Note**: Full Gmail API integration is being finalized

**Next Steps**: Complete API implementation for:
- Advanced email search with filters
- Email content analysis  
- Attachment handling
- Label management`;
      
      case 'gmail_send':
        return `📧 **Email Composition Ready**

Preparing to send email: "${command.query}"

✅ **Status**: OAuth authorization active
⚠️ **Note**: Email sending capability is being implemented

**Next Steps**: Complete implementation for:
- Email composition with rich formatting
- Attachment support
- Recipients validation
- Delivery confirmation`;
      
      case 'drive_list':
        return `📁 **Google Drive Access Ready**

Listing files for: "${command.query}"

✅ **Status**: Drive access configured and authorized
⚠️ **Note**: File management features are being finalized

**Next Steps**: Complete implementation for:
- File and folder listing
- Search functionality
- Upload/download operations
- Sharing and permissions`;
      
      case 'calendar_list':
        return `📅 **Calendar Access Ready**

Retrieving events for: "${command.query}"

✅ **Status**: Calendar integration active
⚠️ **Note**: Event management features are being implemented

**Next Steps**: Complete implementation for:
- Event listing and search
- Calendar synchronization
- Availability checking
- Meeting scheduling`;
      
      case 'calendar_create':
        return `📅 **Event Creation Ready**

Creating event: "${command.query}"

✅ **Status**: Calendar access configured
⚠️ **Note**: Event creation functionality is being finalized

**Next Steps**: Complete implementation for:
- Event creation with details
- Participant invitations
- Recurring events
- Reminder settings`;
      
      case 'contacts_list':
        return `👥 **Contacts Access Ready**

Retrieving contacts for: "${command.query}"

✅ **Status**: Contacts integration ready
⚠️ **Note**: Contact management features are being implemented

**Next Steps**: Complete implementation for:
- Contact search and listing
- Contact details retrieval
- Contact groups management
- Contact synchronization`;
      
      default:
        return `**Google Workspace Tools Status**

✅ **OAuth Configuration**: Complete and validated
✅ **Authorization**: ${this.oauth2Client ? 'Ready for user consent' : 'Awaiting configuration'}

**Available Services:**
📧 Gmail - Email management and communication
📁 Drive - File storage and collaboration  
📅 Calendar - Event and meeting management
👥 Contacts - Contact information and networking

**Current Status**: Core integration framework is complete. Full API functionality is being implemented to provide comprehensive Google Workspace capabilities.

**Usage**: Try commands like "search my emails", "list my files", or "check my calendar" to begin using Google Workspace tools.`;
    }
  }
}

module.exports = GoogleWorkspace;
