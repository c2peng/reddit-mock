import { Request, Response } from "express";
import { Redis } from "ioredis";
import { createCreatorLoader } from "./utils/createCreatorLoader";
import { createUpdootLoader } from "./utils/createUpdootLoader";

export type MyContext = {
  req: Request & { session: { userId: number } };
  redis: Redis;
  res: Response;
  userLoader: ReturnType<typeof createCreatorLoader>;
  updootLoader: ReturnType<typeof createUpdootLoader>;
};
