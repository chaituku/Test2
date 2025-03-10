import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "../lib/queryClient";
import { useAuth } from "../hooks/use-auth";
import { format, parseISO, isAfter, addDays } from "date-fns";
import { 
  CalendarDays, 
  ArrowRight, 
  Clock, 
  MapPin, 
  Users, 
  BadgeCheck, 
  X, 
  Plus,
  Check
} from "lucide-react";

// UI components
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Calendar } from "../components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { Booking, Court, Business } from "../../shared/schema";
import { ScrollArea } from "../components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";

export default function BookingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedStartTime, setSelectedStartTime] = useState<string>('10:00');
  const [selectedEndTime, setSelectedEndTime] = useState<string>('11:00');
  const [selectedCourt, setSelectedCourt] = useState<number | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  
  // Fetch user's bookings
  const { data: userBookings, isLoading: bookingsLoading } = useQuery<Booking[]>({
    queryKey: ['/api/bookings'],
    refetchOnWindowFocus: true,
  });

  // Fetch available courts
  const { data: courts, isLoading: courtsLoading } = useQuery<Court[]>({
    queryKey: ['/api/courts'],
  });

  // Fetch businesses for court details
  const { data: businesses, isLoading: businessesLoading } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
  });

  // Create booking mutation
  const bookingMutation = useMutation({
    mutationFn: async (data: { courtId: number, startTime: string, endTime: string }) => {
      const response = await apiRequest("POST", "/api/bookings", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      toast({
        title: "Booking confirmed",
        description: "Your court has been successfully booked.",
      });
      setIsBookingDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Booking failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Cancel booking mutation
  const cancelBookingMutation = useMutation({
    mutationFn: async (bookingId: number) => {
      await apiRequest("DELETE", `/api/bookings/${bookingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      toast({
        title: "Booking cancelled",
        description: "Your booking has been successfully cancelled.",
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

  const handleCreateBooking = () => {
    if (!selectedCourt || !selectedDate) {
      toast({
        title: "Incomplete booking",
        description: "Please select a court and date/time.",
        variant: "destructive",
      });
      return;
    }

    // Format date and times for API
    const bookingDate = format(selectedDate, 'yyyy-MM-dd');
    const startDateTime = `${bookingDate}T${selectedStartTime}:00`;
    const endDateTime = `${bookingDate}T${selectedEndTime}:00`;

    bookingMutation.mutate({
      courtId: selectedCourt,
      startTime: startDateTime,
      endTime: endDateTime,
    });
  };

  const handleCancelBooking = (bookingId: number) => {
    cancelBookingMutation.mutate(bookingId);
  };

  const getBusinessName = (courtId: number): string => {
    if (!courts || !businesses) return "Unknown";
    
    const court = courts.find(c => c.id === courtId);
    if (!court) return "Unknown";
    
    const business = businesses.find(b => b.id === court.businessId);
    return business?.name || "Unknown";
  };

  const getCourtName = (courtId: number): string => {
    if (!courts) return "Unknown Court";
    const court = courts.find(c => c.id === courtId);
    return court?.name || "Unknown Court";
  };

  // Split bookings into upcoming and past
  const upcomingBookings = userBookings?.filter(booking => 
    isAfter(parseISO(booking.startTime), new Date())
  ) || [];
  
  const pastBookings = userBookings?.filter(booking => 
    !isAfter(parseISO(booking.startTime), new Date())
  ) || [];

  // Available time slots (would normally come from API)
  const timeSlots = [
    "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", 
    "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Your Bookings</h1>
        <Dialog open={isBookingDialogOpen} onOpenChange={setIsBookingDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-1">
              <Plus size={16} />
              <span>New Booking</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Book a Court</DialogTitle>
              <DialogDescription>
                Select a court, date, and time to make your booking.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="court">Select Court</Label>
                <Select 
                  onValueChange={(value) => setSelectedCourt(Number(value))} 
                  value={selectedCourt?.toString() || undefined}
                >
                  <SelectTrigger id="court">
                    <SelectValue placeholder="Select a court" />
                  </SelectTrigger>
                  <SelectContent>
                    {courts?.filter(court => court.isAvailable).map((court) => (
                      <SelectItem key={court.id} value={court.id.toString()}>
                        {court.name} ({getBusinessName(court.id)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid gap-2">
                <Label>Select Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => date < new Date() || date > addDays(new Date(), 30)}
                  className="rounded-md border"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Select 
                    onValueChange={setSelectedStartTime} 
                    value={selectedStartTime}
                    defaultValue="10:00"
                  >
                    <SelectTrigger id="startTime">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={`start-${time}`} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid gap-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Select 
                    onValueChange={setSelectedEndTime} 
                    value={selectedEndTime}
                    defaultValue="11:00"
                  >
                    <SelectTrigger id="endTime">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {timeSlots
                        .filter(time => time > selectedStartTime)
                        .map((time) => (
                          <SelectItem key={`end-${time}`} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsBookingDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateBooking} 
                disabled={bookingMutation.isPending || !selectedCourt || !selectedDate}
              >
                {bookingMutation.isPending ? "Booking..." : "Book Court"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            <span>Upcoming</span>
            {upcomingBookings.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {upcomingBookings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past Bookings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming" className="space-y-4">
          {bookingsLoading ? (
            <div className="text-center py-8">Loading your bookings...</div>
          ) : upcomingBookings.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-medium mb-2">No upcoming bookings</h3>
              <p className="text-muted-foreground mb-4">
                You don't have any upcoming court bookings.
              </p>
              <Button 
                onClick={() => setIsBookingDialogOpen(true)}
                className="flex items-center gap-1"
              >
                <Plus size={16} />
                <span>Book a Court</span>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcomingBookings.map((booking) => (
                <BookingCard 
                  key={booking.id}
                  booking={booking}
                  courtName={getCourtName(booking.courtId)}
                  businessName={getBusinessName(booking.courtId)}
                  onCancelBooking={handleCancelBooking}
                  isCancelling={cancelBookingMutation.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="past">
          {bookingsLoading ? (
            <div className="text-center py-8">Loading your bookings...</div>
          ) : pastBookings.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="text-lg font-medium">No past bookings</h3>
              <p className="text-muted-foreground">
                Once you complete a booking, it will appear here.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px] rounded-md">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 p-1">
                {pastBookings.map((booking) => (
                  <PastBookingCard 
                    key={booking.id}
                    booking={booking}
                    courtName={getCourtName(booking.courtId)}
                    businessName={getBusinessName(booking.courtId)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface BookingCardProps {
  booking: Booking;
  courtName: string;
  businessName: string;
  onCancelBooking: (id: number) => void;
  isCancelling: boolean;
}

function BookingCard({ booking, courtName, businessName, onCancelBooking, isCancelling }: BookingCardProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "MMM d, yyyy");
  };
  
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "h:mm a");
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">{courtName}</CardTitle>
        <CardDescription className="flex items-center">
          <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
          <span>{businessName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>{formatDate(booking.startTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center">
              <span>{formatTime(booking.startTime)}</span>
              <ArrowRight className="h-3 w-3 mx-1" />
              <span>{formatTime(booking.endTime)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>Booking #{booking.id}</span>
          </div>
          {booking.status === 'confirmed' && (
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-green-500" />
              <span className="text-green-600 font-medium">Confirmed</span>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        {!confirmCancel ? (
          <Button 
            variant="outline" 
            onClick={() => setConfirmCancel(true)}
            className="w-full text-muted-foreground"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel Booking
          </Button>
        ) : (
          <div className="w-full flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setConfirmCancel(false)}
              className="flex-1"
            >
              Keep
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => onCancelBooking(booking.id)}
              disabled={isCancelling}
              className="flex-1"
            >
              {isCancelling ? "Cancelling..." : "Confirm Cancel"}
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

interface PastBookingCardProps {
  booking: Booking;
  courtName: string;
  businessName: string;
}

function PastBookingCard({ booking, courtName, businessName }: PastBookingCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "MMM d, yyyy");
  };
  
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, "h:mm a");
  };
  
  return (
    <Card className="bg-muted/40 border-muted">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-bold">{courtName}</CardTitle>
        <CardDescription className="flex items-center">
          <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
          <span>{businessName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>{formatDate(booking.startTime)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center">
              <span>{formatTime(booking.startTime)}</span>
              <ArrowRight className="h-3 w-3 mx-1" />
              <span>{formatTime(booking.endTime)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>Booking #{booking.id}</span>
          </div>
          {booking.status === 'completed' && (
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-green-600 font-medium">Completed</span>
            </div>
          )}
          {booking.status === 'cancelled' && (
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-500" />
              <span className="text-red-600 font-medium">Cancelled</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}