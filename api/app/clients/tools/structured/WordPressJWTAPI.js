const axios = require('axios');

class WordPressJWTAPI {
  constructor(fields) {
    this.name = 'wordpressjwtapi';
    this.description = `WordPress REST API tool with JWT authentication for comprehensive content management.
    
    Available operations:
    - Posts: create, read, update, delete posts and pages
    - Categories: manage categories and tags hierarchy  
    - Comments: moderate and manage comments
    - Media: upload and manage media files
    - Users: manage user accounts and permissions
    
    Requires WordPress admin credentials with appropriate capabilities.`;
    
    this.apiUrl = fields.WORDPRESS_API_URL || process.env.WORDPRESS_API_URL;
    this.username = fields.WORDPRESS_USERNAME || process.env.WORDPRESS_USERNAME;
    this.password = fields.WORDPRESS_PASSWORD || process.env.WORDPRESS_PASSWORD;
    
    // Ensure API URL ends without trailing slash and add wp-json path
    this.apiUrl = this.apiUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    this.jwtToken = null;
    this.tokenExpiry = null;
  }

  async getJWTToken() {
    try {
      // Check if token is still valid
      if (this.jwtToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.jwtToken;
      }

      // Get new token
      const authUrl = this.apiUrl.replace('/wp/v2', '/jwt-auth/v1/token');
      const response = await axios.post(authUrl, {
        username: this.username,
        password: this.password
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.token) {
        this.jwtToken = response.data.token;
        // Set expiry to 23 hours from now (tokens usually expire in 24h)
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);
        return this.jwtToken;
      } else {
        throw new Error('No token received from WordPress JWT endpoint');
      }
    } catch (error) {
      console.error('JWT Token Error:', error.message);
      throw new Error(`Failed to authenticate with WordPress: ${error.message}`);
    }
  }

