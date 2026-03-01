import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskStats, TaskGroup } from '../../shared/types';

type ViewType = 'today' | 'inbox' | 'upcoming' | 'logbook' | 'group' | 'search';

export function useTasks(view: ViewType | string, query?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TaskStats>({ overdue: 0, today: 0, inbox: 0, total_open: 0 });
  const [groups, setGroups] = useState<TaskGroup[]>([]);

  // Fetch tasks and stats together to ensure sidebar counts match the task list.
  // The stats for the current view are overridden with the actual task array length
  // so they can never be out of sync (race condition between two separate IPC calls).
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let result: Task[];
      switch (view) {
        case 'today':
          result = await window.raido.getToday();
          break;
        case 'inbox':
          result = await window.raido.getInbox();
          break;
        case 'upcoming':
          result = await window.raido.getUpcoming();
          break;
        case 'logbook':
          result = await window.raido.getLogbook(30);
          break;
        case 'group':
          result = query ? await window.raido.getGroup(query) : [];
          break;
        case 'search':
          result = query ? await window.raido.searchTasks(query) : [];
          break;
        default:
          result = [];
      }
      setTasks(result);

      const [s, g] = await Promise.all([
        window.raido.getStats(),
        window.raido.getGroups(),
      ]);

      // Override the current view's stat with the actual task count so
      // the sidebar badge always matches what the user sees in the list
      const correctedStats = { ...s };
      if (view === 'today') correctedStats.today = result.length;
      else if (view === 'inbox') correctedStats.inbox = result.length;

      setStats(correctedStats);
      setGroups(g);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [view, query]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      fetchAll();
    });
    return cleanup;
  }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const refresh = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  return { tasks, loading, stats, groups, refresh };
}
