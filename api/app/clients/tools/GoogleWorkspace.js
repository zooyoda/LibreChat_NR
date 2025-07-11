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
    
    this.clientId = fields.GOOGLE_CLIENT_ID;
    this.clientSecret = fields.GOOGLE_CLIENT_SECRET;
    this.tokenPath = path.join(process.cwd(), 'workspace_tokens.json');
    
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      `${process.env.DOMAIN_CLIENT}/api/oauth/google/workspace/callback`
    );
  }

  async call(input) {
    try {
      // Parse command and parameters
      const command = this.parseInput(input);
      
      // Ensure authentication
      await this.ensureAuthenticated();
      
      // Execute command
      return await this.executeCommand(command);
      
    } catch (error) {
      if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
        return this.generateAuthResponse();
      }
      return `Error: ${error.message}`;
    }
  }

  parseInput(input) {
    // Enhanced input parsing
    const lowercaseInput = input.toLowerCase();
    
    // Gmail operations
    if (lowercaseInput.includes('email') || lowercaseInput.includes('gmail')) {
      if (lowercaseInput.includes('send')) {
        return { action: 'gmail_send', input };
      } else if (lowercaseInput.includes('search') || lowercaseInput.includes('find')) {
        return { action: 'gmail_search', input };
      } else if (lowercaseInput.includes('draft')) {
        return { action: 'gmail_draft', input };
      }
    }
    
    // Drive operations
    if (lowercaseInput.includes('drive') || lowercaseInput.includes('file')) {
      if (lowercaseInput.includes('upload')) {
        return { action: 'drive_upload', input };
      } else if (lowercaseInput.includes('download')) {
        return { action: 'drive_download', input };
      } else if (lowercaseInput.includes('search')) {
        return { action: 'drive_search', input };
      } else {
        return { action: 'drive_list', input };
      }
    }
    
    // Calendar operations
    if (lowercaseInput.includes('calendar') || lowercaseInput.includes('meeting') || lowercaseInput.includes('event')) {
      if (lowercaseInput.includes('create') || lowercaseInput.includes('schedule')) {
        return { action: 'calendar_create', input };
      } else if (lowercaseInput.includes('list') || lowercaseInput.includes('show')) {
        return { action: 'calendar_list', input };
      }
    }
    
    // Contacts operations
    if (lowercaseInput.includes('contact')) {
      return { action: 'contacts_list', input };
    }
    
    // Default to Gmail search
    return { action: 'gmail_search', input };
  }

  async ensureAuthenticated() {
    try {
      // Load existing tokens
      const tokenData = await fs.readFile(this.tokenPath, 'utf8');
      const tokens = JSON.parse(tokenData);
      
      this.oauth2Client.setCredentials(tokens);
      
      // Verify token validity
      await this.oauth2Client.getAccessToken();
      
    } catch (error) {
      throw new Error('authentication_required');
    }
  }

  async executeCommand(command) {
    switch (command.action) {
      case 'gmail_search':
        return await this.handleGmailSearch(command.input);
      case 'gmail_send':
        return await this.handleGmailSend(command.input);
      case 'gmail_draft':
        return await this.handleGmailDraft(command.input);
      case 'drive_list':
        return await this.handleDriveList(command.input);
      case 'drive_search':
        return await this.handleDriveSearch(command.input);
      case 'drive_upload':
        return await this.handleDriveUpload(command.input);
      case 'drive_download':
        return await this.handleDriveDownload(command.input);
      case 'calendar_list':
        return await this.handleCalendarList(command.input);
      case 'calendar_create':
        return await this.handleCalendarCreate(command.input);
      case 'contacts_list':
        return await this.handleContactsList(command.input);
      default:
        return 'Unsupported operation. Please specify Gmail, Drive, Calendar, or Contacts action.';
    }
  }

  // Gmail handlers
  async handleGmailSearch(input) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    // Extract search parameters
    const query = this.extractSearchQuery(input);
    const maxResults = this.extractNumber(input, 'maxResults') || 10;
    
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults
    });
    
    if (!response.data.messages || response.data.messages.length === 0) {
      return 'No emails found matching your criteria.';
    }
    
    // Get detailed info for each message
    const emails = [];
    for (const message of response.data.messages.slice(0, 5)) {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: message.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date']
      });
      
      const headers = detail.data.payload.headers;
      emails.push({
        id: message.id,
        from: headers.find(h => h.name === 'From')?.value || 'Unknown',
        subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
        date: headers.find(h => h.name === 'Date')?.value || 'Unknown'
      });
    }
    
    return `Found ${response.data.resultSizeEstimate} emails. Here are the first ${emails.length}:\n\n` +
           emails.map((email, i) => 
             `${i + 1}. From: ${email.from}\n   Subject: ${email.subject}\n   Date: ${email.date}\n`
           ).join('\n');
  }

  async handleGmailSend(input) {
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    
    // Extract email components
    const to = this.extractEmailField(input, 'to');
    const subject = this.extractEmailField(input, 'subject');
    const body = this.extractEmailField(input, 'body') || input;
    
    if (!to) {
      return 'Error: Please specify recipient email address (to: email@domain.com)';
    }
    
    const email = [
      `To: ${to}`,
      `Subject: ${subject || 'Message from LibreChat'}`,
      '',
      body
    ].join('\n');
    
    const encodedEmail = Buffer.from(email).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    });
    
    return `Email sent successfully! Message ID: ${response.data.id}`;
  }

  // Drive handlers
  async handleDriveList(input) {
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    
    const pageSize = this.extractNumber(input, 'limit') || 10;
    const query = this.extractSearchQuery(input);
    
    const response = await drive.files.list({
      pageSize: pageSize,
      q: query,
      fields: 'files(id, name, mimeType, modifiedTime, size, webViewLink)'
    });
    
    const files = response.data.files;
    if (!files || files.length === 0) {
      return 'No files found.';
    }
    
    return `Found ${files.length} files:\n\n` +
           files.map((file, i) => 
             `${i + 1}. ${file.name}\n   Type: ${file.mimeType}\n   Modified: ${file.modifiedTime}\n   Link: ${file.webViewLink}\n`
           ).join('\n');
  }

  // Calendar handlers
  async handleCalendarList(input) {
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    const timeMin = this.extractDate(input, 'from') || new Date().toISOString();
    const timeMax = this.extractDate(input, 'to') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    const events = response.data.items;
    if (!events || events.length === 0) {
      return 'No upcoming events found.';
    }
    
    return `Upcoming events:\n\n` +
           events.map((event, i) => {
             const start = event.start.dateTime || event.start.date;
             return `${i + 1}. ${event.summary}\n   Time: ${start}\n   Location: ${event.location || 'Not specified'}\n`;
           }).join('\n');
  }

  // Utility methods
  extractSearchQuery(input) {
    // Extract search parameters from natural language
    const fromMatch = input.match(/from[:\s]+([^\s]+@[^\s]+)/i);
    const subjectMatch = input.match(/subject[:\s]+"([^"]+)"/i);
    const dateMatch = input.match(/(today|yesterday|last week|this week)/i);
    
    let query = '';
    if (fromMatch) query += `from:${fromMatch[1]} `;
    if (subjectMatch) query += `subject:"${subjectMatch[1]}" `;
    if (dateMatch) {
      const dateQuery = this.convertDateToQuery(dateMatch[1]);
      query += dateQuery;
    }
    
    return query.trim() || input;
  }

  extractEmailField(input, field) {
    const patterns = {
      to: /(?:to|recipient)[:\s]+([^\s]+@[^\s]+)/i,
      subject: /(?:subject|title)[:\s]+"([^"]+)"/i,
      body: /(?:body|message)[:\s]+"([^"]+)"/i
    };
    
    const match = input.match(patterns[field]);
    return match ? match[1] : null;
  }

  extractNumber(input, field) {
    const pattern = new RegExp(`${field}[:\\s]+(\\d+)`, 'i');
    const match = input.match(pattern);
    return match ? parseInt(match[1]) : null;
  }

  extractDate(input, field) {
    // Simple date extraction - can be enhanced
    const today = new Date();
    if (input.includes('today')) return today.toISOString();
    if (input.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toISOString();
    }
    return null;
  }

  convertDateToQuery(dateString) {
    const today = new Date();
    switch (dateString.toLowerCase()) {
      case 'today':
        return 'newer_than:1d ';
      case 'yesterday':
        return 'older_than:1d newer_than:2d ';
      case 'last week':
        return 'older_than:7d newer_than:14d ';
      case 'this week':
        return 'newer_than:7d ';
      default:
        return '';
    }
  }

  generateAuthResponse() {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/contacts.readonly'
      ]
    });
    
    return `Google Workspace authentication required. Please visit: ${authUrl}\n\nAfter authorization, the tool will be ready to use.`;
  }
}

module.exports = GoogleWorkspace;
