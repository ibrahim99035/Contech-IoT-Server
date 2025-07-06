/**
 * controllers/auth/oauthHandler.js
 * OAuth2 Token Exchange for Google Assistant Account Linking
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/User');
const AuthorizationCode = require('../../models/AuthorizationCode');

/**
 * OAuth2 Authorization Endpoint
 * Redirects user to login page with OAuth parameters
 */
const oauthAuthorize = async (req, res) => {
  try {
    const { response_type, client_id, redirect_uri, scope, state } = req.query;
    
    console.log('🔐 [OAuth Authorize] Request:', req.query);
    
    // Validate parameters
    if (response_type !== 'code') {
      return res.status(400).json({ error: 'unsupported_response_type' });
    }
    
    if (client_id !== process.env.GOOGLE_ACTIONS_CLIENT_ID) {
      return res.status(400).json({ error: 'invalid_client' });
    }
    
    if (!redirect_uri || !state) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    // Redirect to your login page with OAuth parameters
    const loginUrl = `${process.env.FRONTEND_URL}/login?` +
      `redirect_uri=${encodeURIComponent(redirect_uri)}&` +
      `state=${encodeURIComponent(state)}&` +
      `client_id=${encodeURIComponent(client_id)}&` +
      `oauth_flow=true`;

    console.log('🔐 [OAuth Authorize] Redirecting to:', loginUrl);
    res.redirect(loginUrl);
    
  } catch (error) {
    console.error('❌ [OAuth Authorize] Error:', error);
    res.status(500).json({ error: 'server_error' });
  }
};

/**
 * OAuth2 Token Exchange Endpoint
 * Exchanges authorization code for access/refresh tokens
 */
const oauthToken = async (req, res) => {
  try {
    const { grant_type, client_id, client_secret, refresh_token, code } = req.body;
    
    console.log('🔐 [OAuth Token] Grant type:', grant_type);
    
    // Validate client credentials
    if (client_id !== process.env.GOOGLE_ACTIONS_CLIENT_ID || 
        client_secret !== process.env.GOOGLE_ACTIONS_CLIENT_SECRET) {
      return res.status(400).json({ error: 'invalid_client' });
    }

    if (grant_type === 'authorization_code') {
      // Exchange authorization code for access/refresh tokens
      console.log('🔐 [OAuth Token] Exchanging authorization code');
      
      if (!code) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      
      // Find and verify authorization code
      const authRecord = await AuthorizationCode.findOne({ code });
      if (!authRecord || authRecord.expiresAt < new Date()) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      // Get user
      const user = await User.findById(authRecord.userId);
      if (!user) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      // Generate tokens (matching your existing JWT structure)
      const accessToken = jwt.sign(
        { id: user._id }, // Use 'id' to match your authMiddleware
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      const refreshToken = jwt.sign(
        { id: user._id, type: 'refresh' },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // Delete used authorization code
      await AuthorizationCode.deleteOne({ code });
      
      console.log('✅ [OAuth Token] Tokens generated for user:', user.email);
      
      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600
      });
    }

    if (grant_type === 'refresh_token') {
      // Refresh the access token
      console.log('🔐 [OAuth Token] Refreshing access token');
      
      if (!refresh_token) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      
      const decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
      
      if (decoded.type !== 'refresh') {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(400).json({ error: 'invalid_grant' });
      }

      const newAccessToken = jwt.sign(
        { id: user._id }, // Use 'id' to match your authMiddleware
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      console.log('✅ [OAuth Token] Access token refreshed for user:', user.email);

      return res.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600
      });
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
    
  } catch (error) {
    console.error('❌ [OAuth Token] Error:', error);
    res.status(400).json({ error: 'invalid_grant' });
  }
};

/**
 * Handle Account Linking after successful login
 * Called from frontend after user logs in successfully
 */
const handleAccountLinking = async (req, res) => {
  try {
    const { redirect_uri, state, client_id } = req.body;
    const user = req.user; // User is already authenticated by protect middleware
    
    console.log('🔗 [Account Linking] User:', user.email);
    console.log('🔗 [Account Linking] Redirect URI:', redirect_uri);
    
    // Validate the client_id
    if (client_id !== process.env.GOOGLE_ACTIONS_CLIENT_ID) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }

    // Generate authorization code
    const authCode = crypto.randomBytes(32).toString('hex');
    
    // Store the authorization code
    const authRecord = new AuthorizationCode({
      code: authCode,
      userId: user._id,
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: 'smart_home'
    });
    
    await authRecord.save();
    
    console.log('✅ [Account Linking] Authorization code generated');
    
    // Return the authorization code and redirect URL
    res.json({
      success: true,
      authCode: authCode,
      redirectUrl: `${redirect_uri}?code=${authCode}&state=${state}`
    });
    
  } catch (error) {
    console.error('❌ [Account Linking] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'server_error',
      message: 'Failed to link account'
    });
  }
};

module.exports = {
  oauthAuthorize,
  oauthToken,
  handleAccountLinking
};