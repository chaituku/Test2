import { Button } from "@/components/ui/button";
import { Volleyball } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="container flex flex-col items-center justify-center px-5 mx-auto my-8">
        <div className="max-w-md text-center">
          <Volleyball className="mx-auto h-20 w-20 text-primary opacity-50" />
          <h2 className="mb-8 font-extrabold text-6xl text-gray-700">
            <span className="sr-only">Error</span>404
          </h2>
          <p className="text-2xl font-semibold md:text-3xl mb-8">
            Sorry, we couldn't find this page.
          </p>
          <p className="mt-4 mb-8 text-muted-foreground">
            But don't worry, you can find plenty of other courts to book on our homepage.
          </p>
          <Link href="/">
            <Button className="px-8 py-3">
              Back to Homepage
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}