const express = require('express');
const https = require('https');
const { URL } = require('url');
const router = express.Router();

// Диагностический endpoint
router.get('/test/google-connectivity', async (req, res) => {
  const testEndpoints = [
    'https://oauth2.googleapis.com/token',
    'https://www.googleapis.com/oauth2/v2/userinfo',
    'https://accounts.google.com/.well-known/openid_configuration',
    'https://www.googleapis.com/auth/drive'
  ];
  
  const results = {};
  
  for (const endpoint of testEndpoints) {
    try {
      const startTime = Date.now();
      const result = await testConnection(endpoint);
      const duration = Date.now() - startTime;
      results[endpoint] = { 
        success: true, 
        duration, 
        statusCode: result.statusCode,
        headers: result.headers 
      };
    } catch (error) {
      results[endpoint] = { 
        success: false, 
        error: error.message,
        code: error.code 
      };
    }
  }
  
  res.json({
    timestamp: new Date().toISOString(),
    server: req.get('host'),
    nodeVersion: process.version,
    platform: process.platform,
    env: {
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED,
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      HTTP_PROXY: process.env.HTTP_PROXY
    },
    results
  });
});

function testConnection(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'HEAD', // Используем HEAD для минимального трафика
      timeout: 5000,
      headers: {
        'User-Agent': 'LibreChat-Diagnostic/1.0',
        'Accept': 'application/json'
      }
    };
    
    const req = https.request(options, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: Object.keys(res.headers)
      });
      res.resume(); // Потребляем response
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Connection timeout after 5s'));
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

module.exports = router;
