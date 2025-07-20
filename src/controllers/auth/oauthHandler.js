/**
 * controllers/auth/oauthHandler.js
 * OAuth2 Token Exchange for Google Assistant Account Linking
 * FIXED: Removed frontend redirect dependency and fixed environment variables
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../../models/User');
const AuthorizationCode = require('../../models/AuthorizationCode');

/**
 * OAuth2 Authorization Endpoint - DIRECT FLOW
 * Instead of redirecting to a login page, this will handle direct authorization
 * Returns authorization code directly for testing or can be called with user credentials
 */
const oauthAuthorize = async (req, res) => {
  try {
    const { 
      response_type, 
      client_id, 
      redirect_uri, 
      scope, 
      state,
      // NEW: Direct authorization parameters for testing
      email,
      password 
    } = req.query;
    
    console.log('🔐 [OAuth Authorize] Request:', { 
      response_type, 
      client_id: client_id?.substring(0, 20) + '...', 
      redirect_uri, 
      scope, 
      state,
      email: email ? 'provided' : 'not provided'
    });
    
    // Validate OAuth2 parameters
    if (response_type !== 'code') {
      console.error('❌ [OAuth Authorize] Invalid response_type:', response_type);
      return res.status(400).json({ 
        error: 'unsupported_response_type',
        error_description: 'Only "code" response_type is supported'
      });
    }
    
    // FIXED: Use correct environment variable names
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    
    if (client_id !== expectedClientId) {
      console.error('❌ [OAuth Authorize] Invalid client_id');
      console.error('Expected:', expectedClientId?.substring(0, 20) + '...');
      console.error('Received:', client_id?.substring(0, 20) + '...');
      return res.status(400).json({ 
        error: 'invalid_client',
        error_description: 'Invalid client ID'
      });
    }
    
    if (!redirect_uri || !state) {
      console.error('❌ [OAuth Authorize] Missing required parameters');
      return res.status(400).json({ 
        error: 'invalid_request',
        error_description: 'Missing redirect_uri or state parameter'
      });
    }

    // OPTION 1: Direct authorization with credentials (for testing)
    if (email && password) {
      console.log('🔐 [OAuth Authorize] Direct authorization with credentials');
      
      // Find and verify user
      const user = await User.findOne({ email });
      if (!user || !(await user.matchPassword(password))) {
        console.error('❌ [OAuth Authorize] Invalid credentials for:', email);
        return res.status(401).json({ 
          error: 'access_denied',
          error_description: 'Invalid email or password'
        });
      }
      
      // Generate authorization code
      const authCode = crypto.randomBytes(32).toString('hex');
      
      // Store the authorization code
      const authRecord = new AuthorizationCode({
        code: authCode,
        userId: user._id,
        clientId: client_id,
        redirectUri: redirect_uri,
        scope: scope || 'smart_home',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });
      
      await authRecord.save();
      
      console.log('✅ [OAuth Authorize] Authorization code generated for user:', user.email);
      
      // Return the redirect URL with authorization code
      const redirectUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
      
      return res.json({
        success: true,
        message: 'Authorization successful',
        authorization_code: authCode,
        redirect_url: redirectUrl,
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        }
      });
    }
    
    // OPTION 2: Return authorization form or instructions
    console.log('🔐 [OAuth Authorize] No direct credentials provided');
    
    return res.status(200).json({
      success: true,
      message: 'Authorization required',
      instructions: 'To complete authorization, make another request with email and password parameters',
      oauth_params: {
        response_type,
        client_id: client_id?.substring(0, 20) + '...',
        redirect_uri,
        scope,
        state
      },
      next_step: `Add email and password parameters to this request to get authorization code`,
      example: `${req.protocol}://${req.get('host')}${req.originalUrl}&email=user@example.com&password=userpassword`
    });
    
  } catch (error) {
    console.error('❌ [OAuth Authorize] Error:', error);
    res.status(500).json({ 
      error: 'server_error',
      error_description: 'Internal server error during authorization'
    });
  }
};

/**
 * OAuth2 Token Exchange Endpoint
 * FIXED: Updated to use correct environment variables
 */
