import type { Rule, RuleCondition, EmailThread, Email } from '../shared/types';
import type { GmailService } from './gmail';
import type { RuleStore } from './stores';

/**
 * Evaluates a single condition against a message (and thread labels for 'label' field).
 */
function evaluateCondition(condition: RuleCondition, msg: Email, threadLabels: string[] = []): boolean {
  const { field, operator, value } = condition;
  const lowerValue = value.toLowerCase();

  // ── Label condition: checked against thread-level labels ──
  if (field === 'label') {
    const labels = threadLabels.map((l) => l.toLowerCase());
    switch (operator) {
      case 'equals':
        return labels.includes(lowerValue);
      case 'contains':
        return labels.some((l) => l.includes(lowerValue));
      case 'not_contains':
        return !labels.some((l) => l.includes(lowerValue));
      case 'matches':
        try {
          const re = new RegExp(value, 'i');
          return labels.some((l) => re.test(l));
        } catch {
          return false;
        }
    }
  }

  let target = '';
  switch (field) {
    case 'sender':
      target = `${msg.from.name} ${msg.from.email}`.toLowerCase();
      break;
    case 'to':
      target = msg.to.map((t) => `${t.name} ${t.email}`).join(' ').toLowerCase();
      break;
    case 'cc':
      target = msg.cc.map((c) => `${c.name} ${c.email}`).join(' ').toLowerCase();
      break;
    case 'subject':
      target = msg.subject.toLowerCase();
      break;
    case 'body':
      target = (msg.bodyText || msg.snippet || '').toLowerCase();
      break;
    case 'has_attachment':
      // "has_attachment" is a boolean check; value should be "true" or "false"
      return msg.hasAttachments === (lowerValue === 'true');
  }

  switch (operator) {
    case 'contains':
      return target.includes(lowerValue);
    case 'not_contains':
      return !target.includes(lowerValue);
    case 'equals':
      return target === lowerValue;
    case 'matches':
      try {
        return new RegExp(value, 'i').test(target);
      } catch {
        return false;
      }
  }
}

/**
 * Evaluates all rules against a thread. Returns the list of actions to apply.
 * A rule matches if ALL its conditions match against ANY message in the thread.
 */
function evaluateRules(rules: Rule[], thread: EmailThread): { addLabels: string[]; removeLabels: string[]; archive: boolean; markRead: boolean } {
  const result = { addLabels: [] as string[], removeLabels: [] as string[], archive: false, markRead: false };

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Check if ALL conditions match (against any message in the thread)
    // Thread labels are passed so 'label' conditions can be evaluated at thread level
    const matches = rule.conditions.every((condition) =>
      condition.field === 'label'
        ? evaluateCondition(condition, thread.messages[0], thread.labels)
        : thread.messages.some((msg) => evaluateCondition(condition, msg, thread.labels))
    );

    if (matches) {
      for (const action of rule.actions) {
        switch (action.type) {
          case 'add_label':
            if (action.label && !result.addLabels.includes(action.label)) {
              result.addLabels.push(action.label);
            }
            break;
          case 'remove_label':
            if (action.label && !result.removeLabels.includes(action.label)) {
              result.removeLabels.push(action.label);
            }
            break;
          case 'archive':
            result.archive = true;
            break;
          case 'mark_read':
            result.markRead = true;
            break;
        }
      }
    }
  }

  return result;
}

/**
 * Apply rules to a batch of threads. Called after fetching new mail.
 * Only applies to threads that are in INBOX (i.e., new/incoming).
 */
export async function applyRules(
  ruleStore: RuleStore,
  gmail: GmailService,
  threads: EmailThread[]
): Promise<void> {
  const rules = ruleStore.list();
  if (rules.length === 0) return;

  for (const thread of threads) {
    // Only process inbox threads
    if (!thread.labels.includes('INBOX')) continue;

    const actions = evaluateRules(rules, thread);

    // Apply label changes
    for (const label of actions.addLabels) {
      try {
        await gmail.modifyLabels(thread.id, label, null);
      } catch (e) {
        console.error(`Rule: failed to add label ${label} to ${thread.id}:`, e);
      }
    }
    for (const label of actions.removeLabels) {
      try {
        await gmail.modifyLabels(thread.id, null, label);
      } catch (e) {
        console.error(`Rule: failed to remove label ${label} from ${thread.id}:`, e);
      }
    }

    if (actions.archive) {
      try {
        await gmail.archiveThread(thread.id);
      } catch (e) {
        console.error(`Rule: failed to archive ${thread.id}:`, e);
      }
    }

    if (actions.markRead) {
      try {
        await gmail.markAsRead(thread.id);
      } catch (e) {
        console.error(`Rule: failed to mark read ${thread.id}:`, e);
      }
    }
  }
}