  async makeRequest(method, endpoint, data = null, params = null, id = null) {
    try {
      const token = await this.getJWTToken();
      
      let url = `${this.apiUrl}/${endpoint}`;
      if (id) {
        url += `/${id}`;
      }

      const config = {
        method: method,
        url: url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      };

      if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.data = data;
      }

      if (params) {
        config.params = params;
      }

      const response = await axios(config);
      return this.formatResponse(response.data, method, endpoint);
    } catch (error) {
      return this.handleError(error);
    }
  }

  formatResponse(data, method, endpoint) {
    const timestamp = new Date().toISOString();
    
    if (Array.isArray(data)) {
      return {
        success: true,
        action: `${method} ${endpoint}`,
        timestamp: timestamp,
        count: data.length,
        data: data.map(item => this.formatItem(item))
      };
    } else {
      return {
        success: true,
        action: `${method} ${endpoint}`,
        timestamp: timestamp,
        data: this.formatItem(data)
      };
    }
  }

  formatItem(item) {
    if (!item) return item;
    
    return {
      id: item.id,
      title: item.title?.rendered || item.title || item.name,
      content: item.content?.rendered || item.content,
      excerpt: item.excerpt?.rendered || item.excerpt,
      status: item.status,
      date: item.date,
      modified: item.modified,
      author: item.author,
      categories: item.categories,
      tags: item.tags,
      link: item.link,
      slug: item.slug,
      type: item.type || 'unknown'
    };
  }

  handleError(error) {
    const timestamp = new Date().toISOString();
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    if (error.response) {
      statusCode = error.response.status;
      errorMessage = error.response.data?.message || error.response.statusText || 'API Error';
      
      if (statusCode === 401) {
        this.jwtToken = null; // Clear invalid token
        this.tokenExpiry = null;
        errorMessage = 'Authentication failed. Please check WordPress credentials.';
      } else if (statusCode === 403) {
        errorMessage = 'Insufficient permissions. User needs editor/administrator role.';
      } else if (statusCode === 404) {
        errorMessage = 'Resource not found or WordPress REST API not available.';
      }
    } else if (error.request) {
      errorMessage = 'No response from WordPress server. Check URL and connectivity.';
    } else {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
      statusCode: statusCode,
      timestamp: timestamp
    };
  }

  // Posts Management
  async getPosts(params = {}) {
    const defaultParams = {
      per_page: 10,
      status: 'publish,draft',
      _embed: true
    };
    return await this.makeRequest('GET', 'posts', null, { ...defaultParams, ...params });
  }

  async getPost(id) {
    return await this.makeRequest('GET', 'posts', null, { _embed: true }, id);
  }

  async createPost(title, content, status = 'draft', categories = [], tags = []) {
    const postData = {
      title: title,
      content: content,
      status: status,
      categories: categories,
      tags: tags
    };
    
    return await this.makeRequest('POST', 'posts', postData);
  }

  async updatePost(id, updates) {
    return await this.makeRequest('PUT', 'posts', updates, null, id);
  }

  async deletePost(id) {
    return await this.makeRequest('DELETE', 'posts', null, null, id);
  }

  // Pages Management
  async getPages(params = {}) {
    const defaultParams = {
      per_page: 10,
      status: 'publish,draft',
      _embed: true
    };
    return await this.makeRequest('GET', 'pages', null, { ...defaultParams, ...params });
  }

  async createPage(title, content, status = 'draft', parent = 0) {
    const pageData = {
      title: title,
      content: content,
      status: status,
      parent: parent
    };
    
    return await this.makeRequest('POST', 'pages', pageData);
  }

  // Categories Management
  async getCategories(params = {}) {
    const defaultParams = {
      per_page: 50,
      hide_empty: false
    };
    return await this.makeRequest('GET', 'categories', null, { ...defaultParams, ...params });
  }

  async createCategory(name, description = '', parent = 0, slug = '') {
    const categoryData = {
      name: name,
      description: description,
      parent: parent
    };
    
    if (slug) {
      categoryData.slug = slug;
    }
    
    return await this.makeRequest('POST', 'categories', categoryData);
  }

  async updateCategory(id, updates) {
    return await this.makeRequest('PUT', 'categories', updates, null, id);
  }

  async deleteCategory(id) {
    return await this.makeRequest('DELETE', 'categories', null, null, id);
  }

  // Tags Management
  async getTags(params = {}) {
    const defaultParams = {
      per_page: 50,
      hide_empty: false
    };
    return await this.makeRequest('GET', 'tags', null, { ...defaultParams, ...params });
  }

  async createTag(name, description = '', slug = '') {
    const tagData = {
      name: name,
      description: description
    };
    
    if (slug) {
      tagData.slug = slug;
    }
    
    return await this.makeRequest('POST', 'tags', tagData);
  }

  // Comments Management
  async getComments(params = {}) {
    const defaultParams = {
      per_page: 20,
      status: 'approve'
    };
    return await this.makeRequest('GET', 'comments', null, { ...defaultParams, ...params });
  }

  async createComment(postId, content, author_name = '', author_email = '') {
    const commentData = {
      post: postId,
      content: content,
      author_name: author_name,
      author_email: author_email
    };
    
    return await this.makeRequest('POST', 'comments', commentData);
  }

  async updateComment(id, updates) {
    return await this.makeRequest('PUT', 'comments', updates, null, id);
  }

  async deleteComment(id) {
    return await this.makeRequest('DELETE', 'comments', null, null, id);
  }

  // Media Management
  async getMedia(params = {}) {
    const defaultParams = {
      per_page: 20,
      media_type: 'image'
    };
    return await this.makeRequest('GET', 'media', null, { ...defaultParams, ...params });
  }

  async uploadMedia(fileBuffer, filename, mimeType, title = '', description = '') {
    try {
      const token = await this.getJWTToken();
      
      const FormData = require('form-data');
      const form = new FormData();
      
      form.append('file', fileBuffer, {
        filename: filename,
        contentType: mimeType
      });
      
      if (title) form.append('title', title);
      if (description) form.append('description', description);

      const config = {
        method: 'POST',
        url: `${this.apiUrl}/media`,
        headers: {
          'Authorization': `Bearer ${token}`,
          ...form.getHeaders()
        },
        data: form,
        timeout: 60000
      };

      const response = await axios(config);
      return this.formatResponse(response.data, 'POST', 'media');
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Users Management
  async getUsers(params = {}) {
    const defaultParams = {
      per_page: 20,
      context: 'view'
    };
    return await this.makeRequest('GET', 'users', null, { ...defaultParams, ...params });
  }

  async getCurrentUser() {
    return await this.makeRequest('GET', 'users', null, { context: 'edit' }, 'me');
  }

  // Search functionality
  async searchContent(query, type = 'post') {
    const params = {
      search: query,
      per_page: 20
    };
    
    return await this.makeRequest('GET', type + 's', null, params);
  }

  // Main execution method
  async execute(action, ...args) {
    try {
      switch (action.toLowerCase()) {
        // Posts
        case 'get_posts':
        case 'list_posts':
          return await this.getPosts(args[0] || {});
        
        case 'get_post':
          if (!args[0]) throw new Error('Post ID is required');
          return await this.getPost(args[0]);
        
        case 'create_post':
          if (!args[0] || !args[1]) throw new Error('Title and content are required');
          return await this.createPost(args[0], args[1], args[2], args[3], args[4]);
        
        case 'update_post':
          if (!args[0] || !args[1]) throw new Error('Post ID and updates are required');
          return await this.updatePost(args[0], args[1]);
        
        case 'delete_post':
          if (!args[0]) throw new Error('Post ID is required');
          return await this.deletePost(args[0]);

        // Pages
        case 'get_pages':
        case 'list_pages':
          return await this.getPages(args[0] || {});
        
        case 'create_page':
          if (!args[0] || !args[1]) throw new Error('Title and content are required');
          return await this.createPage(args[0], args[1], args[2], args[3]);

        // Categories
        case 'get_categories':
        case 'list_categories':
          return await this.getCategories(args[0] || {});
        
        case 'create_category':
          if (!args[0]) throw new Error('Category name is required');
          return await this.createCategory(args[0], args[1], args[2], args[3]);
        
        case 'update_category':
          if (!args[0] || !args[1]) throw new Error('Category ID and updates are required');
          return await this.updateCategory(args[0], args[1]);
        
        case 'delete_category':
          if (!args[0]) throw new Error('Category ID is required');
          return await this.deleteCategory(args[0]);

        // Tags
        case 'get_tags':
        case 'list_tags':
          return await this.getTags(args[0] || {});
        
        case 'create_tag':
          if (!args[0]) throw new Error('Tag name is required');
          return await this.createTag(args[0], args[1], args[2]);

        // Comments
        case 'get_comments':
        case 'list_comments':
          return await this.getComments(args[0] || {});
        
        case 'create_comment':
          if (!args[0] || !args[1]) throw new Error('Post ID and content are required');
          return await this.createComment(args[0], args[1], args[2], args[3]);
        
        case 'update_comment':
          if (!args[0] || !args[1]) throw new Error('Comment ID and updates are required');
          return await this.updateComment(args[0], args[1]);
        
        case 'delete_comment':
          if (!args[0]) throw new Error('Comment ID is required');
          return await this.deleteComment(args[0]);

        // Media
        case 'get_media':
        case 'list_media':
          return await this.getMedia(args[0] || {});
        
        case 'upload_media':
          if (!args[0] || !args[1] || !args[2]) {
            throw new Error('File buffer, filename, and MIME type are required');
          }
          return await this.uploadMedia(args[0], args[1], args[2], args[3], args[4]);

        // Users
        case 'get_users':
        case 'list_users':
          return await this.getUsers(args[0] || {});
        
        case 'get_current_user':
        case 'me':
          return await this.getCurrentUser();

        // Search
        case 'search':
          if (!args[0]) throw new Error('Search query is required');
          return await this.searchContent(args[0], args[1]);

        default:
          return {
            success: false,
            error: `Unknown action: ${action}. Available actions: get_posts, create_post, update_post, delete_post, get_categories, create_category, get_comments, get_media, upload_media, search, etc.`,
            timestamp: new Date().toISOString()
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = WordPressJWTAPI;
