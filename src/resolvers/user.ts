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
import { validateRegister } from "../utils/validateRegister";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid";
import { FORGET_PASSWORD_PREFIX } from "../constants";

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
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() { req, redis, em }: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length <= 2)
      return {
        errors: [
          { field: "newPassword", message: "length must be greater than 2" },
        ],
      };
    const userId = await redis.get(FORGET_PASSWORD_PREFIX + token);
    if (!userId)
      return { errors: [{ field: "token", message: "token expired" }] };

    const user = await em.findOne(User, { id: parseInt(userId) });
    if (!user) {
      return { errors: [{ field: "token", message: "user no longer exists" }] };
    }

    user.password = await argon2.hash(newPassword);

    await em.persistAndFlush(user);

    redis.del(FORGET_PASSWORD_PREFIX + token);

    //log in user after change password
    req.session.userId = user.id;

    return { user };
  }
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { em, redis }: MyContext
  ): Promise<boolean> {
    const person = await em.findOne(User, { email });
    if (!person) {
      return true;
    }

    const token = v4();

    await redis.set(
      FORGET_PASSWORD_PREFIX + token,
      person.id,
      "ex",
      1000 * 60 * 60 * 3 * 24
    );

    await sendEmail(
      email,
      `<a href='http://localhost:3000/change-password/${token}'>reset password</a>`
    );
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
    if (errors) return { errors };
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
            field: "usernameOrEmail",
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
