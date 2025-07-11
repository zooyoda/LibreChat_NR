const express = require('express');
const router = express.Router();
const { handleGoogleWorkspaceCallback } = require('../controllers/auth/googleWorkspaceCallback');

// Google Workspace OAuth callback
router.get('/oauth/google/workspace/callback', handleGoogleWorkspaceCallback);

module.exports = router;
