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
import pool from "./database";
import config from "./config";

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
  getCourt(id: number): Promise<Court | undefined>;
  getCourtsByBusiness(businessId: number): Promise<Court[]>;
  createCourt(court: InsertCourt): Promise<Court>;
  updateCourtAvailability(id: number, isAvailable: boolean): Promise<Court | undefined>;
  
  // Booking methods
  getBooking(id: number): Promise<Booking | undefined>;
  getBookingsByUser(userId: number): Promise<Booking[]>;
  getBookingsByCourt(courtId: number): Promise<Booking[]>;
  getBookingsByTimeRange(courtId: number, startTime: Date, endTime: Date): Promise<Booking[]>;
  createBooking(booking: InsertBooking): Promise<Booking>;
  
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

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: User[] = [];
  private businesses: Business[] = [];
  private courts: Court[] = [];
  private bookings: Booking[] = [];
  private events: Event[] = [];
  private eventParticipants: EventParticipant[] = [];
  private payments: Payment[] = [];
  private chatGroups: ChatGroup[] = [];
  private chatGroupMembers: ChatGroupMember[] = [];
  private chatMessages: ChatMessage[] = [];
  
  sessionStore: SessionStore;
  
  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }
  
  async createUser(user: InsertUser): Promise<User> {
    const newUser: User = {
      id: this.users.length + 1,
      ...user,
      createdAt: new Date(),
    };
    this.users.push(newUser);
    return newUser;
  }
  
  // Business methods
  async getBusiness(id: number): Promise<Business | undefined> {
    return this.businesses.find(business => business.id === id);
  }
  
  async getBusinessesByOwner(ownerId: number): Promise<Business[]> {
    return this.businesses.filter(business => business.ownerId === ownerId);
  }
  
  async createBusiness(business: InsertBusiness): Promise<Business> {
    const newBusiness: Business = {
      id: this.businesses.length + 1,
      ...business,
      createdAt: new Date(),
    };
    this.businesses.push(newBusiness);
    return newBusiness;
  }
  
  // Court methods
  async getCourt(id: number): Promise<Court | undefined> {
    return this.courts.find(court => court.id === id);
  }
  
  async getCourtsByBusiness(businessId: number): Promise<Court[]> {
    return this.courts.filter(court => court.businessId === businessId);
  }
  
  async createCourt(court: InsertCourt): Promise<Court> {
    const newCourt: Court = {
      id: this.courts.length + 1,
      ...court,
      createdAt: new Date(),
    };
    this.courts.push(newCourt);
    return newCourt;
  }
  
  async updateCourtAvailability(id: number, isAvailable: boolean): Promise<Court | undefined> {
    const court = await this.getCourt(id);
    if (!court) return undefined;
    
    court.isAvailable = isAvailable;
    return court;
  }
  
  // Booking methods
  async getBooking(id: number): Promise<Booking | undefined> {
    return this.bookings.find(booking => booking.id === id);
  }
  
  async getBookingsByUser(userId: number): Promise<Booking[]> {
    return this.bookings.filter(booking => booking.userId === userId);
  }
  
  async getBookingsByCourt(courtId: number): Promise<Booking[]> {
    return this.bookings.filter(booking => booking.courtId === courtId);
  }
  
  async getBookingsByTimeRange(courtId: number, startTime: Date, endTime: Date): Promise<Booking[]> {
    return this.bookings.filter(
      booking => 
        booking.courtId === courtId && 
        ((booking.startTime >= startTime && booking.startTime < endTime) || 
         (booking.endTime > startTime && booking.endTime <= endTime))
    );
  }
  
  async createBooking(booking: InsertBooking): Promise<Booking> {
    const newBooking: Booking = {
      id: this.bookings.length + 1,
      ...booking,
      createdAt: new Date(),
    };
    this.bookings.push(newBooking);
    return newBooking;
  }
  
  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    return this.events.find(event => event.id === id);
  }
  
  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return this.events.filter(event => event.organizerId === organizerId);
  }
  
  async getEventsByType(eventType: string): Promise<Event[]> {
    return this.events.filter(event => event.eventType === eventType);
  }
  
  async getUpcomingEvents(): Promise<Event[]> {
    const now = new Date();
    return this.events.filter(event => event.startDate > now);
  }
  
  async createEvent(event: InsertEvent): Promise<Event> {
    const newEvent: Event = {
      id: this.events.length + 1,
      ...event,
      createdAt: new Date(),
    };
    this.events.push(newEvent);
    return newEvent;
  }
  
  async updateEventStatus(id: number, status: string): Promise<Event | undefined> {
    const event = await this.getEvent(id);
    if (!event) return undefined;
    
    event.status = status;
    return event;
  }
  
  async updateEventParticipantCount(id: number, count: number): Promise<Event | undefined> {
    const event = await this.getEvent(id);
    if (!event) return undefined;
    
    event.currentParticipants = count;
    return event;
  }
  
  // Event Participants methods
  async getEventParticipant(id: number): Promise<EventParticipant | undefined> {
    return this.eventParticipants.find(participant => participant.id === id);
  }
  
  async getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]> {
    return this.eventParticipants.filter(participant => participant.eventId === eventId);
  }
  
  async getEventParticipantsByUser(userId: number): Promise<EventParticipant[]> {
    return this.eventParticipants.filter(participant => participant.userId === userId);
  }
  
  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    const newParticipant: EventParticipant = {
      id: this.eventParticipants.length + 1,
      ...participant,
      createdAt: new Date(),
    };
    this.eventParticipants.push(newParticipant);
    return newParticipant;
  }
  
  async updateEventParticipantStatus(id: number, status: string, paymentStatus: string): Promise<EventParticipant | undefined> {
    const participant = await this.getEventParticipant(id);
    if (!participant) return undefined;
    
    participant.status = status;
    participant.paymentStatus = paymentStatus;
    return participant;
  }
  
  // Payment methods
  async getPayment(id: number): Promise<Payment | undefined> {
    return this.payments.find(payment => payment.id === id);
  }
  
  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return this.payments.filter(payment => payment.userId === userId);
  }
  
  async getPaymentsByEvent(eventId: number): Promise<Payment[]> {
    return this.payments.filter(payment => payment.eventId === eventId);
  }
  
  async createPayment(payment: InsertPayment): Promise<Payment> {
    const newPayment: Payment = {
      id: this.payments.length + 1,
      ...payment,
      createdAt: new Date(),
    };
    this.payments.push(newPayment);
    return newPayment;
  }
  
  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    const payment = await this.getPayment(id);
    if (!payment) return undefined;
    
    payment.status = status;
    return payment;
  }
  
  // Chat methods
  async getChatGroup(id: number): Promise<ChatGroup | undefined> {
    return this.chatGroups.find(group => group.id === id);
  }
  
  async getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]> {
    return this.chatGroups.filter(group => group.eventId === eventId);
  }
  
  async getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]> {
    return this.chatGroups.filter(group => group.businessId === businessId);
  }
  
  async getChatGroupsByUser(userId: number): Promise<ChatGroup[]> {
    const memberGroups = this.chatGroupMembers.filter(member => member.userId === userId);
    return memberGroups.map(member => 
      this.chatGroups.find(group => group.id === member.groupId)
    ).filter(Boolean) as ChatGroup[];
  }
  
  async createChatGroup(group: InsertChatGroup): Promise<ChatGroup> {
    const newGroup: ChatGroup = {
      id: this.chatGroups.length + 1,
      ...group,
      createdAt: new Date(),
    };
    this.chatGroups.push(newGroup);
    return newGroup;
  }
  
  async addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember> {
    const newMember: ChatGroupMember = {
      id: this.chatGroupMembers.length + 1,
      groupId,
      userId,
      joinedAt: new Date(),
    };
    this.chatGroupMembers.push(newMember);
    return newMember;
  }
  
  // Chat Message methods
  async getChatMessages(groupId: number): Promise<ChatMessage[]> {
    return this.chatMessages.filter(message => message.chatGroupId === groupId);
  }
  
  async getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]> {
    return this.chatMessages.filter(message => 
      (message.senderId === userId && message.receiverId === receiverId) ||
      (message.senderId === receiverId && message.receiverId === userId)
    );
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const newMessage: ChatMessage = {
      id: this.chatMessages.length + 1,
      ...message,
      sentAt: new Date(),
      readAt: undefined,
    };
    this.chatMessages.push(newMessage);
    return newMessage;
  }
  
  async markMessagesAsRead(userId: number, groupId?: number): Promise<void> {
    const now = new Date();
    if (groupId) {
      // Mark all unread messages in a group as read
      this.chatMessages.forEach(message => {
        if (message.chatGroupId === groupId && message.receiverId === userId && !message.readAt) {
          message.readAt = now;
        }
      });
    } else {
      // Mark all direct messages as read
      this.chatMessages.forEach(message => {
        if (message.receiverId === userId && !message.readAt) {
          message.readAt = now;
        }
      });
    }
  }
}

