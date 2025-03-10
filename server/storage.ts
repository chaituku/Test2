import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { Store as SessionStore } from "express-session";
import { 
  User, InsertUser, Business, InsertBusiness, Court, InsertCourt, 
  Booking, InsertBooking, Event, InsertEvent, EventParticipant, 
  InsertEventParticipant, Payment, InsertPayment, ChatGroup, 
  InsertChatGroup, ChatGroupMember, ChatMessage, InsertChatMessage 
} from "@shared/schema";
import { pool, getClient, releaseClient, withTransaction } from "./db";
import config from "./config";
import { 
  getMasterSchemaName, 
  getTenantSchemaName, 
  setSearchPath, 
  resetSearchPath 
} from "./schema-utils";

const MemoryStore = createMemoryStore(session);
const PostgresSessionStore = connectPg(session);

// In-memory storage interface
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Business methods
  getBusiness(id: number): Promise<Business | undefined>;
  getBusinessesByOwner(ownerId: number): Promise<Business[]>;
  createBusiness(business: InsertBusiness): Promise<Business>;
  
  // Court methods
  getCourt(id: number, businessId: number): Promise<Court | undefined>;
  getCourtsByBusiness(businessId: number): Promise<Court[]>;
  createCourt(court: InsertCourt, businessId: number): Promise<Court>;
  updateCourtAvailability(id: number, businessId: number, isAvailable: boolean): Promise<Court | undefined>;
  
  // Booking methods
  getBooking(id: number, businessId: number): Promise<Booking | undefined>;
  getBookingsByUser(userId: number): Promise<Booking[]>;
  getBookingsByCourt(courtId: number, businessId: number): Promise<Booking[]>;
  getBookingsByTimeRange(courtId: number, businessId: number, startTime: Date, endTime: Date): Promise<Booking[]>;
  createBooking(booking: InsertBooking, businessId: number): Promise<Booking>;
  
  // Event methods
  getEvent(id: number): Promise<Event | undefined>;
  getEventsByOrganizer(organizerId: number): Promise<Event[]>;
  getEventsByType(eventType: string): Promise<Event[]>;
  getUpcomingEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEventStatus(id: number, status: string): Promise<Event | undefined>;
  updateEventParticipantCount(id: number, count: number): Promise<Event | undefined>;
  
  // Event Participants methods
  getEventParticipant(id: number): Promise<EventParticipant | undefined>;
  getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]>;
  getEventParticipantsByUser(userId: number): Promise<EventParticipant[]>;
  createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant>;
  updateEventParticipantStatus(id: number, status: string, paymentStatus: string): Promise<EventParticipant | undefined>;
  
  // Payment methods
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentsByUser(userId: number): Promise<Payment[]>;
  getPaymentsByEvent(eventId: number): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePaymentStatus(id: number, status: string): Promise<Payment | undefined>;
  
  // Chat methods
  getChatGroup(id: number): Promise<ChatGroup | undefined>;
  getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]>;
  getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]>;
  getChatGroupsByUser(userId: number): Promise<ChatGroup[]>;
  createChatGroup(group: InsertChatGroup): Promise<ChatGroup>;
  addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember>;
  
  // Chat Message methods
  getChatMessages(groupId: number): Promise<ChatMessage[]>;
  getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  markMessagesAsRead(userId: number, groupId?: number): Promise<void>;
  
  // Session store
  sessionStore: SessionStore;
}

