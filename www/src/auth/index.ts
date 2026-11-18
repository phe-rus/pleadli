import { env } from "cloudflare:workers";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { institutions } from "@pleadli/institution";
import { templates } from "@pleadli/templates";
import { betterAuth } from "better-auth";
import { admin, bearer } from "better-auth/plugins";
import { db } from "../db";
import * as authSchema from "../db/auth-schema";
import { password } from "./password";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: authSchema,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
    password,
  },
  plugins: [
    bearer(),
    // Public signup never grants platform administration based on an email.
    admin({ defaultRole: "user" }),
    templates(),
    institutions(),
  ],
});