// DatabaseStorage implementation for PostgreSQL
export class DatabaseStorage implements IStorage {
  sessionStore: SessionStore;
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      tableName: 'session', // Name of table to create/use in PostgreSQL
      createTableIfMissing: true,
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    try {
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0] || undefined;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      return undefined;
    }
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      return result.rows[0] || undefined;
    } catch (error) {
      console.error('Error fetching user by username:', error);
      return undefined;
    }
  }
  
  async createUser(user: InsertUser): Promise<User> {
    try {
      const result = await pool.query(
        'INSERT INTO users (username, password, role, email, firstName, lastName) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [user.username, user.password, user.role, user.email, user.firstName, user.lastName]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }
  
  // Business methods
  async getBusiness(id: number): Promise<Business | undefined> {
    try {
      const result = await pool.query('SELECT * FROM businesses WHERE id = $1', [id]);
      return result.rows[0] || undefined;
    } catch (error) {
      console.error('Error fetching business by ID:', error);
      return undefined;
    }
  }
  
  async getBusinessesByOwner(ownerId: number): Promise<Business[]> {
    try {
      const result = await pool.query('SELECT * FROM businesses WHERE "ownerId" = $1', [ownerId]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching businesses by owner:', error);
      return [];
    }
  }
  
  async createBusiness(business: InsertBusiness): Promise<Business> {
    try {
      const result = await pool.query(
        'INSERT INTO businesses ("ownerId", name, description, address, phoneNumber, website, logoUrl) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [business.ownerId, business.name, business.description, business.address, business.phoneNumber, business.website, business.logoUrl]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating business:', error);
      throw error;
    }
  }
  
  // Chat Message methods
  async getChatMessages(groupId: number): Promise<ChatMessage[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM chat_messages WHERE "chatGroupId" = $1 ORDER BY "sentAt" ASC',
        [groupId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return [];
    }
  }
  
  async getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM chat_messages 
         WHERE ("senderId" = $1 AND "receiverId" = $2) 
         OR ("senderId" = $2 AND "receiverId" = $1) 
         ORDER BY "sentAt" ASC`,
        [userId, receiverId]
      );
      return result.rows;
    } catch (error) {
      console.error('Error fetching direct messages:', error);
      return [];
    }
  }
  
  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    try {
      const result = await pool.query(
        `INSERT INTO chat_messages 
         ("senderId", "receiverId", "chatGroupId", content, "messageId") 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [
          message.senderId, 
          message.receiverId, 
          message.chatGroupId, 
          message.content,
          message.messageId
        ]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Error creating chat message:', error);
      throw error;
    }
  }
  
  async markMessagesAsRead(userId: number, groupId?: number): Promise<void> {
    try {
      const now = new Date();
      if (groupId) {
        await pool.query(
          `UPDATE chat_messages 
           SET "readAt" = $1 
           WHERE "chatGroupId" = $2 AND "receiverId" = $3 AND "readAt" IS NULL`,
          [now, groupId, userId]
        );
      } else {
        await pool.query(
          `UPDATE chat_messages 
           SET "readAt" = $1 
           WHERE "receiverId" = $2 AND "readAt" IS NULL`,
          [now, userId]
        );
      }
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }
  
  // The rest of the methods from MemStorage would be implemented similarly
  // We'll delegate to MemStorage for now and implement them as needed
  async getCourt(id: number): Promise<Court | undefined> {
    return memStorage.getCourt(id);
  }
  
  async getCourtsByBusiness(businessId: number): Promise<Court[]> {
    return memStorage.getCourtsByBusiness(businessId);
  }
  
  async createCourt(court: InsertCourt): Promise<Court> {
    return memStorage.createCourt(court);
  }
  
  async updateCourtAvailability(id: number, isAvailable: boolean): Promise<Court | undefined> {
    return memStorage.updateCourtAvailability(id, isAvailable);
  }
  
  async getBooking(id: number): Promise<Booking | undefined> {
    return memStorage.getBooking(id);
  }
  
  async getBookingsByUser(userId: number): Promise<Booking[]> {
    return memStorage.getBookingsByUser(userId);
  }
  
  async getBookingsByCourt(courtId: number): Promise<Booking[]> {
    return memStorage.getBookingsByCourt(courtId);
  }
  
  async getBookingsByTimeRange(courtId: number, startTime: Date, endTime: Date): Promise<Booking[]> {
    return memStorage.getBookingsByTimeRange(courtId, startTime, endTime);
  }
  
  async createBooking(booking: InsertBooking): Promise<Booking> {
    return memStorage.createBooking(booking);
  }
  
  async getEvent(id: number): Promise<Event | undefined> {
    return memStorage.getEvent(id);
  }
  
  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    return memStorage.getEventsByOrganizer(organizerId);
  }
  
  async getEventsByType(eventType: string): Promise<Event[]> {
    return memStorage.getEventsByType(eventType);
  }
  
  async getUpcomingEvents(): Promise<Event[]> {
    return memStorage.getUpcomingEvents();
  }
  
  async createEvent(event: InsertEvent): Promise<Event> {
    return memStorage.createEvent(event);
  }
  
  async updateEventStatus(id: number, status: string): Promise<Event | undefined> {
    return memStorage.updateEventStatus(id, status);
  }
  
  async updateEventParticipantCount(id: number, count: number): Promise<Event | undefined> {
    return memStorage.updateEventParticipantCount(id, count);
  }
  
  async getEventParticipant(id: number): Promise<EventParticipant | undefined> {
    return memStorage.getEventParticipant(id);
  }
  
  async getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]> {
    return memStorage.getEventParticipantsByEvent(eventId);
  }
  
  async getEventParticipantsByUser(userId: number): Promise<EventParticipant[]> {
    return memStorage.getEventParticipantsByUser(userId);
  }
  
  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    return memStorage.createEventParticipant(participant);
  }
  
  async updateEventParticipantStatus(id: number, status: string, paymentStatus: string): Promise<EventParticipant | undefined> {
    return memStorage.updateEventParticipantStatus(id, status, paymentStatus);
  }
  
  async getPayment(id: number): Promise<Payment | undefined> {
    return memStorage.getPayment(id);
  }
  
  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    return memStorage.getPaymentsByUser(userId);
  }
  
  async getPaymentsByEvent(eventId: number): Promise<Payment[]> {
    return memStorage.getPaymentsByEvent(eventId);
  }
  
  async createPayment(payment: InsertPayment): Promise<Payment> {
    return memStorage.createPayment(payment);
  }
  
  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    return memStorage.updatePaymentStatus(id, status);
  }
  
  async getChatGroup(id: number): Promise<ChatGroup | undefined> {
    return memStorage.getChatGroup(id);
  }
  
  async getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]> {
    return memStorage.getChatGroupsByEvent(eventId);
  }
  
  async getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]> {
    return memStorage.getChatGroupsByBusiness(businessId);
  }
  
  async getChatGroupsByUser(userId: number): Promise<ChatGroup[]> {
    return memStorage.getChatGroupsByUser(userId);
  }
  
  async createChatGroup(group: InsertChatGroup): Promise<ChatGroup> {
    return memStorage.createChatGroup(group);
  }
  
  async addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember> {
    return memStorage.addUserToChatGroup(userId, groupId);
  }
}

// Create the memory storage instance for fallback and initial use
const memStorage = new MemStorage();

// Choose which storage implementation to use based on configuration
// Using MemStorage for now, but can switch to DatabaseStorage when needed
export const storage = config.nodeEnv === 'production' ? 
  new DatabaseStorage() : 
  memStorage;