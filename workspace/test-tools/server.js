import { createApp } from "./src/app.js";

// The sandbox sets PORT=3030 for its own supervisor, so read a project-specific variable.
const port = Number(process.env.MTM_PORT) || 3000;

const app = createApp();

app.listen(port, () => {
  console.log(`Mini Task Manager listening on http://localhost:${port}`);
});
