import { ConfigStore } from './config';
import type { HubSpotContact, HubSpotDeal, HubSpotActivity, HubSpotContext, SendEmailPayload } from '../shared/types';

const HUBSPOT_API = 'https://api.hubapi.com';

export class HubSpotService {
  private config: ConfigStore;

  constructor(config: ConfigStore) {
    this.config = config;
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
            stage: d.properties.dealstage || '',
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