const oauthToken = async (req, res) => {
  try {
    const { grant_type, client_id, client_secret, refresh_token, code } = req.body;
    
    console.log('🔐 [OAuth Token] Request:', {
      grant_type,
      client_id: client_id?.substring(0, 20) + '...',
      client_secret: client_secret ? 'provided' : 'not provided',
      code: code ? 'provided' : 'not provided',
      refresh_token: refresh_token ? 'provided' : 'not provided'
    });
    
    // FIXED: Use correct environment variable names and provide fallbacks
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    const expectedClientSecret = process.env.GOOGLE_ACTIONS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
    
    // Validate client credentials
    if (client_id !== expectedClientId) {
      console.error('❌ [OAuth Token] Invalid client_id');
      return res.status(400).json({ 
        error: 'invalid_client',
        error_description: 'Invalid client ID'
      });
    }
    
    if (client_secret !== expectedClientSecret) {
      console.error('❌ [OAuth Token] Invalid client_secret');
      return res.status(400).json({ 
        error: 'invalid_client',
        error_description: 'Invalid client secret'
      });
    }

    if (grant_type === 'authorization_code') {
      console.log('🔐 [OAuth Token] Exchanging authorization code for tokens');
      
      if (!code) {
        console.error('❌ [OAuth Token] Missing authorization code');
        return res.status(400).json({ 
          error: 'invalid_request',
          error_description: 'Authorization code is required'
        });
      }
      
      // Find and verify authorization code
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
        console.error('❌ [OAuth Token] User not found for authorization code');
        await AuthorizationCode.deleteOne({ code });
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'User associated with code not found'
        });
      }
      
      // Generate tokens (matching your existing JWT structure)
      const accessToken = jwt.sign(
        { 
          id: user._id, // Use 'id' to match your authMiddleware
          email: user.email,
          role: user.role,
          iss: 'smart-home-api',
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
          iss: 'smart-home-api',
          aud: client_id
        },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      // Delete used authorization code
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

    if (grant_type === 'refresh_token') {
      console.log('🔐 [OAuth Token] Refreshing access token');
      
      if (!refresh_token) {
        console.error('❌ [OAuth Token] Missing refresh token');
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
        console.error('❌ [OAuth Token] Token is not a refresh token');
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'Token is not a valid refresh token'
        });
      }
      
      const user = await User.findById(decoded.id);
      if (!user) {
        console.error('❌ [OAuth Token] User not found for refresh token');
        return res.status(400).json({ 
          error: 'invalid_grant',
          error_description: 'User not found'
        });
      }

      const newAccessToken = jwt.sign(
        { 
          id: user._id, // Use 'id' to match your authMiddleware
          email: user.email,
          role: user.role,
          iss: 'smart-home-api',
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

    console.error('❌ [OAuth Token] Unsupported grant type:', grant_type);
    res.status(400).json({ 
      error: 'unsupported_grant_type',
      error_description: `Grant type "${grant_type}" is not supported`
    });
    
  } catch (error) {
    console.error('❌ [OAuth Token] Error:', error);
    res.status(500).json({ 
      error: 'server_error',
      error_description: 'Internal server error during token exchange'
    });
  }
};

/**
 * Handle Account Linking after successful login
 * This can be used if you want to implement account linking via API
 */
const handleAccountLinking = async (req, res) => {
  try {
    const { redirect_uri, state, client_id } = req.body;
    const user = req.user; // User is already authenticated by protect middleware
    
    console.log('🔗 [Account Linking] User:', user.email);
    console.log('🔗 [Account Linking] Client ID:', client_id?.substring(0, 20) + '...');
    console.log('🔗 [Account Linking] Redirect URI:', redirect_uri);
    
    // FIXED: Validate the client_id with correct environment variable
    const expectedClientId = process.env.GOOGLE_ACTIONS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
    
    if (client_id !== expectedClientId) {
      console.error('❌ [Account Linking] Invalid client ID');
      return res.status(400).json({ 
        success: false,
        error: 'invalid_client',
        message: 'Invalid client ID' 
      });
    }

    // Generate authorization code
    const authCode = crypto.randomBytes(32).toString('hex');
    
    // Store the authorization code
    const authRecord = new AuthorizationCode({
      code: authCode,
      userId: user._id,
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: 'smart_home',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    });
    
    await authRecord.save();
    
    console.log('✅ [Account Linking] Authorization code generated');
    
    // Return the authorization code and redirect URL
    res.json({
      success: true,
      message: 'Account linked successfully',
      authCode: authCode,
      redirectUrl: `${redirect_uri}?code=${authCode}&state=${state}`,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
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