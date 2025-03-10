import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";

export function registerRoutes(app: Express): Server {
  // Sets up authentication routes (/api/register, /api/login, /api/logout, /api/user)
  setupAuth(app);

  // Business routes
  app.get("/api/businesses", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: "Unauthorized" });
    
    // If user is business owner, return their businesses
    if (req.user.role === "business") {
      const businesses = await storage.getBusinessesByOwner(req.user.id);
      return res.json(businesses);
    }
    
    // If regular user, return an empty array for now 
    // (in a real app, we might show publicly visible businesses)
    return res.json([]);
  });

  app.post("/api/businesses", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "business") {
      return res.status(403).json({ error: "Only business owners can create businesses" });
    }
    
    const business = await storage.createBusiness({
      ...req.body,
      ownerId: req.user.id,
    });
    
    res.status(201).json(business);
  });

  app.get("/api/businesses/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const business = await storage.getBusiness(id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Business owners can only view their own businesses
    if (req.user.role === "business" && business.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    res.json(business);
  });

  // Court routes
  app.get("/api/businesses/:businessId/courts", async (req, res) => {
    const businessId = parseInt(req.params.businessId);
    const business = await storage.getBusiness(businessId);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Business owners can only view courts in their own businesses
    if (req.user?.role === "business" && business.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const courts = await storage.getCourtsByBusiness(businessId);
    res.json(courts);
  });

  app.post("/api/businesses/:businessId/courts", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "business") {
      return res.status(403).json({ error: "Only business owners can create courts" });
    }
    
    const businessId = parseInt(req.params.businessId);
    const business = await storage.getBusiness(businessId);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    if (business.ownerId !== req.user.id) {
      return res.status(403).json({ error: "You can only create courts for your own business" });
    }
    
    const court = await storage.createCourt({
      ...req.body,
      businessId,
    });
    
    res.status(201).json(court);
  });

  app.patch("/api/courts/:id/availability", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "business") {
      return res.status(403).json({ error: "Only business owners can update court availability" });
    }
    
    const id = parseInt(req.params.id);
    const { isAvailable } = req.body;
    
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ error: "isAvailable must be a boolean" });
    }
    
    const court = await storage.getCourt(id);
    
    if (!court) {
      return res.status(404).json({ error: "Court not found" });
    }
    
    const business = await storage.getBusiness(court.businessId);
    
    if (business?.ownerId !== req.user.id) {
      return res.status(403).json({ error: "You can only update courts in your own business" });
    }
    
    const updatedCourt = await storage.updateCourtAvailability(id, isAvailable);
    res.json(updatedCourt);
  });

  // Booking routes
  app.get("/api/bookings/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const bookings = await storage.getBookingsByUser(req.user.id);
    res.json(bookings);
  });

  app.get("/api/courts/:courtId/bookings", async (req, res) => {
    const courtId = parseInt(req.params.courtId);
    const court = await storage.getCourt(courtId);
    
    if (!court) {
      return res.status(404).json({ error: "Court not found" });
    }
    
    // If user is a business owner, check if they own the business
    if (req.user?.role === "business") {
      const business = await storage.getBusiness(court.businessId);
      if (business?.ownerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    
    const bookings = await storage.getBookingsByCourt(courtId);
    res.json(bookings);
  });

  app.post("/api/courts/:courtId/bookings", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const courtId = parseInt(req.params.courtId);
    const court = await storage.getCourt(courtId);
    
    if (!court) {
      return res.status(404).json({ error: "Court not found" });
    }
    
    if (!court.isAvailable) {
      return res.status(400).json({ error: "This court is not available for booking" });
    }
    
    const { startTime, endTime } = req.body;
    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Invalid start or end time" });
    }
    
    if (startDate >= endDate) {
      return res.status(400).json({ error: "End time must be after start time" });
    }
    
    // Check if there's a 30-minute difference
    const diffMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
    if (diffMinutes !== 30) {
      return res.status(400).json({ error: "Booking must be for a 30-minute time slot" });
    }
    
    // Check for overlapping bookings
    const overlappingBookings = await storage.getBookingsByTimeRange(courtId, startDate, endDate);
    if (overlappingBookings.length > 0) {
      return res.status(400).json({ error: "This time slot is already booked" });
    }
    
    const booking = await storage.createBooking({
      courtId,
      userId: req.user.id,
      startTime: startDate,
      endTime: endDate,
      status: "confirmed",
    });
    
    res.status(201).json(booking);
  });

  const httpServer = createServer(app);
  return httpServer;
}