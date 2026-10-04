import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="subpage prose-page" id="main-content" tabIndex={-1}>
      <p className="kicker">404</p>
      <h1>Page not found.</h1>
      <Link className="text-link" to="/#home">Return home</Link>
    </main>
  );
}
