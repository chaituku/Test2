import { ChatMessage } from "../../shared/schema";

// Define message types
export type MessageType = 
  'auth' | 
  'auth_success' | 
  'chat_message' | 
  'message_delivered' | 
  'message_read' | 
  'mark_read' | 
  'typing' | 
  'typing_stop' | 
  'heartbeat' | 
  'heartbeat_ack' | 
  'error';

// Message handlers for different message types
type MessageHandler = (message: ChatMessage) => void;
type DeliveryConfirmationHandler = (messageId: string) => void;
type TypingIndicatorHandler = (userId: number, isTyping: boolean) => void;

interface WebSocketMessage {
  type: MessageType;
  messageId?: string;
  message?: string | ChatMessage;
  userId?: number;
  recipientId?: number;
  chatGroupId?: number;
  timestamp?: number;
}

interface QueuedMessage {
  payload: any;
  attempts: number;
  timestamp: number;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private deliveryHandlers: DeliveryConfirmationHandler[] = [];
  private typingHandlers: TypingIndicatorHandler[] = [];
  private reconnectInterval: number = 5000; // 5 seconds
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private userId: number | null = null;
  private heartbeatInterval: number | null = null;
  private heartbeatTimeout: number | null = null;
  private offlineQueue: QueuedMessage[] = [];
  private pendingMessages: Map<string, QueuedMessage> = new Map();
  private isConnecting: boolean = false;
  private typingTimeout: number | null = null;
  private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';

  constructor() {
    this.connect = this.connect.bind(this);
    this.onOpen = this.onOpen.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onError = this.onError.bind(this);
    this.sendHeartbeat = this.sendHeartbeat.bind(this);
    
    // Load any queued messages from localStorage on initialization
    this.loadOfflineQueue();
    
    // Listen for online/offline events to manage connection
    window.addEventListener('online', () => {
      console.log('Network is online, attempting to reconnect WebSocket');
      if (this.userId && this.connectionStatus !== 'connected' && !this.isConnecting) {
        this.connect(this.userId);
      }
    });
    
    window.addEventListener('offline', () => {
      console.log('Network is offline, WebSocket will be disconnected');
      this.dispatchEvent('websocket-error', 'Network connection lost');
      this.setConnectionStatus('disconnected');
    });
  }

  connect(userId: number): void {
    if (this.isConnecting) {
      console.log('WebSocket connection already in progress');
      return;
    }
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.isConnecting = true;
    this.userId = userId;
    this.setConnectionStatus('connecting');
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    try {
      this.socket = new WebSocket(wsUrl);
      
      this.socket.addEventListener('open', this.onOpen);
      this.socket.addEventListener('message', this.onMessage);
      this.socket.addEventListener('close', this.onClose);
      this.socket.addEventListener('error', this.onError);
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.isConnecting = false;
      this.setConnectionStatus('error');
      this.dispatchEvent('websocket-error', 'Failed to create WebSocket connection');
    }
  }

  disconnect(): void {
    this.clearHeartbeat();
    if (this.socket) {
      this.socket.close(1000, 'Client disconnected');
      this.socket = null;
    }
    this.setConnectionStatus('disconnected');
  }

  // Message sending with unique IDs for delivery confirmation
  sendChatMessage(message: string, recipientId?: number, chatGroupId?: number): string | null {
    const messageId = this.generateMessageId();
    
    const payload = {
      type: 'chat_message' as MessageType,
      messageId,
      senderId: this.userId,
      receiverId: recipientId,
      chatGroupId: chatGroupId,
      message: message,
      timestamp: Date.now()
    };
    
    const success = this.sendOrQueueMessage(payload);
    return success ? messageId : null;
  }

  markMessagesAsRead(chatGroupId?: number, senderId?: number): void {
    const payload = {
      type: 'mark_read' as MessageType,
      userId: this.userId,
      chatGroupId: chatGroupId,
      senderId: senderId
    };

    this.sendOrQueueMessage(payload);
  }

