import type { JazClient } from './client.js';

type BusinessTransactionType = 'invoices' | 'bills' | 'journals' | 'scheduled_journals';

export async function addAttachment(
  client: JazClient,
  data: {
    businessTransactionType: BusinessTransactionType;
    businessTransactionResourceId: string;
    attachmentId?: string;
    sourceUrl?: string;
  },
): Promise<{ data: unknown }> {
  const { businessTransactionType: btType, businessTransactionResourceId: btId, ...rest } = data;
  const formData = new FormData();
  if (rest.attachmentId) formData.append('attachmentId', rest.attachmentId);
  if (rest.sourceUrl) formData.append('sourceUrl', rest.sourceUrl);
  return client.postMultipart(`/api/v1/${btType}/${btId}/attachments`, formData);
}

export async function createFromAttachment(
  client: JazClient,
  data: {
    businessTransactionType: string;
    sourceFile?: Blob;
    sourceFileName?: string;
    sourceUrl?: string;
    attachmentId?: string;
  },
): Promise<{ data: unknown }> {
  const formData = new FormData();
  formData.append('businessTransactionType', data.businessTransactionType);
  formData.append('sourceType', data.sourceFile ? 'FILE' : 'URL');
  if (data.sourceFile) formData.append('sourceFile', data.sourceFile, data.sourceFileName ?? 'file');
  if (data.sourceUrl) formData.append('sourceUrl', data.sourceUrl);
  if (data.attachmentId) formData.append('attachmentId', data.attachmentId);
  return client.postMultipart(
    '/api/v1/magic/createBusinessTransactionFromAttachment',
    formData,
  );
}
