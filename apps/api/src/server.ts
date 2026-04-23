import Fastify from "fastify";
import { runMigrations, seed } from "@kolektapos/db";
import { sessionPlugin } from "./plugins/session.js";
import { auditPlugin } from "./plugins/audit.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { eventRoutes } from "./routes/events.js";
import { paymentChannelRoutes } from "./routes/payment-channels.js";
import { settingsRoutes } from "./routes/settings.js";
import { cardRoutes } from "./routes/cards.js";
import { cartRoutes } from "./routes/carts.js";
import { startCartSweeper } from "./jobs/cart-sweeper.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DATABASE_PATH ?? "kolektapos.db";

async function build() {
  const app = Fastify({ logger: true });

  // DB
  const { db } = await runMigrations(DB_PATH);
  await seed(db);

  // Plugins
  await sessionPlugin(app);
  await auditPlugin(app, { db });

  // Routes
  await authRoutes(app, { db });
  await userRoutes(app, { db });
  await eventRoutes(app, { db });
  await paymentChannelRoutes(app, { db });
  await settingsRoutes(app, { db });
  await cardRoutes(app, { db });
  await cartRoutes(app, { db });

  // Start background jobs
  startCartSweeper(db);

  return app;
}

// Bootstrap
const app = await build();
await app.listen({ port: PORT, host: HOST });
