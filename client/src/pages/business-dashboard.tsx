import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Business, Court, InsertCourt } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Volleyball, LogOut, Plus, Settings, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { format } from "date-fns";

const courtSchema = z.object({
  name: z.string().min(1, { message: "Court name is required" }),
  isAvailable: z.boolean().default(true),
});

type CourtFormValues = z.infer<typeof courtSchema>;

const businessSchema = z.object({
  name: z.string().min(1, { message: "Business name is required" }),
  address: z.string().min(1, { message: "Address is required" }),
});

type BusinessFormValues = z.infer<typeof businessSchema>;

export default function BusinessDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [businessDialogOpen, setBusinessDialogOpen] = useState(false);
  const [courtDialogOpen, setCourtDialogOpen] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);

  // Redirect if not business role
  if (user && user.role !== "business") {
    navigate("/");
    return null;
  }

  // Fetch businesses owned by the user
  const { 
    data: businesses = [], 
    isLoading: isLoadingBusinesses 
  } = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
    enabled: !!user,
  });

  // Set first business as selected if none selected and businesses are loaded
  if (businesses.length > 0 && !selectedBusinessId) {
    setSelectedBusinessId(businesses[0].id);
  }

  // Fetch courts for the selected business
  const { 
    data: courts = [], 
    isLoading: isLoadingCourts 
  } = useQuery<Court[]>({
    queryKey: ["/api/businesses", selectedBusinessId, "courts"],
    enabled: !!selectedBusinessId,
  });

  // Fetch bookings for today for the selected business
  const { 
    data: businessBookings = [], 
    isLoading: isLoadingBookings 
  } = useQuery({
    queryKey: ["/api/businesses", selectedBusinessId, "bookings"],
    enabled: !!selectedBusinessId,
  });

  // Business form
  const businessForm = useForm<BusinessFormValues>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      name: "",
      address: "",
    },
  });

  // Court form
  const courtForm = useForm<CourtFormValues>({
    resolver: zodResolver(courtSchema),
    defaultValues: {
      name: "",
      isAvailable: true,
    },
  });

  // Handle creating new business
  const createBusinessMutation = useMutation({
    mutationFn: async (data: BusinessFormValues) => {
      const res = await apiRequest("POST", "/api/businesses", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Business created",
        description: "Your new business has been added successfully.",
      });
      setBusinessDialogOpen(false);
      businessForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/businesses"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create business",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle creating new court
  const createCourtMutation = useMutation({
    mutationFn: async (data: CourtFormValues) => {
      if (!selectedBusinessId) throw new Error("No business selected");
      const res = await apiRequest("POST", `/api/businesses/${selectedBusinessId}/courts`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Court created",
        description: "Your new court has been added successfully.",
      });
      setCourtDialogOpen(false);
      courtForm.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "courts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create court",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle updating court availability
  const updateCourtAvailabilityMutation = useMutation({
    mutationFn: async ({ id, isAvailable }: { id: number; isAvailable: boolean }) => {
      const res = await apiRequest("PATCH", `/api/courts/${id}/availability`, { isAvailable });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Court updated",
        description: `Court availability set to ${data.isAvailable ? 'available' : 'unavailable'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/businesses", selectedBusinessId, "courts"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle logout
  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      navigate("/auth");
    } catch (error: any) {
      toast({
        title: "Logout failed",
        description: error.message || "There was a problem logging out.",
        variant: "destructive",
      });
    }
  };

  const onBusinessSubmit = (values: BusinessFormValues) => {
    createBusinessMutation.mutateAsync(values);
  };

  const onCourtSubmit = (values: CourtFormValues) => {
    createCourtMutation.mutateAsync(values);
  };

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
            <span className="text-sm text-muted-foreground">Business Dashboard: {user?.username}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} disabled={logoutMutation.isPending}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Your Businesses</span>
                  <Button variant="ghost" size="icon" onClick={() => setBusinessDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingBusinesses ? (
                  <div className="py-4 text-center text-muted-foreground">Loading...</div>
                ) : businesses.length === 0 ? (
                  <div className="py-4 text-center text-muted-foreground">
                    <p>No businesses found</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => setBusinessDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Business
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {businesses.map((business) => (
                      <div 
                        key={business.id}
                        className={`px-3 py-2 rounded-md cursor-pointer ${
                          selectedBusinessId === business.id 
                            ? "bg-primary text-primary-foreground" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedBusinessId(business.id)}
                      >
                        <div className="font-medium">{business.name}</div>
                        <div className="text-xs truncate">
                          {selectedBusinessId === business.id 
                            ? <span className="text-primary-foreground/80">{business.address}</span>
                            : <span className="text-muted-foreground">{business.address}</span>
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setBusinessDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Business
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => setCourtDialogOpen(true)}
                  disabled={!selectedBusinessId}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Court
                </Button>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="lg:col-span-3">
            {selectedBusinessId ? (
              <Tabs defaultValue="courts">
                <TabsList className="mb-6">
                  <TabsTrigger value="courts">
                    <Volleyball className="h-4 w-4 mr-2" />
                    Courts
                  </TabsTrigger>
                  <TabsTrigger value="bookings">
                    <Calendar className="h-4 w-4 mr-2" />
                    Bookings
                  </TabsTrigger>
                  <TabsTrigger value="settings">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </TabsTrigger>
                </TabsList>

                {/* Courts Tab */}
                <TabsContent value="courts">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Manage Courts</h2>
                    <Button size="sm" onClick={() => setCourtDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Court
                    </Button>
                  </div>

                  {isLoadingCourts ? (
                    <div className="py-12 text-center text-muted-foreground">Loading courts...</div>
                  ) : courts.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-4">No courts found for this business</p>
                        <Button onClick={() => setCourtDialogOpen(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Your First Court
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {courts.map((court) => (
                        <Card key={court.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <CardTitle className="text-lg">{court.name}</CardTitle>
                              <Badge variant={court.isAvailable ? "default" : "destructive"}>
                                {court.isAvailable ? "Available" : "Unavailable"}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Availability</span>
                              <Switch
                                checked={court.isAvailable}
                                onCheckedChange={(checked) => {
                                  updateCourtAvailabilityMutation.mutate({
                                    id: court.id,
                                    isAvailable: checked,
                                  });
                                }}
                                disabled={updateCourtAvailabilityMutation.isPending}
                              />
                            </div>
                          </CardContent>
                          <CardFooter className="flex justify-between pt-2">
                            <span className="text-xs text-muted-foreground">
                              Created {format(new Date(court.createdAt), "MMM d, yyyy")}
                            </span>
                            <Button variant="ghost" size="sm">
                              View Bookings
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Bookings Tab */}
                <TabsContent value="bookings">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Today's Bookings</h2>
                  </div>

                  {isLoadingBookings ? (
                    <div className="py-12 text-center text-muted-foreground">Loading bookings...</div>
                  ) : businessBookings.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground">No bookings for today</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <Table>
                        <TableCaption>List of today's bookings</TableCaption>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Court</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {businessBookings.map((booking) => (
                            <TableRow key={booking.id}>
                              <TableCell className="font-medium">Court #{booking.courtId}</TableCell>
                              <TableCell>
                                {format(new Date(booking.startTime), "h:mm a")} - {format(new Date(booking.endTime), "h:mm a")}
                              </TableCell>
                              <TableCell>User #{booking.userId}</TableCell>
                              <TableCell>
                                <Badge variant={booking.status === "confirmed" ? "default" : "outline"}>
                                  {booking.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  )}
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Business Settings</CardTitle>
                      <CardDescription>Manage your business information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <h3 className="font-medium mb-2">Business Details</h3>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Name:</span>
                              <span>{businesses.find(b => b.id === selectedBusinessId)?.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Address:</span>
                              <span>{businesses.find(b => b.id === selectedBusinessId)?.address}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Created:</span>
                              <span>
                                {format(
                                  new Date(businesses.find(b => b.id === selectedBusinessId)?.createdAt || new Date()),
                                  "MMM d, yyyy"
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" className="w-full">
                        <Settings className="h-4 w-4 mr-2" />
                        Edit Business
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-xl font-medium mb-2">No business selected</p>
                  <p className="text-muted-foreground mb-6">
                    {businesses.length === 0
                      ? "Create your first business to get started"
                      : "Select a business from the sidebar to manage it"}
                  </p>
                  <Button onClick={() => setBusinessDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    {businesses.length === 0 ? "Create Business" : "Add Another Business"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Create Business Dialog */}
      <Dialog open={businessDialogOpen} onOpenChange={setBusinessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Business</DialogTitle>
            <DialogDescription>
              Add your business information to start managing courts.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...businessForm}>
            <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-4">
              <FormField
                control={businessForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter business name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={businessForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter business address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit" disabled={createBusinessMutation.isPending}>
                  {createBusinessMutation.isPending ? "Creating..." : "Create Business"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Court Dialog */}
      <Dialog open={courtDialogOpen} onOpenChange={setCourtDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Court</DialogTitle>
            <DialogDescription>
              Add a new court to your business.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...courtForm}>
            <form onSubmit={courtForm.handleSubmit(onCourtSubmit)} className="space-y-4">
              <FormField
                control={courtForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Court Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter court name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={courtForm.control}
                name="isAvailable"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Availability</FormLabel>
                      <FormDescription>
                        Make this court available for booking
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button type="submit" disabled={createCourtMutation.isPending}>
                  {createCourtMutation.isPending ? "Creating..." : "Add Court"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}