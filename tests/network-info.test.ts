import { describe, it, expect, vi, afterEach } from "vitest";

// PTR lookups are mocked so tests never touch real DNS.
vi.mock("node:dns/promises", () => ({
  default: { reverse: vi.fn().mockRejectedValue(new Error("no PTR")) },
}));

import { GET as networkInfo } from "../src/app/api/network-info/route";
import {
  emptyToNull,
  parseOrgFromAs,
  parseOrgFromRdap,
  resolveOrganization,
} from "../src/lib/network-info";

const req = (ip: string) =>
  new Request("http://localhost/api/network-info", { headers: { "x-forwarded-for": ip } });

describe("emptyToNull", () => {
  it("treats empty and whitespace-only strings as null", () => {
    expect(emptyToNull("")).toBe(null);
    expect(emptyToNull("   ")).toBe(null);
    expect(emptyToNull(null)).toBe(null);
    expect(emptyToNull(undefined)).toBe(null);
    expect(emptyToNull(123)).toBe(null);
  });
  it("keeps non-empty strings, trimmed", () => {
    expect(emptyToNull("  PT Foo  ")).toBe("PT Foo");
  });
});

describe("parseOrgFromAs", () => {
  it("strips the AS<number> prefix, keeping the organization name", () => {
    expect(parseOrgFromAs("AS18004 PT WIRELESS INDONESIA ( WIN )")).toBe(
      "PT WIRELESS INDONESIA ( WIN )",
    );
  });
  it("returns null for a bare ASN with no name", () => {
    expect(parseOrgFromAs("AS12345")).toBe(null);
    expect(parseOrgFromAs("AS12345 ")).toBe(null);
    expect(parseOrgFromAs("")).toBe(null);
    expect(parseOrgFromAs(null)).toBe(null);
  });
  it("returns a string without an AS prefix trimmed", () => {
    expect(parseOrgFromAs("PT Foo")).toBe("PT Foo");
  });
});

describe("parseOrgFromRdap", () => {
  it("reads the top-level description remark (APNIC inetnum org description)", () => {
    const fixture = {
      remarks: [
        { title: "description", description: ["PT. Wireless Indonesia", "Internet Service Provider"] },
        { title: "remarks", description: ["spam and abuse report : abuse@example.org"] },
      ],
      entities: [
        { handle: "KU7-AP", roles: ["technical"], vcardArray: [[], [["fn", {}, "text", "Kunto Utoro"]]] },
      ],
    };
    expect(parseOrgFromRdap(fixture)).toBe("PT. Wireless Indonesia");
  });
  it("reads a registrant entity vCard fn", () => {
    const fixture = {
      entities: [
        {
          roles: ["registrant"],
          vcardArray: [
            ["version", {}, "text", "4.0"],
            [["fn", {}, "text", "PT. Wireless Indonesia"]],
          ],
        },
      ],
    };
    expect(parseOrgFromRdap(fixture)).toBe("PT. Wireless Indonesia");
  });
  it("never mislabels a technical/abuse contact person as the organization", () => {
    const fixture = {
      entities: [
        { handle: "KU7-AP", roles: ["technical"], vcardArray: [[], [["fn", {}, "text", "Kunto Utoro"]]] },
        { handle: "IRT-X", roles: ["abuse"], vcardArray: [[], [["fn", {}, "text", "IRT-X"]]] },
      ],
    };
    expect(parseOrgFromRdap(fixture)).toBe(null);
  });
  it("falls back to entity remarks descriptions", () => {
    const fixture = {
      entities: [{ remarks: [{ description: ["PT. Wireless Indonesia"] }] }],
    };
    expect(parseOrgFromRdap(fixture)).toBe("PT. Wireless Indonesia");
  });
  it("returns null for empty or malformed data", () => {
    expect(parseOrgFromRdap(null)).toBe(null);
    expect(parseOrgFromRdap({})).toBe(null);
    expect(parseOrgFromRdap({ entities: [] })).toBe(null);
  });
});

describe("resolveOrganization order", () => {
  it("prefers provider, then ASN, then RDAP", () => {
    expect(
      resolveOrganization({ providerOrg: "Provider Org", asValue: "AS1 ASN Org", rdapData: {} }),
    ).toEqual({ org: "Provider Org", orgSource: "provider" });
    expect(
      resolveOrganization({ providerOrg: "", asValue: "AS18004 PT WIRELESS INDONESIA ( WIN )" }),
    ).toEqual({ org: "PT WIRELESS INDONESIA ( WIN )", orgSource: "asn" });
    expect(
      resolveOrganization({
        providerOrg: null,
        asValue: "AS12345",
        rdapData: {
          remarks: [{ title: "description", description: ["PT. Wireless Indonesia"] }],
        },
      }),
    ).toEqual({ org: "PT. Wireless Indonesia", orgSource: "rdap" });
    expect(resolveOrganization({ providerOrg: "", asValue: "" })).toEqual({
      org: null,
      orgSource: null,
    });
  });
});

describe("network-info route fallback (integration, mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the ASN name when the provider returns an empty org", async () => {
    const ipApiBody = {
      status: "success",
      query: "114.79.2.99",
      isp: "PT Wireless Indonesia",
      org: "",
      as: "AS18004 PT WIRELESS INDONESIA ( WIN )",
      reverse: "",
      country: "Indonesia",
      regionName: "Jakarta",
      city: "Jakarta",
      timezone: "Asia/Jakarta",
      lat: -6.2,
      lon: 106.8,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("ip-api.com")) {
          return Promise.resolve(new Response(JSON.stringify(ipApiBody), { status: 200 }));
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      }),
    );
    const res = await networkInfo(req("114.79.2.99"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.org).toBe("PT WIRELESS INDONESIA ( WIN )");
    expect(json.orgSource).toBe("asn");
    // No PTR record exists for this IP in the mocked DNS layer, and the
    // provider reverse field was empty, so hostname stays null (honest
    // "Not detected") rather than inventing one or echoing the IP.
    expect(json.hostname).toBe(null);
    expect(json.hostname).not.toBe("114.79.2.99");
    expect(json.source).toBe("ip-api.com");
  });

  it("uses the provider reverse field as hostname when present", async () => {
    const ipApiBody = {
      status: "success",
      query: "1.2.3.4",
      isp: "Example ISP",
      org: "Example Org",
      as: "AS12345 Example Org",
      reverse: "host.example.net",
      country: "Indonesia",
      regionName: "Jakarta",
      city: "Jakarta",
      timezone: "Asia/Jakarta",
      lat: -6.2,
      lon: 106.8,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(ipApiBody), { status: 200 })),
    );
    const res = await networkInfo(req("1.2.3.4"));
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.hostname).toBe("host.example.net");
    expect(json.hostnameSource).toBe("provider");
    expect(json.org).toBe("Example Org");
    expect(json.orgSource).toBe("provider");
  });
});
