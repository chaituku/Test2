import { Pool, PoolClient } from 'pg';
import config from './config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '@shared/schema';

// Create a connection pool using config
const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  ssl: config.database.ssl,
  max: config.database.max_connections,
  idleTimeoutMillis: config.database.idle_timeout,
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected at:', res.rows[0].now);
  }
});

// Handle pool errors
pool.on('error', (err: Error) => {
  console.error('Unexpected database error:', err);
});

// Create a drizzle instance
export const db = drizzle(pool, { schema });

// Function to run migrations
export const runMigrations = async () => {
  try {
    console.log('Running database migrations...');
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('Migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Function to get a client from the pool
export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  return client;
};

// Function to release a client back to the pool
export const releaseClient = (client: PoolClient): void => {
  client.release();
};

// Function to execute a query with a transaction
export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    releaseClient(client);
  }
};

// Function to end the pool connection (for graceful shutdown)
export const closePool = async (): Promise<void> => {
  await pool.end();
  console.log('Database connection pool closed');
};

// Export pool for direct access if needed
export { pool };