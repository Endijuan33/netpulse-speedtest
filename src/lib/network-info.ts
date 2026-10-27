import dns from "node:dns/promises";

/**
 * Organization / hostname resolution helpers for /api/network-info.
 *
 * Honesty rule: an empty string from a provider is treated exactly like a
 * missing value (null). Fallbacks only ever surface a name that a source
 * actually returned for this IP — never an invented name, and never the IP
 * itself in place of a hostname.
 */

/** Empty, whitespace-only, null or undefined values become null. */
export function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse an organization name out of an ip-api `as` string such as
 * "AS18004 PT WIRELESS INDONESIA ( WIN )" -> "PT WIRELESS INDONESIA ( WIN )".
 * A bare "AS12345" (no name part) yields null, as does an empty value.
 * A string with no AS prefix is returned trimmed, since the field is
 * documented as carrying the ASN record for this IP.
 */
export function parseOrgFromAs(asValue: string | null): string | null {
  if (!asValue) return null;
  const trimmed = asValue.trim();
  if (trimmed === "") return null;
  const withName = /^AS\d+\s+(.+)$/.exec(trimmed);
  if (withName?.[1]) return withName[1].trim();
  if (/^AS\d+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Extract the organization name from RDAP JSON, in an order that never
 * mislabels a contact person as the organization.
 *
 * 1. Top-level remarks titled "description" — in APNIC RDAP for an inetnum
 *    this is the organization description (e.g. "PT. Wireless Indonesia").
 * 2. A vCard "fn" belonging to an entity with the "registrant" role.
 * 3. The top-level RDAP `name` field (an inetnum handle name).
 * 4. Entity remarks descriptions.
 *
 * Deliberately NOT used: arbitrary entity vCard names. For the verified
 * example IP, the entities are technical/abuse contacts (individuals), so
 * returning the first entity fn would wrongly present a person as the
 * organization. When none of the above yields a name, null is returned.
 */
export function parseOrgFromRdap(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  const firstDescriptionLine = (remarks: unknown): string | null => {
    if (!Array.isArray(remarks)) return null;
    for (const remark of remarks) {
      if (!remark || typeof remark !== "object") continue;
      const desc = (remark as Record<string, unknown>).description;
      if (Array.isArray(desc)) {
        for (const line of desc) {
          const name = emptyToNull(line);
          if (name) return name;
        }
      }
    }
    return null;
  };

  // 1. Top-level remarks titled "description" only (other remarks, e.g.
  // abuse-report notes, are not organization names).
  if (Array.isArray(root.remarks)) {
    for (const remark of root.remarks) {
      if (!remark || typeof remark !== "object") continue;
      const title = (remark as Record<string, unknown>).title;
      if (typeof title === "string" && title.toLowerCase() === "description") {
        const name = firstDescriptionLine([remark]);
        if (name) return name;
      }
    }
  }

  const entities = root.entities;
  if (Array.isArray(entities)) {
    // 2. Registrant entity vCard fn.
    for (const entity of entities) {
      if (!entity || typeof entity !== "object") continue;
      const roles = (entity as Record<string, unknown>).roles;
      if (!Array.isArray(roles) || !roles.includes("registrant")) continue;
      const vcard = (entity as Record<string, unknown>).vcardArray;
      if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
        for (const prop of vcard[1] as unknown[]) {
          if (Array.isArray(prop) && prop[0] === "fn" && typeof prop[3] === "string") {
            const name = emptyToNull(prop[3]);
            if (name) return name;
          }
        }
      }
    }
  }

  // 3. Top-level RDAP name.
  const topName = emptyToNull(root.name);
  if (topName) return topName;

  // 4. Entity remarks descriptions.
  if (Array.isArray(entities)) {
    for (const entity of entities) {
      if (!entity || typeof entity !== "object") continue;
      const name = firstDescriptionLine((entity as Record<string, unknown>).remarks);
      if (name) return name;
    }
  }
  return null;
}

/**
 * Pure organization resolution order: provider org, then the name parsed
 * from the ASN string, then the name parsed from already-fetched RDAP data.
 * Returns the name plus which source produced it (null when none did).
 */
export function resolveOrganization(input: {
  providerOrg: string | null;
  asValue: string | null;
  rdapData?: unknown;
}): { org: string | null; orgSource: "provider" | "asn" | "rdap" | null } {
  const provider = emptyToNull(input.providerOrg);
  if (provider) return { org: provider, orgSource: "provider" };
  const fromAs = parseOrgFromAs(input.asValue);
  if (fromAs) return { org: fromAs, orgSource: "asn" };
  const fromRdap = parseOrgFromRdap(input.rdapData);
  if (fromRdap) return { org: fromRdap, orgSource: "rdap" };
  return { org: null, orgSource: null };
}

/**
 * Reverse-DNS PTR lookup for an IP, bounded by a timeout. Returns the first
 * hostname, or null when there is no PTR record, the lookup times out, or
 * the record is just the IP itself (never echo the IP as a hostname).
 */
export async function lookupPtrHostname(ip: string, timeoutMs = 4000): Promise<string | null> {
  try {
    const result = await Promise.race([
      dns.reverse(ip),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("reverse timeout")), timeoutMs),
      ),
    ]);
    for (const name of result) {
      const clean = emptyToNull(name);
      if (clean && clean !== ip) return clean;
    }
    return null;
  } catch {
    return null;
  }
}
