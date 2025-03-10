import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Route, Switch } from "wouter";
import { Toaster } from "./components/ui/toaster";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./lib/protected-route";
import { AppLayout } from "./components/layout/app-layout";
import { WebSocketProvider } from "./hooks/use-websocket";

import HomePage from "./pages/home-page";
import AuthPage from "./pages/auth-page";
import NotFound from "./pages/not-found";
import BusinessDashboard from "./pages/business-dashboard";
import ChatPage from "./pages/chat-page";
import BookingsPage from "./pages/bookings-page";
import EventsPage from "./pages/events-page";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <Router />
          <Toaster />
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

// Layout wrapper for protected routes
function ProtectedPage({ component: Component, ...rest }: { component: React.ComponentType }) {
  return (
    <ProtectedRoute 
      {...rest} 
      component={() => (
        <AppLayout>
          <Component />
        </AppLayout>
      )} 
    />
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedPage path="/business" component={BusinessDashboard} />
      <ProtectedPage path="/chat" component={ChatPage} />
      <ProtectedPage path="/bookings" component={BookingsPage} />
      <ProtectedPage path="/events" component={EventsPage} />
      <ProtectedPage path="/" component={HomePage} />
      <Route component={NotFound} />
    </Switch>
  );
}