  // Send typing indicator
  sendTypingIndicator(isTyping: boolean, recipientId?: number, chatGroupId?: number): void {
    // Clear any existing typing timeout
    if (this.typingTimeout !== null) {
      window.clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
    
    const type = isTyping ? 'typing' : 'typing_stop';
    
    const payload = {
      type: type as MessageType,
      userId: this.userId,
      recipientId: recipientId,
      chatGroupId: chatGroupId,
      timestamp: Date.now()
    };
    
    this.sendOrQueueMessage(payload);
    
    // If typing is active, set a timeout to automatically send a typing_stop
    // after 5 seconds if no new typing indicator is sent
    if (isTyping) {
      this.typingTimeout = window.setTimeout(() => {
        this.sendTypingIndicator(false, recipientId, chatGroupId);
      }, 5000);
    }
  }

  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  addDeliveryConfirmationHandler(handler: DeliveryConfirmationHandler): void {
    this.deliveryHandlers.push(handler);
  }
  
  removeDeliveryConfirmationHandler(handler: DeliveryConfirmationHandler): void {
    this.deliveryHandlers = this.deliveryHandlers.filter(h => h !== handler);
  }
  
  addTypingIndicatorHandler(handler: TypingIndicatorHandler): void {
    this.typingHandlers.push(handler);
  }
  
  removeTypingIndicatorHandler(handler: TypingIndicatorHandler): void {
    this.typingHandlers = this.typingHandlers.filter(h => h !== handler);
  }

  // Get the current connection status
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
    return this.connectionStatus;
  }

  // Helper method to dispatch custom events
  private dispatchEvent(eventName: string, detail?: any): void {
    const event = new CustomEvent(eventName, { detail });
    window.dispatchEvent(event);
  }

  private setConnectionStatus(status: 'connected' | 'connecting' | 'disconnected' | 'error'): void {
    this.connectionStatus = status;
    this.dispatchEvent('websocket-status-change', status);
  }

  private onOpen(): void {
    console.log('WebSocket connection established');
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.setConnectionStatus('connected');
    
    // Dispatch connection open event
    this.dispatchEvent('websocket-open');
    
    // Authenticate the WebSocket connection
    if (this.userId && this.socket) {
      const authPayload = {
        type: 'auth' as MessageType,
        userId: this.userId
      };
      
      this.socket.send(JSON.stringify(authPayload));
    }
    
    // Start heartbeat after successful authentication
  }

  private onMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as WebSocketMessage;
      
      switch (data.type) {
        case 'auth_success':
          console.log('WebSocket authentication successful');
          this.dispatchEvent('websocket-auth-success');
          
          // Start heartbeat after successful authentication
          this.startHeartbeat();
          
          // Process any queued messages once authenticated
          this.processOfflineQueue();
          break;
          
        case 'chat_message':
          if (data.message && typeof data.message !== 'string') {
            // Notify all registered handlers about the new message
            const chatMessage = data.message as ChatMessage;
            this.messageHandlers.forEach(handler => handler(chatMessage));
            
            // Also dispatch an event for components that might be listening
            this.dispatchEvent('websocket-message', chatMessage);
            
            // Send delivery confirmation
            if (data.messageId) {
              this.sendDeliveryConfirmation(data.messageId);
            }
          }
          break;
          
        case 'message_delivered':
          if (data.messageId) {
            // Remove from pending messages
            this.pendingMessages.delete(data.messageId);
            
            // Notify delivery handlers
            this.deliveryHandlers.forEach(handler => handler(data.messageId!));
            
            // Dispatch event
            this.dispatchEvent('websocket-message-delivered', data.messageId);
          }
          break;
          
        case 'message_read':
          if (data.messageId) {
            this.dispatchEvent('websocket-message-read', data.messageId);
          }
          break;
          
        case 'typing':
          if (data.userId) {
            this.typingHandlers.forEach(handler => 
              handler(data.userId!, true)
            );
            this.dispatchEvent('websocket-typing', {
              userId: data.userId,
              isTyping: true
            });
          }
          break;
          
        case 'typing_stop':
          if (data.userId) {
            this.typingHandlers.forEach(handler => 
              handler(data.userId!, false)
            );
            this.dispatchEvent('websocket-typing', {
              userId: data.userId,
              isTyping: false
            });
          }
          break;
          
        case 'heartbeat':
          // Respond to server heartbeat
          this.sendHeartbeatAck();
          break;
          
        case 'heartbeat_ack':
          // Clear heartbeat timeout since server responded
          if (this.heartbeatTimeout !== null) {
            window.clearTimeout(this.heartbeatTimeout);
            this.heartbeatTimeout = null;
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          this.dispatchEvent('websocket-error', data.message);
          break;
          
        default:
          console.warn('Unknown message type:', data);
          this.dispatchEvent('websocket-unknown', data);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
      this.dispatchEvent('websocket-error', 'Failed to parse message from server');
    }
  }

