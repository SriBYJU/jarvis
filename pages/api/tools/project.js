import { getProjects, addProject, getProject, addProjectNote } from "../../../lib/store";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { name } = req.query;
    if (name) {
      const project = await getProject(name);
      return project
        ? res.status(200).json({ type: "project", data: project })
        : res.status(404).json({ error: "Project not found" });
    }
    const projects = await getProjects();
    return res.status(200).json({ type: "project_list", data: projects });
  }

  if (req.method === "POST") {
    const { action, name, description, note } = req.body;

    if (action === "create") {
      const project = await addProject(name, description);
      return res.status(200).json({ type: "project_start", data: project });
    }
    if (action === "note") {
      const project = await addProjectNote(name, note);
      return project
        ? res.status(200).json({ type: "project", data: project })
        : res.status(404).json({ error: "Project not found" });
    }
    return res.status(400).json({ error: "Unknown action" });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
