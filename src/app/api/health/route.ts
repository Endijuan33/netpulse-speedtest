export async function GET() {
  return Response.json({ status: "ok", service: "netpulse", version: "0.1.0", time: new Date().toISOString() });
}
