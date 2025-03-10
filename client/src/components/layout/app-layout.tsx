import React from 'react';
import { Link, useLocation } from 'wouter';
import { ConnectionStatusIndicator } from '../connection-status';
import { useAuth } from '../../hooks/use-auth';
import { 
  CalendarDays, 
  Home, 
  User, 
  LogOut, 
  MessageSquare,
  Building2
} from 'lucide-react';
import { Button } from '../ui/button';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Navigation links with their paths and icons
  const navItems = [
    { path: '/', label: 'Home', icon: <Home className="w-5 h-5 mr-2" /> },
    { path: '/bookings', label: 'Bookings', icon: <CalendarDays className="w-5 h-5 mr-2" /> },
    { path: '/chat', label: 'Messages', icon: <MessageSquare className="w-5 h-5 mr-2" /> },
  ];

  // Add role-specific navigation items
  if (user?.role === 'business') {
    navItems.push({ 
      path: '/business', 
      label: 'Business Dashboard', 
      icon: <Building2 className="w-5 h-5 mr-2" /> 
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-primary">
            <Link href="/">BadmintonHub</Link>
          </h1>
        </div>
        
        <div className="flex items-center gap-4">
          <ConnectionStatusIndicator />
          
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm hidden md:inline-block">
                Hello, {user.username}
              </span>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleLogout}
                className="flex items-center"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span className="hidden md:inline-block">Logout</span>
              </Button>
            </div>
          ) : (
            <Link href="/auth">
              <Button variant="ghost" size="sm" className="flex items-center">
                <User className="w-4 h-4 mr-2" />
                <span>Login</span>
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Main content area with sidebar */}
      <div className="flex flex-1">
        {/* Sidebar navigation */}
        <aside className="w-16 md:w-64 bg-white border-r p-4 hidden sm:block">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Link key={item.path} href={item.path}>
                <Button
                  variant={location === item.path ? "default" : "ghost"}
                  className="w-full justify-start"
                >
                  {item.icon}
                  <span className="hidden md:inline-block">{item.label}</span>
                </Button>
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 overflow-auto">
          {children}
        </main>
      </div>

      {/* Mobile navigation footer */}
      <div className="sm:hidden bg-white border-t p-2 flex justify-around">
        {navItems.map((item) => (
          <Link key={item.path} href={item.path}>
            <Button
              variant={location === item.path ? "default" : "ghost"}
              size="sm"
              className={location === item.path ? "text-white" : ""}
            >
              {React.cloneElement(item.icon as React.ReactElement, { className: "w-5 h-5" })}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}