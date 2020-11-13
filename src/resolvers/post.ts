import { Post } from "../entities/Post";
import { Arg, Int, Mutation, Resolver } from "type-graphql";
import { Query } from "type-graphql";
import { getConnection } from "typeorm";

@Resolver()
export class PostResolver {
  @Query(() => [Post])
  async posts(): Promise<Post[]> {
    return Post.find();
  }
  @Query(() => Post, { nullable: true })
  post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => Post)
  async createPost(@Arg("title") title: string): Promise<Post> {
    let post;
    const result = await getConnection()
      .createQueryBuilder()
      .insert()
      .into(Post)
      .values({
        title,
      })
      .returning("*")
      .execute();
    post = result.raw[0];
    return post;
  }

  @Mutation(() => Post, { nullable: true })
  async updatePost(
    @Arg("id", () => Int) id: number,
    @Arg("title", () => String, { nullable: true }) title: string
  ): Promise<Post | null> {
    const post = await Post.findOne({ where: { id } });
    if (!post) return null;
    if (typeof title !== "undefined") await Post.update({ id }, { title });
    return post;
  }

  @Mutation(() => Boolean)
  async deletePost(@Arg("id", () => Int) id: number): Promise<boolean> {
    await Post.delete(id);
    return true;
  }
}
