import session from "express-session";
import createMemoryStore from "memorystore";
import { 
  User, InsertUser, Business, InsertBusiness, Court, InsertCourt, 
  Booking, InsertBooking, Event, InsertEvent, EventParticipant, 
  InsertEventParticipant, Payment, InsertPayment, ChatGroup, 
  InsertChatGroup, ChatGroupMember, ChatMessage, InsertChatMessage 
} from "@shared/schema";

const MemoryStore = createMemoryStore(session);

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
  sessionStore: session.SessionStore;
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
  
  sessionStore: session.SessionStore;
  
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

export const storage = new MemStorage();