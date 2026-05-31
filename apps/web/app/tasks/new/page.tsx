import { CreateTaskForm } from "@/components/create-task-form";

export default function NewTaskPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">New run</p>
          <h1>Create Agent Task</h1>
          <p className="page-subtitle">
            Give the runner a repository and a concrete task. The Agent must generate a plan before it can edit files.
          </p>
        </div>
      </header>
      <CreateTaskForm />
    </>
  );
}

