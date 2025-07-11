const express = require('express');
const router = express.Router();
const { handleGoogleWorkspaceCallback } = require('../controllers/auth/googleWorkspaceCallback');

// === GOOGLE WORKSPACE OAUTH CALLBACK ROUTE ===
// Обработка OAuth callback от Google для плагина Google Workspace
router.get('/oauth/google/workspace/callback', handleGoogleWorkspaceCallback);

module.exports = router;
