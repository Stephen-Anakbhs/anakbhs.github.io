import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPost } from "../lib/posts";

export function BlogPostPage() {
  const { slug } = useParams();
  const post = slug ? getPost(slug) : undefined;

  if (!post || post.status !== "published") {
    return (
      <main className="subpage prose-page" id="main-content" tabIndex={-1}>
        <p className="kicker">Missing post</p>
        <h1>Post not found.</h1>
        <Link className="text-link" to="/blog"><ArrowLeft size={17} aria-hidden="true" />Back to blog</Link>
      </main>
    );
  }

  return (
    <main className="subpage prose-page" id="main-content" tabIndex={-1}>
      <Link className="text-link back-link" to="/blog">
        <ArrowLeft size={17} aria-hidden="true" />Back to blog
      </Link>
      <time className="post-date" dateTime={post.date}>{post.date}</time>
      <h1>{post.title}</h1>
      <p className="lede">{post.summary}</p>
      <div className="tag-row">
        {post.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <article className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.body}</ReactMarkdown>
      </article>
    </main>
  );
}
