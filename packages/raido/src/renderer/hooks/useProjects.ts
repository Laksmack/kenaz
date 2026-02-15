import { useState, useEffect, useCallback } from 'react';
import type { Project, Task } from '../../shared/types';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.raido.getProjects();
      setProjects(result);
    } catch (e) {
      console.error('Failed to fetch projects:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      fetchProjects();
    });
    return cleanup;
  }, [fetchProjects]);

  return { projects, loading, refresh: fetchProjects };
}

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<(Project & { tasks: Task[] }) | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      return;
    }
    setLoading(true);
    try {
      const result = await window.raido.getProject(projectId);
      setProject(result);
    } catch (e) {
      console.error('Failed to fetch project:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      fetchProject();
    });
    return cleanup;
  }, [fetchProject]);

  return { project, loading, refresh: fetchProject };
}
