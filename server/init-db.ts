import { pool, closePool } from './db';
import { setupMasterSchema, setupTenantSchema } from './schema-utils';
import config from './config';

/**
 * Initialize the database by creating the necessary schemas and tables
 */
async function initializeDatabase() {
  console.log('Starting database initialization...');
  
  try {
    // Create master schema and tables
    console.log('Setting up master schema...');
    await setupMasterSchema(pool);
    
    // Create a test tenant schema for development if needed
    if (config.environment === 'development') {
      console.log('Creating test tenant schema for development...');
      await setupTenantSchema(pool, 1); // Business ID 1 for testing
    }
    
    console.log('Database initialization completed successfully!');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

// Run the initialization if this script is executed directly
if (require.main === module) {
  initializeDatabase().catch(console.error);
}

export default initializeDatabase;