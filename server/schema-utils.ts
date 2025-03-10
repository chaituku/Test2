import { Pool } from 'pg';
import config from './config';
import { roleEnum, eventTypeEnum } from '@shared/schema';

/**
 * Schema utility functions for multi-tenant database operations
 */

// Create a schema if it doesn't exist
export async function createSchemaIfNotExists(pool: Pool, schemaName: string): Promise<void> {
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    console.log(`Schema '${schemaName}' created or already exists`);
  } catch (error) {
    console.error(`Error creating schema '${schemaName}':`, error);
    throw error;
  }
}

// Create the master schema
export async function setupMasterSchema(pool: Pool): Promise<void> {
  const masterSchema = config.database.master_schema;
  
  try {
    // Create master schema
    await createSchemaIfNotExists(pool, masterSchema);
    
    // Create enums in public schema (need to be in public for all schemas to access)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${roleEnum.enumName}') THEN
          CREATE TYPE ${roleEnum.enumName} AS ENUM ('user', 'business', 'organizer');
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${eventTypeEnum.enumName}') THEN
          CREATE TYPE ${eventTypeEnum.enumName} AS ENUM ('tournament', 'social', 'training');
        END IF;
      END$$;
    `);
    
    // Create master tables
    await pool.query(`
      SET search_path TO ${masterSchema};
      
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(200) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        role ${roleEnum.enumName} NOT NULL DEFAULT 'user',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Events table
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        event_type ${eventTypeEnum.enumName} NOT NULL,
        organizer_id INTEGER NOT NULL REFERENCES users(id),
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        location VARCHAR(200) NOT NULL,
        max_participants INTEGER,
        current_participants INTEGER DEFAULT 0,
        price DECIMAL(10,2),
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Event participants table
      CREATE TABLE IF NOT EXISTS event_participants (
        id SERIAL PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES events(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        status VARCHAR(20) DEFAULT 'registered',
        payment_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(event_id, user_id)
      );
      
      -- Payments table
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        event_id INTEGER REFERENCES events(id),
        amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        transaction_id VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Chat groups table
      CREATE TABLE IF NOT EXISTS chat_groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        event_id INTEGER REFERENCES events(id),
        business_id INTEGER,
        is_direct BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Chat group members table
      CREATE TABLE IF NOT EXISTS chat_group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES chat_groups(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(group_id, user_id)
      );
      
      -- Chat messages table
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES chat_groups(id),
        sender_id INTEGER NOT NULL REFERENCES users(id),
        message TEXT NOT NULL,
        sent_at TIMESTAMP NOT NULL DEFAULT NOW(),
        read_at TIMESTAMP,
        message_type VARCHAR(20) DEFAULT 'text'
      );
    `);
    
    console.log(`Master schema '${masterSchema}' setup completed successfully`);
  } catch (error) {
    console.error(`Error setting up master schema:`, error);
    throw error;
  }
}

// Create a tenant schema for a business
export async function setupTenantSchema(pool: Pool, businessId: number): Promise<string> {
  const tenantSchemaPrefix = config.database.tenant_schema_prefix;
  const tenantSchema = `${tenantSchemaPrefix}${businessId}`;
  
  try {
    // Create tenant schema
    await createSchemaIfNotExists(pool, tenantSchema);
    
    // Create tenant tables
    await pool.query(`
      SET search_path TO ${tenantSchema};
      
      -- Businesses table
      CREATE TABLE IF NOT EXISTS businesses (
        id SERIAL PRIMARY KEY,
        master_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        owner_id INTEGER NOT NULL,
        address VARCHAR(200) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        email VARCHAR(100) NOT NULL,
        website VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Courts table
      CREATE TABLE IF NOT EXISTS courts (
        id SERIAL PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price_per_hour DECIMAL(10,2) NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      
      -- Bookings table
      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        court_id INTEGER NOT NULL REFERENCES courts(id),
        user_id INTEGER NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'confirmed',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    console.log(`Tenant schema '${tenantSchema}' for business ${businessId} setup completed successfully`);
    return tenantSchema;
  } catch (error) {
    console.error(`Error setting up tenant schema for business ${businessId}:`, error);
    throw error;
  }
}

// List all tenant schemas
export async function listTenantSchemas(pool: Pool): Promise<string[]> {
  const tenantSchemaPrefix = config.database.tenant_schema_prefix;
  
  try {
    const result = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name LIKE '${tenantSchemaPrefix}%'
    `);
    
    return result.rows.map(row => row.schema_name);
  } catch (error) {
    console.error('Error listing tenant schemas:', error);
    throw error;
  }
}

// Get a tenant schema name by business ID
export function getTenantSchemaName(businessId: number): string {
  return `${config.database.tenant_schema_prefix}${businessId}`;
}

// Get the master schema name
export function getMasterSchemaName(): string {
  return config.database.master_schema;
}

// Set search path to specific schema
export async function setSearchPath(pool: Pool, schemaName: string): Promise<void> {
  try {
    await pool.query(`SET search_path TO ${schemaName}`);
  } catch (error) {
    console.error(`Error setting search path to ${schemaName}:`, error);
    throw error;
  }
}

// Reset search path to public
export async function resetSearchPath(pool: Pool): Promise<void> {
  try {
    await pool.query(`SET search_path TO public`);
  } catch (error) {
    console.error('Error resetting search path:', error);
    throw error;
  }
}