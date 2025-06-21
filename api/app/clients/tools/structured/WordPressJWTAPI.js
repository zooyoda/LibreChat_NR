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

      console.log('=== ОБРАБОТКА ВХОДНЫХ ДАННЫХ ===');
      console.log('Входные данные:', input);
      
      const parsedInput = this.parseInput(input);
      console.log('Распарсенные данные:', JSON.stringify(parsedInput, null, 2));
      
      const { action, endpoint, data, params, id } = parsedInput;
      
      // ДОБАВЛЯЕМ ОТЛАДКУ ДАННЫХ
      console.log('=== ФИНАЛЬНЫЕ ПАРАМЕТРЫ ===');
      console.log('Action (HTTP метод):', action);
      console.log('Endpoint:', endpoint);
      console.log('Data:', JSON.stringify(data, null, 2));
      console.log('ID:', id);
      
      // Специальная обработка для диагностических команд
      if (input.includes('test_capabilities') || action === 'test_capabilities') {
        return await this.testCapabilities();
      }
      
      if (input.includes('check_user_capabilities') || action === 'check_user_capabilities') {
        return await this.checkUserCapabilities();
      }

      if (input.includes('test_correct_approach') || action === 'test_correct_approach') {
        return await this.testWithCorrectApproach();
      }
      
      return await this.makeRequest(action, endpoint, data, params, id);
    } catch (error) {
      console.error('Ошибка в _call:', error);
      return `Ошибка: ${error.message}`;
    }
  }

  parseInput(input) {
    try {
      // Сначала пытаемся распарсить как JSON
      const parsed = JSON.parse(input);
      
      // Обрабатываем разные форматы JSON входных данных
      if (parsed.action) {
        // Формат: {"action": "create_post", "data": {...}}
        return {
          action: this.mapActionToMethod(parsed.action),
          endpoint: this.mapActionToEndpoint(parsed.action),
          data: parsed.data || {},
          params: parsed.params || {},
          id: parsed.data?.id || parsed.id || null
        };
      } else if (parsed.input) {
        // Формат: {"input": "create_post", "data": {...}}
        return {
          action: this.mapActionToMethod(parsed.input),
          endpoint: this.mapActionToEndpoint(parsed.input),
          data: parsed.data || {},
          params: parsed.params || {},
          id: parsed.data?.id || parsed.id || null
        };
      } else if (parsed.method && parsed.endpoint) {
        // Формат: {"method": "POST", "endpoint": "/posts", "data": {...}}
        return {
          action: parsed.method || 'GET',
          endpoint: parsed.endpoint || '/posts',
          data: parsed.data || {},
          params: parsed.params || {},
          id: parsed.id || null
        };
      } else {
        // Неизвестный формат JSON
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

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: правильный маппинг действий на HTTP методы
  mapActionToMethod(action) {
    const actionMap = {
      // Posts
      'get_posts': 'GET',
      'list_posts': 'GET',
      'create_post': 'POST',
      'update_post': 'PUT',
      'delete_post': 'DELETE',
      
      // Pages
      'get_pages': 'GET',
      'list_pages': 'GET',
      'create_page': 'POST',
      'update_page': 'PUT',
      'delete_page': 'DELETE',
      
      // Categories
      'get_categories': 'GET',
      'list_categories': 'GET',
      'create_category': 'POST',
      'update_category': 'PUT',
      'delete_category': 'DELETE',
      
      // Tags
      'get_tags': 'GET',
      'list_tags': 'GET',
      'create_tag': 'POST',
      'update_tag': 'PUT',
      'delete_tag': 'DELETE',
      
      // Comments
      'get_comments': 'GET',
      'list_comments': 'GET',
      'create_comment': 'POST',
      'update_comment': 'PUT',
      'delete_comment': 'DELETE',
      
      // Media
      'get_media': 'GET',
      'list_media': 'GET',
      'upload_media': 'POST',
      
      // Users
      'get_users': 'GET',
      'list_users': 'GET',
      'get_current_user': 'GET',
      
      // Diagnostics
      'test_capabilities': 'test_capabilities',
      'check_user_capabilities': 'check_user_capabilities',
      'test_correct_approach': 'test_correct_approach'
    };
    
    console.log(`Маппинг действия "${action}" в метод:`, actionMap[action] || 'GET');
    return actionMap[action] || 'GET';
  }

  // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: правильный маппинг действий на эндпоинты
  mapActionToEndpoint(action) {
    const endpointMap = {
      // Posts
      'get_posts': '/posts',
      'list_posts': '/posts',
      'create_post': '/posts',
      'update_post': '/posts',
      'delete_post': '/posts',
      
      // Pages
      'get_pages': '/pages',
      'list_pages': '/pages',
      'create_page': '/pages',
      'update_page': '/pages',
      'delete_page': '/pages',
      
      // Categories
      'get_categories': '/categories',
      'list_categories': '/categories',
      'create_category': '/categories',
      'update_category': '/categories',
      'delete_category': '/categories',
      
      // Tags
      'get_tags': '/tags',
      'list_tags': '/tags',
      'create_tag': '/tags',
      'update_tag': '/tags',
      'delete_tag': '/tags',
      
      // Comments
      'get_comments': '/comments',
      'list_comments': '/comments',
      'create_comment': '/comments',
      'update_comment': '/comments',
      'delete_comment': '/comments',
      
      // Media
      'get_media': '/media',
      'list_media': '/media',
      'upload_media': '/media',
      
      // Users
      'get_users': '/users',
      'list_users': '/users',
      'get_current_user': '/users/me',
      
      // Diagnostics
      'test_capabilities': '',
      'check_user_capabilities': '',
      'test_correct_approach': ''
    };
    
    console.log(`Маппинг действия "${action}" в эндпоинт:`, endpointMap[action] || '/posts');
    return endpointMap[action] || '/posts';
  }

  parseTextInput(input) {
    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Поддержка формата "action, {json_data}" И "action: {json_data}"
    const actionDataMatchComma = input.match(/^(\w+),\s*(\{.*\})$/);
    const actionDataMatchColon = input.match(/^(\w+):\s*(\{.*\})$/);
    
    const actionDataMatch = actionDataMatchComma || actionDataMatchColon;
    
    if (actionDataMatch) {
      const [, actionText, jsonData] = actionDataMatch;
      console.log(`Найден формат "action: json" - действие: ${actionText}, данные: ${jsonData}`);
      
      try {
        const data = JSON.parse(jsonData);
        return {
          action: this.mapActionToMethod(actionText),
          endpoint: this.mapActionToEndpoint(actionText),
          data: data,
          params: {},
          id: data.id || null
        };
      } catch (e) {
        console.error('Ошибка парсинга JSON в тексте:', e);
        return {
          action: 'GET',
          endpoint: '/posts',
          data: {},
          params: {},
          id: null
        };
      }
    }

    // НОВОЕ: Обработка комментариев в естественном языке
    // Пример: "Создайте комментарий к посту про notebook lm с ID 1: \"текст комментария\""
    const commentMatch = input.match(/(?:создай|добавь|напиш).*?комментарий.*?(?:к\s+посту.*?)?(?:с\s+)?id[:\s]*(\d+)[:\s]*[\"\'](.*?)[\"\']/i);
    if (commentMatch) {
      const [, postId, content] = commentMatch;
      console.log(`Найден комментарий: пост ${postId}, контент: ${content}`);
      return {
        action: 'POST',
        endpoint: '/comments',
        data: { post: parseInt(postId), content: content },
        params: {},
        id: null
      };
    }
    
    // НОВОЕ: Обработка обновления постов в естественном языке
    // Пример: "Обновить пост с ID 1506, добавив текст: \"новый текст\""
    const updateMatch = input.match(/(?:обнови|измени|редактируй).*?пост.*?(?:с\s+)?id[:\s]*(\d+).*?(?:добавив\s+)?текст[:\s]*[\"\'](.*?)[\"\']/i);
    if (updateMatch) {
      const [, postId, additionalText] = updateMatch;
      console.log(`Найдено обновление поста: ID ${postId}, текст: ${additionalText}`);
      return {
        action: 'PUT',
        endpoint: '/posts',
        data: { content: additionalText },
        params: {},
        id: parseInt(postId)
      };
    }

    const lowerInput = input.toLowerCase();
    
    // Проверяем специальные команды
    if (lowerInput.includes('диагностика') || lowerInput.includes('тест') || lowerInput.includes('test_capabilities')) {
      return { action: 'test_capabilities', endpoint: '', data: {}, params: {}, id: null };
    }
    
    if (lowerInput.includes('права') || lowerInput.includes('capabilities')) {
      return { action: 'check_user_capabilities', endpoint: '', data: {}, params: {}, id: null };
    }

    if (lowerInput.includes('correct_approach') || lowerInput.includes('правильный подход')) {
      return { action: 'test_correct_approach', endpoint: '', data: {}, params: {}, id: null };
    }
    
    // Определяем действие из текста
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

    const idMatch = input.match(/id[:\s]*(\d+)/i);
    const id = idMatch ? idMatch[1] : null;

    return { action, endpoint, data: {}, params: {}, id };
  }

  // ИСПРАВЛЕННАЯ валидация данных
  validatePostData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ ПОСТА ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    // WordPress требует хотя бы title или content
    if (!data || typeof data !== 'object') {
      throw new Error('Данные поста должны быть объектом');
    }
    
    if (!data.title && !data.content) {
      throw new Error('Необходимо указать title или content для создания поста');
    }
    
    // Убеждаемся что строки не пустые
    if (data.title !== undefined) {
      if (typeof data.title !== 'string' || data.title.trim().length === 0) {
        throw new Error('Title не может быть пустой строкой');
      }
    }
    
    if (data.content !== undefined) {
      if (typeof data.content !== 'string' || data.content.trim().length === 0) {
        throw new Error('Content не может быть пустой строкой');
      }
    }
    
    console.log('✅ Валидация данных поста прошла успешно');
    return true;
  }

  validateCategoryData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ КАТЕГОРИИ ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error('Данные категории должны быть объектом');
    }
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new Error('Необходимо указать непустое name для создания категории');
    }
    
    console.log('✅ Валидация данных категории прошла успешно');
    return true;
  }

  validateCommentData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ КОММЕНТАРИЯ ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error('Данные комментария должны быть объектом');
    }
    
    if (!data.post && !data.post_id) {
      throw new Error('Необходимо указать post или post_id для создания комментария');
    }
    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      throw new Error('Необходимо указать непустой content для комментария');
    }
    
    console.log('✅ Валидация данных комментария прошла успешно');
    return true;
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
      
      console.log('=== ПРОВЕРКА ПРАВ ПОЛЬЗОВАТЕЛЯ (С CONTEXT=EDIT) ===');
      
      // КРИТИЧЕСКИ ВАЖНО: добавляем context=edit для получения capabilities
      const response = await axios.get(`${this.apiUrl}/wp-json/wp/v2/users/me?context=edit`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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
      console.log('Username:', userData.username);
      console.log('Роли:', userData.roles);
      console.log('Capabilities получены:', Object.keys(this.userCapabilities).length > 0);
      
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
        return `❌ ПРОБЛЕМА С ПРАВАМИ ДОСТУПА\n\nПользователь: ${userData.name}\nРоли: ${roles.join(', ')}\n\nОтсутствующие права:\n${missingCaps.map(cap => `- ${requiredCaps[cap]} (${cap})`).join('\n')}\n\n🔧 РЕШЕНИЕ: Проверьте context=edit в запросе или права пользователя в WordPress.`;
      }
      
      return `✅ ПРАВА ДОСТУПА В ПОРЯДКЕ\n\nПользователь: ${userData.name}\nРоли: ${roles.join(', ')}\n\nВсе необходимые права присутствуют:\n${capabilityReport.join('\n')}`;
      
    } catch (error) {
      console.error('Ошибка проверки прав:', error.response?.data || error.message);
      
      if (error.response?.status === 403) {
        return `❌ ОШИБКА ДОСТУПА: Не удается получить информацию о пользователе. Проверьте права доступа к /wp-json/wp/v2/users/me?context=edit`;
      }
      
      return `❌ Ошибка проверки прав: ${error.response?.data?.message || error.message}`;
    }
  }

  async testWithCorrectApproach() {
    console.log('=== ТЕСТ С ПРАВИЛЬНЫМ ПОДХОДОМ ===');
    
    try {
      const token = await this.getJWTToken();
      console.log('✅ Токен получен');
      
      // Тест 1: Получаем информацию о себе с context=edit
      const meResponse = await axios.get(`${this.apiUrl}/wp-json/wp/v2/users/me?context=edit`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
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
      
      console.log('=== ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ===');
      console.log('ID:', meResponse.data.id);
      console.log('Username:', meResponse.data.username);
      console.log('Name:', meResponse.data.name);
      console.log('Роли:', meResponse.data.roles);
      console.log('Capabilities присутствуют:', !!meResponse.data.capabilities);
      
      let result = `✅ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ПОЛУЧЕНЫ:\n`;
      result += `ID: ${meResponse.data.id}\n`;
      result += `Username: ${meResponse.data.username}\n`;
      result += `Name: ${meResponse.data.name}\n`;
      result += `Роли: ${meResponse.data.roles?.join(', ') || 'не определены'}\n`;
      
      if (meResponse.data.capabilities) {
        console.log('✅ Capabilities получены!');
        console.log('publish_posts:', meResponse.data.capabilities.publish_posts);
        console.log('edit_posts:', meResponse.data.capabilities.edit_posts);
        console.log('manage_categories:', meResponse.data.capabilities.manage_categories);
        
        result += `\n✅ CAPABILITIES ПОЛУЧЕНЫ:\n`;
        result += `- publish_posts: ${meResponse.data.capabilities.publish_posts}\n`;
        result += `- edit_posts: ${meResponse.data.capabilities.edit_posts}\n`;
        result += `- manage_categories: ${meResponse.data.capabilities.manage_categories}\n`;
        result += `- upload_files: ${meResponse.data.capabilities.upload_files}\n`;
        
        // Тест 2: Пробуем создать черновик
        try {
          const draftPost = await axios.post(`${this.apiUrl}/wp-json/wp/v2/posts`, {
            title: 'LibreChat Test Draft',
            content: 'Тестовый пост из LibreChat с исправленным кодом',
            status: 'draft'
          }, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
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
          
          console.log('✅ Черновик создан! ID:', draftPost.data.id);
          result += `\n✅ ТЕСТ СОЗДАНИЯ ПОСТА УСПЕШЕН!\n`;
          result += `ID созданного поста: ${draftPost.data.id}\n`;
          result += `Заголовок: ${draftPost.data.title.rendered}\n`;
          result += `Статус: ${draftPost.data.status}\n`;
          
        } catch (createError) {
          console.error('❌ Ошибка создания поста:', createError.response?.data);
          result += `\n❌ ОШИБКА СОЗДАНИЯ ПОСТА:\n`;
          result += `${createError.response?.data?.message || createError.message}\n`;
        }
        
      } else {
        result += `\n❌ Capabilities НЕ получены - проблема с context=edit\n`;
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Ошибка теста:', error.response?.status, error.response?.data);
      return `❌ Ошибка теста: ${error.response?.data?.message || error.message}`;
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
      
      // 2. Проверяем права пользователя (исправленная версия)
      results.push('\n🔍 Проверка прав пользователя (с context=edit)...');
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

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Валидация данных перед отправкой
    try {
      if (method === 'POST' && endpoint === '/posts') {
        this.validatePostData(data);
      } else if (method === 'POST' && endpoint === '/categories') {
        this.validateCategoryData(data);
      } else if (method === 'POST' && endpoint === '/comments') {
        this.validateCommentData(data);
      }
    } catch (validationError) {
      return `❌ Ошибка валидации: ${validationError.message}`;
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

    // Специальная обработка для комментариев
    if (endpoint === '/comments' && data.post_id) {
      data.post = data.post_id;
      delete data.post_id;
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
      console.log(`Отправляем ${method} запрос к: ${url}`);
      console.log('Данные:', JSON.stringify(data, null, 2));
      
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
