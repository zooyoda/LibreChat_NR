const WordPressJWTAPI = require('../WordPressJWTAPI');

describe('WordPressJWTAPI', () => {
  let wordpressAPI;

  beforeEach(() => {
    process.env.WORDPRESS_API_URL = 'https://example.com';
    process.env.WORDPRESS_USERNAME = 'testuser';
    process.env.WORDPRESS_PASSWORD = 'testpass';
    
    wordpressAPI = new WordPressJWTAPI();
  });

  test('should initialize correctly', () => {
    expect(wordpressAPI.name).toBe('wordpress_jwt_api');
    expect(wordpressAPI.apiUrl).toBe('https://example.com');
  });

  test('should parse JSON input correctly', () => {
    const input = '{"action": "GET", "endpoint": "/posts"}';
    const parsed = wordpressAPI.parseInput(input);
    expect(parsed.action).toBe('GET');
    expect(parsed.endpoint).toBe('/posts');
  });

  test('should parse text input correctly', () => {
    const input = 'создай новый пост';
    const parsed = wordpressAPI.parseTextInput(input);
    expect(parsed.action).toBe('POST');
    expect(parsed.endpoint).toBe('/posts');
  });
});
