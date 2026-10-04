import { PostCard } from "../components/blog/PostCard";
import { SectionHeading } from "../components/ui/SectionHeading";
import { posts } from "../lib/posts";

export function BlogIndexPage() {
  return (
    <main className="subpage" id="main-content" tabIndex={-1}>
      <SectionHeading
        title="Blog"
        level={1}
        body="Research notes, projects, and ideas."
      />
      <div className="post-grid">
        {posts.filter((post) => post.status === "published").map((post) => (
          <PostCard post={post} key={post.slug} headingLevel={2} />
        ))}
      </div>
    </main>
  );
}
