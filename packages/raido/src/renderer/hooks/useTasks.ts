import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, TaskStats, TaskGroup } from '../../shared/types';
import { extractLinearIssueKeys } from '../lib/linear';

type ViewType = 'today' | 'inbox' | 'upcoming' | 'logbook' | 'deferred' | 'pipeline' | 'linear' | 'group' | 'search';

const TASKS_CHANGED_DEBOUNCE_MS = 450;
const POLL_INTERVAL_MS = 60000;

export function useTasks(view: ViewType | string, query?: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<TaskStats>({ overdue: 0, today: 0, inbox: 0, total_open: 0, deferred: 0 });
  const [groups, setGroups] = useState<TaskGroup[]>([]);

  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const prevViewForFetchRef = useRef(view);

  const runFetch = useCallback(async () => {
    const switchedView = prevViewForFetchRef.current !== view;
    prevViewForFetchRef.current = view;
    if (switchedView) {
      setTasks([]);
    }
    const hadTasks = !switchedView && tasksRef.current.length > 0;
    const isSearch = view === 'search';
    const q = (query || '').trim();

    if (isSearch && !q) {
      setTasks([]);
      setLoading(false);
      setRefreshing(false);
      try {
        const [s, g] = await Promise.all([window.raido.getStats(), window.raido.getGroups()]);
        const correctedStats = { ...s };
        setStats(correctedStats);
        setGroups(g);
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
      return;
    }

    if (isSearch && hadTasks && q) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
    }

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
        case 'deferred':
          result = await window.raido.getDeferred();
          break;
        case 'group':
          result = query ? await window.raido.getGroup(query) : [];
          break;
        case 'search':
          result = query ? await window.raido.searchTasks(query) : [];
          break;
        case 'linear': {
          const inbox = await window.raido.getInbox();
          result = inbox.filter((task) => {
            const text = `${task.title || ''}\n${task.notes || ''}`;
            return extractLinearIssueKeys(text).length > 0;
          });
          break;
        }
        default:
          result = [];
      }
      setTasks(result);

      const [s, g] = await Promise.all([window.raido.getStats(), window.raido.getGroups()]);

      const correctedStats = { ...s };
      if (view === 'today') correctedStats.today = result.length;
      else if (view === 'inbox') correctedStats.inbox = result.length;
      else if (view === 'deferred') correctedStats.deferred = result.length;

      setStats(correctedStats);
      setGroups(g);
    } catch (e) {
      console.error('Failed to fetch tasks:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [view, query]);

  useEffect(() => {
    void runFetch();
  }, [runFetch]);

  const tasksChangedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const cleanup = window.raido.onTasksChanged(() => {
      if (tasksChangedTimerRef.current) clearTimeout(tasksChangedTimerRef.current);
      tasksChangedTimerRef.current = setTimeout(() => {
        tasksChangedTimerRef.current = null;
        void runFetch();
      }, TASKS_CHANGED_DEBOUNCE_MS);
    });
    return () => {
      cleanup();
      if (tasksChangedTimerRef.current) clearTimeout(tasksChangedTimerRef.current);
    };
  }, [runFetch]);

  useEffect(() => {
    const interval = setInterval(() => {
      void runFetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [runFetch]);

  const refresh = useCallback(() => {
    void runFetch();
  }, [runFetch]);

  return { tasks, loading, refreshing, stats, groups, refresh };
}
