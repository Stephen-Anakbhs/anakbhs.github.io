import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { BlogPost } from "../../lib/posts";

type PostCardProps = {
  post: BlogPost;
  headingLevel?: 2 | 3;
};

export function PostCard({ post, headingLevel = 3 }: PostCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <article className="post-card">
      <div className="post-card-meta">
        <time dateTime={post.date}>{post.date}</time>
        <span>{post.tags[0] ?? "Note"}</span>
      </div>
      <Heading>
        <Link to={`/blog/${post.slug}`}>{post.title}</Link>
      </Heading>
      <p>{post.summary}</p>
      <Link className="post-read-more" to={`/blog/${post.slug}`}>Read more <ArrowUpRight size={16} /></Link>
    </article>
  );
}
