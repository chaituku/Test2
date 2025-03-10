import React, { useEffect, useState } from 'react';
import { Signal, Wifi, WifiOff } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from './ui/tooltip';
import { Badge } from './ui/badge';
import { webSocketService } from '@/lib/websocket';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export function ConnectionStatusIndicator() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [queuedMessages, setQueuedMessages] = useState<number>(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Set initial state
    setStatus(webSocketService.getConnectionStatus());

    // Set up event listeners for WebSocket state changes
    const handleStatusChange = (event: CustomEvent<ConnectionStatus>) => {
      setStatus(event.detail);
      setLastActivity(new Date());
    };

    const handleQueueUpdate = (event: CustomEvent<{ queueLength: number }>) => {
      setQueuedMessages(event.detail.queueLength);
    };

    // Add event listeners
    window.addEventListener('websocket-status-change', handleStatusChange as EventListener);
    window.addEventListener('websocket-message-queued', handleQueueUpdate as EventListener);
    window.addEventListener('websocket-queue-processed', handleQueueUpdate as EventListener);

    // Clean up event listeners on unmount
    return () => {
      window.removeEventListener('websocket-status-change', handleStatusChange as EventListener);
      window.removeEventListener('websocket-message-queued', handleQueueUpdate as EventListener);
      window.removeEventListener('websocket-queue-processed', handleQueueUpdate as EventListener);
    };
  }, []);

  // Get appropriate icon and color based on connection status
  const statusConfig = {
    connected: {
      icon: <Wifi className="h-4 w-4" />,
      color: 'bg-green-500',
      label: 'Connected',
      description: 'Your connection is active and working properly.'
    },
    connecting: {
      icon: <Signal className="h-4 w-4 animate-pulse" />,
      color: 'bg-yellow-500',
      label: 'Connecting',
      description: 'Attempting to establish connection...'
    },
    disconnected: {
      icon: <WifiOff className="h-4 w-4" />,
      color: 'bg-gray-500',
      label: 'Disconnected',
      description: 'You are offline. Messages will be sent when you reconnect.'
    },
    error: {
      icon: <WifiOff className="h-4 w-4" />,
      color: 'bg-red-500',
      label: 'Connection Error',
      description: 'There was a problem with your connection. Trying to reconnect...'
    }
  };

  const config = statusConfig[status];

  // Calculate time since last activity if available
  const timeSinceActivity = lastActivity 
    ? `Last activity: ${getTimeSince(lastActivity)}`
    : 'No recent activity';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className="flex items-center space-x-2 cursor-pointer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className={`h-2 w-2 rounded-full ${config.color}`} />
            
            {isHovered && (
              <span className="text-xs text-muted-foreground">
                {config.label}
              </span>
            )}
            
            {queuedMessages > 0 && (
              <Badge variant="outline" className="h-5 px-1 text-xs">
                {queuedMessages}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="space-y-1">
            <p className="font-medium text-sm">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            <p className="text-xs text-muted-foreground">{timeSinceActivity}</p>
            {queuedMessages > 0 && (
              <p className="text-xs text-amber-500">
                {queuedMessages} message{queuedMessages !== 1 ? 's' : ''} queued
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper function to format time since last activity
function getTimeSince(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}