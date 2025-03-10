import { useState, useEffect, useCallback, useRef } from 'react';
import { webSocketService } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { ChatMessage } from '@shared/schema';

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useWebSocket() {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  // Connect to the WebSocket server when the user is authenticated
  useEffect(() => {
    if (user?.id) {
      setConnectionState('connecting');
      
      try {
        webSocketService.connect(user.id);
        
        // Setup event listeners for connection status
        const handleOpen = () => {
          setConnectionState('connected');
          setError(null);
        };
        
        const handleClose = () => {
          setConnectionState('disconnected');
          
          // Attempt to reconnect after a delay
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
          }
          
          reconnectTimerRef.current = window.setTimeout(() => {
            if (user?.id) {
              webSocketService.connect(user.id);
              setConnectionState('connecting');
            }
          }, 3000);
        };
        
        const handleError = (errorMessage: string) => {
          setConnectionState('error');
          setError(errorMessage);
        };
        
        // Subscribe to events from the WebSocket service
        window.addEventListener('websocket-open', handleOpen);
        window.addEventListener('websocket-close', handleClose);
        
        // Fix for CustomEvent handling in TypeScript
        const errorHandler = ((e: Event) => {
          if (e instanceof CustomEvent) {
            handleError(e.detail);
          }
        }) as EventListener;
        
        window.addEventListener('websocket-error', errorHandler);
        
        return () => {
          webSocketService.disconnect();
          setConnectionState('disconnected');
          
          // Clean up event listeners
          window.removeEventListener('websocket-open', handleOpen);
          window.removeEventListener('websocket-close', handleClose);
          window.removeEventListener('websocket-error', errorHandler);
          
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
          }
        };
      } catch (err) {
        setConnectionState('error');
        setError(err instanceof Error ? err.message : 'Unknown error connecting to WebSocket');
      }
    }
  }, [user?.id]);

  // Add a message handler to listen for new messages
  useEffect(() => {
    const handleNewMessage = (message: ChatMessage) => {
      setMessages(prevMessages => [...prevMessages, message]);
    };
    
    webSocketService.addMessageHandler(handleNewMessage);
    
    return () => {
      webSocketService.removeMessageHandler(handleNewMessage);
    };
  }, []);

  // Send a chat message
  const sendMessage = useCallback((message: string, recipientId?: number, chatGroupId?: number) => {
    try {
      webSocketService.sendChatMessage(message, recipientId, chatGroupId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return false;
    }
  }, []);

  // Mark messages as read
  const markAsRead = useCallback((chatGroupId?: number, senderId?: number) => {
    try {
      webSocketService.markMessagesAsRead(chatGroupId, senderId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark messages as read');
      return false; 
    }
  }, []);

  // Explicitly attempt to reconnect
  const reconnect = useCallback(() => {
    if (user?.id) {
      setConnectionState('connecting');
      setError(null);
      webSocketService.connect(user.id);
    }
  }, [user?.id]);

  // Clear messages if needed
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    connectionState,
    connected: connectionState === 'connected',
    messages,
    error,
    sendMessage,
    markAsRead,
    reconnect,
    clearMessages
  };
}