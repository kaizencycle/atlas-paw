import { Client } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import {
  brokerJobIdFromNumber,
  parseJobNumber,
  type HomeroomJob,
  type HomeroomProjectionStatus,
  type HomeroomRuntime,
  type HomeroomStatus,
  type HomeroomSteward,
  type LeaseProjection,
} from "@/lib/mobius/notion/schema";

type NotionProperty = PageObjectResponse["properties"][string];
type PageUpdateProperties = NonNullable<
  Parameters<Client["pages"]["update"]>[0]["properties"]
>;

function databaseId(): string {
  return process.env.NOTION_HOMEROOM_DATABASE_ID?.trim() ?? "";
}

function notionToken(): string {
  return process.env.NOTION_API_KEY?.trim() ?? "";
}

export function notionConfigured(): boolean {
  return Boolean(notionToken() && databaseId());
}

function createClient(): Client {
  const token = notionToken();
  if (!token) {
    throw new Error("NOTION_API_KEY is not configured");
  }
  return new Client({ auth: token });
}

function textFromItems(items: Array<{ plain_text: string }>): string {
  return items.map((item) => item.plain_text).join("").trim();
}

function readSelect(property: NotionProperty | undefined): string | null {
  if (!property || property.type !== "select") return null;
  return property.select?.name ?? null;
}

function readMultiSelect(property: NotionProperty | undefined): string[] {
  if (!property || property.type !== "multi_select") return [];
  return property.multi_select.map((option) => option.name).filter(Boolean);
}

function readRichText(property: NotionProperty | undefined): string | null {
  if (!property) return null;
  if (property.type === "rich_text") {
    const text = textFromItems(property.rich_text);
    return text || null;
  }
  if (property.type === "title") {
    const text = textFromItems(property.title);
    return text || null;
  }
  return null;
}

function readCheckbox(property: NotionProperty | undefined): boolean {
  if (!property || property.type !== "checkbox") return false;
  return property.checkbox;
}

function readUniqueId(property: NotionProperty | undefined): number | null {
  if (!property || property.type !== "unique_id") return null;
  return typeof property.unique_id.number === "number" ? property.unique_id.number : null;
}

function isFullPage(value: unknown): value is PageObjectResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "object" in value &&
      (value as { object?: unknown }).object === "page" &&
      "properties" in value
  );
}

export function pageToHomeroomJob(page: PageObjectResponse): HomeroomJob {
  const properties = page.properties;
  const jobNumber = readUniqueId(properties["Job ID"]);
  const title = readRichText(properties.Job) ?? "";
  const status = readSelect(properties.Status) as HomeroomStatus | null;
  const steward = readSelect(properties["Steward Agent"]) as HomeroomSteward | null;
  const runtime = readSelect(properties.Runtime) as HomeroomRuntime | null;
  const projectionStatus = readSelect(
    properties["Projection Status"]
  ) as HomeroomProjectionStatus | null;

  return {
    pageId: page.id,
    jobTitle: title,
    jobNumber,
    jobId: jobNumber !== null ? brokerJobIdFromNumber(jobNumber) : title,
    status,
    cycle: readSelect(properties.Cycle),
    steward,
    runtime,
    repositories: readMultiSelect(properties.Repository),
    scopePathsText: readRichText(properties["Scope Paths"]),
    branch: readRichText(properties.Branch),
    brokerClaimId: readRichText(properties["Broker Claim ID"]),
    projectionStatus,
    executionAuthorized: readCheckbox(properties["Execution Authorized"]),
    humanApproval: readCheckbox(properties["Human Approval"]),
  };
}

async function resolveDataSourceId(notion: Client): Promise<string> {
  const configured = databaseId();
  if (!configured) {
    throw new Error("NOTION_HOMEROOM_DATABASE_ID is not configured");
  }

  try {
    const database = await notion.databases.retrieve({ database_id: configured });
    if ("data_sources" in database && database.data_sources.length > 0) {
      return database.data_sources[0].id;
    }
  } catch {
    // The env var may already be a data source ID.
  }

  return configured;
}

export async function findHomeroomJob(jobId: string): Promise<HomeroomJob | null> {
  if (!notionConfigured()) {
    throw new Error("NOTION_API_KEY or NOTION_HOMEROOM_DATABASE_ID is not configured");
  }

  const notion = createClient();
  const dataSourceId = await resolveDataSourceId(notion);
  const jobNumber = parseJobNumber(jobId);

  const filter =
    jobNumber !== null
      ? {
          property: "Job ID",
          unique_id: { equals: jobNumber },
        }
      : {
          property: "Job",
          title: { equals: jobId },
        };

  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,
    filter,
    page_size: 5,
  });

  const page = response.results.find(isFullPage);
  if (!page) return null;
  return pageToHomeroomJob(page);
}

export async function persistLeaseProjection(
  pageId: string,
  lease: LeaseProjection
): Promise<void> {
  if (!notionConfigured()) {
    throw new Error("NOTION_API_KEY or NOTION_HOMEROOM_DATABASE_ID is not configured");
  }

  const notion = createClient();
  const properties: PageUpdateProperties = {
    Status: { select: { name: lease.status } },
    "Broker Claim ID": {
      rich_text: [{ type: "text", text: { content: lease.brokerClaimId.slice(0, 2000) } }],
    },
    "Lease Expires": { date: { start: lease.leaseExpiresAt } },
    "Projection Status": { select: { name: lease.projectionStatus } },
    "Claimed At": { date: { start: lease.claimedAt } },
    "Last Heartbeat": { date: { start: lease.lastHeartbeatAt } },
    "Lease Version": { number: lease.leaseVersion },
    "Broker API": { url: lease.brokerApiUrl },
    Runtime: { select: { name: lease.runtime } },
    "Execution Authorized": { checkbox: false },
  };

  if (lease.steward) {
    properties["Steward Agent"] = { select: { name: lease.steward } };
  }
  if (lease.branch) {
    properties.Branch = {
      rich_text: [{ type: "text", text: { content: lease.branch.slice(0, 2000) } }],
    };
  }
  if (lease.blocker) {
    properties.Blocker = {
      rich_text: [{ type: "text", text: { content: lease.blocker.slice(0, 2000) } }],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}

export type ProjectionErrorLease = {
  brokerClaimId: string;
  leaseExpiresAt?: string;
  claimedAt?: string;
};

/**
 * Best-effort Homeroom write when the full 10-field lease projection fails.
 * The broker lease remains assignment authority; this at least marks ERROR
 * and, when a claim id is known, Status=ACTIVE so the row is not left AVAILABLE.
 */
export async function markProjectionError(
  pageId: string,
  message: string,
  lease?: ProjectionErrorLease
): Promise<void> {
  if (!notionConfigured()) return;
  const notion = createClient();
  const properties: PageUpdateProperties = {
    "Projection Status": { select: { name: "ERROR" } },
    Blocker: {
      rich_text: [{ type: "text", text: { content: message.slice(0, 2000) } }],
    },
    "Execution Authorized": { checkbox: false },
  };

  if (lease?.brokerClaimId) {
    properties.Status = { select: { name: "ACTIVE" } };
    properties["Broker Claim ID"] = {
      rich_text: [{ type: "text", text: { content: lease.brokerClaimId.slice(0, 2000) } }],
    };
  }
  if (lease?.leaseExpiresAt) {
    properties["Lease Expires"] = { date: { start: lease.leaseExpiresAt } };
  }
  if (lease?.claimedAt) {
    properties["Claimed At"] = { date: { start: lease.claimedAt } };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}
