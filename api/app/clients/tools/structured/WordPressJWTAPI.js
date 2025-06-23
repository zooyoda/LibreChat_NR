const { Tool } = require('langchain/tools');
const axios = require('axios');
const https = require('https');
const http = require('http');

class WordPressJWTAPI extends Tool {
  constructor(fields = {}) {
    super();
    
    this.name = 'wordpress_jwt_api';
    this.description = `WordPress REST API tool with JWT authentication for comprehensive content management.

🎯 ОБЯЗАТЕЛЬНЫЕ ФОРМАТЫ ЗАПРОСОВ:

📝 СОЗДАНИЕ ПОСТА:
{"action":"create_post","data":{"title":"Заголовок поста","content":"Содержимое поста","status":"draft"}}

📄 СОЗДАНИЕ СТРАНИЦЫ:
{"action":"create_page","data":{"title":"Заголовок страницы","content":"Содержимое страницы","status":"draft"}}

📂 СОЗДАНИЕ КАТЕГОРИИ:
{"action":"create_category","data":{"name":"Название категории","description":"Описание"}}

💬 СОЗДАНИЕ КОММЕНТАРИЯ:
{"action":"create_comment","data":{"post":123,"content":"Текст комментария"}}

📖 ПОЛУЧЕНИЕ ПОСТОВ (с пагинацией):
{"action":"get_posts","params":{"per_page":10,"page":1}}

📄 ПОЛУЧЕНИЕ СТРАНИЦ:
{"action":"get_pages","params":{"per_page":10,"page":1}}

📂 ПОЛУЧЕНИЕ КАТЕГОРИЙ (с пагинацией):
{"action":"get_categories","params":{"per_page":20,"page":1}}

✏️ РЕДАКТИРОВАНИЕ ПОСТА:
{"action":"update_post","data":{"id":123,"title":"Новый заголовок","content":"Новое содержимое"}}

⚠️ КРИТИЧЕСКИ ВАЖНО:
- Всегда используйте JSON формат с полями "action" и "data"
- Для постов используйте create_post, для страниц - create_page
- Используйте params для пагинации: {"per_page":20,"page":2}
- НЕ используйте естественный язык - только JSON!

Available operations: get_posts, create_post, update_post, delete_post, get_pages, create_page, update_page, delete_page, get_categories, create_category, get_comments, create_comment, test_capabilities`;

    // Получаем данные с приоритетом: fields -> env
    this.apiUrl = fields.WORDPRESS_API_URL || this.getEnvVariable('WORDPRESS_API_URL');
    this.username = fields.WORDPRESS_USERNAME || this.getEnvVariable('WORDPRESS_USERNAME');
    this.password = fields.WORDPRESS_PASSWORD || this.getEnvVariable('WORDPRESS_PASSWORD');

    console.log('WordPress JWT API инициализация:');
    console.log('- apiUrl:', this.apiUrl);
    console.log('- username:', this.username);
    console.log('- password:', this.password ? 'установлен' : 'НЕ УСТАНОВЛЕН');

    // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Проверка на "user_provided"
    if (this.apiUrl === 'user_provided' || this.username === 'user_provided' || this.password === 'user_provided') {
      this.isConfigured = false;
      this.configError = `❌ ОШИБКА КОНФИГУРАЦИИ: Пользовательские данные не переданы в инструмент.

🔧 РЕШЕНИЯ:
1. Убедитесь, что вы ввели данные в интерфейсе LibreChat
2. Перезагрузите страницу после ввода данных
3. Проверьте правильность URL (должен быть https://yoursite.com)
4. Убедитесь, что переменные окружения установлены как "user_provided"

💡 ТЕКУЩИЕ ЗНАЧЕНИЯ:
- API URL: ${this.apiUrl}
- Username: ${this.username}
- Password: ${this.password ? 'установлен' : 'не установлен'}

📋 ТРЕБУЕМЫЙ ФОРМАТ:
- API URL: https://neuralrunner.ru
- Username: admin_kiu
- Password: ваш Application Password`;
      return;
    }

    if (!this.apiUrl || !this.username || !this.password) {
      this.isConfigured = false;
      this.configError = `❌ ОТСУТСТВУЮТ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ

🔧 НЕОБХОДИМО УКАЗАТЬ:
- WordPress Site URL (например: https://neuralrunner.ru)
- WordPress Username (например: admin_kiu)  
- WordPress Password (Application Password)

💡 Настройте инструмент в интерфейсе LibreChat.`;
      return;
    }

    // Проверяем, что URL валидный
    try {
      new URL(this.apiUrl);
    } catch (error) {
      this.isConfigured = false;
      this.configError = `❌ НЕВЕРНЫЙ URL: ${this.apiUrl}

🔧 ПРАВИЛЬНЫЙ ФОРМАТ URL:
- https://neuralrunner.ru
- https://yoursite.com
- http://localhost:8080

❌ НЕПРАВИЛЬНО:
- neuralrunner.ru (без протокола)
- user_provided (не заменен на реальный URL)`;
      return;
    }

    // Убираем trailing slash
    this.apiUrl = this.apiUrl.replace(/\/$/, '');
    
    this.jwtToken = null;
    this.tokenExpiry = null;
    this.refreshThreshold = 60000;
    this.isConfigured = true;
    this.userCapabilities = null; // Кэш для capabilities

    console.log('✅ WordPress JWT API успешно инициализирован с URL:', this.apiUrl);
  }

