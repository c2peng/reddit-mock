import { User } from "../entities/User";
import { MyContext } from "src/types";
import {
  Resolver,
  Mutation,
  Field,
  Ctx,
  Arg,
  ObjectType,
  Query,
} from "type-graphql";
import argon2 from "argon2";
import { UsernamePasswordInput } from "../utils/UsernamePasswordInput";
import { validateRegister } from "src/utils/validateRegister";

declare module "express-session" {
  interface SessionData {
    views: number;
  }
}

@ObjectType()
class FieldError {
  @Field()
  field: string;

  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { em }: MyContext
  ): Promise<boolean> {
    //const person = await em.findOne(User, {email});
    return true;
  }
  @Query(() => User, { nullable: true })
  async me(@Ctx() { req, em }: MyContext): Promise<User | null> {
    //not logged in
    if (!req.session.userId) return null;
    const user = await em.findOne(User, { id: req.session.userId });
    return user;
  }
  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) return {errors}
    const dupUser = await em.findOne(User, { username: options.username });
    if (dupUser)
      return {
        errors: [
          {
            field: "username",
            message: "already taken",
          },
        ],
      };
    const hashedPassword = await argon2.hash(options.password);
    const user = em.create(User, {
      username: options.username,
      password: hashedPassword,
      email: options.email,
    });
    await em.persistAndFlush(user);
    req.session.userId = user.id;
    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") UsernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() { em, req }: MyContext
  ): Promise<UserResponse> {
    const user = await em.findOne(
      User,
      UsernameOrEmail.includes("@")
        ? { email: UsernameOrEmail }
        : { username: UsernameOrEmail }
    );
    if (!user) {
      return {
        errors: [
          {
            field: "username",
            message: "username doesnt exist",
          },
        ],
      };
    }
    const valid = await argon2.verify(user.password, password);
    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "password incorrect",
          },
        ],
      };
    }
    req!.session!.userId = user.id;
    return { user };
  }
  @Mutation(() => Boolean, { nullable: true })
  logout(@Ctx() { req, res }: MyContext): Promise<Boolean | null> {
    return new Promise((_res) =>
      req.session.destroy((err) => {
        if (err) {
          console.log(err);
          _res(false);
          return;
        }
        res.clearCookie("qid");
        _res(true);
        return;
      })
    );
  }
}
