import { z } from "zod";

export const UserRoleSchema = z.enum(["admin", "cashier"]);

export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  role: UserRoleSchema.default("cashier"),
});

export const UpdateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
  password: z.string().min(8).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
