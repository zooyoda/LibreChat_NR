const express = require('express');
const router = express.Router();
// ✅ ИСПРАВЛЕНО: Правильный путь к контроллеру
const { handleGoogleWorkspaceCallback } = require('../../app/controllers/auth/googleWorkspaceCallback');

// Google Workspace OAuth callback
router.get('/oauth/google/workspace/callback', handleGoogleWorkspaceCallback);

module.exports = router;
