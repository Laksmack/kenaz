import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskStats, TaskGroup } from '../../shared/types';

type ViewType = 'today' | 'inbox' | 'upcoming' | 'logbook' | 'group' | 'search';

export function useTasks(view: ViewType | string, query?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TaskStats>({ overdue: 0, today: 0, inbox: 0, total_open: 0 });
  const [groups, setGroups] = useState<TaskGroup[]>([]);

  const fetchTasks = useCallback(async () => {
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
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [view, query]);

  const fetchMeta = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([
        window.raido.getStats(),
        window.raido.getGroups(),
      ]);
      setStats(s);
      setGroups(g);
    } catch (e) {
      console.error('Failed to fetch stats/groups:', e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchMeta();
  }, [fetchTasks, fetchMeta]);

  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      fetchTasks();
      fetchMeta();
    });
    return cleanup;
  }, [fetchTasks, fetchMeta]);

  useEffect(() => {
    const interval = setInterval(fetchMeta, 30000);
    return () => clearInterval(interval);
  }, [fetchMeta]);

  const refresh = useCallback(() => {
    fetchTasks();
    fetchMeta();
  }, [fetchTasks, fetchMeta]);

  return { tasks, loading, stats, groups, refresh };
}
