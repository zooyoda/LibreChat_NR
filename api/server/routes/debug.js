const express = require('express');
const axios = require('axios');
const router = express.Router();

// ✅ Диагностический endpoint для проверки сетевого соединения
router.get('/network-test', async (req, res) => {
  const testResults = {
    timestamp: new Date().toISOString(),
    server: 'Amvera',
    tests: {}
  };
  
  const testUrls = [
    'https://oauth2.googleapis.com/token',
    'https://www.googleapis.com/oauth2/v2/userinfo',
    'https://api.openai.com/v1/models',
    'https://www.google.com'
  ];
  
  for (const url of testUrls) {
    try {
      const startTime = Date.now();
      
      const response = await axios.head(url, {
        timeout: 10000,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'LibreChat-NetworkTest/1.0'
        }
      });
      
      const duration = Date.now() - startTime;
      
      testResults.tests[url] = {
        success: true,
        status: response.status,
        duration: duration,
        accessible: response.status < 500
      };
      
    } catch (error) {
      testResults.tests[url] = {
        success: false,
        error: error.message,
        code: error.code,
        timeout: error.code === 'ETIMEDOUT'
      };
    }
  }
  
  // Общая оценка
  const successfulTests = Object.values(testResults.tests).filter(t => t.success).length;
  const totalTests = Object.keys(testResults.tests).length;
  
  testResults.summary = {
    successRate: `${successfulTests}/${totalTests}`,
    networkStatus: successfulTests > totalTests / 2 ? 'GOOD' : 'POOR',
    recommendation: successfulTests > totalTests / 2 
      ? 'Network connectivity is adequate for OAuth' 
      : 'Network issues detected - may affect OAuth flow'
  };
  
  res.json(testResults);
});

module.exports = router;