  getEnvVariable(name) {
    return process.env[name];
  }

  async _call(input) {
    try {
      if (!this.isConfigured) {
        return this.configError;
      }

      console.log('=== ОБРАБОТКА ВХОДНЫХ ДАННЫХ ===');
      console.log('Входные данные:', input);
      
      // КРИТИЧЕСКАЯ ПРОВЕРКА: отклоняем естественный язык без JSON
      if (!this.isValidJSONInput(input)) {
        return this.getFormatHelp(input);
      }
      
      const parsedInput = this.parseInput(input);
      console.log('Распарсенные данные:', JSON.stringify(parsedInput, null, 2));
      
      const { action, endpoint, data, params, id } = parsedInput;
      
      // ДОБАВЛЯЕМ ОТЛАДКУ ДАННЫХ
      console.log('=== ФИНАЛЬНЫЕ ПАРАМЕТРЫ ===');
      console.log('Action (HTTP метод):', action);
      console.log('Endpoint:', endpoint);
      console.log('Data:', JSON.stringify(data, null, 2));
      console.log('Params:', JSON.stringify(params, null, 2));
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
      return `❌ Ошибка: ${error.message}

🔧 ВОЗМОЖНЫЕ ПРИЧИНЫ:
1. Неверные учетные данные WordPress
2. Проблемы с сетевым подключением
3. Неправильная конфигурация JWT плагина
4. Неверный URL сайта

💡 Запустите диагностику: {"action":"test_capabilities"}`;
    }
  }

  isValidJSONInput(input) {
    // Проверяем, является ли входной параметр валидным JSON с action
    try {
      const parsed = JSON.parse(input);
      return parsed.action || parsed.input;
    } catch {
      // Разрешаем только специальные команды диагностики
      const lowerInput = input.toLowerCase();
      return lowerInput.includes('test_capabilities') || 
             lowerInput.includes('check_user_capabilities') ||
             lowerInput.includes('диагностика');
    }
  }

