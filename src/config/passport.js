/**
 * FIXED: Passport.js configuration for Google OAuth
 * Updated to use correct GoogleTokenStrategy syntax and configuration
 */

const passport = require('passport');
const GoogleTokenStrategy = require('passport-google-id-token'); 
const User = require('../models/User');
const { SubscriptionPlan, Subscription } = require('../models/subscriptionSystemModels');

console.log(`🚀 [Passport] Initializing Google OAuth configuration`);
console.log(`🚀 [Passport] Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET'}`);

// FIXED: Configure Google ID Token Strategy with correct syntax
passport.use(
  new GoogleTokenStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID, // FIXED: Use 'clientID' not 'clientId'
    },
    async (parsedToken, googleId, done) => {
      const startTime = Date.now();
      console.log(`🔑 [Google Strategy] ID Token authentication callback triggered`);
      console.log(`🔑 [Google Strategy] Google ID: ${googleId}`);
      console.log(`🔑 [Google Strategy] Parsed token structure:`, {
        // FIXED: Access token payload correctly
        email: parsedToken.email,
        name: parsedToken.name,
        email_verified: parsedToken.email_verified,
        aud: parsedToken.aud,
        iss: parsedToken.iss
      });
      
      try {
        // FIXED: Extract profile information from parsed token (no .payload needed)
        const { email, name, email_verified } = parsedToken;
        
        console.log(`👤 [Google Profile] ID: ${googleId}`);
        console.log(`👤 [Google Profile] Name: ${name}`);
        console.log(`👤 [Google Profile] Email: ${email}`);
        console.log(`👤 [Google Profile] Email Verified: ${email_verified}`);
        
        // Check if user exists with this email
        console.log(`🔍 [Database] Searching for user with email: ${email}`);
        
        let user = await User.findOne({ email: email });
        
        if (user) {
          console.log(`✅ [Database] Existing user found: ${user._id}`);
          console.log(`✅ [Database] User has Google ID: ${!!user.googleId}`);
          
          // If user exists but doesn't have googleId, add it
          if (!user.googleId) {
            console.log(`🔄 [Database] Adding Google ID to existing user`);
            user.googleId = googleId;
            await user.save();
            console.log(`✅ [Database] Google ID added successfully`);
          } else {
            console.log(`ℹ️ [Database] User already has Google ID linked`);
          }
          
          const duration = Date.now() - startTime;
          console.log(`🎉 [Google Strategy] Authentication successful for existing user (${duration}ms)`);
          return done(null, user);
        }
        
        // Create new user if not exists
        console.log(`🆕 [Database] Creating new user for Google authentication`);
        const randomPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
        
        const newUser = new User({
          name: name,
          email: email,
          password: randomPassword,
          role: 'customer',
          active: true,
          emailActivated: email_verified || true, // Google emails are generally verified
          googleId: googleId,
        });
        
        console.log(`💾 [Database] Saving new user...`);
        await newUser.save();
        console.log(`✅ [Database] New user created: ${newUser._id}`);
        
        // Find or create the "free" subscription plan
        console.log(`🔍 [Subscription] Looking for free subscription plan`);
        let subscriptionPlan = await SubscriptionPlan.findOne({ name: 'free' });
        
        if (!subscriptionPlan) {
          console.log(`🆕 [Subscription] Creating free subscription plan`);
          subscriptionPlan = new SubscriptionPlan({
            name: 'free',
            price: 0,
            billingCycle: 'monthly',
            features: ['Basic support'],
          });
          await subscriptionPlan.save();
          console.log(`✅ [Subscription] Free plan created: ${subscriptionPlan._id}`);
        } else {
          console.log(`✅ [Subscription] Free plan found: ${subscriptionPlan._id}`);
        }

        // Create subscription for the user
        console.log(`💾 [Subscription] Creating subscription for new user`);
        const subscription = new Subscription({
          user: newUser._id,
          subscriptionPlan: subscriptionPlan._id,
          status: 'active',
          startDate: new Date(),
        });

        await subscription.save();
        console.log(`✅ [Subscription] Subscription created: ${subscription._id}`);
        
        const duration = Date.now() - startTime;
        console.log(`🎉 [Google Strategy] New user authentication completed (${duration}ms)`);
        return done(null, newUser);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`❌ [Google Strategy] Authentication failed (${duration}ms):`, error);
        console.error(`❌ [Google Strategy] Error stack:`, error.stack);
        return done(error, null);
      }
    }
  )
);

console.log(`✅ [Passport] Google ID Token strategy configured successfully`);

module.exports = passport;