import { 
  users, type User, type InsertUser,
  businesses, type Business, type InsertBusiness,
  courts, type Court, type InsertCourt,
  bookings, type Booking, type InsertBooking,
  events, type Event, type InsertEvent,
  eventParticipants, type EventParticipant, type InsertEventParticipant,
  payments, type Payment, type InsertPayment,
  chatGroups, type ChatGroup, type InsertChatGroup,
  chatGroupMembers, type ChatGroupMember, type InsertChatGroupMember,
  chatMessages, type ChatMessage, type InsertChatMessage
} from "@shared/schema";
import type { SessionStore } from "express-session";
import createMemoryStore from "memorystore";
import session from "express-session";
import { db } from "./db";
import { eq } from "drizzle-orm";

const MemoryStore = createMemoryStore(session);

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
  getCourt(id: number, businessId?: number): Promise<Court | undefined>;
  getCourtsByBusiness(businessId: number): Promise<Court[]>;
  createCourt(court: InsertCourt): Promise<Court>;
  updateCourtAvailability(id: number, isAvailable: boolean): Promise<Court | undefined>;
  
  // Booking methods
  getBooking(id: number, businessId?: number): Promise<Booking | undefined>;
  getBookingsByUser(userId: number): Promise<Booking[]>;
  getBookingsByCourt(courtId: number, businessId?: number): Promise<Booking[]>;
  getBookingsByTimeRange(courtId: number, startTime: Date, endTime: Date, businessId?: number): Promise<Booking[]>;
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