  getFormatHelp(input) {
    const lowerInput = input.toLowerCase();
    
    let suggestion = '';
    if (lowerInput.includes('пост') || lowerInput.includes('статью')) {
      suggestion = `{"action":"create_post","data":{"title":"Заголовок вашего поста","content":"Содержимое поста","status":"draft"}}`;
    } else if (lowerInput.includes('страниц')) {
      suggestion = `{"action":"create_page","data":{"title":"Заголовок страницы","content":"Содержимое страницы","status":"draft"}}`;
    } else if (lowerInput.includes('категор')) {
      suggestion = `{"action":"get_categories","params":{"per_page":20,"page":1}}`;
    } else if (lowerInput.includes('комментар')) {
      suggestion = `{"action":"create_comment","data":{"post":ID_ПОСТА,"content":"Текст комментария"}}`;
    } else {
      suggestion = `{"action":"get_posts","params":{"per_page":10,"page":1}}`;
    }

    return `❌ НЕПРАВИЛЬНЫЙ ФОРМАТ ЗАПРОСА

🚫 Получен: "${input}"

✅ ИСПОЛЬЗУЙТЕ ТОЛЬКО JSON ФОРМАТ:

${suggestion}

📋 ДОСТУПНЫЕ ДЕЙСТВИЯ:
- create_post: Создание поста
- create_page: Создание страницы  
- get_posts: Получение постов
- get_pages: Получение страниц
- get_categories: Получение категорий (с пагинацией)
- create_category: Создание категории
- create_comment: Создание комментария
- update_post: Редактирование поста

💡 ПАГИНАЦИЯ: Используйте params: {"per_page":20,"page":2}

⚠️ ВАЖНО: Естественный язык НЕ поддерживается. Только JSON!`;
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

  // ИСПРАВЛЕННЫЙ маппинг действий на HTTP методы
  mapActionToMethod(action) {
    const actionMap = {
      // Posts
      'get_posts': 'GET',
      'list_posts': 'GET',
      'create_post': 'POST',
      'update_post': 'PUT',
      'delete_post': 'DELETE',
      
      // Pages - ИСПРАВЛЕНО
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

  // ИСПРАВЛЕННЫЙ маппинг действий на эндпоинты
  mapActionToEndpoint(action) {
    const endpointMap = {
      // Posts
      'get_posts': '/posts',
      'list_posts': '/posts',
      'create_post': '/posts',
      'update_post': '/posts',
      'delete_post': '/posts',
      
      // Pages - ИСПРАВЛЕНО
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
    
    // Для всех остальных случаев возвращаем GET запрос
    return { action: 'GET', endpoint: '/posts', data: {}, params: {}, id: null };
  }

  // УЛУЧШЕННАЯ валидация данных
  validatePostData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ ПОСТА ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error(`Данные поста должны быть объектом. 

✅ ПРАВИЛЬНЫЙ ФОРМАТ:
{"action":"create_post","data":{"title":"Заголовок","content":"Содержимое","status":"draft"}}`);
    }
    
    if (!data.title && !data.content) {
      throw new Error(`Необходимо указать title или content для создания поста.

❌ ОТСУТСТВУЮТ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ:
- title (заголовок поста)
- content (содержимое поста)

✅ ПРАВИЛЬНЫЙ ПРИМЕР:
{"action":"create_post","data":{"title":"Мой заголовок","content":"Содержимое поста","status":"draft"}}`);
    }
    
    if (data.title !== undefined) {
      if (typeof data.title !== 'string' || data.title.trim().length === 0) {
        throw new Error(`Title не может быть пустой строкой.

✅ ПРАВИЛЬНО: "title":"Заголовок поста"
❌ НЕПРАВИЛЬНО: "title":"" или "title":null`);
      }
    }
    
    if (data.content !== undefined) {
      if (typeof data.content !== 'string' || data.content.trim().length === 0) {
        throw new Error(`Content не может быть пустой строкой.

✅ ПРАВИЛЬНО: "content":"Содержимое поста"
❌ НЕПРАВИЛЬНО: "content":"" или "content":null`);
      }
    }
    
    console.log('✅ Валидация данных поста прошла успешно');
    return true;
  }

  // НОВАЯ валидация для страниц
  validatePageData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ СТРАНИЦЫ ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error(`Данные страницы должны быть объектом.

✅ ПРАВИЛЬНЫЙ ФОРМАТ:
{"action":"create_page","data":{"title":"Заголовок страницы","content":"Содержимое страницы","status":"draft"}}`);
    }
    
    if (!data.title && !data.content) {
      throw new Error(`Необходимо указать title или content для создания страницы.

❌ ОТСУТСТВУЮТ ОБЯЗАТЕЛЬНЫЕ ПОЛЯ:
- title (заголовок страницы)
- content (содержимое страницы)

✅ ПРАВИЛЬНЫЙ ПРИМЕР:
{"action":"create_page","data":{"title":"О нас","content":"Информация о компании","status":"draft"}}`);
    }
    
    console.log('✅ Валидация данных страницы прошла успешно');
    return true;
  }

