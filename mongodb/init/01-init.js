// Optional application user. Credentials are supplied via the environment so
// they are never committed to source. The API authenticates as the root user
// from MONGODB_URI, so this user is only created when the operator opts in by
// setting MONGO_APP_USERNAME / MONGO_APP_PASSWORD.
const appUser = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (appUser && appPassword) {
  db = db.getSiblingDB('contech');
  db.createUser({
    user: appUser,
    pwd: appPassword,
    roles: [
      { role: 'readWrite', db: 'contech' },
      { role: 'dbAdmin', db: 'contech' }
    ]
  });
  print('Application user created.');
} else {
  print('MONGO_APP_USERNAME/MONGO_APP_PASSWORD not set - skipping application user creation.');
}
