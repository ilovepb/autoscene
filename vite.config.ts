import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

import { defineConfig } from "vite";

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "api-chat",
      configureServer(server) {
        server.middlewares.use(
          "/api/chat",
          async (
            req: IncomingMessage,
            res: ServerResponse,
            next: () => void,
          ) => {
            if (req.method !== "POST") {
              next();
              return;
            }
            try {
              const body = await collectBody(req);
              const headers = new Headers();
              for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === "string") headers.set(key, value);
              }
              const request = new Request("http://localhost/api/chat", {
                method: "POST",
                headers,
                body,
              });
              const { handleChatRequest } =
                await server.ssrLoadModule("@/server/chat");
              const response: Response = await handleChatRequest(request);
              res.writeHead(response.status, {
                "Content-Type":
                  response.headers.get("Content-Type") ?? "text/plain",
                "Cache-Control": "no-cache",
              });
              const reader = response.body?.getReader();
              if (reader) {
                const pump = async () => {
                  const { done, value } = await reader.read();
                  if (done) {
                    res.end();
                    return;
                  }
                  res.write(value);
                  await pump();
                };
                await pump();
              } else {
                res.end(await response.text());
              }
            } catch (err) {
              console.error("[api/chat]", err);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  error:
                    err instanceof Error
                      ? err.message
                      : "Internal server error",
                }),
              );
            }
          },
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
