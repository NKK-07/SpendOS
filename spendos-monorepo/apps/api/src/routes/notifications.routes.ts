import { FastifyPluginAsync } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { NotificationsController } from "../controllers/notifications.controller";
import { NotificationParams, ActivityQuery } from "@spendos/shared-types";

export const notificationsRoutes: FastifyPluginAsync = async (server) => {
  const fastify = server.withTypeProvider<ZodTypeProvider>();

  fastify.get("/notifications", {
    schema: {
      querystring: ActivityQuery
    }
  }, NotificationsController.getNotifications);

  fastify.patch("/notifications/:id/read", {
    schema: { params: NotificationParams }
  }, NotificationsController.readNotification);

  fastify.post("/notifications/read-all", NotificationsController.readAllNotifications);
};