  private onClose(event: CloseEvent): void {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    this.socket = null;
    this.isConnecting = false;
    this.setConnectionStatus('disconnected');
    this.clearHeartbeat();
    
    // Dispatch close event
    this.dispatchEvent('websocket-close', {
      code: event.code,
      reason: event.reason
    });
    
    // Attempt to reconnect if not closed intentionally
    if (event.code !== 1000) {
      this.attemptReconnect();
    }
  }

  private onError(error: Event): void {
    console.error('WebSocket error:', error);
    this.dispatchEvent('websocket-error', 'Connection error occurred');
    this.setConnectionStatus('error');
    this.isConnecting = false;
    this.socket?.close();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Maximum reconnection attempts reached');
      this.dispatchEvent('websocket-reconnect-failed', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    // Dispatch event with reconnection attempt info
    this.dispatchEvent('websocket-reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: this.reconnectInterval
    });
    
    // Use exponential backoff for reconnection attempts (base interval * 1.5^attempts)
    // This will reduce server load during connection issues
    const backoffFactor = Math.pow(1.5, this.reconnectAttempts - 1);
    const reconnectDelay = Math.min(
      this.reconnectInterval * backoffFactor,
      60000 // Cap at 1 minute
    );
    
    setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      } else {
        console.error('Cannot reconnect: no user ID available');
        this.dispatchEvent('websocket-error', 'Cannot reconnect: user not authenticated');
      }
    }, reconnectDelay);
  }
  
  // Heartbeat mechanism to detect dropped connections
  private startHeartbeat(): void {
    this.clearHeartbeat(); // Clear any existing heartbeat
    
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = window.setInterval(this.sendHeartbeat, 30000);
    
    // Send initial heartbeat
    this.sendHeartbeat();
  }
  
  private clearHeartbeat(): void {
    if (this.heartbeatInterval !== null) {
      window.clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.heartbeatTimeout !== null) {
      window.clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
  
  private sendHeartbeat(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const payload = {
      type: 'heartbeat' as MessageType,
      timestamp: Date.now()
    };
    
    this.socket.send(JSON.stringify(payload));
    
    // Set timeout for heartbeat response (10 seconds)
    this.heartbeatTimeout = window.setTimeout(() => {
      console.warn('Heartbeat timeout, connection may be dead');
      this.socket?.close(4000, 'Heartbeat timeout');
      this.heartbeatTimeout = null;
    }, 10000);
  }
  
  private sendHeartbeatAck(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const payload = {
      type: 'heartbeat_ack' as MessageType,
      timestamp: Date.now()
    };
    
    this.socket.send(JSON.stringify(payload));
  }
  
  // Message delivery confirmation
  private sendDeliveryConfirmation(messageId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    const payload = {
      type: 'message_delivered' as MessageType,
      messageId: messageId,
      userId: this.userId,
      timestamp: Date.now()
    };
    
    this.socket.send(JSON.stringify(payload));
  }
  
  // Offline queue management
  private sendOrQueueMessage(payload: any): boolean {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // If sending a chat message, add it to pending messages for delivery confirmation
      if (payload.type === 'chat_message' && payload.messageId) {
        this.pendingMessages.set(payload.messageId, {
          payload,
          attempts: 1,
          timestamp: Date.now()
        });
        
        // Set timeout to resend if no delivery confirmation received
        setTimeout(() => {
          this.checkMessageDelivery(payload.messageId);
        }, 5000);
      }
      
      try {
        this.socket.send(JSON.stringify(payload));
        return true;
      } catch (error) {
        console.error('Error sending message:', error);
        this.queueMessage(payload);
        return false;
      }
    } else {
      this.queueMessage(payload);
      return false;
    }
  }
  
  private queueMessage(payload: any): void {
    // Don't queue certain types of messages
    if (payload.type === 'heartbeat' || payload.type === 'heartbeat_ack') {
      return;
    }
    
    // Add message to queue
    this.offlineQueue.push({
      payload,
      attempts: 0,
      timestamp: Date.now()
    });
    
    // Save queue to localStorage
    this.saveOfflineQueue();
    
    // Dispatch event for queue update
    this.dispatchEvent('websocket-message-queued', {
      queueLength: this.offlineQueue.length
    });
  }
  
  private processOfflineQueue(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Process all queued messages
    while (this.offlineQueue.length > 0) {
      const item = this.offlineQueue.shift();
      if (item) {
        try {
          // If it's a chat message, update the timestamp
          if (item.payload.type === 'chat_message') {
            item.payload.timestamp = Date.now();
          }
          
          this.socket.send(JSON.stringify(item.payload));
          
          // If it's a chat message, add to pending messages
          if (item.payload.type === 'chat_message' && item.payload.messageId) {
            this.pendingMessages.set(item.payload.messageId, {
              payload: item.payload,
              attempts: 1,
              timestamp: Date.now()
            });
            
            // Set timeout to check delivery
            setTimeout(() => {
              this.checkMessageDelivery(item.payload.messageId);
            }, 5000);
          }
        } catch (error) {
          console.error('Error sending queued message:', error);
          this.offlineQueue.unshift(item); // Put it back at the front of the queue
          break;
        }
      }
    }
    
    // Save updated queue to localStorage
    this.saveOfflineQueue();
    
    // Dispatch event for queue update
    this.dispatchEvent('websocket-queue-processed', {
      queueLength: this.offlineQueue.length
    });
  }
  
  private checkMessageDelivery(messageId: string): void {
    const pendingMessage = this.pendingMessages.get(messageId);
    
    if (!pendingMessage) {
      return; // Message already confirmed
    }
    
    // Maximum of 3 retry attempts
    if (pendingMessage.attempts >= 3) {
      console.warn(`Message ${messageId} failed to deliver after ${pendingMessage.attempts} attempts`);
      this.pendingMessages.delete(messageId);
      this.dispatchEvent('websocket-message-failed', messageId);
      return;
    }
    
    // Try to resend
    pendingMessage.attempts++;
    this.pendingMessages.set(messageId, pendingMessage);
    
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(pendingMessage.payload));
        
        // Check again after a delay
        setTimeout(() => {
          this.checkMessageDelivery(messageId);
        }, 5000);
      } catch (error) {
        console.error('Error resending message:', error);
        this.dispatchEvent('websocket-message-failed', messageId);
        this.pendingMessages.delete(messageId);
      }
    } else {
      // Socket is closed, queue the message
      this.queueMessage(pendingMessage.payload);
      this.pendingMessages.delete(messageId);
    }
  }
  
  private saveOfflineQueue(): void {
    try {
      // Only keep messages no older than 24 hours
      const yesterday = Date.now() - 86400000; 
      const recentMessages = this.offlineQueue.filter(msg => msg.timestamp > yesterday);
      
      // Only keep chat messages for storage
      const messagesToStore = recentMessages
        .filter(msg => msg.payload.type === 'chat_message')
        .slice(0, 100); // Limit to last 100 messages
      
      localStorage.setItem('webSocketOfflineQueue', JSON.stringify(messagesToStore));
    } catch (error) {
      console.error('Error saving offline queue to localStorage:', error);
    }
  }
  
  private loadOfflineQueue(): void {
    try {
      const queueData = localStorage.getItem('webSocketOfflineQueue');
      if (queueData) {
        const parsedQueue = JSON.parse(queueData) as QueuedMessage[];
        
        // Only load messages that are less than 24 hours old
        const yesterday = Date.now() - 86400000;
        this.offlineQueue = parsedQueue.filter(msg => msg.timestamp > yesterday);
        
        console.log(`Loaded ${this.offlineQueue.length} offline messages from storage`);
      }
    } catch (error) {
      console.error('Error loading offline queue from localStorage:', error);
    }
  }
  
  // Generate a unique message ID
  private generateMessageId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1000000)}-${this.userId}`;
  }
}

// Create a singleton instance
export const webSocketService = new WebSocketService();