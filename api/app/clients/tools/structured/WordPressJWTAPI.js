const { Tool } = require('langchain/tools');
const axios = require('axios');
const https = require('https');
const http = require('http');

class WordPressJWTAPI extends Tool {
  constructor(fields = {}) {
    super();
    
    this.name = 'wordpress_jwt_api';
    this.description = `WordPress REST API tool with JWT authentication for comprehensive content management. Can create, read, update, and delete posts, pages, categories, tags, media, users, and comments. Automatically handles JWT token refresh and provides detailed capability diagnostics.

Available operations:
- Posts: get_posts, create_post, update_post, delete_post
- Pages: get_pages, create_page, update_page, delete_page  
- Categories: get_categories, create_category, update_category, delete_category
- Tags: get_tags, create_tag, update_tag, delete_tag
- Comments: get_comments, create_comment, update_comment, delete_comment
- Media: get_media, upload_media
- Users: get_users, get_current_user
- Diagnostics: test_capabilities, check_user_capabilities

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
    this.userCapabilities = null; // Кэш для capabilities

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

      console.log('Входные данные:', input);
      const parsedInput = this.parseInput(input);
      console.log('Обработанные данные:', JSON.stringify(parsedInput, null, 2));
      
      const { action, endpoint, data, params, id } = parsedInput;
      
      // Специальные команды диагностики
      if (action && action.toLowerCase() === 'test_capabilities') {
        return await this.testCapabilities();
      }
      
      if (action && action.toLowerCase() === 'check_user_capabilities') {
        return await this.checkUserCapabilities();
      }
      
      return await this.makeRequest(action, endpoint, data, params, id);
    } catch (error) {
      console.error('Ошибка в _call:', error);
      return `Ошибка: ${error.message}`;
    }
  }

  parseInput(input) {
    try {
      // Пытаемся распарсить JSON
      const parsed = JSON.parse(input);
      
      // Обрабатываем разные форматы входных данных
      if (parsed.input && parsed.data) {
        // Формат: {"input": "create_post", "data": {...}}
        return {
          action: this.mapActionToMethod(parsed.input),
          endpoint: this.mapActionToEndpoint(parsed.input),
          data: parsed.data || {},
          params: parsed.params || {},
          id: parsed.data?.id || parsed.id || null
        };
      } else if (parsed.action) {
        // Формат: {"action": "POST", "endpoint": "/posts", "data": {...}}
        return {
          action: parsed.action || 'GET',
          endpoint: parsed.endpoint || '/posts',
          data: parsed.data || {},
          params: parsed.params || {},
          id: parsed.id || null
        };
      } else {
        // Неизвестный формат, пытаемся угадать
        return {
          action: 'GET',
          endpoint: '/posts',
          data: parsed,
          params: {},
          id: null
        };
      }
    } catch {
      // Если не JSON, пытаемся понять намерение из текста
      return this.parseTextInput(input);
    }
  }

  mapActionToMethod(action) {
    const actionMap = {
      'create_post': 'POST',
      'update_post': 'PUT',
      'delete_post': 'DELETE',
      'get_posts': 'GET',
      'create_category': 'POST',
      'update_category': 'PUT',
      'delete_category': 'DELETE',
      'get_categories': 'GET',
      'create_comment': 'POST',
      'update_comment': 'PUT',
      'delete_comment': 'DELETE',
      'get_comments': 'GET',
      'test_capabilities': 'test_capabilities',
      'check_user_capabilities': 'check_user_capabilities'
    };
    
    return actionMap[action] || 'GET';
  }

  mapActionToEndpoint(action) {
    const endpointMap = {
      'create_post': '/posts',
      'update_post': '/posts',
      'delete_post': '/posts',
      'get_posts': '/posts',
      'create_category': '/categories',
      'update_category': '/categories',
      'delete_category': '/categories',
      'get_categories': '/categories',
      'create_comment': '/comments',
      'update_comment': '/comments',
      'delete_comment': '/comments',
      'get_comments': '/comments'
    };
    
    return endpointMap[action] || '/posts';
  }

  parseTextInput(input) {
    const lowerInput = input.toLowerCase();
    
    // Проверяем специальные команды
    if (lowerInput.includes('диагностика') || lowerInput.includes('тест') || lowerInput.includes('test_capabilities')) {
      return { action: 'test_capabilities', endpoint: '', data: {}, params: {}, id: null };
    }
    
    if (lowerInput.includes('права') || lowerInput.includes('capabilities')) {
      return { action: 'check_user_capabilities', endpoint: '', data: {}, params: {}, id: null };
    }
    
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
        throw new Error(`Ошибка авторизации: неверные учетные данные для пользователя ${this.username}. Проверьте Application Password.`);
      }
      
      throw new Error(`Не удалось получить JWT токен: ${error.response?.data?.message || error.message}`);
    }
  }

  async checkUserCapabilities() {
    try {
      const token = await this.getJWTToken();
      
      console.log('=== ПРОВЕРКА ПРАВ ПОЛЬЗОВАТЕЛЯ ===');
      
      // Получаем информацию о текущем пользователе
      const response = await axios.get(`${this.apiUrl}/wp-json/wp/v2/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
          keepAlive: true
        }),
        httpAgent: new http.Agent({
          keepAlive: true
        })
      });
      
      const userData = response.data;
      this.userCapabilities = userData.capabilities || {};
      
      console.log('Текущий пользователь:', userData.name);
      console.log('ID пользователя:', userData.id);
      console.log('Роли:', userData.roles);
      
      // Проверяем ключевые права для REST API
      const requiredCaps = {
        'publish_posts': 'Публикация постов',
        'edit_posts': 'Редактирование постов',
        'edit_others_posts': 'Редактирование чужих постов',
        'delete_posts': 'Удаление постов',
        'manage_categories': 'Управление категориями',
        'upload_files': 'Загрузка файлов',
        'read': 'Чтение контента'
      };
      
      const capabilityReport = [];
      const missingCaps = [];
      
      for (const [cap, description] of Object.entries(requiredCaps)) {
        const hasCap = this.userCapabilities[cap] === true;
        capabilityReport.push(`${hasCap ? '✅' : '❌'} ${description} (${cap}): ${hasCap ? 'ЕСТЬ' : 'НЕТ'}`);
        
        if (!hasCap) {
          missingCaps.push(cap);
        }
      }
      
      console.log('Проверка capabilities:');
      capabilityReport.forEach(line => console.log(line));
      
      // Безопасная обработка ролей
      const roles = Array.isArray(userData.roles) ? userData.roles : [];
      
      if (missingCaps.length > 0) {
        console.error('❌ Отсутствующие критические права:', missingCaps);
        return `❌ ПРОБЛЕМА С ПРАВАМИ ДОСТУПА\n\nПользователь: ${userData.name}\nРоли: ${roles.join(', ')}\n\nОтсутствующие права:\n${missingCaps.map(cap => `- ${requiredCaps[cap]} (${cap})`).join('\n')}\n\n🔧 РЕШЕНИЕ: Назначьте пользователю роль Administrator или Editor в WordPress админке.`;
      }
      
      return `✅ ПРАВА ДОСТУПА В ПОРЯДКЕ\n\nПользователь: ${userData.name}\nРоли: ${roles.join(', ')}\n\nВсе необходимые права присутствуют:\n${capabilityReport.join('\n')}`;
      
    } catch (error) {
      console.error('Ошибка проверки прав:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        return `❌ ОШИБКА ДОСТУПА: Не удается получить информацию о пользователе. Проверьте права доступа к /wp-json/wp/v2/users/me`;
      }
      
      return `❌ Ошибка проверки прав: ${error.response?.data?.message || error.message}`;
    }
  }

  async testCapabilities() {
    console.log('=== ПОЛНАЯ ДИАГНОСТИКА WORDPRESS JWT API ===');
    
    const results = [];
    
    try {
      // 1. Проверяем получение токена
      results.push('🔍 Тестирование получения JWT токена...');
      const token = await this.getJWTToken();
      results.push('✅ JWT токен получен успешно');
      
      // 2. Проверяем права пользователя
      results.push('\n🔍 Проверка прав пользователя...');
      const capResult = await this.checkUserCapabilities();
      results.push(capResult);
      
      // 3. Тестируем GET запрос
      results.push('\n🔍 Тестирование GET запроса...');
      const getPosts = await this.makeRequest('GET', '/posts', {}, { per_page: 1 });
      results.push('✅ GET запрос работает');
      
      // 4. Тестируем создание черновика (если есть права)
      if (this.userCapabilities && this.userCapabilities['edit_posts']) {
        results.push('\n🔍 Тестирование создания черновика...');
        try {
          const testPost = await this.makeRequest('POST', '/posts', {
            title: 'Тестовый пост от LibreChat',
            content: 'Этот пост создан для тестирования API. Можно удалить.',
            status: 'draft'
          });
          results.push('✅ Создание черновика работает');
        } catch (createError) {
          results.push(`❌ Ошибка создания поста: ${createError.message}`);
        }
      } else {
        results.push('\n⚠️ Пропуск теста создания - нет прав edit_posts');
      }
      
      results.push('\n=== ДИАГНОСТИКА ЗАВЕРШЕНА ===');
      return results.join('\n');
      
    } catch (error) {
      results.push(`❌ Критическая ошибка диагностики: ${error.message}`);
      return results.join('\n');
    }
  }

  async makeRequest(method, endpoint, data = {}, params = {}, id = null) {
    if (!this.isConfigured) {
      throw new Error(this.configError);
    }

    const token = await this.getJWTToken();
    
    let url = `${this.apiUrl}/wp-json/wp/v2${endpoint}`;
    
    // Правильная обработка ID для разных методов
    if (method === 'PUT' || method === 'DELETE') {
      if (id) {
        url += `/${id}`;
      } else if (data.id) {
        url += `/${data.id}`;
        // Удаляем ID из данных, так как он уже в URL
        const { id: removedId, ...dataWithoutId } = data;
        data = dataWithoutId;
      }
    } else if (method === 'GET' && id) {
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

      if (error.response?.status === 403) {
        const errorData = error.response.data;
        
        if (errorData.code === 'rest_cannot_create') {
          return `❌ ОШИБКА ПРАВ ДОСТУПА: Пользователь "${this.username}" не может создавать контент.

🔧 ПРОВЕРЬТЕ:
1. Роль пользователя в WordPress (должна быть Administrator/Editor)
2. Application Password активен и корректен
3. JWT плагин настроен правильно

💡 Запустите диагностику: "test_capabilities"`;
        }
        
        if (errorData.code === 'rest_forbidden') {
          return `❌ Доступ запрещен: ${errorData.message}

🔧 Возможные причины:
- Недостаточно прав для операции ${method} ${endpoint}
- Пользователь не может редактировать этот контент
- Проблемы с настройками WordPress`;
        }
        
        if (errorData.code === 'rest_cannot_edit') {
          return `❌ Нельзя редактировать: ${errorData.message}

🔧 Проверьте права пользователя на редактирование этого типа контента.`;
        }
        
        return `❌ Ошибка 403: ${errorData.message || 'Недостаточно прав'}

Код ошибки: ${errorData.code || 'неизвестен'}
Запустите "test_capabilities" для диагностики.`;
      }
      
      if (error.response?.status === 400) {
        const errorData = error.response.data;
        return `❌ Ошибка 400: ${errorData.message || 'Неверные данные запроса'}

Код: ${errorData.code || 'неизвестен'}
Данные: ${JSON.stringify(errorData.data || {}, null, 2)}

🔧 Проверьте правильность передаваемых данных.`;
      }
      
      if (error.response?.status === 404) {
        return `❌ Ошибка 404: Эндпоинт ${endpoint} не найден или метод ${method} не поддерживается.

🔧 Проверьте:
- Правильность URL эндпоинта
- Поддержку метода ${method} для ${endpoint}
- Активность WordPress REST API`;
      }
      
      if (error.response) {
        const errorData = error.response.data;
        return `❌ WordPress API Ошибка ${error.response.status}: ${errorData.message || error.response.statusText}

Код: ${errorData.code || 'неизвестен'}
Данные: ${JSON.stringify(errorData.data || {}, null, 2)}`;
      }

      return `❌ Сетевая ошибка: ${error.message}

🔧 Проверьте:
- Доступность сайта ${this.apiUrl}
- Интернет соединение
- Настройки файрвола`;
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
