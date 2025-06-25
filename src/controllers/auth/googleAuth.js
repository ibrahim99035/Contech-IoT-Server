/**
 * MODERN APPROACH: Google Authentication without deprecated packages
 * Using Google's official auth library for token verification
 * 
 * Install: npm install google-auth-library
 */

const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const { SubscriptionPlan, Subscription } = require('../../models/subscriptionSystemModels');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * Modern Google Login Handler
 * Verifies Google ID token directly without Passport
 */
const modernGoogleLogin = async (req, res) => {
  try {
    const { id_token } = req.body;
    
    console.log(`🔐 [Modern Google] Starting authentication process`);
    console.log(`🔐 [Modern Google] ID token length: ${id_token?.length || 'undefined'}`);
    
    if (!id_token) {
      console.log(`❌ [Modern Google] No ID token provided`);
      return res.status(400).json({
        success: false,
        message: 'ID token is required'
      });
    }

    // Verify the ID token with Google
    console.log(`🔍 [Modern Google] Verifying ID token with Google...`);
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (verifyError) {
      console.error(`❌ [Modern Google] Token verification failed:`, verifyError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid Google ID token',
        error: process.env.NODE_ENV === 'development' ? verifyError.message : undefined
      });
    }

    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    const name = payload['name'];
    const emailVerified = payload['email_verified'];

    console.log(`✅ [Modern Google] Token verified successfully`);
    console.log(`👤 [Modern Google] Google ID: ${googleId}`);
    console.log(`👤 [Modern Google] Email: ${email}`);
    console.log(`👤 [Modern Google] Name: ${name}`);
    console.log(`👤 [Modern Google] Email Verified: ${emailVerified}`);

    // Check if user exists with this email
    console.log(`🔍 [Database] Searching for user with email: ${email}`);
    let user = await User.findOne({ email: email });
    
    if (user) {
      console.log(`✅ [Database] Existing user found: ${user._id}`);
      
      // If user exists but doesn't have googleId, add it
      if (!user.googleId) {
        console.log(`🔄 [Database] Adding Google ID to existing user`);
        user.googleId = googleId;
        await user.save();
        console.log(`✅ [Database] Google ID added successfully`);
      }
    } else {
      // Create new user
      console.log(`🆕 [Database] Creating new user for Google authentication`);
      const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
      
      user = new User({
        name: name,
        email: email,
        password: randomPassword,
        role: 'customer',
        active: true,
        emailActivated: emailVerified || true,
        googleId: googleId,
      });
      
      await user.save();
      console.log(`✅ [Database] New user created: ${user._id}`);
      
      // Create free subscription for new user
      console.log(`🔍 [Subscription] Setting up free subscription`);
      let subscriptionPlan = await SubscriptionPlan.findOne({ name: 'free' });
      
      if (!subscriptionPlan) {
        subscriptionPlan = new SubscriptionPlan({
          name: 'free',
          price: 0,
          billingCycle: 'monthly',
          features: ['Basic support'],
        });
        await subscriptionPlan.save();
      }

      const subscription = new Subscription({
        user: user._id,
        subscriptionPlan: subscriptionPlan._id,
        status: 'active',
        startDate: new Date(),
      });

      await subscription.save();
      console.log(`✅ [Subscription] Free subscription created`);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    console.log(`🎉 [Modern Google] Authentication successful`);

    // Send successful response
    res.status(200).json({
      success: true,
      message: 'Google authentication successful',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        emailActivated: user.emailActivated,
        googleId: user.googleId,
        hasGoogleAuth: true
      }
    });

  } catch (error) {
    console.error(`❌ [Modern Google] Authentication error:`, error);
    
    res.status(500).json({
      success: false,
      message: 'Google authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check Google Link Status
 */
const checkGoogleLink = async (req, res) => {
  try {
    const user = req.user;
    
    console.log(`🔍 [Google Status] Checking Google link status for user: ${user.email}`);
    
    const hasGoogleId = !!user.googleId;
    
    res.status(200).json({
      success: true,
      message: 'Google authentication status retrieved',
      data: {
        hasGoogleAuth: hasGoogleId,
        googleId: hasGoogleId ? 'linked' : 'not linked',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      }
    });

  } catch (error) {
    console.error(`❌ [Google Status] Error:`, error);
    
    res.status(500).json({
      success: false,
      message: 'Error checking Google authentication status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Unlink Google Account
 */
const unlinkGoogle = async (req, res) => {
  try {
    const user = req.user;
    
    console.log(`🔗 [Google Unlink] Unlinking Google account for user: ${user.email}`);
    
    if (!user.googleId) {
      return res.status(400).json({
        success: false,
        message: 'Google account is not linked to this user'
      });
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $unset: { googleId: 1 } },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`✅ [Google Unlink] Google account successfully unlinked`);
    
    res.status(200).json({
      success: true,
      message: 'Google account unlinked successfully',
      data: {
        hasGoogleAuth: false,
        user: {
          id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role
        }
      }
    });

  } catch (error) {
    console.error(`❌ [Google Unlink] Error:`, error);
    
    res.status(500).json({
      success: false,
      message: 'Error unlinking Google account',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  modernGoogleLogin,
  checkGoogleLink,
  unlinkGoogle
};