  validateCategoryData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ КАТЕГОРИИ ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error(`Данные категории должны быть объектом.

✅ ПРАВИЛЬНЫЙ ФОРМАТ:
{"action":"create_category","data":{"name":"Название категории","description":"Описание"}}`);
    }
    
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new Error(`Необходимо указать непустое name для создания категории.

❌ ОТСУТСТВУЕТ ОБЯЗАТЕЛЬНОЕ ПОЛЕ: name

✅ ПРАВИЛЬНЫЙ ПРИМЕР:
{"action":"create_category","data":{"name":"Моя категория","description":"Описание категории"}}`);
    }
    
    console.log('✅ Валидация данных категории прошла успешно');
    return true;
  }

  async validateCommentData(data) {
    console.log('=== ВАЛИДАЦИЯ ДАННЫХ КОММЕНТАРИЯ ===');
    console.log('Проверяемые данные:', JSON.stringify(data, null, 2));
    
    if (!data || typeof data !== 'object') {
      throw new Error(`Данные комментария должны быть объектом.

✅ ПРАВИЛЬНЫЙ ФОРМАТ:
{"action":"create_comment","data":{"post":123,"content":"Текст комментария"}}`);
    }
    
    const postId = data.post || data.post_id;
    if (!postId) {
      throw new Error(`Необходимо указать post или post_id для создания комментария.

❌ ОТСУТСТВУЕТ ОБЯЗАТЕЛЬНОЕ ПОЛЕ: post

✅ ПРАВИЛЬНЫЙ ПРИМЕР:
{"action":"create_comment","data":{"post":123,"content":"Мой комментарий"}}`);
    }
    
    if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
      throw new Error(`Необходимо указать непустой content для комментария.

❌ ОТСУТСТВУЕТ ОБЯЗАТЕЛЬНОЕ ПОЛЕ: content

✅ ПРАВИЛЬНЫЙ ПРИМЕР:
{"action":"create_comment","data":{"post":123,"content":"Интересная статья!"}}`);
    }
    
    // НОВОЕ: Проверяем существование поста и разрешены ли комментарии
    console.log(`Проверяем пост ID ${postId}...`);
    const postCheck = await this.checkPostExists(postId);
    
    if (!postCheck.exists) {
      throw new Error(`Пост с ID ${postId} не найден.

🔧 РЕШЕНИЯ:
1. Проверьте правильность ID поста
2. Используйте {"action":"get_posts","params":{"per_page":10}} для получения списка доступных постов`);
    }
    
    if (postCheck.commentStatus === 'closed') {
      // Получаем список постов с открытыми комментариями
      const commentablePosts = await this.findCommentablePosts();
      const suggestions = commentablePosts.slice(0, 3).map(post => 
        `ID: ${post.id} - "${post.title}"`
      ).join('\n');
      
      throw new Error(`Комментарии к посту "${postCheck.title}" (ID: ${postId}) закрыты для обсуждения.

🔧 ВЫБЕРИТЕ ПОСТ С ОТКРЫТЫМИ КОММЕНТАРИЯМИ:

${suggestions}

✅ ИСПОЛЬЗУЙТЕ:
{"action":"create_comment","data":{"post":ID_ПОСТА,"content":"Ваш комментарий"}}`);
    }
    
    console.log('✅ Валидация данных комментария прошла успешно');
    console.log(`Комментарии к посту "${postCheck.title}" разрешены`);
    return true;
  }

  async checkPostExists(postId) {
    try {
      const token = await this.getJWTToken();
      const response = await axios.get(`${this.apiUrl}/wp-json/wp/v2/posts/${postId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
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
      
      return {
        exists: true,
        commentStatus: response.data.comment_status,
        title: response.data.title.rendered
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return { exists: false, error: 'Пост не найден' };
      }
      return { exists: false, error: error.message };
    }
  }

  async findCommentablePosts() {
    try {
      const token = await this.getJWTToken();
      const response = await axios.get(`${this.apiUrl}/wp-json/wp/v2/posts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          per_page: 10,
          comment_status: 'open',
          status: 'publish'
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
      
      return response.data.map(post => ({
        id: post.id,
        title: post.title.rendered,
        link: post.link
      }));
    } catch (error) {
      console.error('Ошибка поиска постов для комментирования:', error);
      return [];
    }
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
        throw new Error(`❌ Ошибка авторизации: неверные учетные данные для пользователя ${this.username}. 

🔧 ПРОВЕРЬТЕ:
1. Правильность имени пользователя: ${this.username}
2. Application Password (не обычный пароль!)
3. Активность JWT плагина на сайте ${this.apiUrl}`);
      }
      
      throw new Error(`❌ Не удалось получить JWT токен: ${error.response?.data?.message || error.message}

🔧 ВОЗМОЖНЫЕ ПРИЧИНЫ:
1. Неверный URL сайта: ${this.apiUrl}
2. JWT плагин не установлен или не активен
3. Проблемы с сетевым подключением
4. Неверные учетные данные`);
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
        'publish_pages': 'Публикация страниц',
        'edit_pages': 'Редактирование страниц',
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
        console.log('publish_pages:', meResponse.data.capabilities.publish_pages);
        console.log('manage_categories:', meResponse.data.capabilities.manage_categories);
        
        result += `\n✅ CAPABILITIES ПОЛУЧЕНЫ:\n`;
        result += `- publish_posts: ${meResponse.data.capabilities.publish_posts}\n`;
        result += `- edit_posts: ${meResponse.data.capabilities.edit_posts}\n`;
        result += `- publish_pages: ${meResponse.data.capabilities.publish_pages}\n`;
        result += `- manage_categories: ${meResponse.data.capabilities.manage_categories}\n`;
        result += `- upload_files: ${meResponse.data.capabilities.upload_files}\n`;
        
        // Тест 2: Пробуем создать черновик поста
        try {
          const draftPost = await axios.post(`${this.apiUrl}/wp-json/wp/v2/posts`, {
            title: 'LibreChat Test Draft Post',
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
          
          console.log('✅ Черновик поста создан! ID:', draftPost.data.id);
          result += `\n✅ ТЕСТ СОЗДАНИЯ ПОСТА УСПЕШЕН!\n`;
          result += `ID созданного поста: ${draftPost.data.id}\n`;
          result += `Заголовок: ${draftPost.data.title.rendered}\n`;
          result += `Статус: ${draftPost.data.status}\n`;
          
        } catch (createError) {
          console.error('❌ Ошибка создания поста:', createError.response?.data);
          result += `\n❌ ОШИБКА СОЗДАНИЯ ПОСТА:\n`;
          result += `${createError.response?.data?.message || createError.message}\n`;
        }

        // Тест 3: Пробуем создать черновик страницы
        try {
          const draftPage = await axios.post(`${this.apiUrl}/wp-json/wp/v2/pages`, {
            title: 'LibreChat Test Draft Page',
            content: 'Тестовая страница из LibreChat с исправленным кодом',
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
          
          console.log('✅ Черновик страницы создан! ID:', draftPage.data.id);
          result += `\n✅ ТЕСТ СОЗДАНИЯ СТРАНИЦЫ УСПЕШЕН!\n`;
          result += `ID созданной страницы: ${draftPage.data.id}\n`;
          result += `Заголовок: ${draftPage.data.title.rendered}\n`;
          result += `Статус: ${draftPage.data.status}\n`;
          
        } catch (createError) {
          console.error('❌ Ошибка создания страницы:', createError.response?.data);
          result += `\n❌ ОШИБКА СОЗДАНИЯ СТРАНИЦЫ:\n`;
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
        results.push('\n🔍 Тестирование создания черновика поста...');
        try {
          const testPost = await this.makeRequest('POST', '/posts', {
            title: 'Тестовый пост от LibreChat',
            content: 'Этот пост создан для тестирования API. Можно удалить.',
            status: 'draft'
          });
          results.push('✅ Создание черновика поста работает');
        } catch (createError) {
          results.push(`❌ Ошибка создания поста: ${createError.message}`);
        }
      } else {
        results.push('\n⚠️ Пропуск теста создания поста - нет прав edit_posts');
      }

      // 5. Тестируем создание страницы (если есть права)
      if (this.userCapabilities && this.userCapabilities['edit_pages']) {
        results.push('\n🔍 Тестирование создания черновика страницы...');
        try {
          const testPage = await this.makeRequest('POST', '/pages', {
            title: 'Тестовая страница от LibreChat',
            content: 'Эта страница создана для тестирования API. Можно удалить.',
            status: 'draft'
          });
          results.push('✅ Создание черновика страницы работает');
        } catch (createError) {
          results.push(`❌ Ошибка создания страницы: ${createError.message}`);
        }
      } else {
        results.push('\n⚠️ Пропуск теста создания страницы - нет прав edit_pages');
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
      } else if (method === 'POST' && endpoint === '/pages') {
        this.validatePageData(data);
      } else if (method === 'POST' && endpoint === '/categories') {
        this.validateCategoryData(data);
      } else if (method === 'POST' && endpoint === '/comments') {
        await this.validateCommentData(data);
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

    // ИСПРАВЛЕНИЕ: Устанавливаем значения по умолчанию для пагинации
    if (method === 'GET' && Object.keys(params).length === 0) {
      // Для категорий увеличиваем лимит по умолчанию
      if (endpoint === '/categories') {
        params.per_page = 50; // Показываем больше категорий
      } else {
        params.per_page = 10; // Для остальных типов контента
      }
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
      console.log('Параметры:', JSON.stringify(params, null, 2));
      if (Object.keys(data).length > 0) {
        console.log('Данные:', JSON.stringify(data, null, 2));
      }
      
      const response = await axios(config);
      console.log('Запрос выполнен успешно, статус:', response.status);
      
      return this.formatResponse(response.data, method, endpoint, id, response.headers);
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
          return this.formatResponse(retryResponse.data, method, endpoint, id, retryResponse.headers);
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
        
        if (errorData.code === 'rest_comment_closed') {
          const commentablePosts = await this.findCommentablePosts();
          const suggestions = commentablePosts.slice(0, 3).map(post => 
            `ID: ${post.id} - "${post.title}"`
          ).join('\n');
          
          return `❌ Комментарии к этому посту закрыты для обсуждения.

🔧 ВЫБЕРИТЕ ПОСТ С ОТКРЫТЫМИ КОММЕНТАРИЯМИ:

${suggestions}

✅ ИСПОЛЬЗУЙТЕ:
{"action":"create_comment","data":{"post":ID_ПОСТА,"content":"Ваш комментарий"}}`;
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

  // ИСПРАВЛЕННЫЙ formatResponse с поддержкой пагинации
  formatResponse(data, method, endpoint, id, headers = {}) {
    if (Array.isArray(data)) {
      const itemType = this.getItemType(endpoint);
      
      // Получаем информацию о пагинации из заголовков
      const totalItems = headers['x-wp-total'] ? parseInt(headers['x-wp-total']) : data.length;
      const totalPages = headers['x-wp-totalpages'] ? parseInt(headers['x-wp-totalpages']) : 1;
      
      // ИСПРАВЛЕНИЕ: Показываем все элементы, а не только первые 5
      const displayLimit = Math.min(data.length, 20); // Увеличиваем лимит отображения
      const items = data.slice(0, displayLimit).map(item => ({
        id: item.id,
        title: item.title?.rendered || item.name || 'Без названия',
        status: item.status || 'неизвестен',
        date: item.date || item.date_gmt || 'неизвестна',
        type: item.type || 'неизвестен'
      }));

      let result = `Найдено ${totalItems} ${itemType}. Показываю ${displayLimit} из ${data.length} на текущей странице:\n\n`;
      
      result += items.map(item => {
        let itemInfo = `ID: ${item.id}\nНазвание: ${item.title}\nСтатус: ${item.status}`;
        if (item.type && item.type !== 'неизвестен') {
          itemInfo += `\nТип: ${item.type}`;
        }
        itemInfo += `\nДата: ${item.date}\n`;
        return itemInfo;
      }).join('\n');

      // Добавляем информацию о пагинации
      if (totalPages > 1) {
        result += `\n📄 ПАГИНАЦИЯ:\n`;
        result += `Всего элементов: ${totalItems}\n`;
        result += `Всего страниц: ${totalPages}\n`;
        result += `\n💡 Для просмотра других страниц используйте:\n`;
        result += `{"action":"${this.getActionFromEndpoint(endpoint)}","params":{"per_page":20,"page":2}}`;
      }

      return result;
    }

    if (method === 'POST') {
      const itemType = this.getItemType(endpoint);
      return `✅ Успешно создан новый ${itemType}!\nID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nТип: ${data.type || 'неизвестен'}\nСсылка: ${data.link || 'недоступна'}`;
    }

    if (method === 'PUT') {
      const itemType = this.getItemType(endpoint);
      return `✅ Успешно обновлен ${itemType}!\nID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nТип: ${data.type || 'неизвестен'}\nПоследнее изменение: ${data.modified || 'неизвестно'}`;
    }

    if (method === 'DELETE') {
      return `✅ Элемент успешно удален.`;
    }

    if (data.id) {
      const itemType = this.getItemType(endpoint);
      return `${itemType} ID: ${data.id}\nНазвание: ${data.title?.rendered || data.name || 'Без названия'}\nСтатус: ${data.status || 'неизвестен'}\nТип: ${data.type || 'неизвестен'}\nДата создания: ${data.date || 'неизвестна'}\nПоследнее изменение: ${data.modified || 'неизвестно'}\nСсылка: ${data.link || 'недоступна'}`;
    }

    return JSON.stringify(data, null, 2);
  }

  getActionFromEndpoint(endpoint) {
    const actionMap = {
      '/posts': 'get_posts',
      '/pages': 'get_pages',
      '/categories': 'get_categories',
      '/tags': 'get_tags',
      '/comments': 'get_comments',
      '/media': 'get_media',
      '/users': 'get_users'
    };
    return actionMap[endpoint] || 'get_posts';
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
