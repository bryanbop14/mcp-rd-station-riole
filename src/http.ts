import { createApplication } from "./app.js";
import { config } from "./config.js";
createApplication().listen(config.PORT, "0.0.0.0", () => console.log("Riole MCP on "+config.PORT));
