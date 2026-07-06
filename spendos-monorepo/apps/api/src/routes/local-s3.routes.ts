import { FastifyPluginAsync } from "fastify";
import { ForbiddenError, NotFoundError } from "../lib/errors";
import { verifyToken } from "@spendos/auth";
import { prisma } from "@spendos/database";
import * as path from "path";
import * as fs from "fs";

export const localS3Routes: FastifyPluginAsync = async (server) => {
  // Catch-all parser to bypass standard Fastify body parsing and keep it as a raw stream
  server.addContentTypeParser("*", (request, payload, done) => {
    done(null, payload);
  });

  server.addHook("preHandler", async (request, reply) => {
    let accessToken = request.cookies.accessToken;
    if (!accessToken && request.headers.authorization) {
      const parts = request.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        accessToken = parts[1];
      }
    }

    if (!accessToken) {
      return reply.status(401).send({ error: "Missing or invalid token" });
    }

    const payload = verifyToken(accessToken);
    if (!payload) return reply.status(401).send({ error: "Token expired or invalid" });

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, company_id: true, is_active: true, is_frozen: true },
    });

    if (!user || user.company_id !== payload.companyId || !user.is_active || user.is_frozen) {
      return reply.status(403).send({ error: "Access denied" });
    }

    (request as any).user = { userId: user.id, companyId: user.company_id };
  });

  server.put("/*", async (request, reply) => {
    const actor = (request as any).user;
    const wild = (request.params as any)['*'];
    const decodedKey = decodeURIComponent(wild);

    // 1. Resolve absolute path first to neutralize relative traversal segments
    const baseDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(baseDir, decodedKey);

    // 2. Path Traversal Protection
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new ForbiddenError("Access denied: Invalid file path traversal.");
    }

    // 3. Enforce Tenant Separation on the fully resolved absolute path
    const relativePath = path.relative(baseDir, filePath);
    const resolvedSegments = relativePath.split(path.sep);
    if (resolvedSegments[0] === "companies" && resolvedSegments[1] !== actor.companyId) {
      throw new ForbiddenError("Access denied: Cross-company file uploads are strictly blocked.");
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    const outStream = fs.createWriteStream(filePath);
    const bodyStream = request.body as any;

    if (!bodyStream || typeof bodyStream.pipe !== "function") {
      throw new ForbiddenError("No file payload stream provided.");
    }

    await new Promise((resolve, reject) => {
      bodyStream.pipe(outStream);
      bodyStream.on("end", resolve);
      bodyStream.on("error", reject);
    });

    return reply.status(200).send({ message: "File uploaded successfully" });
  });

  server.get("/*", async (request, reply) => {
    const actor = (request as any).user;
    const wild = (request.params as any)['*'];
    const decodedKey = decodeURIComponent(wild);

    // 1. Resolve absolute path first to neutralize relative traversal segments
    const baseDir = path.resolve(process.cwd(), "uploads");
    const filePath = path.resolve(baseDir, decodedKey);

    // 2. Path Traversal Protection
    if (!filePath.startsWith(baseDir + path.sep)) {
      throw new ForbiddenError("Access denied: Invalid file path traversal.");
    }

    // 3. Enforce Tenant Separation on the fully resolved absolute path
    const relativePath = path.relative(baseDir, filePath);
    const resolvedSegments = relativePath.split(path.sep);
    if (resolvedSegments[0] === "companies" && resolvedSegments[1] !== actor.companyId) {
      throw new ForbiddenError("Access denied: Cross-company file retrieval is strictly blocked.");
    }

    try {
      await fs.promises.stat(filePath);
    } catch {
      throw new NotFoundError("File not found on storage server.");
    }

    const buffer = await fs.promises.readFile(filePath);
    return reply.send(buffer);
  });
};
