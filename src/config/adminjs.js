/**
 * AdminJS Dashboard Configuration
 * Contech IoT Smart Home Automation Server
 */

'use strict';

const AdminJS = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const AdminJSMongoose = require('@adminjs/mongoose');
const bcrypt = require('bcryptjs');

// Register Mongoose Adapter
AdminJS.registerAdapter(AdminJSMongoose);

// Load Mongoose Models
const User = require('../models/User');
const Apartment = require('../models/Apartment');
const Room = require('../models/Room');
const Device = require('../models/Device');
const Task = require('../models/Task');
const SubscriptionLimits = require('../models/SubscriptionLimits');
const AccessToken = require('../models/AccessToken');
const AuthorizationCode = require('../models/AuthorizationCode');
const Image = require('../models/Image');

/**
 * Initialize AdminJS Dashboard Router
 */
async function setupAdminJS() {
  const adminJs = new AdminJS({
    rootPath: '/admin',
    branding: {
      companyName: 'Contech IoT Admin',
      logo: false,
      withMadeWithLove: false,
      theme: {
        colors: {
          primary100: '#6366f1',
          primary80: '#4f46e5',
          primary60: '#4338ca',
          primary40: '#3730a3',
          primary20: '#312e81',
          accent: '#06b6d4',
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#f8fafc',
          grey100: '#f1f5f9',
          grey80: '#cbd5e1',
          grey60: '#94a3b8',
          grey40: '#64748b'
        }
      }
    },
    resources: [
      {
        resource: User,
        options: {
          navigation: { name: 'User & Access', icon: 'User' },
          properties: {
            password: { isVisible: { list: false, edit: true, filter: false, show: false } }
          }
        }
      },
      {
        resource: Apartment,
        options: {
          navigation: { name: 'Smart Home', icon: 'Home' }
        }
      },
      {
        resource: Room,
        options: {
          navigation: { name: 'Smart Home', icon: 'Grid' }
        }
      },
      {
        resource: Device,
        options: {
          navigation: { name: 'Smart Home', icon: 'Cpu' },
          listProperties: ['_id', 'name', 'type', 'status', 'isOnline', 'order', 'room']
        }
      },
      {
        resource: Task,
        options: {
          navigation: { name: 'Smart Home', icon: 'Clock' },
          listProperties: ['_id', 'name', 'status', 'nextExecution', 'timezone', 'device', 'creator']
        }
      },
      {
        resource: SubscriptionLimits,
        options: {
          navigation: { name: 'System Management', icon: 'Layers' }
        }
      },
      {
        resource: AccessToken,
        options: {
          navigation: { name: 'User & Access', icon: 'Key' }
        }
      },
      {
        resource: AuthorizationCode,
        options: {
          navigation: { name: 'User & Access', icon: 'Shield' }
        }
      },
      {
        resource: Image,
        options: {
          navigation: { name: 'System Management', icon: 'Image' }
        }
      }
    ]
  });

  // AdminJS router with Authentication
  const router = AdminJSExpress.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate: async (email, password) => {
        try {
          const user = await User.findOne({ email: email.toLowerCase() });
          if (!user || !user.active) return null;

          // Admin role check
          if (user.role !== 'admin') return null;

          const isMatch = await bcrypt.compare(password, user.password);
          if (isMatch) {
            return { email: user.email, role: user.role, name: user.name };
          }
          return null;
        } catch (error) {
          return null;
        }
      },
      cookiePassword: process.env.JWT_SECRET || 'contech-adminjs-secret-session-key-32chars',
      cookieName: 'adminjs_session'
    },
    null,
    {
      resave: false,
      saveUninitialized: true,
      secret: process.env.JWT_SECRET || 'contech-adminjs-secret-session-key-32chars'
    }
  );

  return { adminJs, router };
}

module.exports = setupAdminJS;
