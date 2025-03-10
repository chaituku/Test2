import { Express } from "express";
import { createServer, Server } from "http";
import { WebSocketServer } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { eq, and, gt, lt, between } from "drizzle-orm";
import { 
  insertBusinessSchema, 
  insertCourtSchema,
  insertBookingSchema,
  insertEventSchema,
  insertEventParticipantSchema,
  insertPaymentSchema,
  insertChatMessageSchema,
  insertChatGroupSchema
} from "@shared/schema";

export function registerRoutes(app: Express): Server {
  // Set up authentication routes
  setupAuth(app);
  
  // Create HTTP server for both API and WebSockets
  const httpServer = createServer(app);
  
  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Received message:', data);
        
        // Echo back for now - will implement proper handling in future
        ws.send(JSON.stringify({
          type: 'message_delivered',
          messageId: data.messageId,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });
  
  // API Routes
  
  // Business routes
  app.get("/api/businesses", async (req, res) => {
    try {
      if (req.user && req.user.role === "business") {
        const businesses = await storage.getBusinessesByOwner(req.user.id);
        return res.json(businesses);
      } else {
        // For regular users, return all businesses
        // This would likely be paginated and filtered in a real application
        // For now, we'll return a limited number
        const businesses = await storage.getBusinessesByOwner(0); // Special case for demo only
        return res.json(businesses);
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.get("/api/businesses/:id", async (req, res) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }
      
      // Check if the user is authorized to see this business's details
      if (req.user && (req.user.role === "business" && req.user.id !== business.ownerId)) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      return res.json(business);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.post("/api/businesses", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (req.user.role !== "business") {
        return res.status(403).json({ error: "Only business accounts can create businesses" });
      }
      
      const validationResult = insertBusinessSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const businessData = {
        ...validationResult.data,
        ownerId: req.user.id
      };
      
      const business = await storage.createBusiness(businessData);
      return res.status(201).json(business);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Court routes
  app.get("/api/businesses/:businessId/courts", async (req, res) => {
    try {
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }
      
      // Check if the user is authorized
      if (req.user && req.user.role === "business" && req.user.id !== business.ownerId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const courts = await storage.getCourtsByBusiness(businessId);
      return res.json(courts);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.post("/api/businesses/:businessId/courts", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }
      
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }
      
      // Check if user owns this business
      if (req.user.role !== "business" || req.user.id !== business.ownerId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const validationResult = insertCourtSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const courtData = {
        ...validationResult.data,
        businessId
      };
      
      const court = await storage.createCourt(courtData);
      return res.status(201).json(court);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.patch("/api/courts/:id/availability", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const courtId = parseInt(req.params.id);
      if (isNaN(courtId)) {
        return res.status(400).json({ error: "Invalid court ID" });
      }
      
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      const business = await storage.getBusiness(court.businessId);
      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }
      
      // Check if user owns this business
      if (req.user.role !== "business" || req.user.id !== business.ownerId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const { isAvailable } = req.body;
      if (typeof isAvailable !== 'boolean') {
        return res.status(400).json({ error: "isAvailable must be a boolean" });
      }
      
      const updatedCourt = await storage.updateCourtAvailability(courtId, isAvailable);
      return res.json(updatedCourt);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Event routes
  app.get("/api/events", async (req, res) => {
    try {
      const { type, upcoming } = req.query;
      
      let events;
      if (type) {
        events = await storage.getEventsByType(type as string);
      } else if (upcoming === 'true') {
        events = await storage.getUpcomingEvents();
      } else if (req.user && req.user.role === "organizer") {
        events = await storage.getEventsByOrganizer(req.user.id);
      } else {
        events = await storage.getUpcomingEvents();
      }
      
      // Add some computed properties for the frontend
      const enhancedEvents = await Promise.all(events.map(async (event) => {
        const participants = await storage.getEventParticipantsByEvent(event.id);
        return {
          ...event,
          currentParticipants: participants.length,
          maxParticipants: event.capacity,
          price: event.fee
        };
      }));
      
      return res.json(enhancedEvents);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.post("/api/events", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (req.user.role !== "organizer") {
        return res.status(403).json({ error: "Only organizers can create events" });
      }
      
      const validationResult = insertEventSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const eventData = {
        ...validationResult.data,
        organizerId: req.user.id
      };
      
      const event = await storage.createEvent(eventData);
      return res.status(201).json(event);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.get("/api/events/:id", async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const participants = await storage.getEventParticipantsByEvent(eventId);
      
      // Add some computed properties for the frontend
      const enhancedEvent = {
        ...event,
        currentParticipants: participants.length,
        maxParticipants: event.capacity,
        price: event.fee,
        allowDirectCancellation: event.status === 'open' // Only allow cancellation if event is still open
      };
      
      return res.json(enhancedEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.patch("/api/events/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Check if user is the organizer
      if (req.user.role !== "organizer" || req.user.id !== event.organizerId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      const { status } = req.body;
      if (!status || typeof status !== 'string') {
        return res.status(400).json({ error: "Status is required" });
      }
      
      // If cancelling, check if there are participants
      if (status === 'cancelled') {
        const participants = await storage.getEventParticipantsByEvent(eventId);
        if (participants.length > 0) {
          // In a real app, would handle refunds and notifications here
          // For now, we'll just update the status
          const updatedEvent = await storage.updateEventStatus(eventId, status);
          
          // Update all participants to cancelled
          for (const participant of participants) {
            await storage.updateEventParticipantStatus(participant.id, 'cancelled', participant.paymentStatus);
          }
          
          return res.json(updatedEvent);
        }
      }
      
      const updatedEvent = await storage.updateEventStatus(eventId, status);
      return res.json(updatedEvent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Event participation routes
  app.post("/api/events/:eventId/participants", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const eventId = parseInt(req.params.eventId);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Check if event is open for registration
      if (event.status !== 'open') {
        return res.status(400).json({ error: "Event is not open for registration" });
      }
      
      // Check if event is at capacity
      const participants = await storage.getEventParticipantsByEvent(eventId);
      if (event.capacity && participants.length >= event.capacity) {
        return res.status(400).json({ error: "Event is at capacity" });
      }
      
      // Check if user is already registered
      const existingParticipant = participants.find(p => p.userId === req.user.id);
      if (existingParticipant) {
        return res.status(400).json({ error: "Already registered for this event" });
      }
      
      const validationResult = insertEventParticipantSchema.safeParse({
        eventId,
        userId: req.user.id,
        status: 'registered',
        paymentStatus: event.fee ? 'pending' : 'not_required'
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const participant = await storage.createEventParticipant(validationResult.data);
      
      // Update participant count
      await storage.updateEventParticipantCount(eventId, participants.length + 1);
      
      // If event requires payment, create a payment record
      if (event.fee) {
        const paymentData = {
          userId: req.user.id,
          eventId,
          amount: event.fee,
          status: 'pending'
        };
        
        await storage.createPayment(paymentData);
      }
      
      return res.status(201).json(participant);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.delete("/api/events/:eventId/participants/:participantId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const eventId = parseInt(req.params.eventId);
      const participantId = parseInt(req.params.participantId);
      
      if (isNaN(eventId) || isNaN(participantId)) {
        return res.status(400).json({ error: "Invalid IDs" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const participant = await storage.getEventParticipant(participantId);
      if (!participant || participant.eventId !== eventId) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      // Check if user is authorized (either the participant or the event organizer)
      if (req.user.role !== "organizer" && req.user.id !== participant.userId) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      
      // If event has already started, only the organizer can cancel
      const now = new Date();
      if (event.startDate <= now && req.user.role !== "organizer") {
        return res.status(400).json({ error: "Cannot cancel after event has started" });
      }
      
      // Update participant status to cancelled
      const updatedParticipant = await storage.updateEventParticipantStatus(
        participantId, 
        'cancelled', 
        participant.paymentStatus
      );
      
      // Update participant count
      const participants = await storage.getEventParticipantsByEvent(eventId);
      const activeParticipants = participants.filter(p => p.status !== 'cancelled');
      await storage.updateEventParticipantCount(eventId, activeParticipants.length);
      
      return res.json(updatedParticipant);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Booking routes
  app.get("/api/bookings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // For regular users, return their bookings
      if (req.user.role === "user") {
        const bookings = await storage.getBookingsByUser(req.user.id);
        return res.json(bookings);
      }
      
      // For business users, return all bookings for their courts
      else if (req.user.role === "business") {
        const businesses = await storage.getBusinessesByOwner(req.user.id);
        let allBookings = [];
        
        for (const business of businesses) {
          const courts = await storage.getCourtsByBusiness(business.id);
          for (const court of courts) {
            const bookings = await storage.getBookingsByCourt(court.id);
            allBookings = [...allBookings, ...bookings];
          }
        }
        
        return res.json(allBookings);
      }
      
      return res.status(403).json({ error: "Unauthorized" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.get("/api/courts/:courtId/bookings", async (req, res) => {
    try {
      const courtId = parseInt(req.params.courtId);
      if (isNaN(courtId)) {
        return res.status(400).json({ error: "Invalid court ID" });
      }
      
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      // Get date range from query params, if provided
      const { startDate, endDate } = req.query;
      
      if (startDate && endDate) {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return res.status(400).json({ error: "Invalid date format" });
        }
        
        const bookings = await storage.getBookingsByTimeRange(courtId, start, end);
        return res.json(bookings);
      }
      
      const bookings = await storage.getBookingsByCourt(courtId);
      return res.json(bookings);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.post("/api/courts/:courtId/bookings", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const courtId = parseInt(req.params.courtId);
      if (isNaN(courtId)) {
        return res.status(400).json({ error: "Invalid court ID" });
      }
      
      const court = await storage.getCourt(courtId);
      if (!court) {
        return res.status(404).json({ error: "Court not found" });
      }
      
      // Check if court is available
      if (!court.isAvailable) {
        return res.status(400).json({ error: "Court is not available for booking" });
      }
      
      const validationResult = insertBookingSchema.safeParse({
        ...req.body,
        courtId,
        userId: req.user.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const { startTime, endTime } = validationResult.data;
      
      // Check for conflicting bookings
      const existingBookings = await storage.getBookingsByTimeRange(
        courtId,
        new Date(startTime),
        new Date(endTime)
      );
      
      if (existingBookings.length > 0) {
        return res.status(400).json({ error: "Time slot already booked" });
      }
      
      const booking = await storage.createBooking(validationResult.data);
      return res.status(201).json(booking);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  // Chat routes
  app.get("/api/chat/groups", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const chatGroups = await storage.getChatGroupsByUser(req.user.id);
      return res.json(chatGroups);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  app.post("/api/chat/groups", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const validationResult = insertChatGroupSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      // Create the chat group
      const chatGroup = await storage.createChatGroup(validationResult.data);
      
      // Add the creator as a member
      await storage.addUserToChatGroup(req.user.id, chatGroup.id);
      
      // If other members were specified, add them too
      if (req.body.members && Array.isArray(req.body.members)) {
        for (const memberId of req.body.members) {
          await storage.addUserToChatGroup(memberId, chatGroup.id);
        }
      }
      
      return res.status(201).json(chatGroup);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.get("/api/chat/groups/:id/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = parseInt(req.params.id);
      if (isNaN(groupId)) {
        return res.status(400).json({ error: "Invalid group ID" });
      }
      
      const chatGroup = await storage.getChatGroup(groupId);
      if (!chatGroup) {
        return res.status(404).json({ error: "Chat group not found" });
      }
      
      // Check if user is a member of this group
      const userGroups = await storage.getChatGroupsByUser(req.user.id);
      const isMember = userGroups.some(g => g.id === groupId);
      
      if (!isMember) {
        return res.status(403).json({ error: "Not a member of this chat group" });
      }
      
      const messages = await storage.getChatMessages(groupId);
      
      // Mark messages as read
      await storage.markMessagesAsRead(req.user.id, groupId);
      
      return res.json(messages);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.post("/api/chat/messages", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const validationResult = insertChatMessageSchema.safeParse({
        ...req.body,
        senderId: req.user.id
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ error: validationResult.error.errors });
      }
      
      const messageData = validationResult.data;
      
      // Check that either chatGroupId or receiverId is present
      if (!messageData.chatGroupId && !messageData.receiverId) {
        return res.status(400).json({ error: "Either chatGroupId or receiverId is required" });
      }
      
      // If sending to a group, check if user is a member
      if (messageData.chatGroupId) {
        const userGroups = await storage.getChatGroupsByUser(req.user.id);
        const isMember = userGroups.some(g => g.id === messageData.chatGroupId);
        
        if (!isMember) {
          return res.status(403).json({ error: "Not a member of this chat group" });
        }
      }
      
      const message = await storage.createChatMessage(messageData);
      
      // In a real app, would broadcast via WebSocket here
      // For now, we'll just return the created message
      
      return res.status(201).json(message);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });
  
  app.get("/api/chat/direct/:userId", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const messages = await storage.getDirectMessages(req.user.id, userId);
      
      // Mark messages as read
      await storage.markMessagesAsRead(req.user.id);
      
      return res.json(messages);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    }
  });

  return httpServer;
}