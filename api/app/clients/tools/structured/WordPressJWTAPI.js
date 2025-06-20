const { Tool } = require('langchain/tools');
const axios = require('axios');
const https = require('https');
const http = require('http');

class WordPressJWTAPI extends Tool {
  constructor(fields = {}) {
    super();
    
    this.name = 'wordpress_jwt_api';
    this.description = `WordPress REST API tool with JWT authentication for comprehensive content management. Can create, read, update, and delete posts, pages, categories, tags, media, users, and comments. Automatically handles JWT token refresh.

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

    // Получаем данные с приоритетом: fields -> env
    this.apiUrl = fields.WORDPRESS_API_URL || this.getEnvVariable('WORDPRESS_API_URL');
    this.username = fields.WORDPRESS_USERNAME || this.getEnvVariable('WORDPRESS_USERNAME');
    this.password = fields.WORDPRESS_PASSWORD || this.getEnvVariable('WORDPRESS_PASSWORD');

    console.log('WordPress JWT API инициализация:');
    console.log('- apiUrl:', this.apiUrl ? 'установлен' : 'НЕ УСТАНОВЛЕН');
    console.log('- username:', this.username ? `установлен (${this.username})` : 'НЕ УСТАНОВЛЕН');
    console.log('- password:', this.password ? 'установлен' : 'НЕ УСТАНОВЛЕН');

    if (!this.apiUrl || !this.username || !this.password) {
      this.isConfigured = false;
      this.configError = `Отсутствуют обязательные поля. Настройте инструмент в интерфейсе LibreChat.`;
      return;
    }

    // Убираем trailing slash
    this.apiUrl = this.apiUrl.replace(/\/$/, '');
    
    this.jwtToken = null;
    this.tokenExpiry = null;
    this.refreshThreshold = 60000;
    this.isConfigured = true;

    console.log('WordPress JWT API успешно инициализирован с URL:', this.apiUrl);
  }

  getEnvVariable(name) {
    return process.env[name];
  }

  async _call(input) {
    try {
      if (!this.isConfigured) {
        return `Ошибка конфигурации: ${this.configError}`;
      }

      const parsedInput = this.parseInput(input);
      const { action, endpoint, data, params, id } = parsedInput;
      return await this.makeRequest(action, endpoint, data, params, id);
    } catch (error) {
      return `Ошибка: ${error.message}`;
    }
  }

  parseInput(input) {
    try {
      const parsed = JSON.parse(input);
      return {
        action: parsed.action || 'GET',
        endpoint: parsed.endpoint || '/posts',
        data: parsed.data || {},
        params: parsed.params || {},
        id: parsed.id || null
      };
    } catch {
      return this.parseTextInput(input);
    }
  }

  parseTextInput(input) {
    const lowerInput = input.toLowerCase();
    
    let action = 'GET';
    if (lowerInput.includes('создай') || lowerInput.includes('добавь') || lowerInput.includes('новый') || lowerInput.includes('create')) {
      action = 'POST';
    } else if (lowerInput.includes('обнови') || lowerInput.includes('измени') || lowerInput.includes('редактируй') || lowerInput.includes('update')) {
      action = 'PUT';
    } else if (lowerInput.includes('удали') || lowerInput.includes('убери') || lowerInput.includes('delete')) {
      action = 'DELETE';
    }

    let endpoint = '/posts';
    if (lowerInput.includes('страниц') || lowerInput.includes('page')) endpoint = '/pages';
    else if (lowerInput.includes('категор') || lowerInput.includes('categor')) endpoint = '/categories';
    else if (lowerInput.includes('тег') || lowerInput.includes('метк') || lowerInput.includes('tag')) endpoint = '/tags';
    else if (lowerInput.includes('пользовател') || lowerInput.includes('user')) endpoint = '/users';
    else if (lowerInput.includes('медиа') || lowerInput.includes('изображен') || lowerInput.includes('файл') || lowerInput.includes('media')) endpoint = '/media';
    else if (lowerInput.includes('комментар') || lowerInput.includes('comment')) endpoint = '/comments';

    const idMatch = input.match(/id[:\s]*(\d+)/i);
    const id = idMatch ? idMatch[1] : null;

    return { action, endpoint, data: {}, params: {}, id };
  }

  async getJWTToken() {
    if (!this.isConfigured) {
      throw new Error(this.configError);
    }

    if (this.jwtToken && this.tokenExpiry && 
        (Date.now() + this.refreshThreshold) < this.tokenExpiry) {
      return this.jwtToken;
    }

    try {
      console.log('Получение JWT токена для пользователя:', this.username);
      
      const authData = {
        username: this.username,
        password: this.password
      };
      
      console.log('Отправка запроса на:', `${this.apiUrl}/wp-json/jwt-auth/v1/token`);
      
      const response = await axios.post(`${this.apiUrl}/wp-json/jwt-auth/v1/token`, authData, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'LibreChat-WordPress-API/1.0',
          'Accept': 'application/json'
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          keepAlive: true,
          timeout: 30000
        }),
        httpAgent: new http.Agent({
          keepAlive: true,
          timeout: 30000
        })
      });

      if (!response.data || !response.data.token) {
        throw new Error('Токен не получен от сервера');
      }

      this.jwtToken = response.data.token;
      this.tokenExpiry = Date.now() + (6 * 24 * 60 * 60 * 1000);
      
      console.log('JWT токен успешно получен');
      console.log('Пользователь:', response.data.user_display_name || response.data.user_nicename);
      
      return this.jwtToken;
    } catch (error) {
      console.error('Ошибка получения JWT токена:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        throw new Error(`Ошибка авторизации: неверные учетные данные для пользователя ${this.username}`);
      }
      
      throw new Error(`Не удалось получить JWT токен: ${error.response?.data?.message || error.message}`);
    }
  }

  async makeRequest(method, endpoint, data = {}, params = {}, id = null) {
    if (!this.isConfigured) {
      throw new Error(this.configError);
    }

    const token = await this.getJWTToken();
    
    let url = `${this.apiUrl}/wp-json/wp/v2${endpoint}`;
    if (id) {
      url += `/${id}`;
    }

    // Специальная обработка для PUT запросов
    if (method === 'PUT' && !id && endpoint.includes('/')) {
      // URL уже содержит ID в endpoint
      url = `${this.apiUrl}/wp-json/wp/v2${endpoint}`;
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
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
        keepAlive: true,
        timeout: 30000
      }),
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
      if (Object.keys(data).length > 0) {
        console.log('Данные запроса:', JSON.stringify(data, null, 2));
      }
      
      const response = await axios(config);
      console.log('Запрос выполнен успешно, статус:', response.status);
      
      return this.formatResponse(response.data, method, endpoint, id);
    } catch (error) {
      console.error('Ошибка запроса:', error.response?.status, error.response?.data);
      
      if (error.response?.status === 401) {
        console.log('Токен истек, получаем новый...');
        this.jwtToken = null;
        this.tokenExpiry = null;
        
        try {
          const newToken = await this.getJWTToken();
          config.headers['Authorization'] = `Bearer ${newToken}`;
          const retryResponse = await axios(config);
          return this.formatResponse(retryResponse.data, method, endpoint, id);
        } catch (retryError) {
          return `Ошибка аутентификации: ${retryError.message}`;
        }
      }

      if (error.response) {
        const errorData = error.response.data;
        
        if (error.response.status === 403) {
          if (errorData.code === 'rest_cannot_create') {
            return `Ошибка прав доступа: Пользователь ${this.username} не имеет права на создание контента. Проверьте роль пользователя в WordPress.`;
          }
          return `Ошибка доступа (403): ${errorData.message || 'Недостаточно прав'}`;
        }
        
        if (error.response.status === 404) {
          return `Ошибка маршрута (404): Эндпоинт ${endpoint} не найден или метод ${method} не поддерживается.`;
        }
        
        return `WordPress API Ошибка: ${error.response.status} - ${errorData.message || error.response.statusText}`;
      }

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
}

module.exports = WordPressJWTAPI;
