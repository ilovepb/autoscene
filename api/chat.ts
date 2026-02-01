import { handleChatRequest } from "../src/server/chat";

export default async function handler(req: Request): Promise<Response> {
  return handleChatRequest(req);
}
