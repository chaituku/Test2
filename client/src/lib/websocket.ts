import { ChatMessage } from "@shared/schema";

type MessageHandler = (message: ChatMessage) => void;

interface WebSocketMessage {
  type: 'auth_success' | 'chat_message' | 'error';
  message?: string | ChatMessage;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private messageHandlers: MessageHandler[] = [];
  private reconnectInterval: number = 5000; // 5 seconds
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private userId: number | null = null;

  constructor() {
    this.connect = this.connect.bind(this);
    this.onOpen = this.onOpen.bind(this);
    this.onMessage = this.onMessage.bind(this);
    this.onClose = this.onClose.bind(this);
    this.onError = this.onError.bind(this);
  }

  connect(userId: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.userId = userId;
    
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.socket = new WebSocket(wsUrl);
    
    this.socket.addEventListener('open', this.onOpen);
    this.socket.addEventListener('message', this.onMessage);
    this.socket.addEventListener('close', this.onClose);
    this.socket.addEventListener('error', this.onError);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  sendChatMessage(message: string, recipientId?: number, chatGroupId?: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.userId) {
      console.error('Cannot send message, WebSocket not connected');
      return;
    }

    const payload = {
      type: 'chat_message',
      senderId: this.userId,
      receiverId: recipientId,
      chatGroupId: chatGroupId,
      message: message
    };

    this.socket.send(JSON.stringify(payload));
  }

  markMessagesAsRead(chatGroupId?: number, senderId?: number): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.userId) {
      console.error('Cannot mark messages as read, WebSocket not connected');
      return;
    }

    const payload = {
      type: 'mark_read',
      userId: this.userId,
      chatGroupId: chatGroupId,
      senderId: senderId
    };

    this.socket.send(JSON.stringify(payload));
  }

  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  removeMessageHandler(handler: MessageHandler): void {
    this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
  }

  // Helper method to dispatch custom events
  private dispatchEvent(eventName: string, detail?: any): void {
    const event = new CustomEvent(eventName, { detail });
    window.dispatchEvent(event);
  }

  private onOpen(): void {
    console.log('WebSocket connection established');
    this.reconnectAttempts = 0;
    
    // Dispatch connection open event
    this.dispatchEvent('websocket-open');
    
    // Authenticate the WebSocket connection
    if (this.userId && this.socket) {
      const authPayload = {
        type: 'auth',
        userId: this.userId
      };
      
      this.socket.send(JSON.stringify(authPayload));
    }
  }

  private onMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as WebSocketMessage;
      
      switch (data.type) {
        case 'auth_success':
          console.log('WebSocket authentication successful');
          this.dispatchEvent('websocket-auth-success');
          break;
          
        case 'chat_message':
          if (data.message && typeof data.message !== 'string') {
            // Notify all registered handlers about the new message
            const chatMessage = data.message as ChatMessage;
            this.messageHandlers.forEach(handler => handler(chatMessage));
            
            // Also dispatch an event for components that might be listening
            this.dispatchEvent('websocket-message', chatMessage);
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
}

// Create a singleton instance
export const webSocketService = new WebSocketService();