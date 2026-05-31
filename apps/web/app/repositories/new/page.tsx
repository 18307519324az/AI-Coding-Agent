import { RepositoryForm } from "@/components/repository-form";

export default function NewRepositoryPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Connect</p>
          <h1>Connect Repository</h1>
          <p className="page-subtitle">
            Register a GitHub repository. Private access is configured in the runner environment, not in the browser.
          </p>
        </div>
      </header>
      <RepositoryForm />
    </>
  );
}

