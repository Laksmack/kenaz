import React from 'react';
import type { Area, Project } from '../../shared/types';

interface ProjectNavProps {
  areas: Area[];
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}

export function ProjectNav({ areas, projects, selectedProjectId, onSelect }: ProjectNavProps) {
  // Group projects by area
  const projectsByArea = new Map<string | null, Project[]>();

  // Projects with no area
  const unassigned = projects.filter(p => !p.area_id);
  if (unassigned.length > 0) {
    projectsByArea.set(null, unassigned);
  }

  for (const area of areas) {
    const areaProjects = projects.filter(p => p.area_id === area.id);
    if (areaProjects.length > 0) {
      projectsByArea.set(area.id, areaProjects);
    }
  }

  return (
    <div className="space-y-4">
      {/* Unassigned projects */}
      {projectsByArea.get(null)?.map(project => (
        <button
          key={project.id}
          onClick={() => onSelect(project.id)}
          className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
            selectedProjectId === project.id
              ? 'bg-bg-tertiary font-semibold'
              : 'hover:bg-bg-hover'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="truncate">{project.title}</span>
            {project.open_task_count !== undefined && project.open_task_count > 0 && (
              <span className="text-xs text-text-muted ml-2">{project.open_task_count}</span>
            )}
          </div>
        </button>
      ))}

      {/* Areas with projects */}
      {areas.map(area => {
        const areaProjects = projectsByArea.get(area.id);
        if (!areaProjects) return null;
        return (
          <div key={area.id}>
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider px-3 mb-1">
              {area.title}
            </div>
            {areaProjects.map(project => (
              <button
                key={project.id}
                onClick={() => onSelect(project.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                  selectedProjectId === project.id
                    ? 'bg-bg-tertiary font-semibold'
                    : 'hover:bg-bg-hover'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{project.title}</span>
                  {project.open_task_count !== undefined && project.open_task_count > 0 && (
                    <span className="text-xs text-text-muted ml-2">{project.open_task_count}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
