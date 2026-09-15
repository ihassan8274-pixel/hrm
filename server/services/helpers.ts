// Shared helpers extracted from server.ts — maintained by hand.
import path from "path";
import fs from "fs";

  // Ensure uploads dir

export const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

