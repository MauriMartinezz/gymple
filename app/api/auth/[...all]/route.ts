import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/modules/auth/infrastructure/better-auth";

export const { GET, POST } = toNextJsHandler(auth);
