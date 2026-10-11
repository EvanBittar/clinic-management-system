// Runs before every test file, BEFORE any app code is loaded.
//
// dotenv (used in config/db.js) never overrides a variable that is already set,
// so setting DB_NAME here forces every test run onto the TEST database,
// no matter what your .env file says.
process.env.DB_NAME = 'clinic_system_test';
process.env.NODE_ENV = 'test';
