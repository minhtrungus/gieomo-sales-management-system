import { NextResponse } from "next/server";
import { getSystemSettingsServer, updateSystemSettingsServer, type SiteSettings } from "@/lib/services/configService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSystemSettingsServer();
    return NextResponse.json({ success: true, settings });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await updateSystemSettingsServer(body as Partial<SiteSettings>);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to update settings" },
        { status: 500 }
      );
    }

    const updated = await getSystemSettingsServer();
    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to parse request" },
      { status: 400 }
    );
  }
}
