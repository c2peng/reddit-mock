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
  FieldResolver,
  Root,
} from "type-graphql";
import argon2 from "argon2";
import { UsernamePasswordInput } from "../utils/UsernamePasswordInput";
import { validateRegister } from "../utils/validateRegister";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid";
import { FORGET_PASSWORD_PREFIX } from "../constants";
import { getConnection } from "typeorm";

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

@Resolver(User)
export class UserResolver {
  @FieldResolver(() => String)
  email(@Root() user: User, @Ctx() { req }: MyContext) {
    //this is the current user,show email
    if (req.session.userId === user.id) {
      return user.email;
    }

    //not current user,don't show email
    return "";
  }

  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() { req, redis }: MyContext
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

    const user = await User.findOne(parseInt(userId));
    if (!user) {
      return { errors: [{ field: "token", message: "user no longer exists" }] };
    }

    user.password = await argon2.hash(newPassword);

    await User.update({ id: parseInt(userId) }, { password: newPassword });

    redis.del(FORGET_PASSWORD_PREFIX + token);

    //log in user after change password
    req.session.userId = user.id;

    return { user };
  }
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() { redis }: MyContext
  ): Promise<boolean> {
    const person = await User.findOne({ where: { email } });
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
  me(@Ctx() { req }: MyContext) {
    //not logged in
    if (!req.session.userId) return null;
    return User.findOne(req.session.userId);
  }
  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const errors = validateRegister(options);
    if (errors) return { errors };
    const dupUser = await User.findOne({
      where: { username: options.username },
    });
    if (dupUser)
      return {
        errors: [
          {
            field: "username",
            message: "already taken",
          },
        ],
      };
    let user;
    const hashedPassword = await argon2.hash(options.password);
    try {
      const result = await getConnection()
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          username: options.username,
          email: options.email,
          password: hashedPassword,
        })
        .returning("*")
        .execute();
      user = result.raw[0];
    } catch (err) {
      console.log(err);
      if (err.code === "23505") {
        return {
          errors: [
            {
              field: "username",
              message: "username already taken",
            },
          ],
        };
      }
    }
    req.session.userId = user.id;
    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") UsernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() { req }: MyContext
  ): Promise<UserResponse> {
    const user = await User.findOne(
      UsernameOrEmail.includes("@")
        ? { where: { email: UsernameOrEmail } }
        : { where: { username: UsernameOrEmail } }
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
