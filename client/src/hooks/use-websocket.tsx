import { useState, useEffect, useCallback, useRef } from 'react';
import { webSocketService, MessageType } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { ChatMessage } from '@shared/schema';

export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useWebSocket() {
  const { user } = useAuth();
  const [connectionState, setConnectionState] = useState<WebSocketConnectionState>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<Map<string, string>>(new Map());
  const [typingUsers, setTypingUsers] = useState<Map<number, boolean>>(new Map());
  const [queueLength, setQueueLength] = useState<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);

  // Handle new messages
  const handleNewMessage = useCallback((message: ChatMessage) => {
    setMessages(prevMessages => [...prevMessages, message]);
  }, []);

  // Handle delivery confirmations
  const handleDeliveryConfirmation = useCallback((messageId: string) => {
    setPendingMessages(prev => {
      const newMap = new Map(prev);
      newMap.delete(messageId);
      return newMap;
    });
  }, []);

  // Handle typing indicators
  const handleTypingIndicator = useCallback((userId: number, isTyping: boolean) => {
    setTypingUsers(prev => {
      const newMap = new Map(prev);
      if (isTyping) {
        newMap.set(userId, true);
      } else {
        newMap.delete(userId);
      }
      return newMap;
    });
  }, []);

  // Connect to the WebSocket server when the user is authenticated
  useEffect(() => {
    if (user?.id) {
      try {
        webSocketService.connect(user.id);
        
        // Update connection state when it changes
        const onStatusChange = ((e: Event) => {
          if (e instanceof CustomEvent) {
            setConnectionState(e.detail as WebSocketConnectionState);
            if (e.detail === 'connected') {
              setError(null);
            }
          }
        }) as EventListener;
        
        // Error handler
        const errorHandler = ((e: Event) => {
          if (e instanceof CustomEvent) {
            setError(e.detail);
          }
        }) as EventListener;
        
        // Handle queue updates
        const onQueueUpdate = ((e: Event) => {
          if (e instanceof CustomEvent && e.detail && typeof e.detail.queueLength === 'number') {
            setQueueLength(e.detail.queueLength);
          }
        }) as EventListener;
        
        // Handle message failures
        const onMessageFailed = ((e: Event) => {
          if (e instanceof CustomEvent) {
            const messageId = e.detail as string;
            setPendingMessages(prev => {
              const newMap = new Map(prev);
              newMap.delete(messageId);
              return newMap;
            });
            setError(`Message delivery failed: ${messageId}`);
          }
        }) as EventListener;
        
        // Subscribe to WebSocket service events
        window.addEventListener('websocket-status-change', onStatusChange);
        window.addEventListener('websocket-error', errorHandler);
        window.addEventListener('websocket-message-queued', onQueueUpdate);
        window.addEventListener('websocket-queue-processed', onQueueUpdate);
        window.addEventListener('websocket-message-failed', onMessageFailed);
        
        // Register handlers for messages, delivery confirmations, and typing indicators
        webSocketService.addMessageHandler(handleNewMessage);
        webSocketService.addDeliveryConfirmationHandler(handleDeliveryConfirmation);
        webSocketService.addTypingIndicatorHandler(handleTypingIndicator);
        
        // Set initial connection state
        setConnectionState(webSocketService.getConnectionStatus());
        
        return () => {
          webSocketService.disconnect();
          
          // Clean up event listeners
          window.removeEventListener('websocket-status-change', onStatusChange);
          window.removeEventListener('websocket-error', errorHandler);
          window.removeEventListener('websocket-message-queued', onQueueUpdate);
          window.removeEventListener('websocket-queue-processed', onQueueUpdate);
          window.removeEventListener('websocket-message-failed', onMessageFailed);
          
          // Remove handlers
          webSocketService.removeMessageHandler(handleNewMessage);
          webSocketService.removeDeliveryConfirmationHandler(handleDeliveryConfirmation);
          webSocketService.removeTypingIndicatorHandler(handleTypingIndicator);
          
          if (reconnectTimerRef.current) {
            window.clearTimeout(reconnectTimerRef.current);
          }
        };
      } catch (err) {
        setConnectionState('error');
        setError(err instanceof Error ? err.message : 'Unknown error connecting to WebSocket');
      }
    } else {
      setConnectionState('disconnected');
    }
  }, [user?.id, handleNewMessage, handleDeliveryConfirmation, handleTypingIndicator]);

  // Send a chat message with delivery tracking
  const sendMessage = useCallback((message: string, recipientId?: number, chatGroupId?: number) => {
    try {
      const messageId = webSocketService.sendChatMessage(message, recipientId, chatGroupId);
      
      // Add to pending messages
      if (messageId) {
        setPendingMessages(prev => {
          const newMap = new Map(prev);
          newMap.set(messageId, message);
          return newMap;
        });
        return messageId;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return null;
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

  // Send typing indicator
  const sendTypingIndicator = useCallback((isTyping: boolean, recipientId?: number, chatGroupId?: number) => {
    try {
      webSocketService.sendTypingIndicator(isTyping, recipientId, chatGroupId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send typing indicator');
      return false;
    }
  }, []);

  // Explicitly attempt to reconnect
  const reconnect = useCallback(() => {
    if (user?.id) {
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
    connecting: connectionState === 'connecting',
    messages,
    error,
    pendingMessages,
    typingUsers,
    queueLength,
    sendMessage,
    markAsRead,
    sendTypingIndicator,
    reconnect,
    clearMessages
  };
}