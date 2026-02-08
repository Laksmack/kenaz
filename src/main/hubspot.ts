import { ConfigStore } from './config';
import type { HubSpotContact, HubSpotDeal, HubSpotActivity, HubSpotContext, SendEmailPayload } from '../shared/types';

const HUBSPOT_API = 'https://api.hubapi.com';

export class HubSpotService {
  private config: ConfigStore;
  // Cache: stageId -> label
  private stageLabels: Record<string, string> = {};
  private stagesCached = false;

  constructor(config: ConfigStore) {
    this.config = config;
  }

  /** Fetch all pipelines and cache stage ID → label mapping */
  private async loadStageLabels(): Promise<void> {
    if (this.stagesCached) return;
    try {
      const res = await this.fetch('/crm/v3/pipelines/deals');
      if (res.results) {
        for (const pipeline of res.results) {
          if (pipeline.stages) {
            for (const stage of pipeline.stages) {
              this.stageLabels[stage.id] = stage.label;
            }
          }
        }
      }
      this.stagesCached = true;
    } catch (e) {
      console.error('Failed to fetch pipeline stages:', e);
    }
  }

  /** Resolve a stage ID to its human-readable label */
  private getStageName(stageId: string): string {
    return this.stageLabels[stageId] || stageId;
  }

  private getToken(): string {
    return this.config.get().hubspotToken;
  }

  private async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const token = this.getToken();
    if (!token) throw new Error('HubSpot token not configured');

