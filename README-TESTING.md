# Contech IoT - Local Testing with Production Services

## Status: ✅ Server Running

The local Node.js server is connected to production services:
- **MongoDB**: Connected to replica set at 88.222.220.235:27017
- **Redis**: Connected at 88.222.220.235:6380
- **MQTT**: Connected at 88.222.220.235:1884

## Admin Account

```
Email:    admin@contech.local
Password: Admin@123456
Role:     admin
```

This is a pre-seeded admin account with full access to AdminJS dashboard and admin APIs.

## Server Access

- **API Base**: http://localhost:5000
- **Health Check**: http://localhost:5000/health
- **API Docs (Swagger)**: http://localhost:5000/api-docs
- **AdminJS Dashboard**: http://localhost:5000/admin

## Quick Start

```bash
# Start server (if not already running)
cd "/media/ibrahim/New Volume/Projects/Contech-IoT-Server"
node server.js

# Health check
curl http://localhost:5000/health

# Login as admin
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@contech.local","password":"Admin@123456"}'
```

## Manual Testing with Bruno/Yaak

Import the Bruno collection from the `bruno-collection/` directory:

```bash
# Location
cd "/media/ibrahim/New Volume/Projects/Contech-IoT-Server/bruno-collection"

# Open in Bruno
bruno .
```

The collection includes:
- **Auth**: Register, Login, Verify Token, Update Password
- **Apartments**: Create, Update, Get Members, Delete
- **Rooms**: Create, Update, Add Users, Delete
- **Devices**: Create, Update, Assign Users, Delete
- **Tasks**: Create, Update, Delete
- **Subscription**: Plans, Features, Subscribe, Payments
- **Admin**: Dashboard analytics endpoints
- **Health**: Health check

## Automated Idempotent Testing

```bash
cd "/media/ibrahim/New Volume/Projects/Contech-IoT-Server"

# Run tests (creates unique test data)
node test-idempotent.js

# View results
# Tests create data with timestamps for idempotency

# Clean up test data
node test-idempotent.js --cleanup
```

The test script:
- Creates unique test users per run (timestamped emails)
- Tests all major API endpoints
- Cleans up after itself
- Can be run multiple times safely

## Test Results

Latest run: 7/9 tests passed (77.8%)

Passing:
- ✅ Health Check
- ✅ Admin Registration/Login
- ✅ User Registration/Login
- ✅ Verify Token
- ✅ Create Apartment
- ✅ Get Apartment Members
- ✅ Get Subscription Plans

## File Structure

```
bruno-collection/          # Bruno API client collection
  bruno.json               # Collection metadata
  environments/Local.bru    # Environment variables
  Auth/                    # Authentication endpoints
  Apartments/              # Apartment management
  Rooms/                   # Room management
  Devices/                 # Device management
  Tasks/                   # Task management
  Subscription/            # Subscription system
  Admin/                   # Admin dashboard
  Health/                  # Health check

test-idempotent.js         # Automated test script
README-TESTING.md          # This file
```

## Notes

- The server connects directly to production MongoDB (not through SSH tunnel)
- Test data uses timestamped identifiers for safe repeated runs
- AdminJS dashboard requires admin role (use admin@contech.local)
- The subscription system has pre-seeded plans (free, gold, platinum)
