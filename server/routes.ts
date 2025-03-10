import type { Express } from "express";
import { createServer, type Server } from "http";
import * as WebSocket from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import crypto from "crypto";

// Helper functions for message encryption/decryption
const encryptMessage = (message: string): string => {
  try {
    // Use environment variable for key or fallback to a default (in production, never use a default)
    const key = process.env.MESSAGE_ENCRYPTION_KEY || 'badminton-platform-secure-communications-key';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32)), iv);
    
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV concatenated with the encrypted message (IV is needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Error encrypting message:', error);
    return message; // Fallback to unencrypted if encryption fails
  }
};

const decryptMessage = (encryptedMessage: string): string => {
  try {
    const key = process.env.MESSAGE_ENCRYPTION_KEY || 'badminton-platform-secure-communications-key';
    
    // Split IV and encrypted message
    const parts = encryptedMessage.split(':');
    if (parts.length !== 2) {
      return encryptedMessage; // Not in expected format, return as is
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key.slice(0, 32)), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting message:', error);
    return 'Message could not be decrypted'; // Provide feedback if decryption fails
  }
};

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

  // Event routes
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getUpcomingEvents();
      res.json(events);
    } catch (error) {
      console.error("Error getting events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/events/organizer", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
      const events = await storage.getEventsByOrganizer(req.user.id);
      res.json(events);
    } catch (error) {
      console.error("Error getting organizer events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "organizer") {
      return res.status(403).json({ error: "Only organizers can create events" });
    }
    
    try {
      const eventData = {
        ...req.body,
        organizerId: req.user.id,
        status: "open", // Initial status is open for enrollment
        currentParticipants: 0
      };
      
      const event = await storage.createEvent(eventData);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/events/:id/status", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "organizer") {
      return res.status(403).json({ error: "Only organizers can update event status" });
    }
    
    const eventId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!["open", "closed", "cancelled", "completed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }
    
    try {
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (event.organizerId !== req.user.id) {
        return res.status(403).json({ error: "You can only update your own events" });
      }
      
      const updatedEvent = await storage.updateEventStatus(eventId, status);
      res.json(updatedEvent);
    } catch (error) {
      console.error("Error updating event status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/events/:id/participants", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const eventId = parseInt(req.params.id);
    
    try {
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Only the organizer or a participant can view the participant list
      const isOrganizer = event.organizerId === req.user.id;
      const participants = await storage.getEventParticipantsByEvent(eventId);
      const isParticipant = participants.some(p => p.userId === req.user.id);
      
      if (!isOrganizer && !isParticipant) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(participants);
    } catch (error) {
      console.error("Error getting event participants:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events/:id/enroll", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const eventId = parseInt(req.params.id);
    
    try {
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (event.status !== "open") {
        return res.status(400).json({ error: "Event is not open for enrollment" });
      }
      
      // Check if user is already enrolled
      const participants = await storage.getEventParticipantsByEvent(eventId);
      const existingParticipant = participants.find(p => p.userId === req.user.id);
      
      if (existingParticipant) {
        return res.status(400).json({ error: "You are already enrolled in this event" });
      }
      
      // Determine if user should be added to waitlist
      const isWaitlisted = event.currentParticipants >= event.maxParticipants;
      const participantStatus = isWaitlisted ? "waitlisted" : "confirmed";
      
      // Create participant record
      const participant = await storage.createEventParticipant({
        eventId,
        userId: req.user.id,
        status: participantStatus,
        paymentStatus: event.price > 0 ? "pending" : "not_required"
      });
      
      // Update event participant count if not waitlisted
      if (!isWaitlisted) {
        await storage.updateEventParticipantCount(eventId, event.currentParticipants + 1);
      }
      
      res.status(201).json(participant);
    } catch (error) {
      console.error("Error enrolling in event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events/:id/unenroll", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const eventId = parseInt(req.params.id);
    
    try {
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Check if user is enrolled
      const participants = await storage.getEventParticipantsByEvent(eventId);
      const existingParticipant = participants.find(p => p.userId === req.user.id);
      
      if (!existingParticipant) {
        return res.status(400).json({ error: "You are not enrolled in this event" });
      }
      
      // Process unenrollment based on current status
      if (existingParticipant.status === "waitlisted") {
        // Waitlisted users can always unenroll
        await storage.updateEventParticipantStatus(
          existingParticipant.id, 
          "cancelled", 
          existingParticipant.paymentStatus
        );
        
        res.json({ message: "Successfully unenrolled from waitlist" });
      } else if (existingParticipant.status === "confirmed") {
        // For confirmed participants, check if there's a waitlist
        const waitlistedParticipants = participants.filter(p => p.status === "waitlisted");
        
        if (waitlistedParticipants.length > 0) {
          // If there are waitlisted participants, move the first one to confirmed
          const nextParticipant = waitlistedParticipants[0];
          await storage.updateEventParticipantStatus(
            nextParticipant.id, 
            "confirmed", 
            nextParticipant.paymentStatus
          );
          
          // Update the current participant to cancelled
          await storage.updateEventParticipantStatus(
            existingParticipant.id, 
            "cancelled", 
            existingParticipant.paymentStatus
          );
          
          res.json({ message: "Successfully unenrolled. A waitlisted participant has been confirmed." });
        } else {
          // If no waitlist, check if event allows direct cancellation
          if (event.allowDirectCancellation) {
            await storage.updateEventParticipantStatus(
              existingParticipant.id, 
              "cancelled", 
              existingParticipant.paymentStatus
            );
            
            // Decrease participant count
            await storage.updateEventParticipantCount(eventId, event.currentParticipants - 1);
            
            res.json({ message: "Successfully unenrolled from event" });
          } else {
            // Request organizer approval for cancellation
            await storage.updateEventParticipantStatus(
              existingParticipant.id, 
              "pending_cancellation", 
              existingParticipant.paymentStatus
            );
            
            res.json({ message: "Cancellation request submitted to the organizer" });
          }
        }
      } else {
        res.status(400).json({ error: "Cannot unenroll with current status: " + existingParticipant.status });
      }
    } catch (error) {
      console.error("Error unenrolling from event:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/events/:eventId/participants/:participantId", async (req, res) => {
    if (!req.isAuthenticated() || req.user.role !== "organizer") {
      return res.status(403).json({ error: "Only organizers can update participants" });
    }
    
    const eventId = parseInt(req.params.eventId);
    const participantId = parseInt(req.params.participantId);
    const { status, paymentStatus } = req.body;
    
    try {
      const event = await storage.getEvent(eventId);
      
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      if (event.organizerId !== req.user.id) {
        return res.status(403).json({ error: "You can only update participants for your own events" });
      }
      
      const participant = await storage.getEventParticipant(participantId);
      
      if (!participant || participant.eventId !== eventId) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      // Handle participant status changes
      if (status) {
        if (status === "confirmed" && participant.status !== "confirmed") {
          // If confirming a participant, update event participant count
          await storage.updateEventParticipantCount(eventId, event.currentParticipants + 1);
        } else if (participant.status === "confirmed" && (status === "cancelled" || status === "rejected")) {
          // If cancelling a confirmed participant, decrease participant count
          await storage.updateEventParticipantCount(eventId, event.currentParticipants - 1);
          
          // If there are waitlisted participants, move one to confirmed
          const waitlistedParticipants = await storage.getEventParticipantsByEvent(eventId);
          const nextParticipant = waitlistedParticipants.find(p => p.status === "waitlisted");
          
          if (nextParticipant) {
            await storage.updateEventParticipantStatus(
              nextParticipant.id, 
              "confirmed", 
              nextParticipant.paymentStatus
            );
            
            // Keep participant count the same (one removed, one added)
            await storage.updateEventParticipantCount(eventId, event.currentParticipants);
          }
        }
      }
      
      const updatedParticipant = await storage.updateEventParticipantStatus(
        participantId, 
        status || participant.status, 
        paymentStatus || participant.paymentStatus
      );
      
      res.json(updatedParticipant);
    } catch (error) {
      console.error("Error updating participant:", error);
      res.status(500).json({ error: "Internal server error" });
    }
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
  
  // Setup WebSocket server
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  
  // Map to store active connections
  const activeConnections = new Map();

  // Heartbeat interval in milliseconds (30 seconds)
  const HEARTBEAT_INTERVAL = 30000;
  
  // Start server heartbeat
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        // If client didn't respond to previous heartbeat, terminate
        return ws.terminate();
      }
      
      // Mark as not alive until pong is received
      ws.isAlive = false;
      
      // Send heartbeat
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        }));
      }
    });
  }, HEARTBEAT_INTERVAL);
  
  // Clean up interval on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
  
  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    
    // Initialize connection properties
    ws.isAlive = true;
    ws.userId = null;
    
    // Handle authentication and store user information
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle different message types
        switch (data.type) {
          case 'auth':
            // Authenticate user and store their ID with the connection
            if (data.userId) {
              activeConnections.set(data.userId, ws);
              ws.userId = data.userId; // Store userId directly on the connection
              console.log(`User ${data.userId} authenticated on WebSocket`);
              
              // Send acknowledgment
              ws.send(JSON.stringify({ 
                type: 'auth_success',
                message: 'Authentication successful' 
              }));
            }
            break;
            
          case 'chat_message':
            // Handle a new chat message
            if (data.message && data.senderId && (data.receiverId || data.chatGroupId)) {
              // Encrypt message content before storing in database
              const encryptedContent = encryptMessage(data.message);
              
              // Store the encrypted message
              const chatMessage = await storage.createChatMessage({
                senderId: data.senderId,
                receiverId: data.receiverId,
                chatGroupId: data.chatGroupId,
                content: encryptedContent,
                messageId: data.messageId
              });
              
              // Create message with decrypted content for sending to clients
              const messageWithDecryptedContent = {
                ...chatMessage,
                content: data.message // Use original unencrypted message for clients
              };
              
              // Include message ID in the response for delivery confirmation
              const responseData = {
                type: 'chat_message',
                messageId: data.messageId || `server-${Date.now()}`,
                message: messageWithDecryptedContent
              };
              
              // Broadcast to chat group members if it's a group chat
              if (data.chatGroupId) {
                const groupMembers = await storage.getEventParticipantsByEvent(data.chatGroupId);
                groupMembers.forEach(member => {
                  const memberWs = activeConnections.get(member.userId);
                  if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                    memberWs.send(JSON.stringify(responseData));
                  }
                });
              } 
              // Send to specific user if it's a direct message
              else if (data.receiverId) {
                const receiverWs = activeConnections.get(data.receiverId);
                if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
                  receiverWs.send(JSON.stringify(responseData));
                }
              }
              
              // Send delivery confirmation back to sender
              if (data.messageId) {
                ws.send(JSON.stringify({
                  type: 'message_delivered',
                  messageId: data.messageId,
                  timestamp: Date.now()
                }));
              }
            }
            break;
            
          case 'message_delivered':
            // Forward delivery confirmation to the original sender
            if (data.messageId && data.userId) {
              const originalSenderId = data.messageId.split('-').pop();
              if (originalSenderId) {
                const senderWs = activeConnections.get(parseInt(originalSenderId));
                if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                  senderWs.send(JSON.stringify({
                    type: 'message_delivered',
                    messageId: data.messageId,
                    userId: data.userId,
                    timestamp: Date.now()
                  }));
                }
              }
            }
            break;
            
          case 'message_read':
            // Handle message read confirmation
            if (data.messageId && data.userId) {
              // Forward read confirmation to the original sender
              const originalSenderId = data.messageId.split('-').pop();
              if (originalSenderId) {
                const senderWs = activeConnections.get(parseInt(originalSenderId));
                if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                  senderWs.send(JSON.stringify({
                    type: 'message_read',
                    messageId: data.messageId,
                    userId: data.userId,
                    timestamp: Date.now()
                  }));
                }
              }
            }
            break;
            
          case 'mark_read':
            // Mark messages as read
            if (data.userId && (data.chatGroupId || data.senderId)) {
              await storage.markMessagesAsRead(data.userId, data.chatGroupId);
              console.log(`Marked messages as read for user ${data.userId}`);
              
              // Notify the sender that their messages were read
              if (data.senderId) {
                const senderWs = activeConnections.get(data.senderId);
                if (senderWs && senderWs.readyState === WebSocket.OPEN) {
                  senderWs.send(JSON.stringify({
                    type: 'message_read',
                    userId: data.userId,
                    timestamp: Date.now()
                  }));
                }
              }
            }
            break;
            
          case 'typing':
          case 'typing_stop':
            // Handle typing indicators
            if (data.userId && (data.chatGroupId || data.recipientId)) {
              if (data.chatGroupId) {
                // Broadcast typing status to all group members
                const groupMembers = await storage.getEventParticipantsByEvent(data.chatGroupId);
                groupMembers.forEach(member => {
                  if (member.userId !== data.userId) {
                    const memberWs = activeConnections.get(member.userId);
                    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                      memberWs.send(JSON.stringify({
                        type: data.type,
                        userId: data.userId,
                        chatGroupId: data.chatGroupId,
                        timestamp: data.timestamp || Date.now()
                      }));
                    }
                  }
                });
              } else if (data.recipientId) {
                // Send typing status to specific recipient
                const recipientWs = activeConnections.get(data.recipientId);
                if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                  recipientWs.send(JSON.stringify({
                    type: data.type,
                    userId: data.userId,
                    timestamp: data.timestamp || Date.now()
                  }));
                }
              }
            }
            break;
            
          case 'heartbeat':
            // Respond to client heartbeat
            ws.isAlive = true;
            ws.send(JSON.stringify({
              type: 'heartbeat_ack',
              timestamp: Date.now()
            }));
            break;
            
          case 'heartbeat_ack':
            // Client acknowledged heartbeat
            ws.isAlive = true;
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: 'Failed to process message' 
        }));
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      // Remove the connection from active connections
      if (ws.userId) {
        activeConnections.delete(ws.userId);
        console.log(`User ${ws.userId} disconnected from WebSocket`);
      } else {
        // If userId isn't directly on the connection, search through the map
        for (const [userId, connection] of activeConnections.entries()) {
          if (connection === ws) {
            activeConnections.delete(userId);
            console.log(`User ${userId} disconnected from WebSocket`);
            break;
          }
        }
      }
    });
  });
  
  return httpServer;
}