import type { ConfigStore } from './config';

const LINEAR_API = 'https://api.linear.app/graphql';

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  priority: number | null;
  state?: { id: string; name: string; type: string } | null;
  assignee?: { id: string; name: string; email?: string | null } | null;
  team?: { id: string; key: string; name: string } | null;
}

export class LinearService {
  private config: ConfigStore;

  constructor(config: ConfigStore) {
    this.config = config;
  }

  isEnabled(): boolean {
    const cfg = this.config.get();
    return !!cfg.linearEnabled && !!cfg.linearApiKey;
  }

  async testConnection(): Promise<{ ok: boolean; message?: string }> {
    if (!this.isEnabled()) {
      return { ok: false, message: 'Linear integration is disabled or API key is missing' };
    }
    try {
      const data = await this.query<{ viewer: { id: string; name: string } }>(
        `query Viewer { viewer { id name } }`,
        {}
      );
      if (!data.viewer?.id) return { ok: false, message: 'Linear viewer lookup returned no user' };
      return { ok: true, message: `Connected as ${data.viewer.name}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Failed to connect to Linear' };
    }
  }

  async getIssueByIdentifier(identifier: string): Promise<LinearIssue | null> {
    const data = await this.query<{ issues: { nodes: LinearIssue[] } }>(
      `query IssueByIdentifier($identifier: String!) {
        issues(filter: { identifier: { eq: $identifier } }, first: 1) {
          nodes {
            id
            identifier
            title
            url
            priority
            state { id name type }
            assignee { id name email }
            team { id key name }
          }
        }
      }`,
      { identifier }
    );
    return data.issues?.nodes?.[0] || null;
  }

  async listTeams(): Promise<Array<{ id: string; key: string; name: string }>> {
    const data = await this.query<{ teams: { nodes: Array<{ id: string; key: string; name: string }> } }>(
      `query Teams {
        teams(first: 50) {
          nodes {
            id
            key
            name
          }
        }
      }`,
      {}
    );
    return data.teams?.nodes || [];
  }

  async searchIssues(queryText: string, first: number = 10): Promise<LinearIssue[]> {
    const data = await this.query<{ issueSearch: { nodes: LinearIssue[] } }>(
      `query IssueSearch($query: String!, $first: Int!) {
        issueSearch(query: $query, first: $first) {
          nodes {
            id
            identifier
            title
            url
            priority
            state { id name type }
            assignee { id name email }
            team { id key name }
          }
        }
      }`,
      { query: queryText, first }
    );
    return data.issueSearch?.nodes || [];
  }

  async createIssue(input: {
    title: string;
    description?: string;
    teamId: string;
    priority?: number;
    assigneeId?: string;
    projectId?: string;
  }): Promise<{ success: boolean; issue?: LinearIssue; error?: string }> {
    try {
      const data = await this.query<{ issueCreate: { success: boolean; issue: LinearIssue | null } }>(
        `mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              title
              url
              priority
              state { id name type }
              assignee { id name email }
              team { id key name }
            }
          }
        }`,
        { input }
      );
      return {
        success: !!data.issueCreate?.success,
        issue: data.issueCreate?.issue || undefined,
        error: data.issueCreate?.success ? undefined : 'Linear issue creation failed',
      };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to create Linear issue' };
    }
  }

  async updateIssue(input: {
    id: string;
    stateId?: string;
    assigneeId?: string;
    priority?: number;
    title?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await this.query<{ issueUpdate: { success: boolean } }>(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) {
            success
          }
        }`,
        { id: input.id, input: { ...input, id: undefined } }
      );
      return { success: !!data.issueUpdate?.success, error: data.issueUpdate?.success ? undefined : 'Linear update failed' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to update Linear issue' };
    }
  }

  async addComment(issueId: string, body: string): Promise<{ success: boolean; error?: string }> {
    try {
      const data = await this.query<{ commentCreate: { success: boolean } }>(
        `mutation AddComment($input: CommentCreateInput!) {
          commentCreate(input: $input) {
            success
          }
        }`,
        { input: { issueId, body } }
      );
      return { success: !!data.commentCreate?.success, error: data.commentCreate?.success ? undefined : 'Linear comment failed' };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to add Linear comment' };
    }
  }

  private getApiKey(): string {
    return (this.config.get().linearApiKey || '').trim();
  }

  private async query<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error('Linear API key not configured');
    let res: Response;
    try {
      res = await fetch(LINEAR_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        throw new Error('Linear unavailable while offline');
      }
      throw new Error(e?.message || 'Linear request failed');
    }

    if (!res.ok) {
      throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
    }

    const payload = await res.json();
    if (payload.errors?.length) {
      const msg = payload.errors.map((e: any) => e.message).join('; ');
      throw new Error(msg || 'Linear GraphQL error');
    }

    return payload.data as T;
  }
}
