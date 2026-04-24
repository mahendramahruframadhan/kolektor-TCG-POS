import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });
dotenvConfig({ path: resolve(__dirname, "../../.env") });
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
import { holdRoutes } from "./routes/holds.js";
import { transactionRoutes } from "./routes/transactions.js";
import { backupRoute } from "./routes/backup.js";
import { syncRoutes } from "./routes/sync.js";
import { settlementRoutes } from "./routes/settlement.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { overrideRoutes } from "./routes/overrides.js";
import { startCartSweeper } from "./jobs/cart-sweeper.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DATABASE_PATH ?? "kolektapos.db";

async function build() {
  const app = Fastify({ logger: true });

  // DB
  const { db } = await runMigrations(DB_PATH);
  await seed(db);

  // Perimeter security — §H4/H10 of MVP hardening
  await app.register(helmet, {
    // PWA lives on the same domain as the API (PRD §10); no CSP wiring here.
    contentSecurityPolicy: false,
  });

  const allowedOrigin = process.env.DOMAIN
    ? `https://${process.env.DOMAIN}`
    : true; // dev: reflect origin
  await app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
  });

  await app.register(rateLimit, {
    global: false, // only routes that opt in via {config:{rateLimit:...}} are throttled
  });

  // OpenAPI — auto-generates from route schemas (route-level JSON schemas
  // are added progressively). Swagger-UI mounted at /docs/api for operator
  // inspection. Keep disabled in production deploys behind DOMAIN if needed.
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "KolektaPOS API",
        description:
          "Single-booth TCG POS sync + admin API. Local-first; session-cookie auth; append-only transactions. See docs/01-prd.md.",
        version: "0.1.0",
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      tags: [
        { name: "auth", description: "Login, logout, change password, /me" },
        { name: "cards", description: "Card CRUD + stock-receive" },
        { name: "carts", description: "Cart mutations + pay + abandon" },
        { name: "transactions", description: "Transaction read + void/refund" },
        { name: "sync", description: "PWA push/pull protocol" },
        { name: "settlement", description: "Per-event + monthly payout reports" },
        { name: "admin", description: "Settings, users, audit log, backup" },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "sessionId",
            description:
              "Fastify session cookie (sameSite=strict). Obtain via POST /auth/login.",
          },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs/api",
    uiConfig: { docExpansion: "list", deepLinking: false },
  });

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
  await holdRoutes(app, { db });
  await transactionRoutes(app, { db });
  await backupRoute(app, { dbPath: DB_PATH, photoStoragePath: process.env.PHOTO_STORAGE_PATH });
  await syncRoutes(app, { db });
  await settlementRoutes(app, { db });
  await auditLogRoutes(app, { db });
  await overrideRoutes(app, { db });

  // Start background jobs
  startCartSweeper(db);

  return app;
}

// Bootstrap
const app = await build();
await app.listen({ port: PORT, host: HOST });
