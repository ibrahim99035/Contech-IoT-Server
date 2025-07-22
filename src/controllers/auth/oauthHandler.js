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
const AccessToken = require('../../models/AccessToken');

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

    // Instead of creating a user directly, redirect to Google OAuth for proper authentication
    // Store the original OAuth request parameters
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    // Store OAuth session data in memory (in production, use Redis or database)
    global.oauthSessions = global.oauthSessions || new Map();
    global.oauthSessions.set(sessionId, {
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: scope || 'smart_home',
      state: state,
      timestamp: Date.now()
    });
    
    // Clean up old sessions (older than 10 minutes)
    for (const [key, session] of global.oauthSessions.entries()) {
      if (Date.now() - session.timestamp > 600000) { // 10 minutes
        global.oauthSessions.delete(key);
      }
    }
    
    console.log('✅ [OAuth Authorize] Session stored, redirecting to Google OAuth');
    
    // Build Google OAuth URL
    const googleOAuthParams = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'email profile',
      state: sessionId, // Use sessionId as state for Google OAuth
      access_type: 'offline',
      prompt: 'consent'
    });
    
    const googleOAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${googleOAuthParams.toString()}`;
    
    // Redirect user to Google for authentication
    res.redirect(googleOAuthUrl);
    
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

const oauthToken = async (req, res) => {
  try {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret
    } = req.body;
    
    console.log('🎫 [OAuth Token] Request:', {
      grant_type,
      code: code?.substring(0, 10) + '...',
      redirect_uri,
      client_id: client_id?.substring(0, 20) + '...'
    });
    
    // Validate grant type
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant type is supported'
      });
    }
    
    // Validate client credentials
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID;
    const expectedClientSecret = process.env.GOOGLE_ACTIONS_CLIENT_SECRET;
    
    if (client_id !== expectedClientId || client_secret !== expectedClientSecret) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      });
    }
    
    // Find and validate authorization code
    const authData = await AuthorizationCode.findOne({ 
      code: code,
      clientId: client_id,
      redirectUri: redirect_uri
    }).populate('userId');
    
    if (!authData) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid authorization code'
      });
    }
    
    // Check if code is expired (MongoDB TTL should handle this, but double-check)
    if (authData.expiresAt < new Date()) {
      await AuthorizationCode.deleteOne({ _id: authData._id });
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Expired authorization code'
      });
    }
    
    // Generate access token and refresh token
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    
    // Save access token to database
    const tokenDoc = new AccessToken({
      token: accessToken,
      userId: authData.userId._id,
      clientId: client_id,
      scope: authData.scope,
      refreshToken: refreshToken,
      expiresAt: new Date(Date.now() + 3600 * 1000) // 1 hour
    });
    
    await tokenDoc.save();
    
    // Delete the used authorization code
    await AuthorizationCode.deleteOne({ _id: authData._id });
    
    console.log('✅ [OAuth Token] Issued access token for user:', authData.userId.email || authData.userId._id);
    
    // Return token response
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: authData.scope
    });
    
  } catch (error) {
    console.error('❌ [OAuth Token] Error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error'
    });
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
        // Create new user from Google profile with required fields
        user = new User({
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.id,
          avatar: googleUser.picture,
          isVerified: true, // Google users are already verified
          role: 'user', // Set required role field
          password: crypto.randomBytes(32).toString('hex'), // Set a random password for Google users
          // Add any other required fields from your User model here
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

module.exports = {
  oauthAuthorize,
  googleOAuthCallback,
  oauthToken
};