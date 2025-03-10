import session from "express-session";
import createMemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { Store as SessionStore } from "express-session";
import { 
  User, InsertUser, Business, InsertBusiness, Court, InsertCourt, 
  Booking, InsertBooking, Event, InsertEvent, EventParticipant, 
  InsertEventParticipant, Payment, InsertPayment, ChatGroup, 
  InsertChatGroup, ChatGroupMember, ChatMessage, InsertChatMessage 
} from "../shared/schema";
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

// In-memory implementation for development and testing
export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private businesses: Map<number, Business> = new Map();
  private courts: Map<number, Court> = new Map();
  private bookings: Map<number, Booking> = new Map();
  private events: Map<number, Event> = new Map();
  private eventParticipants: Map<number, EventParticipant> = new Map();
  private payments: Map<number, Payment> = new Map();
  private chatGroups: Map<number, ChatGroup> = new Map();
  private chatGroupMembers: Map<number, ChatGroupMember> = new Map();
  private chatMessages: Map<number, ChatMessage> = new Map();
  sessionStore: SessionStore;
  
  private userId = 1;
  private businessId = 1;
  private courtId = 1;
  private bookingId = 1;
  private eventId = 1;
  private eventParticipantId = 1;
  private paymentId = 1;
  private chatGroupId = 1;
  private chatGroupMemberId = 1;
  private chatMessageId = 1;
  
  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // 1 day
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const id = this.userId++;
    const newUser: User = {
      id,
      username: user.username,
      password: user.password,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      role: user.role ?? 'user',
      createdAt: new Date()
    };
    this.users.set(id, newUser);
    return newUser;
  }
  
  // Business methods
  async getBusiness(id: number): Promise<Business | undefined> {
    return this.businesses.get(id);
  }
  
  async getBusinessesByOwner(ownerId: number): Promise<Business[]> {
    return Array.from(this.businesses.values()).filter(business => business.ownerId === ownerId);
  }
  
  async createBusiness(business: InsertBusiness): Promise<Business> {
    const id = this.businessId++;
    const newBusiness: Business = {
      id,
      name: business.name,
      description: business.description ?? null,
      ownerId: business.ownerId,
      address: business.address,
      phone: business.phone,
      email: business.email,
      website: business.website ?? null,
      createdAt: new Date()
    };
    this.businesses.set(id, newBusiness);
    return newBusiness;
  }
  
  // Court methods
  async getCourt(id: number, businessId: number): Promise<Court | undefined> {
    const court = this.courts.get(id);
    return court && court.businessId === businessId ? court : undefined;
  }
  
  async getCourtsByBusiness(businessId: number): Promise<Court[]> {
    return Array.from(this.courts.values()).filter(court => court.businessId === businessId);
  }
  
  async createCourt(court: InsertCourt, businessId: number): Promise<Court> {
    const id = this.courtId++;
    const newCourt: Court = {
      id,
      businessId: court.businessId ?? businessId,
      name: court.name,
      description: court.description ?? null,
      pricePerHour: court.pricePerHour,
      isAvailable: court.isAvailable ?? true,
      createdAt: new Date()
    };
    this.courts.set(id, newCourt);
    return newCourt;
  }
  
  async updateCourtAvailability(id: number, businessId: number, isAvailable: boolean): Promise<Court | undefined> {
    const court = await this.getCourt(id, businessId);
    if (!court) return undefined;
    
    const updatedCourt: Court = {
      ...court,
      isAvailable
    };
    this.courts.set(id, updatedCourt);
    return updatedCourt;
  }
  
  // Booking methods
  async getBooking(id: number, businessId: number): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    
    const court = await this.getCourt(booking.courtId, businessId);
    return court ? booking : undefined;
  }
  
  async getBookingsByUser(userId: number): Promise<Booking[]> {
    return Array.from(this.bookings.values()).filter(booking => booking.userId === userId);
  }
  
  async getBookingsByCourt(courtId: number, businessId: number): Promise<Booking[]> {
    const court = await this.getCourt(courtId, businessId);
    if (!court) return [];
    
    return Array.from(this.bookings.values()).filter(booking => booking.courtId === courtId);
  }
  
  async getBookingsByTimeRange(courtId: number, businessId: number, startTime: Date, endTime: Date): Promise<Booking[]> {
    const court = await this.getCourt(courtId, businessId);
    if (!court) return [];
    
    return Array.from(this.bookings.values()).filter(booking => {
      return booking.courtId === courtId && 
        ((booking.startTime >= startTime && booking.startTime < endTime) || 
        (booking.endTime > startTime && booking.endTime <= endTime));
    });
  }
  
  async createBooking(booking: InsertBooking, businessId: number): Promise<Booking> {
    const id = this.bookingId++;
    const newBooking: Booking = {
      id,
      courtId: booking.courtId,
      userId: booking.userId,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status ?? 'confirmed',
      createdAt: new Date()
    };
    this.bookings.set(id, newBooking);
    return newBooking;
  }
  
  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    return this.events.get(id);
  }
  
  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return Array.from(this.events.values()).filter(event => event.organizerId === organizerId);
  }
  
  async getEventsByType(eventType: string): Promise<Event[]> {
    return Array.from(this.events.values()).filter(event => event.eventType === eventType);
  }
  
  async getUpcomingEvents(): Promise<Event[]> {
    const now = new Date();
    return Array.from(this.events.values()).filter(event => event.startTime > now);
  }
  
  async createEvent(event: InsertEvent): Promise<Event> {
    const id = this.eventId++;
    const newEvent: Event = {
      id,
      name: event.name,
      description: event.description ?? null,
      eventType: event.eventType,
      organizerId: event.organizerId,
      startTime: event.startTime,
      endTime: event.endTime,
      location: event.location,
      maxParticipants: event.maxParticipants ?? null,
      currentParticipants: event.currentParticipants ?? 0,
      price: event.price ?? null,
      status: event.status ?? 'open',
      createdAt: new Date()
    };
    this.events.set(id, newEvent);
    return newEvent;
  }
  
  async updateEventStatus(id: number, status: string): Promise<Event | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;
    
    const updatedEvent: Event = {
      ...event,
      status
    };
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }
  
  async updateEventParticipantCount(id: number, count: number): Promise<Event | undefined> {
    const event = this.events.get(id);
    if (!event) return undefined;
    
    const updatedEvent: Event = {
      ...event,
      currentParticipants: count
    };
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }
  
  // Event Participants methods
  async getEventParticipant(id: number): Promise<EventParticipant | undefined> {
    return this.eventParticipants.get(id);
  }
  
  async getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]> {
    return Array.from(this.eventParticipants.values()).filter(participant => participant.eventId === eventId);
  }
  
  async getEventParticipantsByUser(userId: number): Promise<EventParticipant[]> {
    return Array.from(this.eventParticipants.values()).filter(participant => participant.userId === userId);
  }
  
  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    const id = this.eventParticipantId++;
    const newParticipant: EventParticipant = {
      id,
      eventId: participant.eventId,
      userId: participant.userId,
      status: participant.status ?? 'registered',
      paymentStatus: participant.paymentStatus ?? 'pending',
      createdAt: new Date()
    };
    this.eventParticipants.set(id, newParticipant);
    
    // Update event participant count
    const event = this.events.get(participant.eventId);
    if (event) {
      this.updateEventParticipantCount(event.id, (event.currentParticipants ?? 0) + 1);
    }
    
    return newParticipant;
  }
  
  async updateEventParticipantStatus(id: number, status: string, paymentStatus: string): Promise<EventParticipant | undefined> {
    const participant = this.eventParticipants.get(id);
    if (!participant) return undefined;
    
    const updatedParticipant: EventParticipant = {
      ...participant,
      status,
      paymentStatus
    };
    this.eventParticipants.set(id, updatedParticipant);
    return updatedParticipant;
  }
  
  // Payment methods
  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.get(id);
  }
  
  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.userId === userId);
  }
  
  async getPaymentsByEvent(eventId: number): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(payment => payment.eventId === eventId);
  }
  
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = this.paymentId++;
    const newPayment: Payment = {
      id,
      userId: payment.userId,
      eventId: payment.eventId ?? null,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      status: payment.status ?? 'pending',
      transactionId: payment.transactionId ?? null,
      createdAt: new Date()
    };
    this.payments.set(id, newPayment);
    return newPayment;
  }
  
  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    
    const updatedPayment: Payment = {
      ...payment,
      status
    };
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }
  
  // Chat methods
  async getChatGroup(id: number): Promise<ChatGroup | undefined> {
    return this.chatGroups.get(id);
  }
  
  async getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]> {
    return Array.from(this.chatGroups.values()).filter(group => group.eventId === eventId);
  }
  
  async getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]> {
    return Array.from(this.chatGroups.values()).filter(group => group.businessId === businessId);
  }
  
  async getChatGroupsByUser(userId: number): Promise<ChatGroup[]> {
    const memberGroups = Array.from(this.chatGroupMembers.values())
      .filter(member => member.userId === userId)
      .map(member => member.groupId);
    
    return Array.from(this.chatGroups.values())
      .filter(group => memberGroups.includes(group.id));
  }
  
  async createChatGroup(group: InsertChatGroup): Promise<ChatGroup> {
    const id = this.chatGroupId++;
    const newGroup: ChatGroup = {
      id,
      name: group.name,
      description: group.description ?? null,
      eventId: group.eventId ?? null,
      businessId: group.businessId ?? null,
      isDirect: group.isDirect ?? false,
      createdAt: new Date()
    };
    this.chatGroups.set(id, newGroup);
    return newGroup;
  }
  
  async addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember> {
    const id = this.chatGroupMemberId++;
    const newMember: ChatGroupMember = {
      id,
      groupId,
      userId,
      joinedAt: new Date()
    };
    this.chatGroupMembers.set(id, newMember);
    return newMember;
  }
  
  // Chat Message methods
  async getChatMessages(groupId: number): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter(message => message.groupId === groupId)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }
  
  async getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]> {
    // Find direct chat groups between these users
    const directGroups = Array.from(this.chatGroups.values())
      .filter(group => group.isDirect)
      .filter(group => {
        const members = Array.from(this.chatGroupMembers.values())
          .filter(member => member.groupId === group.id)
          .map(member => member.userId);
        
        return members.includes(userId) && members.includes(receiverId) && members.length === 2;
      })
      .map(group => group.id);
    
    if (directGroups.length === 0) return [];
    
    return Array.from(this.chatMessages.values())
      .filter(message => directGroups.includes(message.groupId))
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageId++;
    const newMessage: ChatMessage = {
      id,
      groupId: message.groupId,
      senderId: message.senderId,
      message: message.message,
      sentAt: new Date(),
      readAt: null,
      messageType: message.messageType ?? 'text'
    };
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }
  
  async markMessagesAsRead(userId: number, groupId?: number): Promise<void> {
    const now = new Date();
    const messages = Array.from(this.chatMessages.values())
      .filter(message => {
        // Filter messages not sent by this user and not already read
        if (message.senderId === userId || message.readAt !== null) return false;
        
        // If groupId is specified, only include messages from that group
        if (groupId !== undefined) return message.groupId === groupId;
        
        // Otherwise include messages from any group this user is a member of
        const userGroups = Array.from(this.chatGroupMembers.values())
          .filter(member => member.userId === userId)
          .map(member => member.groupId);
        
        return userGroups.includes(message.groupId);
      });
    
    // Mark all filtered messages as read
    for (const message of messages) {
      const updatedMessage: ChatMessage = {
        ...message,
        readAt: now
      };
      this.chatMessages.set(message.id, updatedMessage);
    }
  }
}

// Use database storage by default, with fallback to memory storage
// This should be updated based on your environment configuration
export const storage = config.environment === 'development' && process.env.USE_MEMORY_STORAGE === 'true' 
  ? new MemStorage() 
  : new DatabaseStorage();