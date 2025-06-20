const { Tool } = require('langchain/tools');
const axios = require('axios');
const https = require('https');
const http = require('http');

class WordPressJWTAPI extends Tool {
  constructor(fields = {}) {
    super();
    
    this.name = 'wordpress_jwt_api';
    this.description = `WordPress REST API tool with JWT authentication for comprehensive content management. Can create, read, update, and delete posts, pages, categories, tags, media, users, and comments. Automatically handles JWT token refresh. Requires WordPress site URL, username, and password.

Available operations:
- Posts: get_posts, create_post, update_post, delete_post
- Pages: get_pages, create_page, update_page, delete_page  
- Categories: get_categories, create_category, update_category, delete_category
- Tags: get_tags, create_tag, update_tag, delete_tag
- Comments: get_comments, create_comment, update_comment, delete_comment
- Media: get_media, upload_media
- Users: get_users, get_current_user
- Search: search_content

Input format: JSON string with action, endpoint, data, params, and id fields, or natural language description.`;

    this.apiUrl = fields.WORDPRESS_API_URL || this.getEnvVariable('WORDPRESS_API_URL');
    this.username = fields.WORDPRESS_USERNAME || this.getEnvVariable('WORDPRESS_USERNAME');
    this.password = fields.WORDPRESS_PASSWORD || this.getEnvVariable('WORDPRESS_PASSWORD');

    if (!this.apiUrl || !this.username || !this.password) {
      throw new Error('WordPress API URL, username, and password are required');
    }

    // Убираем trailing slash если есть
    this.apiUrl = this.apiUrl.replace(/\/$/, '');
    
    // JWT токен и время истечения
    this.jwtToken = null;
    this.tokenExpiry = null;
    this.refreshThreshold = 60000; // Обновляем токен за 1 минуту до истечения

    console.log('WordPress JWT API initialized with URL:', this.apiUrl);
  }

  getEnvVariable(name) {
    return process.env[name];
  }