// DatabaseStorage implementation for PostgreSQL with multi-tenant support
export class DatabaseStorage implements IStorage {
  sessionStore: SessionStore;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      tableName: 'session', // Name of table to create/use in PostgreSQL
      createTableIfMissing: true,
    });
  }
  
  // Helper method to execute queries in the master schema
  private async executeInMasterSchema<T>(callback: () => Promise<T>): Promise<T> {
    const client = await getClient();
    try {
      await setSearchPath(client, getMasterSchemaName());
      const result = await callback();
      return result;
    } finally {
      await resetSearchPath(client);
      releaseClient(client);
    }
  }
  
  // Helper method to execute queries in a tenant schema
  private async executeInTenantSchema<T>(businessId: number, callback: () => Promise<T>): Promise<T> {
    const client = await getClient();
    try {
      await setSearchPath(client, getTenantSchemaName(businessId));
      const result = await callback();
      return result;
    } finally {
      await resetSearchPath(client);
      releaseClient(client);
    }
  }
  
  // User methods (in master schema)
  async getUser(id: number): Promise<User | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching user by ID:', error);
        return undefined;
      }
    });
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching user by username:', error);
        return undefined;
      }
    });
  }
  
  async createUser(user: InsertUser): Promise<User> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'INSERT INTO users (username, password, email, full_name, phone, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [user.username, user.password, user.email, user.fullName, user.phone, user.role || 'user']
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating user:', error);
        throw error;
      }
    });
  }
  
  // Business methods (in tenant schema)
  async getBusiness(id: number): Promise<Business | undefined> {
    // First need to find which schema this business belongs to
    try {
      const tenantSchema = getTenantSchemaName(id);
      return this.executeInTenantSchema(id, async () => {
        const result = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      });
    } catch (error) {
      console.error('Error fetching business by ID:', error);
      return undefined;
    }
  }
  
  async getBusinessesByOwner(ownerId: number): Promise<Business[]> {
    // This requires checking across all tenant schemas
    // For now, we'll search by owner_id in the master table that would track businesses
    return this.executeInMasterSchema(async () => {
      try {
        // Query to find all businesses owned by this user
        // In a real implementation, you'd have a master table tracking all businesses and their schemas
        const result = await pool.query(
          'SELECT * FROM businesses WHERE owner_id = $1',
          [ownerId]
        );
        return result.rows;
      } catch (error) {
        console.error('Error fetching businesses by owner:', error);
        return [];
      }
    });
  }
  
  async createBusiness(business: InsertBusiness): Promise<Business> {
    // Creating a business requires:
    // 1. Creating a new tenant schema
    // 2. Inserting the business record in that schema
    // 3. Tracking the business in the master schema
    
    return withTransaction(async (client) => {
      try {
        // First, add an entry to the master schema to track this business
        await setSearchPath(client, getMasterSchemaName());
        
        // Insert into a master table that tracks businesses and their schemas
        const masterResult = await client.query(
          'INSERT INTO businesses (name, owner_id, schema_name) VALUES ($1, $2, $3) RETURNING id',
          [business.name, business.ownerId, getTenantSchemaName(business.id)]
        );
        
        const businessId = masterResult.rows[0].id;
        
        // Set up the tenant schema
        await setSearchPath(client, getTenantSchemaName(businessId));
        
        // Insert the business details into the tenant schema
        const tenantResult = await client.query(
          `INSERT INTO businesses (
            master_id, name, description, owner_id, address, phone, email, website, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING *`,
          [
            businessId,
            business.name,
            business.description,
            business.ownerId,
            business.address,
            business.phone,
            business.email,
            business.website
          ]
        );
        
        return tenantResult.rows[0];
      } catch (error) {
        console.error('Error creating business:', error);
        throw error;
      }
    });
  }
  
  // Court methods (in tenant schema)
  async getCourt(id: number, businessId: number): Promise<Court | undefined> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query('SELECT * FROM courts WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching court by ID:', error);
        return undefined;
      }
    });
  }
  
  async getCourtsByBusiness(businessId: number): Promise<Court[]> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query('SELECT * FROM courts WHERE business_id = $1', [businessId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching courts by business:', error);
        return [];
      }
    });
  }
  
  async createCourt(court: InsertCourt, businessId: number): Promise<Court> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query(
          `INSERT INTO courts (business_id, name, description, price_per_hour, is_available) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [court.businessId, court.name, court.description, court.pricePerHour, court.isAvailable ?? true]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating court:', error);
        throw error;
      }
    });
  }
  
  async updateCourtAvailability(id: number, businessId: number, isAvailable: boolean): Promise<Court | undefined> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query(
          'UPDATE courts SET is_available = $1 WHERE id = $2 RETURNING *',
          [isAvailable, id]
        );
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error updating court availability:', error);
        return undefined;
      }
    });
  }
  
  // Booking methods (in tenant schema)
  async getBooking(id: number, businessId: number): Promise<Booking | undefined> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching booking by ID:', error);
        return undefined;
      }
    });
  }
  
  async getBookingsByUser(userId: number): Promise<Booking[]> {
    // This requires querying across all tenant schemas to find all bookings
    // In practice, you'd have a master table tracking which schemas to query for a user
    // For simplicity, this implementation is limited
    
    // Get all businesses and their schemas
    const businesses = await this.getBusinessesByOwner(userId);
    let allBookings: Booking[] = [];
    
    // Query each business schema for bookings
    for (const business of businesses) {
      const businessBookings = await this.executeInTenantSchema(business.id, async () => {
        const result = await pool.query('SELECT * FROM bookings WHERE user_id = $1', [userId]);
        return result.rows;
      });
      
      allBookings = [...allBookings, ...businessBookings];
    }
    
    return allBookings;
  }
  
  async getBookingsByCourt(courtId: number, businessId: number): Promise<Booking[]> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query('SELECT * FROM bookings WHERE court_id = $1', [courtId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching bookings by court:', error);
        return [];
      }
    });
  }
  
  async getBookingsByTimeRange(courtId: number, businessId: number, startTime: Date, endTime: Date): Promise<Booking[]> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query(
          `SELECT * FROM bookings 
           WHERE court_id = $1 
           AND ((start_time >= $2 AND start_time < $3) OR (end_time > $2 AND end_time <= $3))`,
          [courtId, startTime, endTime]
        );
        return result.rows;
      } catch (error) {
        console.error('Error fetching bookings by time range:', error);
        return [];
      }
    });
  }
  
  async createBooking(booking: InsertBooking, businessId: number): Promise<Booking> {
    return this.executeInTenantSchema(businessId, async () => {
      try {
        const result = await pool.query(
          `INSERT INTO bookings (court_id, user_id, start_time, end_time, status) 
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [booking.courtId, booking.userId, booking.startTime, booking.endTime, booking.status || 'confirmed']
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating booking:', error);
        throw error;
      }
    });
  }
  
  // Event methods (in master schema)
  async getEvent(id: number): Promise<Event | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching event by ID:', error);
        return undefined;
      }
    });
  }
  
  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM events WHERE organizer_id = $1', [organizerId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching events by organizer:', error);
        return [];
      }
    });
  }
  
  async getEventsByType(eventType: string): Promise<Event[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM events WHERE event_type = $1', [eventType]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching events by type:', error);
        return [];
      }
    });
  }
  
  async getUpcomingEvents(): Promise<Event[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const now = new Date();
        const result = await pool.query('SELECT * FROM events WHERE start_time > $1', [now]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching upcoming events:', error);
        return [];
      }
    });
  }
  
  async createEvent(event: InsertEvent): Promise<Event> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          `INSERT INTO events (
            name, description, event_type, organizer_id, start_time, end_time, 
            location, max_participants, current_participants, price, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [
            event.name,
            event.description,
            event.eventType,
            event.organizerId,
            event.startTime,
            event.endTime,
            event.location,
            event.maxParticipants,
            event.currentParticipants || 0,
            event.price,
            event.status || 'open'
          ]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating event:', error);
        throw error;
      }
    });
  }
  
  async updateEventStatus(id: number, status: string): Promise<Event | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'UPDATE events SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error updating event status:', error);
        return undefined;
      }
    });
  }
  
  async updateEventParticipantCount(id: number, count: number): Promise<Event | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'UPDATE events SET current_participants = $1 WHERE id = $2 RETURNING *',
          [count, id]
        );
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error updating event participant count:', error);
        return undefined;
      }
    });
  }
  
  // Event Participants methods (in master schema)
  async getEventParticipant(id: number): Promise<EventParticipant | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM event_participants WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching event participant by ID:', error);
        return undefined;
      }
    });
  }
  
  async getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM event_participants WHERE event_id = $1', [eventId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching event participants by event:', error);
        return [];
      }
    });
  }
  
  async getEventParticipantsByUser(userId: number): Promise<EventParticipant[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM event_participants WHERE user_id = $1', [userId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching event participants by user:', error);
        return [];
      }
    });
  }
  
  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'INSERT INTO event_participants (event_id, user_id, status, payment_status) VALUES ($1, $2, $3, $4) RETURNING *',
          [participant.eventId, participant.userId, participant.status || 'registered', participant.paymentStatus || 'pending']
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating event participant:', error);
        throw error;
      }
    });
  }
  
  async updateEventParticipantStatus(id: number, status: string, paymentStatus: string): Promise<EventParticipant | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'UPDATE event_participants SET status = $1, payment_status = $2 WHERE id = $3 RETURNING *',
          [status, paymentStatus, id]
        );
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error updating event participant status:', error);
        return undefined;
      }
    });
  }
  
  // Payment methods (in master schema)
  async getPayment(id: number): Promise<Payment | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching payment by ID:', error);
        return undefined;
      }
    });
  }
  
  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM payments WHERE user_id = $1', [userId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching payments by user:', error);
        return [];
      }
    });
  }
  
  async getPaymentsByEvent(eventId: number): Promise<Payment[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM payments WHERE event_id = $1', [eventId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching payments by event:', error);
        return [];
      }
    });
  }
  
  async createPayment(payment: InsertPayment): Promise<Payment> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          `INSERT INTO payments (
            user_id, event_id, amount, payment_method, status, transaction_id
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            payment.userId,
            payment.eventId,
            payment.amount,
            payment.paymentMethod,
            payment.status || 'pending',
            payment.transactionId
          ]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating payment:', error);
        throw error;
      }
    });
  }
  
  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'UPDATE payments SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error updating payment status:', error);
        return undefined;
      }
    });
  }
  
  // Chat methods (in master schema)
  async getChatGroup(id: number): Promise<ChatGroup | undefined> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM chat_groups WHERE id = $1', [id]);
        return result.rows[0] || undefined;
      } catch (error) {
        console.error('Error fetching chat group by ID:', error);
        return undefined;
      }
    });
  }
  
  async getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM chat_groups WHERE event_id = $1', [eventId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching chat groups by event:', error);
        return [];
      }
    });
  }
  
  async getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query('SELECT * FROM chat_groups WHERE business_id = $1', [businessId]);
        return result.rows;
      } catch (error) {
        console.error('Error fetching chat groups by business:', error);
        return [];
      }
    });
  }
  
  async getChatGroupsByUser(userId: number): Promise<ChatGroup[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          `SELECT g.* FROM chat_groups g
           JOIN chat_group_members m ON g.id = m.group_id
           WHERE m.user_id = $1`,
          [userId]
        );
        return result.rows;
      } catch (error) {
        console.error('Error fetching chat groups by user:', error);
        return [];
      }
    });
  }
  
  async createChatGroup(group: InsertChatGroup): Promise<ChatGroup> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          `INSERT INTO chat_groups (
            name, description, event_id, business_id, is_direct
          ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            group.name,
            group.description,
            group.eventId,
            group.businessId,
            group.isDirect || false
          ]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating chat group:', error);
        throw error;
      }
    });
  }
  
  async addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'INSERT INTO chat_group_members (group_id, user_id) VALUES ($1, $2) RETURNING *',
          [groupId, userId]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error adding user to chat group:', error);
        throw error;
      }
    });
  }
  
  // Chat Message methods (in master schema)
  async getChatMessages(groupId: number): Promise<ChatMessage[]> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          'SELECT * FROM chat_messages WHERE group_id = $1 ORDER BY sent_at ASC',
          [groupId]
        );
        return result.rows;
      } catch (error) {
        console.error('Error fetching chat messages by group:', error);
        return [];
      }
    });
  }
  
  async getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]> {
    return this.executeInMasterSchema(async () => {
      try {
        // Find the direct chat group between these users
        const groupResult = await pool.query(
          `SELECT cg.id FROM chat_groups cg
           WHERE cg.is_direct = true
           AND EXISTS (
             SELECT 1 FROM chat_group_members cgm1
             WHERE cgm1.group_id = cg.id AND cgm1.user_id = $1
           )
           AND EXISTS (
             SELECT 1 FROM chat_group_members cgm2
             WHERE cgm2.group_id = cg.id AND cgm2.user_id = $2
           )
           LIMIT 1`,
          [userId, receiverId]
        );
        
        if (groupResult.rows.length === 0) {
          return [];
        }
        
        const groupId = groupResult.rows[0].id;
        
        // Get messages from this group
        const result = await pool.query(
          'SELECT * FROM chat_messages WHERE group_id = $1 ORDER BY sent_at ASC',
          [groupId]
        );
        return result.rows;
      } catch (error) {
        console.error('Error fetching direct messages:', error);
        return [];
      }
    });
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    return this.executeInMasterSchema(async () => {
      try {
        const result = await pool.query(
          `INSERT INTO chat_messages (
            group_id, sender_id, message, message_type
          ) VALUES ($1, $2, $3, $4) RETURNING *`,
          [
            message.groupId,
            message.senderId,
            message.message,
            message.messageType || 'text'
          ]
        );
        return result.rows[0];
      } catch (error) {
        console.error('Error creating chat message:', error);
        throw error;
      }
    });
  }
  
  async markMessagesAsRead(userId: number, groupId?: number): Promise<void> {
    return this.executeInMasterSchema(async () => {
      try {
        const now = new Date();
        
        if (groupId) {
          // Mark messages in a specific group as read
          await pool.query(
            `UPDATE chat_messages 
             SET read_at = $1 
             WHERE group_id = $2 
             AND sender_id != $3 
             AND read_at IS NULL`,
            [now, groupId, userId]
          );
        } else {
          // Mark all messages to this user as read
          await pool.query(
            `UPDATE chat_messages 
             SET read_at = $1 
             WHERE group_id IN (
               SELECT group_id FROM chat_group_members WHERE user_id = $2
             )
             AND sender_id != $2
             AND read_at IS NULL`,
            [now, userId]
          );
        }
      } catch (error) {
        console.error('Error marking messages as read:', error);
        throw error;
      }
    });
  }
}

// Use database storage by default, with fallback to memory storage
// This should be updated based on your environment configuration
export const storage = config.environment === 'development' && process.env.USE_MEMORY_STORAGE === 'true' 
  ? new MemStorage() 
  : new DatabaseStorage();