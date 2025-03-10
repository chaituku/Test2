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

  private onOpen(): void {
    console.log('WebSocket connection established');
    this.reconnectAttempts = 0;
    
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
          break;
          
        case 'chat_message':
          if (data.message && typeof data.message !== 'string') {
            // Notify all registered handlers about the new message
            this.messageHandlers.forEach(handler => handler(data.message as ChatMessage));
          }
          break;
          
        case 'error':
          console.error('WebSocket error:', data.message);
          break;
          
        default:
          console.warn('Unknown message type:', data);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }

  private onClose(event: CloseEvent): void {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    this.socket = null;
    
    // Attempt to reconnect if not closed intentionally
    if (event.code !== 1000) {
      this.attemptReconnect();
    }
  }

  private onError(error: Event): void {
    console.error('WebSocket error:', error);
    this.socket?.close();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Maximum reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      }
    }, this.reconnectInterval);
  }
}

// Create a singleton instance
export const webSocketService = new WebSocketService();