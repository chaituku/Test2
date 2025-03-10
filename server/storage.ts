import session from "express-session";
import createMemoryStore from "memorystore";
import { User, InsertUser, Business, InsertBusiness, Court, InsertCourt, Booking, InsertBooking } from "@shared/schema";

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
  
  // Session store
  sessionStore: session.SessionStore;
}

// In-memory storage implementation
export class MemStorage implements IStorage {
  private users: User[] = [];
  private businesses: Business[] = [];
  private courts: Court[] = [];
  private bookings: Booking[] = [];
  
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
}

// Export singleton storage instance
export const storage = new MemStorage();