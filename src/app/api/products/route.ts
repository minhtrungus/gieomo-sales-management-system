import { NextResponse } from "next/server";
import {
  getProductsServer,
  upsertProductServer,
  toggleProductStatusServer,
  toggleProductFeaturedServer,
  deleteProductServer,
} from "@/lib/services/productService";
import { requireAdmin, getAuthenticatedUser } from "@/lib/auth/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const wantsDrafts = searchParams.get("includeDrafts") === "true" || searchParams.get("admin") === "true";

    let includeDrafts = false;
    if (wantsDrafts) {
      const user = await getAuthenticatedUser(request);
      includeDrafts = Boolean(user && (user.role === "admin" || user.role === "btc_sale"));
    }

    const products = await getProductsServer(includeDrafts);
    return NextResponse.json({ success: true, products });
  } catch (err: any) {
    console.error("[GET /api/products] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi truy vấn sản phẩm" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    if (!body || !body.name) {
      return NextResponse.json(
        { success: false, error: "Tên sản phẩm là bắt buộc" },
        { status: 400 }
      );
    }

    const result = await upsertProductServer(body);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[POST /api/products] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi lưu sản phẩm" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const body = await request.json();
    const { id, status, featured, product } = body;

    if (!id && !product) {
      return NextResponse.json(
        { success: false, error: "Thiếu định danh sản phẩm (id hoặc product)" },
        { status: 400 }
      );
    }

    if (product) {
      const res = await upsertProductServer(product);
      return NextResponse.json(res);
    }

    if (status !== undefined) {
      const res = await toggleProductStatusServer(id, status);
      if (!res.success) return NextResponse.json(res, { status: 400 });
    }

    if (featured !== undefined) {
      const res = await toggleProductFeaturedServer(id, featured);
      if (!res.success) return NextResponse.json(res, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[PATCH /api/products] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi cập nhật sản phẩm" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authCheck = await requireAdmin(request);
    if (!authCheck.authorized) {
      return authCheck.response;
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const slug = searchParams.get("slug") || undefined;

    if (!id && !slug) {
      return NextResponse.json(
        { success: false, error: "Thiếu tham số id sản phẩm cần xóa" },
        { status: 400 }
      );
    }

    const res = await deleteProductServer(id || slug!, slug);
    return NextResponse.json(res);
  } catch (err: any) {
    console.error("[DELETE /api/products] Error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || "Lỗi xóa sản phẩm" },
      { status: 500 }
    );
  }
}
