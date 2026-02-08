import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), 50)
      : 10;

    if (!rawQuery) {
      return NextResponse.json({ query: "", count: 0, results: [] });
    }

    if (rawQuery.length > 100) {
      return NextResponse.json(
        { error: "Query too long" },
        { status: 400 }
      );
    }

    const query = rawQuery.replace(/[\u0000-\u001F\u007F]/g, "");

    type SearchResult = {
      type: "agent" | "block";
      id: string;
      name: string;
      blockHeight: number;
      genome: string | null;
      trustScore: number | null;
      matchField: string;
    };

    const agentResults = await prisma.agent.findMany({
      where: {
        displayName: {
          contains: query,
          mode: "insensitive",
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        genomes: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });

    const results: SearchResult[] = agentResults.map((agent) => ({
      type: "agent",
      id: agent.id,
      name: agent.displayName || "Anonymous Agent",
      blockHeight: agent.genomes[0]?.blockHeight ?? 0,
      genome: agent.genomes[0]?.sequence ?? null,
      trustScore: Math.round(agent.trustScore),
      matchField: "name",
    }));

    const numericHeight = Number.parseInt(query, 10);
    if (!Number.isNaN(numericHeight)) {
      const block = await prisma.block.findUnique({
        where: { height: numericHeight },
        include: { genome: true },
      });

      if (block) {
        results.unshift({
          type: "block" as const,
          id: String(block.height),
          name: `Block #${block.height.toLocaleString()}`,
          blockHeight: block.height,
          genome: block.genome?.sequence ?? null,
          trustScore: null,
          matchField: "blockHeight",
        });
      }
    }

    return NextResponse.json({
      query,
      count: results.length,
      results: results.slice(0, limit),
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
