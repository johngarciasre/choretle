import { NextRequest, NextResponse } from "next/server";
import { canSwapRotations, swapRotations as pureSwapRotations } from "@/lib/rotation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { familyId, slateId, rotationId1, rotationId2, userId } = body;

    if (!familyId || !slateId || !rotationId1 || !rotationId2) {
      return NextResponse.json(
        { error: "familyId, slateId, rotationId1, and rotationId2 are required" },
        { status: 400 }
      );
    }

    const { getRotationsBySlate, swapRotationEntries } = await import("@/lib/db/service");

    // Get current rotations for the slate
    const rotations = await getRotationsBySlate(slateId);
    
    if (!rotations || (rotations as any[]).length === 0) {
      return NextResponse.json(
        { error: "No active rotations found for this slate" },
        { status: 404 }
      );
    }

    // Validate swap
    const canSwap = canSwapRotations(rotations as any[], slateId, rotationId1, rotationId2);
    if (!canSwap) {
      return NextResponse.json(
        { error: "Invalid swap — rotations must be on the same slate and belong to different users" },
        { status: 400 }
      );
    }

    // Perform the swap in DB
    const result = await swapRotationEntries(familyId, rotationId1, rotationId2, userId);

    return NextResponse.json({
      success: true,
      message: "Rotations swapped successfully",
      data: result,
    });
  } catch (error) {
    console.error("Swap failed:", error);
    return NextResponse.json(
      { error: "Failed to swap rotations" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const slateId = url.searchParams.get("slateId");
    const familyId = url.searchParams.get("familyId");
    const daysAhead = parseInt(url.searchParams.get("daysAhead") || "30", 10);

    if (!slateId || !familyId) {
      return NextResponse.json(
        { error: "slateId and familyId are required" },
        { status: 400 }
      );
    }

    const { getUpcomingAssignments } = await import("@/lib/db/service");
    const assignments = await getUpcomingAssignments(familyId, daysAhead);

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Failed to fetch rotation schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch rotation schedule" },
      { status: 500 }
    );
  }
}
