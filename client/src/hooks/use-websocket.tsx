import { useState, useEffect, useCallback } from 'react';
import { webSocketService } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { ChatMessage } from '@shared/schema';

export function useWebSocket() {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Connect to the WebSocket server when the user is authenticated
  useEffect(() => {
    if (user?.id) {
      webSocketService.connect(user.id);
      setConnected(true);
      
      return () => {
        webSocketService.disconnect();
        setConnected(false);
      };
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
    webSocketService.sendChatMessage(message, recipientId, chatGroupId);
  }, []);

  // Mark messages as read
  const markAsRead = useCallback((chatGroupId?: number, senderId?: number) => {
    webSocketService.markMessagesAsRead(chatGroupId, senderId);
  }, []);

  return {
    connected,
    messages,
    sendMessage,
    markAsRead
  };
}