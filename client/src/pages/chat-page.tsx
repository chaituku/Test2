import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { ChatGroup, ChatMessage, User } from '@shared/schema';
import { format } from 'date-fns';
import { SendHorizontal, Users, UserPlus, Phone, Video, Info, Search } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

// This component displays the chat interface
export default function ChatPage() {
  const { user } = useAuth();
  const { sendMessage, messages, isConnected, markAsRead, setActiveChat } = useWebSocket();
  const [newMessage, setNewMessage] = useState('');
  const [activeChat, setActiveChatState] = useState<{ id: number; type: 'group' | 'direct'; name: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Fetch chat groups and direct messages for current user
  const { data: chatGroups } = useQuery<ChatGroup[]>({
    queryKey: ['/api/chat/groups'],
    enabled: !!user
  });

  const { data: eventParticipants } = useQuery<User[]>({
    queryKey: ['/api/events/participants'],
    enabled: !!user
  });

  // Set active chat and mark messages as read
  const handleSetActiveChat = (chatId: number, type: 'group' | 'direct', name: string) => {
    setActiveChatState({ id: chatId, type, name });
    setActiveChat(chatId, type);
    markAsRead(chatId);
  };

  // Send a new message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const success = sendMessage(newMessage, activeChat.type === 'direct' ? activeChat.id : undefined, 
      activeChat.type === 'group' ? activeChat.id : undefined);
    
    if (success) {
      setNewMessage('');
    } else {
      toast({
        title: "Message queued",
        description: "You're currently offline. Message will be sent when you reconnect.",
        variant: "default"
      });
    }
  };

  // Auto-scroll to bottom when new messages come in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter messages for the active chat
  const filteredMessages = messages.filter(msg => 
    (activeChat?.type === 'direct' && 
      ((msg.senderId === user?.id && msg.receiverId === activeChat.id) || 
       (msg.senderId === activeChat.id && msg.receiverId === user?.id))) || 
    (activeChat?.type === 'group' && msg.chatGroupId === activeChat.id)
  );

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        {/* Chat list sidebar */}
        <div className="w-80 border-r flex flex-col">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Messages</h2>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Conversation</DialogTitle>
                    <DialogDescription>
                      Start a new chat with a user or create a group
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Tabs defaultValue="direct">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="direct">Direct Message</TabsTrigger>
                      <TabsTrigger value="group">Group Chat</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="direct" className="mt-4">
                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <h3 className="text-sm font-medium">Select a user to message:</h3>
                          <ScrollArea className="h-72">
                            {eventParticipants?.map(participant => (
                              <div 
                                key={participant.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                                onClick={() => {
                                  handleSetActiveChat(participant.id, 'direct', participant.username);
                                }}
                              >
                                <Avatar>
                                  <AvatarFallback>{getInitials(participant.username)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{participant.username}</p>
                                </div>
                              </div>
                            ))}
                          </ScrollArea>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="group" className="mt-4">
                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <h3 className="text-sm font-medium">Event chats:</h3>
                          <ScrollArea className="h-72">
                            {chatGroups?.filter(group => group.eventId !== null).map(group => (
                              <div 
                                key={group.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                                onClick={() => {
                                  handleSetActiveChat(group.id, 'group', group.name);
                                }}
                              >
                                <Avatar>
                                  <AvatarFallback>{getInitials(group.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{group.name}</p>
                                  <p className="text-xs text-muted-foreground">Event chat</p>
                                </div>
                              </div>
                            ))}
                          </ScrollArea>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </div>
            
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search messages..." className="pl-8" />
            </div>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">EVENT CHATS</h3>
              {chatGroups?.filter(group => group.eventId !== null).map(group => (
                <div 
                  key={group.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                    activeChat?.id === group.id && activeChat?.type === 'group' 
                      ? 'bg-muted' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => handleSetActiveChat(group.id, 'group', group.name)}
                >
                  <Avatar>
                    <AvatarFallback>{getInitials(group.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <p className="text-sm font-medium truncate">{group.name}</p>
                      <span className="text-xs text-muted-foreground">
                        {group.lastMessageAt && format(new Date(group.lastMessageAt), 'HH:mm')}
                      </span>
                    </div>
                    <p className="text-xs truncate text-muted-foreground">
                      {group.lastMessage || 'No messages yet'}
                    </p>
                  </div>
                </div>
              ))}
              
              <h3 className="px-2 mt-4 text-xs font-medium text-muted-foreground">DIRECT MESSAGES</h3>
              {eventParticipants?.filter(p => p.id !== user?.id).map(participant => (
                <div 
                  key={participant.id}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer ${
                    activeChat?.id === participant.id && activeChat?.type === 'direct' 
                      ? 'bg-muted' 
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => handleSetActiveChat(participant.id, 'direct', participant.username)}
                >
                  <Avatar>
                    <AvatarFallback>{getInitials(participant.username)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <p className="text-sm font-medium truncate">{participant.username}</p>
                      <span className="flex h-2 w-2 rounded-full bg-green-500"></span>
                    </div>
                    <p className="text-xs truncate text-muted-foreground">
                      Click to start chatting
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {/* Chat content */}
        <div className="flex-1 flex flex-col">
          {activeChat ? (
            <>
              {/* Chat header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>{getInitials(activeChat.name)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="text-sm font-semibold">{activeChat.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {activeChat.type === 'group' ? 'Group chat' : 'Direct message'}
                      {!isConnected && ' • Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" disabled={!isConnected}>
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" disabled={!isConnected}>
                    <Video className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon">
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Messages area */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {filteredMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    filteredMessages.map((msg, index) => {
                      const isCurrentUser = msg.senderId === user?.id;
                      const prevMsg = filteredMessages[index - 1];
                      const showAvatar = prevMsg?.senderId !== msg.senderId;
                      const sentAt = new Date(msg.sentAt || Date.now());
                      
                      return (
                        <div 
                          key={msg.id || `temp-${index}`} 
                          className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`flex gap-2 max-w-[80%] ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                            {!isCurrentUser && showAvatar ? (
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>{getInitials(activeChat.name)}</AvatarFallback>
                              </Avatar>
                            ) : (
                              <div className="w-8" />
                            )}
                            <div>
                              <div 
                                className={`rounded-lg py-2 px-3 ${
                                  isCurrentUser 
                                    ? 'bg-primary text-primary-foreground' 
                                    : 'bg-muted'
                                }`}
                              >
                                {msg.content}
                              </div>
                              <div className={`text-xs text-muted-foreground mt-1 ${isCurrentUser ? 'text-right' : ''}`}>
                                {format(sentAt, 'HH:mm')}
                                {isCurrentUser && (
                                  <span className="ml-1">
                                    {msg.readAt ? '✓✓' : '✓'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              {/* Message input */}
              <div className="p-4 border-t">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    placeholder={isConnected ? "Type a message..." : "You're offline. Messages will be sent when you reconnect."}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                    <SendHorizontal className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          ) : (
            // No active chat selected
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Users className="h-16 w-16 mb-4 text-muted-foreground/50" />
              <h3 className="text-xl font-medium mb-2">Your Messages</h3>
              <p className="text-center max-w-sm mb-6">
                Select a conversation from the sidebar or start a new chat with event participants.
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Start a Conversation
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Conversation</DialogTitle>
                    <DialogDescription>
                      Start a new chat with a user or create a group
                    </DialogDescription>
                  </DialogHeader>
                  
                  <Tabs defaultValue="direct">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="direct">Direct Message</TabsTrigger>
                      <TabsTrigger value="group">Group Chat</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="direct" className="mt-4">
                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <h3 className="text-sm font-medium">Select a user to message:</h3>
                          <ScrollArea className="h-72">
                            {eventParticipants?.map(participant => (
                              <div 
                                key={participant.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                                onClick={() => {
                                  handleSetActiveChat(participant.id, 'direct', participant.username);
                                }}
                              >
                                <Avatar>
                                  <AvatarFallback>{getInitials(participant.username)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{participant.username}</p>
                                </div>
                              </div>
                            ))}
                          </ScrollArea>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="group" className="mt-4">
                      <div className="space-y-4">
                        <div className="grid gap-2">
                          <h3 className="text-sm font-medium">Event chats:</h3>
                          <ScrollArea className="h-72">
                            {chatGroups?.filter(group => group.eventId !== null).map(group => (
                              <div 
                                key={group.id}
                                className="flex items-center gap-3 p-2 hover:bg-muted rounded cursor-pointer"
                                onClick={() => {
                                  handleSetActiveChat(group.id, 'group', group.name);
                                }}
                              >
                                <Avatar>
                                  <AvatarFallback>{getInitials(group.name)}</AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium">{group.name}</p>
                                  <p className="text-xs text-muted-foreground">Event chat</p>
                                </div>
                              </div>
                            ))}
                          </ScrollArea>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}