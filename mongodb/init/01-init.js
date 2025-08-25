db = db.getSiblingDB('contech');

db.createUser({
  user: 'contech_user',
  pwd: 'ConTech_App_2024!Pass',
  roles: [
    {
      role: 'readWrite',
      db: 'contech'
    },
    {
      role: 'dbAdmin',
      db: 'contech'
    }
  ]
});

print('✅ Database initialization completed successfully!');