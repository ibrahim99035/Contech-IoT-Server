/**
 * controllers/auth/oauthHandler.js
 * FIXED OAuth2 Handler for Google Assistant Account Linking
 * This version properly handles Google OAuth flow - users authenticate via Google
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../../models/User');
const AuthorizationCode = require('../../models/AuthorizationCode');

/**
 * OAuth2 Authorization Endpoint - FIXED for Google OAuth Flow
 * This redirects users to Google for authentication
 */
const oauthAuthorize = async (req, res) => {
  try {
    const { 
      response_type, 
      client_id, 
      redirect_uri, 
      scope, 
      state 
    } = req.query;
    
    console.log('🔐 [OAuth Authorize] Request:', { 
      response_type, 
      client_id: client_id?.substring(0, 20) + '...', 
      redirect_uri, 
      scope, 
      state 
    });
    
    // Validate OAuth2 parameters
    if (response_type !== 'code') {
      console.error('❌ [OAuth Authorize] Invalid response_type:', response_type);
      const errorUrl = `${redirect_uri}?error=unsupported_response_type&error_description=Only+code+response_type+supported&state=${state}`;
      return res.redirect(errorUrl);
    }
    
    // Validate client ID (Google Assistant's client ID)
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID;
    
    if (client_id !== expectedClientId) {
      console.error('❌ [OAuth Authorize] Invalid client_id');
      const errorUrl = `${redirect_uri}?error=invalid_client&error_description=Invalid+client+ID&state=${state}`;
      return res.redirect(errorUrl);
    }
    
    if (!redirect_uri || !state) {
      console.error('❌ [OAuth Authorize] Missing required parameters');
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Missing redirect_uri or state parameter'
      });
    }

    // Store the OAuth request parameters in session/temporary storage
    // We need to remember these when Google redirects back to us
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Store OAuth session data (you might want to use Redis or database for this)
    // For now, we'll use a simple in-memory store (replace with persistent storage in production)
    global.oauthSessions = global.oauthSessions || new Map();
    global.oauthSessions.set(sessionId, {
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: scope || 'smart_home',
      state: state,
      createdAt: Date.now()
    });
    
    // Clean up old sessions (older than 10 minutes)
    for (const [key, session] of global.oauthSessions.entries()) {
      if (Date.now() - session.createdAt > 10 * 60 * 1000) {
        global.oauthSessions.delete(key);
      }
    }
    
    // Build Google OAuth URL
    const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleOAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
    googleOAuthUrl.searchParams.set('redirect_uri', process.env.GOOGLE_OAUTH_REDIRECT_URI);
    googleOAuthUrl.searchParams.set('response_type', 'code');
    googleOAuthUrl.searchParams.set('scope', 'openid email profile');
    googleOAuthUrl.searchParams.set('state', sessionId); // Use our session ID as state
    googleOAuthUrl.searchParams.set('access_type', 'offline');
    googleOAuthUrl.searchParams.set('prompt', 'consent');
    
    console.log('🔐 [OAuth Authorize] Redirecting to Google OAuth');
    console.log('Session ID:', sessionId);
    
    // Redirect user to Google for authentication
    res.redirect(googleOAuthUrl.toString());
    
  } catch (error) {
    console.error('❌ [OAuth Authorize] Error:', error);
    const { redirect_uri, state } = req.query;
    if (redirect_uri && state) {
      const errorUrl = `${redirect_uri}?error=server_error&error_description=Internal+server+error&state=${state}`;
      return res.redirect(errorUrl);
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Google OAuth Callback Handler
 * This is where Google redirects users after they authenticate
 */
const googleOAuthCallback = async (req, res) => {
  try {
    const { code, state: sessionId, error } = req.query;
    
    console.log('🔐 [Google OAuth Callback] Received:', { 
      hasCode: !!code, 
      sessionId, 
      error 
    });
    
    if (error) {
      console.error('❌ [Google OAuth Callback] OAuth error:', error);
      return res.status(400).send('Authentication failed');
    }
    
    if (!code || !sessionId) {
      console.error('❌ [Google OAuth Callback] Missing code or session ID');
      return res.status(400).send('Invalid callback request');
    }
    
    // Retrieve OAuth session data
    global.oauthSessions = global.oauthSessions || new Map();
    const oauthSession = global.oauthSessions.get(sessionId);
    
    if (!oauthSession) {
      console.error('❌ [Google OAuth Callback] Session not found:', sessionId);
      return res.status(400).send('Session expired or invalid');
    }
    
    // Clean up session
    global.oauthSessions.delete(sessionId);
    
    try {
      // Exchange code for Google access token
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI
      });
      
      const { access_token } = tokenResponse.data;
      
      // Get user info from Google
      const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      const googleUser = userResponse.data;
      console.log('✅ [Google OAuth Callback] User authenticated:', googleUser.email);
      
      // Find or create user in your system
      let user = await User.findOne({ email: googleUser.email });
      
      if (!user) {
        // Create new user from Google profile
        user = new User({
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id,
          avatar: googleUser.picture,
          isVerified: true, // Google users are already verified
          role: 'user'
        });
        await user.save();
        console.log('✅ [Google OAuth Callback] New user created:', user.email);
      } else if (!user.googleId) {
        // Update existing user with Google ID
        user.googleId = googleUser.id;
        user.isVerified = true;
        if (googleUser.picture) user.avatar = googleUser.picture;
        await user.save();
        console.log('✅ [Google OAuth Callback] User updated with Google ID:', user.email);
      }
      
      // Generate authorization code for the original OAuth flow
      const authCode = crypto.randomBytes(32).toString('hex');
      
      const authRecord = new AuthorizationCode({
        code: authCode,
        userId: user._id,
        clientId: oauthSession.clientId,
        redirectUri: oauthSession.redirectUri,
        scope: oauthSession.scope,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
      
      await authRecord.save();
      
      console.log('✅ [Google OAuth Callback] Authorization code generated');
      
      // Redirect back to Google Assistant with authorization code
      const successUrl = `${oauthSession.redirectUri}?code=${authCode}&state=${oauthSession.state}`;
      return res.redirect(successUrl);
      
    } catch (apiError) {
      console.error('❌ [Google OAuth Callback] API error:', apiError.response?.data || apiError.message);
      const errorUrl = `${oauthSession.redirectUri}?error=server_error&error_description=Authentication+failed&state=${oauthSession.state}`;
      return res.redirect(errorUrl);
    }
    
  } catch (error) {
    console.error('❌ [Google OAuth Callback] Error:', error);
    return res.status(500).send('Internal server error');
  }
};

/**
 * OAuth2 Token Exchange Endpoint - Same as before
 */
const oauthToken = async (req, res) => {
  try {
    const { grant_type, client_id, client_secret, refresh_token, code } = req.body;
    
    console.log('🔐 [OAuth Token] Request:', {
      grant_type,
      client_id: client_id?.substring(0, 20) + '...',
      client_secret: client_secret ? 'provided' : 'missing',
      code: code ? 'provided' : 'missing',
      refresh_token: refresh_token ? 'provided' : 'missing'
    });
    
    // Validate client credentials
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID;
    const expectedClientSecret = process.env.GOOGLE_ACTIONS_CLIENT_SECRET;
    
    if (client_id !== expectedClientId || client_secret !== expectedClientSecret) {
      console.error('❌ [OAuth Token] Invalid client credentials');
      return res.status(400).json({ 
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      });
    }

    // Handle authorization code grant
    if (grant_type === 'authorization_code') {
      console.log('🔐 [OAuth Token] Processing authorization code grant');
      
      if (!code) {
        return res.status(400).json({ 
          error: 'invalid_request',
          error_description: 'Authorization code is required'
        });
      }
      
      // Find and validate authorization code
      const authRecord = await AuthorizationCode.findOne({ code, clientId: client_id });
      
      if (!authRecord) {
        console.error('❌ [OAuth Token] Authorization code not found');
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        });
      }
      
      if (authRecord.expiresAt < new Date()) {
        console.error('❌ [OAuth Token] Authorization code expired');
        await AuthorizationCode.deleteOne({ code });
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'Authorization code has expired'
        });
      }
      
      // Get user
      const user = await User.findById(authRecord.userId);
      if (!user) {
        console.error('❌ [OAuth Token] User not found');
        await AuthorizationCode.deleteOne({ code });
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'User not found'
        });
      }
      
      // Generate tokens
      const accessToken = jwt.sign(
        { 
          id: user._id,
          email: user.email,
          role: user.role,
          iss: 'contech-home-automation',
          aud: client_id,
          scope: authRecord.scope
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      const refreshTokenPayload = jwt.sign(
        { 
          id: user._id,
          type: 'refresh',
          iss: 'contech-home-automation',
          aud: client_id
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // Clean up used authorization code
      await AuthorizationCode.deleteOne({ code });
      
      console.log('✅ [OAuth Token] Tokens generated for user:', user.email);
      
      return res.json({
        access_token: accessToken,
        refresh_token: refreshTokenPayload,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: authRecord.scope
      });
    }

    // Handle refresh token grant
    if (grant_type === 'refresh_token') {
      console.log('🔐 [OAuth Token] Processing refresh token grant');
      
      if (!refresh_token) {
        return res.status(400).json({ 
          error: 'invalid_request',
          error_description: 'Refresh token is required'
        });
      }
      
      let decoded;
      try {
        decoded = jwt.verify(refresh_token, process.env.JWT_SECRET);
      } catch (jwtError) {
        console.error('❌ [OAuth Token] Invalid refresh token:', jwtError.message);
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        });
      }
      
      if (decoded.type !== 'refresh') {
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'Invalid refresh token type'
        });
      }
      
      const user = await User.findById(decoded.id);
      if (!user) {
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'User not found'
        });
      }

      const newAccessToken = jwt.sign(
        { 
          id: user._id,
          email: user.email,
          role: user.role,
          iss: 'contech-home-automation',
          aud: client_id
        },
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

    // Unsupported grant type
    console.error('❌ [OAuth Token] Unsupported grant type:', grant_type);
    return res.status(400).json({ 
      error: 'unsupported_grant_type',
      error_description: `Grant type "${grant_type}" is not supported`
    });
    
  } catch (error) {
    console.error('❌ [OAuth Token] Error:', error);
    return res.status(500).json({ 
      error: 'server_error',
      error_description: 'Internal server error'
    });
  }
};

module.exports = {
  oauthAuthorize,
  googleOAuthCallback,
  oauthToken
};