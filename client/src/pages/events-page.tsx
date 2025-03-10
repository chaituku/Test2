import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { format, parseISO, isAfter } from "date-fns";
import { 
  Calendar, 
  Users, 
  MapPin, 
  Clock, 
  Trophy, 
  User, 
  Filter,
  Plus,
  Activity,
  Dices,
  UsersRound
} from "lucide-react";

// UI components
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { Event, EventParticipant, User as UserType } from "../../shared/schema";
import { ScrollArea } from "../components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Separator } from "../components/ui/separator";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function EventsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [eventTypeFilter, setEventTypeFilter] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isRegistrationDialogOpen, setIsRegistrationDialogOpen] = useState(false);
  
  // Fetch upcoming events
  const { data: events, isLoading: eventsLoading } = useQuery<Event[]>({
    queryKey: ['/api/events'],
    refetchOnWindowFocus: true,
  });

  // Fetch user's event participations
  const { data: participations, isLoading: participationsLoading } = useQuery<EventParticipant[]>({
    queryKey: ['/api/event-participants/user'],
    refetchOnWindowFocus: true,
  });

  // Join event mutation
  const joinEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const response = await apiRequest("POST", `/api/events/${eventId}/join`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/event-participants/user'] });
      toast({
        title: "Registration confirmed",
        description: "You have successfully registered for the event.",
      });
      setIsRegistrationDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Leave event mutation
  const leaveEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      await apiRequest("DELETE", `/api/events/${eventId}/leave`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/event-participants/user'] });
      toast({
        title: "Registration cancelled",
        description: "You have been removed from the event.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cancellation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleJoinEvent = () => {
    if (!selectedEvent) return;
    joinEventMutation.mutate(selectedEvent.id);
  };

  const handleLeaveEvent = (eventId: number) => {
    leaveEventMutation.mutate(eventId);
  };

  const openRegistrationDialog = (event: Event) => {
    setSelectedEvent(event);
    setIsRegistrationDialogOpen(true);
  };

  // Filter events by type if filter is applied
  const filteredEvents = events
    ? eventTypeFilter 
      ? events.filter(event => event.type === eventTypeFilter && isAfter(parseISO(event.startTime), new Date()))
      : events.filter(event => isAfter(parseISO(event.startTime), new Date()))
    : [];

  // Get user's registered events
  const userEvents = participations
    ? events?.filter(event => 
        participations.some(p => p.eventId === event.id)
      ) || []
    : [];

  // Check if user is registered for an event
  const isUserRegistered = (eventId: number): boolean => {
    return participations ? participations.some(p => p.eventId === eventId) : false;
  };

  // Get event type badge
  const getEventTypeBadge = (type: string) => {
    switch (type) {
      case 'tournament':
        return <Badge variant="destructive" className="flex items-center gap-1"><Trophy className="h-3 w-3" /> Tournament</Badge>;
      case 'social':
        return <Badge variant="secondary" className="flex items-center gap-1"><UsersRound className="h-3 w-3" /> Social</Badge>;
      case 'training':
        return <Badge variant="default" className="flex items-center gap-1"><Activity className="h-3 w-3" /> Training</Badge>;
      default:
        return <Badge variant="outline"><Dices className="h-3 w-3 mr-1" /> {type}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Badminton Events</h1>
        
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex items-center gap-1">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Filter Events</SheetTitle>
              <SheetDescription>
                Narrow down events based on your preferences.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="event-type">Event Type</Label>
                <Select 
                  onValueChange={(value) => setEventTypeFilter(value)} 
                  value={eventTypeFilter || undefined}
                >
                  <SelectTrigger id="event-type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tournament">Tournament</SelectItem>
                    <SelectItem value="social">Social Play</SelectItem>
                    <SelectItem value="training">Training Session</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="pt-2">
                <Button 
                  onClick={() => setEventTypeFilter(null)} 
                  variant="outline" 
                  className="w-full"
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs defaultValue="browse" className="w-full">
        <TabsList className="mb-4 w-full sm:w-auto">
          <TabsTrigger value="browse" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <Calendar className="h-4 w-4" />
            <span>Browse Events</span>
          </TabsTrigger>
          <TabsTrigger value="registered" className="flex items-center gap-2 flex-1 sm:flex-initial">
            <User className="h-4 w-4" />
            <span>Your Events</span>
            {userEvents.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {userEvents.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="browse" className="space-y-4">
          {eventsLoading ? (
            <div className="text-center py-8">Loading events...</div>
          ) : filteredEvents.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-medium mb-2">No events found</h3>
              <p className="text-muted-foreground mb-4">
                {eventTypeFilter 
                  ? `No upcoming ${eventTypeFilter} events found. Try another category.`
                  : "No upcoming events found at the moment."
                }
              </p>
              <Button 
                onClick={() => setEventTypeFilter(null)}
                className="flex items-center gap-1"
                variant="outline"
              >
                <Filter className="h-4 w-4" />
                <span>Clear Filters</span>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard 
                  key={event.id}
                  event={event}
                  isRegistered={isUserRegistered(event.id)}
                  onRegister={() => openRegistrationDialog(event)}
                  onUnregister={() => handleLeaveEvent(event.id)}
                  typeBadge={getEventTypeBadge(event.type)}
                  isProcessing={joinEventMutation.isPending || leaveEventMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="registered">
          {participationsLoading ? (
            <div className="text-center py-8">Loading your events...</div>
          ) : userEvents.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-medium mb-2">No registered events</h3>
              <p className="text-muted-foreground mb-4">
                You haven't registered for any events yet.
              </p>
              <Button 
                onClick={() => document.getElementById('browse-tab')?.click()}
                className="flex items-center gap-1"
              >
                <Calendar className="h-4 w-4" />
                <span>Browse Events</span>
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[500px] rounded-md">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-1">
                {userEvents.map((event) => (
                  <EventCard 
                    key={event.id}
                    event={event}
                    isRegistered={true}
                    onRegister={() => {}}
                    onUnregister={() => handleLeaveEvent(event.id)}
                    typeBadge={getEventTypeBadge(event.type)}
                    isProcessing={leaveEventMutation.isPending}
                    showUnregisterButton={isAfter(parseISO(event.startTime), new Date())}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      {/* Registration Dialog */}
      <Dialog open={isRegistrationDialogOpen} onOpenChange={setIsRegistrationDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Register for Event</DialogTitle>
            <DialogDescription>
              You are about to register for the following event.
            </DialogDescription>
          </DialogHeader>
          
          {selectedEvent && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedEvent.name}</h3>
                <p className="text-muted-foreground mt-1">{selectedEvent.description}</p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{format(parseISO(selectedEvent.startTime), "MMMM d, yyyy")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center">
                    <span>{format(parseISO(selectedEvent.startTime), "h:mm a")}</span>
                    <span className="mx-2">to</span>
                    <span>{format(parseISO(selectedEvent.endTime), "h:mm a")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedEvent.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedEvent.currentParticipants} / {selectedEvent.maxParticipants} participants</span>
                </div>
                
                <div className="pt-2">
                  {getEventTypeBadge(selectedEvent.type)}
                  {selectedEvent.fee > 0 && (
                    <Badge variant="outline" className="ml-2">
                      Fee: ${selectedEvent.fee.toFixed(2)}
                    </Badge>
                  )}
                </div>
              </div>
              
              {selectedEvent.fee > 0 && (
                <div className="border rounded-md p-4 bg-muted/30">
                  <h4 className="font-medium mb-2">Payment Information</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    This event requires a payment of ${selectedEvent.fee.toFixed(2)}. 
                    You will be prompted to complete the payment after registration.
                  </p>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex sm:justify-between">
            <Button 
              variant="outline" 
              onClick={() => setIsRegistrationDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleJoinEvent} 
              disabled={joinEventMutation.isPending || (selectedEvent?.currentParticipants === selectedEvent?.maxParticipants)}
            >
              {joinEventMutation.isPending ? "Registering..." : "Confirm Registration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface EventCardProps {
  event: Event;
  isRegistered: boolean;
  isProcessing: boolean;
  typeBadge: React.ReactNode;
  onRegister: () => void;
  onUnregister: () => void;
  showUnregisterButton?: boolean;
}

function EventCard({ 
  event, 
  isRegistered, 
  isProcessing, 
  typeBadge, 
  onRegister, 
  onUnregister,
  showUnregisterButton = true
}: EventCardProps) {
  const isFull = event.currentParticipants >= event.maxParticipants;
  const isPast = !isAfter(parseISO(event.startTime), new Date());
  
  return (
    <Card className={isPast ? "bg-muted/40 border-muted" : ""}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg font-bold">{event.name}</CardTitle>
          {typeBadge}
        </div>
        <CardDescription className="flex items-center mt-1">
          <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
          <span>{event.location}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{event.description}</p>
          
          <Separator />
          
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(parseISO(event.startTime), "MMMM d, yyyy")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center">
              <span>{format(parseISO(event.startTime), "h:mm a")}</span>
              <span className="mx-2">to</span>
              <span>{format(parseISO(event.endTime), "h:mm a")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>
              {event.currentParticipants} / {event.maxParticipants} participants
              {isFull && !isRegistered && " (Full)"}
            </span>
          </div>
          
          {event.fee > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                Fee: ${event.fee.toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {isPast ? (
          <Badge variant="outline" className="w-full justify-center py-1">
            Event Completed
          </Badge>
        ) : isRegistered ? (
          showUnregisterButton ? (
            <Button 
              variant="outline" 
              onClick={onUnregister}
              disabled={isProcessing}
              className="w-full text-muted-foreground"
            >
              {isProcessing ? "Processing..." : "Cancel Registration"}
            </Button>
          ) : (
            <Badge variant="default" className="w-full justify-center py-1">
              Registered
            </Badge>
          )
        ) : (
          <Button 
            onClick={onRegister}
            disabled={isProcessing || isFull}
            className="w-full"
            variant={isFull ? "outline" : "default"}
          >
            {isProcessing ? "Processing..." : isFull ? "Event Full" : "Register"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}