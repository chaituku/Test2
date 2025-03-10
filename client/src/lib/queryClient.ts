import { QueryClient } from "@tanstack/react-query";

type GetQueryFnOptions = {
  on401?: "returnNull" | "redirect" | "error";
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export const getQueryFn = (options: GetQueryFnOptions = {}) => {
  return async ({ queryKey }: { queryKey: unknown[] }) => {
    const url = queryKey[0] as string;
    
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (response.status === 401) {
      switch (options.on401) {
        case "returnNull":
          return undefined;
        case "redirect":
          window.location.href = "/auth";
          return undefined;
        case "error":
        default:
          throw new Error("Not authenticated");
      }
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || "An error occurred");
    }

    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }

    return response.text();
  };
};

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const apiRequest = async (
  method: HttpMethod,
  url: string,
  body?: unknown,
) => {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "An error occurred");
  }

  return response;
};