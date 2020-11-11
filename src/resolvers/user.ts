import { User } from "../entities/User";
import { MyContext } from "src/types";
import {
	Resolver,
	Mutation,
	InputType,
	Field,
	Ctx,
	Arg,
	ObjectType,
} from "type-graphql";
import argon2 from "argon2";

declare module "express-session" {
	interface SessionData {
		views: number;
	}
}

@InputType()
class UsernamePasswordInput {
	@Field()
	username: string;

	@Field()
	password: string;
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
	@Mutation(() => UserResponse)
	async register(
		@Arg("options") options: UsernamePasswordInput,
		@Ctx() { em }: MyContext
	): Promise<UserResponse> {
		if (options.username.length <= 2) {
			return {
				errors: [
					{
						field: "username",
						message: "username length must be greater than 2",
					},
				],
			};
		}
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
		});
		await em.persistAndFlush(user);
		return { user };
	}

	@Mutation(() => UserResponse)
	async login(
		@Arg("options") options: UsernamePasswordInput,
		@Ctx() { em, req }: MyContext
	): Promise<UserResponse> {
		const user = await em.findOne(User, { username: options.username });
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
		const valid = await argon2.verify(user.password, options.password);
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
}