// Memory-based storage implementation
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
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.username === username) {
        return user;
      }
    }
    return undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = this.userId++;
    const createdAt = new Date();
    
    const newUser: User = {
      id,
      ...user,
      createdAt
    };
    
    this.users.set(id, newUser);
    return newUser;
  }

  // Business methods
  async getBusiness(id: number): Promise<Business | undefined> {
    return this.businesses.get(id);
  }

  async getBusinessesByOwner(ownerId: number): Promise<Business[]> {
    const result: Business[] = [];
    for (const business of this.businesses.values()) {
      if (business.ownerId === ownerId) {
        result.push(business);
      }
    }
    return result;
  }

  async createBusiness(business: InsertBusiness): Promise<Business> {
    const id = this.businessId++;
    const createdAt = new Date();
    
    const newBusiness: Business = {
      id,
      ...business,
      createdAt
    };
    
    this.businesses.set(id, newBusiness);
    return newBusiness;
  }

  // Court methods
  async getCourt(id: number, businessId?: number): Promise<Court | undefined> {
    const court = this.courts.get(id);
    if (!court) return undefined;
    
    if (businessId && court.businessId !== businessId) {
      return undefined;
    }
    
    return court;
  }

  async getCourtsByBusiness(businessId: number): Promise<Court[]> {
    const result: Court[] = [];
    for (const court of this.courts.values()) {
      if (court.businessId === businessId) {
        result.push(court);
      }
    }
    return result;
  }

  async createCourt(court: InsertCourt): Promise<Court> {
    const id = this.courtId++;
    const createdAt = new Date();
    
    const newCourt: Court = {
      id,
      ...court,
      isAvailable: court.isAvailable ?? true,
      createdAt
    };
    
    this.courts.set(id, newCourt);
    return newCourt;
  }

  async updateCourtAvailability(id: number, isAvailable: boolean): Promise<Court | undefined> {
    const court = this.courts.get(id);
    if (!court) return undefined;
    
    const updatedCourt: Court = {
      ...court,
      isAvailable
    };
    
    this.courts.set(id, updatedCourt);
    return updatedCourt;
  }

  // Booking methods
  async getBooking(id: number, businessId?: number): Promise<Booking | undefined> {
    const booking = this.bookings.get(id);
    if (!booking) return undefined;
    
    if (businessId) {
      const court = await this.getCourt(booking.courtId);
      if (!court || court.businessId !== businessId) {
        return undefined;
      }
    }
    
    return booking;
  }

  async getBookingsByUser(userId: number): Promise<Booking[]> {
    const result: Booking[] = [];
    for (const booking of this.bookings.values()) {
      if (booking.userId === userId) {
        result.push(booking);
      }
    }
    return result;
  }

  async getBookingsByCourt(courtId: number, businessId?: number): Promise<Booking[]> {
    if (businessId) {
      const court = await this.getCourt(courtId);
      if (!court || court.businessId !== businessId) {
        return [];
      }
    }
    
    const result: Booking[] = [];
    for (const booking of this.bookings.values()) {
      if (booking.courtId === courtId) {
        result.push(booking);
      }
    }
    return result;
  }

  async getBookingsByTimeRange(courtId: number, startTime: Date, endTime: Date, businessId?: number): Promise<Booking[]> {
    if (businessId) {
      const court = await this.getCourt(courtId);
      if (!court || court.businessId !== businessId) {
        return [];
      }
    }
    
    const result: Booking[] = [];
    for (const booking of this.bookings.values()) {
      if (booking.courtId === courtId &&
          ((booking.startTime <= startTime && booking.endTime > startTime) ||
           (booking.startTime < endTime && booking.endTime >= endTime) ||
           (booking.startTime >= startTime && booking.endTime <= endTime))) {
        result.push(booking);
      }
    }
    return result;
  }

  async createBooking(booking: InsertBooking): Promise<Booking> {
    const id = this.bookingId++;
    const createdAt = new Date();
    
    const newBooking: Booking = {
      id,
      ...booking,
      eventId: booking.eventId || null,
      status: booking.status || 'confirmed',
      createdAt
    };
    
    this.bookings.set(id, newBooking);
    return newBooking;
  }

  // Event methods
  async getEvent(id: number): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async getEventsByOrganizer(organizerId: number): Promise<Event[]> {
    const result: Event[] = [];
    for (const event of this.events.values()) {
      if (event.organizerId === organizerId) {
        result.push(event);
      }
    }
    return result;
  }

  async getEventsByType(eventType: string): Promise<Event[]> {
    const result: Event[] = [];
    for (const event of this.events.values()) {
      if (event.eventType === eventType) {
        result.push(event);
      }
    }
    return result;
  }

  async getUpcomingEvents(): Promise<Event[]> {
    const now = new Date();
    const result: Event[] = [];
    for (const event of this.events.values()) {
      if (event.startDate > now && event.status !== 'cancelled') {
        result.push(event);
      }
    }
    
    // Sort by start date (ascending)
    result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    return result;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const id = this.eventId++;
    const createdAt = new Date();
    
    const newEvent: Event = {
      id,
      ...event,
      description: event.description || null,
      capacity: event.capacity || null,
      fee: event.fee || null,
      status: event.status || 'open',
      createdAt
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
      ...event
    };
    
    this.events.set(id, updatedEvent);
    return updatedEvent;
  }

  // Event Participants methods
  async getEventParticipant(id: number): Promise<EventParticipant | undefined> {
    return this.eventParticipants.get(id);
  }

  async getEventParticipantsByEvent(eventId: number): Promise<EventParticipant[]> {
    const result: EventParticipant[] = [];
    for (const participant of this.eventParticipants.values()) {
      if (participant.eventId === eventId) {
        result.push(participant);
      }
    }
    return result;
  }

  async getEventParticipantsByUser(userId: number): Promise<EventParticipant[]> {
    const result: EventParticipant[] = [];
    for (const participant of this.eventParticipants.values()) {
      if (participant.userId === userId) {
        result.push(participant);
      }
    }
    return result;
  }

  async createEventParticipant(participant: InsertEventParticipant): Promise<EventParticipant> {
    const id = this.eventParticipantId++;
    const createdAt = new Date();
    
    const newParticipant: EventParticipant = {
      id,
      ...participant,
      createdAt
    };
    
    this.eventParticipants.set(id, newParticipant);
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
    const result: Payment[] = [];
    for (const payment of this.payments.values()) {
      if (payment.userId === userId) {
        result.push(payment);
      }
    }
    return result;
  }

  async getPaymentsByEvent(eventId: number): Promise<Payment[]> {
    const result: Payment[] = [];
    for (const payment of this.payments.values()) {
      if (payment.eventId === eventId) {
        result.push(payment);
      }
    }
    return result;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = this.paymentId++;
    const createdAt = new Date();
    
    const newPayment: Payment = {
      id,
      ...payment,
      eventId: payment.eventId || null,
      paymentDate: payment.paymentDate || null,
      status: payment.status || 'pending',
      createdAt
    };
    
    this.payments.set(id, newPayment);
    return newPayment;
  }

  async updatePaymentStatus(id: number, status: string): Promise<Payment | undefined> {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    
    const updatedPayment: Payment = {
      ...payment,
      status,
      paymentDate: status === 'completed' ? new Date() : payment.paymentDate
    };
    
    this.payments.set(id, updatedPayment);
    return updatedPayment;
  }

  // Chat methods
  async getChatGroup(id: number): Promise<ChatGroup | undefined> {
    return this.chatGroups.get(id);
  }

  async getChatGroupsByEvent(eventId: number): Promise<ChatGroup[]> {
    const result: ChatGroup[] = [];
    for (const group of this.chatGroups.values()) {
      if (group.eventId === eventId) {
        result.push(group);
      }
    }
    return result;
  }

  async getChatGroupsByBusiness(businessId: number): Promise<ChatGroup[]> {
    const result: ChatGroup[] = [];
    for (const group of this.chatGroups.values()) {
      if (group.businessId === businessId) {
        result.push(group);
      }
    }
    return result;
  }

  async getChatGroupsByUser(userId: number): Promise<ChatGroup[]> {
    const result: ChatGroup[] = [];
    const userMemberships: ChatGroupMember[] = [];
    
    // Find all group memberships for this user
    for (const member of this.chatGroupMembers.values()) {
      if (member.userId === userId) {
        userMemberships.push(member);
      }
    }
    
    // Get the groups
    for (const membership of userMemberships) {
      const group = this.chatGroups.get(membership.chatGroupId);
      if (group) {
        result.push(group);
      }
    }
    
    return result;
  }

  async createChatGroup(group: InsertChatGroup): Promise<ChatGroup> {
    const id = this.chatGroupId++;
    const createdAt = new Date();
    
    const newGroup: ChatGroup = {
      id,
      ...group,
      businessId: group.businessId || null,
      eventId: group.eventId || null,
      createdAt
    };
    
    this.chatGroups.set(id, newGroup);
    return newGroup;
  }

  async addUserToChatGroup(userId: number, groupId: number): Promise<ChatGroupMember> {
    const id = this.chatGroupMemberId++;
    const joinedAt = new Date();
    
    const newMember: ChatGroupMember = {
      id,
      userId,
      chatGroupId: groupId,
      joinedAt
    };
    
    this.chatGroupMembers.set(id, newMember);
    return newMember;
  }

  // Chat Message methods
  async getChatMessages(groupId: number): Promise<ChatMessage[]> {
    const result: ChatMessage[] = [];
    for (const message of this.chatMessages.values()) {
      if (message.chatGroupId === groupId) {
        result.push(message);
      }
    }
    
    // Sort by sent time
    result.sort((a, b) => {
      if (!a.sentAt || !b.sentAt) return 0;
      return a.sentAt.getTime() - b.sentAt.getTime();
    });
    
    return result;
  }

  async getDirectMessages(userId: number, receiverId: number): Promise<ChatMessage[]> {
    const result: ChatMessage[] = [];
    for (const message of this.chatMessages.values()) {
      if ((message.senderId === userId && message.receiverId === receiverId) ||
          (message.senderId === receiverId && message.receiverId === userId)) {
        result.push(message);
      }
    }
    
    // Sort by sent time
    result.sort((a, b) => {
      if (!a.sentAt || !b.sentAt) return 0;
      return a.sentAt.getTime() - b.sentAt.getTime();
    });
    
    return result;
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const id = this.chatMessageId++;
    const sentAt = new Date();
    
    const newMessage: ChatMessage = {
      id,
      ...message,
      chatGroupId: message.chatGroupId || null,
      receiverId: message.receiverId || null,
      sentAt,
      readAt: null
    };
    
    this.chatMessages.set(id, newMessage);
    return newMessage;
  }

  async markMessagesAsRead(userId: number, groupId?: number): Promise<void> {
    const now = new Date();
    
    for (const [id, message] of this.chatMessages.entries()) {
      // Only mark messages sent to this user
      if (message.receiverId === userId) {
        // If group specified, only mark messages from that group
        if (groupId && message.chatGroupId !== groupId) {
          continue;
        }
        
        if (!message.readAt) {
          const updatedMessage: ChatMessage = {
            ...message,
            readAt: now
          };
          
          this.chatMessages.set(id, updatedMessage);
        }
      }
    }
  }
}

export const storage = new MemStorage();