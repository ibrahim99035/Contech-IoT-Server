# Contech IoT Server — Technologies & Features

## 🛠️ Core Technologies (package.json)

| Category | Technologies |
|----------|------------|
| **Runtime** | Node.js `>=22.0.0` |
| **Web Framework** | Express.js `^4.21.2` |
| **Database** | MongoDB via Mongoose `^8.24.4` |
| **Caching/Queue** | Redis + BullMQ `^5.81.4` (via `ioredis` `^6.0.0`) |
| **IoT/MQTT** | Aedes MQTT broker `^1.1.1`, `mqtt` `^5.15.2` |
| **Real-time** | Socket.io `^4.8.3` |
| **Authentication** | JWT `^9.0.2`, bcryptjs `^3.0.2`, Google OAuth `^10.9.1` |
| **Cloud/Storage** | Cloudinary `^2.11.0`, Multer `^1.4.5-lts.1` |
| **Validation** | Joi `^17.13.3`, express-async-handler `^1.2.0` |
| **Security** | Helmet `^8.3.0`, CORS `^2.8.5`, Rate Limit `^7.5.1` |
| **Documentation** | Swagger-jsdoc `^6.3.0`, Swagger UI `^5.0.1`, AdminJS `^7.8.17` |
| **Logging** | Winston `^3.19.0` |
| **Time/Date** | Moment-timezone `^0.6.3` |
| **Email** | Nodemailer `^9.0.5` |
| **Dev Tools** | ESLint `^9.39.5`, Nodemon `^3.1.9` |

## 🌍 Environment: Local vs Production

| Aspect | Local Development | Production/Deployment |
|--------|-------------------|----------------------|
| **NODE_ENV** | `development` | `deployment` (via `.env`) |
| **Database** | MongoDB URI from `.env` (can point to local or remote) | Managed MongoDB at `88.222.220.235:27017` |
| **Cache/Queue** | Redis at `88.222.220.235:6380` | Same Redis instance, authenticated |
| **MQTT Broker** | Local or test broker | `mqtt://88.222.220.235:1884` with credentials |
| **Logging** | `debug` level (configurable) | Structured Winston logging |
| **Frontend URL** | `http://localhost:3000` (or local dev server) | `https://studenthousingmeals.onrender.com` |
| **AdminJS Dashboard** | Available at `/admin` | Same, behind production domain |
| **Security** | Helmet + CORS with `*` origins | Helmet + CORS with specific allowed origins |
| **Domain** | Localhost/IP for dev | Render.com deployment with custom domain |

## 📦 Key Features

### **Authentication & Authorization**
- Local register/login with JWT tokens
- Google OAuth 2.0 integration
- Password hashing with bcryptjs
- Session management with express-session
- Token expiration (configurable via `JWT_EXPIRES_IN`)

### **IoT & Device Management**
- MQTT integration for device communication
- Device registration and status tracking
- Topic-based messaging system
- Device namespace handling via WebSockets

### **Smart Home Automation**
- Apartment management (CRUD operations)
- Room management per apartment
- Task scheduling via BullMQ/Redis
- Google Assistant fulfillment handler

### **Subscription & Billing System**
- Subscription plans controller
- Feature gating/limits
- Coupon management
- Payment processing integration
- Subscription limit seeding script

### **Admin Dashboard**
- AdminJS-powered interface
- User, room, device, task, and subscription management
- Background image management
- Access control and monitoring

### **API & Documentation**
- RESTful API routes under `/api/` prefix
- Swagger/OpenAPI documentation at `/api-docs`
- Health check endpoint at `/health`
- Request ID tracing for distributed tracing

### **Security & Observability**
- Helmet middleware for HTTP headers
- CORS configuration with origin validation
- Rate limiting to prevent abuse
- Structured logging with Winston
- Graceful shutdown (SIGTERM/SIGINT handling)
- Uncaught exception/rejection handlers

### **Real-time Communication**
- Socket.io with configured ping/pong intervals
- Namespaces for user, room, MQTT, and device events
- Broadcast capabilities for device status updates

### **Email & Notifications**
- Nodemailer for transactional emails
- Email verification and activation flows
- Subscription limit notifications

## 📁 Project Structure Highlights

```
src/
├── config/          # DB, Redis, Cloudinary, Env, Swagger, AdminJS
├── controllers/     # Auth, user, subscription, payment, feature controllers
├── middleware/      # Auth, role, validation, error handling, logging
├── models/          # Mongoose schemas (User, Task, Subscription, Room, Device, etc.)
├── routes/          # API routes (auth, apartment, room, device, task, Google Assistant, subscription)
├── websockets/      # Namespaces, handlers, state management, event emitter
├── mqtt/            # Broker, clients, publishers, topic handlers
├── utils/           # Response helper, rate limiter, hash password, cache utils
└── scripts/         # Database seeding scripts
```

## 🚀 Deployment Notes

- The `.env` file at root contains production credentials (MongoDB, Redis, MQTT, Cloudinary, Google OAuth)
- `NODE_ENV=deployment` is set in production
- Frontend URL is configured for Render deployment (`studenthousingmeals.onrender.com`)
- Health check via `/health` endpoint for Docker/Kubernetes readiness probes
- Graceful shutdown supports Docker container signals