  async getJWTToken() {
    // Проверяем, нужно ли обновить токен
    if (this.jwtToken && this.tokenExpiry && 
        (Date.now() + this.refreshThreshold) < this.tokenExpiry) {
      return this.jwtToken;
    }

    try {
      console.log('Получение нового JWT токена для:', this.apiUrl);
      const response = await axios.post(`${this.apiUrl}/wp-json/jwt-auth/v1/token`, {
        username: this.username,
        password: this.password
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LibreChat-WordPress-API/1.0',
          'Accept': 'application/json'
        },
        // Настройки для HTTPS
        httpsAgent: new https.Agent({
          rejectUnauthorized: false, // Временно для тестирования
          keepAlive: true,
          timeout: 30000
        }),
        // Настройки для HTTP
        httpAgent: new http.Agent({
          keepAlive: true,
          timeout: 30000
        })
      });

      this.jwtToken = response.data.token;
      // JWT токены обычно живут 7 дней, устанавливаем срок истечения
      this.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 дней для безопасности
      
      console.log('JWT токен успешно получен');
      return this.jwtToken;
    } catch (error) {
      console.error('Ошибка получения JWT токена:', error.response?.data || error.message);
      throw new Error(`Не удалось получить JWT токен: ${error.response?.data?.message || error.message}`);
    }
  }

  async validateToken() {
    if (!this.jwtToken) return false;
    
    try {
      await axios.post(`${this.apiUrl}/wp-json/jwt-auth/v1/token/validate`, {}, {
        headers: {
          'Authorization': `Bearer ${this.jwtToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'LibreChat-WordPress-API/1.0'
        },
        timeout: 10000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          keepAlive: true
        }),
        httpAgent: new http.Agent({
          keepAlive: true
        })
      });
      return true;
    } catch (error) {
      console.log('Токен недействителен, требуется обновление');
      return false;
    }
  }

  async _call(input) {
    try {
      const parsedInput = this.parseInput(input);
      const { action, endpoint, data, params, id } = parsedInput;
      return await this.makeRequest(action, endpoint, data, params, id);
    } catch (error) {
      return `Ошибка: ${error.message}`;
    }
  }

  parseInput(input) {
    try {
      // Пытаемся распарсить JSON
      const parsed = JSON.parse(input);
      return {
        action: parsed.action || 'GET',
        endpoint: parsed.endpoint || '/posts',
        data: parsed.data || {},
        params: parsed.params || {},
        id: parsed.id || null
      };
    } catch {
      // Если не JSON, пытаемся понять намерение из текста
      return this.parseTextInput(input);
    }
  }

  parseTextInput(input) {
    const lowerInput = input.toLowerCase();
    
    // Определяем действие
    let action = 'GET';
    if (lowerInput.includes('создай') || lowerInput.includes('добавь') || lowerInput.includes('новый') || lowerInput.includes('create')) {
      action = 'POST';
    } else if (lowerInput.includes('обнови') || lowerInput.includes('измени') || lowerInput.includes('редактируй') || lowerInput.includes('update')) {
      action = 'PUT';
    } else if (lowerInput.includes('удали') || lowerInput.includes('убери') || lowerInput.includes('delete')) {
      action = 'DELETE';
    }

    // Определяем endpoint
    let endpoint = '/posts';
    if (lowerInput.includes('страниц') || lowerInput.includes('page')) endpoint = '/pages';
    else if (lowerInput.includes('категор') || lowerInput.includes('categor')) endpoint = '/categories';
    else if (lowerInput.includes('тег') || lowerInput.includes('метк') || lowerInput.includes('tag')) endpoint = '/tags';
    else if (lowerInput.includes('пользовател') || lowerInput.includes('user')) endpoint = '/users';
    else if (lowerInput.includes('медиа') || lowerInput.includes('изображен') || lowerInput.includes('файл') || lowerInput.includes('media')) endpoint = '/media';
    else if (lowerInput.includes('комментар') || lowerInput.includes('comment')) endpoint = '/comments';

    // Извлекаем ID если есть
    const idMatch = input.match(/id[:\s]*(\d+)/i);
    const id = idMatch ? idMatch[1] : null;

    return {
      action,
      endpoint,
      data: {},
      params: {},
      id
    };
  }

  async makeRequest(method, endpoint, data = {}, params = {}, id = null) {
    const token = await this.getJWTToken();
    
    // Формируем URL
    let url = `${this.apiUrl}/wp-json/wp/v2${endpoint}`;
    if (id) {
      url += `/${id}`;
    }

    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'LibreChat-WordPress-API/1.0',
        'Accept': 'application/json'
      },
      params,
      timeout: 30000,
      // Настройки для HTTPS
      httpsAgent: new https.Agent({
        rejectUnauthorized: false, // Временно для тестирования
        keepAlive: true,
        timeout: 30000
      }),
      // Настройки для HTTP
      httpAgent: new http.Agent({
        keepAlive: true,
        timeout: 30000
      })
    };

    if (method !== 'GET' && method !== 'DELETE' && Object.keys(data).length > 0) {
      config.data = data;
    }

    try {
      console.log(`Выполняется ${method} запрос к: ${url}`);
      const response = await axios(config);
      return this.formatResponse(response.data, method, endpoint, id);
    } catch (error) {
      if (error.response?.status === 401) {
        // Токен истек, пытаемся получить новый
        console.log('Токен истек, получаем новый...');
        this.jwtToken = null;
        this.tokenExpiry = null;
        
        try {
          const newToken = await this.getJWTToken();
          config.headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await axios(config);
          return this.formatResponse(retryResponse.data, method, endpoint, id);
        } catch (retryError) {
          return `Ошибка аутентификации: ${retryError.response?.data?.message || retryError.message}`;
        }
      }

      if (error.response) {
        console.error(`WordPress API ошибка: ${error.response.status}`, error.response.data);
        return `WordPress API Ошибка: ${error.response.status} - ${error.response.data?.message || error.response.statusText}`;
      }

      console.error('Сетевая ошибка:', error.message);
      return `Сетевая ошибка: ${error.message}`;
    }
  }

  formatResponse(data, method, endpoint, id) {
    if (Array.isArray(data)) {
      const itemType = this.getItemType(endpoint);
      const items = data.slice(0, 5).map(item => ({
        id: item.id,
        title: item.title?.rendered || item.name || 'Без названия',
        status: item.status || 'неизвестен',
        date: item.date || item.date_gmt || 'неизвестна'
      }));

      return `Найдено ${data.length} ${itemType}. Показываю первые ${Math.min(data.length, 5)}:\n\n${items.map(item => 
        `ID: ${item.id}\nНазвание: ${item.title}\nСтатус: ${item.status}\nДата: ${item.date}\n`
      ).join('\n')}${data.length > 5 ? `\n... и еще ${data.length - 5}` : ''}`;
    }

    if (method === 'POST') {
      const itemType = this.getItemType(endpoint);
      return `✅ Успешно создан новый ${itemType}!\nID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nСсылка: ${data.link || 'недоступна'}`;
    }

    if (method === 'PUT') {
      const itemType = this.getItemType(endpoint);
      return `✅ Успешно обновлен ${itemType}!\nID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nПоследнее изменение: ${data.modified || 'неизвестно'}`;
    }

    if (method === 'DELETE') {
      return `✅ Элемент успешно удален.`;
    }

    // Для GET запроса одного элемента
    if (data.id) {
      const itemType = this.getItemType(endpoint);
      return `${itemType} ID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nДата создания: ${data.date || 'неизвестна'}\nПоследнее изменение: ${data.modified || 'неизвестно'}\nСсылка: ${data.link || 'недоступна'}`;
    }

    return JSON.stringify(data, null, 2);
  }

  getItemType(endpoint) {
    const types = {
      '/posts': 'пост',
      '/pages': 'страница', 
      '/categories': 'категория',
      '/tags': 'тег',
      '/users': 'пользователь',
      '/media': 'медиафайл',
      '/comments': 'комментарий'
    };
    return types[endpoint] || 'элемент';
  }

  // Специализированные методы для удобства использования
  async getPosts(params = {}) {
    return this.makeRequest('GET', '/posts', {}, params);
  }

  async createPost(title, content, status = 'draft', categories = []) {
    const data = { title, content, status };
    if (categories.length > 0) data.categories = categories;
    return this.makeRequest('POST', '/posts', data);
  }

  async updatePost(id, updates) {
    return this.makeRequest('PUT', '/posts', updates, {}, id);
  }

  async deletePost(id) {
    return this.makeRequest('DELETE', '/posts', {}, {}, id);
  }

  async getPages(params = {}) {
    return this.makeRequest('GET', '/pages', {}, params);
  }

  async createPage(title, content, status = 'draft') {
    return this.makeRequest('POST', '/pages', { title, content, status });
  }

  async updatePage(id, updates) {
    return this.makeRequest('PUT', '/pages', updates, {}, id);
  }

  async deletePage(id) {
    return this.makeRequest('DELETE', '/pages', {}, {}, id);
  }

  async getCategories() {
    return this.makeRequest('GET', '/categories');
  }

  async createCategory(name, description = '', slug = '') {
    const data = { name, description };
    if (slug) data.slug = slug;
    return this.makeRequest('POST', '/categories', data);
  }

  async updateCategory(id, updates) {
    return this.makeRequest('PUT', '/categories', updates, {}, id);
  }

  async deleteCategory(id) {
    return this.makeRequest('DELETE', '/categories', {}, {}, id);
  }

  async getTags() {
    return this.makeRequest('GET', '/tags');
  }

  async createTag(name, description = '', slug = '') {
    const data = { name, description };
    if (slug) data.slug = slug;
    return this.makeRequest('POST', '/tags', data);
  }

  async updateTag(id, updates) {
    return this.makeRequest('PUT', '/tags', updates, {}, id);
  }

  async deleteTag(id) {
    return this.makeRequest('DELETE', '/tags', {}, {}, id);
  }

  async getUsers() {
    return this.makeRequest('GET', '/users');
  }

  async getCurrentUser() {
    return this.makeRequest('GET', '/users', {}, {}, 'me');
  }

  async getMedia(params = {}) {
    return this.makeRequest('GET', '/media', {}, params);
  }

  async getComments(params = {}) {
    return this.makeRequest('GET', '/comments', {}, params);
  }

  async createComment(postId, content, author_name = '', author_email = '') {
    const data = { 
      post: postId, 
      content, 
      author_name, 
      author_email 
    };
    return this.makeRequest('POST', '/comments', data);
  }

  async updateComment(id, updates) {
    return this.makeRequest('PUT', '/comments', updates, {}, id);
  }

  async deleteComment(id) {
    return this.makeRequest('DELETE', '/comments', {}, {}, id);
  }

  async searchContent(query, type = 'posts') {
    const params = { search: query, per_page: 10 };
    return this.makeRequest('GET', `/${type}`, {}, params);
  }
}

module.exports = WordPressJWTAPI;
