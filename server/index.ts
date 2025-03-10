import express from "express";
import { registerRoutes } from "./routes";

async function startServer() {
  const app = express();
  app.use(express.json());

  // Register API routes
  const server = registerRoutes(app);

  // Fallback route for the SPA
  app.get("*", (req, res) => {
    res.sendFile("index.html", { root: "./client/dist" });
  });

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(console.error);