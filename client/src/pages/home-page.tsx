import React, { useState } from "react";
import { useAuth } from "../hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Business, Court, Booking, InsertBooking } from "../../shared/schema";
import { Button } from "../components/ui/button";
import { 
  Calendar, 
  LogOut, 
  Volleyball, 
  Clock, 
  MapPin, 
  Plus, 
  X, 
  CalendarDays,
  Map,
  Search,
  Info,
  Star,
  CreditCard,
  Filter
} from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useToast } from "../hooks/use-toast";
import { apiRequest, queryClient } from "../lib/queryClient";
import { format, addMinutes, isSameDay, isWithinInterval, startOfDay, endOfDay } from "date-fns";
import { Calendar as CalendarComponent } from "../components/ui/calendar";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Link, useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);

  // Fetch businesses
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
  });

  // Fetch user's bookings
  const { data: userBookings = [] } = useQuery<Booking[]>({
    queryKey: ["/api/bookings/user"],
  });

  // Fetch courts for selected business
  const { data: courts = [] } = useQuery<Court[]>({
    queryKey: ["/api/businesses", selectedBusiness?.id, "courts"],
    enabled: !!selectedBusiness,
  });

  // Generate time slots (30-minute intervals) for the selected date
  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = selectedDate && 
      selectedDate.getDate() === today.getDate() && 
      selectedDate.getMonth() === today.getMonth() && 
      selectedDate.getFullYear() === today.getFullYear();

    for (let hour = 0; hour < 24; hour++) {
      for (let minute of [0, 30]) {
        const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // If today, only show future time slots
        if (isToday) {
          const slotTime = new Date();
          slotTime.setHours(hour, minute, 0, 0);
          if (slotTime <= now) continue;
        }
        
        slots.push(time);
      }
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();

  // Handle booking court
  const handleBookCourt = async () => {
    if (!selectedCourt || !selectedDate || !selectedTime) {
      toast({
        title: "Booking failed",
        description: "Please select a court, date, and time.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Parse the selected time and create start and end times
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const startDate = new Date(selectedDate);
      startDate.setHours(hours, minutes, 0, 0);
      
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + 30);

      await apiRequest("POST", `/api/courts/${selectedCourt.id}/bookings`, {
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
      });

      toast({
        title: "Booking successful",
        description: `You've booked ${selectedCourt.name} for ${format(startDate, "h:mm a")} on ${format(selectedDate, "MMM d, yyyy")}.`,
      });

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/bookings/user"] });
      setBookingDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "There was a problem booking this court.",
        variant: "destructive",
      });
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message || "There was a problem logging out.",
        variant: "destructive",
      });
    }
  };

  // Filter bookings for today
  const todayBookings = userBookings.filter(booking => {
    const bookingDate = new Date(booking.startTime);
    const today = new Date();
    return (
      bookingDate.getDate() === today.getDate() &&
      bookingDate.getMonth() === today.getMonth() &&
      bookingDate.getFullYear() === today.getFullYear()
    );
  });

  // Filter upcoming bookings (future dates)
  const upcomingBookings = userBookings.filter(booking => {
    const bookingDate = new Date(booking.startTime);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bookingDate > today && !todayBookings.includes(booking);
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Volleyball className="h-6 w-6 mr-2 text-primary" />
            <h1 className="text-xl font-bold">CourtTime</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome, {user?.username}</span>
            {user?.role === "business" && (
              <Link href="/business">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Business Dashboard
                </Button>
              </Link>
            )}
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1 space-y-6">
            {/* User Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your Profile</CardTitle>
                <CardDescription>Manage your account and bookings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Username:</span>
                    <span className="font-medium">{user?.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Email:</span>
                    <span className="font-medium">{user?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Account Type:</span>
                    <span className="font-medium capitalize">{user?.role}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Today's Bookings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Today's Bookings</CardTitle>
                <CardDescription>Your scheduled courts for today</CardDescription>
              </CardHeader>
              <CardContent>
                {todayBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No bookings for today.</p>
                ) : (
                  <div className="space-y-3">
                    {todayBookings.map((booking) => (
                      <div key={booking.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">Court #{booking.courtId}</span>
                          <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                            {booking.status}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground mb-1">
                          <Clock className="h-4 w-4 mr-1" />
                          {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Bookings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upcoming Bookings</CardTitle>
                <CardDescription>Your future court reservations</CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingBookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingBookings.map((booking) => (
                      <div key={booking.id} className="border rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">Court #{booking.courtId}</span>
                          <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
                            {booking.status}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground mb-1">
                          <CalendarDays className="h-4 w-4 mr-1" />
                          {format(new Date(booking.startTime), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="h-4 w-4 mr-1" />
                          {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="md:col-span-2">
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Book a Court</CardTitle>
                <CardDescription>Find and book available badminton courts</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Businesses List */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-3">Available Facilities</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {businesses.map((business) => (
                      <Card key={business.id} className={`cursor-pointer transition-all ${selectedBusiness?.id === business.id ? 'ring-2 ring-primary' : ''}`} onClick={() => setSelectedBusiness(business)}>
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">{business.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="flex items-start">
                            <MapPin className="h-4 w-4 mr-2 mt-0.5 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{business.address}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    {businesses.length === 0 && (
                      <div className="col-span-full text-center p-6 border rounded-lg text-muted-foreground">
                        No businesses available. Please check back later.
                      </div>
                    )}
                  </div>
                </div>

                {/* Court Booking Section */}
                {selectedBusiness && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Courts at {selectedBusiness.name}</h3>
                    
                    {courts.length === 0 ? (
                      <div className="text-center p-6 border rounded-lg text-muted-foreground">
                        No courts available at this facility.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {courts.map((court) => (
                          <Card key={court.id} className={`${!court.isAvailable ? 'opacity-50' : ''}`}>
                            <CardHeader className="p-4">
                              <div className="flex justify-between items-center">
                                <CardTitle className="text-base">{court.name}</CardTitle>
                                {court.isAvailable ? (
                                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                    Available
                                  </span>
                                ) : (
                                  <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full">
                                    Unavailable
                                  </span>
                                )}
                              </div>
                            </CardHeader>
                            <CardFooter className="p-4 pt-0">
                              <Button 
                                className="w-full" 
                                disabled={!court.isAvailable}
                                onClick={() => {
                                  setSelectedCourt(court);
                                  setBookingDialogOpen(true);
                                }}
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Book Now
                              </Button>
                            </CardFooter>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Booking Dialog */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Book a Court</DialogTitle>
            <DialogDescription>
              Select your preferred date and time to book{selectedCourt ? ` ${selectedCourt.name}` : ''}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Tabs defaultValue="date" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="date">
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Date
                </TabsTrigger>
                <TabsTrigger value="time">
                  <Clock className="h-4 w-4 mr-2" />
                  Time
                </TabsTrigger>
                <TabsTrigger value="review">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Review
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="date" className="mt-4">
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Select a date for your booking:</p>
                  <div className="border rounded-lg p-4">
                    <CalendarComponent
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      className="rounded-md mx-auto"
                      disabled={(date) => {
                        // Disable dates in the past
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                    />
                  </div>
                </div>
                
                <div className="flex justify-end">
                  <Button onClick={() => document.getElementById('time-tab')?.click()}>
                    Next: Select Time
                    <Calendar className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="time" className="mt-4">
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">
                    Selected date: <Badge variant="outline">{selectedDate ? format(selectedDate, "MMM d, yyyy") : 'No date selected'}</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground mb-4">Select a 30-minute time slot:</p>
                  
                  <div className="border rounded-lg p-4">
                    <div className="grid grid-cols-4 gap-2">
                      {timeSlots.length > 0 ? (
                        timeSlots.map((time) => (
                          <Button
                            key={time}
                            variant={selectedTime === time ? "default" : "outline"}
                            className="text-sm"
                            onClick={() => setSelectedTime(time)}
                          >
                            {time}
                          </Button>
                        ))
                      ) : (
                        <p className="col-span-4 text-center text-muted-foreground py-4">
                          No time slots available for the selected date.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => document.getElementById('date-tab')?.click()}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Back to Calendar
                  </Button>
                  <Button
                    onClick={() => document.getElementById('review-tab')?.click()}
                    disabled={!selectedTime}
                  >
                    Review Booking
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </TabsContent>
              
              <TabsContent value="review" className="mt-4">
                <div className="border rounded-lg p-4 mb-4">
                  <h3 className="font-medium mb-3">Booking Summary</h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Facility:</span>
                      <span className="font-medium">{selectedBusiness?.name}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Court:</span>
                      <span className="font-medium">{selectedCourt?.name}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Date:</span>
                      <span className="font-medium">
                        {selectedDate ? format(selectedDate, "MMMM d, yyyy") : 'Not selected'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Time:</span>
                      <span className="font-medium">
                        {selectedTime ? format(new Date(`2000-01-01T${selectedTime}`), "h:mm a") : 'Not selected'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Duration:</span>
                      <span className="font-medium">30 minutes</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between text-lg font-semibold">
                      <span>Total:</span>
                      <span>Free</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => document.getElementById('time-tab')?.click()}>
                    <Clock className="h-4 w-4 mr-2" />
                    Change Time
                  </Button>
                  <Button 
                    onClick={handleBookCourt}
                    disabled={!selectedCourt || !selectedDate || !selectedTime}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Confirm Booking
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Hidden spans for tab navigation */}
          <span id="date-tab" className="hidden" onClick={() => document.querySelector('[value="date"]')?.click()}></span>
          <span id="time-tab" className="hidden" onClick={() => document.querySelector('[value="time"]')?.click()}></span>
          <span id="review-tab" className="hidden" onClick={() => document.querySelector('[value="review"]')?.click()}></span>
        </DialogContent>
      </Dialog>
    </div>
  );
}