    const res = await globalThis.fetch(`${HUBSPOT_API}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      throw new Error(`HubSpot API error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  async lookupContact(email: string): Promise<HubSpotContext> {
    const result: HubSpotContext = {
      contact: null,
      deals: [],
      activities: [],
      loading: false,
      error: null,
    };

    try {
      // Search for contact by email
      const searchRes = await this.fetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: 'email', operator: 'EQ', value: email },
              ],
            },
          ],
          properties: [
            'firstname', 'lastname', 'email', 'company', 'jobtitle', 'phone',
            'hs_lastactivitydate',
          ],
        }),
      });

      if (searchRes.total === 0) {
        return result;
      }

      const contactData = searchRes.results[0];
      const props = contactData.properties;

      result.contact = {
        id: contactData.id,
        email: props.email || email,
        firstName: props.firstname || '',
        lastName: props.lastname || '',
        company: props.company || '',
        title: props.jobtitle || '',
        phone: props.phone || '',
        lastActivity: props.hs_lastactivitydate || '',
      };

      // Fetch associated deals
      try {
        // Ensure stage labels are loaded
        await this.loadStageLabels();

        const dealsRes = await this.fetch(
          `/crm/v3/objects/contacts/${contactData.id}/associations/deals`
        );

        if (dealsRes.results && dealsRes.results.length > 0) {
          const dealIds = dealsRes.results.map((d: any) => d.id);
          const dealDetails = await Promise.all(
            dealIds.slice(0, 5).map((id: string) =>
              this.fetch(`/crm/v3/objects/deals/${id}?properties=dealname,dealstage,amount,closedate,pipeline`)
            )
          );

          result.deals = dealDetails.map((d: any) => ({
            id: d.id,
            name: d.properties.dealname || '',
            stage: this.getStageName(d.properties.dealstage || ''),
            amount: parseFloat(d.properties.amount || '0'),
            closeDate: d.properties.closedate || '',
            pipeline: d.properties.pipeline || '',
          }));
        }
      } catch (e) {
        console.error('Failed to fetch deals:', e);
      }

      // Fetch recent activities (engagements)
      try {
        const engRes = await this.fetch(
          `/crm/v3/objects/contacts/${contactData.id}/associations/engagements`
        );

        if (engRes.results && engRes.results.length > 0) {
          const engIds = engRes.results.slice(0, 5).map((e: any) => e.id);
          const engDetails = await Promise.all(
            engIds.map((id: string) =>
              this.fetch(`/crm/v3/objects/engagements/${id}?properties=hs_timestamp,hs_engagement_type,hs_body_preview`)
                .catch(() => null)
            )
          );

          result.activities = engDetails
            .filter(Boolean)
            .map((e: any) => ({
              id: e.id,
              type: (e.properties.hs_engagement_type || 'note').toLowerCase() as any,
              subject: '',
              body: e.properties.hs_body_preview || '',
              timestamp: e.properties.hs_timestamp || '',
            }));
        }
      } catch (e) {
        console.error('Failed to fetch activities:', e);
      }

      return result;
    } catch (e: any) {
      result.error = e.message;
      return result;
    }
  }

  async searchDeals(query: string): Promise<HubSpotDeal[]> {
    try {
      const searchRes = await this.fetch('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify({
          query,
          limit: 10,
          properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline'],
        }),
      });

      if (!searchRes.results || searchRes.results.length === 0) return [];

      return searchRes.results.map((d: any) => ({
        id: d.id,
        name: d.properties.dealname || '',
        stage: d.properties.dealstage || '',
        amount: parseFloat(d.properties.amount || '0'),
        closeDate: d.properties.closedate || '',
        pipeline: d.properties.pipeline || '',
      }));
    } catch (e) {
      console.error('Failed to search deals:', e);
      return [];
    }
  }

  async associateContactWithDeal(contactId: string, dealId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Associate contact → deal (type 3 = contact-to-deal)
      await this.fetch(
        `/crm/v3/objects/contacts/${contactId}/associations/deals/${dealId}/3`,
        { method: 'PUT' }
      );
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async logThreadToDeal(
    dealId: string,
    subject: string,
    body: string,
    senderEmail: string,
    recipientEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    const token = this.getToken();
    if (!token) return { success: false, error: 'HubSpot token not configured' };

    try {
      // Create email engagement in HubSpot
      const res = await this.fetch('/crm/v3/objects/emails', {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            hs_timestamp: new Date().toISOString(),
            hs_email_direction: 'INCOMING_EMAIL',
            hs_email_subject: subject,
            hs_email_text: body,
            hs_email_from_email: senderEmail,
            hs_email_to_email: recipientEmail,
          },
        }),
      });

      // Associate with deal
      await this.fetch(
        `/crm/v3/objects/emails/${res.id}/associations/deals/${dealId}/186`,
        { method: 'PUT' }
      );

      // Try to associate with contact (sender)
      try {
        const contactSearch = await this.fetch('/crm/v3/objects/contacts/search', {
          method: 'POST',
          body: JSON.stringify({
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: senderEmail }],
            }],
          }),
        });
        if (contactSearch.total > 0) {
          await this.fetch(
            `/crm/v3/objects/emails/${res.id}/associations/contacts/${contactSearch.results[0].id}/198`,
            { method: 'PUT' }
          );
        }
      } catch (e) {
        // Non-critical — deal association is what matters
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async listActiveDeals(stage?: string, owner?: string): Promise<HubSpotDeal[]> {
    try {
      await this.loadStageLabels();

      const filters: any[] = [];
      // Exclude closed-won / closed-lost by default
      // (HubSpot doesn't have a simple "active" filter, so we search all and rely on limit)
      if (stage) {
        // Try to reverse-lookup stage ID from label
        const stageId = Object.entries(this.stageLabels).find(
          ([, label]) => label.toLowerCase() === stage.toLowerCase()
        )?.[0] || stage;
        filters.push({ propertyName: 'dealstage', operator: 'EQ', value: stageId });
      }
      if (owner) {
        filters.push({ propertyName: 'hubspot_owner_id', operator: 'EQ', value: owner });
      }

      const body: any = {
        limit: 50,
        properties: ['dealname', 'dealstage', 'amount', 'closedate', 'pipeline', 'hs_lastmodifieddate'],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      };
      if (filters.length > 0) {
        body.filterGroups = [{ filters }];
      }

      const res = await this.fetch('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      if (!res.results || res.results.length === 0) return [];

      return res.results.map((d: any) => ({
        id: d.id,
        name: d.properties.dealname || '',
        stage: this.getStageName(d.properties.dealstage || ''),
        amount: parseFloat(d.properties.amount || '0'),
        closeDate: d.properties.closedate || '',
        pipeline: d.properties.pipeline || '',
      }));
    } catch (e) {
      console.error('Failed to list deals:', e);
      return [];
    }
  }

  async getRecentActivities(email: string, limit: number = 10): Promise<{
    contact: HubSpotContact | null;
    activities: Array<{ type: string; date: string; subject?: string; body?: string; title?: string }>;
  }> {
    try {
      // Find contact
      const searchRes = await this.fetch('/crm/v3/objects/contacts/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          }],
          properties: ['firstname', 'lastname', 'email', 'company', 'jobtitle', 'phone'],
        }),
      });

      if (searchRes.total === 0) {
        return { contact: null, activities: [] };
      }

      const contactData = searchRes.results[0];
      const props = contactData.properties;
      const contact: HubSpotContact = {
        id: contactData.id,
        email: props.email || email,
        firstName: props.firstname || '',
        lastName: props.lastname || '',
        company: props.company || '',
        title: props.jobtitle || '',
        phone: props.phone || '',
        lastActivity: '',
      };

      // Fetch engagements
      const engRes = await this.fetch(
        `/crm/v3/objects/contacts/${contactData.id}/associations/engagements`
      );

      const activities: Array<{ type: string; date: string; subject?: string; body?: string; title?: string }> = [];

      if (engRes.results && engRes.results.length > 0) {
        const engIds = engRes.results.slice(0, limit).map((e: any) => e.id);
        const engDetails = await Promise.all(
          engIds.map((id: string) =>
            this.fetch(
              `/crm/v3/objects/engagements/${id}?properties=hs_timestamp,hs_engagement_type,hs_body_preview,hs_email_subject,hs_meeting_title`
            ).catch(() => null)
          )
        );

        for (const e of engDetails.filter(Boolean)) {
          const p = e.properties;
          const type = (p.hs_engagement_type || 'note').toLowerCase();
          activities.push({
            type,
            date: p.hs_timestamp || '',
            subject: p.hs_email_subject || undefined,
            body: p.hs_body_preview || undefined,
            title: p.hs_meeting_title || undefined,
          });
        }
      }

      return { contact, activities };
    } catch (e: any) {
      console.error('Failed to get recent activities:', e);
      return { contact: null, activities: [] };
    }
  }

  async logEmail(payload: SendEmailPayload, gmailMessageId: string): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    // Create email engagement
    const engagement = {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_email_direction: 'SENT_BY_OWNER',
        hs_email_subject: payload.subject,
        hs_email_text: payload.body_markdown,
        hs_email_to_email: payload.to,
      },
    };

    try {
      const res = await this.fetch('/crm/v3/objects/emails', {
        method: 'POST',
        body: JSON.stringify(engagement),
      });

      // Associate with contact
      if (payload.to) {
        const contactSearch = await this.fetch('/crm/v3/objects/contacts/search', {
          method: 'POST',
          body: JSON.stringify({
            filterGroups: [{
              filters: [{ propertyName: 'email', operator: 'EQ', value: payload.to }],
            }],
          }),
        });

        if (contactSearch.total > 0) {
          const contactId = contactSearch.results[0].id;
          await this.fetch(
            `/crm/v3/objects/emails/${res.id}/associations/contacts/${contactId}/198`,
            { method: 'PUT' }
          );
        }
      }

      // Associate with deal
      if (payload.hubspot_deal_id) {
        await this.fetch(
          `/crm/v3/objects/emails/${res.id}/associations/deals/${payload.hubspot_deal_id}/186`,
          { method: 'PUT' }
        );
      }
    } catch (e) {
      console.error('Failed to log email to HubSpot:', e);
    }
  }
}
