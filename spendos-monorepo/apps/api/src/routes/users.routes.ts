import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { UsersController } from "../controllers/users.controller";
import { 
  InviteUserSchema, EditUserSchema, FreezeUserSchema, 
  ResetPasswordAdminSchema, UserParams, ActivityQuery
} from "@spendos/shared-types";
import { requireSettingsAccess, requireReviewer } from "../rbac";

export const usersRoutes: FastifyPluginAsync = async (server) => {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.get("/users", {
    preHandler: [requireReviewer],
    schema: {
      querystring: ActivityQuery
    }
  }, UsersController.getUsers);

  fastify.post("/users/invite", {
    preHandler: [requireReviewer],
    schema: { body: InviteUserSchema }
  }, UsersController.inviteUser);

  fastify.patch("/users/:id", {
    schema: { params: UserParams, body: EditUserSchema }
  }, UsersController.editUser);

  fastify.post("/users/:id/freeze", {
    preHandler: [requireSettingsAccess],
    schema: { params: UserParams, body: FreezeUserSchema }
  }, UsersController.freezeUser);

  fastify.post("/users/:id/unfreeze", {
    preHandler: [requireSettingsAccess],
    schema: { params: UserParams }
  }, UsersController.unfreezeUser);

  fastify.post("/users/:id/deactivate", {
    preHandler: [requireSettingsAccess],
    schema: { params: UserParams }
  }, UsersController.deactivateUser);

  fastify.post("/users/:id/reactivate", {
    preHandler: [requireSettingsAccess],
    schema: { params: UserParams }
  }, UsersController.reactivateUser);

  fastify.post("/users/:id/reset-password", {
    preHandler: [requireSettingsAccess],
    schema: { params: UserParams, body: ResetPasswordAdminSchema }
  }, UsersController.resetUserPassword);
};
