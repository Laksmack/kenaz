import { useState, useEffect, useCallback } from 'react';
import type { Task, TaskStats } from '../../shared/types';

type ViewType = 'today' | 'inbox' | 'upcoming' | 'logbook' | 'search';

export function useTasks(view: ViewType | string, searchQuery?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TaskStats>({ overdue: 0, today: 0, inbox: 0, total_open: 0 });

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
        case 'search':
          result = searchQuery ? await window.raido.searchTasks(searchQuery) : [];
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
  }, [view, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const s = await window.raido.getStats();
      setStats(s);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchStats();
  }, [fetchTasks, fetchStats]);

  // Listen for task changes from main process
  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      fetchTasks();
      fetchStats();
    });
    return cleanup;
  }, [fetchTasks, fetchStats]);

  // Poll stats every 30 seconds for badge updates
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const refresh = useCallback(() => {
    fetchTasks();
    fetchStats();
  }, [fetchTasks, fetchStats]);

  return { tasks, loading, stats, refresh };
}
